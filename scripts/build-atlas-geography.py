from __future__ import annotations

import json
import sys
from pathlib import Path


TOP_LEVEL = {
    "北直隶": ("beizhili", "北直隶", "顺天府"),
    "南直隶": ("nanzhili", "南直隶", "应天府"),
    "山东": ("shandong", "山东", "济南府"),
    "山西": ("shanxi", "山西", "太原府"),
    "河南": ("henan", "河南", "开封府"),
    "陕西": ("shaanxi", "陕西", "西安府"),
    "四川": ("sichuan", "四川", "成都府"),
    "湖广": ("huguang", "湖广", "武昌府"),
    "江西": ("jiangxi", "江西", "南昌府"),
    "浙江": ("zhejiang", "浙江", "杭州府"),
    "福建": ("fujian", "福建", "福州府"),
    "广东": ("guangdong", "广东", "广州府"),
    "广西": ("guangxi", "广西", "桂林府"),
    "贵州": ("guizhou", "贵州", "贵阳府"),
    "云南": ("yunnan", "云南", "云南府"),
}

ORDER = list(TOP_LEVEL)


def county(node: dict) -> dict:
    return {
        "id": node["id"],
        "name": node["name"],
        "kind": "县" if node.get("type") == "县" else "其他",
        "seat": bool(node.get("isSeat", False)),
        **({"note": node["temporalNote"]} if node.get("temporalNote") else {}),
    }


def prefecture(node: dict) -> dict:
    direct = [county(child) for child in node.get("children", []) if child.get("type") != "属州"]
    subprefectures = [
        {
            "id": child["id"],
            "name": child["name"],
            "kind": "属州",
            "counties": [county(grandchild) for grandchild in child.get("children", [])],
        }
        for child in node.get("children", [])
        if child.get("type") == "属州"
    ]
    kind = node.get("type", "其他")
    if kind not in {"府", "直隶州", "军民府"}:
        kind = "其他"
    result = {
        "id": node["id"],
        "name": node["name"],
        "kind": kind,
        "directCounties": direct,
        "subprefectures": subprefectures,
    }
    if node.get("seatNames"):
        result["seat"] = "、".join(node["seatNames"])
    if node.get("temporalNote"):
        result["note"] = node["temporalNote"]
    return result


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: build-atlas-geography.py INPUT.json OUTPUT.json")
    source_path, output_path = map(Path, sys.argv[1:])
    source = json.loads(source_path.read_text(encoding="utf-8"))
    by_name = {division["name"]: division for division in source["divisions"]}
    missing = [name for name in ORDER if name not in by_name]
    if missing:
        raise ValueError(f"missing top-level divisions: {missing}")

    source_urls = [item["url"] for item in source["sources"]]
    gap_note = "；".join(source["coverage"]["knownGaps"])
    provinces = []
    for name in ORDER:
        division = by_name[name]
        identifier, short_name, capital = TOP_LEVEL[name]
        provinces.append({
            "id": identifier,
            "name": name if "直隶" in name else f"{name}承宣布政使司",
            "shortName": short_name,
            "capital": capital,
            "period": f"约{source['targetReign']}（{source['targetYear']}）",
            "prefectures": [prefecture(child) for child in division.get("children", [])],
            "sourceUrls": source_urls,
            "coverageNote": gap_note,
        })

    prefecture_count = sum(len(item["prefectures"]) for item in provinces)
    county_count = sum(
        len(pref["directCounties"]) + sum(len(state["counties"]) + 1 for state in pref["subprefectures"])
        for province in provinces
        for pref in province["prefectures"]
    )
    output = {
        "metadata": {
            "title": source["title"],
            "period": f"约{source['targetReign']}（{source['targetYear']}）",
            "scopeNote": source["snapshotPolicy"]["warning"],
            "provinceCount": len(provinces),
            "prefectureCount": prefecture_count,
            "countyCount": county_count,
            "generatedAt": source["generatedOn"],
        },
        "provinces": provinces,
        "sources": [
            {"title": item["title"], "url": item["url"], "supports": item["supports"]}
            for item in source["sources"]
        ],
    }

    assert len(provinces) == 15
    assert prefecture_count == len({pref["id"] for province in provinces for pref in province["prefectures"]})
    assert county_count > 1300
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(output["metadata"], ensure_ascii=False))


if __name__ == "__main__":
    main()
