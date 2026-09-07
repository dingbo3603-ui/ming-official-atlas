"""Assemble reviewed research and office data; no network or credentials."""
import json
import re
import shutil
from pathlib import Path
from history_model import split_offices, split_references, apply_memberships, annotate_names, INSTITUTIONS

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT.parent / 'ming-official-atlas-assets'
RESEARCH = ROOT / 'research/history'
RESEARCH.mkdir(parents=True, exist_ok=True)
for name in ['history-1566-people.json', 'history-ministers-1566.json', 'history-eras-sili.json',
             'history-normalized.json', 'history-office-mapping.json', 'history-emperors-enrichment.json',
             'history-high-officials-1566.json', 'history-high-officials-1566-mapping.json',
             'high-officials-1566-extra.json', 'history-institution-periods.json']:
    shutil.copyfile(ASSETS / name, RESEARCH / name)

def read(path):
    return json.loads(path.read_text(encoding='utf-8'))

history = read(RESEARCH / 'history-normalized.json')
# Preserve reviewed biographical fields when a research index supplements the same person.
def merge_bundle(bundle):
    for group in ['people', 'sources', 'tenures']:
        existing = {row['id']: row for row in history[group]}
        for row in bundle.get(group, []):
            if row['id'] not in existing:
                history[group].append(row)
                existing[row['id']] = row
            elif group == 'people':
                old = existing[row['id']]
                old['source_ids'] = sorted(set(old.get('source_ids', []) + row.get('source_ids', [])))
                if row.get('cbdb'):
                    old['cbdb'] = row['cbdb']
for name in ['history-high-officials-1566.json', 'high-officials-1566-extra.json']:
    merge_bundle(read(RESEARCH / name))
cbdb_path = ASSETS / 'cbdb/ming-high5-layered-increment.json'
if cbdb_path.exists():
    shutil.copyfile(cbdb_path, RESEARCH / cbdb_path.name)
    merge_bundle(read(RESEARCH / cbdb_path.name))
periods = read(RESEARCH / 'history-institution-periods.json')
merge_bundle({'sources': periods['sources'], 'tenures': periods['new_records']})
enriched_data = read(RESEARCH / 'history-emperors-enrichment.json')
enriched = {row['id']: row for row in (enriched_data if isinstance(enriched_data, list) else enriched_data['people'])}
for person in history['people']:
    if person['id'] in enriched:
        old_sources = person['source_ids']
        person.update(enriched[person['id']])
        person['source_ids'] = sorted(set(old_sources + person['source_ids']))
    if person.get('summary'):
        person['summary'] = person['summary'].replace('本批', '现有资料')
by_tenure = {row['id']: row for row in history['tenures']}
for patch in periods['record_patches']:
    by_tenure[patch['id']].update(patch)
for mapping in read(RESEARCH / 'history-high-officials-1566-mapping.json')['mappings']:
    by_tenure[mapping['tenure_id']].update({key: mapping[key] for key in ['office_ids', 'mapping_note']})
aliases = history['meta']['tenure_id_aliases']
for mapping in read(RESEARCH / 'history-office-mapping.json')['mappings']:
    prefix = 'people-' if mapping['bundle'] == 'history-1566-people.json' else 'ministers-'
    key = prefix + mapping['tenure_id']
    row = by_tenure[aliases.get(key, key)]
    row['office_ids'] = sorted(set(row.get('office_ids', []) + mapping['office_ids']))
    row['mapping_note'] = mapping['mapping_note']
    if mapping.get('snapshot_1566_office_ids'):
        row['year_office_ids'] = {'1566': mapping['snapshot_1566_office_ids']}
for patch in periods['record_patches']:
    by_tenure[patch['id']].update(patch)
for row in history['tenures']:
    row.setdefault('office_ids', [])
    # Keep raw research in provenance while rendering readable historical notes.
    row['date_note'] = '\n'.join(line for line in row['date_note'].splitlines()
        if not line.startswith(('年界依据：', '日期精度：', '资料完整度：', '筛选规则：')))
    row['date_note'] = re.sub(r'补充来源包 \w+ 原说明：', '补充史料：', row['date_note'])
    row['date_note'] = row['date_note'].replace('approximate', '约略，仍待核实').replace('本批', '现有资料').replace('本次取得', '现已取得')
    if row['institution'] == '皇帝' or row['office_title'] == '皇帝':
        row['office_ids'] = ['history-emperor']
    # Specific eunuch duties require explicit evidence, never a generic court presence.
    if row['institution'] == '司礼监' and row['record_kind'] != 'event':
        for office in history['sili_offices']:
            if row['office_title'] == office['name']:
                row['office_ids'] = [office['id']]

raw = read(ROOT / 'public/data/ming-officials.json')['officials']
local = read(ROOT / 'public/data/ming-local-supplements.json')
audit = read(ROOT / 'public/data/ming-official-rank-audit.json')['records']
by_office = {row['record_id']: row for row in raw + local}
offices = []
for review in audit:
    row = by_office.get(review['record_id'], {
        'record_id': review['record_id'], 'institution': review['institution'], 'title': review['title'],
        'department': review.get('department'), 'headcount': None, 'duty_notes': review['note'],
        'sources': [{'sheet': '据原典补录', 'row': 0, 'range': review['institution'], 'region': '职制'}],
        'uncertainty_flags': []}).copy()
    for field in ['title', 'institution', 'department']:
        row[field] = review.get('verified_' + field) or row.get(field)
    row['rank'] = '待核' if review['status'] == 'unresolved' else review.get('display_rank') or review['verified_rank']
    row['rank_review'] = review
    offices.append(row)
