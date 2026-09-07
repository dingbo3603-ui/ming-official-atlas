'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, Landmark } from 'lucide-react';
import type { SourceOfficial } from '@/app/page';
import { useHistory } from '@/components/history/history-context';
import { Command, CommandInput, CommandList, CommandGroup, CommandItem, CommandShortcut } from '@/components/ui/command';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { indexPeople, normalizeSearch, searchOfficials, searchPeople } from '@/lib/atlas-search';
import './atlas-search.css';

const PAGE_SIZE = 20;

export function AtlasSearch({ officials, onClose, onOfficial, initialQuery = '', onQueryChange, onReturn }: {
  officials: SourceOfficial[]; onClose: () => void; onOfficial: (official: SourceOfficial) => void;
  initialQuery?: string; onQueryChange?: (query: string) => void; onReturn?: () => void;
}) {
  const { data, bootstrapStatus, retry, openPerson } = useHistory();
  const [query, setQuery] = useState(initialQuery);
  const [personLimit, setPersonLimit] = useState(PAGE_SIZE);
  const [officialLimit, setOfficialLimit] = useState(PAGE_SIZE);
  const peopleIndex = useMemo(() => indexPeople(data?.people || []), [data?.people]);
  const people = useMemo(() => searchPeople(peopleIndex, query), [peopleIndex, query]);
  const positions = useMemo(() => searchOfficials(officials, query), [officials, query]);
  const hasQuery = !!normalizeSearch(query);

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="atlas-search-dialog">
      <DialogHeader className="atlas-search-heading">
        <DialogTitle>搜索人物与官职</DialogTitle>
        <DialogDescription>人物检索覆盖全部已收录年份，点击查看完整履历。</DialogDescription>
      </DialogHeader>
      <Command shouldFilter={false} className="atlas-search-command" label="人物与官职搜索">
        <CommandInput aria-label="搜索姓名、官职、官署或品级" placeholder="姓名、官职、官署或品级……" value={query}
          onValueChange={value => { setQuery(value); onQueryChange?.(value); setPersonLimit(PAGE_SIZE); setOfficialLimit(PAGE_SIZE); }} />
        {bootstrapStatus === 'loading' && <output className="atlas-search-note">正在载入人物目录，官职可先查询……</output>}
        {bootstrapStatus === 'error' && <output className="atlas-search-note">人物目录暂未载入。<button type="button" onClick={retry}>重新加载</button></output>}
        {!hasQuery && bootstrapStatus === 'ready' && <p className="atlas-search-note">输入姓名查找人物 · 已收录 {peopleIndex.length.toLocaleString('zh-CN')} 位</p>}
        <CommandList className="atlas-search-results">
          {people.length > 0 && <CommandGroup heading={`人物 · ${people.length} 位`}>
            {people.slice(0, personLimit).map(person => <CommandItem key={person.id} value={'person:' + person.id}
              onSelect={() => { onClose(); openPerson(person.id, onReturn); }} className="atlas-search-result">
              <span className="atlas-search-mark" aria-hidden>{person.name.slice(0, 1)}</span>
              <span className="atlas-search-copy"><span className="atlas-search-person-heading"><b>{person.name}</b><small>{person.birth_year == null && person.death_year == null ? '生卒年待考' : `${person.birth_year ?? '生年待考'} — ${person.death_year ?? '卒年待考'}`}</small></span>
                <span className="atlas-search-summary">{person.summary || '查看已收录的任职履历与史料出处'}</span></span>
              <CommandShortcut><ArrowRight aria-label="查看人物履历" /></CommandShortcut>
            </CommandItem>)}
            {people.length > personLimit && <CommandItem value="more:people" className="atlas-search-more" onSelect={() => setPersonLimit(value => value + PAGE_SIZE)}>查看更多人物（已显示 {personLimit} / {people.length}）</CommandItem>}
          </CommandGroup>}
          {hasQuery && bootstrapStatus === 'ready' && !people.length && <p className="atlas-search-note">未找到相符的人物。</p>}
          {positions.length > 0 && <CommandGroup heading={`官职 · ${positions.length} 条`}>
            {positions.slice(0, officialLimit).map(official => <CommandItem key={official.record_id} value={'office:' + official.record_id}
              onSelect={() => { onClose(); onOfficial(official); }} className="atlas-search-result">
              <span className="atlas-search-mark" aria-hidden><Landmark size={20}/></span>
              <span className="atlas-search-copy"><b>{official.title}</b><span className="atlas-search-summary">{official.institution} · {official.department || '本署'}</span></span>
              <CommandShortcut>{official.rank || '未载'}</CommandShortcut>
            </CommandItem>)}
            {positions.length > officialLimit && <CommandItem value="more:officials" className="atlas-search-more" onSelect={() => setOfficialLimit(value => value + PAGE_SIZE)}>查看更多官职（已显示 {officialLimit} / {positions.length}）</CommandItem>}
          </CommandGroup>}
          {hasQuery && !positions.length && <p className="atlas-search-note">未找到相符的官职。</p>}
        </CommandList>
      </Command>
    </DialogContent>
  </Dialog>;
}
