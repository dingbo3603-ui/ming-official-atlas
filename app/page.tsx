'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpenText,
  Building2,
  ChevronRight,
  Clock,
  Crown,
  ExternalLink,
  Landmark,
  Layers,
  Map as MapIcon,
  Search,
  Shield,
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
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  avatarForOfficial,
  avatarPaths,
  capitalInstitutions,
  palaceAxis,
  provinceHotspots,
  wikipediaSources,
  type CapitalEra,
  type CapitalInstitution,
  type GeographyCounty,
  type GeographyData,
  type GeographyPrefecture,
  type GeographyProvince,
} from '@/lib/ming-atlas-v2';

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

const supplementalOfficials: SourceOfficial[] = [
  { record_id: 'supplement-zhongshu-left-chancellor', institution: '中书省', title: '左丞相', rank: '正一品', headcount: '一人', department: null, duty_notes: '明初中书省最高长官之一，与右丞相统领百职、总理六部事务；洪武十三年废。', sources: [{ sheet: '维基百科补录（据《明史》卷七十二）', row: 0, range: '中书省', region: '中央政府' }], uncertainty_flags: ['仅适用于洪武十三年以前'] },
  { record_id: 'supplement-zhongshu-right-chancellor', institution: '中书省', title: '右丞相', rank: '正一品', headcount: '一人', department: null, duty_notes: '明初中书省最高长官之一，与左丞相统领百职、总理六部事务；洪武十三年废。', sources: [{ sheet: '维基百科补录（据《明史》卷七十二）', row: 0, range: '中书省', region: '中央政府' }], uncertainty_flags: ['仅适用于洪武十三年以前'] },
  { record_id: 'supplement-zhongshu-pingzhang', institution: '中书省', title: '平章政事', rank: '从一品', headcount: '一人', department: null, duty_notes: '中书省辅政官，参与统领百职；洪武九年裁汰。', sources: [{ sheet: '维基百科补录（据《明史》卷七十二）', row: 0, range: '中书省', region: '中央政府' }], uncertainty_flags: ['洪武九年裁汰'] },
  { record_id: 'supplement-zhongshu-left-assistant', institution: '中书省', title: '左丞', rank: '正二品', headcount: '一人', department: '左司', duty_notes: '中书省辅政官，参与统领百职；洪武十三年随中书省废。', sources: [{ sheet: '维基百科补录（据《明史》卷七十二）', row: 0, range: '中书省', region: '中央政府' }], uncertainty_flags: ['仅适用于洪武十三年以前'] },
  { record_id: 'supplement-zhongshu-right-assistant', institution: '中书省', title: '右丞', rank: '正二品', headcount: '一人', department: '右司', duty_notes: '中书省辅政官，参与统领百职；洪武十三年随中书省废。', sources: [{ sheet: '维基百科补录（据《明史》卷七十二）', row: 0, range: '中书省', region: '中央政府' }], uncertainty_flags: ['仅适用于洪武十三年以前'] },
  { record_id: 'supplement-zhongshu-councillor', institution: '中书省', title: '参知政事', rank: '从二品', headcount: '一人', department: null, duty_notes: '中书省辅政官，参与统领百职；洪武九年裁汰。', sources: [{ sheet: '维基百科补录（据《明史》卷七十二）', row: 0, range: '中书省', region: '中央政府' }], uncertainty_flags: ['洪武九年裁汰'] },
  { record_id: 'supplement-zhongshu-drafter', institution: '中书省', title: '中书舍人', rank: '从七品', headcount: '十人', department: null, duty_notes: '洪武七年先置直省舍人十人，旋改中书舍人；洪武十三年罢中书省后此职仍存。', sources: [{ sheet: '维基百科补录（据《明史》卷七十二）', row: 0, range: '中书省', region: '中央政府' }], uncertainty_flags: [] },
  { record_id: 'supplement-county-confucian-instructor', institution: '县儒学', title: '教谕', rank: '未入流', headcount: '一人', department: '县儒学', duty_notes: '掌教诲本县生员；县学额设教谕一人。', sources: [{ sheet: '《明史》卷七十五补录', row: 0, range: '儒学', region: '地方官制' }], uncertainty_flags: [] },
  { record_id: 'supplement-county-confucian-assistant', institution: '县儒学', title: '训导', rank: '未入流', headcount: '二人', department: '县儒学', duty_notes: '佐教谕教诲本县生员；县学额设训导二人。', sources: [{ sheet: '《明史》卷七十五补录', row: 0, range: '儒学', region: '地方官制' }], uncertainty_flags: [] },
];

type Scene = 'empire' | 'province' | 'prefecture' | 'county' | 'capital' | 'court';

