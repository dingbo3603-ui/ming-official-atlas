"""Evidence and boundary tests for the Ming history import, with no credentials.

Run after prepare-history.py:
    python path/to/test_history.py
Optional location override: MING_ATLAS_ROOT=/path/to/ming-official-atlas
Optional read-only HTTP checks: MING_HISTORY_API_URL=https://host/api/index.php

Default execution reads project code/data and uses a temporary SQLite database.
The real PHP year SELECT is exercised against the prepared factual fixtures;
this file does not reproduce its date-selection algorithm. This is not MySQL
integration proof. Database snapshot synchronization must be independently
read back from MySQL. HTTP checks run only when the URL is explicitly supplied.
"""
import json
import os
from pathlib import Path
import re
import sqlite3
import unittest
import urllib.error
import urllib.parse
import urllib.request


def find_root():
    configured = os.environ.get("MING_ATLAS_ROOT")
    candidates = ([Path(configured)] if configured else []) + [
        Path.cwd(),
        Path(__file__).resolve().parent,
        Path(__file__).resolve().parents[1],
        Path(__file__).resolve().parent.parent / "ming-official-atlas",
    ]
    for candidate in candidates:
        if (candidate / "work/history-import.json").is_file():
            return candidate.resolve()
    raise RuntimeError("Set MING_ATLAS_ROOT to the project containing work/history-import.json")


ROOT = find_root()
DATA = json.loads((ROOT / "work/history-import.json").read_text(encoding="utf-8"))
PEOPLE = {row["id"]: row for row in DATA["people"]}
TENURES = {row["id"]: row for row in DATA["tenures"]}
SOURCE_IDS = {row["id"] for row in DATA["sources"]}
OFFICE_IDS = {row["record_id"] for row in DATA["offices"]}


def year_select_from_php():
    """Read the production SELECT literal, rather than duplicating its rule."""
    source = (ROOT / "public/api/index.php").read_text(encoding="utf-8")
    candidates = [
        match.group(2)
        for match in re.finditer(r"""(['"])(SELECT\s+.*?)\1""", source, re.I | re.S)
        if "atlas_tenures" in match.group(2)
        and "WHERE" in match.group(2).upper()
        and "START_YEAR" in match.group(2).upper().split("ORDER BY")[0]
    ]
    if len(candidates) != 1:
        raise AssertionError(
            "Cannot identify one production year SELECT; adapt this SQL reader "
            "if query construction moved into a helper. Do not copy the old SQL."
        )
    return candidates[0]


