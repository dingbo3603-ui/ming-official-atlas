'use client';

// Native local images keep this static atlas portable across NAS and standalone Nginx.
/* oxlint-disable next/no-img-element */

import { useEffect, useMemo, useState } from 'react';
import { HistoryProvider, HistoryTimeline, OfficeHolders, OfficePeopleLabel, useHistory } from '@/components/history/history-context';
import { datasetUrl } from '@/lib/history-api';
import { readHistoryJson } from '@/lib/history-reader';
import {
  ArrowLeft,
  BookOpenText,
  ChevronRight,
  Crown,
  ExternalLink,
  Layers,
  Map as MapIcon,
  Search,
  MessageSquareText,
  Shield,
  Users,
  X,
} from 'lucide-react';

import { AtlasSearch } from '@/components/atlas-search';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ProvinceHierarchy, PrefectureHierarchy } from '@/components/administrative-hierarchy';
import { CapitalCouncil } from '@/components/capital-council';
import { EmpireMap } from '@/components/empire-map';
import { CourtFigure } from '@/components/court-figure';
import { VisitCounter } from '@/components/visit-counter';
import { SiteFeedback } from '@/components/site-feedback';
import { usePhoneLayout, usePhoneViewport } from '@/hooks/use-phone-layout';
import { MobileShell, MobilePeople } from '@/components/mobile/mobile-shell';
import { MobileWorld, MobileProvince, MobilePrefecture } from '@/components/mobile/mobile-geography';
import { MobileYamen, MobileCourt } from '@/components/mobile/mobile-scenes';
import { courtRoleMatchers, localYamenRoles } from '@/lib/scene-officials';
import {
  avatarForOfficial,
  avatarPaths,
  capitalInstitutions,
  wikipediaSources,
  type CapitalEra,
  type CapitalInstitution,
  type GeographyCounty,
  type GeographyData,
  type GeographyPrefecture,
  type GeographyProvince,
} from '@/lib/ming-atlas-v2';

export type SourceOfficial = {
  record_id: string;
  institution: string;
  title: string;
  rank: string | null;
  headcount: string | null;
  department: string | null;
  duty_notes: string | null;
  sources: Array<{ sheet: string; row: number; range: string; region: string }>;
  uncertainty_flags: unknown[];
  rank_review?: RankReview;
  title_periods?: {from:number;until:number;name:string}[];
  institution_id?: string;
  catalog_note?: string;
  catalog_kind?: string;
  historical_only?: boolean;
};

type RankReview = {
  record_id: string; original_rank: string | null; verified_rank: string | null;
  status: 'verified' | 'corrected' | 'qualified' | 'unresolved'; source_url: string; evidence: string; note: string;
  verified_title?: string; verified_institution?: string; verified_department?: string; display_rank?: string;
};

type Scene = 'empire' | 'province' | 'prefecture' | 'county' | 'capital' | 'court';

// These are floor coordinates, not screen coordinates or a complete historical roll call.
const courtPositions = [
  { slot:0, side:'civil', left:62, feet:71, height:11, outer:false },
  { slot:1, side:'civil', left:70, feet:79, height:13, outer:false },
  { slot:2, side:'civil', left:80, feet:79, height:13, outer:true },
  { slot:3, side:'civil', left:76, feet:86.5, height:13.75, outer:false },
  { slot:6, side:'civil', left:86, feet:86.5, height:13.75, outer:true },
  { slot:4, side:'civil', left:82, feet:94, height:14.5, outer:false },
  { slot:5, side:'civil', left:92, feet:94, height:14.5, outer:true },
  { slot:7, side:'military', left:38, feet:71, height:11, outer:false },
  { slot:8, side:'military', left:30, feet:79, height:13, outer:false },
  { slot:9, side:'military', left:20, feet:79, height:13, outer:true },
  { slot:10, side:'military', left:18, feet:94, height:14.5, outer:false },
  { slot:11, side:'military', left:8, feet:94, height:14.5, outer:true },
] as const;

