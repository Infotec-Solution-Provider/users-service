"""Disposable Ubuntu native validation. All sockets are loopback; no real SIP registration."""
import base64
import http.server
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import threading
import time

HERE=Path(__file__).parent
spec=importlib.util.spec_from_file_location('lux',HERE/'lux-deploy.py');lux=importlib.util.module_from_spec(spec);spec.loader.exec_module(lux)
secret='a'*64;token='testtoken'+'x'*40;calls=[]
class Authorize(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  calls.append({'path':self.path,'keyCorrect':self.headers.get('X-Telephony-Gateway-Key')==secret,'tokenCorrect':self.headers.get('X-Telephony-Gateway-Token')==token})
  okay=self.path=='/api/telephony/gateway/authorize' and calls[-1]['keyCorrect'] and calls[-1]['tokenCorrect']
  self.send_response(200 if okay else 403);self.end_headers();self.wfile.write(b'2710:127.0.0.1:15061' if okay else b'denied')
 def log_message(self,*args):pass
server=http.server.HTTPServer(('127.0.0.1',18001),Authorize);threading.Thread(target=server.serve_forever,daemon=True).start()
private={'version':1,'websocketUrl':'wss://lux.infotecrs.inf.br/telephony-gw','apiKey':secret,'allowedNetworks':['131.161.3.106/32'],'principals':[{'instance':'odim','userId':534}]}
defs,proxy,media=lux.render((HERE/'kamailio.template.cfg').read_text(),private)
defs=defs.replace('144.91.87.0:5060','127.0.0.1:15060').replace('!GW_USERS_URL!https://inpulse.infotecrs.inf.br!','!GW_USERS_URL!http://127.0.0.1:18001!')
media=media.replace('144.91.87.0','127.0.0.1')
lux.CONF.mkdir(exist_ok=True);Path('/run/inpulse-odim-telephony-kamailio').mkdir(exist_ok=True)
for name,data in [('gateway-defs.cfg',defs),('kamailio.cfg',proxy),('rtpengine.conf',media)]: (lux.CONF/name).write_text(data)
subprocess.run(['kamailio','-c','-f',str(lux.CONF/'kamailio.cfg')],check=True)
media_log=open('/tmp/media.log','w');sip_log=open('/tmp/sip.log','w')
rtp=subprocess.Popen(['rtpengine','--config-file='+str(lux.CONF/'rtpengine.conf'),'--foreground','--log-stderr','--pidfile=/tmp/rtp.pid'],stdout=media_log,stderr=media_log)
sip=None
try:
 for _ in range(30):
  with socket.socket(socket.AF_INET,socket.SOCK_DGRAM) as sock:
   sock.settimeout(.2);sock.sendto(b'ready d7:command4:pinge',('127.0.0.1',7224))
   try:
    if b'pong' in sock.recv(4096):break
   except OSError:time.sleep(.1)
 else:raise AssertionError('MEDIA_NOT_READY')
 sip=subprocess.Popen(['kamailio','-DD','-E','-m','64','-M','8','-f',str(lux.CONF/'kamailio.cfg')],stdout=sip_log,stderr=sip_log)
 for _ in range(30):
  try:
   with socket.create_connection(('127.0.0.1',7171),timeout=.2):break
  except OSError:time.sleep(.1)
 else:raise AssertionError('SIP_NOT_READY')
 def handshake(query,origin='https://inpulse.infotecrs.inf.br'):
  with socket.create_connection(('127.0.0.1',7171),timeout=3) as sock:
   key=base64.b64encode(os.urandom(16)).decode();sock.sendall(('GET /telephony-gw'+query+' HTTP/1.1\r\nHost: lux.infotecrs.inf.br\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nOrigin: '+origin+'\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: sip\r\nSec-WebSocket-Key: '+key+'\r\n\r\n').encode())
   return sock.recv(4096).split(b'\r\n')[0].decode()
 assert '403' in handshake(''), 'TOKEN_REQUIRED'
 assert '403' in handshake('?token='+token,'https://foreign.example.test'), 'ORIGIN_REQUIRED'
 assert not calls, 'UNAUTHORIZED_CALLBACK'
 accepted=handshake('?token='+token);assert '101' in accepted, 'AUTHORIZED_HANDSHAKE_FAILED:'+accepted
 assert calls==[{'path':'/api/telephony/gateway/authorize','keyCorrect':True,'tokenCorrect':True}]
 print(json.dumps({'passed':True,'nativeSyntax':True,'mediaControlPong':True,'websocketAuthorized':101,'missingToken':403,'foreignOrigin':403,'tokenOnlyInHeader':True,'realPbxTraffic':0,'sipRegistrations':0,'callsPlaced':0}))
except Exception:
 print(json.dumps({'fixtureCallbacks':calls}));sip_log.flush();print(Path('/tmp/sip.log').read_text()[-3500:]);raise
finally:
 if sip:sip.terminate();sip.wait(timeout=10)
 rtp.terminate();rtp.wait(timeout=10);server.shutdown()
