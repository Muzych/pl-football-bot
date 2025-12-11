import { Context } from "grammy";
import { Env } from "../types";
import { mapTeamName } from "../utils/teams.ts";

export async function handleTable(ctx: Context, env: Env) {
  try {
    const cacheKey = "pl_standings_text";
    const cachedText = await env.FOOTBALL_CACHE.get(cacheKey);

    if (cachedText) {
      await ctx.reply(cachedText + "\n⚡️ (来自高速缓存)", { parse_mode: "Markdown" });
      return;
    }

    await ctx.reply("🔄 正在获取最新积分榜...");

    const response = await fetch("https://api.football-data.org/v4/competitions/PL/standings", {
      headers: { "X-Auth-Token": env.FOOTBALL_API_KEY },
    });
    
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    const data: any = await response.json();
    const table = data.standings[0].table;

    let message = "🏆 **英超实时积分榜**\n";
    message += "--------------------------------\n";
    message += "`排名  球队          场次  积分`\n";

    table.forEach((item: any) => {
      const rank = item.position.toString().padEnd(2, ' ');
      let teamName = mapTeamName(item.team.shortName).padEnd(8, '　');
      const played = item.playedGames.toString().padEnd(2, ' ');
      const points = item.points.toString().padEnd(2, ' ');

      let icon = "⬜";
      if (item.position <= 4) icon = "🟦";
      else if (item.position >= 18) icon = "🟥";

      message += `${icon} \`${rank} ${teamName} ${played}   ${points}\`\n`;
    });

    message += "--------------------------------";

    await env.FOOTBALL_CACHE.put(cacheKey, message, { expirationTtl: 600 });
    await ctx.reply(message, { parse_mode: "Markdown" });

  } catch (e: any) {
    console.error(e);
    await ctx.reply("❌ 获取数据失败: " + e.message);
  }
}