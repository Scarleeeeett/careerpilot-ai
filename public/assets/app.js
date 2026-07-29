const STORAGE_KEY = "careerpilot-ai-v2";
const APP_VERSION = "database-v1";
const DATABASE_SYNC_DELAY_MS = 300;
const TRACE_HISTORY_LIMIT = 30;
const pageMeta = {
  dashboard: ["岗位分析与准备", "提交一份 JD，选择已有简历和目标后直接开始。"],
  assistant: ["任务执行", "描述你真实想完成的任务，系统会自动组合需要的能力。"],
  jobs: ["求职项目", "围绕一个岗位统一管理信息、准备材料和面试反馈。"],
  profile: ["资料概览", "查看求职目标、资料完整度和 AI 当前形成的个人画像。"],
  resumes: ["简历管理", "管理简历版本、正文与预览，并选择默认简历。"],
  experiences: ["项目经历", "沉淀可验证的项目经历，供匹配、自我介绍和面试回答引用。"],
  analysis: ["岗位分析结果", "查看当前岗位的岗位理解、匹配策略和准备材料。"],
  skills: ["能力说明", "了解系统具备哪些 Skill、适合什么任务和需要哪些信息。"],
  traces: ["运行记录", "查看每次任务实际使用的 Skill、调用顺序、耗时和错误。"],
  evals: ["Eval Lab", "分开检查工程回归与规则路由 baseline，并从失败结果进入 badcase 归因。"],
  interview: ["面试复盘", "记录真实面试反馈，修正岗位理解并准备下一轮。"]
};

const SKILL_REGISTRY = {
  understandJobIndustry: {
    name: "understand-job-industry",
    version: "1.0.0",
    executionMode: "skill-contract/local-jd-stage + evidence-backed research",
    purpose: "从公司、岗位和 JD 建立岗位与行业理解，识别业务线、产业链、产品、竞品和岗位决策所需的研究问题。",
    triggerWhen: "用户询问岗位职责、行业、业务线、上下游、竞品、商业模式，或希望为面试理解公司与岗位时。",
    requiredContext: ["公司、岗位或可识别 JD（至少一项）", "业务线（未知时允许进入澄清或分支分析）"],
    failureBoundary: "JD 只能支撑岗位侧推断；公司定位、竞品、价格、规模和政策必须用公开来源验证，未知业务线不能被静默猜测。",
    inputSchema: {
      type: "object",
      required: ["title", "jd"],
      properties: { company: "string", businessLine: "string", title: "string", type: "string", geography: "string", jd: "string" }
    },
    outputFields: ["intakeCard", "businessLine", "industryClassification", "jdRequirementMap", "roleMapping", "researchQuestions", "sourceMap", "unresolvedFacts"]
  },
  profileMatcher: {
    name: "match_candidate_evidence",
    version: "0.1.0",
    executionMode: "fixed-workflow/local-rule",
    purpose: "只基于候选人资料识别证据覆盖、可迁移点和缺口。",
    triggerWhen: "用户询问简历匹配度、经历证据、优势或能力缺口时。",
    requiredContext: ["岗位与行业理解结果", "简历正文或项目素材"],
    failureBoundary: "资料为空时返回证据不足；求职意向不能充当经历证据。",
    inputSchema: {
      type: "object",
      required: ["jdProfile", "profile"],
      properties: { jdProfile: "object", profile: "object" }
    },
    outputFields: ["userProfile", "fit.score", "fit.strongMatches", "fit.gaps", "fit.recommendedProjects"]
  },
  interviewRetrospective: {
    name: "interview-retrospective",
    version: "1.1.0",
    executionMode: "file-extraction/transcription + skill-contract/deterministic-review",
    purpose: "从 Word 或音频提取真实问答，再复盘回答、更新岗位认知、评测准备覆盖并生成下一轮行动。",
    triggerWhen: "面试后上传 Word 记录或音频、导入转写稿、对比多轮或评估 CareerPilot 准备质量时。",
    requiredContext: ["当前岗位和面试轮次", "Word 面试记录或音频（推荐）", "至少一个提取出的真实问题"],
    failureBoundary: "原文件仅保存未提取时不能冒充已分析；音频无转写能力时停止；没有回答或准备快照时对应指标返回不可评估。",
    inputSchema: {
      type: "object",
      required: ["job", "interview"],
      properties: { job: "object", interview: "object" }
    },
    outputFields: ["summary", "questionReviews", "roleInsights", "preparationAudit", "nextRoundPlan", "careerpilotLearning"]
  },
  riskDiagnoser: {
    name: "diagnose_interview_risks",
    version: "0.1.0",
    executionMode: "fixed-workflow/local-rule",
    purpose: "识别高概率追问、证据风险和禁止夸大的边界。",
    triggerWhen: "用户询问面试风险、可能追问、短板或哪些表达容易被问穿时。",
    requiredContext: ["岗位与行业理解结果", "候选人证据匹配结果"],
    failureBoundary: "没有证据时只能提示风险，不能生成候选人未做过的经历。",
    inputSchema: {
      type: "object",
      required: ["jdProfile", "fit"],
      properties: { jdProfile: "object", fit: "object" }
    },
    outputFields: ["likelyQuestions", "riskPoints", "boundaries", "missingEvidence"]
  },
  prepPlanner: {
    name: "generate_preparation_plan",
    version: "0.1.0",
    executionMode: "fixed-workflow/local-rule",
    purpose: "把岗位、证据和风险转成可执行的面试准备任务。",
    triggerWhen: "用户要求准备计划、自我介绍角度、面试题或下一步行动时。",
    requiredContext: ["岗位与行业理解", "证据匹配", "风险诊断"],
    failureBoundary: "依赖项不足时应标记待补资料；当前不处理开放式多 Skill 规划。",
    inputSchema: {
      type: "object",
      required: ["job", "jdProfile", "fit", "risk"],
      properties: { job: "object", jdProfile: "object", fit: "object", risk: "object" }
    },
    outputFields: ["todoList", "oneMinuteIntroAngle", "interviewBrief", "prepSuggestions"]
  },
  coverLetterTailor: {
    name: "coverletter-tailor",
    version: "1.0.0",
    executionMode: "fixed-workflow/model-generation/local-fallback",
    purpose: "根据目标 JD、用户明确选择的真实经历与发送渠道，生成可直接发送且不夸大的求职沟通文案。",
    triggerWhen: "用户要求生成或适配 Cover Letter、BOSS 开场白、HR 私信、微信沟通、内推自荐语时。",
    requiredContext: ["目标 JD", "当前岗位绑定的简历/经历", "发送渠道", "实习岗位的到岗条件"],
    failureBoundary: "缺少 JD 或真实经历时停止生成；实习岗位缺到岗时间、每周天数或持续时长时先澄清；不得把 JD 要求反写成用户能力。",
    inputSchema: {
      type: "object",
      required: ["job", "profile", "options"],
      properties: {
        job: "object",
        profile: "object",
        options: { channel: "string", language: "string", arrivalDate: "string", daysPerWeek: "string", duration: "string" }
      }
    },
    outputFields: ["status", "jdJudgment", "selectedEvidence", "recommended", "shorter", "tradeoffs", "blockingQuestions", "optionalQuestions"]
  }
};

const SKILL_PRESENTATION = {
  understandJobIndustry: {
    title: "理解岗位与行业",
    summary: "从公司和 JD 出发，先明确业务范围，再理解行业、产品、上下游与岗位决策。",
    when: "当你问岗位做什么、公司属于什么行业、业务线、竞品或面试前行业知识时使用。",
    outcome: "岗位要求地图、行业分类、业务线待确认项、岗位映射、研究问题与证据来源"
  },
  profileMatcher: {
    title: "匹配个人经历",
    summary: "只根据你的简历和项目，判断哪些经历能支撑岗位要求。",
    when: "当你问是否匹配、该讲哪段经历、优势和缺口是什么时使用。",
    outcome: "证据覆盖、可迁移经验、能力缺口与推荐项目"
  },
  interviewRetrospective: {
    title: "导入并复盘面试",
    summary: "上传 Word 或音频，自动提取真实问答，再更新岗位认知并评估准备效果。",
    when: "面试后上传记录或录音、两轮之间、对比多轮或检查 CareerPilot 准备是否真正有效时使用。",
    outcome: "正文/转写、问答重建、逐题诊断、岗位信号、准备覆盖与下一轮作战单"
  },
  riskDiagnoser: {
    title: "诊断面试风险",
    summary: "找出容易被追问、证据不足或不应该夸大的地方。",
    when: "当你准备面试、担心被问穿或想检查表达风险时使用。",
    outcome: "高概率追问、风险点、表达边界与缺失证据"
  },
  prepPlanner: {
    title: "生成准备计划",
    summary: "把岗位要求、个人证据和风险转成下一步可以执行的准备任务。",
    when: "当你要准备面试、自我介绍、面试题或行动计划时使用。",
    outcome: "准备清单、自我介绍角度、Interview Brief"
  },
  coverLetterTailor: {
    title: "生成投递文案",
    summary: "根据真实经历和发送渠道，生成不过度包装的求职沟通文案。",
    when: "当你要写 Cover Letter、BOSS 开场白、HR 私信或内推自荐时使用。",
    outcome: "推荐版、精简版、采用证据与待确认信息"
  }
};

const QUICK_TASKS = {
  understand: {
    query: "分析这份 JD，告诉我岗位主要负责什么、需要哪些能力",
    skills: ["understandJobIndustry"]
  },
  match: {
    query: "分析这份 JD 和我的简历匹配度，指出真实优势和能力缺口",
    skills: ["understandJobIndustry", "profileMatcher"]
  },
  interview: {
    query: "分析这份 JD 和我的简历，找出面试风险并生成面试准备计划",
    skills: ["understandJobIndustry", "profileMatcher", "riskDiagnoser", "prepPlanner"]
  },
  message: {
    query: "根据这份 JD 和我的真实简历生成一段 BOSS 直聘开场白",
    skills: ["understandJobIndustry", "coverLetterTailor"]
  }
};

const ROLE_TAXONOMY = {
  "产品经理": {
    "AI产品经理": ["AI Agent", "AI语音", "AIGC内容", "AI搜索与RAG", "AI平台与模型能力", "AI硬件", "通用"],
    "数据产品经理": ["数据平台", "商业分析与BI", "推荐策略", "增长数据", "风控数据", "通用"],
    "B端产品经理": ["企业服务与SaaS", "协同办公", "CRM与营销", "供应链与ERP", "开发者工具", "通用"],
    "C端产品经理": ["内容社区", "社交", "电商", "本地生活", "效率工具", "通用"],
    "增长产品经理": ["用户增长", "商业化", "活动增长", "留存策略", "国际化增长", "通用"]
  },
  "运营": {
    "产品运营": ["AI产品运营", "平台运营", "商业化运营", "策略运营", "通用"],
    "用户运营": ["用户增长", "社群运营", "会员运营", "生命周期运营", "通用"],
    "内容运营": ["内容策略", "创作者运营", "社区运营", "新媒体运营", "通用"]
  },
  "数据与算法": {
    "数据分析": ["产品分析", "商业分析", "用户分析", "经营分析", "通用"],
    "算法策略": ["推荐策略", "搜索策略", "风控策略", "大模型应用", "通用"],
    "数据科学": ["机器学习", "因果推断", "实验平台", "数据挖掘", "通用"]
  },
  "设计": {
    "用户体验设计": ["交互设计", "用户研究", "服务设计", "通用"],
    "视觉设计": ["品牌视觉", "UI设计", "动效设计", "通用"]
  },
  "商业与战略": {
    "商业分析": ["市场研究", "经营分析", "竞品分析", "通用"],
    "战略": ["公司战略", "业务战略", "投资分析", "通用"],
    "行业研究": ["互联网", "人工智能", "消费", "企业服务", "通用"]
  }
};

function inferRolePath(text = "", fallback = {}) {
  const source = String(text || "").toLowerCase();
  let path = {
    category: fallback.roleCategory || "产品经理",
    track: fallback.roleTrack || fallback.type || "AI产品经理",
    specialty: fallback.roleSpecialty || "通用"
  };
  if (/运营/.test(source)) path = { category: "运营", track: /内容|社区|创作者/.test(source) ? "内容运营" : /用户|社群|会员/.test(source) ? "用户运营" : "产品运营", specialty: "通用" };
  else if (/数据分析|商业分析|数据科学|算法|推荐策略|搜索策略/.test(source) && !/产品经理|产品实习|产品岗/.test(source)) path = { category: "数据与算法", track: /算法|推荐|搜索/.test(source) ? "算法策略" : "数据分析", specialty: "通用" };
  else if (/交互设计|用户体验|用户研究|视觉设计|ui设计/.test(source)) path = { category: "设计", track: /视觉|ui/.test(source) ? "视觉设计" : "用户体验设计", specialty: "通用" };
  else if (/战略|行业研究|市场研究/.test(source) && !/产品/.test(source)) path = { category: "商业与战略", track: /战略/.test(source) ? "战略" : /行业/.test(source) ? "行业研究" : "商业分析", specialty: "通用" };
  else if (/增长/.test(source)) path = { category: "产品经理", track: "增长产品经理", specialty: /商业化/.test(source) ? "商业化" : /国际化/.test(source) ? "国际化增长" : "用户增长" };
  else if (/数据产品|bi|数据平台/.test(source)) path = { category: "产品经理", track: "数据产品经理", specialty: /bi|商业分析/.test(source) ? "商业分析与BI" : "数据平台" };
  else if (/b端|saas|企业服务|crm|erp|供应链|开发者工具/.test(source)) path = { category: "产品经理", track: "B端产品经理", specialty: /crm|营销/.test(source) ? "CRM与营销" : /erp|供应链/.test(source) ? "供应链与ERP" : /开发者/.test(source) ? "开发者工具" : "企业服务与SaaS" };
  else if (/agent|智能体|大模型|llm|aigc|rag|语音|asr|tts|人工智能|\bai\b/.test(source)) path = {
    category: "产品经理",
    track: "AI产品经理",
    specialty: /语音|asr|tts/.test(source) ? "AI语音" : /rag|搜索/.test(source) ? "AI搜索与RAG" : /aigc|内容生成/.test(source) ? "AIGC内容" : /硬件|机器人/.test(source) ? "AI硬件" : /平台|模型能力/.test(source) ? "AI平台与模型能力" : "AI Agent"
  };
  return path;
}

function normalizeRolePath(job = {}) {
  const inferred = inferRolePath([job.title, job.type, job.jd].filter(Boolean).join(" "), job);
  const category = ROLE_TAXONOMY[inferred.category] ? inferred.category : "产品经理";
  const tracks = ROLE_TAXONOMY[category];
  const track = tracks[inferred.track] ? inferred.track : Object.keys(tracks)[0];
  const specialties = tracks[track];
  const specialty = specialties.includes(inferred.specialty) ? inferred.specialty : specialties[0];
  return { category, track, specialty, custom: job.roleCustom || "" };
}

function rolePathLabel(path) {
  return [path.category, path.track, path.specialty === "通用" ? "" : path.specialty, path.custom].filter(Boolean).join(" → ");
}

