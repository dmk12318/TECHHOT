// 静态导出的站点没有后端：/pool.json（导出时生成）带着「全部动态」的全部条目，
// 列表的筛选/翻页和搜索都在这里前端算。开发环境没有这个文件，读不到就返回 null，各处保持原样走服务端。

import type { FeedItemSummary, PoolResponse, TimelineFilters } from "@aihot/contracts/site";
import { CATEGORY_LABELS, type CategoryKey } from "@aihot/contracts/taxonomy";
import { beijingDate } from "@aihot/contracts/time";

/** 和 /api/site/pool 一样：每页 40 条，最多 50 页。 */
const PAGE_SIZE = 40;
const MAX_PAGES = 50;

export interface LocalData {
  /** T1 信源的名字：「一手」这个筛选按它们来（公开接口不给信源分级）。 */
  t1: string[];
  items: FeedItemSummary[];
}

let loading: Promise<LocalData | null> | null = null;

/** 只读一次；读不到就不再试（静态站上要么有这份数据，要么就没有）。 */
export function loadLocalData(): Promise<LocalData | null> {
  loading ??= fetch("/pool.json")
    .then((res) => (res.ok ? (res.json() as Promise<LocalData>) : null))
    .catch(() => null);
  return loading;
}

/** 搜索词拆成若干词；和站上一样，每个词都要命中，只是不搜正文。 */
function searchTerms(q: string): string[] {
  return q.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
}

/** 命中得分：标题里的词比摘要里的重。0 表示没命中。 */
function hitScore(item: FeedItemSummary, terms: string[]): number {
  if (terms.length === 0) return 0;
  const title = item.title.toLowerCase();
  const summary = (item.summary ?? "").toLowerCase();
  let total = 0;
  for (const term of terms) {
    const inTitle = title.includes(term);
    const inSummary = summary.includes(term);
    if (!inTitle && !inSummary) return 0;
    total += inTitle ? 3 : 1;
  }
  return total;
}

const newestFirst = (a: FeedItemSummary, b: FeedItemSummary) => Date.parse(b.timelineAt) - Date.parse(a.timelineAt);

/** 一条搜索结果的展示信息（地址、标题、摘要、类别、来源、日期）。 */
export interface LocalHit {
  u: string;
  t: string;
  s: string;
  c: string;
  src: string;
  d: string;
}

/** 搜索：标题命中排在摘要命中前面，最多 limit 条。 */
export function searchLocalData(data: LocalData, query: string, limit = 12): LocalHit[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return [];
  return data.items
    .map((item) => ({ item, score: hitScore(item, terms) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || newestFirst(a.item, b.item))
    .slice(0, limit)
    .map(({ item }) => ({
      u: `/items/${item.id}`,
      t: item.title,
      s: item.summary ?? "",
      c: item.category ? (CATEGORY_LABELS[item.category as CategoryKey] ?? "") : "",
      src: item.source?.name ?? "",
      d: (item.publishedAt ?? "").slice(0, 10),
    }));
}

/** 「一手」= T1 信源的条目；公开接口没给分级，导出时把 T1 的名字写进了 pool.json。 */
function isFirstParty(item: FeedItemSummary, t1: string[]): boolean {
  const name = item.source?.name;
  return !!name && t1.includes(name);
}

export interface LocalPoolQuery extends TimelineFilters {
  q?: string | null;
  tab?: "time" | "relevance";
  page?: number;
}

/**
 * 静态站上的「全部动态」：筛选、搜索、翻页都在本地算，返回的形状和 /api/site/pool 一样，
 * 页面按原来的方式渲染。比服务端少的只有：只搜标题与摘要（不搜正文），相关度只按标题/摘要算。
 */
export function localPoolView(data: LocalData, query: LocalPoolQuery, now: number): PoolResponse {
  const q = query.q?.trim() || null;
  const tab = q && query.tab === "relevance" ? "relevance" : "time";
  const terms = q ? searchTerms(q) : [];
  const matched = data.items
    .filter((item) => (query.channel === "firstParty" ? isFirstParty(item, data.t1) : !query.channel || query.channel === "all" || item.channel === query.channel))
    .filter((item) => !query.category || item.category === query.category)
    .filter((item) => !query.tag || item.tags.includes(query.tag));
  const filtered = terms.length === 0
    ? [...matched].sort(newestFirst)
    : matched
      .map((item) => ({ item, score: hitScore(item, terms) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => (tab === "relevance" ? b.score - a.score || newestFirst(a.item, b.item) : newestFirst(a.item, b.item)))
      .map((x) => x.item);
  const total = filtered.length;
  const page = Math.min(Math.max(query.page ?? 1, 1), MAX_PAGES);
  const today = beijingDate(now);
  return {
    filters: { channel: query.channel ?? "all", category: query.category ?? null, tag: query.tag ?? null, q, tab },
    items: filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    page,
    pageCount: Math.min(MAX_PAGES, Math.max(1, Math.ceil(total / PAGE_SIZE))),
    total,
    todayCount: filtered.filter((item) => beijingDate(item.timelineAt) === today).length,
    freshness: filtered[0]?.timelineAt ?? new Date(now).toISOString(),
  };
}
