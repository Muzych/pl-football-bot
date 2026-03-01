export interface Env {
  TG_BOT_TOKEN: string;
  TG_WEBHOOK_SECRET: string;
  FOOTBALL_API_KEY: string;
  FOOTBALL_CACHE: KVNamespace;
}

// 简单的 API 响应接口定义，方便 TS 推断
export interface Match {
  id: number;
  utcDate: string;
  status: string;
  competition: { code: string };
  homeTeam: { id: number; shortName: string; name: string };
  awayTeam: { id: number; shortName: string; name: string };
  score: {
    fullTime: { home: number | null; away: number | null };
  };
}
