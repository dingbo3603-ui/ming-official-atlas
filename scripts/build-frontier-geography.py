"""Curated dated military geography; area shapes are navigation, not historical borders."""
import json
from pathlib import Path
from shapely.geometry import shape, mapping, box, Polygon, LineString
from shapely.ops import unary_union

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT.parent/'ming-official-atlas-assets/geography-v3'
RESEARCH=ROOT/'research/geography'
research=json.loads((RESEARCH/'frontier-regions-research-20260909.json').read_text(encoding='utf-8'))
coast_path=RESEARCH/'frontier-coastline.geojson'
if not coast_path.exists():
    original=json.loads((ASSETS/'natural-earth-admin1.geojson').read_text(encoding='utf-8'))
    extent=box(91,17,144,56)
    pieces=[]
    for feature in original['features']:
        if feature['properties']['admin'] not in ['China','Russia','North Korea','South Korea','Taiwan']: continue
        geometry=shape(feature['geometry'])
        if geometry.intersects(extent): pieces.append(geometry.intersection(extent))
    land=unary_union(pieces).simplify(.055,preserve_topology=True)
    coast_path.write_text(json.dumps({'type':'Feature','properties':{
        'role':'physical_land_not_political_border','source':'https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/',
        'license':'public domain','simplification_degrees':.055},'geometry':mapping(land)},separators=(',',':')),encoding='utf-8')
land=shape(json.loads(coast_path.read_text())['geometry'])

def xy(lon,lat,inset=False):
    return ((lon-118)/26*640,(56-lat)/18*400) if inset else ((lon-91)/34.5*1600,(43.5-lat)/26.5*1000)
def svg(geometry,inset=False):
    polygons=[geometry] if geometry.geom_type=='Polygon' else list(geometry.geoms)
    output=[]
    for polygon in polygons:
        if polygon.geom_type!='Polygon' or polygon.area<.01: continue
        for ring in [polygon.exterior,*polygon.interiors]:
            points=[xy(*point,inset) for point in ring.coords]
            output.append('M'+' L'.join(f'{x:.1f},{y:.1f}' for x,y in points)+' Z')
    return ' '.join(output)

shapes={
    # Described extent and a schematic inland envelope; modern coastline only clips sea away.
    'liaodong':Polygon([(119.7,40.0),(120.1,41.05),(121.4,42.5),(124.4,43.0),(125.1,42.6),(124.9,41.5),(124.35,39.85),(122.1,38.6),(121.05,38.7),(121.2,39.6),(121.45,40.4),(120.6,40.2)]),
    'wanquan':Polygon([(114.2,40.1),(114.1,41.15),(115.7,41.7),(116.45,41.0),(116.0,40.35),(115.1,40.1)]),
    'daning':Polygon([(118.0,41.0),(118.1,42.2),(119.2,42.7),(120.25,42.2),(120.5,41.3),(119.4,40.9)]),
    'shaanxi_xingdusi':LineString([(98.5,39.74),(100.45,38.93),(101.09,38.78),(101.97,38.25),(102.64,37.93),(103.26,36.74),(101.78,36.62)]).buffer(.42,quad_segs=5),
}
labels={'liaodong':[1470,40],'wanquan':[1085,58],'daning':[1270,34],'shaanxi_xingdusi':[435,118],'nuergan':[0,0]}
aliases={
 'liaodong':['辽东','遼東','定辽','定遼'],
 'wanquan':['万全都','萬全都','宣府巡抚','宣府巡撫','宣府总兵','宣府總兵','宣大'],
 'daning':['大宁都','大寧都','北平行都'],
 'shaanxi_xingdusi':['陕西行都','陝西行都','甘肃巡抚','甘肅巡撫','甘肃总兵','甘肅總兵','甘州都'],
 'nuergan':['奴儿干','奴兒干'],
}
descriptions={
 'liaodong':'东北边防的重要军政建置。主要卫所从辽西经辽阳、沈阳至开原，并沿辽东半岛分布；此处单列军事辖区。',
 'wanquan':'以宣府为治所的军事都司。都司卫所与周边州县各有统属，可在这里查阅宣府一带的军事建置。',
 'daning':'先置于塞外大宁，永乐初迁保定。地图保留故地，并列出迁治后的驻点，分别查看沿革。',
 'shaanxi_xingdusi':'行都司治所曾在河州、庄浪，后迁甘州。本区按河西及相关卫所列示，与西安的陕西都司分别对应。',
 'nuergan':'黑龙江下游的明代招抚经营与羁縻建置。以旧治和有据活动为线索，不把整个东北画作连续实控省区。',
}
def phase(a,b,title,seat,note,state='active',ids=None,caption=None):
    return dict(from_=a,until=b,title=title,seat=seat,note=note,mapState=state,siteIds=ids,**({'mapCaption':caption} if caption else {}))
