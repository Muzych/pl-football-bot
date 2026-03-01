import { Context } from "grammy";
import { Env } from "../types";
import { findTeamId, getTeamById } from "../utils/teams";
import { getChatSubscriptions, subscribeChatToTeam } from "../services/subscriptions";

function ensurePrivateChatId(ctx: Context): number | null {
  const chatId = ctx.chat?.id;
  if (typeof chatId !== "number") return null;
  return chatId;
}

export async function handleSubscribe(ctx: Context, env: Env): Promise<void> {
  const chatId = ensurePrivateChatId(ctx);
  if (!chatId) {
    await ctx.reply("❌ 当前会话无法识别 chat id，请稍后再试。");
    return;
  }

  const query = typeof ctx.match === "string" ? ctx.match.trim() : "";
  if (!query || query.toLowerCase() === "list") {
    const teamIds = await getChatSubscriptions(env, chatId);
    if (!teamIds.length) {
      await ctx.reply("📭 你当前没有订阅球队。\n示例：`/subscribe 曼联`", { parse_mode: "Markdown" });
      return;
    }
    const names = teamIds
      .map((id) => getTeamById(id)?.name)
      .filter((name): name is string => Boolean(name));
    await ctx.reply(`🔔 你当前订阅：${names.join("、")}`);
    return;
  }

  const team = findTeamId(query);
  if (!team) {
    await ctx.reply(`❌ 找不到球队 "${query}"。`);
    return;
  }

  await subscribeChatToTeam(env, chatId, team.id);
  await ctx.reply(
    `✅ 已订阅 **${team.name}**\n` +
      `你将收到：\n` +
      `- 开赛前提醒\n` +
      `- 赛后赛果推送\n` +
      `- 积分榜排名变化推送`,
    { parse_mode: "Markdown" },
  );
}
