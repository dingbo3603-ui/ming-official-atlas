"""Reproducible all-Ming rank-five-and-higher office coverage, not yearly vacancies."""
import argparse
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGGREGATES = {'official-0002', 'official-0003', 'official-0004', 'official-0005',
              'official-0125', 'official-0126', 'official-0172'}
DUPLICATES = {'official-0236': 'official-0422', 'official-0237': 'official-0423',
              'official-0420': 'official-0417', 'official-0552': 'official-0417'}


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def counts(data):
    result = defaultdict(list)
    for row in data['tenures']:
        for oid in row.get('office_ids', []):
            result[oid].append(row)
    return result


def audit(before, after):
    old, current = counts(before), counts(after)
    people = {p['id']: p['name'] for p in after['people']}
    index = before['datasets']['office-evidence-index']['offices']
    rows = []
    for office in before['offices']:
        if not re.match(r'^[正从][一二三四五]品', office.get('rank') or ''):
            continue
        oid = office['record_id']
        if old[oid]:
            continue
        names = sorted({people[r['person_id']] for r in current[oid]})
        kind = ('合并参考条目' if oid in AGGREGATES else '重复目录条目' if oid in DUPLICATES
                else '旧制或特定时期职位' if office.get('historical_only') or '旧制' in office['rank']
                else '独立职位')
        rows.append({'id': oid, 'institution': office['institution'], 'department': office.get('department'),
                     'title': office['title'], 'rank': office['rank'], 'kind': kind,
                     'duplicate_of': DUPLICATES.get(oid), 'related_people_before': len(index.get(oid, {}).get('related', [])),
                     'records_after': len(current[oid]), 'people_after': len({r['person_id'] for r in current[oid]}),
                     'people_examples': names[:8], 'record_ids_after': [r['id'] for r in current[oid]],
                     'result': '已补关联或新记载' if current[oid] else '合并项，查拆分职位' if oid in AGGREGATES
                     else '重复收录，查规范条目' if oid in DUPLICATES else '本轮仍未找到可直接对应的记载'})
    embedded = [{'id': o['record_id'], 'title': o['title'], 'rank': o['rank'], 'records': len(current[o['record_id']])}
                for o in before['offices'] if re.search(r'[正从][一二三四五]品', o.get('rank') or '')
                and not re.match(r'^[正从][一二三四五]品', o.get('rank') or '')]
    return {'scope': '1368—1644年目录中尚无任何已绑定履历的五品及以上条目；不是单年缺任统计。',
            'rank_rule': '正一品至从五品，按目录显式本秩；兼差/否定语句另列，不凭字符串出现品级当实秩。',
            'summary': {'high5_catalog_rows': sum(bool(re.match(r'^[正从][一二三四五]品', o.get('rank') or '')) for o in before['offices']),
                        'initial_zero_rows': len(rows), 'filled_rows': sum(bool(r['records_after']) for r in rows),
                        'aggregate_rows': len(AGGREGATES), 'duplicate_rows': sum(r['id'] in DUPLICATES for r in rows),
                        'remaining_independent_rows': sum(not r['records_after'] and r['id'] not in AGGREGATES | DUPLICATES.keys() for r in rows)},
            'rows': rows, 'conditional_or_duty_entries': embedded}


def write_report(result, output):
    output.with_suffix('.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    s = result['summary']
    lines = ['# 五品及以上官职人物缺口与补录结果', '', '审计日期：2026-09-08。', '', result['scope'], '',
             f"共 {s['high5_catalog_rows']} 条五品及以上目录项，补录前 {s['initial_zero_rows']} 条没有绑定任何履历。",
             f"本轮补到 {s['filled_rows']} 条；除合并、重复参考条目外，仍有 {s['remaining_independent_rows']} 条未找到可直接对应的记载。", '',
             '“已补”表示至少找到一条可关联人物记载，不表示历任名单或每年任职已齐全。未知任期继续留空；赠官、未赴任与实际任职分开。', '',
             '## 补录前全部缺口及本轮结果', '', '| 机构 / 分司 | 职位 | 品级 | 条目性质 | 本轮结果 | 人物举例 |',
             '|---|---|---|---|---|---|']
    for r in result['rows']:
        label = r['department'] or r['institution']
        if r['institution'] not in label:
            label = r['institution'] + '·' + label
        outcome = f"{r['records_after']} 条记载 / {r['people_after']} 人" if r['records_after'] else r['result']
        lines.append(f"| {label} | {r['title']}（`{r['id']}`） | {r['rank']} | {r['kind']} | {outcome} | {'、'.join(r['people_examples']) or '—'} |")
    lines += ['', '## 兼差及条件品级，另行核对', '', '| 职位 | 目录品级说明 | 已关联记载 |', '|---|---|---|']
    for r in result['conditional_or_duty_entries']:
        lines.append(f"| {r['title']}（`{r['id']}`） | {r['rank']} | {r['records']} |")
    lines += ['', '本轮逐条依据、保留的原始键与隔离原因见同目录 `high5-gapfill-20260908.json`。原典新记载分别保留来源链接；原库关联保留 CBDB 发布版本、来源书名和定位，不根据影视或小说填入。', '']
    output.with_suffix('.md').write_text('\n'.join(lines), encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--before', default=str(ROOT / 'work/history-before-high5-gapfill-20260908.json'))
    parser.add_argument('--after', default=str(ROOT / 'work/history-import.json'))
    args = parser.parse_args()
    result = audit(read(args.before), read(args.after))
    write_report(result, ROOT / 'research/history/high5-gaps-20260908')
    print(json.dumps(result['summary'], ensure_ascii=False))
