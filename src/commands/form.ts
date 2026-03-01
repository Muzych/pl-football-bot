import { Context } from "grammy";
import { Env, Match } from "../types";
import { findTeamId, mapTeamName } from "../utils/teams";
import { formatTime } from "../utils/format";
import { fetchJsonOrThrow } from "../utils/common";

type TeamMatchesResponse = {
  matches: Match[];
};

export async function handleForm(ctx: Context, env: Env): Promise<void> {
  const query = typeof ctx.match === "string" ? ctx.match.trim() : "";
  if (!query) {
    await ctx.reply("❌ 请输入球队名字。\n例如：`/form 曼联`", { parse_mode: "Markdown" });
    return;
  }

  const team = findTeamId(query);
  if (!team) {
    await ctx.reply(`❌ 找不到球队 "${query}"。`);
    return;
  }

  const cacheKey = `form_v1_${team.id}`;
  const cached = await env.FOOTBALL_CACHE.get(cacheKey);
  if (cached) {
    await ctx.reply(cached + "\n⚡️ (来自高速缓存)", { parse_mode: "Markdown" });
    return;
  }

  try {
    const data = await fetchJsonOrThrow<TeamMatchesResponse>(
      `https://api.football-data.org/v4/teams/${team.id}/matches`,
      env.FOOTBALL_API_KEY,
    );
    const finished = (data.matches ?? []).filter((m) => m.status === "FINISHED");
    const last5 = finished.slice(-5).reverse();

    if (!last5.length) {
      await ctx.reply(`📊 ${team.name} 暂无可分析的已完赛数据。`);
      return;
    }

    let wins = 0;
    let draws = 0;
    let losses = 0;
    let goalsFor = 0;
    let goalsAgainst = 0;
    let cleanSheets = 0;
    const trend: string[] = [];

    for (const m of last5) {
      const isHome = m.homeTeam.id === team.id;
      const homeScore = m.score.fullTime.home ?? 0;
      const awayScore = m.score.fullTime.away ?? 0;
      const myScore = isHome ? homeScore : awayScore;
      const oppScore = isHome ? awayScore : homeScore;

      goalsFor += myScore;
      goalsAgainst += oppScore;
      if (oppScore === 0) cleanSheets += 1;

      if (myScore > oppScore) {
        wins += 1;
        trend.push("W");
      } else if (myScore === oppScore) {
        draws += 1;
        trend.push("D");
      } else {
        losses += 1;
        trend.push("L");
      }
    }

    const avgFor = (goalsFor / last5.length).toFixed(1);
    const avgAgainst = (goalsAgainst / last5.length).toFixed(1);
    const formPoints = wins * 3 + draws;

    let message = `📈 **${team.name} 状态分析（近${last5.length}场）**\n`;
    message += "--------------------------------\n";
    message += `战绩：**${wins}胜 ${draws}平 ${losses}负**\n`;
    message += `状态：\`${trend.join("-")}\`\n`;
    message += `积分效率：**${formPoints}/${last5.length * 3}**\n`;
    message += `进球/失球：**${goalsFor}/${goalsAgainst}**\n`;
    message += `场均进球：**${avgFor}**\n`;
    message += `场均失球：**${avgAgainst}**\n`;
    message += `零封场次：**${cleanSheets}**\n\n`;
    message += "最近一场：\n";
    const latest = last5[0];
    const latestIsHome = latest.homeTeam.id === team.id;
    const latestOpponent = mapTeamName(
      latestIsHome ? latest.awayTeam.shortName : latest.homeTeam.shortName,
    );
    const latestMyScore = latestIsHome ? (latest.score.fullTime.home ?? 0) : (latest.score.fullTime.away ?? 0);
    const latestOppScore = latestIsHome ? (latest.score.fullTime.away ?? 0) : (latest.score.fullTime.home ?? 0);
    message += `- ${latestMyScore}:${latestOppScore} vs ${latestOpponent} (${formatTime(latest.utcDate)})`;

    await env.FOOTBALL_CACHE.put(cacheKey, message, { expirationTtl: 600 });
    await ctx.reply(message, { parse_mode: "Markdown" });
  } catch (error: any) {
    console.error("handleForm failed", error);
    await ctx.reply(`❌ 状态分析失败: ${error?.message ?? "unknown error"}`);
  }
}
