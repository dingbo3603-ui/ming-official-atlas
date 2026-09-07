'use client';
import { useState } from 'react';
import { ArrowDown, ChevronRight, ExternalLink, Landmark, Search } from 'lucide-react';
import type { GeographyCounty, GeographyPrefecture, GeographyProvince, GeographySubprefecture } from '@/lib/ming-atlas-v2';
import { prefectureKind } from '@/lib/local-geography';

function CountyNode({county,parent,onCounty}: {county:GeographyCounty;parent:string;onCounty:(county:GeographyCounty)=>void}) {
  return <button className="geo-county-node" onClick={()=>onCounty(county)} aria-label={`${county.name}，隶属${parent}，进入衙署`}><span className="geo-kind">{county.kind}</span><strong>{county.name}</strong>{county.seat&&<small>附郭</small>}<ChevronRight size={16}/></button>;
}
function StateBranch({state,parent,onCounty}: {state:GeographySubprefecture;parent:string;onCounty:(county:GeographyCounty)=>void}) {
  return <section className="geo-state-branch" data-parent-name={parent}>
    <header><span className="geo-kind">府属州</span><strong>{state.name}</strong><button onClick={()=>onCounty({id:`${state.id}-seat`,name:state.name,kind:'州治',seat:true})}>进入州衙 <ChevronRight size={16}/></button></header>
    <p>{parent} <ChevronRight size={13}/> {state.name} <ChevronRight size={13}/> {state.counties.length} 县</p>
    <div className="geo-state-counties">{state.counties.map(county=><CountyNode key={county.id} county={{...county,parentState:{id:state.id,name:state.name}}} parent={state.name} onCounty={onCounty}/>)}</div>
    {!state.counties.length&&<small className="geo-no-children">本条未载属县</small>}
  </section>;
}
function LocalChildren({prefecture,onCounty}: {prefecture:GeographyPrefecture;onCounty:(county:GeographyCounty)=>void}) {
  return <div className="geo-relations">
    {!!prefecture.directCounties.length&&<section className="geo-direct-group"><header><span className="geo-level-number">直属</span><h4>{prefecture.name}直属县</h4><span>{prefecture.directCounties.length} 县 · 直接隶属本府州</span></header><div className="geo-direct-grid">{prefecture.directCounties.map(county=><CountyNode key={county.id} county={county} parent={prefecture.name} onCounty={onCounty}/>)}</div></section>}
    {!!prefecture.subprefectures.length&&<section className="geo-states-group"><header><span className="geo-level-number">属州</span><h4>府属州及其领县</h4><span>{prefecture.subprefectures.length} 州 · 州领县在对应州内展开</span></header><div className="geo-states-grid">{prefecture.subprefectures.map(state=><StateBranch key={state.id} state={state} parent={prefecture.name} onCounty={onCounty}/>)}</div></section>}
    {!prefecture.directCounties.length&&!prefecture.subprefectures.length&&<p className="geo-no-children">现有条目未列下辖州县；不代表历史上没有辖属。</p>}
  </div>;
}
function Focus({province,prefecture,onCounty,onPrefecture}: {province:GeographyProvince;prefecture:GeographyPrefecture;onCounty:(county:GeographyCounty)=>void;onPrefecture?:()=>void}) {
  const kind=prefectureKind(province,prefecture);
  return <div className="geo-selected-focus"><div className="geo-focus-link"><ArrowDown size={20}/></div><header className="geo-selected-heading"><div><span className="geo-kind">{kind}</span><h3>{prefecture.name}</h3><p>{prefecture.seat?`治所：${prefecture.seat}`:`隶属目录：${province.shortName}`}</p></div><div>{onPrefecture&&<button className="geo-outline-button" onClick={onPrefecture}>单独查看此府州 <ChevronRight size={16}/></button>}{kind.includes('州')&&<button className="geo-outline-button" onClick={()=>onCounty({id:`${prefecture.id}-seat`,name:prefecture.name,kind:'州治',seat:true})}>进入州衙 <ChevronRight size={16}/></button>}</div></header><LocalChildren prefecture={prefecture} onCounty={onCounty}/></div>;
}
export function ProvinceHierarchy({province,onPrefecture,onCounty}: {province:GeographyProvince;onPrefecture:(prefecture:GeographyPrefecture)=>void;onCounty:(prefecture:GeographyPrefecture,county:GeographyCounty)=>void}) {
  const [selectedId,setSelectedId]=useState(province.prefectures[0]?.id);
  const [query,setQuery]=useState('');
  const selected=province.prefectures.find(p=>p.id===selectedId)||province.prefectures[0];
  const countyTotal=province.prefectures.reduce((n,p)=>n+p.directCounties.length+p.subprefectures.reduce((m,s)=>m+s.counties.length,0),0);
  const stateTotal=province.prefectures.reduce((n,p)=>n+p.subprefectures.length,0);
  const needle=query.trim();
  const hits=needle?province.prefectures.flatMap(p=>[
    {name:p.name,path:`${province.shortName} › ${p.name}`,prefecture:p,county:null as GeographyCounty|null},
    ...p.directCounties.map(c=>({name:c.name,path:`${province.shortName} › ${p.name} › ${c.name}`,prefecture:p,county:c})),
    ...p.subprefectures.flatMap(s=>[{name:s.name,path:`${province.shortName} › ${p.name} › ${s.name}`,prefecture:p,county:{id:`${s.id}-seat`,name:s.name,kind:'州治',seat:true} as GeographyCounty},...s.counties.map(c=>({name:c.name,path:`${province.shortName} › ${p.name} › ${s.name} › ${c.name}`,prefecture:p,county:{...c,parentState:{id:s.id,name:s.name}}}))]),
  ]).filter(hit=>hit.name.includes(needle)):[];
  return <section className="geo-hierarchy-board geo-explorer animate-rise-in">
    <header className="hierarchy-page-heading"><div><span className="side-kicker">地方建制 · 逐级查阅</span><h2>{province.shortName}府州辖属图</h2><p>{province.prefectures.length} 个府州条目 <i/> {stateTotal} 属州 <i/> {countyTotal} 县</p></div><label className="hierarchy-search"><span>查找府、州或县</span><div><Search size={18}/><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="输入地名，查看完整隶属路径"/></div></label></header>
    {needle&&<section className="geo-search-results" aria-live="polite"><header>找到 {hits.length} 个辖区 <button onClick={()=>setQuery('')}>清除搜索</button></header>{hits.slice(0,60).map((hit,i)=><button key={hit.path+i} onClick={()=>{setSelectedId(hit.prefecture.id);setQuery('');if(hit.county)onCounty(hit.prefecture,hit.county);}}><strong>{hit.name}</strong><span>{hit.path}</span><ChevronRight size={17}/></button>)}{!hits.length&&<p>没有找到这个地名。</p>}</section>}
    <div className="geo-overview-root"><Landmark size={24}/><strong>{province.shortName}</strong><span>选择下辖府州，再查看所属州县</span></div>
    <nav className="geo-prefecture-nav" aria-label={`${province.shortName}下辖府州`}>{province.prefectures.map(p=><button key={p.id} aria-pressed={selected?.id===p.id} onClick={()=>setSelectedId(p.id)}><span className="geo-kind">{prefectureKind(province,p)}</span><strong>{p.name}</strong><small>{p.directCounties.length} 直属县 · {p.subprefectures.length} 属州</small><ChevronRight size={17}/></button>)}</nav>
    {selected&&<Focus province={province} prefecture={selected} onCounty={county=>onCounty(selected,county)} onPrefecture={()=>onPrefecture(selected)}/>}
    <footer className="geo-source-note"><p>直属县归府州直辖；府属州内的县归该州管辖。此图为史料辖属目录，部分条目含沿革，未逐年复原疆域。</p>{province.sourceUrls?.[0]&&<a href={province.sourceUrls[0]} target="_blank" rel="noreferrer">地理志总序 <ExternalLink size={15}/></a>}</footer>
  </section>;
}
export function PrefectureHierarchy({province,prefecture,onCounty,onProvince}: {province:GeographyProvince;prefecture:GeographyPrefecture;onCounty:(county:GeographyCounty)=>void;onProvince:()=>void}) {
  return <section className="geo-hierarchy-board geo-explorer animate-rise-in"><header className="hierarchy-page-heading"><div><span className="side-kicker">地方建制 · 辖属关系</span><h2>{prefecture.name}辖属图</h2><p>直属县与府属州分组显示，州领县列在该州内。</p></div><button className="geo-outline-button" onClick={onProvince}>返回{province.shortName}全部府州</button></header><div className="geo-overview-root"><Landmark size={24}/><button onClick={onProvince}>{province.shortName}</button><ChevronRight size={17}/><strong>{prefecture.name}</strong></div><Focus province={province} prefecture={prefecture} onCounty={onCounty}/><footer className="geo-source-note"><p>点击县节点或州衙入口查看职官。州治属于州本身，不另作一个县。</p></footer></section>;
}
