import { Bot, webhookCallback } from "grammy";

export default {
  async fetch(request, env, ctx) {
    // 1. 浏览器访问拦截
    if (request.method === "GET") {
      return new Response("我是 Telegram 机器人，请在 Telegram 中与我交互！", { status: 200 });
    }

    // 2. 初始化
    const bot = new Bot(env.TG_BOT_TOKEN);

    // --- 命令：/start ---
    bot.command("start", (ctx) => 
      ctx.reply("⚽ 欢迎！\n发送 /table 查看最新英超积分榜。")
    );

    // --- 命令：/table (积分榜) ---
    bot.command("table", async (ctx) => {
      try {
        // 提示用户稍等
        await ctx.reply("🔄 正在获取最新积分榜...");

        // A. 请求 API (英超代码是 PL)
        const response = await fetch("https://api.football-data.org/v4/competitions/PL/standings", {
          headers: { "X-Auth-Token": env.FOOTBALL_API_KEY },
        });

        if (!response.ok) {
          throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        
        // B. 解析数据
        // standings[0] 通常是 "TOTAL" (总榜)，standings[1] 是主场，standings[2] 是客场
        const table = data.standings[0].table; 

        // C. 格式化文本 (Markdown)
        // 表头
        let message = "🏆 **英超实时积分榜**\n";
        message += "--------------------------------\n";
        message += "`排名  球队          场次  积分`\n"; // 使用代码块保持对齐

        // 遍历每一行数据
        table.forEach((item) => {
          const rank = item.position.toString().padEnd(2, ' '); // 排名补空格
          let teamName = item.team.shortName; // 球队简称 (英文)
          
          

          const played = item.playedGames.toString().padEnd(2, ' ');
          const points = item.points.toString().padEnd(2, ' ');

          // 添加一点 Emoji 标记
          let icon = "";
          if (item.position <= 4) icon = "🟦"; // 欧冠区
          else if (item.position >= 18) icon = "🟥"; // 降级区
          else icon = "⬜";

          message += `${icon} \`${rank} ${teamName} ${played}   ${points}\`\n`;
        });

        message += "--------------------------------\n";
        message += "数据来源: football-data.org";

        // D. 发送结果
        await ctx.reply(message, { parse_mode: "Markdown" });

      } catch (e) {
        console.error(e);
        await ctx.reply("❌ 获取数据失败，请稍后再试。");
      }
    });

    // 3. 处理请求
    return webhookCallback(bot, "std/http")(request);
  },
};
