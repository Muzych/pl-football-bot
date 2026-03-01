# pl-football-bot

基于 Cloudflare Workers + grammY 的 Telegram 英超数据机器人。

## 功能

- `/start`：显示使用说明
- `/table`：查询英超实时积分榜（带 KV 缓存，默认 600 秒）
- `/matches <球队名>`：查询球队近 3 场赛果 + 未来 3 场赛程（带 KV 缓存，默认 600 秒）
- `/history <主队> <客队>`：查询两队近 5 场历史交锋（带 KV 缓存，默认 3600 秒）
- `/form <球队>`：球队近 5 场状态分析（胜平负、场均进失球、零封）
- `/subscribe <球队>`：订阅球队推送（开赛前提醒、赛后赛果、排名变化）
- `/changes`：查看最近一次积分榜变化追踪结果

数据源：`https://api.football-data.org`

## 技术栈

- Cloudflare Workers
- TypeScript
- [grammY](https://grammy.dev/)
- Cloudflare KV（缓存）
- Vitest（Node 环境，mock 外部 API）

## 本地开发

1. 安装依赖

```bash
npm install
```

2. 配置密钥（本地与线上都需要）

```bash
wrangler secret put TG_BOT_TOKEN
wrangler secret put TG_WEBHOOK_SECRET
wrangler secret put FOOTBALL_API_KEY
```

3. 启动本地开发

```bash
npm run dev
```

## 部署

```bash
npm run deploy
```

部署后可获得 Worker URL，例如：

`https://pl-football-bot.<your-subdomain>.workers.dev`

Worker 还配置了定时任务（每 15 分钟）用于：
- 推送订阅球队的开赛提醒与赛后赛果
- 追踪积分榜名次变化并通知订阅用户

## GitHub Actions 自动部署

仓库已包含自动部署工作流：

- 文件：`.github/workflows/deploy.yml`
- 触发：`push` 到 `master` 或手动触发 `workflow_dispatch`
- 流程：安装依赖 -> 运行测试 -> 同步 Cloudflare secrets -> `wrangler deploy`

你需要在 GitHub 仓库 `Settings -> Secrets and variables -> Actions` 中配置以下 secrets：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `TG_BOT_TOKEN`
- `TG_WEBHOOK_SECRET`
- `FOOTBALL_API_KEY`

## Telegram Webhook 配置

将 Worker URL 与 secret token 注册为 Telegram webhook：

```bash
curl "https://api.telegram.org/bot<TG_BOT_TOKEN>/setWebhook?url=<WORKER_URL>&secret_token=<TG_WEBHOOK_SECRET>"
```

检查 webhook 状态：

```bash
curl "https://api.telegram.org/bot<TG_BOT_TOKEN>/getWebhookInfo"
```

## 测试

运行测试：

```bash
npm test -- --run
```

测试覆盖重点：

- Worker 的 `GET /` 基础响应
- Telegram 命令分发：`/start`、`/table`、`/matches`、`/history`
- 新增命令：`/form`、`/subscribe`、`/changes`
- 缓存逻辑（KV 命中/未命中）
- webhook secret token 校验（403 分支）
- 定时任务逻辑（积分榜变化追踪 + 订阅推送）

测试中通过 mock `grammy` 与 `fetch` 隔离 Telegram/football-data 外部依赖，避免真实网络请求导致不稳定。

## 配置说明

### Wrangler

`wrangler.jsonc` 中已声明：

- `main`: `src/index.ts`
- `kv_namespaces`: `FOOTBALL_CACHE`

如果是新环境，请在 Cloudflare 后台创建 KV Namespace 后更新 `id`。

### 必需环境变量

- `TG_BOT_TOKEN`: Telegram Bot Token
- `TG_WEBHOOK_SECRET`: Telegram Webhook Secret Token（请求头 `X-Telegram-Bot-Api-Secret-Token` 必须匹配）
- `FOOTBALL_API_KEY`: football-data API Token
- `FOOTBALL_CACHE`: Cloudflare KV 绑定（在 `wrangler.jsonc` 配置）

## 目录结构

```text
src/
  index.ts            # Worker 入口 + Telegram 机器人逻辑
  commands/           # 各命令处理器（table/matches/history/form/subscribe/changes）
  services/           # 订阅与定时追踪逻辑
test/
  index.spec.ts       # 核心行为测试
wrangler.jsonc        # Workers 配置
vitest.config.mts     # Vitest 配置（Node 环境）
```

## 常见问题

1. 机器人无响应
- 先检查 `getWebhookInfo` 是否成功绑定到最新 Worker URL。
- 检查 webhook 的 `secret_token` 是否与 `TG_WEBHOOK_SECRET` 一致。
- 再用 `wrangler tail` 查看运行日志。

2. `/table` 或 `/matches` 报错
- 检查 `FOOTBALL_API_KEY` 是否可用，或 API 配额是否已用尽。

3. 缓存看起来没生效
- 确认 KV Namespace 绑定名是 `FOOTBALL_CACHE`，且运行环境与配置一致。
