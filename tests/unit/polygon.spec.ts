/**
 * 球面多边形面积与几何量测试（SR-03 / SR-02 / SR-03 / SR-04 / SR-12）
 *
 * 黄金值的来源，按可信度排序：
 *   ① **解析解**：球面三角形的 excess 有闭式面积。八分之一球（excess = π/2）
 *      与「极点 + 60° 经差」三角形（excess = π/3）能把球面面积实现锁死到
 *      机器精度 —— 任何「用平面鞋带公式吃经纬度」或「用球面梯形式近似」的
 *      实现都会在这两条上直接失败（前者差 cosφ 倍，后者差整整一倍）。
 *   ② **独立算法参考**：把每条边用 vincentyDirect 细分成几百段测地线子段，
 *      再对稠密环求面积。细分越密，「大圆弧代替测地线」的误差越小，
 *      其极限就是椭球真实面积。用它量化本实现的误差量级（SR-12 要求
 *      近似必须如实标注，标注的数字得有出处）。
 *   ③ **不变量**：绕向反转符号相反、跨 ±180° 与不跨的同形多边形面积相同、
 *      退化输入面积为 0 且不抛异常。
 *   ④ SR-04 的等值表（单位换算闭环），字面量直接抄自 PRD。
 */
import { describe, expect, it } from 'vitest'

import { DEFAULT_AREA_DIGITS, MAX_DIGITS } from '../../src/lib/coord/format'
import { distanceAndBearing, normalizeLng, vincentyDirect, WGS84_A } from '../../src/lib/geo/geodesy'
import {
  AREA_CSV_HEADER,
  areaCsv,
  areaDisplayDigits,
  AUTHALIC_RADIUS_M,
  authalicLatitude,
  dropClosingPoint,
  geodeticFromAuthalic,
  isSelfIntersecting,
  orientationOf,
  polygonCentroid,
  polygonPerimeter,
  polygonSummary,
  signedAreaM2,
  sinAuthalicLatitude,
  type PolyPoint
} from '../../src/lib/geo/polygon'
import { ALL_AREA_UNITS, AREA_TO_M2, convertArea } from '../../src/lib/geo/units'

/** 等积球半径的平方，解析解断言里反复用到 */
const R2 = AUTHALIC_RADIUS_M ** 2

const p = (lng: number, lat: number): PolyPoint => ({ lng, lat })

/**
 * 把每条边沿**椭球测地线**细分成 n 段，得到逼近真实边界的稠密环。
 *
 * 这是「独立算法参考」：vincentyDirect 走的是 geodesy.ts 的椭球正算，
 * 与 polygon.ts 的等积球面模型没有任何代码重叠，因此两者一致才有说服力。
 * n 越大，参考值越接近椭球真实面积（见下面的收敛断言）。
 */
function densify(ring: readonly PolyPoint[], n: number): PolyPoint[] {
  const out: PolyPoint[] = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const r = distanceAndBearing(a.lat, a.lng, b.lat, a.lng + normalizeLng(b.lng - a.lng))
    out.push(a)
    for (let k = 1; k < n; k++) {
      const s = vincentyDirect(a.lat, a.lng, r.initialBearing, (r.distance * k) / n)
      if (!s) throw new Error('vincentyDirect 未收敛：参考环构造失败')
      out.push(p(normalizeLng(s.lng), s.lat))
    }
  }
  return out
}

/** 相对误差，避免各处重复写除法与取绝对值 */
function rel(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.abs(expected)
}

/* ------------------------------------------------------------------ *
 * ① 等积球与等积纬度
 * ------------------------------------------------------------------ */

