import test from "node:test";
import assert from "node:assert/strict";
import { parseAgentRunInput, parseReviewInterviewInput } from "../src/server/schemas/agent.js";
import { planAgentTask } from "../src/server/agent/planner.js";
import { runAgentTask } from "../src/server/agent/runner.js";
import JSZip from "jszip";
import { parseDocumentFile } from "../src/server/services/file-parser.js";

const job = {
  company: "示例公司",
  title: "AI 产品经理",
  type: "AI 产品",
  jd: "负责 Agent 工具调用、用户需求分析、数据指标和跨团队推进。"
};

test("组合任务会按依赖关系串联四个诊断 Skill", () => {
  const plan = planAgentTask("分析这份 JD，然后生成准备计划");
  assert.deepEqual(plan.steps, ["understandJobIndustry", "profileMatcher", "riskDiagnoser", "prepPlanner"]);
});

test("岗位理解会输出行业口径、JD 映射和业务线澄清门", async () => {
  const input = parseAgentRunInput({ query: "这家公司属于什么行业，上下游和岗位重点是什么？", job, profile: {} });
  const result = await runAgentTask(input);
  const understanding = result.output.understandJobIndustry;
  assert.equal(understanding.capability, "understand-job-industry");
  assert.equal(understanding.businessLine.status, "unknown");
  assert.match(understanding.businessLine.clarificationQuestion, /业务|产品线/);
  assert.ok(understanding.jdRequirementMap.actionVerbs.length >= 1);
  assert.ok(understanding.researchQuestions.length >= 3);
  assert.equal(understanding.researchStatus.webResearchCompleted, false);
});

test("岗位理解 Skill 可调用模型增强并在 Trace 中留下证据", async () => {
  const input = parseAgentRunInput({ query: "理解岗位与行业", job, profile: {} });
  const result = await runAgentTask(input, {
    roleUnderstandingExecutor: async () => ({
      roleUnderstanding: {
        companyBusiness: { summary: "面向用户提供 AI 应用服务", businessModel: "待核验", sourceBasis: "JD" },
        rolePositioning: { oneSentence: "连接用户场景与模型能力", orgLocation: "产品交付", whyNeeded: "推进 AI 能力落地" },
        businessMap: { businessObjects: ["用户"], workflows: ["需求分析"], dataAndSystems: ["评测集"] },
        likelyWork: [{ task: "定义 Agent 能力", businessMeaning: "提高任务完成率", deliverable: "PRD" }],
        industryPrimer: { mustKnowTerms: ["Function Call"], questionsToResearch: ["目标用户是谁"], interviewAngles: ["从任务成功率出发"] },
        sourceLinks: []
      },
      _trace: { called: true, provider: "test-provider", model: "test-model", usage: { total_tokens: 42 } }
    })
  });
  assert.equal(result.output.understandJobIndustry.roleUnderstanding.rolePositioning.oneSentence, "连接用户场景与模型能力");
  assert.equal(result.trace[0].executionMode, "skill-contract/model-assisted");
  assert.equal(result.trace[0].model.called, true);
  assert.equal(result.summary.modelCallCount, 1);
});

test("空候选人资料的证据覆盖分为 0", async () => {
  const input = parseAgentRunInput({ query: "我的简历和这个岗位匹配吗？", job, profile: {} });
  const result = await runAgentTask(input);
  assert.equal(result.status, "success");
  assert.equal(result.output.profileMatcher.fit.score, 0);
  assert.match(result.output.profileMatcher.fit.gaps.join(" "), /缺少简历/);
});

test("Cover Letter 缺少事实输入时返回澄清问题", async () => {
  const input = parseAgentRunInput({ query: "写一封 Cover Letter", job: { title: "实习生", jd: "" }, profile: {} });
  const result = await runAgentTask(input);
  assert.equal(result.status, "needs_clarification");
  assert.ok(result.output.coverLetterTailor.blockingQuestions.length >= 2);
});

test("Agent 请求限制任务长度并校验 Skill key", () => {
  assert.throws(() => parseAgentRunInput({ query: "a".repeat(2001), requestedSkills: ["unknown"] }));
});

test("每个成功步骤都生成 Trace", async () => {
  const input = parseAgentRunInput({ query: "分析 JD 并生成准备计划", job, profile: { resume: "参与 AI Agent 产品需求和用户调研", projects: "求职 Agent：设计评测和 badcase 流程" } });
  const result = await runAgentTask(input);
  assert.equal(result.trace.length, 4);
  assert.ok(result.trace.every((step) => step.status === "success" && step.durationMs >= 0));
  assert.equal(result.summary.toolCallCount, 4);
  assert.equal(result.summary.callsBySkill.prepPlanner, 1);
  assert.equal(result.summary.failedCalls, 0);
  assert.ok(result.trace.every((step) => step.callIndex === 1 && step.inputSummary && step.outputSummary));
});

