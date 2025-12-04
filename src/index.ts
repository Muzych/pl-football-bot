import { Bot, webhookCallback } from "grammy";

export default {
  async fetch(request, env, ctx) {
    if (request.method === "GET") {
      return new Response("我是 Telegram 机器人，请在 Telegram 中与我交互！", { status: 200 });
    }

    const bot = new Bot(env.TG_BOT_TOKEN);

    bot.command("start", (ctx) => ctx.reply("⚽ 欢迎！发送 /table 查看积分榜。"));

    // --- 命令：/table (带缓存) ---
    bot.command("table", async (ctx) => {
      try {
        // 1. 定义缓存的 Key
        const cacheKey = "pl_standings_text";

        // 2. 【查】先检查 KV 缓存
        // 这里的 env.FOOTBALL_CACHE 对应 wrangler.toml 里的 binding
        const cachedText = await env.FOOTBALL_CACHE.get(cacheKey);

        if (cachedText) {
          // 如果有缓存，直接发送，并在最后加个小标记证明是缓存
          console.log("Hit Cache!"); // 可以在 wrangler tail 看到日志
          await ctx.reply(cachedText + "\n⚡️ (来自高速缓存)", { parse_mode: "Markdown" });
          return; // 结束，不再请求 API
        }

        // 3. 【无缓存】请求 API
        await ctx.reply("🔄 正在从英超获取最新数据..."); // 只有第一次请求会看到这个

        const response = await fetch("https://api.football-data.org/v4/competitions/PL/standings", {
          headers: { "X-Auth-Token": env.FOOTBALL_API_KEY },
        });
        
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        const data = await response.json();

        // 4. 数据处理 (和之前一样)
        const table = data.standings[0].table;
        let message = "🏆 **英超实时积分榜**\n";
        message += "--------------------------------\n";
        message += "`排名  球队          场次  积分`\n";

        table.forEach((item) => {
          const rank = item.position.toString().padEnd(2, ' ');
          let teamName = item.team.shortName.padEnd(8, '　');
          const played = item.playedGames.toString().padEnd(2, ' ');
          const points = item.points.toString().padEnd(2, ' ');
          
          let icon = "";
          if (item.position <= 4) icon = "🟦";
          else if (item.position >= 18) icon = "🟥";
          else icon = "⬜";

          message += `${icon} \`${rank} ${teamName} ${played}   ${points}\`\n`;
        });
        message += "--------------------------------\n";
        message += "数据来源: football-data.org";

        // 5. 【存】写入缓存
        // expirationTtl: 60 表示 60秒后自动删除（Cloudflare 规定最少 60秒）
        // 你可以根据需求改成 300 (5分钟) 或 3600 (1小时)
        await env.FOOTBALL_CACHE.put(cacheKey, message, { expirationTtl: 60 });

        // 6. 发送新鲜数据
        await ctx.reply(message, { parse_mode: "Markdown" });

      } catch (e) {
        console.error(e);
        await ctx.reply("❌ 获取数据失败: " + e.message);
      }
    });

    return webhookCallback(bot, "std/http")(request);
  },
};

