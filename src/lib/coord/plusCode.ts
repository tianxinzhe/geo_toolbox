/**
 * Open Location Code（Plus Codes）编解码。
 *
 * 规格与参考实现：https://github.com/google/open-location-code
 *
 * 设计取舍：
 *   ① **字母表刻意去掉易混淆字符**：20 个字符里没有 I、L、O、U，
 *      也没有 0、1，人工抄录或电话报读时不容易出错。
 *   ② **只接受完整编码**：短码（如 `9G8F+6W`）必须配合参考地点才能解码，
 *      本站没有地理编码服务，不做猜测，直接给出明确错误而不是错误坐标。
 *   ③ **解码返回区域中心与边界**：编码描述的是一块矩形区域，中心点是
 *      最常用的展示值，但边界必须一并返回，避免把中心点当成精确坐标。
 *   ④ 不做投影、不依赖第三方库，全部是纯函数，便于单测。
 */

/** OLC 字母表：20 个字符，去掉了 I、L、O、U */
export const OLC_ALPHABET = '23456789CFGHJMPQRVWX'

const SEPARATOR = '+'

/** 前 5 对字符的网格边长（度）。第 9、10 个字符属于第 5 对 */
const PAIR_RESOLUTIONS = [20, 1, 0.05, 0.0025, 0.000125] as const

/** 第 11 个字符把第 5 对再分成 5 行 × 4 列 */
const GRID_ROWS = 5
const GRID_COLUMNS = 4
const GRID_LAT_SPAN = PAIR_RESOLUTIONS[4] / GRID_ROWS
const GRID_LNG_SPAN = PAIR_RESOLUTIONS[4] / GRID_COLUMNS

/** 界面只提供 10 位（约 14 m）与 11 位（约 3 m）两种完整编码 */
export type PlusCodeLength = 10 | 11

/** 每种长度的格子边长（度），用于界面提示地面尺寸 */
export const PLUS_CODE_SPANS: Record<PlusCodeLength, { lat: number; lng: number }> = {
  10: { lat: PAIR_RESOLUTIONS[4], lng: PAIR_RESOLUTIONS[4] },
  11: { lat: GRID_LAT_SPAN, lng: GRID_LNG_SPAN }
}

export interface PlusCodeArea {
  code: string
  /** 编码区域的西南角 */
  south: number
  west: number
  /** 编码区域的东北角 */
  north: number
  east: number
  /** 区域中心，界面展示与复制用 */
  lat: number
  lng: number
  /** 纬度、经度方向的格子边长（度） */
  latSpan: number
  lngSpan: number
}

export type PlusCodeErrorReason =
  | 'empty'
  | 'missing-separator'
  | 'short-code'
  | 'invalid-length'
  | 'invalid-char'

export interface PlusCodeError {
  ok: false
  reason: PlusCodeErrorReason
  /** 非法字符在去掉「+」之后的序号（从 0 开始） */
  position?: number
}

export type PlusCodeDecodeResult = ({ ok: true } & PlusCodeArea) | PlusCodeError

function clipLat(lat: number): number {
  return Math.min(90, Math.max(-90, lat))
}

/** 与参考实现一致：把经度折回 [-180, 180] */
function normalizeLng(lng: number): number {
  let value = lng % 360
  if (value < -180) value += 360
  else if (value > 180) value -= 360
  return value
}

/**
 * 把经纬度编码成完整 Plus Code。
 *
 * `length = 10` 得到 `XXXX+XX`（约 14 m 见方），
 * `length = 11` 再多一位精度（约 3 m 见方）。
 */
export function encodePlusCode(lat: number, lng: number, length: PlusCodeLength = 10): string {
  let latValue = clipLat(lat) + 90
  let lngValue = normalizeLng(lng) + 180
  let digits = ''

  for (const resolution of PAIR_RESOLUTIONS) {
    const latDigit = Math.floor(latValue / resolution)
    latValue -= latDigit * resolution
    const lngDigit = Math.floor(lngValue / resolution)
    lngValue -= lngDigit * resolution
    digits += OLC_ALPHABET[latDigit] + OLC_ALPHABET[lngDigit]
  }

  const head = digits.slice(0, 8)
  const grid = digits.slice(8)

  if (length === 10) return `${head}${SEPARATOR}${grid}`

  // 第 11 位：5 行 × 4 列的细分，一个字符同时表示行与列
  const row = Math.floor(latValue / GRID_LAT_SPAN)
  const col = Math.floor(lngValue / GRID_LNG_SPAN)
  return `${head}${SEPARATOR}${grid}${OLC_ALPHABET[row * GRID_COLUMNS + col]}`
}

/**
 * 解码完整 Plus Code。
 *
 * 短码（「+」之前不足 8 个字符）需要参考地点，本函数明确拒绝，
 * 让界面提示用户输入完整编码，而不是返回一个可能相差几十公里的坐标。
 */
export function decodePlusCode(raw: string): PlusCodeDecodeResult {
  const input = raw.trim().toUpperCase().replace(/\s+/g, '')
  if (input === '') return { ok: false, reason: 'empty' }

  const separatorAt = input.indexOf(SEPARATOR)
  if (separatorAt < 0) return { ok: false, reason: 'missing-separator' }
  if (separatorAt !== 8) {
    return { ok: false, reason: separatorAt < 8 ? 'short-code' : 'invalid-length' }
  }
  if (input.indexOf(SEPARATOR, separatorAt + 1) >= 0) {
    return { ok: false, reason: 'invalid-char' }
  }

  const body = input.replace(SEPARATOR, '')
  if (body.length !== 10 && body.length !== 11) {
    return { ok: false, reason: 'invalid-length' }
  }

  for (let i = 0; i < body.length; i += 1) {
    if (!OLC_ALPHABET.includes(body[i])) {
      return { ok: false, reason: 'invalid-char', position: i }
    }
  }

  // 前 5 对：每一对同时给出纬度与经度字符
  let lat = -90
  let lng = -180
  for (let i = 0; i < PAIR_RESOLUTIONS.length; i += 1) {
    const resolution = PAIR_RESOLUTIONS[i]
    lat += OLC_ALPHABET.indexOf(body[i * 2]) * resolution
    lng += OLC_ALPHABET.indexOf(body[i * 2 + 1]) * resolution
  }

  let latSpan: number = PAIR_RESOLUTIONS[4]
  let lngSpan: number = PAIR_RESOLUTIONS[4]

  if (body.length === 11) {
    const index = OLC_ALPHABET.indexOf(body[10])
    const row = Math.floor(index / GRID_COLUMNS)
    const col = index % GRID_COLUMNS
    lat += row * GRID_LAT_SPAN
    lng += col * GRID_LNG_SPAN
    latSpan = GRID_LAT_SPAN
    lngSpan = GRID_LNG_SPAN
  }

  return {
    ok: true,
    code: input,
    south: lat,
    west: lng,
    north: lat + latSpan,
    east: lng + lngSpan,
    lat: lat + latSpan / 2,
    lng: lng + lngSpan / 2,
    latSpan,
    lngSpan
  }
}