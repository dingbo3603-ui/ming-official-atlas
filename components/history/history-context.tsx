'use client';

import {
  createContext, useCallback, useContext, useEffect, useId, useMemo,
  useRef, useState, type CSSProperties, type SyntheticEvent, type ReactNode,
} from 'react';
import {
  ArrowRight, BookOpen, CalendarDays, ChevronLeft, ChevronRight,
  ExternalLink, Landmark, LoaderCircle, RefreshCw, Search, Users,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import './history-v6.css';
import { datasetUrl, historyApiBase } from '@/lib/history-api';
import { readHistoryJson as requestJson } from '@/lib/history-reader';
import { recordsForOffice, scenePersonIds, type OfficeScope } from '@/lib/office-people';
import { usePhoneLayout } from '@/hooks/use-phone-layout';

export interface HistorySource {
  id: string;
  title: string;
  url?: string | null;
}
export interface HistoryPerson {
  id: string;
  name: string;
  summary?: string | null;
  birth_year?: number | null;
  death_year?: number | null;
  source_ids?: string[];
  type?: string;
  search_terms?: string;
  biographical_date_note?: string;
}
export interface HistoryRecord {
  id: string;
  person_id: string;
  office_title?: string | null;
  institution?: string | null;
  start_year?: number | null;
  end_year?: number | null;
  attested_year?: number | null;
  date_note?: string | null;
  status?: string | null;
  record_kind?: string;
  record_role?: string;
  office_ids?: string[];
  institution_ids?: string[];
  duty_title?: string;
  review_status?: string;
  source_ids?: string[];
}
export interface HistoryEra {
  id: string;
  name: string;
  start_year: number;
  end_year: number;
}
export interface HistoryTimelineYear {
  year: number;
  era_labels: { label: string; era_id: string; regnal_year: number }[];
  note?: string;
}
export interface SiliOffice {
  id: string;
  name: string;
  organization_id?: string;
  rank?: string | null;
  rank_note?: string;
  count?: number | null;
  count_each?: number;
  count_note?: string;
  duties?: string;
  phase?: string;
  established_year?: number | null;
  attested_from_year?: number;
  valid_until_reorganization_year?: number;
  earliest_possible_era?: string;
  chronology_basis?: string;
  source_conflict?: string;
  source_ids?: string[];
  display_order?: number;
  data_placeholder_only?: boolean;
}
export interface HistoryData {
  people: HistoryPerson[];
  sources: HistorySource[];
  eras: HistoryEra[];
  timeline_years: HistoryTimelineYear[];
  sili_offices: SiliOffice[];
  meta?: Record<string, unknown>;
  revision?: string;
  institution_periods?: { institution_id: string; periods: InstitutionPeriod[] }[];
  empty_slots_evidence?: {year:number;office_id:string;display_text:string;source_ids:string[]}[];
}
export interface InstitutionPeriod {
  start_year: number; end_year: number; display_name: string;
  state: string; note: string; source_ids: string[]; use_current_office_template: boolean;
}
export type HistoryStatus = 'loading' | 'ready' | 'error';
export interface HistoryContextValue {
  year: number;
  setYear: (year: number) => void;
  records: HistoryRecord[];
  data: HistoryData | null;
  status: HistoryStatus;
  openPerson: (id: string, onReturn?: () => void) => void;
  retry: () => void;
  error: string | null;
  yearStatus: HistoryStatus;
  bootstrapStatus: HistoryStatus;
}
interface PersonResponse { person: HistoryPerson; records: HistoryRecord[] }
const MIN_YEAR = 1368;
const MAX_YEAR = 1644;
const DEFAULT_YEAR = 1566;
const HistoryContext = createContext<HistoryContextValue | null>(null);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '请求未能完成，请重试。';
}
function isAbort(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}
function apiUrl(base: string, query: Record<string, string>) {
  const separator = base.includes('?') ? '&' : '?';
  return base + separator + new URLSearchParams(query).toString();
}
function hasArray(value: unknown, key: string): boolean {
  return !!value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>)[key]);
}

