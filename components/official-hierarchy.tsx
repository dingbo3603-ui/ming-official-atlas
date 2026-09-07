'use client';
/* oxlint-disable next/no-img-element */
import { ChevronRight, ExternalLink, Landmark } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { OfficePeopleLabel, useHistory } from '@/components/history/history-context';
import type { SourceOfficial } from '@/app/page';
import { avatarForOfficial } from '@/lib/ming-atlas-v2';
import { officialsByIds, relationLabels, type Ministry, type MinistryBranch, type CentralHierarchy, type CentralGroup } from '@/lib/official-hierarchy';

function OfficialNode({ official, onSelect, shared=false }: { official: SourceOfficial; onSelect:(official:SourceOfficial)=>void; shared?: boolean }) {
  return <button className="hierarchy-official-node" data-record-id={official.record_id} onClick={()=>onSelect(official)} aria-label={`${official.title}，${official.rank || '品级未载'}，查看详情`}><span className="hierarchy-official-avatar"><img src={avatarForOfficial(official.title,official.institution,official.department||'')} alt=""/></span><span className="hierarchy-official-copy"><strong>{official.title}</strong><span className="floating-rank">{official.rank || '品级未载'}</span>{shared && <small>同职制参考</small>}<OfficePeopleLabel officialId={official.record_id}/></span><ChevronRight size={16}/></button>;
}

function RecordNodes({ ids, officials, onSelect, shared=[] }: {ids:string[];officials:SourceOfficial[];onSelect:(official:SourceOfficial)=>void;shared?:string[]}) {
  return <div className="hierarchy-record-nodes">{officialsByIds(ids,officials).map(official=><OfficialNode key={official.record_id} official={official} onSelect={onSelect} shared={shared.includes(official.record_id)}/>)}</div>;
}

function DivisionBranch({ branch, officials, onSelect, onBranch, focused=false }: {branch:MinistryBranch;officials:SourceOfficial[];onSelect:(official:SourceOfficial)=>void;onBranch:(id:string)=>void;focused?:boolean}) {
  const records=officialsByIds(branch.record_ids,officials);
  const chief=branch.kind==='qinglisi' ? records.filter(item=>item.title==='郎中') : [];
  const assistants=records.filter(item=>!chief.includes(item));
  const hasHead=chief.length>0;
  return <section className={`official-division-branch ${!branch.default_visible?'is-historical':''}`} data-branch-id={branch.id}>
    <header><span className="hierarchy-group-kind">{branch.kind==='evidence_group'?'分司待核':branch.kind==='qinglisi'?'清吏司':branch.kind==='staff_office'?'本部附属机构':branch.default_visible?'直属衙署':'沿革机构'}</span>{focused?<h3>{branch.name}</h3>:<button onClick={()=>onBranch(branch.id)} aria-label={`展开${branch.name}职官层级`}><h3>{branch.name}</h3><ChevronRight size={17}/></button>}<p>{branch.display_note}</p></header>
    <div className="division-roles">
      {hasHead&&<div className="division-chief"><span className="hierarchy-role-label">司内主官</span><RecordNodes ids={chief.map(item=>item.record_id)} officials={officials} onSelect={onSelect}/></div>}
      {assistants.length>0&&<div className={hasHead?'division-assistants':'division-members'}><span className="hierarchy-role-label">{hasHead?'佐理司务':'本署职官'}</span><RecordNodes ids={assistants.map(item=>item.record_id)} officials={officials} onSelect={onSelect} shared={branch.shared_record_ids}/></div>}
      {branch.unmapped_roles?.map(role=><article className="hierarchy-extra-role" key={role.title}><span>原典补充</span><strong>{role.title} <small>{role.rank}</small></strong><a href={role.source_url} target="_blank" rel="noreferrer">查看职制依据 <ExternalLink size={13}/></a></article>)}
      {!records.length&&!branch.unmapped_roles?.length&&<p className="hierarchy-missing-record">机构见于原典，职官资料待补。</p>}
    </div>
    <a className="hierarchy-source" href={branch.source_url} target="_blank" rel="noreferrer">原典 <ExternalLink size={13}/></a>
  </section>;
}