function setSelectOptions(select, values, selected) {
  if (!select) return;
  select.innerHTML = values.map((value) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
}

function renderRoleCascade(prefix, value = {}) {
  const categorySelect = $(`${prefix}-role-category`);
  const trackSelect = $(`${prefix}-role-track`);
  const specialtySelect = $(`${prefix}-role-specialty`);
  if (!categorySelect || !trackSelect || !specialtySelect) return;
  const path = normalizeRolePath({ roleCategory: value.category, roleTrack: value.track, roleSpecialty: value.specialty, roleCustom: value.custom });
  setSelectOptions(categorySelect, Object.keys(ROLE_TAXONOMY), path.category);
  setSelectOptions(trackSelect, Object.keys(ROLE_TAXONOMY[path.category]), path.track);
  const specialtyOptions = [...ROLE_TAXONOMY[path.category][path.track], "其他"];
  setSelectOptions(specialtySelect, specialtyOptions, value.specialty === "其他" ? "其他" : path.specialty);
  const customWrap = $(`${prefix}-role-custom-wrap`);
  const customInput = $(`${prefix}-role-custom`);
  if (customWrap) customWrap.hidden = specialtySelect.value !== "其他";
  if (customInput) customInput.value = value.custom || "";
  updateRolePathPreview(prefix);
}

function readRolePath(prefix) {
  const specialty = $(`${prefix}-role-specialty`)?.value || "通用";
  return {
    category: $(`${prefix}-role-category`)?.value || "产品经理",
    track: $(`${prefix}-role-track`)?.value || "AI产品经理",
    specialty,
    custom: specialty === "其他" ? ($(`${prefix}-role-custom`)?.value.trim() || "") : ""
  };
}

function updateRolePathPreview(prefix) {
  const path = readRolePath(prefix);
  const preview = $(`${prefix}-role-path-preview`);
  if (preview) preview.textContent = rolePathLabel(path);
  if (prefix === "job") {
    if ($("job-title-input")) $("job-title-input").value = path.custom || (path.specialty === "通用" ? path.track : `${path.track} · ${path.specialty}`);
    if ($("job-type")) $("job-type").value = path.track;
  }
}

function bindRoleCascade(prefix, onChange = () => {}) {
  const category = $(`${prefix}-role-category`);
  const track = $(`${prefix}-role-track`);
  const specialty = $(`${prefix}-role-specialty`);
  if (!category || !track || !specialty) return;
  category.addEventListener("change", () => {
    const nextTrack = Object.keys(ROLE_TAXONOMY[category.value])[0];
    renderRoleCascade(prefix, { category: category.value, track: nextTrack, specialty: ROLE_TAXONOMY[category.value][nextTrack][0] });
    onChange();
  });
  track.addEventListener("change", () => {
    renderRoleCascade(prefix, { category: category.value, track: track.value, specialty: ROLE_TAXONOMY[category.value][track.value][0] });
    onChange();
  });
  specialty.addEventListener("change", () => {
    const customWrap = $(`${prefix}-role-custom-wrap`);
    if (customWrap) customWrap.hidden = specialty.value !== "其他";
    updateRolePathPreview(prefix);
    onChange();
  });
  $(`${prefix}-role-custom`)?.addEventListener("input", () => {
    updateRolePathPreview(prefix);
    onChange();
  });
}

const ROUTING_EVAL_CASES = [
  { id: "route_jd_01", query: "这个岗位主要负责什么？", expectedSkill: "understandJobIndustry" },
  { id: "route_jd_02", query: "帮我拆一下这份 JD 的核心能力要求", expectedSkill: "understandJobIndustry" },
  { id: "route_industry_01", query: "这家公司属于什么行业，上下游和竞品有哪些？", expectedSkill: "understandJobIndustry" },
  { id: "route_match_01", query: "我的简历和这个岗位匹配吗？", expectedSkill: "profileMatcher" },
  { id: "route_match_02", query: "哪些经历能证明我符合要求？", expectedSkill: "profileMatcher" },
  { id: "route_risk_01", query: "这个岗位面试最可能追问什么？", expectedSkill: "riskDiagnoser" },
  { id: "route_risk_02", query: "我讲项目时有哪些容易被问穿的风险？", expectedSkill: "riskDiagnoser" },
  { id: "route_prep_01", query: "帮我生成面试前 30 分钟准备计划", expectedSkill: "prepPlanner" },
  { id: "route_prep_02", query: "给我一个 60 秒自我介绍角度", expectedSkill: "prepPlanner" },
  { id: "route_cover_01", query: "帮我写一段 BOSS 直聘开场白", expectedSkill: "coverLetterTailor" },
  { id: "route_cover_02", query: "根据这个 JD 生成一封 Cover Letter", expectedSkill: "coverLetterTailor" },
  { id: "route_feedback_01", query: "复盘刚才的一面并准备下一轮", expectedSkill: "interviewRetrospective" },
  { id: "route_feedback_02", query: "根据实际面试问题校准岗位理解", expectedSkill: "interviewRetrospective" },
  { id: "route_feedback_03", query: "对比两轮真实面试并评估准备覆盖", expectedSkill: "interviewRetrospective" },
  { id: "route_multi_01", query: "分析这份 JD，然后生成准备计划", expectedSkill: "multiSkill", note: "组合意图需要任务拆解，当前单标签规则路由会失败。" }
];

function routeSkillByQuery(query) {
  const text = String(query || "").trim().toLowerCase();
  if (!text) return { skillKey: null, reason: "任务为空，需要用户补充目标。", confidence: "low" };
  if (/cover\s*letter|求职信|开场白|私信|内推|自荐|投递文案|招呼/.test(text)) return { skillKey: "coverLetterTailor", reason: "命中 Cover Letter/求职沟通文案类意图", confidence: "rule-match" };
  if (/面试.*复盘|复盘.*面试|刚面试|实际面试|面试记录|校准岗位|一面复盘|二面复盘|三面复盘|准备覆盖|多轮对比/.test(text)) return { skillKey: "interviewRetrospective", reason: "命中真实面试复盘、准备评测或多轮迭代意图", confidence: "rule-match" };
  if (/风险|追问|问穿|短板|归因|雷区/.test(text)) return { skillKey: "riskDiagnoser", reason: "命中风险/追问类意图", confidence: "rule-match" };
  if (/准备(?!覆盖|质量|效果|命中|评估)|自我介绍|面试题|作战计划|行动计划|下一步|brief/.test(text)) return { skillKey: "prepPlanner", reason: "命中准备计划/表达生成类意图", confidence: "rule-match" };
  if (/匹配|简历|经历|证据|优势|缺口/.test(text)) return { skillKey: "profileMatcher", reason: "命中候选人证据匹配类意图", confidence: "rule-match" };
  if (/jd|岗位|职责|能力|要求|做什么|行业|产业链|上下游|竞品|商业模式|业务线|公司.*产品/.test(text)) return { skillKey: "understandJobIndustry", reason: "命中岗位与行业理解类意图", confidence: "rule-match" };
  return { skillKey: null, reason: "没有命中当前 6 类 Skill，需要澄清任务。", confidence: "low" };
}

function executeSkillForJob(skillKey, job, query = "") {
  const trace = [];
  const profile = profileForJob(job);
  const jdProfile = understandJobIndustrySkill(job);
  const userProfile = profileExtractorSkill(profile);
  const fit = fitAnalyzerSkill(jdProfile, userProfile);
  const risk = riskDiagnoserSkill(jdProfile, fit);
  let input;
  let output;
  if (skillKey === "understandJobIndustry") {
    input = { company: job.company, title: job.title, jd: job.jd };
    output = runFixedWorkflowStep(skillKey, { title: job.title, jdChars: String(job.jd || "").length }, () => understandJobIndustrySkill(job), trace);
  } else if (skillKey === "profileMatcher") {
    input = { jdProfile, profile: { resumeChars: String(profile.resume || "").length, projects: profile.projects || "" } };
    output = runFixedWorkflowStep(skillKey, { roleType: jdProfile.roleType, resumeChars: String(profile.resume || "").length }, () => ({ userProfile, fit }), trace);
  } else if (skillKey === "riskDiagnoser") {
    input = { jdProfile, fit };
    output = runFixedWorkflowStep(skillKey, { roleType: jdProfile.roleType, score: fit.score, gapCount: fit.gaps.length }, () => risk, trace);
  } else if (skillKey === "prepPlanner") {
    input = { job: { company: job.company, title: job.title }, jdProfile, fit, risk };
    output = runFixedWorkflowStep(skillKey, { title: job.title, riskCount: risk.riskPoints.length }, () => prepPlannerSkill(job, jdProfile, fit, risk), trace);
  } else if (skillKey === "interviewRetrospective") {
    const round = currentReviewRound(job);
    input = { job: { id: job.id, company: job.company, title: job.title }, interviewRound: round ? { id: round.id, questionCount: ensureReviewQuestions(round).length } : null };
    output = round?.aiReview || { status: "needs_clarification", blockingQuestions: ["请进入面试复盘，选择轮次并补充至少一个真实问题。"] };
    trace.push({ step: 1, skillKey, skillName: SKILL_REGISTRY[skillKey].name, executionMode: "saved-review-or-clarification", startedAt: new Date().toISOString(), durationMs: 0, status: "success", inputSummary: input, outputFields: SKILL_REGISTRY[skillKey].outputFields, outputSize: JSON.stringify(output).length, errorType: null });
  } else if (skillKey === "coverLetterTailor") {
    const options = inferCoverLetterOptionsFromQuery(query, job);
    input = { job: { company: job.company, title: job.title, type: job.type, jd: job.jd }, profile, options };
    output = runFixedWorkflowStep(skillKey, { title: job.title, channel: options.channel, resumeChars: String(profile.resume || "").length }, () => buildLocalCoverLetterSkill(job, options), trace);
  } else {
    throw new Error(`未知 Skill：${skillKey}`);
  }
  return { input, output, trace };
}

function runFixedWorkflowStep(skillKey, inputSummary, executor, trace) {
  const spec = SKILL_REGISTRY[skillKey];
  const startedAt = new Date().toISOString();
  const start = performance.now();
  try {
    const output = executor();
    trace.push({
      step: trace.length + 1,
      skillKey,
      skillName: spec.name,
      executionMode: spec.executionMode,
      startedAt,
      durationMs: Math.round((performance.now() - start) * 100) / 100,
      status: "success",
      inputSummary,
      outputFields: spec.outputFields,
      outputSize: JSON.stringify(output).length,
      errorType: null
    });
    return output;
  } catch (error) {
    trace.push({
      step: trace.length + 1,
      skillKey,
      skillName: spec.name,
      executionMode: spec.executionMode,
      startedAt,
      durationMs: Math.round((performance.now() - start) * 100) / 100,
      status: "failed",
      inputSummary,
      outputFields: [],
      outputSize: 0,
      errorType: error.name || "WorkflowError",
      errorMessage: error.message
    });
    throw error;
  }
}

const OFFLINE_EVAL_CASES = [
    { id: "signal_ai", dimension: "信号识别", node: "understandJobIndustry", title: "识别 Agent / Function Call 信号", run: () => understandJobIndustrySkill({ title: "AI 产品实习生", type: "AI 产品", jd: "负责 Agent 工具调用、Function Call 参数评测和大模型能力分析" }).rawKeywordHits.ai.length > 0 },
    { id: "signal_data", dimension: "信号识别", node: "understandJobIndustry", title: "识别数据与指标信号", run: () => understandJobIndustrySkill({ title: "产品实习生", type: "", jd: "负责用户行为数据清洗、分类占比统计和指标分析" }).rawKeywordHits.data.length > 0 },
    { id: "signal_user", dimension: "信号识别", node: "understandJobIndustry", title: "识别用户研究信号", run: () => understandJobIndustrySkill({ title: "产品实习生", type: "", jd: "通过用户访谈和反馈分析持续优化体验" }).rawKeywordHits.user.length > 0 },
    { id: "signal_delivery", dimension: "信号识别", node: "understandJobIndustry", title: "识别跨团队交付信号", run: () => understandJobIndustrySkill({ title: "产品实习生", type: "", jd: "与算法、工程和设计协作，推进需求落地和验收" }).rawKeywordHits.delivery.length > 0 },
  { id: "empty_project", dimension: "证据约束", node: "profileMatcher", title: "资料为空时不虚构候选人项目", run: () => profileExtractorSkill({ target: "", industry: "", resume: "", projects: "" }).coreProjects.length === 0 },
    { id: "empty_score", dimension: "证据约束", node: "profileMatcher", title: "资料为空时证据覆盖分为 0", run: () => { const jd = understandJobIndustrySkill({ title: "AI 产品", type: "AI 产品", jd: "负责 Agent、数据分析与跨团队推进" }); const profile = profileExtractorSkill({ target: "", industry: "", resume: "", projects: "" }); return fitAnalyzerSkill(jd, profile).score === 0; } },
  { id: "preference_not_evidence", dimension: "证据约束", node: "profileMatcher", title: "求职目标和意向行业不计入经历证据", run: () => { const profile = profileExtractorSkill({ target: "AI 产品经理", industry: "AI 应用", resume: "", projects: "" }); return Object.values(profile.rawKeywordHits).every((items) => items.length === 0); } },
    { id: "score_definition", dimension: "证据约束", node: "profileMatcher", title: "分数明确声明不是录用概率", run: () => { const jd = understandJobIndustrySkill({ title: "AI 产品", type: "AI 产品", jd: "负责 Agent 产品" }); const profile = profileExtractorSkill({ target: "AI 产品", industry: "", resume: "", projects: "" }); return fitAnalyzerSkill(jd, profile).scoreDefinition.includes("不是录用概率"); } },
  { id: "risk_evidence", dimension: "证据约束", node: "riskDiagnoser", title: "风险诊断暴露缺失证据", run: () => riskDiagnoserSkill({ businessKeywords: [], aiKeywords: [], rawKeywordHits: {} }, { gaps: [] }).missingEvidence.length >= 3 },
  { id: "risk_boundary", dimension: "证据约束", node: "riskDiagnoser", title: "风险边界禁止虚构上线与 A/B test", run: () => riskDiagnoserSkill({ businessKeywords: [], aiKeywords: [], rawKeywordHits: {} }, { gaps: [] }).boundaries.some((item) => item.includes("A/B test")) },
  { id: "cover_missing_source", dimension: "证据约束", node: "coverLetterTailor", title: "缺少 JD 和真实经历时停止生成", run: () => { const result = validateCoverLetterInputs({ title: "产品经理", jd: "" }, { resume: "", projects: "" }, { channel: "中文邮件 Cover Letter" }); return result.blockingQuestions.length === 2; } },
  { id: "cover_internship_availability", dimension: "证据约束", node: "coverLetterTailor", title: "实习岗位缺到岗条件时先澄清", run: () => { const result = validateCoverLetterInputs({ title: "产品实习生", jd: "负责产品需求分析" }, { resume: "参与需求分析项目", projects: "" }, { channel: "BOSS/牛客/微信开场白", arrivalDate: "", daysPerWeek: "", duration: "" }); return result.blockingQuestions.length === 3; } },
    { id: "trace_steps", dimension: "链路完整", node: "workflow", title: "固定 Workflow 产生 4 个节点 Trace", run: () => { const trace = []; const job = { company: "字节跳动", title: "AI 产品实习生", type: "AI 产品", jd: "负责 Agent 工具调用、数据分析和跨团队协作" }; const profile = { target: "AI 产品", industry: "AI 应用", resume: "参与 AI 产品项目和数据分析", projects: "CareerPilot AI" }; const jd = runFixedWorkflowStep("understandJobIndustry", {}, () => understandJobIndustrySkill(job), trace); const matched = runFixedWorkflowStep("profileMatcher", {}, () => { const userProfile = profileExtractorSkill(profile); return { userProfile, fit: fitAnalyzerSkill(jd, userProfile) }; }, trace); const risk = runFixedWorkflowStep("riskDiagnoser", {}, () => riskDiagnoserSkill(jd, matched.fit), trace); runFixedWorkflowStep("prepPlanner", {}, () => prepPlannerSkill(job, jd, matched.fit, risk), trace); return trace.length === 4 && trace.every((item) => item.status === "success"); } },
    { id: "trace_schema", dimension: "链路完整", node: "workflow", title: "Trace 包含耗时、状态与错误字段", run: () => { const trace = []; runFixedWorkflowStep("understandJobIndustry", {}, () => understandJobIndustrySkill({ title: "产品", type: "", jd: "产品需求分析" }), trace); const item = trace[0]; return typeof item.durationMs === "number" && item.status === "success" && Object.hasOwn(item, "errorType"); } },
  { id: "job_identity", dimension: "链路完整", node: "stateManagement", title: "资料初始化不替换岗位对象，分析结果能写回状态", run: () => { const job = state.jobs[0]; ensureResumeLibrary(); return state.jobs[0] === job; } },
  { id: "architecture_boundary", dimension: "链路完整", node: "architecture", title: "架构边界明确关闭动态 Function Calling", run: () => Object.values(SKILL_REGISTRY).every((item) => item.executionMode.includes("fixed-workflow")) }
];

function runOfflineEval() {
  const startedAt = new Date().toISOString();
  const regressionResults = OFFLINE_EVAL_CASES.map((item) => {
    try {
      const passed = Boolean(item.run());
      return { id: item.id, dimension: item.dimension, node: item.node, title: item.title, expected: `满足断言：${item.title}`, actual: passed ? "断言为 true" : "断言为 false", method: `直接调用 ${item.node} 本地函数`, passed, error: passed ? "" : "断言未通过" };
    } catch (error) {
      return { id: item.id, dimension: item.dimension, node: item.node, title: item.title, expected: `满足断言：${item.title}`, actual: `执行异常：${error.message}`, method: `直接调用 ${item.node} 本地函数`, passed: false, error: error.message };
    }
  });
  const routingResults = ROUTING_EVAL_CASES.map((item) => {
    const routed = routeSkillByQuery(item.query);
    const passed = routed.skillKey === item.expectedSkill;
    return {
      id: item.id,
      query: item.query,
      expectedSkill: item.expectedSkill,
      actualSkill: routed.skillKey || "clarify",
      reason: routed.reason,
      note: item.note || "",
      passed
    };
  });
  state.evalRun = { startedAt, regressionResults, routingResults };
  persist();
  renderEvals();
  const regressionPassed = regressionResults.filter((item) => item.passed).length;
  const routingPassed = routingResults.filter((item) => item.passed).length;
  showToast(`评测完成：工程回归 ${regressionPassed}/${regressionResults.length}，规则路由 ${routingPassed}/${routingResults.length}`);
}

function renderEvals() {
  const run = state.evalRun;
  const metrics = $("eval-metrics");
  const resultsBox = $("eval-results");
  if (!metrics || !resultsBox) return;
  if (!run?.regressionResults || !run?.routingResults) {
    metrics.innerHTML = `<div class="metric"><span>工程回归</span><strong>${OFFLINE_EVAL_CASES.length} 条</strong></div><div class="metric"><span>规则路由</span><strong>${ROUTING_EVAL_CASES.length} 条</strong></div><div class="metric"><span>模型评测</span><strong style="font-size:15px;">未执行</strong></div>`;
    resultsBox.innerHTML = `<div class="empty">点击“运行离线评测”，分别生成工程回归结果和规则路由 baseline。</div>`;
    return;
  }
  const regressionPassed = run.regressionResults.filter((item) => item.passed).length;
  const routingPassed = run.routingResults.filter((item) => item.passed).length;
  const routingFailed = run.routingResults.length - routingPassed;
  metrics.innerHTML = `<div class="metric"><span>工程回归</span><strong>${regressionPassed}/${run.regressionResults.length}</strong></div><div class="metric"><span>规则 Routing Accuracy</span><strong>${routingPassed}/${run.routingResults.length}</strong></div><div class="metric"><span>已知路由 Badcase</span><strong>${routingFailed}</strong></div>`;
  const regressionHtml = run.regressionResults.map((item) => `<div class="brief-item" style="margin-bottom:8px;"><strong>${item.passed ? "✓" : "✕"} ${escapeHtml(item.title)}</strong><span class="muted">标准：${escapeHtml(item.expected)}<br>实际：${escapeHtml(item.actual)}<br>方法：${escapeHtml(item.method)} · 归因节点：${escapeHtml(item.node)}</span></div>`).join("");
  const routingHtml = run.routingResults.map((item) => `<div class="brief-item ${item.passed ? "" : "insight-card"}" style="margin-bottom:8px;"><strong>${item.passed ? "✓" : "✕"} ${escapeHtml(item.query)}</strong><span class="muted">标准 Skill：${escapeHtml(item.expectedSkill)} · 实际 Skill：${escapeHtml(item.actualSkill)}<br>判定：精确匹配 Skill Key${item.note ? `<br>Badcase：${escapeHtml(item.note)}` : ""}</span></div>`).join("");
  resultsBox.innerHTML = `<h4 style="margin:4px 0 10px;">A. 工程回归（不是模型质量评测）</h4>${regressionHtml}<h4 style="margin:18px 0 10px;">B. 规则路由 baseline（人工标注标准 Skill）</h4>${routingHtml}`;
}

function archiveTraceRun(run) {
  if (!run?.runId) return;
  state.traceHistory = Array.isArray(state.traceHistory) ? state.traceHistory : [];
  state.traceHistory = [run, ...state.traceHistory.filter((item) => item.runId !== run.runId)].slice(0, TRACE_HISTORY_LIMIT);
  selectedTraceRunId = run.runId;
}

function traceStatusLabel(status) {
  return status === "success" ? "成功" : status === "failed" ? "失败" : status === "needs_clarification" ? "待澄清" : status || "未知";
}

function formatTraceDuration(value) {
  const duration = Number(value || 0);
  return duration >= 1000 ? `${(duration / 1000).toFixed(2)}s` : `${duration.toFixed(duration < 10 ? 2 : 0)}ms`;
}

function renderTraceHistory() {
  const list = $("trace-history-list");
  const detail = $("trace-run-detail");
  const metrics = $("trace-metrics");
  const filter = $("trace-status-filter");
  if (!list || !detail || !metrics || !filter) return;
  const allRuns = Array.isArray(state.traceHistory) ? state.traceHistory : [];
  const filteredRuns = filter.value === "all" ? allRuns : allRuns.filter((run) => run.status === filter.value);
  const selectedCandidate = allRuns.find((run) => run.runId === selectedTraceRunId);
  if (!selectedCandidate || (filter.value !== "all" && selectedCandidate.status !== filter.value)) selectedTraceRunId = filteredRuns[0]?.runId || null;
  const selected = allRuns.find((run) => run.runId === selectedTraceRunId) || null;
  const totalToolCalls = allRuns.reduce((sum, run) => sum + Number(run.summary?.toolCallCount || run.trace?.length || 0), 0);
  const totalModelCalls = allRuns.reduce((sum, run) => sum + Number(run.summary?.modelCallCount || 0), 0);
  metrics.innerHTML = `
    <div class="metric"><span>历史 Run</span><strong>${allRuns.length}</strong></div>
    <div class="metric"><span>工具调用</span><strong>${totalToolCalls}</strong></div>
    <div class="metric"><span>模型调用</span><strong>${totalModelCalls}</strong></div>
    <div class="metric"><span>当前耗时</span><strong style="font-size:18px;">${formatTraceDuration(selected?.summary?.totalDurationMs)}</strong></div>`;
  list.innerHTML = filteredRuns.length ? filteredRuns.map((run) => {
    const active = run.runId === selectedTraceRunId;
    const statusColor = run.status === "success" ? "green" : "yellow";
    const skillSummary = (run.routing?.plan || run.trace?.map((step) => step.skillKey) || []).map((key) => SKILL_PRESENTATION[key]?.title || key).join("、");
    return `<button data-trace-run-id="${escapeHtml(run.runId)}" style="text-align:left;padding:11px;border-color:${active ? "var(--accent)" : "var(--line)"};background:${active ? "var(--accent-soft)" : "var(--card)"};">
      <span style="display:flex;justify-content:space-between;gap:8px;"><strong>${escapeHtml(run.jobLabel || run.input?.job?.title || "未命名岗位")}</strong><span class="tag ${statusColor}">${traceStatusLabel(run.status)}</span></span>
      <span class="muted" style="margin-top:5px;">${escapeHtml(run.query || "")}</span>
      <span class="muted" style="margin-top:5px;">使用：${escapeHtml(skillSummary || "未调用 Skill")}</span>
      <span class="muted" style="margin-top:5px;">${new Date(run.startedAt || run.executedAt).toLocaleString()} · ${run.summary?.toolCallCount ?? run.trace?.length ?? 0} 次调用 · ${formatTraceDuration(run.summary?.totalDurationMs)}</span>
    </button>`;
  }).join("") : `<div class="empty">当前筛选条件下没有 Trace。</div>`;
  if (!selected) {
    detail.innerHTML = `<div class="empty">执行一次 Agent 任务后，可在这里查看节点时间线。</div>`;
    return;
  }
  const plan = selected.routing?.plan || selected.plan?.steps || [];
  const timeline = (selected.trace || []).map((step) => {
    const model = step.model || {};
    const presentation = SKILL_PRESENTATION[step.skillKey] || { title: step.skillName || step.skillKey };
    const output = selected.output?.[step.skillKey];
    return `<div class="brief-item ${step.status === "failed" ? "insight-card" : ""}" style="margin-bottom:9px;border-left:3px solid ${step.status === "success" ? "var(--green)" : "var(--danger)"};">
      <div class="section-head" style="margin-bottom:6px;"><div><strong>${step.step}. ${escapeHtml(presentation.title)}</strong><span class="muted">${escapeHtml(step.skillName || step.skillKey)}，第 ${step.callIndex || 1} 次调用，${escapeHtml(step.executionMode || "unknown")}</span></div><span class="tag ${step.status === "success" ? "green" : "yellow"}">${formatTraceDuration(step.durationMs)}</span></div>
      <div class="muted">开始：${new Date(step.startedAt).toLocaleTimeString()}，状态：${traceStatusLabel(step.status)}</div>
      <details style="margin-top:7px;"><summary>输入参数摘要</summary><pre style="white-space:pre-wrap;font-size:11px;line-height:1.45;">${escapeHtml(JSON.stringify(step.inputSummary || {}, null, 2))}</pre></details>
      <details><summary>输出摘要与完整结果</summary><pre style="white-space:pre-wrap;font-size:11px;line-height:1.45;max-height:260px;overflow:auto;">${escapeHtml(JSON.stringify({ summary: step.outputSummary || {}, result: output }, null, 2))}</pre></details>
      ${model.called || model.reason ? `<details><summary>模型调用</summary><pre style="white-space:pre-wrap;font-size:11px;line-height:1.45;">${escapeHtml(JSON.stringify(model, null, 2))}</pre></details>` : ""}
      ${step.errorMessage ? `<div class="muted" style="color:var(--danger);margin-top:6px;">${escapeHtml(`${step.errorType || "Error"}: ${step.errorMessage}`)}</div>` : ""}
    </div>`;
  }).join("");
  detail.innerHTML = `<div class="brief-item" style="margin-bottom:10px;">
    <div class="section-head" style="margin-bottom:6px;"><div><strong>${escapeHtml(selected.query)}</strong><span class="muted">Run ID：${escapeHtml(selected.runId)}</span></div><span class="tag ${selected.status === "success" ? "green" : "yellow"}">${traceStatusLabel(selected.status)}</span></div>
    <div class="muted">决策依据：${escapeHtml(selected.routing?.reason || "无")}</div>
    <div style="margin-top:8px;">${plan.map((key, index) => `<span class="tag blue">${index + 1}. ${escapeHtml(SKILL_PRESENTATION[key]?.title || key)}</span>`).join(" ")}</div>
    <details style="margin-top:8px;"><summary>Run 汇总</summary><pre style="white-space:pre-wrap;font-size:11px;line-height:1.45;">${escapeHtml(JSON.stringify({ planner: selected.routing?.planner, summary: selected.summary, input: selected.input }, null, 2))}</pre></details>
  </div>${timeline || `<div class="empty">本次任务在规划阶段停止，没有执行 Tool。</div>`}`;
}

function exportSelectedTrace() {
  const run = (state.traceHistory || []).find((item) => item.runId === selectedTraceRunId);
  if (!run) return showToast("请先选择一条 Trace");
  const blob = new Blob([JSON.stringify(run, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `careerpilot-trace-${run.runId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast("Trace JSON 已导出");
}

function renderQuickStart() {
  if (!$("quick-role-category")?.options.length) {
    renderRoleCascade("quick", { category: "产品经理", track: "AI产品经理", specialty: "AI Agent" });
  }
  ensureResumeLibrary();
  const resumeSelect = $("quick-resume-select");
  if (resumeSelect) {
    if (!state.profile.resumes.some((resume) => resume.id === quickSelectedResumeId)) {
      quickSelectedResumeId = state.profile.activeResumeId;
    }
    resumeSelect.innerHTML = state.profile.resumes.map((resume) => {
      const body = String(resume.resume || resume.previewText || "");
      const suffix = resume.id === state.profile.activeResumeId ? " · 默认" : "";
      return `<option value="${escapeHtml(resume.id)}">${escapeHtml(resume.name || resume.fileName || "未命名简历")}${suffix} · ${body.length} 字</option>`;
    }).join("");
    resumeSelect.value = quickSelectedResumeId;
    const selected = selectedQuickResume();
    if (!quickResumeFileName && !$("quick-resume")?.value.trim()) {
      $("quick-resume-status").textContent = selected?.resume
        ? `当前使用：${selected.name || selected.fileName} · ${selected.resume.length} 字`
        : "所选版本没有可用正文，可更换版本或上传新简历";
    }
  }
  document.querySelectorAll("[data-quick-task]").forEach((button) => {
    const selected = quickTaskSelection.has(button.dataset.quickTask);
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  $("quick-step-resume")?.classList.toggle("is-waiting", !$("quick-company")?.value.trim() || !$("quick-jd")?.value.trim());
  $("quick-step-goal")?.classList.toggle("is-waiting", !quickContextReady);
  const pipeline = $("quick-pipeline");
  if (!pipeline) return;
  const confirmation = $("quick-confirmation");
  if (confirmation) confirmation.hidden = !quickContextReady;
  if (!quickContextReady) {
    $("quick-guide-title").textContent = "接下来怎么做";
    $("quick-guide-copy").textContent = "先填写目标公司和岗位方向，再提交 JD 并选择已有简历。确认上下文后，系统会一次性执行所需能力。";
    pipeline.innerHTML = [
      ["1", "确认目标", "填写公司，并选择三级岗位方向"],
      ["2", "提交材料", "粘贴 JD，并从简历库选择已有版本"],
      ["3", "选择任务", "明确需要岗位理解、匹配还是面试准备"],
      ["4", "统一执行", "Planner 编排 Skill，并在结果页展示调用证据"]
    ].map(([index, title, copy]) => `<div class="quick-pipeline-item"><b>${index}</b><div><strong>${title}</strong><span>${copy}</span></div></div>`).join("");
    return;
  }
  $("quick-guide-title").textContent = "预计使用的能力";
  $("quick-guide-copy").textContent = "根据你选择的目标，系统会按依赖关系执行以下能力。";
  const skillKeys = [...new Set([...quickTaskSelection].flatMap((key) => QUICK_TASKS[key]?.skills || []))];
  pipeline.innerHTML = skillKeys.length ? skillKeys.map((skillKey, index) => {
    const presentation = SKILL_PRESENTATION[skillKey];
    return `<div class="quick-pipeline-item"><b>${index + 1}</b><div><strong>${escapeHtml(presentation.title)}</strong><span>${escapeHtml(presentation.summary)}</span></div></div>`;
  }).join("") : `<div class="quick-pipeline-item"><b>1</b><div><strong>等待选择目标</strong><span>选择一项任务后，这里会显示预计使用的能力。</span></div></div>`;
}

function prepareQuickContext() {
  const company = $("quick-company").value.trim();
  const jd = $("quick-jd").value.trim();
  if (!company) {
    $("quick-company").focus();
    return showToast("请先填写目标公司");
  }
  if (!jd) {
    $("quick-jd").focus();
    return showToast("请先粘贴招聘 JD 或描述这次机会");
  }
  const rolePath = readRolePath("quick");
  const resumeText = $("quick-resume").value.trim();
  const existingResume = resumeText ? null : selectedQuickResume();
  const resumeLabel = quickResumeFileName || (resumeText ? `已粘贴 ${resumeText.length} 字` : existingResume?.resume ? existingResume.name : "尚未添加");
  $("quick-context-confirmed").innerHTML = `
    <div><span>目标公司</span><strong>${escapeHtml(company)}</strong></div>
    <div><span>岗位方向</span><strong>${escapeHtml(rolePathLabel(rolePath))}</strong></div>
    <div><span>JD 材料</span><strong>${jd.length} 字</strong></div>
    <div><span>使用简历</span><strong>${escapeHtml(resumeLabel)}</strong></div>`;
  quickContextReady = true;
  renderQuickStart();
  $("quick-confirmation").scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
}

function invalidateQuickContext() {
  if (!quickContextReady) {
    renderQuickStart();
    return;
  }
  quickContextReady = false;
  renderQuickStart();
}

async function startQuickTask() {
  const company = $("quick-company").value.trim();
  const rolePath = readRolePath("quick");
  const jd = $("quick-jd").value.trim();
  const draftResumeText = $("quick-resume").value.trim();
  const selectedLibraryResume = draftResumeText ? null : selectedQuickResume();
  const resumeText = draftResumeText || selectedLibraryResume?.resume || "";
  const selectedTasks = [...quickTaskSelection];
  if (!company) {
    $("quick-company").focus();
    return showToast("请先填写目标公司");
  }
  if (!jd) {
    $("quick-jd").focus();
    return showToast("请先粘贴招聘 JD");
  }
  if (!selectedTasks.length) return showToast("请至少选择一项任务");
  if (selectedTasks.some((task) => task !== "understand") && !resumeText) {
    $("quick-resume-select").focus();
    return showToast("这项任务需要简历，请选择包含正文的版本，或上传新简历");
  }

  const button = $("quick-start-task");
  button.disabled = true;
  button.textContent = "正在整理材料...";
  try {
    ensureResumeLibrary();
    let resume = selectedLibraryResume
      || state.profile.resumes.find((item) => String(item.resume || "").trim() === resumeText);
    if (draftResumeText && !resume) {
      resume = {
        id: crypto.randomUUID(),
        name: quickResumeFileName ? quickResumeFileName.replace(/\.[^.]+$/, "") : "快速开始简历",
        resume: resumeText,
        projects: "",
        fileName: quickResumeFileName,
        fileType: quickResumeFileName.split(".").pop() || "text",
        fileAssetId: quickResumeFileAssetId,
        previewText: resumeText,
        previewKind: "text",
        previewUrl: "",
        parseStatus: "parsed",
        parsedCharCount: resumeText.length
      };
      state.profile.resumes.unshift(resume);
    }
    if (resume) state.profile.activeResumeId = resume.id;

    const title = rolePath.custom || (rolePath.specialty === "通用" ? rolePath.track : `${rolePath.track} · ${rolePath.specialty}`);
    let job = state.jobs.find((item) => String(item.jd || "").trim() === jd);
    if (!job) {
      job = {
        id: crypto.randomUUID(),
        company,
        title,
        type: rolePath.track,
        roleCategory: rolePath.category,
        roleTrack: rolePath.track,
        roleSpecialty: rolePath.specialty,
        roleCustom: rolePath.custom,
        status: "已保存",
        channel: "官网",
        date: "",
        link: "",
        jd,
        resumeId: resume?.id || state.profile.activeResumeId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        todos: ["确认岗位信息", "查看本次分析结果"],
        review: {}
      };
      state.jobs.unshift(job);
    } else {
      job.company = company;
      job.title = title;
      job.type = rolePath.track;
      job.roleCategory = rolePath.category;
      job.roleTrack = rolePath.track;
      job.roleSpecialty = rolePath.specialty;
      job.roleCustom = rolePath.custom;
      if (resume) job.resumeId = resume.id;
      job.updatedAt = new Date().toISOString();
    }
    selectedJobId = job.id;
    persist();

    const extra = $("quick-extra").value.trim();
    const query = selectedTasks.map((task) => QUICK_TASKS[task].query).join("；") + (extra ? `；补充要求：${extra}` : "");
    $("skill-job-select").value = job.id;
    $("skill-task-query").value = query;
    const run = await runSkillTask();
    const analysis = applyAgentRunToJob(job, run);
    persist();
    activate(analysis ? "analysis" : "assistant");
  } catch (error) {
    showToast(`材料处理失败：${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = "分析材料并开始任务";
  }
}

async function loadQuickResumeFile(file) {
  if (!file) return;
  quickResumeFileName = file.name;
  $("quick-resume-status").textContent = `正在读取 ${file.name}...`;
  try {
    let text = "";
    if (file.name.match(/\.(txt|md)$/i)) {
      text = await file.text();
      const asset = await storeUploadedFile(file, "resume");
      quickResumeFileAssetId = asset.id;
    } else {
      const parsed = await parseResumeFile(file);
      text = parsed.text;
      quickResumeFileAssetId = parsed.fileAssetId || "";
    }
    $("quick-resume").value = text;
    $("quick-resume").closest("details").open = true;
    invalidateQuickContext();
    $("quick-resume-status").textContent = `${file.name}，已读取 ${text.length} 字`;
    showToast("简历已读取，可以选择任务");
  } catch (error) {
    $("quick-resume-status").textContent = `${file.name} 读取失败`;
    showToast(`简历读取失败：${error.message}`);
  } finally {
    $("quick-resume-file").value = "";
  }
}

async function runSkillTask() {
  const query = $("skill-task-query").value.trim();
  if (!query) return showToast("请先描述你想完成的求职任务");
  const jobId = $("skill-job-select").value;
  const job = state.jobs.find((item) => item.id === jobId) || currentJob();
  if (!job) return showToast("请先创建或选择一个岗位");
  const button = $("run-skill-task");
  button.disabled = true;
  button.textContent = "正在理解并执行任务...";
  state.skillRun = {
    runId: crypto.randomUUID(),
    query,
    jobId: job.id,
    jobLabel: `${job.company} - ${job.title}`,
    status: "running",
    routing: { plan: [] },
    summary: { toolCallCount: 0, modelCallCount: 0, totalDurationMs: 0 },
    trace: [],
    output: {}
  };
  renderSkills();
  try {
    const response = await fetch("/api/agent/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        job: {
          id: job.id,
          company: job.company,
          title: job.title,
          type: job.type,
          roleCategory: job.roleCategory || "",
          roleTrack: job.roleTrack || "",
          roleSpecialty: job.roleSpecialty || "",
          businessLine: job.businessLine || "",
          jdUrl: job.link || "",
          researchReferences: job.researchReferences || "",
          jd: job.jd
        },
        profile: profileForJob(job),
        options: inferCoverLetterOptionsFromQuery(query, job)
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Agent API 请求失败：${response.status}`);
    state.skillRun = { ...data, jobId: job.id, jobLabel: `${job.company} - ${job.title}`, executedAt: new Date().toISOString() };
  } catch (error) {
    state.skillRun = { runId: crypto.randomUUID(), query, routing: { skillKey: null, reason: "Agent API 执行失败", plan: [] }, jobId: job.id, jobLabel: `${job.company} - ${job.title}`, startedAt: new Date().toISOString(), executedAt: new Date().toISOString(), status: "failed", error: error.message, summary: { toolCallCount: 0, modelCallCount: 0, totalDurationMs: 0 }, trace: [], input: {}, output: {} };
  } finally {
    button.disabled = false;
    button.textContent = "开始执行任务";
  }
  archiveTraceRun(state.skillRun);
  persist();
  renderSkills();
  return state.skillRun;
}

function renderAssistantSkillOutput(skillKey, output) {
  if (!output) return `<span class="muted">该步骤没有返回结果。</span>`;
  if (skillKey === "understandJobIndustry") {
    if (output.roleUnderstanding) return renderRoleUnderstandingSkill(output.roleUnderstanding, roleUnderstandingToFocused(output.roleUnderstanding, currentJob()));
    return `<div class="brief-item"><strong>${escapeHtml(output.industryClassification?.primaryIndustry || output.roleType || "岗位与行业理解")}</strong><span class="muted">${escapeHtml(output.industryClassification?.limitation || "当前基于 JD 形成岗位理解。")}</span></div>${renderNumbered("核心任务", output.coreTasks || [])}${renderNumbered("必备能力", output.requiredSkills || [])}${renderNumbered("待确认与后续研究", output.unresolvedFacts || [])}`;
  }
  if (skillKey === "profileMatcher") return `<div class="brief-item"><strong>证据覆盖分 ${Number(output.fit?.score || 0)}</strong><span class="muted">${escapeHtml(output.fit?.scoreDefinition || "")}</span></div>${renderNumbered("已有证据", output.fit?.strongMatches || [])}${renderNumbered("需要补强", output.fit?.gaps || [])}`;
  if (skillKey === "interviewRetrospective") {
    const metrics = output.preparationAudit?.metrics || {};
    const coverage = metrics.preparationCoveragePct;
    return `<div class="brief-item"><strong>准备覆盖 ${coverage === null || coverage === undefined ? "不可评估" : `${coverage}%`}</strong><span class="muted">回答均分 ${metrics.averageAnswerScore ?? "未记录"} · 证据均分 ${metrics.averageEvidenceScore ?? "未记录"}</span></div>${renderNumbered("三条结论", output.summary?.threeConclusions || [])}${renderNumbered("岗位新信号", output.roleInsights?.newSignals || [])}${renderNumbered("下一轮行动", [...(output.nextRoundPlan?.evidenceTasks || []), ...(output.nextRoundPlan?.rehearsalTasks || [])])}`;
  }
  if (skillKey === "riskDiagnoser") return `${renderNumbered("高概率追问", output.likelyQuestions || [])}${renderNumbered("风险点", output.riskPoints || [])}${renderNumbered("表达边界", output.boundaries || [])}`;
  if (skillKey === "prepPlanner") return `${renderNumbered("准备清单", output.todoList || [])}<div class="brief-item"><strong>自我介绍角度</strong><span class="muted">${escapeHtml(output.oneMinuteIntroAngle || "")}</span></div>`;
  if (skillKey === "coverLetterTailor") {
    if (output.status === "needs_clarification") return renderNumbered("生成前需要确认", output.blockingQuestions || []);
    return `<div class="brief-item"><strong>推荐文案</strong><pre style="white-space:pre-wrap;margin:8px 0 0;font:inherit;line-height:1.65;">${escapeHtml(output.recommended || "")}</pre></div>${renderNumbered("采用的真实证据", (output.selectedEvidence || []).map((item) => item.sourceEvidence || item))}`;
  }
  return `<pre style="white-space:pre-wrap;font-size:11px;line-height:1.5;">${escapeHtml(JSON.stringify(output, null, 2))}</pre>`;
}

function renderSkills() {
  const cards = $("skill-registry-cards");
  const select = $("skill-job-select");
  const result = $("skill-run-result");
  if (cards) {
    cards.innerHTML = Object.entries(SKILL_REGISTRY).map(([key, skill]) => {
      const presentation = SKILL_PRESENTATION[key];
      const action = key === "interviewRetrospective"
        ? `<div class="capability-action"><button class="primary" data-skill-entry="interview">去复盘面试</button></div>`
        : "";
      return `<article class="capability-item">
        <div><h3>${escapeHtml(presentation.title)}</h3><span class="capability-meta">${escapeHtml(skill.name)}</span></div>
        <div>
          <p>${escapeHtml(presentation.summary)}</p>
          <div class="capability-meta"><strong>什么时候使用：</strong>${escapeHtml(presentation.when)}<br><strong>你会得到：</strong>${escapeHtml(presentation.outcome)}</div>
          <details style="margin-top:9px;"><summary>查看技术边界</summary><div class="capability-meta" style="margin-top:7px;"><strong>需要：</strong>${escapeHtml(skill.requiredContext.join("、"))}<br><strong>停止条件：</strong>${escapeHtml(skill.failureBoundary)}</div></details>
          ${action}
        </div>
      </article>`;
    }).join("");
    cards.querySelectorAll("[data-skill-entry='interview']").forEach((button) => {
      button.addEventListener("click", () => {
        activate("interview");
        window.setTimeout(() => $("review-runner")?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
          block: "center"
        }), 80);
      });
    });
  }
  if (select) {
    select.innerHTML = state.jobs.map((job) => `<option value="${job.id}" ${job.id === (state.skillRun?.jobId || selectedJobId) ? "selected" : ""}>${escapeHtml(job.company)} - ${escapeHtml(job.title)}</option>`).join("");
  }
  const selectedAssistantJob = state.jobs.find((job) => job.id === select?.value) || currentJob();
  const context = $("assistant-context");
  if (context) {
    const profile = selectedAssistantJob ? profileForJob(selectedAssistantJob) : {};
    context.innerHTML = `<div><span>当前岗位</span><strong>${escapeHtml(selectedAssistantJob ? `${selectedAssistantJob.company} - ${selectedAssistantJob.title}` : "尚未选择")}</strong></div><div><span>使用资料</span><strong>${escapeHtml(profile.activeResumeName || profile.resumeFileName || "默认简历")}</strong></div>`;
  }
  renderTraceHistory();
  if (!result) return;
  const run = state.skillRun;
  if (!run) {
    result.innerHTML = `<div class="assistant-empty"><strong>结果会显示在这里</strong><span>执行后，你会看到任务结果、使用了哪些 Skill，以及每一步为什么被调用。</span></div>`;
    return;
  }
  if (run.status === "running") {
    result.innerHTML = `<div class="assistant-run-head"><h3>正在执行完整分析</h3><p class="muted">Planner 正在拆解任务，岗位理解 Skill 会调用模型；完成后将进入统一结果页。</p></div>
      <div class="assistant-loading" aria-live="polite"><span></span><span></span><span></span></div>`;
    return;
  }
  const usedSkills = (run.trace || []).map((step) => {
    const presentation = SKILL_PRESENTATION[step.skillKey] || { title: step.skillName || step.skillKey };
    const evidence = step.model?.called
      ? `模型已调用 · ${step.model.provider || "provider"} / ${step.model.model || "model"}`
      : step.model?.status === "failed"
        ? "模型失败，已使用本地兜底"
        : "本地规则执行";
    return `<div class="used-skill"><strong>${escapeHtml(presentation.title)}</strong><span>${traceStatusLabel(step.status)} · ${formatTraceDuration(step.durationMs)} · ${escapeHtml(evidence)}</span></div>`;
  }).join("");
  const clarificationItems = Object.values(run.output || {}).flatMap((output) => output?.blockingQuestions || []);
  const statusTitle = run.status === "success" ? "任务已完成" : run.status === "needs_clarification" ? "还需要你补充信息" : "任务执行失败";
  const outputList = (run.trace || []).map((step, index) => {
    const presentation = SKILL_PRESENTATION[step.skillKey] || { title: step.skillName || step.skillKey };
    return `<details ${index === (run.trace || []).length - 1 ? "open" : ""}><summary>${escapeHtml(presentation.title)}</summary><div style="margin-top:10px;">${renderAssistantSkillOutput(step.skillKey, run.output?.[step.skillKey])}</div></details>`;
  }).join("");
  result.innerHTML = `<div class="assistant-run-head"><h3>${statusTitle}</h3><p class="muted">${escapeHtml(run.query || "")}</p><span class="muted">${escapeHtml(run.routing?.reason || "")}</span></div>
    <div style="margin-top:18px;"><strong>本次使用 ${run.summary?.toolCallCount ?? run.trace?.length ?? 0} 个 Skill，调用模型 ${run.summary?.modelCallCount ?? 0} 次，总耗时 ${formatTraceDuration(run.summary?.totalDurationMs || 0)}</strong><div class="used-skills">${usedSkills || `<span class="muted">任务在规划阶段停止。</span>`}</div></div>
    ${clarificationItems.length ? renderNumbered("请补充", clarificationItems) : ""}
    ${run.error ? `<div class="brief-item insight-card"><strong>错误</strong><span class="muted">${escapeHtml(run.error)}</span></div>` : ""}
    <div class="assistant-output-list">${outputList}</div>
    <div class="actions" style="margin-top:16px;"><button data-open-trace="${escapeHtml(run.runId || "")}">查看完整运行记录</button></div>`;
}

const seedJobs = [
  {
    id: crypto.randomUUID(),
    company: "小红书",
    title: "AI 产品经理实习生",
    type: "AI 产品",
    status: "面试中",
    channel: "官网",
    date: "2026-06-15T14:00",
    link: "https://careers.example.com/job/ai-pm-intern",
    jd: "负责 AI 产品功能规划，结合社区内容生态和创作者需求，探索大模型在内容生产、分发、互动等场景的应用。与算法、工程、设计团队协作，推进产品需求落地，并基于用户反馈持续迭代体验。",
    todos: ["研究公司 AI 产品线", "记录面试问题", "复盘风险追问"],
    review: {}
  },
  {
    id: crypto.randomUUID(),
    company: "字节跳动｜豆包",
    title: "AI 产品实习生－AI 创新",
    type: "AI 产品",
    status: "面试中",
    channel: "内推",
    date: "2026-07-19T20:00",
    link: "",
    jd: "参与打造超级 Agent，并有机会独立负责部分链路。负责用户行为数据采集、清洗与分析，包括用户意图分类标注、负面案例归因和分类占比统计；参与产品策略需求文档撰写与迭代，完成场景梳理、理想态定义和 Skill 定义；与算法、工程、设计协作，推进技术方案对齐和效果验收；评估大模型在业务场景中的能力，包括工具调用准确率、Function Call 参数提取质量和工具调用链路设计。要求理解 LLM、Agent、Function Call、Skill、API 交互和 Coding Agent。",
    todos: ["运行 CareerPilot Eval Lab", "准备证据覆盖分口径", "讲清已修复 badcase 与 Function Calling 边界"],
    review: {}
  }
];

let state = loadState();
let selectedJobId = state.selectedJobId || state.jobs[0]?.id || null;
let currentStatusFilter = "全部";
let analysisRunning = false;
let moduleRunningKey = null;
let moduleProgressTimer = null;
let moduleProgress = {};
let apiHealth = null;
let progressTimer = null;
let selectedReviewRoundId = null;
let selectedReviewQuestionId = null;
let currentProjectPanel = "overview";
let currentProjectPrepSection = "jobUnderstanding";
let reviewRunStageTimer = null;
let selectedTraceRunId = null;
let quickTaskSelection = new Set(["interview"]);
let quickResumeFileName = "";
let quickResumeFileAssetId = "";
let quickSelectedResumeId = state.profile.activeResumeId || "";
let quickContextReady = false;
let databasePersistenceReady = false;
let databaseSyncTimer = null;
let databaseSyncInFlight = null;

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed.appVersion !== APP_VERSION) parsed.appVersion = APP_VERSION;
    const byteDanceDemo = seedJobs.find((job) => job.jd.includes("Function Call"));
    const hasByteDanceDemo = (parsed.jobs || []).some((job) => job.company?.includes("字节跳动") && job.title?.includes("AI 创新"));
    if (byteDanceDemo && !hasByteDanceDemo) {
      parsed.jobs = parsed.jobs || [];
      parsed.jobs.push({
        ...byteDanceDemo,
        id: crypto.randomUUID(),
        todos: [...byteDanceDemo.todos],
        review: {}
      });
    }
    ensureResumeLibrary(parsed);
    parsed.traceHistory = Array.isArray(parsed.traceHistory) ? parsed.traceHistory.slice(0, TRACE_HISTORY_LIMIT) : [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    return parsed;
  }
  const initial = {
    appVersion: APP_VERSION,
    profile: {
      target: "AI 产品经理、数据产品",
      industry: "内容社区、AI 应用、SaaS",
      resume: "",
      resumeFileName: "",
      resumeFileType: "",
      resumePreviewText: "",
      resumePreviewKind: "",
      projects: "CareerPilot AI：面向海投场景的 JD 拆解与面试准备助手。"
    },
    jobs: seedJobs,
    selectedJobId: seedJobs[0].id,
    traceHistory: []
  };
  ensureResumeLibrary(initial);
  return initial;
}

function ensureResumeLibrary(data = state) {
  data.profile = data.profile || {};
  if (!Array.isArray(data.profile.resumes) || !data.profile.resumes.length) {
    const id = crypto.randomUUID();
    data.profile.resumes = [{
      id,
      name: data.profile.resumeFileName || "默认简历",
      resume: data.profile.resume || "",
      projects: data.profile.projects || "",
      fileName: data.profile.resumeFileName || "",
      fileType: data.profile.resumeFileType || "",
      previewText: data.profile.resumePreviewText || "",
      previewKind: data.profile.resumePreviewKind || "",
      previewUrl: data.profile.resumePreviewUrl || ""
    }];
    data.profile.activeResumeId = id;
  }
  if (!data.profile.activeResumeId || !data.profile.resumes.some((resume) => resume.id === data.profile.activeResumeId)) {
    data.profile.activeResumeId = data.profile.resumes[0].id;
  }
  (data.jobs || []).forEach((job) => {
    if (!job.resumeId) job.resumeId = data.profile.activeResumeId;
  });
}

function activeResume() {
  ensureResumeLibrary();
  return state.profile.resumes.find((resume) => resume.id === state.profile.activeResumeId) || state.profile.resumes[0];
}

function selectedQuickResume() {
  ensureResumeLibrary();
  return state.profile.resumes.find((resume) => resume.id === quickSelectedResumeId) || activeResume();
}

function resumeForJob(job = currentJob()) {
  ensureResumeLibrary();
  const resumeId = job?.resumeId || state.profile.activeResumeId;
  return state.profile.resumes.find((resume) => resume.id === resumeId) || activeResume();
}

function profileForJob(job = currentJob()) {
  const resume = resumeForJob(job);
  return {
    ...state.profile,
    resumeId: resume.id,
    resume: resume.resume || "",
    projects: resume.projects || "",
    resumeFileName: resume.fileName || resume.name || "",
    resumeFileType: resume.fileType || "",
    activeResumeName: resume.name || "默认简历"
  };
}

function persist() {
  state.selectedJobId = selectedJobId;
  state.persistenceMeta = {
    ...(state.persistenceMeta || {}),
    localUpdatedAt: new Date().toISOString()
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  scheduleDatabaseSync();
}

function scheduleDatabaseSync() {
  if (!databasePersistenceReady) return;
  window.clearTimeout(databaseSyncTimer);
  databaseSyncTimer = window.setTimeout(() => syncStateToDatabase("browser-sync"), DATABASE_SYNC_DELAY_MS);
}

async function syncStateToDatabase(source = "browser-sync") {
  if (databaseSyncInFlight) await databaseSyncInFlight.catch(() => {});
  const snapshot = JSON.parse(JSON.stringify(state));
  databaseSyncInFlight = fetch("/api/data/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, state: snapshot })
  }).then(async (response) => {
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || `数据库保存失败：${response.status}`);
    state.persistenceMeta = {
      ...(state.persistenceMeta || {}),
      databaseSavedAt: result.savedAt,
      databaseContentHash: result.contentHash,
      databaseStatus: "ready"
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return result;
  }).catch((error) => {
    state.persistenceMeta = { ...(state.persistenceMeta || {}), databaseStatus: "error", databaseError: error.message };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    console.warn("CareerPilot 数据库同步失败", error);
    throw error;
  }).finally(() => {
    databaseSyncInFlight = null;
  });
  return databaseSyncInFlight;
}

async function initializeDatabasePersistence() {
  const localRaw = localStorage.getItem(STORAGE_KEY);
  try {
    const response = await fetch("/api/data/bootstrap", { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || `数据库初始化失败：${response.status}`);

    const localUpdatedAt = Date.parse(state.persistenceMeta?.localUpdatedAt || 0) || 0;
    const databaseSavedAt = Date.parse(result.savedAt || 0) || 0;
    if (result.hasPersistedState && result.state && databaseSavedAt >= localUpdatedAt) {
      state = result.state;
      ensureResumeLibrary(state);
      selectedJobId = state.selectedJobId || state.jobs[0]?.id || null;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render();
    }

    databasePersistenceReady = true;
    if (!result.hasPersistedState) {
      await syncStateToDatabase(localRaw ? "legacy-localstorage" : "initial-state");
    } else if (localUpdatedAt > databaseSavedAt) {
      await syncStateToDatabase("browser-recovery");
    }
  } catch (error) {
    databasePersistenceReady = false;
    state.persistenceMeta = { ...(state.persistenceMeta || {}), databaseStatus: "error", databaseError: error.message };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    console.warn("CareerPilot 数据库初始化失败，当前继续使用本地缓存", error);
  }
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1800);
}

async function refreshApiHealth() {
  try {
    const response = await fetch("/api/health");
    apiHealth = await response.json();
  } catch (error) {
    apiHealth = { ok: false, error: error.message };
  }
  renderApiStatus();
  if ($("interview")?.classList.contains("active")) renderInterview();
}

function renderApiStatus() {
  const node = $("api-status");
  if (!node) return;
  if (!apiHealth) {
    node.innerHTML = `<strong>API 状态</strong><span class="muted">正在检查...</span>`;
    return;
  }
  const connected = apiHealth.ok && (apiHealth.hasDeepSeekKey || apiHealth.hasOpenAIKey);
  node.innerHTML = `<strong>API 状态</strong><span class="muted">${connected ? `DeepSeek 已连接 · ${apiHealth.model || "默认模型"}` : `未连接：${apiHealth.error || "未读取到 API Key"}`}</span>`;
}

function setAnalysisProgress(percent, text) {
  $("analysis-progress").classList.add("active");
  $("analysis-progress-bar").style.width = `${percent}%`;
  $("analysis-progress-value").textContent = `${percent}%`;
  $("analysis-progress-text").textContent = text;
}

function resetAnalysisProgress() {
  window.clearInterval(progressTimer);
  progressTimer = null;
  $("analysis-progress").classList.remove("active");
  $("analysis-progress-bar").style.width = "0%";
  $("analysis-progress-value").textContent = "0%";
  $("analysis-progress-text").textContent = "准备开始分析";
}

function startAnalysisProgress() {
  analysisRunning = true;
  let value = 8;
  const steps = [
    "正在解析 JD...",
    "正在匹配个人资料...",
    "正在识别面试风险...",
    "正在生成准备方案..."
  ];
  setAnalysisProgress(value, steps[0]);
  window.clearInterval(progressTimer);
  progressTimer = window.setInterval(() => {
    value = Math.min(value + Math.floor(Math.random() * 10) + 5, 88);
    const stepIndex = value < 30 ? 0 : value < 55 ? 1 : value < 75 ? 2 : 3;
    setAnalysisProgress(value, steps[stepIndex]);
  }, 520);
}

function finishAnalysisProgress(success = true) {
  window.clearInterval(progressTimer);
  progressTimer = null;
  setAnalysisProgress(100, success ? "分析完成" : "已使用本地兜底完成");
  window.setTimeout(() => {
    analysisRunning = false;
    resetAnalysisProgress();
    renderModuleButtons(currentJob());
  }, 650);
}

function setModuleProgress(key, percent, text) {
  moduleProgress[key] = { percent, text };
  const bar = document.querySelector(`[data-module-progress-bar="${key}"]`);
  const value = document.querySelector(`[data-module-progress-value="${key}"]`);
  const label = document.querySelector(`[data-module-progress-text="${key}"]`);
  if (bar) bar.style.width = `${percent}%`;
  if (value) value.textContent = `${percent}%`;
  if (label) label.textContent = text;
}

function startModuleProgress(key) {
  moduleRunningKey = key;
  let value = 8;
  setModuleProgress(key, value, "正在调用 AI 分析...");
  window.clearInterval(moduleProgressTimer);
  moduleProgressTimer = window.setInterval(() => {
    value = Math.min(value + Math.floor(Math.random() * 12) + 6, 90);
    const text = value < 45 ? "正在读取 JD 和简历..." : value < 75 ? "正在组织结构化结论..." : "正在整理可读结果...";
    setModuleProgress(key, value, text);
  }, 460);
  renderModuleButtons(currentJob());
}

function finishModuleProgress(key, text = "生成完成") {
  window.clearInterval(moduleProgressTimer);
  moduleProgressTimer = null;
  setModuleProgress(key, 100, text);
  window.setTimeout(() => {
    moduleRunningKey = null;
    delete moduleProgress[key];
    renderModuleButtons(currentJob());
  }, 500);
}

function $(id) { return document.getElementById(id); }
function currentJob() { return state.jobs.find((job) => job.id === selectedJobId) || state.jobs[0]; }
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function ensureJobTodos(job) {
  if (!job) return [];
  job.todos = (job.todos || []).map((todo) => {
    if (typeof todo === "string") {
      return { id: crypto.randomUUID(), text: todo, done: false, createdAt: new Date().toISOString() };
    }
    return {
      id: todo.id || crypto.randomUUID(),
      text: todo.text || todo.todo || "",
      done: Boolean(todo.done),
      createdAt: todo.createdAt || new Date().toISOString()
    };
  }).filter((todo) => todo.text);
  return job.todos;
}

function allTodos() {
  return state.jobs.flatMap((job) => ensureJobTodos(job).map((todo) => ({ todo, job })));
}

function preparationSnapshotForJob(job, captureTiming = "round-creation") {
  const source = {
    analysis: job?.analysis || {},
    analysisModules: job?.analysisModules || {},
    selfIntroductionSkill: job?.selfIntroductionSkill || {},
    riskQuestions: job?.analysis?.riskQuestions || job?.prep?.riskQuestions || [],
    prepSuggestions: job?.analysis?.prepSuggestions || job?.prep?.todoList || [],
    sourceRunId: (state.traceHistory || []).find((run) => run.jobId === job?.id && run.output?.prepPlanner)?.runId || ""
  };
  const serialized = JSON.stringify(source);
  let value = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) value = Math.imul(value ^ serialized.charCodeAt(index), 16777619);
  return { generatedAt: new Date().toISOString(), contentHash: `browser-${(value >>> 0).toString(16)}`, captureTiming, ...JSON.parse(serialized) };
}

function createReviewRound(job, title = "") {
  return {
    id: crypto.randomUUID(),
    title: title || `第 ${(job?.reviewRounds?.length || 0) + 1} 轮面试`,
    date: "",
    format: "",
    interviewer: "",
    questions: "",
    answers: "",
    notes: "",
    gaps: "",
    nextSteps: "",
    sourceDraft: "",
    sourceAsset: null,
    sourceExtraction: null,
    audio: null,
    preparationSnapshot: preparationSnapshotForJob(job, "round-creation"),
    aiReview: null,
    aiReviewHistory: [],
    aiReviewRunId: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function createReviewQuestion(round, title = "") {
  return {
    id: crypto.randomUUID(),
    title: title || `问题 ${(round?.questionItems?.length || 0) + 1}`,
    answer: "",
    thinking: "",
    gap: "",
    nextAnswer: "",
    category: "业务面",
    questionerRole: "面试官",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function ensureReviewQuestions(round, manageSelection = true) {
  if (!round) return [];
  if (!Array.isArray(round.questionItems)) round.questionItems = [];
  if (!round.questionsMigrated && (round.questions || round.answers || round.gaps)) {
    const questions = splitLines(round.questions);
    const answers = splitLines(round.answers);
    const gaps = splitLines(round.gaps);
    if (questions.length) {
      questions.forEach((question, index) => {
        round.questionItems.push({
          ...createReviewQuestion(round, question),
          title: question,
          answer: answers[index] || "",
          gap: gaps[index] || "",
          updatedAt: round.updatedAt || new Date().toISOString()
        });
      });
    }
    round.questionsMigrated = true;
  }
  if (!round.questionItems.length) {
    round.questionItems.push(createReviewQuestion(round, "问题 1"));
  }
  if (manageSelection && (!selectedReviewQuestionId || !round.questionItems.some((question) => question.id === selectedReviewQuestionId))) {
    selectedReviewQuestionId = round.questionItems[0].id;
  }
  return round.questionItems;
}

function currentReviewQuestion(round = currentReviewRound()) {
  const questions = visibleReviewQuestions(round);
  const selected = questions.find((question) => question.id === selectedReviewQuestionId) || questions[0] || null;
  if (selected) selectedReviewQuestionId = selected.id;
  return selected;
}

function visibleReviewQuestions(round = currentReviewRound()) {
  const questions = ensureReviewQuestions(round, false);
  const visible = questions.filter((question) => isSubstantiveReviewQuestion(question) || question.userCreated);
  return visible.length ? visible : questions.slice(0, 1);
}

function ensureReviewRounds(job = currentJob()) {
  if (!job) return [];
  if (!Array.isArray(job.reviewRounds)) job.reviewRounds = [];
  if (job.review && (job.review.questions || job.review.notes) && !job.reviewMigrated) {
    job.reviewRounds.push({
      ...createReviewRound(job, "历史复盘"),
      questions: job.review.questions || "",
      notes: job.review.notes || "",
      updatedAt: job.review.updatedAt || new Date().toISOString()
    });
    job.reviewMigrated = true;
  }
  if (!job.reviewRounds.length) {
    job.reviewRounds.push(createReviewRound(job, "第一轮面试"));
  }
  if (!selectedReviewRoundId || !job.reviewRounds.some((round) => round.id === selectedReviewRoundId)) {
    selectedReviewRoundId = job.reviewRounds[0].id;
  }
  job.reviewRounds.forEach((round) => ensureReviewQuestions(round, round.id === selectedReviewRoundId));
  job.reviewRounds.forEach((round) => {
    if (!Array.isArray(round.aiReviewHistory)) round.aiReviewHistory = [];
  });
  return job.reviewRounds;
}

function currentReviewRound(job = currentJob()) {
  const rounds = ensureReviewRounds(job);
  return rounds.find((round) => round.id === selectedReviewRoundId) || rounds[0] || null;
}

function visibleReviewRounds(job = currentJob()) {
  const rounds = ensureReviewRounds(job);
  const visible = rounds.filter((round) => isMeaningfulReviewRound(round) || round.userCreated);
  return visible.length ? visible : rounds.slice(0, 1);
}

function reviewRoundDisplayTitle(round, index) {
  const title = String(round?.title || "").trim();
  if (/hr/i.test(title)) return "HR 面";
  if (/终面/.test(title)) return "终面";
  if (/测评|笔试/.test(title)) return "测评";
  const names = ["一面", "二面", "三面", "四面", "五面", "六面", "七面", "八面", "九面"];
  return names[index] || `第 ${index + 1} 面`;
}

function nextReviewRoundTitle(job = currentJob()) {
  const count = ensureReviewRounds(job).filter((round) => isMeaningfulReviewRound(round) || round.userCreated).length;
  return reviewRoundDisplayTitle({}, count);
}

function syncReviewFormToRound(job = currentJob()) {
  if (!job || !$("review-round-title")) return null;
  const round = currentReviewRound(job);
  if (!round) return null;
  syncReviewQuestionFormToItem(round);
  Object.assign(round, {
    title: $("review-round-title").value.trim() || round.title || "未命名面试",
    date: $("review-round-date").value,
    format: $("review-round-format").value.trim(),
    interviewer: $("review-round-interviewer").value.trim(),
    sourceDraft: $("review-source-draft")?.value.trim() || round.sourceDraft || "",
    notes: $("review-notes").value.trim(),
    nextSteps: $("review-next-steps").value.trim(),
    updatedAt: new Date().toISOString()
  });
  round.questions = ensureReviewQuestions(round).map((item, index) => `${index + 1}. ${item.title}`).join("\n");
  round.answers = ensureReviewQuestions(round).map((item, index) => `${index + 1}. ${item.answer}`).join("\n");
  round.gaps = ensureReviewQuestions(round).map((item, index) => `${index + 1}. ${item.gap}`).join("\n");
  job.review = {
    questions: round.questions,
    notes: round.notes,
    updatedAt: round.updatedAt
  };
  job.updatedAt = round.updatedAt;
  return round;
}

function syncReviewQuestionFormToItem(round = currentReviewRound()) {
  if (!round || !$("review-question-title")) return null;
  const question = currentReviewQuestion(round);
  if (!question) return null;
  Object.assign(question, {
    title: $("review-question-title").value.trim() || question.title || "未命名问题",
    category: $("review-question-category")?.value || question.category || "业务面",
    questionerRole: $("review-questioner-role")?.value || question.questionerRole || "面试官",
    answer: $("review-question-answer").value.trim(),
    thinking: $("review-question-thinking").value.trim(),
    gap: $("review-question-gap").value.trim(),
    nextAnswer: $("review-question-next-answer").value.trim(),
    updatedAt: new Date().toISOString()
  });
  if (question.questionerRole === "候选人") question.category = "反问";
  if (question.category === "反问") question.questionerRole = "候选人";
  return question;
}

function activate(tab) {
  const navigationTab = tab === "assistant" ? "dashboard" : tab;
  document.querySelectorAll(".sidebar .tab-btn[data-tab]").forEach((button) => button.classList.toggle("active", button.dataset.tab === navigationTab));
  document.querySelectorAll("[data-project-view]").forEach((button) => button.classList.toggle("active", button.dataset.projectView === tab));
  document.querySelectorAll(".page").forEach((page) => page.classList.toggle("active", page.id === tab));
  const activeButton = document.querySelector(`.sidebar [data-tab="${navigationTab}"]`);
  const collapsedGroup = activeButton?.closest("details");
  if (collapsedGroup) collapsedGroup.open = true;
  $("page-title").textContent = pageMeta[tab][0];
  $("page-desc").textContent = pageMeta[tab][1];
  window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  if (tab === "analysis") {
    renderAnalysis();
    window.setTimeout(() => forceRenderArchivedModules(currentJob()), 0);
    return;
  }
  render();
}

function saveJobFromForm(options = {}) {
  const shouldRender = options.render !== false;
  const shouldToast = options.toast !== false;
  const job = currentJob();
  if (!job) return;
  const rolePath = readRolePath("job");
  job.company = $("job-company").value.trim() || "未命名公司";
  job.title = rolePath.custom || (rolePath.specialty === "通用" ? rolePath.track : `${rolePath.track} · ${rolePath.specialty}`);
  job.type = rolePath.track;
  job.roleCategory = rolePath.category;
  job.roleTrack = rolePath.track;
  job.roleSpecialty = rolePath.specialty;
  job.roleCustom = rolePath.custom;
  job.businessLine = $("job-business-line").value.trim();
  job.status = $("job-status").value;
  job.channel = $("job-channel").value;
  job.date = $("job-date").value;
  job.resumeId = $("job-resume").value || state.profile.activeResumeId;
  job.link = $("job-link").value.trim();
  job.jd = $("job-jd").value.trim();
  const referencesInput = $("analysis-references");
  if (referencesInput) job.researchReferences = referencesInput.value.trim();
  job.todos = job.todos?.length ? job.todos : ["分析 JD", "记录面试问题", "面试后复盘"];
  job.updatedAt = new Date().toISOString();
  persist();
  if (shouldRender) render();
  if (shouldToast) showToast("岗位已保存");
}

function selectJob(jobId, tab = null) {
  if (!state.jobs.some((job) => job.id === jobId)) return;
  selectedJobId = jobId;
  persist();
  if (tab) activate(tab);
  else render();
}

function newJob() {
  const job = {
    id: crypto.randomUUID(),
    company: "新公司",
    title: "AI产品经理 · AI Agent",
    type: "AI产品经理",
    roleCategory: "产品经理",
    roleTrack: "AI产品经理",
    roleSpecialty: "AI Agent",
    status: "已保存",
    channel: "官网",
    date: "",
    link: "",
    jd: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    todos: ["粘贴 JD", "分析 JD", "记录面试问题"],
    review: {}
  };
  state.jobs.unshift(job);
  selectedJobId = job.id;
  persist();
  activate("jobs");
  showToast("已新建岗位");
}

function deleteJob() {
  const job = currentJob();
  if (!job) return;
  const confirmed = window.confirm(`确认删除「${job.company} - ${job.title}」吗？删除后无法恢复。`);
  if (!confirmed) return;
  state.jobs = state.jobs.filter((item) => item.id !== selectedJobId);
  selectedJobId = state.jobs[0]?.id || null;
  persist();
  render();
  showToast("岗位已删除");
}

function inferJobFieldsFromJD(text) {
  const source = String(text || "").replace(/\r/g, "\n");
  const lines = source.split("\n").map((line) => line.trim()).filter(Boolean);
  const firstLines = lines.slice(0, 12);
  const joined = firstLines.join(" ");
  const companyMatch = joined.match(/(?:公司|企业|雇主|Company)[:：]\s*([^\s｜|，,]{2,30})/i)
    || joined.match(/([A-Za-z0-9\u4e00-\u9fa5]{2,30})(?:招聘|直招|校招|社招)/);
  const titleMatch = joined.match(/(?:岗位|职位|Job Title|Position)[:：]\s*([^｜|，,\n]{2,40})/i)
    || joined.match(/招聘\s*([^｜|，,\n]{2,40})/)
    || firstLines.find((line) => /(产品|PM|实习|Intern|经理|运营|数据|AI|Agent|LLM)/i.test(line));
  const lower = source.toLowerCase();
  let type = "其他";
  if (/agent|llm|大模型|人工智能|ai|prompt|rag|智能体/.test(lower)) type = "AI 产品";
  else if (/数据|指标|sql|分析|bi|实验|增长/.test(lower)) type = "数据产品";
  else if (/b端|saas|后台|平台|企业|商家|crm/.test(lower)) type = "B 端产品";
  else if (/增长|转化|留存|拉新|裂变/.test(lower)) type = "增长产品";
  else if (/运营|内容|社区|用户运营/.test(lower)) type = "产品运营";

  return {
    company: companyMatch ? cleanExtractedField(companyMatch[1]) : "",
    title: titleMatch ? cleanExtractedField(Array.isArray(titleMatch) ? titleMatch[1] || titleMatch[0] : titleMatch) : "",
    type
  };
}

function cleanExtractedField(value) {
  return String(value || "")
    .replace(/^(岗位|职位|招聘|公司|企业|Company|Job Title|Position)[:：\s]*/i, "")
    .replace(/[｜|，,].*$/, "")
    .trim()
    .slice(0, 40);
}

function applyJDInference(force = false) {
  const jdText = $("job-jd").value;
  if (!jdText.trim()) {
    $("jd-parse-status").textContent = "请先粘贴 JD 原文";
    return;
  }
  const inferred = inferJobFieldsFromJD(jdText);
  let changed = 0;
  if ((force || !$("job-company").value.trim() || $("job-company").value === "新公司") && inferred.company) {
    $("job-company").value = inferred.company;
    changed += 1;
  }
  const inferredPath = inferRolePath([inferred.title, inferred.type, jdText].join(" "));
  if (force || inferredPath.track !== "AI产品经理" || inferredPath.specialty !== "AI Agent") {
    renderRoleCascade("job", inferredPath);
    changed += 1;
  }
  $("jd-parse-status").textContent = changed ? `已识别：${[inferred.company, rolePathLabel(inferredPath)].filter(Boolean).join(" / ")}` : "未识别到明确字段，可手动补充";
}

async function handleJDImageUpload(file) {
  const preview = $("jd-image-preview");
  if (!file) {
    preview.style.display = "none";
    return;
  }
  const url = URL.createObjectURL(file);
  preview.style.display = "block";
  preview.innerHTML = `<div class="brief-item"><strong>JD 图片预览</strong><span class="muted">已上传 ${escapeHtml(file.name)}。当前 DeepSeek 文本接口不支持图片 OCR，后续可接 OCR/视觉模型自动提取文字。</span></div><img alt="JD 图片预览" src="${url}" style="width:100%;max-height:360px;object-fit:contain;background:#fff;border:0;" />`;
  $("jd-parse-status").textContent = "图片已上传并预览；图片文字识别需要接 OCR/视觉模型";
  try {
    const job = currentJob();
    const asset = await storeUploadedFile(file, "jd-image", job?.id || null);
    if (job) {
      job.jdImage = { assetId: asset.id, fileName: file.name, fileType: file.type, size: file.size, uploadedAt: new Date().toISOString(), previewUrl: `/api/data/file/${asset.id}` };
      job.updatedAt = job.jdImage.uploadedAt;
      persist();
    }
  } catch (error) {
    console.warn("JD 图片持久化失败", error);
    showToast(`JD 图片保存失败：${error.message}`);
  }
}

const KEYWORDS = {
  ai: ["ai", "大模型", "llm", "agent", "rag", "prompt", "智能", "算法", "模型", "自动化"],
  data: ["数据", "指标", "分析", "ab", "a/b", "实验", "sql", "增长"],
  user: ["用户", "体验", "调研", "反馈", "场景", "需求"],
  business: ["业务", "商业", "内容", "社区", "创作者", "b端", "saas", "平台"],
  delivery: ["推进", "协作", "落地", "项目", "迭代", "跨团队"]
};

function hitKeywords(text, keywordMap = KEYWORDS) {
  const source = String(text || "").toLowerCase();
  return Object.fromEntries(Object.entries(keywordMap).map(([key, list]) => [key, list.filter((word) => source.includes(word))]));
}

function understandJobIndustrySkill(job) {
  const text = `${job.title} ${job.type} ${job.jd}`;
  const hits = hitKeywords(text);
  const roleType = hits.ai.length ? "AI 产品 / 智能应用" : hits.data.length ? "数据 / 增长产品" : hits.business.length ? "业务 / 平台产品" : "产品 / 运营";
  const coreTasks = [
    hits.ai.length ? "定义 AI 功能链路与模型协作边界" : "拆解用户场景并定义产品需求",
    hits.user.length ? "基于用户反馈和场景持续迭代体验" : "将岗位目标拆成可落地的产品任务",
    hits.delivery.length ? "与算法、工程、设计等角色跨团队协作" : "维护项目节奏和交付质量"
  ];
  const requiredSkills = [
    hits.ai.length ? "LLM / Agent / Prompt 基础理解" : "产品需求分析",
    hits.data.length ? "数据分析与指标意识" : "用户问题抽象",
    hits.delivery.length ? "跨团队推进" : "清晰表达和项目推进"
  ];
  const bonusSkills = [
    hits.business.length ? "相关业务场景理解" : "快速业务研究能力",
    hits.ai.length ? "AI 评估与 badcase 迭代意识" : "结构化问题拆解能力"
  ];
  return {
    status: "success",
    capability: "understand-job-industry",
    roleType,
    coreTasks,
    requiredSkills,
    bonusSkills,
    businessKeywords: hits.business,
    aiKeywords: hits.ai,
    dataKeywords: hits.data,
    rawKeywordHits: hits,
    businessLine: {
      status: job.businessLine ? "explicit" : "unknown",
      value: job.businessLine || "",
      clarificationQuestion: job.businessLine ? "" : `这份 JD 对应「${job.company || "目标公司"}」的具体业务或产品线是否已知？`
    },
    industryClassification: {
      primaryIndustry: hits.ai.length ? "人工智能应用（待公开资料验证）" : hits.business.length ? "互联网 / 企业软件（待公开资料验证）" : "待结合公司主营业务确认",
      subsector: roleType,
      evidenceType: "inference-from-user-provided-jd",
      limitation: "当前仅完成 JD 阶段理解；公司定位、竞品、价格、规模和政策仍需公开来源验证。"
    },
    unresolvedFacts: [job.businessLine ? "" : "具体业务线尚未确认", "公开资料检索与关键事实引用尚未执行"].filter(Boolean)
  };
}

function profileExtractorSkill(profile) {
  const evidenceText = `${profile.resume || ""} ${profile.projects || ""}`;
  const hits = hitKeywords(evidenceText);
  const coreProjects = (profile.projects || "")
    .split(/\n|；|;/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
  return {
    targetRoles: (profile.target || "待填写").split(/、|,|，/).map((item) => item.trim()).filter(Boolean),
    targetIndustries: (profile.industry || "待填写").split(/、|,|，/).map((item) => item.trim()).filter(Boolean),
    coreProjects,
    productSignals: hits.user.concat(hits.delivery),
    aiSignals: hits.ai,
    dataSignals: hits.data,
    businessSignals: hits.business,
    rawKeywordHits: hits
  };
}

function fitAnalyzerSkill(jdProfile, userProfile) {
  const jdHits = jdProfile.rawKeywordHits;
  const profileHits = userProfile.rawKeywordHits;
  const requiredEvidenceDimensions = Object.keys(KEYWORDS).filter((key) => jdHits[key].length > 0);
  const coveredEvidenceDimensions = requiredEvidenceDimensions.filter((key) => profileHits[key].length > 0);
  const score = requiredEvidenceDimensions.length
    ? Math.round(coveredEvidenceDimensions.length / requiredEvidenceDimensions.length * 100)
    : 0;
  const strongMatches = [
    jdHits.ai.length && userProfile.aiSignals.length ? "AI 产品关键词匹配，可重点讲工作流、eval、badcase" : "",
    jdHits.user.length && userProfile.productSignals.length ? "用户场景和产品推进能力有匹配素材" : "",
    jdHits.data.length && userProfile.dataSignals.length ? "数据分析/指标意识有可迁移表达" : ""
  ].filter(Boolean);
  const transferableMatches = [
    "CareerPilot AI 可作为 AI 产品项目主案例",
    "求职流程本身可映射为复杂任务拆解和状态管理问题"
  ];
  const gaps = [
    jdHits.business.length && !userProfile.businessSignals.length ? "业务场景素材不足，需要补公司/行业案例" : "",
    jdHits.data.length && !userProfile.dataSignals.length ? "数据指标表达偏弱，需要准备评估口径" : "",
    jdHits.ai.length && !userProfile.aiSignals.length ? "AI 方法表达不足，需要补 LLM/Agent/eval 基础讲法" : ""
  ].filter(Boolean);
  return {
    score,
    scoreDefinition: "规则证据维度覆盖分 = 候选人资料覆盖的 JD 能力维度数 / JD 识别出的能力维度数；不是录用概率或模型准确率。",
    requiredEvidenceDimensions,
    coveredEvidenceDimensions,
    strongMatches: strongMatches.length ? strongMatches : ["岗位要求和现有经历存在可迁移关系，但需要更明确的项目映射"],
    transferableMatches,
    gaps: gaps.length ? gaps : ["主要风险不是硬缺能力，而是表达是否足够具体"],
    recommendedProjects: userProfile.coreProjects
  };
}

function riskDiagnoserSkill(jdProfile, fit) {
  const questions = [
    "为什么这个场景需要 AI，而不是普通模板或表格？",
    "你会如何评估 AI 输出是否真的有帮助？",
    jdProfile.businessKeywords.length ? "你对这个业务场景的理解有哪些具体例子？" : "如果岗位业务很陌生，你如何快速补齐上下文？",
    "出现泛化、幻觉或建议不可执行时，你会改哪个链路节点？"
  ];
  const boundaries = [
    "不要声称真实上线、增长或 A/B test，除非有证据。",
    "不要把本地规则 demo 说成完整模型训练或算法优化。",
    "可以说设计了工作流、字段结构、eval 口径和 badcase 迭代。"
  ];
  return {
    likelyQuestions: questions,
    riskPoints: fit.gaps,
    boundaries,
    missingEvidence: ["真实 JD eval 样本", "badcase 记录", "准备建议可执行性评分"]
  };
}

function prepPlannerSkill(job, jdProfile, fit, risk) {
  const prepSuggestions = [
    "准备一个项目故事：问题 -> 工作流 -> eval -> badcase -> 迭代。",
    jdProfile.aiKeywords.length ? "重点讲 AI 产品可靠性，而不是只讲生成能力。" : "重点讲用户场景、需求优先级和落地推进。",
    jdProfile.businessKeywords.length ? "补 3 个该行业具体业务场景。" : "补公司主营业务、用户和竞品。",
    "准备 1 分钟自我介绍，并把经历映射到 JD 关键词。"
  ];
  return {
    todoList: prepSuggestions,
    oneMinuteIntroAngle: `围绕「${job.title}」强调：我能把复杂求职任务拆成 JD 解析、个人匹配、风险诊断和准备规划，并用 eval/badcase 迭代输出质量。`,
    interviewBrief: [
      `公司 / 岗位：${job.company} - ${job.title}`,
      `核心准备：${jdProfile.coreTasks[0]}`,
      `主讲项目：${fit.recommendedProjects[0] || "CareerPilot AI"}`,
      `风险提醒：不要只说“AI 生成”，要讲清楚评估标准和失败案例`
    ],
    prepSuggestions
  };
}

function analyzeJob(job = currentJob()) {
  if (!job) return null;
  const trace = [];
  const profile = profileForJob(job);
  const jdProfile = runFixedWorkflowStep("understandJobIndustry", {
    company: job.company,
    title: job.title,
    jdChars: String(job.jd || "").length
  }, () => understandJobIndustrySkill(job), trace);
  const matched = runFixedWorkflowStep("profileMatcher", {
    jdRoleType: jdProfile.roleType,
    resumeChars: String(profile.resume || "").length,
    projectChars: String(profile.projects || "").length
  }, () => {
    const userProfile = profileExtractorSkill(profile);
    return { userProfile, fit: fitAnalyzerSkill(jdProfile, userProfile) };
  }, trace);
  const { userProfile, fit } = matched;
  const risk = runFixedWorkflowStep("riskDiagnoser", {
    roleType: jdProfile.roleType,
    strongMatchCount: fit.strongMatches.length,
    gapCount: fit.gaps.length
  }, () => riskDiagnoserSkill(jdProfile, fit), trace);
  const planner = runFixedWorkflowStep("prepPlanner", {
    jobTitle: job.title,
    riskCount: risk.riskPoints.length,
    missingEvidenceCount: risk.missingEvidence.length
  }, () => prepPlannerSkill(job, jdProfile, fit, risk), trace);
  const focused = buildFocusedAnalysis(job, {
    roleType: jdProfile.roleType,
    coreTasks: jdProfile.coreTasks,
    requiredSkills: jdProfile.requiredSkills,
    riskQuestions: risk.likelyQuestions,
    prepSuggestions: planner.prepSuggestions,
    score: fit.score,
    workflow: {
      understandJobIndustry: jdProfile,
      profileMatcher: { userProfile, fit },
      riskDiagnoser: risk,
      prepPlanner: planner
    }
  });
  job.analysis = {
    generatedAt: new Date().toISOString(),
    provider: "local",
    roleType: jdProfile.roleType,
    coreTasks: jdProfile.coreTasks,
    requiredSkills: jdProfile.requiredSkills,
    riskQuestions: risk.likelyQuestions,
    prepSuggestions: planner.prepSuggestions,
    score: fit.score,
    jdHits: jdProfile.rawKeywordHits,
    profileHits: userProfile.rawKeywordHits,
    workflow: {
      understandJobIndustry: jdProfile,
      profileMatcher: { userProfile, fit },
      riskDiagnoser: risk,
      prepPlanner: planner
    },
    focused,
    trace,
    architecture: {
      type: "fixed-workflow",
      dynamicFunctionCalling: false,
      skillRegistryVersion: "0.1.0",
      note: "本地兜底按预定义顺序执行模块；该 Trace 不代表模型自主选择工具。"
    }
  };
  return job.analysis;
}

function buildFocusedAnalysis(job, analysis) {
  const workflow = analysis.workflow || {};
  const jd = workflow.understandJobIndustry || workflow.jdParser || {
    roleType: analysis.roleType || job.type,
    coreTasks: analysis.coreTasks || [],
    requiredSkills: analysis.requiredSkills || [],
    bonusSkills: [],
    businessKeywords: [],
    aiKeywords: [],
    dataKeywords: []
  };
  const fit = workflow.profileMatcher?.fit || {
    score: analysis.score || 0,
    strongMatches: [],
    transferableMatches: [],
    gaps: [],
    recommendedProjects: ["CareerPilot AI"]
  };
  const risk = workflow.riskDiagnoser || {
    likelyQuestions: analysis.riskQuestions || [],
    riskPoints: [],
    boundaries: [],
    missingEvidence: []
  };
  const planner = workflow.prepPlanner || {
    todoList: analysis.prepSuggestions || [],
    oneMinuteIntroAngle: "围绕岗位要求讲清楚业务理解、项目匹配和可验证结果。",
    interviewBrief: [],
    prepSuggestions: analysis.prepSuggestions || []
  };
  const priority = analysis.score >= 80 ? "高" : analysis.score >= 65 ? "中" : "低";
  const fitLevel = analysis.score >= 80 ? "强匹配" : analysis.score >= 65 ? "可冲" : "需要补强";
  return {
    summary: {
      roleType: jd.roleType || analysis.roleType || job.type,
      priority,
      fitLevel,
      prepFocus: fit.gaps?.[0] || risk.riskPoints?.[0] || "把项目表达和 JD 要求对齐"
    },
    jobUnderstanding: {
      roleSummary: `这是一个偏「${jd.roleType || job.type}」的岗位，核心不是复述 JD，而是判断你能否围绕业务场景定义产品任务并推动落地。`,
      companyPositioning: job.company ? `${job.company} 的具体公司定位需要结合官网、产品线和招聘页面补充；当前先基于 JD 判断岗位所在业务与产品任务。` : "公司定位信息不足，需要先补公司名称和主营业务。",
      businessContext: jd.businessKeywords?.length ? `业务关键词集中在：${jd.businessKeywords.join("、")}。准备时要说明这些业务为什么需要对应产品能力。` : "JD 里的业务信息不够具体，需要你主动补公司主营业务、用户和产品场景。",
      targetUsers: jd.businessKeywords?.length ? jd.businessKeywords.slice(0, 4) : ["目标用户待从公司业务补充"],
      likelyResponsibilities: jd.coreTasks || []
    },
    capabilityRequirements: {
      mustHave: jd.requiredSkills || [],
      niceToHave: jd.bonusSkills || [],
      hiddenExpectations: [
        "能把模糊需求拆成可执行功能",
        "能解释为什么这样设计，而不是只描述做了什么",
        "能用指标、样本或 badcase 说明迭代方法"
      ]
    },
    personalStrategy: {
      mainProject: fit.recommendedProjects?.[0] || "CareerPilot AI",
      recommendedFraming: planner.oneMinuteIntroAngle || "从真实痛点、工作流拆解、评估标准和迭代讲起。",
      advantages: fit.strongMatches || [],
      gaps: fit.gaps || [],
      avoidSaying: risk.boundaries || []
    },
    prepFocus: {
      thirtyMinutePlan: (planner.todoList || []).slice(0, 3),
      twoHourPlan: [
        "补一页公司业务：用户、场景、产品目标、可能指标",
        "准备一个项目 badcase：现象、原因、改法、复测指标",
        "把主讲项目改写成贴合该 JD 的 1 分钟版本",
        "准备 3 个高风险追问的回答"
      ],
      likelyQuestions: risk.likelyQuestions || []
    },
    applicationMaterials: {
      coverLetter: buildCoverLetter(job, jd, fit, planner),
      selfIntroduction: buildSelfIntroduction(job, jd, fit, planner)
    }
  };
}

function buildCoverLetter(job, jdProfile, fit, planner) {
  const result = buildLocalCoverLetterSkill(job, getCoverLetterOptions(job));
  return result.status === "success" ? result.recommended : `生成前需补充：${result.blockingQuestions.join("；")}`;
}

function getCoverLetterOptions(job = currentJob()) {
  const stored = job?.coverLetterOptions || {};
  return {
    channel: $("cover-letter-channel")?.value || stored.channel || "中文邮件 Cover Letter",
    language: $("cover-letter-language")?.value || stored.language || "跟随 JD",
    arrivalDate: $("cover-letter-arrival")?.value.trim() || stored.arrivalDate || "",
    daysPerWeek: $("cover-letter-days")?.value.trim() || stored.daysPerWeek || "",
    duration: $("cover-letter-duration")?.value.trim() || stored.duration || ""
  };
}

function inferCoverLetterOptionsFromQuery(query, job = currentJob()) {
  const text = String(query || "");
  const options = { ...getCoverLetterOptions(job) };
  if (/BOSS|牛客|微信|开场白|私信/i.test(text)) options.channel = "BOSS/牛客/微信开场白";
  else if (/内推|自荐/i.test(text)) options.channel = "内推自荐语";
  else if (/英文|English/i.test(text)) { options.channel = "英文 Cover Letter"; options.language = "英文"; }
  else if (/极简|招呼/i.test(text)) options.channel = "极简招呼";
  return options;
}

function validateCoverLetterInputs(job, profile, options) {
  const blockingQuestions = [];
  const optionalQuestions = [];
  const jd = String(job?.jd || "").trim();
  const sourceText = `${profile?.resume || ""}\n${profile?.projects || ""}`.trim();
  const internship = /实习|intern/i.test(`${job?.title || ""} ${jd}`);
  if (!jd) blockingQuestions.push("请先补充当前岗位的完整 JD。");
  if (!sourceText) blockingQuestions.push("请先选择并补充一份包含真实经历的简历或项目素材。");
  if (internship && !options.arrivalDate) blockingQuestions.push("请确认最早到岗时间。");
  if (internship && !options.daysPerWeek) blockingQuestions.push("请确认每周可实习天数。");
  if (internship && !options.duration) blockingQuestions.push("请确认可连续实习时长。");
  if (/英语|英文|海外|出海|english|global/i.test(jd) && !/CET|TOEFL|IELTS|TEM|英语|英文|海外/i.test(sourceText)) {
    optionalQuestions.push("JD 涉及英语或海外业务；如有语言成绩或英文工作经历，可补充后增强文案。");
  }
  const toolHits = [...new Set((jd.match(/SQL|Python|Axure|Figma|Sketch|XMind/gi) || []).map((item) => item.toUpperCase()))];
  const missingTools = toolHits.filter((tool) => !new RegExp(tool, "i").test(sourceText));
  if (missingTools.length) optionalQuestions.push(`JD 提到 ${missingTools.join("、")}；如真实使用过，请补充具体场景，否则文案会省略。`);
  return { blockingQuestions, optionalQuestions, internship };
}

function selectCoverLetterEvidence(job, profile) {
  const sourceText = `${profile.projects || ""}\n${profile.resume || ""}`;
  const keywords = String(job.jd || "").match(/[A-Za-z][A-Za-z0-9+.#/-]{1,}|[\u4e00-\u9fa5]{2,6}/g) || [];
  const lines = sourceText.split(/\r?\n|；|;/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 8 && !/@|(?:\+?86[- ]?)?1\d{10}|身份证|电话[:：]/i.test(line));
  const scored = lines.map((line, index) => ({
    line,
    index,
    score: keywords.filter((keyword) => keyword.length > 1 && line.toLowerCase().includes(keyword.toLowerCase())).length
  })).sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = scored.slice(0, 3).map((item) => item.line.slice(0, 140));
  if (selected.length) return selected;
  const fallback = sourceText.replace(/\s+/g, " ").trim().slice(0, 140);
  return fallback ? [fallback] : [];
}

function buildLocalCoverLetterSkill(job = currentJob(), options = getCoverLetterOptions(job)) {
  const profile = profileForJob(job);
  const validation = validateCoverLetterInputs(job, profile, options);
  if (validation.blockingQuestions.length) {
    return {
      status: "needs_clarification",
      mode: "from_scratch",
      channel: options.channel,
      language: options.language,
      blockingQuestions: validation.blockingQuestions,
      optionalQuestions: validation.optionalQuestions,
      recommended: "",
      shorter: ""
    };
  }
  const jdProfile = understandJobIndustrySkill(job);
  const evidence = selectCoverLetterEvidence(job, profile);
  const evidenceText = evidence.slice(0, 2).join("；");
  const actualLanguage = options.language === "跟随 JD"
    ? (/[\u4e00-\u9fa5]/.test(job.jd || "") ? "中文" : "英文")
    : options.language;
  const availability = validation.internship
    ? `最早可于${options.arrivalDate}到岗，每周可实习${options.daysPerWeek}，可连续实习${options.duration}。`
    : "";
  let recommended;
  let shorter;
  if (options.channel === "英文 Cover Letter" || actualLanguage === "英文") {
    recommended = `Dear Hiring Team,\n\nI am applying for the ${job.title} position at ${job.company}. Based on the job description, the role focuses on ${jdProfile.roleType}. My relevant, verified experience includes: ${evidenceText}. ${availability}\n\nI would welcome the opportunity to discuss how this experience could support the role. Thank you for your consideration.`;
    shorter = `I am applying for the ${job.title} position at ${job.company}. My relevant experience includes ${evidence[0] || evidenceText}. I would welcome the opportunity to discuss the role.`;
  } else if (options.channel === "BOSS/牛客/微信开场白" || options.channel === "极简招呼") {
    recommended = `您好，我想申请${job.company}的${job.title}岗位。我的相关经历包括：${evidenceText}。${availability}经历均可在简历中核验，期待进一步沟通。`;
    shorter = `您好，我想申请${job.title}。我有${evidence[0] || "与岗位相关的项目经历"}。${availability}方便进一步沟通吗？`;
  } else if (options.channel === "内推自荐语") {
    recommended = `申请岗位：${job.company}｜${job.title}。候选人的相关经历包括：${evidenceText}。${availability}上述信息均来自当前所选简历，可作为岗位匹配与推荐依据。`;
    shorter = `申请${job.title}：相关经历为${evidence[0] || evidenceText}。${availability}`;
  } else {
    recommended = `您好：\n\n我希望申请贵司的${job.title}岗位。结合 JD，我理解该岗位重点关注${jdProfile.roleType}方向的${jdProfile.coreTasks.slice(0, 2).join("、")}。\n\n我在当前简历中与岗位较相关的经历包括：${evidenceText}。这些经历是我希望进一步与岗位要求展开沟通的主要依据。${availability}\n\n感谢您阅读我的申请，期待有机会进一步沟通。`;
    shorter = `您好，我希望申请${job.company}的${job.title}岗位。我的相关经历包括：${evidenceText}。${availability}感谢您的时间，期待沟通。`;
  }
  return {
    status: "success",
    mode: "from_scratch",
    channel: options.channel,
    language: actualLanguage,
    jdJudgment: `岗位更偏${jdProfile.roleType}，招聘方会重点判断候选人是否有与核心任务相符的真实证据。`,
    selectedEvidence: evidence.map((item) => ({ sourceEvidence: item, jobRelevance: "与 JD 关键词和核心任务存在直接或可迁移关联", wordingBoundary: "保留原始责任强度，不将参与改写为主导" })),
    recommended,
    shorter,
    tradeoffs: ["只保留当前所选简历中最相关的 1-3 段证据", "未写入用户没有确认的技能、语言成绩和业务结果"],
    blockingQuestions: [],
    optionalQuestions: validation.optionalQuestions,
    qualityChecks: ["已校验 JD 与简历来源", "已检查实习到岗条件", "已按渠道控制结构", "未新增未经证实的经历"]
  };
}

function buildSelfIntroduction(job, jdProfile, fit, planner) {
  const project = fit.recommendedProjects?.[0] || "CareerPilot AI";
  return `您好，我正在申请「${job.company} - ${job.title}」。我希望重点强调自己在 AI 产品工作流设计和复杂任务拆解上的能力。\n\n我最近做的核心项目是「${project}」，围绕求职海投场景，将 JD 解析、个人经历匹配、风险诊断和准备规划串成一个完整工作流。这个项目让我更系统地理解了 AI 产品中任务定义、结构化输出、评估标准和 badcase 迭代的重要性。\n\n结合这个岗位，我会重点展示自己如何理解业务场景、拆解用户任务，并将 AI 能力转化为可落地的产品方案。`;
}

function applyAgentRunToJob(job, run) {
  if (!job || !run || run.status === "failed" || run.status === "running") return null;
  const output = run.output || {};
  const understanding = output.understandJobIndustry || {};
  const research = understanding.roleUnderstanding || null;
  const matcher = output.profileMatcher || {};
  const risk = output.riskDiagnoser || {};
  const planner = output.prepPlanner || {};
  const modelCalled = (run.trace || []).some((step) => step.model?.called);
  job.analysis = {
    generatedAt: run.completedAt || new Date().toISOString(),
    provider: modelCalled ? "model-assisted-agent" : "local-agent",
    score: Number(matcher.fit?.score || 0),
    roleType: understanding.roleType || job.type,
    coreTasks: understanding.coreTasks || [],
    requiredSkills: understanding.requiredSkills || [],
    riskQuestions: risk.likelyQuestions || [],
    prepSuggestions: planner.todoList || [],
    workflow: output,
    trace: run.trace || [],
    architecture: {
      type: "planner-skill-runner",
      dynamicFunctionCalling: false,
      plan: run.routing?.plan || run.plan?.steps || [],
      modelCallCount: run.summary?.modelCallCount || 0,
      totalDurationMs: run.summary?.totalDurationMs || 0,
      note: "Planner 先确定执行顺序，Runner 按 Skill 合约执行；岗位理解在配置模型时使用模型增强。"
    }
  };
  job.analysis.focused = normalizeFocusedAnalysis(buildFocusedAnalysis(job, job.analysis));
  if (research) {
    job.roleUnderstandingSkill = research;
    const researchFocused = normalizeFocusedAnalysis(roleUnderstandingToFocused(research, job));
    job.analysis.focused.jobUnderstanding = researchFocused.jobUnderstanding;
    job.analysis.focused.summary.roleType = researchFocused.summary.roleType;
  }
  if (output.coverLetterTailor) job.coverLetterSkill = output.coverLetterTailor;
  job.lastAgentRunId = run.runId;
  job.updatedAt = new Date().toISOString();
  const plan = run.routing?.plan || run.plan?.steps || [];
  if (plan.includes("understandJobIndustry")) {
    archiveAnalysisModule(job, "jobUnderstanding", job.analysis, { roleUnderstanding: research });
    archiveAnalysisModule(job, "capabilityRequirements", job.analysis);
  }
  if (plan.includes("profileMatcher")) archiveAnalysisModule(job, "personalStrategy", job.analysis);
  if (plan.includes("riskDiagnoser") || plan.includes("prepPlanner")) archiveAnalysisModule(job, "prepFocus", job.analysis);
  if (plan.includes("coverLetterTailor")) archiveAnalysisModule(job, "coverLetter", job.analysis, { coverLetter: output.coverLetterTailor });
  return job.analysis;
}

async function analyzeJobWithApi(job = currentJob()) {
  if (!job) return null;
  const query = "分析这份 JD 和公司业务，理解岗位与行业；检查简历匹配；诊断面试风险；生成准备计划";
  const response = await fetch("/api/agent/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      job: {
        id: job.id,
        company: job.company,
        title: job.title,
        type: job.type,
        roleCategory: job.roleCategory || "",
        roleTrack: job.roleTrack || "",
        roleSpecialty: job.roleSpecialty || "",
        businessLine: job.businessLine || "",
        jdUrl: job.link || "",
        researchReferences: job.researchReferences || "",
        jd: job.jd
      },
      profile: profileForJob(job),
      options: inferCoverLetterOptionsFromQuery(query, job)
    })
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `API 请求失败：${response.status}`);
  }
  const data = await response.json();
  state.skillRun = { ...data, jobId: job.id, jobLabel: `${job.company} - ${job.title}`, executedAt: new Date().toISOString() };
  archiveTraceRun(state.skillRun);
  applyAgentRunToJob(job, data);
  job.prep = null;
  return job.analysis;
}

async function analyzeRoleUnderstandingWithApi(job = currentJob()) {
  if (!job) return null;
  const response = await fetch("/api/role-understanding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job: {
        id: job.id,
        company: job.company,
        title: job.title,
        type: job.type,
        status: job.status,
        channel: job.channel,
        link: job.link,
        jd: job.jd
      },
      references: job.researchReferences || $("analysis-references")?.value.trim() || ""
    })
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `岗位理解请求失败：${response.status}`);
  }
  const data = await response.json();
  const skill = data.roleUnderstanding || {};
  const focused = roleUnderstandingToFocused(skill, job);
  job.analysis = {
    ...(job.analysis || {}),
    generatedAt: new Date().toISOString(),
    provider: data.provider || "api",
    score: job.analysis?.score || 0,
    focused: {
      ...(job.analysis?.focused || normalizeFocusedAnalysis({})),
      jobUnderstanding: focused.jobUnderstanding,
      summary: focused.summary
    }
  };
  job.roleUnderstandingSkill = skill;
  return { analysis: job.analysis, roleUnderstanding: skill, focused };
}

function getSelfIntroOptions(job = currentJob()) {
  return {
    scene: $("self-intro-scene")?.value || job?.selfIntroOptions?.scene || "业务面",
    length: $("self-intro-length")?.value || job?.selfIntroOptions?.length || "60秒"
  };
}

function selfIntroductionScript(skill, options = {}) {
  if (!skill) return "";
  const length = options.length || skill.length || "60秒";
  return skill.versions?.[length] || skill.script || skill.versions?.["60秒"] || "";
}

async function analyzeSelfIntroductionWithApi(job = currentJob()) {
  if (!job) return null;
  const options = getSelfIntroOptions(job);
  job.selfIntroOptions = options;
  const response = await fetch("/api/self-introduction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job: {
        id: job.id,
        company: job.company,
        title: job.title,
        type: job.type,
        status: job.status,
        channel: job.channel,
        link: job.link,
        jd: job.jd
      },
      profile: profileForJob(job),
      roleUnderstanding: job.roleUnderstandingSkill || job.analysisModules?.jobUnderstanding?.roleUnderstanding || null,
      options
    })
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `自我介绍请求失败：${response.status}`);
  }
  const data = await response.json();
  const skill = data.selfIntroduction || {};
  const focused = normalizeFocusedAnalysis(job.analysis?.focused || {});
  focused.applicationMaterials.selfIntroduction = selfIntroductionScript(skill, options);
  job.analysis = {
    ...(job.analysis || {}),
    generatedAt: new Date().toISOString(),
    provider: data.provider || "api",
    score: job.analysis?.score || 0,
    focused
  };
  job.selfIntroductionSkill = skill;
  return { analysis: job.analysis, selfIntroduction: skill, focused };
}

async function analyzeCoverLetterWithApi(job = currentJob()) {
  if (!job) return null;
  const options = getCoverLetterOptions(job);
  job.coverLetterOptions = options;
  const response = await fetch("/api/cover-letter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job: {
        id: job.id,
        company: job.company,
        title: job.title,
        type: job.type,
        status: job.status,
        channel: job.channel,
        link: job.link,
        jd: job.jd
      },
      profile: profileForJob(job),
      options
    })
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Cover Letter 请求失败：${response.status}`);
  }
  const data = await response.json();
  const skill = data.coverLetter || {};
  const focused = normalizeFocusedAnalysis(job.analysis?.focused || {});
  focused.applicationMaterials.coverLetter = skill.status === "success"
    ? (skill.recommended || skill.shorter || "")
    : `生成前需补充：${toArray(skill.blockingQuestions).join("；")}`;
  job.analysis = {
    ...(job.analysis || {}),
    generatedAt: new Date().toISOString(),
    provider: data.provider || "api",
    score: job.analysis?.score || 0,
    focused
  };
  job.coverLetterSkill = skill;
  return { analysis: job.analysis, coverLetter: skill, focused };
}

function buildLocalSelfIntroductionSkill(job = currentJob()) {
  const options = getSelfIntroOptions(job);
  const profile = profileForJob(job);
  const role = job?.roleUnderstandingSkill?.rolePositioning?.oneSentence || job?.analysis?.focused?.jobUnderstanding?.roleSummary || `${job.company} 的 ${job.title}`;
  const resumeText = profile.resume || "";
  const evidence = [];
  if (resumeText.includes("Loopit")) evidence.push("Loopit AI 推荐策略产品实习");
  if (resumeText.includes("RAG")) evidence.push("RAG 知识发现系统");
  if (resumeText.includes("知识图谱")) evidence.push("LLM + 知识图谱推荐项目");
  const selectedEvidence = (evidence.length ? evidence : ["当前绑定简历中的 AI/产品项目"]).slice(0, 3).map((item) => ({
    resumeEvidence: item,
    jobRelevance: "用于证明对 AI 产品链路、规则设计、任务拆解和效果验证有真实理解",
    talkingPoint: `围绕「${item}」讲清问题、方案、验证和可迁移到该岗位的能力`
  }));
  const script60 = `面试官您好，我正在申请「${job.company} - ${job.title}」。我的核心特点是，既有 AI 和数据相关项目经验，也习惯用产品视角拆解复杂系统里的任务、规则和验证问题。\n\n结合这个岗位，我理解它的重点不是简单写需求，而是要在「${role}」这个业务命题下，把模糊需求拆成可执行的产品机制，并持续验证它是否真的有用。\n\n我过去比较相关的经历包括${selectedEvidence.map((item) => item.resumeEvidence).join("、")}。这些经历让我对 AI 产品里的信息组织、规则设计、效果评估和 badcase 迭代更敏感。\n\n我投递这个岗位，是希望把这些能力用在更真实、更复杂的业务场景里，参与从问题定义到产品落地的完整过程。谢谢。`;
  return {
    scene: options.scene,
    length: options.length,
    roleDemand: "证明自己能把 AI/产品/业务问题结构化，并用真实经历支撑岗位匹配",
    positioning: "有 AI 与数据项目经验、能用产品视角拆解复杂系统的候选人",
    selectedEvidence,
    motivation: `希望参与 ${job.company} 的真实业务问题，从问题定义、规则设计到产品落地形成闭环。`,
    script: script60,
    versions: {
      "30秒": script60.split("\n\n").slice(0, 2).join("\n\n"),
      "60秒": script60,
      "90秒": `${script60}\n\n如果进一步展开，我会重点讲一个项目：我如何识别问题、设计规则或链路、用数据/案例验证效果，以及这个过程如何迁移到贵司岗位。`
    },
    riskBoundaries: ["本地兜底版本没有完整理解简历细节，生成后需要手动核验经历表述", "不要补充简历中没有出现的指标或商业结果"],
    followUpQuestions: ["你具体做了哪部分？", "这个项目如何验证效果？", "你如何把这段经历迁移到我们岗位？"]
  };
}

function roleUnderstandingToFocused(skill, job = currentJob()) {
  const likelyWork = toArray(skill.likelyWork).map((item) => typeof item === "string" ? item : `${item.task || ""}${item.businessMeaning ? `：${item.businessMeaning}` : ""}${item.deliverable ? `（交付：${item.deliverable}）` : ""}`);
  return normalizeFocusedAnalysis({
    summary: {
      roleType: job.type || job.title || "岗位类型待判断",
      priority: "中",
      fitLevel: "待结合简历判断",
      prepFocus: skill.industryPrimer?.mustKnowTerms?.[0] || "先补公司主营业务和岗位业务链路"
    },
    jobUnderstanding: {
      roleSummary: skill.rolePositioning?.oneSentence || skill.companyBusiness?.summary || "需要结合 JD 和公司资料判断岗位作用。",
      companyPositioning: `${skill.companyBusiness?.summary || "公司主营业务待核验"}${skill.companyBusiness?.businessModel ? `；商业/价值创造方式：${skill.companyBusiness.businessModel}` : ""}`,
      businessContext: `${skill.rolePositioning?.whyNeeded || ""}${skill.businessMap?.workflows?.length ? ` 业务流程：${skill.businessMap.workflows.join("；")}` : ""}`.trim(),
      targetUsers: skill.businessMap?.businessObjects || [],
      likelyResponsibilities: likelyWork
    }
  });
}

function generatePrep(job = currentJob()) {
  if (!job) return null;
  const analysis = job.analysis || analyzeJob(job);
  job.prep = {
    goal: `证明我能胜任「${job.title}」：不仅理解岗位要求，也能把 AI/产品任务拆成可执行工作流。`,
    intro: `我最近在做 CareerPilot AI 求职作战台，把海投中的岗位追踪、JD 拆解、面试准备和复盘串成闭环。这个项目能对应 ${job.company} 对 ${analysis.roleType} 的要求，我会重点讲任务拆解、输出评估和 badcase 迭代。`,
    brief: [
      `公司 / 岗位：${job.company} - ${job.title}`,
      `核心准备：${analysis.coreTasks[0]}`,
      `主讲项目：CareerPilot AI 的 JD 解析、匹配分析和面试速览`,
      `风险提醒：不要只说“AI 生成”，要讲清楚评估标准和失败案例`
    ],
    questions: analysis.riskQuestions
  };
  return job.prep;
}

function saveProfile() {
  ensureResumeLibrary();
  const resume = activeResume();
  state.profile.target = $("profile-target").value.trim();
  state.profile.industry = $("profile-industry").value.trim();
  resume.name = $("profile-resume-name").value.trim() || resume.name || "未命名简历";
  resume.resume = $("profile-resume").value.trim();
  resume.projects = $("profile-projects").value.trim();
  state.profile.resume = resume.resume;
  state.profile.projects = resume.projects;
  state.profile.resumeFileName = resume.fileName || resume.name;
  persist();
  render();
  showToast("资料库已保存");
}

function saveAsNewResumeVersion() {
  ensureResumeLibrary();
  const id = crypto.randomUUID();
  const name = $("profile-resume-name").value.trim() || `简历版本 ${state.profile.resumes.length + 1}`;
  state.profile.resumes.push({
    id,
    name,
    resume: $("profile-resume").value.trim(),
    projects: $("profile-projects").value.trim(),
    fileName: state.profile.resumeFileName || name,
    fileType: state.profile.resumeFileType || "",
    previewText: state.profile.resumePreviewText || "",
    previewKind: state.profile.resumePreviewKind || "",
    previewUrl: state.profile.resumePreviewUrl || ""
  });
  state.profile.activeResumeId = id;
  persist();
  render();
  showToast("已保存为新简历版本");
}

function resumeUsageCount(resumeId) {
  return state.jobs.filter((job) => job.resumeId === resumeId).length;
}

function selectResumeVersion(resumeId) {
  ensureResumeLibrary();
  if (!state.profile.resumes.some((resume) => resume.id === resumeId)) return;
  state.profile.activeResumeId = resumeId;
  persist();
  render();
}

function deleteResumeVersion(resumeId) {
  ensureResumeLibrary();
  const resume = state.profile.resumes.find((item) => item.id === resumeId);
  if (!resume) return;
  if (state.profile.resumes.length <= 1) {
    showToast("至少保留一份简历");
    return;
  }
  const used = resumeUsageCount(resumeId);
  if (used > 0) {
    showToast(`这份简历被 ${used} 个岗位使用，请先更换岗位绑定`);
    return;
  }
  const confirmed = window.confirm(`确认删除简历版本「${resume.name || resume.fileName || "未命名简历"}」吗？`);
  if (!confirmed) return;
  state.profile.resumes = state.profile.resumes.filter((item) => item.id !== resumeId);
  if (state.profile.activeResumeId === resumeId) {
    state.profile.activeResumeId = state.profile.resumes[0].id;
  }
  persist();
  render();
  showToast("简历版本已删除");
}

function bindResumeToCurrentJob(resumeId) {
  const job = currentJob();
  if (!job) return;
  job.resumeId = resumeId;
  job.analysis = null;
  job.analysisModules = {};
  job.analysisVisibleModules = defaultAnalysisModules(false);
  job.prep = null;
  persist();
  render();
  showToast("岗位绑定简历已更新，旧分析已清空");
}

function saveReview() {
  const job = currentJob();
  if (!job) return;
  const round = syncReviewFormToRound(job);
  if (!round) return;
  persist();
  render();
  showToast("复盘已保存");
}

function addReviewRound(title = "") {
  const job = currentJob();
  if (!job) return;
  ensureReviewRounds(job);
  syncReviewFormToRound(job);
  const roundTitle = title || nextReviewRoundTitle(job);
  if (!roundTitle.trim()) return;
  let round = job.reviewRounds.find((item) => !isMeaningfulReviewRound(item) && !item.userCreated);
  if (round) {
    round.title = roundTitle.trim();
    round.userCreated = true;
    round.preparationSnapshot = round.preparationSnapshot || preparationSnapshotForJob(job, "round-creation");
    round.updatedAt = new Date().toISOString();
  } else {
    round = createReviewRound(job, roundTitle.trim());
    round.userCreated = true;
    job.reviewRounds.push(round);
  }
  selectedReviewRoundId = round.id;
  selectedReviewQuestionId = null;
  persist();
  renderInterview();
  showToast(`已新增${round.title}`);
  return round;
}

function deleteReviewRound() {
  const job = currentJob();
  if (!job) return;
  const rounds = ensureReviewRounds(job);
  const visibleRounds = visibleReviewRounds(job);
  if (visibleRounds.length <= 1) {
    showToast("至少保留一个面试轮次");
    return;
  }
  const round = currentReviewRound(job);
  const confirmed = window.confirm(`确认删除「${round.title || "当前轮次"}」吗？`);
  if (!confirmed) return;
  job.reviewRounds = rounds.filter((item) => item.id !== round.id);
  selectedReviewRoundId = visibleReviewRounds(job)[0]?.id || null;
  selectedReviewQuestionId = null;
  persist();
  renderInterview();
  showToast("面试轮次已删除");
}

function addReviewQuestion() {
  const job = currentJob();
  const round = currentReviewRound(job);
  if (!round) return;
  syncReviewFormToRound(job);
  const questions = ensureReviewQuestions(round);
  const existingVisibleCount = questions.filter((item) => isSubstantiveReviewQuestion(item) || item.userCreated).length;
  let question = questions.find((item) => !isSubstantiveReviewQuestion(item) && !item.userCreated);
  if (question) {
    question.title = `问题 ${existingVisibleCount + 1}`;
    question.userCreated = true;
    question.updatedAt = new Date().toISOString();
  } else {
    question = createReviewQuestion(round, `问题 ${existingVisibleCount + 1}`);
    question.userCreated = true;
    round.questionItems.push(question);
  }
  selectedReviewQuestionId = question.id;
  persist();
  renderInterview();
  showToast("已新增问题");
}

function deleteReviewQuestion() {
  const job = currentJob();
  const round = currentReviewRound(job);
  if (!round) return;
  const questions = ensureReviewQuestions(round);
  const visibleQuestions = visibleReviewQuestions(round);
  if (visibleQuestions.length <= 1) {
    showToast("至少保留一个问题");
    return;
  }
  const question = currentReviewQuestion(round);
  const confirmed = window.confirm(`确认删除「${question.title || "当前问题"}」吗？`);
  if (!confirmed) return;
  round.questionItems = questions.filter((item) => item.id !== question.id);
  selectedReviewQuestionId = visibleReviewQuestions(round)[0]?.id || null;
  syncReviewFormToRound(job);
  persist();
  renderInterview();
  showToast("问题已删除");
}

function extractReviewItemsFromDraft(text = "") {
  const normalized = String(text || "")
    .replace(/\r/g, "\n")
    .replace(/([？?])\s*(?=(?:我|答|回答|当时|面试官|Q|问|A|答复)[:：]?)/g, "$1\n")
    .trim();
  if (!normalized) return [];
  const blocks = normalized
    .split(/\n{2,}/)
    .flatMap((block) => block.split(/\n(?=(?:Q|问|问题|面试官)[:：\d\s])/i))
    .map((block) => block.trim())
    .filter(Boolean);
  const items = [];
  blocks.forEach((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    let title = "";
    const answerLines = [];
    const thinkingLines = [];
    const gapLines = [];
    lines.forEach((line) => {
      const cleaned = line.replace(/^\d+[.、]\s*/, "");
      const questionMatch = cleaned.match(/^(?:Q|问|问题|面试官)[:：\d\s]*(.+)$/i);
      const answerMatch = cleaned.match(/^(?:A|答|回答|我)[:：\s]*(.+)$/i);
      const gapMatch = cleaned.match(/^(?:卡点|不足|待补|gap|问题)[:：\s]*(.+)$/i);
      if (!title && questionMatch) title = questionMatch[1].trim();
      else if (answerMatch) answerLines.push(answerMatch[1].trim());
      else if (gapMatch) gapLines.push(gapMatch[1].trim());
      else if (!title && /[？?]$/.test(cleaned)) title = cleaned;
      else if (title) answerLines.push(cleaned);
      else thinkingLines.push(cleaned);
    });
    if (!title) {
      const sentenceMatch = block.match(/([^。！？\n]*[？?])/);
      if (sentenceMatch) title = sentenceMatch[1].trim();
    }
    if (title) {
      items.push({
        title: title.replace(/^[：:]\s*/, "").slice(0, 120),
        answer: answerLines.join("\n").slice(0, 1200),
        thinking: thinkingLines.join("\n").slice(0, 800),
        gap: gapLines.join("\n").slice(0, 600),
        nextAnswer: ""
      });
    }
  });
  if (!items.length) {
    const questionLines = normalized.split(/\n|。|；|;/).map((line) => line.trim()).filter((line) => /[？?]$/.test(line));
    questionLines.forEach((line) => items.push({ title: line.slice(0, 120), answer: "", thinking: "", gap: "", nextAnswer: "" }));
  }
  return items.slice(0, 20);
}

function replaceExtractedReviewItems(round, extracted, sourceOrigin) {
  syncReviewQuestionFormToItem(round);
  if (round.aiReview) {
    round.aiReviewHistory = [...(round.aiReviewHistory || []), round.aiReview];
    round.aiReview = null;
    round.aiReviewRunId = "";
  }
  const existing = ensureReviewQuestions(round).filter((item) => {
    const isDefault = /^问题\s*\d+$/.test(item.title || "") && !item.answer && !item.gap && !item.thinking && !item.nextAnswer;
    if (isDefault) return false;
    return !["document-extraction", "audio-transcription", "draft-extraction"].includes(item.sourceOrigin);
  });
  const createdAt = new Date().toISOString();
  round.questionItems = [
    ...existing,
    ...extracted.map((item, index) => ({
      ...createReviewQuestion(round, item.title || `提取问题 ${index + 1}`),
      title: item.title || `提取问题 ${index + 1}`,
      answer: item.answer || "",
      thinking: item.thinking || "",
      gap: item.gap || "",
      nextAnswer: item.nextAnswer || "",
      rawQuestion: item.rawQuestion || "",
      category: item.category || "",
      questionerRole: item.questionerRole || "",
      speakerId: item.speakerId ?? item.interviewerSpeakerId ?? null,
      beginTime: item.beginTime ?? null,
      endTime: item.endTime ?? null,
      sourceOrigin,
      createdAt,
      updatedAt: createdAt
    }))
  ];
  round.updatedAt = createdAt;
  selectedReviewQuestionId = round.questionItems[existing.length]?.id || round.questionItems[0]?.id || null;
  return extracted.length;
}

function extractReviewDraft({ replaceExtracted = false, sourceOrigin = "draft-extraction" } = {}) {
  const job = currentJob();
  const round = currentReviewRound(job);
  if (!round) return;
  const draft = $("review-source-draft").value.trim();
  if (!draft) {
    $("review-source-draft").focus();
    return showToast("请先粘贴面试草稿或音频转写稿");
  }
  syncReviewQuestionFormToItem(round);
  const extracted = extractReviewItemsFromDraft(draft);
  if (!extracted.length) return showToast("没有识别到明确问题，可以按“问：/答：”或逐行问题整理后再试");
  const count = replaceExtracted
    ? replaceExtractedReviewItems(round, extracted, sourceOrigin)
    : (() => {
        const createdAt = new Date().toISOString();
        round.questionItems.push(...extracted.map((item, index) => ({
          ...createReviewQuestion(round, item.title || `提取问题 ${index + 1}`),
          ...item,
          sourceOrigin,
          createdAt,
          updatedAt: createdAt
        })));
        selectedReviewQuestionId = round.questionItems.at(-extracted.length)?.id || round.questionItems[0]?.id || null;
        round.updatedAt = createdAt;
        return extracted.length;
      })();
  round.sourceDraft = draft;
  syncReviewFormToRound(job);
  persist();
  renderInterview();
  $("review-extract-status").textContent = `已提取 ${count} 个问答，请快速校对后运行复盘。`;
  showToast(`已提取 ${count} 个面试问题`);
  return count;
}

async function reextractReviewDraft({ sourceOrigin = "" } = {}) {
  const job = currentJob();
  const round = currentReviewRound(job);
  if (!round) return;
  const draft = $("review-source-draft").value.trim();
  if (!draft) {
    $("review-source-draft").focus();
    return showToast("请先粘贴面试草稿或音频转写稿");
  }
  const hasQuestionSpeaker = /(?:^|\n)(?:Q|问|面试官)[:：]\s*/i.test(draft);
  const hasAnswerSpeaker = /(?:^|\n)(?:A|答|候选人|我)[:：]\s*/i.test(draft);
  if (!hasQuestionSpeaker || !hasAnswerSpeaker) {
    return extractReviewDraft({ replaceExtracted: true, sourceOrigin: sourceOrigin || "draft-extraction" });
  }

  const buttons = [$("extract-review-draft"), $("extract-audio-questions"), $("extract-word-questions")].filter(Boolean);
  buttons.forEach((button) => { button.disabled = true; });
  $("review-extract-status").textContent = "正在按面试官说话轮次重新识别并优化问题…";
  try {
    const response = await fetch("/api/extract-interview-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: draft })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || `问题提取失败：${response.status}`);
    if (!Array.isArray(result.questionItems) || !result.questionItems.length) {
      throw new Error("没有识别到明确的面试官问题");
    }
    const resolvedOrigin = sourceOrigin
      || (round.sourceAsset?.sourceType === "document" ? "document-extraction" : "audio-transcription");
    const count = replaceExtractedReviewItems(round, result.questionItems, resolvedOrigin);
    round.sourceDraft = draft;
    round.sourceExtraction = {
      ...(round.sourceExtraction || {}),
      questionCount: count,
      questionExtraction: result.questionExtraction || null
    };
    syncReviewFormToRound(job);
    persist();
    renderInterview();
    $("review-extract-status").textContent = `已识别并优化 ${count} 个面试官问题，请快速校对后运行复盘。`;
    showToast(`已重新提取 ${count} 个面试官问题`);
  } catch (error) {
    $("review-extract-status").textContent = `智能提取失败：${error.message}`;
    showToast(`重新提取失败：${error.message}`);
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function extractQuestionsFromAudioTranscript() {
  const round = currentReviewRound();
  const hasAudio = round?.sourceAsset?.sourceType === "audio" || Boolean(round?.audio);
  if (!hasAudio || !round?.sourceDraft?.trim()) {
    showToast("请先在“上传本轮材料”中上传并完成音频转写");
    $("review-source-drop")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center"
    });
    return;
  }
  return reextractReviewDraft({ sourceOrigin: "audio-transcription" });
}

function extractQuestionsFromWordTranscript() {
  const round = currentReviewRound();
  const hasDocument = round?.sourceAsset?.sourceType === "document";
  if (!hasDocument || !round?.sourceDraft?.trim()) {
    showToast("请先在“上传本轮材料”中上传并完成 Word 正文提取");
    $("review-source-drop")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center"
    });
    return;
  }
  return reextractReviewDraft({ sourceOrigin: "document-extraction" });
}

async function loadReviewSourceFile(file) {
  if (!file) return;
  const job = currentJob();
  const round = currentReviewRound(job);
  if (!round) return;
  if (file.size > 25 * 1024 * 1024) return showToast("单个面试材料不能超过 25 MiB，请压缩音频或拆分上传");
  const drop = $("review-source-drop");
  const status = $("review-source-status");
  drop?.classList.remove("has-source", "has-error");
  drop?.classList.add("is-processing");
  if (status) status.textContent = file.type.startsWith("audio/") ? "正在保存并转写音频…" : "正在读取 Word 正文…";
  $("review-source-trigger").disabled = true;
  if ($("review-audio-trigger")) $("review-audio-trigger").disabled = true;
  try {
    const data = await fileToBase64(file);
    const response = await fetch("/api/extract-interview-source", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roundId: round.id, fileName: file.name, fileType: file.type || "application/octet-stream", data })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || `材料提取失败：${response.status}`);
    round.sourceAsset = {
      id: result.asset?.id || "",
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      size: file.size,
      sourceType: result.sourceType,
      url: result.asset?.url || "",
      uploadedAt: new Date().toISOString()
    };
    round.sourceExtraction = {
      status: result.status,
      sourceType: result.sourceType,
      charCount: result.charCount || 0,
      provider: result.provider || (result.sourceType === "document" ? "local" : ""),
      model: result.model || "",
      message: result.message || "",
      extractedAt: result.status === "extracted" ? new Date().toISOString() : null
    };
    if (result.sourceType === "audio") {
      round.audio = { ...round.sourceAsset, assetId: round.sourceAsset.id, previewUrl: round.sourceAsset.url };
    } else {
      round.audio = null;
    }
    if (result.status === "extracted") {
      round.sourceDraft = result.text;
      $("review-source-draft").value = result.text;
      const hasStructuredAudioQuestions = result.sourceType === "audio"
        && Array.isArray(result.questionItems)
        && result.questionItems.length > 0;
      const count = hasStructuredAudioQuestions
        ? replaceExtractedReviewItems(round, result.questionItems, "audio-transcription")
        : extractReviewDraft({
            replaceExtracted: true,
            sourceOrigin: result.sourceType === "audio" ? "audio-transcription" : "document-extraction"
          });
      round.sourceExtraction.questionCount = count || 0;
      round.sourceExtraction.questionExtraction = result.questionExtraction || null;
      if (hasStructuredAudioQuestions) {
        $("review-extract-status").textContent = `已识别并优化 ${count} 个面试官问题，请快速校对后运行复盘。`;
      }
    }
    round.updatedAt = new Date().toISOString();
    job.updatedAt = round.updatedAt;
    persist();
    renderInterview();
    if (result.status === "extracted") {
      showToast(`已从${result.sourceType === "audio" ? "音频" : "Word"}提取正文和问答，请校对后运行复盘`);
    } else {
      setReviewRunStatus("音频已保存，但尚未转写；完成转写后才能运行复盘。", "error");
      showToast(result.message || "音频已保存，等待配置转写服务");
    }
  } catch (error) {
    drop?.classList.add("has-error");
    if (status) status.textContent = `提取失败：${error.message}`;
    showToast(`面试材料提取失败：${error.message}`);
  } finally {
    drop?.classList.remove("is-processing");
    $("review-source-trigger").disabled = false;
    if ($("review-audio-trigger")) $("review-audio-trigger").disabled = false;
  }
}

