const PREPARATION_STATUSES = new Set(["prepared", "partial", "missed", "unassessable"]);
const SCORE_VALUES = new Set([0, 1, 2, 3, 4]);

const CATEGORY_RULES = [
  ["motivation_fit", /为什么.*(?:公司|岗位|行业)|职业规划|动机|自我介绍|优势|匹配/i],
  ["project_depth", /项目|负责|主导|实现|上线|结果|复盘|难点|挑战/i],
  ["product_judgment", /优先级|取舍|判断|需求|产品|用户价值|为什么做|方案/i],
  ["business_understanding", /业务|商业|行业|竞品|客户|用户|增长|收入|市场/i],
  ["data_strategy", /指标|数据|实验|A\/B|样本|标注|阈值|归因|评测|eval|badcase/i],
  ["ai_technical", /\bAI\b|LLM|Agent|RAG|Prompt|Function Call|模型|算法|幻觉|工具调用/i],
  ["execution_collaboration", /推进|协作|冲突|资源|排期|交付|研发|工程|设计|运营/i],
  ["behavioral", /失败|压力|学习|影响|反思|缺点|挫折/i],
  ["case_design", /设计一个|开放题|估算|如果让你|怎么诊断|方案设计/i],
  ["interviewer_questions", /你有什么问题|反问|想问我们/i]
];

const CATEGORY_LABELS = {
  motivation_fit: "动机与岗位匹配",
  project_depth: "项目深度与个人责任",
  product_judgment: "产品判断与取舍",
  business_understanding: "业务与行业理解",
  data_strategy: "指标、评测与数据策略",
  ai_technical: "AI 技术边界与机制",
  execution_collaboration: "推进、协作与交付",
  behavioral: "行为经历与自我认知",
  case_design: "开放场景设计",
  interviewer_questions: "候选人反问"
};

function unique(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function questionCategory(question) {
  return CATEGORY_RULES.find(([, pattern]) => pattern.test(question))?.[0] || "product_judgment";
}

function extractQuestions(notes = "") {
  return unique(String(notes).split(/\r?\n|[。；;]/).map((line) => line.replace(/^\s*(?:\d+[.、)]|[-*]|Q[:：]?|问[:：]?)\s*/i, "").trim()).filter((line) => line.length >= 6 && (/[？?]$/.test(line) || /如何|为什么|怎么|什么|是否|介绍|举例|理解/.test(line))));
}

function collectPreparationItems(value, path = "准备材料", rows = []) {
  if (typeof value === "string" && value.trim()) rows.push({ label: path, text: value.trim() });
  else if (Array.isArray(value)) value.forEach((item, index) => collectPreparationItems(item, `${path}[${index + 1}]`, rows));
  else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => {
      if (!/raw|resume|jd|正文|原文/i.test(key)) collectPreparationItems(item, `${path}.${key}`, rows);
    });
  }
  return rows.slice(0, 300);
}

