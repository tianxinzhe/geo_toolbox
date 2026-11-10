/**
 * GPS 定位组合式函数（PRD FR-12「GPS 定位能力」）
 *
 * T04 / T09 / T10 / T11 都要用，所以抽成一处，
 * 避免四份各自为政的 getCurrentPosition 调用（超时、错误码、精度半径
 * 的处理规则一旦分散就必然走样）。
 *
 * 🔑 FR-12 的四条硬规则如何落地：
 *
 *   ① **绝不自动请求权限** —— 本模块不在 setup / onMounted 里调用
 *      getCurrentPosition，只有调用方显式调 `locate()`（即用户点了按钮）才请求。
 *
 *   ② **不支持时隐藏按钮，而不是显示后报错** —— 由 `supported` 驱动。
 *      ⚠️ `supported` 初值必须是 **true**，检测放在 `onMounted` 里。
 *      组件是 `client:load` 的岛屿，构建期（SSG）也会渲染一遍；
 *      Node 里没有 `navigator`，若在 setup 阶段直接探测，
 *      服务端产出的 HTML 与客户端 hydration 后的结果不一致 →
 *      hydration mismatch + 按钮闪烁。初值 true 保证两端 HTML 相同，
 *      挂载后再按真实能力收敛，这是唯一安全的顺序。
 *
 *   ③ **超时 10 秒** —— 交给 options.timeout，不自己写 Promise.race：
 *      原生超时会在底层同时取消硬件请求，race 掉的 Promise 仍会让 GPS
 *      芯片空转。超时与拒绝都归一到 `error`，UI 用同一句文案兜底。
 *
 *   ④ **定位结果不写入本地存储、不上传**（PRD 8.1 隐私约束）——
 *      本模块只把结果**返回**给调用方，自身不碰 localStorage。
 *      调用方也不得把它写进偏好键里。
 *
 * 坐标系：浏览器定位 API 返回 WGS84。T04 的上下文就是 WGS84，无需转换；
 * 若将来在其他坐标上下文中复用，调用方必须先转换再填入（FR-12 / SR-01
 * 「禁止裸传数值」），本模块不做任何坐标系假设。
 *
 * ⚠️ 本文件不含任何界面文案：错误一律返回**代码**（'denied' / 'timeout' /
 * 'unavailable' / 'unsupported'），由组件映射到 i18n 键。逻辑层写字面量文案
 * 会让 SR-11 的三语言约束失效。
 */
import { onMounted, readonly, ref, type DeepReadonly, type Ref } from 'vue'

/** 失败原因代码。UI 目前统一映射到 `coord.locationDenied`，
 *  但保留细分代码是为了将来能分别给出「去浏览器设置里开权限」这类具体出路 */
export type GeoError = 'denied' | 'timeout' | 'unavailable' | 'unsupported'

export interface GeoPosition {
  lng: number
  lat: number
  /** 精度半径（米）。FR-12：>500 m 时必须标注「精度约 ±X 米」 */
  accuracy: number | undefined
}

export interface UseGeolocation {
  /** 浏览器是否支持定位 API。初值 true，挂载后按真实能力收敛（见文件头 ②） */
  supported: DeepReadonly<Ref<boolean>>
  /** 正在定位中：按钮显示 `coord.locating` 并禁用，避免重复请求权限 */
  locating: DeepReadonly<Ref<boolean>>
  /** 最近一次失败的原因代码，成功时清空 */
  error: DeepReadonly<Ref<GeoError | ''>>
  /** 最近一次成功的精度半径（米） */
  accuracy: DeepReadonly<Ref<number | undefined>>
  /** 主动请求一次定位。失败或用户拒绝时返回 undefined，不抛异常 */
  locate: () => Promise<GeoPosition | undefined>
}

/** FR-12：10 秒未返回结果则提示超时 */
const TIMEOUT_MS = 10_000

/**
 * FR-12「精度不足」的阈值：半径超过它就必须在填入的坐标旁标注精度。
 * 阈值本身不产生文案，只决定 `accuracy` 值是否值得显示 ——
 * 实际上 UI 会始终显示精度（更诚实），这个常量留给调用方做强调用。
 */
export const COARSE_ACCURACY_M = 500

export function useGeolocation(): UseGeolocation {
  const supported = ref(true)
  const locating = ref(false)
  const error = ref<GeoError | ''>('')
  const accuracy = ref<number | undefined>(undefined)

  onMounted(() => {
    // 只在客户端探测。非 HTTPS 环境下 navigator.geolocation 直接不存在，
    // 此时隐藏入口比让用户点了报错好（FR-12）
    supported.value = typeof navigator !== 'undefined' && 'geolocation' in navigator
  })

  async function locate(): Promise<GeoPosition | undefined> {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      supported.value = false
      error.value = 'unsupported'
      return undefined
    }
    if (locating.value) return undefined // 防重复点击：权限弹窗只应出现一次

    locating.value = true
    error.value = ''

    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          // 坐标工具的精度诉求高于省电诉求：一次定位差 500 m，
          // 算出来的距离就完全不可用
          enableHighAccuracy: true,
          timeout: TIMEOUT_MS,
          // 不接受缓存位置。用户是站在原地按的按钮，
          // 几分钟前的缓存可能来自另一个地点
          maximumAge: 0
        })
      })

      const acc = pos.coords.accuracy
      accuracy.value = Number.isFinite(acc) ? acc : undefined
      return { lng: pos.coords.longitude, lat: pos.coords.latitude, accuracy: accuracy.value }
    } catch (e) {
      // PERMISSION_DENIED = 1 / POSITION_UNAVAILABLE = 2 / TIMEOUT = 3。
      // 「权限被拒」不再重复弹窗请求（FR-12），只给手动输入的出路
      const code = (e as GeolocationPositionError | undefined)?.code
      error.value = code === 1 ? 'denied' : code === 3 ? 'timeout' : 'unavailable'
      accuracy.value = undefined
      return undefined
    } finally {
      locating.value = false
    }
  }

  // readonly 包一层：状态只能由 locate() 改，组件不得直接赋值
  return {
    supported: readonly(supported),
    locating: readonly(locating),
    error: readonly(error),
    accuracy: readonly(accuracy),
    locate
  }
}