describe('等积球（authalic sphere）常量与等积纬度', () => {
  it('等积球半径 = a·√(q_p/2) ≈ 6371007.18 m，且与「平均半径」不是同一个量', () => {
    // 6371007.18 m 是 WGS84 的等积半径（保面积），
    // SR-03 里 Haversine 用的 6371008.8 m 是 IUGG 平均半径（保长度）。
    // 两者差 1.6 m：面积上用错会带来 5e-7 的系统偏差
    expect(AUTHALIC_RADIUS_M).toBeCloseTo(6371007.18, 2)
    expect(AUTHALIC_RADIUS_M).toBeLessThan(WGS84_A)
    expect(Math.abs(AUTHALIC_RADIUS_M - 6371008.8)).toBeGreaterThan(1)
  })

  it('等积纬度在赤道与两极是不动点，且 sinβ 在极点精确为 ±1', () => {
    expect(authalicLatitude(0)).toBe(0)
    expect(authalicLatitude(90)).toBe(90)
    expect(authalicLatitude(-90)).toBe(-90)
    expect(sinAuthalicLatitude(90)).toBe(1)
    // ⚠️ 这条断言锁的是一个真实的坑：q(−1) 与 −q(1) 在浮点上差一个 ULP，
    // 被 √(1−s²) 放大成 2e-8 的「cosβ」，极点会偏离真极点约 13 cm，
    // 八分之一球的相对精度当场从 1e-16 掉到 1e-9 量级
    expect(sinAuthalicLatitude(-90)).toBe(-1)
  })

  it('北半球 β < φ，最大偏差约 0.128°（出现在 45° 附近）', () => {
    expect(authalicLatitude(45)).toBeLessThan(45)
    expect(authalicLatitude(-45)).toBeGreaterThan(-45)

    let maxDiff = 0
    let at = 0
    for (let lat = -90; lat <= 90; lat += 0.25) {
      const d = Math.abs(authalicLatitude(lat) - lat)
      if (d > maxDiff) {
        maxDiff = d
        at = lat
      }
    }
    // 「把大地纬度直接当等积纬度用」会引入约 0.3% 的面积偏差，
    // 这个数量级就是它的来源
    expect(maxDiff).toBeGreaterThan(0.1)
    expect(maxDiff).toBeLessThan(0.2)
    expect(Math.abs(at)).toBeCloseTo(45, 0)
  })

  it('正变换与逆变换闭环（往返误差 < 1e-9 度，约 0.1 微米）', () => {
    for (let lat = -90; lat <= 90; lat += 0.5) {
      expect(geodeticFromAuthalic(authalicLatitude(lat))).toBeCloseTo(lat, 9)
    }
  })
})

/* ------------------------------------------------------------------ *
 * ② 解析解：球面 excess
 * ------------------------------------------------------------------ */

describe('球面多边形面积：解析解（球面 excess / Girard 定理）', () => {
  // 八分之一球三角形：三个内角都是 90°，excess = 270° − 180° = π/2
  const octant = [p(0, 0), p(0, 90), p(90, 0)]

  it('八分之一球：面积 = R²·π/2，相对误差 < 1e-9（实测量级 1e-16）', () => {
    const expected = (R2 * Math.PI) / 2
    const actual = Math.abs(signedAreaM2(octant))
    expect(rel(actual, expected)).toBeLessThan(1e-9)
    // 直接按 PRD 的写法核对：整球的 1/8
    expect(rel(actual, (4 * Math.PI * R2) / 8)).toBeLessThan(1e-9)
  })

  it('「极点 + 60° 经差」三角形：excess = 60°，面积 = R²·π/3', () => {
    // 内角：极点处 = 经差 60°，赤道上两处各 90° → excess = 240° − 180° = 60°
    const tri = [p(0, 0), p(0, 90), p(60, 0)]
    expect(rel(Math.abs(signedAreaM2(tri)), (R2 * Math.PI) / 3)).toBeLessThan(1e-9)
    // 与八分之一球的比例就是 excess 之比：60°/90° = 2/3
    expect(rel(Math.abs(signedAreaM2(tri)), (Math.abs(signedAreaM2(octant)) * 2) / 3)).toBeLessThan(
      1e-9
    )
  })

  it('面积与「起始经度」无关：整个三角形旋转 137° 后面积不变', () => {
    const rotated = octant.map((v) => p(normalizeLng(v.lng + 137), v.lat))
    expect(rel(Math.abs(signedAreaM2(rotated)), Math.abs(signedAreaM2(octant)))).toBeLessThan(1e-12)
  })

  it('关于赤道镜像：面积绝对值相等，**符号相反**（反射是反保向变换）', () => {
    // ⚠️ 容易搞反的一条：镜像是一次反射，反射把逆时针环变成顺时针环。
    // 所以「逐点取负纬度、顶点顺序不变」得到的环与原环**反号**。
    // 要让符号不变，得在镜像之外再反转一次顶点顺序（两次翻转相互抵消）——
    // 下面那条断言就是钉住这个区别的，谁「顺手」加了 reverse() 测试立刻红
    const north = signedAreaM2(octant) // (0,0)→(0,90)→(90,0)，实测为负（顺时针）
    const south = signedAreaM2([p(0, 0), p(0, -90), p(90, 0)])
    const southReversed = signedAreaM2([p(0, 0), p(90, 0), p(0, -90)])

    expect(rel(Math.abs(south), Math.abs(north))).toBeLessThan(1e-12)
    expect(Math.sign(south)).toBe(-Math.sign(north))
    expect(Math.sign(southReversed)).toBe(Math.sign(north))
  })
})

