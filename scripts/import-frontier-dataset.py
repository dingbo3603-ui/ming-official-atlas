"""Insert this spatial dataset only; no career/person rebuild or secret files."""
import getpass
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import pymysql

ROOT = Path(__file__).resolve().parents[1]
DATASET = 'ming-frontier-regions'
TABLES = ['atlas_datasets', 'atlas_people', 'atlas_tenures', 'atlas_sources', 'atlas_offices', 'atlas_years', 'atlas_eras']
data = json.loads((ROOT / 'public/data' / (DATASET + '.json')).read_text(encoding='utf-8'))
assert len(data['regions']) == 5 and sum(len(r['sites']) for r in data['regions']) == 29
body = json.dumps(data, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
password = getpass.getpass('Database password: ')

def connect():
    return pymysql.connect(host='sql.s1256.vhostgo.com', port=3306, user='dmwc1566', password=password,
        database='dmwc1566', charset='utf8mb4', connect_timeout=20, read_timeout=40, write_timeout=40)

def counts(cursor):
    result = {}
    for table in TABLES:
        cursor.execute('SELECT COUNT(*) FROM ' + table)
        result[table] = cursor.fetchone()[0]
    return result

try:
    with connect() as db:
        with db.cursor() as cursor:
            before = counts(cursor)
            cursor.execute('SELECT body FROM atlas_datasets WHERE id=%s FOR UPDATE', (DATASET,))
            prior = cursor.fetchone()
            if prior:
                assert json.loads(prior[0]) == data, 'Existing dataset differs; review before replacing it'
            else:
                (ROOT / 'work' / ('frontier-db-before-' + stamp + '.json')).write_text(
                    json.dumps({'dataset': DATASET, 'before': None, 'counts': before}), encoding='utf-8')
                cursor.execute('INSERT INTO atlas_datasets (id,body) VALUES (%s,%s)', (DATASET, body))
        db.commit()
    with connect() as db:
        with db.cursor() as cursor:
            cursor.execute('SELECT body FROM atlas_datasets WHERE id=%s', (DATASET,))
            assert json.loads(cursor.fetchone()[0]) == data
            after = counts(cursor)
    assert all(after[t] == before[t] + (1 if t == 'atlas_datasets' and not prior else 0) for t in TABLES)
    proof = {'checked_at': stamp, 'dataset': DATASET, 'mysql_fresh_readback': True,
        'canonical_sha256': hashlib.sha256(body.encode()).hexdigest(), 'before': before, 'after': after,
        'regions': len(data['regions']), 'sites': sum(len(r['sites']) for r in data['regions'])}
    (ROOT / 'work/frontier-db-receipt.json').write_text(json.dumps(proof, indent=2), encoding='utf-8')
    print(json.dumps(proof), flush=True)
except Exception as error:
    # Never print connector arguments or local values.
    print(json.dumps({'error_type': type(error).__name__, 'code': error.args[0] if error.args and isinstance(error.args[0], int) else None}), flush=True)
    raise SystemExit(1)
finally:
    password = None
