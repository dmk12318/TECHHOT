import type { Config } from "@react-router/dev/config";
import { readFileSync } from "node:fs";

/**
 * 站点挂在子路径下时（GitHub Pages 的项目站是 /TECHHOT/），路由前缀从公开地址 SITE_URL 里取：
 * 一处配置，导出的链接、资源地址和前端路由都跟着它走。公开地址没有子路径时就是空串，行为不变。
 *
 * 注意：这个值必须和 vite.config.ts 的 `base` 一模一样（都带结尾斜杠）。预渲染时 React Router 就是拿
 * 它去拼 `${basename}${path}.data` 请求的，跟 `base` 不一致就会一路 404。
 */
const basePath = (() => {
  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) return "/";
  try {
    const pathname = new URL(siteUrl).pathname.replace(/\/+$/, "");
    return pathname === "/" ? "/" : `${pathname}/`;
  } catch {
    return "/";
  }
})();

/**
 * 静态导出（路线 B 用）：设了 STATIC_EXPORT_PATHS（指向一个 JSON 文件，里面是路径字符串数组）就打开预渲染，
 * 构建时把这些路径渲染成 HTML，并生成客户端导航需要的数据文件。不设这个环境变量时行为和原来一样。
 * 路径清单由 scripts/export-paths.ts 从站点的 sitemap 和主题接口生成。
 */
const staticExportPaths = process.env.STATIC_EXPORT_PATHS;

export default {
  ssr: true,
  basename: basePath,
  appDirectory: "app",
  buildDirectory: "build",
  ...(staticExportPaths
    ? { prerender: { paths: () => JSON.parse(readFileSync(staticExportPaths, "utf8")) as string[], concurrency: 4 } }
    : {}),
  // The whole route manifest ships with the page: no /__manifest?paths=… requests, whose answers are
  // cacheable for a year while a CDN's page cache would not key them on paths or version.
  routeDiscovery: { mode: "initial" },
  // The page loader and component share tiny entry wrappers. Splitting their exports creates extra
  // serial requests before a cold navigation can read data; keep each route's exports together.
  splitRouteModules: false,
} satisfies Config;
