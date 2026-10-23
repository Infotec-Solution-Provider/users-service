#!/usr/bin/env bash
# Temporary root helper explicitly requested by the operator for this installation.
set -euo pipefail
[[ $EUID = 0 ]] || exit 1
test "$#" = 1
SOURCE=/home/inpulse/htdocs/homolog/users-service/deploy/telephony-gateway/homolog
STATE=/var/lib/homolog-telephony-install
case "$1" in
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
