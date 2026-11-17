#!/usr/bin/env python3
"""Fixed production telephony route. Root execution only; no environment/credential reads."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import stat
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

VHOST = Path('/etc/nginx/sites-enabled/inpulse.infotecrs.inf.br.conf')
STATE = Path('/var/lib/inpulse-odim-telephony-route-20261117')
MARKER = '# in.pulse Odim telephony route 20261117'
SNIPPET = '''
    # in.pulse Odim telephony route 20261117
    location ^~ /api/telephony/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache off;
        proxy_read_timeout 60s;
        access_log off;
    }
'''


def patch(text):
    assert MARKER not in text, 'ROUTE_ALREADY_PRESENT'
    assert not re.search(r'location\s+(?:\^~\s+)?/api/telephony/', text), 'CONCURRENT_TELEPHONY_ROUTE'
    stack, blocks, quote, escaped, comment = [], [], None, False, False
    for i, char in enumerate(text):
        if comment:
            if char == '\n': comment = False
            continue
        if escaped:
            escaped = False
            continue
        if char == '\\':
            escaped = True
            continue
        if quote:
            if char == quote: quote = None
            continue
        if char in '\"\'': quote = char
        elif char == '#': comment = True
        elif char == '{': stack.append(i)
        elif char == '}':
            assert stack, 'UNBALANCED_NGINX'
            start = stack.pop()
            blocks.append((start, i, len(stack)))
    assert not stack and not quote, 'UNBALANCED_NGINX'
    candidates = []
    for start, end, depth in blocks:
        if depth != 0 or not re.search(r'\bserver\s*$', text[:start]): continue
        body = text[start:end]
        names = re.findall(r'(?m)^\s*server_name\s+([^;]+);', body)
        if not any('inpulse.infotecrs.inf.br' in name.split() for name in names): continue
        if not re.search(r'(?m)^\s*listen\s+[^;]*\b443\b[^;]*\bssl\b', body): continue
        candidates.append(end)
    assert len(candidates) == 1, 'UNIQUE_PRODUCTION_TLS_VHOST_REQUIRED'
    i = candidates[0]
    return text[:i] + SNIPPET + text[i:]


def sha(data): return hashlib.sha256(data).hexdigest()


def replace(file, data, metadata):
    fd, temporary = tempfile.mkstemp(dir=file.parent, prefix='.odim-telephony-')
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data); stream.flush(); os.fsync(stream.fileno())
        os.chmod(temporary, stat.S_IMODE(metadata.st_mode))
        os.chown(temporary, metadata.st_uid, metadata.st_gid)
        os.replace(temporary, file)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)


def nginx_test():
    result = subprocess.run(['/usr/sbin/nginx', '-t'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    (STATE / 'nginx-test.log').write_bytes(result.stdout)
    assert result.returncode == 0, 'NGINX_VALIDATION_FAILED'


def main():
    assert os.geteuid() == 0, 'ROOT_REQUIRED'
    assert socket.gethostname().split('.')[0] == 'srv733293', 'EXPECTED_HOSTINGER_HOST'
    assert len(sys.argv) == 2 and sys.argv[1] in ('apply', 'verify', 'rollback'), 'EXPECTED_ACTION'
    file = VHOST.resolve(strict=True)
    assert str(file).startswith('/etc/nginx/'), 'VHOST_BOUNDARY'
    assert file.is_file(), 'REGULAR_VHOST_REQUIRED'
    STATE.mkdir(mode=0o700, exist_ok=True)
    assert not STATE.is_symlink() and (STATE.stat().st_mode & 0o077) == 0, 'PRIVATE_STATE_REQUIRED'
    journal = STATE / 'receipt.json'
    action = sys.argv[1]
    if action == 'apply':
        assert not journal.exists(), 'INSTALL_ALREADY_STARTED'
        before = file.read_bytes(); after = patch(before.decode()).encode(); metadata = file.stat()
        (STATE / 'nginx.before').write_bytes(before)
        report = {'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'phase': 'prepared', 'beforeSha256': sha(before), 'afterSha256': sha(after), 'path': str(file)}
        journal.write_text(json.dumps(report, indent=2))
        nginx_test()
        assert sha(file.read_bytes()) == report['beforeSha256'], 'VHOST_DRIFT'
        try:
            replace(file, after, metadata); nginx_test()
            subprocess.run(['/usr/bin/systemctl', 'reload', 'nginx'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            report['phase'] = 'installed'
        except Exception:
            assert sha(file.read_bytes()) == report['afterSha256'], 'CONCURRENT_CHANGE_PREVENTS_ROLLBACK'
            replace(file, before, metadata); nginx_test()
            subprocess.run(['/usr/bin/systemctl', 'reload', 'nginx'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            report['phase'] = 'rolled-back'; journal.write_text(json.dumps(report, indent=2)); raise
        journal.write_text(json.dumps(report, indent=2))
    else:
        report = json.loads(journal.read_text())
        assert report['phase'] == 'installed' and sha(file.read_bytes()) == report['afterSha256'], 'OWNED_ROUTE_REQUIRED'
        if action == 'rollback':
            before = (STATE / 'nginx.before').read_bytes(); assert sha(before) == report['beforeSha256']
            replace(file, before, file.stat()); nginx_test()
            subprocess.run(['/usr/bin/systemctl', 'reload', 'nginx'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            report['phase'] = 'rolled-back'; journal.write_text(json.dumps(report, indent=2))
    if report['phase'] == 'installed':
        nginx_test()
        try:
            urllib.request.urlopen('https://inpulse.infotecrs.inf.br/api/telephony/webrtc-settings', timeout=10)
            raise AssertionError('AUTHENTICATION_BOUNDARY_REQUIRED')
        except urllib.error.HTTPError as error:
            assert error.code == 401 and error.headers.get_content_type() == 'application/json', 'PUBLIC_USERS_ROUTE_FAILED'
        report['anonymousSettingsStatus'] = 401
    print(json.dumps({k: v for k, v in report.items() if k != 'path'}))


if __name__ == '__main__':
    try: main()
    except Exception as error:
        code = str(error) if isinstance(error, AssertionError) and re.fullmatch('[A-Z_]+', str(error)) else type(error).__name__
        print(json.dumps({'ok': False, 'code': code}), file=sys.stderr); sys.exit(1)
