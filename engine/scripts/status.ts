// 看管线进度：文章/入选/事件的数量、各信源的抓取状况、最近跑过的定时任务、判过的条目。
// 用法：node --env-file=.env scripts/status.ts
import { closeDb, sql } from "@aihot/backend/db";

const [c] = await sql<{ articles: number; analyzed: number; selected: number; stories: number }[]>`
  SELECT (SELECT count(*)::int FROM articles) AS articles,
         (SELECT count(*)::int FROM analyses WHERE relevance = 'pass') AS analyzed,
         (SELECT count(*)::int FROM publications WHERE selected) AS selected,
         (SELECT count(*)::int FROM stories) AS stories`;
console.log(`文章 ${c!.articles}｜已判相关 ${c!.analyzed}｜入选 ${c!.selected}｜事件 ${c!.stories}`);

const rows = await sql<{ name: string; health: string; failed: number; enabled: boolean; last: string | null; error: string | null }[]>`
  SELECT s.name, s.health, s.fail_count AS failed, s.enabled,
         to_char(s.last_fetch_at, 'MM-DD HH24:MI') AS last, s.last_error AS error
  FROM sources s WHERE s.enabled ORDER BY s.name`;
for (const r of rows) console.log(`  ${r.name}: ${r.health}，失败 ${r.failed} 次，最近抓取 ${r.last ?? '未抓'}${r.error ? `｜错误：${r.error.slice(0, 80)}` : ''}`);

const runs = await sql<{ job: string; at: string; status: string; error: string | null }[]>`
  SELECT job, to_char(started_at, 'HH24:MI:SS') AS at, status, error
  FROM job_runs WHERE started_at > now() - interval '20 minutes' ORDER BY started_at DESC LIMIT 12`;
console.log("\n最近跑过的定时任务：");
for (const r of runs) console.log(`  ${r.at} ${r.job} ${r.status}${r.status === 'failed' ? `｜${(r.error ?? '').slice(0, 120)}` : ''}`);

const fetches = await sql<{ name: string; at: string; found: number; added: number; status: string; error: string | null }[]>`
  SELECT s.name, to_char(f.started_at, 'HH24:MI:SS') AS at, f.found_count AS found, f.new_count AS added, f.status, f.error
  FROM fetch_runs f JOIN sources s ON s.id = f.source_id
  WHERE f.started_at > now() - interval '20 minutes' ORDER BY f.started_at DESC LIMIT 10`;
console.log("\n最近的抓取：");
for (const f of fetches) console.log(`  ${f.at} ${f.name} ${f.status}：看到 ${f.found} 条，新增 ${f.added}${f.error ? `｜${f.error.slice(0, 120)}` : ''}`);

const picks = await sql<{ title: string; score: number | null; category: string | null; selected: boolean }[]>`
  SELECT a.title_zh AS title, a.score, a.category, p.selected
  FROM analyses a LEFT JOIN publications p ON p.article_id = a.article_id
  WHERE a.relevance = 'pass' ORDER BY a.score DESC NULLS LAST LIMIT 15`;
console.log("\n判过的（按分数）：");
for (const p of picks) console.log(`  ${p.selected ? '★' : ' '} ${p.score ?? '-'} [${p.category ?? '-'}] ${p.title}`);
await closeDb();
