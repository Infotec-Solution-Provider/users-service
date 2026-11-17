import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('route', Path(__file__).with_name('install-public-route.py'))
route = importlib.util.module_from_spec(spec); spec.loader.exec_module(route)


class RouteTest(unittest.TestCase):
    def fixture(self):
        return '''server {
 listen 80;
 server_name inpulse.infotecrs.inf.br;
 return 301 https://$host$request_uri;
}
server {
 listen 443 ssl;
 listen [::]:443 ssl;
 server_name inpulse.infotecrs.inf.br;
 location / { proxy_pass http://127.0.0.1:3000; }
}
server {
 listen 443 ssl;
 server_name homolog.infotecrs.inf.br;
 location / { proxy_pass http://127.0.0.1:3002; }
}
'''
    def test_changes_only_production_tls(self):
        before = self.fixture(); after = route.patch(before)
        self.assertEqual(after.replace(route.SNIPPET, ''), before)
        self.assertEqual(after.count(route.MARKER), 1)
        self.assertLess(after.index(route.MARKER), after.index('server_name homolog'))
        self.assertIn('proxy_pass http://127.0.0.1:8001;', after)
    def test_existing_route_refused(self):
        with self.assertRaisesRegex(AssertionError, 'ALREADY'): route.patch(route.patch(self.fixture()))
        with self.assertRaisesRegex(AssertionError, 'CONCURRENT'): route.patch(self.fixture().replace('location / {', 'location ^~ /api/telephony/ {', 1))
    def test_missing_or_ambiguous_target_refused(self):
        with self.assertRaises(AssertionError): route.patch(self.fixture().replace('inpulse.infotecrs.inf.br', 'other.example'))
        with self.assertRaises(AssertionError): route.patch(self.fixture() + self.fixture())
    def test_comments_quotes_and_bad_braces(self):
        before = self.fixture().replace('location / {', '# comment { }\n set $value "{quoted}";\n location / {', 1)
        self.assertEqual(route.patch(before).replace(route.SNIPPET, ''), before)
        with self.assertRaisesRegex(AssertionError, 'UNBALANCED'): route.patch(self.fixture() + '}')


if __name__ == '__main__': unittest.main()
