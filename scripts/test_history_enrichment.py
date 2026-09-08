"""Regression checks for the reviewed 2026-09-07 enrichment; no remote writes."""
import json
import unittest

from test_history import ROOT, DATA, PEOPLE, TENURES, ProductionYearSQLTests

BUNDLE = json.loads((ROOT / 'research/history/history-enrichment-20260907.json').read_text(encoding='utf-8'))


class EnrichmentIntegrityTests(unittest.TestCase):
    def test_regnal_conversions_keep_the_original_date_fields(self):
        patches = [p for p in BUNDLE['record_patches'] if 'regnal_year_conversion' in p['set'].get('cbdb', {})]
        self.assertEqual(len(patches), 4012)
        for patch in patches:
            row = TENURES[patch['id']]
            raw = row['cbdb']
            conversion = raw['regnal_year_conversion']
            with self.subTest(record=row['id']):
                self.assertIsNone(raw['reported_first_year'])
                self.assertIsNone(raw['reported_last_year'])
                if row['id']=='cbdb-career-468333-71554' and 'primary-high5-ms109' in row['source_ids']:
                    self.assertEqual(row['end_year'],1377)
                    self.assertTrue(any(v['end_year'] is None for v in row['source_record_versions']))
                else:
                    self.assertIsNone(row['end_year'])
                self.assertEqual(conversion['era_dynasty'], 19)
                self.assertLessEqual(1, conversion['regnal_year'])
                self.assertLessEqual(conversion['regnal_year'], conversion['era_length'])
                self.assertEqual(row['attested_year'], conversion['era_first_year'] + conversion['regnal_year'] - 1)
                self.assertLessEqual(row['attested_year'], conversion['era_last_year'])
                self.assertEqual(raw, patch['set']['cbdb'])
        excluded = set(BUNDLE['meta']['excluded_regnal_ids'])
        self.assertFalse(excluded & {p['id'] for p in patches})

    def test_corrected_terms_preserve_complete_original_records(self):
        for retirement in BUNDLE['record_retirements']:
            self.assertNotIn(retirement['id'], TENURES)
            for replacement in retirement['replacement_ids']:
                self.assertIn(retirement['original_record'], TENURES[replacement]['source_record_versions'])
        for person in PEOPLE.values():
            if 'career_record_ids' in person:
                for record_id in person['career_record_ids']:
                    self.assertIn(record_id, TENURES)
                    self.assertEqual(TENURES[record_id]['person_id'], person['id'])

    def test_proven_aliases_merge_but_namesakes_remain_separate(self):
        self.assertNotIn('cbdb-person-222080', PEOPLE)
        self.assertNotIn('cbdb-person-218675', PEOPLE)
        self.assertEqual(PEOPLE['cbdb-person-66017']['name'], '朱国祯')
        self.assertEqual(PEOPLE['cbdb-person-66017']['cbdb']['person_ids'], [66017])
        self.assertEqual(set(PEOPLE['cbdb-person-124070']['cbdb']['person_ids']), {124070, 218675})
        self.assertIn('cbdb-person-130357', PEOPLE)
        self.assertEqual(PEOPLE['cbdb-person-479737']['name'], '刘瑾')
        self.assertEqual(PEOPLE['primary-liu-jin-eunuch']['name'], '刘瑾')
        records = [r for r in DATA['tenures'] if r['person_id'] == 'cbdb-person-479737']
        self.assertTrue(records)
        self.assertTrue(all('sili-jian' not in r['institution_ids'] for r in records))

    def test_early_career_and_unassumed_appointments_stay_distinct(self):
        records = [r for r in DATA['tenures'] if r['person_id'] == 'liu-sanwu']
        self.assertEqual(len([r for r in records if r['office_title'] == '国子监博士' and r['attested_year'] == 1390]), 1)
        yuan = [r for r in records if r['timeline_scope'] == 'other_dynasty_career']
        self.assertEqual(len(yuan), 2)
        self.assertTrue(all(r['start_year'] is None and r['end_year'] is None and r['attested_year'] is None for r in yuan))
        zou = TENURES['cbdb-career-427742-70138']
        self.assertEqual((zou['record_kind'], zou['record_role'], zou['office_ids']), ('event', 'not_assumed', []))


class EnrichmentYearSQLTests(ProductionYearSQLTests):
    def test_imprisonment_and_release_do_not_become_continuous_service(self):
        for year in [1422, 1423]:
            self.assertNotIn('cbdb-person-252759', self.office_holders(year, 'official-0062'))
        self.assertIn('cbdb-person-252759', self.office_holders(1424, 'official-0062'))
        self.assertNotIn('cbdb-person-66658', self.office_holders(1429, 'official-0051'))
        for year in [1407, 1425]:
            self.assertIn('cbdb-person-66757', self.office_holders(year, 'official-0165'))
            self.assertNotIn('cbdb-person-66757', self.office_holders(year, 'official-0135'))

    def test_newly_dated_point_is_visible_only_in_its_evidenced_year(self):
        for year in [1637, 1639]:
            self.assertNotIn('cbdb-career-466912-70307', self.ids(year))
        self.assertIn('cbdb-career-466912-70307', self.ids(1638))
        self.assertIn('primary-wang-an-eunuch', self.office_holders(1620, 'sili-bingbi'))
        self.assertNotIn('primary-wang-an-eunuch', self.office_holders(1621, 'sili-zhangyin'))
        self.assertIn('primary-wang-tiqian-eunuch', self.office_holders(1621, 'sili-zhangyin'))


if __name__ == '__main__':
    # Reuse the production SQL fixture without running its inherited tests twice.
    suite = unittest.TestSuite()
    suite.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(EnrichmentIntegrityTests))
    suite.addTests(EnrichmentYearSQLTests(name) for name in [
        'test_imprisonment_and_release_do_not_become_continuous_service',
        'test_newly_dated_point_is_visible_only_in_its_evidenced_year',
    ])
    raise SystemExit(not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful())
