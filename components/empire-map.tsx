'use client';

// SVG province outlines need focusable groups; HTML buttons cannot contain SVG paths.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */

import { useRef, useState } from 'react';
import { ChevronRight, Compass, Crown, Layers, Minus, Plus, RotateCcw, Map } from 'lucide-react';
import { mapRegions } from '@/lib/atlas-geography';
import { provinceHotspots, type GeographyData, type GeographyProvince } from '@/lib/ming-atlas-v2';

const geographicLabels = [
  { text: '青 藏 高 原', x: 204, y: 452, kind: 'terrain' },
  { text: '祁 连 山', x: 342, y: 168, kind: 'terrain' },
  { text: '秦 岭', x: 792, y: 381, kind: 'terrain' },
  { text: '太 行 山', x: 1039, y: 211, kind: 'terrain', rotate: -78 },
  { text: '横 断 山', x: 365, y: 563, kind: 'terrain', rotate: -83 },
  { text: '南 岭', x: 976, y: 692, kind: 'terrain' },
  { text: '长 江', x: 1112, y: 477, kind: 'river' },
  { text: '黄 河', x: 910, y: 128, kind: 'river' },
  { text: '黄河故道', x: 1194, y: 349, kind: 'river' },
  { text: '渤 海', x: 1331, y: 189, kind: 'sea' },
  { text: '黄 海', x: 1507, y: 371, kind: 'sea' },
  { text: '东 海', x: 1490, y: 595, kind: 'sea' },
  { text: '南 海', x: 1143, y: 929, kind: 'sea' },
  { text: '辽 东', x: 1388, y: 93, kind: 'context' },
  { text: '台 湾', x: 1437, y: 746, kind: 'context' },
];

