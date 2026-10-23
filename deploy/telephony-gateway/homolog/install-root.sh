#!/usr/bin/env bash
# Explicitly authorized homolog installation. Run as root, never with shell tracing.
set -euo pipefail
umask 077
[[ $EUID = 0 ]] || { echo 'Execute este instalador com sudo.' >&2; exit 1; }
MODE=${1:-install}
H=/home/inpulse/htdocs/homolog
SOURCE=$(cd "$(dirname "$0")/.." && pwd)
C=/etc/homolog-telephony
STATE=/var/lib/homolog-telephony-install
VHOST=${2:-/etc/nginx/sites-enabled/inpulse.infotecrs.inf.br.conf}
PUBLIC=82.25.64.46
PRIVATE=172.22.125.232
NODE=/home/inpulse/.nvm/versions/node/v22.14.0/bin
pm2_homolog() {
    runuser -u inpulse -- env HOME=/home/inpulse PM2_HOME=/home/inpulse/.pm2 \
        PATH="$NODE:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" pm2 "$@"
}
rollback() {
    test -f "$STATE/prepared"
    systemctl disable --now homolog-telephony-kamailio.service homolog-telephony-rtpengine.service || true
    if test -f "$STATE/users-env-changed"; then
        python3 "$SOURCE/homolog/configure.py" env "$H/users-service/.env" "$STATE/users.env.before"
        pm2_homolog restart homolog-users --update-env > "$STATE/pm2-rollback.log" 2>&1
    fi
    # Restore the vhost only if it has not been edited since this installer.
    if test -f "$STATE/nginx-installed.sha256"; then
        if sha256sum --status -c "$STATE/nginx-installed.sha256"; then
            cat "$STATE/nginx.before" > "$(cat "$STATE/vhost-path")"
        else
            echo "Vhost foi editado depois da instalação. Remova apenas o include $C/nginx.conf antes do reload." >&2
            return 1
        fi
    fi
    if test -f "$STATE/zones-created"; then rm -f /etc/nginx/conf.d/homolog-telephony-zones.conf; fi
    nginx -t
    systemctl reload nginx
    systemctl disable --now homolog-telephony-firewall.service || true
    touch "$STATE/rolled-back"
    echo "Rollback concluído; pacotes e backups preservados em $STATE."
}
if [[ $MODE = rollback ]]; then rollback; exit; fi
[[ $MODE = install ]] || { echo 'Uso: install-root.sh [install|rollback] [vhost]' >&2; exit 2; }
test ! -e "$STATE/prepared"
test -f "$H/users-service/.env"
test -f "$VHOST"
test -f "$SOURCE/kamailio.cfg"
grep -q 'gatewayAvailable' "$H/users-service/dist/controllers/webrtc.controller.js"
grep -q 'telephony/gateway/authorize' "$H/users-service/dist/controllers/webrtc.controller.js"
ip -4 addr show | grep -q "$PRIVATE/"
ip -4 addr show | grep -q "$PUBLIC/"
if ss -H -lntu | grep -Eq ':(5060|7170|7223)\b'; then echo 'Portas do gateway ocupadas.' >&2; exit 1; fi
if systemctl is-active --quiet kamailio || systemctl is-active --quiet rtpengine || systemctl is-active --quiet rtpengine-daemon; then
    echo 'Outro gateway já está ativo; abortando.' >&2; exit 1
fi
test ! -e /etc/nginx/conf.d/homolog-telephony-zones.conf
nginx -t
mkdir -p "$STATE"
chmod 700 "$STATE"
readlink -f "$VHOST" > "$STATE/vhost-path"
cp -p "$VHOST" "$STATE/nginx.before"
cp -p "$H/users-service/.env" "$STATE/users.env.before"
chmod 600 "$STATE/users.env.before" "$STATE/nginx.before"
touch "$STATE/prepared"
# Apt must not start a distro-default SIP proxy on all interfaces.
systemctl mask kamailio.service rtpengine.service rtpengine-daemon.service
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l
apt-get update > "$STATE/apt-update.log" 2>&1
apt-get install -y --no-install-recommends kamailio kamailio-extra-modules \
    kamailio-utils-modules kamailio-websocket-modules rtpengine-daemon iptables \
    > "$STATE/apt-install.log" 2>&1
