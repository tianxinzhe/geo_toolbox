/**
 * 工具元数据 —— 一份数据同时驱动五处（技术方案 6.3）
 *
 *   ① 首页卡片索引（FR-01）
 *   ② 站内搜索索引（FR-02）
 *   ③ 面包屑与相关工具（FR-03）
 *   ④ <title> / <meta description> / canonical
 *   ⑤ JSON-LD 的 SoftwareApplication.name
 *
 * **不存在第二份需要同步的清单。** 新增工具只需在此追加一项 +
 * 加 lib/ 函数 + 加 components/tools/X.vue + 加 i18n/content/tools/x/*.md。
 *
 * slug 三语言共用同一套英文标识（PRD 4「slug 不翻译的理由」）。
 */

import type { Lang } from '../config/i18n'

/** 分类 ID，三语言共用 */
export const CATEGORIES = ['coordinate', 'format', 'encoding', 'map'] as const

export type CategoryKey = (typeof CATEGORIES)[number]

/** 分类显示名与一句话说明 */
export const CATEGORY_META: Record<CategoryKey, { names: Record<Lang, string>; desc: Record<Lang, string> }> = {
  coordinate: {
    names: { zh: '坐标与转换', en: 'Coordinates & Conversion' },
    desc: {
      zh: '经纬度写法转换，以及基准面与投影坐标的换算',
      en: 'Coordinate notation, datum and projection conversions'
    }
  },
  format: {
    names: { zh: '数据格式', en: 'Data Formats' },
    desc: {
      zh: 'GeoJSON、KML、GPX、TopoJSON、WKT、CSV 等矢量格式的解析与互转，说明各自的字段结构、坐标顺序与转换时容易丢失的信息，全部在浏览器本地处理。',
      en: 'Parse and convert GeoJSON, KML, GPX, TopoJSON and WKT'
    }
  },
  encoding: {
    names: { zh: '空间编码', en: 'Spatial Encoding' },
    desc: {
      zh: '把坐标压缩成短字符串，便于索引、分享与口述。说明 GeoHash 与 Plus Codes 的原理、精度分级、适用场景与常见误区，全部在浏览器本地计算。',
      en: 'Compress coordinates into short indexable strings'
    }
  },
  map: {
    names: { zh: '地图与可视化', en: 'Map & Visualization' },
    desc: {
      zh: '在地图上绘制要素、生成缓冲区与 XYZ 瓦片坐标，并导出 GeoJSON、KML 等格式。说明画图、量算与瓦片编号的常见问题，全部在浏览器本地完成。',
      en: 'Draw features on a map, generate buffers and XYZ tile coordinates'
    }
  }
}

export interface ToolMeta {
  /** 内部编号，如 'T01'。用于组件分发与分享参数表，不在页面上展示 */
  id: string
  /** URL 标识，三语言共用，全小写连字符 */
  slug: string
  /** 分类归属 */
  category: CategoryKey
  /** FR-06 地图启用范围：none 不启用 / optional 默认折叠的拾取器 / primary 地图即工具本体 */
  map: 'none' | 'optional' | 'primary'
  /** FR-07 是否走文件处理状态机 */
  fileIO: boolean
  /** FR-13 是否接入批量文件管线（6 个工具） */
  batch: boolean
  /** FR-11 移动适配分级：A 移动优先 / B 双端对等 / C 桌面为主 */
  mobileTier: 'A' | 'B' | 'C'
  /** FR-12 是否有 GPS 定位入口（只在移动端显示） */
  gps: boolean
  /** 工具名，用于 H1、卡片、导航、JSON-LD */
  names: Record<Lang, string>
  /** 一句话用途说明，≤24 字（FR-01 卡片内容要求） */
  desc: Record<Lang, string>
  /**
   * 搜索关键词（FR-02 匹配范围）
   * all：跨语言通用英文术语（geojson / wgs84 / utm / geohash）
   * 各语言：该语言下的别名与俗称（如「度分秒」）
   */
  keywords: { all: string[] } & Partial<Record<Lang, string[]>>
  /** 相关工具 slug，8~12 个，至少含 2 个跨分类工具，不含自身（FR-03） */
  related: string[]
}

