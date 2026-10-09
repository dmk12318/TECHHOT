// 这个行业的分类体系：类别、标签词表、公司（主体）名录，以及防止张冠李戴的身份词典。
// 模型按这里的词表打标签，主题页（topics.json）按标签归类，筛选栏按类别分组。
//
// 科技板块的划分，以及“将来并成综合站不返工”的规则，见 docs/规范/类别方案与缝合规则.md：
// 板块只用 section 和 key 前缀表达，类别是频道；key 带 tech- 前缀，加板块时只追加、不改老的。

/**
 * 网页上的类别（筛选栏、卡片角标、RSS 分类订阅）。key 是网址和接口里的身份，上线后不要改。
 * section 是日报里的分节标题（几个类别可以共用一节，按这里的顺序排）——科技类别的 section 全写「科技」，
 * 所以日报里六个科技类别只占一节，将来加财经板块也只多一节。
 * guide 告诉结构抽取模型这一类收什么、和相邻类别的边界在哪（总的归类原则写在 prompts/structure.md 里）。
 * commentary 标出评论类：日报写过的事又有评论类的后续报道，只占一行快讯。
 *
 * `industry` 这个 key 是引擎的兜底：没归上类的资料会进它所在的节（见 reports/edition.ts 的 DEFAULT_SECTION）。
 * 所以它必须留着，section 写「科技」；否则没归类的资料会掉进最后一节（也就是观点栏）。
 */
export const CATEGORIES = [
  { key: "tech-ai", label: "人工智能", section: "科技", guide: "模型、算力、AI 产品与治理，也包括原「互联网平台」的事：平台规则与处罚、用户规模与收费变化、内容治理、重大故障与数据事件。AI 手机、AI 电脑按发布方归消费电子，不因为带 AI 就归这里。" },
  { key: "tech-consumer", label: "消费电子", section: "科技", guide: "手机、电脑、平板、可穿戴、家电的发布与定价、系统更新的影响面、召回。单个配件发售、渠道促销、开箱测评不属于这里；没有具体新事实的体验文归观点，操作教程归教程。" },
  { key: "tech-chip", label: "半导体", section: "科技", guide: "芯片设计与制造、制程、产能、出口管制、设备与材料、涨价缺货。以研究方法为核心的新论文归研究，产线上的开工剪彩不算新闻。" },
  { key: "tech-telecom", label: "通信", section: "科技", guide: "运营商资费与网络建设、5G/6G 进展、卫星互联网、频谱与监管。设备商的常规招标公告不算新闻，除非金额、份额或技术路线本身有变化。" },
  { key: "tech-auto", label: "汽车与新能源", section: "科技", guide: "车企的价格与技术路线、辅助驾驶的法规与事故调查、召回；光伏、储能、电池的技术路线与产能、电价与补贴政策。车评与试驾不属于这里，单个项目的环评公示不算新闻。" },
  { key: "industry", label: "产业动态", section: "科技", guide: "科技行业本身的经营与规则变化：融资并购、人事变动、诉讼与反垄断、行业数据与统计、跨多个领域的公司级动作。判断不清属于哪一类、但确实是科技行业的事，也放这里。" },
  { key: "commentary", label: "观点与解读", section: "观点与解读", guide: "重点是作者的解释、判断、主张、预测或访谈观点，而不是发生了什么。报道里有具体新事实的，即使在评论栏目里发表，也按事实归到对应类别。", commentary: true },
] as const satisfies ReadonlyArray<{ key: string; label: string; feedLabel?: string; section: string; guide: string; commentary?: true }>;

/**
 * 这个行业最受关注的一类发布：日报报头的“N 个新模型”。category 和 tag 都对上才算。
 * 口径见 docs/规范/类别方案与缝合规则.md 第七节；要换成“N 款新品”“N 款新车”只改这里，不想要就设成 null。
 */
export const RELEASE: { category: string; tag: string; unit: string } | null = { category: "tech-ai", tag: "模型发布", unit: "个新模型" };

/** 周报月报的总述可以直接写、不必在报道里找到出处的行业通用词（小写）。站名会自动算在内。 */
export const PLAIN_TERMS: readonly string[] = ["ai", "api", "gpu", "cpu", "npu", "soc", "5g", "6g", "llm", "ev", "ipo", "ceo"];

/**
 * 内容理解一步给每篇资料判的“内容类型”（写在 prompts/content-understanding.md 里，改了类型要同步改那份提示词）。
 * 评分提示词（prompts/selection-score.md）按类型给五个维度不同的权重。
 */
