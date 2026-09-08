import { ambiguousLocalPlaceNames } from './local-place-ambiguities';

export type LocalOfficeScope = {
  mode: 'scoped' | 'catalog_only';
  kind?: string;
  paths?: { names: string[]; from: number; to: number }[];
};
type OfficeRecord = {
  person_id: string; office_ids?: string[]; institution_ids?: string[];
  office_title?: string | null; institution?: string | null;
  record_kind?: string; record_role?: string;
  local_scope?: LocalOfficeScope;
  catalog_only_office_ids?: string[];
};

export type OfficeScope = { officialId: string; officialTitle?: string; placeName?: string; provinceName?: string; prefectureName?: string; year?: number; scene?: boolean };

/** Match local offices only when the record explicitly identifies the selected place. */
export function recordsForOffice<T extends OfficeRecord>(records: T[], scope: OfficeScope): T[] {
  const place = scope.placeName?.trim();
  const placeForms = place ? [place, ...[scope.provinceName, scope.prefectureName].filter(Boolean).map(prefix => prefix + place),
    (scope.provinceName || '') + (scope.prefectureName || '') + place] : [];
  const placePattern = place ? new RegExp(`(^|[\\s·、，,（）()/])(?:${placeForms.map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?=$|[\\s·、，,（）()/]|衙|儒学)`) : null;
  const title = scope.officialTitle?.trim();
  const localTitles = new Set(title && place ? [title, place + title, place.replace(/县$/, '') + title] : []);
  return records.filter(record => {
    if ((scope.scene || place) && record.catalog_only_office_ids?.includes(scope.officialId)) return false;
    const local = record.local_scope;
    if (scope.scene && !place && local && (local.mode === 'catalog_only' || local.kind !== 'jinyi_explicit')) return false;
    if (place) {
      if (local) {
        if (local.mode === 'catalog_only') return false;
        if (!local.paths?.some(path => (!scope.year || (path.from <= scope.year && scope.year <= path.to))
          && path.names.includes(place)
          && (!scope.prefectureName || path.names.includes(scope.prefectureName)))) return false;
      } else {
        const institution = record.institution || '';
        if (!placePattern?.test(institution)) return false;
        // A bare duplicate placename cannot establish which provincial branch it belongs to.
        if (ambiguousLocalPlaceNames.has(place) && (!scope.prefectureName || !institution.includes(scope.prefectureName))) return false;
        const explicitPrefectures = institution.match(/[\u4e00-\u9fff]{2,4}府/g) || [];
        if (scope.prefectureName && explicitPrefectures.length && !institution.includes(scope.prefectureName)) return false;
      }
    }
    if (scope.officialId === 'history-cabinet-service') return !!record.institution_ids?.includes('cabinet');
    if (record.office_ids?.includes(scope.officialId)) return true;
    if (record.office_ids?.length) return false;
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
