"""Assemble individually reviewed records without altering the supplied source data."""
import collections
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / 'research/rank-audit'
OUT = ROOT / 'public/data'
raw = json.loads((OUT / 'ming-officials.json').read_text(encoding='utf-8'))['officials']
records = []
for name in ['central-primary.json', 'central-secondary.json', 'local-rank-audit.json', 'military.json', 'existing-county-supplement-audit.json']:
    part = json.loads((RESEARCH / name).read_text(encoding='utf-8'))
    records.extend(part if isinstance(part, list) else part['records'])
url = 'https://zh.wikisource.org/zh-hans/明史/卷72'
for slug,title,rank,evidence in [('left-chancellor','左丞相','正一品','左、右丞相，正一品'),('right-chancellor','右丞相','正一品','左、右丞相，正一品'),('pingzhang','平章政事','从一品','平章政事，从一品'),('left-assistant','左丞','正二品','左、右丞，正二品'),('right-assistant','右丞','正二品','左、右丞，正二品'),('councillor','参知政事','从二品','参知政事，从二品'),('drafter','中书舍人','从七品','七年，直省舍人从八品；九年改正七品，寻又改从七品')]:
    records.append(dict(record_id='supplement-zhongshu-'+slug,institution='中书省',title=title,original_rank=rank,verified_rank=rank,status='qualified',source_url=url if slug!='drafter' else 'https://zh.wikisource.org/zh-hans/明史/卷74#中书科',evidence=evidence,note='明初制度条目；洪武九年罢平章、参知，十三年罢中书省。中书舍人存，且初设时品秩几经变动；不把这些官职放进万历在任名单。'))

supplements = []
def add(slug,inst,title,rank,count,duty,source,evidence,note):
    identifier='supplement-'+slug
    supplements.append(dict(record_id=identifier,institution=inst,title=title,rank=rank,headcount=count,department=inst,duty_notes=duty,sources=[dict(sheet='史料补录',row=0,range='《明史》职官志',region='地方官制')],uncertainty_flags=[]))
    records.append(dict(record_id=identifier,institution=inst,title=title,original_rank=None,verified_rank=rank,status='verified',source_url=source,evidence=evidence,note=note,added_in_this_revision=True))
state_url='https://zh.wikisource.org/zh-hans/明史/卷75#州'
for slug,title,rank,duty in [('magistrate','知州','从五品','掌一州治理；直隶州与属州品秩同。'),('vice','同知','从六品','佐知州分掌粮马、巡捕等州事；各州设置员额不尽相同。'),('judge','判官','从七品','佐知州分理州事；缺员或分职以地方志为准。'),('clerk','吏目','从九品','佐理刑名文书及架阁事务。')]:
    add('state-'+slug,'州衙',title,rank,'一人（同知、判官或不设）' if slug in ('vice','judge') else '一人',duty,state_url,'知州，从五品；同知，从六品；判官，从七品；吏目，从九品。','普通州制；直隶州、属州品秩同。场景是职官类型，不宣称每州在此时实设全部员额。')
for slug,title,count in [('head','学正','一人'),('assistant','训导','三人')]:
    add('state-school-'+slug,'州儒学',title,'未入流',count,'掌本州生员教育；属于儒学系统，并非州衙堂上的佐贰。','https://zh.wikisource.org/zh-hans/明史/卷75#儒学','州，学正一人，训导三人。','学官未入流；参《大明会典》卷10与《明太祖实录》卷130。')
    records[-1]['additional_sources']=['https://zh.wikisource.org/zh/大明會典/卷之十_稽勛_勛級_資格','https://m.gushiwen.cn/guwen/bookv_9361d40e3543.aspx']
    records[-1]['evidence']+=' 《明太祖实录》卷130：“天下教官则有学政教谕训导……近以教官、首领官、未入流品例称杂职。”后列州学正、县教谕、府州县训导。'
