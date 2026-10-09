# Neon 免费库说明

本项目的数据库放在 Neon 上（路线 B：GitHub Actions 定时跑 + 免费 Postgres + 静态页）。
这份文件只讲 Neon 这一件事：它给多少、怎么建、怎么接到引擎上、哪里会踩坑。

不用 Neon 也可以换 Supabase，接口都是 PostgreSQL，文中标出 Neon 专属的地方即可。

## 一、免费额度给多少

以下数字来自 Neon 官方定价页（2026-10-09 查）：

| 项目 | 免费计划 |
| --- | --- |
| 月费 | $0 |
| 项目数 | 100 |
| 每个项目的分支 | 10 |
| 计算 | 每项目每月 100 CU-hours，自动伸缩到 2 CU（约 8 GB 内存） |
| 存储 | 每项目 1 GB，全部项目合计 20 GB |
| 出网流量 | 每项目每月 5 GB |
| 恢复窗口 | 6 小时（快照最多 1 GB 变更） |
| 手动快照 | 1 个 |
| 监控历史 | 1 天 |
| 闲置休眠 | 5 分钟无请求就挂起，**免费计划不能关** |

## 二、计费口径：CU-hours 怎么算

这是最容易被"100 小时"误导的地方：

- **CU-hour 是"计算量"的单位，不是墙上时间。** 按 1 CU 跑满 1 小时 = 1 CU-hour；
  如果当时自动伸缩到了 2 CU，跑 1 小时就吃掉 2 CU-hours。
- **挂起的计算不计量。** 官方原话：`Computes that are suspended do not accrue CU-hours.`
  免费计划 5 分钟没请求就挂起，所以闲置不花钱。
- 每次有新请求，计算在毫秒级唤醒。

按我们这个用法估算：每天跑一次管线，假设活跃半小时、期间伸缩到 2 CU，
一天约 1 CU-hour，一个月 30 CU-hours 左右，**离 100 还有三倍余量**。

反过来说，**别让库 24 小时有人查**——真按 2 CU 常驻跑满一个月要 1400 CU-hours，
额度几天就没了。这也是路线 B 比路线 A 省心的地方：我们本来就没有常驻服务。

> 要注意：Neon 里**每个分支是独立的计算**，各自计 CU-hours。
> 我们不需要分支，别随手建。

## 三、超额会发生什么

官方说明（原文要点）：

- 用光 CU-hours 或出网流量 → **计算被挂起**，等到下个计费周期或你升级为止。
- 超出 1 GB 存储、或全部项目合计 20 GB → **写入（insert/update/delete）失败**，直到腾出空间或升级。
- 分支建满 10 个 → 建新分支失败。
- **这些限制都不会删除你的数据。**

CU-hours 和出网流量每月重置；项目数、分支数、存储是持续上限。

## 四、注册和建项目（逐步）

### 动手前

- 用 Edge 或 Chrome，**把广告拦截、隐私保护这类插件临时关掉**——它们最常见的后果是验证码过不去。
- **VPN 保持开着**：注册页在境外，以后连库也走它。
- 想好用哪个邮箱。有 GitHub 或 Google 账号的话，直接用它们授权登录，能省掉"收确认邮件"这一步。

### 路径 A：网页控制台（推荐，所见即所得）

1. 打开 https://console.neon.tech/signup
2. 选登录方式：优先 **GitHub / Google 授权**。用邮箱注册的话，注册完要去邮箱点确认链接，
   没收到就翻垃圾邮件。
3. 第一次进去会让你建组织（Organization）。名字随便，填 `dailyhot`，没有别的必填项。
4. **New Project 向导**，四个字段：

   | 字段 | 填什么 |
   | --- | --- |
   | Project name | `dailyhot` |
   | Region | **AWS US East (N. Virginia) 或 (Ohio)**。别选新加坡、别选欧洲 |
   | Services → Postgres database | 保持打开，展开它 |
   | Postgres version | **17**（默认是 18，要手动改） |

   Object storage / Functions / AI gateway / Neon Auth 这几个都不用开。
5. 点 Create project，等十几秒。
6. 建完的默认资源（知道就行，不用改）：分支叫 `production`，库叫 `neondb`，
   角色叫 `neondb_owner`（建扩展要用这个角色）。
7. 拿连接串：项目页上的 **Connect** 面板。
   - 面板上有个 **Connection pooling** 开关。两种状态都看一眼，**要主机名里不带 `-pooler` 的那串**
     （文档说这个开关对新项目默认是开着的，所以多半你得手动切一次）。
   - 点眼睛图标才看得见密码，然后点复制。
   - **别点 Reset password**，会把已经在用的连接全部作废。

