// 静态站上线前的体检：拿真实浏览器打开导出好的站点（engine/static），检查
//   1) 页面上每个站内链接都能取到（静态托管上取不到就是 404，读者直接撞墙）；
//   2) 点导航、点筛选走的是前端路由，不整页刷新；
//   3) 列表里的条目页打得开；
//   4) 搜索用导出时生成的本地数据出结果，不需要后端。
// 产物不在（没跑过 scripts/export-static.ts）就整组跳过；CI 里由「出刊」那条流程在导出后跑。
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";
import { chromium, type Browser, type Page } from "@playwright/test";

/** scripts/export-static.ts 的默认产物目录。 */
const root = fileURLToPath(new URL("../../../static/", import.meta.url));
const exported = existsSync(path.join(root, "index.html"));

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8", ".data": "text/plain; charset=utf-8", ".woff2": "font/woff2",
};

let server: Server;
let origin: string;
let browser: Browser;

/** 静态托管的样子：目录取 index.html，别的都当文件；取不到就是 404。 */
function serveStatic(): Server {
  return createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url!, "http://static.local").pathname);
    let file = path.join(root, pathname);
    if (!file.startsWith(root)) { res.writeHead(400).end("bad"); return; }
    try { if ((await stat(file)).isDirectory()) file = path.join(file, "index.html"); }
    catch { file = path.join(root, pathname, "index.html"); }
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found");
    }
  });
}

/** 打开一页，记下每一次「整页文档请求」：前端路由不该产生新的。 */
async function open(pathname: string, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const documents: string[] = [];
  page.on("request", (request) => { if (request.resourceType() === "document") documents.push(request.url()); });
  await page.goto(origin + pathname, { waitUntil: "networkidle" });
  return { context, page, documents };
}

const textOf = (page: Page) => page.locator("body").innerText().then((text) => text.replace(/\s+/g, " "));

before(async () => {
  if (!exported) return;
  server = serveStatic();
  server.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  // CI 里装的是 playwright 自带的 chromium；本机浏览器版本对不上时用 STATIC_TEST_CHROMIUM 指向现成的。
  const executablePath = process.env.STATIC_TEST_CHROMIUM;
  browser = await chromium.launch(executablePath ? { executablePath } : { channel: "chromium" });
});

after(async () => {
  await browser?.close();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
});

describe("静态站体检", { skip: exported ? false : "还没导出过静态站（engine/static 不存在）" }, () => {
  test("页面上每个站内链接都取得到", async () => {
    const pages: string[] = [];
    const walk = async (dir: string) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.name.endsWith(".html")) pages.push(full);
      }
    };
    await walk(root);
    assert.ok(pages.length > 0, "导出的站里一个页面都没有");
    const links = new Set<string>();
    for (const file of pages) {
      for (const match of (await readFile(file, "utf8")).matchAll(/<a[^>]+href="([^"]+)"/g)) {
        const href = match[1]!;
        // 只查站内链接；查询串和锚点在同一条路径上，去掉再查。
        if (href.startsWith("/")) links.add(href.split("#")[0]!.split("?")[0]!);
      }
    }
    assert.ok(links.size > 0, "一页里一个站内链接都没找到");
    const missing: string[] = [];
    for (const href of links) {
      const res = await fetch(origin + href);
      await res.body?.cancel();
      if (res.status !== 200) missing.push(`${res.status} ${href}`);
    }
    assert.deepEqual(missing, [], `这些站内链接在静态站上取不到：\n${missing.join("\n")}`);
  });

  test("点导航是前端路由：不重新加载整页", async () => {
    const { context, page, documents } = await open("/");
    try {
      assert.equal(documents.length, 1, "打开首页就该只有一次文档请求");
      await page.locator('a[href="/all"]').first().click();
      await page.waitForURL("**/all");
      await page.waitForTimeout(500);
      assert.equal(documents.length, 1, "点导航不该重新加载整页");
      assert.match(await page.locator("h1").first().innerText(), /全部/);
    } finally { await context.close(); }
  });

  test("列表里的条目页打得开", async () => {
    const { context, page, documents } = await open("/all");
    try {
      const link = page.locator('a[href^="/items/"]').first();
      const href = await link.getAttribute("href");
      const title = (await link.innerText()).trim().split("\n")[0]!;
      await link.click();
      await page.waitForURL(`**${href!}`);
      await page.waitForTimeout(500);
      assert.equal(documents.length, 1, "点条目不该重新加载整页");
      assert.match(await page.locator("h1").first().innerText(), new RegExp(title.slice(0, 8).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    } finally { await context.close(); }
  });

  test("筛选在浏览器里算：地址变了，内容跟着变", async () => {
    const { context, page, documents } = await open("/all");
    try {
      const before = await textOf(page);
      await page.locator('a[href^="/all?category="]').first().click();
      await page.waitForURL("**/all?category=*");
      await page.waitForTimeout(1000);
      assert.equal(documents.length, 1, "筛选不该重新加载整页");
      assert.notEqual(await textOf(page), before, "选了类别，列表却一点没变");
    } finally { await context.close(); }
  });

  test("搜索用本地数据出结果", async () => {
    const data = JSON.parse(await readFile(path.join(root, "pool.json"), "utf8")) as { items: Array<{ title: string }> };
    assert.ok(data.items.length > 0, "导出的本地数据是空的");
    // 拿第一条标题的头两个字搜：一定命中标题，得出的条数也该大于 0。
    const query = [...data.items[0]!.title].slice(0, 2).join("");
    const { context, page, documents } = await open("/");
    try {
      await page.locator("#site-search").first().fill(query);
      await page.locator("#site-search").first().press("Enter");
      await page.waitForURL("**/all?q=*");
      await page.waitForTimeout(1000);
      assert.equal(documents.length, 1, "搜索不该重新加载整页");
      const found = (await textOf(page)).match(/找到\s*(\d+)\s*条/);
      assert.ok(found, `搜索“${query}”后没有结果统计`);
      assert.ok(Number(found[1]) > 0, `搜索“${query}”一条都没找到`);
    } finally { await context.close(); }
  });
});
