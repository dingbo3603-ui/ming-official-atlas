import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const expected=await read(path.join(root,'work/history-import.json'));
const manifest=await read(path.join(root,'public/api/snapshots/manifest.json'));
const directory=path.join(root,'public/api/snapshots',manifest.revision);
const people=new Map(expected.people.map(p=>[p.id,p]));
const records=new Map(expected.tenures.map(r=>[r.id,r]));
let seenPeople=0,seenRecords=0;
for(const name of await fs.readdir(path.join(directory,'people'))) {
  const shard=await read(path.join(directory,'people',name));
  for(const result of Object.values(shard)) {
    assert.deepEqual(result.person,people.get(result.person.id),result.person.id);
    people.delete(result.person.id); seenPeople++;
    for(const row of result.records) {assert.deepEqual(row,records.get(row.id),row.id);records.delete(row.id);seenRecords++;}
  }
}
assert.equal(people.size,0);assert.equal(records.size,0);
for(const [name,value] of Object.entries(expected.datasets)) assert.deepEqual(await read(path.join(directory,'datasets',name+'.json')),value,name);
const sizes=[];
for(const name of await fs.readdir(path.join(directory,'years'))) sizes.push((await fs.stat(path.join(directory,'years',name))).size);
const receipt={revision:manifest.revision,people:seenPeople,records:seenRecords,all_mysql_exported_bodies_equal_reviewed_input:true,year_snapshot_max_bytes:Math.max(...sizes)};
await fs.writeFile(path.join(root,'work/history-snapshot-verification.json'),JSON.stringify(receipt,null,2));
console.log(receipt);
