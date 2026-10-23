#!/usr/bin/env bash
set -euo pipefail
umask 077
mkdir -p /etc/homolog-telephony /run/homolog-telephony-kamailio /run/homolog-telephony-rtpengine
python3 - <<'PY'
import secrets
from pathlib import Path
Path('/tmp/gateway.env').write_text('TELEPHONY_GATEWAY_API_KEY=' + secrets.token_hex(32) + '\n')
PY
python3 /source/homolog/configure.py render /source/kamailio.cfg /etc/homolog-telephony /tmp/gateway.env 127.0.0.2 127.0.0.3
kamailio -c -f /etc/homolog-telephony/kamailio.cfg
python3 /source/homolog/validate_config.py
groupadd --system homolog-telephony
useradd --system --gid homolog-telephony --home-dir /nonexistent --shell /usr/sbin/nologin homolog-telephony
chown -R root:homolog-telephony /etc/homolog-telephony
chmod 750 /etc/homolog-telephony
chmod 640 /etc/homolog-telephony/*
chown homolog-telephony:homolog-telephony /run/homolog-telephony-*
runuser -u homolog-telephony -- /usr/bin/rtpengine --config-file=/etc/homolog-telephony/rtpengine.conf \
    --foreground --log-stderr --pidfile=/run/homolog-telephony-rtpengine/pid > /tmp/rtpengine.log 2>&1 &
RTP=$!
runuser -u homolog-telephony -- /usr/sbin/kamailio -DD -E -m 64 -M 8 \
    -P /run/homolog-telephony-kamailio/pid -f /etc/homolog-telephony/kamailio.cfg > /tmp/kamailio.log 2>&1 &
KAM=$!
trap 'kill "$KAM" "$RTP" 2>/dev/null || true' EXIT
sleep 3
if ! kill -0 "$KAM" "$RTP"; then cat /tmp/kamailio.log /tmp/rtpengine.log; exit 1; fi
python3 - <<'PY'
import socket
import http.client
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.settimeout(3)
sock.sendto(b'check d7:command4:pinge', ('127.0.0.1', 7223))
response = sock.recv(4096)
assert b'pong' in response, response
def handshake(origin, token=''):
    conn = http.client.HTTPConnection('127.0.0.1', 7170, timeout=5)
    conn.request('GET', '/homolog/telephony-gw?token=' + token, headers={
        'Upgrade':'websocket', 'Connection':'Upgrade', 'Origin':origin,
        'Sec-WebSocket-Key':'dGhlIHNhbXBsZSBub25jZQ==', 'Sec-WebSocket-Version':'13', 'Sec-WebSocket-Protocol':'sip'})
    status = conn.getresponse().status
    conn.close()
    return status
status = handshake('https://inpulse.infotecrs.inf.br')
assert status == 403, ('missing token', status)
status = handshake('https://untrusted.invalid', 'x'*30)
assert status == 403, ('foreign origin', status)
status = handshake('https://inpulse.infotecrs.inf.br', 'x'*30)
assert status == 403, ('unavailable authorizer', status)
print('PASS: daemons as dedicated user, NG ping/pong, missing token, foreign origin, unavailable authorizer')
PY
dpkg-query -W kamailio rtpengine-daemon
