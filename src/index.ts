import { Bot, webhookCallback } from "grammy";

export default {
  async fetch(request, env, ctx) {
    if (request.method === "GET") {
      return new Response("我是 Telegram 机器人，请在 Telegram 中与我交互！", { status: 200 });
    }

    const bot = new Bot(env.TG_BOT_TOKEN);

    bot.command("start", (ctx) => ctx.reply("⚽ 欢迎！\n发送 /table 查看积分榜\n发送 /matches <球队名> 查看赛程 (例如: /matches 曼联)"));

    // --- 命令：/table (带缓存) ---
    bot.command("table", async (ctx) => {
      try {
        // 1. 定义缓存的 Key
        const cacheKey = "pl_standings_text";

        // 2. 【查】先检查 KV 缓存
        // 这里的 env.FOOTBALL_CACHE 对应 wrangler.toml 里的 binding
        const cachedText = await env.FOOTBALL_CACHE.get(cacheKey);

        if (cachedText) {
          // 如果有缓存，直接发送，并在最后加个小标记证明是缓存
          console.log("Hit Cache!"); // 可以在 wrangler tail 看到日志
          await ctx.reply(cachedText + "\n⚡️ (来自高速缓存)", { parse_mode: "Markdown" });
          return; // 结束，不再请求 API
        }

        // 3. 【无缓存】请求 API
        await ctx.reply("🔄 正在从英超获取最新数据..."); // 只有第一次请求会看到这个

        const response = await fetch("https://api.football-data.org/v4/competitions/PL/standings", {
          headers: { "X-Auth-Token": env.FOOTBALL_API_KEY },
        });
        
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        const data = await response.json();

        // 4. 数据处理 (和之前一样)
        const table = data.standings[0].table;
        let message = "🏆 **英超实时积分榜**\n";
        message += "--------------------------------\n";
        message += "`排名  球队          场次  积分`\n";

        table.forEach((item) => {
          const rank = item.position.toString().padEnd(2, ' ');
          let teamName = item.team.shortName.padEnd(8, '　');
          const played = item.playedGames.toString().padEnd(2, ' ');
          const points = item.points.toString().padEnd(2, ' ');
          
          let icon = "";
          if (item.position <= 4) icon = "🟦";
          else if (item.position >= 18) icon = "🟥";
          else icon = "⬜";

          message += `${icon} \`${rank} ${teamName} ${played}   ${points}\`\n`;
        });
        message += "--------------------------------\n";
        message += "数据来源: football-data.org";

        // 5. 【存】写入缓存
        // expirationTtl: 60 表示 60秒后自动删除（Cloudflare 规定最少 60秒）
        // 你可以根据需求改成 300 (5分钟) 或 3600 (1小时)
        await env.FOOTBALL_CACHE.put(cacheKey, message, { expirationTtl: 60 });

        // 6. 发送新鲜数据
        await ctx.reply(message, { parse_mode: "Markdown" });

      } catch (e) {
        console.error(e);
        await ctx.reply("❌ 获取数据失败: " + e.message);
      }
    });

	bot.command("matches", async (ctx) => {
		// 1. 获取用户输入的参数 (去掉命令本身)
		// 例如用户发 "/matches 曼联"，这里 match 就是 "曼联"
		const query = ctx.match;
  
		if (!query) {
		  return ctx.reply("❌ 请输入球队名字。\n例如：`/matches 曼联` 或 `/matches 枪手`", { parse_mode: "Markdown" });
		}
  
		// 2. 查找球队 ID
		const team = findTeamId(query);
		if (!team) {
		  return ctx.reply(`❌ 找不到球队 "${query}"。\n请尝试使用常用中文名或英文名。`);
		}
  
		try {
		  // 3. 缓存 Key (针对每个球队单独缓存)
		  const cacheKey = `fixtures_${team.id}`;
		  const cachedText = await env.FOOTBALL_CACHE.get(cacheKey);
  
		  if (cachedText) {
			console.log(`Cache Hit for ${team.name}`);
			await ctx.reply(cachedText + "\n⚡️ (来自高速缓存)", { parse_mode: "Markdown" });
			return;
		  }
  
		  // 4. 请求 API：查询该球队未来的比赛
		  // status=SCHEDULED (未赛), limit=5 (最近5场)
		  await ctx.reply(`🔍 正在查询 ${team.name} 的赛程...`);
		  
		  const url = `https://api.football-data.org/v4/teams/${team.id}/matches?status=SCHEDULED&limit=5`;
		  const response = await fetch(url, {
			headers: { "X-Auth-Token": env.FOOTBALL_API_KEY },
		  });
  
		  if (!response.ok) throw new Error(`API Error: ${response.status}`);
		  const data = await response.json();
  
		  // 5. 格式化数据
		  if (data.matches.length === 0) {
			await ctx.reply(`📅 ${team.name} 近期没有安排比赛。`);
			return;
		  }
  
		  let message = `📅 **${team.name} 未来赛程**\n`;
		  message += "--------------------------------\n";
  
		  data.matches.forEach(m => {
			// 转换时间 (UTC -> 北京时间)
			const date = new Date(m.utcDate);
			// 简单的时间格式化: "12-07 20:30"
			const dateStr = date.toLocaleString("zh-CN",{
				timeZone: "Asia/Shanghai",
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
				hour12: false,
				
			})
			
			// 判断主客场
			const isHome = m.homeTeam.id === team.id;
			const opponent = isHome ? m.awayTeam.shortName : m.homeTeam.shortName;
			const homeTag = isHome ? "🏠 主" : "✈️ 客";
  
			// 赛事类型 (PL=英超, CL=欧冠, FAC=足总杯) - API可能返回多种赛事
			const competition = m.competition.code; 
  
			message += `🗓 \`${dateStr}\` (${competition})\n`;
			message += `${homeTag} vs **${opponent}**\n\n`;
		  });
  
		  message += "--------------------------------";
  
		  // 6. 存入缓存 (缓存 10 分钟)
		  await env.FOOTBALL_CACHE.put(cacheKey, message, { expirationTtl: 600 });
  
		  await ctx.reply(message, { parse_mode: "Markdown" });
  
		} catch (e) {
		  console.error(e);
		  await ctx.reply("❌ 查询失败: " + e.message);
		}
	  });

    return webhookCallback(bot, "std/http")(request);
  },
};



