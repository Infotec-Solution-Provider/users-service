#!/usr/bin/env bash
# Temporary root helper explicitly requested by the operator for this installation.
set -euo pipefail
[[ $EUID = 0 ]] || exit 1
test "$#" = 1
SOURCE=/home/inpulse/htdocs/homolog/users-service/deploy/telephony-gateway/homolog
STATE=/var/lib/homolog-telephony-install
case "$1" in
verify)
    for unit in homolog-telephony-firewall homolog-telephony-rtpengine homolog-telephony-kamailio; do
        systemctl is-active --quiet "$unit"
        systemctl is-enabled --quiet "$unit"
        echo "$unit: active, enabled"
    done
    python3 /usr/local/libexec/homolog-telephony-wait-media.py
    iptables -w -C INPUT -j HOMOLOG_TELEPHONY
    python3 - <<'PY'
from pathlib import Path
production = Path('/etc/nginx/sites-enabled/inpulse.infotecrs.inf.br.conf')
archives = sorted(Path('/var/lib').glob('homolog-telephony-install-failed-*'))
for archive in archives:
    record = archive / 'vhost-path'
    if record.exists() and record.read_text().strip() == str(production):
        assert production.read_bytes() == (archive / 'nginx.before').read_bytes(), 'Production vhost differs from original backup'
        print('production-vhost-restored=True')
        break
print('media-control-ready=True')
PY
    nginx -t
    ;;
inspect)
    python3 - <<'PY'
from pathlib import Path
state = Path('/var/lib/homolog-telephony-install')
for name in ('nginx.conf',):
    path = Path('/etc/nginx') / name
    print('nginx-main-includes:')
    for line in path.read_text().splitlines():
        if line.strip().startswith(('include ', 'http ', 'http{')):
            print(line.strip())
target = Path((state / 'vhost-path').read_text().strip())
print('vhost-path=' + str(target))
print('vhost-matches-backup=' + str(target.read_bytes() == (state / 'nginx.before').read_bytes()))
env = Path('/home/inpulse/htdocs/homolog/users-service/.env')
print('users-env-matches-backup=' + str(env.read_bytes() == (state / 'users.env.before').read_bytes()))
for line in target.read_text().splitlines():
    if line.strip().startswith(('listen ', 'server_name ', 'include ')):
        print(line.strip())
for vhost in Path('/etc/nginx/sites-enabled').glob('*homolog*'):
    print('homolog-vhost=' + str(vhost))
    for line in vhost.read_text().splitlines():
        if line.strip().startswith(('listen ', 'server_name ', 'include ')):
            print(line.strip())
print('zones-exists=' + str(Path('/etc/nginx/sites-enabled/00-homolog-telephony-zones.conf').exists()))
PY
    systemctl cat homolog-telephony-kamailio homolog-telephony-rtpengine
    ;;
diagnose)
    for unit in homolog-telephony-firewall homolog-telephony-rtpengine homolog-telephony-kamailio; do
        echo "unit=$unit"
        systemctl show "$unit" -p LoadState -p ActiveState -p SubState -p Result -p ExecMainStatus
        journalctl -u "$unit" -n 45 --no-pager -o short-iso 2>&1 |
            sed -E 's/(token=)[A-Za-z0-9_.%-]+/\1[REDACTED]/g'
    done
    for marker in prepared users-env-changed nginx-installed.sha256 zones-created installed rolled-back; do
        if test -f "$STATE/$marker"; then echo "marker=$marker"; fi
    done
    for log in apt-update apt-install kamailio-check; do
        if test -f "$STATE/$log.log"; then
            echo "log=$log"
            tail -n 12 "$STATE/$log.log" | sed -E 's/(token=)[A-Za-z0-9_.%-]+/\1[REDACTED]/g'
        fi
    done
    nginx -t
    ;;
install|resume|recover|rollback)
    exec /usr/bin/bash "$SOURCE/install-root.sh" "$1"
    ;;
sync)
    # The repository is writable by inpulse: this is a temporary ROOT grant to
    # the trusted operator/agent, not a security boundary against that account.
    /usr/bin/bash -n "$SOURCE/admin-root.sh"
    install -o root -g root -m 750 "$SOURCE/admin-root.sh" /usr/local/sbin/homolog-telephony-admin
    ;;
cleanup)
    RULE=/etc/sudoers.d/inpulse-homolog-telephony
    if test -f "$RULE"; then
        grep -q '^# Temporary homolog telephony root access' "$RULE"
        rm -f "$RULE"
    fi
    rm -f /usr/local/sbin/homolog-telephony-admin
    echo 'Acesso root temporário removido.'
    ;;
*) echo 'Ação inválida.' >&2; exit 2;;
esac
