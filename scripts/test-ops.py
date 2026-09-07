"""Isolated MySQL and loopback HTTP checks; no fake production visits or feedback."""
import getpass
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
import re
import secrets
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import pymysql

root = Path(__file__).resolve().parents[1]
php = 'D:/phpenv/phpEnv/php/php-8.2/php.exe'
checks = []
prefix = 'atlas_test_' + secrets.token_hex(6) + '_'
tables = ['ops_meta', 'visit_events', 'feedback', 'ops_limits', 'admin_users']
db = None
server = None
password = getpass.getpass('Database password: ')
config = dict(host='sql.s1256.vhostgo.com', database='dmwc1566', user='dmwc1566', password=password,
              secret=secrets.token_hex(32), geo_path=str(root / 'work/ops-geo'))

def check(condition, name):
    if not condition:
        raise AssertionError(name)
    checks.append(name)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def client():
    return urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect(), urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

def token(body):
    match = re.search(r'name="csrf" value="([a-f0-9]{64})"', body)
    if not match: raise AssertionError('csrf_missing')
    return match.group(1)

def hash_password(value):
    result = subprocess.run([php, '-r', 'echo password_hash(stream_get_contents(STDIN), PASSWORD_DEFAULT);'], input=value,
                            capture_output=True, text=True, timeout=10)
    if result.returncode: raise RuntimeError('password_hash_failed')
    return result.stdout

