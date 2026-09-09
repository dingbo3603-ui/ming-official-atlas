import source from './frontier-geography.json';
import type { HistoryRecord } from '@/components/history/history-context';

export interface FrontierSource { id: string; title: string; url: string; supports: string }
export interface FrontierSite {
  id: string; name: string; modernPlace: string; lon: number; lat: number;
  from: number; displayUntil: number; note: string; sourceIds: string[];
  namePeriods?: {from: number; until: number; name: string}[];
}
export interface FrontierPhase {
  from: number; until: number; title: string; seat: string; note: string;
  mapState: 'active' | 'changed' | 'historical' | 'not-established';
  siteIds: string[]; sourceIds: string[]; mapCaption?: string;
}
export interface FrontierRegion {
  id: string; shortName: string; kind: string; aliases: string[];
  description: string; mapLabel: [number, number]; inset?: boolean;
  footprint: string; footprintFrom: number; phases: FrontierPhase[]; sites: FrontierSite[]; sources: FrontierSource[];
}
export const frontierRegions = source.regions as FrontierRegion[];
export const northeastLand = source.northeastLand;
export const frontierAtYear = (region: FrontierRegion, year: number) =>
  region.phases.find(phase => phase.from <= year && phase.until >= year)!;
export const frontierSites = (region: FrontierRegion, year: number) => {
  const phase = frontierAtYear(region, year);
  return region.sites.filter(site => phase.siteIds.includes(site.id) && site.from <= year && site.displayUntil >= year)
    .map(site => ({...site, name: site.namePeriods?.find(period => period.from <= year && year <= period.until)?.name || site.name}));
};
export const frontierCaption = (region: FrontierRegion, year: number) => {
  const phase = frontierAtYear(region, year);
  return phase.mapCaption || (phase.mapState === 'not-established' ? '尚未设置 · 沿革'
    : phase.mapState === 'historical' ? '旧址与沿革'
      : phase.title.includes('都卫') ? '军事都卫' : region.kind);
};
export function frontierXY(lon: number, lat: number, inset = false): [number, number] {
  return inset ? [(lon - 118) / 26 * 640, (56 - lat) / 18 * 400]
    : [(lon - 91) / 34.5 * 1600, (43.5 - lat) / 26.5 * 1000];
}

/** Only a current posting's explicit institution/location, never a biography or later career. */
export function recordsForFrontier(records: HistoryRecord[], region: FrontierRegion, year: number) {
  if (frontierAtYear(region, year).mapState === 'not-established') return [];
  return records.filter(record => {
    if (/honorary|posthumous|unassumed|not_assumed|declined_nomination|nonservice_event/.test(record.record_role || '') || record.local_scope?.mode === 'catalog_only') return false;
    if (record.record_kind === 'event' && !['office_appointment', 'acting_office', 'concurrent_title_or_duty'].includes(record.record_role || '')) return false;
    const institution = record.institution || '';
    if (region.aliases.some(alias => institution.includes(alias))) return true;
    return record.local_scope?.mode === 'scoped' && record.local_scope.paths?.some(path =>
      (!path.from || path.from <= year) && (!path.to || path.to >= year)
      && path.names.some(name => region.aliases.includes(name)));
  });
}
