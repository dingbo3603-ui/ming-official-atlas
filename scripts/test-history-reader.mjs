import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';

const revision='1234567890abcdef';
let run=0;
async function reader() {
  const source=(await fs.readFile(new URL('../lib/history-reader.ts',import.meta.url),'utf8')).replace(/import \{ HISTORY_REVISION \} from '.\/history-revision';/,`const HISTORY_REVISION = '${revision}';`);
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  return import('data:text/javascript;base64,'+Buffer.from(js+'\n// test '+run++).toString('base64'));
}
const good=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
test('HTML response falls back to the other path and valid data is cached',async()=>{
  const {readHistoryJson}=await reader(); const calls=[];
  globalThis.fetch=async url=>{calls.push(url);return calls.length===1?new Response('<html>proxy failure</html>'):good({year:1580,records:[],revision});};
  const url=`/api/index.php?v=${revision}&action=year&year=1580`;
  assert.equal((await readHistoryJson(url)).year,1580); assert.equal(calls.length,2);
  await readHistoryJson(url); assert.equal(calls.length,2);
});
test('aborting one caller during body read does not fail other subscribers',async()=>{
  const {readHistoryJson}=await reader(); let finish;
  globalThis.fetch=async()=>({ok:true,text:()=>new Promise(resolve=>{finish=resolve;})});
  const controller=new AbortController(); const url=`/api/index.php?v=${revision}&action=bootstrap`;
  const cancelled=readHistoryJson(url,controller.signal); const other=readHistoryJson(url);
  await new Promise(resolve=>setTimeout(resolve,0)); controller.abort();
  await assert.rejects(cancelled,{name:'AbortError'});
  finish(JSON.stringify({people:[],revision})); assert.deepEqual((await other).people,[]);
});
test('invalid responses do not poison retry cache; revisions must match',async()=>{
  const {readHistoryJson}=await reader();
  globalThis.fetch=async()=>good({revision:'stale'});
  const url=`/api/index.php?v=${revision}&action=year&year=1416`;
  await assert.rejects(readHistoryJson(url));
  globalThis.fetch=async()=>good({revision,year:1416,records:[]});
  assert.equal((await readHistoryJson(url)).year,1416);
});
test('person API failure reads the requested person from the small shard',async()=>{
  const {readHistoryJson,personShard}=await reader(); let calls=0;
  assert.equal(personShard('zhang-juzheng'),'ed'); // Independently checked against PHP hash('fnv1a32', id).
  globalThis.fetch=async url=>{calls++;return calls===1?new Response('unavailable',{status:503}):good({'zhang-juzheng':{person:{id:'zhang-juzheng'},records:[],revision}});};
  const result=await readHistoryJson(`/api/index.php?v=${revision}&action=person&id=zhang-juzheng`);
  assert.equal(result.person.id,'zhang-juzheng');assert.equal(calls,2);
});
