// 把库里已采集的资料导成 Gold 候选文件（校准选稿门槛用）。
// 导出的 gold.decision 先填 either（评测不计入准确率），标完之后再写入真实结论。
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";

const limit = 90;
const rows = await sql<{
  id: number; title: string; language: string | null; published_at: Date | null; body_text: string | null;
  source_name: string; kind: string; tier: string; first_party: boolean; score: number | null; category: string | null;
}[]>`
  SELECT a.id, a.title, a.language, a.published_at, a.body_text, s.name AS source_name, s.kind, s.tier, s.first_party,
         x.score, x.category
  FROM articles a
  JOIN sources s ON s.id = a.source_id
  LEFT JOIN analyses x ON x.article_id = a.id
  WHERE a.body_status = 'ok' AND a.body_text IS NOT NULL AND length(a.body_text) > 200
  ORDER BY a.published_at DESC NULLS LAST
  LIMIT ${limit}`;

const out: string[] = [];
const list: string[] = [];
for (const [i, r] of rows.entries()) {
  const caseId = `t-${String(i + 1).padStart(3, "0")}`;
  const body = (r.body_text ?? "").slice(0, 4000);
  const zh = (r.language ?? "").toLowerCase().startsWith("zh");
  out.push(JSON.stringify({
    caseId,
    material: {
      title: r.title,
      originalTitle: null,
      publishedAt: r.published_at ? r.published_at.toISOString() : null,
      sourceName: r.source_name,
      bodyZh: zh ? body : null,
      bodyOriginal: zh ? null : body,
    },
    sourceFacts: { sourceKind: r.kind, sourceTier: r.tier, firstParty: r.first_party, language: r.language },
    samplingContext: { benchmarkSplit: "development", samplingStratum: r.category ?? "unjudged" },
    gold: { decision: "either" },
    _dbId: r.id,
  }));
  list.push(`${caseId}\t${r.tier}\t${r.score ?? "-"}\t${r.category ?? "-"}\t${r.source_name}\t${r.title}`);
}

const dir = path.join(REPO_ROOT, ".data");
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, "gold-candidates.jsonl"), out.join("\n") + "\n");
writeFileSync(path.join(dir, "gold-list.txt"), list.join("\n") + "\n");
console.log(`导出 ${rows.length} 条到 .data/gold-candidates.jsonl，清单在 .data/gold-list.txt`);
await closeDb();