export function EmpireMap({ geography, onProvince, onCapital }: {
  geography: GeographyData | null;
  onProvince: (province: GeographyProvince) => void;
  onCapital: () => void;
}) {
  const [selected, setSelected] = useState('beizhili');
  const [hovered, setHovered] = useState<string | null>(null);
  const [borders, setBorders] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const dragMoved = useRef(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);
  const active = provinceHotspots.find((item) => item.id === selected)!;
  const province = geography?.provinces.find((item) => item.id === selected);
  const count = province?.prefectures.reduce((sum, pref) => sum + pref.directCounties.length + pref.subprefectures.reduce((n, state) => n + state.counties.length + 1, 0), 0);
  const openProvince = (id: string) => {
    const target = geography?.provinces.find((item) => item.id === id);
    if (target) onProvince(target);
  };
  const changeZoom = (step: number) => {
    const next = Math.min(2.5, Math.max(1, Math.round((zoom + step) * 100) / 100));
    setZoom(next);
    const limit = (next - 1) * 500;
    setPan((p) => ({ x: Math.min(limit * 1.6, Math.max(-limit * 1.6, p.x)), y: Math.min(limit, Math.max(-limit, p.y)) }));
  };

  return (
    <div className="scene-grid empire-layout">
      <section className="territory-map-shell" aria-label="两京十三省交互舆图">
        <div className="territory-toolbar">
          <div><span className="map-title-mark">舆</span><span><strong>大明山川舆图</strong><small>地理参照 · 万历前后两京十三省</small></span></div>
          <button type="button" className="map-layer-button" aria-pressed={borders} onClick={() => setBorders(!borders)}><Layers size={15} />{borders ? '省域界线' : '山川底图'}</button>
        </div>
        <div className={`territory-map-viewport ${zoom > 1 ? 'is-zoomed' : ''}`}>
          <svg ref={svgRef} viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid meet" className="territory-map" aria-label="明代两京十三省范围示意，可选择省份，放大后可拖动"
            onPointerDown={(event) => {
              dragMoved.current = false;
              if (event.button !== 0 || zoom === 1) return;
              drag.current = { x: event.clientX, y: event.clientY, px: pan.x, py: pan.y, moved: false };
            }}
            onPointerMove={(event) => {
              if (!event.buttons) { drag.current = null; return; }
              if (!drag.current || !svgRef.current) return;
              const start = drag.current;
              if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 5 && !start.moved) return;
              start.moved = true; dragMoved.current = true;
              svgRef.current.setPointerCapture(event.pointerId);
              const rect = svgRef.current.getBoundingClientRect();
              const scaleX = Math.max(1600 / rect.width, 1000 / rect.height), scaleY = scaleX;
              const lx = (zoom - 1) * 800, ly = (zoom - 1) * 500;
              setPan({ x: Math.min(lx, Math.max(-lx, start.px + (event.clientX - start.x) * scaleX)), y: Math.min(ly, Math.max(-ly, start.py + (event.clientY - start.y) * scaleY)) });
            }}
            onPointerUp={(event) => { if (svgRef.current?.hasPointerCapture(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId); drag.current = null; }}
            onPointerCancel={() => { drag.current = null; }}
          >
            <title>大明山川舆图</title>
            <desc>省域为历史概略范围，山川按地理方位绘制。选择省域后可从右侧进入所属府州。</desc>
            <g transform={`translate(${800 + pan.x} ${500 + pan.y}) scale(${zoom}) translate(-800 -500)`}>
              <image href="/ming-terrain-v3.png" width="1600" height="1000" preserveAspectRatio="xMidYMid slice" />
              {mapRegions.map((region) => {
                const accent = provinceHotspots.find((p) => p.id === region.id)?.accent ?? 'gold';
                return <g key={region.id} role="button" tabIndex={0} aria-label={`选择${region.name}`} aria-pressed={selected === region.id}
                  className={`map-region region-${accent} ${selected === region.id ? 'is-selected' : ''} ${hovered === region.id ? 'is-hovered' : ''} ${borders ? '' : 'hide-borders'}`}
                  onPointerEnter={() => setHovered(region.id)} onPointerLeave={() => setHovered(null)}
                  onFocus={() => setHovered(region.id)} onBlur={() => setHovered(null)}
                  onClick={() => { if (!dragMoved.current) setSelected(region.id); dragMoved.current = false; }}
                  onDoubleClick={() => openProvince(region.id)}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(region.id); } }}>
                  <path d={region.path} className="region-shape" vectorEffect="non-scaling-stroke" />
                  <text x={region.x} y={region.y} className="region-name" textAnchor="middle">{region.name}</text>
                </g>;
              })}
              <g aria-hidden="true" className="geographic-labels">
                {geographicLabels.map((label) => <text key={label.text} x={label.x} y={label.y} className={`geo-label geo-${label.kind}`} textAnchor="middle" transform={label.rotate ? `rotate(${label.rotate} ${label.x} ${label.y})` : undefined}>{label.text}</text>)}
                <g transform="translate(1181 132)" className="capital-pin"><circle r="5" /><text y="-14" textAnchor="middle">京师</text></g>
                <g transform="translate(1296 430)" className="capital-pin"><circle r="4" /><text x="12" y="6">南京</text></g>
              </g>
            </g>
          </svg>
          <div className="map-compass" aria-hidden="true"><span>北</span><Compass size={35} strokeWidth={1} /><small>南</small></div>
          <div className="map-zoom-controls" aria-label="地图缩放">
            <button type="button" aria-label="放大地图" title="放大地图" disabled={zoom >= 2.5} onClick={() => changeZoom(0.25)}><Plus size={17} /></button>
            <span aria-live="polite">{Math.round(zoom * 100)}%</span>
            <button type="button" aria-label="缩小地图" title="缩小地图" disabled={zoom <= 1} onClick={() => changeZoom(-0.25)}><Minus size={17} /></button>
            <button type="button" aria-label="复位地图" title="复位地图" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><RotateCcw size={15} /></button>
          </div>
        </div>
        <div className="territory-map-footer"><span><i /> 省域范围示意</span><span>单击选中 · 双击展开府州 · 放大后拖动</span></div>
      </section>
      <aside className="atlas-side-panel territory-side-panel">
        <div className="side-kicker">两京十三省 / {String(provinceHotspots.findIndex((p) => p.id === selected) + 1).padStart(2, '0')}</div>
        <h2>{province?.shortName ?? active.name}</h2>
        {province?.name !== province?.shortName && <p className="region-full-name">{province?.name}</p>}
        <p>{active.note}</p>
        <dl className="side-stat-list">
          <div><dt>治所</dt><dd>{active.capital}</dd></div>
          <div><dt>府／直隶州</dt><dd>{province?.prefectures.length ?? '—'}</dd></div>
          <div><dt>县／州治</dt><dd>{count ?? '—'}</dd></div>
        </dl>
        <button type="button" className="primary-action" disabled={!province} onClick={() => openProvince(selected)}>展开{province?.shortName}府州<ChevronRight size={17} /></button>
        {selected === 'beizhili' && <button type="button" className="secondary-action" onClick={onCapital}><Crown size={15} />进入京师皇城<ChevronRight size={15} /></button>}
        <div className="province-index"><div className="province-index-title"><Map size={14} /> 省域速览</div><div className="province-index-grid">{mapRegions.map((region) => <button type="button" key={region.id} aria-pressed={selected === region.id} className={selected === region.id ? 'is-active' : ''} onClick={() => { setSelected(region.id); setZoom(1); setPan({ x: 0, y: 0 }); }}>{region.name}</button>)}</div></div>
        <p className="side-note territory-precision-note">山川依地理方位绘制，省界为万历前后形势示意。详细依据见「史料」。</p>
      </aside>
    </div>
  );
}
