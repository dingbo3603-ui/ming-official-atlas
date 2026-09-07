'use client';
import { useState } from 'react';
import { ChevronRight, Crown, Landmark } from 'lucide-react';
import type { SourceOfficial } from '@/app/page';
import { OfficePeopleLabel, useHistory } from '@/components/history/history-context';
import { courtRoleMatchers, localYamenRoles } from '@/lib/scene-officials';
import type { GeographyCounty, GeographyPrefecture, GeographyProvince, CapitalInstitution } from '@/lib/ming-atlas-v2';
import type { Ministry } from '@/lib/official-hierarchy';
import { MobileNotice } from './mobile-shell';

function MobileOfficeCard({ official, label, chief = false, onSelect, province, prefecture, county }: {
  official: SourceOfficial; label?: string; chief?: boolean; onSelect: (official: SourceOfficial) => void;
  province?: GeographyProvince; prefecture?: GeographyPrefecture; county?: GeographyCounty;
}) {
  return <button className={'phone-office-card' + (chief ? ' is-chief' : '')} onClick={() => onSelect(official)}>
    <span className="phone-office-icon" aria-hidden>{chief ? <Crown size={24}/> : <Landmark size={21}/>}</span>
    <span className="phone-office-copy"><OfficePeopleLabel scene officialId={official.record_id} officialTitle={official.title} placeName={county?.name} provinceName={province?.shortName} prefectureName={prefecture?.name}/><strong>{label || official.title}</strong><small>{official.rank || '品级另见职制说明'}</small></span><ChevronRight size={19}/>
  </button>;
}

export function MobileYamen({province,prefecture,county,officials,onSelect}: {
  province: GeographyProvince; prefecture: GeographyPrefecture; county: GeographyCounty; officials: SourceOfficial[]; onSelect:(official:SourceOfficial)=>void;
}) {
  const {isState,isCapitalCounty,roles,teachers} = localYamenRoles(prefecture,county,officials);
  const {year} = useHistory();
  const card = (official: SourceOfficial, chief = false) => <MobileOfficeCard key={official.record_id} official={official} chief={chief} onSelect={onSelect} province={province} prefecture={prefecture} county={county}/>;
  return <section>
    <header className="phone-scene-cover phone-yamen-cover"><span>{province.shortName} · {prefecture.name}{county.parentState ? ` · ${county.parentState.name}` : ''}</span><h2>{county.name}衙署</h2><p>{year} 年 · {isState ? '州制' : isCapitalCounty ? '京县制' : '县制'}</p></header>
    <div className="phone-office-stack">{roles.filter(item => item.slot === 0).map(item => card(item.official,true))}</div>
    <h3 className="phone-section-title">佐贰与首领官</h3><div className="phone-office-stack">{roles.filter(item => item.slot !== 0).map(item => card(item.official))}</div>
    {!roles.length && <MobileNotice>官职目录正在载入。</MobileNotice>}
    {teachers.length > 0 && <details className="phone-disclosure"><summary>{isState ? '州' : '县'}儒学<ChevronRight size={18}/></summary><div className="phone-office-stack">{teachers.map(official => card(official))}</div></details>}
    <p className="phone-footnote">姓名取本年、本地任官记载，含年内先后任职。暂无人名表示资料尚缺，不等于职位空缺。</p>
  </section>;
}