### 路径 B：命令行（授权之后我能接手大半）

浏览器那一步躲不掉——`neon login` 会弹浏览器让你授权，那是你的身份。但**授权之后**，
建项目、建库、拿连接串都能在命令行里做，这些我可以替你跑（装 CLI 要先批准一次）。

```powershell
npm i -g neon                 # 全局装 Neon CLI（或者直接用 npx neon，不装全局）
neon login                    # 弹浏览器授权，这步你本人做

# 建项目：CLI 默认建 Postgres 18，必须显式写 17；默认区域是 aws-us-east-2
neon projects create --name dailyhot --pg-version 17 --region-id aws-us-east-1

# 再建两个库（第六节要用的那两个）
neon databases create --name dailyhot_test --owner-name neondb_owner
neon databases create --name postgres --owner-name neondb_owner

# 拿 direct 串：不加 --pooled 就是 direct
neon connection-string --database-name neondb

# 没装 psql 也能进 SQL：neon 自带一个 TypeScript 版实现
neon psql
```

`--region-id` 能填的值就这些：`aws-us-east-1`、`aws-us-east-2`、`aws-us-west-2`、
`aws-eu-central-1`、`aws-ap-southeast-1`、`aws-ap-southeast-2`。

顺便：**被删掉的项目 7 天内能从命令行/接口找回**，所以万一误删不用慌。

### 卡住了怎么办

| 你卡在哪 | 怎么办 |
| --- | --- |
| 网页打不开、一直转圈 | 确认 VPN 开着；`neon.com` 和 `console.neon.tech` 都试一遍；换个浏览器 |
| 人机验证（验证码）过不去 | 十有八九是 VPN 节点被标记：换一个节点；关掉插件和隐私模式再试 |
| 点注册没反应 | 关广告拦截插件；换 Edge 试 |
| 确认邮件收不到 | 翻垃圾邮件；直接用 GitHub / Google 登录可以完全绕开这一步 |
| 要你绑卡 | 免费计划不该要卡。真出现了**先别填**，告诉我，我们换 Supabase |
| Region 下拉里没有美东 | 它列出来的才是能选的；先选 `Ohio`，实在没有就选离得近的，并把情况告诉我 |
| Postgres version 只有 18 | 先别建，告诉我——引擎文档写的是支持 16 或 17，我得先核 18 上有没有问题 |
| 建完找不到连接串 | 项目页找 **Connect** 按钮；或者用路径 B 的 `neon connection-string` |
| 分不清 direct 和 pooled | 看主机名：**带 `-pooler` 的是池化，我们要不带的那个** |
| `CREATE DATABASE` 报不能放在事务里 | 一次只选中一条语句运行，别和别的语句一起跑 |

### 一句提醒

官方公告里提到，**Azure 区域的免费项目闲置 90 天以上会被删除**。
我没在免费计划条款里找到别的"闲置多久删项目"规则，而且我们每天都有任务跑，不会闲置。
但这条说明一件事：这是别人家的免费资源，长期数据要有自己的备份（见第九节）。

## 五、连接串：必须用 direct，不要用 -pooler

Neon 控制台 Dashboard → Connect 里的连接串面板上有个 **Connection pooling** 开关。
它只是切换显示哪个串：

- **带 `-pooler` 的（池化）**：PgBouncer 事务模式。`SET`、临时表、`LISTEN/NOTIFY`、
  SQL 级 `PREPARE/DEALLOCATE` 都不支持。
- **不带 `-pooler` 的（direct）**：直连。

**本项目必须用 direct 那一串**，理由三条：

1. 引擎要跑迁移（`CREATE INDEX CONCURRENTLY`、设置 `lock_timeout`/`statement_timeout` 这类会话级参数）；
2. 引擎用 pg-boss 做任务队列；
3. 引擎测试会建库删库（`CREATE DATABASE` / `DROP DATABASE ... WITH (FORCE)`），这些在事务池下都不行。

官方对池化连接的建议里也写着：schema 迁移、`pg_dump`、依赖会话状态的查询要用 direct。

串的样子：

```text
postgresql://<user>:<password>@ep-xxx-xxx.<region>.aws.neon.tech/neondb?sslmode=require
```

两件事说明：

- **`sslmode=require` 必须留着。** Neon 要求 SSL。我翻了引擎用的 postgres.js 源码，
  它对 `sslmode=require|allow|prefer` 会设 `rejectUnauthorized = false`，
  也就是能连上、但不校验证书链——对免费项目够用，`verify-full` 才需要配 CA。
