#!/usr/bin/env python3
"""Owned Odim-only gateway deployment. No PBX registration, environment reads or unrelated restarts."""
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys

ROOT = Path('/root/inpulse-odim-telephony-20261117')
CONF = Path('/etc/inpulse-odim-telephony')
VHOST = Path('/etc/nginx/sites-available/lux.infotecrs.inf.br')
NAMES = ['firewall', 'rtpengine', 'kamailio']
PREFIX = 'inpulse-odim-telephony-'
SNIPPET = '''
    # in.pulse Odim gateway 20261117
    location = /telephony-gw {
        limit_req zone=odim_telephony_rate burst=10 nodelay;
        limit_conn odim_telephony_connections 10;
        proxy_pass http://127.0.0.1:7171;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header Origin $http_origin;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        access_log off;
        error_log /dev/null;
    }
'''


def sha(data): return hashlib.sha256(data).hexdigest()
def stamp(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def save(state): (ROOT / 'receipt.json').write_text(json.dumps(state, indent=2))
def run(args, label):
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env={**os.environ, 'DEBIAN_FRONTEND': 'noninteractive', 'NEEDRESTART_MODE': 'l'})
    (ROOT / (label + '.log')).write_bytes(result.stdout)
    assert result.returncode == 0, label.upper().replace('-', '_') + '_FAILED'
    return result.stdout.decode(errors='replace')
def install_file(file, data, mode=0o640, group=None):
    assert not file.is_symlink(), 'SYMLINK_DESTINATION'
    file.write_text(data); os.chmod(file, mode)
    if group is not None: os.chown(file, 0, group)


def patch_nginx(text):
    assert '/telephony-gw' not in text, 'EXISTING_GATEWAY_ROUTE'
    # Reuse the reviewed parser, replacing only its fixed domain and snippet constants.
    source = (ROOT / 'install-public-route.py').read_text().replace('inpulse.infotecrs.inf.br', 'lux.infotecrs.inf.br')
    namespace = {'__name__': 'route_parser'}; exec(compile(source, 'route_parser', 'exec'), namespace)
    namespace['SNIPPET'] = SNIPPET
    return namespace['patch'](text)


def render(template, private):
    assert private['version'] == 1 and private['websocketUrl'] == 'wss://lux.infotecrs.inf.br/telephony-gw'
    assert private['allowedNetworks'] == ['131.161.3.106/32'] and private['principals'] == [{'instance': 'odim', 'userId': 534}]
    assert re.fullmatch('[0-9a-f]{64}', private['apiKey'])
    values = {'GW_WS_ADDR': '127.0.0.1:7171', 'GW_SIP_LISTEN': '144.91.87.0:5060', 'GW_SIP_ADVERTISE': '144.91.87.0:5060',
              'GW_USERS_URL': 'https://inpulse.infotecrs.inf.br', 'GW_API_KEY': private['apiKey'],
              'GW_ORIGIN': 'https://inpulse.infotecrs.inf.br', 'GW_RTPENGINE': 'udp:127.0.0.1:7224',
              'GW_MEDIA_FROM_BROWSER': '', 'GW_MEDIA_FROM_PBX': ''}
    definitions = ''.join('#!substdef "!' + name + '!' + value + '!g"\n' for name, value in values.items())
    config = template.replace('/etc/kamailio/gateway-defs.cfg', str(CONF / 'gateway-defs.cfg'))
    config = config.replace('loadmodule "ctl.so"', 'loadmodule "ctl.so"\nmodparam("ctl", "binrpc", "unix:/run/inpulse-odim-telephony-kamailio/ctl")')
    media = '[rtpengine]\ninterface = pub/144.91.87.0\nlisten-ng = 127.0.0.1:7224\nport-min = 24000\nport-max = 24199\ntable = -1\ntimeout = 60\nsilent-timeout = 3600\ntos = 184\nlog-level = 4\n'
    return definitions, config, media


def node_pids():
    rows = subprocess.check_output(['ps', '-eo', 'pid=,comm='], text=True).splitlines()
    return sorted(line.strip() for line in rows if re.search(r'\bnode\b|\bPM2\b', line))


