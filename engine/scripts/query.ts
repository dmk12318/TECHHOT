// 临时查询工具：node --env-file=.env scripts/query.ts "SELECT ..."（只读或小修小的运维用）
import { closeDb, sql } from "@aihot/backend/db";

const query = process.argv.slice(2).join(" ");
if (!query) { console.error("用法：node --env-file=.env scripts/query.ts \"SELECT 1\""); process.exit(1); }
const rows = await sql.unsafe(query);
console.log(JSON.stringify(rows, null, 1));
await closeDb();
