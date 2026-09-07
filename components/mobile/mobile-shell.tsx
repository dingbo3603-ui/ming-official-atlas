'use client';
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, BookOpenText, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Crown, Map as MapIcon, Search, Users, MessageSquareText } from 'lucide-react';
import { useHistory, type HistoryPerson } from '@/components/history/history-context';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { indexPeople, searchPeople } from '@/lib/atlas-search';

export function MobileShell({ children, section, onWorld, onCapital, onPeople, onSources, onSearch, backLabel, onBack, onFeedback }: {
  children: ReactNode; section: 'world' | 'capital' | 'people'; onWorld: () => void; onCapital: () => void; onPeople: () => void;
  onSources: () => void; onSearch: () => void; backLabel?: string; onBack?: () => void; onFeedback?: () => void;
}) {
  return <>
    <header className="phone-header"><span className="phone-brand-seal" aria-hidden>明</span><h1>大明职官图</h1><button className="phone-icon-text" onClick={onSearch} aria-label="搜索人物与官职"><Search size={20}/>搜索</button>{onFeedback&&<button className="phone-feedback-trigger" onClick={onFeedback} aria-label="反馈与建议" title="反馈与建议"><MessageSquareText size={21}/></button>}</header>
    <MobileYearBar />
    {onBack && <button className="phone-back" onClick={onBack}><ArrowLeft size={18}/>{backLabel}</button>}
    <div className="phone-page">{children}</div>
    <nav className="phone-bottom-nav" aria-label="主要导航">
      <button aria-current={section === 'world' ? 'page' : undefined} onClick={onWorld}><MapIcon/><span>天下</span></button>
      <button aria-current={section === 'capital' ? 'page' : undefined} onClick={onCapital}><Crown/><span>京师</span></button>
      <button aria-current={section === 'people' ? 'page' : undefined} onClick={onPeople}><Users/><span>人物</span></button>
      <button onClick={onSources}><BookOpenText/><span>史料</span></button>
    </nav>
  </>;
}

function MobileYearBar() {
  const { year, setYear, data, yearStatus, status, retry } = useHistory();
  const [open, setOpen] = useState(false);
  const label = data?.timeline_years.find(item => item.year === year)?.era_labels.map(item => item.label).join(' / ');
  return <>
    <div className="phone-year-bar" aria-label="当前年份">
      <button className="phone-year-step" aria-label="前一年" disabled={year <= 1368} onClick={() => setYear(year - 1)}><ChevronLeft size={20}/></button>
      <button className="phone-year-current" onClick={() => setOpen(true)} aria-label={`选择年份，当前${label || year}`}><CalendarDays size={18}/><span><strong>{label || `${year}年`}</strong><small>{year} 年{yearStatus === 'loading' ? ' · 载入中' : ''}</small></span><ChevronDown size={17}/></button>
      <button className="phone-year-step" aria-label="后一年" disabled={year >= 1644} onClick={() => setYear(year + 1)}><ChevronRight size={20}/></button>
    </div>
    {status === 'error' && <output className="phone-year-error"><span>本年人物暂未载入</span><button onClick={retry}>重新加载</button></output>}
    {open && <MobileYearPicker onClose={() => setOpen(false)} />}
  </>;
}
function MobileYearPicker({ onClose }: { onClose: () => void }) {
  const { year, setYear, data, bootstrapStatus, retry } = useHistory();
  const [draft, setDraft] = useState(String(year));
  const initialEra = data?.eras.find(era => data.timeline_years.find(item => item.year === year)?.era_labels.some(label => label.era_id === era.id));
  const [selectedEraId, setEraId] = useState('');
  const eraId = selectedEraId || initialEra?.id || '';
  const [error, setError] = useState('');
  const eras = [...(data?.eras || [])].sort((a,b) => a.start_year - b.start_year);
  const years = data?.timeline_years.filter(item => item.era_labels.some(label => label.era_id === eraId)) || [];
  const label = data?.timeline_years.find(item => item.year === Number(draft))?.era_labels.map(item => item.label).join(' / ');
  const choose = () => {
    const next = Number(draft);
    if (!/^\d{4}$/.test(draft) || next < 1368 || next > 1644) { setError('请输入1368至1644之间的年份。'); return; }
    setYear(next); onClose();
  };
  return <Dialog open onOpenChange={value => { if (!value) onClose(); }}><DialogContent className="phone-year-dialog">
    <DialogHeader><DialogTitle>选择年份</DialogTitle><DialogDescription>洪武元年起，至崇祯十七年。</DialogDescription></DialogHeader>
    <div className="phone-sheet-scroll">
      <form className="phone-year-jump" onSubmit={event => { event.preventDefault(); choose(); }}><label htmlFor="phone-year-input">直接输入公元年</label><div><input id="phone-year-input" type="text" inputMode="numeric" maxLength={4} value={draft} onChange={event => { setDraft(event.target.value); setError(''); }} aria-invalid={!!error}/><button type="submit">前往</button></div>{error && <p role="alert">{error}</p>}</form>
      <h3 className="phone-section-title">按年号查阅</h3>
      {bootstrapStatus === 'error' && <MobileNotice error onRetry={retry}>年号资料暂未载入</MobileNotice>}
      {bootstrapStatus === 'loading' && <MobileNotice>正在载入年号…</MobileNotice>}
      <div className="phone-era-grid">{eras.map(era => <button key={era.id} aria-pressed={era.id === eraId} onClick={() => { setEraId(era.id); setDraft(String(era.start_year)); setError(''); }}><strong>{era.name}</strong><small>{era.start_year}—{era.end_year}</small></button>)}</div>
      {years.length > 0 && <label className="phone-regnal-select">年号内年份<select value={years.some(item => item.year === Number(draft)) ? draft : ''} onChange={event => setDraft(event.target.value)}><option value="" disabled>选择年份</option>{years.map(item => <option key={item.year} value={item.year}>{item.era_labels.filter(era => era.era_id === eraId).map(era => era.label).join(' / ')} · {item.year}</option>)}</select></label>}
    </div>
    <button className="phone-primary phone-year-confirm" onClick={choose}>查看{label || `${draft || '所选'}年`}<ChevronRight size={18}/></button>
  </DialogContent></Dialog>;
}