phases={
 'liaodong':[
  phase(1368,1370,'辽东地区 · 定辽都卫未设','—','1371 年设置定辽都卫；本年尚未采用这一建置。','not-established',[]),
  phase(1371,1374,'定辽都卫','辽阳一带','1371 年七月设定辽都卫，诸卫陆续设置。后期卫所不提前列入。',ids=[]),
  phase(1375,1617,'辽东都指挥使司','辽阳 · 定辽诸卫','1375 年十月改辽东都司。这里按各卫设立、迁治年列出代表据点；范围为卫所分布参照。'),
  phase(1618,1618,'辽东 · 抚顺、清河失守','辽阳','1618 年内抚顺、清河相继失守。淡色范围为原卫所分布，战局已有变化。','changed',caption='战事变动'),
  phase(1619,1620,'辽东 · 开原失守后','辽阳','1619 年开原失守，东北防线发生变化。原分布范围只作旧制参照。','changed',caption='战事变动'),
  phase(1621,1621,'辽东 · 辽沈失守之年','辽阳旧治；辽西、辽南战局变动','本年三月沈阳、辽阳先后失守；图中旧辖不能理解为本年始终有效的管辖。本节按年内事件后状态标出已知据点。','changed',ids=['guangning','jinzhou','ningyuan'],caption='辽沈失守'),
  phase(1622,1641,'辽东 · 辽西防线','宁远、锦州等防御据点','1622 年广宁败退后，宁锦防线经历弃守与重建。这里列防线代表据点，不表示 1622—1641 年持续稳定控制；辽南与东江另有战局。','changed',ids=['ningyuan','jinzhou'],caption='辽西防线'),
  phase(1642,1643,'辽东 · 松锦失守后','宁远','1642 年内松山、锦州相继失守，宁远仍有明军驻守。图取变局后代表据点，旧辖范围不再表示实际控制。','changed',ids=['ningyuan'],caption='宁远仍守'),
  phase(1644,1644,'辽东 · 宁远撤防之年','宁远旧城','1644 年宁远兵民撤入关。保留旧址沿革，本年不是全年同一防御局势。','historical',ids=[],caption='旧址与沿革'),
 ],
 'wanquan':[
  phase(1368,1429,'宣府诸卫 · 万全都司未设','—','部分卫所已见于洪武时期；万全都司到 1430 年才正式设置。','not-established',[]),
  phase(1430,1643,'万全都指挥使司','宣府 · 今宣化','1430 年六月设都司，宣府诸卫等来属。列表为代表驻点，不按任意年份套用《明史》汇纂卫所总数。'),
  phase(1644,1644,'万全 · 宣府失守之年','宣府旧治','1644 年三月宣府失守。本年按重大事件列示，原卫所范围为旧制参照。','historical',[]),
 ],
 'daning':[
  phase(1368,1386,'大宁地区 · 都司未设','—','大宁都司于 1387 年设置，本年不套用后来的军事建置。','not-established',[]),
  phase(1387,1387,'大宁都指挥使司','大宁 · 今宁城大明城一带','1387 年九月设大宁都司。此时仍为塞外原治。',ids=['daning_old']),
  phase(1388,1402,'北平行都指挥使司','大宁','1388 年七月由大宁都司改名。1403 年迁治前，以大宁原治为建置锚点。',ids=['daning_old']),
  phase(1403,1643,'大宁都司 · 迁治保定','保定','1403 年三月复名大宁都司、迁保定。营州诸屯卫分迁顺义、蓟州等地；塞外大宁淡色范围仅为故地。','changed',ids=['baoding','yingzhou_left','yingzhou_right','yingzhou_mid','yingzhou_front','yingzhou_rear'],caption='迁治保定'),
  phase(1644,1644,'大宁都司 · 京畿战局变动','保定旧治','1644 年京畿战局剧变，本节仅保留迁治与旧址参照，不将明末全年画作稳定辖地。','historical',[],caption='旧治沿革'),
 ],
 'shaanxi_xingdusi':[
  phase(1368,1373,'河西地区 · 行都司未设','—','西安行都卫于 1374 年在河州设置。','not-established',[]),
  phase(1374,1374,'西安行都卫','河州 · 今临夏','1374 年七月设于河州，此时尚非后来以甘州为治的行都司。',ids=[]),
  phase(1375,1376,'陕西行都司 · 河州','河州','1375 年十月改名陕西行都司，1376 年十二月罢。年粒度保留本年设废事件。',ids=[]),
  phase(1377,1378,'陕西行都司 · 罢设期间','—','1376 年末罢设，1379 年在庄浪复设；期间不套用甘州时期建置。','not-established',[]),
  phase(1379,1392,'陕西行都司 · 庄浪','庄浪卫 · 今永登','1379 年正月在庄浪卫复设。这里的庄浪是今永登，不是今庄浪县。',ids=['zhuanglang']),
  phase(1393,1642,'陕西行都司 · 甘肃','甘州 · 今张掖','1393 年迁治甘州。地图列河西及相关卫所的地理参照；个别卫所具体转隶年份仍待补考。'),
  phase(1643,1644,'陕西行都司 · 明末战事','甘州旧治','《明史》记崇祯十六年十二月甘州失陷。按原年号记述，不将旧历十二月直接当作公历同月，也不据此判定 1643 年全年状态。','changed',[],caption='明末战事'),
 ],
 'nuergan':[
  phase(1368,1408,'奴儿干地区 · 都司未设','特林一带旧址','奴儿干都司于 1409 年设置，本年仅提供地区沿革入口。','not-established',[]),
  phase(1409,1410,'奴儿干都司 · 设置','黑龙江下游 · 特林一带','1409 年下诏设司，1411 年遣使领军赴当地经营。设司年与赴地经营年分别记述。',ids=[]),
  phase(1411,1434,'奴儿干都司 · 招抚经营','特林一带','1411 年起有赴地招抚经营活动，1433 年重建永宁寺。差遣往来有断续，不能理解为普通省区式持续驻守。'),
  phase(1435,1644,'奴儿干旧治 · 东北羁縻','特林旧治','1435 年实录记停止采捕、造船、运粮等事。旧治与后续东北各卫授官、朝贡关系分别看待，不据此认定所有羁縻关系同时结束。','historical',ids=['tyr']),
 ],
}