class SourceIntegrityTests(unittest.TestCase):
    def test_full_careers_keep_direct_office_links_without_reviving_excluded_service(self):
        self.assertEqual(TENURES['cbdb-career-411666-71149']['office_ids'], ['official-0136-right'])
        linked = [row for row in DATA['tenures'] if row.get('direct_link_basis')]
        self.assertGreater(len(linked), 4000)
        for row in linked:
            self.assertNotEqual(row.get('record_kind'), 'event')
            self.assertIn(row.get('record_role'), ['office_appointment', 'acting_office'])
            self.assertFalse(row.get('correction_reason'))
            self.assertNotEqual(row.get('membership_basis'), 'same_person_overlapping_external_assignment_requires_duty_review')
        person = PEOPLE['cbdb-person-10097']
        self.assertTrue(person['summary'].startswith('履历：'))
        self.assertTrue(person['source_summary'].startswith('CBDB收录'))

    def test_left_right_are_distinct_and_special_assignments_stay_separate(self):
        self.assertIn('official-0052-left', OFFICE_IDS)
        self.assertIn('official-0052-right', OFFICE_IDS)
        self.assertNotIn('official-0052', OFFICE_IDS)
        self.assertEqual(TENURES['high-1566-mao-libu-left']['office_ids'], ['official-0052-left'])
        self.assertFalse(any(re.search('左[、，]?右', row['title']) for row in DATA['offices']))
        for row in DATA['tenures']:
            if row['id'].startswith('high-extra-1566-') and any(word in row['office_title'] for word in ['掌府','佥书']):
                self.assertIn('five-commissions', row['institution_ids'])
                self.assertEqual(row['office_ids'], [])

    def test_1573_chief_is_membership_not_one_unchanging_hall_title(self):
        chief = TENURES['people-zhang-chief']
        self.assertEqual(chief['duty_title'], '首辅')
        self.assertEqual(chief['institution_ids'], ['cabinet'])
        self.assertEqual(chief['office_ids'], [])
        titles=[r for r in DATA['tenures'] if r['person_id']=='zhang-juzheng' and r.get('start_year') and r.get('end_year') and r['start_year']<=1573<=r['end_year']]
        self.assertLessEqual({'official-0045','official-0046'}, {o for r in titles for o in r['office_ids']})
        self.assertTrue(any('official-0045' in r['office_ids'] and r['end_year']==1582 for r in titles))

    def test_temporal_institutions_and_bulk_unknown_years(self):
        periods = DATA['datasets']['history-meta']['institution_periods']
        for inst in periods:
            for year in range(1368,1645):
                self.assertEqual(sum(p['start_year']<=year<=p['end_year'] for p in inst['periods']),1)
        sili=next(i for i in periods if i['institution_id']=='sili-jian')
        self.assertEqual(sili['periods'][0]['state'],'not_established')
        self.assertEqual(sili['periods'][0]['end_year'],1383)
        for row in DATA['tenures']:
            if row['id'].startswith('cbdb-point-'):
                self.assertIsNone(row['start_year'])
                self.assertIsNone(row['end_year'])
                self.assertIsNotNone(row['attested_year'])
                self.assertNotEqual(row['status'],'verified')

    def test_entity_ids_are_unique_and_references_resolve(self):
        for group, key in [("people", "id"), ("sources", "id"), ("tenures", "id"),
                           ("eras", "id"), ("offices", "record_id")]:
            ids = [row[key] for row in DATA[group]]
            self.assertEqual(len(ids), len(set(ids)), group)
            self.assertTrue(all(re.fullmatch("[a-z0-9-]{1,100}", value) for value in ids))
        for row in DATA["people"] + DATA["tenures"] + DATA["eras"] + DATA["sili_offices"]:
            with self.subTest(entity=row["id"]):
                self.assertTrue(row.get("source_ids"), "historical claim needs evidence")
                self.assertLessEqual(set(row["source_ids"]), SOURCE_IDS)
        for row in DATA["tenures"]:
            with self.subTest(tenure=row["id"]):
                self.assertIn(row["person_id"], PEOPLE)
                self.assertLessEqual(set(row["office_ids"]), OFFICE_IDS)
                for year, ids in row.get("year_office_ids", {}).items():
                    self.assertTrue(str(year).isdigit())
                    self.assertGreaterEqual(int(year), 1368)
                    self.assertLessEqual(int(year), 1644)
                    self.assertLessEqual(set(ids), OFFICE_IDS)
                a, b = row["start_year"], row["end_year"]
                if a is not None and b is not None:
                    self.assertLessEqual(a, b)

    def test_source_urls_and_catalog_coverage(self):
        self.assertTrue(all(urllib.parse.urlsplit(row["url"]).scheme in {"http", "https"}
                            for row in DATA["sources"]))
        audit = json.loads((ROOT / "public/data/ming-official-rank-audit.json")
                           .read_text(encoding="utf-8"))
        reviewed_ids = {row["record_id"] for row in audit["records"]}
        self.assertEqual(len(reviewed_ids), 571)
        lineage = OFFICE_IDS | {row.get('combined_record_id') for row in DATA['offices']}
        self.assertLessEqual(reviewed_ids, lineage)

    def test_known_aliases_are_merged_once_and_sources_retained(self):
        for canonical, alias, name in [
            ("gao-gong", "gao-gong-xinzheng", "高拱"),
            ("guo-pu", "guo-pu-anyang", "郭朴"),
        ]:
            self.assertIn(canonical, PEOPLE)
            self.assertNotIn(alias, PEOPLE)
            self.assertEqual([p["id"] for p in PEOPLE.values() if p["name"] == name],
                             [canonical])
            self.assertTrue(any(s.startswith("people-") for s in PEOPLE[canonical]["source_ids"]))
            self.assertTrue(any(s.startswith("ministers-") for s in PEOPLE[canonical]["source_ids"]))
        for obsolete in [
            "ministers-guo-pu-libu-1561-1563",
            "ministers-guo-pu-libu-1565-1566",
            "ministers-gao-gong-libu-1565-1566",
        ]:
            self.assertNotIn(obsolete, TENURES)

    def test_no_false_local_nanjing_or_courtesy_office_binding(self):
        unmapped = [
            "people-hu-yidu", "people-hu-yuyao", "people-hai-chunan",
            "people-hai-xingguo", "people-hai-nanping", "people-hai-nanjing",
            "people-yan-nanjing", "people-qi-dengzhou", "people-qi-fujian",
            "people-tan-taizhou", "people-tan-liangguang",
            "people-guo-libu-shangshu", "people-yanshifan-shangbao-manager",
            "ministers-zhu-xixiao-jinyi-attested-1566",
        ]
        for id_ in unmapped:
            with self.subTest(tenure=id_):
                self.assertEqual(TENURES[id_]["office_ids"], [])
        self.assertEqual(TENURES["people-hai-hubu"]["office_ids"], ["official-0079"])
        self.assertEqual(TENURES["people-zhang-shidu"]["office_ids"], ["official-0256"])
        self.assertEqual(TENURES["people-gao-jijiu"]["office_ids"], ["official-0291"])
        self.assertEqual(TENURES["people-gao-cabinet-return"]["office_ids"], ["official-0051"])

    def test_1566_cabinet_snapshots_do_not_become_whole_terms(self):
        for id_, office in [
            ("people-xu-chief", "official-0046"),
            ("people-li-cabinet", "official-0048"),
        ]:
            row = TENURES[id_]
            self.assertEqual(row["office_ids"], [])
            titles=[r for r in DATA['tenures'] if r['person_id']==row['person_id'] and r.get('start_year') and r.get('end_year') and r['start_year']<=1566<=r['end_year']]
            self.assertTrue(any(office in r['office_ids'] for r in titles))
        self.assertNotIn("武英殿", TENURES["people-li-cabinet"]["office_title"])
        self.assertTrue(any(r['person_id']=='li-chunfang' and '建极' in r['office_title'] for r in DATA['tenures']))

    def test_single_attestation_and_real_short_term_are_distinct(self):
        zhu = TENURES["ministers-zhu-xixiao-jinyi-attested-1566"]
        self.assertEqual((zhu["record_kind"], zhu["start_year"], zhu["end_year"],
                          zhu["attested_year"]), ("attestation", None, None, 1566))
        for id_, year in [("ministers-hu-song-libu-1566", 1566),
                          ("eras-emperor-taichang", 1620)]:
            row = TENURES[id_]
            self.assertEqual((row["record_kind"], row["start_year"], row["end_year"]),
                             ("tenure", year, year))
        for row in DATA["tenures"]:
            if row["record_kind"] == "event":
                # Undated events belong in the full career, not an invented calendar year.
                if row.get('attested_year') is None and row.get('start_year') is None:
                    self.assertIsNone(row.get('end_year'))
                self.assertTrue(all(int(key) in {row.get('attested_year'),row.get('start_year')} for key in row.get('year_office_ids',{})))

    def test_axis_and_regnal_labels_preserve_transition_years(self):
        self.assertEqual([row["year"] for row in DATA["timeline_years"]],
                         list(range(1368, 1645)))
        years = {row["year"]: row for row in DATA["timeline_years"]}
        self.assertEqual({r["era_id"] for r in years[1457]["era_labels"]},
                         {"jingtai", "tianshun"})
        self.assertEqual({r["era_id"] for r in years[1620]["era_labels"]},
                         {"wanli", "taichang"})
        self.assertEqual(years[1566]["era_labels"][0]["label"], "嘉靖四十五年")


class ProductionYearSQLTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = sqlite3.connect(":memory:")
        cls.db.execute("""CREATE TABLE atlas_tenures (
            id TEXT PRIMARY KEY, person_id TEXT, office_title TEXT, institution TEXT,
            start_year INTEGER, end_year INTEGER, attested_year INTEGER, body TEXT)""")
        cls.db.executemany("INSERT INTO atlas_tenures VALUES (?,?,?,?,?,?,?,?)", [
            (r["id"], r["person_id"], r["office_title"], r["institution"],
             r["start_year"], r["end_year"], r["attested_year"],
             json.dumps(r, ensure_ascii=False))
            for r in DATA["tenures"]
        ])
        cls.sql = year_select_from_php()

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def records(self, year):
        return [json.loads(row[0]) for row in self.db.execute(
            self.sql, (year,) * self.sql.count("?"))]

    def ids(self, year):
        return {r["id"] for r in self.records(year)}

    def office_holders(self, year, office):
        # Assert the actual SQL results; no duplicate date selection is applied.
        return {r["person_id"] for r in self.records(year)
                if r["record_kind"] != "event" and office in r.get("office_ids", [])}

    def test_1566_ministry_holders_are_attested_successions(self):
        expected = {
            "official-0051": {"guo-pu", "hu-song-chuzhou", "yang-bo-puzhou"},
            "official-0062": {"gao-yao-hubu"},
            "official-0104": {"gao-gong", "gao-yi-qiantang"},
            "official-0118": {"yang-bo-puzhou", "zhao-bingran-jianzhou"},
            "official-0135": {"huang-guangsheng-xingbu"},
            "official-0165": {"lei-li-gongbu"},
            "official-0239-left": {"zhang-yongming-wucheng", "wang-ting-nanchong"},
        }
        for office, holders in expected.items():
            with self.subTest(office=office):
                self.assertEqual(self.office_holders(1566, office), holders)

    def test_qi_jiguang_known_start_and_attestation_both_survive(self):
        id_ = "people-qi-fujian"
        self.assertIn(id_, self.ids(1563), "known initial appointment year was dropped")
        self.assertIn(id_, self.ids(1566), "separate contemporary attestation was dropped")
        for year in [1562, 1564, 1565, 1567, 1600]:
            with self.subTest(year=year):
                self.assertNotIn(id_, self.ids(year), "unknown boundary was interpolated")

    def test_unknown_boundaries_and_era_only_eunuchs_do_not_extend(self):
        for year in [1550, 1566, 1567, 1572, 1600]:
            for id_ in ["people-xu-yanping", "people-xu-jijiu",
                        "eras-feng-bao-bingbi-jiajing",
                        "eras-chen-hong-zhangyin-longqing"]:
                self.assertNotIn(id_, self.ids(year))
        self.assertIn("people-xu-bianxiu", self.ids(1523))
        self.assertNotIn("people-xu-bianxiu", self.ids(1524))
        self.assertIn("eras-meng-chong-zhangyin-longqing", self.ids(1572))
        self.assertNotIn("eras-meng-chong-zhangyin-longqing", self.ids(1571))
        self.assertIn("eras-feng-bao-zhangyin-1572", self.ids(1572))
        self.assertNotIn("eras-feng-bao-zhangyin-1572", self.ids(1573))

    def test_emperor_accession_is_not_regnal_year_start(self):
        expected = {
            1398: {"zhu-yuanzhang", "zhu-yunwen"},
            1402: {"zhu-yunwen", "zhu-di"},
            1450: {"zhu-qiyu"},
            1457: {"zhu-qiyu", "zhu-qizhen"},
            1521: {"zhu-houzhao", "zhu-houcong"},
            1522: {"zhu-houcong"},
            1566: {"zhu-houcong"},
            1567: {"zhu-houcong", "zhu-zaihou"},
            1620: {"zhu-yijun", "zhu-changluo", "zhu-youxiao"},
            1644: {"zhu-youjian"},
        }
        for year, people in expected.items():
            with self.subTest(year=year):
                self.assertEqual(self.office_holders(year, "history-emperor"), people)

    def test_impossible_1566_appointments_are_absent(self):
        active = [r for r in self.records(1566) if r["record_kind"] != "event"]
        self.assertFalse({"hu-zongxian", "yan-song", "yan-shifan"} &
                         {r["person_id"] for r in active})
        self.assertFalse(any(r["person_id"] == "zhang-juzheng"
                             and "内阁" in r["institution"] for r in active))
        self.assertFalse(any(r["person_id"] == "tan-lun"
                             and "official-0118" in r["office_ids"] for r in active))
        self.assertFalse(any(r["person_id"] == "huang-jin"
                             and any(o.startswith("sili-") for o in r["office_ids"])
                             for r in active))

    def test_persons_are_never_displayed_after_confirmed_death(self):
        for year in range(1368, 1645):
            for row in self.records(year):
                if row["record_kind"] == "event":
                    continue
                death = PEOPLE[row["person_id"]].get("death_year")
                if death is not None:
                    self.assertLessEqual(year, death, (year, row["id"]))

    def test_core_rosters_and_actual_halls_are_populated(self):
        expected={1416:{'胡广','杨荣','金幼孜','杨士奇'},1580:{'张居正','张四维','申时行'}}
        for year,names in expected.items():
            members={PEOPLE[r['person_id']]['name'] for r in self.records(year) if 'cabinet' in r.get('institution_ids',[]) and r['record_kind']!='event'}
            self.assertEqual(members,names)
        rows=self.records(1580)
        for office,name in [('official-0118','方逢时'),('official-0119-left','吴兑'),('official-0119-right','王一鹗')]:
            self.assertIn(name,{PEOPLE[r['person_id']]['name'] for r in rows if office in r['office_ids']})
        unavailable=DATA['datasets']['history-meta']['empty_slots_evidence']
        self.assertTrue(any(e['year']==1580 and e['office_id']=='official-0046' for e in unavailable))
        for year in range(1522,1645):
            offices={o for r in self.records(year) if r['record_kind']!='event' for o in r['office_ids']}
            self.assertLessEqual({'official-0051','official-0062','official-0104','official-0118','official-0135','official-0165'},offices,year)


