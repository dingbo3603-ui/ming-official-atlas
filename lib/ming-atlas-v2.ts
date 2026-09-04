export type ProvinceHotspot = {
  id: string;
  name: string;
  shortName: string;
  capital: string;
  x: number;
  y: number;
  accent: 'gold' | 'cinnabar' | 'jade' | 'blue';
  note: string;
};

export type GeographyCounty = {
  id: string;
  name: string;
  kind: '县' | '州治' | '卫所' | '其他';
  seat?: boolean;
  note?: string;
};

export type GeographySubprefecture = {
  id: string;
  name: string;
  kind: '散州' | '属州';
  counties: GeographyCounty[];
};

export type GeographyPrefecture = {
  id: string;
  name: string;
  kind: '府' | '直隶州' | '军民府' | '都司' | '其他';
  seat?: string;
  directCounties: GeographyCounty[];
  subprefectures: GeographySubprefecture[];
  note?: string;
};

export type GeographyProvince = {
  id: string;
  name: string;
  shortName: string;
  capital: string;
  period: string;
  prefectures: GeographyPrefecture[];
  sourceUrls?: string[];
  coverageNote?: string;
};

export type GeographyData = {
  metadata: {
    title: string;
    period: string;
    scopeNote: string;
    provinceCount: number;
    prefectureCount: number;
    countyCount: number;
    generatedAt?: string;
  };
  provinces: GeographyProvince[];
  sources: Array<{ title: string; url: string; supports: string }>;
};

export type CapitalEra = 'hongwu' | 'late-ming';

export type CapitalInstitution = {
  id: string;
  name: string;
  shortName?: string;
  era: CapitalEra | 'both';
  zone: 'palace' | 'east' | 'west' | 'axis' | 'inner';
  function: string;
  positionHint: string;
  caveat?: string;
  keywords: string[];
};

export const provinceHotspots: ProvinceHotspot[] = [
  { id: 'beizhili', name: '北直隶', shortName: '京师', capital: '顺天府', x: 69, y: 27, accent: 'cinnabar', note: '永乐迁都后为京师直辖区域' },
  { id: 'nanzhili', name: '南直隶', shortName: '南京', capital: '应天府', x: 76, y: 55, accent: 'cinnabar', note: '以南京应天府为中心的直辖区域' },
  { id: 'shandong', name: '山东承宣布政使司', shortName: '山东', capital: '济南府', x: 79, y: 40, accent: 'gold', note: '辽东都司另属军事体系' },
  { id: 'shanxi', name: '山西承宣布政使司', shortName: '山西', capital: '太原府', x: 59, y: 35, accent: 'gold', note: '北部与九边重镇相接' },
  { id: 'henan', name: '河南承宣布政使司', shortName: '河南', capital: '开封府', x: 66, y: 46, accent: 'jade', note: '中原府州密集区域' },
  { id: 'shaanxi', name: '陕西承宣布政使司', shortName: '陕西', capital: '西安府', x: 46, y: 43, accent: 'gold', note: '辖今陕、甘东部及宁夏一带' },
  { id: 'sichuan', name: '四川承宣布政使司', shortName: '四川', capital: '成都府', x: 43, y: 61, accent: 'jade', note: '西南军民府与土司分布较多' },
  { id: 'huguang', name: '湖广承宣布政使司', shortName: '湖广', capital: '武昌府', x: 62, y: 66, accent: 'blue', note: '大体涵盖今湖北、湖南' },
  { id: 'jiangxi', name: '江西承宣布政使司', shortName: '江西', capital: '南昌府', x: 76, y: 68, accent: 'gold', note: '府县体系较稳定' },
  { id: 'zhejiang', name: '浙江承宣布政使司', shortName: '浙江', capital: '杭州府', x: 88, y: 61, accent: 'blue', note: '东南沿海布政使司' },
  { id: 'fujian', name: '福建承宣布政使司', shortName: '福建', capital: '福州府', x: 87, y: 74, accent: 'blue', note: '沿海卫所与市舶事务并存' },
  { id: 'guangdong', name: '广东承宣布政使司', shortName: '广东', capital: '广州府', x: 73, y: 84, accent: 'cinnabar', note: '广州府及沿海府州' },
  { id: 'guangxi', name: '广西承宣布政使司', shortName: '广西', capital: '桂林府', x: 58, y: 84, accent: 'jade', note: '土州、土县与流官区并置' },
  { id: 'guizhou', name: '贵州承宣布政使司', shortName: '贵州', capital: '贵阳府', x: 51, y: 75, accent: 'blue', note: '永乐十一年设置，军民府与宣慰司并见' },
  { id: 'yunnan', name: '云南承宣布政使司', shortName: '云南', capital: '云南府', x: 39, y: 84, accent: 'cinnabar', note: '府、军民府、宣慰司层级复杂' },
];