function CentralBranch({ group, hierarchy, officials, onSelect }: {group:CentralGroup;hierarchy:CentralHierarchy;officials:SourceOfficial[];onSelect:(official:SourceOfficial)=>void}) {
  const children=hierarchy.groups.filter(item=>item.parent_id===group.id);
  const grouping=['same_institution_group','collection_member'].includes(group.relation);
  const roleGroups=group.department_role_groups||group.record_role_groups;
  return <section className={`central-hierarchy-branch ${grouping?'is-grouping':''}`} data-group-id={group.id} data-parent-id={group.parent_id}>
    <header><span className="hierarchy-group-kind">{relationLabels[group.relation] || '机构职官'}</span><h3>{group.name}</h3><p>{group.display_note}</p></header>
    {group.chief_assignments&&<div className="hierarchy-duty-assignments">{group.chief_assignments.map(duty=><div key={duty.name}><span>实际职事</span><strong>{duty.name}</strong><small>奉命任事，不另定官品</small></div>)}</div>}
    {roleGroups ? <div className="central-role-groups">{roleGroups.map((role,index)=><div className={index?'division-assistants':'division-chief'} key={role.name}><span className="hierarchy-role-label">{role.name}</span><RecordNodes ids={role.record_ids} officials={officials} onSelect={onSelect} shared={group.shared_record_ids}/>{role.note&&<p className="hierarchy-missing-record">{role.note}</p>}</div>)}</div> : <RecordNodes ids={group.record_ids} officials={officials} onSelect={onSelect} shared={group.shared_record_ids}/>}
    {children.length>0&&<div className="central-hierarchy-children">{children.map(child=><CentralBranch key={child.id} group={child} hierarchy={hierarchy} officials={officials} onSelect={onSelect}/>)}</div>}
    {!group.record_ids.length&&!children.length&&<p className="hierarchy-missing-record">职官资料待补</p>}
    <a className="hierarchy-source" href={group.source_url} target="_blank" rel="noreferrer">关系依据 <ExternalLink size={13}/></a>
  </section>;
}

function PhoneBranch({name,children}: {name:string;children:ReactNode}) {
  const [expanded,setExpanded] = useState(false);
  return <details className="phone-branch-fold" onToggle={event => setExpanded(event.currentTarget.open)}><summary><strong>{name}</strong><span>职官层级<ChevronRight size={18}/></span></summary>{expanded && children}</details>;
}

