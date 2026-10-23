"""Exercise deployment failure boundaries without touching the server."""
import importlib.util
from pathlib import Path
import tempfile

spec = importlib.util.spec_from_file_location('configure', Path(__file__).with_name('configure.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
with tempfile.TemporaryDirectory() as folder:
    root = Path(folder)
    vhost = root / 'vhost.conf'
    before = '''server {
 listen 80;
 server_name homolog.infotecrs.inf.br;
 return 301 https://$host$request_uri;
}
server {
 listen 443 ssl;
 listen [::]:443 ssl;
 server_name homolog.infotecrs.inf.br;
 location / { proxy_pass http://127.0.0.1:3001; }
 # ignore misleading brace: }
 set $example "{quoted}";
}
server { listen 8080; server_name homolog.infotecrs.inf.br; }
'''
    vhost.write_text(before)
    module.patch_nginx(vhost, '/etc/homolog-telephony/nginx.conf')
    after = vhost.read_text()
    marker = 'include /etc/homolog-telephony/nginx.conf;'
    assert after.count(marker) == 1
    assert after.replace('  ' + marker + '\n', '') == before
    try:
        module.patch_nginx(vhost, '/etc/homolog-telephony/nginx.conf')
        raise AssertionError('Duplicate installation accepted')
    except ValueError:
        pass
    vhost.write_text(before.replace('listen 443 ssl;', 'listen 9443 ssl;').replace('listen [::]:443 ssl;', 'listen [::]:9443 ssl;'))
    snapshot = vhost.read_text()
    try:
        module.patch_nginx(vhost, '/etc/homolog-telephony/nginx.conf')
        raise AssertionError('Unexpected vhost accepted')
    except ValueError:
        assert vhost.read_text() == snapshot
    env, new = root / 'users.env', root / 'gateway.env'
    env.write_text('PORT=7101\nTELEPHONY_GATEWAY_API_KEY=old\nOTHER=preserved\n')
    backup = root / 'backup.env'
    backup.write_text(env.read_text())
    new.write_text('TELEPHONY_GATEWAY_API_KEY=new\nTELEPHONY_GATEWAY_ALLOWED_NETWORKS=172.22.0.0/16\n')
    module.patch_env(env, new)
    assert 'OTHER=preserved' in env.read_text() and 'API_KEY=new' in env.read_text()
    env.write_text(env.read_text() + 'LATER=preserved\n')
    module.patch_env(env, backup)
    assert 'LATER=preserved' in env.read_text() and 'API_KEY=old' in env.read_text()
    assert 'ALLOWED_NETWORKS' not in env.read_text()
print('PASS: nginx scope/duplicate/unexpected-vhost guards and selective environment rollback')