describe('符号约定：逆时针为正，顺时针为负', () => {
  // 在 (经度, 纬度) 平面上看是逆时针的方块
  const ccw = [p(116, 40), p(117, 40), p(117, 41), p(116, 41)]

  it('逆时针环面积为正，orientationOf 报 ccw', () => {
    expect(signedAreaM2(ccw)).toBeGreaterThan(0)
    expect(orientationOf(signedAreaM2(ccw))).toBe('ccw')
  })

  it('顶点顺序反转：符号相反，绝对值相等（相对差 < 1e-9）', () => {
    // SR-03 专属异常②依赖这条：面积为负 = 顺时针，UI 取绝对值显示并提示绕向
    const fwd = signedAreaM2(ccw)
    const rev = signedAreaM2([...ccw].reverse())
    expect(rev).toBeLessThan(0)
    expect(orientationOf(rev)).toBe('cw')
    expect(rel(Math.abs(rev), Math.abs(fwd))).toBeLessThan(1e-9)
  })

  it('零面积报 degenerate，不猜成逆时针', () => {
    expect(orientationOf(0)).toBe('degenerate')
    expect(polygonSummary([p(0, 0), p(1, 0), p(2, 0)]).orientation).toBe('degenerate')
  })
})

/* ------------------------------------------------------------------ *
 * ③ 误差量级：与测地线细分参考对比
 * ------------------------------------------------------------------ */

describe('面积误差量级（SR-12：近似必须如实标注，标注的数字要有出处）', () => {
  it('赤道 1°×1° 方块 ≈ 1.2309e10 m²，不是「平均半径球 + 大地纬度」的 1.2365e10', () => {
    const box = [p(0, 0), p(1, 0), p(1, 1), p(0, 1)]
    const area = Math.abs(signedAreaM2(box))

    expect(area).toBeGreaterThan(1.23e10)
    expect(area).toBeLessThan(1.232e10)

    // 🔑 这条对比是本文件最有价值的断言之一：
    // 用 R = 6371008.8 m 的球 + **大地纬度**直接套球面公式会得到 1.2365e10，
    // 比真实椭球面积大约 0.45% —— 一平方公里的地块差 4500 平方米，
    // 折成亩是 6.7 亩。等积纬度这一步就是专门消掉这个系统偏差的
    const naive = 6371008.8 ** 2 * (Math.PI / 180) * Math.sin(Math.PI / 180)
    expect(naive).toBeCloseTo(1.2365e10, -8)
    expect(rel(area, naive)).toBeGreaterThan(0.004)
  })

  it('与测地线细分参考一致：1° 方块相对误差 < 1e-6（实测 1.7e-7）', () => {
    const box = [p(0, 0), p(1, 0), p(1, 1), p(0, 1)]
    const coarse = Math.abs(signedAreaM2(box))

    const n200 = Math.abs(signedAreaM2(densify(box, 200)))
    const n800 = Math.abs(signedAreaM2(densify(box, 800)))
    // 参考值自身已经收敛（继续细分只改动 1e-11 量级），才有资格当尺子
    expect(rel(n800, n200)).toBeLessThan(1e-9)

    expect(rel(coarse, n800)).toBeLessThan(1e-6)
  })

  it('误差随边长平方增长：1 km 地块比 1° 方块准一个量级', () => {
    const parcel = [p(116.4, 40.0), p(116.4117, 40.0), p(116.4117, 40.009), p(116.4, 40.009)]
    const coarse = Math.abs(signedAreaM2(parcel))
    const reference = Math.abs(signedAreaM2(densify(parcel, 200)))
    // 实测 1.6e-8。1 km 地块上这就是 0.02 平方米/平方公里级的偏差
    expect(rel(coarse, reference)).toBeLessThan(1e-7)
    expect(coarse).toBeCloseTo(998355.68, 0)
  })

  it('省级尺度（10°×10°）误差仍在 1e-5 相对以内（实测 7e-6）', () => {
    const big = [p(100, 30), p(110, 30), p(110, 40), p(100, 40)]
    const coarse = Math.abs(signedAreaM2(big))
    const reference = Math.abs(signedAreaM2(densify(big, 60)))
    expect(rel(coarse, reference)).toBeLessThan(1e-5)
  })
})

