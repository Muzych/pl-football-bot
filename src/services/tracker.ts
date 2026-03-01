import { Env, Match } from "../types";
import { fetchJsonOrThrow } from "../utils/common";
import { getActiveSubscribedTeams, getSubscribersForTeam } from "./subscriptions";
import { mapTeamName, getTeamById } from "../utils/teams";

const STANDINGS_SNAPSHOT_KEY = "track:v1:standings_snapshot";
const STANDINGS_CHANGES_TEXT_KEY = "track:v1:last_changes_text";
const NOTIFY_DEDUP_PREFIX = "notify:v1";

type StandingsRow = {
  position: number;
  points: number;
  team: {
    id: number;
    shortName: string;
  };
};

type StandingsApiResponse = {
  standings: Array<{
    table: StandingsRow[];
  }>;
};

type StandingsSnapshotEntry = {
  teamId: number;
  position: number;
  points: number;
  teamName: string;
};

type StandingsChangeEntry = {
  teamId: number;
  teamName: string;
  oldPosition: number;
  newPosition: number;
  points: number;
};

function buildStandingsSnapshot(rows: StandingsRow[]): StandingsSnapshotEntry[] {
  return rows.map((item) => ({
    teamId: item.team.id,
    position: item.position,
    points: item.points,
    teamName: mapTeamName(item.team.shortName),
  }));
}

