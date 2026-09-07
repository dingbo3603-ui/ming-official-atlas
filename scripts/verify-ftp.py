"""Verify published static files through public DNS and the site's HTTP host."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
import argparse
import hashlib
import http.client
import json
from pathlib import Path
import socket
import ssl
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
HOST = 'dmwc.cc'
ALLOWED_HOSTS = {HOST, 'dmwc-x-cc.img.addlink.cn'}


@lru_cache(maxsize=4)
def public_ip(host):
    url = 'https://dns.google/resolve?' + urllib.parse.urlencode({'name': host, 'type': 'A'})
    with urllib.request.urlopen(url, timeout=20) as response:
        answers = json.load(response).get('Answer', [])
    return next(answer['data'] for answer in answers if answer['type'] == 1)


def fetch(url):
    # The virtual host occasionally closes a connection before sending headers.
    # Retry read-only checks without treating an incomplete response as success.
    for attempt in range(3):
        try:
            return fetch_once(url)
        except (OSError, http.client.HTTPException):
            if attempt == 2:
                raise


def fetch_once(url):
    redirects = []
    for _ in range(4):
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme != 'http' or parsed.hostname not in ALLOWED_HOSTS or parsed.port not in (None, 80):
            raise ValueError('Unexpected redirect target')
        connection = http.client.HTTPConnection(public_ip(parsed.hostname), 80, timeout=30)
        try:
            connection.request('GET', (parsed.path or '/') + ('?' + parsed.query if parsed.query else ''), headers={
                'Host': parsed.hostname, 'Cache-Control': 'no-cache', 'Referer': 'http://dmwc.cc/'})
            response = connection.getresponse()
            data = response.read()
            status, mime, location = response.status, response.getheader('Content-Type'), response.getheader('Location')
        finally:
            connection.close()
        if status in (301, 302, 303, 307, 308) and location:
            url = urllib.parse.urljoin(url, location)
            redirects.append(url)
            continue
        return status, mime, data, redirects
    raise ValueError('Too many redirects')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--from-build', action='store_true', help='Verify the validated build over HTTP even if the final FTP audit was interrupted')
    parser.add_argument('--release')
    options = parser.parse_args()
    receipt_path = ROOT / 'work/ftp-deployment-receipt.json'
    if options.from_build:
        if not options.release:
            parser.error('--from-build requires --release')
        build = ROOT / 'dist-nas'
        receipt = {'release': options.release, 'host': 'dmwc1566.gotoftp11.com', 'remote_root': '/wwwroot',
                   'manifest_source': 'local_validated_build', 'ftp_final_readback_verified': False,
                   'files': {p.relative_to(build).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                             for p in build.rglob('*') if p.is_file()}, 'http_verified': False}
    else:
        receipt = json.loads(receipt_path.read_text())
    # IIS deliberately hides web.config; its content is verified through FTP.
    public_files = {name: digest for name, digest in receipt['files'].items() if name != 'web.config' and not name.endswith('.php')}
    public_ip(HOST)

    def check(item):
        name, expected = item
        status, mime, data, redirects = fetch('http://' + HOST + '/' + name)
        return {'file': name, 'status': status, 'mime': mime, 'redirects': redirects,
                'match': hashlib.sha256(data).hexdigest() == expected}

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(check, public_files.items()))
    status, _, data, _ = fetch('http://' + HOST + '/')
    home_ok = status == 200 and hashlib.sha256(data).hexdigest() == receipt['files']['index.html']
    config_status = fetch('http://' + HOST + '/web.config')[0]
    failures = [result for result in results if result['status'] != 200 or not result['match']]
    try:
        with socket.create_connection((public_ip(HOST), 443), timeout=15) as connection:
            with ssl.create_default_context().wrap_socket(connection, server_hostname=HOST):
                tls = {'verified': True}
    except ssl.SSLCertVerificationError as error:
        tls = {'verified': False, 'reason': error.verify_message}
    except OSError as error:
        tls = {'verified': False, 'reason': str(error)}
    api_checks = {}
    for action in ['health', 'bootstrap', 'year&year=1566', 'person&id=zhang-juzheng',
                   'year&year=1624', 'person&id=cbdb-person-10097']:
        api_status, _, body, _ = fetch('http://' + HOST + '/api/index.php?action=' + action)
        result = json.loads(body)
        api_checks[action] = api_status == 200 and 'error' not in result
        if action == 'bootstrap':
            expected = json.loads((ROOT / 'work/history-import.json').read_text(encoding='utf-8'))
            api_checks['mysql_data'] = result['storage'] == 'mysql' and len(result['people']) == len(expected['people']) and len(result['timeline_years']) == 277
        if action == 'year&year=1566':
            api_checks['1566_no_false_cabinet'] = not any(r['person_id'] == 'zhang-juzheng' and r['institution'] == '内阁' for r in result['records'])
        if action == 'year&year=1624':
            direct = next((r for r in result['records'] if r['id'] == 'cbdb-career-411666-71149'), {})
            api_checks['direct_right_deputy_binding'] = direct.get('office_ids') == ['official-0136-right']
        if action == 'person&id=cbdb-person-10097':
            person = result['person']
            api_checks['normal_career_summary_with_source_retained'] = person['summary'].startswith('履历：') and person['source_summary'].startswith('CBDB收录')
    private_status = fetch('http://' + HOST + '/others/dmwc-history/config.php')[0]
    api_checks['private_config_inaccessible'] = private_status in (403,404)
    counter_status, _, counter_body, _ = fetch('http://' + HOST + '/api/visits.php')
    counter = json.loads(counter_body)
    api_checks['visit_counter_read_only'] = (counter_status == 200
        and type(counter.get('total')) is int and type(counter.get('today')) is int
        and counter['total'] >= counter['today'] >= 0
        and isinstance(counter.get('since'), str) and len(counter['since']) == 10
        and counter.get('counted') is False)
    api_checks['visit_store_not_public'] = fetch('http://' + HOST + '/api/visit-store.php')[0] == 404
    api_checks['ops_implementation_not_public'] = fetch('http://' + HOST + '/api/ops-core.php')[0] == 404
    api_checks['admin_private_config_inaccessible'] = fetch('http://' + HOST + '/others/dmwc-admin/config.php')[0] in (403,404)
    api_checks['admin_requires_https'] = fetch('http://' + HOST + '/admin/index.php')[0] == 426
    api_checks['feedback_requires_https'] = fetch('http://' + HOST + '/api/feedback.php')[0] == 426
    ok = home_ok and not failures and config_status in (403, 404) and all(api_checks.values())
    receipt.update({'http_url': 'http://dmwc.cc/', 'http_verified': ok,
                    'http_transport': 'Public DNS address with the original HTTP Host header',
                    'http_ip': public_ip(HOST), 'http_root_verified': home_ok,
                    'http_results': results, 'config_not_public': config_status in (403, 404), 'api_checks':api_checks,
                    'visit_counter_snapshot': counter, 'https': tls})
    receipt_path.write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    print(json.dumps({'http_verified': ok, 'public_files': len(results),
                      'home_ok': home_ok, 'failures': failures, 'api_checks':api_checks, 'https': tls}))
    if not ok:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
