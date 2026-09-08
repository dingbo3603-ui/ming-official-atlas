"""Apply the reviewed high-five gap ledger with optimistic per-record guards."""
import copy
import hashlib
import json


def digest(row):
    return hashlib.sha256(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def apply_high5_gapfill(history, research):
    bundle = json.loads((research / 'high5-gapfill-20260908.json').read_text(encoding='utf-8'))
    records = {r['id']: r for r in history['tenures']}
    people = {p['id']: p for p in history['people']}
    sources = {s['id']: s for s in history['sources']}
    for source in bundle['sources']:
        if source['id'] in sources:
            assert sources[source['id']] == source
        sources[source['id']] = copy.deepcopy(source)
    for person in bundle['people']:
        assert person['id'] not in people, person['id']
        people[person['id']] = copy.deepcopy(person)
    for patch in bundle['record_patches']:
        row = records[patch['id']]
        assert digest(row) == patch['before_sha256'], ('High-five baseline changed', row['id'])
        before = copy.deepcopy(row)
        row.update(copy.deepcopy(patch['set']))
        row['office_ids'] = sorted(set(before.get('office_ids', []) + row.get('office_ids', [])))
        row['source_ids'] = sorted(set(before['source_ids'] + row.get('source_ids', [])))
        # Corrected normalized fields retain the exact previous publication.
        if patch.get('corrected_fields'):
            row.setdefault('source_record_versions', []).append(before)
    for row in bundle['tenures']:
        assert row['id'] not in records, row['id']
        records[row['id']] = copy.deepcopy(row)
    affected = {records[p['id']]['person_id'] for p in bundle['record_patches']}
    affected.update(r['person_id'] for r in bundle['tenures'])
    career_ids = {pid: [] for pid in affected}
    for record in records.values():
        if record['person_id'] in affected:
            p = people[record['person_id']]
            p['source_ids'] = sorted(set(p.get('source_ids', []) + record['source_ids']))
            career_ids[p['id']].append(record['id'])
    for pid in affected:
        if 'career_record_ids' in people[pid]:
            people[pid]['career_record_ids'] = career_ids[pid]
    history['people'] = list(people.values())
    history['sources'] = list(sources.values())
    history['tenures'] = list(records.values())
    history['meta']['high5_gapfill_20260908'] = bundle['summary']