export const TOOLS: ToolMeta[] = [
  {
    id: 'T02',
    slug: 'dms-decimal',
    category: 'coordinate',
    map: 'optional',
    fileIO: false,
    batch: true,
    mobileTier: 'B',
    gps: false,
    names: { zh: '经纬度格式转换', en: 'DMS ↔ Decimal Degrees' },
    desc: {
      zh: '度分秒和十进制度互相换算',
      en: 'Convert DMS and decimal degrees both ways'
    },
    keywords: {
      all: ['dms', 'decimal', 'degrees', 'minutes', 'seconds', 'lat', 'lon'],
      zh: ['度分秒', '十进制', '经纬度', '分秒', '角度', '格式'],
    },
    related: [
      'epsg-convert',
      'geohash',
      'map-preview',
      'tile-coords',
      'map-draw',
      'format-convert',
      'buffer-circle',
      'clip-overlay'
    ]
  },
  {
    id: 'T03',
    slug: 'epsg-convert',
    category: 'coordinate',
    map: 'optional',
    fileIO: false,
    batch: true,
    mobileTier: 'C',
    gps: false,
    names: { zh: '投影坐标转换（EPSG）', en: 'Projected CRS Converter (EPSG)' },
    desc: {
      zh: '输入 EPSG 代码，在两个坐标系间换算',
      en: 'Convert between any two EPSG coordinate systems'
    },
    keywords: {
      all: ['epsg', 'utm', 'crs', 'srs', 'projection', 'proj4', 'wgs84', 'cgcs2000'],
      zh: ['高斯克吕格', '投影带', '西安80', '北京54', '国家2000', '中央子午线']
    },
    related: [
      'dms-decimal',
      'map-preview',
      'geohash',
      'format-convert',
      'map-draw',
      'tile-coords',
      'buffer-circle',
      'clip-overlay'
    ]
  },
  {
    id: 'T06',
    slug: 'format-convert',
    category: 'format',
    map: 'none',
    fileIO: true,
    batch: false,
    mobileTier: 'C',
    gps: false,
    names: { zh: '矢量格式转换', en: 'Vector Format Converter' },
    desc: {
      zh: '十余种格式互转：GeoJSON、KML、GPX、Shapefile、GeoPackage、FlatGeobuf、CSV、Excel、WKT',
      en: 'Convert GeoJSON, KML, GPX, Shapefile, GeoPackage, FlatGeobuf, CSV, Excel, WKT and more'
    },
    keywords: {
      all: ['geojson', 'kml', 'kmz', 'gpx', 'topojson', 'wkt', 'well-known text', 'shapefile', 'flatgeobuf', 'fgb', 'gpkg', 'geopackage', 'convert', 'vector'],
      zh: ['格式转换', '转', '导出', '奥维', '谷歌地球', '轨迹', '矢量', '几何', '多边形'],
    },
    related: [
      'map-draw',
      'map-preview',
      'buffer-circle',
      'epsg-convert',
      'geohash',
      'merge-layers',
      'dms-decimal',
      'tile-coords'
    ]
  },
  {
    id: 'T08',
    slug: 'geohash',
    category: 'encoding',
    map: 'none',
    fileIO: false,
    batch: true,
    mobileTier: 'C',
    gps: false,
    names: { zh: 'GeoHash 编解码', en: 'GeoHash Encode / Decode' },
    desc: {
      zh: '经纬度和 GeoHash 字符串互相转换',
      en: 'Encode coordinates as GeoHash, or decode one back'
    },
    keywords: {
      all: ['geohash', 'hash', 'encode', 'decode', 'prefix', 'spatial index'],
      zh: ['编码', '解码', '空间索引', '前缀', '网格', '精度'],
    },
    related: [
      'clip-overlay',
      'dms-decimal',
      'map-draw',
      'map-preview',
      'epsg-convert',
      'format-convert',
      'tile-coords',
      'buffer-circle'
    ]
  },
  {
    id: 'T09',
    slug: 'map-draw',
    category: 'map',
    map: 'primary',
    fileIO: true,
    batch: false,
    mobileTier: 'A',
    gps: true,
    names: { zh: '在线地图绘制器', en: 'Map Drawing Tool' },
    desc: {
      zh: '在地图上画点线面并导出矢量数据',
      en: 'Draw points, lines and polygons, then export'
    },
    keywords: {
      all: ['draw', 'polygon', 'polyline', 'marker', 'geojson', 'kml', 'vertex'],
      zh: ['绘制', '画', '勾画', '地块', '边界', '顶点', '面积', '导出'],
    },
    related: [
      'buffer-circle',
      'format-convert',
      'map-preview',
      'attribute-extract',
      'geohash',
      'tile-coords',
      'dms-decimal',
      'epsg-convert'
    ]
  },
  {
    id: 'T10',
    slug: 'buffer-circle',
    category: 'map',
    map: 'primary',
    fileIO: false,
    batch: false,
    mobileTier: 'A',
    gps: true,
    names: { zh: '等距圈与缓冲区', en: 'Buffer & Radius Circles' },
    desc: {
      zh: '生成指定半径的圆形与缓冲面',
      en: 'Generate radius circles and buffer polygons'
    },
    keywords: {
      all: ['buffer', 'circle', 'radius', 'isochrone', 'coverage', 'polygon', 'turf'],
      zh: ['缓冲区', '等距圈', '半径', '覆盖范围', '圆', '公里', '范围'],
    },
    related: [
      'map-draw',
      'map-preview',
      'format-convert',
      'clip-overlay',
      'tile-coords',
      'geohash',
      'dms-decimal',
      'epsg-convert'
    ]
  },
  {
    id: 'T14',
    slug: 'tile-coords',
    category: 'map',
    map: 'primary',
    fileIO: true,
    batch: false,
    mobileTier: 'B',
    gps: true,
    names: {
      zh: 'Google 瓦片坐标生成',
      en: 'Google Tile Coordinates'
    },
    desc: {
      zh: '框选或导入 GeoJSON，按层级导出 XYZ 瓦片 CSV',
      en: 'Export XYZ tile CSVs from a box or GeoJSON'
    },
    keywords: {
      all: ['tile', 'xyz', 'zxy', 'slippy map', 'google maps', 'web mercator', 'tms'],
      zh: ['瓦片', '切片', '缩放级别', '谷歌地图', '地图瓦片', '经纬度网格', '瓦片编号'],
    },
    related: [
      'map-draw',
      'buffer-circle',
      'clip-overlay',
      'epsg-convert',
      'map-preview',
      'format-convert',
      'geohash',
      'dms-decimal'
    ]
  },
  {
    id: 'T15',
    slug: 'map-preview',
    category: 'map',
    map: 'primary',
    fileIO: true,
    batch: false,
    mobileTier: 'B',
    gps: false,
    names: {
      zh: '地图速览',
      en: 'Map Preview'
    },
    desc: {
      zh: '把本地矢量数据叠加到地图上查看',
      en: 'Preview local vector data on a map'
    },
    keywords: {
      all: [
        'viewer',
        'preview',
        'map',
        'geojson',
        'kml',
        'gpx',
        'shapefile',
        'csv',
        'geopackage',
        'flatgeobuf'
      ],
      zh: ['地图速览', '查看数据', '数据查看', '导入数据', '矢量数据', '地图预览', '叠加显示', '格式识别'],
    },
    related: [
      'map-draw',
      'format-convert',
      'tile-coords',
      'merge-layers',
      'epsg-convert',
      'dms-decimal',
      'buffer-circle',
      'geohash'
    ]
  },
  {
    id: 'T16',
    slug: 'clip-overlay',
    category: 'map',
    map: 'primary',
    fileIO: true,
    batch: false,
    mobileTier: 'B',
    gps: false,
    names: {
      zh: '图层裁切与叠加',
      en: 'Clip & Overlay'
    },
    desc: {
      zh: '裁切、相交、擦除与几何简化',
      en: 'Clip, intersect, difference and simplify'
    },
    keywords: {
      all: [
        'clip',
        'intersect',
        'difference',
        'erase',
        'overlay',
        'simplify',
        'douglas-peucker',
        'qgis'
      ],
      zh: ['裁切', '裁剪', '相交', '擦除', '叠加', '叠加分析', '几何简化', '抽稀', '矢量叠加'],
    },
    related: [
      'map-draw',
      'map-preview',
      'format-convert',
      'buffer-circle',
      'attribute-extract',
      'tile-coords',
      'epsg-convert',
      'geohash'
    ]
  },
  {
    id: 'T17',
    slug: 'attribute-extract',
    category: 'map',
    map: 'primary',
    fileIO: true,
    batch: false,
    mobileTier: 'B',
    gps: false,
    names: {
      zh: '按属性提取要素',
      en: 'Extract by Attribute'
    },
    desc: {
      zh: '按字段条件筛选要素并导出 GeoJSON',
      en: 'Filter features by an attribute value'
    },
    keywords: {
      all: ['attribute', 'filter', 'query', 'extract', 'select', 'where', 'property'],
      zh: ['属性', '筛选', '过滤', '提取', '查询', '条件', '字段', '属性查询'],
    },
    related: [
      'clip-overlay',
      'map-preview',
      'format-convert',
      'map-draw',
      'dissolve',
      'geohash',
      'buffer-circle',
      'tile-coords'
    ]
  },
  {
    id: 'T18',
    slug: 'attribute-join',
    category: 'map',
    map: 'primary',
    fileIO: true,
    batch: false,
    mobileTier: 'B',
    gps: false,
    names: { zh: '属性连接', en: 'Attribute Join' },
    desc: {
      zh: '用字段把属性表连到矢量要素上',
      en: 'Join a table to features by a shared field'
    },
    keywords: {
      all: ['join', 'attribute', 'table', 'csv', 'excel', 'vlookup', 'property'],
      zh: ['属性连接', '连接', '属性表', '字段匹配', '表格', 'Excel'],
    },
    related: [
      'attribute-extract',
      'merge-layers',
      'dissolve',
      'map-preview',
      'format-convert',
      'clip-overlay',
      'epsg-convert',
      'map-draw'
    ]
  },
  {
    id: 'T19',
    slug: 'merge-layers',
    category: 'map',
    map: 'primary',
    fileIO: true,
    batch: false,
    mobileTier: 'B',
    gps: false,
    names: { zh: '合并图层', en: 'Merge Layers' },
    desc: {
      zh: '把多个矢量文件合并为一个图层',
      en: 'Merge several vector files into one layer'
    },
    keywords: {
      all: ['merge', 'append', 'combine', 'concat', 'layer', 'vector'],
      zh: ['合并图层', '合并', '追加', '拼接', '多文件', '图层'],
    },
    related: [
      'format-convert',
      'map-preview',
      'attribute-join',
      'dissolve',
      'clip-overlay',
      'buffer-circle',
      'geohash',
      'map-draw'
    ]
  },
  {
    id: 'T20',
    slug: 'dissolve',
    category: 'map',
    map: 'primary',
    fileIO: true,
    batch: false,
    mobileTier: 'B',
    gps: false,
    names: { zh: '按字段融合', en: 'Dissolve by Field' },
    desc: {
      zh: '按字段值融合相邻要素',
      en: 'Dissolve features that share a field value'
    },
    keywords: {
      all: ['dissolve', 'aggregate', 'group', 'union', 'field', 'merge'],
      zh: ['按字段融合', '融合', '融合面', '分组', '聚合', '字段'],
    },
    related: [
      'attribute-join',
      'merge-layers',
      'clip-overlay',
      'epsg-convert',
      'attribute-extract',
      'map-preview',
      'format-convert',
      'map-draw'
    ]
  },
  {
    id: 'T21',
    slug: 'plus-codes',
    category: 'encoding',
    map: 'none',
    fileIO: false,
    batch: false,
    mobileTier: 'B',
    gps: false,
    names: {
      zh: 'Plus Codes 位置编码',
      en: 'Plus Codes (Open Location Code)'
    },
    desc: {
      zh: '经纬度和 Plus Code 互相转换，可离线计算',
      en: 'Coordinates ↔ Plus Code, offline'
    },
    keywords: {
      all: ['plus code', 'plus codes', 'open location code', 'olc', 'location code'],
      zh: ['加号编码', '位置编码', '地点编码', '开放位置编码', '短地址'],
    },
    related: [
      'geohash',
      'dms-decimal',
      'epsg-convert',
      'map-preview',
      'map-draw',
      'tile-coords',
      'format-convert',
      'buffer-circle'
    ]
  },
  {
    id: 'T22',
    slug: 'mvt',
    category: 'format',
    map: 'none',
    fileIO: true,
    batch: false,
    mobileTier: 'B',
    gps: false,
    names: {
      zh: 'MVT 矢量瓦片解析',
      en: 'MVT Vector Tile Decoder'
    },
    desc: {
      zh: '上传 PBF 或粘贴 Base64，解出图层与 GeoJSON',
      en: 'Decode PBF or Base64 tiles into GeoJSON'
    },
    keywords: {
      all: ['mvt', 'mapbox vector tile', 'vector tile', 'pbf', 'protobuf', 'tile'],
      zh: ['矢量瓦片', '瓦片解析', '矢量切片', '二进制瓦片', '瓦片解码'],
    },
    related: [
      'tile-coords',
      'format-convert',
      'geohash',
      'plus-codes',
      'map-preview',
      'map-draw',
      'buffer-circle',
      'attribute-extract'
    ]
  }
]

