import importlib.util
from pathlib import Path
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('lux',Path(__file__).with_name('lux-deploy.py'));lux=importlib.util.module_from_spec(spec);spec.loader.exec_module(lux)
class LuxTest(unittest.TestCase):
 def test_render_keeps_only_public_pbx_media_and_header_authorization(self):
  private={'version':1,'websocketUrl':'wss://lux.infotecrs.inf.br/telephony-gw','apiKey':'a'*64,'allowedNetworks':['131.161.3.106/32'],'principals':[{'instance':'odim','userId':534}]}
  definitions,proxy,media=lux.render(Path(__file__).with_name('kamailio.template.cfg').read_text(),private)
  self.assertIn('144.91.87.0:5060',definitions);self.assertIn('127.0.0.1:7171',definitions);self.assertIn('127.0.0.1:7224',media);self.assertIn('24000',media);self.assertIn('24199',media)
  self.assertNotIn('?token=',proxy);self.assertIn('X-Telephony-Gateway-Token:',proxy);self.assertIn('"$var(headers)"',proxy)
  private['principals'][0]['userId']=535
  with self.assertRaises(AssertionError):lux.render('template',private)
 def test_nginx_patch_preserves_other_locations_and_http(self):
  previous=lux.ROOT
  with tempfile.TemporaryDirectory() as root:
   root=Path(root);lux.ROOT=root
   try:
    (root/'install-public-route.py').write_text(Path(__file__).with_name('install-public-route.py').read_text())
    before='server {\n listen 80;\n server_name lux.infotecrs.inf.br;\n}\nserver {\n listen 443 ssl;\n server_name lux.infotecrs.inf.br;\n location / { proxy_pass http://127.0.0.1:730; }\n}\n'
    after=lux.patch_nginx(before);self.assertEqual(after.replace(lux.SNIPPET,''),before);self.assertIn('access_log off;',after)
    with self.assertRaises(AssertionError):lux.patch_nginx(after)
   finally:lux.ROOT=previous
if __name__=='__main__':unittest.main()
