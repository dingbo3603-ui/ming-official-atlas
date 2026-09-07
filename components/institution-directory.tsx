'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, Landmark, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { capitalInstitutions, type CapitalInstitution } from '@/lib/ming-atlas-v2';
import type { SourceOfficial } from '@/app/page';
import './institution-directory.css';

const inner = new Set('司礼监 内官监 御用监 司设监 御马监 神宫监 尚膳监 尚宝监 印绶监 直殿监 尚衣监 都知监 东厂 西厂 内行厂 惜薪司 钟鼓司 宝钞司 混堂司 兵仗局 银作局 浣衣局 巾帽局 针工局 内织染局 酒醋面局 司苑局 文书房 礼仪房 中书房 御酒房 乾清宫近侍 内府供用库 司钥库 内承运库 御药房 御茶房'.split(' '));
const local = new Set('承宣布政使司 提刑按察使司 都转运盐使司 盐课提举司 顺天府 府 州衙 县衙 京县 州儒学 县儒学 巡检司 市舶司 行太仆寺 苑马寺 督抚系统 土官 宣抚司 安抚司 招讨司 长官司 专务系统'.split(' '));
const military = new Set('五军都督府 锦衣卫 都指挥使司 卫指挥使司 京卫指挥使司 留守司 所 五城兵马指挥司 军事系统 武学'.split(' '));
const honors = new Set('皇帝 爵位 三公 三孤 太子三师 太子三少 宗人府 詹事府 早期东宫官属 王府长史司 王府仪卫司 郡王府 镇国将军府 衍圣公与四氏教授司'.split(' '));
export const directoryCategories = ['全部', '中枢文职', '内廷职事', '地方职官', '军政职官', '宗藩与加衔'];
export function officeCategory(name: string) {
  return inner.has(name) ? '内廷职事' : local.has(name) ? '地方职官' : military.has(name) ? '军政职官' : honors.has(name) ? '宗藩与加衔' : '中枢文职';
}
export function directoryEntries(officials: SourceOfficial[]) {
  const groups = new Map<string, SourceOfficial[]>();
  for (const official of officials) {
    const id = official.institution_id;
    if (id) groups.set(id, [...(groups.get(id) || []), official]);
  }
  return [...groups.entries()].map(([id, items]) => {
    const existing = capitalInstitutions.find(institution => institution.id === id);
    const name = existing?.name || items[0].institution;
    const institution: CapitalInstitution = existing || {
      id, name, era: 'both', zone: 'axis', keywords: [...new Set(items.map(item => item.institution))],
      function: '汇集本机构的职官、职掌与人物记载；具体设置年代和品秩见各条资料。',
      positionHint: '全明职官目录',
    };
    return { institution, items, category: officeCategory(name) };
  });
}

export function filterDirectoryEntries(entries: ReturnType<typeof directoryEntries>, category: string, query: string) {
  return entries.filter(entry => (category === '全部' || entry.category === category)
    && (!query.trim() || [entry.institution.name,...entry.institution.keywords].join(' ').includes(query.trim()) || entry.items.some(item => [item.institution, item.title, item.department, item.rank,...(item.title_periods||[]).map(period=>period.name)].join(' ').includes(query.trim()))));
}

export function InstitutionDirectoryGrid({ officials, onSelect }: { officials: SourceOfficial[]; onSelect: (institution: CapitalInstitution) => void }) {
  const [category, setCategory] = useState('全部');
  const [query, setQuery] = useState('');
  const entries = useMemo(() => directoryEntries(officials), [officials]);
  const matches = filterDirectoryEntries(entries,category,query);
  return <div className="institution-directory-content">
    <div className="directory-tools"><label className="directory-search"><Search size={19}/><input type="search" placeholder="查官署、官名或品级" aria-label="查找全明官署和职官" value={query} onChange={event => setQuery(event.target.value)}/></label><span>{entries.length} 个机构或职务组 · {officials.length} 项职官</span></div>
    <div className="directory-categories" aria-label="职官目录分类">{directoryCategories.map(name => <button key={name} aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>)}</div>
    <p className="directory-reading-note">全明资料索引，包含早期旧制与后来职掌。分类便于查找，不表示机构上下级，也不表示所选年份仍设此职。</p>
    <div className="institution-directory-grid">{matches.map(({institution, items, category: group}) => <button className="directory-institution" key={institution.id} onClick={() => onSelect(institution)}>
      <span className="directory-card-meta"><span>{group}</span><span>{items.length} 项</span></span>
      <strong><Landmark size={21}/>{institution.name}<ChevronRight size={18}/></strong>
      <small>{[...new Set(items.map(item => item.title))].slice(0, 3).join(' · ')}{items.length > 3 ? ' …' : ''}</small>
      <span className="directory-card-link">查阅职官与相关人物</span>
    </button>)}</div>
    {!matches.length && <p className="floating-empty">没有找到对应资料，试试官署简称或单个官名。</p>}
  </div>;
}

export function InstitutionDirectory({ officials, open, setOpen, onSelect }: { officials: SourceOfficial[]; open: boolean; setOpen: (open: boolean) => void; onSelect: (institution: CapitalInstitution) => void }) {
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent className="history-dialog institution-directory-dialog">
    <DialogHeader className="history-dialog-header"><DialogTitle className="history-dialog-title">全明职官目录</DialogTitle><DialogDescription className="history-dialog-description">中枢、内廷、地方、军政与宗藩职官，按机构查阅。</DialogDescription></DialogHeader>
    <div className="history-dialog-scroll"><InstitutionDirectoryGrid officials={officials} onSelect={institution => {setOpen(false);onSelect(institution);}}/></div>
  </DialogContent></Dialog>;
}