def prepare():
    assert not (ROOT / 'receipt.json').exists(), 'DEPLOYMENT_ALREADY_STARTED'
    assert not CONF.exists(), 'EXISTING_GATEWAY_CONFIGURATION'
    for name in NAMES: assert not Path('/etc/systemd/system/' + PREFIX + name + '.service').exists(), 'EXISTING_GATEWAY_UNIT'
    sockets = subprocess.check_output(['ss', '-H', '-lntu'], text=True)
    assert not re.search(r':(?:5060|7171|7224|24[01][0-9][0-9])\b', sockets), 'GATEWAY_PORT_IN_USE'
    before = VHOST.read_bytes(); patch_nginx(before.decode())
    (ROOT / 'nginx.before').write_bytes(before)
    state = {'atUtc': stamp(), 'phase': 'prepared', 'nginxBeforeSha256': sha(before), 'nodePidsBefore': node_pids(), 'pbx': '131.161.3.106:5060', 'mediaRange': '24000-24199/UDP'}
    save(state)
    for name in ['kamailio.service', 'rtpengine.service', 'rtpengine-daemon.service']:
        run(['systemctl', 'mask', name], 'mask-' + name)
    run(['apt-get', 'update'], 'apt-update')
    run(['apt-get', 'install', '-y', '--no-install-recommends', '--no-upgrade', 'kamailio', 'kamailio-extra-modules', 'kamailio-utils-modules', 'kamailio-websocket-modules', 'rtpengine-daemon', 'ca-certificates', 'iptables'], 'apt-install')
    state['phase'] = 'packages-ready'; state['nodePidsAfterPackages'] = node_pids(); save(state)
    return state