async function sendTelegramMessage(env: Env, chatId: number, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Telegram API Error: ${response.status}`);
  }
}

async function readJson<T>(env: Env, key: string): Promise<T | null> {
  const raw = await env.FOOTBALL_CACHE.get(key);
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

async function writeJson(env: Env, key: string, value: unknown): Promise<void> {
  await env.FOOTBALL_CACHE.put(key, JSON.stringify(value));
}

async function isNotificationSent(env: Env, key: string): Promise<boolean> {
  const exists = await env.FOOTBALL_CACHE.get(key);
  return Boolean(exists);
}

async function markNotificationSent(env: Env, key: string): Promise<void> {
  await env.FOOTBALL_CACHE.put(key, "1", { expirationTtl: 60 * 60 * 24 * 7 });
}

function notificationKey(chatId: number, matchId: number, tag: string): string {
  return `${NOTIFY_DEDUP_PREFIX}:${chatId}:${matchId}:${tag}`;
}

function getUpcomingMatch(matches: Match[]): Match | null {
  const now = Date.now();
  const candidates = matches
    .filter((m) => m.status === "SCHEDULED" || m.status === "TIMED")
    .filter((m) => new Date(m.utcDate).getTime() > now)
    .sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());
  return candidates[0] ?? null;
}

function getRecentFinishedMatch(matches: Match[]): Match | null {
  const now = Date.now();
  const candidates = matches
    .filter((m) => m.status === "FINISHED")
    .filter((m) => {
      const kickOff = new Date(m.utcDate).getTime();
      const minutesSinceKickoff = (now - kickOff) / (1000 * 60);
      return minutesSinceKickoff >= 0 && minutesSinceKickoff <= 240;
    })
    .sort((a, b) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime());
  return candidates[0] ?? null;
}

function matchSummaryForTeam(match: Match, teamId: number): { opponent: string; isHome: boolean } {
  const isHome = match.homeTeam.id === teamId;
  const opponent = isHome ? match.awayTeam.shortName : match.homeTeam.shortName;
  return { opponent: mapTeamName(opponent), isHome };
}

function buildPreMatchMessage(teamId: number, match: Match): string {
  const teamName = getTeamById(teamId)?.name ?? "关注球队";
  const kickoff = new Date(match.utcDate).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const { opponent, isHome } = matchSummaryForTeam(match, teamId);
  const location = isHome ? "🏠 主场" : "✈️ 客场";

  return (
    `⏰ **开赛提醒**\n` +
    `${teamName} 将在 1 小时内开赛\n` +
    `${location} vs **${opponent}**\n` +
    `🗓 ${kickoff} (${match.competition.code})`
  );
}

function buildFinalMessage(teamId: number, match: Match): string {
  const teamName = getTeamById(teamId)?.name ?? "关注球队";
  const { opponent, isHome } = matchSummaryForTeam(match, teamId);
  const homeScore = match.score.fullTime.home ?? 0;
  const awayScore = match.score.fullTime.away ?? 0;
  const myScore = isHome ? homeScore : awayScore;
  const oppScore = isHome ? awayScore : homeScore;
  let result = "⚪ 战平";
  if (myScore > oppScore) result = "🟢 赢球";
  if (myScore < oppScore) result = "🔴 失利";

  return (
    `🏁 **赛果推送**\n` +
    `${teamName} ${result}\n` +
    `比分：**${myScore}:${oppScore}**（对手：${opponent}）\n` +
    `赛事：${match.competition.code}`
  );
}

export async function updateStandingsChanges(env: Env): Promise<StandingsChangeEntry[]> {
  const data = await fetchJsonOrThrow<StandingsApiResponse>(
    "https://api.football-data.org/v4/competitions/PL/standings",
    env.FOOTBALL_API_KEY,
  );

  const currentRows = data.standings?.[0]?.table ?? [];
  const currentSnapshot = buildStandingsSnapshot(currentRows);
  const previousSnapshot =
    (await readJson<StandingsSnapshotEntry[]>(env, STANDINGS_SNAPSHOT_KEY)) ?? [];

  const previousMap = new Map(previousSnapshot.map((item) => [item.teamId, item]));
  const changes: StandingsChangeEntry[] = [];

  for (const current of currentSnapshot) {
    const previous = previousMap.get(current.teamId);
    if (!previous) continue;
    if (previous.position === current.position) continue;
    changes.push({
      teamId: current.teamId,
      teamName: current.teamName,
      oldPosition: previous.position,
      newPosition: current.position,
      points: current.points,
    });
  }

  await writeJson(env, STANDINGS_SNAPSHOT_KEY, currentSnapshot);

  if (!changes.length) {
    const noChangeText = "📊 当前积分榜暂无名次变化。";
    await env.FOOTBALL_CACHE.put(STANDINGS_CHANGES_TEXT_KEY, noChangeText, { expirationTtl: 60 * 60 * 24 });
    return changes;
  }

  const lines = changes
    .sort((a, b) => Math.abs(b.oldPosition - b.newPosition) - Math.abs(a.oldPosition - a.newPosition))
    .map((item) => {
      const delta = item.oldPosition - item.newPosition;
      const marker = delta > 0 ? `⬆️${delta}` : `⬇️${Math.abs(delta)}`;
      return `- ${item.teamName}: ${item.oldPosition} → ${item.newPosition} (${marker}, ${item.points}分)`;
    });
  const text = `📈 **积分榜变化追踪**\n${lines.join("\n")}`;
  await env.FOOTBALL_CACHE.put(STANDINGS_CHANGES_TEXT_KEY, text, { expirationTtl: 60 * 60 * 24 });

  return changes;
}

export async function getLatestStandingsChangesText(env: Env): Promise<string> {
  return (await env.FOOTBALL_CACHE.get(STANDINGS_CHANGES_TEXT_KEY)) ?? "📊 暂无追踪数据，请稍后再试。";
}

async function notifyStandingsChanges(env: Env, changes: StandingsChangeEntry[]): Promise<void> {
  if (!changes.length) return;

  const perChatLines = new Map<number, string[]>();
  for (const change of changes) {
    const subscribers = await getSubscribersForTeam(env, change.teamId);
    if (!subscribers.length) continue;

    const delta = change.oldPosition - change.newPosition;
    const marker = delta > 0 ? `⬆️${delta}` : `⬇️${Math.abs(delta)}`;
    const line = `${change.teamName}: ${change.oldPosition} → ${change.newPosition} (${marker})`;
    for (const chatId of subscribers) {
      const existing = perChatLines.get(chatId) ?? [];
      existing.push(line);
      perChatLines.set(chatId, existing);
    }
  }

  for (const [chatId, lines] of perChatLines) {
    const uniqueLines = Array.from(new Set(lines));
    if (!uniqueLines.length) continue;
    const text = `📈 **你关注球队的积分榜变化**\n${uniqueLines.map((line) => `- ${line}`).join("\n")}`;
    try {
      await sendTelegramMessage(env, chatId, text);
    } catch (error) {
      console.error("Failed to send standings change notification", { chatId, error });
    }
  }
}

async function notifyMatchUpdatesForTeam(env: Env, teamId: number): Promise<void> {
  const subscribers = await getSubscribersForTeam(env, teamId);
  if (!subscribers.length) return;

  const data = await fetchJsonOrThrow<{ matches: Match[] }>(
    `https://api.football-data.org/v4/teams/${teamId}/matches`,
    env.FOOTBALL_API_KEY,
  );
  const matches = data.matches ?? [];

  const upcoming = getUpcomingMatch(matches);
  const recentFinal = getRecentFinishedMatch(matches);

  for (const chatId of subscribers) {
    if (upcoming) {
      const minutesToKickoff = (new Date(upcoming.utcDate).getTime() - Date.now()) / (1000 * 60);
      if (minutesToKickoff >= 0 && minutesToKickoff <= 60) {
        const dedupeKey = notificationKey(chatId, upcoming.id, "prematch");
        if (!(await isNotificationSent(env, dedupeKey))) {
          try {
            await sendTelegramMessage(env, chatId, buildPreMatchMessage(teamId, upcoming));
            await markNotificationSent(env, dedupeKey);
          } catch (error) {
            console.error("Failed to send prematch notification", { chatId, teamId, error });
          }
        }
      }
    }

    if (recentFinal) {
      const dedupeKey = notificationKey(chatId, recentFinal.id, "final");
      if (!(await isNotificationSent(env, dedupeKey))) {
        try {
          await sendTelegramMessage(env, chatId, buildFinalMessage(teamId, recentFinal));
          await markNotificationSent(env, dedupeKey);
        } catch (error) {
          console.error("Failed to send final notification", { chatId, teamId, error });
        }
      }
    }
  }
}

export async function runScheduledTasks(env: Env): Promise<void> {
  const changes = await updateStandingsChanges(env);
  await notifyStandingsChanges(env, changes);

  const teams = await getActiveSubscribedTeams(env);
  for (const teamId of teams) {
    try {
      await notifyMatchUpdatesForTeam(env, teamId);
    } catch (error) {
      console.error("Failed to process subscribed team notifications", { teamId, error });
    }
  }
}