/* ------------------------------------------------------------------ *
 * ④ 跨 ±180° 经线
 * ------------------------------------------------------------------ */

describe('跨 ±180° 经线', () => {
  // 两个方块形状完全相同（2°×2°、同在赤道上），只是一个跨过日期变更线
  const cross = [p(179, 0), p(-179, 0), p(-179, 2), p(179, 2)]
  const plain = [p(-1, 0), p(1, 0), p(1, 2), p(-1, 2)]

  it('跨经线的方块与同形不跨的方块面积相同（相对差 < 1e-9）', () => {
    expect(rel(Math.abs(signedAreaM2(cross)), Math.abs(signedAreaM2(plain)))).toBeLessThan(1e-9)
  })

  it('不会算成「整个球面减一小块」', () => {
    const wholeSphere = 4 * Math.PI * R2
    const area = Math.abs(signedAreaM2(cross))
    // 正确值约 4.92e10；漏掉经度归一化的实现会给出 5.1e14 − 4.9e10 ≈ 5.1e14
    expect(area).toBeLessThan(wholeSphere / 1000)
    expect(area).toBeGreaterThan(4.9e10)
  })

  it('周长也不会绕地球一圈：4 条边各约 222 km', () => {
    const { meters } = polygonPerimeter(cross)
    expect(meters).toBeGreaterThan(8.8e5)
    expect(meters).toBeLessThan(9e5)
    // 与不跨经线的同形方块一致
    expect(rel(meters, polygonPerimeter(plain).meters)).toBeLessThan(1e-6)
  })

  it('质心的经度落在 180° 附近，而不是被平均成 0°', () => {
    const c = polygonCentroid(cross)!
    expect(Math.abs(c.lng)).toBeGreaterThan(179.9)
  })
})

/* ------------------------------------------------------------------ *
 * ⑤ 退化输入：不抛异常，面积为 0
 * ------------------------------------------------------------------ */

describe('退化输入（SR-03：顶点不足 3 个 → 提示「无法构成面」，不是错误）', () => {
  it('空数组 / 1 个点 / 2 个点：面积 0，不抛异常', () => {
    expect(() => signedAreaM2([])).not.toThrow()
    expect(signedAreaM2([])).toBe(0)
    expect(signedAreaM2([p(116, 40)])).toBe(0)
    expect(signedAreaM2([p(116, 40), p(117, 41)])).toBe(0)
    expect(polygonSummary([p(116, 40), p(117, 41)]).vertexCount).toBe(2)
  })

  it('3 个共线点（同一纬线 / 同一经线）：面积精确为 0', () => {
    // 赤道与经线都是大圆，三点严格共大圆 → 立体角精确为 0
    expect(signedAreaM2([p(0, 0), p(1, 0), p(2, 0)])).toBe(0)
    expect(signedAreaM2([p(0, 0), p(0, 1), p(0, 2)])).toBe(0)
  })

  it('经纬度平面上的「对角线」3 点：面积不为 0，但远小于包围盒', () => {
    // ⚠️ 这条是刻意留的反直觉断言：(0,0)→(1,1)→(2,2) 在**平面**上共线，
    // 但在球面上大圆并不沿对角线走，三点不共大圆，因此围出一个很窄的月牙形。
    // 实现若在这里返回 0，说明它其实在偷偷做平面计算
    const area = Math.abs(signedAreaM2([p(0, 0), p(1, 1), p(2, 2)]))
    expect(area).toBeGreaterThan(0)
    expect(area).toBeLessThan(1e8) // 包围盒约 2.4e10，月牙只有它的两百万分之一
  })

  it('重复顶点（同一个点粘了两次）不产生面积，也不抛异常', () => {
    const dup = [p(116, 40), p(116, 40), p(117, 40), p(117, 41), p(116, 41)]
    const box = [p(116, 40), p(117, 40), p(117, 41), p(116, 41)]
    expect(rel(Math.abs(signedAreaM2(dup)), Math.abs(signedAreaM2(box)))).toBeLessThan(1e-9)
  })

  it('polygonSummary 对退化输入给出可用的兜底值而不是 null 崩溃', () => {
    const s = polygonSummary([p(0, 0), p(1, 0), p(2, 0)])
    expect(s.areaM2).toBe(0)
    expect(s.orientation).toBe('degenerate')
    expect(s.centroid).not.toBeNull()
    expect(s.perimeterM).toBeGreaterThan(0) // 退化环仍有一条来回的周长
  })

  it('polygonCentroid 空数组返回 null，不是 (0,0)', () => {
    // (0,0) 是几内亚湾一个真实存在的坐标，拿它当「无结果」会被误读
    expect(polygonCentroid([])).toBeNull()
    expect(polygonCentroid([p(116, 40)])).toEqual(p(116, 40))
  })
})

