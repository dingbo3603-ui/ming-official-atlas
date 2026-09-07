// Exercise published component output and the real cached reader without a browser.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const root=fileURLToPath(new URL('../',import.meta.url));
const data=JSON.parse(await fs.readFile(root+'work/history-import.json','utf8'));
const server=await createServer({configFile:root+'vite.nas.config.ts',server:{middlewareMode:true},appType:'custom'});
const checks=[];
const h=React.createElement, noop=()=>{};
const originalFetch=globalThis.fetch;
try {
  const directory=await server.ssrLoadModule('/components/institution-directory.tsx');
  const {HistoryProvider}=await server.ssrLoadModule('/components/history/history-context.tsx');
  const {OfficialHierarchy}=await server.ssrLoadModule('/components/official-hierarchy.tsx');
  const {CapitalCouncil}=await server.ssrLoadModule('/components/capital-council.tsx');
  const {capitalInstitutions}=await server.ssrLoadModule('/lib/ming-atlas-v2.ts');
  const entries=directory.directoryEntries(data.offices);
  assert.equal(entries.flatMap(entry=>entry.items).length,749);
  assert.equal(new Set(entries.map(entry=>entry.institution.id)).size,entries.length);
  const html=renderToStaticMarkup(h(directory.InstitutionDirectoryGrid,{officials:data.offices,onSelect:noop}));
  assert.equal((html.match(/class="directory-institution"/g)||[]).length,entries.length);
  for(const name of ['太常寺','御马监','东厂','詹事府','市舶司','衍圣公与四氏教授司']) assert.ok(html.includes(name),name);
  checks.push('all 749 source entries are reachable through the complete grouped directory');

  for(const [term,id] of [['通政使司','transmission-office'],['华盖殿','cabinet'],['吏部','ministry-personnel']]) {
    assert.ok(directory.filterDirectoryEntries(entries,'全部',term).some(entry=>entry.institution.id===id),term);
  }
  checks.push('directory searches display names, institution aliases and dated old titles');

  const render=(component,props)=>renderToStaticMarkup(h(HistoryProvider,null,h(component,props)));
  const options={officials:data.offices,era:'late-ming',selectedInstitution:capitalInstitutions.find(item=>item.id==='cabinet'),setSelectedInstitution:noop,onSelectOfficial:noop,onCourt:noop,onNorthZhili:noop,open:false,setOpen:noop};
  for(const mobile of [false,true]) assert.ok(render(CapitalCouncil,{...options,mobile}).includes('全明职官目录'));
  checks.push('both desktop and phone capital journeys expose the complete catalog');

  for(const ministry of data.datasets['ming-ministry-branches'].ministries) {
    const markup=render(OfficialHierarchy,{institutionName:ministry.name,ministry,officials:data.offices,fallbackOfficials:data.offices.filter(o=>o.institution_id===ministry.ministry_id),onSelect:noop,onBranch:noop,showHistory:true,catalogMode:true,query:''});
    for(const division of ministry.branches.filter(b=>b.kind==='qinglisi')) {
      for(const id of division.record_ids) assert.ok(markup.includes('data-record-id="'+id+'"'),id);
    }
  }
  checks.push('rendered six-ministry trees contain all 126 distinct divisional posts');

  for(const entry of entries.filter(item=>['太常寺','御马监','东厂','衍圣公与四氏教授司'].includes(item.institution.name))) {
    const markup=render(OfficialHierarchy,{institutionName:entry.institution.name,officials:data.offices,fallbackOfficials:entry.items,onSelect:noop,onBranch:noop,showHistory:true,catalogMode:true,query:''});
    assert.doesNotMatch(markup,/机构关系资料正在载入/);
    for(const office of entry.items) assert.ok(markup.includes('data-record-id="'+office.record_id+'"'),office.record_id);
  }
  checks.push('additional institutions render clickable posts without a permanent loading placeholder');

  const {readHistoryJson}=await server.ssrLoadModule('/lib/history-reader.ts');
  const {datasetUrl}=await server.ssrLoadModule('/lib/history-api.ts');
  let downloads=0;
  globalThis.fetch=async url=>{
    downloads++;
    assert.ok(String(url).includes('office-evidence-index'));
    return new Response(JSON.stringify(data.datasets['office-evidence-index']),{status:200,headers:{'content-type':'application/json'}});
  };
  const results=await Promise.all([readHistoryJson(datasetUrl('office-evidence-index')),readHistoryJson(datasetUrl('office-evidence-index'))]);
  assert.deepEqual(results[0],data.datasets['office-evidence-index']);
  await readHistoryJson(datasetUrl('office-evidence-index'));
  assert.equal(downloads,1);
  checks.push('parallel dialog reads share one download and subsequent reads use the cache');
  const receipt={passed:true,checks,institutions:entries.length,scope:'Component rendering and data-reader checks, not browser or physical-device testing'};
  await fs.writeFile(root+'work/catalog-ui-checks.json',JSON.stringify(receipt,null,2));
  console.log(JSON.stringify(receipt,null,2));
} finally {globalThis.fetch=originalFetch;await server.close();}