getent group homolog-telephony >/dev/null || groupadd --system homolog-telephony
id homolog-telephony >/dev/null 2>&1 || useradd --system --gid homolog-telephony \
    --home-dir /nonexistent --shell /usr/sbin/nologin homolog-telephony
install -d -o root -g homolog-telephony -m 750 "$C"
{
    echo 'TELEPHONY_GATEWAY_WSS_URL=wss://inpulse.infotecrs.inf.br/homolog/telephony-gw'
    printf 'TELEPHONY_GATEWAY_TOKEN_SECRET=%s\n' "$(openssl rand -hex 32)"
    printf 'TELEPHONY_GATEWAY_API_KEY=%s\n' "$(openssl rand -hex 32)"
    echo 'TELEPHONY_GATEWAY_ALLOWED_NETWORKS=172.22.0.0/16'
} > "$C/users-gateway.env"
python3 "$SOURCE/homolog/configure.py" render "$SOURCE/kamailio.cfg" "$C" "$C/users-gateway.env" "$PUBLIC" "$PRIVATE"
chown root:homolog-telephony "$C"/*.cfg "$C/rtpengine.conf"
chmod 640 "$C"/*.cfg "$C/rtpengine.conf"
chmod 600 "$C/users-gateway.env"
kamailio -c -f "$C/kamailio.cfg" > "$STATE/kamailio-check.log" 2>&1

cat > /usr/local/sbin/homolog-telephony-firewall <<'FIREWALL'
#!/usr/bin/env bash
set -euo pipefail
case "${1:?start|stop}" in
start)
    iptables -w -N HOMOLOG_TELEPHONY 2>/dev/null || true
    iptables -w -F HOMOLOG_TELEPHONY
    iptables -w -A HOMOLOG_TELEPHONY -d 82.25.64.46 -p udp --dport 32000:32999 -j ACCEPT
    iptables -w -A HOMOLOG_TELEPHONY -s 172.22.0.0/16 -d 172.22.125.232 -p udp --dport 32000:32999 -j ACCEPT
    iptables -w -A HOMOLOG_TELEPHONY -s 172.22.0.0/16 -d 172.22.125.232 -p udp --dport 5060 -j ACCEPT
    iptables -w -C INPUT -j HOMOLOG_TELEPHONY 2>/dev/null || iptables -w -I INPUT 1 -j HOMOLOG_TELEPHONY
    ;;
stop)
    if iptables -w -C INPUT -j HOMOLOG_TELEPHONY 2>/dev/null; then iptables -w -D INPUT -j HOMOLOG_TELEPHONY; fi
    if iptables -w -S HOMOLOG_TELEPHONY >/dev/null 2>&1; then
        iptables -w -F HOMOLOG_TELEPHONY
        iptables -w -X HOMOLOG_TELEPHONY
    fi
    ;;
*) exit 2;;
esac
FIREWALL
chmod 750 /usr/local/sbin/homolog-telephony-firewall
cat > /etc/systemd/system/homolog-telephony-firewall.service <<'UNIT'
[Unit]
Description=in.pulse homolog telephony UDP firewall
After=network-online.target ufw.service
Before=homolog-telephony-kamailio.service homolog-telephony-rtpengine.service
[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/sbin/homolog-telephony-firewall start
ExecStop=/usr/local/sbin/homolog-telephony-firewall stop
[Install]
WantedBy=multi-user.target
UNIT
for name in kamailio rtpengine; do
    if [[ $name = kamailio ]]; then
        EXEC="/usr/sbin/kamailio -DD -E -m 64 -M 8 -P /run/homolog-telephony-kamailio/pid -f $C/kamailio.cfg"
    else
        EXEC="/usr/bin/rtpengine --config-file=$C/rtpengine.conf --foreground --log-stderr --pidfile=/run/homolog-telephony-rtpengine/pid"
    fi
    cat > "/etc/systemd/system/homolog-telephony-$name.service" <<UNIT
[Unit]
Description=in.pulse homolog telephony $name
Wants=network-online.target
After=network-online.target zerotier-one.service homolog-telephony-firewall.service
Requires=homolog-telephony-firewall.service
StartLimitIntervalSec=300
StartLimitBurst=5
[Service]
Type=simple
User=homolog-telephony
Group=homolog-telephony
RuntimeDirectory=homolog-telephony-$name
RuntimeDirectoryMode=0750
ExecStart=$EXEC
Restart=on-failure
RestartSec=5
UMask=0027
LimitNOFILE=65536
NoNewPrivileges=yes
PrivateTmp=yes
ProtectHome=yes
ProtectSystem=strict
ProtectKernelTunables=yes
ProtectKernelModules=yes
[Install]
WantedBy=multi-user.target
UNIT
done
systemctl daemon-reload
trap 'echo "Falha na ativação. Consulte os logs em /var/lib/homolog-telephony-install." >&2; rollback' ERR
systemctl enable --now homolog-telephony-firewall.service homolog-telephony-rtpengine.service homolog-telephony-kamailio.service
sleep 2
systemctl is-active --quiet homolog-telephony-rtpengine.service
systemctl is-active --quiet homolog-telephony-kamailio.service
# Check the actual media-control socket, not only systemd's process state.
python3 - <<'PY'
import socket
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.settimeout(3)
sock.sendto(b'install d7:command4:pinge', ('127.0.0.1', 7223))
assert b'pong' in sock.recv(4096), 'rtpengine did not answer pong'
PY
install -o root -g root -m 644 "$SOURCE/homolog/nginx.conf" "$C/nginx.conf"
cat > /etc/nginx/conf.d/homolog-telephony-zones.conf <<'NGINX'
limit_req_zone $binary_remote_addr zone=homolog_telephony_rate:1m rate=20r/m;
limit_conn_zone $binary_remote_addr zone=homolog_telephony_connections:1m;
NGINX
touch "$STATE/zones-created"
python3 "$SOURCE/homolog/configure.py" nginx "$VHOST" "$C/nginx.conf"
sha256sum "$(cat "$STATE/vhost-path")" > "$STATE/nginx-installed.sha256"
nginx -t
systemctl reload nginx
touch "$STATE/users-env-changed"
python3 "$SOURCE/homolog/configure.py" env "$H/users-service/.env" "$C/users-gateway.env"
pm2_homolog restart homolog-users --update-env > "$STATE/pm2-activate.log" 2>&1
sleep 2
test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:7101/api/telephony/gateway/authorize)" = 403
pm2_homolog pid homolog-users | grep -Eq '^[1-9][0-9]*$'
# Verify the public route and TLS without sending a real token or registering a SIP extension.
python3 - <<'PY'
import http.client
conn = http.client.HTTPSConnection('inpulse.infotecrs.inf.br', timeout=10)
conn.request('GET', '/homolog/telephony-gw', headers={
    'Upgrade': 'websocket', 'Connection': 'Upgrade',
    'Origin': 'https://inpulse.infotecrs.inf.br',
    'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
    'Sec-WebSocket-Protocol': 'sip',
})
assert conn.getresponse().status == 403, 'public WSS route must deny a missing token'
conn.close()
PY
touch "$STATE/installed"
trap - ERR
echo 'Gateway instalado para homologação. Nenhum tenant/ramal foi ativado automaticamente.'
echo "Configuração: $C; logs/backup: $STATE"
