"""Bind existing office identities after career replacement; keep source provenance."""
import re


def _title(value):
    return re.sub(r'[（(].*?[）)]|\s', '', value or '')


def apply_direct_links(history, offices, legacy_mappings):
    catalog = {office['record_id']: office for office in offices}
    previous = {row['tenure_id']: row for row in legacy_mappings}
    linked = []
    for record in history['tenures']:
        if not record.get('review_status', '').startswith('cbdb') or record.get('office_ids'):
            continue
        if record.get('record_role') not in ('office_appointment', 'acting_office'):
            continue
        if record.get('record_kind') == 'event' or record.get('correction_reason'):
            continue
        if record.get('membership_basis') in {
            'same_person_overlapping_external_assignment_requires_duty_review',
            'manual_cabinet_overlap_ministry_duty_not_inferred',
            'cross_dynasty_office_code_requires_institution_review',
        }:
            continue
        memberships = set(record.get('institution_ids', []))
        if record.get('institution', '').startswith('南京'):
            continue
        # The full-career replacement retains the old point identifiers. Restore
        # only bindings compatible with its final, corrected place of service.
        candidates = set()
        for old_id in record.get('cbdb', {}).get('superseded_point_ids', []):
            mapping = previous.get(old_id, {})
            if any(record.get(field) != mapping.get(field) for field in ('office_title', 'institution')):
                continue
            for office_id in mapping.get('office_ids', []):
                office = catalog.get(office_id)
                if office and (office.get('institution_id') in memberships or
                        (not office.get('institution_id') and office['institution'] == record['institution'])):
                    candidates.add(office_id)
        basis = 'retained_office_identity_from_replaced_record'
        if not candidates and memberships:
            # Names, side and institution must all agree. Several 清吏司 may have
            # the same title; an unspecified branch must not choose one of them.
            title = _title(record.get('office_title'))
            for office_id, office in catalog.items():
                if office.get('institution_id') not in memberships:
                    continue
                name = _title(office['title'])
                department = office.get('department') or office['institution']
                aliases = {name, office['institution'] + name, department + name}
                aliases.update(_title(period['name']) for period in office.get('title_periods', []))
                if title in aliases:
                    candidates.add(office_id)
            basis = 'unique_office_name_side_and_institution'
        if len(candidates) == 1:
            record['office_ids'] = sorted(candidates)
            record['direct_link_basis'] = basis
            linked.append({'record_id': record['id'], 'office_ids': record['office_ids'], 'basis': basis})
    for person in history['people']:
        summary = person.get('summary') or ''
        if summary.startswith('CBDB收录'):
            person.setdefault('source_summary', summary)
            offices_text = re.split('[；;]', summary, maxsplit=1)[0]
            offices_text = re.sub(r'^CBDB收录其?', '', offices_text)
            offices_text = re.sub(r'等?任官(?:资料|履历)。?$', '', offices_text)
            person['summary'] = '履历：' + offices_text.rstrip('。') + '。'
    return linked