export const ITEM_TYPES = ["model_release", "product_launch", "tool_or_prompt", "research_paper", "industry_event", "opinion_analysis", "tutorial_explainer"] as const;

// ── 标签词表 ────────────────────────────────────────────────────────────────────────────

/** 每篇资料的第一个标签必须是这些“分类标签”之一。RELEASE 用的「模型发布」必须在这里。 */
export const CATEGORY_TAGS = [
  "模型发布", "产品发布", "技术进展", "监管与政策", "事故与安全", "供应链与价格", "财报与经营", "合作与并购",
  "研究突破", "数据与统计", "召回", "观点与解读", "教程与方法", "其他",
] as const;

/** 可选的主题标签（领域内的方向）。 */
export const TOPIC_TAGS = [
  "大模型", "算力", "芯片制造", "存储", "智能手机", "可穿戴", "操作系统", "云计算", "平台治理", "数据安全",
  "智能汽车", "辅助驾驶", "动力电池", "光伏", "储能", "卫星互联网", "5G/6G", "机器人", "开源", "出口管制",
] as const;

/** 可选的实体标签（公司、机构、平台）。 */
export const ENTITY_TAGS = ["Apple", "三星", "小米", "华为", "Google", "微软", "Meta", "NVIDIA", "OpenAI", "Anthropic", "台积电", "比亚迪", "特斯拉", "宁德时代"] as const;

/** 模型常写的近义词，统一成词表里的写法。 */
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  新产品: "产品发布", 发布: "产品发布", 上市: "产品发布", 开售: "产品发布", 新品: "产品发布",
  模型: "模型发布", 开源模型: "模型发布",
  政策: "监管与政策", 监管: "监管与政策", 法规: "监管与政策", 处罚: "监管与政策", 反垄断: "监管与政策",
  事故: "事故与安全", 安全: "事故与安全", 漏洞: "事故与安全", 故障: "事故与安全", 数据泄露: "事故与安全",
  涨价: "供应链与价格", 降价: "供应链与价格", 缺货: "供应链与价格", 产能: "供应链与价格",
  融资: "合作与并购", 收购: "合作与并购", 投资: "合作与并购", 并购: "合作与并购", 合作: "合作与并购", 生态: "合作与并购",
  财报: "财报与经营", 营收: "财报与经营", 人事: "财报与经营", 裁员: "财报与经营",
  论文: "研究突破", 研究: "研究突破", 突破: "研究突破", paper: "研究突破", papers: "研究突破",
  数据: "数据与统计", 统计: "数据与统计", 报告: "数据与统计",
  召回: "召回",
  观点: "观点与解读", 评论: "观点与解读", 解读: "观点与解读", 预测: "观点与解读",
  教程: "教程与方法", 指南: "教程与方法", 实测: "教程与方法", 评测: "教程与方法", 攻略: "教程与方法", 技巧: "教程与方法",
};

// ── 公司与主体 ──────────────────────────────────────────────────────────────────────────

