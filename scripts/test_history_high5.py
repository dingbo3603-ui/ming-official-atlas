"""Data release regressions: exact links, locality, provenance, and unknown years."""
import copy
import json
import unittest
from pathlib import Path
from history_high5_gapfill import apply_high5_gapfill, digest

ROOT=Path(__file__).resolve().parents[1]
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
DATA=read(ROOT/'work/history-import.json')
BUNDLE=read(ROOT/'research/history/high5-gapfill-20260908.json')
RECORDS={r['id']:r for r in DATA['tenures']}

class HighFiveTests(unittest.TestCase):
    def test_frozen_records_only_change_as_reviewed(self):
        if not (ROOT/'work/history-before-high5-gapfill-20260908.json').exists():
            self.skipTest('Private publication baseline unavailable; pipeline still guards all patched record hashes')
        before=read(ROOT/'work/history-before-high5-gapfill-20260908.json')
        old={r['id']:r for r in before['tenures']}
        patches={p['id']:p for p in BUNDLE['record_patches']}
        for rid,row in old.items():
            expected=copy.deepcopy(row)
            if rid in patches:
                p=patches[rid]
                self.assertEqual(digest(row),p['before_sha256'],rid)
                expected.update(p['set'])
                expected['office_ids']=sorted(set(row.get('office_ids',[])+expected.get('office_ids',[])))
                expected['source_ids']=sorted(set(row['source_ids']+expected.get('source_ids',[])))
                if p.get('corrected_fields'):expected.setdefault('source_record_versions',[]).append(row)
            self.assertEqual(expected,RECORDS[rid],rid)
        self.assertEqual(set(RECORDS)-set(old),{r['id'] for r in BUNDLE['tenures']})

    def test_global_only_types_cannot_acquire_a_workplace(self):
        patches={p['id']:p for p in BUNDLE['record_patches']}
        generic=[p for p in patches.values() if any(e.get('method')=='generic' for e in p['evidence'])]
        self.assertEqual(len(generic),4927)
        for p in generic:
            self.assertEqual(RECORDS[p['id']]['local_scope']['mode'],'catalog_only')
            self.assertNotIn('institution_ids',p['set'])
            self.assertFalse(set(p['set'])&{'start_year','end_year','attested_year','record_role','record_kind'})

    def test_documented_same_name_state_is_not_a_free_placename(self):
        row=RECORDS['cbdb-career-331021-71506']
        self.assertEqual(row['local_scope']['mode'],'scoped')
        self.assertTrue(any('真定府' in p['names'] for p in row['local_scope']['paths']))
        self.assertFalse(any('大理府' in p['names'] for p in row['local_scope']['paths']))

    def test_posthumous_yuanshi_is_not_living_service(self):
        row=RECORDS['cbdb-career-489426-85285']
        self.assertEqual(row['record_role'],'posthumous_or_honorary')
        self.assertEqual(row['record_kind'],'event')
        self.assertTrue(row['source_record_versions'])

    def test_early_palace_titles_do_not_create_cabinet_service(self):
        row=RECORDS['primary-high5-20260908-001']
        self.assertEqual(row['office_ids'],['official-0047'])
        self.assertNotIn('cabinet',row['institution_ids'])
        self.assertEqual((row['start_year'],row['end_year']),(1383,1384))

    def test_new_unknown_terms_and_identity_links(self):
        people={p['id'] for p in DATA['people']};sources={s['id'] for s in DATA['sources']}
        for row in BUNDLE['tenures']:
            self.assertIn(row['person_id'],people)
            self.assertTrue(set(row['source_ids'])<=sources)
            self.assertTrue(row['date_note'])
            if row.get('date_precision')=='undated':
                self.assertTrue(all(row[k] is None for k in ['start_year','end_year','attested_year']))
        sun=RECORDS['rare-guard-sun-yin-yiweifu']
        self.assertIsNone(sun['attested_year']) # 1523 is the genealogy's publication, not his tenure.

    def test_unrelated_authorized_birthyear_correction_keeps_raw_value(self):
        p=next(p for p in DATA['people'] if p['id']=='cbdb-person-68216')
        self.assertEqual(p['birth_year'],1508)
        self.assertIn('life-review-zhao-zhenji',p['source_ids'])

    def test_reapplication_rejects_changed_source_instead_of_silent_overwrite(self):
        with self.assertRaises(AssertionError):
            apply_high5_gapfill(copy.deepcopy(DATA),ROOT/'research/history')

if __name__=='__main__':unittest.main(verbosity=2)
