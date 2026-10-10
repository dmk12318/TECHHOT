# 项目状态 · DAILY HOT

> 长期状态文件，每次交接**覆盖更新**。本次快照见同目录 `HANDOFF-2026-10-10.md`。
> 最后更新：2026-10-10

## 1. 目标与完成标准

- **目标**：中文科技新闻站，站名 **TECH HOT**，读者是「有阅读新闻需求与习惯的公职人员」。
  科技是第一个板块；按 2026-10-10 的决定，将来 DAILY HOT 做成**导航页**（六块各列本期最热五条），
  不做一个实例里缝多个板块，也不做跨板块去重。
- **完成标准**：每天按固定时刻出刊，一件事一条；外文报道有中文标题与摘要；某个源抓取失败时
  如实标注数据截止时间、不假装最新；站点对外可访问。
- **不做**：不沿用旧项目「每日新闻」的 219 条源清单；不复制全文、不绕付费墙；
  不用需要绑卡或长期租金的付费服务器（**只出模型费**）；科技只做门户意义上的科技。

## 2. 已验证的结论

| 结论 | 证据出处 |
| --- | --- |
| 引擎与领域分离：换行业只动 `engine/industry/` 与 `engine/site/` | `engine/docs/customize.md` |
| 引擎自带完整链路：预筛 → 两次独立打分 → 结构化 → 写作 → 归组去重 → 出刊 | `engine/docs/selection.md` |
| 门槛必须按领域重校准；本轮查出 **查全 1.0 / 查准 0.727 / F1 0.842**，门槛定为 T1 48 / T1_5 50 / T2 52 | `records/决策记录.md` 2026-10-09；`engine/industry/selection.ts` |
| 55 条科技信源全部可用（36 条原生 feed + 19 条 Google News 兜底） | `docs/规范/科技源清单.md`、`docs/规范/feed-实测.md` |
| 路线 B 能跑通：Actions 里跑一次管线 + 预渲染成静态站，每天定时出刊 | `.github/workflows/daily.yml`；2026-10-10 那期日报已生成 |
| **静态站真正的问题在「动态页面」而不是「慢一拍」**：列表、筛选、翻页、搜索原先全是静默失效 | `engine/apps/web/tests/static-nav.test.ts` 的 5 项体检；`records/决策记录.md` 2026-10-10 |
| 静态站只靠一份本地数据（`pool.json`）+ 预渲染页面就能做到：条目页可达、筛选/翻页/搜索都在浏览器里算 | 同上；本机与 CI 的体检都 5/5 通过 |
| Pages **项目站**是子路径（`/TECHHOT/`），构建必须同时设 Vite 的 `base` 与 React Router 的 `basename`，且两者逐字相同 | `records/决策记录.md` 2026-10-10；`engine/apps/web/{vite.config.ts,react-router.config.ts}` |
| 用 workflow 的 `GITHUB_TOKEN` **建不了** Pages 站点 | CI 报 `Resource not accessible by integration`（run 38025323855） |
| 导出脚本在 Linux 上要按 Node 前缀的 `lib/` 找 npm（不是 `node.exe` 旁边） | 同上；修完 CI 导出通过 |
| 网页进程**不能**吃预渲染过的 `apps/web/build/client`（静态文件会盖住动态路由，`cache.test.ts` 会挂） | 本机实测；`engine/scripts/export-static.ts` 顶部提醒 |
| `github.io` 在国内的**可达性仍未实测**（本机挂 VPN 测不准） | 待办，见第 6 节 |

## 3. 已否决的方案（别重走）

- 在旧项目「每日新闻」里改造；只做 AI；沿用旧 219 条源清单；从零自己写引擎；
  用 AIHOT 的名字与 Logo；租按月计费的 VPS；把服务搬到 Cloudflare Workers（改动比路线 B 还大）；
  本机常开 + 隧道对外。
- 2026-10-10 新增否决：
  - 六站独立 + 门户做跨板块去重聚簇、另出综合日报（要做约 300 个外部信源、热度会塌、代价不成比例）。
  - 静态站的「全部动态」只列精选（等于把「全部动态」变成「精选」的副本，搜索也只剩几十条）。
  - 静态站保留「Agent 接入」页（讲的是公开 API 与 MCP，静态站永远没有后端）。
  - 把仓库改名成 `dmk12318.github.io` 走根路径（会让仓库名与站名割裂，以后接自定义域名还是要改一次）。

## 4. 关键文件与定稿位置

