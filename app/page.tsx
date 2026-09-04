'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpenText,
  Building2,
  ChevronRight,
  Compass,
  Crown,
  Landmark,
  Map as MapIcon,
  Search,
  Shield,
  Sparkles,
  Users,
} from 'lucide-react';

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  allOfficials,
  courtInstitutions,
  institutions,
  localInstitutions,
  mapNodes,
  type Institution,
  type Official,
} from '@/lib/ming-data';

type ViewName = 'map' | 'court' | 'local';
type IndexedOfficial = Official & {
  id: string;
  institutionId: string;
  institutionName: string;
  summary: string;
  sourceRange?: string;
};

type SourceOfficial = {
  record_id: string;
  institution: string;
  title: string;
  rank: string | null;
  headcount: string | null;
  department: string | null;
  duty_notes: string | null;
  sources: Array<{ sheet: string; row: number; range: string; region: string }>;
  uncertainty_flags: unknown[];
};

type SourceData = {
  officials: SourceOfficial[];
  metadata: { counts: { official_rows_deduplicated: number } };
};

function inferBranch(record: SourceOfficial): Official['branch'] {
  const haystack = `${record.institution} ${record.department ?? ''} ${record.title}`;
  if (/都督|锦衣卫|东厂|西厂|内行厂|兵马|卫指挥|千户|百户|总兵|参将|守备|游击/.test(haystack)) return '武班';
  if (/都察院|按察|御史|给事中|巡按|巡盐|巡漕|巡关/.test(haystack)) return '监察';
  if (/宗人|宗室|亲王|郡王|公主|勋爵|王府|将军府/.test(haystack)) return '宗室';
  if (record.sources.some((source) => source.region === 'G-L' || source.region === 'M-P')) return '地方';
  return '文班';
}

const toneClasses: Record<string, string> = {
  cinnabar: 'border-[#cf6646] bg-[#6f241d] text-[#ffe1b0]',
  gold: 'border-[#c8a05a] bg-[#5e4628] text-[#ffe7ab]',
  ink: 'border-[#908170] bg-[#2a2927] text-[#eee0c8]',
  jade: 'border-[#719982] bg-[#29463c] text-[#d8ecce]',
  blue: 'border-[#688e9d] bg-[#263e47] text-[#d5e9e8]',
};

function RankBadge({ rank }: { rank: string }) {
  const high = /一品|二品|三品/.test(rank);
  return (
    <span
      className={
        high
          ? 'inline-flex rounded-full border border-[#cb9a4b]/50 bg-[#cb9a4b]/12 px-2 py-0.5 text-[12px] text-[#f4cd7c]'
          : 'inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[12px] text-[#c6b9a2]'
      }
    >
      {rank}
    </span>
  );
}

function BrandMark() {
  return (
    <div className="relative grid size-10 shrink-0 place-items-center border border-[#d0a653]/55 bg-[#6d241d] shadow-[inset_0_0_0_3px_#321713,0_5px_18px_rgb(0_0_0/25%)]">
      <span className="font-heading text-[18px] font-black leading-none text-[#f4cf82]">明</span>
      <span className="pointer-events-none absolute inset-[3px] border border-[#e5bd67]/35" />
    </div>
  );
}

