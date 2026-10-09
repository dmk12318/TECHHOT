# GitHub 仓库配置教程

从零到“每天自动出刊”，一步一步跟着做。本地代码已经提交好了（项目根目录就是 git 仓库），
你只需要在 GitHub 上建仓库、推上去、配三个密钥。

预计 10 分钟。做完之后，每天北京时间 08:10 和 20:10 会自动跑一次管线。

## 第一步：在 GitHub 建一个空仓库

1. 打开 https://github.com/new （已登录时也可点右上角 **+** → **New repository**）。
2. 填这几项：

   | 字段 | 填什么 |
   | --- | --- |
   | **Repository name** | `techhot`（想换也行，但别用中文和空格） |
   | **Description** | 随便写，比如「TECH HOT —— 中文科技新闻站」 |
   | **Visibility** | **选 Public** |

3. **下面那三个初始化选项一个都别勾**：Add a README file、Add .gitignore、Choose a license。
   GitHub 官方文档也这么提醒：你已经有一份代码要推上去，勾了会引入合并冲突。
4. 点 **Create repository**。

为什么必须 Public：免费版 GitHub Pages 只对公开仓库开放，公开仓库的 Actions 分钟数也不计费。
代价是仓库内容谁都看得到，但**密钥一条都不在里面**（`.env` 被 `.gitignore` 挡着）。

## 第二步：把本地的代码推上去

建完之后 GitHub 会显示一个 Quick Setup 页，上面有命令。在本地开一个终端：

```powershell
cd 'D:\File\Codex\DAILY HOT'
git remote add origin https://github.com/<你的用户名>/techhot.git
git push -u origin main
```

把 `<你的用户名>` 换成你的 GitHub 用户名。地址可以直接从 Quick Setup 页复制，
注意要选 **HTTPS** 那一栏，不是 SSH。

**第一次推送会弹一次登录窗口**（Git for Windows 自带的 Git Credential Manager）：

- 通常是弹浏览器让你登录 GitHub 并授权；
- 如果它反过来问你用户名和密码，**不要填 GitHub 登录密码**——GitHub 早就不接受密码了。
  这时候要么改用浏览器登录，要么去 Settings → Developer settings → Personal access tokens
  建一个 token 当密码用（权限勾 `repo`）。

推送成功的标志：终端出现 `branch 'main' set up to track 'origin/main'`，仓库页刷新后能看到文件。

## 第三步：配密钥（这一步不能跳）

回到仓库页面，按这个路径走（抄的是 GitHub 官方文档里的路径，一级都不跳）：

**仓库页顶部点 `Settings`** → 左侧栏 **Security** 那一段里点 **Secrets and variables** → 点 **Actions**

进去后有两个标签页：**Secrets** 和 **Variables**。先配 Secrets。

### 3.1 Secrets 标签页（点 `New repository secret`）

要加三个，**名字必须一字不差**（大小写敏感，写错等于没配）：

| Name | Secret 填什么 | 必需 |
| --- | --- | --- |
| `DATABASE_URL` | 打开本地 `engine/.env`，复制 `DATABASE_URL=` 后面那一整行（Neon 的 direct 连接串） | 是 |
| `LLM_API_KEY` | 同样在 `engine/.env` 里，复制 `LLM_API_KEY=` 后面那串 | 是 |
| `TEST_DATABASE_URL` | 和 `DATABASE_URL` 一样，但把结尾的 `/neondb` 换成 `/dailyhot_test` | 否 |

每个的流程：点 **New repository secret** → **Name** 填名字 → **Secret** 填值 → 点 **Add secret**。
加完页面只显示名字、值再也看不到（正常，也说明你复制对了）。

`TEST_DATABASE_URL` 不配也行，只是 CI 里“全套测试”那一步会自动跳过，只跑不需要数据库的那些。

### 3.2 Variables 标签页（点 `Variables`，再点 `New repository variable`）

这些**不是密钥**，不填也能跑（workflow 里有默认值）：

| Name | Value | 什么时候填 |
| --- | --- | --- |
| `SITE_URL` | 站点对外地址，比如 `https://techhot.pages.dev` | 有正式网址之后再填；影响生成的链接、RSS 和分享图里的地址 |
| `LLM_BASE_URL` | 模型接口地址 | 换模型服务商时填 |
| `LLM_MODEL` | 模型名 | 换模型时填 |

