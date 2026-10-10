// 把站点导出成一套静态文件（路线 B 用）：预渲染页面 + 站点自带的静态文件 + 动态出口（RSS、站点地图、llms.txt、分享图）
// + 本地数据（pool.json：「全部动态」的筛选/翻页与搜索都要它，静态站没有后端可问）。
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
import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { PUBLIC_API_CATEGORY_KEYS } from "@aihot/contracts/taxonomy";
import type { FeedItemSummary, SiteItemDetail, StoryDetail } from "@aihot/contracts/site";

const args = process.argv.slice(2);
const value = (name: string, fallback: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? (args[at + 1] ?? fallback) : fallback;
};
const base = value("base", process.env.SITE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
/** 公开地址里的子路径（GitHub Pages 的项目站是 /TECHHOT）；挂在根路径时是空串。 */
const basePath = new URL(base).pathname.replace(/\/+$/, "");
// 取数据直接找 api，不绕网页进程：预渲染和下面的抓取都只需要 api 活着。
const api = (process.env.API_BASE_URL ?? "http://127.0.0.1:3001").replace(/\/+$/, "");
/** 网页构建（含预渲染）固定的产物目录；--out 指定别的目录时，构建完再整体搬过去。 */
const built = path.join(REPO_ROOT, "apps/web/build/client");
const out = path.resolve(REPO_ROOT, value("out", "apps/web/build/client"));
const skipBuild = args.includes("--skip-build");
const skipImages = args.includes("--skip-images");

// 这里所有请求都打给同一个 api 进程。预渲染一口气打完几百个请求之后，连接可能被对端收掉，
// 下一次复用就报 ECONNRESET/ECONNABORTED（本机和 CI 都遇到过）。网络错误重试两次，超时就当真的失败。
const request = async (p: string) => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(api + p);
    } catch (error) {
      // fetch 的网络错误是 TypeError（HTTP 错误码不是）；重试两次，还不行就报出去。
      if (attempt >= 3 || !(error instanceof TypeError)) throw error;
      const code = (error.cause as { code?: string } | undefined)?.code ?? error.message;
      console.log(`${p} 断了（${code}），重试 ${attempt}/2`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
};
const get = async (p: string) => {
  const res = await request(p);
  if (!res.ok) throw new Error(`${p} 取不到：HTTP ${res.status}`);
  return res;
};
/**
 * 问一次接口，问的是「这一页该不该有」：200 给内容，404（没有这一条）和跳转（合并掉的故事
 * 会 308 到并进去的那条）就当它不该有页面，别的错误照旧抛出去。
 */
const probe = async <T>(p: string): Promise<T | null> => {
  const res = await request(p);
  if (res.status === 404 || res.redirected) return null;
  if (!res.ok) throw new Error(`${p} 取不到：HTTP ${res.status}`);
  return (await res.json()) as T;
};
/** 限并发跑一批请求：跟着预渲染的并发度来（4），别把 api 拖垮。 */
async function eachLimit<T>(items: readonly T[], limit: number, run: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const at = next;
        next += 1;
        await run(items[at]!);
      }
    }),
  );
}
const save = async (p: string, target: string) => {
  const body = Buffer.from(await (await get(p)).arrayBuffer());
  const file = path.join(out, target);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, body);
  return body.length;
};

console.log(`从 ${api} 取数据，按 ${base} 生成链接，导出到 ${out}`);

// 1) 路径清单：站点自己的 sitemap，加上主题页、纯客户端页面，以及「全部动态」里每一条。
//    「全部动态」的列表会链到每一条；不给某一条出页面，读者点进去就是 404。
const sitemap = await (await get("/sitemap.xml")).text();
// 预渲染用的路径不带子路径（那是构建前缀的事，React Router 自己加），sitemap 里的地址可能带着它。
const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => new URL(m[1]!).pathname)
  .map((p) => (p.startsWith(`${basePath}/`) ? p.slice(basePath.length) : p));
const topics = (await (await get("/api/site/topics")).json()) as { topics: Array<{ slug: string }> };
for (const t of topics.topics) paths.push(`/topics/${t.slug}`);
for (const p of ["/starred", "/more"]) paths.push(p);
// 全部动态的分页数据：静态站没有后端，列表的筛选/翻页和搜索都靠这一份（它同时决定要给哪些条目出页面）。
const pool: FeedItemSummary[] = [];
for (let page = 1; ; page++) {
  const body = (await (await get(`/api/site/pool?page=${page}`)).json()) as { items: FeedItemSummary[]; pageCount: number };
  pool.push(...body.items);
  if (page >= body.pageCount) break;
}
for (const item of pool) paths.push(`/items/${item.id}`);

