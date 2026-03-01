import { Bot, webhookCallback, Context } from "grammy";
import { Env } from "./types";
import { handleTable } from "./commands/table";
import { handleMatches } from "./commands/matches";
import { handleHistory } from "./commands/history";
import { handleSubscribe } from "./commands/subscribe";
import { handleForm } from "./commands/form";
import { handleChanges } from "./commands/changes";
import { runScheduledTasks } from "./services/tracker";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "GET") {
      return new Response("🤖 Football Bot is running...", { status: 200 });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const bot = new Bot<Context>(env.TG_BOT_TOKEN);

    // 注册命令
    bot.command("start", (ctx) => 
      ctx.reply(
        "⚽ **英超助手**\n\n" +
        "/table - 积分榜\n" +
        "/matches <球队> - 赛程赛果\n" +
        "/history <主队> <客队> - 历史交锋\n" +
        "/form <球队> - 近期状态分析\n" +
        "/subscribe <球队> - 订阅推送\n" +
        "/changes - 最新积分榜变化\n\n" +
        "例: `/subscribe 曼联`",
        { parse_mode: "Markdown" }
      )
    );

    bot.command("table", (ctx) => handleTable(ctx, env));
    bot.command("matches", (ctx) => handleMatches(ctx, env));
    bot.command("history", (ctx) => handleHistory(ctx, env));
    bot.command("form", (ctx) => handleForm(ctx, env));
    bot.command("subscribe", (ctx) => handleSubscribe(ctx, env));
    bot.command("changes", (ctx) => handleChanges(ctx, env));

    // 错误处理
    bot.catch((err) => {
      console.error("Bot Error:", err);
    });

    return webhookCallback(bot, "std/http")(request);
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runScheduledTasks(env).catch((error) => {
        console.error("Scheduled task failed", { cron: controller.cron, error });
      }),
    );
  },
};
