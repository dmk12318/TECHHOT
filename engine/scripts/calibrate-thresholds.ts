// 算门槛曲线：绕开 eval-selection.ts 的取数 bug（见 scripts/环境说明.md），自己算查准/查全与最优门槛。
// 先跑一次 node --env-file=.env scripts/eval-selection.ts（让它产出报告），再跑这个脚本。
//
// 为什么需要它：eval-selection.ts 只跑「预筛 + 两次评分」，不跑写标题摘要那一步，
// 但它判定入选时用的是 normalizeAnalysis 的 relevance —— 那个值只有在写完标题摘要后才可能是 "pass"，
// 所以评测里每条都成了 unknown，任何门槛下 sel 都是 0。这是上游脚本的 bug（见 docs/执行清单.md）。
// 这里改用预筛自己的标签来算：pass 且分数过门槛才算入选。
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { SELECTION } from "@aihot/industry/selection";

interface Gold {
  caseId: string;
  sourceFacts: { sourceTier?: string };
  gold: { decision: "select" | "reject" | "either" };
}

const dataDir = path.join(REPO_ROOT, ".data");
const gold = readFileSync(path.join(dataDir, "gold.jsonl"), "utf8").split("\n").filter((l) => l.trim())
  .map((l) => JSON.parse(l) as Gold);

const evalDir = path.join(dataDir, "eval");
const latest = readdirSync(evalDir).filter((f) => f.startsWith("selection-")).sort().at(-1);
if (!latest) throw new Error("找不到评测报告，先跑一次 scripts/eval-selection.ts");
const report = JSON.parse(readFileSync(path.join(evalDir, latest), "utf8")) as {
  models: Record<string, { cases: Array<{ caseId: string; score: number | null }> }>;
};
const scores = new Map<string, number | null>();
for (const model of Object.values(report.models)) for (const c of model.cases) scores.set(c.caseId, c.score);

// 预筛的标签从回执里取（评测的每一步都有回执）。
const rows = await sql<{ subject: string; response: Record<string, unknown> }[]>`
  SELECT subject, response FROM receipts WHERE purpose = 'prefilter_article' AND subject LIKE '%gold-%'`;
const labels = new Map<string, string>();
for (const r of rows) {
  const id = r.subject.replace(/^article:gold-/, "").replace(/@\d+$/, "");
  const content = (r.response as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content ?? "";
  try { labels.set(id, String((JSON.parse(content) as { label?: string }).label ?? "").toUpperCase()); } catch { /* 解析不了就当没有 */ }
}
await closeDb();

const cases = gold.map((g) => ({
  id: g.caseId,
  tier: g.sourceFacts.sourceTier ?? "T2",
  gold: g.gold.decision,
  label: labels.get(g.caseId) ?? "?",
  score: scores.get(g.caseId) ?? null,
}));

console.log(`样本 ${cases.length}：预筛 pass ${cases.filter((c) => c.label === "PASS").length}｜block ${cases.filter((c) => c.label === "BLOCK").length}｜unknown ${cases.filter((c) => c.label === "UNKNOWN").length}｜缺回执 ${cases.filter((c) => c.label === "?").length}`);
console.log(`有分数 ${cases.filter((c) => c.score !== null).length}，最高 ${Math.max(...cases.map((c) => c.score ?? -1))}`);

function metrics(pick: (threshold: number) => Map<string, boolean>) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const c of cases) {
    if (c.gold === "either") continue;
    const sel = pick(0).get(c.id) ?? false;
    if (sel && c.gold === "select") tp++;
    else if (sel) fp++;
    else if (c.gold === "select") fn++;
    else tn++;
  }
  const p = tp / Math.max(1, tp + fp), r = tp / Math.max(1, tp + fn);
  return { tp, fp, fn, tn, P: +p.toFixed(3), R: +r.toFixed(3), F1: +((2 * p * r) / Math.max(1e-9, p + r)).toFixed(3), acc: +((tp + tn) / Math.max(1, tp + fp + fn + tn)).toFixed(3) };
}

// 站点现在的口径：门槛按信源分级。
const tierMode = (extra: number) => (t: number) => {
  const out = new Map<string, boolean>();
  for (const c of cases) out.set(c.id, c.label === "PASS" && c.score !== null && c.score >= (SELECTION.thresholds[c.tier] ?? 999) + extra);
  void t;
  return out;
};

console.log("\n按站点现在的分级门槛（T1 60 / T1_5 65 / T2 76）：");
console.log("  " + JSON.stringify(metrics(tierMode(0))));
for (const extra of [-6, -10, -14, -18, -22]) {
  console.log(`  分级门槛整体 ${extra} 分：` + JSON.stringify(metrics(tierMode(extra))));
}

const tierSet = (t1: number, t15: number, t2: number) => {
  const withSet = () => {
    const out = new Map<string, boolean>();
    for (const c of cases) {
      const th = c.tier === "T1" ? t1 : c.tier === "T1_5" ? t15 : t2;
      out.set(c.id, c.label === "PASS" && c.score !== null && c.score >= th);
    }
    return out;
  };
  return metrics(withSet);
};
console.log("\n几组分级门槛：");
for (const [a, b, c] of [[48, 50, 52], [50, 52, 54], [52, 54, 56], [50, 54, 58], [46, 50, 54], [52, 52, 52]] as const) {
  const m = tierSet(a, b, c);
  console.log(`  T1=${a} T1_5=${b} T2=${c}\tP=${m.P}\tR=${m.R}\tF1=${m.F1}\tacc=${m.acc}\ttp=${m.tp}\tfp=${m.fp}\tfn=${m.fn}`);
}

console.log("\n统一门槛扫描（只要求预筛 pass）：");
for (let t = 40; t <= 84; t += 4) {
  const m = metrics(() => {
    const out = new Map<string, boolean>();
    for (const c of cases) out.set(c.id, c.label === "PASS" && c.score !== null && c.score >= t);
    return out;
  });
  console.log(`  t=${t}\tP=${m.P}\tR=${m.R}\tF1=${m.F1}\tacc=${m.acc}\ttp=${m.tp}\tfp=${m.fp}\tfn=${m.fn}`);
}

console.log("\n标了该选、但预筛没放行的（FN 的来源）：");
for (const c of cases.filter((c) => c.gold === "select" && c.label !== "PASS")) console.log(`  ${c.id} 预筛=${c.label} 分数=${c.score ?? "-"} ${c.tier}`);

for (const t of [52, 60]) {
  console.log(`\n门槛 ${t} 时的分歧（gold 来自我的标注）：`);
  for (const c of cases) {
    if (c.gold === "either" || c.label !== "PASS" || c.score === null) continue;
    const sel = c.score >= t;
    if (sel && c.gold === "reject") console.log(`  多选(FP) ${c.id} ${c.score} ${c.tier} ${c.id}`);
    if (!sel && c.gold === "select") console.log(`  漏选(FN) ${c.id} ${c.score} ${c.tier}`);
  }
}