/* ------------------------------------------------------------------ *
 * ⑥ 自相交判定
 * ------------------------------------------------------------------ */

describe('自相交判定（SR-03 专属异常①）', () => {
  it('蝴蝶形（8 字）判为自相交', () => {
    // 顶点顺序让两条对角边交叉：(0,0)→(1,1)→(1,0)→(0,1)
    const butterfly = [p(0, 0), p(1, 1), p(1, 0), p(0, 1)]
    expect(isSelfIntersecting(butterfly)).toBe(true)
  })

  it('凸多边形判为不相交', () => {
    expect(isSelfIntersecting([p(116, 40), p(117, 40), p(117, 41), p(116, 41)])).toBe(false)
    // 正五边形
    const penta = Array.from({ length: 5 }, (_, i) => {
      const t = (i / 5) * 2 * Math.PI
      return p(116 + 0.1 * Math.cos(t), 40 + 0.1 * Math.sin(t))
    })
    expect(isSelfIntersecting(penta)).toBe(false)
  })

  it('凹多边形（L 形）不是自相交 —— 凹与自相交是两件事', () => {
    const lShape = [p(0, 0), p(2, 0), p(2, 1), p(1, 1), p(1, 2), p(0, 2)]
    expect(isSelfIntersecting(lShape)).toBe(false)
    expect(signedAreaM2(lShape)).not.toBe(0)
  })

  it('边数 <4 时直接判否（三角形在拓扑上不可能自相交）', () => {
    expect(isSelfIntersecting([p(0, 0), p(1, 1), p(1, 0)])).toBe(false)
    expect(isSelfIntersecting([])).toBe(false)
  })

  it('非相邻边只是**端点接触**也算自相交（边界回到了自己身上）', () => {
    // 沙漏形：顶点 (1,1) 出现两次，边界在该点自触但不穿越
    const hourglass = [p(0, 0), p(1, 1), p(2, 0), p(1, 1), p(2, 2), p(0, 2)]
    expect(isSelfIntersecting(hourglass)).toBe(true)
  })

  it('跨 ±180° 经线的正常方块不会被误判成自相交', () => {
    // 不解绕经度的话，(179 → −179) 这条边会在平面上横穿整个地球，
    // 与另外两条边各交叉一次
    const cross = [p(179, 0), p(-179, 0), p(-179, 2), p(179, 2)]
    expect(isSelfIntersecting(cross)).toBe(false)
  })
})

/* ------------------------------------------------------------------ *
 * ⑦ 周长
 * ------------------------------------------------------------------ */

describe('周长：逐边累加，走 geodesy 的椭球解算（SR-03）', () => {
  it('两点环 = 两点距离的 2 倍（去 + 回）', () => {
    const a = p(116.3974, 39.9088)
    const b = p(116.40364357, 39.91020348)
    const { meters } = polygonPerimeter([a, b])
    // 与 route.spec.ts 同源的黄金值：这两点相距 556.14 m（PRD 6.1 算例一）
    expect(meters).toBeCloseTo(556.14 * 2, 1)
  })

  it('闭合多边形 = 各边之和 + 回到起点那一边', () => {
    const box = [p(116, 40), p(117, 40), p(117, 41), p(116, 41)]
    let sum = 0
    for (let i = 0; i < box.length; i++) {
      const a = box[i]
      const b = box[(i + 1) % box.length]
      sum += distanceAndBearing(a.lat, a.lng, b.lat, b.lng).distance
    }
    expect(polygonPerimeter(box).meters).toBeCloseTo(sum, 6)
    // 四条边各约 85~111 km，合计约 39 万米
    expect(sum).toBeGreaterThan(3.9e5)
    expect(sum).toBeLessThan(4e5)
  })

  it('单点与空数组周长为 0，不抛异常', () => {
    expect(polygonPerimeter([]).meters).toBe(0)
    expect(polygonPerimeter([p(116, 40)]).meters).toBe(0)
  })

  it('椭球不收敛时如实报告 fellBack（SR-12：近似不得冒充精确）', () => {
    // 近对跖点的一段会让 Vincenty 不收敛 → geodesy 回退球面并标注 model
    // （(0,0) → (179.7,0.5) 这一组与 route.spec.ts 用的是同一个已知不收敛算例）
    const near = [p(0, 0), p(179.7, 0.5), p(0, 1)]
    expect(polygonPerimeter(near).fellBack).toBe(true)
    // 普通地块不会触发回退
    expect(polygonPerimeter([p(116, 40), p(117, 40), p(117, 41)]).fellBack).toBe(false)
  })
})

