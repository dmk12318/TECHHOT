// 站点可能挂在子路径下：GitHub Pages 的项目站是 <用户名>.github.io/<仓库名>/，
// 构建时 Vite 的 base 会设成那段前缀（见 vite.config.ts / react-router.config.ts）。
//
// 路由链接由 router 自己加前缀；这里管的是**写死在 HTML 或代码里的地址**（图标、站点地图、
// 本地数据文件等），它们不会经过 router，要自己带上。前缀为空时就是原来的样子。

/** 前缀，结尾不带斜杠（挂在根路径时是空串）。 */
export const BASE_PATH = import.meta.env.BASE_URL.replace(/\/+$/, "");

/** 给写死的站内地址加上前缀。 */
export function sitePath(path: string): string {
  return `${BASE_PATH}${path}`;
}