const figureBounds: Record<string, [number, number, number, number]> = {
  [avatarPaths.civil]: [394,45,856,1221], [avatarPaths.emperor]: [400,47,855,1204],
  [avatarPaths.grandSecretary]: [399,50,854,1224], [avatarPaths.magistrate]: [394,54,849,1214],
  [avatarPaths.military]: [391,51,856,1199], [avatarPaths.prefect]: [417,62,844,1208],
  [avatarPaths.eunuch]: [410,52,857,1222], [avatarPaths.native]: [399,54,888,1205],
};

function StageFigure({ official }: { official: SourceOfficial }) {
  const source = avatarForOfficial(official.title, official.institution, official.department ?? '');
  const [left,top,right,bottom] = figureBounds[source];
  return <svg className="stage-figure" viewBox={`${left} ${top} ${right-left} ${bottom-top}`} aria-hidden="true"><image href={source} width="1254" height="1254" /></svg>;
}



function BrandMark() {
  return (
    <div className="relative grid size-10 shrink-0 place-items-center border border-[#d0a653]/55 bg-[#6d241d] shadow-[inset_0_0_0_3px_#321713,0_5px_18px_rgb(0_0_0/25%)]">
      <span className="font-heading text-[18px] font-black leading-none text-[#f4cf82]">明</span>
      <span className="pointer-events-none absolute inset-[3px] border border-[#e5bd67]/35" />
    </div>
  );
}

function RankBadge({ rank }: { rank: string | null }) {
  const value = rank || '品级未载';
  return <span className={`rank-badge ${/一品|二品|三品|超品/.test(value) ? 'rank-badge-high' : ''}`}>{value}</span>;
}

function Avatar({ official, className = '' }: { official: SourceOfficial; className?: string }) {
  return (
    <img
      src={avatarForOfficial(official.title, official.institution, official.department ?? '')}
      alt={`${official.title}的明代职官形象示意`}
      className={className}
      draggable={false}
    />
  );
}

function Breadcrumbs({ province, prefecture, county, onNavigate }: {
  province: GeographyProvince | null;
  prefecture: GeographyPrefecture | null;
  county: GeographyCounty | null;
  onNavigate: (scene: Scene) => void;
}) {
  return (
    <nav aria-label="地图层级" className="atlas-breadcrumbs">
      <button type="button" onClick={() => onNavigate('empire')}>大明舆图</button>
      {province && <><ChevronRight /><button type="button" onClick={() => onNavigate('province')}>{province.shortName}</button></>}
      {prefecture && <><ChevronRight /><button type="button" onClick={() => onNavigate('prefecture')}>{prefecture.name}</button></>}
      {county?.parentState && <><ChevronRight /><button type="button" onClick={() => onNavigate('prefecture')}>{county.parentState.name}</button></>}{county && <><ChevronRight /><span>{county.name}</span></>}
    </nav>
  );
}