test("interview-retrospective 会保留原始问答并分别计算回答与准备质量", async () => {
  const input = parseAgentRunInput({
    query: "复盘这次面试并生成二面准备计划",
    job,
    profile: { resume: "参与 AI Agent 产品需求和评测", projects: "求职 Agent" },
    interview: {
      roundName: "一面",
      mode: ["full_review", "careerpilot_evaluation", "next_round"],
      rawNotes: "面试官重点追问了如何设计 Agent 评测指标，以及如何推进算法和工程协作。",
      questions: [
        { id: "q1", title: "你会如何设计 Agent 的评测指标？", answer: "我会先定义任务成功率，再整理 badcase，并结合用户反馈复盘。", gap: "缺少离线评测指标案例" },
        { id: "q2", title: "算法和工程意见不一致时怎么推进？", answer: "", gap: "协作案例不够具体" }
      ],
      preparationSnapshot: { generatedAt: "2026-07-20T00:00:00.000Z", contentHash: "snapshot-1", captureTiming: "round-creation", riskQuestions: ["你会如何设计 Agent 的评测指标？"] }
    }
  });
  const result = await runAgentTask(input);
  assert.deepEqual(result.routing.plan, ["understandJobIndustry", "profileMatcher", "interviewRetrospective", "riskDiagnoser", "prepPlanner"]);
  const review = result.output.interviewRetrospective;
  assert.equal(review.questionReviews[0].rawQuestion, "你会如何设计 Agent 的评测指标？");
  assert.equal(review.questionReviews[0].rawAnswer, "我会先定义任务成功率，再整理 badcase，并结合用户反馈复盘。");
  assert.equal(review.questionReviews[0].preparationStatus, "prepared");
  assert.equal(review.questionReviews[1].answerScore, null);
  assert.equal(review.comparisonConfidence, "high");
  assert.ok(review.roleInsights.newSignals.length >= 1);
  assert.ok(review.careerpilotLearning.labels.length >= 1);
  assert.equal(result.output.prepPlanner.basedOnInterviewFeedback, true);
});

test("interview-retrospective 将候选人反问与候选人作答分开处理", async () => {
  const input = parseAgentRunInput({
    query: "复盘反问环节",
    job,
    profile: {},
    requestedSkills: ["interviewRetrospective"],
    interview: {
      questions: [{
        id: "reverse-1",
        title: "这个岗位入职后的核心目标是什么？",
        answer: "前两个月主要熟悉 MCP 和 Skill 的建设流程。",
        category: "反问",
        questionerRole: "候选人"
      }]
    }
  });
  const result = await runAgentTask(input);
  const review = result.output.interviewRetrospective.questionReviews[0];

  assert.equal(review.questionerRole, "候选人");
  assert.equal(review.answererRole, "面试官");
  assert.equal(review.interviewSection, "反问");
  assert.equal(review.primaryCategory, "interviewer_questions");
  assert.equal(review.answerScore, null);
  assert.match(review.interviewerIntent.text, /不作为候选人作答评分/);
});

test("只有真实问题时也能快速复盘，缺少准备快照时指标返回 null", async () => {
  const input = parseAgentRunInput({
    query: "复盘这次面试",
    job,
    interview: { roundId: "round-1", roundName: "一面", questions: [{ id: "q1", title: "为什么选择这个岗位？" }] }
  });
  const result = await runAgentTask(input);
  assert.deepEqual(result.routing.plan, ["interviewRetrospective"]);
  assert.equal(result.output.interviewRetrospective.questionReviews[0].answerScore, null);
  assert.equal(result.output.interviewRetrospective.preparationAudit.metrics.preparationCoveragePct, null);
  assert.equal(result.output.interviewRetrospective.comparisonConfidence, "unassessable");
});

test("专用面试复盘输入契约保留轮次、准备快照和多轮上下文", () => {
  const input = parseReviewInterviewInput({
    mode: ["cross_round"],
    job,
    candidate: { resume: "参与 AI 产品评测" },
    priorPreparation: { riskQuestions: ["如何评测 Agent？"] },
    interviewRound: {
      id: "r2",
      title: "二面",
      sourceMaterial: { asset: { id: "asset-1", sourceType: "document" }, extraction: { status: "extracted" }, rawText: "问：如何评测 Agent？" },
      preparationSnapshot: { contentHash: "v1" },
      questionItems: [{ id: "q1", title: "如何评测 Agent？" }]
    },
    previousRounds: [{ id: "r1", title: "一面" }]
  });
  assert.equal(input.interviewRound.id, "r2");
  assert.equal(input.previousRounds.length, 1);
  assert.equal(input.mode[0], "cross_round");
  assert.equal(input.interviewRound.sourceMaterial.asset.id, "asset-1");
  assert.match(input.interviewRound.sourceMaterial.rawText, /评测 Agent/);
});

test("Word 面试记录可以提取为复盘原始文本", async () => {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>面试官：你如何设计 Agent 评测？</w:t></w:r></w:p><w:p><w:r><w:t>候选人：先定义任务成功率，再整理 badcase。</w:t></w:r></w:p></w:body></w:document>`);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const parsed = await parseDocumentFile({ fileName: "一面记录.docx", fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data: buffer.toString("base64") });
  assert.equal(parsed.kind, "docx");
  assert.match(parsed.text, /Agent 评测/);
  assert.match(parsed.text, /任务成功率/);
});

test("旧 interviewFeedbackAnalyzer 请求键会兼容迁移到新 Skill", () => {
  const input = parseAgentRunInput({ query: "复盘面试", requestedSkills: ["interviewFeedbackAnalyzer"] });
  assert.deepEqual(input.requestedSkills, ["interviewRetrospective"]);
});
