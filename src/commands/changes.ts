import { Context } from "grammy";
import { Env } from "../types";
import { getLatestStandingsChangesText } from "../services/tracker";

export async function handleChanges(ctx: Context, env: Env): Promise<void> {
  const text = await getLatestStandingsChangesText(env);
  await ctx.reply(text, { parse_mode: "Markdown" });
}