function CountyYamen({ province, prefecture, county, officials, onSelect }: {
  province: GeographyProvince; prefecture: GeographyPrefecture; county: GeographyCounty;
  officials: SourceOfficial[]; onSelect: (official: SourceOfficial) => void;
}) {
  const { isState, isCapitalCounty, roles, teachers } = localYamenRoles(prefecture, county, officials);
  return (
    <section className="yamen-scene paper-noise animate-rise-in">
      <div className="yamen-scroll"><div className="yamen-stage">
        <img src="/county-yamen-scene-v2.webp" alt="明代地方官署场景插画" className="scene-background" />
        <div className="yamen-overlay" />
        <div className="scene-title-plaque"><small>{province.shortName} · {prefecture.name}{county.parentState ? ` · ${county.parentState.name}` : ''} · {isState ? '州制' : isCapitalCounty ? '京县制' : '县制'}</small><strong>{county.name}衙署</strong></div>
        <div className="yamen-character-grid">
          {roles.map(({official,slot}) => <button type="button" key={official.record_id} className={`yamen-character ${slot===0?'yamen-chief':'yamen-assistant'}`} style={{left:`${[50,34,50,66][slot]}%`}} onClick={() => onSelect(official)}>
            <StageFigure official={official} /><span className="character-label"><OfficePeopleLabel scene officialId={official.record_id} officialTitle={official.title} placeName={county.name} provinceName={province.shortName} prefectureName={prefecture.name} /><b>{official.title}</b><small>{official.rank}</small></span>
          </button>)}
        </div>
        <img src="/county-yamen-scene-v2.webp" className="yamen-desk-foreground" alt="" aria-hidden="true" />
      </div></div>
      <div className="yamen-roster-footer"><div><strong>{isState ? '州官' : isCapitalCounty ? '京县官' : '县官'}职制</strong><p>主官居案后，佐贰与首领官列堂下。按职官类型展示，实际设员以地方志为准。</p></div><div className="school-officials"><span>{isState ? '州儒学' : '县儒学'}</span>{teachers.map((official) => <button key={official.record_id} onClick={() => onSelect(official)}>{official.title}<small>{official.rank}</small><ChevronRight size={14}/></button>)}</div></div>
      <div className="scene-caption"><Shield className="size-4"/><span>人名依据所选年内、本地任职记载，含年内先后任职；未载人名不等于职位空缺。形象为类型示意，点击查看人物、品秩与原典。</span></div>
    </section>
  );
}

function findCourtOfficial(officials: SourceOfficial[], matcher: (typeof courtRoleMatchers)[number]) {
  return officials.find((official) => matcher.pattern.test(official.title) && (!matcher.institution || matcher.institution.test(`${official.institution} ${official.department ?? ''}`)));
}

function CourtScene({ officials, onBack, onSelect }: { officials: SourceOfficial[]; onBack: () => void; onSelect: (official: SourceOfficial) => void }) {
  const history = useHistory();
  const roles = courtRoleMatchers.map((matcher, slot) => ({ matcher, slot, official: findCourtOfficial(officials, matcher) })).filter((item): item is { matcher: (typeof courtRoleMatchers)[number]; slot: number; official: SourceOfficial } => Boolean(item.official));
  return <section className="court-game-shell animate-rise-in">
    <div className="court-game-topbar"><button type="button" onClick={onBack}><ArrowLeft className="size-4"/>皇城官署图</button><div><Crown size={17}/><strong>文武朝班图</strong></div><span className="court-date">{history.year} 年 · 面北视角 · 文东武西</span></div>
    <div className="court-game-scroll"><div className="court-game-stage">
      <img src="/court-game-scene-v2.webp" alt="面北望向御座的明代殿堂插画" className="scene-background"/><div className="court-game-vignette"/>
      <button type="button" className="throne-label" onClick={() => { const emperor = officials.find(item=>item.record_id === 'history-emperor'); if(emperor) onSelect(emperor); }}><svg viewBox="400 47 455 550" aria-hidden="true"><image href={avatarPaths.emperor} width="1254" height="1254"/></svg><span><OfficePeopleLabel scene officialId="history-emperor" /><b>皇帝</b></span></button>
      {courtPositions.map((position) => {
        const role=roles.find((item) => item.slot===position.slot); if(!role) return null;
        return <button key={role.official.record_id} type="button" className={`court-character court-character-${position.side} ${position.outer ? "court-outer-column" : ""}`} style={{left:`${position.left}%`,bottom:`${100-position.feet}%`,height:`${position.height}%`}} onClick={() => onSelect(role.official)}>
          <CourtFigure isMilitary={position.side === 'military'} className="stage-figure"/><span className={'court-character-label' + (position.slot === 0 ? ' is-cabinet' : '')}><OfficePeopleLabel scene officialId={role.official.record_id} /><b>{role.matcher.label}</b><small>{role.official.rank}</small></span>
        </button>;
      })}
      <div className="court-side-marker military">西 · 武班</div><div className="court-side-marker civil">东 · 文班</div>
      <div className="court-axis-note">御道</div>
    </div></div>
    <div className="court-research-note"><BookOpenText size={16}/><p>此图为明中后期十二类官职的朝班示意；点击查询所选年份人物，未逐年复原当年的设官和实际出席情况。大朝贺百官主体列殿外丹墀；常朝另分御门、御殿等仪。大学士本品正五，晚明朝班在六部上，兼衔与侍班身份另论。</p><a href="/data/ming-official-rank-audit.html" target="_blank" rel="noreferrer">朝仪与全部官品考证 <ExternalLink size={14}/></a></div>
    <div className="court-official-index">{roles.map(({matcher,official}) => <button key={`${matcher.label}-${official.record_id}`} onClick={() => onSelect(official)}><span>{matcher.label}<OfficePeopleLabel officialId={official.record_id} /></span><small>{official.rank}</small><ChevronRight size={13}/></button>)}</div>
  </section>;
}