function addDashboardTodo() {
  const text = $("dashboard-new-todo").value.trim();
  if (!text) {
    showToast("先写一条待办");
    return;
  }
  const job = state.jobs.find((item) => item.id === $("dashboard-todo-job").value) || currentJob();
  ensureJobTodos(job).unshift({
    id: crypto.randomUUID(),
    text,
    done: false,
    createdAt: new Date().toISOString()
  });
  $("dashboard-new-todo").value = "";
  persist();
  renderDashboard();
  showToast("待办已新增");
}

function updateDashboardTodo(row) {
  if (!row) return;
  const job = state.jobs.find((item) => item.id === row.dataset.todoJob);
  const todo = ensureJobTodos(job).find((item) => item.id === row.dataset.todoId);
  if (!todo) return;
  todo.text = row.querySelector("[data-edit-todo]").value.trim();
  todo.done = row.querySelector("[data-toggle-todo]").checked;
  job.todos = ensureJobTodos(job).filter((item) => item.text);
  persist();
  renderDashboard();
}

function deleteDashboardTodo(row) {
  if (!row) return;
  const job = state.jobs.find((item) => item.id === row.dataset.todoJob);
  if (!job) return;
  job.todos = ensureJobTodos(job).filter((item) => item.id !== row.dataset.todoId);
  persist();
  renderDashboard();
  showToast("待办已删除");
}

