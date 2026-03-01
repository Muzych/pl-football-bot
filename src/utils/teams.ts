export interface Team {
    id: number;
    name: string;
    keywords: string[];
  }
  
  // 2024-2025 赛季英超球队及常用别名
  export const TEAMS: Team[] = [
    { id: 57, name: "阿森纳", keywords: ["arsenal", "枪手", "兵工厂", "阿森纳"] },
    { id: 58, name: "维拉", keywords: ["aston", "villa", "维拉"] },
    { id: 1044, name: "伯恩茅斯", keywords: ["bournemouth", "伯恩茅斯"] },
    { id: 402, name: "布伦特福德", keywords: ["brentford", "布伦特", "小蜜蜂"] },
    { id: 397, name: "布莱顿", keywords: ["brighton", "布莱顿", "海鸥"] },
    { id: 61, name: "切尔西", keywords: ["chelsea", "切尔西", "车子", "蓝军"] },
    { id: 354, name: "水晶宫", keywords: ["crystal", "palace", "水晶宫"] },
    { id: 62, name: "埃弗顿", keywords: ["everton", "埃弗顿", "太妃糖"] },
    { id: 63, name: "富勒姆", keywords: ["fulham", "富勒姆", "农场主"] },
    { id: 64, name: "利物浦", keywords: ["liverpool", "利物浦", "红军"] },
    { id: 65, name: "曼城", keywords: ["man city", "mancity", "曼城", "蓝月亮"] },
    { id: 66, name: "曼联", keywords: ["man utd", "united", "manchester", "曼联", "红魔"] },
    { id: 67, name: "纽卡斯尔", keywords: ["newcastle", "纽卡", "喜鹊"] },
    { id: 351, name: "森林", keywords: ["forest", "nottingham", "森林"] },
    { id: 73, name: "热刺", keywords: ["tottenham", "spurs", "热刺", "白百合"] },
    { id: 563, name: "西汉姆", keywords: ["west ham", "westham", "西汉姆", "铁锤"] },
    { id: 76, name: "狼队", keywords: ["wolves", "wolverhampton", "狼队"] },
    { id: 338, name: "莱斯特城", keywords: ["leicester", "狐狸城", "莱斯特"] },
    { id: 340, name: "南安普顿", keywords: ["southampton", "圣徒", "南安"] },
    { id: 349, name: "伊普斯维奇", keywords: ["ipswich", "拖拉机"] }
  ];
  
export function findTeamId(input: string | undefined): Team | undefined {
    if (!input) return undefined;
    const lowerInput = input.toLowerCase().trim();
    return TEAMS.find(t => 
      t.keywords.some(k => k.includes(lowerInput)) || 
      t.name.includes(lowerInput)
    );
}

export function getTeamById(teamId: number): Team | undefined {
  return TEAMS.find((team) => team.id === teamId);
}
  
  export function mapTeamName(originalName: string): string {
    const dict: Record<string, string> = { 
      "Man City": "曼城", "Man United": "曼联", "Liverpool": "利物浦", 
      "Arsenal": "阿森纳", "Tottenham": "热刺", "Chelsea": "切尔西",
      "Aston Villa": "维拉", "Newcastle": "纽卡", "West Ham": "西汉姆",
      "Leicester City": "莱斯特城", "Southampton": "南安普顿", "Ipswich Town": "伊普斯维奇",
      "Crystal Palace": "水晶宫", "Nott'm Forest": "森林", "Sheffield Utd": "谢菲联",
      "Wolverhampton": "狼队", "Brighton": "布莱顿", "Brentford": "布伦特",
      "Bournemouth": "伯恩茅斯", "Fulham": "富勒姆", "Everton": "埃弗顿", "Luton Town": "卢顿"
    };
    return dict[originalName] || originalName;
  }
