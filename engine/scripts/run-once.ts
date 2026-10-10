// 跑一次就跑完的管线：采集 → 处理/评分/写作 → 归组 → 出刊，干完自己退出。
//
// 为什么需要它：引擎的 worker 是"一直开着等定时任务"的常驻进程（抓取每分钟看一次、处理每五分钟扫一次），
// 没有"把活干完然后退出"的入口。路线 B 用 GitHub Actions 定时跑，需要一个能自己结束的入口，
// 这个脚本就是：把 worker 注册的那套任务处理器装上，再把 worker 的定时任务在一个循环里反复调用，
// 直到没有任何待处理的活，然后出刊、退出。业务逻辑一行没改——调用的都是引擎自己的函数。
//
// 用法（在 engine/ 下跑）：
//   node --env-file=.env scripts/run-once.ts
//   node --env-file=.env scripts/run-once.ts --sources rss-ithome,rss-theverge   # 只抓这几个源
//   node --env-file=.env scripts/run-once.ts --no-collect                        # 不抓取，只干完队列里的活
//   node --env-file=.env scripts/run-once.ts --budget 60                         # 最长跑 60 分钟（默认 45）
//   node --env-file=.env scripts/run-once.ts --report-anyway                     # 出刊失败也算成功（调试用）
//
// 退出码：0 = 干完了（含"这一天没有大事，所以没出刊"）；1 = 超时还有活没干完；2 = 出刊失败。
import { assertProductionSecrets, config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { getBoss, stopBoss, workModuleQueues } from "@aihot/backend/jobs/queue";
import { installModules } from "@aihot/backend/modules";
import { registerContentJobs, sweepUnprocessed } from "@aihot/backend/jobs/content";
import { registerSourceJobs } from "@aihot/backend/jobs/sources";
import { registerEventJobs, sweepUngrouped } from "@aihot/backend/jobs/events";
import { registerNotifyJobs } from "@aihot/backend/jobs/notify";
import { registerPublicationJobs } from "@aihot/backend/jobs/publication";
import { collectSource, scheduleDueSources } from "@aihot/backend/sources/collect";
import { translatePending } from "@aihot/backend/editorial/translate";
import { linkRelatedStories } from "@aihot/backend/events/consolidate";
import { computeHotRanking } from "@aihot/backend/events/hot";
import { composeDueReports } from "@aihot/backend/reports/compose";
import { SERVER_MODULES } from "@aihot/site/modules/server";

const args = process.argv.slice(2);
const value = (name: string): string | null => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? (args[at + 1] ?? null) : null;
};
const budgetMinutes = Number(value("budget") ?? 45);
const onlySources = (value("sources") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const noCollect = args.includes("--no-collect");
const reportAnyway = args.includes("--report-anyway");

const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ level: "info", msg, ...extra }));

/**
 * 还有多少活没干完。due：现在就能处理的；waiting：排了重试时间的（引擎会等 10 分钟再试，
 * 这一轮不等它，留给下一次运行）；jobs：pg-boss 队列里还没跑完的（含延迟到点的 digest）。
 */
async function pending() {
  const [row] = await sql<{ due: number; waiting: number; ungrouped: number; jobs: number }[]>`
    SELECT
      (SELECT count(*)::int FROM articles
        WHERE processing_state = 'new' AND (processing_retry_at IS NULL OR processing_retry_at <= now())) AS due,
      (SELECT count(*)::int FROM articles
        WHERE processing_state = 'new' AND processing_retry_at > now()) AS waiting,
      (SELECT count(*)::int FROM articles a
        WHERE a.grouping_status = 'pending' AND a.processing_state = 'analyzed'
          AND EXISTS (SELECT 1 FROM analyses an WHERE an.article_id = a.id AND an.input_revision = a.revision
                      AND an.relevance = 'pass')) AS ungrouped,
      (SELECT count(*)::int FROM pgboss.job
        WHERE state IN ('created', 'active', 'retry') AND name NOT LIKE '__pgboss__%') AS jobs`;
  return row!;
}

const idle = (p: Awaited<ReturnType<typeof pending>>) => p.due === 0 && p.ungrouped === 0 && p.jobs === 0;