API_URL = os.environ.get("MING_HISTORY_API_URL", "").strip()


@unittest.skipUnless(API_URL, "optional read-only HTTP checks: set MING_HISTORY_API_URL")
class LiveAPIContractTests(unittest.TestCase):
    def request_json(self, **params):
        separator = "&" if "?" in API_URL else "?"
        request = urllib.request.Request(
            API_URL + separator + urllib.parse.urlencode(params),
            headers={"Accept": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            self.assertEqual(response.status, 200)
            return json.load(response)

    def test_1566_snapshot_bindings_are_applied_without_leaking_to_1567(self):
        year1566 = self.request_json(action="year", year=1566)
        self.assertEqual(year1566["year"], 1566)
        rows = {r["id"]: r for r in year1566["records"]}
        self.assertEqual(rows['people-xu-chief']['office_ids'], [])
        self.assertTrue(any(r['person_id']=='xu-jie' and 'official-0046' in r['office_ids'] for r in rows.values()))
        self.assertTrue(any(r['person_id']=='li-chunfang' and 'official-0048' in r['office_ids'] for r in rows.values()))
        year1567 = self.request_json(action="year", year=1567)
        later = {r["id"]: r for r in year1567["records"]}
        self.assertNotIn("official-0046", later["people-xu-chief"]["office_ids"])
        self.assertNotIn("official-0048", later["people-li-cabinet"]["office_ids"])

    def test_known_boundary_year_is_returned_by_deployed_api(self):
        rows = self.request_json(action="year", year=1563)["records"]
        self.assertIn("people-qi-fujian", {r["id"] for r in rows})

    def test_bootstrap_has_canonical_people_and_valid_sources(self):
        response = self.request_json(action="bootstrap")
        ids = {p["id"] for p in response["people"]}
        self.assertEqual(ids, set(PEOPLE))
        self.assertNotIn("gao-gong-xinzheng", ids)
        self.assertNotIn("guo-pu-anyang", ids)
        self.assertEqual({s["id"] for s in response["sources"]}, SOURCE_IDS)


if __name__ == "__main__":
    unittest.main(verbosity=2)
