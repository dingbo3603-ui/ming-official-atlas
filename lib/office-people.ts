type OfficeRecord = {
  person_id: string; office_ids?: string[]; institution_ids?: string[];
  office_title?: string | null; institution?: string | null;
  record_kind?: string; record_role?: string;
};

export type OfficeScope = { officialId: string; officialTitle?: string; placeName?: string; provinceName?: string; prefectureName?: string };

/** Match local offices only when the record explicitly identifies the selected place. */
export function recordsForOffice<T extends OfficeRecord>(records: T[], scope: OfficeScope): T[] {
  const place = scope.placeName?.trim();
  const placeForms = place ? [place, ...[scope.provinceName, scope.prefectureName].filter(Boolean).map(prefix => prefix + place),
    (scope.provinceName || '') + (scope.prefectureName || '') + place] : [];
  const placePattern = place ? new RegExp(`(^|[\\s·、，,（）()/])(?:${placeForms.map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?=$|[\\s·、，,（）()/]|衙|儒学)`) : null;
  const title = scope.officialTitle?.trim();
  const localTitles = new Set(title && place ? [title, place + title, place.replace(/县$/, '') + title] : []);
  return records.filter(record => {
    if (placePattern && !placePattern.test(record.institution || '')) return false;
    if (scope.officialId === 'history-cabinet-service') return !!record.institution_ids?.includes('cabinet');
    if (record.office_ids?.includes(scope.officialId)) return true;
    // Several local records have a precise title and place but no shared template ID.
    return !!place && localTitles.has(record.office_title?.trim() || '');
  });
}

/** Names represent service recorded within the year, including annual succession. */
export function scenePersonIds(records: OfficeRecord[]): Set<string> {
  const excluded = new Set(['honorary_title', 'posthumous_or_honorary', 'not_assumed', 'nonservice_event']);
  const serviceEvents = new Set(['office_appointment', 'acting_office', 'concurrent_title_or_duty']);
  return new Set(records.filter(record => !excluded.has(record.record_role || '')
    && (record.record_kind !== 'event' || serviceEvents.has(record.record_role || '')))
    .map(record => record.person_id));
}