/**
 * 公司主题：id → 显示名、卡片上显示的标签（null 表示只用 entity:<id> 归类）、别名。
 * aliases 给结构抽取模型看；otherNames 是公司自己的其他称呼（官方账号名、子品牌），
 * 把事实的主体对到发布方时也认它们。
 */
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[]; otherNames?: string[] }> = {
  apple: { name: "Apple", displayTag: "Apple", aliases: ["Apple", "苹果"], otherNames: ["Apple Newsroom", "iPhone", "Mac", "iPad", "Vision Pro"] },
  samsung: { name: "三星电子", displayTag: "三星", aliases: ["Samsung", "三星", "三星电子"], otherNames: ["Samsung Newsroom", "Galaxy"] },
  xiaomi: { name: "小米", displayTag: "小米", aliases: ["Xiaomi", "小米"], otherNames: ["小米集团", "Redmi", "米家"] },
  huawei: { name: "华为", displayTag: "华为", aliases: ["Huawei", "华为"], otherNames: ["华为终端", "鸿蒙", "HarmonyOS", "昇腾"] },
  google: { name: "Google", displayTag: "Google", aliases: ["Google", "谷歌"], otherNames: ["Google DeepMind", "DeepMind", "Alphabet", "Android", "Gemini", "Waymo", "Google Cloud"] },
  microsoft: { name: "微软", displayTag: "微软", aliases: ["Microsoft", "微软"], otherNames: ["Microsoft News", "Windows", "Azure", "Copilot", "Xbox"] },
  meta: { name: "Meta", displayTag: "Meta", aliases: ["Meta", "Facebook"], otherNames: ["Meta Newsroom", "Instagram", "WhatsApp", "Llama", "Reality Labs"] },
  nvidia: { name: "NVIDIA", displayTag: "NVIDIA", aliases: ["NVIDIA", "英伟达"], otherNames: ["NVIDIA Blog", "GeForce", "CUDA", "Blackwell"] },
  openai: { name: "OpenAI", displayTag: "OpenAI", aliases: ["OpenAI"], otherNames: ["ChatGPT", "GPT", "Sora", "OpenAI News"] },
  anthropic: { name: "Anthropic", displayTag: "Anthropic", aliases: ["Anthropic"], otherNames: ["Claude"] },
  amd: { name: "AMD", displayTag: "AMD", aliases: ["AMD", "Advanced Micro Devices"], otherNames: ["Ryzen", "Radeon", "Instinct"] },
  intel: { name: "Intel", displayTag: "Intel", aliases: ["Intel", "英特尔"], otherNames: ["Intel Newsroom", "Core", "Xeon", "Gaudi"] },
  qualcomm: { name: "高通", displayTag: "高通", aliases: ["Qualcomm", "高通"], otherNames: ["骁龙", "Snapdragon"] },
  arm: { name: "Arm", displayTag: "Arm", aliases: ["Arm", "ARM"], otherNames: ["安谋"] },
  tsmc: { name: "台积电", displayTag: "台积电", aliases: ["TSMC", "台积电", "台湾积体电路"], otherNames: ["台湾积体电路制造"] },
  asml: { name: "ASML", displayTag: null, aliases: ["ASML", "阿斯麦"] },
  byd: { name: "比亚迪", displayTag: "比亚迪", aliases: ["BYD", "比亚迪"], otherNames: ["比亚迪汽车", "腾势", "方程豹", "仰望"] },
  tesla: { name: "特斯拉", displayTag: "特斯拉", aliases: ["Tesla", "特斯拉"], otherNames: ["特斯拉中国", "Tesla China"] },
  catl: { name: "宁德时代", displayTag: "宁德时代", aliases: ["CATL", "宁德时代"], otherNames: ["时代新能源"] },
  bytedance: { name: "字节跳动", displayTag: null, aliases: ["ByteDance", "字节跳动"], otherNames: ["抖音", "TikTok", "豆包", "Doubao"] },
  alibaba: { name: "阿里巴巴", displayTag: null, aliases: ["Alibaba", "阿里巴巴", "阿里"], otherNames: ["阿里云", "通义", "Qwen", "淘宝", "Alibaba Cloud"] },
  tencent: { name: "腾讯", displayTag: null, aliases: ["Tencent", "腾讯"], otherNames: ["微信", "WeChat", "混元", "Hunyuan"] },
  baidu: { name: "百度", displayTag: null, aliases: ["Baidu", "百度"], otherNames: ["文心", "Apollo", "萝卜快跑"] },
  deepseek: { name: "DeepSeek", displayTag: "DeepSeek", aliases: ["DeepSeek", "深度求索"] },
  fcc: { name: "美国联邦通信委员会", displayTag: null, aliases: ["FCC", "Federal Communications Commission"] },
  miit: { name: "工业和信息化部", displayTag: null, aliases: ["工业和信息化部", "工信部", "MIIT"] },
  cac: { name: "国家互联网信息办公室", displayTag: null, aliases: ["国家互联网信息办公室", "网信办", "CAC"] },
  ec: { name: "欧盟委员会", displayTag: null, aliases: ["欧盟委员会", "European Commission", "欧盟"], otherNames: ["Shaping Europe's digital future"] },
};

