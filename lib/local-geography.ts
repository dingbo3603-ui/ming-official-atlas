import type { GeographyPrefecture, GeographyProvince } from './ming-atlas-v2';

/** Preserve the reviewed classification where the base directory says "other". */
export function prefectureKind(province: GeographyProvince, prefecture: GeographyPrefecture) {
  return province.id === 'guizhou' && ['安顺州','镇宁州','永宁州','普安州'].includes(prefecture.name)
    ? '羁縻直隶州' : prefecture.kind;
}