export function MobileNotice({ children, error = false, onRetry }: { children: ReactNode; error?: boolean; onRetry?: () => void }) {
  return <output className={'phone-notice' + (error ? ' is-error' : '')}><span>{children}</span>{onRetry && <button onClick={onRetry}>重试</button>}</output>;
}

export function MobilePeople() {
  const { year, data, records, status, bootstrapStatus, retry, openPerson } = useHistory();
  const [scope, setScope] = useState<'year'|'all'>('year');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(20);
  const yearPeople = useMemo(() => new Set(records.map(record => record.person_id)), [records]);
  const index = useMemo(() => indexPeople(data?.people || []), [data?.people]);
  const matches = useMemo(() => {
    const people: HistoryPerson[] = query.trim() ? searchPeople(index, query) : data?.people || [];
    return scope === 'year' ? people.filter(person => yearPeople.has(person.id)) : people;
  }, [index, query, scope, yearPeople, data?.people]);
  const roles = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const record of records) { const set = map.get(record.person_id) || new Set<string>(); if (record.duty_title || record.office_title) set.add(record.duty_title || record.office_title!); map.set(record.person_id, set); }
    return map;
  }, [records]);
  const activeStatus = scope === 'year' ? status : bootstrapStatus;
  return <section className="phone-people">
    <div className="phone-page-heading"><span>循年识人</span><h2>人物名册</h2><p>从姓名进入仕履，沿年代查阅任职。</p></div>
    <div className="phone-segment" aria-label="人物范围"><button aria-pressed={scope === 'year'} onClick={() => {setScope('year');setLimit(20);}}>{year} 年</button><button aria-pressed={scope === 'all'} onClick={() => {setScope('all');setLimit(20);}}>全部人物</button></div>
    <label className="phone-search-field"><Search size={19}/><input type="search" aria-label="检索人物名册" placeholder="搜索姓名、官职、机构" value={query} onChange={event => {setQuery(event.target.value);setLimit(20);}}/></label>
    {activeStatus !== 'ready' ? <MobileNotice error={activeStatus === 'error'} onRetry={activeStatus === 'error' ? retry : undefined}>{activeStatus === 'error' ? '人物资料暂未载入' : '正在读取人物…'}</MobileNotice> : <>
      <p className="phone-result-count">{matches.length.toLocaleString('zh-CN')} 位人物{scope === 'year' ? ' · 含年内先后任职与相关记载' : ' · 全部已收录年份'}</p>
      <div className="phone-person-list">{matches.slice(0,limit).map(person => <button key={person.id} onClick={() => openPerson(person.id)}><span className="phone-person-initial" aria-hidden>{person.name.slice(0,1)}</span><span className="phone-person-copy"><strong>{person.name}</strong><small>{person.birth_year || person.death_year ? `${person.birth_year ?? '生年待考'}—${person.death_year ?? '卒年待考'}` : '生卒年待考'}</small><span>{scope === 'year' ? [...(roles.get(person.id) || [])].slice(0,3).join(' · ') : person.summary || '查看人物履历'}</span></span><ChevronRight size={18}/></button>)}</div>
      {!matches.length && <MobileNotice>{query ? '没有找到相符的人物，请换个姓名或官职。' : '本年尚未收录人物，可切换至全部人物查找。'}</MobileNotice>}
      {matches.length > limit && <button className="phone-load-more" onClick={() => setLimit(value => value + 20)}>继续显示 · {Math.min(limit,matches.length)} / {matches.length}</button>}
    </>}
  </section>;
}
