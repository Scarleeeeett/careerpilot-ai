export const KEYWORDS = {
  ai: ["ai", "大模型", "llm", "agent", "rag", "prompt", "智能", "算法", "模型", "自动化"],
  data: ["数据", "指标", "分析", "ab", "a/b", "实验", "sql", "增长"],
  user: ["用户", "体验", "调研", "反馈", "场景", "需求"],
  business: ["业务", "商业", "内容", "社区", "创作者", "b端", "saas", "平台"],
  delivery: ["推进", "协作", "落地", "项目", "迭代", "跨团队"]
};

export function hitKeywords(text, keywordMap = KEYWORDS) {
  const source = String(text || "").toLowerCase();
  return Object.fromEntries(Object.entries(keywordMap).map(([key, words]) => [key, words.filter((word) => source.includes(word))]));
}

const JD_TERMS = {
  actionVerbs: ["研究", "分析", "定义", "设计", "规划", "运营", "交付", "评测", "协调", "推进", "迭代", "优化"],
  ownedObjects: ["产品", "模块", "工作流", "模型", "数据", "平台", "项目", "需求", "指标", "用户"],
  usersCustomers: ["用户", "客户", "商家", "创作者", "企业", "运营", "开发者", "消费者"],
  technicalNouns: ["LLM", "Agent", "RAG", "Prompt", "Function Call", "模型", "算法", "API", "数据平台", "SQL"],
  businessNouns: ["定价", "采购", "商业化", "交付", "留存", "成本", "合规", "增长", "收入", "转化"],
  metrics: ["准确率", "召回率", "延迟", "转化率", "留存率", "使用率", "SLA", "毛利", "部署周期", "满意度"],
  interfaces: ["算法", "研发", "工程", "设计", "销售", "运营", "客户", "供应商", "法务"],
  evidenceExpected: ["作品集", "案例", "SQL", "PRD", "评测", "行业知识", "沟通", "项目经验"]
};

function matchedTerms(text, terms) {
  const source = String(text || "").toLowerCase();
  return [...new Set(terms.filter((term) => source.includes(term.toLowerCase())))];
}

function inferIndustry(hits, job) {
  const text = `${job.type || ""} ${job.jd || ""}`.toLowerCase();
  if (/saas|企业服务|b端|b2b/.test(text)) return { primaryIndustry: "软件与信息技术服务", subsector: "企业软件 / SaaS", productForm: "软件平台或企业服务", applicationScenario: "企业业务流程" };
  if (/内容|社区|创作者|媒体/.test(text)) return { primaryIndustry: "互联网信息服务", subsector: "内容与社区产品", productForm: "内容平台", applicationScenario: "内容生产、分发或社区互动" };
  if (hits.ai.length) return { primaryIndustry: "人工智能应用（待公开资料验证）", subsector: "AI 产品与智能应用", productForm: /平台/.test(text) ? "AI 平台" : "AI 应用", applicationScenario: hits.user.length ? "用户工作流智能化" : "业务流程智能化" };
  if (hits.data.length) return { primaryIndustry: "软件与信息技术服务（待公开资料验证）", subsector: "数据产品与增长", productForm: "数据产品", applicationScenario: "数据分析与业务决策" };
  return { primaryIndustry: "待结合公司主营业务确认", subsector: "产品 / 运营", productForm: "未确认", applicationScenario: "未确认" };
}

