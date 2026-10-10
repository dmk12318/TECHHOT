// 把站点导出成一套静态文件（路线 B 用）：预渲染页面 + 站点自带的静态文件 + 动态出口（RSS、站点地图、llms.txt、分享图）。
//
// 前提：api 正在跑（本机用 `powershell -ExecutionPolicy Bypass -File scripts\本机启动.ps1`，
// 或 CI 里先起 apps/api/src/main.ts），因为预渲染要在线取数。
//
// 用法（在 engine/ 下）：
//   node --env-file=.env scripts/export-static.ts
//   node --env-file=.env scripts/export-static.ts --base https://techhot.example   # 生成绝对链接用的地址
//   node --env-file=.env scripts/export-static.ts --out .data/static               # 换输出目录
//
// 产物默认落在 apps/web/build/client（就是网页构建的产物目录，Pages 直接发它）。
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { PUBLIC_API_CATEGORY_KEYS } from "@aihot/contracts/taxonomy";

const args = process.argv.slice(2);
const value = (name: string, fallback: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? (args[at + 1] ?? fallback) : fallback;
};
const base = value("base", process.env.SITE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
// 取数据直接找 api，不绕网页进程：预渲染和下面的抓取都只需要 api 活着。
const api = (process.env.API_BASE_URL ?? "http://127.0.0.1:3001").replace(/\/+$/, "");
/** 网页构建（含预渲染）固定的产物目录；--out 指定别的目录时，构建完再整体搬过去。 */
const built = path.join(REPO_ROOT, "apps/web/build/client");
const out = path.resolve(REPO_ROOT, value("out", "apps/web/build/client"));
const skipBuild = args.includes("--skip-build");

const get = async (p: string) => {
  const res = await fetch(api + p);
  if (!res.ok) throw new Error(`${p} 取不到：HTTP ${res.status}`);
  return res;
};
const save = async (p: string, target: string) => {
  const body = Buffer.from(await (await get(p)).arrayBuffer());
  const file = path.join(out, target);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, body);
  return body.length;
};

console.log(`从 ${api} 取数据，按 ${base} 生成链接，导出到 ${out}`);

// 1) 路径清单：用站点自己的 sitemap，加上主题页和几个纯客户端页面。
const sitemap = await (await get("/sitemap.xml")).text();
const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
const topics = (await (await get("/api/site/topics")).json()) as { topics: Array<{ slug: string }> };
for (const t of topics.topics) paths.push(`/topics/${t.slug}`);
for (const p of ["/starred", "/more", "/feedback"]) paths.push(p);
const unique = [...new Set(paths)].sort();
const listFile = path.join(REPO_ROOT, ".data/static-export-paths.json");
mkdirSync(path.dirname(listFile), { recursive: true });
writeFileSync(listFile, JSON.stringify(unique));
console.log(`路径清单 ${unique.length} 个（含 ${topics.topics.length} 个主题页）`);

// 2) 预渲染（写进 out）。注意：这会覆盖网页构建产物，本机跑完要把网页进程重启一下。
if (skipBuild) {
  console.log("跳过构建（--skip-build），直接用现有产物");
} else {
console.log("开始构建 + 预渲染…");
// npm 跟 Node 装在一起（不是装在仓库的 node_modules 里），所以从 node.exe 旁边找。
const npmCli = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
execFileSync(process.execPath, [npmCli, "run", "build", "-w", "@aihot/web"], {
  cwd: REPO_ROOT,
  env: { ...process.env, STATIC_EXPORT_PATHS: listFile, SITE_URL: base },
  stdio: ["ignore", "inherit", "inherit"],
});
}

if (path.resolve(built) !== out) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(path.dirname(out), { recursive: true });
  cpSync(built, out, { recursive: true });
  console.log(`已把构建产物搬到 ${out}`);
}

// 3) 站点自带的静态文件（robots、manifest、openapi、图标）由 api 提供，静态站上要自己放。
const siteDir = path.join(REPO_ROOT, "site");
for (const [from, to] of [
  [path.join(siteDir, "public"), out],
  [path.join(siteDir, "brand", "icon.png"), path.join(out, "icon.png")],
  [path.join(siteDir, "brand", "icon-192.png"), path.join(out, "icon-192.png")],
  [path.join(siteDir, "brand", "apple-icon.png"), path.join(out, "apple-icon.png")],
  [path.join(siteDir, "brand", "favicon.ico"), path.join(out, "favicon.ico")],
  [path.join(siteDir, "brand", "logo.svg"), path.join(out, "logo.svg")],
] as const) {
  cpSync(from, to, { recursive: true });
}
console.log("已放进静态文件与站点图标");

// 4) 动态出口：RSS（全部 + 每个公开类别）、站点地图、llms.txt。
let fetched = 0;
fetched += await save("/feed.xml", "feed.xml");
fetched += await save("/feed/all.xml", "feed/all.xml");
for (const key of PUBLIC_API_CATEGORY_KEYS) fetched += await save(`/feed/category/${key}.xml`, `feed/category/${key}.xml`);
fetched += await save("/sitemap.xml", "sitemap.xml");
fetched += await save("/llms.txt", "llms.txt");
console.log(`已生成 RSS / sitemap / llms.txt（${Math.round(fetched / 1024)} KB）`);

// 5) 分享图：HTML 里 og:image 指向 api，这里把它们抓成文件。
const images = new Set<string>();
const walk = (dir: string) => {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) { walk(full); continue; }
    if (!entry.endsWith(".html")) continue;
    for (const m of readFileSync(full, "utf8").matchAll(/<meta property="og:image" content="([^"]+)"/g)) {
      const url = new URL(m[1]!);
      images.add(url.pathname + url.search);
    }
  }
};
walk(out);
let bytes = 0;
for (const p of images) bytes += await save(p, p.replace(/^\//, ""));
console.log(`已抓下分享图 ${images.size} 张（${Math.round(bytes / 1024)} KB）`);

if (!existsSync(path.join(out, "index.html"))) throw new Error("产物里没有 index.html，导出失败");
console.log(`导出完成：${out}`);
