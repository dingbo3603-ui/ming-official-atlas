// Check the shipped CSS, not only the authored stylesheet: the phone regression
// was introduced when CSS optimization lowered translate:none into transform.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const root = fileURLToPath(new URL('../', import.meta.url));
const html = await fs.readFile(path.join(root,'dist-nas/index.html'),'utf8');
const cssPath = process.argv[2] || html.match(/href="([^"]+\.css)"/)[1].replace(/^\//,'dist-nas/');
const css = postcss.parse(await fs.readFile(path.resolve(root,cssPath),'utf8'));
const primitive = await fs.readFile(path.join(root,'components/ui/dialog.tsx'),'utf8');
const checks = [];
const check = (name,fn) => {fn();checks.push(name);};
const declaration = rule => Object.fromEntries(rule.nodes.filter(n=>n.type==='decl').map(n=>[n.prop,n.value]));
const rules = [];
css.walkRules(rule=>{if(rule.selector.includes('.atlas-dialog-popup'))rules.push(rule);});
const main = rules.find(rule=>rule.selector==='.atlas-dialog-popup[data-slot=dialog-content]' && rule.parent.type==='root');
const phone = rules.find(rule=>rule.selector==='.atlas-dialog-popup[data-slot=dialog-content][role=dialog]' && rule.parent.name==='media');
check('production bundle has a shared phone positioning rule',()=>assert.ok(main&&phone));
const desktop = declaration(main);
const mobile = {...desktop,...declaration(phone)};
check('desktop centers with a single transform and opacity-only transition',()=>{
  assert.equal(desktop.position,'fixed');assert.equal(desktop.left,'50%');assert.equal(desktop.top,'50%');
  assert.equal(desktop.transform,'translate(-50%,-50%)');assert.match(desktop.transition,/^opacity /);
  const popup = primitive.slice(primitive.indexOf('function DialogContent'),primitive.indexOf('function DialogHeader'));
  assert.doesNotMatch(popup,/-translate-[xy]|zoom-(?:in|out)|animate-(?:in|out)|top-1\/2|left-1\/2/);
});
check('phone CSS resets the same transform after production optimization',()=>{
  assert.equal(mobile.position,'fixed');assert.equal(mobile.left,'0');assert.equal(mobile.transform,'none');
  assert.equal(mobile.top,'var(--phone-visible-top,0px)');assert.equal(mobile.animation,'none');assert.equal(mobile.transition,'none');
  for(const rule of rules)assert.ok(!Object.hasOwn(declaration(rule),'translate'),'Do not mix individual translate with the positioning transform');
});
check('phone popup uses visible viewport height and cannot retain desktop width',()=>{
  for(const property of ['width','max-width'])assert.equal(mobile[property],'100%');
  for(const property of ['height','max-height'])assert.equal(mobile[property],'var(--phone-visible-height,100dvh)');
  assert.equal(mobile['min-width'],'0');assert.equal(mobile['min-height'],'0');assert.equal(mobile.margin,'0');
  assert.match(phone.parent.params,/width\s*<=\s*767px|max-width:767px/);
  assert.match(phone.parent.params,/pointer:coarse/);
});
const entries = [
  ['app/page.tsx','official-detail-floating'],['components/atlas-search.tsx','atlas-search-dialog'],
  ['components/capital-council.tsx','institution-floating-card'],['components/capital-council.tsx','history-sili-dialog'],
  ['components/history/history-context.tsx','history-person-dialog'],['components/history/history-context.tsx','history-roster-dialog'],
  ['components/mobile/mobile-shell.tsx','phone-year-dialog'],['components/mobile/mobile-geography.tsx','phone-map-dialog'],
  ['components/site-feedback.tsx','site-feedback-dialog'],
  ['components/institution-directory.tsx','institution-directory-dialog'],
  ['components/frontier-regions.tsx','frontier-dialog'],
];
for(const [file,className] of entries){
  const source = await fs.readFile(path.join(root,file),'utf8');
  assert.match(source,/@\/components\/ui\/dialog/);
  assert.ok(source.includes(className));
  assert.doesNotMatch(source,/className="[^"\n]*-translate-[xy]/);
}
checks.push('year, map, search, institution, official, history, feedback and privacy use the shared primitive');
const mobileSource = await fs.readFile(path.join(root,'app/mobile-v7.css'),'utf8');
const feedbackSource = await fs.readFile(path.join(root,'components/site-feedback.css'),'utf8');
const frontierSource = await fs.readFile(path.join(root,'components/frontier-regions.css'),'utf8');
check('separate bodies keep scrolling while headers and close controls stay available',()=>{
  assert.match(mobileSource,/\.history-dialog-scroll,\.institution-floating-scroll,\.phone-sheet-scroll\s*\{[^}]*min-height:0;[^}]*overflow-y:auto/);
  assert.match(feedbackSource,/\.feedback-form-scroll\s*\{[^}]*min-height:0;[^}]*overflow-y:auto/);
  assert.match(mobileSource,/> \[data-slot='dialog-close'\][^{]*\{[^}]*width:44px;[^}]*height:44px/);
  assert.match(mobileSource,/\.phone-detail-toolbar \[data-slot='dialog-close'\]/);
  assert.match(frontierSource,/\.frontier-detail-scroll\{[^}]*overflow-y:auto;[^}]*min-height:0/);
  assert.match(frontierSource,/\.phone-northeast-row \.northeast-inset\{position:static/);
  assert.match(frontierSource,/\.phone-map-body\{flex:1;min-height:0;overflow-y:auto/);
});
const report={passed:true,checked_at:new Date().toISOString(),css:cssPath,checks,scope:'Production CSS and shared component regression checks; not a browser or physical iPhone test'};
await fs.writeFile(path.join(root,'work/dialog-css-checks.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
