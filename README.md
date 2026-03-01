# pl-football-bot

基于 Cloudflare Workers + grammY 的 Telegram 英超数据机器人。

## 功能

- `/start`：显示使用说明
- `/table`：查询英超实时积分榜（带 KV 缓存，默认 60 秒）
- `/matches <球队名>`：查询球队近 3 场赛果 + 未来 3 场赛程（带 KV 缓存，默认 600 秒）

数据源：`https://api.football-data.org`

## 技术栈

- Cloudflare Workers
- TypeScript
- [grammY](https://grammy.dev/)
- Cloudflare KV（缓存）
- Vitest（Workers 测试池）

## 本地开发

1. 安装依赖

```bash
npm install
```

2. 配置密钥（本地与线上都需要）

```bash
wrangler secret put TG_BOT_TOKEN
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

## Telegram Webhook 配置

将 Worker URL 注册为 Telegram webhook：

```bash
curl "https://api.telegram.org/bot<TG_BOT_TOKEN>/setWebhook?url=<WORKER_URL>"
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
- Telegram 命令分发：`/start`、`/table`、`/matches`
- 缓存逻辑（KV 命中/未命中）
- 外部 API 失败时的消息分支（可继续补充）

测试中通过 mock `fetch` 隔离外部依赖（Telegram API 与 football-data API），避免真实网络请求导致不稳定。

## 配置说明

### Wrangler

`wrangler.jsonc` 中已声明：

- `main`: `src/index.ts`
- `kv_namespaces`: `FOOTBALL_CACHE`

如果是新环境，请在 Cloudflare 后台创建 KV Namespace 后更新 `id`。

### 必需环境变量

- `TG_BOT_TOKEN`: Telegram Bot Token
- `FOOTBALL_API_KEY`: football-data API Token
- `FOOTBALL_CACHE`: Cloudflare KV 绑定（在 `wrangler.jsonc` 配置）

## 目录结构

```text
src/
  index.ts            # Worker 入口 + Telegram 机器人逻辑
test/
  index.spec.ts       # 核心行为测试
wrangler.jsonc        # Workers 配置
vitest.config.mts     # Vitest Workers 测试配置
```

## 常见问题

1. 机器人无响应
- 先检查 `getWebhookInfo` 是否成功绑定到最新 Worker URL。
- 再用 `wrangler tail` 查看运行日志。

2. `/table` 或 `/matches` 报错
- 检查 `FOOTBALL_API_KEY` 是否可用，或 API 配额是否已用尽。

3. 缓存看起来没生效
- 确认 KV Namespace 绑定名是 `FOOTBALL_CACHE`，且运行环境与配置一致。