export function understandJobIndustry(job) {
  const text = `${job.title || ""} ${job.type || ""} ${job.jd || ""}`;
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
  const explicitBusinessLine = String(job.businessLine || "").trim();
  const inferredBusinessLine = !explicitBusinessLine && String(job.type || "").trim() && !/^(ai|数据|增长|业务|平台)?\s*产品|运营|实习|经理$/i.test(String(job.type || "").trim()) ? String(job.type).trim() : "";
  const businessLineStatus = explicitBusinessLine ? "explicit" : inferredBusinessLine ? "inferred" : "unknown";
  const industryClassification = inferIndustry(hits, job);
  const jdRequirementMap = Object.fromEntries(Object.entries(JD_TERMS).map(([key, terms]) => [key, matchedTerms(text, terms)]));
  const clarificationQuestion = businessLineStatus === "unknown" && job.company
    ? `这份 JD 对应「${job.company}」的具体业务或产品线你知道吗？如果招聘方没有透露，可以回答“不知道”，后续应按多分支口径研究。`
    : "";
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
    intakeCard: {
      targetCompany: job.company || "待确认公司",
      targetBusinessLine: explicitBusinessLine || inferredBusinessLine,
      businessLineStatus,
      targetRole: job.title || "待确认岗位",
      geography: job.geography || "未指定",
      depth: "standard",
      researchDate: new Date().toISOString().slice(0, 10),
      inputSource: job.jdUrl ? "job-url-and-jd" : "pasted-jd"
    },
    businessLine: {
      status: businessLineStatus,
      value: explicitBusinessLine || inferredBusinessLine,
      clarificationQuestion,
      rule: businessLineStatus === "unknown" ? "行业共性可继续分析；竞品、定价、客户和政策等范围相关结论需先确认或采用分支分析。" : "后续行业研究应收敛到该业务线。"
    },
    industryClassification: {
      ...industryClassification,
      adjacentIndustries: hits.ai.length ? ["云计算与开发者工具", "数据服务"] : ["企业数字化服务"],
      evidenceType: "inference-from-user-provided-jd",
      confidence: hits.ai.length || hits.business.length ? "medium" : "low",
      limitation: "当前仅完成 JD 阶段理解，未调用公开网络资料；公司定位、竞品、价格、规模和政策仍需检索验证。"
    },
    jdRequirementMap: {
      companyContext: [job.company, explicitBusinessLine || inferredBusinessLine, job.geography].filter(Boolean),
      roleIdentity: { family: roleType, title: job.title || "未确认", seniority: /实习/.test(text) ? "intern" : /高级|资深|专家/.test(text) ? "experienced" : "unknown" },
      ...jdRequirementMap,
      explicitRequirements: matchedTerms(job.jd, [...JD_TERMS.actionVerbs, ...JD_TERMS.ownedObjects, ...JD_TERMS.metrics]),
      inferences: [industryClassification.primaryIndustry, ...coreTasks].map((item) => ({ statement: item, basis: "JD 关键词与岗位名称", evidenceType: "inference" }))
    },
    roleMapping: coreTasks.map((task, index) => ({
      jdMeaning: task,
      dailyDecision: index === 0 ? "确定用户问题、方案边界和优先级" : index === 1 ? "选择反馈与指标并决定迭代" : "协调接口团队并控制交付风险",
      metric: jdRequirementMap.metrics[index] || (index === 0 ? "需求有效性" : index === 1 ? "任务成功率 / 用户反馈" : "交付周期"),
      interviewEvidence: requiredSkills[index] || "真实项目证据"
    })),
    researchQuestions: [
      `公司主营业务及该岗位所属业务线是什么？`,
      `谁为该产品付费、谁使用、谁负责采购与运营？`,
      `产品位于产业链哪个环节，输入、输出和资金流如何？`,
      `同口径竞品、商业模式和关键成本分别是什么？`,
      `哪些行业知识会改变「${job.title || "该岗位"}」的日常产品决策？`
    ],
    sourceMap: [{ sourceId: "user-jd", title: `${job.company || "目标公司"} ${job.title || "岗位"} JD`, sourceType: "user-provided", url: job.jdUrl || "", supports: ["岗位职责", "能力要求", "关键词"], limitation: "不能单独证明公司行业定位或当前经营事实" }],
    unresolvedFacts: [clarificationQuestion, "公开资料检索与关键事实引用尚未执行"].filter(Boolean),
    researchStatus: { stage: "jd-understanding-complete", webResearchCompleted: false, nextGate: clarificationQuestion ? "confirm-business-line-or-branch-analysis" : "evidence-backed-industry-research" }
  };
}

function extractProfile(profile) {
  const hits = hitKeywords(`${profile.resume || ""} ${profile.projects || ""}`);
  return {
    targetRoles: String(profile.target || "").split(/、|,|，/).map((item) => item.trim()).filter(Boolean),
    targetIndustries: String(profile.industry || "").split(/、|,|，/).map((item) => item.trim()).filter(Boolean),
    coreProjects: String(profile.projects || "").split(/\n|；|;/).map((item) => item.trim()).filter(Boolean).slice(0, 4),
    productSignals: hits.user.concat(hits.delivery),
    aiSignals: hits.ai,
    dataSignals: hits.data,
    businessSignals: hits.business,
    rawKeywordHits: hits
  };
}