output=[]
for raw in research['regions']:
    rid=raw['id']
    source_ids=list(dict.fromkeys(e['source_id'] for e in raw['evidence']))
    sites=[]
    for point in raw['points']:
        until=1644
        # Endpoints below concern display of dated reference sites, not guessed legal abolition.
        if rid=='liaodong': until={'kaiyuan':1618,'tieling':1618,'liaoyang':1620,'shenyang':1620,'haizhou':1620,'gaizhou':1620,'jinzhou_south':1620,'guangning':1621,'jinzhou':1641,'ningyuan':1643}[point['id']]
        if rid=='daning' and point['id']=='daning_old': until=1402
        note=point['active_from_basis'].replace('本轮','当前资料')
        if rid=='liaodong' and point['id'] in ['tieling','haizhou','gaizhou','jinzhou_south']:
            note+=' 明末具体驻守终期未逐点复原；战事后只作旧址参照。'
        site=dict(id=point['id'],name=point['label'],modernPlace=point['modern_reference'],lon=point['lon'],lat=point['lat'],from_=point['active_from_year'],displayUntil=until,note=note,sourceIds=[next((key for key,s in research['sources'].items() if s['url']==point['source_url']),source_ids[0])])
        site['from']=site.pop('from_')
        if point['id']=='xining': site['namePeriods']=[{'from':1373,'until':1431,'name':'西宁卫'},{'from':1432,'until':1644,'name':'西宁卫军民指挥使司'}]
        if point['id']=='tyr': site['namePeriods']=[{'from':1411,'until':1434,'name':'特林 · 奴儿干活动地'},{'from':1435,'until':1644,'name':'特林 · 奴儿干旧治'}]
        sites.append(site)
    final_phases=[]
    for item in phases[rid]:
        item['from']=item.pop('from_')
        if item['siteIds'] is None: item['siteIds']=[p['id'] for p in sites]
        item['sourceIds']=source_ids
        final_phases.append(item)
    footprint=svg(shapes[rid].intersection(land).intersection(box(91,17,125.5,43.5))) if rid in shapes else ''
    output.append(dict(id=rid,shortName=raw['label'],kind=raw['institution_kind'],aliases=aliases[rid],description=descriptions[rid],mapLabel=labels[rid],inset=bool(raw.get('inset')),footprint=footprint,footprintFrom={'liaodong':1430,'wanquan':1430,'daning':1388,'shaanxi_xingdusi':1394,'nuergan':1409}[rid],phases=final_phases,sites=sites,sources=[dict(id=k,title=research['sources'][k]['title'],url=research['sources'][k]['url'],supports=research['sources'][k]['scope']) for k in source_ids]))
payload={'schemaVersion':1,'researchedOn':'2026-09-09','scope':'省域与军事建置分别组织；卫所分布范围不是精确疆界。','coordinateNote':'今城镇、遗址一带近似锚点；沿革年份为年内事件。','geometrySource':'Natural Earth public-domain coastline; hand-generalized reference envelopes, not historical boundary data.','regions':output,'northeastLand':svg(land.intersection(box(118,38,144,56)),True)}
(ROOT/'public/data/ming-frontier-regions.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'regions':len(output),'sites':sum(len(r['sites']) for r in output),'bytes':(ROOT/'public/data/ming-frontier-regions.json').stat().st_size}))