| 文件 | 用途 |
| --- | --- |
| `AGENTS.md` | 项目规则与关键口径，**唯一规则正文** |
| `docs/执行清单.md` | 进度总览，**先读这个** |
| `records/决策记录.md` | 所有已定决定（含 2026-10-10 静态站与 Pages 的两条） |
| `records/部署路线评估.md` | 路线 A/B 的代价对比（已拍板走 B） |
| `scripts/环境说明.md` | 依赖、常用命令、本机踩过的坑 |
| `scripts/Neon免费库说明.md`、`scripts/GitHub仓库配置教程.md` | 环境与仓库配置教程 |
| `engine/industry/` | 领域配置：类别、主题、信源、提示词、门槛 ← 主要改动区 |
| `engine/site/` | 站点身份：站名文案、品牌、条款 ← 次要改动区 |
| `engine/scripts/run-once.ts` | 跑一次就跑完的管线（路线 B 的核心入口） |
| `engine/scripts/export-static.ts` | 静态导出：预渲染 + 静态文件 + RSS/sitemap/llms + 分享图 + 本地数据 |
| `engine/apps/web/tests/static-nav.test.ts` | 静态站上线前体检（5 项，CI 里必跑） |
| `.github/workflows/{daily.yml,pages.yml,ci.yml}` | 出刊+发布 / 推代码就发布 / 检查 |
| `.handoff/` | 交接状态，由交接 skill 写入，不要手工改 |

## 5. 真实进度

- **阶段 0（环境）✓**：Node 24.21.0（`D:\Environment\nodejs`）、Neon（us-east-2, PG17）、
  本机 PostgreSQL 17（测试用）、DeepSeek key 已配。`npm run typecheck` 通过。
- **阶段 1（改成科技板块）✓**：7 个类别、55 条信源、30 个主题、提示词全改、门槛校准完。
- **阶段 2（云端定时）✓**：`run-once.ts` 跑完即退；仓库 `github.com/dmk12318/TECHHOT`（public）；
  2026-10-10 那期日报已生成；`ci.yml` 在 `be6fbc2` 上全绿。
- **阶段 3（静态导出与发布）**：导出、体检、发布流程都写好了，
  **只差在仓库设置里把 Pages 开一次**（见第 7 节）。
  - 已完成：498～516 页预渲染（含「全部动态」每一条）、本地数据 `pool.json`、RSS/sitemap/llms、
    分享图（带缓存）、`.nojekyll`、子路径前缀、5 项上线前体检。
  - **待验收**：`https://dmk12318.github.io/TECHHOT/` 还没真正打开过（Pages 未启用，
    发布流程停在「准备 GitHub Pages」那一步）。
- **阶段 4/5**：未开始（国内可达性实测、缺期告警替代方案、Neon 备份策略、第二个板块与导航页）。

## 6. 未完成项与已知风险

1. **Pages 站点要人工开一次**：仓库 → Settings → Pages → Source 选「GitHub Actions」。
   之后 `pages.yml`（推代码）与 `daily.yml`（跑完管线）都会自动发布。
2. **国内可达性没实测**：对公职人员读者这是最要紧的一条；`github.io` 在境内时好时坏，
   实测过再决定要不要换托管或挂自定义域名。
3. **分享图成本会涨**：每张都要渲染一次，靠「抓过的存 `.data/og` + CI 缓存」只补新增；
   池子封顶 2000 条、预渲染页数最多约 2200 页。
4. **静态站的两个已知缺口（已接受）**：条目页的「事件后续」不显示；没有公开 API/MCP
   （Agent 页已删）。要恢复只能另找地方把 api 跑起来。
5. **动过引擎本体**（删了 Agent 页，改了 `routes.ts`/`nav.ts`/`more.tsx`/`terms.tsx`/`sitemap.ts`）：
   以后合上游更新时这几处会冲突，要么保留删除、要么把页面找回来。做法见 `records/决策记录.md`。
6. **门槛样本只有 90 条、来源偏 IT之家**，攒到 200 条以上要重跑校准。
7. **周报/月报那一期没有日报条目会被跳过**（已降级成警告，周一之后自动消失）。
8. **备份**：库在 Neon 免费版（恢复窗口只有 6 小时），导出策略还没定。
9. **图片代理没落地**：站内图片仍走 `/api/img-proxy`，静态站上这些图取不到。

## 7. 下一步第一步

1. **用户点一次**：https://github.com/dmk12318/TECHHOT/settings/pages → Source 选「GitHub Actions」→ Save。
2. 跑一次发布：Actions → 发布 → Run workflow（或随便推一个 commit；20:10 的出刊也会自己发一次）。
3. **验收**（本轮唯一没验的环节）：打开 `https://dmk12318.github.io/TECHHOT/`，依次看
   首页 / 「全部动态」点进一条 / 手机上开搜索搜一个词 / `feed.xml` 打不打得开。
   有问题先看 Actions 的 `::error::` 注解（公开，不用登录）。