/** 反复调用 worker 的定时任务，直到没有待处理的活；返回是否在时限内干完。 */
async function drain(deadline: number, label: string): Promise<boolean> {
  let idleRounds = 0;
  let round = 0;
  while (true) {
    round += 1;
    await sweepUnprocessed();
    await sweepUngrouped();
    const translated = await translatePending({ budgetMs: 3 * 60_000 });
    const p = await pending();
    log("round", { label, round, ...p, translated: translated.done.length, quotes: translated.quotes });
    if (idle(p) && translated.done.length === 0) {
      idleRounds += 1;
      // 两轮都空才算真的空了：上一轮可能刚好在入队。
      if (idleRounds >= 2) return true;
    } else {
      idleRounds = 0;
    }
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, 15_000));
  }
}

const startedAt = Date.now();
const deadline = startedAt + budgetMinutes * 60_000;
let timedOut = false;
let reportFailed = false;
let summary: { articles: number; selected: number; stories: number } | null = null;

installModules(SERVER_MODULES);
assertProductionSecrets([["auth", "IMG_PROXY_SIGN_SECRET"]]);
if (!config.modelCallsEnabled) log("注意：MODEL_CALLS_ENABLED 不是 true，这一轮只会抓取，不会评分和写作");

const boss = await getBoss();

// 一次性运行没有排程器：定时任务由这个脚本自己按顺序触发。但常驻 worker 注册过的 cron 排程存在数据库里
// （pgboss.schedule），不清掉的话 pg-boss 会一直按点生成 cron.* 任务，而这里没有处理它们的处理器，
// 越堆越多、也让"队列空了"这个判断永远不成立。删掉这些队列就同时删掉了它的排程和残留任务。
for (const queue of await boss.getQueues()) {
  if (queue.name.startsWith("cron.")) {
    await boss.deleteQueue(queue.name);
    log("removed schedule", { queue: queue.name });
  }
}

await registerContentJobs(boss);
await registerSourceJobs(boss);
await registerEventJobs(boss);
await registerNotifyJobs(boss);
await registerPublicationJobs(boss);
await workModuleQueues(boss);
log("pipeline started", { budgetMinutes, onlySources: onlySources.length ? onlySources : "所有到期的源", noCollect });

try {
  if (!noCollect) {
    if (onlySources.length) {
      for (const id of onlySources) {
        const r = await collectSource(id, { force: true });
        log("collected", { sourceId: id, ...r });
      }
    } else {
      const r = await scheduleDueSources();
      log("scheduled", r);
    }
  }

  timedOut = !(await drain(deadline, "content"));

  if (!timedOut) {
    // 跨天的关联事件与热点榜：worker 里是每小时和每五分钟跑一次，这里各跑一次就够。
    await linkRelatedStories();
    await computeHotRanking();
    timedOut = !(await drain(deadline, "after-linking"));
  }

  if (!timedOut) {
    // 出刊失败时这个函数会抛错（不是返回 failed 列表）：比如"这一期的窗口里没有任何资料经过评判"，
    // 引擎把它当成采集或判断出了问题，而不是"平静的一天"。
    try {
      const composed = await composeDueReports();
      log("reports", composed);
      reportFailed = composed.failed.length > 0;
    } catch (error) {
      const message = String(error).slice(0, 600);
      // 只有周报/月报没出刊不算失败：它们唯一现实的失败原因就是"那一期没有日报条目"——
      // 比如站点刚上线，上一周/上个月还没出过刊。模型写总述失败不会让整期失败（引擎会存一份没有总述的），
      // 真要出故障，日报会先报错。
      const failedPart = message.match(/^Error: reports: (.+?) failed/)?.[1] ?? "";
      const failing = failedPart.split(", ").filter(Boolean);
      if (failing.length > 0 && failing.every((f) => /^(weekly|monthly):/.test(f))) {
        log("reports: 周报/月报跳过（那一期没有日报条目）", { failed: failing });
      } else {
        log("reports failed", { error: message });
        reportFailed = true;
      }
    }
    // 出刊后可能还有推送、事件综述之类的尾巴，再排空一次。
    if (!(await drain(Math.min(deadline, Date.now() + 5 * 60_000), "after-reports"))) log("出刊后的收尾没在时限内跑完");
  }
  const [row] = await sql<{ articles: number; selected: number; stories: number }[]>`
    SELECT (SELECT count(*)::int FROM articles) AS articles,
           (SELECT count(*)::int FROM publications WHERE selected) AS selected,
           (SELECT count(*)::int FROM stories) AS stories`;
  summary = row ?? null;
} finally {
  await stopBoss();
  await closeDb();
}

if (summary) log("summary", summary);
log("pipeline finished", { seconds: Math.round((Date.now() - startedAt) / 1000), timedOut, reportFailed });

if (timedOut) process.exit(1);
if (reportFailed && !reportAnyway) process.exit(2);
process.exit(0);
