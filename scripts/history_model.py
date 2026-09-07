"""Stable office identities, independent institution membership, and dated labels."""
import copy
import re

INSTITUTIONS = {
    '内阁': 'cabinet', '中书省': 'central-secretariat', '吏部': 'ministry-personnel',
    '户部': 'ministry-revenue', '礼部': 'ministry-rites', '兵部': 'ministry-war',
    '刑部': 'ministry-justice', '工部': 'ministry-works', '翰林院': 'hanlin',
    '都察院': 'censorate', '御史台': 'censorate', '御史府': 'censorate',
    '大理寺': 'grand-court', '大理院': 'grand-court',
    '通政司': 'transmission-office', '通政使司': 'transmission-office', '通政寺': 'transmission-office',
    '五军都督府': 'five-commissions', '大都督府': 'five-commissions',
    '左军都督府': 'five-commissions', '右军都督府': 'five-commissions',
    '前军都督府': 'five-commissions', '后军都督府': 'five-commissions', '中军都督府': 'five-commissions',
    '锦衣卫': 'jinyiwei', '司礼监': 'sili-jian',
}


def split_offices(offices):
    """Split only an explicitly named pair. Two holders alone is not a pair."""
    result, pairs = [], {}
    for office in offices:
        if not re.search('左[、，]?右', office['title']):
            result.append(office)
            continue
        ids = []
        for side, suffix in [('左', 'left'), ('右', 'right')]:
            row = copy.deepcopy(office)
            row['record_id'] += '-' + suffix
            row['combined_record_id'] = office['record_id']
            row['title'] = re.sub('左[、，]?右', side, row['title'])
            if row.get('department'):
                row['department'] = re.sub('左[、，]?右', side, row['department'])
            row['headcount'] = {'二人': '一人', '四人': '二人'}.get(row.get('headcount'), row.get('headcount'))
            row['side'] = side
            ids.append(row['record_id'])
            result.append(row)
        pairs[office['record_id']] = ids
    return result, pairs


def split_references(value, pairs):
    if isinstance(value, list):
        return [expanded for item in value for expanded in
                (pairs[item] if isinstance(item, str) and item in pairs else [split_references(item, pairs)])]
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            for mapped in pairs.get(key, [key]):
                result[mapped] = split_references(item, pairs)
        return result
    return value


def apply_memberships(history, pairs):
    for record in history['tenures']:
        # Membership follows the attested place of work, not an honorary ministry title.
        institution = record.get('institution') or ''
        record['institution_ids'] = sorted(set(record.get('institution_ids', [])) | {
            identifier for name, identifier in INSTITUTIONS.items()
            if institution == name or name in re.split('[、，,/；（）() ·]+', institution)
        })
        if institution.startswith('南京') or record.get('review_status', '').startswith('cbdb'):
            record['institution_ids'] = []
        for field in ['office_ids']:
            updated = []
            for identifier in record.get(field, []):
                if identifier not in pairs:
                    updated.append(identifier)
                    continue
                title = record['office_title']
                sides = [side for side in ['左', '右'] if side in title]
                # A generic "侍郎" does not establish which side was held.
                if len(sides) == 1:
                    updated.append(pairs[identifier][0 if sides[0] == '左' else 1])
            record[field] = sorted(set(updated))
        if record.get('year_office_ids'):
            for yr, ids in record['year_office_ids'].items():
                record['year_office_ids'][yr] = [i for i in ids if i not in pairs]
        if record['institution_ids'] == ['cabinet'] and record.get('record_kind') != 'event':
            record['duty_title'] = '首辅' if '首辅' in record['office_title'] else '阁臣'


def annotate_names(offices):
    for row in offices:
        if row['record_id'] in ['official-0045', 'official-0046']:
            old, new = ('华盖殿大学士', '中极殿大学士') if row['record_id'] == 'official-0045' else ('谨身殿大学士', '建极殿大学士')
            row['title_periods'] = [
                {'from': 1368, 'until': 1561, 'name': old},
                {'from': 1562, 'until': 1644, 'name': new},
            ]
        row['institution_id'] = INSTITUTIONS.get(row['institution'])