function OfficialDetail({ official, open, setOpen, onReturn, placeName, provinceName, prefectureName, mobile = false }: { placeName?: string; provinceName?: string; prefectureName?: string; official: SourceOfficial | null; open: boolean; setOpen: (open: boolean) => void; onReturn?: () => void; mobile?: boolean }) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false} className="official-detail-floating">
        {mobile ? <div className="phone-detail-toolbar">{onReturn ? <button onClick={onReturn}><ArrowLeft size={19}/>返回官署</button> : <span>官职详情</span>}<DialogClose aria-label="关闭官职详情"><X size={22}/></DialogClose></div> : <DialogClose className="floating-close" aria-label="关闭官职详情"><X size={22} /></DialogClose>}
        {official && <>{!mobile && <div className="official-detail-portrait"><Avatar official={official} className="h-full w-full object-contain object-bottom" /><div className="portrait-gradient" /><span className="portrait-caption">职官类型形象示意</span></div>}<div className="official-detail-body">{onReturn && !mobile && <button className="detail-return" onClick={onReturn}><ArrowLeft size={18}/>返回官署职官</button>}
          <DialogHeader className="text-left"><div className="side-kicker">{official.institution}</div><DialogTitle className="font-heading text-3xl text-[#f0dfbd]">{official.title}</DialogTitle><DialogDescription className="text-[#9f927e]">{official.department || '所属机构未另载'}</DialogDescription></DialogHeader>
          <div className="detail-rank-row"><RankBadge rank={official.rank} /><span>底稿定员：{official.headcount || '未载'}</span></div>
          <OfficeHolders officialId={official.record_id} officialTitle={official.title} placeName={placeName} provinceName={provinceName} prefectureName={prefectureName} />
          <section className="detail-section"><h3>职掌</h3><p>{official.duty_notes || '原始底稿未附独立职责说明。'}</p></section>
          {official.catalog_note && <p className="institution-context-note">{official.catalog_note}</p>}
          {official.rank_review && <section className="detail-section rank-research"><h3>品秩考证 · {({verified:'已核',corrected:'已修正',qualified:'有条件说明',unresolved:'待核'})[official.rank_review.status]}</h3><p>{official.rank_review.note}</p><blockquote>{official.rank_review.evidence}</blockquote><a href={official.rank_review.source_url} target="_blank" rel="noreferrer">查看原典 <ExternalLink size={13}/></a>{official.rank_review.original_rank !== official.rank && <small>原底稿记载：{official.rank_review.original_rank || '本次补录'}</small>}</section>}
          <section className="detail-section"><h3>资料定位</h3>{official.sources.map((source) => <p key={`${source.range}-${source.row}`}>{source.sheet} · {source.range}{source.row > 0 ? ` · 第 ${source.row} 行` : ''}</p>)}</section>
          {official.uncertainty_flags.length > 0 && <section className="detail-section warning"><h3>待核说明</h3><p>{official.uncertainty_flags.map(String).join('；')}</p></section>}
          <p className="portrait-disclaimer">人物图用于区分职官类型，不对应具体任职者，也不作为服饰考证图。</p>
        </div></>}
      </DialogContent>
    </Dialog>
  );
}

