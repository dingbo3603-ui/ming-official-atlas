"""Idempotent, namespaced MySQL import with a backup before existing data changes."""
import json
from datetime import datetime, timezone

TABLES = ['atlas_datasets', 'atlas_sources', 'atlas_people', 'atlas_eras', 'atlas_years', 'atlas_offices', 'atlas_tenures']

def import_history(connection, root):
    data = json.loads((root / 'work/history-import.json').read_text(encoding='utf-8'))
    encode = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':'))
    with connection.cursor() as cursor:
        cursor.execute('SHOW TABLES')
        existing = {row[0] for row in cursor.fetchall()} & set(TABLES)
        if existing:
            backup = {}
            for table in sorted(existing):
                cursor.execute('SELECT * FROM ' + table)
                columns = [col[0] for col in cursor.description]
                backup[table] = [dict(zip(columns, row)) for row in cursor.fetchall()]
            stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
            (root / 'work' / ('history-db-backup-' + stamp + '.json')).write_text(encode(backup), encoding='utf-8')
        definitions = {
            'atlas_datasets': 'id VARCHAR(100) PRIMARY KEY, body JSON NOT NULL',
            'atlas_sources': 'id VARCHAR(100) PRIMARY KEY, body JSON NOT NULL',
            'atlas_people': 'id VARCHAR(100) PRIMARY KEY, name VARCHAR(100) NOT NULL, body JSON NOT NULL',
            'atlas_eras': 'id VARCHAR(100) PRIMARY KEY, start_year SMALLINT NOT NULL, body JSON NOT NULL',
            'atlas_years': 'year SMALLINT PRIMARY KEY, body JSON NOT NULL',
            'atlas_offices': 'id VARCHAR(100) PRIMARY KEY, body JSON NOT NULL',
            'atlas_tenures': '''id VARCHAR(100) PRIMARY KEY, person_id VARCHAR(100) NOT NULL,
                office_title VARCHAR(255) NOT NULL, institution VARCHAR(255) NOT NULL,
                start_year SMALLINT NULL, end_year SMALLINT NULL, attested_year SMALLINT NULL,
                body JSON NOT NULL, INDEX tenure_year (start_year,end_year), INDEX attestation (attested_year),
                INDEX person_career (person_id), FOREIGN KEY (person_id) REFERENCES atlas_people(id)''',
        }
        for table, definition in definitions.items():
            cursor.execute('CREATE TABLE IF NOT EXISTS ' + table + ' (' + definition + ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci')
        def upsert(table, columns, rows):
            placeholders = ','.join(['%s'] * len(columns))
            updates = ','.join(col + '=VALUES(' + col + ')' for col in columns[1:])
            cursor.executemany('INSERT INTO ' + table + ' (' + ','.join(columns) + ') VALUES (' + placeholders + ') ON DUPLICATE KEY UPDATE ' + updates, rows)
        upsert('atlas_datasets', ['id','body'], [(key,encode(value)) for key,value in data['datasets'].items()])
        upsert('atlas_sources', ['id','body'], [(row['id'],encode(row)) for row in data['sources']])
        upsert('atlas_people', ['id','name','body'], [(row['id'],row['name'],encode(row)) for row in data['people']])
        upsert('atlas_eras', ['id','start_year','body'], [(row['id'],row['start_year'],encode(row)) for row in data['eras']])
        upsert('atlas_years', ['year','body'], [(row['year'],encode(row)) for row in data['timeline_years']])
        upsert('atlas_offices', ['id','body'], [(row['record_id'],encode(row)) for row in data['offices']])
        columns = ['id','person_id','office_title','institution','start_year','end_year','attested_year','body']
        upsert('atlas_tenures', columns, [tuple(row[col] for col in columns[:-1]) + (encode(row),) for row in data['tenures']])
        # atlas_* tables are the reviewed snapshot, not an independent editing store.
        # Retire superseded rows only after the full previous snapshot was backed up.
        expected = {
            'atlas_tenures': [r['id'] for r in data['tenures']],
            'atlas_people': [r['id'] for r in data['people']],
            'atlas_sources': [r['id'] for r in data['sources']],
            'atlas_eras': [r['id'] for r in data['eras']],
            'atlas_years': [r['year'] for r in data['timeline_years']],
            'atlas_offices': [r['record_id'] for r in data['offices']],
            'atlas_datasets': list(data['datasets']),
        }
        for table, ids in expected.items():
            assert ids, 'Refusing to clear a dataset from empty input'
            key = 'year' if table == 'atlas_years' else 'id'
            cursor.execute('DELETE FROM ' + table + ' WHERE ' + key + ' NOT IN (' + ','.join(['%s']*len(ids)) + ')', ids)
            cursor.execute('SELECT ' + key + ' FROM ' + table)
            assert {r[0] for r in cursor.fetchall()} == set(ids)
    connection.commit()
    counts = {}
    with connection.cursor() as cursor:
        for table in TABLES:
            cursor.execute('SELECT COUNT(*) FROM ' + table)
            counts[table] = cursor.fetchone()[0]
        cursor.execute('SELECT body FROM atlas_tenures WHERE (start_year<=1566 AND end_year>=1566) OR attested_year=1566')
        rows = [json.loads(row[0]) for row in cursor.fetchall()]
        assert not any(row['person_id'] in ['hu-zongxian','yan-shifan','yan-song'] and row['record_kind'] != 'event' for row in rows)
        assert not any(row['person_id'] == 'zhang-juzheng' and '内阁' in row['institution'] for row in rows)
        cursor.execute('SELECT body FROM atlas_people WHERE id=%s', ('zhang-juzheng',))
        assert json.loads(cursor.fetchone()[0])['name'] == '张居正'
    receipt = {'storage': 'mysql', 'counts': counts, 'year_1566_records': len(rows), 'readback_verified': True}
    (root / 'work/history-db-receipt.json').write_text(encode(receipt), encoding='utf-8')
    print(encode(receipt), flush=True)
    from history_snapshot import export_snapshot
    export_snapshot(connection, root)
