'use client';
/* oxlint-disable jsx-a11y/prefer-tag-over-role */
import { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, ChevronRight, MapPin, Shield } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useHistory } from '@/components/history/history-context';
import { frontierAtYear, frontierCaption, frontierRegions, frontierSites, frontierXY, northeastLand, recordsForFrontier, type FrontierRegion } from '@/lib/frontier-regions';
import './frontier-regions.css';

export function FrontierMapLayer({ year, selected, onSelect, onOpen, borders = true }: {
  year: number; selected: string | null; onSelect: (id: string) => void; onOpen?: (id: string) => void; borders?: boolean;
}) {
  return <g className="frontier-map-layer">{frontierRegions.filter(region => !region.inset).map(region => {
    const phase = frontierAtYear(region, year);
    if (phase.mapState === 'not-established') return null;
    const [x,y] = region.mapLabel;
    return <g key={region.id} role="button" tabIndex={0} aria-label={`选择${phase.title}`} aria-pressed={selected === region.id}
      className={`frontier-region frontier-${phase.mapState} ${selected === region.id ? 'is-selected' : ''} ${borders ? '' : 'hide-borders'}`}
      onClick={() => onSelect(region.id)} onDoubleClick={() => onOpen?.(region.id)} onKeyDown={event => {if (event.key === 'Enter' || event.key === ' ') {event.preventDefault();onSelect(region.id);}}}>
      {year >= region.footprintFrom && <path d={region.footprint} className="frontier-area" vectorEffect="non-scaling-stroke"/>}
      {frontierSites(region,year).map(site => {const [sx,sy]=frontierXY(site.lon,site.lat);return <circle key={site.id} cx={sx} cy={sy} r="3.5" className="frontier-dot"/>;})}
      <g transform={`translate(${x} ${y})`} className="frontier-map-tag"><rect x="-65" y="-25" width="130" height="48" rx="5"/><text y="-4" textAnchor="middle">{region.shortName}</text><text y="14" textAnchor="middle" className="frontier-tag-kind">{frontierCaption(region,year)}</text></g>
    </g>;
  })}</g>;
}

export function NortheastInset({ year, onOpen }: {year:number;onOpen:(id:string)=>void}) {
  const region=frontierRegions.find(item=>item.inset);
  if(!region) return null;
  const phase=frontierAtYear(region,year);
  const [x,y]=frontierXY(region.sites[0].lon,region.sites[0].lat,true);
  return <button type="button" className="northeast-inset" onClick={()=>onOpen(region.id)} aria-label="查看东北与奴儿干沿革">
    <span>东北附图 <ChevronRight size={14}/></span>
    <svg viewBox="0 0 640 400" aria-hidden="true"><path d={northeastLand}/><circle cx={x} cy={y} r="8"/><text x={x-15} y={y-17} textAnchor="end">特林</text><text x="195" y="322">辽东</text></svg>
    <small>{phase.mapState==='active'?'奴儿干都司':phase.mapState==='not-established'?'东北地区 · 沿革':'奴儿干旧治 · 沿革'}</small>
  </button>;
}

export function FrontierIndex({ year, selected, onSelect, mobile=false }: {year:number;selected?:string|null;onSelect:(id:string)=>void;mobile?:boolean}) {
  return <section className={`frontier-index ${mobile?'frontier-index-mobile':''}`} aria-label="边区与卫所入口">
    <h3><Shield size={16}/>边区与卫所</h3><div>{frontierRegions.map(region => {
      return <button type="button" key={region.id} onClick={()=>onSelect(region.id)} aria-pressed={selected===region.id}>
        <strong>{region.shortName}</strong><small>{frontierCaption(region,year)}</small><ChevronRight size={16}/>
      </button>;
    })}</div>
  </section>;
}

