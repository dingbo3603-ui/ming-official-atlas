'use client';
/* oxlint-disable jsx-a11y/prefer-tag-over-role */
import { useState } from 'react';
import { ChevronRight, Landmark, Map, Minus, Plus, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { mapRegions } from '@/lib/atlas-geography';
import type { GeographyCounty, GeographyData, GeographyPrefecture, GeographyProvince } from '@/lib/ming-atlas-v2';
import { MobileNotice } from './mobile-shell';
import { prefectureKind } from '@/lib/local-geography';
import { useHistory } from '@/components/history/history-context';
import { frontierAtYear, frontierRegions } from '@/lib/frontier-regions';
import { FrontierDetail, FrontierIndex, FrontierMapLayer, NortheastInset } from '@/components/frontier-regions';

export const countyCount = (prefecture: GeographyPrefecture) => prefecture.directCounties.length + prefecture.subprefectures.reduce((n,state) => n + state.counties.length, 0);
export function provincePlaces(province: GeographyProvince) {
  return province.prefectures.flatMap(prefecture => [
    { name: prefecture.name, path: province.shortName, prefecture, county: null as GeographyCounty | null },
    ...prefecture.directCounties.map(county => ({ name: county.name, path: `${province.shortName} · ${prefecture.name}`, prefecture, county })),
    ...prefecture.subprefectures.flatMap(state => [
      { name: state.name, path: `${province.shortName} · ${prefecture.name}`, prefecture, county: {id: `${state.id}-seat`, name: state.name, kind: '州治', seat: true} as GeographyCounty },
      ...state.counties.map(county => ({ name: county.name, path: `${province.shortName} · ${prefecture.name} · ${state.name}`, prefecture, county: {...county,parentState:{id:state.id,name:state.name}} })),
    ]),
  ]);
}

export function MobileWorld({ geography, error, onProvince, onPlace }: {
  geography: GeographyData | null; error: boolean; onProvince: (province: GeographyProvince) => void;
  onPlace: (province: GeographyProvince, prefecture: GeographyPrefecture, county: GeographyCounty | null) => void;
}) {
  const {year}=useHistory();
  const [mapOpen,setMapOpen] = useState(false);
  const [query,setQuery] = useState('');
  const [frontierId,setFrontierId]=useState<string|null>(null);
  const [frontierOpen,setFrontierOpen]=useState(false);
  const frontier=frontierRegions.find(region=>region.id===frontierId);
  const openFrontier=(id:string)=>{setMapOpen(false);setFrontierId(id);setFrontierOpen(true);};
  const frontierHits=query.trim()?frontierRegions.filter(region=>[region.shortName,...region.aliases,...region.sites.flatMap(site=>[site.name,site.modernPlace])].some(name=>name.includes(query.trim()))):[];
  const hits = query.trim() ? geography?.provinces.flatMap(province => provincePlaces(province).filter(item => item.name.includes(query.trim())).map(item => ({...item,province}))) || [] : [];
  return <section>
    <div className="phone-page-heading"><span>山河与地方</span><h2>州省与边区</h2><p>从府州县到辽东、河西，查看地方建置与人物。</p></div>
    <button className="phone-map-cover" onClick={() => setMapOpen(true)} aria-label="打开山川舆图">
      <svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid meet" aria-hidden>{mapRegions.map(region => <path key={region.id} d={region.path}/>)}</svg>
      <span><Map size={20}/><strong>山川舆图</strong><small>两京十三省 · 边区卫所</small><ChevronRight size={22}/></span>
    </button>
    <label className="phone-search-field"><Search size={19}/><input type="search" aria-label="查找府州县与边区卫所" placeholder="查找府州县、辽东或卫所" value={query} onChange={event => setQuery(event.target.value)}/></label>
    {query.trim() ? <div className="phone-place-list">{frontierHits.map(region=><button key={region.id} onClick={()=>openFrontier(region.id)}><span><strong>{region.shortName}</strong><small>{frontierAtYear(region,year).title} · 边区与卫所</small></span><ChevronRight size={18}/></button>)}</div> : <FrontierIndex mobile year={year} onSelect={openFrontier}/>}
    {!geography && <MobileNotice error={error}>{error ? '地方资料暂未载入，请刷新重试。' : '正在读取府州县目录…'}</MobileNotice>}
    {query.trim() ? <><p className="phone-result-count">{hits.length + frontierHits.length} 个地点</p><div className="phone-place-list">{hits.slice(0,40).map(hit => <button key={hit.county?.id || hit.prefecture.id} onClick={() => onPlace(hit.province,hit.prefecture,hit.county)}><span><strong>{hit.name}</strong><small>{hit.path}</small></span><ChevronRight size={18}/></button>)}</div>{hits.length > 40 && <p className="phone-result-count">请输入更完整的地名，缩小结果范围。</p>}{!hits.length && !frontierHits.length && geography && <MobileNotice>未找到相符的地点。</MobileNotice>}</>
      : <div className="phone-province-grid">{geography?.provinces.map((province,index) => <button key={province.id} onClick={() => onProvince(province)}><span className="phone-province-order">{String(index + 1).padStart(2,'0')}</span><strong>{province.shortName}</strong><span>{province.prefectures.length} 府州<ChevronRight size={15}/></span></button>)}</div>}
    {mapOpen && <MobileMap geography={geography} onClose={() => setMapOpen(false)} onProvince={onProvince} onFrontier={openFrontier}/>}
    {frontier && <FrontierDetail key={frontier.id} region={frontier} open={frontierOpen} onOpenChange={setFrontierOpen}/>}
  </section>;
}

function MobileMap({ geography,onClose,onProvince,onFrontier }: {geography: GeographyData | null; onClose: () => void; onProvince: (province: GeographyProvince) => void;onFrontier:(id:string)=>void}) {
  const {year}=useHistory();
  const [zoom,setZoom] = useState(1);
  const [selected,setSelected] = useState('beizhili');
  const province = geography?.provinces.find(item => item.id === selected);
  const frontier=frontierRegions.find(region=>region.id===selected);
  return <Dialog open onOpenChange={value => {if (!value) onClose();}}><DialogContent className="phone-map-dialog">
    <DialogHeader><DialogTitle>山川舆图</DialogTitle><DialogDescription>选择州省或边区，放大后可滑动查看。</DialogDescription></DialogHeader>
    <div className="phone-map-tools"><button aria-label="缩小舆图" disabled={zoom <= 1} onClick={() => setZoom(value => value - .5)}><Minus size={20}/></button><span>{Math.round(zoom * 100)}%</span><button aria-label="放大舆图" disabled={zoom >= 4} onClick={() => setZoom(value => value + .5)}><Plus size={20}/></button><button onClick={() => setZoom(1)}>全图</button></div>
    <div className="phone-map-body"><div className="phone-map-pan"><svg style={{width:`${zoom * 100}%`}} viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid meet" aria-label="明代州省与边区示意">
      <image href="/ming-terrain-v3.png" width="1600" height="1000"/>
      {mapRegions.map(region => <g key={region.id} role="button" tabIndex={0} aria-label={`选择${region.name}`} aria-pressed={selected === region.id} className={selected === region.id ? 'is-selected' : ''} onClick={() => setSelected(region.id)} onKeyDown={event => {if (event.key === 'Enter' || event.key === ' ') {event.preventDefault();setSelected(region.id);}}}><path d={region.path}/><text x={region.x} y={region.y} textAnchor="middle">{region.name}</text></g>)}
      <FrontierMapLayer year={year} selected={selected} onSelect={setSelected}/>
    </svg></div>
    <div className="phone-northeast-row"><NortheastInset year={year} onOpen={onFrontier}/><p>东北远部另见附图，奴儿干旧治与辽东卫所分别列示。</p></div></div>
    <div className="phone-map-choice"><label>选择区域<select value={selected} onChange={event => setSelected(event.target.value)}><optgroup label="两京十三省">{mapRegions.map(region => <option key={region.id} value={region.id}>{region.name}</option>)}</optgroup><optgroup label="边区与卫所">{frontierRegions.map(region=><option key={region.id} value={region.id}>{region.shortName} · {frontierAtYear(region,year).title}</option>)}</optgroup></select></label><button className="phone-primary" disabled={!province&&!frontier} onClick={() => {if(frontier){onFrontier(frontier.id);}else if(province){onClose();onProvince(province);}}}>查看{frontier?.shortName || province?.shortName || '所选区域'}<ChevronRight size={18}/></button><small>省界为万历前后参照；边区虚线为卫所分布示意。</small></div>
  </DialogContent></Dialog>;
}

export function MobileProvince({ province,onPrefecture,onCounty }: {province: GeographyProvince;onPrefecture:(prefecture:GeographyPrefecture)=>void;onCounty:(prefecture:GeographyPrefecture,county:GeographyCounty)=>void}) {
  const [query,setQuery] = useState('');
  const hits = query.trim() ? provincePlaces(province).filter(item => item.name.includes(query.trim())) : [];
  return <section><div className="phone-page-heading"><span>地方辖属 · 省</span><h2>{province.shortName}</h2><p>{province.name}</p></div>
    <div className="phone-local-stats"><span><strong>{province.prefectures.length}</strong>府州条目</span><span><strong>{province.prefectures.reduce((n,p) => n + countyCount(p),0)}</strong>属县</span></div>
    <label className="phone-search-field"><Search size={19}/><input aria-label={`查找${province.shortName}辖区`} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索本省府、州、县"/></label>
    <div className="phone-place-list">{query.trim() ? hits.map(hit => <button key={hit.county?.id || hit.prefecture.id} onClick={() => hit.county ? onCounty(hit.prefecture,hit.county) : onPrefecture(hit.prefecture)}><span><strong>{hit.name}</strong><small>{hit.path}</small></span><ChevronRight size={19}/></button>) : province.prefectures.map(prefecture => <button key={prefecture.id} onClick={() => onPrefecture(prefecture)}><span className="phone-kind-mark">{prefectureKind(province,prefecture)}</span><span><strong>{prefecture.name}</strong><small>{prefecture.directCounties.length} 直属县 · {prefecture.subprefectures.length} 属州{prefecture.seat ? ` · 治${prefecture.seat}` : ''}</small></span><ChevronRight size={19}/></button>)}</div>
    {query.trim() && !hits.length && <MobileNotice>本省未找到相符的辖区。</MobileNotice>}
    <p className="phone-footnote">辖属依已收录地方志与地理志目录，尚非逐年疆域复原。</p>
  </section>;
}

export function MobilePrefecture({province,prefecture,onCounty}: {province:GeographyProvince;prefecture:GeographyPrefecture;onCounty:(county:GeographyCounty)=>void}) {
  const kind = prefectureKind(province,prefecture);
  const [query,setQuery] = useState('');
  const needle = query.trim();
  const direct = prefecture.directCounties.filter(county => !needle || county.name.includes(needle));
  const states = prefecture.subprefectures.filter(state => !needle || state.name.includes(needle) || state.counties.some(county => county.name.includes(needle)));
  const countyButton = (county: GeographyCounty) => <button key={county.id} onClick={() => onCounty(county)}><strong>{county.name}</strong><span>{county.kind}{county.seat ? ' · 附郭' : ''}<ChevronRight size={15}/></span></button>;
  return <section><div className="phone-page-heading"><span>{province.shortName} · {kind}</span><h2>{prefecture.name}</h2><p>{prefecture.seat ? `治所 · ${prefecture.seat}` : `隶属 ${province.shortName}`}</p></div>
    {kind.includes('州') && <button className="phone-primary" onClick={() => onCounty({id:`${prefecture.id}-seat`,name:prefecture.name,kind:'州治',seat:true})}><Landmark size={18}/>进入州衙<ChevronRight size={18}/></button>}
    <label className="phone-search-field"><Search size={19}/><input type="search" aria-label="查找下辖州县" value={query} onChange={event => setQuery(event.target.value)} placeholder="查找下辖州县"/></label>
    {direct.length > 0 && <section className="phone-local-section"><h3 className="phone-section-title">直属县 <small>直接隶属{prefecture.name}</small></h3><div className="phone-county-grid">{direct.map(countyButton)}</div></section>}
    {states.length > 0 && <section className="phone-local-section"><h3 className="phone-section-title">府属州 <small>展开后查看州领县</small></h3><div className="phone-state-list">{states.map(state => <details key={state.id + (needle ? '-search' : '')} open={needle ? true : undefined}><summary><span><strong>{state.name}</strong><small>{prefecture.name}所属 · {state.counties.length} 县</small></span><ChevronDownIcon/></summary><div className="phone-state-content"><button className="phone-outline" onClick={() => onCounty({id:`${state.id}-seat`,name:state.name,kind:'州治',seat:true})}>进入{state.name}州衙<ChevronRight size={17}/></button><div className="phone-county-grid">{state.counties.filter(county => !needle || state.name.includes(needle) || county.name.includes(needle)).map(county => countyButton({...county,parentState:{id:state.id,name:state.name}}))}</div></div></details>)}</div></section>}
    {!direct.length && !states.length && <MobileNotice>{needle ? '没有相符的下辖州县。' : '现有目录暂未列出下辖州县。'}</MobileNotice>}
  </section>;
}
function ChevronDownIcon(){return <ChevronRight className="phone-disclosure-arrow" size={20}/>;}