// 1.5) 页面之间还互相链，链到的页面 sitemap 和「全部动态」都可能没有：
//      · 条目页的「事件后续」和相关故事走详情接口的 relatedStories，不看 sitemap 那套「上架」条件；
//      · story 页列的报告是条目页，它自己还会链到别的 story；
//      · 首页热榜也链到 story 页。
//      少出一页，读者点过去就是 404 —— 2026-10-10 那次发布就是这么挂的（story/ec7bec14… 有链接、没页面，
//      「静态站体检」因此卡住）。所以把「活着的 story」全问一遍，再问一遍它们链到的条目：
//      接口答 200 才给它出页面。预渲染撞上非 200 会直接让构建失败，所以必须在这里先问清楚；
//      答 404 / 跳转的（合并掉的故事、没有可见报告的 story、没有页面的条目）本来就不该有页面。
const known = new Set(paths);
const linked: string[] = [];
const itemIds = new Set<string>();
for (const item of pool) if (item.sameEvent) itemIds.add(item.sameEvent.id);
const aliveStories = await sql<{ public_id: string }[]>`SELECT public_id::text AS public_id FROM stories WHERE merged_into IS NULL`;
await eachLimit(aliveStories.map((row) => row.public_id), 4, async (id) => {
  const story = await probe<StoryDetail>(`/api/site/stories/${id}`);
  if (!story) return;
  linked.push(`/story/${id}`);
  for (const report of [story.latestReport, ...story.timeline, ...story.officialReports, ...story.developments.map((d) => d.representative)]) {
    if (report) itemIds.add(report.id);
  }
});
const pending = [...itemIds].filter((id) => !known.has(`/items/${id}`));
const probed = new Set<string>();
for (let at = 0; at < pending.length; at += 4) {
  await Promise.all(pending.slice(at, at + 4).map(async (id) => {
    if (probed.has(id)) return;
    probed.add(id);
    const item = await probe<SiteItemDetail>(`/api/site/items/${id}`);
    if (!item) return;
    linked.push(`/items/${id}`);
    // 条目页里的「同新闻」卡片指向另一条条目，它也得有页面。
    if (item.sameEvent) pending.push(item.sameEvent.id);
  }));
}
paths.push(...linked);
const unique = [...new Set(paths)].sort();
const listFile = path.join(REPO_ROOT, ".data/static-export-paths.json");
mkdirSync(path.dirname(listFile), { recursive: true });
writeFileSync(listFile, JSON.stringify(unique));
console.log(`路径清单 ${unique.length} 个（含 ${topics.topics.length} 个主题页、${pool.length} 条全部动态，另按页面里的链接补了 ${linked.length} 个）`);