/** The provider owns the one global person dialog. No person list is fabricated locally. */
export function HistoryProvider({
  children, apiBase = historyApiBase,
}: { children: ReactNode; apiBase?: string }) {
  const [year, setYearState] = useState(DEFAULT_YEAR);
  const currentYear = useRef(DEFAULT_YEAR);
  const [data, setData] = useState<HistoryData | null>(null);
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [bootstrapStatus, setBootstrapStatus] = useState<HistoryStatus>('loading');
  const [yearStatus, setYearStatus] = useState<HistoryStatus>('loading');
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [yearError, setYearError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const yearRequestId = useRef(0);
  const yearAbort = useRef<AbortController | null>(null);
  const bootstrapRequestId = useRef(0);
  const [personId, setPersonId] = useState<string | null>(null);
  const [personResult, setPersonResult] = useState<PersonResponse | null>(null);
  const [personStatus, setPersonStatus] = useState<HistoryStatus>('loading');
  const [personError, setPersonError] = useState<string | null>(null);
  const [personReload, setPersonReload] = useState(0);
  const personRequestId = useRef(0);
  const personAbort = useRef<AbortController | null>(null);
  const yearCache = useRef(new Map<number, HistoryRecord[]>());
  const personCache = useRef(new Map<string, PersonResponse>());
  const personReturn = useRef<(() => void) | undefined>(undefined);

  const setYear = useCallback((next: number) => {
    if (!Number.isFinite(next)) return;
    const clamped = Math.max(MIN_YEAR, Math.min(MAX_YEAR, Math.trunc(next)));
    if (clamped === currentYear.current) return;
    currentYear.current = clamped;
    yearRequestId.current += 1;
    yearAbort.current?.abort();
    // Clear synchronously: a new year must never be shown with the previous year's names.
    const cached = yearCache.current.get(clamped);
    setRecords(cached || []);
    setYearError(null);
    setYearStatus(cached ? 'ready' : 'loading');
    setYearState(clamped);
  }, []);
  const retry = useCallback(() => {
    yearCache.current.clear(); personCache.current.clear();
    setBootstrapStatus('loading'); setYearStatus('loading');
    setBootstrapError(null); setYearError(null);
    setReload(value => value + 1);
  }, []);
  const openPerson = useCallback((id: string, onReturn?: () => void) => {
    if (!id) return;
    personReturn.current = onReturn;
    personRequestId.current += 1;
    personAbort.current?.abort();
    const cached = personCache.current.get(id);
    setPersonResult(cached || null);
    setPersonError(null);
    setPersonStatus(cached ? 'ready' : 'loading');
    setPersonId(id);
    setPersonReload(value => value + 1);
  }, []);
  const closePerson = useCallback(() => {
    personRequestId.current += 1;
    personAbort.current?.abort();
    setPersonId(null);
    setPersonResult(null);
    const onReturn = personReturn.current;
    personReturn.current = undefined;
    onReturn?.();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++bootstrapRequestId.current;
    requestJson<HistoryData>(apiUrl(apiBase, { action: 'bootstrap' }), controller.signal)
      .then(result => {
        if (requestId !== bootstrapRequestId.current || controller.signal.aborted) return;
        if (!['people', 'sources', 'eras', 'timeline_years', 'sili_offices'].every(key => hasArray(result, key))) {
          throw new Error('基础史料数据不完整，请重试。');
        }
        setData(result);
        setBootstrapStatus('ready');
      })
      .catch(error => {
        if (isAbort(error) || requestId !== bootstrapRequestId.current) return;
        setBootstrapError(errorMessage(error));
        setBootstrapStatus('error');
      });
    return () => controller.abort();
  }, [apiBase, reload]);

  useEffect(() => {
    if (yearCache.current.has(year)) return;
    const controller = new AbortController();
    yearAbort.current = controller;
    const requestId = ++yearRequestId.current;
    const timer = window.setTimeout(() => { requestJson<{ year: number; records: HistoryRecord[] }>(
      apiUrl(apiBase, { action: 'year', year: String(year) }), controller.signal,
    ).then(result => {
      if (requestId !== yearRequestId.current || controller.signal.aborted) return;
      if (Number(result.year) !== year || !hasArray(result, 'records')) {
        throw new Error('年度史料与所选年份不一致，请重试。');
      }
      setRecords(result.records);
      yearCache.current.set(year, result.records);
      setYearStatus('ready');
    }).catch(error => {
      if (isAbort(error) || requestId !== yearRequestId.current) return;
      setYearError(errorMessage(error));
      setYearStatus('error');
    }); }, 100);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [apiBase, year, reload]);

  useEffect(() => {
    if (!personId || personCache.current.has(personId)) return;
    const controller = new AbortController();
    personAbort.current = controller;
    const requestId = ++personRequestId.current;
    requestJson<PersonResponse>(
      apiUrl(apiBase, { action: 'person', id: personId }), controller.signal,
    ).then(result => {
      if (requestId !== personRequestId.current || controller.signal.aborted) return;
      if (!result.person || result.person.id !== personId || !hasArray(result, 'records')) {
        throw new Error('人物史料与所选人物不一致，请重试。');
      }
      setPersonResult(result);
      personCache.current.set(personId, result);
      setPersonStatus('ready');
    }).catch(error => {
      if (isAbort(error) || requestId !== personRequestId.current) return;
      setPersonError(errorMessage(error));
      setPersonStatus('error');
    });
    return () => controller.abort();
  }, [apiBase, personId, personReload]);

  const status: HistoryStatus = bootstrapStatus === 'error' || yearStatus === 'error'
    ? 'error' : bootstrapStatus === 'loading' || yearStatus === 'loading' ? 'loading' : 'ready';
  const value = useMemo<HistoryContextValue>(() => ({
    year, setYear, records, data, status, openPerson, retry,
    error: bootstrapError || yearError, yearStatus, bootstrapStatus,
  }), [year, setYear, records, data, status, openPerson, retry, bootstrapError, yearError, yearStatus, bootstrapStatus]);

  return (
    <HistoryContext.Provider value={value}>
      {children}
      <PersonDialog key={personId || 'closed'}
        open={personId !== null} onClose={closePerson} result={personResult}
        status={personStatus} error={personError}
        retry={() => { setPersonStatus('loading'); setPersonError(null); if (personId) personCache.current.delete(personId); setPersonReload(value => value + 1); }}
      />
    </HistoryContext.Provider>
  );
}
export function useHistory(): HistoryContextValue {
  const value = useContext(HistoryContext);
  if (!value) throw new Error('useHistory 必须在 HistoryProvider 内使用。');
  return value;
}

export function useInstitutionPeriod(institutionId: string) {
  const { year, data } = useHistory();
  return data?.institution_periods?.find(item=>item.institution_id===institutionId)?.periods
    .find(item=>item.start_year<=year && item.end_year>=year);
}

/** Actual work and personal titles are independent of the reference office catalogue. */
type EvidenceBucket = 'undated' | 'dated' | 'related';
type EvidenceIndex = { offices: Record<string, Partial<Record<EvidenceBucket,string[]>>>; institutions: Record<string, Partial<Record<EvidenceBucket,string[]>>> };
export function OtherEvidencePeople({ kind, identifier, currentIds = [] }: {kind:'offices'|'institutions';identifier:string;currentIds?:string[]}) {
  const { data, openPerson } = useHistory();
  const [index,setIndex] = useState<EvidenceIndex|null>(null);
  const [loadError,setLoadError] = useState(false);
  const [attempt,setAttempt] = useState(0);
  const [tab,setTab] = useState<EvidenceBucket>('undated');
  const [query,setQuery] = useState('');
  const [limit,setLimit] = useState(8);
  useEffect(() => {
    const controller = new AbortController();
    requestJson<EvidenceIndex>(datasetUrl('office-evidence-index'),controller.signal).then(result => {
      if (!result.offices || !result.institutions) throw new Error('Missing evidence index');
      if (!controller.signal.aborted) {setIndex(result);setLoadError(false);}
    }).catch(() => {if (!controller.signal.aborted) setLoadError(true);});
    return () => controller.abort();
  },[attempt]);
  const people = useMemo(() => new Map((data?.people || []).map(person => [person.id,person])),[data?.people]);
  const references = index?.[kind][identifier];
  const current = new Set(currentIds);
  const buckets: Record<EvidenceBucket,string[]> = {
    undated: references?.undated || [],
    dated: (references?.dated || []).filter(id => !current.has(id)),
    related: references?.related || [],
  };
  const tabs: EvidenceBucket[] = ['undated','dated','related'];
  const active = buckets[tab].length ? tab : tabs.find(key => buckets[key].length) || tab;
  const labels: Record<EvidenceBucket,string> = {undated:'未系年人物',dated:'其他年份人物',related:'关联待核人物'};
  const notes: Record<EvidenceBucket,string> = {
    undated:'已有来源，任职或授衔年份尚未明确。先展示人物，点开可查完整记载。',
    dated:'其他年份有相关记载的人物。兼衔、赠衔和任免事件均保留原文说明。',
    related:'按来源中的官名与机构对应，尚未逐条复核；可能涉及兼衔、外任或同名官职。点开查看原始履历。',
  };
  const filtered = buckets[active].map(id => people.get(id)).filter(person => person && (!query.trim() || [person.name,person.search_terms,person.summary].join(' ').includes(query.trim())));
  if (!index && !loadError) return <output className="history-muted evidence-index-loading">正在读取历年相关人物…</output>;
  if (loadError) return <p className="history-muted">相关人物索引暂未载入。<button className="history-text-button" onClick={() => {setLoadError(false);setAttempt(value => value+1);}}>重新加载</button></p>;
  if (!tabs.some(key => buckets[key].length)) return null;
  return <section className="history-other-evidence" aria-label="历年与待核人物资料">
    <div className="history-section-heading"><h3>更多人物记载</h3><span>不限所选年份</span></div>
    <div className="evidence-tabs" aria-label="人物资料分组">{tabs.filter(key => buckets[key].length).map(key => <button key={key} aria-pressed={active===key} onClick={() => {setTab(key);setLimit(8);setQuery('');}}>{labels[key]} <span>{buckets[key].length}</span></button>)}</div>
    <p className="history-footnote">{notes[active]}此处名单不表示本年在任。</p>
    {buckets[active].length>8 && <label className="evidence-person-search"><Search size={17}/><input type="search" aria-label="检索相关人物" placeholder="查找这组人物" value={query} onChange={event=>{setQuery(event.target.value);setLimit(8);}}/></label>}
    <div className="evidence-person-grid">{filtered.slice(0,limit).map(person=>person&&<button key={person.id} onClick={()=>openPerson(person.id)}><strong>{person.name}</strong><small>{active==='undated'?'年份待核':active==='related'?'关联待核':'查看履历'}</small><ArrowRight size={16}/></button>)}</div>
    {!filtered.length&&<p className="history-muted">没有匹配的人物。</p>}
    {filtered.length>limit&&<button className="history-text-button" onClick={()=>setLimit(value=>value+24)}>再显示 {Math.min(24,filtered.length-limit)} 位 · 共 {filtered.length} 位</button>}
  </section>;
}

export function InstitutionPeople({ institutionId, previewLimit = 12 }: {institutionId:string;previewLimit?:number}) {
  const { year, records, data, status, error, retry, openPerson } = useHistory();
  const [expanded, setExpanded] = useState(false);
  const members = records.filter(row=>row.institution_ids?.includes(institutionId));
  const groups = new Map<string,HistoryRecord[]>();
  for (const row of members) groups.set(row.person_id,[...(groups.get(row.person_id)||[]),row]);
  const entries = [...groups.entries()].sort((a,b)=>Number(b[1].some(r=>r.duty_title==='首辅'))-Number(a[1].some(r=>r.duty_title==='首辅')));
  const labels=(rows:HistoryRecord[])=>{
    const active=rows.some(row=>row.record_kind!=='event')?rows.filter(row=>row.record_kind!=='event'):rows;
    const titles=[...new Set(active.map(row=>row.duty_title==='大学士阁衔'?row.office_title?.replace('（内阁阁衔）',''):row.duty_title||row.office_title))];
    return titles.filter(title=>title!=='阁臣'||titles.length===1).sort((a,b)=>Number(b==='首辅')-Number(a==='首辅'));
  };
  return <section className="history-institution-people" aria-label={`${year}年本署人物`}>
    <div className="history-section-heading"><h3>{year}年 · 本署人物</h3><span>{entries.length} 位有记载</span></div>
    <FetchNotice status={status} error={error} retry={retry}/>
    <div className="history-institution-grid">{entries.slice(0,expanded?entries.length:previewLimit).map(([id,rows])=><button key={id} className="history-institution-person" onClick={()=>openPerson(id)}>
      <span className="history-institution-person-top"><strong>{data?.people.find(p=>p.id===id)?.name||'查看人物'}</strong><ArrowRight size={17}/></span>
      {labels(rows).map(title=><span className="history-institution-duty" key={title}>{title}</span>)}
      <small>查看职务变动与原典</small>
    </button>)}</div>
    {entries.length>previewLimit&&<button className="history-text-button" onClick={()=>setExpanded(v=>!v)}>{expanded?'收起':'展开全部本署人物'}</button>}
    {status==='ready'&&!entries.length&&<p className="history-muted">本年人物仍待补录。</p>}
    <p className="history-footnote">按机构归属与实际职事显示；官衔未细分到具体殿阁或司署的记载仍保留在这里。年内先后任职、兼衔和任免事件请点开查看。</p>
    <OtherEvidencePeople key={institutionId} kind="institutions" identifier={institutionId} currentIds={[...groups.keys()]}/>
  </section>;
}

function FetchNotice({
  status, error, retry, loadingText = '正在读取史料…',
}: { status: HistoryStatus; error?: string | null; retry: () => void; loadingText?: string }) {
  if (status === 'ready') return null;
  return (
    <div className={'history-fetch history-fetch--' + status} role={status === 'error' ? 'alert' : 'status'}>
      {status === 'loading' ? <LoaderCircle className="history-spin" size={20} aria-hidden /> : <BookOpen size={20} aria-hidden />}
      <span>{status === 'loading' ? loadingText : error || '史料读取失败。'}</span>
      {status === 'error' && <button className="history-button history-button--small" type="button" onClick={retry}>
        <RefreshCw size={16} aria-hidden /> 重试
      </button>}
    </div>
  );
}
function safeUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch { return null; }
}
export function HistorySourceLinks({ ids }: { ids?: string[] }) {
  const { data, bootstrapStatus, retry } = useHistory();
  if (bootstrapStatus === 'loading' && !data) return <span className="history-muted">正在读取出处目录…</span>;
  if (bootstrapStatus === 'error') return <span className="history-muted">出处目录读取失败。 <button type="button" className="history-text-button" onClick={retry}>重试</button></span>;
  const unique = [...new Set(ids || [])];
  if (!unique.length) return <span className="history-muted">本条出处待补。</span>;
  return <ul className="history-source-list">
    {unique.map(id => {
      const source = data?.sources.find(item => item.id === id);
      const url = safeUrl(source?.url);
      return <li key={id}>{url
        ? <a href={url} target="_blank" rel="noopener noreferrer"><BookOpen size={16} aria-hidden /><span>{source?.title || '史料出处'}</span><ExternalLink size={14} aria-hidden /></a>
        : <span className="history-muted">{source?.title || '史料出处待补'}{source?.title && '（暂无在线链接）'}</span>}
      </li>;
    })}
  </ul>;
}
function recordKind(record: HistoryRecord) {
  const roles: Record<string, string> = {
    concurrent_title_or_duty: '兼衔或兼差', acting_office: '署理职务',
    honorary_title: '授衔记载', posthumous_or_honorary: '赠衔或荣典',
    not_assumed: '未赴任记载', nonservice_event: '任免相关事件',
  };
  const role = roles[record.record_role || ''];
  if (role) return role;
  if (record.record_kind === 'event') return '任免与授衔记载';
  if (record.record_kind === 'attestation') return '在职见载';
  if (record.record_kind === 'tenure') return '仕履记录';
  return '史料记载';
}
function recordDate(record: HistoryRecord): string {
  if (record.start_year != null && record.end_year != null) {
    return record.start_year === record.end_year ? record.start_year + '年' : record.start_year + '—' + record.end_year + '年';
  }
  if (record.start_year != null) return record.start_year + '年起，去任年待考';
  if (record.end_year != null) return '起任年待考，' + record.end_year + '年止';
  if (record.attested_year != null) return record.attested_year + '年见载';
  return '任职年月待考';
}
const knownStatusLabels: Record<string, string> = {
  approximate: '日期或职任范围仍有待考之处',
  verified: '已据史料核实', confirmed: '已据史料核实',
  attested: '有史料见载', uncertain: '尚待核实', unknown: '尚待考证',
  research_pending: '尚待考证', partial: '任期边界未全', era_only: '仅知时代',
};
function RecordCard({ record, sources = false }: { record: HistoryRecord; sources?: boolean }) {
  const { records } = useHistory();
  const current = sources && records.some(item => item.id === record.id);
  return <article className={'history-record' + (current ? ' history-record-current' : '')}>
    <div className="history-record-top"><span className="history-tag">{recordKind(record)}</span><span className="history-record-date">{recordDate(record)}</span></div>
    <h4>{record.office_title || '职名待考'}</h4>
    {record.institution && <p>{record.institution}</p>}
    {record.date_note && <p className="history-record-note">{record.date_note}</p>}
    {current && <span className="history-tag">所选年内记载</span>}
    {record.status && knownStatusLabels[record.status] && <p className="history-muted">{knownStatusLabels[record.status]}</p>}
    {record.review_status?.startsWith('cbdb') && <p className="history-muted">据资料库收录，尚未逐条复核。</p>}
    {record.record_kind === 'event' && <p className="history-muted">此条记一次任免或仕履事件，不代表全年在任。</p>}
    {record.record_kind === 'attestation' && <p className="history-muted">见载时间可考，完整起讫未必明确。</p>}
    {sources && <HistorySourceLinks ids={record.source_ids} />}
  </article>;
}
function PersonDialog({
  open, onClose, result, status, error, retry,
}: { open: boolean; onClose: () => void; result: PersonResponse | null; status: HistoryStatus; error: string | null; retry: () => void }) {
  const {data, year, setYear} = useHistory();
  const isPhone = usePhoneLayout();
  const [filter, setFilter] = useState('');
  const [fromYear, setFromYear] = useState('');
  const [toYear, setToYear] = useState('');
  const [expanded, setExpanded] = useState<string|null>(null);
  const sorted = useMemo(() => [...(result?.records || [])].sort((a, b) => {
    const aYear = a.start_year ?? a.attested_year ?? a.end_year ?? Number.POSITIVE_INFINITY;
    const bYear = b.start_year ?? b.attested_year ?? b.end_year ?? Number.POSITIVE_INFINITY;
    return aYear - bYear || (a.start_year == null && a.end_year != null ? -1 : 0) - (b.start_year == null && b.end_year != null ? -1 : 0) || a.id.localeCompare(b.id);
  }), [result]);
  const matches = sorted.filter(record => {
    const start=record.start_year??record.attested_year??record.end_year;
    const end=record.end_year??record.attested_year??record.start_year;
    return (!filter.trim() || [record.office_title,record.institution,record.date_note].join(' ').includes(filter.trim()))
      && (!fromYear || (end!=null&&end>=Number(fromYear))) && (!toYear || (start!=null&&start<=Number(toYear)));
  });
  const dated = matches.filter(record => record.start_year != null || record.end_year != null || record.attested_year != null);
  const undated = matches.filter(record => record.start_year == null && record.end_year == null && record.attested_year == null);
  const careerRows=(items:HistoryRecord[])=>items.map(record=>{
    const first=record.start_year??record.attested_year??record.end_year;
    const era=first?data?.timeline_years.find(item=>item.year===first)?.era_labels.map(item=>item.label).join(' / '):null;
    const current=(record.start_year!=null&&record.end_year!=null&&record.start_year<=year&&record.end_year>=year)||first===year;
    return <article key={record.id} className={'career-table-row'+(current?' is-current':'')}>
      <button className="career-row-summary" aria-expanded={expanded===record.id} onClick={()=>setExpanded(expanded===record.id?null:record.id)}><span className="career-date"><strong>{recordDate(record)}</strong><small>{era||'原始纪年见详情'}</small></span><span className="career-position"><strong>{record.office_title}</strong><small>{record.institution||'机构待核'} · {recordKind(record)}</small></span><span className="career-evidence-count">{record.source_ids?.length||0} 项史源 <ChevronRight size={16}/></span></button>
      {expanded===record.id&&<div className="career-row-detail"><RecordCard record={record} sources/>{first!=null&&first>=MIN_YEAR&&first<=MAX_YEAR&&<button className="history-button history-button--small" onClick={()=>{setYear(first);if(isPhone)onClose();}}>切换至 {first} 年</button>}</div>}
    </article>;
  });
  const person = result?.person;
  const life = person
    ? (person.birth_year == null && person.death_year == null ? '生卒年待考' : (person.birth_year ?? '生年待考') + ' — ' + (person.death_year ?? '卒年待考'))
    : '';
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
    <DialogContent className="history-dialog history-person-dialog">
      <DialogHeader className="history-dialog-header">
        <p className="history-eyebrow">人物仕履</p>
        <DialogTitle className="history-dialog-title">{person?.name || (status === 'error' ? '人物史料暂不可用' : '正在打开人物')}</DialogTitle>
        <DialogDescription className="history-dialog-description">{person ? life : '依据已收录史料查看任职与出处。'}</DialogDescription>
      </DialogHeader>
      <div className="history-dialog-scroll">
        <FetchNotice status={status} error={error} retry={retry} loadingText="正在读取人物仕履…" />
        {status === 'ready' && person && <>
          {person.summary && <p className="history-person-summary">{person.summary}</p>}
          {person.biographical_date_note&&<p className="history-footnote">{person.biographical_date_note}</p>}
          <div className="career-query-bar"><label><Search size={17}/><input type="search" aria-label="检索人物履历" placeholder="搜索官职、机构或记载" value={filter} onChange={event=>setFilter(event.target.value)}/></label><div><input type="number" aria-label="履历起始年份" placeholder="起始年" value={fromYear} onChange={event=>setFromYear(event.target.value)}/><span>至</span><input type="number" aria-label="履历截止年份" placeholder="截止年" value={toYear} onChange={event=>setToYear(event.target.value)}/><button onClick={()=>{setFilter('');setFromYear('');setToYear('');}}>重置</button></div></div>
          <div className="history-section-heading"><h3>仕履年表</h3><span>{matches.length} / {sorted.length} 条记载 · 点击展开原文与出处</span></div>
          {sorted.length ? <><div className="career-table"><div className="career-table-heading"><span>年代 · 年号</span><span>官职与任职机构</span><span>史源详情</span></div>{careerRows(dated)}</div>{undated.length > 0 && <><div className="history-section-heading"><h3>尚未明确系年的履历</h3><span>{undated.length} 条 · 不据此推定任职年份</span></div><div className="career-table">{careerRows(undated)}</div></>}{!matches.length&&<p className="history-empty">没有符合筛选条件的履历。</p>}</>
            : <p className="history-empty">尚未收录可核实的仕履记录。</p>}
          <details className="history-source-details">
            <summary><BookOpen size={18} aria-hidden />人物史料</summary>
            <HistorySourceLinks ids={person.source_ids} />
          </details>
          <p className="history-footnote">缺少起讫年份表示任期边界待考，不等于一直在任，也不等于职位空缺。</p>
        </>}
      </div>
    </DialogContent>
  </Dialog>;
}

export function HistoryTimeline() {
  const { year, setYear, data, records, status, error, retry, bootstrapStatus } = useHistory();
  const [jumpDraft, setJumpDraft] = useState<{year:number;value:string} | null>(null);
  const jumpYear = jumpDraft?.year === year ? jumpDraft.value : String(year);
  const [jumpError, setJumpError] = useState('');
  const [rosterOpen, setRosterOpen] = useState(false);
  const rangeId = useId();
  const yearEntry = data?.timeline_years.find(item => Number(item.year) === year);
  const eras = [...(data?.eras || [])].sort((a, b) => a.start_year - b.start_year);
  const peopleCount = new Set(records.map(record => record.person_id)).size;
  const progress = ((year - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100;
  const currentEra=eras.find(era=>yearEntry?.era_labels.some(label=>label.era_id===era.id))||eras.find(era=>era.start_year<=year&&era.end_year>=year);
  function jump(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = Number(jumpYear);
    if (!/^\d{4}$/.test(jumpYear.trim()) || !Number.isInteger(next) || next < MIN_YEAR || next > MAX_YEAR) {
      setJumpError('请输入1368至1644之间的年份。');
      return;
    }
    setJumpError('');
    setYear(next);
  }
  return <section className="history-timeline" aria-label="明代年度时间线">
    <div className="history-timeline-top">
      <div className="history-time-heading">
        <span className="history-eyebrow"><CalendarDays size={17} aria-hidden /> 明代年表</span>
        <div className="history-year-heading">
          <strong>{year}</strong>
          <div><span>{yearEntry?.era_labels.map(item => item.label).join(' · ') || (bootstrapStatus === 'loading' ? '年号读取中' : '年号资料待核实')}</span><small>公元年度 · 洪武至崇祯</small></div>
        </div>
      </div>
      <button className="history-button history-button--primary" type="button" onClick={() => setRosterOpen(true)}>
        <Users size={19} aria-hidden />年度人物名册
        {status === 'ready' && <span className="history-count">{peopleCount}</span>}
        <ArrowRight size={17} aria-hidden />
      </button>
    </div>
    <div className="history-era-strip" aria-label="按年号跳转">
      {eras.map(era => {
        const active = !!yearEntry?.era_labels.some(label => label.era_id === era.id);
        return <button key={era.id} type="button" className={'history-era' + (active ? ' is-active' : '')}
          aria-pressed={active} title={era.name + '：' + era.start_year + '—' + era.end_year}
          onClick={() => setYear(era.start_year)}>
          <span>{era.name}</span><small>{era.start_year}</small>
        </button>;
      })}
    </div>
    <div className="history-year-controls">
      {currentEra&&<label className="history-regnal-picker"><span>{currentEra.name}年间</span><select aria-label="选择年号内的年份" value={year} onChange={event=>setYear(Number(event.target.value))}>{data?.timeline_years.filter(item=>item.era_labels.some(label=>label.era_id===currentEra.id)).map(item=><option key={item.year} value={item.year}>{item.era_labels.filter(label=>label.era_id===currentEra.id).map(label=>label.label).join(' / ')} · {item.year}</option>)}</select></label>}
      <button type="button" className="history-icon-button" aria-label="前一年" disabled={year <= MIN_YEAR} onClick={() => setYear(year - 1)}><ChevronLeft size={22} aria-hidden /></button>
      <div className="history-range-group">
        <label className="history-sr-only" htmlFor={rangeId}>选择年份</label>
        <input id={rangeId} className="history-range" type="range" min={MIN_YEAR} max={MAX_YEAR} step={1} value={year}
          aria-valuetext={year + '年，' + (yearEntry?.era_labels.map(item => item.label).join('、') || '年号待核实')}
          style={{ '--history-progress': progress + '%' } as CSSProperties}
          onChange={event => setYear(Number(event.target.value))} />
        <div className="history-range-ends"><span>1368 · 大明建立</span><span>1644 · 北京明廷终结</span></div>
      </div>
      <button type="button" className="history-icon-button" aria-label="后一年" disabled={year >= MAX_YEAR} onClick={() => setYear(year + 1)}><ChevronRight size={22} aria-hidden /></button>
      <form className="history-jump" onSubmit={jump}>
        <label className="history-sr-only" htmlFor={rangeId + '-jump'}>跳转至公元年份</label>
        <input id={rangeId + '-jump'} inputMode="numeric" maxLength={4} value={jumpYear}
          aria-invalid={!!jumpError} aria-describedby={jumpError ? rangeId + '-error' : undefined}
          onChange={event => {setJumpDraft({year,value:event.target.value});setJumpError('');}} />
        <button type="submit" className="history-button history-button--small">跳转</button>
      </form>
    </div>
    {jumpError && <p id={rangeId + '-error'} className="history-error-text" role="alert">{jumpError}</p>}
    <div className="history-timeline-bottom">
      <div><p>{yearEntry?.note || '年号按常用年度对照展示；农历岁首与公历元旦不同，交接年可能有多位人物先后任职。'}</p><p>已收录 {data?.people.length ?? '—'} 份人物档案，逐年任职仍在补录；未收录不等于空缺。 <a href="/data/history-provenance.html" target="_blank" rel="noreferrer">史料来源与整理规则</a></p></div>
      <button type="button" className="history-text-button" disabled={year === DEFAULT_YEAR} onClick={() => setYear(DEFAULT_YEAR)}>回到1566</button>
    </div>
    <FetchNotice status={status} error={error} retry={retry} loadingText={'正在读取' + year + '年记载…'} />
    {rosterOpen && <HistoryRoster open onClose={() => setRosterOpen(false)} />}
  </section>;
}

export function HistoryRoster({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { year, data, records, status, error, retry, openPerson, bootstrapStatus } = useHistory();
  const [mode, setMode] = useState<'year' | 'library'>('year');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(40);
  const searchId = useId();
  const peopleMap = useMemo(() => new Map((data?.people || []).map(person => [person.id, person])), [data]);
  const recordGroups = useMemo(() => {
    const groups = new Map<string, HistoryRecord[]>();
    for (const record of records) groups.set(record.person_id, [...(groups.get(record.person_id) || []), record]);
    return groups;
  }, [records]);
  const needle = query.trim().toLocaleLowerCase();
  const visiblePeople = useMemo(() => {
    const list = mode === 'year'
      ? [...recordGroups.keys()].map(id => peopleMap.get(id)).filter((person): person is HistoryPerson => !!person)
      : [...peopleMap.values()];
    return list.filter(person => {
      const entries = mode === 'year' ? recordGroups.get(person.id) || [] : [];
      const haystack = [person.name, person.summary || '', person.search_terms || '', ...entries.flatMap(item => [item.office_title || '', item.institution || '', item.date_note || ''])].join(' ').toLocaleLowerCase();
      return !needle || haystack.includes(needle);
    }).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  }, [mode, recordGroups, peopleMap, needle]);
  const missingPersonCount = [...recordGroups.keys()].filter(id => !peopleMap.has(id)).length;
  const activeStatus = mode === 'year' ? status : bootstrapStatus;
  const selectPerson = (id: string) => { onClose(); openPerson(id); };
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
    <DialogContent className="history-dialog history-roster-dialog">
      <DialogHeader className="history-dialog-header">
        <p className="history-eyebrow">循年识人</p>
        <DialogTitle className="history-dialog-title">{mode === 'year' ? year + '年 · 人物名册' : '人物史料库'}</DialogTitle>
        <DialogDescription className="history-dialog-description">
          {mode === 'year' ? '本年任职、任免事件及在职见载；记录数量不代表全年同时在任人数。' : '搜索全部已收录人物。此列表不受所选年份限制。'}
        </DialogDescription>
      </DialogHeader>
      <div className="history-roster-tools">
        <fieldset className="history-tabs" aria-label="名册范围">
          <button type="button" aria-pressed={mode === 'year'} className={mode === 'year' ? 'is-active' : ''} onClick={() => {setMode('year');setLimit(40);}}>年内记载</button>
          <button type="button" aria-pressed={mode === 'library'} className={mode === 'library' ? 'is-active' : ''} onClick={() => {setMode('library');setLimit(40);}}>人物库</button>
        </fieldset>
        <div className="history-search"><Search size={18} aria-hidden /><label className="history-sr-only" htmlFor={searchId}>搜索人物、官职或机构</label>
          <input id={searchId} type="search" value={query} placeholder="搜索姓名、官职、任职机构" onChange={event => {setQuery(event.target.value);setLimit(40);}} />
        </div>
      </div>
      <div className="history-dialog-scroll">
        <FetchNotice status={activeStatus} error={error} retry={retry} />
        {activeStatus === 'ready' && <>
          <p className="history-result-count">{visiblePeople.length} 位人物{mode === 'year' && ' · ' + records.length + '条年内记载'}</p>
          {visiblePeople.length ? <div className="history-roster-table"><div className="roster-table-heading"><span>人物</span><span>{mode==='year'?'年内官职与职事':'人物简介'}</span><span>履历</span></div>{visiblePeople.slice(0,limit).map(person => {
            const entries = recordGroups.get(person.id) || [];
            const roles=[...new Set(entries.map(record=>record.duty_title||record.office_title).filter(Boolean))];
            return <button className="roster-table-person" key={person.id} onClick={()=>selectPerson(person.id)}><span className="roster-person-name"><span className="history-person-mark" aria-hidden>{person.name.slice(0,1)}</span><strong>{person.name}</strong></span><span className="roster-person-roles">{mode==='year'?<>{roles.slice(0,4).map(role=><span key={role}>{role}</span>)}{roles.length>4&&<small>另 {roles.length-4} 项职事</small>}</>:<small>{person.summary||'点击查看已收录任官履历与史源。'}</small>}</span><span className="roster-person-action">查看年表 <ArrowRight size={17}/></span></button>;
          })}</div> : <div className="history-empty"><Users size={30} aria-hidden /><p>{needle ? '未找到相符的人物。' : mode === 'year' ? '本年尚未收录可核实的人物记载。' : '人物史料尚未收录。'}</p><span>尚未收录不等于当年无人任职。</span></div>}
          {limit < visiblePeople.length && <button type="button" className="history-button history-load-more" onClick={() => setLimit(value=>value+40)}>继续显示人物（已显示 {limit} / {visiblePeople.length}）</button>}
          {mode === 'year' && missingPersonCount > 0 && <p className="history-footnote">{missingPersonCount} 位记录关联的人物简介尚未完整同步，请重试或稍后查看。</p>}
        </>}
      </div>
    </DialogContent>
  </Dialog>;
}

/** No fuzzy office-title matching. With a place, institution must also name that exact place. */
export function OfficeHolders({ officialId, officialTitle, placeName, provinceName, prefectureName }: OfficeScope) {
  const { records, data, year, status, error, retry, openPerson } = useHistory();
  const matches = recordsForOffice(records, { officialId, officialTitle, placeName, provinceName, prefectureName });
  return <section className="history-office-holders" aria-label={year + '年官职人物'}>
    <div className="history-section-heading"><h3><Users size={18} aria-hidden />{year}年相关记载</h3></div>
    <FetchNotice status={status} error={error} retry={retry} />
    {status === 'ready' && (matches.length ? <div className="history-office-list">{matches.map(record => {
      const person = data?.people.find(item => item.id === record.person_id);
      return <article className="history-office-person" key={record.id}>
        <button type="button" className="history-name-button" onClick={() => openPerson(record.person_id)}>{person?.name || '查看人物记录'}<ArrowRight size={16} aria-hidden /></button>
        <span className="history-tag">{recordKind(record)}</span>
        <p>{recordDate(record)}</p>
        {record.date_note && <p className="history-muted">{record.date_note}</p>}
        {record.institution && <p className="history-muted">{record.institution}</p>}
        {record.record_kind === 'event' && <p className="history-muted">任职事件，不作全年在任判断。</p>}
      </article>;
    })}</div> : <div className="history-empty history-empty--compact"><p>{data?.empty_slots_evidence?.find(item=>item.year===year&&item.office_id===officialId)?.display_text||'本年人名尚待补录'}</p><span>{placeName ? '暂无能同时对应此官职、此地与本年的确切记载。' : '本年尚无与此官职明确对应的任职记录。'} 未收录不等于空缺。</span></div>)}
    {!placeName && <OtherEvidencePeople key={officialId} kind="offices" identifier={officialId} currentIds={matches.map(row=>row.person_id)}/>}
  </section>;
}

/** Text only, suitable inside an existing office button. */
export function OfficePeopleLabel({ officialId, officialTitle, placeName, provinceName, prefectureName, scene = false }: OfficeScope & { scene?: boolean }) {
  const { records, data, year, status } = useHistory();
  const ids = scenePersonIds(recordsForOffice(records, { officialId, officialTitle, placeName, provinceName, prefectureName }));
  const names = data?.people.filter(person => ids.has(person.id)).map(person => person.name) || [];
  if (scene) {
    const label = status === 'loading' ? '人名载入中' : status === 'error' ? '人名暂不可用' : names.length ? names.join('、') : '本年暂无人名';
    return <span className={'scene-person-names' + (status !== 'ready' || !names.length ? ' is-unavailable' : '')} title={`${year}年${placeName || ''}相关人物：${label}`}>{label}</span>;
  }
  return <small className="history-office-preview">{year} · {status === 'loading' ? '读取中' : status === 'error' ? '人物暂不可用' : names.length ? names.join('、') : '人名待补录'}</small>;
}

export function SiliPanel() {
  const { year, data, records, status, error, retry, openPerson } = useHistory();
  const titleId = useId();
  const offices = (data?.sili_offices || []).filter(office => !office.data_placeholder_only);
  const modern = offices.filter(office => office.display_order != null).sort((a, b) => (a.display_order ?? 99) - (b.display_order ?? 99));
  const old = offices.filter(office => office.attested_from_year != null);
  const support = offices.filter(office => office.display_order == null && office.attested_from_year == null);
  const siliIds = new Set((data?.sili_offices || []).map(office => office.id));
  const related = records.filter(record => record.office_ids?.some(id => siliIds.has(id)));
  const relatedIds = [...new Set(related.map(record => record.person_id))];
  const sourceIds = [...new Set(offices.flatMap(office => office.source_ids || []))];
  const beforeFoundation = year < 1384;
  const earlyOffices = old.filter(office =>
    (office.attested_from_year ?? Number.POSITIVE_INFINITY) <= year &&
    (office.valid_until_reorganization_year == null || year < office.valid_until_reorganization_year),
  );
  const renderOffice = (office: SiliOffice, index: number) => <article className="history-sili-office" key={office.id}>
    <span className="history-sili-order" aria-hidden>{String(index + 1).padStart(2, '0')}</span>
    <div>
      <h4>{office.name}</h4>
      <div className="history-sili-meta">
        {office.rank && <span>{office.rank}</span>}
        {office.count != null && <span>{office.count}员</span>}
        {office.count_each != null && <span>各{office.count_each}员</span>}
        {office.count_note && <span>{office.count_note}</span>}
      </div>
      {office.duties && <p>{office.duties}</p>}
      {office.rank_note && <p className="history-muted">{office.rank_note}</p>}
      {office.phase && <p className="history-muted">{office.phase}</p>}
      {office.chronology_basis && <p className="history-muted">{office.chronology_basis}</p>}
      {office.source_conflict && <details className="history-inline-details"><summary>职制考辨</summary><p>{office.source_conflict}</p></details>}
      <details className="history-inline-details"><summary>查看史料</summary><HistorySourceLinks ids={office.source_ids} /></details>
    </div>
  </article>;
  return <section className="history-sili-panel" aria-labelledby={titleId}>
    <div className="history-sili-heading"><span className="history-sili-emblem"><Landmark size={28} aria-hidden /></span><div><p className="history-eyebrow">内廷 · 宦官衙门</p><h2 id={titleId}>司礼监</h2></div><span className="history-sili-year">{year}年</span></div>
    <FetchNotice status={status} error={error} retry={retry} />
    {beforeFoundation ? <div className="history-empty"><p>本年尚未设立司礼监</p><span>司礼监设于洪武十七年（1384）。早期内廷另有机构，不将后来的职制倒置于此年。</span></div> : <>
      <p className="history-sili-intro">由宫廷礼仪事务发展而来的内廷机构。中后期掌理章奏与御前勘合，秉笔等依阁票办理批朱，具体职权仍受皇帝支配。</p>
      {year === 1384 && <p className="history-footnote">洪武十七年是初设当年，不表示自公历元旦起即已存在。</p>}
      {year < 1436 ? <>
        <div className="history-section-heading"><h3>可核实的早期设置</h3></div>
        <div className="history-sili-offices">{earlyOffices.map(renderOffice)}</div>
        <p className="history-footnote">本区列已知早期官制沿革，不以中后期掌印、秉笔的完整分工代替本年的制度。</p>
      </> : <>
        <div className="history-section-heading"><h3>中后期职任与分工</h3><span>制度说明</span></div>
        <p className="history-footnote">下列为中后期职制概览，不表示每项职名自某年起都已固定。掌印地位在前；提督的职责和出现时间另有考证。</p>
        <div className="history-sili-offices">{modern.filter(office => !(year < 1522 && office.earliest_possible_era === '嘉靖')).map(renderOffice)}</div>
        {support.length > 0 && <details className="history-source-details"><summary>其他属员</summary><div className="history-sili-offices">{support.map(renderOffice)}</div></details>}
      </>}
      <div className="history-section-heading"><h3>本年关联人物</h3><span>按确切官职关联</span></div>
      {status === 'ready' && (relatedIds.length ? <div className="history-related-people">{relatedIds.map(id => {
        const person = data?.people.find(item => item.id === id);
        return <button type="button" className="history-button" key={id} onClick={() => openPerson(id)}>{person?.name || '查看人物'}<ArrowRight size={16} aria-hidden /></button>;
      })}</div> : <p className="history-empty history-empty--compact">本年司礼监具体任职人选尚待史料核实。人物曾在御前或曾任司礼，并不能自动确定这一年的具体职任。</p>)}
    </>}
    <details className="history-source-details">
      <summary><BookOpen size={18} aria-hidden />沿革、旧制与史料</summary>
      <p className="history-footnote">1384年初设令、丞；1395年重定太监、少监、监丞等旧制。旧制品级与中后期掌印、秉笔等具体职任须分别理解。</p>
      <div className="history-sili-offices">{old.map(renderOffice)}</div>
      <HistorySourceLinks ids={sourceIds} />
      <p className="history-footnote">东厂是另一机构；宦官兼掌东厂，不表示东厂与司礼监是同一个衙门。</p>
    </details>
  </section>;
}
