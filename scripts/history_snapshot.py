"""Publish compact read snapshots from committed MySQL rows, never from seed input."""
import hashlib
import json
import re
import shutil
from collections import defaultdict


def export_snapshot(connection, root):
    def read(table):
        with connection.cursor() as cursor:
            cursor.execute('SELECT body FROM ' + table)
            return [json.loads(row[0]) for row in cursor.fetchall()]
    people, records, sources, eras = [read(table) for table in
        ['atlas_people', 'atlas_tenures', 'atlas_sources', 'atlas_eras']]
    with connection.cursor() as cursor:
        cursor.execute('SELECT id,body FROM atlas_datasets')
        datasets = {row[0]: json.loads(row[1]) for row in cursor.fetchall()}
    encode = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    revision = hashlib.sha256(encode([people, records, datasets])).hexdigest()[:16]
    (root / 'lib/history-revision.ts').write_text("// Generated from the committed MySQL snapshot.\nexport const HISTORY_REVISION = '" + revision + "';\n",encoding='utf-8')
    directory = root / 'public/api/snapshots' / revision
    def save(name, value):
        path = directory / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(encode(value))
    def project(row, fields):
        return {key: row[key] for key in fields if key in row}
    fields = ['id','person_id','office_title','institution','start_year','end_year','attested_year',
              'date_note','status','record_kind','record_role','office_ids','institution_ids','source_ids','duty_title','review_status','local_scope','catalog_only_office_ids']
    search_terms = defaultdict(set)
    for row in records:
        search_terms[row['person_id']].update(filter(None,[row.get('office_title'),row.get('institution')]))
    compact_people = [dict(project(row, ['id','name','birth_year','death_year','summary','review_status']),
        search_terms=' '.join(sorted(search_terms[row['id']] | set(row.get('aliases',[]))))) for row in people]
    bootstrap = dict(datasets['history-meta'], people=compact_people, sources=sources, eras=eras,
                     office_count=len(datasets['office-catalog']['officials']), tenure_count=len(records),
                     storage='mysql', revision=revision)
    save('bootstrap.json', bootstrap)
    for year in range(1368, 1645):
        current = []
        for row in records:
            start, end = row.get('start_year'), row.get('end_year')
            if not ((start is not None and end is not None and start <= year <= end)
                    or row.get('attested_year') == year
                    or (start == year and end is None) or (end == year and start is None)):
                continue
            item = project(row, fields)
            item['office_ids'] = sorted(set(row.get('office_ids', []) + row.get('year_office_ids', {}).get(str(year), [])))
            # Full provenance remains in the person response and MySQL.
            if len(item.get('date_note') or '') > 450:
                item['date_note'] = item['date_note'][:450] + '…（完整记载见人物仕履）'
            current.append(item)
        save('years/' + str(year) + '.json', {'year': year, 'records': current, 'storage': 'mysql', 'revision': revision})
    careers = defaultdict(list)
    for row in records:
        careers[row['person_id']].append(row)
    shards = defaultdict(dict)
    for row in people:
        key_value = 0x811c9dc5
        for byte in row['id'].encode('ascii'):
            key_value = ((key_value ^ byte) * 0x01000193) & 0xffffffff
        key = format(key_value, '08x')[-2:]
        shards[key][row['id']] = {'person': row, 'records': careers[row['id']], 'revision': revision}
    for key, value in shards.items():
        save('people/' + key + '.json', value)
    for name, value in datasets.items():
        save('datasets/' + name + '.json', value)
    manifest = {'revision': revision, 'people': len(people), 'records': len(records), 'storage': 'mysql'}
    (root / 'public/api/snapshots/manifest.json').write_bytes(encode(manifest))
    snapshot_root = (root / 'public/api/snapshots').resolve()
    for previous in snapshot_root.iterdir():
        if previous.is_dir() and re.fullmatch('[a-f0-9]{16}', previous.name) and previous.name != revision:
            assert previous.resolve().parent == snapshot_root
            shutil.rmtree(previous)
    print(json.dumps({'snapshot': manifest, 'bootstrap_bytes': len(encode(bootstrap))}), flush=True)