offices.append({'record_id': 'history-emperor', 'institution': '皇帝', 'title': '皇帝', 'rank': '君主身份，非官品',
    'headcount': None, 'department': None, 'duty_notes': '帝位交接按实际记载保留到年及原旧历日期。',
    'sources': [], 'uncertainty_flags': []})
offices.append({'record_id': 'history-cabinet-service', 'institution': '内阁', 'title': '内阁阁臣与首辅',
    'rank': '首辅为职事，本衔另考', 'headcount': None, 'department': '内阁',
    'duty_notes': '辅政职事与殿阁官衔分开记录；首辅不固定对应某一种殿阁大学士。',
    'sources': [], 'uncertainty_flags': []})
for item in history['sili_offices']:
    offices.append({'record_id': item['id'], 'institution': '司礼监', 'title': item['name'],
        'rank': item.get('rank') or '职事名称，本品另考', 'headcount': str(item['count']) if item.get('count') else None,
        'department': '内廷', 'duty_notes': item.get('rank_note') or item.get('chronology_basis') or '具体职事与沿革见司礼监专页。',
        'sources': [], 'uncertainty_flags': [], 'history_definition': item})

offices, pairs = split_offices(offices)
annotate_names(offices)
apply_memberships(history, pairs)
mapping_path = ASSETS / 'cbdb/high5-office-mappings.json'
if mapping_path.exists():
    shutil.copyfile(mapping_path, RESEARCH / mapping_path.name)
    cbdb_mapping = read(mapping_path)
    for mapping in cbdb_mapping['mappings']:
        row = by_tenure[mapping['tenure_id']]
        row['office_ids'] = mapping['office_ids']
        row['mapping_note'] = mapping['mapping_note']
        row['institution_ids'] = [INSTITUTIONS[mapping['institution']]] if mapping['institution'] in INSTITUTIONS else []
    for patch in cbdb_mapping['record_patches']:
        by_tenure[patch['id']].update(patch)
for relative in ['cbdb/cabinet-duty-corrections.json', 'history-zhang-cbdb-corrections.json']:
    patch_path = ASSETS / relative
    shutil.copyfile(patch_path, RESEARCH / patch_path.name)
    corrections = read(patch_path)
    merge_bundle({'sources': corrections.get('sources', [])})
    for patch in corrections['record_patches']:
        by_tenure[patch['id']].update(patch)
from history_expansions import apply_expansions
apply_expansions(history, ASSETS, RESEARCH)
from history_enrichment import apply_enrichment
apply_enrichment(history, RESEARCH)
from history_direct_links import apply_direct_links
direct_links = apply_direct_links(history, offices, cbdb_mapping['mappings'] if mapping_path.exists() else [])
(ROOT / 'work/history-direct-links.json').write_text(json.dumps(direct_links, ensure_ascii=False, indent=2), encoding='utf-8')

office_ids = {row['record_id'] for row in offices}
people_ids = {row['id'] for row in history['people']}
source_ids = {row['id'] for row in history['sources']}
assert len(office_ids) == len(offices)
for row in history['tenures']:
    assert row['person_id'] in people_ids
    assert set(row['source_ids']) <= source_ids
    assert set(row['office_ids']) <= office_ids
    assert not (row['start_year'] and row['end_year'] and row['start_year'] > row['end_year'])
for group in ['people', 'tenures', 'sources']:
    assert len({row['id'] for row in history[group]}) == len(history[group])
    assert all(re.fullmatch('[a-z0-9-]{1,100}', row['id']) for row in history[group])
assert [row['year'] for row in history['timeline_years']] == list(range(1368, 1645))

datasets = {path.stem: read(path) for path in (ROOT / 'public/data').glob('*.json')}
for name in ['ming-central-hierarchy', 'ming-ministry-branches']:
    datasets[name] = split_references(datasets[name], pairs)
datasets['office-catalog'] = {'officials': offices}
meta = {key: value for key, value in history['meta'].items() if key not in ['provenance', 'tenure_id_aliases', 'person_id_aliases']}
datasets['history-meta'] = {'timeline_years': history['timeline_years'], 'sili_offices': history['sili_offices'],
    'institution_periods': periods['institutions'],
    'empty_slots_evidence': history.get('empty_slots_evidence', []),
    'cabinet_year_coverage': history.get('cabinet_year_coverage', []),
    'meta': meta, 'scope': meta['scope'], 'default_year': 1566,
    'coverage_note': '时间轴覆盖1368—1644年（止于北京明廷，南明未纳入）。目前为有据人物资料库，尚非全部官职逐年任职全集；无记录表示待考，不表示空缺。'}
history['offices'] = offices
history['datasets'] = datasets
out = ROOT / 'work/history-import.json'
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(history, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(json.dumps({key: len(history[key]) for key in ['people', 'sources', 'tenures', 'eras', 'timeline_years', 'offices', 'datasets']}))