export function matchCandidateEvidence(jdProfile, profile) {
  const userProfile = extractProfile(profile);
  const requiredEvidenceDimensions = Object.keys(KEYWORDS).filter((key) => jdProfile.rawKeywordHits[key].length > 0);
  const coveredEvidenceDimensions = requiredEvidenceDimensions.filter((key) => userProfile.rawKeywordHits[key].length > 0);
  const hasEvidence = Boolean(String(profile.resume || "").trim() || String(profile.projects || "").trim());
  const score = hasEvidence && requiredEvidenceDimensions.length
    ? Math.round(coveredEvidenceDimensions.length / requiredEvidenceDimensions.length * 100)
    : 0;
  const strongMatches = [
    jdProfile.aiKeywords.length && userProfile.aiSignals.length ? "AI 产品关键词匹配，可重点讲工作流、eval、badcase" : "",
    jdProfile.rawKeywordHits.user.length && userProfile.productSignals.length ? "用户场景和产品推进能力有匹配素材" : "",
    jdProfile.dataKeywords.length && userProfile.dataSignals.length ? "数据分析/指标意识有可迁移表达" : ""
  ].filter(Boolean);
  const gaps = [
    !hasEvidence ? "缺少简历正文或项目素材，当前不能判断候选人证据" : "",
    jdProfile.businessKeywords.length && !userProfile.businessSignals.length ? "业务场景素材不足，需要补公司/行业案例" : "",
    jdProfile.dataKeywords.length && !userProfile.dataSignals.length ? "数据指标表达偏弱，需要准备评估口径" : "",
    jdProfile.aiKeywords.length && !userProfile.aiSignals.length ? "AI 方法表达不足，需要补 LLM/Agent/eval 基础讲法" : ""
  ].filter(Boolean);
  return {
    userProfile,
    fit: {
      score,
      scoreDefinition: "规则证据维度覆盖分，不是录用概率或模型准确率。",
      requiredEvidenceDimensions,
      coveredEvidenceDimensions,
      strongMatches,
      transferableMatches: hasEvidence ? ["现有经历可按问题、行动、结果、复盘映射到 JD"] : [],
      gaps: gaps.length ? gaps : ["主要风险不是硬缺能力，而是表达是否足够具体"],
      recommendedProjects: userProfile.coreProjects
    }
  };
}

export function diagnoseInterviewRisks(jdProfile, fit) {
  return {
    likelyQuestions: [
      "为什么这个场景需要 AI，而不是普通模板或表格？",
      "你会如何评估 AI 输出是否真的有帮助？",
      jdProfile.businessKeywords.length ? "你对这个业务场景的理解有哪些具体例子？" : "如果岗位业务很陌生，你如何快速补齐上下文？",
      "出现泛化、幻觉或建议不可执行时，你会改哪个链路节点？"
    ],
    riskPoints: fit.gaps,
    boundaries: [
      "不要声称真实上线、增长或 A/B test，除非有证据。",
      "不要把本地规则 demo 说成完整模型训练或算法优化。",
      "可以说设计了工作流、字段结构、eval 口径和 badcase 迭代。"
    ],
    missingEvidence: fit.score === 0 ? ["候选人简历或项目正文"] : ["真实 JD eval 样本", "badcase 记录", "准备建议可执行性评分"]
  };
}

export function generatePreparationPlan(job, jdProfile, fit, risk, interviewRetrospective = null) {
  const prepSuggestions = [
    "准备一个项目故事：问题 -> 工作流 -> eval -> badcase -> 迭代。",
    jdProfile.aiKeywords.length ? "重点讲 AI 产品可靠性，而不是只讲生成能力。" : "重点讲用户场景、需求优先级和落地推进。",
    jdProfile.businessKeywords.length ? "补 3 个该行业具体业务场景。" : "补公司主营业务、用户和竞品。",
    "准备 1 分钟自我介绍，并把经历映射到 JD 关键词。"
  ];
  const feedbackActions = interviewRetrospective?.status === "success" ? [
    ...(interviewRetrospective.nextRoundPlan?.evidenceTasks || []),
    ...(interviewRetrospective.nextRoundPlan?.knowledgeTasks || []),
    ...(interviewRetrospective.nextRoundPlan?.rehearsalTasks || [])
  ] : [];
  const todoList = [...feedbackActions, ...prepSuggestions].slice(0, 10);
  return {
    todoList,
    oneMinuteIntroAngle: `围绕「${job.title || "目标岗位"}」说明复杂任务拆解、证据约束和评测迭代。`,
    interviewBrief: [
      `公司 / 岗位：${job.company || "待补公司"} - ${job.title || "待补岗位"}`,
      `核心准备：${jdProfile.coreTasks[0]}`,
      `主讲项目：${fit.recommendedProjects[0] || "待从简历选择真实项目"}`,
      `风险提醒：${risk.riskPoints[0] || "讲清评估标准和失败案例"}`
    ],
    prepSuggestions: todoList,
    basedOnInterviewFeedback: Boolean(feedbackActions.length),
    feedbackCoverage: interviewRetrospective?.preparationAudit?.metrics || null
  };
}