## 第四步：验证真的能跑

1. 仓库页顶部点 **Actions**。
2. 左边栏应该能看到两个 workflow：**出刊** 和 **检查**。
   看不到的话：确认 `.github/workflows/` 在仓库根目录（不是 `engine/` 里面），而且已经推上默认分支。
3. 左边栏点 **出刊** → 右边出现提示条后点 **Run workflow** → 再点绿色的 **Run workflow** 按钮。
4. 等几十秒刷新，会出现一条运行记录。点进去能看到实时日志。

**日志里该看到什么**：`npm ci` 装完依赖后，会打印一串 JSON，每行一个事件：

```text
{"level":"info","msg":"pipeline started",...}
{"level":"info","msg":"round","label":"content","round":1,"due":3,"waiting":0,"ungrouped":1,"jobs":5,...}
{"level":"info","msg":"reports",...}
{"level":"info","msg":"pipeline finished","seconds":240,"timedOut":false,"reportFailed":false}
```

`round` 那行的四个数字是“还剩多少活”：`due`（现在能处理的）、`waiting`（排在重试时间的）、
`ungrouped`（判完但还没归组的）、`jobs`（队列里没跑完的）。**这几项都归零、然后出现
`pipeline finished`，就算跑通了。**

### 退出码是什么意思

| 退出码 | 含义 | 该怎么办 |
| --- | --- | --- |
| 0 | 干完了，出刊正常（“这天没有大事所以没出刊”也算 0） | 什么都不用做 |
| 1 | 超时，还有活没干完（默认 45 分钟） | 看日志卡在哪个 `round`；调大 `--budget`，或查是不是某个源在拖 |
| 2 | 出刊失败 | 看日志里 `reports failed` 那一行的原因 |

## 第五步：确认定时任务排上了

仓库页 → **Actions** → 左边栏 **出刊**，页面上会有一段 **Scheduled workflows** 说明，
列出下一步什么时候跑。两点注意：

- **cron 用的是 UTC**。workflow 里写的 `10 0` 和 `10 12` 分别是北京时间的 08:10 和 20:10。
- 定时任务**只跑默认分支**，而且 GitHub 忙的时候会延迟几分钟到几十分钟，不是掐秒的。

还有一个坑记住：**仓库 60 天没有任何活动，GitHub 会自动停用定时任务**（会发邮件通知），
到时候点一下恢复就行。

## 常见问题

| 现象 | 原因 | 怎么办 |
| --- | --- | --- |
| `fatal: remote origin already exists` | 之前加过 remote | `git remote set-url origin https://github.com/<用户名>/techhot.git` |
| `! [rejected] main -> main (fetch first)` | 建仓库时勾了 README，远端有你本地没有的提交 | `git pull --rebase origin main` 再 push；或者删库重建、这次不勾 |
| 推送时要求输入密码 | GitHub 不接受账号密码 | 用弹出的浏览器登录，或建 Personal Access Token（权限 `repo`）当密码 |
| Actions 里看不到 **出刊** | workflow 文件不在默认分支的 `.github/workflows/` 下 | 确认路径是仓库根的 `.github/workflows/daily.yml`，且已推上去 |
| 运行失败，日志里说 `DATABASE_URL` 为空 | Secret 没配，或名字拼错（大小写敏感） | 回第三步重新加 |
| 运行退出码 2 | 出刊失败 | 看日志 `reports failed` 后面的原因。最常见的是“这一期的窗口里没有任何资料经过评判”——引擎故意把采集/判断失败当失败，不伪装成“平静的一天” |
| 到点了却没跑 | cron 是 UTC；GitHub 会延迟；或 60 天无活动被停用 | 对照 workflow 注释确认换算；急的话用 Run workflow 手动跑 |

## 这一步做完之后

现在这条链路只跑到“出刊”——结果落在 Neon 数据库里。**阶段 3** 要接上的是：
把公开页面导出成静态文件、发布到 GitHub Pages。那一步做完，才会有真正对外的网址。
`daily.yml` 的最后已经留了 TODO 的位置。