/* ------------------------------------------------------------------ *
 * ⑧ 质心
 * ------------------------------------------------------------------ */

describe('质心：等积柱面 (λ, sinβ) 平面上的面积质心', () => {
  it('八分之一球的闭式解：λ = 45°，sinβ = 1/2', () => {
    // 八分之一球在 (λ, sinβ) 平面上的像恰好是矩形 [0,π/2]×[0,1]
    // （极点被拉成 s = 1 那条边），矩形质心 = (π/4, 1/2)，
    // 反解回大地坐标就是 (45°, φ(β=30°))。这条断言同时验证了
    // 鞋带公式的系数、经度解绕、以及 sinβ → φ 的逆变换。
    //
    // ⚠️ 容差只给到 4 位小数（约 5 m）而不是 9 位：极点顶点是**退化**的 ——
    // 它在球面上是一个点，在 (λ,s) 平面上却是一整条边。细分出来的第二个点
    // 已经离开极点（s = 1 − 3e-7），于是矩形顶边被表示成一条极扁的斜边，
    // 留下约 0.2 m 的残差。这是「用顶点列表示含极点多边形」的固有代价，
    // 不是实现的 bug，也不影响任何真实地块
    const c = polygonCentroid([p(0, 0), p(0, 90), p(90, 0)])!
    expect(c.lng).toBeCloseTo(45, 4)
    expect(c.lat).toBeCloseTo(geodeticFromAuthalic(30), 4)
  })

  it('关于某条经线对称的环，质心经度精确落在该经线上', () => {
    const c = polygonCentroid([p(116, 40), p(117, 40), p(117, 41), p(116, 41)])!
    expect(c.lng).toBeCloseTo(116.5, 9)
    expect(c.lat).toBeCloseTo(40.5, 2)
  })

  it('小地块的质心与平面质心一致到毫米级', () => {
    const parcel = [p(116.4, 40.0), p(116.4117, 40.0), p(116.4117, 40.009), p(116.4, 40.009)]
    const c = polygonCentroid(parcel)!
    // 平面（顶点平均）质心：116.40585, 40.0045
    expect(Math.abs(c.lng - 116.40585) * 85000).toBeLessThan(0.05) // 东西向 <5 cm
    expect(Math.abs(c.lat - 40.0045) * 110574).toBeLessThan(0.05) // 南北向 <5 cm
  })

  it('沿经度整体平移：质心经度精确跟随（地球绕极轴旋转对称）', () => {
    const ring = [p(0, 0), p(1, 0), p(1, 1), p(0.4, 0.7)]
    const shifted = ring.map((v) => p(v.lng + 50, v.lat))
    const a = polygonCentroid(ring)!
    const b = polygonCentroid(shifted)!
    expect(b.lng - a.lng).toBeCloseTo(50, 9)
    expect(b.lat).toBeCloseTo(a.lat, 9)
  })

  it('⚠️ 沿**纬度**平移不是不变量（球面在纬度方向没有平移对称性）', () => {
    // 这条断言记录的是一个陷阱而不是需求：把同一个环从赤道搬到北纬 20°，
    // 大圆弧的矢高、以及 (λ, sinβ) 平面像的形状都变了，
    // 质心经度会跟着动十几米。因此**不要**把「平移不变」写成质心的性质，
    // 也不要在别处依赖它
    const ring = [p(0, 0), p(1, 0), p(1, 1), p(0.4, 0.7)]
    const north = ring.map((v) => p(v.lng, v.lat + 20))
    const a = polygonCentroid(ring)!
    const b = polygonCentroid(north)!
    expect(Math.abs(b.lng - a.lng)).toBeGreaterThan(1e-5)
    expect(b.lat - a.lat).toBeCloseTo(20, 3)
  })

  it('退化环不抛异常，仍返回一个可解释的点', () => {
    const line = [p(0, 0), p(1, 0), p(2, 0)]
    const c = polygonCentroid(line)!
    expect(c).not.toBeNull()
    expect(c.lng).toBeCloseTo(1, 6)
  })

  it('两个点没有面积，质心取大圆中点而不是 null', () => {
    const c = polygonCentroid([p(0, 0), p(0, 2)])!
    expect(c.lng).toBeCloseTo(0, 9)
    // 容差 5 位（≈1 m）而不是 6 位：中点在**等积球**空间取，等积纬度
    // β(φ) 是非线性的，β 的中点回算到大地纬度与 φ 的中点相差 O(Δφ²)。
    // 2° 的子午线段上这个差是 2.7e-6°≈0.3 m —— 属于所选模型的定义误差，
    // 不是算法 bug（面积质心本来就定义在等积球上，两点退化沿用同一空间）
    expect(c.lat).toBeCloseTo(1, 5)
  })
})