for slug,title,rank in [('magistrate','知县','正六品'),('vice','县丞','正七品'),('registrar','主簿','正八品')]:
    add('capital-county-'+slug,'京县',title,rank,'一人','京县长贰；适用于宛平、大兴及南京上元、江宁，不能推广至全府属县。','https://zh.wikisource.org/zh-hans/明史/卷74#顺天府','宛平、大兴知县，正六品；县丞，正七品；主簿，正八品。上元、江宁二县，如宛平、大兴。','京县特例，较普通县前三职各高一级；典史不随之机械升等。')

ids=[r['record_id'] for r in records]
assert len(ids)==len(set(ids)), 'duplicate audits'
assert {r['record_id'] for r in raw}.issubset(ids), 'missing source records'
assert len(records)==571
raw_by_id={r['record_id']:r for r in raw}
for r in records:
    if r['record_id'] in raw_by_id:
        source=raw_by_id[r['record_id']]
        assert r['original_rank']==source['rank'],r['record_id']
        r['department']=source['department']
    if r['status']=='unresolved':
        r['unresolved_proposal']=r['verified_rank'];r['verified_rank']=None
    if r['record_id']=='official-0434':
        r.update(verified_title='知县',verified_institution='县衙',verified_department='县衙',display_rank='正七品')
        r['note']+=' 知州现已拆为独立条目，从五品。'
    if r['record_id'] in ('official-0435','official-0436','official-0437'):
        r.update(verified_institution='县衙',verified_department='县衙')
    # Normalize only source-backed spelling and institution corrections.
    corrections={ 'official-0199':('左、右寺副',None), 'official-0217':(None,'光禄寺典簿厅'), 'official-0236':(None,'尚宝司'), 'official-0237':(None,'尚宝司'), 'official-0238':('司丞','尚宝司'), 'official-0310':('五官监候',None), 'official-0342':(None,'太常寺神乐观') }
    if r['record_id'] in corrections:
        title,department=corrections[r['record_id']]
        if title:r['verified_title']=title
        if department:r['verified_department']=department
        if r['record_id'] in ('official-0236','official-0237','official-0238'):r['verified_institution']='尚宝司'
        if r['record_id']=='official-0342':r['verified_institution']='太常寺'