/**
 * 身份词典：摘要和标题里出现的公司，必须在原文里也出现过，否则退回原标题、丢掉摘要（防止模型张冠李戴）。
 * 行业没有这个问题时可以留空数组。
 */
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  { id: "apple", name: "Apple", patterns: [/apple|苹果|\biphone\b|\bipad\b|\bmac(?:book)?\b|vision\s?pro/i] },
  { id: "samsung", name: "三星电子", patterns: [/samsung|三星|galaxy|exynos/i] },
  { id: "xiaomi", name: "小米", patterns: [/xiaomi|小米|redmi|hyperos|澎湃/i] },
  { id: "huawei", name: "华为", patterns: [/huawei|华为|鸿蒙|harmonyos|麒麟|昇腾|ascend/i] },
  { id: "google", name: "Google", patterns: [/google|谷歌|alphabet|android|deepmind|\bgemini\b|waymo|pixel/i] },
  { id: "microsoft", name: "微软", patterns: [/microsoft|微软|\bazure\b|\bwindows\b|copilot|xbox/i] },
  { id: "meta", name: "Meta", patterns: [/\bmeta\b|facebook|instagram|whatsapp|\bllama\b/i] },
  { id: "nvidia", name: "NVIDIA", patterns: [/nvidia|英伟达|geforce|cuda|blackwell|\bh100\b|\bb200\b|\bgb200\b/i] },
  { id: "openai", name: "OpenAI", patterns: [/openai|chatgpt|\bgpt-?\d|\bsora\b|altman/i] },
  { id: "anthropic", name: "Anthropic", patterns: [/anthropic|\bclaude\b|\bopus\b|\bsonnet\b|\bhaiku\b/i] },
  { id: "amd", name: "AMD", patterns: [/\bamd\b|ryzen|radeon|instinct|advanced micro devices/i] },
  { id: "intel", name: "Intel", patterns: [/intel|英特尔|酷睿|\bxeon\b|gaudi/i] },
  { id: "qualcomm", name: "高通", patterns: [/qualcomm|高通|骁龙|snapdragon/i] },
  { id: "arm", name: "Arm", patterns: [/\barm\b|armv\d|\bneoverse\b|安谋/i] },
  { id: "tsmc", name: "台积电", patterns: [/\btsmc\b|台积电|台湾积体电路|(\d+)\s?nm/i] },
  { id: "asml", name: "ASML", patterns: [/asml|阿斯麦|\beuv\b|光刻机/i] },
  { id: "byd", name: "比亚迪", patterns: [/\bbyd\b|比亚迪|腾势|方程豹|仰望/i] },
  { id: "tesla", name: "特斯拉", patterns: [/tesla|特斯拉|cybertruck|\bfsd\b/i] },
  { id: "catl", name: "宁德时代", patterns: [/\bcatl\b|宁德时代|时代新能源/i] },
  { id: "bytedance", name: "字节跳动", patterns: [/bytedance|字节跳动|tiktok|抖音|豆包|doubao/i] },
  { id: "alibaba", name: "阿里巴巴", patterns: [/alibaba|阿里巴巴|阿里云|通义|\bqwen\b|支付宝/i] },
  { id: "tencent", name: "腾讯", patterns: [/tencent|腾讯|微信|wechat|混元|hunyuan/i] },
  { id: "baidu", name: "百度", patterns: [/baidu|百度|文心|ernie|萝卜快跑/i] },
  { id: "deepseek", name: "DeepSeek", patterns: [/deepseek|深度求索/i] },
];

/** 信源域名 → 主体：判断标题里点名的公司是不是这条信源自己的。 */
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  { entityId: "apple", domains: ["apple.com"] },
  { entityId: "google", domains: ["blog.google", "deepmind.google", "google.com", "abc.xyz"] },
  { entityId: "microsoft", domains: ["microsoft.com", "blogs.microsoft.com"] },
  { entityId: "nvidia", domains: ["nvidia.com", "blogs.nvidia.com"] },
  { entityId: "meta", domains: ["about.fb.com", "fb.com", "meta.com"] },
  { entityId: "samsung", domains: ["news.samsung.com", "samsung.com"] },
  { entityId: "openai", domains: ["openai.com"] },
  { entityId: "anthropic", domains: ["anthropic.com", "claude.com"] },
  { entityId: "amd", domains: ["amd.com"] },
  { entityId: "intel", domains: ["intel.com", "newsroom.intel.com"] },
  { entityId: "qualcomm", domains: ["qualcomm.com"] },
  { entityId: "arm", domains: ["arm.com"] },
  { entityId: "fcc", domains: ["fcc.gov"] },
  { entityId: "miit", domains: ["miit.gov.cn"] },
  { entityId: "cac", domains: ["cac.gov.cn"] },
  { entityId: "ec", domains: ["digital-strategy.ec.europa.eu", "ec.europa.eu"] },
];

/** 原文里的这些写法也算提到了对应公司。 */
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [
  { entityId: "meta", pattern: /@AIatMeta\b/i },
  { entityId: "nvidia", pattern: /\bTeamGreen\b/i },
];