function renderJobList() {
  const list = $("job-list");
  const jobs = (currentStatusFilter === "全部" ? state.jobs : state.jobs.filter((job) => job.status === currentStatusFilter || (currentStatusFilter === "已结束" && ["Offer", "已拒绝", "已结束"].includes(job.status))))
    .slice()
    .sort((a, b) => jobUpdatedTime(b) - jobUpdatedTime(a));
  list.innerHTML = jobs.length ? jobs.map((job) => {
    const hasArchivedModules = Object.keys(job.analysisModules || {}).length > 0;
    const analysis = job.analysis?.generatedAt ? job.analysis : (hasArchivedModules ? Object.values(job.analysisModules)[0].analysis : null);
    const updatedLabel = job.updatedAt ? `更新 ${formatDate(job.updatedAt)}` : "暂无更新时间";
    const roundCount = recordedReviewRounds(job).length || (job.review?.questions || job.review?.notes ? 1 : 0);
    return `<div class="job ${job.id === selectedJobId ? "active" : ""}" data-job-id="${job.id}">
      <div class="job-head"><div><strong>${escapeHtml(job.company)}</strong><small>${escapeHtml(job.title)}</small></div><span class="tag ${job.status === "面试中" ? "green" : "blue"}">${escapeHtml(job.status)}</span></div>
    <div class="muted">${updatedLabel} · ${roundCount ? `${roundCount} 轮面试` : "未记录面试"} · ${analysis ? `规则证据分 ${analysis.score}/100` : "未分析"}</div>
    </div>`;
  }).join("") : `<div class="empty">没有符合筛选条件的岗位</div>`;
  list.querySelectorAll("[data-job-id]").forEach((item) => {
    item.addEventListener("click", () => {
      selectJob(item.dataset.jobId);
    });
  });
}