export const capitalInstitutions: CapitalInstitution[] = [
  {
    id: 'emperor', name: '皇帝', era: 'both', zone: 'inner',
    function: '最高决策者；明太祖废丞相后，六部等中央机构直接承旨。',
    positionHint: '宫城中轴北端，以御座表示最高决策节点。',
    keywords: ['皇帝', '宗人府', '三公', '三孤'],
  },
  {
    id: 'central-secretariat', name: '中书省', era: 'hongwu', zone: 'axis',
    function: '洪武十三年以前的最高行政中枢，置左右丞相并统六部。',
    positionHint: '洪武前期制度图的中央节点；此时都城为南京。',
    caveat: '洪武十三年（1380）罢中书省。它与永乐后成熟内阁不应作为同一时点的并列机构。',
    keywords: ['中书省', '丞相', '平章政事', '参知政事'],
  },
  {
    id: 'cabinet', name: '内阁', era: 'late-ming', zone: 'palace',
    function: '成祖以后逐渐形成的皇帝咨询与票拟机构；并非法定宰相机关。',
    positionHint: '以文渊阁为制度锚点，置于宫城前朝东侧。',
    caveat: '内阁权力、大学士兼衔与首辅地位随时代变化。',
    keywords: ['内阁', '大学士', '文渊阁', '制敕房', '诰敕房'],
  },
  {
    id: 'ministry-personnel', name: '吏部', era: 'both', zone: 'east',
    function: '掌文官铨选、考课、封授与黜陟。', positionHint: '北京千步廊东侧文官衙署区。',
    keywords: ['吏部'],
  },
  {
    id: 'ministry-revenue', name: '户部', era: 'both', zone: 'east',
    function: '掌户籍、田赋、财政与仓储。', positionHint: '北京千步廊东侧文官衙署区。',
    keywords: ['户部'],
  },
  {
    id: 'ministry-rites', name: '礼部', era: 'both', zone: 'east',
    function: '掌典礼、学校、科举、祭祀与宾客。', positionHint: '北京千步廊东侧文官衙署区。',
    keywords: ['礼部'],
  },
  {
    id: 'ministry-war', name: '兵部', era: 'both', zone: 'east',
    function: '掌武官选授、军令、舆图、驿传与武备。', positionHint: '北京千步廊东侧文官衙署区。',
    keywords: ['兵部'],
  },
  {
    id: 'ministry-justice', name: '刑部', era: 'both', zone: 'west',
    function: '掌刑名政令与复核，全国司法体系的重要中枢。', positionHint: '北京皇城以西的三法司官署宽区。',
    keywords: ['刑部'],
  },
  {
    id: 'ministry-works', name: '工部', era: 'both', zone: 'east',
    function: '掌营造、河工、器用、屯田与陵寝供亿。', positionHint: '北京千步廊东侧文官衙署区。',
    keywords: ['工部'],
  },
  {
    id: 'censorate', name: '都察院', era: 'both', zone: 'west',
    function: '掌监察、弹劾与巡按。', positionHint: '北京皇城以西的三法司官署宽区；置院年份有洪武十四、十五年两说。',
    keywords: ['都察院', '御史'],
  },
  {
    id: 'grand-court', name: '大理寺', era: 'both', zone: 'west',
    function: '掌刑狱复核，与刑部、都察院合称三法司。', positionHint: '列入西侧司法官署组。',
    keywords: ['大理寺'],
  },
  {
    id: 'transmission-office', name: '通政使司', era: 'late-ming', zone: 'west',
    function: '掌受内外章疏、封驳与通达政令。', positionHint: '北京宫门外千步廊西侧官署宽区。',
    keywords: ['通政使司', '通政司'],
  },
  {
    id: 'five-commissions', name: '五军都督府', era: 'both', zone: 'west',
    function: '中、左、右、前、后五府分掌军籍与卫所。', positionHint: '北京大明门外西侧武官衙署区。',
    keywords: ['五军都督府', '都督府', '都督'],
  },
  {
    id: 'jinyiwei', name: '锦衣卫', era: 'late-ming', zone: 'west',
    function: '亲军卫之一，兼具侍卫、仪仗与特定时期的侦缉职能。', positionHint: '列入西侧武职官署组。',
    keywords: ['锦衣卫'],
  },
  {
    id: 'hanlin', name: '翰林院', era: 'late-ming', zone: 'east',
    function: '掌制诰、史册、经筵等文翰事务，也是内阁大学士的重要来源。', positionHint: '列入东侧文教官署组。',
    keywords: ['翰林院', '翰林'],
  },
];