/* ------------------------------------------------------------------ *
 * ⑨ polygonSummary：主入口的编排
 * ------------------------------------------------------------------ */

describe('polygonSummary：面积汇总的主入口', () => {
  const box = [p(116, 40), p(117, 40), p(117, 41), p(116, 41)]

  it('areaM2 是带符号面积的绝对值（SR-03 专属异常②）', () => {
    const cw = [...box].reverse()
    const s = polygonSummary(cw)
    expect(s.signedAreaM2).toBeLessThan(0)
    expect(s.areaM2).toBe(-s.signedAreaM2)
    expect(s.orientation).toBe('cw')
  })

  it('显式闭合环（末点 = 首点）不重复计顶点，面积与周长都不变', () => {
    // GeoJSON / KML / WKT 的环一律显式重复第一个顶点
    const closed = [...box, box[0]]
    const open = polygonSummary(box)
    const s = polygonSummary(closed)
    expect(dropClosingPoint(closed)).toHaveLength(4)
    expect(s.vertexCount).toBe(4)
    expect(s.areaM2).toBe(open.areaM2)
    expect(s.perimeterM).toBeCloseTo(open.perimeterM, 6)
  })

  it('dropClosingPoint 只去掉**完全相同**的末点，不合并相距几厘米的两点', () => {
    // SR-01 不静默改写用户输入：相距 1 cm 的两个点是用户有意给的
    expect(dropClosingPoint([p(0, 0), p(1, 0), p(1, 1), p(0, 1e-9)])).toHaveLength(4)
    expect(dropClosingPoint([p(0, 0), p(1, 0), p(0, 0)])).toHaveLength(2)
    expect(dropClosingPoint([p(0, 0)])).toHaveLength(1)
  })

  it('一次性给出 SR-03 要求的全部量', () => {
    const s = polygonSummary(box)
    expect(s.vertexCount).toBe(4)
    expect(s.areaM2).toBeGreaterThan(9.4e9)
    expect(s.perimeterM).toBeGreaterThan(3.9e5)
    expect(s.centroid).not.toBeNull()
    expect(s.orientation).toBe('ccw')
    expect(s.selfIntersecting).toBe(false)
    expect(s.perimeterFellBack).toBe(false)
  })
})

/* ------------------------------------------------------------------ *
 * ⑩ 显示精度与 CSV
 * ------------------------------------------------------------------ */

describe('areaDisplayDigits：SR-02 面积 2 位小数，小数值补位到三位有效数字', () => {
  it('量级 ≥1 时固定 2 位', () => {
    expect(areaDisplayDigits(1234.5678)).toBe(DEFAULT_AREA_DIGITS)
    expect(areaDisplayDigits(1)).toBe(2)
    expect(areaDisplayDigits(1e12)).toBe(2)
    expect(areaDisplayDigits(0)).toBe(2)
  })

  it('量级 <1 时补位，保证不会因为「0.00」丢掉全部信息', () => {
    // 1234 ㎡ 换成平方千米是 0.001234：2 位小数只剩 0.00，用户会以为没值
    expect(areaDisplayDigits(0.5)).toBeGreaterThan(2)
    expect(areaDisplayDigits(0.001234)).toBeGreaterThanOrEqual(6)
    expect(areaDisplayDigits(1e-9)).toBeLessThanOrEqual(MAX_DIGITS)
  })

  it('不超过 SR-02 允许的上限 12 位', () => {
    expect(areaDisplayDigits(1e-30)).toBe(MAX_DIGITS)
    expect(areaDisplayDigits(NaN)).toBe(DEFAULT_AREA_DIGITS)
  })
})