function tokens(value) {
  return unique(String(value || "").toLowerCase().match(/[a-z][a-z0-9+.#/-]{1,}|[\u4e00-\u9fa5]{2,6}/g) || [])
    .filter((token) => !/^(这个|那个|如何|怎么|什么|一下|一个|我们|你们|自己|进行|相关|问题)$/.test(token));
}

function preparationMatch(question, category, items, hasSnapshot) {
  if (!hasSnapshot) return { status: "unassessable", matches: [], rationale: "缺少可信的面试前准备快照，不能用事后材料计算覆盖率。" };
  const questionTokens = tokens(question);
  const ranked = items.map((item) => {
    const itemTokens = tokens(item.text);
    const overlap = questionTokens.filter((token) => item.text.toLowerCase().includes(token) || itemTokens.some((candidate) => candidate.includes(token) || token.includes(candidate)));
    const categoryHit = CATEGORY_RULES.find(([key]) => key === category)?.[1].test(item.text) ? 0.2 : 0;
    const direct = item.text.includes(question) || question.includes(item.text);
    const score = direct ? 1 : Math.min(0.8, overlap.length / Math.max(2, Math.min(questionTokens.length, itemTokens.length)) + categoryHit);
    return { ...item, score, overlap: overlap.length };
  }).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || (best.score < 0.25 && best.overlap < 2)) return { status: "missed", matches: [], rationale: "面试前材料中没有可直接用于回答该问题的观点、案例或证据。" };
  const prepared = best.score >= 0.65 && (best.overlap >= 2 || best.score === 1);
  return {
    status: prepared ? "prepared" : "partial",
    matches: [`${best.label}：${best.text.slice(0, 180)}`],
    rationale: prepared ? "存在语义直接相关且可用于作答的准备项。" : "存在相关主题，但角度、深度或证据不足，不能算直接命中。"
  };
}

function answerScores(answer, category) {
  if (!String(answer || "").trim()) return { answerScore: null, evidenceScore: null };
  const text = String(answer).trim();
  let answerScore = text.length >= 40 ? 2 : 1;
  if (/因为|所以|首先|其次|取舍|判断|我会|我的结论/.test(text)) answerScore += 1;
  if (/结果|提升|下降|指标|样本|复盘|但|边界|限制/.test(text) && text.length >= 80) answerScore += 1;
  answerScore = Math.min(4, answerScore);
  const evidenceRequired = ["project_depth", "behavioral", "execution_collaboration", "motivation_fit"].includes(category);
  if (!evidenceRequired && !/我|项目|经历|负责|参与/.test(text)) return { answerScore, evidenceScore: null };
  let evidenceScore = /我|负责|参与|项目/.test(text) ? 1 : 0;
  if (/方法|过程|通过|具体|数据|指标|样本/.test(text)) evidenceScore += 1;
  if (/结果|提升|下降|完成|上线|验证/.test(text)) evidenceScore += 1;
  if (/限制|边界|复盘|不足|没有/.test(text)) evidenceScore += 1;
  return { answerScore, evidenceScore: Math.min(4, evidenceScore) };
}

function gapFor(answer, scores, category, enteredGap = "") {
  if (enteredGap) return { types: ["evidence"], main: enteredGap };
  if (!answer) return { types: ["evidence"], main: "没有记录当时回答，暂时只能复盘问题意图；请补充可核验的回答内容。" };
  if (scores.answerScore <= 1) return { types: ["structure", "depth"], main: "回答有相关内容，但缺少清晰结论、判断依据和可追问的展开。" };
  if (scores.evidenceScore !== null && scores.evidenceScore <= 2) return { types: ["evidence"], main: "核心叙述可信，但个人责任、方法、指标或结果证据还不够完整。" };
  return { types: ["depth"], main: `继续补强${CATEGORY_LABELS[category]}中的取舍、边界和第二层追问。` };
}

function improvedAnswer(question, answer, gap, category) {
  const source = String(answer || "").trim();
  if (!source) return `先给出对“${question}”的明确判断，再说明 2 个理由，并补入一段真实经历。[请补真实信息：你的具体行动、可验证结果和限制]`;
  return `建议按“判断 → 原因 → 证据 → 反思”重组。保留原答事实：${source.slice(0, 220)}${source.length > 220 ? "…" : ""}；补强点：${gap} [请核对：个人责任、关键方法、结果与边界]`;
}

function followUps(category) {
  const map = {
    project_depth: ["这件事中你独立负责的部分是什么？", "当时有哪些备选方案，为什么这样取舍？", "结果如何验证，最大的限制是什么？"],
    product_judgment: ["你判断优先级的依据是什么？", "如果资源减半，你会保留什么？", "你会用什么指标验证判断？"],
    business_understanding: ["谁是用户、使用者、付费者和决策者？", "业务链路中最大的约束是什么？", "这个判断需要哪些公开或内部证据？"],
    data_strategy: ["指标定义、样本和基线是什么？", "失败样本如何分层归因？", "离线指标和真实任务效果如何连接？"],
    ai_technical: ["模型、工具和规则分别承担什么职责？", "失败或幻觉时如何降级？", "你如何设计 eval 与 badcase 闭环？"],
    execution_collaboration: ["冲突双方各自的目标是什么？", "你具体推动了哪个决策？", "如何定义完成和验收？"]
  };
  return map[category] || ["你做出这个判断的依据是什么？", "能否用一段真实经历说明？", "如果再做一次，你会改什么？"];
}

export function scoreInterviewReview(questionReviews = []) {
  const counts = { missed: 0, partial: 0, prepared: 0, unassessable: 0 };
  const byCategory = {};
  const answerScores = [];
  const evidenceScores = [];
  for (const [index, item] of questionReviews.entries()) {
    if (!PREPARATION_STATUSES.has(item.preparationStatus)) throw new TypeError(`questionReviews[${index}].preparationStatus 无效`);
    for (const key of ["answerScore", "evidenceScore"]) if (item[key] !== null && !SCORE_VALUES.has(item[key])) throw new TypeError(`questionReviews[${index}].${key} 必须为 0-4 或 null`);
    counts[item.preparationStatus] += 1;
    if (item.answerScore !== null) answerScores.push(item.answerScore);
    if (item.evidenceScore !== null) evidenceScores.push(item.evidenceScore);
    const category = item.primaryCategory || "uncategorized";
    if (!byCategory[category]) byCategory[category] = [];
    byCategory[category].push(item);
  }
  const pct = (value, total) => total ? Math.round(value * 1000 / total) / 10 : null;
  const average = (values) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) * 100 / values.length) / 100 : null;
  const assessable = counts.prepared + counts.partial + counts.missed;
  const categoryMetrics = Object.fromEntries(Object.entries(byCategory).sort().map(([category, rows]) => {
    const prepRows = rows.filter((row) => row.preparationStatus !== "unassessable");
    const weighted = prepRows.reduce((sum, row) => sum + (row.preparationStatus === "prepared" ? 1 : row.preparationStatus === "partial" ? 0.5 : 0), 0);
    const answers = rows.map((row) => row.answerScore).filter((value) => value !== null);
    return [category, { questionCount: rows.length, preparationCoveragePct: pct(weighted, prepRows.length), averageAnswerScore: average(answers) }];
  }));
  return {
    questionCount: questionReviews.length,
    assessablePreparationQuestionCount: assessable,
    preparationStatusCounts: counts,
    preparationCoveragePct: pct(counts.prepared + 0.5 * counts.partial, assessable),
    directPreparationHitRatePct: pct(counts.prepared, assessable),
    averageAnswerScore: average(answerScores),
    strongAnswerRatePct: pct(answerScores.filter((score) => score >= 3).length, answerScores.length),
    averageEvidenceScore: average(evidenceScores),
    evidenceReadyRatePct: pct(evidenceScores.filter((score) => score >= 3).length, evidenceScores.length),
    byCategory: categoryMetrics
  };
}

