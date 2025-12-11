import { Context } from "grammy";
import { Env, Match } from "../types";
import { findTeamId, mapTeamName } from "../utils/teams.ts";
import { formatTime } from "../utils/format.ts";

export async function handleMatches(ctx: Context, env: Env) {
  const query = typeof ctx.match === "string" ? ctx.match : "";
  if (!query) {
    return ctx.reply("❌ 请输入球队名字。\n例如：`/matches 曼联`", { parse_mode: "Markdown" });
  }

  const team = findTeamId(query);
  if (!team) return ctx.reply(`❌ 找不到球队 "${query}"。`);

  try {
    const cacheKey = `overview_${team.id}`;
    const cachedText = await env.FOOTBALL_CACHE.get(cacheKey);

    if (cachedText) {
      await ctx.reply(cachedText + "\n⚡️ (来自高速缓存)", { parse_mode: "Markdown" });
      return;
    }

    await ctx.reply(`🔍 正在查询 ${team.name} 的赛季数据...`);

    const url = `https://api.football-data.org/v4/teams/${team.id}/matches`;
    const response = await fetch(url, {
      headers: { "X-Auth-Token": env.FOOTBALL_API_KEY },
    });

    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    const data: any = await response.json();
    const allMatches: Match[] = data.matches || [];

    // 分离数据
    const finishedMatches = allMatches.filter(m => m.status === "FINISHED");
    const last3 = finishedMatches.slice(-3).reverse();
    const futureMatches = allMatches.filter(m => m.status !== "FINISHED");
    const next3 = futureMatches.slice(0, 3);

    let message = `📊 **${team.name} 比赛概况**\n`;
    message += "========================\n\n";

    // Part 1: 赛果
    message += "⏮ **近期赛果 (近3场)**\n";
    if (last3.length === 0) message += "暂无已完赛数据\n";
    else {
      last3.forEach(m => {
        const dateStr = formatTime(m.utcDate);
        const isHome = m.homeTeam.id === team.id;
        const homeScore = m.score.fullTime.home ?? 0;
        const awayScore = m.score.fullTime.away ?? 0;
        
        let emoji = "⚪"; 
        if (homeScore !== awayScore) {
          if (isHome) emoji = homeScore > awayScore ? "🟢" : "🔴";
          else emoji = awayScore > homeScore ? "🟢" : "🔴";
        }

        const opponent = isHome ? m.awayTeam.shortName : m.homeTeam.shortName;
        const displayOpponent = mapTeamName(opponent);
        const location = isHome ? "🏠" : "✈️";
        
        message += `${emoji} \`${homeScore}:${awayScore}\` ${location} ${displayOpponent}\n`;
        message += `   └── 🗓 ${dateStr} (${m.competition.code})\n`;
      });
    }

    message += "\n------------------------\n\n";

    // Part 2: 赛程
    message += "⏭ **未来赛程 (下3场)**\n";
    if (next3.length === 0) message += "暂无后续安排\n";
    else {
      next3.forEach(m => {
        const dateStr = formatTime(m.utcDate);
        const isHome = m.homeTeam.id === team.id;
        const opponent = isHome ? m.awayTeam.shortName : m.homeTeam.shortName;
        const mapOpponent = mapTeamName(opponent);
        const location = isHome ? "🏠" : "✈️";

        message += `${location} vs **${mapOpponent}**\n`;
        message += `   └── 🗓 ${dateStr} (${m.competition.code})\n`;
      });
    }

    await env.FOOTBALL_CACHE.put(cacheKey, message, { expirationTtl: 600 });
    await ctx.reply(message, { parse_mode: "Markdown" });

  } catch (e: any) {
    console.error(e);
    await ctx.reply("❌ 查询失败: " + e.message);
  }
}