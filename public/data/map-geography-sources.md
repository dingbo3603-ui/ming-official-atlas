# 大明职官图：横向地图几何与地理草图

2026-09-05 制作基础地图，2026-09-09 增补边区卫所。此资料包提供游戏式可选区域、地理构图底稿与来源说明，不是考据级逐年疆界复原。

## 边区与卫所（2026-09-09）

新增 `ming-frontier-regions.json`，独立记录辽东、万全、大宁、陕西行都司（甘肃）与奴儿干，共29个代表据点。军事建置与原15个州省入口分开，不能相加理解成20个省。

- 建置、迁治与改名依据《明史》卷40—42；明末变动参考卷21、22、24、259及《清史稿》卷474。每区保留具体来源链接与支持范围。
- 奴儿干依据《明太宗实录》卷91、宣德十年《明宣宗实录》、黑龙江地方志及相关研究。1409设司、1411赴地经营、1435停止采捕等事分别记述，不把东北所有羁縻关系画为连续实控省界。
- 点位采用今城镇、遗址附近近似坐标。`from` 是当前点名／迁治后的起始参照年；`displayUntil` 只控制这轮示意图何时停止显示该点，不等于法律上的废卫年份。卫所设置年与今地迁入年分别说明。
- 虚线范围为人工概括的卫所分布包络，用 Natural Earth 公共领域海岸线裁去海面；不是古籍提供的边界数据。西北及东北附图均不套用现代国境。大宁1403年迁治后，塞外包络仅作故地参照。
- 辽东1618年以后的图示注明战局变化与失守事件。1622—1641宁锦据点为这一阶段的防御参照，不主张期间各点持续稳定控制。
- 主图沿用1600×1000视窗与等比布局；东北附图另用118°—144°E、38°—56°N视窗，避免压缩、拉伸主地图。

研究底稿在 `research/geography/frontier-regions-research-20260909.json`；可用 `scripts/build-frontier-geography.py` 从底稿及缓存海岸线重建发布数据（需要 Shapely）。

该数据以 `atlas_datasets.id = ming-frontier-regions` 单独存入 MySQL。当前前端同时编译其静态副本，切年只读已有年度人物缓存；此次不重算人物任期、不改变年度快照版本。后续全量历史导入会通过 `prepare-history.py` 自动纳入此 JSON。

## 直接可用文件

- `ming-provinces.geojson`：15 个 Polygon/MultiPolygon；Feature id 与 `properties.id` 均匹配项目省区 id。经纬度坐标，简化共边。
- `province-labels.json`：每个省区的标签经纬度与相同投影的像素位置。
- `context-land.geojson`：完整视窗的自然陆地背景，包括西北高原、东北辽东、台湾与周边陆地；不是明朝国境。
- `rivers.geojson`：长江、黄河及主要支流水系。对黄河下游采用明代夺淮路线的示意线，删除现代渤海入海段。
- `mountain-anchors.json`：主要山脉位置锚点，作为绘画方向提示；不是实测山体边界。
- `geography-guide-1600x1000.png`：1600×1000 地理草图，可交给图片生成工具作为构图约束。浅褐色为陆地、浅线为省区、蓝线为河流、三角形表示山脉位置；三角形不是最终美术资产。
- `build_geography.py`：从保留在此目录的 Natural Earth 原始数据可重复构建上述文件。

## 投影

视窗：东经 91°—125.5°、北纬 17°—43.5°。SVG `viewBox="0 0 1600 1000"`。

```js
const x = (longitude - 91) / 34.5 * 1600;
const y = (43.5 - latitude) / 26.5 * 1000;
```

## 区域如何形成

底层多边形为 Natural Earth 现代省级区划，依据历史名称作概略合并。它提供可辨认且相互毗邻的真实地理外形，并不提供该年历史精确边界。

| 交互区域 | 现代形状代理与处理 |
| --- | --- |
| 北直隶 | 河北、北京、天津合并；北部概略收至 41.1°N，避免照搬今天承德向北的延伸；这条北界是人为示意，不是长城测绘线 |
| 南直隶 | 江苏、安徽、上海合并 |
| 陕西 | 陕西、甘肃、宁夏合并；西部依据视窗裁切 |
| 湖广 | 湖北、湖南合并 |
| 四川 | 四川、重庆合并，加今黔北遵义附近的一小块概略区域；遵义修正并非府界测绘 |
| 广东 | 广东、海南合并 |
| 贵州 | 贵州减去上述黔北概略块 |
| 山东、山西、河南、江西、浙江、福建、广西、云南 | 以同名现代省级外形作概略代理，未经逐县沿革重建 |

主图应称“形势示意”或“疆域示意”；不能将这些多边形标为明代精确行政边界。云南、四川西部、广西以及北方边区的历史实际范围与治理形式尤其不能从现代代理中推断。海岸线也采用现代概略形态，不重建 16 世纪三角洲与海岸进退。

## 来源与依据

1. **实际使用的矢量数据：Natural Earth 1:10m Admin 1 — States, Provinces**。原始项目页面说明它是现代一级行政区域；本包只取其几何，不显示英文地名或现代国境。
   - https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/
   - https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson
2. **实际使用的河流中心线：Natural Earth `ne_10m_rivers_lake_centerlines`**。主干河流现代自然走势作粗略地理依据；黄河下游按下列史料单独重画。
   - https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_lake_centerlines.geojson
3. **Natural Earth 授权**：官方声明所有版本矢量和栅格为 public domain，可修改与分发；本项目保留来源以便追溯。
   - https://www.naturalearthdata.com/about/terms-of-use/
4. **黄河明代下游方向**：淮安市政协文史叙述明中叶黄河全流夺淮、徐州—淮安—清口—云梯关河工。由此采用经徐州、淮阴向黄海的概略线，而非今日山东渤海河口。线的每个顶点是本次绘图示意，不是该来源提供的 GIS 测绘点。
   - https://zx.huaian.gov.cn/col/14069_277241/art/17197632/1719972993885VywoCUKL.html
   - https://zx.huaian.gov.cn/col/14069_277241/art/17119008/1714288500494dlZ5lWhk.html
5. **历史湖广范围依据**：湖北省委外事办历史沿革与湖南省政府湖南概况，支持明代湖广以及清初鄂湘分治这一合并方向。
   - https://www.fohb.gov.cn/info/2023-05/20230510091200_246.html
   - https://hunan.gov.cn/hnszf/jxxx/hngk/hngk.html
6. **贵州并非始终等同现代范围**：贵州省投资促进局记载 1413 年建省，清雍正年间基本形成现有省域。本包的黔北修正仅是概略提醒。
   - https://invest.guizhou.gov.cn/tzgz/tzgk/gzys/gzgk/201601/t20160105_10996273.html
7. **已调查但未使用其几何的历史专业资料：Harvard/Fudan CHGIS**。它有 1820、1911 全国时间切片和历代时序行政信息；其官方介绍不等于可以取得一套现成的 1582 省界。没有把 CHGIS 宣称为本包的实际几何来源。
   - https://gis.harvard.edu/china-historical-gis
   - https://chgis.fas.harvard.edu/pages/history/

## 图像生成使用说明

用用户第三张图决定手绘古卷山水风格，用本包 PNG 决定大陆海岸与主要山川位置。保持北上南下与当前视窗比例。不要把现代中国完整轮廓当明朝轮廓；不要增加英文地名、经纬网或英文图例。省界交给 SVG 交互层绘制，图片中的省线应淡化或消除。将三角山符替换为有层次的手绘山脉；山地集中在西部高原、横断、秦岭、太行及东南丘陵，华北平原、长江中下游平原留相对开阔地。