// 2) 预渲染（写进 out）。注意：这会覆盖网页构建产物，本机跑完要把网页进程重启一下。
if (skipBuild) {
  console.log("跳过构建（--skip-build），直接用现有产物");
} else {
console.log("开始构建 + 预渲染…");
// npm 不在仓库的 node_modules 里，而是跟 Node 装在一起：Windows 在 node.exe 旁边，
// Linux / macOS 在 Node 前缀的 lib/ 下面（CI 的 runner 就是后者），两处都找一下。
const npmCli = [
  process.env.npm_execpath,
  path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
  path.join(path.dirname(process.execPath), "lib/node_modules/npm/bin/npm-cli.js"),
  path.join(path.dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js"),
].find((candidate): candidate is string => !!candidate && existsSync(candidate));
if (!npmCli) throw new Error("找不到 npm，没法跑网页构建");
try {
  execFileSync(process.execPath, [npmCli, "run", "build", "-w", "@aihot/web"], {
    cwd: REPO_ROOT,
    env: { ...process.env, STATIC_EXPORT_PATHS: listFile, SITE_URL: base },
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (error) {
  // 构建挂了：把子进程最后说的话打出来（CI 里只把最后几行做成公开注解，不能让它只剩一个退出码）。
  const failed = error as { stdout?: Buffer | string; stderr?: Buffer | string; status?: number | null };
  console.error(`构建失败（退出码 ${failed.status ?? "?"}），子进程最后输出：`);
  console.error(String(failed.stdout ?? "").slice(-3000));
  console.error(String(failed.stderr ?? "").slice(-3000));
  throw error;
}
}

if (path.resolve(built) !== out) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(path.dirname(out), { recursive: true });
  cpSync(built, out, { recursive: true });
  console.log(`已把构建产物搬到 ${out}`);
}

// 挂子路径时（base 不是 /），React Router 会把预渲染出来的页面写进 base 那一层目录
// （build/client/TECHHOT/all/index.html），而静态托管是把产物根目录当站点根目录的
// （Pages 项目站的 /TECHHOT/ 就是仓库产物的根）。所以把这一层提上来，别多套一级。
const nested = path.join(out, basePath.replace(/^\//, ""));
if (basePath && existsSync(nested)) {
  for (const entry of readdirSync(nested)) {
    const target = path.join(out, entry);
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
    cpSync(path.join(nested, entry), target, { recursive: true });
  }
  rmSync(nested, { recursive: true, force: true });
  console.log(`已把 ${basePath}/ 这一层提上来（静态托管的产物根目录就是站点根目录）`);
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

// robots.txt 和 manifest 在 site/public 里是带占位符的模板，复制过来的是没渲染的版本，得从 api 取渲染好的。
writeFileSync(path.join(out, "robots.txt"), await (await get("/robots.txt")).text());
const manifest = (await (await get("/manifest.webmanifest")).json()) as { start_url: string; scope: string; icons: Array<{ src: string }> };
if (basePath) {
  // 挂在子路径下时，manifest 里的地址也要指到那一段，不然装到桌面上打开的是别人的首页。
  manifest.start_url = `${basePath}/`;
  manifest.scope = `${basePath}/`;
  manifest.icons = manifest.icons.map((icon) => ({ ...icon, src: `${basePath}${icon.src}` }));
}
writeFileSync(path.join(out, "manifest.webmanifest"), JSON.stringify(manifest));
// GitHub Pages 默认按 Jekyll 处理，会把下划线开头的文件与目录（本站的 _.data）丢掉。
writeFileSync(path.join(out, ".nojekyll"), "");
console.log("已换成渲染好的 robots.txt / manifest.webmanifest，并放上 .nojekyll");

// 4) 动态出口：RSS（全部 + 每个公开类别）、站点地图、llms.txt。
let fetched = 0;
fetched += await save("/feed.xml", "feed.xml");
fetched += await save("/feed/all.xml", "feed/all.xml");
for (const key of PUBLIC_API_CATEGORY_KEYS) fetched += await save(`/feed/category/${key}.xml`, `feed/category/${key}.xml`);
fetched += await save("/sitemap.xml", "sitemap.xml");
fetched += await save("/llms.txt", "llms.txt");
console.log(`已生成 RSS / sitemap / llms.txt（${Math.round(fetched / 1024)} KB）`);


// 4.5) 本地模式的数据：静态站没有后端，列表的筛选/翻页和搜索都在前端算，数据在这里生成。
// 「一手」这个筛选是 T1 信源，公开接口不给信源分级，就顺手查一次库（脚本本来就连着库）。
const t1 = (await sql<{ name: string }[]>`SELECT DISTINCT name FROM sources WHERE tier = 'T1'`).map((r) => r.name);
const poolJson = JSON.stringify({ t1, items: pool });
writeFileSync(path.join(out, "pool.json"), poolJson);
console.log(`已生成本地数据 pool.json：${pool.length} 条（${Math.round(poolJson.length / 1024)} KB，含 ${t1.length} 个 T1 信源）`);

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
// 站点挂子路径时，页面里的分享图地址也带着那一段（https://…/TECHHOT/og/…）：
// 取回来和落盘都要脱掉前缀——产物根目录就是站点根目录，域名后面那一段不在文件路径里。
const localImages = [...images].map((p) => (p.startsWith(`${basePath}/`) ? p.slice(basePath.length) : p));
if (skipImages) {
  console.log(`跳过分享图（--skip-images），本来要抓 ${localImages.length} 张`);
} else {
  // 分享图很贵（每张都要渲染一次）。抓过的留在 .data/og：CI 里把它挂在 actions/cache 上，
  // 每天只补新出现的那几张，不然条目越攒越多，一轮导出会慢到跑不完。
  const cache = path.join(REPO_ROOT, ".data/og");
  let bytes = 0;
  let fetched = 0;
  let reused = 0;
  for (const p of localImages) {
    const target = path.join(out, p.replace(/^\//, ""));
    const cached = path.join(cache, p.replace(/^\//, ""));
    if (existsSync(target)) { reused += 1; continue; }
    if (existsSync(cached)) {
      mkdirSync(path.dirname(target), { recursive: true });
      copyFileSync(cached, target);
      reused += 1;
      continue;
    }
    bytes += await save(p, p.replace(/^\//, ""));
    mkdirSync(path.dirname(cached), { recursive: true });
    copyFileSync(target, cached);
    fetched += 1;
  }
  console.log(`分享图 ${localImages.length} 张：新抓 ${fetched} 张（${Math.round(bytes / 1024)} KB），复用 ${reused} 张`);
}

if (!existsSync(path.join(out, "index.html"))) throw new Error("产物里没有 index.html，导出失败");
console.log(`导出完成：${out}`);
await closeDb();