const yamenRoleMatchers = [
  { label: '知县', pattern: /知州\/知县|(^|、)知县($|、)/ },
  { label: '县丞', pattern: /县丞/ },
  { label: '主簿', pattern: /主簿/, institution: /州\/县|县/ },
  { label: '典史', pattern: /典史/ },
  { label: '儒学教谕', pattern: /教谕/, institution: /县儒学/ },
  { label: '儒学训导', pattern: /训导/, institution: /县儒学/ },
  { label: '巡检', pattern: /巡检/ },
];

const courtRoleMatchers = [
  { label: '内阁大学士', pattern: /大学士/, institution: /内阁/ },
  { label: '吏部尚书', pattern: /吏部尚书/ },
  { label: '户部尚书', pattern: /户部尚书/ },
  { label: '礼部尚书', pattern: /礼部尚书/ },
  { label: '刑部尚书', pattern: /刑部尚书/ },
  { label: '工部尚书', pattern: /工部尚书/ },
  { label: '兵部尚书', pattern: /兵部尚书/ },
  { label: '左右都督', pattern: /左右都督|左、右都督|左都督/ },
  { label: '都督同知', pattern: /都督同知/ },
  { label: '都督佥事', pattern: /都督佥事/ },
  { label: '锦衣卫指挥使', pattern: /锦衣卫指挥使|指挥使/, institution: /锦衣卫/ },
  { label: '都指挥使', pattern: /^都指挥使$/, institution: /都指挥使司/ },
];

const courtPositions = [
  { side: 'civil', left: 20, top: 51, scale: 0.82 },
  { side: 'civil', left: 28, top: 43, scale: 0.72 },
  { side: 'civil', left: 13, top: 62, scale: 0.98 },
  { side: 'civil', left: 31, top: 62, scale: 0.98 },
  { side: 'civil', left: 22, top: 72, scale: 1.1 },
  { side: 'civil', left: 38, top: 72, scale: 1.1 },
  { side: 'military', left: 80, top: 51, scale: 0.82 },
  { side: 'military', left: 72, top: 43, scale: 0.72 },
  { side: 'military', left: 87, top: 62, scale: 0.98 },
  { side: 'military', left: 69, top: 62, scale: 0.98 },
  { side: 'military', left: 78, top: 72, scale: 1.1 },
  { side: 'military', left: 62, top: 72, scale: 1.1 },
] as const;

function officialMatchesInstitution(official: SourceOfficial, institution: CapitalInstitution) {
  const haystack = `${official.institution} ${official.department ?? ''} ${official.title}`;
  return institution.keywords.some((keyword) => haystack.includes(keyword));
}

