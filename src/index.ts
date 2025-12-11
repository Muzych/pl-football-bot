import { Bot, webhookCallback, Context } from "grammy";
import { Env } from "./types";
import { handleTable } from "./commands/table";
import { handleMatches } from "./commands/matches";
import { handleHistory } from "./commands/history";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "GET") {
      return new Response("🤖 Football Bot is running...", { status: 200 });
    }

    const bot = new Bot<Context>(env.TG_BOT_TOKEN);

    // 注册命令
    bot.command("start", (ctx) => 
      ctx.reply(
        "⚽ **英超助手**\n\n" +
        "/table - 积分榜\n" +
        "/matches <球队> - 赛程赛果\n" +
        "/history <主队> <客队> - 历史交锋\n\n" +
        "例: `/history 曼联 利物浦`", 
        { parse_mode: "Markdown" }
      )
    );

    bot.command("table", (ctx) => handleTable(ctx, env));
    bot.command("matches", (ctx) => handleMatches(ctx, env));
    bot.command("history", (ctx) => handleHistory(ctx, env));

    // 错误处理
    bot.catch((err) => {
      console.error("Bot Error:", err);
    });

    return webhookCallback(bot, "std/http")(request);
  },
};