function SourceDrawer({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={setOpen}><SheetContent showCloseButton={false} className="atlas-source-drawer w-[min(94vw,35rem)] overflow-y-auto border-l-[#8f6b3d]/45 bg-[#171512] text-[#e9dcc2] sm:max-w-[35rem]">
      <SheetClose className="detail-close" aria-label="关闭史料"><X size={18} /></SheetClose><SheetHeader className="text-left"><SheetTitle className="font-heading text-2xl text-[#f0dfbd]">史料口径与来源</SheetTitle><SheetDescription className="leading-6 text-[#9f927e]">人物按所选年份检索，默认嘉靖四十五年（1566）。地理与官制图仍是注明时代的参照，尚未逐年复原疆域及全部设官。</SheetDescription></SheetHeader>
      <a href="/data/ming-official-rank-audit.html" target="_blank" rel="noreferrer" className="source-link-card mt-6"><BookOpenText size={18}/><span>朝班考证与原始 571 条官品核查</span><ExternalLink className="ml-auto size-4"/></a>
      <div className="mt-6 space-y-3">{wikipediaSources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="source-link-card"><BookOpenText className="size-4" /><span>{source.title}</span><ExternalLink className="ml-auto size-3.5" /></a>)}</div>
      <a className="source-link-card mt-4" href="/data/map-geography-sources.md" target="_blank" rel="noreferrer"><MapIcon className="size-4" /><span>舆图地理依据与省域范围说明</span><ExternalLink className="ml-auto size-3.5" /></a><div className="fact-caveat mt-6">地方树录入两京十三省、200 个府／直隶州／军民府等同级节点、1161 个县与 208 个属州；职官录入用户底稿 553 条，并据《明史》等补录中书省、县儒学、州官与京县官共 18 条；上述 571 条底稿有独立品秩审校记录；其后拆分左右职官，并继续补入六部分司、内廷、早期旧官及加衔，新增条目各附出处与年代说明。有非虚构来源、未经逐条复核的资料也先收录展示。土府、土州、宣慰／宣抚／安抚／长官司体系尚未穷尽，页面会明确保留这一覆盖边界。</div>
      <div className="fact-caveat mt-3">维基百科用于建立条目索引；府州县再与《明史·地理志》交叉核对，皇城布局另与故宫博物院研究资料交叉核对。府州县区块是层级导航。天下舆图的地形插画按经纬度骨架绘制，省域采用 Natural Earth 现代几何概略合并并作局部修正，不能视为1582年精确省界；黄河下游取夺淮入海方向。</div>
    </SheetContent></Sheet>
  );
}

export default function Home() { return <HistoryProvider><AtlasHome /></HistoryProvider>; }

