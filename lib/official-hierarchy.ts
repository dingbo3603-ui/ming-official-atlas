import type { SourceOfficial } from '@/app/page';

export type ExtraRole = { title: string; rank: string; source_url: string; evidence: string; reason: string };
export type MinistryBranch = { id: string; name: string; kind: string; record_ids: string[]; shared_record_ids?: string[]; note: string; display_note: string; source_url: string; evidence: string; default_visible: boolean; unmapped_roles?: ExtraRole[] };
export type Ministry = { ministry_id: string; name: string; qinglisi_count: number; chief_record_ids: string[]; branches: MinistryBranch[]; source_url: string };
type RoleGroup = {name:string;role:string;record_ids:string[];note?:string};
export type CentralGroup = { id: string; name: string; parent_id: string; kind: string; relation: string; record_ids: string[]; shared_record_ids?: string[]; display_note: string; source_url: string; evidence: string; department_role_groups?:RoleGroup[]; record_role_groups?:RoleGroup[]; chief_assignments?:Array<{name:string;kind:string;record_ids:string[]}> };
export type CentralHierarchy = { institution_id: string; name: string; source_url: string; groups: CentralGroup[]; root_kind?: string; era: string; record_role_overrides?:Record<string,{display_title?:string;department?:string;note?:string}> };

export const centralHierarchyIds: Record<string,string> = {'central-secretariat':'zhongshu-province','grand-court':'dali-court','transmission-office':'transmission','five-commissions':'five-armies','jinyiwei':'jinyi-guard'};
export const relationLabels: Record<string,string> = { institution_chiefs:'主官',assists_chief:'佐理主官',organizational_branch:'所属部门',same_institution_group:'同机构职务组',collection_member:'五府并列',subordinate_unit:'军令统属',historical_subordinate:'历史辖属',attached_with_independent_memorial:'独立奏达' };

export function officialsByIds(ids: string[], officials: SourceOfficial[]) {
  const byId=new Map(officials.map(item=>[item.record_id,item]));
  return [...new Set(ids)].flatMap(id=>{const official=byId.get(id);return official?[official]:[];});
}

export function ministryRecordIds(ministry: Ministry) {
  return [...new Set([...ministry.chief_record_ids,...ministry.branches.flatMap(branch=>branch.record_ids)])];
}