function findTeamId(input) {
	const lowerInput = input.toLowerCase().trim();
	
	// 遍历所有球队，看 input 是否包含在 keywords 里
	return TEAMS.find(t => 
	  t.keywords.some(k => k.includes(lowerInput)) || 
	  t.name.includes(lowerInput)
	);
  }

  const TEAMS = [
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
	{ id: 389, name: "卢顿", keywords: ["luton", "卢顿"] },
	{ id: 65, name: "曼城", keywords: ["man city", "mancity", "曼城", "蓝月亮"] },
	{ id: 66, name: "曼联", keywords: ["man utd", "united", "manchester", "曼联", "红魔"] },
	{ id: 67, name: "纽卡斯尔", keywords: ["newcastle", "纽卡", "喜鹊"] },
	{ id: 351, name: "森林", keywords: ["forest", "nottingham", "森林"] },
	{ id: 356, name: "谢菲联", keywords: ["sheffield", "谢菲联"] },
	{ id: 73, name: "热刺", keywords: ["tottenham", "spurs", "热刺", "白百合"] },
	{ id: 563, name: "西汉姆", keywords: ["west ham", "westham", "西汉姆", "铁锤"] },
	{ id: 76, name: "狼队", keywords: ["wolves", "wolverhampton", "狼队"] },
	// 如果有升班马，需要去 API 文档查 ID 加进来 (例如莱斯特城, 南安普顿, 伊普斯维奇)
  ];