function countyCount(prefecture: GeographyPrefecture) {
  return prefecture.directCounties.length + prefecture.subprefectures.reduce((sum, item) => sum + item.counties.length + 1, 0);
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

function OfficialMiniCard({ official, onSelect }: { official: SourceOfficial; onSelect: (official: SourceOfficial) => void }) {
  return (
    <button type="button" onClick={() => onSelect(official)} className="official-mini-card group">
      <div className="official-avatar-frame">
        <Avatar official={official} className="size-full object-cover object-top transition duration-300 group-hover:scale-105" />
      </div>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-heading text-[15px] font-semibold text-[#efe0c2]">{official.title}</span>
        <span className="mt-1 block truncate text-[12px] text-[#9f927d]">{official.institution}</span>
      </span>
      <RankBadge rank={official.rank} />
    </button>
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
      {county && <><ChevronRight /><span>{county.name}</span></>}
    </nav>
  );
}

function EmpireMap({ geography, onProvince, onCapital }: {
  geography: GeographyData | null;
  onProvince: (province: GeographyProvince) => void;
  onCapital: () => void;
}) {
  const [focused, setFocused] = useState('beizhili');
  const activeHotspot = provinceHotspots.find((item) => item.id === focused) ?? provinceHotspots[0];
  const activeProvince = geography?.provinces.find((item) => item.id === activeHotspot.id);

  return (
    <div className="scene-grid">
      <section className="historical-map-shell paper-noise">
        <div className="historical-map-stage">
          <img src="/ming-china-1580-source.jpg" alt="1580年前后的明代疆域历史地图" className="historical-map-image" />
          <div className="historical-map-vignette" />
          {provinceHotspots.map((hotspot) => {
            const province = geography?.provinces.find((item) => item.id === hotspot.id);
            const isCapital = hotspot.id === 'beizhili';
            return (
              <button
                type="button"
                key={hotspot.id}
                className={`province-hotspot province-hotspot-${hotspot.accent} ${focused === hotspot.id ? 'is-active' : ''}`}
                style={{ left: `${hotspot.x}%`, top: `${hotspot.y}%` }}
                onMouseEnter={() => setFocused(hotspot.id)}
                onFocus={() => setFocused(hotspot.id)}
                onClick={() => (isCapital ? onCapital() : province && onProvince(province))}
                disabled={!province && !isCapital}
                aria-label={`${hotspot.shortName}，${isCapital ? '进入京师皇城' : '查看府州'}`}
              >
                <span>{hotspot.shortName}</span>
                <small>{province ? `${province.prefectures.length} 府州` : isCapital ? '皇城' : '载入中'}</small>
              </button>
            );
          })}
        </div>
        <div className="map-source-strip">
          <span><Clock className="size-3.5" /> 主时点：约万历十年（1582），地方沿革以条目所载为准</span>
          <a href="https://commons.wikimedia.org/wiki/File:Ming_China_1580_AD.jpg" target="_blank" rel="noreferrer">1580 历史地图来源 <ExternalLink className="size-3" /></a>
        </div>
      </section>

      <aside className="atlas-side-panel">
        <div className="side-kicker">两京十三省</div>
        <h2>{activeHotspot.name}</h2>
        <p>{activeHotspot.note}</p>
        <dl className="side-stat-list">
          <div><dt>治所</dt><dd>{activeHotspot.capital}</dd></div>
          <div><dt>府／直隶州</dt><dd>{activeProvince?.prefectures.length ?? '—'}</dd></div>
          <div><dt>县／州治节点</dt><dd>{activeProvince ? activeProvince.prefectures.reduce((sum, item) => sum + countyCount(item), 0) : '—'}</dd></div>
        </dl>
        <div className="side-rule" />
        <p className="side-note">历史底图用于辨认明代疆域与主要地名；彩色点击标记是交互导航，不表示精确行政边界。</p>
        <button type="button" className="primary-action" onClick={() => activeHotspot.id === 'beizhili' ? onCapital() : activeProvince && onProvince(activeProvince)} disabled={!activeProvince && activeHotspot.id !== 'beizhili'}>
          {activeHotspot.id === 'beizhili' ? '进入京师皇城' : `展开${activeHotspot.shortName}府州`}<ChevronRight className="size-4" />
        </button>
      </aside>
    </div>
  );
}

function ProvinceMap({ province, onPrefecture }: { province: GeographyProvince; onPrefecture: (prefecture: GeographyPrefecture) => void }) {
  const totalCounty = province.prefectures.reduce((sum, item) => sum + countyCount(item), 0);
  return (
    <section className="administrative-board paper-noise animate-rise-in">
      <div className="board-heading">
        <div>
          <div className="side-kicker">{province.name.includes('直隶') ? '两京直隶' : '承宣布政使司'} · 府州图</div>
          <h2>{province.name}</h2>
          <p>治 {province.capital} · 共录 {province.prefectures.length} 个府、直隶州或同级节点，{totalCounty} 个可进入的县／州治节点。</p>
        </div>
        <div className="board-seal">{province.shortName.slice(0, 2)}</div>
      </div>
      <div className="prefecture-block-map">
        {province.prefectures.map((prefecture, index) => {
          const count = countyCount(prefecture);
          return (
            <button
              type="button"
              key={prefecture.id}
              onClick={() => onPrefecture(prefecture)}
              className={`prefecture-map-block block-tone-${index % 5}`}
              style={{ gridColumn: count > 12 ? 'span 2' : undefined, minHeight: count > 18 ? '10.5rem' : undefined }}
            >
              <span className="block-number">{String(index + 1).padStart(2, '0')}</span>
              <span className="block-kind">{prefecture.kind}</span>
              <strong>{prefecture.name}</strong>
              <span>{prefecture.seat ? `倚郭／治所：${prefecture.seat}` : '点击查看所属州县'}</span>
              <small>{count} 县级节点 <ChevronRight /></small>
            </button>
          );
        })}
      </div>
      <p className="board-caveat">区块按行政层级与辖县数量组织，便于浏览；不是府州边界的等比例复原。</p>
    </section>
  );
}

function PrefectureMap({ province, prefecture, onCounty }: {
  province: GeographyProvince;
  prefecture: GeographyPrefecture;
  onCounty: (county: GeographyCounty) => void;
}) {
  return (
    <section className="county-board paper-noise animate-rise-in">
      <div className="board-heading compact">
        <div>
          <div className="side-kicker">{province.shortName} · {prefecture.kind}</div>
          <h2>{prefecture.name}</h2>
          <p>{prefecture.seat ? `倚郭／治所：${prefecture.seat}。` : ''}点击任一县级区块进入县衙场景。</p>
        </div>
        <Landmark className="size-11 text-[#c39a50]" />
      </div>
      {prefecture.directCounties.length > 0 && (
        <div className="county-group">
          <div className="county-group-title"><span>{prefecture.kind === '府' || prefecture.kind === '军民府' ? '府直属县' : '直属县'}</span><small>{prefecture.directCounties.length}</small></div>
          <div className="county-block-grid">
            {prefecture.directCounties.map((county, index) => (
              <button type="button" key={county.id} className={`county-map-block county-tone-${index % 4}`} onClick={() => onCounty(county)}>
                <span className="county-gate" /><strong>{county.name}</strong><small>{county.seat ? '附郭' : county.kind} · 入县衙</small>
              </button>
            ))}
          </div>
        </div>
      )}
      {prefecture.subprefectures.map((subprefecture, groupIndex) => (
        <div className="county-group" key={subprefecture.id}>
          <div className="county-group-title"><span>{subprefecture.name} <em>{subprefecture.kind}</em></span><small>{subprefecture.counties.length} 属县</small></div>
          <div className="county-block-grid">
            <button type="button" className="county-map-block state-seat" onClick={() => onCounty({ id: `${subprefecture.id}-seat`, name: subprefecture.name, kind: '州治', seat: true })}>
              <span className="county-gate" /><strong>{subprefecture.name}州治</strong><small>州衙 · 可进入</small>
            </button>
            {subprefecture.counties.map((county, index) => (
              <button type="button" key={county.id} className={`county-map-block county-tone-${(index + groupIndex) % 4}`} onClick={() => onCounty(county)}>
                <span className="county-gate" /><strong>{county.name}</strong><small>{county.seat ? '附郭' : county.kind} · 入县衙</small>
              </button>
            ))}
          </div>
        </div>
      ))}
      {prefecture.directCounties.length === 0 && prefecture.subprefectures.length === 0 && <div className="empty-record">史料条目未列出可可靠命名的下辖县，本层不虚构县名。</div>}
    </section>
  );
}

function findRoleOfficial(officials: SourceOfficial[], matcher: (typeof yamenRoleMatchers)[number]) {
  return officials.find((official) => matcher.pattern.test(official.title) && (!matcher.institution || matcher.institution.test(`${official.institution} ${official.department ?? ''}`)));
}

function CountyYamen({ province, prefecture, county, officials, onSelect }: {
  province: GeographyProvince;
  prefecture: GeographyPrefecture;
  county: GeographyCounty;
  officials: SourceOfficial[];
  onSelect: (official: SourceOfficial) => void;
}) {
  const roles = yamenRoleMatchers
    .map((matcher) => ({ matcher, official: findRoleOfficial(officials, matcher) }))
    .filter((item): item is { matcher: (typeof yamenRoleMatchers)[number]; official: SourceOfficial } => Boolean(item.official));
  return (
    <section className="yamen-scene paper-noise animate-rise-in">
      <img src="/county-yamen-scene-v2.webp" alt="明代县衙场景插画" className="scene-background" />
      <div className="yamen-overlay" />
      <div className="scene-title-plaque"><small>{province.shortName} · {prefecture.name}</small><strong>{county.name}{county.kind === '州治' ? '州衙' : '县衙'}</strong></div>
      <div className="yamen-character-grid">
        {roles.map(({ matcher, official }, index) => (
          <button type="button" key={`${matcher.label}-${official.record_id}`} className={`yamen-character yamen-character-${index}`} onClick={() => onSelect(official)}>
            <span className="character-label"><b>{matcher.label}</b><small>{official.rank || '品级未载'}</small></span>
            <Avatar official={official} className="h-full w-full object-contain object-bottom drop-shadow-[0_16px_12px_rgb(0_0_0/55%)]" />
          </button>
        ))}
      </div>
      <div className="scene-caption"><Shield className="size-4" /><span>人物为职官类型形象示意，并非具体历史人物肖像。点击人物查看底稿中的品级、定员与职责。</span></div>
    </section>
  );
}

function InstitutionTile({ institution, active, onClick }: { institution: CapitalInstitution; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`capital-office-tile ${active ? 'is-active' : ''}`}>
      <Building2 className="size-4" /><span><strong>{institution.name}</strong><small>{institution.function}</small></span>
    </button>
  );
}

function CapitalMap({ era, setEra, selectedInstitution, setSelectedInstitution, officials, onSelectOfficial, onCourt, onNorthZhili }: {
  era: CapitalEra;
  setEra: (era: CapitalEra) => void;
  selectedInstitution: CapitalInstitution;
  setSelectedInstitution: (institution: CapitalInstitution) => void;
  officials: SourceOfficial[];
  onSelectOfficial: (official: SourceOfficial) => void;
  onCourt: () => void;
  onNorthZhili: () => void;
}) {
  const visible = capitalInstitutions.filter((item) => item.era === 'both' || item.era === era);
  const roster = officials.filter((official) => officialMatchesInstitution(official, selectedInstitution));
  const east = visible.filter((item) => item.zone === 'east');
  const west = visible.filter((item) => item.zone === 'west');
  const centralSecretariat = capitalInstitutions.find((item) => item.id === 'central-secretariat')!;
  const cabinet = capitalInstitutions.find((item) => item.id === 'cabinet')!;
  const displayedPosition = era === 'hongwu' && selectedInstitution.era === 'both'
    ? '南京中央官署宽区；洪武前期精确旧址不作确定。'
    : selectedInstitution.positionHint;

  return (
    <div className="capital-layout animate-rise-in">
      <section className="capital-map paper-noise">
        <div className="capital-map-toolbar">
          <div><div className="side-kicker">京师 · 中枢时序图</div><h2>{era === 'late-ming' ? '北京皇城与中央官署' : '洪武前期中枢制度图'}</h2></div>
          <div className="capital-map-controls"><button type="button" className="capital-region-link" onClick={onNorthZhili}><MapIcon className="size-4" />北直隶府州</button><Tabs value={era} onValueChange={(value) => setEra(value as CapitalEra)}><TabsList className="era-tabs"><TabsTrigger value="hongwu">洪武前期 · 南京</TabsTrigger><TabsTrigger value="late-ming">永乐以后 · 北京</TabsTrigger></TabsList></Tabs></div>
        </div>
        {era === 'hongwu' ? (
          <div className="hongwu-government-map">
            <button type="button" className="government-emperor" onClick={() => setSelectedInstitution(capitalInstitutions[0])}><img src={avatarPaths.emperor} alt="皇帝形象示意" /><span>皇帝</span></button>
            <span className="government-link vertical" />
            <InstitutionTile institution={centralSecretariat} active={selectedInstitution.id === centralSecretariat.id} onClick={() => setSelectedInstitution(centralSecretariat)} />
            <div className="government-six">
              {visible.filter((item) => item.id.startsWith('ministry-')).map((item) => <InstitutionTile key={item.id} institution={item} active={selectedInstitution.id === item.id} onClick={() => setSelectedInstitution(item)} />)}
            </div>
            <p className="era-caveat">此图表达 1368—1379 年南京中枢的制度关系；中书省于 1380 年罢废，不能与成熟内阁视为同一时点。</p>
          </div>
        ) : (
          <div className="beijing-government-map">
            <div className="capital-office-column east-offices"><span className="column-label">东侧 · 文官官署</span>{east.map((item) => <InstitutionTile key={item.id} institution={item} active={selectedInstitution.id === item.id} onClick={() => setSelectedInstitution(item)} />)}</div>
            <div className="imperial-city-map">
              <div className="imperial-city-wall">
                <span className="wall-label">皇城</span>
                <div className="forbidden-city-wall">
                  <span className="wall-label inner">紫禁城</span>
                  <button type="button" className="cabinet-anchor" onClick={() => setSelectedInstitution(cabinet)}>文渊阁 · 内阁</button>
                  <div className="palace-axis">
                    {palaceAxis.slice(3).map((node, index) => <button type="button" key={node.ming} onClick={index === 2 ? onCourt : undefined} className={index === 2 ? 'court-entry' : ''}><strong>{node.ming}</strong><small>{node.kind}</small></button>)}
                  </div>
                </div>
                <div className="outer-axis">{palaceAxis.slice(0, 3).map((node) => <span key={node.ming}><b>{node.ming}</b><small>{node.later}</small></span>)}</div>
              </div>
              <button type="button" className="court-action" onClick={onCourt}><Crown className="size-4" />进入皇极殿朝会</button>
            </div>
            <div className="capital-office-column west-offices"><span className="column-label">西侧 · 武职与刑名</span>{west.map((item) => <InstitutionTile key={item.id} institution={item} active={selectedInstitution.id === item.id} onClick={() => setSelectedInstitution(item)} />)}</div>
          </div>
        )}
        <p className="capital-map-note">北京视图的制度起点取 1402 年，官署底图采用 1443 年以后定型的宽区格局；不把永乐初年画成已完成的官署平面，也不冒充精确考古坐标。</p>
      </section>
      <aside className="institution-roster">
        <div className="side-kicker">当前官署</div><h2>{selectedInstitution.name}</h2><p>{selectedInstitution.function}</p>
        <div className="institution-position"><MapIcon className="size-4" />{displayedPosition}</div>
        {selectedInstitution.caveat && <div className="fact-caveat">{selectedInstitution.caveat}</div>}
        <div className="roster-heading"><span>职官人物</span><small>{roster.length} 条</small></div>
        <div className="roster-scroll">{roster.slice(0, 36).map((official) => <OfficialMiniCard key={official.record_id} official={official} onSelect={onSelectOfficial} />)}{roster.length === 0 && <div className="empty-record">底稿中暂未检出该机构的独立职官条目。</div>}</div>
      </aside>
    </div>
  );
}

function findCourtOfficial(officials: SourceOfficial[], matcher: (typeof courtRoleMatchers)[number]) {
  return officials.find((official) => matcher.pattern.test(official.title) && (!matcher.institution || matcher.institution.test(`${official.institution} ${official.department ?? ''}`)));
}

function CourtScene({ officials, onBack, onSelect }: { officials: SourceOfficial[]; onBack: () => void; onSelect: (official: SourceOfficial) => void }) {
  const roles = courtRoleMatchers.map((matcher) => ({ matcher, official: findCourtOfficial(officials, matcher) })).filter((item): item is { matcher: (typeof courtRoleMatchers)[number]; official: SourceOfficial } => Boolean(item.official));
  return (
    <section className="court-game-shell animate-rise-in">
      <div className="court-game-topbar">
        <button type="button" onClick={onBack}><ArrowLeft className="size-4" />皇城官署图</button>
        <div><span>国家</span><strong>皇极殿朝会</strong></div><span className="court-date">万历朝制度示意</span>
      </div>
      <div className="court-game-scroll">
        <div className="court-game-stage">
          <img src="/court-game-scene-v2.webp" alt="明代大朝会场景插画" className="scene-background" />
          <div className="court-game-vignette" />
          <button type="button" className="court-emperor"><span><b>皇帝</b><small>御极临朝</small></span><img src={avatarPaths.emperor} alt="明代皇帝形象示意" /></button>
          {roles.slice(0, courtPositions.length).map(({ matcher, official }, index) => {
            const position = courtPositions[index];
            return (
              <button type="button" key={`${matcher.label}-${official.record_id}`} className={`court-character court-character-${position.side}`} style={{ left: `${position.left}%`, top: `${position.top}%`, '--figure-scale': position.scale } as React.CSSProperties} onClick={() => onSelect(official)}>
                <span className="court-character-label"><b>{matcher.label}</b><small>{official.rank || '品级未载'}</small></span>
                <Avatar official={official} className="court-character-image" />
              </button>
            );
          })}
          <div className="court-side-marker civil">文班</div><div className="court-side-marker military">武班</div>
          <div className="court-floor-note">点击班列中的人物，查看官职、品秩、定员与职责</div>
        </div>
      </div>
    </section>
  );
}

function OfficialDetail({ official, open, setOpen }: { official: SourceOfficial | null; open: boolean; setOpen: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="official-detail-sheet w-[min(92vw,31rem)] overflow-y-auto border-l-[#8f6b3d]/45 bg-[#171512] p-0 sm:max-w-[31rem]">
        {official && <><div className="official-detail-portrait"><Avatar official={official} className="h-full w-full object-contain object-bottom" /><div className="portrait-gradient" /><span className="portrait-caption">职官类型形象示意</span></div><div className="p-6 sm:p-7">
          <SheetHeader className="text-left"><div className="side-kicker">{official.institution}</div><SheetTitle className="font-heading text-3xl text-[#f0dfbd]">{official.title}</SheetTitle><SheetDescription className="text-[#9f927e]">{official.department || '所属机构未另载'}</SheetDescription></SheetHeader>
          <div className="detail-rank-row"><RankBadge rank={official.rank} /><span>定员：{official.headcount || '未载'}</span></div>
          <section className="detail-section"><h3>职掌</h3><p>{official.duty_notes || '原始底稿未附独立职责说明。'}</p></section>
          <section className="detail-section"><h3>资料定位</h3>{official.sources.map((source) => <p key={`${source.range}-${source.row}`}>{source.sheet} · {source.range}{source.row > 0 ? ` · 第 ${source.row} 行` : ''}</p>)}</section>
          {official.uncertainty_flags.length > 0 && <section className="detail-section warning"><h3>待核说明</h3><p>{official.uncertainty_flags.map(String).join('；')}</p></section>}
          <p className="portrait-disclaimer">人物图用于区分职官类型，不对应具体任职者，也不作为服饰考证图。</p>
        </div></>}
      </SheetContent>
    </Sheet>
  );
}

function SourceDrawer({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={setOpen}><SheetContent className="w-[min(94vw,35rem)] overflow-y-auto border-l-[#8f6b3d]/45 bg-[#171512] text-[#e9dcc2] sm:max-w-[35rem]">
      <SheetHeader className="text-left"><SheetTitle className="font-heading text-2xl text-[#f0dfbd]">史料口径与来源</SheetTitle><SheetDescription className="leading-6 text-[#9f927e]">地图主时点取万历十年前后。明代制度随时期变化，界面会把不能同时成立的机构分开显示。</SheetDescription></SheetHeader>
      <div className="mt-6 space-y-3">{wikipediaSources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="source-link-card"><BookOpenText className="size-4" /><span>{source.title}</span><ExternalLink className="ml-auto size-3.5" /></a>)}</div>
      <div className="fact-caveat mt-6">地方树录入两京十三省、200 个府／直隶州／军民府等同级节点、1161 个县与 208 个属州；职官录入用户底稿 553 条，并据《明史》补录中书省 7 职与县儒学 2 职。土府、土州、宣慰／宣抚／安抚／长官司体系尚未穷尽，页面会明确保留这一覆盖边界。</div>
      <div className="fact-caveat mt-3">维基百科用于建立条目索引；府州县再与《明史·地理志》交叉核对，皇城布局另与故宫博物院研究资料交叉核对。府州县区块是层级导航，不替代历史地理信息系统。</div>
    </SheetContent></Sheet>
  );
}

