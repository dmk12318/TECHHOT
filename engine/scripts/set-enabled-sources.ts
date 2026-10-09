// 只启用命令行里点名的信源，其余停用（引擎没有后台界面时，用它代替后台的开关）。
// 传 --all 就按 industry/sources.json 恢复成全部启用。route B 没有后台，用这个代替后台的开关。
import { readFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";

const { sources } = JSON.parse(readFileSync(path.join(REPO_ROOT, "industry/sources.json"), "utf8")) as { sources: { id: string }[] };
const args = process.argv.slice(2);
const all = args.includes("--all");
const wanted = args.filter((a) => !a.startsWith("--"));
const known = new Set(sources.map((s) => s.id));

const unknown = wanted.filter((id) => !known.has(id));
if (unknown.length) { console.error(`清单里没有这些 id：${unknown.join(", ")}`); process.exit(1); }
if (!all && wanted.length === 0) { console.error("要么点名 id，要么加 --all"); process.exit(1); }

const target = all ? sources.map((s) => s.id) : wanted;
await sql`UPDATE sources SET enabled = false WHERE id <> ALL(${target}) AND enabled`;
await sql`UPDATE sources SET enabled = true WHERE id = ANY(${target}) AND NOT enabled`;
const on = await sql<{ id: string }[]>`SELECT id FROM sources WHERE enabled ORDER BY id`;
console.log(`启用 ${on.length} 条：${on.map((r) => r.id).join(", ")}`);
await closeDb();