export function reviewInterview({ job = {}, profile = {}, interview = {} }) {
  const explicitQuestions = Array.isArray(interview.questions) ? interview.questions.filter((item) => String(item?.title || "").trim()) : [];
  const questions = explicitQuestions.length ? explicitQuestions : extractQuestions(interview.rawNotes).map((title, index) => ({ id: `extracted-${index + 1}`, title, answer: "", thinking: "", gap: "", nextAnswer: "" }));
  if (!questions.length) return { status: "needs_clarification", blockingQuestions: ["请至少补充一个真实面试问题或包含明确问句的面试记录。"], schemaVersion: "1.0", questionReviews: [] };

  const priorPreparation = interview.preparationSnapshot || interview.priorPreparation || {};
  const priorItems = collectPreparationItems(priorPreparation);
  unique(interview.priorPredictions || []).forEach((text, index) => priorItems.push({ label: `此前预测[${index + 1}]`, text }));
  const hasSnapshot = priorItems.length > 0;
  const snapshotTiming = interview.preparationSnapshot?.captureTiming;
  const comparisonConfidence = snapshotTiming === "round-creation" ? "high" : interview.preparationSnapshot?.generatedAt || interview.preparationSnapshot?.contentHash ? "medium" : interview.priorPreparation && Object.keys(interview.priorPreparation).length ? "medium" : interview.priorPredictions?.length ? "low" : "unassessable";
  const questionReviews = questions.map((question, index) => {
    const rawQuestion = String(question.title || "").trim();
    const rawAnswer = String(question.answer || "").trim();
    const isReverseQuestion = question.questionerRole === "候选人" || question.category === "反问";
    const primaryCategory = isReverseQuestion ? "interviewer_questions" : questionCategory(`${rawQuestion} ${rawAnswer}`);
    const match = preparationMatch(rawQuestion, primaryCategory, priorItems, hasSnapshot);
    const scores = isReverseQuestion ? { answerScore: null, evidenceScore: null } : answerScores(rawAnswer, primaryCategory);
    const gap = isReverseQuestion
      ? {
          types: rawAnswer ? ["reverse_question"] : ["reverse_question", "evidence"],
          main: question.gap || (rawAnswer
            ? "继续记录这段回答透露的团队目标、岗位边界和后续可验证信息。"
            : "尚未记录面试官对该反问的回答，无法沉淀岗位与团队信号。")
        }
      : gapFor(rawAnswer, scores, primaryCategory, question.gap);
    return {
      questionId: question.id || `question-${index + 1}`,
      rawQuestion,
      rawAnswer,
      questionerRole: isReverseQuestion ? "候选人" : "面试官",
      answererRole: isReverseQuestion ? "面试官" : "候选人",
      interviewSection: isReverseQuestion ? "反问" : question.category || "",
      primaryCategory,
      secondaryCategory: null,
      interviewerIntent: isReverseQuestion
        ? { text: "这是候选人向面试官提出的反问，用于了解岗位、团队或工作方式，不作为候选人作答评分。", evidenceStatus: "explicit" }
        : { text: `可能在验证${CATEGORY_LABELS[primaryCategory]}；这是根据问题内容做出的推断，不是面试官明确反馈。`, evidenceStatus: "inferred" },
      strengths: isReverseQuestion
        ? ["已记录候选人主动提出的反问，可用于沉淀新的岗位与团队信号。"]
        : rawAnswer ? [scores.answerScore >= 3 ? "回答包含较清晰的判断或展开。" : "回答保留了与问题相关的真实信息。"] : [],
      gapTypes: gap.types,
      mainGap: gap.main,
      ...scores,
      preparationStatus: match.status,
      matchedPreparationItems: match.matches,
      matchRationale: match.rationale,
      improvedAnswer: isReverseQuestion
        ? `建议保留反问原意并让问题更具体：${rawQuestion}。面试官回答后，追问目标、协作边界、成功标准或当前最大挑战中的一项。`
        : improvedAnswer(rawQuestion, rawAnswer, gap.main, primaryCategory),
      followUpQuestions: isReverseQuestion ? [] : followUps(primaryCategory),
      factsToVerify: !isReverseQuestion && scores.evidenceScore !== null && scores.evidenceScore < 3 ? ["个人实际责任范围", "采用的方法或判断依据", "可验证结果、基线与限制"] : []
    };
  });
  const metrics = scoreInterviewReview(questionReviews);
  const categoryCounts = Object.entries(metrics.byCategory)
    .filter(([category]) => category !== "interviewer_questions")
    .sort((a, b) => b[1].questionCount - a[1].questionCount);
  const topCategories = categoryCounts.slice(0, 3).map(([category]) => CATEGORY_LABELS[category]);
  const missed = questionReviews.filter((item) => item.preparationStatus === "missed");
  const weak = questionReviews.filter((item) => item.answerScore !== null && item.answerScore < 3);
  const newSignals = topCategories.map((label) => `本轮问题集中验证“${label}”，应提高该维度在岗位画像中的权重。`);
  const nextActions = unique([
    ...weak.slice(0, 3).map((item) => `重写“${item.rawQuestion}”的判断、证据与反思，并口头演练两层追问。`),
    ...missed.slice(0, 3).map((item) => `为此前未覆盖的“${item.rawQuestion}”补一份可验证答题卡。`),
    ...questionReviews.flatMap((item) => item.factsToVerify).slice(0, 3).map((item) => `核实并记录：${item}。`)
  ]).slice(0, 8);
  const labels = unique([
    missed.length ? "prediction_miss" : "effective_preparation",
    questionReviews.some((item) => item.preparationStatus === "partial") ? "depth_miss" : "",
    questionReviews.some((item) => item.evidenceScore !== null && item.evidenceScore < 3) ? "evidence_miss" : "",
    newSignals.length ? "role_model_update" : ""
  ]);
  const previousRounds = Array.isArray(interview.previousRounds) ? interview.previousRounds : [];
  return {
    status: "success",
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    modes: interview.mode?.length ? interview.mode : [explicitQuestions.some((item) => item.answer) ? "full_review" : "quick_review", hasSnapshot ? "careerpilot_evaluation" : "next_round"],
    comparisonConfidence,
    evidenceLimitations: unique([!explicitQuestions.some((item) => item.answer) ? "部分或全部问题缺少当时回答，回答与证据分返回 null。" : "", !hasSnapshot ? "没有可信的面试前准备快照，覆盖指标返回 null。" : "", interview.rawNotes && explicitQuestions.length ? "原始笔记与结构化问题并存，逐题结论以结构化记录为准。" : ""]),
    summary: {
      threeConclusions: unique([topCategories.length ? `本轮主要验证：${topCategories.join("、")}。` : "本轮问题主题仍需继续补充。", weak.length ? `${weak.length} 个已记录回答尚未达到稳定应对追问的程度。` : "现有回答未暴露明显的低准备度项。", hasSnapshot ? `面试前准备加权覆盖率为 ${metrics.preparationCoveragePct ?? "不可计算"}%。` : "缺少面试前准备快照，本轮不计算历史覆盖率。"]).slice(0, 3),
      overallAssessment: `已复盘 ${questionReviews.length} 个真实问题；候选人表现与 CareerPilot 准备效果分开计算。`,
      topStrengths: unique(questionReviews.flatMap((item) => item.strengths)).slice(0, 3),
      topGaps: unique(questionReviews.map((item) => item.mainGap)).slice(0, 5)
    },
    questionReviews,
    roleInsights: {
      validatedHypotheses: [],
      newSignals,
      weakenedAssumptions: missed.map((item) => `此前岗位准备未覆盖“${item.rawQuestion}”，原岗位模型可能低估该主题。`).slice(0, 5),
      nextRoundHypotheses: topCategories.map((label) => `下一轮可能继续加深“${label}”并追问真实证据。`)
    },
    preparationAudit: {
      metrics,
      missedTopics: missed.map((item) => item.rawQuestion),
      effectivePreparation: questionReviews.filter((item) => item.preparationStatus === "prepared").flatMap((item) => item.matchedPreparationItems),
      falseConfidenceItems: questionReviews.filter((item) => item.preparationStatus === "partial" && item.answerScore !== null && item.answerScore < 2).flatMap((item) => item.matchedPreparationItems)
    },
    nextRoundPlan: {
      rememberThree: unique([topCategories[0] ? `优先准备${topCategories[0]}的判断和证据。` : "先还原真实问题。", "回答中明确个人责任、关键取舍与验证方法。", "不确定的数字和结果先核实，不用流畅措辞掩盖证据缺口。"]),
      priorityQuestions: questionReviews.slice().sort((a, b) => (a.answerScore ?? -1) - (b.answerScore ?? -1)).slice(0, 5).map((item) => item.rawQuestion),
      evidenceTasks: nextActions.filter((item) => /核实|证据|责任|结果/.test(item)),
      knowledgeTasks: newSignals.slice(0, 3),
      rehearsalTasks: nextActions.filter((item) => /重写|演练|答题卡/.test(item)),
      questionsForInterviewer: ["这个岗位入职前三个月最重要的业务结果是什么？", "团队当前判断 AI 产品效果时最看重哪些线上与线下指标？"]
    },
    careerpilotLearning: {
      labels,
      analysisImprovements: newSignals,
      questionGenerationImprovements: missed.map((item) => `将“${item.rawQuestion}”及两层追问加入该类岗位题库。`).slice(0, 5),
      evidenceAuditImprovements: weak.filter((item) => item.evidenceScore !== null && item.evidenceScore < 3).map((item) => `为“${item.rawQuestion}”增加责任、方法、指标和边界检查。`).slice(0, 5),
      answerCoachingImprovements: weak.map((item) => `为“${item.rawQuestion}”提供判断→原因→证据→反思结构。`).slice(0, 5)
    },
    crossRoundSynthesis: previousRounds.length ? { roundCount: previousRounds.length + 1, repeatedThemes: topCategories, unresolvedGaps: unique(weak.map((item) => item.mainGap)).slice(0, 5) } : null,
    sourceContext: { jobId: job.id || "", roundId: interview.roundId || "", priorPrepRunId: interview.priorPrepRunId || "" }
  };
}