export default function Home() {
  const [scene, setScene] = useState<Scene>('empire');
  const [geography, setGeography] = useState<GeographyData | null>(null);
  const [geoError, setGeoError] = useState(false);
  const [officials, setOfficials] = useState<SourceOfficial[]>([]);
  const [officialCount, setOfficialCount] = useState(553);
  const [selectedProvince, setSelectedProvince] = useState<GeographyProvince | null>(null);
  const [selectedPrefecture, setSelectedPrefecture] = useState<GeographyPrefecture | null>(null);
  const [selectedCounty, setSelectedCounty] = useState<GeographyCounty | null>(null);
  const [era, setEra] = useState<CapitalEra>('late-ming');
  const [selectedInstitution, setSelectedInstitution] = useState<CapitalInstitution>(capitalInstitutions.find((item) => item.id === 'cabinet')!);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [selectedOfficial, setSelectedOfficial] = useState<SourceOfficial | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch('/data/ming-officials.json', { signal: controller.signal }).then((response) => { if (!response.ok) throw new Error('official data unavailable'); return response.json() as Promise<SourceData>; }),
      fetch('/data/ming-administrative-divisions-v2.json', { signal: controller.signal }).then((response) => { if (!response.ok) throw new Error('geography unavailable'); return response.json() as Promise<GeographyData>; }),
    ]).then(([officialData, geographyData]) => {
      setOfficials([...officialData.officials, ...supplementalOfficials]); setOfficialCount(officialData.metadata.counts.official_rows_deduplicated); setGeography(geographyData); setGeoError(false);
    }).catch((error) => { if (error instanceof DOMException && error.name === 'AbortError') return; setGeoError(true); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen((open) => !open); }
      if (event.key === 'Escape' && !searchOpen && !detailOpen) {
        if (scene === 'county') setScene('prefecture'); else if (scene === 'prefecture') setScene('province'); else if (scene === 'province' || scene === 'capital') setScene('empire'); else if (scene === 'court') setScene('capital');
      }
    };
    window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown);
  }, [scene, searchOpen, detailOpen]);

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

  const openOfficial = (official: SourceOfficial) => { setSelectedOfficial(official); setDetailOpen(true); };
  const goProvince = (province: GeographyProvince) => { setSelectedProvince(province); setSelectedPrefecture(null); setSelectedCounty(null); setScene('province'); };
  const goPrefecture = (prefecture: GeographyPrefecture) => { setSelectedPrefecture(prefecture); setSelectedCounty(null); setScene('prefecture'); };
  const goCounty = (county: GeographyCounty) => { setSelectedCounty(county); setScene('county'); };
  const navigate = (destination: Scene) => {
    if (destination === 'empire') { setSelectedProvince(null); setSelectedPrefecture(null); setSelectedCounty(null); }
    else if (destination === 'province') { setSelectedPrefecture(null); setSelectedCounty(null); }
    else if (destination === 'prefecture') setSelectedCounty(null);
    setScene(destination);
  };
  const visibleTitle = useMemo(() => {
    if (scene === 'capital') return '京师皇城'; if (scene === 'court') return '皇极殿朝会'; if (scene === 'province') return selectedProvince?.shortName || '府州图'; if (scene === 'prefecture') return selectedPrefecture?.name || '州县图'; if (scene === 'county') return selectedCounty?.name || '县衙'; return '大明舆图';
  }, [scene, selectedProvince, selectedPrefecture, selectedCounty]);

  return (
    <main className="atlas-app">
      <header className="atlas-header">
        <div className="flex min-w-0 items-center gap-3"><BrandMark /><div className="min-w-0"><h1>大明职官图 <span>第二卷</span></h1><p>{visibleTitle}</p></div></div>
        <div className="header-stats"><span><MapIcon />两京十三省</span><span><Layers />{geography?.metadata.prefectureCount ?? '—'} 府州</span><span><Users />{officialCount + supplementalOfficials.length} 职官</span></div>
        <div className="header-actions"><button type="button" onClick={() => setSourceOpen(true)} className="header-text-button"><BookOpenText />史料</button><button type="button" onClick={() => setSearchOpen(true)} className="search-trigger"><Search /><span>搜索官职</span><kbd>Ctrl K</kbd></button></div>
      </header>
      <div className="atlas-subnav">
        {scene !== 'capital' && scene !== 'court' ? <Breadcrumbs province={selectedProvince} prefecture={selectedPrefecture} county={selectedCounty} onNavigate={navigate} /> : <nav className="atlas-breadcrumbs"><button type="button" onClick={() => navigate('empire')}>大明舆图</button><ChevronRight /><button type="button" onClick={() => navigate('capital')}>京师皇城</button>{scene === 'court' && <><ChevronRight /><span>皇极殿朝会</span></>}</nav>}
        <div className="view-switcher"><button type="button" className={scene === 'empire' ? 'is-active' : ''} onClick={() => navigate('empire')}><MapIcon />天下</button><button type="button" className={scene === 'capital' || scene === 'court' ? 'is-active' : ''} onClick={() => navigate('capital')}><Crown />京师</button></div>
      </div>
      <div className="atlas-workspace">
        {!geography && !geoError && scene === 'empire' && <div className="loading-atlas"><Skeleton className="h-full w-full bg-[#2b251d]" /><span>正在铺开府州舆图……</span></div>}
        {geoError && <div className="fatal-data-note">府州县数据未能载入，已停止显示不完整地图。请刷新页面重试。</div>}
        {(geography || scene === 'capital' || scene === 'court') && <>
          {scene === 'empire' && <EmpireMap geography={geography} onProvince={goProvince} onCapital={() => navigate('capital')} />}
          {scene === 'province' && selectedProvince && <ProvinceMap province={selectedProvince} onPrefecture={goPrefecture} />}
          {scene === 'prefecture' && selectedProvince && selectedPrefecture && <PrefectureMap province={selectedProvince} prefecture={selectedPrefecture} onCounty={goCounty} />}
          {scene === 'county' && selectedProvince && selectedPrefecture && selectedCounty && <CountyYamen province={selectedProvince} prefecture={selectedPrefecture} county={selectedCounty} officials={officials} onSelect={openOfficial} />}
          {scene === 'capital' && <CapitalMap era={era} setEra={(nextEra) => { setEra(nextEra); setSelectedInstitution(capitalInstitutions.find((item) => item.id === (nextEra === 'hongwu' ? 'central-secretariat' : 'cabinet'))!); }} selectedInstitution={selectedInstitution} setSelectedInstitution={setSelectedInstitution} officials={officials} onSelectOfficial={openOfficial} onCourt={() => navigate('court')} onNorthZhili={() => { const province = geography?.provinces.find((item) => item.id === 'beizhili'); if (province) goProvince(province); }} />}
          {scene === 'court' && <CourtScene officials={officials} onBack={() => navigate('capital')} onSelect={openOfficial} />}
        </>}
      </div>
      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}><Command className="bg-[#191612] text-[#eadcc0]"><CommandInput placeholder="搜索官职、官署、品级或职责……" /><CommandList className="max-h-[32rem]"><CommandEmpty>没有找到相符的职官。</CommandEmpty><CommandGroup heading={`全部职官 · ${officials.length} 条`}>
        {officials.map((official) => <CommandItem key={official.record_id} value={`${official.title} ${official.institution} ${official.department || ''} ${official.rank || ''} ${official.duty_notes || ''}`} onSelect={() => { setSearchOpen(false); openOfficial(official); }} className="gap-3 py-2.5"><div className="size-10 overflow-hidden rounded-md border border-[#a9864c]/35 bg-[#2c251d]"><Avatar official={official} className="size-full object-cover object-top" /></div><span className="min-w-0 flex-1"><b className="block truncate font-heading text-[#ead9b8]">{official.title}</b><small className="block truncate text-[#958977]">{official.institution} · {official.department || '本署'}</small></span><CommandShortcut>{official.rank || '未载'}</CommandShortcut></CommandItem>)}
      </CommandGroup></CommandList></Command></CommandDialog>
      <OfficialDetail official={selectedOfficial} open={detailOpen} setOpen={setDetailOpen} />
      <SourceDrawer open={sourceOpen} setOpen={setSourceOpen} />
    </main>
  );
}