records.sort(key=lambda r:r['record_id'])
counts=dict(collections.Counter(r['status'] for r in records))
data=dict(reviewed_at='2026-09-05',scope='原底稿553条、原补录9条、新增州/京县9条',original_site_count=562,added_count=9,count=len(records),status_counts=counts,method='以《明史》职官志为通常本品骨架，以《大明会典》品秩表补证。旧制、时代变化、兼衔与古籍异载单列；未得直接证据的条目保留待核，不把“未注品”等同“未入流”。',records=records)
(OUT/'ming-official-rank-audit.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'ming-local-supplements.json').write_text(json.dumps(supplements,ensure_ascii=False,indent=2),encoding='utf-8')

labels={'verified':'已核','corrected':'改正','qualified':'需限定','unresolved':'待核'}
def esc(v):return html.escape(str(v or '—'),quote=True)
body=[]
for r in records:
    source_links=[r['source_url']]+[x if isinstance(x,str) else x.get('url','') for x in r.get('additional_sources',[]) if isinstance(x,(str,dict))]
    links=' · '.join(f'<a href="{esc(u)}" target="_blank" rel="noreferrer">原典{index+1}</a>' for index,u in enumerate(source_links) if u.startswith('https://'))
    body.append(f'<tr data-status="{r["status"]}"><td><small>{esc(r["record_id"])}</small><b>{esc(r.get("verified_title") or r["title"])}</b>{esc(r.get("verified_institution") or r["institution"])}<small>{esc(r.get("verified_department") or r.get("department"))}</small></td><td>{esc(r["original_rank"])}</td><td><b>{esc(r["verified_rank"] if r["status"]!="unresolved" else "待核，原表未证实")}</b><span class="status {r["status"]}">{labels[r["status"]]}</span></td><td>{esc(r["note"])}<details><summary>依据与原文</summary><blockquote>{esc(r["evidence"])}</blockquote>{links}</details></td></tr>')
court=(RESEARCH/'court-ceremony.md').read_text(encoding='utf-8')
# Publish the historical part, omitting internal pixel-layout instructions.
court=court.split('## 原图测量')[0]
(OUT/'ming-court-ceremony.md').write_text(court,encoding='utf-8')
summary=f'''<h1>大明朝班与官品核查</h1><p class="lead">原网站 562 条职官全部逐项查核，另补州衙与京县 9 条，共 571 条。{counts['verified']} 条已核，{counts['corrected']} 条改正，{counts['qualified']} 条需限定，{counts['unresolved']} 条待核。</p>
<p>“逐项查核”不等于每条均已证实。未注品级不自动判为未入流；现行官、前代已革官、差遣、本官、兼衔和爵位不能混为同一列。原底稿保留，修订通过独立审校层呈现。查核日期：2026-09-05。</p>
<section><h2>朝班应如何理解</h2><p>皇帝居北面南。文东武西：从殿南向北看，文班在画面右、武班在左；从皇帝看则左右相反。御道留空，品秩决定基本序列，爵贵、近侍和兼衔另有规则。殿阁大学士本品正五，晚明朝班却列六部之上，因此不能仅按数字排位。</p><p>正旦、冬至等大朝贺，百官主体在殿外丹墀，面北行礼；常朝还有御门、御殿和朔望等不同制度。“殿内所有官员面向观众排两行”只能作为人物展示，不能称大朝会复原。</p><p><a href="https://zh.wikisource.org/zh-hans/明史/卷53">《明史》卷53·大朝仪、常朝仪</a> · <a href="https://www.shidianguji.com/book/NA02313/chapter/1kv1c9eo81d12">《皇明制书·礼仪定式》</a> · <a href="https://www.dpm.org.cn/Uploads/File/2019/12/15/u5df5e711493ed.pdf">故宫《明代朝仪述略》</a> · <a href="/data/ming-court-ceremony.html">详细朝仪研究</a></p></section>
<section><h2>州、县与京县</h2><p>州：知州从五、同知从六、判官从七、吏目从九。普通县：知县正七、县丞正八、主簿正九、典史未入流。京县宛平、大兴、上元、江宁的知县正六、县丞正七、主簿正八。儒学学正、教谕、训导属于学校体系；巡检司分置关津要害，不应每县固定摆进堂上班列。</p><p><a href="https://zh.wikisource.org/zh-hans/明史/卷75">《明史》卷75</a> · <a href="https://zh.wikisource.org/zh-hans/明史/卷74#顺天府">京县特例</a> · <a href="https://zh.wikisource.org/zh/大明會典/卷之十_稽勛_勛級_資格">《大明会典》官品总表</a></p></section>'''
page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>大明朝班与全部官品核查</title><style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#171510;color:#d9cfb9;font:15px/1.85 system-ui,sans-serif}main{max-width:1400px;margin:auto;padding:40px 28px}h1,h2,b{color:#ead3a0}h1,h2{font-family:serif}h1{font-size:32px}h2{font-size:22px}.lead{font-size:18px}a{color:#e2b871;text-underline-offset:4px}section{border-top:1px solid #605039;padding:12px 0}nav{margin:30px 0;display:flex;gap:12px;flex-wrap:wrap}input,select{font:inherit;background:#211e16;color:#ead3a0;border:1px solid #756346;padding:9px 12px;border-radius:5px}input{flex:1;min-width:230px}table{width:100%;border-collapse:collapse}th{text-align:left;background:#332b1e;color:#e0c58e;position:sticky;top:0;padding:12px}td{vertical-align:top;border-bottom:1px solid #453b2b;padding:14px 12px}td:first-child{width:23%}td:nth-child(2){width:12%}td:nth-child(3){width:21%}b,small{display:block}small{font-size:11px;color:#9c917d}.status{display:inline-block;margin-top:6px;padding:1px 7px;border-radius:3px;background:#344138;font-size:11px}.corrected{background:#733d2b}.qualified{background:#5b4b29}.unresolved{background:#583239}summary{cursor:pointer;color:#c5ae7e;margin-top:7px}blockquote{margin:10px 0;border-left:2px solid #91754c;padding-left:12px;color:#c2b9a4}.table-wrap{overflow:auto}tr[hidden]{display:none}@media(max-width:700px){main{padding:20px 14px}table{min-width:850px}}@media print{body{background:white;color:#222}main{padding:0}h1,h2,b,a{color:#111}th{position:static}nav{display:none}details{display:block}table{font-size:10px}}
</style><main><a href="/">← 返回大明职官图</a>'''+summary+'''<nav><input id="query" type="search" placeholder="搜索官名、机构、品级或说明" aria-label="搜索审校表"><select id="status" aria-label="筛选审校状态"><option value="">全部状态</option><option value="corrected">改正</option><option value="qualified">需限定</option><option value="unresolved">待核</option><option value="verified">已核</option></select><span id="count"></span></nav><div class="table-wrap"><table><thead><tr><th>官职与机构</th><th>原表品阶</th><th>核查结果</th><th>说明与出处</th></tr></thead><tbody>'''+''.join(body)+'''</tbody></table></div><p><a href="/data/ming-official-rank-audit.json" download>下载完整审校数据</a></p></main><script>
const query=document.getElementById('query'),status=document.getElementById('status'),rows=[...document.querySelectorAll('tbody tr')];function filter(){let shown=0;for(const row of rows){row.hidden=!(row.textContent.includes(query.value.trim())&&(!status.value||row.dataset.status===status.value));if(!row.hidden)shown++}document.getElementById('count').textContent=shown+' 条'}query.addEventListener('input',filter);status.addEventListener('change',filter);filter();</script></html>'''
(OUT/'ming-official-rank-audit.html').write_text(page,encoding='utf-8')

def inline_markdown(value):
    escaped=html.escape(value)
    escaped=re.sub(r'\[([^\]]+)\]\(([^)]+)\)',r'<a href="\2">\1</a>',escaped)
    return re.sub(r'\*\*(.*?)\*\*',r'<strong>\1</strong>',escaped)

article=[]
in_list=False
for line in court.splitlines():
    if in_list and not line.startswith('- '):
        article.append('</ul>');in_list=False
    if line.startswith('# '):article.append('<h1>'+inline_markdown(line[2:])+'</h1>')
    elif line.startswith('## '):article.append('<h2>'+inline_markdown(line[3:])+'</h2>')
    elif line.startswith('- '):
        if not in_list:article.append('<ul>');in_list=True
        article.append('<li>'+inline_markdown(line[2:])+'</li>')
    elif line.strip():article.append('<p>'+inline_markdown(line)+'</p>')
if in_list:article.append('</ul>')
styles=page.split('<style>',1)[1].split('</style>',1)[0]
research_page='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>大明朝仪详细考证</title><style>'+styles+'main{max-width:1000px}h2{margin-top:34px;border-top:1px solid #605039;padding-top:24px}li{margin-bottom:12px}strong{color:#ead3a0}p{margin:18px 0}</style><main><a href="/data/ming-official-rank-audit.html">← 全部官品核查</a>'+''.join(article)+'<p><a href="/data/ming-court-ceremony.md" download>下载研究文稿</a></p></main></html>'
(OUT/'ming-court-ceremony.html').write_text(research_page,encoding='utf-8')
print(json.dumps({'records':len(records),'status_counts':counts},ensure_ascii=False))