try:
    store = subprocess.run([php, str(root / 'scripts/test-ops-store.php')], input=json.dumps(config),
                           capture_output=True, text=True, encoding='utf-8', timeout=60)
    store_receipt = json.loads(store.stdout)
    if not store_receipt.get('passed'):
        print(json.dumps(store_receipt, ensure_ascii=False), flush=True)
        raise AssertionError('isolated_store_checks')
    checks.extend(store_receipt['checks'])
    db = pymysql.connect(**{key: config[key] for key in ['host', 'database', 'user', 'password']}, charset='utf8mb4',
                         autocommit=True, connect_timeout=15, read_timeout=20)
    with db.cursor() as q:
        for statement in (root / 'scripts/ops-schema.sql').read_text(encoding='utf-8').split(';'):
            if statement.strip(): q.execute(statement.replace('atlas_', prefix))
        initial = secrets.token_urlsafe(24)
        q.execute(f'INSERT INTO `{prefix}admin_users` (username,password_hash,created_at) VALUES (%s,%s,UTC_TIMESTAMP())', ('admin', hash_password(initial)))
    with tempfile.TemporaryDirectory(prefix='dmwc-ops-tests-') as sessions:
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            port = listener.getsockname()[1]
        config.update(table_prefix=prefix, allow_local_http=True, session_path=sessions)
        env = os.environ.copy()
        env['DMWC_OPS_CONFIG_JSON'] = json.dumps(config)
        base = f'http://127.0.0.1:{port}'
        server = subprocess.Popen([php, '-S', f'127.0.0.1:{port}', '-t', str(root / 'public')], env=env,
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                  creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
        admin, public = client(), client()

        def request(opener, path, data=None, json_body=False, origin=None, extra=None):
            headers = {'User-Agent': 'AtlasOperationsIntegrationTest/1.0'}
            if data is not None:
                headers['Origin'] = base if origin is None else origin
                headers['Content-Type'] = 'application/json' if json_body else 'application/x-www-form-urlencoded'
                data = (json.dumps(data) if json_body else urllib.parse.urlencode(data)).encode()
            headers.update(extra or {})
            req = urllib.request.Request(base + path, data=data, headers=headers)
            try: response = opener.open(req, timeout=15)
            except urllib.error.HTTPError as error: response = error
            return response.status, response.headers, response.read().decode('utf-8')

        for attempt in range(50):
            try:
                status, headers, body = request(admin, '/admin/index.php')
                break
            except urllib.error.URLError:
                time.sleep(.1)
        else: raise AssertionError('loopback_server_ready')
        check(status==200 and '后台登录' in body, 'admin_login_renders')
        check('no-store' in headers['Cache-Control'] and 'HttpOnly' in headers.get('Set-Cookie','') and 'SameSite=Strict' in headers.get('Set-Cookie',''), 'admin_private_session_headers')
        csrf = token(body)
        status, _, body = request(public, '/admin/index.php?view=visits')
        check(status==401 and '逐次访问' not in body, 'anonymous_visits_blocked')
        status, _, _ = request(admin, '/admin/index.php', {'action':'login','username':'admin','password':initial,'csrf':'bad'})
        check(status==403, 'admin_csrf_rejected')
        status, _, _ = request(admin, '/admin/index.php', {'action':'login','username':'admin','password':initial,'csrf':csrf}, origin='https://untrusted.invalid')
        check(status==403, 'admin_foreign_origin_rejected')
        status, headers, _ = request(admin, '/admin/index.php', {'action':'login','username':'admin','password':initial,'csrf':csrf})
        check(status==303 and headers['Location'].endswith('view=password'), 'first_login_requires_new_password')
        _, _, body = request(admin, '/admin/index.php?view=visits')
        check('设置你的后台密码' in body and '逐次访问' not in body, 'first_login_cannot_bypass_password_change')
        csrf = token(body)
        status, _, body = request(admin, '/admin/index.php', {'action':'password','current_password':initial,'new_password':'x'*73,'repeat_password':'x'*73,'csrf':csrf})
        check('新密码需12至72字节' in body, 'bcrypt_truncation_rejected')
        updated = secrets.token_urlsafe(24)
        status, _, _ = request(admin, '/admin/index.php', {'action':'password','current_password':initial,'new_password':updated,'repeat_password':updated,'csrf':csrf})
        check(status==303, 'admin_password_change')
        _, _, body = request(admin, '/admin/index.php')
        csrf = token(body)
        check('访问概览' in body and '统计暂未读取成功' not in body and '后台暂时无法' not in body, 'empty_analytics_renders')
        status, _, _ = request(public, '/api/ops-core.php')
        check(status==404, 'private_implementation_hidden')
        status, _, body = request(public, '/api/feedback.php')
        fcsrf = json.loads(body)['csrf']
        data = {'csrf':fcsrf,'request_id':secrets.token_hex(16),'phone':'13800000000','content':'测试反馈 <script>alert(1)</script>','category':'纠正错误','context':'兵部','year':1566,'consent':True}
        status, _, _ = request(public, '/api/feedback.php', dict(data,csrf='bad'), True)
        check(status==403, 'feedback_csrf_rejected')
        status, _, _ = request(public, '/api/feedback.php', data, True, origin='https://untrusted.invalid')
        check(status==403, 'feedback_foreign_origin_rejected')
        status, _, body = request(public, '/api/feedback.php', data, True)
        saved = json.loads(body)
        check(status==200 and saved.get('id'), 'feedback_http_saved')
        status, _, body = request(public, '/api/feedback.php', data, True)
        check(status==200 and json.loads(body)['id']==saved['id'], 'feedback_http_retry_deduplicated')
        _, _, body = request(admin, '/admin/index.php?view=feedback')
        check('138****0000' in body and '13800000000' not in body and '&lt;script&gt;' in body and '<script>alert' not in body, 'feedback_list_phone_masking_and_xss_escaping')
        detail = '/admin/index.php?view=feedback&id='+str(saved['id'])
        _, _, body = request(admin, detail)
        check('13800000000' in body and '1566年' in body and '测试反馈 &lt;script&gt;' in body, 'authenticated_feedback_details')
        status, _, _ = request(admin, detail, {'action':'feedback-update','id':saved['id'],'status':'reviewing','admin_note':'已核对 <标签>','csrf':csrf})
        check(status==303, 'admin_feedback_update')
        _, _, body = request(admin, '/admin/index.php?view=feedback&status=pending')
        check('处理中' in body and '测试反馈' in body, 'pending_includes_reviewing')
        with db.cursor() as q:
            q.execute(f"INSERT INTO `{prefix}visit_events` (request_id,created_at,visit_day,ip,ip_source,country,province,city,geo_status,device,browser,os,user_agent,entry_path,referrer_host) VALUES (%s,UTC_TIMESTAMP(),DATE(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR)),'127.0.0.1','remote_addr','测试国家','测试省','测试市','unknown','mobile','Chrome','Android','<script>test</script>','/','example.com')", (secrets.token_hex(16),))
        _, _, body = request(admin, '/admin/index.php?view=visits&device=mobile')
        check('测试省' in body and '127.0.0.1' in body and '&lt;script&gt;test' in body, 'visit_detail_filters_and_escaping')
        _, _, body = request(admin, '/admin/index.php?province='+urllib.parse.quote('测试省'))
        check('测试省' in body and '每日访问' in body and '统计暂未读取成功' not in body, 'analytics_queries_and_trend')
        status, _, _ = request(admin, '/admin/index.php', {'action':'logout','csrf':csrf})
        check(status==303, 'admin_logout')
        status, _, body = request(admin, detail)
        check(status==401 and '13800000000' not in body, 'logout_revokes_feedback_access')
        for _ in range(11):
            _, _, body = request(public, '/admin/index.php')
            status, _, body = request(public, '/admin/index.php', {'action':'login','username':'admin','password':'wrong','csrf':token(body)})
        check(status==429, 'login_rate_limit')
        server.terminate()
        server.wait(timeout=10)
        server = None
    receipt = {'passed':True,'checks':checks,'count':len(checks),'production_visits_added':0,'production_feedback_added':0}
    (root / 'work/ops-checks.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(receipt,ensure_ascii=False), flush=True)
except Exception as error:
    print(json.dumps({'passed':False,'checks_completed':checks,'error_type':type(error).__name__,'check':str(error) if isinstance(error,AssertionError) else None}), flush=True)
    sys.exit(1)
finally:
    if server:
        server.terminate()
        server.wait(timeout=10)
    if db:
        with db.cursor() as q:
            assert re.fullmatch(r'atlas_test_[a-f0-9]{12}_', prefix)
            for name in tables: q.execute(f'DROP TABLE IF EXISTS `{prefix}{name}`')
        db.close()