function isMeaningfulReviewRound(round = {}) {
  const questions = ensureReviewQuestions(round, false);
  return Boolean(
    round.date
    || round.format
    || round.interviewer
    || round.sourceAsset
    || round.sourceExtraction
    || round.aiReview
    || round.notes?.trim()
    || round.nextSteps?.trim()
    || questions.some(isSubstantiveReviewQuestion)
  );
}

function recordedReviewRounds(job = {}) {
  const rounds = Array.isArray(job.reviewRounds) ? job.reviewRounds : [];
  return rounds.filter(isMeaningfulReviewRound);
}

function displayedProjectReviewRounds(job = {}) {
  const rounds = ensureReviewRounds(job);
  const visibleRounds = rounds.filter((round) => isMeaningfulReviewRound(round) || round.userCreated);
  return visibleRounds.length ? visibleRounds : rounds.slice(0, 1);
}

function setProjectPanel(panel) {
  const allowed = ["overview", "data"];
  currentProjectPanel = allowed.includes(panel) ? panel : "overview";
  document.querySelectorAll("[data-project-panel]").forEach((button) => {
    button.classList.toggle("active", button.dataset.projectPanel === currentProjectPanel);
  });
  document.querySelectorAll("[data-project-panel-content]").forEach((content) => {
    const active = content.dataset.projectPanelContent === currentProjectPanel;
    content.classList.toggle("active", active);
    content.hidden = !active;
  });
}

function renderProjectOverview(job) {
  const rounds = ensureReviewRounds(job);
  const recordedRounds = recordedReviewRounds(job);
  const questions = recordedRounds.flatMap((round) => ensureReviewQuestions(round, false)).filter(isSubstantiveReviewQuestion);
  const gapCount = questions.filter((question) => question.gap?.trim()).length;
  const reviewedCount = recordedRounds.filter((round) => round.aiReview).length;
  const meaningfulRoundCount = recordedRounds.length;
  const stage = $("project-overview-stage");
  const status = $("project-overview-status");
  if (stage) stage.textContent = job.status === "面试中"
    ? `${meaningfulRoundCount || "尚无"}轮面试记录，继续围绕真实问题迭代准备。`
    : `当前处于“${job.status || "已保存"}”，最近更新于 ${formatDate(job.updatedAt)}。`;
  if (status) {
    status.textContent = job.status || "已保存";
    status.className = `tag ${job.status === "面试中" || job.status === "Offer" ? "green" : "blue"}`;
  }

  const hasAnalysis = Boolean(job.analysis?.generatedAt || Object.keys(job.analysisModules || {}).length);
  const pendingRound = rounds.find((round) => isMeaningfulReviewRound(round) && !round.aiReview);
  let next = {
    title: "完善岗位资料",
    copy: "补充完整 JD、业务线和投递信息，再开始岗位分析。",
    action: "data",
    button: "去完善"
  };
  if (job.jd?.trim() && !hasAnalysis) next = {
    title: "完成岗位分析",
    copy: "先形成岗位理解、能力要求、匹配策略和准备重点。",
    action: "analysis",
    button: "去分析"
  };
  else if (pendingRound) next = {
    title: `完成「${pendingRound.title || "本轮面试"}」复盘`,
    copy: "补充真实问题、回答和待改进点，生成下一轮行动。",
    action: "interview",
    roundId: pendingRound.id,
    button: "继续复盘"
  };
  else if (job.status === "面试中") next = {
    title: "记录下一轮面试",
    copy: "新增面试轮次，保留本轮问题和面试官反馈。",
    action: "interview",
    button: "查看面试"
  };
  else if (hasAnalysis) next = {
    title: "继续准备核心问题",
    copy: "查看当前准备重点，并根据岗位进展补充证据。",
    action: "analysis",
    button: "继续准备"
  };
  const nextBox = $("project-overview-next");
  if (nextBox) {
    nextBox.innerHTML = `<div><span>下一步</span><strong>${escapeHtml(next.title)}</strong><p>${escapeHtml(next.copy)}</p></div><button class="primary" data-overview-action="${escapeHtml(next.action)}" ${next.roundId ? `data-overview-round="${escapeHtml(next.roundId)}"` : ""}>${escapeHtml(next.button)}</button>`;
    nextBox.querySelector("[data-overview-action]")?.addEventListener("click", (event) => {
      if (event.currentTarget.dataset.overviewRound) selectedReviewRoundId = event.currentTarget.dataset.overviewRound;
      const action = event.currentTarget.dataset.overviewAction;
      if (action === "data") setProjectPanel("data");
      else activate(action);
    });
  }

  const stages = ["已保存", "已投递", "测评", "面试中", "Offer"];
  const stageIndex = Math.max(0, stages.indexOf(job.status));
  const progress = $("project-overview-progress");
  if (progress) progress.innerHTML = stages.map((item, index) => `<div class="${index < stageIndex ? "complete" : index === stageIndex ? "current" : ""}"><span></span><strong>${item}</strong></div>`).join("");
  const metrics = $("project-overview-metrics");
  if (metrics) metrics.innerHTML = [
    ["面试轮次", `${meaningfulRoundCount} 轮`],
    ["真实问题", `${questions.length} 个`],
    ["待补强", `${gapCount} 项`],
    ["完成复盘", `${reviewedCount} 轮`]
  ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function renderProjectPreparation(job) {
  document.querySelectorAll("[data-project-prep]").forEach((button) => {
    button.classList.toggle("active", button.dataset.projectPrep === currentProjectPrepSection);
  });
  const content = $("project-prep-content");
  if (!content) return;
  const archived = job.analysisModules?.[currentProjectPrepSection];
  const analysis = archived?.analysis || job.analysis;
  if (!analysis) {
    content.innerHTML = `<div class="project-panel-empty"><strong>还没有岗位分析</strong><span>运行完整分析后，这里会按模块呈现岗位理解、能力要求、匹配策略和准备重点。</span><button class="primary" data-jump="analysis">开始分析</button></div>`;
    content.querySelector("[data-jump]")?.addEventListener("click", () => activate("analysis"));
    return;
  }
  const focused = normalizeFocusedAnalysis(archived?.focused || analysis.focused || buildFocusedAnalysis(job, analysis));
  const sections = {
    jobUnderstanding: {
      title: "岗位理解",
      lead: focused.jobUnderstanding.roleSummary,
      html: `<div class="project-prep-fact"><span>公司定位</span><strong>${escapeHtml(focused.jobUnderstanding.companyPositioning)}</strong></div>${renderNumbered("可能负责的工作", focused.jobUnderstanding.likelyResponsibilities)}`
    },
    capabilityRequirements: {
      title: "能力要求",
      lead: "将 JD 的显性要求和面试中的隐性考点分开准备。",
      html: `${renderNumbered("必须准备", focused.capabilityRequirements.mustHave)}${renderNumbered("加分准备", focused.capabilityRequirements.niceToHave)}${renderNumbered("隐藏考点", focused.capabilityRequirements.hiddenExpectations)}`
    },
    personalStrategy: {
      title: "匹配策略",
      lead: focused.personalStrategy.recommendedFraming,
      html: `<div class="project-prep-fact"><span>主讲项目</span><strong>${escapeHtml(focused.personalStrategy.mainProject)}</strong></div>${renderNumbered("已有优势", focused.personalStrategy.advantages)}${renderNumbered("需要补强", focused.personalStrategy.gaps)}`
    },
    prepFocus: {
      title: "准备重点",
      lead: "优先完成最可能影响下一轮表现的准备动作。",
      html: `${renderNumbered("30 分钟必做", focused.prepFocus.thirtyMinutePlan)}${renderNumbered("高概率面试问题", focused.prepFocus.likelyQuestions)}`
    }
  };
  const section = sections[currentProjectPrepSection] || sections.jobUnderstanding;
  content.innerHTML = `<div class="project-prep-head"><h4>${section.title}</h4><p>${escapeHtml(section.lead || "暂无摘要")}</p></div>${section.html}`;
}

function renderProjectInterviewTimeline(job = currentJob()) {
  const container = $("project-interview-timeline");
  const summary = $("project-interviews-summary");
  if (!container || !job) return;
  const rounds = displayedProjectReviewRounds(job);
  const meaningfulRounds = recordedReviewRounds(job);
  const reviewedCount = meaningfulRounds.filter((round) => Boolean(round.aiReview)).length;
  const pendingCount = rounds.filter((round) => !isMeaningfulReviewRound(round) && round.userCreated).length;
  if (summary) {
    summary.textContent = meaningfulRounds.length
      ? `共 ${meaningfulRounds.length} 轮已记录，${reviewedCount} 轮已完成 AI 复盘${pendingCount ? `，另有 ${pendingCount} 轮待补充` : ""}。`
      : "暂无已记录面试，新增一轮后可持续沉淀每轮问题和结论。";
  }
  const selectedRound = rounds.find((round) => round.id === selectedReviewRoundId) || rounds[0];
  selectedReviewRoundId = selectedRound?.id || null;
  container.innerHTML = rounds.map((round, index) => {
    const questions = ensureReviewQuestions(round, false).filter(isSubstantiveReviewQuestion);
    const status = round.aiReview
      ? { label: "已复盘", tone: "green" }
      : isMeaningfulReviewRound(round)
        ? { label: "已记录", tone: "blue" }
        : { label: "待补充", tone: "" };
    const meta = [
      round.date ? formatDate(round.date) : "时间待补充",
      round.format,
      round.interviewer
    ].filter(Boolean).join(" · ");
    return `<button class="project-interview-round ${round.id === selectedRound?.id ? "active" : ""}" data-project-round="${escapeHtml(round.id)}">
      <span class="project-interview-node" aria-hidden="true">${index + 1}</span>
      <span class="project-interview-body">
        <span class="project-interview-title"><strong>${escapeHtml(round.title || `第 ${index + 1} 轮面试`)}</strong><span class="tag ${status.tone}">${status.label}</span></span>
        <span class="project-interview-meta">${escapeHtml(meta)}</span>
      </span>
      <span class="project-interview-count">${questions.length} 题</span>
    </button>`;
  }).join("");
  renderProjectInterviewDetail(job, selectedRound);
  container.querySelectorAll("[data-project-round]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedReviewRoundId = button.dataset.projectRound;
      selectedReviewQuestionId = null;
      renderProjectInterviewTimeline(job);
    });
  });
}

