/**
 * `epsg` npm 包没有类型声明，且是 CommonJS 导出。
 *
 * 这里只声明我们真正用到的形状：一个「EPSG:xxxx → proj4 定义串」的对象。
 * 该文件位于 src/types 下，会被 tsconfig 的 include 自动收录。
 */
declare module 'epsg' {
  const defs: Record<string, string>
  export default defs
}