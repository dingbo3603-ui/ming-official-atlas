'use client';
/* oxlint-disable next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import { BookOpenText, ChevronRight, Crown, Landmark, Network, ScrollText, X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SiliPanel, OfficeHolders, InstitutionPeople, useHistory } from '@/components/history/history-context';
import { datasetUrl } from '@/lib/history-api';
import { readHistoryJson } from '@/lib/history-reader';
import { capitalInstitutions, type CapitalEra, type CapitalInstitution } from '@/lib/ming-atlas-v2';
import type { SourceOfficial } from '@/app/page';

import { OfficialHierarchy } from '@/components/official-hierarchy';
import { centralHierarchyIds, ministryRecordIds, officialsByIds, type Ministry, type CentralHierarchy } from '@/lib/official-hierarchy';
import { MobileCapitalOverview } from '@/components/mobile/mobile-scenes';
import { InstitutionDirectory } from '@/components/institution-directory';

const shortDuty: Record<string,string> = { '吏部':'铨选 · 考课', '户部':'户籍 · 财赋', '礼部':'礼仪 · 学校', '兵部':'武选 · 军政', '刑部':'刑名 · 法令', '工部':'营造 · 河工' };
const findInstitution = (id: string) => capitalInstitutions.find(item => item.id === id)!;

export function CapitalCouncil({ era, selectedInstitution, setSelectedInstitution, officials, onSelectOfficial, onCourt, onNorthZhili, open, setOpen, mobile = false }: {
  mobile?: boolean;
  era: CapitalEra;
  selectedInstitution: CapitalInstitution; setSelectedInstitution: (institution: CapitalInstitution) => void;
  officials: SourceOfficial[]; onSelectOfficial: (official: SourceOfficial, onReturn?: () => void) => void;
  onCourt: () => void; onNorthZhili: () => void; open: boolean; setOpen: (value: boolean) => void;
}) {
  const { year, records, data } = useHistory();
  const [catalogMode, setCatalogMode] = useState(false);
  const periodFor = (id:string) => data?.institution_periods?.find(item=>item.institution_id===id)?.periods.find(item=>item.start_year<=year&&item.end_year>=year);
  const selectedPeriod = periodFor(selectedInstitution.id);
  const selectedName = (catalogMode ? null : selectedPeriod?.display_name) || selectedInstitution.name;
  const [showTemplate, setShowTemplate] = useState(false);
  const [showCabinetCatalog, setShowCabinetCatalog] = useState(false);
  const useTemplate = catalogMode || selectedPeriod?.use_current_office_template !== false || showTemplate;
  const occupiedIds=new Set(records.filter(record=>record.record_kind!=='event').flatMap(record=>record.office_ids||[]));
  const temporalOfficials = officials.filter(official=>catalogMode||selectedInstitution.id!=='cabinet'||showCabinetCatalog||occupiedIds.has(official.record_id)).map(official=>{
    const name = !catalogMode && official.title_periods?.find(item=>item.from<=year&&item.until>=year)?.name;
    return name ? {...official,title:name} : official;
  });
  const [siliOpen, setSiliOpen] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [sovereignOpen, setSovereignOpen] = useState(false);
  const transition = year >= 1380 && year < 1402;
  const emperors = records.filter(record => record.office_title === '皇帝');
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [centralHierarchies,setCentralHierarchies] = useState<CentralHierarchy[]>([]);
  const [branchLoadError, setBranchLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      readHistoryJson<{ministries: Ministry[]}>(datasetUrl('ming-ministry-branches'), controller.signal),
      readHistoryJson<{institutions: CentralHierarchy[]}>(datasetUrl('ming-central-hierarchy'), controller.signal),
    ]).then(([branches, hierarchy]) => {
      if (!Array.isArray(branches.ministries) || !Array.isArray(hierarchy.institutions)) throw new Error('Invalid hierarchy');
      if (!controller.signal.aborted) {
        setMinistries(branches.ministries); setCentralHierarchies(hierarchy.institutions); setBranchLoadError(false);
      }
    }).catch(() => {if (!controller.signal.aborted) setBranchLoadError(true);});
    return () => controller.abort();
  }, [loadAttempt]);
  const [branchId, setBranchId] = useState<string|null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [query, setQuery] = useState('');
  const rosterScroll = useRef<HTMLDivElement>(null);
  const selectedMinistry = ministries.find(item => item.ministry_id === selectedInstitution.id);
  const selectedBranch = selectedMinistry?.branches.find(item => item.id === branchId);
  const selectedCentral=centralHierarchies.find(item=>item.institution_id===(centralHierarchyIds[selectedInstitution.id]||selectedInstitution.id));
  const scopeIds=selectedBranch?.record_ids || (selectedMinistry ? ministryRecordIds(selectedMinistry) : selectedCentral?.groups.flatMap(group=>group.record_ids));
  const institutionOfficials=officials.filter(official=>official.institution_id===selectedInstitution.id);
  const roster=selectedBranch ? officialsByIds(selectedBranch.record_ids,officials) : officialsByIds([...new Set([...(scopeIds||[]),...institutionOfficials.map(item=>item.record_id)])],officials);
  const auxiliaries = ['hanlin','censorate','grand-court','transmission-office','five-commissions','jinyiwei','sili-jian'].flatMap(id => capitalInstitutions.filter(item => item.id === id)).filter(item=>{
    const period=periodFor(item.id);
    return !['not_established','abolished'].includes(period?.state||'') && (item.id!=='sili-jian'||year>=1384);
  }).map(item=>({...item,name:periodFor(item.id)?.display_name||item.name}));
  const select = (institution: CapitalInstitution, branch: string|null = null, fullCatalog = false) => {
    setCatalogMode(fullCatalog); setSelectedInstitution(institution); setBranchId(branch); setQuery(''); setShowHistory(fullCatalog); setShowTemplate(false); setShowCabinetCatalog(false); setOpen(true);
  };
  const selectBranch = (id: string|null) => {setBranchId(id); setQuery('');rosterScroll.current?.scrollTo({top:0});};
  const viewOfficial = (official: SourceOfficial) => { setOpen(false); onSelectOfficial(official, () => setOpen(true)); };

  return <section className={mobile ? 'phone-council' : 'council-board animate-rise-in'}>
    {mobile ? <MobileCapitalOverview year={year} era={era} transition={transition} emperorNames={emperors.map(r=>data?.people.find(p=>p.id===r.person_id)?.name).filter(Boolean).join(' / ')} ministries={ministries} auxiliaries={auxiliaries} onSelect={id => select(findInstitution(id))} onSili={() => setSiliOpen(true)} onEmperor={() => setSovereignOpen(true)} onCourt={onCourt} branchError={branchLoadError} onRetry={() => {setBranchLoadError(false);setLoadAttempt(value => value + 1);}}/> : <>
    <header className="council-heading"><div><span className="side-kicker">京师 · 官制参照与年度人物</span><h2>{era === 'hongwu' ? '洪武前期 · 中书统六部' : '六部与中央官署'}</h2></div><div className="council-actions"><button className="council-secondary" onClick={()=>setDirectoryOpen(true)}><BookOpenText size={18}/>全明职官目录</button><button className="council-secondary" onClick={onNorthZhili}><Landmark size={18}/>北直隶府州</button><span className="council-year-reference">{year < 1421 ? '南京' : '北京'} · {year}年人物</span></div></header>

    <div className={`council-canopy ${era === 'hongwu' ? 'is-hongwu' : ''}`}>
      <button disabled={transition} className="council-adviser" onClick={() => select(findInstitution(era === 'hongwu' ? 'central-secretariat' : 'cabinet'))}><ScrollText size={23}/><span><b>{transition ? '中书省已废' : era === 'hongwu' ? '中书省' : '内阁'}</b><small>{transition ? '内阁尚未形成 · 六部承旨' : era === 'hongwu' ? '左右丞相 · 统领六部' : '殿阁大学士 · 辅政票拟'}</small></span><ChevronRight size={19}/></button>
      <button className="council-sovereign" onClick={()=>setSovereignOpen(true)}><Crown size={28}/><strong>皇帝</strong><span>{emperors.map(r=>data?.people.find(p=>p.id===r.person_id)?.name).filter(Boolean).join(' / ') || '人物资料待载'}</span></button>
      <button className="council-court-entry" onClick={onCourt}><Crown size={23}/><span><b>文武朝班</b><small>进入朝堂 · 查看班列</small></span><ChevronRight size={20}/></button>
    </div>
    {era === 'hongwu' && <div className="council-early-link"><span/><button onClick={() => select(findInstitution('central-secretariat'))}>中书省 <small>1368—1379</small></button></div>}

    {ministries.length === 0 && <output className="institution-context-note">{branchLoadError ? <>分支资料暂未载入。<button onClick={() => {setBranchLoadError(false);setLoadAttempt(value => value + 1);}}>重新加载</button></> : '正在展开六部分支…'}</output>}
    <div className="ministries-scroll"><div className="ministry-tree" aria-label="六部及其分支机构图">
      {ministries.map(ministry => {
        const institution = findInstitution(ministry.ministry_id);
        const period = periodFor(institution.id);
        const divisions = ministry.branches.filter(branch => branch.kind === 'qinglisi');
        return <article className="ministry-column" key={ministry.ministry_id}>
          <button className="ministry-node" onClick={() => select(institution)}><span className="ministry-seal">{ministry.name[0]}</span><span><strong>{ministry.name}</strong><small>{shortDuty[ministry.name]}</small></span><ChevronRight size={18}/></button>
          {period?.use_current_office_template !== false && era === 'late-ming' ? <><div className="ministry-chief">尚书 <span>正二品</span><i/>侍郎 <span>正三品</span></div><div className="ministry-branches-label">{ministry.qinglisi_count === 13 ? '十三' : '四'}清吏司</div><div className="ministry-branches">
            {divisions.map(branch => <button key={branch.id} onClick={() => select(institution, branch.id)} aria-label={`${ministry.name} ${branch.name}`}><span>{branch.name.replace('清吏司','司')}</span><ChevronRight size={14}/></button>)}
          </div><button className="ministry-other" onClick={() => select(institution)}><Network size={15}/>{ministry.branches.filter(branch=>branch.kind!=='qinglisi'&&branch.default_visible).length > 1 ? '司务厅与直属衙署' : '司务厅与本部官职'}<ChevronRight size={14}/></button></> : <p className="ministry-early-note">{period?.note || '当年职制沿革待考'}<br/><button onClick={()=>select(institution)}>查看本部人物与沿革 <ChevronRight size={14}/></button></p>}
        </article>;
      })}
    </div></div>
    <div className="council-period-note"><BookOpenText size={17}/><p>{era === 'hongwu' ? '此处展示1368—1379年的中枢关系。部内资料涵盖全明，不将后来的清吏司定制套入洪武前期。' : '部内分支取明中后期定制：吏、礼、兵、工各四司，户、刑各十三司。内阁为辅政机构，图中不把六部画成内阁属司。'}</p><a href="/data/ming-ministry-branches.json" target="_blank" rel="noreferrer">分支史料 <ChevronRight size={15}/></a></div>
    <section className="council-peers"><header><span>其他中枢官署</span><small>按年份显示机构名称</small></header><div className={`council-peer-nodes ${auxiliaries.length===7 ? 'has-sili' : ''}`}>{auxiliaries.map(institution=><button key={institution.id} onClick={()=>institution.id === 'sili-jian' ? setSiliOpen(true) : select(institution)}><span className="peer-number">{institution.name[0]}</span><strong>{institution.name}</strong><small>{periodFor(institution.id)?.use_current_office_template===false ? '查看本年人物与机构沿革' : institution.function.replace(/。.*$/,'。')}</small><ChevronRight size={19}/></button>)}</div></section>

    <p className="institution-context-note">人物记录随年份切换；此处职制分支以明中后期定制为参照，洪武前期另示中书关系，未将全明品级与设官逐年还原。</p>
    </>}
    {mobile && <button className="phone-catalog-entry" onClick={()=>setDirectoryOpen(true)}><BookOpenText size={19}/>全明职官目录<ChevronRight size={18}/></button>}
    <InstitutionDirectory officials={officials} open={directoryOpen} setOpen={setDirectoryOpen} onSelect={institution=>select(institution,null,true)}/>
    <Dialog open={siliOpen && year >= 1384} onOpenChange={setSiliOpen}><DialogContent className="history-dialog history-sili-dialog"><DialogHeader><DialogTitle>司礼监 · 内廷职制</DialogTitle><DialogDescription>按原典区分旧制品秩与中后期职事。</DialogDescription></DialogHeader><div className="history-dialog-scroll"><SiliPanel /></div></DialogContent></Dialog>
    <Dialog open={sovereignOpen} onOpenChange={setSovereignOpen}><DialogContent className="history-dialog"><DialogHeader><DialogTitle>{year}年 · 帝位</DialogTitle><DialogDescription>交接年保留先后在位记载，不表示共治。</DialogDescription></DialogHeader><div className="history-dialog-scroll"><OfficeHolders officialId="history-emperor" /></div></DialogContent></Dialog>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent showCloseButton={false} className="institution-floating-card"><DialogClose className="floating-close" aria-label="关闭官署浮窗"><X size={22}/></DialogClose>
      <DialogHeader className="institution-floating-heading"><span className="side-kicker">{selectedBranch ? selectedName : '官署与职务'} · 职官谱</span><DialogTitle>{selectedBranch?.name || selectedName}</DialogTitle><DialogDescription>{selectedBranch ? selectedBranch.display_note.split('。')[0]+'。' : selectedPeriod?.note || selectedInstitution.function}</DialogDescription></DialogHeader>
      <div className="institution-floating-scroll" ref={rosterScroll}>
        {!selectedBranch && <InstitutionPeople key={selectedInstitution.id} institutionId={selectedInstitution.id} previewLimit={mobile ? 4 : 12}/>}
        {selectedInstitution.id==='cabinet'&&!catalogMode&&<div className="history-period-note"><p>年度图显示本年已对应的阁衔；阁衔不是必须满员的六个固定席位。未明确所带殿阁衔的阁臣仍列在上方人物中。</p><button className="history-text-button" onClick={()=>setShowCabinetCatalog(value=>!value)}>{showCabinetCatalog?'回到本年已载阁衔':'查看其他殿阁职制资料'}</button></div>}
        {selectedPeriod?.use_current_office_template===false && !catalogMode && <div className="history-period-note"><p>{selectedPeriod.note}</p><button className="history-text-button" onClick={()=>setShowTemplate(v=>!v)}>{showTemplate?'收起后期职制参照':'查看明中后期职制参照'}</button></div>}
        {selectedMinistry && useTemplate && <>{mobile ? <label className="phone-branch-picker">选择部门<select value={branchId || ''} onChange={event => selectBranch(event.target.value || null)}><option value="">全署层级</option>{selectedMinistry.branches.filter(branch=>branch.default_visible||showHistory).map(branch=><option key={branch.id} value={branch.id}>{branch.name}{!branch.default_visible ? '（沿革）' : ''}</option>)}</select></label> : <div className="institution-branch-selector"><button className={!branchId?'is-selected':''} onClick={()=>selectBranch(null)}>全署层级图</button>{selectedMinistry.branches.filter(branch => branch.default_visible || showHistory).map(branch=><button key={branch.id} className={branchId === branch.id ? 'is-selected' : ''} onClick={()=>selectBranch(branch.id)}>{branch.name}{!branch.default_visible && <small>沿革</small>}</button>)}</div>}{selectedMinistry.branches.some(branch=>!branch.default_visible)&&<button className="institution-history-toggle" onClick={()=>setShowHistory(!showHistory)} aria-expanded={showHistory}>{showHistory?'收起旧制机构':'查看已革及其他旧制机构'}</button>}</>}
        {era==='hongwu' && selectedMinistry && <p className="institution-context-note">以下为本部全明官职资料，品秩与分司名称以每条考证所注时代为准，不等同洪武前期现制。</p>}
        {!selectedMinistry && <p className="institution-context-note">职官目录汇集各时期制度，旧制与职掌名称均保留说明；所选年度的实任人物单列在上方。</p>}
        <div className="floating-roster-heading"><span>{selectedBranch ? '司内职官层级' : '官署组织与职官'} <small>{roster.filter(item=>temporalOfficials.some(official=>official.record_id===item.record_id)).length} 条资料</small></span><input type="search" aria-label="筛选浮窗官职" placeholder="筛选官名或品级" value={query} onChange={event=>setQuery(event.target.value)}/></div>
        {branchLoadError && <p className="institution-context-note">部分关系资料暂未载入。<button onClick={()=>{setBranchLoadError(false);setLoadAttempt(value=>value+1);}}>重新加载</button></p>}
        {useTemplate && <OfficialHierarchy catalogMode={catalogMode || showCabinetCatalog} mobile={mobile} institutionName={selectedName} ministry={selectedMinistry} selectedBranch={selectedBranch} central={selectedCentral} officials={temporalOfficials} fallbackOfficials={roster} onSelect={viewOfficial} onBranch={selectBranch} showHistory={showHistory} query={query.trim()}/>}
        <div className="institution-evidence"><BookOpenText size={18}/><div><p>{selectedBranch ? selectedBranch.display_note : selectedInstitution.caveat || '点击人物卡片，查看核查后的品级、职掌及原典。'}</p>{selectedBranch && <blockquote>{selectedBranch.evidence}</blockquote>}<a href={selectedBranch?.source_url || selectedMinistry?.source_url || '/data/ming-official-rank-audit.html'} target="_blank" rel="noreferrer">{selectedBranch || selectedMinistry ? '查看原典' : '全部官品考证'} <ChevronRight size={14}/></a></div></div>
      </div>
    </DialogContent></Dialog>
  </section>;
}