- **密码里的特殊字符要 URL 编码。** 密码里如果有 `@ : / ? #` 之类，
  直接拼进串会解析错，要么换成不含这些字符的密码，要么按 `%XX` 编码。

## 六、建库和装扩展

Neon 项目里默认有一个库叫 `neondb`，一个角色叫 `neondb_owner`（建扩展要用这个角色，它才有权限）。

要额外建**一个**库（`postgres` 那个先查一下，有了就跳过）：

| 库名 | 干什么用 | 为什么非要有 |
| --- | --- | --- |
| `dailyhot_test` | 跑 `npm test` | 引擎要求测试库名以 `_test` 或 `_ci` 结尾，它会自己建副本并行跑 |
| `postgres` | 测试代码连它来建/删副本库 | 少了 `npm test` 会报 `database "postgres" does not exist`。**实测：新建的项目里本来就有这个库，** 建的时候报 `already exists` 直接跳过就行 |

在控制台的 SQL Editor 里跑：

```sql
CREATE DATABASE dailyhot_test;
CREATE DATABASE postgres;
```

跑完用这句对一下现在的库列表（连在 `neondb` 上跑）：

```sql
SELECT datname FROM pg_database ORDER BY datname;
```

期望看到 `dailyhot_test`、`neondb`、`postgres`、`template0`、`template1`。

再确认引擎要用的扩展装得上（迁移脚本第一步就是它）：

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

我在 Neon 的扩展清单里看到各 Postgres 版本都有 `pg_trgm 1.6`，正常直接能装上。

## 七、接到引擎上

改 `engine/.env` 这三个值：

```dotenv
# 主库：平时的抓取、选稿、出刊都写这个库
DATABASE_URL=postgresql://<user>:<password>@ep-xxx.<region>.aws.neon.tech/neondb?sslmode=require
# 网页要转发给 api，非 Docker 本机跑就是这个地址
API_BASE_URL=http://127.0.0.1:3001
SITE_URL=http://localhost:3000
```

跑测试前临时换一个库（不要拿主库跑测试，测试会建副本库、删库）：

```powershell
$env:DATABASE_URL = 'postgresql://<user>:<password>@ep-xxx.<region>.aws.neon.tech/dailyhot_test?sslmode=require'
npm test
```

以后搬进 GitHub Actions 时，`DATABASE_URL` 要放进仓库的 Secrets，
**别写进 workflow 文件**——那个文件是公开的。

## 八、日常要注意的

- **看用量**：控制台的项目页能看到计算活跃时间、存储和流量的用量。
  跑完第一次全量导入后瞄一眼，心里有个数。
- **别建分支**：每个分支是独立计算、各自吃 CU-hours，而且免费计划只有 10 个。
- **别让库常驻忙**：配额按活跃时间算，常驻查询会很快吃光。
- **密码丢了能重置**：控制台的角色设置里可以重置密码，改完记得同步 `.env`。
- **冷启动**：闲置后第一次查询要等计算唤醒。引擎的连接超时设的是 10 秒，够用。

## 九、备份（阶段 4 的事，先记着）

免费计划的恢复窗口只有 **6 小时**，而且是"变更"口径，不是"完整历史"。
对一个每天攒内容的站来说，这意味着：

- 误删数据必须在 6 小时内发现才能回滚；
- 长期归档得自己 `pg_dump`，导出的 `.dump` 存到 D 盘或对象存储。

所以阶段 4 有一条"Neon 备份策略"没做完，别忘。

## 十、常见问题

| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `database "postgres" does not exist` | 没建测试用的 `postgres` 库 | 第六节，建它 |
| 迁移报 `cannot run inside a transaction block` | 用了带 `-pooler` 的串 | 换成 direct 串 |
| 报库名不合法 | 测试库名没以 `_test` / `_ci` 结尾 | 用 `dailyhot_test` |
| 连接卡几秒 | 计算在从挂起状态唤醒 | 正常，免费计划改不了 |
| 写入突然报错 | 撞到 1 GB 存储上限 | 看用量页，清理或升级 |
| 所有查询都不通 | CU-hours 用光，计算被挂起 | 等下个月重置，或升级 |

## 十一、官方文档

- 免费额度与超额：https://neon.com/docs/introduction/plans
- 闲置休眠：https://neon.com/docs/introduction/scale-to-zero
- 连接池（direct vs pooler）：https://neon.com/docs/connect/connection-pooling
- 区域列表：https://neon.com/docs/introduction/regions
- 扩展清单（`pg_trgm`）：https://neon.com/docs/extensions/pg-extensions
