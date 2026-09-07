// Browser-free component/data checks for the dedicated phone journey.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = fileURLToPath(new URL('../', import.meta.url));
const checks = [];
const server = await createServer({configFile:root + 'vite.nas.config.ts',server:{middlewareMode:true},appType:'custom'});
try {
  const {HistoryProvider} = await server.ssrLoadModule('/components/history/history-context.tsx');
  const geo = await server.ssrLoadModule('/components/mobile/mobile-geography.tsx');
  const scenes = await server.ssrLoadModule('/components/mobile/mobile-scenes.tsx');
  const {MobileShell} = await server.ssrLoadModule('/components/mobile/mobile-shell.tsx');
  const {OfficialHierarchy} = await server.ssrLoadModule('/components/official-hierarchy.tsx');
  const {localYamenRoles} = await server.ssrLoadModule('/lib/scene-officials.ts');
  const {HISTORY_REVISION} = await server.ssrLoadModule('/lib/history-revision.ts');
  const load = async name => JSON.parse(await fs.readFile(root + `public/api/snapshots/${HISTORY_REVISION}/datasets/${name}.json`,'utf8'));
  const geography = await load('ming-administrative-divisions-v2');
  const {officials} = await load('office-catalog');
  const {ministries} = await load('ming-ministry-branches');
  const h = React.createElement;
  const noop = () => {};
  const render = (component,props) => renderToStaticMarkup(h(HistoryProvider,null,h(component,props)));
  const check = (name,fn) => {fn();checks.push(name);};

  check('world has all 15 province entries and does not mount the terrain image',()=>{
    const html = render(geo.MobileWorld,{geography,error:false,onProvince:noop,onPlace:noop});
    assert.equal((html.match(/class="phone-province-order"/g)||[]).length,15);
    assert.doesNotMatch(html,/ming-terrain-v3|empire-map|yamen-stage/);
  });
  check('all provincial drill-down entries retain exact prefecture and county ownership',()=>{
    for (const province of geography.provinces) {
      const entries = geo.provincePlaces(province);
      const expected = province.prefectures.reduce((n,p)=>n+1+p.directCounties.length+p.subprefectures.reduce((sum,s)=>sum+1+s.counties.length,0),0);
      assert.equal(entries.length,expected);
      for (const entry of entries) {
        assert.ok(province.prefectures.includes(entry.prefecture));
        if (entry.county?.parentState) {
          const state = entry.prefecture.subprefectures.find(s=>s.id===entry.county.parentState.id);
          assert.ok(state?.counties.some(c=>c.id===entry.county.id));
          assert.equal(state.name,entry.county.parentState.name);
        }
      }
    }
  });
  const shandong=geography.provinces.find(p=>p.shortName==='山东');
  const jinan=shandong.prefectures.find(p=>p.name==='济南府');
  check('province view shows its own prefectures; county groups only appear one level deeper',()=>{
    const html=render(geo.MobileProvince,{province:shandong,onPrefecture:noop,onCounty:noop});
    assert.ok(html.includes('济南府'));
    assert.doesNotMatch(html,/phone-county-grid|geo-prefecture-forest/);
    const local=render(geo.MobilePrefecture,{province:shandong,prefecture:jinan,onCounty:noop});
    assert.ok(local.includes('历城县'));
    assert.ok(local.includes('直属县'));
    assert.equal((local.match(/<details/g)||[]).length,jinan.subprefectures.length);
    assert.doesNotMatch(local,/东昌府/);
  });
  check('ordinary county, capital county and state keep distinct existing office definitions',()=>{
    const cases=[['顺天府','大兴县','县','supplement-capital-county-magistrate'],['济南府','历城县','县','official-0434'],['济南府','高唐州','州治','supplement-state-magistrate']];
    for(const [pref,county,kind,id] of cases){
      const roles=localYamenRoles({name:pref},{name:county,kind},officials);
      assert.equal(roles.roles[0].official.record_id,id);
      assert.equal(roles.roles.length,4);
    }
  });
  check('the four reviewed Guizhou states keep their classification and yamen entry',()=>{
    const province=geography.provinces.find(p=>p.id==='guizhou');
    for(const name of ['安顺州','镇宁州','永宁州','普安州']){
      const prefecture=province.prefectures.find(p=>p.name===name);
      const html=render(geo.MobilePrefecture,{province,prefecture,onCounty:noop});
      assert.ok(html.includes('羁縻直隶州'));
      assert.ok(html.includes('进入州衙'));
    }
  });
  check('phone yamen renders readable office cards without a desktop stage',()=>{
    const html=render(scenes.MobileYamen,{province:shandong,prefecture:jinan,county:jinan.directCounties[0],officials,onSelect:noop});
    assert.ok(html.includes('phone-office-card is-chief'));
    assert.ok(html.includes('知县'));
    assert.doesNotMatch(html,/yamen-stage|stage-figure|court-character/);
  });
  check('phone office tree starts with leadership and collapsed branches',()=>{
    const ministry=ministries.find(m=>m.name==='礼部');
    const html=render(OfficialHierarchy,{mobile:true,institutionName:ministry.name,ministry,officials,fallbackOfficials:[],onSelect:noop,onBranch:noop,showHistory:false,query:''});
    assert.equal((html.match(/class="phone-branch-fold"/g)||[]).length,ministry.branches.filter(b=>b.default_visible).length);
    assert.doesNotMatch(html,/data-branch-id=/);
    assert.ok(html.includes('礼部尚书'));
    assert.ok(html.includes('礼部左侍郎'));
    assert.ok(html.includes('礼部右侍郎'));
  });
  check('mobile shell exposes four primary destinations and compact year navigation',()=>{
    const html=render(MobileShell,{section:'world',onWorld:noop,onCapital:noop,onPeople:noop,onSources:noop,onSearch:noop,children:'内容'});
    for(const text of ['主要导航','天下','京师','人物','史料','前一年','后一年'])assert.ok(html.includes(text));
    assert.doesNotMatch(html,/history-era-strip|history-range|atlas-header/);
  });
  const css=await fs.readFile(root+'app/mobile-v7.css','utf8');
  check('full-screen sheets accommodate the visible keyboard viewport and a separate scrolling body',()=>{
    assert.ok(css.includes('height:var(--phone-visible-height,100dvh)'));
    assert.ok(css.includes('.history-dialog-scroll,.institution-floating-scroll,.phone-sheet-scroll'));
    assert.ok(css.includes('env(safe-area-inset-bottom)'));
  });
  const report={checked_at:new Date().toISOString(),revision:HISTORY_REVISION,checks,passed:checks.length,scope:'React server rendering and actual published geographic/office data; no browser or device visual test'};
  await fs.mkdir(root+'work',{recursive:true});
  await fs.writeFile(root+'work/mobile-checks.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally {await server.close();}
