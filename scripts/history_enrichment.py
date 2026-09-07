"""Apply reviewed additions after the frozen source bundles and corrections."""
import copy
import json


def apply_enrichment(history, research):
    path = research / 'history-enrichment-20260907.json'
    if not path.exists():
        return
    bundle = json.loads(path.read_text(encoding='utf-8'))
    people = {row['id']: row for row in history['people']}
    records = {row['id']: row for row in history['tenures']}
    sources = {row['id']: row for row in history['sources']}
    sources.update({row['id']: row for row in bundle['sources']})
    for row in bundle['people']:
        assert row['id'] not in people, ('duplicate enrichment person', row['id'])
        people[row['id']] = copy.deepcopy(row)
    for patch in bundle['record_patches']:
        row = records[patch['id']]
        for key, expected in patch.get('expect', {}).items():
            assert row.get(key) == expected, ('research baseline changed', row['id'], key)
        row.update(copy.deepcopy(patch['set']))
    for row in bundle['tenures']:
        assert row['id'] not in records, ('duplicate enrichment record', row['id'])
        records[row['id']] = copy.deepcopy(row)
    # A corrected reading retains the original record inside its replacement's
    # provenance. Conflicting raw dates must not remain a second annual tenure.
    for retirement in bundle.get('record_retirements', []):
        old = records.pop(retirement['id'])
        assert old['person_id'] == retirement['person_id']
        original = retirement['original_record']
        assert old.get('cbdb') == original.get('cbdb'), ('raw source changed', old['id'])
        for replacement_id in retirement['replacement_ids']:
            replacement = records[replacement_id]
            assert replacement['person_id'] == old['person_id']
            replacement.setdefault('source_record_versions', []).append(copy.deepcopy(original))
            replacement['source_ids'] = sorted(set(replacement['source_ids'] + old['source_ids']))
    for merge in bundle.get('person_merges', []):
        old = people.pop(merge['from_id'])
        target = people[merge['to_id']]
        target['source_ids'] = sorted(set(target['source_ids'] + old['source_ids'] + merge['source_ids']))
        target['aliases'] = sorted(set(target.get('aliases', []) + old.get('aliases', []) + [old['name']]))
        target.setdefault('identity_corrections', []).append(copy.deepcopy(merge))
        if not merge.get('rejected_cbdb_person_ids'):
            target.setdefault('merged_profile_sources', []).append(copy.deepcopy(old))
        for row in records.values():
            if row['person_id'] == old['id']:
                row['person_id'] = target['id']
        for item in history.get('cabinet_year_coverage', []):
            for key in ['member_ids', 'chief_ids']:
                item[key] = list(dict.fromkeys(target['id'] if p == old['id'] else p for p in item[key]))
    for patch in bundle.get('person_patches', []):
        target = people[patch['id']]
        target.update(copy.deepcopy(patch['set']))
        target['source_ids'] = sorted(set(target['source_ids'] + patch.get('append_source_ids', [])))
    affected_people = {row['person_id'] for row in bundle['tenures']}
    affected_people.update(records[p['id']]['person_id'] for p in bundle['record_patches'] if p['id'] in records)
    affected_people.update(m['to_id'] for m in bundle.get('person_merges', []))
    for row in records.values():
        if row['person_id'] not in affected_people:
            continue
        person = people[row['person_id']]
        person['source_ids'] = sorted(set(person.get('source_ids', []) + row['source_ids']))
    for person_id in affected_people & set(people):
        if 'career_record_ids' in people[person_id]:
            people[person_id]['career_record_ids'] = [row['id'] for row in records.values() if row['person_id'] == person_id]
    history['people'] = list(people.values())
    history['tenures'] = list(records.values())
    history['sources'] = list(sources.values())
    history['meta']['enrichment_20260907'] = bundle['meta']['summary']
