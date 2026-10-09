// 把候选文件和人工标注合成 eval-selection.ts 要的 gold.jsonl。
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";

const dir = path.join(REPO_ROOT, ".data");
const candidates = readFileSync(path.join(dir, "gold-candidates.jsonl"), "utf8")
  .split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as Record<string, unknown> & { caseId: string; gold: { decision: string } });

const labels = new Map<string, string>();
for (const line of readFileSync(path.join(dir, "gold-labels.txt"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const [id, decision] = t.split(/\s+/);
  if (!/^(select|reject|either)$/.test(decision ?? "")) throw new Error(`标注不合法：${t}`);
  labels.set(id!, decision!);
}

const out = candidates.map((c) => {
  const { _dbId, ...rest } = c as Record<string, unknown>;
  void _dbId;
  return JSON.stringify({ ...rest, gold: { decision: labels.get(c.caseId) ?? "reject" } });
});
writeFileSync(path.join(dir, "gold.jsonl"), out.join("\n") + "\n");

const count = (d: string) => candidates.filter((c) => (labels.get(c.caseId) ?? "reject") === d).length;
console.log(`写入 .data/gold.jsonl：${out.length} 条（select ${count("select")}／either ${count("either")}／reject ${count("reject")}）`);
const unknown = [...labels.keys()].filter((id) => !candidates.some((c) => c.caseId === id));
if (unknown.length) console.log(`警告：标注里有候选文件里没有的 caseId：${unknown.join(", ")}`);