function renderProjectInterviewDetail(job, round) {
  const detail = $("project-interview-detail");
  if (!detail || !round) return;
  const questions = ensureReviewQuestions(round, false).filter(isSubstantiveReviewQuestion);
  const gapItems = questions.map((question) => question.gap?.trim()).filter(Boolean);
  const conclusions = round.aiReview?.summary?.threeConclusions || [];
  const nextActions = [
    ...(round.aiReview?.nextRoundPlan?.evidenceTasks || []),
    ...(round.aiReview?.nextRoundPlan?.rehearsalTasks || []),
    round.nextSteps?.trim()
  ].filter(Boolean);
  const status = round.aiReview ? "已完成 AI 复盘" : isMeaningfulReviewRound(round) ? "已记录，待运行复盘" : "待补充本轮信息";
  detail.innerHTML = `
    <div class="project-interview-detail-head">
      <div><span>${escapeHtml(status)}</span><h4>${escapeHtml(round.title || "未命名面试")}</h4></div>
      <button data-open-round-review="${escapeHtml(round.id)}">查看完整复盘</button>
    </div>
    <dl class="project-interview-meta-grid">
      <div><dt>时间</dt><dd>${escapeHtml(round.date ? formatDate(round.date) : "待补充")}</dd></div>
      <div><dt>形式</dt><dd>${escapeHtml(round.format || "待补充")}</dd></div>
      <div><dt>面试官</dt><dd>${escapeHtml(round.interviewer || "待补充")}</dd></div>
      <div><dt>问题</dt><dd>${questions.length} 个</dd></div>
    </dl>
    ${questions.length ? `<div class="project-interview-section"><strong>本轮问题</strong><ol>${questions.slice(0, 5).map((question) => `<li>${escapeHtml(question.title)}</li>`).join("")}</ol></div>` : `<div class="project-panel-empty compact"><strong>尚未记录真实问题</strong><span>进入完整复盘后可以上传 Word、音频或手动新增问题。</span></div>`}
    ${conclusions.length ? `<div class="project-interview-section"><strong>复盘结论</strong><ul>${conclusions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>` : ""}
    <div class="project-interview-section"><strong>下一轮行动</strong>${renderCompactList(nextActions.length ? nextActions : gapItems.length ? gapItems : ["补充本轮问题、回答和复盘结论"])}</div>`;
  detail.querySelector("[data-open-round-review]")?.addEventListener("click", () => {
    selectedReviewRoundId = round.id;
    selectedReviewQuestionId = null;
    activate("interview");
  });
}

function renderJobForm() {
  const job = currentJob();
  if (!job) return;
  ensureResumeLibrary();
  $("job-company").value = job.company || "";
  renderRoleCascade("job", normalizeRolePath(job));
  $("job-business-line").value = job.businessLine || "";
  $("job-status").value = job.status || "已保存";
  $("job-channel").value = job.channel || "官网";
  $("job-date").value = job.date || "";
  $("job-resume").innerHTML = renderResumeOptions(job.resumeId || state.profile.activeResumeId);
  $("job-link").value = job.link || "";
  $("job-jd").value = job.jd || "";
  const jdImagePreview = $("jd-image-preview");
  if (jdImagePreview) {
    if (job.jdImage?.assetId) {
      const imageUrl = `/api/data/file/${job.jdImage.assetId}`;
      jdImagePreview.style.display = "block";
      jdImagePreview.innerHTML = `<div class="brief-item"><strong>JD 图片</strong><span class="muted">${escapeHtml(job.jdImage.fileName || "已保存图片")}</span></div><img alt="JD 图片预览" src="${imageUrl}" style="width:100%;max-height:360px;object-fit:contain;background:#fff;border:0;" />`;
    } else {
      jdImagePreview.style.display = "none";
      jdImagePreview.innerHTML = "";
    }
  }
  $("job-bound-resume").textContent = resumeForJob(job)?.name || "默认简历";
  $("job-bound-resume-select").innerHTML = renderResumeOptions(job.resumeId || state.profile.activeResumeId);
  $("job-next-actions").innerHTML = ensureJobTodos(job).map((todo) => `<div class="todo"><span class="box ${todo.done ? "done" : ""}"></span>${escapeHtml(todo.text)}</div>`).join("") || `<div class="empty">保存岗位后生成下一步动作</div>`;
  const context = $("project-current-context");
  if (context) {
    const updated = job.updatedAt ? `更新 ${formatDate(job.updatedAt)}` : "暂无更新时间";
    context.innerHTML = `<div><strong>${escapeHtml(job.company)}｜${escapeHtml(job.title)}</strong><span>${escapeHtml(job.businessLine || "业务线待补充")} · ${escapeHtml(job.channel || "未知渠道")} · ${escapeHtml(updated)}</span></div><div class="actions"><span class="tag ${job.status === "面试中" || job.status === "Offer" ? "green" : "blue"}">${escapeHtml(job.status || "已保存")}</span><button data-context-add-interview>新增面试</button></div>`;
    context.querySelector("[data-context-add-interview]")?.addEventListener("click", () => {
      const round = addReviewRound();
      if (!round) return;
      activate("interview");
    });
  }
  renderProjectOverview(job);
  setProjectPanel(currentProjectPanel);
}

function renderDashboard() {
  if (!$("metric-total")) return;
  const total = state.jobs.length;
  const applied = state.jobs.filter((job) => job.status === "已投递").length;
  const interview = state.jobs.filter((job) => job.status === "面试中").length;
  const todos = allTodos();
  const todo = todos.filter(({ todo }) => !todo.done).length;
  $("metric-total").textContent = total;
  $("metric-applied").textContent = applied;
  $("metric-interview").textContent = interview;
  $("metric-todo").textContent = todo;
  $("week-interviews").textContent = `本周 ${interview} 场面试`;
  const rankedJobs = [...state.jobs].sort((a, b) => {
    const score = (job) => (job.status === "面试中" ? 3 : job.analysis || job.analysisModules ? 2 : job.status === "已投递" ? 1 : 0);
    return score(b) - score(a);
  }).slice(0, 4);
  $("dashboard-jobs").innerHTML = rankedJobs.map((job) => {
    const archivedModules = job.analysisModules || {};
    const firstArchivedAnalysis = Object.values(archivedModules).find((item) => item?.analysis)?.analysis || null;
    const analysis = job.analysis?.generatedAt ? job.analysis : firstArchivedAnalysis;
    const understanding = analysis?.focused?.jobUnderstanding?.roleSummary || analysis?.roleType || "待补充岗位理解";
    return `<div class="spotlight-card" data-dash-job="${job.id}">
      <div class="job-head"><div><strong>${escapeHtml(job.company)}</strong><small>${escapeHtml(job.title)}</small></div><span class="tag ${job.status === "面试中" ? "green" : "blue"}">${escapeHtml(job.status)}</span></div>
          <small>${job.date ? formatDate(job.date) : "暂无时间"} · ${analysis ? `规则证据分 ${analysis.score}/100` : "未分析"}</small>
      <p>${escapeHtml(String(understanding).slice(0, 76))}</p>
    </div>`;
  }).join("") || `<div class="empty">还没有岗位，先新增一个吧</div>`;
  $("dashboard-todo-job").innerHTML = state.jobs.map((job) => `<option value="${job.id}" ${job.id === selectedJobId ? "selected" : ""}>${escapeHtml(job.company)}</option>`).join("");
  $("dashboard-todos").innerHTML = todos.length ? todos.map(({ todo, job }) => `
    <div class="todo-row ${todo.done ? "done" : ""}" data-todo-job="${job.id}" data-todo-id="${todo.id}">
      <input type="checkbox" data-toggle-todo ${todo.done ? "checked" : ""} />
      <div>
        <input class="todo-title-input" data-edit-todo value="${escapeHtml(todo.text)}" />
        <div class="muted">${escapeHtml(job.company)} · ${escapeHtml(job.title)}</div>
      </div>
      <button class="danger icon-action" data-delete-todo>删除</button>
    </div>`).join("") : `<div class="empty">暂无待办。可以在上方新建一条。</div>`;
  document.querySelectorAll("[data-dash-job]").forEach((item) => {
    item.addEventListener("click", () => selectJob(item.dataset.dashJob, "jobs"));
  });
  document.querySelectorAll("[data-toggle-todo]").forEach((item) => {
    item.addEventListener("change", () => updateDashboardTodo(item.closest("[data-todo-id]")));
  });
  document.querySelectorAll("[data-edit-todo]").forEach((item) => {
    item.addEventListener("change", () => updateDashboardTodo(item.closest("[data-todo-id]")));
    item.addEventListener("blur", () => updateDashboardTodo(item.closest("[data-todo-id]")));
  });
  document.querySelectorAll("[data-delete-todo]").forEach((item) => {
    item.addEventListener("click", () => deleteDashboardTodo(item.closest("[data-todo-id]")));
  });
}

function renderProfile() {
  ensureResumeLibrary();
  const resume = activeResume();
  $("profile-target").value = state.profile.target || "";
  $("profile-industry").value = state.profile.industry || "";
  $("profile-resume-select").innerHTML = renderResumeOptions(state.profile.activeResumeId);
  $("profile-resume-name").value = resume.name || "";
  $("profile-resume").value = resume.resume || "";
  $("profile-projects").value = resume.projects || "";
  const text = `${resume.resume} ${resume.projects}`;
  const hasAI = /AI|大模型|LLM|Agent|RAG|Prompt|eval|badcase/i.test(text);
  const hasData = /数据|指标|分析|SQL|A\/B|实验/i.test(text);
  const completionItems = [
    Boolean(state.profile.target?.trim()),
    Boolean(state.profile.industry?.trim()),
    Boolean(resume.resume?.trim()),
    Boolean(resume.projects?.trim())
  ];
  const completion = Math.round((completionItems.filter(Boolean).length / completionItems.length) * 100);
  const completeness = $("profile-completeness");
  if (completeness) completeness.innerHTML = `
    <div><span>资料完整度</span><strong>${completion}%</strong></div>
    <div class="profile-completeness-track"><span style="width:${completion}%"></span></div>
    <small>${completionItems[2] ? "简历已提供" : "缺少简历"} · ${completionItems[3] ? "项目经历已提供" : "缺少项目经历"}</small>`;
  const currentResume = $("profile-current-resume");
  if (currentResume) currentResume.innerHTML = `
    <div><span>当前使用简历</span><strong>${escapeHtml(resume.name || resume.fileName || "未命名简历")}</strong><small>${resume.resume ? `已解析 ${resume.resume.length} 字` : "尚未解析正文"}</small></div>
    <button data-jump-resumes>查看简历</button>`;
  currentResume?.querySelector("[data-jump-resumes]")?.addEventListener("click", () => activate("resumes"));
  $("profile-summary").innerHTML = [
    ["目标岗位", state.profile.target || "待填写"],
    ["目标行业", state.profile.industry || "待填写"],
    ["简历文件", resume.fileName || resume.name || "未上传"],
    ["简历解析", resume.resume ? `已解析 ${resume.resume.length} 字，可用于 JD 匹配` : resume.parseStatus === "pending" ? "解析中" : resume.parseStatus === "failed" ? `解析失败：${resume.parseError || "未知错误"}` : "未解析正文"],
    ["可强调能力", hasAI ? "AI 工作流、Prompt Chain、eval、badcase" : "产品拆解、用户场景、项目推进"],
    ["待补能力", hasData ? "补充真实项目指标口径" : "补充数据指标、评估样本和量化口径"]
  ].map(([title, text]) => `<div class="brief-item"><strong>${title}</strong><span class="muted">${escapeHtml(text)}</span></div>`).join("");
  const experienceTable = $("experience-table");
  const experienceRows = buildExperienceRows(resume);
  if (experienceTable) {
    experienceTable.innerHTML = experienceRows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
  }
  const evidenceList = $("experience-evidence-list");
  if (evidenceList) evidenceList.innerHTML = experienceRows.map((row, index) => `
    <article class="experience-evidence">
      <div><span>证据 ${index + 1}</span><strong>${escapeHtml(row[0])}</strong></div>
      <dl><div><dt>能力标签</dt><dd>${escapeHtml(row[1])}</dd></div><div><dt>面试表达</dt><dd>${escapeHtml(row[2])}</dd></div></dl>
    </article>`).join("");
  if ($("experience-count")) $("experience-count").textContent = `${experienceRows.length} 条`;
  if ($("resume-version-count")) $("resume-version-count").textContent = `${state.profile.resumes.length} 个版本`;
  renderResumePreview();
  renderResumeVersionList();
}

function buildExperienceRows(resume) {
  const text = `${resume.resume || ""}\n${resume.projects || ""}`.trim();
  if (!text) {
    if (resume.parseStatus === "pending") {
      return [["正在解析简历", "请稍等，解析完成后自动更新", "解析成功后会抽取经历素材"]];
    }
    if (resume.parseStatus === "failed") {
      return [["简历解析失败", resume.parseError || "未知错误", "可重新上传 PDF/DOCX，或手动粘贴简历正文"]];
    }
    return [
      ["暂无简历正文", "请上传并解析 PDF/DOCX，或粘贴简历文本", "有正文后会自动抽取经历素材"]
    ];
  }
  const lines = text
    .split(/\n|。|；|;/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 8);
  const scored = lines.map((line) => {
    let score = 0;
    if (/实习|项目|负责|参与|主导|搭建|设计|优化|分析|推动|协作/.test(line)) score += 2;
    if (/AI|大模型|LLM|Agent|RAG|Prompt|评测|模型|算法|推荐|治理/i.test(line)) score += 2;
    if (/数据|指标|SQL|Python|A\/B|实验|看板|监控|分析/.test(line)) score += 1;
    if (/\d|%|提升|降低|增长|覆盖|样本/.test(line)) score += 1;
    return { line, score };
  }).sort((a, b) => b.score - a.score).slice(0, 6);
  const rows = scored.length ? scored : [{ line: text.slice(0, 90), score: 0 }];
  return rows.map(({ line }) => {
    const matchTags = [];
    if (/AI|大模型|LLM|Agent|RAG|Prompt|评测|模型|算法/i.test(line)) matchTags.push("AI 产品 / 模型评测");
    if (/数据|指标|SQL|Python|A\/B|实验|看板|监控/.test(line)) matchTags.push("数据分析 / 指标体系");
    if (/用户|需求|调研|体验|增长|转化/.test(line)) matchTags.push("用户需求 / 产品体验");
    if (/协作|推进|落地|项目管理|跨部门/.test(line)) matchTags.push("项目推进 / 跨团队协作");
    return [
      line.length > 90 ? `${line.slice(0, 90)}...` : line,
      matchTags.length ? matchTags.join("、") : "产品分析 / 项目表达",
      buildExperienceAngle(line)
    ];
  });
}

function buildExperienceAngle(line) {
  if (/评测|badcase|样本|模型/.test(line)) return "强调评估标准、样本构建、badcase 归因和迭代闭环。";
  if (/指标|数据|SQL|看板|监控/.test(line)) return "强调如何定义指标、定位问题，并用数据支持产品判断。";
  if (/需求|用户|调研|体验/.test(line)) return "强调从用户场景出发拆解需求，而不是只描述执行动作。";
  if (/协作|推动|落地|项目管理/.test(line)) return "强调跨团队推进、优先级判断和交付结果。";
  return "面试时补充背景、你的动作、判断依据和可验证结果。";
}

function renderResumeVersionList() {
  ensureResumeLibrary();
  $("resume-version-list").innerHTML = state.profile.resumes.map((resume) => {
    const active = resume.id === state.profile.activeResumeId;
    const used = resumeUsageCount(resume.id);
    const name = resume.name || resume.fileName || "未命名简历";
    const parseMeta = resume.resume ? `已解析：${resume.resume.length} 字` : resume.parseStatus === "failed" ? "解析失败" : "未解析正文";
    const meta = [
      resume.fileName ? `文件：${resume.fileName}` : "手动文本",
      parseMeta,
      `绑定岗位：${used}`
    ].join(" · ");
    return `<div class="job ${active ? "active" : ""}" data-resume-card="${resume.id}">
      <div class="job-head">
        <div><strong>${escapeHtml(name)}</strong><small>${escapeHtml(meta)}</small></div>
        <span class="tag ${active ? "green" : "blue"}">${active ? "当前预览" : "可选择"}</span>
      </div>
      <div class="actions">
        <button data-select-resume="${resume.id}">查看</button>
        <button class="danger" data-delete-resume="${resume.id}" ${used > 0 || state.profile.resumes.length <= 1 ? "disabled" : ""}>删除</button>
      </div>
    </div>`;
  }).join("");
  $("resume-version-list").querySelectorAll("[data-select-resume]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      selectResumeVersion(button.dataset.selectResume);
    });
  });
  $("resume-version-list").querySelectorAll("[data-delete-resume]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteResumeVersion(button.dataset.deleteResume);
    });
  });
  $("resume-version-list").querySelectorAll("[data-resume-card]").forEach((card) => {
    card.addEventListener("click", () => selectResumeVersion(card.dataset.resumeCard));
  });
}

function renderResumeOptions(selectedId) {
  ensureResumeLibrary();
  return state.profile.resumes.map((resume) => `<option value="${resume.id}" ${resume.id === selectedId ? "selected" : ""}>${escapeHtml(resume.name || resume.fileName || "未命名简历")}</option>`).join("");
}

function renderResumePreview() {
  const preview = $("resume-preview");
  const status = $("resume-preview-status");
  const resume = activeResume();
  const fileName = resume.fileName || resume.name;
  if (!fileName) {
    if (resume.resume) {
      status.textContent = "文本预览";
      preview.innerHTML = `<pre>${escapeHtml(resume.resume)}</pre>`;
      return;
    }
    status.textContent = "未上传";
    preview.innerHTML = `<div class="empty">还没有上传简历。上传 PDF、DOC/DOCX 或 TXT/MD 后会在这里显示预览。</div>`;
    return;
  }
  if (resume.parseStatus === "pending") {
    status.textContent = "解析中";
    preview.innerHTML = `<div class="empty">正在解析「${escapeHtml(fileName)}」正文。解析完成后，这里会显示正文，并同步更新经历素材库。</div>`;
    return;
  }
  if (resume.parseStatus === "failed") {
    status.textContent = "解析失败";
    preview.innerHTML = `<div class="empty">已上传「${escapeHtml(fileName)}」，但正文解析失败：${escapeHtml(resume.parseError || "未知错误")}。你可以重新上传 PDF/DOCX，或把简历正文粘贴到左侧文本框后保存。</div>`;
    return;
  }
  status.textContent = resume.resume ? `已解析 ${resume.resume.length} 字` : fileName;
  if (resume.previewText || resume.resume) {
    preview.innerHTML = `<div class="brief-item" style="margin:10px;"><strong>已解析正文，将用于 JD 匹配</strong><span class="muted">${escapeHtml(fileName)} · ${String(resume.resume || resume.previewText || "").length} 字</span></div><pre>${escapeHtml(resume.previewText || resume.resume)}</pre>`;
    return;
  }
  if (resume.previewKind === "pdf" && resume.previewUrl) {
    preview.innerHTML = `<iframe title="简历 PDF 预览" src="${resume.previewUrl}"></iframe>`;
    return;
  }
  preview.innerHTML = `<div class="empty">已上传：${escapeHtml(fileName)}。DOC/DOCX 正文预览需要后续接入解析器；你可以把简历文本粘贴到左侧文本框，当前版本会用于岗位匹配。</div>`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

async function storeUploadedFile(file, category, entityId = null) {
  const data = await fileToBase64(file);
  const response = await fetch("/api/data/file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category, entityId, fileName: file.name, mimeType: file.type || "application/octet-stream", data })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(result.error || `文件保存失败：${response.status}`);
  return result.asset;
}

async function parseResumeFile(file, resumeId = null) {
  const data = await fileToBase64(file);
  const response = await fetch("/api/parse-resume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      fileType: file.type || "",
      resumeId,
      data
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    throw new Error(result.error || `简历解析失败：${response.status}`);
  }
  return result;
}

const analysisModuleMeta = {
  jobUnderstanding: "岗位理解",
  capabilityRequirements: "能力要求",
  personalStrategy: "匹配策略",
  prepFocus: "准备重点",
  coverLetter: "Cover Letter",
  selfIntroduction: "自我介绍"
};

function defaultAnalysisModules(value = false) {
  return Object.fromEntries(Object.keys(analysisModuleMeta).map((key) => [key, value]));
}

function visibleAnalysisModules(job) {
  const archived = Object.fromEntries(Object.keys(job.analysisModules || {}).map((key) => [key, true]));
  return { ...defaultAnalysisModules(false), ...(job.analysisVisibleModules || {}), ...archived };
}

function generatedModuleLabels(visible) {
  const labels = Object.entries(visible).filter(([, value]) => value).map(([key]) => analysisModuleMeta[key]);
  return labels.length ? labels.join("、") : "暂未展开";
}

function hasAnyVisibleModule(visible) {
  return Object.values(visible).some(Boolean);
}

function moduleEmpty(title, text) {
  return `<div class="empty"><strong style="display:block;margin-bottom:6px;color:var(--text);">${escapeHtml(title)}待生成</strong>${escapeHtml(text)}</div>`;
}

function renderEmptyAnalysisModules() {
  $("job-understanding").innerHTML = moduleEmpty("岗位理解", "生成后会展示：岗位做什么、公司/业务定位、可能服务对象和核心职责。");
  $("capability-requirements").innerHTML = moduleEmpty("能力要求", "生成后会展示：硬性能力、加分项、面试官没有写在 JD 里的隐性考点。");
  $("personal-strategy").innerHTML = moduleEmpty("匹配策略", "生成后会展示：该用哪段经历匹配、怎么讲、哪些表达要避开。");
  $("prep-focus").innerHTML = moduleEmpty("准备重点", "生成后会展示：面试前 30 分钟、2 小时深度准备和高概率问题。");
  $("cover-letter").innerHTML = moduleEmpty("Cover Letter", "生成后会基于当前岗位和所选简历，给你一段投递时可改写的话。");
  $("self-introduction").innerHTML = moduleEmpty("自我介绍", "生成后会给出一版面试开场/HR 沟通可用的自我介绍。");
}

function renderModuleButtons(job) {
  const visible = visibleAnalysisModules(job);
  document.querySelectorAll("[data-module-card]").forEach((card) => {
    const key = card.dataset.moduleCard;
    card.classList.toggle("running", moduleRunningKey === key);
    const currentProgress = moduleProgress[key] || { percent: 0, text: "准备生成" };
    setModuleProgress(key, currentProgress.percent, currentProgress.text);
  });
  document.querySelectorAll("[data-generate-module]").forEach((button) => {
    const key = button.dataset.generateModule;
    button.disabled = analysisRunning || Boolean(moduleRunningKey);
    button.textContent = moduleRunningKey === key ? "生成中" : visible[key] ? "重新生成" : "生成";
  });
}

function moduleInputScope(key, job = currentJob()) {
  const resume = resumeForJob(job);
  const resumeChars = (resume?.resume || "").length;
  const jdOnly = ["jobUnderstanding", "capabilityRequirements"].includes(key);
  if (jdOnly) return "输入：JD";
  return resumeChars ? `输入：JD + 简历（${resumeChars} 字）` : "输入：JD + 简历（当前简历正文为空）";
}

function archiveAnalysisModule(job, key) {
  if (!job?.analysis) return;
  job.analysisModules = job.analysisModules || {};
  job.analysisModules[key] = {
    generatedAt: new Date().toISOString(),
    provider: job.analysis.provider || "api",
    analysis: job.analysis,
    focused: normalizeFocusedAnalysis(job.analysis.focused || buildFocusedAnalysis(job, job.analysis)),
    roleUnderstanding: key === "jobUnderstanding" ? job.roleUnderstandingSkill || null : null,
    coverLetter: key === "coverLetter" ? job.coverLetterSkill || null : null,
    selfIntroduction: key === "selfIntroduction" ? job.selfIntroductionSkill || null : null,
    options: key === "selfIntroduction"
      ? job.selfIntroOptions || getSelfIntroOptions(job)
      : key === "coverLetter" ? job.coverLetterOptions || getCoverLetterOptions(job) : null
  };
  job.analysisVisibleModules = { ...visibleAnalysisModules(job), [key]: true };
}

function archiveAllAnalysisModules(job) {
  Object.keys(analysisModuleMeta).forEach((key) => archiveAnalysisModule(job, key));
}

function moduleAnalysis(job, key) {
  const archived = job?.analysisModules?.[key];
  if (archived?.analysis) return archived.analysis;
  return job?.analysis || null;
}

function forceRenderArchivedModules(job = currentJob()) {
  Object.keys(job?.analysisModules || {}).forEach((key) => forceRenderAnalysisModule(key, job));
  renderModuleButtons(job);
}

function forceRenderAnalysisModule(key, job = currentJob()) {
  const analysis = moduleAnalysis(job, key);
  if (!analysis) return;
  const archivedFocused = job?.analysisModules?.[key]?.focused;
  const focused = normalizeFocusedAnalysis(archivedFocused || analysis.focused || buildFocusedAnalysis(job, analysis));
  if (key === "jobUnderstanding") {
    const skill = job?.analysisModules?.jobUnderstanding?.roleUnderstanding || job?.roleUnderstandingSkill;
    $("job-understanding").innerHTML = skill ? renderRoleUnderstandingSkill(skill, focused) : `
      <p class="brief-text">${escapeHtml(focused.jobUnderstanding.roleSummary)}</p>
      <div class="brief-item"><strong>公司定位理解</strong><span class="muted">${escapeHtml(focused.jobUnderstanding.companyPositioning)}</span></div>
      <div class="brief-item"><strong>业务背景</strong><span class="muted">${escapeHtml(focused.jobUnderstanding.businessContext)}</span></div>
      ${renderNumbered("可能负责的工作", focused.jobUnderstanding.likelyResponsibilities)}
    `;
  }
  if (key === "capabilityRequirements") {
    $("capability-requirements").innerHTML = `
      ${renderNumbered("必须准备", focused.capabilityRequirements.mustHave)}
      ${renderNumbered("加分准备", focused.capabilityRequirements.niceToHave)}
      ${renderNumbered("隐藏考点", focused.capabilityRequirements.hiddenExpectations)}
    `;
  }
  if (key === "personalStrategy") {
    $("personal-strategy").innerHTML = `
      <div class="brief-item"><strong>主讲项目</strong><span class="muted">${escapeHtml(focused.personalStrategy.mainProject)}</span></div>
      <div class="brief-item"><strong>推荐讲法</strong><span class="muted">${escapeHtml(focused.personalStrategy.recommendedFraming)}</span></div>
      ${renderNumbered("优势", focused.personalStrategy.advantages)}
      ${renderNumbered("短板", focused.personalStrategy.gaps)}
    `;
  }
  if (key === "prepFocus") {
    $("prep-focus").innerHTML = `
      ${renderNumbered("30 分钟必做", focused.prepFocus.thirtyMinutePlan)}
      ${renderNumbered("2 小时深度准备", focused.prepFocus.twoHourPlan)}
      ${renderNumbered("高概率面试问题", focused.prepFocus.likelyQuestions)}
    `;
  }
  if (key === "coverLetter") {
    const skill = job?.analysisModules?.coverLetter?.coverLetter || job?.coverLetterSkill;
    $("cover-letter").innerHTML = skill
      ? renderCoverLetterSkill(skill)
      : `<div class="brief-item"><strong>Cover Letter 草稿</strong><pre style="white-space:pre-wrap;margin:8px 0 0;font:inherit;font-size:13px;line-height:1.65;color:var(--muted);">${escapeHtml(focused.applicationMaterials.coverLetter || "暂无")}</pre></div>`;
  }
  if (key === "selfIntroduction") {
    const skill = job?.analysisModules?.selfIntroduction?.selfIntroduction || job?.selfIntroductionSkill;
    $("self-introduction").innerHTML = skill
      ? renderSelfIntroductionSkill(skill, job?.analysisModules?.selfIntroduction?.options || job?.selfIntroOptions || {})
      : `<div class="brief-item"><strong>自我介绍草稿</strong><pre style="white-space:pre-wrap;margin:8px 0 0;font:inherit;font-size:13px;line-height:1.65;color:var(--muted);">${escapeHtml(focused.applicationMaterials.selfIntroduction || "暂无")}</pre></div>`;
  }
  $("workflow-summary").innerHTML = [
    ["当前结论", `${focused.summary.roleType} / ${focused.summary.fitLevel} / 准备优先级 ${focused.summary.priority}`],
    ["执行架构", analysis.architecture?.type === "planner-skill-runner" ? "Planner → Skill Runner → 统一结果" : "本地工作流兜底"],
    ["执行计划", (analysis.architecture?.plan || []).map((key) => SKILL_PRESENTATION[key]?.title || key).join(" → ") || "未记录"],
    ["模型调用", `${analysis.architecture?.modelCallCount || 0} 次${analysis.provider === "local" || analysis.provider === "local-agent" ? "，当前为本地兜底" : ""}`],
    ["总耗时", formatTraceDuration(analysis.architecture?.totalDurationMs || 0)],
    ["输入范围", moduleInputScope(key, job)],
    ["结果状态", `${analysisModuleMeta[key]}已写入统一结果页`]
  ].map(([title, text]) => `<div class="brief-item"><strong>${title}</strong><span class="muted">${escapeHtml(text)}</span></div>`).join("");
  $("workflow-trace").textContent = JSON.stringify({
    architecture: analysis.architecture || {},
    trace: analysis.trace || [],
    resultKeys: Object.keys(analysis.workflow || {})
  }, null, 2);
}

function renderRoleUnderstandingSkill(skill, focused) {
  const links = toArray(skill.sourceLinks).map((item) => typeof item === "string" ? { title: item, url: item } : item);
  const likelyWork = toArray(skill.likelyWork).map((item) => {
    if (typeof item === "string") return item;
    return `${item.task || ""}${item.businessMeaning ? `：${item.businessMeaning}` : ""}${item.deliverable ? `（交付：${item.deliverable}）` : ""}`;
  });
  return `
    <p class="brief-text">${escapeHtml(skill.rolePositioning?.oneSentence || focused.jobUnderstanding.roleSummary)}</p>
    <div class="brief-item"><strong>公司主营业务</strong><span class="muted">${escapeHtml(skill.companyBusiness?.summary || focused.jobUnderstanding.companyPositioning)}</span></div>
    <div class="brief-item"><strong>商业/业务模式理解</strong><span class="muted">${escapeHtml(skill.companyBusiness?.businessModel || "待结合官网、新闻和业务资料继续核验。")}</span></div>
    <div class="brief-item"><strong>岗位在公司的作用/占位</strong><span class="muted">${escapeHtml(`${skill.rolePositioning?.orgLocation || ""}${skill.rolePositioning?.whyNeeded ? `：${skill.rolePositioning.whyNeeded}` : ""}` || focused.jobUnderstanding.businessContext)}</span></div>
    <div class="brief-item"><strong>涉及的业务对象</strong>${renderChips(skill.businessMap?.businessObjects || focused.jobUnderstanding.targetUsers)}</div>
    ${renderNumbered("涉及的业务流程", skill.businessMap?.workflows || [])}
    ${renderNumbered("可能接触的数据 / 系统", skill.businessMap?.dataAndSystems || [])}
    ${renderNumbered("可能负责的工作", likelyWork)}
    ${renderNumbered("面试前必须补的业务知识", skill.industryPrimer?.mustKnowTerms || [])}
    ${renderNumbered("继续调研的问题", skill.industryPrimer?.questionsToResearch || [])}
    ${renderNumbered("可主动表达的业务理解角度", skill.industryPrimer?.interviewAngles || [])}
    <div class="brief-item"><strong>参考链接 / 搜索建议</strong>${
      links.length
        ? `<ol class="compact-list">${links.map((link, index) => `<li><span class="number-dot">${index + 1}</span><span>${link.url ? `<a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.title || link.url)}</a>` : escapeHtml(link.title || "参考资料")}<br><span class="muted">${escapeHtml([link.type, link.confidence, link.note].filter(Boolean).join(" · "))}</span></span></li>`).join("")}</ol>`
        : `<span class="muted">暂无。可在上方「公司/业务参考资料」粘贴官网或新闻链接后重新生成。</span>`
    }</div>
  `;
}

