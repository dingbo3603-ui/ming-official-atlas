// Dated geography and real record linkage checks, without a browser session.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const root=fileURLToPath(new URL('../',import.meta.url));
const server=await createServer({configFile:root+'vite.nas.config.ts',server:{middlewareMode:true},appType:'custom'});
const checks=[];
const check=(name,fn)=>{fn();checks.push(name);};
try {
  assert.equal(await fs.readFile(root+'lib/frontier-geography.json','utf8'),await fs.readFile(root+'public/data/ming-frontier-regions.json','utf8'),'Compiled and public geography must agree');
  const {frontierRegions,frontierAtYear,frontierSites,frontierCaption,frontierXY,recordsForFrontier}=await server.ssrLoadModule('/lib/frontier-regions.ts');
  const {FrontierMapLayer,FrontierIndex}=await server.ssrLoadModule('/components/frontier-regions.tsx');
  const {HISTORY_REVISION}=await server.ssrLoadModule('/lib/history-revision.ts');
  const find=id=>frontierRegions.find(r=>r.id===id);
  const phase=(id,year)=>frontierAtYear(find(id),year);
  const sites=(id,year)=>frontierSites(find(id),year);
  const render=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props));
  check('five military/frontier entries remain separate from the fifteen civil provinces',()=>{
    assert.equal(frontierRegions.length,5);
    const liao=find('liaodong');
    assert.equal(liao.sites.length,10);
    assert.equal(frontierRegions.reduce((n,r)=>n+r.sites.length,0),29);
    assert.equal(frontierRegions.filter(r=>r.inset).length,1);
  });
  check('all 277 years resolve exactly once and all source/site references are valid',()=>{
    for(const region of frontierRegions){
      for(let year=1368;year<=1644;year++)assert.equal(region.phases.filter(p=>p.from<=year&&year<=p.until).length,1,`${region.id} ${year}`);
      for(const p of region.phases){
        for(const id of p.siteIds)assert.ok(region.sites.some(s=>s.id===id));
        for(const id of p.sourceIds)assert.ok(region.sources.some(s=>s.id===id));
      }
      for(const site of region.sites){
        assert.ok(Number.isFinite(site.lon)&&Number.isFinite(site.lat));
        for(const id of site.sourceIds)assert.ok(region.sources.some(s=>s.id===id),`${region.id} source ${id}`);
        const [x,y]=frontierXY(site.lon,site.lat,region.inset);
        assert.ok(x>=0&&y>=0&&x<=(region.inset?640:1600)&&y<=(region.inset?400:1000));
      }
    }
  });
  check('foundations and renamings are not projected into early Ming years',()=>{
    assert.equal(phase('liaodong',1370).mapState,'not-established');
    assert.equal(phase('liaodong',1372).title,'定辽都卫');
    assert.equal(frontierCaption(find('liaodong'),1372),'军事都卫');
    assert.equal(phase('wanquan',1429).mapState,'not-established');
    assert.equal(phase('wanquan',1430).mapState,'active');
    assert.equal(phase('daning',1389).title,'北平行都指挥使司');
    assert.ok(phase('daning',1403).seat.includes('保定'));
    assert.ok(!sites('daning',1403).some(s=>s.id==='daning_old'));
    assert.ok(sites('daning',1566).some(s=>s.id==='baoding'));
    assert.equal(phase('shaanxi_xingdusi',1378).mapState,'not-established');
    assert.ok(phase('shaanxi_xingdusi',1380).seat.includes('永登'));
    assert.ok(phase('shaanxi_xingdusi',1393).seat.includes('张掖'));
  });
  check('late Ming reference sites do not imply continuous control of lost Liaodong',()=>{
    assert.ok(sites('liaodong',1566).some(s=>s.id==='liaoyang'));
    assert.ok(!sites('liaodong',1621).some(s=>s.id==='liaoyang'||s.id==='shenyang'));
    assert.ok(!sites('liaodong',1622).some(s=>s.id==='guangning'));
    assert.deepEqual(sites('liaodong',1642).map(s=>s.id),['ningyuan']);
    assert.equal(phase('liaodong',1644).mapState,'historical');
    assert.ok(sites('liaodong',1566).find(s=>s.id==='jinzhou_south').lat<40);
    assert.ok(sites('liaodong',1566).find(s=>s.id==='jinzhou').lat>40);
  });
  check('Nurgan is an inset with dated activity; Xining titles change in 1432',()=>{
    assert.equal(find('nuergan').footprint,'');
    assert.equal(phase('nuergan',1408).mapState,'not-established');
    assert.equal(phase('nuergan',1411).mapState,'active');
    assert.equal(phase('nuergan',1566).mapState,'historical');
    assert.ok(sites('nuergan',1566)[0].name.includes('旧治'));
    assert.equal(sites('shaanxi_xingdusi',1431).find(s=>s.id==='xining').name,'西宁卫');
    assert.equal(sites('shaanxi_xingdusi',1432).find(s=>s.id==='xining').name,'西宁卫军民指挥使司');
  });
  check('renderer exposes keyboard map targets and does not draw the later envelope in 1374',()=>{
    const html=render(FrontierMapLayer,{year:1566,selected:'liaodong',onSelect:()=>{}});
    assert.equal((html.match(/role="button"/g)||[]).length,4);
    assert.match(html,/选择辽东都指挥使司/);
    assert.match(html,/迁治保定/);
    const early=render(FrontierMapLayer,{year:1374,selected:null,onSelect:()=>{}});
    assert.doesNotMatch(early,/class="frontier-area"/);
    const index=render(FrontierIndex,{year:1566,onSelect:()=>{},mobile:true});
    for(const label of ['辽东','万全','大宁','甘肃','奴儿干'])assert.ok(index.includes(label));
  });
  check('record matching distinguishes the Shaanxi commissions and excludes unassumed posts',()=>{
    const records=[
      {id:'a',person_id:'a',institution:'陕西都指挥使司',record_kind:'tenure'},
      {id:'b',person_id:'b',institution:'陕西行都指挥使司',record_kind:'tenure'},
      {id:'c',person_id:'c',institution:'辽东都指挥使司',record_role:'not_assumed'},
      {id:'d',person_id:'d',institution:'辽东都指挥使司',record_kind:'event',record_role:'office_appointment'},
      {id:'e',person_id:'e',institution:'辽东都指挥使司',record_kind:'event',record_role:'nonservice_event'},
      {id:'f',person_id:'f',institution:'辽东都指挥使司',local_scope:{mode:'catalog_only'}},
      {id:'g',person_id:'g',institution:'都指挥使司',local_scope:{mode:'scoped'}},
    ];
    assert.deepEqual(recordsForFrontier(records,find('shaanxi_xingdusi'),1566).map(r=>r.id),['b']);
    assert.deepEqual(recordsForFrontier(records,find('liaodong'),1566).map(r=>r.id),['d']);
    assert.deepEqual(recordsForFrontier(records,find('liaodong'),1644).map(r=>r.id),['d']);
  });
  const year=JSON.parse(await fs.readFile(root+`public/api/snapshots/${HISTORY_REVISION}/years/1405.json`,'utf8'));
  check('existing dated Liaodong careers are linked directly without another API request',()=>{
    const matches=recordsForFrontier(year.records,find('liaodong'),1405);
    assert.ok(matches.length>=3);
    assert.ok(matches.every(r=>r.institution.includes('辽东')));
  });
  const report={checked_at:new Date().toISOString(),history_revision:HISTORY_REVISION,checks,passed:checks.length,scope:'Data and server-rendered components, no browser/device visual test'};
  await fs.writeFile(root+'work/frontier-checks.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally {await server.close();}
