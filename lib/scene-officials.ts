import type { SourceOfficial } from '@/app/page';
import type { GeographyCounty, GeographyPrefecture } from './ming-atlas-v2';

export const courtRoleMatchers = [
  { label: '内阁阁臣', pattern: /^内阁阁臣与首辅$/, institution: /内阁/ },
  { label: '吏部尚书', pattern: /吏部尚书/ },
  { label: '户部尚书', pattern: /户部尚书/ },
  { label: '礼部尚书', pattern: /礼部尚书/ },
  { label: '刑部尚书', pattern: /刑部尚书/ },
  { label: '工部尚书', pattern: /工部尚书/ },
  { label: '兵部尚书', pattern: /兵部尚书/ },
  { label: '左都督', pattern: /^左都督$/ },
  { label: '都督同知', pattern: /都督同知/ },
  { label: '都督佥事', pattern: /都督佥事/ },
  { label: '锦衣卫指挥使', pattern: /锦衣卫指挥使|指挥使/, institution: /锦衣卫/ },
  { label: '右都督', pattern: /^右都督$/, institution: /五军都督府/ },
];
export function localYamenRoles(prefecture: GeographyPrefecture, county: GeographyCounty, officials: SourceOfficial[]) {
  const isState = county.kind === '州治';
  const isCapitalCounty = !isState && ((prefecture.name === '顺天府' && ['宛平县','大兴县'].includes(county.name)) || (prefecture.name === '应天府' && ['上元县','江宁县'].includes(county.name)));
  const roleIds = isState ? ['supplement-state-magistrate','supplement-state-vice','supplement-state-judge','supplement-state-clerk']
    : isCapitalCounty ? ['supplement-capital-county-magistrate','supplement-capital-county-vice','supplement-capital-county-registrar','official-0437']
    : ['official-0434','official-0435','official-0436','official-0437'];
  return { isState, isCapitalCounty,
    roles: roleIds.flatMap((id, slot) => { const official = officials.find(item => item.record_id === id); return official ? [{ slot, official }] : []; }),
    teachers: officials.filter(item => item.institution === (isState ? '州儒学' : '县儒学')),
  };
}