function renderCoverLetterSkill(skill) {
  if (skill.status === "needs_clarification") {
    return `<div class="brief-item insight-card"><strong>生成前需要确认</strong>${renderNumbered("必需信息", skill.blockingQuestions || [])}${toArray(skill.optionalQuestions).length ? renderNumbered("可选增强信息", skill.optionalQuestions) : ""}<span class="muted">补充后再次点击“生成”。系统不会用猜测信息补齐事实。</span></div>`;
  }
  return `
    <div class="brief-item insight-card"><strong>JD 判断</strong><span class="muted">${escapeHtml(skill.jdJudgment || "已结合当前 JD 与所选简历生成。")}</span></div>
    <div class="brief-item"><div class="section-head" style="margin-bottom:4px;"><strong>推荐版 · ${escapeHtml(skill.channel || "Cover Letter")}</strong><button data-copy-cover-version="recommended">复制推荐版</button></div><pre style="white-space:pre-wrap;margin:8px 0 0;font:inherit;font-size:13px;line-height:1.65;color:var(--muted);">${escapeHtml(skill.recommended || "暂无")}</pre></div>
    <div class="brief-item"><div class="section-head" style="margin-bottom:4px;"><strong>更短版</strong><button data-copy-cover-version="shorter">复制更短版</button></div><pre style="white-space:pre-wrap;margin:8px 0 0;font:inherit;font-size:13px;line-height:1.65;color:var(--muted);">${escapeHtml(skill.shorter || "暂无")}</pre></div>
    ${renderNumbered("采用的真实证据", (Array.isArray(skill.selectedEvidence) ? skill.selectedEvidence : []).map((item) => typeof item === "string" ? item : item.sourceEvidence || JSON.stringify(item)))}
    ${renderNumbered("取舍说明", skill.tradeoffs || [])}
    ${toArray(skill.optionalQuestions).length ? renderNumbered("可选增强信息", skill.optionalQuestions) : ""}
  `;
}

function renderSelfIntroductionSkill(skill, options = {}) {
  const selectedScript = selfIntroductionScript(skill, options);
  const evidence = toArray(skill.selectedEvidence).map((item) => {
    if (typeof item === "string") return item;
    return `${item.resumeEvidence || "经历证据"}：${item.jobRelevance || ""}${item.talkingPoint ? `；讲法：${item.talkingPoint}` : ""}`;
  });
  return `
    <div class="brief-item"><strong>岗位最想听什么</strong><span class="muted">${escapeHtml(skill.roleDemand || "需要证明岗位匹配度和真实经历。")}</span></div>
    <div class="brief-item"><strong>候选人定位句</strong><span class="muted">${escapeHtml(skill.positioning || "待结合简历生成。")}</span></div>
    ${renderNumbered("选中的经历证据", evidence)}
    <div class="brief-item"><strong>投递 / 面试动机</strong><span class="muted">${escapeHtml(skill.motivation || "待结合公司业务补充。")}</span></div>
    <div class="brief-item"><strong>${escapeHtml(skill.scene || options.scene || "面试")} · ${escapeHtml(skill.length || options.length || "60秒")} 版本</strong><pre style="white-space:pre-wrap;margin:8px 0 0;font:inherit;font-size:13px;line-height:1.7;color:var(--muted);">${escapeHtml(selectedScript || "暂无")}</pre></div>
    ${renderNumbered("风险边界", skill.riskBoundaries || [])}
    ${renderNumbered("可能追问", skill.followUpQuestions || [])}
  `;
}

function renderAnalysis() {
  try {
    const job = currentJob();
    if (!job) {
      $("analysis-current-job").innerHTML = "暂无岗位";
      return;
    }
    const archivedModules = job.analysisModules || {};
    const firstArchivedAnalysis = Object.values(archivedModules).find((item) => item?.analysis)?.analysis || null;
    const analysis = job.analysis?.generatedAt ? job.analysis : firstArchivedAnalysis;
    $("start-analysis").style.display = "inline-flex";
    const hasStoredAnalysis = Boolean(analysis);
    $("save-analysis").disabled = !hasStoredAnalysis;
    $("start-analysis").disabled = analysisRunning;
    $("analysis-current-job").innerHTML = `<strong>${escapeHtml(job.company)} - ${escapeHtml(job.title)}</strong><span class="muted">状态：${escapeHtml(job.status)} · 渠道：${escapeHtml(job.channel)}</span>`;
    $("analysis-job-select").innerHTML = state.jobs.map((item) => `<option value="${item.id}" ${item.id === selectedJobId ? "selected" : ""}>${escapeHtml(item.company)} - ${escapeHtml(item.title)}</option>`).join("");
    $("analysis-resume-select").innerHTML = renderResumeOptions(job.resumeId || state.profile.activeResumeId);
    $("analysis-jd").textContent = job.jd || "暂无 JD，请先在岗位池中粘贴 JD。";
    $("analysis-references").value = job.researchReferences || "";
    if ($("self-intro-scene")) $("self-intro-scene").value = job.selfIntroOptions?.scene || "业务面";
    if ($("self-intro-length")) $("self-intro-length").value = job.selfIntroOptions?.length || "60秒";
    const coverOptions = job.coverLetterOptions || {};
    if ($("cover-letter-channel")) $("cover-letter-channel").value = coverOptions.channel || "中文邮件 Cover Letter";
    if ($("cover-letter-language")) $("cover-letter-language").value = coverOptions.language || "跟随 JD";
    if ($("cover-letter-arrival")) $("cover-letter-arrival").value = coverOptions.arrivalDate || "";
    if ($("cover-letter-days")) $("cover-letter-days").value = coverOptions.daysPerWeek || "";
    if ($("cover-letter-duration")) $("cover-letter-duration").value = coverOptions.duration || "";
    renderApiStatus();
    $("analysis-results").classList.remove("hidden");
    renderModuleButtons(job);
    if (!analysis) {
      $("workflow-summary").innerHTML = `<div class="empty">还没有生成分析。点击顶部「理解岗位与行业」，Planner 会统一编排岗位理解、简历匹配、风险诊断和准备计划。</div>`;
      $("analysis-hero").innerHTML = "";
      renderEmptyAnalysisModules();
      $("workflow-trace").textContent = "";
      return;
    }
    const focused = normalizeFocusedAnalysis(analysis.focused || buildFocusedAnalysis(job, analysis));
    const moduleFocused = (key) => {
      const archived = job.analysisModules?.[key];
      if (archived?.focused) return normalizeFocusedAnalysis(archived.focused);
      const itemAnalysis = archived?.analysis || analysis;
      return normalizeFocusedAnalysis(itemAnalysis.focused || buildFocusedAnalysis(job, itemAnalysis));
    };
    const rawFallback = analysis.rawText || analysis.summary || "";
    const visible = visibleAnalysisModules(job);
    $("workflow-summary").innerHTML = [
      ["当前结论", `${focused.summary.roleType} / ${focused.summary.fitLevel} / 准备优先级 ${focused.summary.priority}`],
      ["重点准备", focused.summary.prepFocus],
      ["分析来源", analysis.provider === "local" ? "本地工作流兜底" : "DeepSeek API"],
      ["已生成模块", generatedModuleLabels(visible)],
      ["结果状态", hasAnyVisibleModule(visible) ? "结果已写入页面模块" : "分析已完成，尚未选择要展开的模块"],
      ["结果体积", `${JSON.stringify(analysis).length} 字符`]
    ].map(([title, text]) => `<div class="brief-item"><strong>${title}</strong><span class="muted">${escapeHtml(text)}</span></div>`).join("");
    $("analysis-hero").innerHTML = `
    <div class="verdict insight-card"><span>岗位类型</span><strong>${escapeHtml(focused.summary.roleType)}</strong></div>
    <div class="verdict"><span>投入优先级</span><strong>${escapeHtml(focused.summary.priority)}</strong></div>
    <div class="verdict"><span>匹配判断</span><strong>${escapeHtml(focused.summary.fitLevel)}</strong></div>
    <div class="verdict"><span>首要准备</span><strong style="font-size:15px;line-height:1.45;">${escapeHtml(focused.summary.prepFocus)}</strong></div>
  `;
  const jobUnderstandingFocused = moduleFocused("jobUnderstanding");
  $("job-understanding").innerHTML = visible.jobUnderstanding ? `
    <p class="brief-text">${escapeHtml(jobUnderstandingFocused.jobUnderstanding.roleSummary || rawFallback || "已收到分析结果，但结构化字段不足。请点击「重新分析」再次生成。")}</p>
    <div class="brief-item"><strong>公司定位理解</strong><span class="muted">${escapeHtml(jobUnderstandingFocused.jobUnderstanding.companyPositioning || "公司定位信息不足，需要结合官网和产品线补充。")}</span></div>
    <div class="brief-item"><strong>业务背景</strong><span class="muted">${escapeHtml(jobUnderstandingFocused.jobUnderstanding.businessContext)}</span></div>
    <div class="brief-item"><strong>服务对象 / 业务关键词</strong>${renderChips(jobUnderstandingFocused.jobUnderstanding.targetUsers)}</div>
    ${renderNumbered("可能负责的工作", jobUnderstandingFocused.jobUnderstanding.likelyResponsibilities)}
  ` : moduleEmpty("岗位理解", "生成后会展示：岗位做什么、公司/业务定位、可能服务对象和核心职责。");
  const capabilityFocused = moduleFocused("capabilityRequirements");
  $("capability-requirements").innerHTML = visible.capabilityRequirements ? `
    ${renderNumbered("必须准备", capabilityFocused.capabilityRequirements.mustHave)}
    ${renderNumbered("加分准备", capabilityFocused.capabilityRequirements.niceToHave)}
    ${renderNumbered("隐藏考点", capabilityFocused.capabilityRequirements.hiddenExpectations)}
  ` : moduleEmpty("能力要求", "生成后会展示：硬性能力、加分项、面试官没有写在 JD 里的隐性考点。");
  const strategyFocused = moduleFocused("personalStrategy");
  $("personal-strategy").innerHTML = visible.personalStrategy ? `
    <div class="brief-item insight-card"><strong>主讲项目</strong><span class="muted">${escapeHtml(strategyFocused.personalStrategy.mainProject)}</span></div>
    <div class="brief-item"><strong>推荐讲法</strong><span class="muted">${escapeHtml(strategyFocused.personalStrategy.recommendedFraming)}</span></div>
    ${renderNumbered("优势", strategyFocused.personalStrategy.advantages)}
    ${renderNumbered("短板", strategyFocused.personalStrategy.gaps)}
    ${renderNumbered("不要这样说", strategyFocused.personalStrategy.avoidSaying)}
  ` : moduleEmpty("匹配策略", "生成后会展示：该用哪段经历匹配、怎么讲、哪些表达要避开。");
  const prepFocused = moduleFocused("prepFocus");
  $("prep-focus").innerHTML = visible.prepFocus ? `
    ${renderNumbered("30 分钟必做", prepFocused.prepFocus.thirtyMinutePlan)}
    ${renderNumbered("2 小时深度准备", prepFocused.prepFocus.twoHourPlan)}
    ${renderNumbered("高概率面试问题", prepFocused.prepFocus.likelyQuestions)}
  ` : moduleEmpty("准备重点", "生成后会展示：面试前 30 分钟、2 小时深度准备和高概率问题。");
  const coverFocused = moduleFocused("coverLetter");
  const coverSkill = job.analysisModules?.coverLetter?.coverLetter || job.coverLetterSkill;
  $("cover-letter").innerHTML = visible.coverLetter
    ? (coverSkill ? renderCoverLetterSkill(coverSkill) : `<div class="brief-item"><strong>Cover Letter 草稿</strong><pre style="white-space:pre-wrap;margin:8px 0 0;font:inherit;font-size:13px;line-height:1.65;color:var(--muted);">${escapeHtml(coverFocused.applicationMaterials?.coverLetter || "暂无")}</pre></div>`)
    : moduleEmpty("Cover Letter", "生成后会按渠道、JD、所选简历和已确认的到岗条件生成，并展示证据与取舍。");
  const introFocused = moduleFocused("selfIntroduction");
  const introSkill = job.analysisModules?.selfIntroduction?.selfIntroduction || job.selfIntroductionSkill;
  $("self-introduction").innerHTML = visible.selfIntroduction
    ? (introSkill ? renderSelfIntroductionSkill(introSkill, job.analysisModules?.selfIntroduction?.options || job.selfIntroOptions || {}) : `<div class="brief-item"><strong>自我介绍草稿</strong><pre style="white-space:pre-wrap;margin:8px 0 0;font:inherit;font-size:13px;line-height:1.65;color:var(--muted);">${escapeHtml(introFocused.applicationMaterials?.selfIntroduction || "暂无")}</pre></div>`)
    : moduleEmpty("自我介绍", "生成后会按面试场景、时长、岗位理解和当前简历生成一版可直接说出口的开场。");
  $("workflow-trace").textContent = JSON.stringify({
    job: {
      company: job.company,
      title: job.title,
      type: job.type,
      status: job.status
    },
    workflow: analysis.workflow || {},
    architecture: analysis.architecture || { type: "legacy", dynamicFunctionCalling: false },
    skillRegistry: SKILL_REGISTRY,
    trace: analysis.trace || [],
    focused
  }, null, 2);
  forceRenderArchivedModules(job);
  } catch (error) {
    const job = currentJob();
    const raw = job?.analysis ? JSON.stringify(job.analysis, null, 2) : "当前岗位还没有 analysis 数据。";
    $("analysis-results").classList.remove("hidden");
    $("workflow-summary").innerHTML = `<div class="empty">分析结果渲染失败：${escapeHtml(error.message)}。下面已显示原始结果，说明 API 是否真的返回了内容。</div>`;
    $("analysis-hero").innerHTML = "";
    $("job-understanding").innerHTML = `<div class="brief-item"><strong>渲染错误</strong><span class="muted">${escapeHtml(error.message)}</span></div>`;
    $("capability-requirements").innerHTML = `<div class="brief-item"><strong>原始分析结果</strong><pre style="white-space:pre-wrap;margin:8px 0 0;font:inherit;font-size:12px;line-height:1.55;color:var(--muted);max-height:320px;overflow:auto;">${escapeHtml(raw)}</pre></div>`;
    $("personal-strategy").innerHTML = moduleEmpty("匹配策略", "渲染失败，先查看上方原始分析结果。");
    $("prep-focus").innerHTML = moduleEmpty("准备重点", "渲染失败，先查看上方原始分析结果。");
    $("cover-letter").innerHTML = moduleEmpty("Cover Letter", "渲染失败，先查看上方原始分析结果。");
    $("self-introduction").innerHTML = moduleEmpty("自我介绍", "渲染失败，先查看上方原始分析结果。");
    $("workflow-trace").textContent = String(error.stack || error.message || error) + "\n\n" + raw;
  }
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map((item) => typeof item === "string" ? item : JSON.stringify(item));
  if (value === undefined || value === null || value === "") return [];
  if (typeof value === "string") {
    return value.split(/\n|；|;/).map((item) => item.replace(/^[-\d.\s、]+/, "").trim()).filter(Boolean);
  }
  return [String(value)];
}

function normalizeFocusedAnalysis(focused = {}) {
  return {
    summary: {
      roleType: focused.summary?.roleType || "岗位类型待判断",
      priority: focused.summary?.priority || "中",
      fitLevel: focused.summary?.fitLevel || "待判断",
      prepFocus: focused.summary?.prepFocus || "先补岗位业务理解和项目表达"
    },
    jobUnderstanding: {
      roleSummary: focused.jobUnderstanding?.roleSummary || "该岗位需要结合 JD 和公司业务进一步判断。",
      companyPositioning: focused.jobUnderstanding?.companyPositioning || "公司定位信息不足，需要结合官网和产品线补充。",
      businessContext: focused.jobUnderstanding?.businessContext || "业务背景信息不足，需要补充公司主营业务、目标用户和产品场景。",
      targetUsers: toArray(focused.jobUnderstanding?.targetUsers),
      likelyResponsibilities: toArray(focused.jobUnderstanding?.likelyResponsibilities)
    },
    capabilityRequirements: {
      mustHave: toArray(focused.capabilityRequirements?.mustHave),
      niceToHave: toArray(focused.capabilityRequirements?.niceToHave),
      hiddenExpectations: toArray(focused.capabilityRequirements?.hiddenExpectations)
    },
    personalStrategy: {
      mainProject: focused.personalStrategy?.mainProject || "待选择主讲项目",
      recommendedFraming: focused.personalStrategy?.recommendedFraming || "建议围绕岗位业务、个人项目和可验证结果组织表达。",
      advantages: toArray(focused.personalStrategy?.advantages),
      gaps: toArray(focused.personalStrategy?.gaps),
      avoidSaying: toArray(focused.personalStrategy?.avoidSaying)
    },
    prepFocus: {
      thirtyMinutePlan: toArray(focused.prepFocus?.thirtyMinutePlan),
      twoHourPlan: toArray(focused.prepFocus?.twoHourPlan),
      likelyQuestions: toArray(focused.prepFocus?.likelyQuestions)
    },
    applicationMaterials: {
      coverLetter: focused.applicationMaterials?.coverLetter || "",
      selfIntroduction: focused.applicationMaterials?.selfIntroduction || ""
    }
  };
}

function renderChips(items = []) {
  const filtered = toArray(items);
  if (!filtered.length) return `<div class="muted">暂无明显关键词</div>`;
  return `<div class="chip-list">${filtered.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("")}</div>`;
}

function renderNumbered(title, items = []) {
  const filtered = toArray(items);
  if (!filtered.length) {
    return `<div class="brief-item"><strong>${escapeHtml(title)}</strong><span class="muted">暂无</span></div>`;
  }
  return `<div class="brief-item"><strong>${escapeHtml(title)}</strong><ol class="compact-list">${filtered.map((item, index) => `<li><span class="number-dot">${index + 1}</span><span>${escapeHtml(item)}</span></li>`).join("")}</ol></div>`;
}

function splitLines(text = "") {
  return String(text || "")
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(\d+[\.\、)]|-|•)\s*/, "").trim())
    .filter(Boolean);
}

function buildReviewSuggestions(round = {}, rounds = []) {
  const questions = ensureReviewQuestions(round);
  const notes = round?.notes || "";
  const gaps = questions.map((item) => item.gap).filter(Boolean).join("；");
  const nextSteps = round?.nextSteps || "";
  const repeatedKeywords = ["业务", "数据", "项目", "指标", "用户", "AI", "Agent", "RAG"].filter((keyword) =>
    rounds.some((item) => `${item.questions || ""}\n${item.notes || ""}\n${item.gaps || ""}\n${(item.questionItems || []).map((question) => `${question.title} ${question.thinking} ${question.gap}`).join("\n")}`.includes(keyword))
  );
  return [
    ["问题密度", questions.length ? `当前批次记录了 ${questions.length} 个问题。建议每个问题都补齐“回答、思考、待补强、下次更好说法”。` : "还没有记录具体问题，先把面试官原话尽量写下来。"],
    ["暴露信号", gaps ? `你已经标记了待补强：${gaps.slice(0, 80)}` : (notes.includes("业务") ? "这轮已经暴露业务理解短板，下一轮前优先补公司业务链路和行业术语。" : "建议补充这轮真正卡住的地方，否则复盘会停留在感受层。")],
    ["重复主题", repeatedKeywords.length ? `多轮记录里反复出现：${repeatedKeywords.join("、")}。这些应该进入下一轮准备清单。` : "暂未形成高频主题，记录两轮以上后会更明显。"],
    ["下一步", nextSteps || "把待补强转成可执行动作，例如：重写 60 秒自我介绍、补一个项目 STAR、整理 5 个业务问题。"]
  ];
}

function renderInterviewFeedback(round) {
  const container = $("review-feedback-result");
  if (!container) return;
  const review = round?.aiReview;
  if (!review) {
    if (round?.feedbackAnalysis) {
      container.innerHTML = `<div class="feedback-result"><strong>已保留旧版面试分析</strong><p class="muted">旧结果不会丢失，但它不具备逐题评分、准备快照和复盘历史。点击上方“运行本轮面试复盘”可生成新版结果。</p></div>`;
      return;
    }
    container.innerHTML = "";
    return;
  }
  if (review.status === "needs_clarification") {
    container.innerHTML = `<div class="feedback-result"><strong>还需要补充面试内容</strong>${renderNumbered("请补充", review.blockingQuestions || [])}</div>`;
    return;
  }
  const metrics = review.preparationAudit?.metrics || {};
  const coverage = metrics.preparationCoveragePct;
  const statusLabels = { prepared: "已准备", partial: "部分准备", missed: "未覆盖", unassessable: "不可评估" };
  const questionReviews = (review.questionReviews || []).map((item, index) => {
    const isReverseQuestion = item.questionerRole === "候选人" || item.interviewSection === "反问";
    const scoreLine = isReverseQuestion
      ? `${statusLabels[item.preparationStatus] || item.preparationStatus} · 候选人反问 · ${item.rawAnswer ? "已记录面试官回答" : "未记录面试官回答"}`
      : `${statusLabels[item.preparationStatus] || item.preparationStatus} · 回答 ${item.answerScore ?? "未记录"}/4 · 证据 ${item.evidenceScore ?? "不适用"}/4`;
    return `<article class="feedback-block">
      <strong>${index + 1}. ${escapeHtml(item.rawQuestion)}</strong>
      <span class="muted">${escapeHtml(scoreLine)}</span>
      <p><b>${isReverseQuestion ? "反问信号" : "推断意图"}：</b>${escapeHtml(item.interviewerIntent?.text || "")}</p>
      ${isReverseQuestion && item.rawAnswer ? `<p><b>面试官回答：</b>${escapeHtml(item.rawAnswer)}</p>` : ""}
      <p><b>主要缺口：</b>${escapeHtml(item.mainGap || "")}</p>
      <details><summary>${isReverseQuestion ? "优化反问" : "改进回答与追问"}</summary><p>${escapeHtml(item.improvedAnswer || "")}</p>${renderCompactList(item.followUpQuestions || [])}</details>
    </article>`;
  }).join("");
  const nextActions = [...(review.nextRoundPlan?.evidenceTasks || []), ...(review.nextRoundPlan?.knowledgeTasks || []), ...(review.nextRoundPlan?.rehearsalTasks || [])];
  container.innerHTML = `<section class="feedback-result">
    <div class="feedback-result-head"><div><h3>本轮面试复盘</h3><p class="muted">面试官问题评估候选人作答；候选人反问单独沉淀岗位信号，不计入回答分。</p></div><span class="tag green">准备覆盖 ${coverage === null || coverage === undefined ? "不可评估" : `${coverage}%`}</span></div>
    <div class="feedback-columns">
      <div class="feedback-block"><strong>三条结论</strong>${renderCompactList(review.summary?.threeConclusions || [])}</div>
      <div class="feedback-block"><strong>岗位认知更新</strong>${renderCompactList(review.roleInsights?.newSignals || [])}</div>
      <div class="feedback-block"><strong>准备审计</strong><span class="muted">直接命中 ${metrics.directPreparationHitRatePct ?? "不可评估"}% · 回答均分 ${metrics.averageAnswerScore ?? "未记录"} · 证据均分 ${metrics.averageEvidenceScore ?? "未记录"}</span>${renderCompactList(review.preparationAudit?.missedTopics || [])}</div>
      <div class="feedback-block"><strong>下一轮作战单</strong>${renderCompactList(nextActions)}</div>
    </div>
    <h3 style="margin-top:18px;">逐题复盘</h3><div class="feedback-columns">${questionReviews}</div>
    <div class="feedback-columns" style="margin-top:14px;">
      <div class="feedback-block"><strong>CareerPilot 产品学习</strong>${renderCompactList([...(review.careerpilotLearning?.analysisImprovements || []), ...(review.careerpilotLearning?.questionGenerationImprovements || [])])}</div>
      <div class="feedback-block"><strong>需要核实的事实</strong>${renderCompactList(uniqueReviewFacts(review))}</div>
    </div>
    <div class="actions" style="margin-top:14px;"><button data-open-feedback-trace="${escapeHtml(round.aiReviewRunId || "")}">查看本次 Skill 调用</button><span class="muted">复盘版本 ${(round.aiReviewHistory?.length || 0) + 1} · 对比置信度 ${escapeHtml(review.comparisonConfidence || "unassessable")}</span><button data-project-view="analysis">进入准备与材料</button></div>
  </section>`;
  container.querySelector("[data-open-feedback-trace]")?.addEventListener("click", (event) => {
    selectedTraceRunId = event.currentTarget.dataset.openFeedbackTrace;
    activate("traces");
    renderTraceHistory();
  });
  container.querySelector("[data-project-view]")?.addEventListener("click", () => activate("analysis"));
}

function uniqueReviewFacts(review) {
  return [...new Set((review.questionReviews || []).flatMap((item) => item.factsToVerify || []).filter(Boolean))];
}

function renderCompactList(items) {
  const values = (items || []).filter(Boolean);
  return values.length ? `<ul>${values.slice(0, 6).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<span class="muted">暂无</span>`;
}

function priorInterviewPredictions(job) {
  const priorRun = (state.traceHistory || []).find((run) => run.jobId === job.id && run.output?.riskDiagnoser?.likelyQuestions?.length);
  return priorRun?.output?.riskDiagnoser?.likelyQuestions || job.analysis?.riskQuestions || [];
}

function isSubstantiveReviewQuestion(item = {}) {
  return Boolean(item.title && !/^(问题\s*\d+|未命名问题)$/.test(item.title.trim()));
}

function reviewQuestionMetadata(item = {}) {
  const validCategories = ["简历面", "业务面", "行为面", "反问"];
  let questionerRole = item.questionerRole === "候选人" || item.category === "反问" ? "候选人" : "面试官";
  let category = validCategories.includes(item.category) ? item.category : "";
  const text = String(item.title || "");
  if (questionerRole === "候选人") category = "反问";
  if (!category) {
    if (/(?:自我介绍|简历|实习经历|项目|其中主要承担|负责的|做过什么|收益|成果|指标|冷启动|作品不可用)/i.test(text)) category = "简历面";
    else if (/(?:优势|缺点|评价一下自己|为什么.*三个月|实习时间|开学后|实习预期|冲突|压力|失败|分歧|协作|推进|主动性|稳定)/i.test(text)) category = "行为面";
    else category = "业务面";
  }
  if (category === "反问") questionerRole = "候选人";
  return { category, questionerRole };
}

function reviewRunContext(round, rounds = []) {
  const questions = ensureReviewQuestions(round).filter(isSubstantiveReviewQuestion);
  const answerCount = questions.filter((item) => item.answer?.trim()).length;
  const previousRoundCount = rounds.filter((item) => item.id !== round?.id && ensureReviewQuestions(item, false).some(isSubstantiveReviewQuestion)).length;
  return { questions, answerCount, previousRoundCount, hasSnapshot: Boolean(round?.preparationSnapshot) };
}

function buildInterviewReviewPayload(job, round, rounds = []) {
  const questions = ensureReviewQuestions(round).filter(isSubstantiveReviewQuestion);
  const previousRounds = rounds.filter((item) => item.id !== round.id && ensureReviewQuestions(item, false).some(isSubstantiveReviewQuestion));
  const mode = [questions.some((item) => item.answer) ? "full_review" : "quick_review", "careerpilot_evaluation", "next_round"];
  if (previousRounds.length) mode.push("cross_round");
  return {
    schemaVersion: "1.0",
    mode,
    job: {
      id: job.id,
      company: job.company,
      title: job.title,
      type: job.type,
      businessLine: job.businessLine || "",
      jdUrl: job.link || "",
      jd: job.jd,
      analysisContext: {
        analysis: job.analysis || {},
        analysisModules: job.analysisModules || {}
      }
    },
    candidate: profileForJob(job),
    priorPreparation: round.preparationSnapshot || {},
    interviewRound: {
      id: round.id,
      title: round.title,
      date: round.date,
      format: round.format,
      interviewer: round.interviewer,
      notes: round.notes || round.sourceDraft || "",
      preparationSnapshot: round.preparationSnapshot || {},
      sourceMaterial: {
        asset: round.sourceAsset || null,
        extraction: round.sourceExtraction || null,
        rawText: round.sourceDraft || ""
      },
      questionItems: questions.map((item) => ({
        id: item.id,
        title: item.title,
        answer: item.answer,
        thinking: item.thinking,
        gap: item.gap,
        nextAnswer: item.nextAnswer,
        rawQuestion: item.rawQuestion,
        beginTime: item.beginTime,
        endTime: item.endTime,
        ...reviewQuestionMetadata(item)
      }))
    },
    previousRounds: previousRounds.map((item) => ({
      id: item.id,
      title: item.title,
      date: item.date,
      questionItems: ensureReviewQuestions(item, false),
      aiReview: item.aiReview || null
    })),
    options: { outputLanguage: "zh-CN", preserveRawText: true, generateImprovedAnswers: true }
  };
}

function setReviewRunStatus(message, tone = "") {
  const status = $("review-run-status");
  if (!status) return;
  status.textContent = message;
  status.className = `review-run-status${tone ? ` ${tone}` : ""}`;
}

function renderReviewRunner(round, rounds) {
  const readiness = $("review-readiness");
  const modes = $("review-mode-list");
  const inputGrid = $("review-skill-input-grid");
  const button = $("analyze-review");
  if (!readiness || !modes || !inputGrid || !button || !round) return;
  const job = currentJob();
  const context = reviewRunContext(round, rounds);
  const payload = buildInterviewReviewPayload(job, round, rounds);
  const resumeChars = String(payload.candidate.resume || "").length;
  const jdChars = String(payload.job.jd || "").length;
  const transcriptChars = String(payload.interviewRound.sourceMaterial.rawText || "").length;
  const categoryCounts = payload.interviewRound.questionItems.reduce((counts, item) => {
    counts[item.category] = (counts[item.category] || 0) + 1;
    return counts;
  }, {});
  const categorySummary = ["简历面", "业务面", "行为面", "反问"]
    .filter((category) => categoryCounts[category])
    .map((category) => `${category} ${categoryCounts[category]}`)
    .join(" / ");
  const hasJobAnalysis = Boolean(
    Object.keys(payload.job.analysisContext.analysis || {}).length
    || Object.keys(payload.priorPreparation?.analysis || {}).length
  );
  readiness.innerHTML = [
    [true, true, "岗位与轮次已选择"],
    [Boolean(round.sourceAsset), false, round.sourceAsset ? `已保存原始${round.sourceAsset.sourceType === "audio" ? "音频" : "文档"}` : "建议上传 Word 或音频"],
    [context.questions.length > 0, true, context.questions.length ? `${context.questions.length} 个真实问题` : "还需 1 个真实问题"],
    [context.answerCount > 0, false, context.answerCount ? `${context.answerCount} 个回答已记录` : "回答可稍后补充"],
    [context.hasSnapshot, false, context.hasSnapshot ? "准备快照已保留" : "运行时自动保存准备快照"]
  ].map(([ready, required, label]) => `<span class="readiness-item ${ready ? "ready" : ""} ${required ? "required" : ""}">${escapeHtml(label)}</span>`).join("");
  const modeLabels = [context.answerCount ? "完整逐题复盘" : "快速问题复盘", "准备效果评测", "下一轮行动"];
  if (context.previousRoundCount) modeLabels.push(`对比此前 ${context.previousRoundCount} 轮`);
  modes.innerHTML = modeLabels.map((label) => `<span class="review-mode">${escapeHtml(label)}</span>`).join("");
  inputGrid.innerHTML = [
    ["本轮问题与回答", `${context.questions.length} 个问题 · ${context.answerCount} 个已有回答${categorySummary ? ` · ${categorySummary}` : ""}${transcriptChars ? ` · 转写 ${transcriptChars} 字` : ""}`, "interviewRound.questionItems + sourceMaterial"],
    ["岗位与 JD 分析", `${job.company || "未填写公司"} / ${job.title || "未填写岗位"} · JD ${jdChars} 字 · ${hasJobAnalysis ? "已带入历史分析" : "暂无历史分析"}`, "job + priorPreparation.analysis"],
    ["候选人资料", `${payload.candidate.activeResumeName || "当前简历"} · 简历正文 ${resumeChars} 字`, "candidate"],
    ["准备快照与历史轮次", `${context.hasSnapshot ? "已带入面试前准备快照" : "运行时生成准备快照"} · 此前 ${context.previousRoundCount} 轮`, "priorPreparation + previousRounds"]
  ].map(([title, text, field]) => `<div class="review-skill-input-item"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span><code>${escapeHtml(field)}</code></div>`).join("");
  button.disabled = false;
  button.textContent = context.previousRoundCount ? "运行复盘并对比多轮" : "运行本轮面试复盘";
  setReviewRunStatus(context.questions.length ? `输入已就绪；回答不是必填，可直接运行。` : "点击运行后，我会带你定位还缺的内容。");
}

