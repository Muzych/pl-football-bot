import { beforeEach, describe, expect, it, vi } from "vitest";

type BotContext = {
  match: string;
  reply: (text: string, extra?: unknown) => Promise<unknown>;
};

type BotHandler = (ctx: BotContext) => Promise<unknown> | unknown;

const botState: {
  handlers: Map<string, BotHandler>;
  token: string | null;
} = {
  handlers: new Map(),
  token: null,
};

vi.mock("grammy", () => {
  class Bot {
    constructor(token: string) {
      botState.token = token;
    }

    command(command: string, handler: BotHandler) {
      botState.handlers.set(command, handler);
    }
  }

  function webhookCallback() {
    return async (request: Request) => {
      const update = (await request.json()) as { message?: { text?: string } };
      const text = update.message?.text ?? "";
      const [rawCommand, ...parts] = text.trim().split(/\s+/);
      const command = rawCommand.replace(/^\//, "");
      const match = parts.join(" ").trim();
      const replies: Array<{ text: string }> = [];

      const handler = botState.handlers.get(command);
      if (handler) {
        const ctx: BotContext = {
          match,
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

  return { kv, data, puts };
}

function createFootballApiFetchMock(opts?: {
  standingsOk?: boolean;
  matchesOk?: boolean;
  standingsBody?: unknown;
  matchesBody?: unknown;
}) {
  const urls: string[] = [];

  const standingsBody = opts?.standingsBody ?? {
    standings: [
      {
        table: [
          {
            position: 1,
            team: { shortName: "Liverpool" },
            playedGames: 28,
            points: 67,
          },
          {
            position: 2,
            team: { shortName: "Arsenal" },
            playedGames: 28,
            points: 64,
          },
        ],
      },
    ],
  };

  const matchesBody = opts?.matchesBody ?? {
    matches: [
      {
        status: "FINISHED",
        utcDate: "2025-12-01T12:00:00Z",
        homeTeam: { id: 66, shortName: "Man United" },
        awayTeam: { id: 57, shortName: "Arsenal" },
        score: { fullTime: { home: 2, away: 1 } },
        competition: { code: "PL" },
      },
      {
        status: "SCHEDULED",
        utcDate: "2025-12-05T12:00:00Z",
        homeTeam: { id: 64, shortName: "Liverpool" },
        awayTeam: { id: 66, shortName: "Man United" },
        score: { fullTime: { home: null, away: null } },
        competition: { code: "PL" },
      },
    ],
  };

  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    urls.push(url);

    if (url.includes("/competitions/PL/standings")) {
      if (opts?.standingsOk === false) {
        return new Response("upstream error", { status: 500 });
      }
      return new Response(JSON.stringify(standingsBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.includes("/teams/66/matches")) {
      if (opts?.matchesOk === false) {
        return new Response("upstream error", { status: 500 });
      }
      return new Response(JSON.stringify(matchesBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response("not found", { status: 404 });
  });

  return { mock, urls };
}

function makeTelegramUpdate(text: string) {
  return {
    update_id: 1001,
    message: {
      message_id: 42,
      date: 1_700_000_000,
      chat: { id: 999, type: "private" },
      from: { id: 888, is_bot: false, first_name: "Tester" },
      text,
    },
  };
}

async function callWorkerWithUpdate(text: string, env: TestEnv) {
  const request = new Request("https://example.com", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(makeTelegramUpdate(text)),
  });

  const ctx = {
    waitUntil() {
      return undefined;
    },
    passThroughOnException() {
      return undefined;
    },
  };

  const response = await worker.fetch(request, env as unknown as Env, ctx as ExecutionContext);
  const body = (await response.json()) as { replies: Array<{ text: string }> };
  return { response, replies: body.replies };
}

describe("pl-football-bot worker", () => {
  beforeEach(() => {
    botState.handlers.clear();
    botState.token = null;
    vi.restoreAllMocks();
  });

  it("returns intro text on GET /", async () => {
    const { kv } = createKvStore();
    const env: TestEnv = {
      TG_BOT_TOKEN: "123:token",
      FOOTBALL_API_KEY: "football-api-key",
      FOOTBALL_CACHE: kv,
    };

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
    expect(await response.text()).toContain("Telegram 机器人");
  });

  it("handles /start and sends help text", async () => {
    const { kv } = createKvStore();
    const env: TestEnv = {
      TG_BOT_TOKEN: "123:token",
      FOOTBALL_API_KEY: "football-api-key",
      FOOTBALL_CACHE: kv,
    };
    const { mock } = createFootballApiFetchMock();
    vi.stubGlobal("fetch", mock);

    const { response, replies } = await callWorkerWithUpdate("/start", env);

    expect(response.status).toBe(200);
    expect(replies.some((msg) => msg.text.includes("欢迎"))).toBe(true);
    expect(replies.some((msg) => msg.text.includes("/table"))).toBe(true);
    expect(botState.token).toBe("123:token");
  });

  it("uses KV cache for /table when available", async () => {
    const { kv } = createKvStore({ pl_standings_text: "cached standings" });
    const env: TestEnv = {
      TG_BOT_TOKEN: "123:token",
      FOOTBALL_API_KEY: "football-api-key",
      FOOTBALL_CACHE: kv,
    };
    const { mock, urls } = createFootballApiFetchMock();
    vi.stubGlobal("fetch", mock);

    const { response, replies } = await callWorkerWithUpdate("/table", env);

    expect(response.status).toBe(200);
    expect(replies[0].text).toContain("cached standings");
    expect(replies[0].text).toContain("来自高速缓存");
    expect(urls.some((url) => url.includes("/competitions/PL/standings"))).toBe(false);
  });

  it("fetches standings and caches result on /table cache miss", async () => {
    const { kv, puts } = createKvStore();
    const env: TestEnv = {
      TG_BOT_TOKEN: "123:token",
      FOOTBALL_API_KEY: "football-api-key",
      FOOTBALL_CACHE: kv,
    };
    const { mock, urls } = createFootballApiFetchMock();
    vi.stubGlobal("fetch", mock);

    const { response, replies } = await callWorkerWithUpdate("/table", env);

    expect(response.status).toBe(200);
    expect(urls.some((url) => url.includes("/competitions/PL/standings"))).toBe(true);
    expect(puts.some((item) => item.key === "pl_standings_text")).toBe(true);
    expect(replies.some((msg) => msg.text.includes("英超实时积分榜"))).toBe(true);
  });

  it("validates /matches requires team name", async () => {
    const { kv } = createKvStore();
    const env: TestEnv = {
      TG_BOT_TOKEN: "123:token",
      FOOTBALL_API_KEY: "football-api-key",
      FOOTBALL_CACHE: kv,
    };
    const { mock } = createFootballApiFetchMock();
    vi.stubGlobal("fetch", mock);

    const { response, replies } = await callWorkerWithUpdate("/matches", env);

    expect(response.status).toBe(200);
    expect(replies[0].text).toContain("请输入球队名字");
  });

  it("handles /matches 曼联 and caches overview", async () => {
    const { kv, puts } = createKvStore();
    const env: TestEnv = {
      TG_BOT_TOKEN: "123:token",
      FOOTBALL_API_KEY: "football-api-key",
      FOOTBALL_CACHE: kv,
    };
    const { mock, urls } = createFootballApiFetchMock();
    vi.stubGlobal("fetch", mock);

    const { response, replies } = await callWorkerWithUpdate("/matches 曼联", env);

    expect(response.status).toBe(200);
    expect(urls.some((url) => url.includes("/teams/66/matches"))).toBe(true);
    expect(puts.some((item) => item.key === "overview_66")).toBe(true);
    expect(replies.some((msg) => msg.text.includes("曼联 比赛概况"))).toBe(true);
  });
});
