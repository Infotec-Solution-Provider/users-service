#!/usr/bin/env bash
# Run once by the human administrator. No password is collected by the agent.
set -euo pipefail
umask 077
[[ $EUID = 0 ]] || { echo 'Execute com sudo.' >&2; exit 1; }
SOURCE=/home/inpulse/htdocs/homolog/users-service/deploy/telephony-gateway/homolog
RULE=/etc/sudoers.d/inpulse-homolog-telephony
HELPER=/usr/local/sbin/homolog-telephony-admin
test ! -e "$RULE"
test ! -e "$HELPER"
/usr/bin/bash -n "$SOURCE/admin-root.sh"
TEMP=$(mktemp)
trap 'rm -f "$TEMP"' EXIT
cat > "$TEMP" <<'SUDOERS'
# Temporary homolog telephony root access - remove after installation.
# This deliberately trusts the inpulse-owned deployment source for root execution.
inpulse ALL=(root) NOPASSWD: /usr/local/sbin/homolog-telephony-admin *
SUDOERS
/usr/sbin/visudo -cf "$TEMP"
install -o root -g root -m 750 "$SOURCE/admin-root.sh" "$HELPER"
install -o root -g root -m 440 "$TEMP" "$RULE"
echo 'Acesso administrativo temporário liberado para a instalação do gateway.'
echo 'Ao concluir, o agente removerá o helper e a regra sudo.'