function AtlasMap({ onEnter }: { onEnter: (institution: Institution, view: ViewName) => void }) {
  const [hovered, setHovered] = useState(mapNodes[0].id);
  const focusNode = mapNodes.find((node) => node.id === hovered) ?? mapNodes[0];
  const focusInstitution = institutions.find((item) => item.id === focusNode.target) ?? institutions[0];

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_19rem] gap-3 max-xl:grid-cols-[minmax(0,1fr)_17rem] max-lg:grid-cols-1">
      <section className="paper-noise relative min-h-[37rem] overflow-hidden rounded-[1.5rem] border border-[#9a7848]/35 bg-[#24261f] shadow-[0_24px_70px_rgb(0_0_0/30%),inset_0_0_80px_rgb(0_0_0/40%)] max-sm:min-h-[34rem]">
        <img
          src="/ming-tianxia-map-stage.webp"
          alt="明代风格天下舆图，用作官制空间导航"
          className="absolute inset-0 size-full object-cover object-center opacity-85"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_55%_45%,transparent_20%,rgb(12_13_11/20%)_70%),linear-gradient(150deg,rgb(15_25_22/18%),rgb(30_21_16/38%))]" />

        <div className="absolute left-5 top-5 z-10 max-w-[18rem] rounded-xl border border-[#d1b16c]/25 bg-[#171814]/78 p-4 backdrop-blur-md sm:left-7 sm:top-7">
          <div className="mb-2 flex items-center gap-2 text-[#d7b973]">
            <Compass className="size-4" />
            <span className="text-[12px] tracking-[.22em]">职官空间索引</span>
          </div>
          <p className="font-heading text-[17px] leading-7 text-[#efe3c9]">循朝廷—省—府—州县的路径，进入每一层官署。</p>
          <p className="mt-2 text-[12px] leading-5 text-[#aa9d88]">舆图为制度导航示意，并非历史疆界复原。</p>
        </div>

        {mapNodes.map((node) => {
          const target = institutions.find((item) => item.id === node.target);
          if (!target) return null;
          const isActive = hovered === node.id;
          return (
            <button
              key={node.id}
              type="button"
              className="group absolute z-20 -translate-x-1/2 -translate-y-1/2 text-left focus-visible:outline-none max-sm:scale-[.82]"
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
              onMouseEnter={() => setHovered(node.id)}
              onFocus={() => setHovered(node.id)}
              onClick={() => onEnter(target, node.scene === 'court' ? 'court' : 'local')}
              aria-label={`进入${node.label}：${node.sublabel}`}
            >
              <span
                className={`absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 rounded-full border opacity-0 transition group-hover:opacity-80 group-focus-visible:opacity-80 ${toneClasses[node.tone]} ${isActive ? 'animate-beacon opacity-70' : ''}`}
              />
              <span className={`relative flex min-w-max items-center gap-2 rounded-lg border px-2.5 py-2 shadow-[0_8px_24px_rgb(0_0_0/35%)] transition duration-200 group-hover:-translate-y-1 group-focus-visible:ring-2 group-focus-visible:ring-[#e0bb6a] ${toneClasses[node.tone]}`}>
                {node.id === 'imperial' ? <Crown className="size-4" /> : node.id === 'frontier' ? <Shield className="size-4" /> : <Landmark className="size-4" />}
                <span>
                  <span className="block font-heading text-[14px] font-semibold leading-4">{node.label}</span>
                  <span className="mt-0.5 block text-[10px] opacity-70">{node.sublabel}</span>
                </span>
              </span>
            </button>
          );
        })}

        <div className="absolute bottom-5 left-5 z-10 flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-2 text-[12px] text-[#c5b99f] backdrop-blur-sm sm:left-7">
          <span className="size-1.5 rounded-full bg-[#d86343] shadow-[0_0_0_4px_rgb(216_99_67/15%)]" />
          点击地标进入官署
        </div>
      </section>

      <aside className="flex min-h-0 flex-col overflow-hidden rounded-[1.5rem] border border-[#9a7848]/35 bg-[#211d18]/90 shadow-[0_22px_60px_rgb(0_0_0/22%)] max-lg:hidden">
        <div className="border-b border-[#9a7848]/25 p-5">
          <p className="mb-2 text-[12px] tracking-[.2em] text-[#b9995f]">当前地标</p>
          <h2 className="font-heading text-2xl font-semibold text-[#f0dfbd]">{focusNode.label}</h2>
          <p className="mt-1 text-sm text-[#9f927e]">{focusInstitution.name}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-[14px] leading-7 text-[#c7b9a0]">{focusInstitution.summary}</p>
          <div className="mt-5 flex items-center justify-between border-y border-[#9a7848]/20 py-3 text-sm">
            <span className="text-[#8f8372]">已录官职</span>
            <span className="font-heading text-lg text-[#ebc56f]">{focusInstitution.officials.length}</span>
          </div>
          <div className="mt-5 space-y-2">
            {focusInstitution.officials.slice(0, 4).map((official) => (
              <div key={`${official.name}-${official.office}`} className="flex items-center justify-between gap-3 rounded-lg bg-white/[.035] px-3 py-2.5">
                <span className="truncate text-sm text-[#d8c8aa]">{official.name}</span>
                <span className="shrink-0 text-[12px] text-[#a99570]">{official.rank}</span>
              </div>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onEnter(focusInstitution, focusNode.scene === 'court' ? 'court' : 'local')}
          className="group m-5 mt-0 flex items-center justify-between rounded-xl border border-[#c69d51]/45 bg-[#6f281e] px-4 py-3 text-left text-[#f4d99e] transition hover:border-[#e0b65f] hover:bg-[#7f3024] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e0bb6a]"
        >
          <span>
            <span className="block font-heading text-[16px] font-semibold">进入 {focusNode.label}</span>
            <span className="mt-0.5 block text-[11px] opacity-70">查看官署与职官</span>
          </span>
          <ChevronRight className="size-5 transition group-hover:translate-x-1" />
        </button>
      </aside>
    </div>
  );
}

function OfficialCard({ official, onSelect }: { official: Official; onSelect: (official: IndexedOfficial) => void }) {
  const indexed = allOfficials.find(
    (item) => item.name === official.name && item.office === official.office && item.rank === official.rank,
  );
  return (
    <button
      type="button"
      onClick={() => indexed && onSelect(indexed)}
      className="group w-full rounded-xl border border-[#b08a4f]/22 bg-[#1d1915]/76 p-3 text-left backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-[#cda55c]/55 hover:bg-[#2a2119] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8ae5e]"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-heading text-[15px] font-semibold text-[#ecdcbd]">{official.name}</span>
        <RankBadge rank={official.rank} />
      </div>
      <p className="mt-1.5 truncate text-[12px] text-[#978b79]">{official.office} · {official.count}</p>
    </button>
  );
}

function CourtScene({ onBack, onSelect }: { onBack: () => void; onSelect: (official: IndexedOfficial) => void }) {
  const civil = courtInstitutions.filter((item) => item.system !== '武官');
  const military = courtInstitutions.filter((item) => item.system === '武官');
  const civilOfficials = civil.flatMap((item) => item.officials.slice(0, 1));
  const militaryOfficials = military.flatMap((item) => item.officials.slice(0, 5));

  return (
    <section className="paper-noise relative min-h-[42rem] overflow-hidden rounded-[1.5rem] border border-[#9a7848]/35 bg-[#251914] shadow-[0_24px_70px_rgb(0_0_0/35%)]">
      <img
        src="/ming-imperial-audience-hall.webp"
        alt="明代皇宫朝堂内景"
        className="absolute inset-0 size-full object-cover object-center opacity-65"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(30_12_9/92%),rgb(76_31_21/42%)_28%,rgb(98_46_27/20%)_50%,rgb(76_31_21/42%)_72%,rgb(30_12_9/92%)),linear-gradient(180deg,rgb(10_8_6/70%),transparent_44%,rgb(8_7_6/75%))]" />
      <div className="absolute left-1/2 top-[12%] h-[72%] w-px -translate-x-1/2 bg-gradient-to-b from-[#e0b866]/0 via-[#e0b866]/45 to-[#e0b866]/0" />
      <div className="absolute left-1/2 top-[8%] h-36 w-72 -translate-x-1/2 bg-[radial-gradient(ellipse,rgb(232_181_83/28%),transparent_70%)] blur-xl" />

      <div className="relative z-10 flex items-start justify-between gap-4 p-5 sm:p-7">
        <button type="button" onClick={onBack} className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-sm text-[#d9c9ac] transition hover:bg-black/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8ae5e]">
          <ArrowLeft className="size-4" />
          返回舆图
        </button>
        <div className="text-right">
          <p className="text-[11px] tracking-[.24em] text-[#bd9652]">皇城 · 奉天殿</p>
          <h2 className="mt-1 font-heading text-xl text-[#f0ddba] sm:text-2xl">朝堂班列</h2>
        </div>
      </div>

      <div className="relative z-10 mx-auto mt-1 grid max-w-6xl grid-cols-[minmax(11rem,1fr)_minmax(13rem,.8fr)_minmax(11rem,1fr)] gap-4 px-5 pb-8 max-md:grid-cols-[minmax(0,1fr)_3.75rem_minmax(0,1fr)] max-md:px-3 sm:px-8 lg:gap-8">
        <div>
          <div className="mb-3 flex items-center gap-2 border-b border-[#c89f55]/25 pb-3 text-[#d9b86f]">
            <BookOpenText className="size-4" />
            <span className="font-heading text-[15px] tracking-[.2em]">文官班</span>
          </div>
          <div className="space-y-2.5">
            {civilOfficials.slice(0, 8).map((official, index) => (
              <div key={`${official.name}-${index}`} style={{ animationDelay: `${index * 55}ms` }} className="animate-rise-in">
                <OfficialCard official={official} onSelect={onSelect} />
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center pt-3 text-center">
          <div className="grid h-24 w-32 place-items-center border-x border-t border-[#d5ae62]/45 bg-gradient-to-b from-[#8c3b24] to-[#4e1e17] shadow-[0_0_40px_rgb(218_166_80/17%),inset_0_0_18px_rgb(0_0_0/38%)] max-md:w-14">
            <Crown className="mb-1 size-7 text-[#e5bd67]" />
            <span className="font-heading text-[15px] tracking-[.25em] text-[#f1d28d]">御座</span>
          </div>
          <div className="h-[27rem] w-24 border-x border-[#d2aa60]/20 bg-[linear-gradient(90deg,transparent,rgb(212_168_90/8%),transparent)]" />
          <div className="-mt-3 rounded-full border border-[#cda55b]/30 bg-[#251a13] px-3 py-1 text-[11px] text-[#a99470]">御道</div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-end gap-2 border-b border-[#c89f55]/25 pb-3 text-[#d9b86f]">
            <span className="font-heading text-[15px] tracking-[.2em]">武官班</span>
            <Shield className="size-4" />
          </div>
          <div className="space-y-2.5">
            {militaryOfficials.map((official, index) => (
              <div key={`${official.name}-${index}`} style={{ animationDelay: `${index * 65}ms` }} className="animate-rise-in">
                <OfficialCard official={official} onSelect={onSelect} />
              </div>
            ))}
            <div className="rounded-xl border border-dashed border-[#ad8950]/25 p-4 text-center text-[12px] leading-5 text-[#948772]">
              五府分中、左、右、前、后军；<br />兵部掌调兵，五府掌统兵。
            </div>
          </div>
        </div>
      </div>
      <p className="relative z-10 mx-auto mb-6 max-w-xl px-5 text-center text-[12px] leading-5 text-[#8d806f]">班列用于呈现文武系统关系，不表示某次朝会的完整站位与具体人数。</p>
    </section>
  );
}

function YamenScene({
  institution,
  onBack,
  onSelect,
  onChoose,
}: {
  institution: Institution;
  onBack: () => void;
  onSelect: (official: IndexedOfficial) => void;
  onChoose: (institution: Institution) => void;
}) {
  const indexedFor = (official: Official) =>
    allOfficials.find(
      (item) => item.institutionId === institution.id && item.name === official.name && item.office === official.office,
    );

  return (
    <div className="grid min-h-[42rem] grid-cols-[16rem_minmax(0,1fr)] gap-3 max-md:grid-cols-1">
      <aside className="overflow-hidden rounded-[1.5rem] border border-[#9a7848]/35 bg-[#211d18]/90 p-3 max-md:order-2">
        <div className="px-2 pb-3 pt-2">
          <p className="text-[11px] tracking-[.22em] text-[#af925d]">地方官署</p>
          <h2 className="mt-1 font-heading text-xl text-[#ead9b9]">选择衙署</h2>
        </div>
        <div className="max-h-[35rem] space-y-1.5 overflow-y-auto pr-1">
          {localInstitutions.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onChoose(item)}
              className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8ae5e] ${item.id === institution.id ? 'border border-[#c69d51]/45 bg-[#6b2a20] text-[#f4d69b]' : 'border border-transparent text-[#b3a58e] hover:bg-white/5 hover:text-[#e3d2b3]'}`}
            >
              <span className="truncate">{item.shortName ?? item.name}</span>
              <span className="shrink-0 text-[11px] opacity-60">{item.officials.length}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="paper-noise relative overflow-hidden rounded-[1.5rem] border border-[#9a7848]/35 bg-[#272018] p-5 shadow-[0_24px_70px_rgb(0_0_0/28%)] sm:p-7">
        <div className="absolute inset-x-0 top-0 h-56 bg-[radial-gradient(ellipse_at_top,rgb(174_123_58/20%),transparent_70%)]" />
        <div className="relative flex items-start justify-between gap-4">
          <button type="button" onClick={onBack} className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-sm text-[#d9c9ac] transition hover:bg-black/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8ae5e]">
            <ArrowLeft className="size-4" />
            返回舆图
          </button>
          <span className="rounded-full border border-[#ae8a50]/30 bg-black/15 px-3 py-1.5 text-[11px] tracking-[.18em] text-[#bea067]">{institution.system}</span>
        </div>

        <div className="relative mx-auto mt-8 max-w-4xl">
          <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
            <Building2 className="size-6 text-[#b99658]" />
            <h2 className="mt-3 font-heading text-3xl font-semibold tracking-[.08em] text-[#f0deb9] sm:text-4xl">{institution.name}</h2>
            <p className="mt-3 max-w-xl text-[14px] leading-7 text-[#b4a58d]">{institution.summary}</p>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-3">
            {institution.officials.map((official, index) => {
              const indexed = indexedFor(official);
              return (
                <button
                  key={`${official.name}-${official.office}-${index}`}
                  type="button"
                  onClick={() => indexed && onSelect(indexed)}
                  className="animate-rise-in group relative min-h-28 overflow-hidden rounded-xl border border-[#a68048]/25 bg-[#1a1713]/72 p-4 text-left transition hover:-translate-y-1 hover:border-[#d0a85e]/55 hover:bg-[#2b2118] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8ae5e]"
                  style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-heading text-[17px] font-semibold text-[#ead7b4]">{official.name}</span>
                    <ChevronRight className="size-4 text-[#866d49] transition group-hover:translate-x-0.5 group-hover:text-[#d4aa5b]" />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <RankBadge rank={official.rank} />
                    <span className="text-[12px] text-[#9e8e75]">{official.count}</span>
                  </div>
                  <p className="mt-2 truncate text-[12px] text-[#7f7465]">{official.office}</p>
                </button>
              );
            })}
          </div>

          {institution.sourceNote && (
            <p className="mt-5 rounded-xl border border-[#9f7b47]/20 bg-black/10 px-4 py-3 text-[12px] leading-6 text-[#968873]">据资料底稿：{institution.sourceNote}</p>
          )}
        </div>
      </section>
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState<ViewName>('map');
  const [activeInstitution, setActiveInstitution] = useState<Institution>(localInstitutions[0]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedOfficial, setSelectedOfficial] = useState<IndexedOfficial | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [sourceOfficials, setSourceOfficials] = useState<SourceOfficial[]>([]);
  const [sourceReady, setSourceReady] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/data/ming-officials.json', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('资料载入失败');
        return response.json() as Promise<SourceData>;
      })
      .then((data) => {
        setSourceOfficials(data.officials);
        setSourceReady(true);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setSourceReady(false);
      });
    return () => controller.abort();
  }, []);

  const searchableOfficials = useMemo<IndexedOfficial[]>(() => {
    if (!sourceOfficials.length) return allOfficials;
    const summaries = new Map<string, string>();
    sourceOfficials.forEach((item) => {
      if (item.duty_notes && !summaries.has(item.institution)) summaries.set(item.institution, item.duty_notes);
    });
    return sourceOfficials.map((item) => ({
      id: item.record_id,
      name: item.title,
      rank: item.rank || '未标注',
      count: item.headcount || '未标注',
      office: item.department || item.institution,
      branch: inferBranch(item),
      note: item.uncertainty_flags.length
        ? `源表校注：${item.uncertainty_flags.map((flag) => String(flag)).join('；')}`
        : undefined,
      institutionId: item.institution,
      institutionName: item.institution,
      summary: item.duty_notes || summaries.get(item.institution) || '资料底稿未为这一官署另列职掌说明。',
      sourceRange: item.sources.map((source) => `${source.sheet} · ${source.range}`).join('、'),
    }));
  }, [sourceOfficials]);

  const counts = useMemo(
    () => ({ institutions: institutions.length, officials: searchableOfficials.length }),
    [searchableOfficials.length],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    type ModelContextLike = {
      registerTool: (
        tool: {
          name: string;
          title: string;
          description: string;
          inputSchema: object;
          annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
          execute: (input: unknown) => unknown;
        },
        options?: { signal?: AbortSignal },
      ) => void | Promise<void>;
    };

    const context = (document as Document & { modelContext?: ModelContextLike }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();

    void Promise.resolve(
      context.registerTool(
        {
          name: 'open_ming_official',
          title: '打开明代官职',
          description: '按官职名称打开大明职官图中的官职名牒。名称可为尚书、知府、监察御史等。',
          inputSchema: {
            type: 'object',
            properties: { title: { type: 'string', minLength: 1 } },
            required: ['title'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute(input) {
            const title =
              typeof input === 'object' && input !== null && 'title' in input && typeof input.title === 'string'
                ? input.title.trim()
                : '';
            if (!title) throw new Error('需要提供官职名称');
            const match = searchableOfficials.find((item) => item.name.includes(title) || title.includes(item.name));
            if (!match) throw new Error(`未找到官职：${title}`);
            setSelectedOfficial(match);
            setDetailOpen(true);
            return {
              title: match.name,
              rank: match.rank,
              headcount: match.count,
              institution: match.institutionName,
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);

    return () => lifecycle.abort();
  }, [searchableOfficials]);

  const showOfficial = (official: IndexedOfficial) => {
    setSelectedOfficial(official);
    setDetailOpen(true);
    setSearchOpen(false);
  };

  const enterInstitution = (institution: Institution, targetView: ViewName) => {
    setActiveInstitution(institution.scene === 'court' ? localInstitutions[0] : institution);
    setView(targetView);
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#171411] text-[#eadfc8]">
      <header className="sticky top-0 z-40 border-b border-[#9a7848]/25 bg-[#171411]/92 backdrop-blur-xl">
        <div className="mx-auto flex h-[4.75rem] max-w-[100rem] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <BrandMark />
          <div className="min-w-0">
            <h1 className="truncate font-heading text-lg font-semibold tracking-[.12em] text-[#f0dfbd] sm:text-xl">大明职官图</h1>
            <p className="hidden text-[11px] tracking-[.16em] text-[#94866f] sm:block">从朝堂到州县 · 官制空间志</p>
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-3 border-r border-white/10 pr-4 text-[12px] text-[#8f816c] lg:flex">
              <span><b className="mr-1 font-heading text-[#d7b76f]">{counts.institutions}</b>官署</span>
              <span><b className="mr-1 font-heading text-[#d7b76f]">{counts.officials}</b>职官条目</span>
            </div>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex h-10 items-center gap-2 rounded-full border border-[#a8844d]/35 bg-white/[.035] px-3 text-sm text-[#cbbda5] transition hover:border-[#c9a25b]/60 hover:bg-white/[.065] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8ae5e] sm:min-w-52 sm:justify-between"
            >
              <span className="flex items-center gap-2"><Search className="size-4" /><span className="hidden sm:inline">查官署、官职、品级</span></span>
              <kbd className="hidden rounded border border-white/10 bg-black/20 px-1.5 py-0.5 font-mono text-[10px] text-[#827765] sm:inline">Ctrl K</kbd>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[100rem] px-4 pb-6 pt-4 sm:px-6 lg:px-8">
        <Tabs value={view} onValueChange={(value) => setView(value as ViewName)} className="gap-4">
          <div className="flex items-center justify-between gap-4">
            <TabsList variant="line" className="h-10 gap-2 overflow-x-auto">
              <TabsTrigger value="map" className="px-3 text-[13px] data-active:text-[#e3bf72]"><MapIcon className="size-4" />天下舆图</TabsTrigger>
              <TabsTrigger value="court" className="px-3 text-[13px] data-active:text-[#e3bf72]"><Crown className="size-4" />皇城朝堂</TabsTrigger>
              <TabsTrigger value="local" className="px-3 text-[13px] data-active:text-[#e3bf72]"><Landmark className="size-4" />地方衙署</TabsTrigger>
            </TabsList>
            <div className="hidden items-center gap-2 text-[11px] tracking-[.12em] text-[#7e7260] md:flex">
              <Sparkles className="size-3.5 text-[#b28f52]" />
              据资料底稿整理 · 制度示意
            </div>
          </div>

          <TabsContent value="map" className="h-[calc(100vh-9.5rem)] min-h-[37rem]">
            <AtlasMap onEnter={enterInstitution} />
          </TabsContent>
          <TabsContent value="court">
            <CourtScene onBack={() => setView('map')} onSelect={showOfficial} />
          </TabsContent>
          <TabsContent value="local">
            <YamenScene
              institution={activeInstitution}
              onBack={() => setView('map')}
              onSelect={showOfficial}
              onChoose={setActiveInstitution}
            />
          </TabsContent>
        </Tabs>
      </div>

      <CommandDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="检索明代官职"
        description="按官职、官署、品级或职掌搜索"
        className="top-[18%] w-[min(42rem,calc(100%-2rem))] max-w-none translate-y-0 border border-[#aa844b]/35 bg-[#1d1915] shadow-[0_30px_100px_rgb(0_0_0/55%)]"
        showCloseButton
      >
        <Command className="bg-transparent">
          <CommandInput placeholder="输入：尚书、正三品、都察院……" className="h-11 text-[15px]" />
          <CommandList className="max-h-[28rem] p-2">
            <CommandEmpty className="text-[#9d8f78]">没有找到相符条目</CommandEmpty>
            <CommandGroup heading={`职官条目 · ${searchableOfficials.length}${sourceReady ? ' · 完整底稿' : ' · 载入中'}`}>
              {searchableOfficials.map((official) => (
                <CommandItem
                  key={official.id}
                  value={`${official.name} ${official.rank} ${official.office} ${official.institutionName} ${official.summary}`}
                  onSelect={() => showOfficial(official)}
                  className="gap-3 px-3 py-3 data-selected:bg-[#5d2a20]"
                >
                  <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-[#a17c45]/25 bg-[#2c231b]">
                    {official.branch === '武班' ? <Shield className="size-4 text-[#c39d59]" /> : official.branch === '监察' ? <Users className="size-4 text-[#c39d59]" /> : <BookOpenText className="size-4 text-[#c39d59]" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-heading text-[15px] text-[#ead9b9]">{official.name}</span>
                      <RankBadge rank={official.rank} />
                    </div>
                    <p className="mt-1 truncate text-[12px] text-[#938672]">{official.institutionName} · {official.office}</p>
                  </div>
                  <CommandShortcut>{official.count}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-[min(31rem,100%)] max-w-none border-[#a27c45]/35 bg-[#1c1814] p-0 text-[#eadfc8] shadow-[0_0_80px_rgb(0_0_0/45%)] sm:max-w-[31rem]">
          {selectedOfficial && (
            <>
              <SheetHeader className="border-b border-[#9a7848]/25 bg-[radial-gradient(circle_at_top_right,rgb(141_53_35/24%),transparent_60%)] p-6 pr-14">
                <div className="mb-5 flex items-center gap-2 text-[11px] tracking-[.2em] text-[#af915c]">
                  <BookOpenText className="size-4" />
                  职官名牒
                </div>
                <SheetTitle className="font-heading text-3xl font-semibold tracking-[.08em] text-[#f1dfbb]">{selectedOfficial.name}</SheetTitle>
                <SheetDescription className="mt-2 flex flex-wrap items-center gap-2 text-[#a69780]">
                  <RankBadge rank={selectedOfficial.rank} />
                  <span>{selectedOfficial.count}</span>
                  <span className="text-[#655c50]">·</span>
                  <span>{selectedOfficial.branch}</span>
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-5">
                  <div>
                    <p className="text-[11px] tracking-[.18em] text-[#8f7e64]">所在官署</p>
                    <p className="mt-2 font-heading text-xl text-[#ddc69e]">{selectedOfficial.institutionName}</p>
                    <p className="mt-1 text-sm text-[#9f9078]">{selectedOfficial.office}</p>
                  </div>
                  <div className="h-px bg-gradient-to-r from-[#a57e46]/35 to-transparent" />
                  <div>
                    <p className="text-[11px] tracking-[.18em] text-[#8f7e64]">机构职掌</p>
                    <p className="mt-2 text-[15px] leading-7 text-[#c7b79b]">{selectedOfficial.summary}</p>
                  </div>
                  {selectedOfficial.sourceRange && (
                    <div>
                      <p className="text-[11px] tracking-[.18em] text-[#8f7e64]">资料定位</p>
                      <p className="mt-2 font-mono text-[12px] text-[#9e8f78]">{selectedOfficial.sourceRange}</p>
                    </div>
                  )}
                  {selectedOfficial.note && (
                    <div className="rounded-xl border border-[#a57e46]/25 bg-[#2b2119] p-4">
                      <p className="text-[11px] tracking-[.18em] text-[#a88750]">底稿附注</p>
                      <p className="mt-2 text-[14px] leading-6 text-[#bdad93]">{selectedOfficial.note}</p>
                    </div>
                  )}
                  <div className="rounded-xl border border-white/[.06] bg-black/10 p-4 text-[12px] leading-6 text-[#877b69]">
                    明代官衔、加衔与实权常随年代及个人兼任而变化；本页呈现资料底稿所列制度位置。
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </main>
  );
}
