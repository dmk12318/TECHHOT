import type { Config } from "@react-router/dev/config";
import { readFileSync } from "node:fs";

/**
 * 静态导出（路线 B 用）：设了 STATIC_EXPORT_PATHS（指向一个 JSON 文件，里面是路径字符串数组）就打开预渲染，
 * 构建时把这些路径渲染成 HTML，并生成客户端导航需要的数据文件。不设这个环境变量时行为和原来一样。
 * 路径清单由 scripts/export-paths.ts 从站点的 sitemap 和主题接口生成。
 */
const staticExportPaths = process.env.STATIC_EXPORT_PATHS;

export default {
  ssr: true,
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