/** slug → 元数据 */
export const TOOL_BY_SLUG: ReadonlyMap<string, ToolMeta> = new Map(TOOLS.map((t) => [t.slug, t]))

/**
 * slug 不翻译（PRD 4），因此三语言共用。
 * 若将来某个 slug 变更，所有 hreflang / 分享链接 / 内链都会跟着变，
 * 这里做一次断言，防止手滑写出重复或空 slug。
 */
const _slugs = TOOLS.map((t) => t.slug)
if (new Set(_slugs).size !== _slugs.length) {
  throw new Error('TOOLS 中存在重复 slug')
}
for (const t of TOOLS) {
  for (const r of t.related) {
    if (!TOOL_BY_SLUG.has(r)) throw new Error(`${t.id} 的 related 引用了不存在的 slug: ${r}`)
    if (r === t.slug) throw new Error(`${t.id} 的 related 不得包含自身`)
  }
}

export function getTool(slug: string): ToolMeta | undefined {
  return TOOL_BY_SLUG.get(slug)
}

export function getToolsByCategory(cat: CategoryKey): ToolMeta[] {
  return TOOLS.filter((t) => t.category === cat)
}

/**
 * FR-02 搜索匹配范围：当前界面语言下的工具名、别名列表、一句话说明、分类名，
 * **外加**一组跨语言通用英文术语。匹配不区分大小写。
 *
 * 这里把全部可搜索字段拼成一个小写串，搜索时做 CJK 友好的子串匹配
 * （中日文无空格分词，必须用 includes 而不是按词切分）。
 */
export function buildSearchIndex(lang: Lang): Array<{ slug: string; id: string; name: string; haystack: string }> {
  return TOOLS.map((t) => {
    const parts = [
      t.id,
      t.slug,
      t.slug.replace(/-/g, ' '),
      t.names[lang],
      t.desc[lang],
      CATEGORY_META[t.category].names[lang],
      t.keywords.all.join(' '),
      (t.keywords[lang] ?? []).join(' ')
    ]
    return {
      slug: t.slug,
      id: t.id,
      name: t.names[lang],
      haystack: parts.join(' ').toLowerCase()
    }
  })
}
