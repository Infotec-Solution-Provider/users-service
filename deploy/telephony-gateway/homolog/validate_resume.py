"""Run only in the disposable validation container: root paths are test fixtures."""
from pathlib import Path
import os
import shutil
import subprocess

assert Path('/source/homolog/validate.Dockerfile').exists(), 'Disposable validation image required'
home = Path('/home/inpulse/htdocs/homolog')
state = Path('/var/lib/homolog-telephony-install')
vhost = Path('/etc/nginx/sites-enabled/inpulse.infotecrs.inf.br.conf')
assert not state.exists(), 'Refusing to overwrite an existing installation'
(home / 'users-service/dist/controllers').mkdir(parents=True)
(home / 'users-service/dist/controllers/webrtc.controller.js').write_text('gatewayAvailable telephony/gateway/authorize')
(home / 'users-service/.env').write_text('PORT=7101\n')
vhost.parent.mkdir(parents=True, exist_ok=True)
vhost.write_text('server { listen 443 ssl; }\n')
binary = Path('/tmp/resume-mocks')
binary.mkdir()
commands = {
    'runuser': "printf '%s\\n' 'homolog:127.0.0.1:3306:homolog-crm' 'suprimaxxi:127.0.0.1:3306:homolog-crm-suprimaxxi'",
    'ip': "printf '%s\\n' '172.22.125.232/16 82.25.64.46/24'",
    'ss': 'exit 0',
    'nginx': 'exit 0',
    'systemctl': 'if [ "$1" = is-active ]; then exit 3; fi; exit 0',
    'apt-get': 'echo "$1" >> /tmp/resume-apt-calls; echo APT_SIMULATED_FAILURE; exit 42',
    'dpkg-query': 'exit 1',
}
for name, content in commands.items():
    path = binary / name
    path.write_text('#!/bin/sh\n' + content + '\n')
    path.chmod(0o755)
env = {**os.environ, 'PATH': str(binary) + ':' + os.environ['PATH']}
def run(mode):
    return subprocess.run(['bash', '/source/homolog/install-root.sh', mode], env=env, capture_output=True, text=True)
first = run('install')
assert first.returncode == 42, first.stderr
assert 'APT_SIMULATED_FAILURE' in first.stderr
assert (state / 'prepared').exists()
before = (state / 'users.env.before').read_bytes()
resumed = run('resume')
assert resumed.returncode == 42, resumed.stderr
assert (state / 'users.env.before').read_bytes() == before
assert len(list(state.glob('apt-update-*.log'))) == 1
calls = Path('/tmp/resume-apt-calls').read_text()
assert calls == 'update\nupdate\n', calls
target = home / 'users-service/.env'
target.write_text('PORT=7101\nCONCURRENT=preserved\n')
assert run('resume').returncode != 0
assert target.read_text().endswith('CONCURRENT=preserved\n')
assert Path('/tmp/resume-apt-calls').read_text() == calls
shutil.copyfile(state / 'users.env.before', target)
config = Path('/etc/homolog-telephony')
config.mkdir()
(config / 'users-gateway.env').touch()
assert run('resume').returncode != 0
assert Path('/tmp/resume-apt-calls').read_text() == calls
print('PASS: package error displayed; resume preserves backup/logs; concurrent env change and created keys refuse resume')
