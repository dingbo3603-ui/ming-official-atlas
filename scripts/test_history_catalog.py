"""Office coverage and evidence boundaries for the sourced catalog expansion."""
import json
import unittest
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
read = lambda path: json.loads(path.read_text(encoding='utf-8'))
DATA = read(ROOT / 'work/history-import.json')
OFFICES = {o['record_id']:o for o in DATA['offices']}
RECORDS = {r['id']:r for r in DATA['tenures']}
PEOPLE = {p['id'] for p in DATA['people']}
RESEARCH = ROOT / 'research/history'
MINISTRIES = read(RESEARCH / 'ministry-office-gaps-20260907.json')
COMPOUNDS = read(RESEARCH / 'compound-office-gaps-20260907.json')


class CatalogExpansionTests(unittest.TestCase):
    def test_new_definitions_have_sources_and_distinguish_duty_from_rank(self):
        added = [o for o in OFFICES.values() if o.get('catalog_kind')]
        self.assertEqual(len(added),112)
        self.assertEqual(len(OFFICES),749)
        sources={s['id'] for s in DATA['sources']}
        for office in added:
            self.assertTrue(set(office['catalog_source_ids'])<=sources)
            self.assertTrue(office['rank_review']['source_url'].startswith('https://'))
            self.assertTrue(office['rank_review']['evidence'])
            self.assertTrue(office['duty_notes'])
        for oid in ['office-gap-east-zhangban','office-gap-east-lingban','office-gap-east-sifang']:
            self.assertIn('未见独立品级',OFFICES[oid]['rank'])

    def test_all_42_divisions_have_three_distinct_office_types(self):
        divisions = [b for m in DATA['datasets']['ming-ministry-branches']['ministries']
                     for b in m['branches'] if b['kind']=='qinglisi']
        self.assertEqual(len(divisions),42)
        identifiers=[]
        for branch in divisions:
            self.assertEqual(len(branch['record_ids']),3,branch['name'])
            self.assertFalse(branch.get('shared_record_ids'))
            self.assertFalse(branch.get('unmapped_roles'))
            titles={OFFICES[oid]['title']:OFFICES[oid]['rank'] for oid in branch['record_ids']}
            self.assertEqual(titles,{'郎中':'正五品','员外郎':'从五品','主事':'正六品'},branch['name'])
            identifiers.extend(branch['record_ids'])
        self.assertEqual(len(set(identifiers)),126)

    def test_generic_division_evidence_is_not_copied_to_named_divisions(self):
        retained={r['record_id'] for r in MINISTRIES['retained_ambiguous_records']}
        self.assertEqual(len(retained),9)
        visible=set()
        for ministry in DATA['datasets']['ming-ministry-branches']['ministries']:
            for branch in ministry['branches']:
                if branch['kind']=='qinglisi': self.assertFalse(retained & set(branch['record_ids']))
                if branch['kind']=='evidence_group': visible.update(branch['record_ids'])
        self.assertEqual(retained,visible)
        for oid in retained: self.assertTrue(OFFICES[oid]['unassigned_branch'])

    def test_sourced_exact_links_keep_honorary_roles_and_quarantine(self):
        quarantine={r['tenure_id'] for r in COMPOUNDS['person_link_quarantine']}
        added=[r for r in RECORDS.values() if r.get('catalog_link_basis')]
        self.assertEqual(len(added),1077)
        self.assertFalse(quarantine & {r['id'] for r in added})
        honors=[r for r in added if r['office_ids'][0].startswith('supplement-honor-')]
        self.assertTrue(honors)
        for row in honors:
            self.assertEqual(row['record_kind'],'event')
            self.assertIn(row['record_role'],['honorary_title','posthumous_or_honorary'])
        for row in added:
            if row['office_ids'][0] in {r['record_id'] for r in MINISTRIES['new_offices']}:
                self.assertIn(OFFICES[row['office_ids'][0]]['institution_id'],row['institution_ids'])
        for suffix in ('04','11','12','13'):
            self.assertEqual(RECORDS['core-primary-20260907-'+suffix]['office_ids'],['official-0524'])
        self.assertEqual(RECORDS['core-primary-20260907-11']['record_role'],'concurrent_title_or_duty')

    def test_evidence_index_has_resolvable_people_without_expanding_years(self):
        index=DATA['datasets']['office-evidence-index']
        institutions={o['institution_id'] for o in OFFICES.values()}
        for kind,valid in [('offices',set(OFFICES)),('institutions',institutions)]:
            self.assertTrue(set(index[kind])<=valid)
            for buckets in index[kind].values():
                for ids in buckets.values():
                    self.assertEqual(ids,sorted(set(ids)))
                    self.assertTrue(set(ids)<=PEOPLE)
        self.assertLess(len(zlib.compress(json.dumps(index,ensure_ascii=False,separators=(',',':')).encode())),150_000)
        undated={r['person_id'] for r in RECORDS.values() if all(r.get(k) is None for k in ['start_year','end_year','attested_year'])}
        for buckets in index['offices'].values(): self.assertTrue(set(buckets.get('undated',[]))<=undated)
        for suffix in ['411732-70090','410519-70090']:
            row=RECORDS['cbdb-career-'+suffix]
            self.assertNotIn('supplement-zhongshu-councillor',row['office_ids'])

    def test_source_heading_is_not_a_false_workplace(self):
        for oid in ['official-0417','official-0418','official-0419']:
            self.assertEqual(OFFICES[oid]['institution'],'市舶司')
            self.assertEqual(OFFICES[oid]['catalog_source_institution'],'盐课提举司')
        self.assertFalse(any(o['institution']=='十二监' for o in OFFICES.values()))
        self.assertEqual(OFFICES['history-emperor']['institution_id'],'emperor')

    def test_existing_record_fields_remain_unchanged_against_release_baseline(self):
        path=ROOT / 'work/history-before-catalog-20260907.json'
        if not path.exists(): self.skipTest('Private previous-release baseline unavailable')
        before=read(path)
        self.assertEqual(before['people'],DATA['people'])
        old={r['id']:r for r in before['tenures']}
        self.assertEqual(set(old),set(RECORDS))
        for rid,row in RECORDS.items():
            previous=old[rid]
            if previous.get('office_ids'): self.assertEqual(previous['office_ids'],row['office_ids'],rid)
            allowed={'office_ids','catalog_link_basis'}
            if rid.startswith('core-primary-20260907-') and rid[-2:] in ('04','11','12','13'):
                allowed.add('institution_ids')
            self.assertEqual({k:v for k,v in previous.items() if k not in allowed},
                             {k:v for k,v in row.items() if k not in allowed},rid)


if __name__=='__main__': unittest.main(verbosity=2)