def rollback(state):
    for name in reversed(NAMES): subprocess.run(['systemctl', 'disable', '--now', PREFIX + name + '.service'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    firewall = Path('/usr/local/sbin/inpulse-odim-telephony-firewall')
    if firewall.exists(): subprocess.run(['bash', str(firewall), 'stop'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if state.get('nginxAfterSha256'):
        assert sha(VHOST.read_bytes()) == state['nginxAfterSha256'], 'CONCURRENT_NGINX_CHANGE'
        backup = (ROOT / 'nginx.before').read_bytes(); assert sha(backup) == state['nginxBeforeSha256']
        VHOST.write_bytes(backup)
    zone = Path('/etc/nginx/conf.d/inpulse-odim-telephony-zones.conf')
    if state.get('zoneSha256') and zone.exists():
        assert sha(zone.read_bytes()) == state['zoneSha256'], 'CONCURRENT_ZONE_CHANGE'
        zone.unlink()
    run(['nginx', '-t'], 'nginx-rollback-check'); run(['systemctl', 'reload', 'nginx'], 'nginx-rollback-reload')
    state['phase'] = 'rolled-back'; state['rolledBackAtUtc'] = stamp(); save(state)
    return state


def activate(state):
    assert state['phase'] == 'packages-ready', 'PACKAGES_READY_REQUIRED'
    private_file = ROOT / 'private/gateway.json'; info = private_file.lstat()
    assert info.st_uid == 0 and info.st_mode & 0o077 == 0 and not private_file.is_symlink(), 'PRIVATE_CONFIGURATION_REQUIRED'
    private = json.loads(private_file.read_text())
    definitions, proxy, media = render((ROOT / 'kamailio.template.cfg').read_text(), private)
    import grp, pwd
    try: grp.getgrnam('odim-telephony')
    except KeyError: subprocess.run(['groupadd', '--system', 'odim-telephony'], check=True)
    try: pwd.getpwnam('odim-telephony')
    except KeyError: subprocess.run(['useradd', '--system', '--gid', 'odim-telephony', '--home-dir', '/nonexistent', '--shell', '/usr/sbin/nologin', 'odim-telephony'], check=True)
    gid = grp.getgrnam('odim-telephony').gr_gid
    CONF.mkdir(mode=0o750, exist_ok=True); assert not CONF.is_symlink() and CONF.stat().st_uid == 0, 'OWNED_CONFIG_DIRECTORY'; os.chown(CONF, 0, gid); os.chmod(CONF, 0o750)
    install_file(CONF / 'gateway-defs.cfg', definitions, group=gid)
    install_file(CONF / 'kamailio.cfg', proxy, group=gid)
    install_file(CONF / 'rtpengine.conf', media, group=gid)
    run(['runuser', '-u', 'odim-telephony', '--', 'test', '-r', str(CONF / 'rtpengine.conf')], 'service-config-readable')
    run(['kamailio', '-c', '-f', str(CONF / 'kamailio.cfg')], 'kamailio-check')
    install_file(CONF / 'wait-media.py', (ROOT / 'wait-media.py').read_text(), group=gid)
    firewall = '''#!/usr/bin/env bash
set -euo pipefail
case "${1:?}" in
start)
 iptables -w -N INPULSE_ODIM_PHONE
 iptables -w -A INPULSE_ODIM_PHONE -s 131.161.3.106 -d 144.91.87.0 -p udp --dport 5060 -j ACCEPT
 iptables -w -A INPULSE_ODIM_PHONE -d 144.91.87.0 -p udp --dport 5060 -j DROP
 iptables -w -A INPULSE_ODIM_PHONE -d 144.91.87.0 -p udp --dport 24000:24199 -j ACCEPT
 iptables -w -I INPUT 1 -j INPULSE_ODIM_PHONE
 ;;
stop)
 iptables -w -D INPUT -j INPULSE_ODIM_PHONE || true
 iptables -w -F INPULSE_ODIM_PHONE || true
 iptables -w -X INPULSE_ODIM_PHONE || true
 ;;
*) exit 2;;
esac
'''
    install_file(Path('/usr/local/sbin/inpulse-odim-telephony-firewall'), firewall, 0o750)
    units = {'firewall': '[Unit]\nDescription=in.pulse Odim telephony firewall\nAfter=network-online.target\n[Service]\nType=oneshot\nRemainAfterExit=yes\nExecStart=/usr/local/sbin/inpulse-odim-telephony-firewall start\nExecStop=/usr/local/sbin/inpulse-odim-telephony-firewall stop\n[Install]\nWantedBy=multi-user.target\n'}
    for name in ['rtpengine', 'kamailio']:
        extra = '\nAfter=' + PREFIX + 'rtpengine.service\nRequires=' + PREFIX + 'rtpengine.service' if name == 'kamailio' else ''
        command = '/usr/sbin/kamailio -DD -E -m 64 -M 8 -P /run/' + PREFIX + 'kamailio/pid -f ' + str(CONF / 'kamailio.cfg') if name == 'kamailio' else '/usr/bin/rtpengine --config-file=' + str(CONF / 'rtpengine.conf') + ' --foreground --log-stderr --pidfile=/run/' + PREFIX + 'rtpengine/pid'
        prestart = '\nExecStartPre=/usr/bin/python3 ' + str(CONF / 'wait-media.py') if name == 'kamailio' else ''
        units[name] = '[Unit]\nDescription=in.pulse Odim telephony ' + name + '\nWants=network-online.target\nAfter=network-online.target ' + PREFIX + 'firewall.service\nRequires=' + PREFIX + 'firewall.service' + extra + '\n[Service]\nType=simple\nUser=odim-telephony\nGroup=odim-telephony\nRuntimeDirectory=' + PREFIX + name + '\nRuntimeDirectoryMode=0750' + prestart + '\nExecStart=' + command + '\nRestart=on-failure\nRestartSec=5\nUMask=0027\nNoNewPrivileges=yes\nPrivateTmp=yes\nProtectHome=yes\nProtectSystem=strict\nProtectKernelTunables=yes\nProtectKernelModules=yes\nMemoryMax=384M\n[Install]\nWantedBy=multi-user.target\n'
    for name, content in units.items(): install_file(Path('/etc/systemd/system/' + PREFIX + name + '.service'), content, 0o644)
    run(['systemctl', 'daemon-reload'], 'systemd-reload')
    try:
        for name in NAMES:
            if subprocess.run(['systemctl', 'is-failed', '--quiet', PREFIX + name + '.service']).returncode == 0:
                run(['systemctl', 'reset-failed', PREFIX + name + '.service'], 'unit-reset-' + name)
        run(['systemctl', 'enable', '--now', *[PREFIX + name + '.service' for name in NAMES]], 'gateway-start')
        run(['python3', str(CONF / 'wait-media.py')], 'media-ready')
        run(['systemctl', 'is-active', *[PREFIX + name + '.service' for name in NAMES]], 'gateway-units-active')
        zone = Path('/etc/nginx/conf.d/inpulse-odim-telephony-zones.conf'); assert not zone.exists(), 'EXISTING_ZONE'
        install_file(zone, 'limit_req_zone $binary_remote_addr zone=odim_telephony_rate:1m rate=20r/m;\nlimit_conn_zone $binary_remote_addr zone=odim_telephony_connections:1m;\n', 0o644)
        state['zoneSha256'] = sha(zone.read_bytes()); save(state)
        assert sha(VHOST.read_bytes()) == state['nginxBeforeSha256'], 'NGINX_DRIFT'
        VHOST.write_text(patch_nginx(VHOST.read_text())); state['nginxAfterSha256'] = sha(VHOST.read_bytes()); save(state)
        run(['nginx', '-t'], 'nginx-check'); run(['systemctl', 'reload', 'nginx'], 'nginx-reload')
        state.update(phase='installed', installedAtUtc=stamp(), nodePidsAfter=node_pids(), sipRegistrations=0, callsPlaced=0)
        state['existingNodeProcessesPreserved'] = state['nodePidsAfter'] == state['nodePidsBefore']
        save(state); return state
    except Exception:
        rollback(state); raise


def main():
    assert os.geteuid() == 0 and socket.gethostname().split('.')[0] == 'vmi3031571', 'EXPECTED_LUX_ROOT'
    assert Path(__file__).resolve().parent == ROOT, 'EXPECTED_PRIVATE_CONTROL'
    assert len(sys.argv) == 2 and sys.argv[1] in ['prepare', 'install', 'resume', 'verify', 'rollback'], 'EXPECTED_ACTION'
    os.umask(0o077)
    if sys.argv[1] == 'prepare': state = prepare()
    else:
        state = json.loads((ROOT / 'receipt.json').read_text())
        if sys.argv[1] == 'resume':
            assert state['phase'] == 'rolled-back' and sha(VHOST.read_bytes()) == state['nginxBeforeSha256'], 'OWNED_ROLLBACK_REQUIRED'
            assert not Path('/etc/nginx/conf.d/inpulse-odim-telephony-zones.conf').exists(), 'ZONE_STILL_PRESENT'
            for name in NAMES:
                assert subprocess.run(['systemctl', 'is-active', '--quiet', PREFIX + name + '.service']).returncode != 0, 'GATEWAY_STILL_ACTIVE'
            archive=ROOT/('receipt-attempt'+str(1+len(list(ROOT.glob('receipt-attempt*.json'))))+'.json'); assert not archive.exists(), 'ARCHIVE_ALREADY_PRESENT'; archive.write_text(json.dumps(state,indent=2))
            state['phase']='packages-ready';state['resumedAtUtc']=stamp();save(state);state=activate(state)
        elif sys.argv[1] == 'install': state = activate(state)
        elif sys.argv[1] == 'rollback': state = rollback(state)
        else:
            assert state['phase'] == 'installed', 'INSTALLED_REQUIRED'
            run(['systemctl', 'is-active', *[PREFIX + name + '.service' for name in NAMES]], 'units-check')
            assert sha(VHOST.read_bytes()) == state['nginxAfterSha256'], 'NGINX_DRIFT'
            run(['python3', str(CONF / 'wait-media.py')], 'media-check')
    print(json.dumps(state))


if __name__ == '__main__':
    try: main()
    except Exception as error:
        code = str(error) if isinstance(error, AssertionError) and re.fullmatch('[A-Z_]+', str(error)) else type(error).__name__
        print(json.dumps({'ok': False, 'code': code}), file=sys.stderr); sys.exit(1)