export function MobileCourt({ officials,onSelect }: {officials:SourceOfficial[];onSelect:(official:SourceOfficial)=>void}) {
  const {year,data} = useHistory();
  const [side,setSide] = useState<'civil'|'military'>('civil');
  const emperor = officials.find(item => item.record_id === 'history-emperor');
  const roles = courtRoleMatchers.flatMap((matcher,slot) => {
    if (slot === 0 && year < 1402) return [];
    const official = officials.find(item => matcher.pattern.test(item.title) && (!matcher.institution || matcher.institution.test(`${item.institution} ${item.department || ''}`)));
    const period = data?.institution_periods?.find(item => item.institution_id === official?.institution_id)?.periods.find(item => item.start_year <= year && item.end_year >= year);
    if (period && ['not_established','abolished'].includes(period.state)) return [];
    return official && (side === 'civil' ? slot < 7 : slot >= 7) ? [{official,label:matcher.label}] : [];
  });
  return <section><header className="phone-scene-cover phone-court-cover"><span>{year} 年 · 文东武西</span><h2>文武朝班</h2><p>按官职查阅本年人物</p></header>
    {emperor && <MobileOfficeCard official={emperor} chief onSelect={onSelect}/>}
    <div className="phone-segment" aria-label="文武班列"><button aria-pressed={side === 'civil'} onClick={() => setSide('civil')}>文班</button><button aria-pressed={side === 'military'} onClick={() => setSide('military')}>武班</button></div>
    <div className="phone-office-stack">{roles.map(role => <MobileOfficeCard key={role.official.record_id} official={role.official} label={role.label} onSelect={onSelect}/>)}</div>
    <p className="phone-footnote">以明中后期朝班职官为参照，姓名随所选年份查询；尚未逐年复原设官及实际到场名单。</p>
    <details className="phone-disclosure"><summary>朝班与史料说明<ChevronRight size={18}/></summary><p>这是官职类型与年度人物的查阅入口，含年内先后和兼任记载。朝仪及品阶依原典另列。</p><a href="/data/ming-official-rank-audit.html" target="_blank" rel="noreferrer">查看朝班与官品依据</a></details>
  </section>;
}

export function MobileCapitalOverview({ year,era,transition,emperorNames,ministries,auxiliaries,onSelect,onSili,onEmperor,onCourt,branchError,onRetry }: {
  year:number;era:'hongwu'|'late-ming';transition:boolean;emperorNames:string;ministries:Ministry[];auxiliaries:CapitalInstitution[];
  onSelect:(id:string)=>void;onSili:()=>void;onEmperor:()=>void;onCourt:()=>void;branchError:boolean;onRetry:()=>void;
}) {
  const duties: Record<string,string> = {'吏部':'铨选与考课','户部':'户籍与财赋','礼部':'典礼与学校','兵部':'武选与军政','刑部':'刑名与法令','工部':'营造与河工'};
  return <>
    <div className="phone-page-heading"><span>{year < 1421 ? '南京' : '北京'} · {year} 年</span><h2>中央官署</h2><p>从官署进入分司、职官与人物履历。</p></div>
    <button className="phone-sovereign-card" onClick={onEmperor}><Crown size={27}/><span><small>皇帝</small><strong>{emperorNames || '人物资料待载'}</strong></span><ChevronRight size={20}/></button>
    <div className="phone-capital-entries"><button disabled={transition} onClick={() => onSelect(era === 'hongwu' ? 'central-secretariat' : 'cabinet')}><strong>{transition ? '中书省已废' : era === 'hongwu' ? '中书省' : '内阁'}</strong><span>{transition ? '内阁尚未形成' : era === 'hongwu' ? '丞相与属官' : '阁臣与辅政职事'}</span></button><button onClick={onCourt}><strong>文武朝班</strong><span>本年官职人物<ChevronRight size={16}/></span></button></div>
    <h3 className="phone-section-title">六部</h3>
    {!ministries.length && <MobileNotice error={branchError} onRetry={branchError ? onRetry : undefined}>{branchError ? '六部分支暂未载入' : '正在载入六部资料…'}</MobileNotice>}
    <div className="phone-ministry-grid">{ministries.map(ministry => <button key={ministry.ministry_id} onClick={() => onSelect(ministry.ministry_id)}><span className="phone-ministry-seal" aria-hidden>{ministry.name[0]}</span><span><strong>{ministry.name}</strong><small>{duties[ministry.name]}</small></span><ChevronRight size={17}/></button>)}</div>
    <h3 className="phone-section-title">其他官署</h3><div className="phone-agency-grid">{auxiliaries.map(institution => <button key={institution.id} onClick={() => institution.id === 'sili-jian' ? onSili() : onSelect(institution.id)}><strong>{institution.name}</strong><ChevronRight size={16}/></button>)}</div>
    <p className="phone-footnote">机构名称随年份调整。分支职制依条目注明时代查阅。</p>
  </>;
}