export function FrontierSummary({region,year,onOpen}:{region:FrontierRegion;year:number;onOpen:()=>void}) {
  const phase=frontierAtYear(region,year);
  return <><div className="side-kicker">{year} 年 · 边区与卫所</div><h2>{region.shortName}</h2><p className="region-full-name">{phase.title}</p><p>{phase.note}</p>
    <dl className="side-stat-list"><div><dt>治所／驻地</dt><dd>{phase.seat}</dd></div><div><dt>图示据点</dt><dd>{frontierSites(region,year).length}</dd></div></dl>
    <button className="primary-action" onClick={onOpen}>查看卫所与人物<ChevronRight size={17}/></button></>;
}

export function FrontierDetail({region,open,onOpenChange}:{region:FrontierRegion;open:boolean;onOpenChange:(open:boolean)=>void}) {
  const {year,records,data,yearStatus,openPerson,retry}=useHistory();
  const phase=frontierAtYear(region,year);
  const sites=frontierSites(region,year);
  const [query,setQuery]=useState('');
  const careers=useMemo(()=>recordsForFrontier(records,region,year),[records,region,year]);
  const people=useMemo(()=>{
    const map=new Map(data?.people.map(person=>[person.id,person]) || []);
    return [...new Set(careers.map(record=>record.person_id))].flatMap(id=>{
      const person=map.get(id); return person?[{person,titles:[...new Set(careers.filter(record=>record.person_id===id).map(record=>record.office_title||''))]}]:[];
    });
  },[careers,data]);
  const visiblePeople=people.filter(item=>`${item.person.name} ${item.titles.join(' ')}`.includes(query.trim()));
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="frontier-dialog">
    <DialogHeader><span className="frontier-eyebrow">{year} 年 · 边区与卫所</span><DialogTitle>{phase.title}</DialogTitle><DialogDescription>{region.description}</DialogDescription></DialogHeader>
    <div className="frontier-detail-scroll">
      <div className="frontier-phase-note"><MapPin size={19}/><div><strong>{phase.seat}</strong><p>{phase.note}</p></div></div>
      <section><h3>主要据点 <small>{sites.length} 处</small></h3><p className="frontier-explanation">按已收录建置列出代表据点；点位按今地概略定位，未列全所属卫所。</p>
        {sites.length ? <div className="frontier-sites">{sites.map(site=><article key={site.id}><MapPin size={16}/><div><h4>{site.name}</h4><p>{site.modernPlace}</p><small>{site.note}</small></div></article>)}</div> : <p className="frontier-empty">本年不套用后期卫所目录，可在下方查看建置沿革。</p>}
      </section>
      <section><h3>{year} 年人物 <small>{people.length} 位已关联</small></h3>
        <p className="frontier-explanation">按本年履历中的任职地点关联，包含年内先后任职；不表示这些人全年同时在任。</p>
        {yearStatus==='loading'?<p className="frontier-empty">正在读取本年人物…</p>:yearStatus==='error'?<button className="frontier-retry" onClick={retry}>人物资料暂未载入，点击重试</button>:<>
          {(people.length>6||query)&&<input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="查找人物或官职" aria-label="查找本年边区人物"/>}
          <div className="frontier-people">{visiblePeople.map(({person,titles})=><button key={person.id} onClick={()=>{onOpenChange(false);openPerson(person.id,()=>onOpenChange(true));}}><span><strong>{person.name}</strong><small>{titles.join(' · ')}</small></span><ArrowRight size={18}/></button>)}</div>
          {!!people.length&&!visiblePeople.length&&<p className="frontier-empty">没有匹配的人物或官职，可清除搜索词查看全部。</p>}
          {!people.length&&<p className="frontier-empty">本年暂无已关联人物，相关官员履历仍在补录。</p>}
        </>}
      </section>
      <section><h3>建置沿革</h3><ol className="frontier-chronology">{region.phases.map(item=><li key={item.from} className={item===phase?'is-current':''}><span>{item.from}—{item.until}</span><div><strong>{item.title}</strong><p>{item.note}</p></div></li>)}</ol></section>
      <section className="frontier-sources"><h3><BookOpen size={17}/>资料依据</h3>{region.sources.map(item=><a href={item.url} target="_blank" rel="noreferrer" key={item.id}><strong>{item.title} ↗</strong><span>{item.supports}</span></a>)}</section>
    </div>
  </DialogContent></Dialog>;
}
