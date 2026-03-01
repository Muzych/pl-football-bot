import { Env } from "../types";

const CHAT_SUB_PREFIX = "sub:v1:chat:";
const TEAM_SUB_PREFIX = "sub:v1:team:";
const ACTIVE_TEAMS_KEY = "sub:v1:teams";

type ChatSubscription = {
  chatId: number;
  teams: number[];
  updatedAt: string;
};

function uniqSortedNumbers(input: number[]): number[] {
  return Array.from(new Set(input)).sort((a, b) => a - b);
}

async function readJson<T>(env: Env, key: string): Promise<T | null> {
  const raw = await env.FOOTBALL_CACHE.get(key);
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

async function writeJson(env: Env, key: string, value: unknown): Promise<void> {
  await env.FOOTBALL_CACHE.put(key, JSON.stringify(value));
}

function chatKey(chatId: number): string {
  return `${CHAT_SUB_PREFIX}${chatId}`;
}

function teamKey(teamId: number): string {
  return `${TEAM_SUB_PREFIX}${teamId}`;
}

export async function getChatSubscriptions(env: Env, chatId: number): Promise<number[]> {
  const record = await readJson<ChatSubscription>(env, chatKey(chatId));
  return record?.teams ?? [];
}

export async function subscribeChatToTeam(env: Env, chatId: number, teamId: number): Promise<void> {
  const currentTeams = await getChatSubscriptions(env, chatId);
  const nextTeams = uniqSortedNumbers([...currentTeams, teamId]);
  const nowIso = new Date().toISOString();

  const chatRecord: ChatSubscription = {
    chatId,
    teams: nextTeams,
    updatedAt: nowIso,
  };
  await writeJson(env, chatKey(chatId), chatRecord);

  const teamSubscribers = (await readJson<number[]>(env, teamKey(teamId))) ?? [];
  await writeJson(env, teamKey(teamId), uniqSortedNumbers([...teamSubscribers, chatId]));

  const activeTeams = (await readJson<number[]>(env, ACTIVE_TEAMS_KEY)) ?? [];
  await writeJson(env, ACTIVE_TEAMS_KEY, uniqSortedNumbers([...activeTeams, teamId]));
}

export async function getSubscribersForTeam(env: Env, teamId: number): Promise<number[]> {
  return (await readJson<number[]>(env, teamKey(teamId))) ?? [];
}

export async function getActiveSubscribedTeams(env: Env): Promise<number[]> {
  return (await readJson<number[]>(env, ACTIVE_TEAMS_KEY)) ?? [];
}