function guideToMissingReviewInput() {
  setReviewRunStatus("还不能运行：请先填写至少一个真实的面试问题。", "error");
  const input = $("review-question-title");
  input?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  window.setTimeout(() => input?.focus(), 250);
  showToast("请先记录一个真实面试问题；回答可以暂时不填");
}

function startReviewRunStages() {
  const stages = ["正在整理真实问题…", "正在逐题诊断回答与证据…", "正在对照面试前准备…", "正在生成下一轮作战单…"];
  let index = 0;
  setReviewRunStatus(stages[index]);
  clearInterval(reviewRunStageTimer);
  reviewRunStageTimer = window.setInterval(() => {
    index = Math.min(index + 1, stages.length - 1);
    setReviewRunStatus(stages[index]);
  }, 900);
}

async function analyzeCurrentInterview() {
  const job = currentJob();
  if (!job) return;
  const round = syncReviewFormToRound(job);
  const questions = ensureReviewQuestions(round).filter(isSubstantiveReviewQuestion);
  if (!questions.length) return guideToMissingReviewInput();
  if (!round.preparationSnapshot) {
    round.preparationSnapshot = preparationSnapshotForJob(job, "first-review");
    persist();
  }
  const button = $("analyze-review");
  button.disabled = true;
  button.textContent = "正在运行复盘…";
  startReviewRunStages();
  try {
    const payload = buildInterviewReviewPayload(job, round, ensureReviewRounds(job));
    const response = await fetch("/api/review-interview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `复盘分析失败：${response.status}`);
    const review = data.review || data.output?.interviewRetrospective;
    if (!review) throw new Error("复盘接口没有返回 interview-retrospective 结果");
    if (round.aiReview) round.aiReviewHistory = [...(round.aiReviewHistory || []), round.aiReview];
    round.aiReview = review;
    round.aiReviewRunId = data.runId;
    const nextActions = [...(review.nextRoundPlan?.evidenceTasks || []), ...(review.nextRoundPlan?.knowledgeTasks || []), ...(review.nextRoundPlan?.rehearsalTasks || [])];
    if (nextActions.length) round.nextSteps = nextActions.join("\n");
    job.interviewLearning = {
      updatedAt: new Date().toISOString(),
      latestRoundId: round.id,
      latestSignals: review.roleInsights?.newSignals || [],
      candidateGaps: review.summary?.topGaps || [],
      nextRoundActions: nextActions,
      productLearning: review.careerpilotLearning || {},
      crossRoundSynthesis: review.crossRoundSynthesis || null
    };
    state.skillRun = { ...data, jobId: job.id, jobLabel: `${job.company} - ${job.title}`, executedAt: new Date().toISOString() };
    archiveTraceRun(state.skillRun);
    persist();
    renderInterview();
    renderSkills();
    setReviewRunStatus(`复盘完成，已保存为版本 ${(round.aiReviewHistory?.length || 0) + 1}。`, "success");
    window.setTimeout(() => $("review-feedback-result")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }), 120);
    showToast("复盘完成，已保存逐题诊断、准备评测和下一轮作战单");
  } catch (error) {
    setReviewRunStatus(`运行失败：${error.message}`, "error");
    showToast(error.message);
  } finally {
    clearInterval(reviewRunStageTimer);
    reviewRunStageTimer = null;
    const currentButton = $("analyze-review");
    if (currentButton) currentButton.disabled = false;
  }
}

function renderInterview() {
  const job = currentJob();
  if (!job) return;
  const allRounds = ensureReviewRounds(job);
  const rounds = visibleReviewRounds(job);
  if (!selectedReviewRoundId || !rounds.some((item) => item.id === selectedReviewRoundId)) selectedReviewRoundId = rounds[0]?.id || null;
  const round = rounds.find((item) => item.id === selectedReviewRoundId) || rounds[0];
  $("review-job-select").innerHTML = state.jobs.map((item) => `<option value="${item.id}" ${item.id === selectedJobId ? "selected" : ""}>${escapeHtml(item.company)} - ${escapeHtml(item.title)}</option>`).join("");
  if ($("review-job-shortcut")) $("review-job-shortcut").innerHTML = $("review-job-select").innerHTML;
  $("review-round-select").innerHTML = rounds.map((item, index) => `<option value="${item.id}" ${item.id === round?.id ? "selected" : ""}>${escapeHtml(reviewRoundDisplayTitle(item, index))}</option>`).join("");
  if ($("review-round-count")) {
    const recordedCount = allRounds.filter(isMeaningfulReviewRound).length;
    $("review-round-count").textContent = `${recordedCount} 轮`;
  }
  if ($("review-round-tabs")) {
    $("review-round-tabs").innerHTML = rounds.map((item, index) => {
      const questions = ensureReviewQuestions(item, false).filter(isSubstantiveReviewQuestion);
      const status = item.aiReview ? "已分析" : isMeaningfulReviewRound(item) ? "已记录" : "待补充";
      return `<button class="${item.id === round?.id ? "active" : ""}" data-review-round-tab="${item.id}"><strong>${escapeHtml(reviewRoundDisplayTitle(item, index))}</strong><span>${questions.length} 题 · ${status}</span></button>`;
    }).join("");
    $("review-round-tabs").querySelectorAll("[data-review-round-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        syncReviewFormToRound(job);
        persist();
        selectedReviewRoundId = button.dataset.reviewRoundTab;
        selectedReviewQuestionId = null;
        renderInterview();
      });
    });
  }
  $("review-round-list").innerHTML = rounds.map((item) => {
    const index = rounds.indexOf(item);
    const questionCount = ensureReviewQuestions(item, item.id === round?.id).filter(isSubstantiveReviewQuestion).length;
    const gapCount = ensureReviewQuestions(item, item.id === round?.id).filter((question) => question.gap).length;
    const meta = [item.date ? formatDate(item.date) : "未记录时间", item.format, item.interviewer].filter(Boolean).join(" · ");
    return `<div class="review-item ${item.id === round?.id ? "active" : ""}" data-review-round="${item.id}">
      <div class="review-item-head"><div><strong>${escapeHtml(reviewRoundDisplayTitle(item, index))}</strong><small>${escapeHtml(meta || "暂无轮次信息")}</small></div><span class="tag blue">${questionCount} 题</span></div>
      <small>${escapeHtml(gapCount ? `${gapCount} 个问题待补强` : (item.nextSteps ? `下一步：${item.nextSteps.slice(0, 34)}` : "暂无补强动作"))}</small>
    </div>`;
  }).join("");
  $("review-round-title").value = round ? reviewRoundDisplayTitle(round, Math.max(0, rounds.findIndex((item) => item.id === round.id))) : "";
  $("review-round-date").value = round?.date || "";
  $("review-round-format").value = round?.format || "";
  $("review-round-interviewer").value = round?.interviewer || "";
  $("review-source-draft").value = round?.sourceDraft || "";
  $("review-notes").value = round?.notes || "";
  $("review-next-steps").value = round?.nextSteps || "";
  const audioDrop = $("review-source-drop");
  const audioPreview = $("review-audio-preview");
  const audioStatus = $("review-source-status");
  if (audioDrop && audioPreview && audioStatus) {
    const source = round?.sourceAsset || (round?.audio ? { ...round.audio, sourceType: "audio", url: round.audio.previewUrl } : null);
    const extraction = round?.sourceExtraction;
    audioDrop.classList.toggle("has-source", Boolean(source));
    audioDrop.classList.toggle("has-audio", source?.sourceType === "audio" && Boolean(source?.url));
    audioPreview.src = round?.audio?.previewUrl || "";
    if (!source) audioStatus.textContent = apiHealth?.audioTranscription?.available === false
      ? "Word 可直接提取；音频转写需先配置 ASR 服务密钥。单文件不超过 25 MiB"
      : apiHealth?.audioTranscription?.diarization
        ? "支持 Word 或音频；音频将自动区分面试官与候选人，单文件不超过 25 MiB"
        : "支持 Word（.docx）或音频（mp3、m4a、wav、webm），单文件不超过 25 MiB";
    else if (extraction?.status === "extracted") audioStatus.textContent = `${source.fileName} · 已提取 ${extraction.charCount || 0} 字 · 请校对后运行`;
    else audioStatus.textContent = extraction?.message || `${source.fileName} 已保存，等待提取`;
  }
  const extractAudioButton = $("extract-audio-questions");
  if (extractAudioButton) {
    const hasAudioTranscript = Boolean(round?.sourceDraft?.trim())
      && (round?.sourceAsset?.sourceType === "audio" || Boolean(round?.audio));
    extractAudioButton.disabled = !hasAudioTranscript;
    extractAudioButton.title = hasAudioTranscript
      ? "基于当前音频转写重新识别并优化面试官问题"
      : "请先上传并完成音频转写";
  }
  const extractWordButton = $("extract-word-questions");
  if (extractWordButton) {
    const hasWordTranscript = Boolean(round?.sourceDraft?.trim())
      && round?.sourceAsset?.sourceType === "document";
    extractWordButton.disabled = !hasWordTranscript;
    extractWordButton.title = hasWordTranscript
      ? "基于当前 Word 提取文本重新识别并分类问题"
      : "请先上传并完成 Word 正文提取";
  }
  const questions = visibleReviewQuestions(round);
  const currentQuestion = currentReviewQuestion(round);
  const categoryOrder = ["简历面", "业务面", "行为面", "反问"];
  $("review-question-list").innerHTML = categoryOrder.map((category) => {
    const categoryQuestions = questions.filter((item) => reviewQuestionMetadata(item).category === category);
    if (!categoryQuestions.length) return "";
    const cards = categoryQuestions.map((item) => {
      const index = questions.indexOf(item);
      const metadata = reviewQuestionMetadata(item);
      const filled = [item.answer, item.thinking, item.gap, item.nextAnswer].filter(Boolean).length;
      return `<div class="review-item ${item.id === currentQuestion?.id ? "active" : ""}" data-review-question="${item.id}">
        <div class="review-item-head"><div><strong>问题 ${index + 1}</strong><small>${escapeHtml(item.title || "未命名问题")}</small></div><span class="tag ${filled >= 3 ? "green" : "blue"}">${filled}/4</span></div>
        <small>${escapeHtml(metadata.questionerRole === "候选人" ? (item.answer ? `面试官回答：${item.answer.slice(0, 36)}` : "等待补充面试官回答") : (item.gap ? `待补强：${item.gap.slice(0, 36)}` : "尚未填写待补强"))}</small>
      </div>`;
    }).join("");
    return `<section class="review-question-group"><div class="review-question-group-title"><strong>${category}</strong><span>${categoryQuestions.length} 题</span></div>${cards}</section>`;
  }).join("");
  const currentMetadata = reviewQuestionMetadata(currentQuestion || {});
  $("review-question-title").value = currentQuestion?.title || "";
  $("review-question-category").value = currentMetadata.category;
  $("review-questioner-role").value = currentMetadata.questionerRole;
  $("review-question-answer").value = currentQuestion?.answer || "";
  $("review-answer-label").textContent = currentMetadata.questionerRole === "候选人" ? "面试官的回答" : "候选人的真实回答";
  $("review-question-answer").placeholder = currentMetadata.questionerRole === "候选人"
    ? "尽量还原面试官对该反问的真实回答。"
    : "尽量还原面试现场的回答，不要事后美化。";
  $("review-question-thinking").value = currentQuestion?.thinking || "";
  $("review-question-gap").value = currentQuestion?.gap || "";
  $("review-question-next-answer").value = currentQuestion?.nextAnswer || "";
  const allQuestions = rounds.flatMap((item) => ensureReviewQuestions(item, item.id === round?.id).filter(isSubstantiveReviewQuestion));
  const currentQuestions = questions;
  const gapCount = currentQuestions.filter((item) => item.gap).length;
  const suggestion = buildReviewSuggestions(round, rounds)[1]?.[1] || "继续补充问题和复盘。";
  $("review-overview").innerHTML = [
    ["当前轮次", reviewRoundDisplayTitle(round, Math.max(0, rounds.findIndex((item) => item.id === round?.id)))],
    ["本轮问题", `${currentQuestions.filter(isSubstantiveReviewQuestion).length} 个`],
    ["本轮待补强", `${gapCount} 项`],
    ["当前状态", round?.aiReview ? "已完成分析" : isMeaningfulReviewRound(round) ? "材料已记录" : "等待上传材料"]
  ].map(([title, text]) => `<div class="review-stat"><span>${escapeHtml(title)}</span><strong>${escapeHtml(text)}</strong></div>`).join("");
  renderReviewRunner(round, rounds);
  renderInterviewFeedback(round);
  document.querySelectorAll("[data-review-round]").forEach((item) => {
    item.addEventListener("click", () => {
      syncReviewFormToRound(job);
      persist();
      selectedReviewRoundId = item.dataset.reviewRound;
      selectedReviewQuestionId = null;
      renderInterview();
    });
  });
  document.querySelectorAll("[data-review-question]").forEach((item) => {
    item.addEventListener("click", () => {
      syncReviewQuestionFormToItem(round);
      syncReviewFormToRound(job);
      persist();
      selectedReviewQuestionId = item.dataset.reviewQuestion;
      renderInterview();
    });
  });
}

async function runAnalysisFlow() {
  saveJobFromForm({ render: false, toast: false });
  startAnalysisProgress();
  const job = currentJob();
  try {
    showToast("Planner 正在编排 Skill，岗位理解将调用模型...");
    await analyzeJobWithApi(job);
  } catch (error) {
    analyzeJob(job);
    ["jobUnderstanding", "capabilityRequirements", "personalStrategy", "prepFocus"].forEach((key) => archiveAnalysisModule(job, key));
    persist();
    finishAnalysisProgress(false);
    renderAnalysis();
    forceRenderArchivedModules(job);
    showToast(`模型链路失败，已明确切换为本地兜底：${error.message}`);
    return;
  }
  try {
    persist();
    finishAnalysisProgress(true);
    renderAnalysis();
    forceRenderArchivedModules(job);
    showToast(`分析完成：${job.analysis?.architecture?.plan?.length || 0} 个 Skill，模型调用 ${job.analysis?.architecture?.modelCallCount || 0} 次`);
  } catch (error) {
    finishAnalysisProgress(true);
    showToast(`API 已返回，但页面保存/渲染失败：${error.message}`);
  }
}

async function generateAnalysisModule(key) {
  const job = currentJob();
  if (!job) return;
  saveJobFromForm({ render: false, toast: false });
  startModuleProgress(key);
  try {
    if (key === "jobUnderstanding") {
      await analyzeRoleUnderstandingWithApi(job);
    } else if (key === "coverLetter") {
      await analyzeCoverLetterWithApi(job);
    } else if (key === "selfIntroduction") {
      await analyzeSelfIntroductionWithApi(job);
    } else {
      await analyzeJobWithApi(job);
    }
  } catch (error) {
    if (key === "jobUnderstanding") {
      analyzeJob(job);
    } else if (key === "coverLetter") {
      const options = getCoverLetterOptions(job);
      const skill = buildLocalCoverLetterSkill(job, options);
      job.coverLetterSkill = skill;
      job.coverLetterOptions = options;
      const focused = normalizeFocusedAnalysis(job.analysis?.focused || {});
      focused.applicationMaterials.coverLetter = skill.status === "success"
        ? skill.recommended
        : `生成前需补充：${toArray(skill.blockingQuestions).join("；")}`;
      job.analysis = {
        ...(job.analysis || {}),
        generatedAt: new Date().toISOString(),
        provider: "local",
        score: job.analysis?.score || 0,
        focused
      };
    } else if (key === "selfIntroduction") {
      const skill = buildLocalSelfIntroductionSkill(job);
      job.selfIntroductionSkill = skill;
      job.selfIntroOptions = getSelfIntroOptions(job);
      const focused = normalizeFocusedAnalysis(job.analysis?.focused || {});
      focused.applicationMaterials.selfIntroduction = selfIntroductionScript(skill, job.selfIntroOptions);
      job.analysis = {
        ...(job.analysis || {}),
        generatedAt: new Date().toISOString(),
        provider: "local",
        score: job.analysis?.score || 0,
        focused
      };
    } else {
      analyzeJob(job);
    }
    archiveAnalysisModule(job, key);
    persist();
    moduleRunningKey = null;
    forceRenderAnalysisModule(key, job);
    forceRenderArchivedModules(job);
    finishModuleProgress(key, "已用本地兜底生成");
    showToast(`API 请求失败，已用本地兜底：${error.message}`);
    return;
  }
  try {
    archiveAnalysisModule(job, key);
    persist();
    moduleRunningKey = null;
    forceRenderAnalysisModule(key, job);
    forceRenderArchivedModules(job);
    finishModuleProgress(key, "生成完成");
    showToast(`${analysisModuleMeta[key]}已生成`);
  } catch (error) {
    finishModuleProgress(key, "API 已返回");
    showToast(`API 已返回，但页面保存/渲染失败：${error.message}`);
  }
}

function render() {
  renderQuickStart();
  renderDashboard();
  renderJobList();
  renderJobForm();
  renderProfile();
  renderAnalysis();
  renderSkills();
  renderEvals();
  renderInterview();
}

function formatDate(value) {
  if (!value) return "暂无时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function jobUpdatedTime(job = {}) {
  const archivedTimes = Object.values(job.analysisModules || {}).map((item) => item?.generatedAt || item?.analysis?.generatedAt).filter(Boolean).sort();
  const archivedAt = archivedTimes[archivedTimes.length - 1];
  const candidates = [
    job.updatedAt,
    job.interviewLearning?.updatedAt,
    job.review?.updatedAt,
    archivedAt,
    job.analysis?.generatedAt,
    job.createdAt,
    job.date
  ];
  const value = candidates.map((item) => new Date(item || "").getTime()).find((time) => Number.isFinite(time));
  return value || 0;
}

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => activate(button.dataset.tab));
});
document.querySelectorAll("[data-jump]").forEach((button) => {
  button.addEventListener("click", () => activate(button.dataset.jump));
});
document.querySelectorAll("[data-project-view]").forEach((button) => {
  button.addEventListener("click", () => activate(button.dataset.projectView));
});
document.querySelectorAll("[data-project-panel]").forEach((button) => {
  button.addEventListener("click", () => setProjectPanel(button.dataset.projectPanel));
});
document.querySelectorAll("[data-project-panel-target]").forEach((button) => {
  button.addEventListener("click", () => {
    setProjectPanel(button.dataset.projectPanelTarget);
    if (button.dataset.projectPanelTarget === "preparation") renderProjectPreparation(currentJob());
    if (button.dataset.projectPanelTarget === "interviews") renderProjectInterviewTimeline(currentJob());
  });
});
document.querySelectorAll("[data-project-prep]").forEach((button) => {
  button.addEventListener("click", () => {
    currentProjectPrepSection = button.dataset.projectPrep;
    renderProjectPreparation(currentJob());
  });
});
$("top-new-job").addEventListener("click", newJob);
$("new-job").addEventListener("click", newJob);
$("save-job").addEventListener("click", saveJobFromForm);
$("delete-job").addEventListener("click", deleteJob);
$("delete-job-overview")?.addEventListener("click", deleteJob);
$("project-add-interview")?.addEventListener("click", () => {
  const round = addReviewRound();
  if (!round) return;
  setProjectPanel("interviews");
  renderProjectOverview(currentJob());
  renderProjectInterviewTimeline(currentJob());
});
$("add-dashboard-todo")?.addEventListener("click", addDashboardTodo);
$("dashboard-new-todo")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") addDashboardTodo();
});
$("start-analysis").addEventListener("click", runAnalysisFlow);
document.querySelectorAll("[data-generate-module]").forEach((button) => {
  button.addEventListener("click", () => generateAnalysisModule(button.dataset.generateModule));
});
$("save-analysis").addEventListener("click", () => {
  const job = currentJob();
  analyzeJob(job);
  archiveAllAnalysisModules(job);
  persist();
  render();
  showToast("分析结果已保存");
});
$("copy-trace").addEventListener("click", async () => {
  const text = $("workflow-trace").textContent;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showToast("工作流 JSON 已复制");
  } catch (error) {
    showToast("复制失败，可以手动选中复制");
  }
});
document.addEventListener("click", async (event) => {
  const button = event.target.closest?.("[data-copy-cover-version]");
  if (!button) return;
  const job = currentJob();
  const skill = job?.analysisModules?.coverLetter?.coverLetter || job?.coverLetterSkill;
  const text = skill?.[button.dataset.copyCoverVersion] || "";
  if (!text) return showToast("当前版本没有可复制内容");
  try {
    await navigator.clipboard.writeText(text);
    showToast("Cover Letter 已复制");
  } catch (error) {
    showToast("复制失败，可以手动选中复制");
  }
});
$("run-offline-eval").addEventListener("click", runOfflineEval);
$("quick-task-grid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-quick-task]");
  if (!button) return;
  const task = button.dataset.quickTask;
  if (quickTaskSelection.has(task)) quickTaskSelection.delete(task);
  else quickTaskSelection.add(task);
  renderQuickStart();
});
$("quick-upload-trigger").addEventListener("click", () => $("quick-resume-file").click());
$("quick-resume-file").addEventListener("change", (event) => loadQuickResumeFile(event.target.files[0]));
$("quick-resume-select").addEventListener("change", (event) => {
  quickSelectedResumeId = event.target.value;
  quickResumeFileName = "";
  quickResumeFileAssetId = "";
  $("quick-resume").value = "";
  $("quick-resume").closest("details").open = false;
  invalidateQuickContext();
});
$("quick-recognize").addEventListener("click", prepareQuickContext);
$("quick-company").addEventListener("input", invalidateQuickContext);
$("quick-jd").addEventListener("input", invalidateQuickContext);
$("quick-resume").addEventListener("input", invalidateQuickContext);
bindRoleCascade("quick", invalidateQuickContext);
bindRoleCascade("job");
$("quick-start-task").addEventListener("click", startQuickTask);
$("run-skill-task").addEventListener("click", runSkillTask);
document.querySelectorAll("[data-assistant-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    $("skill-task-query").value = button.dataset.assistantPrompt;
    $("skill-task-query").focus();
  });
});
$("skill-job-select").addEventListener("change", (event) => {
  const job = state.jobs.find((item) => item.id === event.target.value);
  const profile = job ? profileForJob(job) : {};
  $("assistant-context").innerHTML = `<div><span>当前岗位</span><strong>${escapeHtml(job ? `${job.company} - ${job.title}` : "尚未选择")}</strong></div><div><span>使用资料</span><strong>${escapeHtml(profile.activeResumeName || profile.resumeFileName || "默认简历")}</strong></div>`;
});
$("skill-run-result").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-open-trace]");
  if (!button) return;
  selectedTraceRunId = button.dataset.openTrace;
  activate("traces");
  renderTraceHistory();
});
$("trace-history-list").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-trace-run-id]");
  if (!button) return;
  selectedTraceRunId = button.dataset.traceRunId;
  renderTraceHistory();
});
$("trace-status-filter").addEventListener("change", renderTraceHistory);
$("export-trace").addEventListener("click", exportSelectedTrace);
$("clear-traces").addEventListener("click", () => {
  if (!(state.traceHistory || []).length) return showToast("没有可清理的 Trace");
  if (!confirm("确认清空本机保存的全部 Trace 历史？岗位和简历数据不会被删除。")) return;
  state.traceHistory = [];
  state.skillRun = null;
  selectedTraceRunId = null;
  persist();
  renderSkills();
  showToast("Trace 历史已清空");
});
$("save-profile").addEventListener("click", saveProfile);
document.querySelectorAll("[data-save-profile]").forEach((button) => button.addEventListener("click", saveProfile));
$("new-resume-version").addEventListener("click", saveAsNewResumeVersion);
$("save-review").addEventListener("click", saveReview);
$("analyze-review").addEventListener("click", analyzeCurrentInterview);
["review-question-title", "review-question-answer"].forEach((id) => {
  $(id)?.addEventListener("input", () => {
    const round = currentReviewRound();
    if (!round) return;
    syncReviewQuestionFormToItem(round);
    renderReviewRunner(round, ensureReviewRounds(currentJob()));
  });
});
$("review-question-category").addEventListener("change", (event) => {
  const round = currentReviewRound();
  const question = currentReviewQuestion(round);
  if (!question) return;
  question.category = event.target.value;
  question.questionerRole = question.category === "反问" ? "候选人" : "面试官";
  question.updatedAt = new Date().toISOString();
  persist();
  renderInterview();
});
$("review-questioner-role").addEventListener("change", (event) => {
  const round = currentReviewRound();
  const question = currentReviewQuestion(round);
  if (!question) return;
  question.questionerRole = event.target.value;
  if (question.questionerRole === "候选人") question.category = "反问";
  else if (question.category === "反问") question.category = "业务面";
  question.updatedAt = new Date().toISOString();
  persist();
  renderInterview();
});
$("new-review-round").addEventListener("click", () => addReviewRound());
$("add-next-review-round")?.addEventListener("click", () => addReviewRound());
document.querySelectorAll("[data-add-round]").forEach((button) => {
  button.addEventListener("click", () => addReviewRound(button.dataset.addRound));
});
$("delete-review-round").addEventListener("click", deleteReviewRound);
$("new-review-question").addEventListener("click", addReviewQuestion);
$("delete-review-question").addEventListener("click", deleteReviewQuestion);
$("extract-review-draft").addEventListener("click", () => reextractReviewDraft());
$("extract-audio-questions").addEventListener("click", extractQuestionsFromAudioTranscript);
$("extract-word-questions").addEventListener("click", extractQuestionsFromWordTranscript);
$("review-source-trigger").addEventListener("click", () => {
  const input = $("review-source-file");
  input.accept = ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  input.click();
});
$("review-audio-trigger")?.addEventListener("click", () => {
  const input = $("review-source-file");
  input.accept = "audio/*,.mp3,.m4a,.wav,.webm";
  input.click();
});
$("review-source-file").addEventListener("change", (event) => {
  loadReviewSourceFile(event.target.files[0]);
  event.target.value = "";
});
$("review-job-select").addEventListener("change", (event) => {
  syncReviewFormToRound(currentJob());
  persist();
  selectedReviewRoundId = null;
  selectJob(event.target.value, "interview");
});
$("review-job-shortcut")?.addEventListener("change", (event) => {
  syncReviewFormToRound(currentJob());
  persist();
  selectedReviewRoundId = null;
  selectJob(event.target.value, "interview");
});
$("review-round-select").addEventListener("change", (event) => {
  syncReviewFormToRound(currentJob());
  persist();
  selectedReviewRoundId = event.target.value;
  selectedReviewQuestionId = null;
  renderInterview();
});
$("parse-jd-fields").addEventListener("click", () => applyJDInference(true));
$("job-jd").addEventListener("paste", () => {
  window.setTimeout(() => applyJDInference(false), 80);
});
$("job-jd").addEventListener("input", () => {
  window.clearTimeout(window.jdInferTimer);
  window.jdInferTimer = window.setTimeout(() => applyJDInference(false), 500);
});
$("jd-image-file").addEventListener("change", (event) => {
  handleJDImageUpload(event.target.files[0]);
});
$("job-resume").addEventListener("change", (event) => {
  bindResumeToCurrentJob(event.target.value);
});
$("job-bound-resume-select").addEventListener("change", (event) => {
  bindResumeToCurrentJob(event.target.value);
});
$("upload-trigger").addEventListener("click", () => $("resume-file").click());
$("resume-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  ensureResumeLibrary();
  const id = crypto.randomUUID();
  const resume = {
    id,
    name: file.name.replace(/\.[^.]+$/, "") || `简历版本 ${state.profile.resumes.length + 1}`,
    resume: "",
    projects: "",
    fileName: file.name,
    fileType: file.type || file.name.split(".").pop(),
    previewText: "",
    previewKind: "",
    previewUrl: "",
    parseStatus: "pending",
    parsedCharCount: 0
  };
  state.profile.resumes.push(resume);
  state.profile.activeResumeId = id;
  resume.fileName = file.name;
  resume.fileType = file.type || file.name.split(".").pop();
  resume.previewText = "";
  resume.previewKind = "";
  resume.previewUrl = "";
  state.profile.resumeFileName = file.name;
  state.profile.resumeFileType = resume.fileType;
  resume.projects = $("profile-projects").value.trim();
  persist();
  render();
  if (file.name.match(/\.(txt|md)$/i)) {
    const text = await file.text();
    const asset = await storeUploadedFile(file, "resume", id);
    resume.fileAssetId = asset.id;
    resume.previewUrl = `/api/data/file/${asset.id}`;
    resume.previewText = text;
    resume.resume = text;
    resume.parseStatus = "parsed";
    resume.parsedCharCount = text.length;
    $("profile-resume").value = text;
    state.profile.resume = text;
    state.profile.projects = resume.projects;
    persist();
    render();
    showToast("已新增文本简历版本，正文已用于后续匹配");
    event.target.value = "";
    return;
  }
  if (file.name.match(/\.pdf$/i)) {
    resume.previewKind = "pdf";
    resume.previewUrl = URL.createObjectURL(file);
  }
  try {
    showToast("正在解析简历正文...");
    const parsed = await parseResumeFile(file, id);
    resume.fileAssetId = parsed.fileAssetId || "";
    if (parsed.fileUrl) resume.previewUrl = parsed.fileUrl;
    resume.previewText = parsed.text;
    resume.resume = parsed.text;
    resume.parseStatus = "parsed";
    resume.parsedCharCount = parsed.charCount || parsed.text.length;
    if (!resume.previewKind) resume.previewKind = parsed.kind || "text";
    $("profile-resume").value = parsed.text;
    state.profile.resume = parsed.text;
    state.profile.projects = resume.projects;
    persist();
    render();
    showToast(`已解析简历正文：${parsed.charCount} 字，将用于 JD 匹配`);
  } catch (error) {
    resume.parseStatus = "failed";
    resume.parseError = error.message;
    persist();
    render();
    showToast(`已保存文件，但正文解析失败：${error.message}`);
  } finally {
    event.target.value = "";
  }
});
$("status-filters").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-status]");
  if (!button) return;
  currentStatusFilter = button.dataset.status;
  document.querySelectorAll("#status-filters button").forEach((btn) => btn.classList.toggle("active", btn === button));
  renderJobList();
});
$("analysis-job-select").addEventListener("change", (event) => {
  selectJob(event.target.value);
});
$("analysis-resume-select").addEventListener("change", (event) => {
  const job = currentJob();
  if (!job) return;
  job.resumeId = event.target.value;
  job.analysis = null;
  job.analysisModules = {};
  job.analysisVisibleModules = defaultAnalysisModules(false);
  job.prep = null;
  persist();
  render();
  showToast("已切换分析简历，旧分析已清空");
});
["self-intro-scene", "self-intro-length"].forEach((id) => {
  $(id).addEventListener("change", () => {
    const job = currentJob();
    if (!job) return;
    job.selfIntroOptions = getSelfIntroOptions(job);
    persist();
  });
});
$("profile-resume-select").addEventListener("change", (event) => {
  selectResumeVersion(event.target.value);
});

render();
const initialView = new URLSearchParams(window.location.search).get("view");
if (["dashboard", "jobs", "profile", "resumes", "experiences", "analysis", "interview", "skills", "traces", "evals"].includes(initialView)) activate(initialView);
refreshApiHealth();
initializeDatabasePersistence();