function AtlasHome() {
  const { year } = useHistory();
  const isPhone = usePhoneLayout();
  usePhoneViewport(isPhone);
  const [phonePeople, setPhonePeople] = useState(false);
  const [scene, setScene] = useState<Scene>('empire');
  const [geography, setGeography] = useState<GeographyData | null>(null);
  const [geoError, setGeoError] = useState(false);
  const [officeCatalog, setOfficials] = useState<SourceOfficial[]>([]);
  const officials = useMemo(()=>officeCatalog.map(official=>{
    const title=official.title_periods?.find(period=>period.from<=year&&period.until>=year)?.name;
    return title?{...official,title}:official;
  }),[officeCatalog,year]);
  const [selectedProvince, setSelectedProvince] = useState<GeographyProvince | null>(null);
  const [selectedPrefecture, setSelectedPrefecture] = useState<GeographyPrefecture | null>(null);
  const [selectedCounty, setSelectedCounty] = useState<GeographyCounty | null>(null);
  const era: CapitalEra = year < 1380 ? 'hongwu' : 'late-ming';
  const [selectedInstitution, setSelectedInstitution] = useState<CapitalInstitution>(capitalInstitutions.find((item) => item.id === 'cabinet')!);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceOpen, setSourceOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [selectedOfficial, setSelectedOfficial] = useState<SourceOfficial | null>(null);
  const [detailIsLocal, setDetailIsLocal] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [institutionOpen, setInstitutionOpen] = useState(false);
  const [detailReturn, setDetailReturn] = useState<(() => void) | null>(null);

  useEffect(() => { window.scrollTo({top:0,left:0}); }, [scene,phonePeople,selectedProvince?.id,selectedPrefecture?.id,selectedCounty?.id]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      readHistoryJson<{officials:SourceOfficial[]}>(datasetUrl('office-catalog'), controller.signal),
      readHistoryJson<GeographyData>(datasetUrl('ming-administrative-divisions-v2'), controller.signal),
    ]).then(([officeData, geographyData]) => {
      if (controller.signal.aborted) return;
      setOfficials(officeData.officials); setGeography(geographyData); setGeoError(false);
    }).catch(() => { if (!controller.signal.aborted) setGeoError(true); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen((open) => !open); }
      if (event.key === 'Escape' && !searchOpen && !detailOpen && !sourceOpen && !institutionOpen && !feedbackOpen) {
        if (scene === 'county') { setSelectedCounty(null); setScene('prefecture'); } else if (scene === 'prefecture') { setSelectedCounty(null); setSelectedPrefecture(null); setScene('province'); } else if (scene === 'province' || scene === 'capital') { setSelectedProvince(null); setSelectedPrefecture(null); setSelectedCounty(null); setScene('empire'); } else if (scene === 'court') setScene('capital');
      }
    };
    window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown);
  }, [scene, searchOpen, detailOpen, sourceOpen, institutionOpen, feedbackOpen]);

  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: { registerTool?: (tool: unknown) => { unregister?: () => void } } }).modelContext;
    if (!modelContext?.registerTool) return;
    const registration = modelContext.registerTool({
      name: 'navigate_ming_atlas', description: '打开大明职官图的天下、京师皇城或朝堂视图。',
      inputSchema: { type: 'object', properties: { destination: { type: 'string', enum: ['empire', 'capital', 'court'] } }, required: ['destination'] },
      execute: async ({ destination }: { destination: 'empire' | 'capital' | 'court' }) => { setScene(destination); return { content: [{ type: 'text', text: `已打开${destination}` }] }; },
    });
    return () => registration?.unregister?.();
  }, []);

  const searchableOfficials = year >= 1384 ? officials : officials.filter(official => !/司礼监/.test(`${official.title} ${official.department || ''} ${official.institution}`));
  const openOfficial = (official: SourceOfficial, onReturn?: () => void, local = true) => { setSelectedOfficial(official); setDetailIsLocal(local && scene === 'county'); setDetailReturn(() => onReturn || null); setDetailOpen(true); };
  const goProvince = (province: GeographyProvince) => { setSelectedProvince(province); setSelectedPrefecture(null); setSelectedCounty(null); setScene('province'); };
  const goPrefecture = (prefecture: GeographyPrefecture) => { setSelectedPrefecture(prefecture); setSelectedCounty(null); setScene('prefecture'); };
  const goCounty = (county: GeographyCounty) => { setSelectedCounty(county); setScene('county'); };
  const navigate = (destination: Scene) => {
    setPhonePeople(false);
    if (destination === 'empire') { setSelectedProvince(null); setSelectedPrefecture(null); setSelectedCounty(null); }
    else if (destination === 'province') { setSelectedPrefecture(null); setSelectedCounty(null); }
    else if (destination === 'prefecture') setSelectedCounty(null);
    setScene(destination);
  };
  const visibleTitle = useMemo(() => {
    if (scene === 'capital') return '京师皇城'; if (scene === 'court') return '文武朝班图'; if (scene === 'province') return selectedProvince?.shortName || '府州图'; if (scene === 'prefecture') return selectedPrefecture?.name || '州县图'; if (scene === 'county') return selectedCounty?.name || '县衙'; return '大明舆图';
  }, [scene, selectedProvince, selectedPrefecture, selectedCounty]);

  return (
    <main className={'atlas-app' + (isPhone ? ' phone-app' : '')}>
      {isPhone ? <MobileShell section={phonePeople ? 'people' : scene === 'capital' || scene === 'court' ? 'capital' : 'world'} onWorld={() => navigate('empire')} onCapital={() => navigate('capital')} onPeople={() => setPhonePeople(true)} onSearch={() => setSearchOpen(true)} onSources={() => setSourceOpen(true)} onFeedback={() => setFeedbackOpen(true)}
        backLabel={scene === 'county' ? `返回${selectedPrefecture?.name || '府州'}` : scene === 'prefecture' ? `返回${selectedProvince?.shortName || '省域'}` : scene === 'court' ? '返回中央官署' : '返回天下'}
        onBack={!phonePeople && ['province','prefecture','county','court'].includes(scene) ? () => navigate(scene === 'county' ? 'prefecture' : scene === 'prefecture' ? 'province' : scene === 'court' ? 'capital' : 'empire') : undefined}>
        {phonePeople ? <MobilePeople/> : <>
          {scene === 'empire' && <MobileWorld geography={geography} error={geoError} onProvince={goProvince} onPlace={(province,prefecture,county) => {setSelectedProvince(province);setSelectedPrefecture(prefecture);setSelectedCounty(county);setScene(county ? 'county' : 'prefecture');}}/>}
          {scene === 'province' && selectedProvince && <MobileProvince key={selectedProvince.id} province={selectedProvince} onPrefecture={goPrefecture} onCounty={(prefecture,county) => {setSelectedPrefecture(prefecture);goCounty(county);}}/>}
          {scene === 'prefecture' && selectedProvince && selectedPrefecture && <MobilePrefecture key={selectedPrefecture.id} province={selectedProvince} prefecture={selectedPrefecture} onCounty={goCounty}/>}
          {scene === 'county' && selectedProvince && selectedPrefecture && selectedCounty && <MobileYamen province={selectedProvince} prefecture={selectedPrefecture} county={selectedCounty} officials={officials} onSelect={openOfficial}/>}
          {scene === 'capital' && <CapitalCouncil mobile open={institutionOpen} setOpen={setInstitutionOpen} era={era} selectedInstitution={selectedInstitution} setSelectedInstitution={setSelectedInstitution} officials={officials} onSelectOfficial={openOfficial} onCourt={() => navigate('court')} onNorthZhili={() => {const province = geography?.provinces.find(item => item.id === 'beizhili');if(province)goProvince(province);}}/>}
          {scene === 'court' && <MobileCourt officials={officials} onSelect={openOfficial}/>}
        </>}
      </MobileShell> : <>
      <header className="atlas-header">
        <div className="flex min-w-0 items-center gap-3"><BrandMark /><div className="min-w-0"><h1>大明职官图 <span>山河与庙堂</span></h1><p>{visibleTitle}</p></div></div>
        <div className="header-stats"><span><MapIcon />州省与边区</span><span><Layers />{geography?.metadata.prefectureCount ?? '—'} 府州</span><span><Users />{officials.length || '—'} 职官</span></div>
        <div className="header-actions"><button type="button" onClick={() => setFeedbackOpen(true)} className="header-text-button"><MessageSquareText />反馈</button><button type="button" onClick={() => setSourceOpen(true)} className="header-text-button"><BookOpenText />史料</button><button type="button" onClick={() => setSearchOpen(true)} aria-label="搜索人物与官职（Ctrl K）" className="search-trigger"><Search /><span>搜索人物 / 官职</span><kbd>Ctrl K</kbd></button></div>
      </header>
      <HistoryTimeline />
      <div className="atlas-subnav">
        {scene !== 'capital' && scene !== 'court' ? <Breadcrumbs province={selectedProvince} prefecture={selectedPrefecture} county={selectedCounty} onNavigate={navigate} /> : <nav className="atlas-breadcrumbs"><button type="button" onClick={() => navigate('empire')}>大明舆图</button><ChevronRight /><button type="button" onClick={() => navigate('capital')}>京师皇城</button>{scene === 'court' && <><ChevronRight /><span>文武朝班图</span></>}</nav>}
        <div className="view-switcher"><button type="button" aria-pressed={scene !== 'capital' && scene !== 'court'} className={scene !== 'capital' && scene !== 'court' ? 'is-active' : ''} onClick={() => navigate('empire')}><MapIcon />天下</button><button type="button" aria-pressed={scene === 'capital' || scene === 'court'} className={scene === 'capital' || scene === 'court' ? 'is-active' : ''} onClick={() => navigate('capital')}><Crown />京师</button></div>
      </div>
      <div className="atlas-workspace">
        {!geography && !geoError && scene === 'empire' && <div className="loading-atlas"><Skeleton className="h-full w-full bg-[#2b251d]" /><span>正在铺开府州舆图……</span></div>}
        {geoError && <div className="fatal-data-note">府州县数据未能载入，已停止显示不完整地图。请刷新页面重试。</div>}
        {(geography || scene === 'capital' || scene === 'court') && <>
          {scene === 'empire' && <EmpireMap geography={geography} onProvince={goProvince} onCapital={() => navigate('capital')} />}
          {scene === 'province' && selectedProvince && <ProvinceHierarchy key={selectedProvince.id} province={selectedProvince} onPrefecture={goPrefecture} onCounty={(prefecture, county) => {setSelectedPrefecture(prefecture);goCounty(county);}} />}
          {scene === 'prefecture' && selectedProvince && selectedPrefecture && <PrefectureHierarchy province={selectedProvince} prefecture={selectedPrefecture} onCounty={goCounty} onProvince={() => navigate('province')} />}
          {scene === 'county' && selectedProvince && selectedPrefecture && selectedCounty && <CountyYamen province={selectedProvince} prefecture={selectedPrefecture} county={selectedCounty} officials={officials} onSelect={openOfficial} />}
          {scene === 'capital' && <CapitalCouncil open={institutionOpen} setOpen={setInstitutionOpen} era={era}  selectedInstitution={selectedInstitution} setSelectedInstitution={setSelectedInstitution} officials={officials} onSelectOfficial={openOfficial} onCourt={() => navigate('court')} onNorthZhili={() => { const province = geography?.provinces.find((item) => item.id === 'beizhili'); if (province) goProvince(province); }} />}
          {scene === 'court' && <CourtScene officials={officials} onBack={() => navigate('capital')} onSelect={openOfficial} />}
        </>}
      </div>
      </>}
      {searchOpen && <AtlasSearch officials={searchableOfficials} initialQuery={searchQuery} onQueryChange={setSearchQuery} onClose={() => setSearchOpen(false)} onReturn={isPhone ? () => setSearchOpen(true) : undefined} onOfficial={official => openOfficial(official, isPhone ? () => setSearchOpen(true) : undefined, false)} />}
      <OfficialDetail mobile={isPhone} placeName={detailIsLocal ? selectedCounty?.name : undefined} provinceName={detailIsLocal ? selectedProvince?.shortName : undefined} prefectureName={detailIsLocal ? selectedPrefecture?.name : undefined} official={selectedOfficial} open={detailOpen} setOpen={setDetailOpen} onReturn={detailReturn ? () => {setDetailOpen(false); detailReturn(); setDetailReturn(null);} : undefined} />
      <SourceDrawer open={sourceOpen} setOpen={setSourceOpen} />
      <SiteFeedback open={feedbackOpen} onOpenChange={setFeedbackOpen} year={year} context={isPhone&&phonePeople?'人物名册':['province','prefecture','county'].includes(scene)?[selectedProvince?.shortName,selectedPrefecture?.name,selectedCounty?.parentState?.name,selectedCounty?.name].filter(Boolean).join(' · '):visibleTitle}/>
      <VisitCounter />
    </main>
  );
}