describe('areaCsv：文件内容不本地化（SR-11）', () => {
  const values: Record<string, number> = { m2: 1234.5, ha: 0.12345, mu: 1.85175 }

  it('表头固定 ASCII，行尾 CRLF，字段不转义', () => {
    const csv = areaCsv(values, ['m2', 'ha', 'mu'])
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe(AREA_CSV_HEADER.join(','))
    expect(AREA_CSV_HEADER).toEqual(['unit', 'area'])
    expect(lines).toHaveLength(4)
    expect(lines[1]).toBe('m2,1234.50')
    expect(csv).not.toContain('"') // 没有引号，也就没有转义逻辑的死代码
    expect(csv).not.toContain('\n\n')
  })

  it('小数位由 digitsOf 决定，且与 SR-02 的面积精度一致', () => {
    const csv = areaCsv(values, ['ha'], () => 2)
    expect(csv.split('\r\n')[1]).toBe('ha,0.12')
  })

  it('数值走标准形态：句点小数点、不加千分位', () => {
    const csv = areaCsv({ m2: 1234567.891 }, ['m2'], () => 2)
    // 千分位会破坏 CSV 的字段结构（SR-11：坐标/数值不得再含逗号）
    expect(csv.split('\r\n')[1]).toBe('m2,1234567.89')
  })
})

/* ------------------------------------------------------------------ *
 * ⑪ 单位换算闭环（SR-04）
 * ------------------------------------------------------------------ */

describe('SR-04 面积基准值与换算闭环', () => {
  it('亩 = 666.666… ㎡（市亩，精确分数 2000/3）', () => {
    // SR-03：「采用市亩（1 亩 = 666.666… ㎡）」
    expect(AREA_TO_M2.mu).toBe(2000 / 3)
    expect(AREA_TO_M2.mu).toBeCloseTo(666.6666666666666, 10)
    // 1 公顷 = 15 亩，这是国内最常问的换算，必须精确成立
    expect(convertArea(1, 'ha', 'mu')).toBeCloseTo(15, 12)
  })

  it('公顷 / 公亩 / 平方千米 的十进制关系', () => {
    expect(AREA_TO_M2.ha).toBe(10000)
    expect(AREA_TO_M2.are).toBe(100)
    expect(convertArea(1, 'ha', 'are')).toBeCloseTo(100, 12)
    expect(convertArea(1, 'km2', 'ha')).toBeCloseTo(100, 12)
  })

  it('坪 = 400/121 ㎡，1 亩 ≈ 201.67 坪（PRD 8.2 点名的最易混淆项）', () => {
    expect(AREA_TO_M2.tsubo).toBe(400 / 121)
    expect(AREA_TO_M2.tsubo).toBeCloseTo(3.305785123966942, 12)
    expect(convertArea(1, 'mu', 'tsubo')).toBeCloseTo(201.6666666666667, 8)
  })

  it('英亩 / 平方英里 / 平方码 / 平方英尺 与 SR-04 表格逐项一致', () => {
    expect(AREA_TO_M2.acre).toBe(4046.8564224)
    expect(AREA_TO_M2.mi2).toBe(2589988.110336)
    expect(AREA_TO_M2.yd2).toBe(0.83612736)
    expect(AREA_TO_M2.ft2).toBe(0.09290304)
    expect(AREA_TO_M2.cm2).toBe(0.0001)
    expect(convertArea(1, 'mi2', 'acre')).toBeCloseTo(640, 6)
  })

  it('任意两个单位之间往返换算闭合（不做单位间直接换算，一律过基准）', () => {
    for (const from of ALL_AREA_UNITS) {
      for (const to of ALL_AREA_UNITS) {
        const there = convertArea(123.456, from, to)
        const back = convertArea(there, to, from)
        expect(rel(back, 123.456), `${from}→${to}→${from}`).toBeLessThan(1e-12)
      }
    }
  })

  it('多边形面积落到单位换算上：1° 方块约 123 万公顷 / 1846 万亩', () => {
    const area = Math.abs(signedAreaM2([p(0, 0), p(1, 0), p(1, 1), p(0, 1)]))
    expect(convertArea(area, 'm2', 'ha')).toBeCloseTo(1230877.6, -1)
    expect(convertArea(area, 'm2', 'mu')).toBeCloseTo(18463164, -1)
  })
})
