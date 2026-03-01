import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type BotContext = {
  match: string;
  chat?: { id: number };
  reply: (text: string, extra?: unknown) => Promise<unknown>;
};

type BotHandler = (ctx: BotContext) => Promise<unknown> | unknown;
type BotErrorHandler = (err: unknown) => void;

const botState: {
  handlers: Map<string, BotHandler>;
  token: string | null;
  errorHandler: BotErrorHandler | null;
} = {
  handlers: new Map(),
  token: null,
  errorHandler: null,
};

vi.mock("grammy", () => {
  class Bot {
    constructor(token: string) {
      botState.token = token;
    }

    command(command: string, handler: BotHandler) {
      botState.handlers.set(command, handler);
    }

    catch(handler: BotErrorHandler) {
      botState.errorHandler = handler;
    }
  }

  function webhookCallback() {
    return async (request: Request) => {
      const update = (await request.json()) as {
        message?: { text?: string; chat?: { id?: number } };
      };
      const text = update.message?.text ?? "";
      const chatId = update.message?.chat?.id ?? 999;
      const [rawCommand, ...parts] = text.trim().split(/\s+/);
      const command = rawCommand.replace(/^\//, "");
      const match = parts.join(" ").trim();
      const replies: Array<{ text: string }> = [];

      const handler = botState.handlers.get(command);
      if (handler) {
        const ctx: BotContext = {
          match,
          chat: { id: chatId },
          async reply(replyText: string) {
            replies.push({ text: replyText });
            return {};
          },
        };
        await handler(ctx);
      }

      return new Response(JSON.stringify({ ok: true, replies }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
  }

  return { Bot, webhookCallback };
});

import worker from "../src/index";

type KVPutOptions = { expirationTtl?: number };
type KVStore = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string, options?: KVPutOptions) => Promise<void>;
};

type TestEnv = {
  TG_BOT_TOKEN: string;
  TG_WEBHOOK_SECRET: string;
  FOOTBALL_API_KEY: string;
  FOOTBALL_CACHE: KVStore;
};

function createKvStore(initial: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(initial));
  const puts: Array<{ key: string; value: string; options?: KVPutOptions }> = [];

  const kv: KVStore = {
    async get(key) {
      return data.get(key) ?? null;
    },
    async put(key, value, options) {
      data.set(key, value);
      puts.push({ key, value, options });
    },
  };

  return { kv, puts, data };
}

function createNetworkMock() {
  const urls: string[] = [];
  const sentMessages: Array<{ chatId: number; text: string }> = [];
  let standingsVersion = 1;

  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    urls.push(url);

    if (url.includes("api.telegram.org") && url.includes("/sendMessage")) {
      const body = JSON.parse((init?.body as string) || "{}");
      sentMessages.push({ chatId: Number(body.chat_id), text: String(body.text ?? "") });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.includes("/competitions/PL/standings")) {
      const rowsV1 = [
        { position: 1, points: 67, team: { id: 64, shortName: "Liverpool" } },
        { position: 2, points: 64, team: { id: 57, shortName: "Arsenal" } },
        { position: 3, points: 60, team: { id: 66, shortName: "Man United" } },
      ];
      const rowsV2 = [
        { position: 1, points: 67, team: { id: 64, shortName: "Liverpool" } },
        { position: 2, points: 61, team: { id: 66, shortName: "Man United" } },
        { position: 3, points: 64, team: { id: 57, shortName: "Arsenal" } },
      ];

      return new Response(
        JSON.stringify({
          standings: [{ table: standingsVersion === 1 ? rowsV1 : rowsV2 }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.includes("/teams/66/matches?limit=50&status=FINISHED")) {
      return new Response(
        JSON.stringify({
          matches: [{ id: 9991, homeTeam: { id: 66 }, awayTeam: { id: 64 } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.includes("/matches/9991/head2head?limit=5")) {
      return new Response(
        JSON.stringify({
          matches: [
            {
              utcDate: "2025-12-01T12:00:00Z",
              homeTeam: { id: 66 },
              awayTeam: { id: 64 },
              score: { fullTime: { home: 2, away: 1 } },
              competition: { code: "PL" },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.includes("/teams/66/matches")) {
      const now = Date.now();
      const in30m = new Date(now + 30 * 60 * 1000).toISOString();
      const twoHoursAgo = new Date(now - 120 * 60 * 1000).toISOString();
      return new Response(
        JSON.stringify({
          matches: [
            {
              id: 101,
              status: "FINISHED",
              utcDate: twoHoursAgo,
              homeTeam: { id: 66, shortName: "Man United" },
              awayTeam: { id: 57, shortName: "Arsenal" },
              score: { fullTime: { home: 2, away: 1 } },
              competition: { code: "PL" },
            },
            {
              id: 102,
              status: "SCHEDULED",
              utcDate: in30m,
              homeTeam: { id: 64, shortName: "Liverpool" },
              awayTeam: { id: 66, shortName: "Man United" },
              score: { fullTime: { home: null, away: null } },
              competition: { code: "PL" },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response("not found", { status: 404 });
  });

  return {
    mock,
    urls,
    sentMessages,
    setStandingsVersion(next: number) {
      standingsVersion = next;
    },
  };
}

function makeTelegramUpdate(text: string, chatId = 999) {
  return {
    update_id: 1001,
    message: {
      message_id: 42,
      date: 1_700_000_000,
      chat: { id: chatId, type: "private" },
      from: { id: 888, is_bot: false, first_name: "Tester" },
      text,
    },
  };
}

function createTestEnv(initialCache: Record<string, string> = {}) {
  const { kv, puts, data } = createKvStore(initialCache);
  return {
    env: {
      TG_BOT_TOKEN: "123:token",
      TG_WEBHOOK_SECRET: "test-webhook-secret",
      FOOTBALL_API_KEY: "football-api-key",
      FOOTBALL_CACHE: kv,
    } as TestEnv,
    puts,
    data,
  };
}

async function callWorkerWithUpdate(
  text: string,
  env: TestEnv,
  headerSecret?: string,
  chatId = 999,
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (headerSecret) {
    headers["X-Telegram-Bot-Api-Secret-Token"] = headerSecret;
  }

  const request = new Request("https://example.com", {
    method: "POST",
    headers,
    body: JSON.stringify(makeTelegramUpdate(text, chatId)),
  });

  const waitUntilPromises: Promise<unknown>[] = [];
  const ctx = {
    waitUntil(p: Promise<unknown>) {
      waitUntilPromises.push(p);
    },
    passThroughOnException() {
      return undefined;
    },
  };

  const response = await worker.fetch(request, env as unknown as Env, ctx as ExecutionContext);
  await Promise.all(waitUntilPromises);
  const body = (await response.json()) as { replies: Array<{ text: string }> };
  return { response, replies: body.replies };
}

async function runScheduled(env: TestEnv, cron = "*/15 * * * *") {
  const waitUntilPromises: Promise<unknown>[] = [];
  const ctx = {
    waitUntil(p: Promise<unknown>) {
      waitUntilPromises.push(p);
    },
    passThroughOnException() {
      return undefined;
    },
  };

  await worker.scheduled?.({ cron } as ScheduledController, env as unknown as Env, ctx as ExecutionContext);
  await Promise.all(waitUntilPromises);
}

describe("pl-football-bot worker", () => {
  beforeEach(() => {
    botState.handlers.clear();
    botState.token = null;
    botState.errorHandler = null;
    vi.restoreAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns health text on GET /", async () => {
    const { env } = createTestEnv();

    const request = new Request("https://example.com", { method: "GET" });
    const ctx = {
      waitUntil() {
        return undefined;
      },
      passThroughOnException() {
        return undefined;
      },
    };
    const response = await worker.fetch(request, env as unknown as Env, ctx as ExecutionContext);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Football Bot is running");
  });

  it("accepts webhook request without secret token", async () => {
    const { env } = createTestEnv();
    const network = createNetworkMock();
    vi.stubGlobal("fetch", network.mock);

    const { response, replies } = await callWorkerWithUpdate("/start", env, undefined);
    expect(response.status).toBe(200);
    expect(replies.some((msg) => msg.text.includes("英超助手"))).toBe(true);
  });

  it("handles /start and includes new commands", async () => {
    const { env } = createTestEnv();
    const network = createNetworkMock();
    vi.stubGlobal("fetch", network.mock);

    const { response, replies } = await callWorkerWithUpdate("/start", env, env.TG_WEBHOOK_SECRET);

    expect(response.status).toBe(200);
    expect(replies.some((msg) => msg.text.includes("/form"))).toBe(true);
    expect(replies.some((msg) => msg.text.includes("/subscribe"))).toBe(true);
    expect(botState.token).toBe("123:token");
  });

  it("subscribes a team and returns subscription list", async () => {
    const { env } = createTestEnv();
    const network = createNetworkMock();
    vi.stubGlobal("fetch", network.mock);

    const subscribeResult = await callWorkerWithUpdate("/subscribe 曼联", env, env.TG_WEBHOOK_SECRET, 10001);
    expect(subscribeResult.replies[0].text).toContain("已订阅");

    const listResult = await callWorkerWithUpdate("/subscribe list", env, env.TG_WEBHOOK_SECRET, 10001);
    expect(listResult.replies[0].text).toContain("曼联");
  });

  it("handles /form and returns analysis", async () => {
    const { env } = createTestEnv();
    const network = createNetworkMock();
    vi.stubGlobal("fetch", network.mock);

    const { response, replies } = await callWorkerWithUpdate("/form 曼联", env);

    expect(response.status).toBe(200);
    expect(replies.some((msg) => msg.text.includes("状态分析"))).toBe(true);
    expect(replies.some((msg) => msg.text.includes("战绩"))).toBe(true);
  });

  it("handles /changes using latest tracker cache", async () => {
    const { env } = createTestEnv({
      "track:v1:last_changes_text": "📈 **积分榜变化追踪**\n- 曼联: 3 → 2",
    });
    const network = createNetworkMock();
    vi.stubGlobal("fetch", network.mock);

    const { response, replies } = await callWorkerWithUpdate("/changes", env);

    expect(response.status).toBe(200);
    expect(replies[0].text).toContain("积分榜变化追踪");
  });

  it("scheduled task sends standings and match notifications to subscribers", async () => {
    const initialSnapshot = JSON.stringify([
      { teamId: 64, position: 1, points: 67, teamName: "利物浦" },
      { teamId: 57, position: 2, points: 64, teamName: "阿森纳" },
      { teamId: 66, position: 3, points: 60, teamName: "曼联" },
    ]);

    const { env } = createTestEnv({
      "sub:v1:teams": JSON.stringify([66]),
      "sub:v1:team:66": JSON.stringify([999]),
      "track:v1:standings_snapshot": initialSnapshot,
    });

    const network = createNetworkMock();
    network.setStandingsVersion(2);
    vi.stubGlobal("fetch", network.mock);

    await runScheduled(env);

    expect(network.sentMessages.length).toBeGreaterThanOrEqual(2);
    expect(network.sentMessages.some((msg) => msg.text.includes("积分榜变化"))).toBe(true);
    expect(network.sentMessages.some((msg) => msg.text.includes("开赛提醒"))).toBe(true);
  });

  it("keeps existing command behavior for /history", async () => {
    const { env } = createTestEnv();
    const network = createNetworkMock();
    vi.stubGlobal("fetch", network.mock);

    const { response, replies } = await callWorkerWithUpdate("/history 曼联 利物浦", env);

    expect(response.status).toBe(200);
    expect(replies.some((msg) => msg.text.includes("历史交锋清单"))).toBe(true);
    expect(network.urls.some((url) => url.includes("/matches/9991/head2head"))).toBe(true);
  });
});
