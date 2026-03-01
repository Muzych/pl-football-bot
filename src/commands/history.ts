// src/commands/history.ts
import { Context } from "grammy";
import { Env } from "../types";
import { findTeamId } from "../utils/teams";
import { formatTime } from "../utils/format";
import { fetchJsonOrThrow } from "../utils/common";

export async function handleHistory(ctx: Context, env: Env) {
  const input = typeof ctx.match === "string" ? ctx.match : "";
  if (!input) return ctx.reply("❌ 请输入两支球队，例如：`/history 曼联 利物浦`", { parse_mode: "Markdown" });

  const parts = input.trim().split(/\s+/);
  if (parts.length < 2) return ctx.reply("❌ 请输入两支球队的名字，用空格隔开。");

  const teamA = findTeamId(parts[0]);
  const teamB = findTeamId(parts[1]);

  if (!teamA) return ctx.reply(`❌ 找不到球队: ${parts[0]}`);
  if (!teamB) return ctx.reply(`❌ 找不到球队: ${parts[1]}`);
  if (teamA.id === teamB.id) return ctx.reply("❌ 请输入两支不同的球队。");

  const [id1, id2] = [teamA.id, teamB.id].sort((a, b) => a - b);
  const cacheKey = `h2h_v3_${id1}_${id2}`;
  const cached = await env.FOOTBALL_CACHE.get(cacheKey);
  
  if (cached) {
    return ctx.reply(cached + "\n⚡️ (来自高速缓存)", { parse_mode: "Markdown" });
  }

  await ctx.reply(`⚔️ 正在查询 **${teamA.name}** vs **${teamB.name}** 的深度交锋数据...`, { parse_mode: "Markdown" });

  try {
    // =================================================================
    // 步骤 1: 先找出一场他们之间的比赛 (为了拿到 matchId)
    // 我们查 TeamA 最近 50 场，看能不能碰到 TeamB
    // =================================================================
    const url1 = `https://api.football-data.org/v4/teams/${teamA.id}/matches?limit=50&status=FINISHED`;
    const data1: any = await fetchJsonOrThrow(url1, env.FOOTBALL_API_KEY);

    // 在最近比赛中找到任何一场对阵 TeamB 的比赛
    const targetMatch = (data1.matches || []).find((m: any) => 
      m.homeTeam.id === teamB.id || m.awayTeam.id === teamB.id
    );

    if (!targetMatch) {
      return ctx.reply(`📊 抱歉，在近期数据中未找到 ${teamA.name} 与 ${teamB.name} 的交手记录，无法获取历史详情。`);
    }

    // =================================================================
    // 步骤 2: 使用专门的 Head2Head 接口查询历史详情
    // =================================================================
    const h2hUrl = `https://api.football-data.org/v4/matches/${targetMatch.id}/head2head?limit=5`;
    const h2hData: any = await fetchJsonOrThrow(h2hUrl, env.FOOTBALL_API_KEY);
    
    // API 返回的 matches 包含了历史交手列表
    const historyMatches = h2hData.matches || [];

    if (!historyMatches.length) {
      return ctx.reply(`📊 未找到 ${teamA.name} 与 ${teamB.name} 的历史交锋数据。`);
    }

    // --- 数据处理 (站在 TeamA 的视角) ---
    // API 的 aggregate 统计是基于 "homeTeam" 和 "awayTeam" 的，不是基于 TeamA 的
    // 所以我们需要自己重新统计一遍，或者直接展示列表
    
    let wins = 0, draws = 0, losses = 0;
    let listText = "";
    
    // 倒序：让最近的比赛排在最前面
    const displayMatches = historyMatches.reverse(); 

    displayMatches.forEach((m: any) => {
      const isHome = m.homeTeam.id === teamA.id;
      const scoreA = isHome ? (m.score.fullTime.home ?? 0) : (m.score.fullTime.away ?? 0);
      const scoreB = isHome ? (m.score.fullTime.away ?? 0) : (m.score.fullTime.home ?? 0);

      // 统计 TeamA 的战绩
      if (scoreA > scoreB) wins++;
      else if (scoreA === scoreB) draws++;
      else losses++;

      // 格式化输出
      let resultIcon = scoreA > scoreB ? "🟢" : (scoreA === scoreB ? "⚪" : "🔴");
      const dateStr = formatTime(m.utcDate).split(' ')[0]; // 只取日期 2023-12-01
      const location = isHome ? "🏠" : "✈️";
      
      // 🟢 23-12-01 🏠 2:1 (PL)
      
      listText += `${resultIcon} \`${dateStr}\` ${location} **${scoreA}:${scoreB}** (${m.competition.code})\n`;
    });

    // 拼装最终消息
    let message = `⚔️ **${teamA.name} vs ${teamB.name}** (近 ${displayMatches.length} 场)\n`;
    message += "--------------------------------\n";
    message += `📊 **${teamA.name} 战绩**: ${wins}胜 ${draws}平 ${losses}负\n\n`;
    message += "📜 **历史交锋清单**:\n";
    message += listText;
    
    // 缓存 1 小时
    await env.FOOTBALL_CACHE.put(cacheKey, message, { expirationTtl: 3600 });
    
    return ctx.reply(message, { parse_mode: "Markdown" });

  } catch (e) {
    console.error(e);
    return ctx.reply("❌ 查询失败，API 限制或网络错误");
  }
}
