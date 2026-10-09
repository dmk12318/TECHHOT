// 检查测试里引用的公司 id 和主题 slug 是否都还存在——换行业时最容易漏的地方。
// 用法：node --env-file=.env scripts/check-fixtures.ts
// 只该剩两类"故意的"不存在引用：断言用的假公司名（如 unregistered-org）和假主题（如 not-a-topic）。
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { ENTITIES } from "@aihot/industry/taxonomy";

const root = path.resolve(import.meta.dirname, "..");
const dirs = [path.join(root, "tests"), path.join(root, "apps/web/tests")];
const files: string[] = [];
for (const dir of dirs) {
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const full = path.join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith(".ts")) files.push(full);
    }
  };
  walk(dir);
}

const topics = (JSON.parse(readFileSync(path.join(root, "industry/topics.json"), "utf8")) as { topics: { slug: string }[] }).topics.map((t) => t.slug);
const topicSet = new Set(topics);
const entitySet = new Set(Object.keys(ENTITIES));

const badEntities = new Map<string, string[]>();
const badTopics = new Map<string, string[]>();
const note = (map: Map<string, string[]>, key: string, file: string) => {
  const list = map.get(key) ?? [];
  if (!list.includes(file)) list.push(file);
  map.set(key, list);
};

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const rel = path.relative(root, file).replace(/\\/g, "/");
  for (const m of text.matchAll(/entity:([a-z0-9-]+)/g)) if (!entitySet.has(m[1]!)) note(badEntities, m[1]!, rel);
  for (const m of text.matchAll(/owner_entity_id: "([a-z0-9-]+)"/g)) if (!entitySet.has(m[1]!)) note(badEntities, m[1]!, rel);
  for (const m of text.matchAll(/(?:loadTopicPage|findTopic|page|members)\(["']([a-z0-9-]+)["']/g)) if (!topicSet.has(m[1]!)) note(badTopics, m[1]!, rel);
  for (const m of text.matchAll(/slug === ["']([a-z0-9-]+)["']/g)) if (!topicSet.has(m[1]!)) note(badTopics, m[1]!, rel);
}

const show = (title: string, map: Map<string, string[]>) => {
  console.log(`\n${title}：${map.size} 个`);
  for (const [key, list] of [...map].sort()) console.log(`  ${key}  ← ${list.join(", ")}`);
};
show("测试引用了但不存在的公司 id", badEntities);
show("测试引用了但不存在的主题 slug", badTopics);
console.log("\n（`slug === \"...\"` 也会被算进来，非主题的地方是误报，人工看一眼即可）");