export const palaceAxis = [
  { ming: '大明门', later: '清大清门', kind: '皇城外郛南端' },
  { ming: '承天门', later: '今天安门', kind: '皇城正门轴线' },
  { ming: '端门', later: '端门', kind: '礼仪门序' },
  { ming: '午门', later: '午门', kind: '紫禁城正门' },
  { ming: '皇极门', later: '今太和门', kind: '外朝门' },
  { ming: '皇极殿', later: '今太和殿', kind: '大朝典礼' },
  { ming: '中极殿', later: '今中和殿', kind: '三殿中殿' },
  { ming: '建极殿', later: '今保和殿', kind: '三殿后殿' },
  { ming: '乾清宫', later: '乾清宫', kind: '内廷政务与寝宫' },
  { ming: '坤宁宫', later: '坤宁宫', kind: '明代皇后正宫' },
];

export const avatarPaths = {
  emperor: '/characters-v2/emperor.webp',
  grandSecretary: '/characters-v2/grand-secretary.webp',
  civil: '/characters-v2/civil-official.webp',
  military: '/characters-v2/military-official.webp',
  prefect: '/characters-v2/prefect.webp',
  magistrate: '/characters-v2/magistrate.webp',
  eunuch: '/characters-v2/eunuch.webp',
  native: '/characters-v2/native-chieftain.webp',
} as const;

export function avatarForOfficial(title: string, institution = '', department = ''): string {
  const text = `${title} ${institution} ${department}`;
  if (/皇帝|天子/.test(text)) return avatarPaths.emperor;
  if (/太监|宦官|内官|司礼监|御马监|尚膳监|尚宝监|十二监|四司|八局/.test(text)) return avatarPaths.eunuch;
  if (/土官|土司|宣慰司|宣抚司|安抚司|招讨司|长官司|土州|土县|羁縻/.test(text)) return avatarPaths.native;
  if (/都督|都指挥|指挥使|锦衣卫|千户|百户|总兵|副总兵|参将|游击|守备|兵马|卫所|武官/.test(text)) return avatarPaths.military;
  if (/知县|县丞|典史|县主簿|训导|教谕/.test(text)) return avatarPaths.magistrate;
  if (/知府|府同知|通判|推官|布政使|按察使|巡抚|总督/.test(text)) return avatarPaths.prefect;
  if (/大学士|首辅|三公|三孤|尚书|宗人令/.test(text)) return avatarPaths.grandSecretary;
  return avatarPaths.civil;
}

export const wikipediaSources = [
  { title: '用户底稿：明代官制官衔（KDocs）', url: 'https://www.kdocs.cn/l/cgarDuS0k0o4' },
  { title: '明朝行政区划', url: 'https://zh.wikipedia.org/wiki/明朝行政區劃' },
  { title: '《明史》卷四十起：地理志', url: 'https://zh.wikisource.org/wiki/明史/卷40' },
  { title: '明朝内阁', url: 'https://zh.wikipedia.org/wiki/明朝内阁' },
  { title: '明朝官职表', url: 'https://zh.wikipedia.org/wiki/明朝官職表' },
  { title: '《明史》卷七十二：职官志', url: 'https://zh.wikisource.org/zh-hans/明史_(四庫全書本)/卷072' },
  { title: '《明史》卷七十五：地方职官与儒学', url: 'https://zh.wikisource.org/zh-hans/明史_(四庫全書本)/卷075' },
  { title: '故宫博物院：中书省', url: 'https://www.dpm.org.cn/court/system/236406.html' },
  { title: '北京皇城', url: 'https://zh.wikipedia.org/wiki/北京皇城' },
  { title: '故宫博物院：明代紫禁城前朝与后廷', url: 'https://www.dpm.org.cn/Uploads/File/2019/11/25/u5ddbaf1de828c.pdf' },
  { title: '故宫博物院：明代内阁研究', url: 'https://www.dpm.org.cn/Uploads/File/pdf/4b/64/f3/4b64f345cf5f656b625bc4a00c1b7858.pdf' },
  { title: '故宫博物院：北京中央官署复原图研究', url: 'https://www.dpm.org.cn/Uploads/File/2024/07/22/u669dd3cf8e5fa.pdf' },
  { title: 'Wikimedia Commons：Ming China 1580 AD', url: 'https://commons.wikimedia.org/wiki/File:Ming_China_1580_AD.jpg' },
];