export function OfficialHierarchy({ institutionName, ministry, selectedBranch, central, officials: catalog, fallbackOfficials, onSelect, onBranch, showHistory, query, mobile = false, catalogMode = false }: {
  institutionName:string;ministry?:Ministry;selectedBranch?:MinistryBranch;central?:CentralHierarchy;officials:SourceOfficial[];fallbackOfficials:SourceOfficial[];onSelect:(official:SourceOfficial)=>void;onBranch:(id:string)=>void;showHistory:boolean;query:string;mobile?:boolean;catalogMode?:boolean;
}) {
  const {year,data}=useHistory();
  const unavailable=new Set(catalogMode ? [] : data?.empty_slots_evidence?.filter(item=>item.year===year).map(item=>item.office_id));
  const officials=catalog.filter(item=>!unavailable.has(item.record_id));
  const matches=(official:SourceOfficial)=>!query||`${official.title} ${official.rank||''} ${official.department||''}`.includes(query.trim());
  const shownOfficials=query?officials.filter(matches):officials;
  const indexedIds = new Set(ministry ? [...ministry.chief_record_ids,...ministry.branches.flatMap(branch=>branch.record_ids)] : central?.groups.flatMap(group=>group.record_ids) || []);
  const extraIds = fallbackOfficials.filter(item=>!indexedIds.has(item.record_id)&&shownOfficials.some(row=>row.record_id===item.record_id)).map(item=>item.record_id);
  const extraNodes = extraIds.length ? <section><h3 className="catalog-supplement-heading">其他已收录职官与职掌</h3><RecordNodes ids={extraIds} officials={officials} onSelect={onSelect}/></section> : null;
  if (ministry) {
    const chiefs=officialsByIds(ministry.chief_record_ids,officials);
    const principals=chiefs.filter(item=>item.title.includes('尚书'));
    const assistants=chiefs.filter(item=>!principals.includes(item));
    const branches=(selectedBranch?[selectedBranch]:ministry.branches.filter(branch=>branch.default_visible||showHistory)).filter(branch=>!query||branch.name.includes(query.trim())||branch.record_ids.some(id=>shownOfficials.some(o=>o.record_id===id)));
    return <div className="official-org-chart">
      <div className="official-department-root"><Landmark size={24}/><strong>{institutionName}</strong><span>部堂长贰</span></div>
      {!selectedBranch&&<div className="ministry-leadership"><div className="ministry-principal"><span className="hierarchy-role-label">尚书 · 总领部务</span><RecordNodes ids={principals.map(item=>item.record_id)} officials={officials} onSelect={onSelect}/></div><div className="ministry-assistant"><span className="hierarchy-role-label">侍郎 · 佐理部务</span><RecordNodes ids={assistants.map(item=>item.record_id)} officials={officials} onSelect={onSelect}/></div></div>}
      <div className="official-branches-caption">{selectedBranch?'本部所属机构':'部属机构 · 各司与直属局库并列'}</div>
      {query&&<p className="hierarchy-reading-note">已定位相关分支，并保留上下级职官。</p>}
      <div className={`official-branches-tree ${selectedBranch?'is-focused':''}`}>{branches.map(branch=>mobile&&!selectedBranch&&!query ? <PhoneBranch key={branch.id} name={branch.name}><DivisionBranch branch={branch} officials={officials} onSelect={onSelect} onBranch={onBranch}/></PhoneBranch> : <DivisionBranch key={branch.id} branch={branch} officials={officials} onSelect={onSelect} onBranch={onBranch} focused={Boolean(selectedBranch)}/>)}</div>
      {query&&!branches.length&&!chiefs.some(matches)&&<p className="floating-empty">没有匹配的官职或机构。</p>}
      {!selectedBranch && extraNodes}
    </div>;
  }
  if (central) {
    const roots=central.groups.filter(group=>group.parent_id===central.institution_id);
    const leadership=roots.filter(group=>['chief_officers','assistant_officers','chief_assignment'].includes(group.kind));
    const departments=roots.filter(group=>!leadership.includes(group));
    const displayOfficials=officials.map(official=>{const override=central.record_role_overrides?.[official.record_id];return override?{...official,title:override.display_title||official.title,department:override.department||official.department}:official;});
    const hasMatch=(group:CentralGroup):boolean=>!query||group.name.includes(query.trim())||group.record_ids.some(id=>shownOfficials.some(o=>o.record_id===id))||central.groups.filter(g=>g.parent_id===group.id).some(hasMatch);
    const visibleGroups=query?central.groups.filter(hasMatch):central.groups;
    return <div className="official-org-chart">
      <div className="official-department-root"><Landmark size={24}/><strong>{institutionName}</strong><span>{central.root_kind==='collective_label'?'五府合称':'机构职官'}</span></div>
      {leadership.length>0&&<div className="central-leadership">{leadership.map(group=><CentralBranch key={group.id} group={group} hierarchy={central} officials={displayOfficials} onSelect={onSelect}/>)}</div>}
      <div className="official-branches-caption">{central.root_kind==='collective_label'?'中、左、右、前、后五府并列':'所属部门与职务分组'}</div>
      <p className="hierarchy-reading-note">实线表示所属关系；虚线框为同机构职务分组或并列机构。品阶仅标注官品。</p>
      <div className="central-hierarchy-tree">{departments.filter(hasMatch).map(group=>mobile&&!query ? <PhoneBranch key={group.id} name={group.name}><CentralBranch group={group} hierarchy={{...central,groups:visibleGroups}} officials={displayOfficials} onSelect={onSelect}/></PhoneBranch> : <CentralBranch key={group.id} group={group} hierarchy={{...central,groups:visibleGroups}} officials={displayOfficials} onSelect={onSelect}/>)}</div>
      {query&&!roots.some(hasMatch)&&<p className="floating-empty">没有匹配的官职或机构。</p>}
      {extraNodes}
    </div>;
  }
  const groups = new Map<string,string[]>();
  for (const office of fallbackOfficials.filter(matches)) {
    const name = office.department || office.institution;
    groups.set(name,[...(groups.get(name)||[]),office.record_id]);
  }
  return <div className="official-org-chart"><div className="official-department-root"><Landmark size={22}/><strong>{institutionName}</strong></div><p className="hierarchy-reading-note">按资料所载机构与职务分组，具体品级、设置年代及职掌见各条详情。</p><div className="catalog-department-groups">{[...groups.entries()].map(([name,ids])=><section key={name} className="catalog-department-group"><h3>{name}</h3><RecordNodes ids={ids} officials={officials} onSelect={onSelect}/></section>)}</div>{!groups.size&&<p className="floating-empty">没有匹配的官职资料。</p>}</div>;
}
