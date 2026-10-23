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
python3 /source/homolog/wait-media.py
python3 - <<'PY'
import socket
import http.client
import http.server
import secrets
import struct
import threading
from pathlib import Path
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.settimeout(3)
sock.sendto(b'check d7:command4:pinge', ('127.0.0.1', 7223))
response = sock.recv(4096)
assert b'pong' in response, response
def handshake(origin, token=''):
    conn = http.client.HTTPConnection('127.0.0.1', 7170, timeout=5)
    conn.request('GET', '/telephony-gw?token=' + token, headers={
        'Upgrade':'websocket', 'Connection':'Upgrade', 'Origin':origin,
        'Sec-WebSocket-Key':'dGhlIHNhbXBsZSBub25jZQ==', 'Sec-WebSocket-Version':'13', 'Sec-WebSocket-Protocol':'sip'})
    status = conn.getresponse().status
    conn.close()
    return status
status = handshake('https://homolog.infotecrs.inf.br')
assert status == 403, ('missing token', status)
status = handshake('https://untrusted.invalid', 'x'*30)
assert status == 403, ('foreign origin', status)
status = handshake('https://homolog.infotecrs.inf.br', 'x'*30)
assert status == 403, ('unavailable authorizer', status)
print('PASS: daemons as dedicated user, NG ping/pong, missing token, foreign origin, unavailable authorizer')
# A loopback-only PBX and authorizer exercise a successful upgrade and SIP routing.
# No real central, operator credential or tenant data is involved.
api_key = Path('/tmp/gateway.env').read_text().strip().split('=', 1)[1]
class Authorizer(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.headers.get('X-Telephony-Gateway-Key') != api_key:
            self.send_error(403)
            return
        body = b'4003:127.0.0.4:5080'
        self.send_response(200)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *args):
        pass
server = http.server.HTTPServer(('127.0.0.1', 7101), Authorizer)
threading.Thread(target=server.serve_forever, daemon=True).start()
ws = socket.create_connection(('127.0.0.1', 7170), timeout=3)
ws.sendall(('GET /telephony-gw?token=' + 'x'*30 + ' HTTP/1.1\r\n'
    'Host: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
    'Origin: https://homolog.infotecrs.inf.br\r\nSec-WebSocket-Version: 13\r\n'
    'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Protocol: sip\r\n\r\n').encode())
assert b'101 Switching Protocols' in ws.recv(4096)
def send_frame(payload):
    payload = payload.encode()
    mask = secrets.token_bytes(4)
    prefix = bytes([0x81, 0x80 | len(payload)]) if len(payload) < 126 else bytes([0x81, 0xfe]) + struct.pack('!H', len(payload))
    ws.sendall(prefix + mask + bytes(byte ^ mask[i % 4] for i, byte in enumerate(payload)))
def read_exact(length):
    data = b''
    while len(data) < length:
        chunk = ws.recv(length-len(data))
        assert chunk, 'WebSocket closed unexpectedly'
        data += chunk
    return data
def receive_frame():
    header = read_exact(2)
    length = header[1] & 0x7f
    if length == 126:
        length = struct.unpack('!H', read_exact(2))[0]
    return read_exact(length)
def register(user, host, serial):
    return (f'REGISTER sip:{host}:5080 SIP/2.0\r\n'
        f'Via: SIP/2.0/WS browser.invalid;branch=z9hG4bK-homolog-{serial}\r\n'
        f'From: <sip:{user}@{host}>;tag=local\r\nTo: <sip:{user}@{host}>\r\n'
        f'Call-ID: homolog-loopback-{serial}\r\nCSeq: {serial} REGISTER\r\n'
        'Contact: <sip:browser@browser.invalid;transport=ws>\r\nMax-Forwards: 70\r\nContent-Length: 0\r\n\r\n')
pbx = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
pbx.bind(('127.0.0.4', 5080))
pbx.settimeout(2)
send_frame(register('4003', '127.0.0.4', 1))
packet, peer = pbx.recvfrom(8192)
assert peer == ('127.0.0.3', 5060), peer
assert b'Contact: <sip:browser@127.0.0.3:5060;alias=' in packet
headers = [line for line in packet.decode().split('\r\n') if line.startswith(('Via:', 'From:', 'To:', 'Call-ID:', 'CSeq:'))]
pbx.sendto(('SIP/2.0 401 Unauthorized\r\n' + '\r\n'.join(headers) + '\r\nWWW-Authenticate: Digest realm="mock", nonce="test"\r\nContent-Length: 0\r\n\r\n').encode(), peer)
assert b'SIP/2.0 401 Unauthorized' in receive_frame()
send_frame(register('9999', '127.0.0.4', 2))
assert b'SIP/2.0 403' in receive_frame()
send_frame(register('4003', '127.0.0.5', 3))
assert b'SIP/2.0 403' in receive_frame()
ws.close()
server.shutdown()
pbx.close()
print('PASS: authorized WebSocket, REGISTER to bound PBX, rewritten Contact, SIP reply, foreign extension/PBX refused')
PY
dpkg-query -W kamailio rtpengine-daemon
