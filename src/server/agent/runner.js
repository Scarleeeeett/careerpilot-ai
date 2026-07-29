import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { SKILL_REGISTRY } from "../../shared/skill-registry.js";
import { planAgentTask } from "./planner.js";
import { understandJobIndustry, matchCandidateEvidence, diagnoseInterviewRisks, generatePreparationPlan } from "../tools/job-analysis.js";
import { createLocalCoverLetter } from "../tools/cover-letter.js";
import { reviewInterview } from "../tools/interview-retrospective.js";

function summarizeInput(key, input) {
  if (key === "understandJobIndustry") return { company: input.job.company, title: input.job.title, businessLine: input.job.businessLine, jdChars: input.job.jd.length };
  if (key === "profileMatcher") return { resumeChars: input.profile.resume.length, projectChars: input.profile.projects.length };
  if (key === "interviewRetrospective") return { roundName: input.interview.roundName, modes: input.interview.mode, questionCount: input.interview.questions.length, noteChars: input.interview.rawNotes.length, hasPreparationSnapshot: Boolean(input.interview.preparationSnapshot?.generatedAt || input.interview.preparationSnapshot?.contentHash), previousRoundCount: input.interview.previousRounds.length };
  if (key === "riskDiagnoser") return { fitScore: input.results.profileMatcher?.fit?.score ?? 0 };
  if (key === "prepPlanner") return { title: input.job.title, riskCount: input.results.riskDiagnoser?.riskPoints?.length ?? 0 };
  return { channel: input.options.channel, resumeChars: input.profile.resume.length };
}

function summarizeOutput(output) {
  if (!output || typeof output !== "object") return { type: typeof output };
  const keys = Object.keys(output);
  const arrays = Object.fromEntries(keys.filter((key) => Array.isArray(output[key])).map((key) => [key, output[key].length]));
  return { keys, arrayLengths: arrays, status: output.status || "success", sizeChars: JSON.stringify(output).length };
}

function buildRunSummary(trace, totalDurationMs) {
  const callsBySkill = trace.reduce((counts, step) => {
    counts[step.skillKey] = (counts[step.skillKey] || 0) + 1;
    return counts;
  }, {});
  return {
    toolCallCount: trace.length,
    successfulCalls: trace.filter((step) => step.status === "success").length,
    failedCalls: trace.filter((step) => step.status === "failed").length,
    modelCallCount: trace.filter((step) => step.model?.called).length,
    callsBySkill,
    totalDurationMs: Math.round(totalDurationMs * 100) / 100
  };
}

export async function runAgentTask(input, { coverLetterExecutor, roleUnderstandingExecutor } = {}) {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const runStart = performance.now();
  const plan = planAgentTask(input.query, input.requestedSkills);
  const routing = {
    skillKey: plan.steps.length > 1 ? "multiSkill" : plan.steps[0] || null,
    reason: plan.reason,
    confidence: "rule-match",
    planner: plan.planner,
    plan: plan.steps
  };
  const publicInput = {
    query: input.query,
    job: { company: input.job.company, title: input.job.title, type: input.job.type, jdChars: input.job.jd.length },
    profile: { target: input.profile.target, industry: input.profile.industry, resumeChars: input.profile.resume.length, projectChars: input.profile.projects.length },
    interview: { roundId: input.interview.roundId, roundName: input.interview.roundName, modes: input.interview.mode, questionCount: input.interview.questions.length, noteChars: input.interview.rawNotes.length, hasPreparationSnapshot: Boolean(input.interview.preparationSnapshot?.generatedAt || input.interview.preparationSnapshot?.contentHash), previousRoundCount: input.interview.previousRounds.length, priorPrepRunId: input.interview.priorPrepRunId },
    options: input.options,
    requestedSkills: input.requestedSkills || []
  };
  const finish = (payload, trace = []) => ({
    runId,
    query: input.query,
    startedAt,
    completedAt: new Date().toISOString(),
    summary: buildRunSummary(trace, performance.now() - runStart),
    ...payload,
    trace
  });
  if (plan.status !== "ready") {
    return finish({ status: "needs_clarification", routing, plan, input: publicInput, output: {} });
  }

  const results = {};
  const trace = [];
  const callCounts = {};
  for (const skillKey of plan.steps) {
    const stepStartedAt = new Date().toISOString();
    const start = performance.now();
    try {
      callCounts[skillKey] = (callCounts[skillKey] || 0) + 1;
      let modelTrace = { called: false };
      if (skillKey === "understandJobIndustry") {
        const localUnderstanding = understandJobIndustry(input.job);
        results.understandJobIndustry = localUnderstanding;
        if (roleUnderstandingExecutor) {
          try {
            const modelResult = await roleUnderstandingExecutor({
              job: input.job,
              references: input.job.researchReferences || ""
            });
            modelTrace = modelResult?._trace || { called: true, provider: "configured-provider", model: null, usage: null };
            const roleUnderstanding = modelResult?.roleUnderstanding || modelResult;
            if (roleUnderstanding && typeof roleUnderstanding === "object") {
              const { _trace, ...publicUnderstanding } = roleUnderstanding;
              results.understandJobIndustry = {
                ...localUnderstanding,
                roleUnderstanding: publicUnderstanding,
                researchStatus: {
                  mode: "model-assisted",
                  provider: modelTrace.provider || "",
                  model: modelTrace.model || "",
                  note: "基于公司、岗位方向、JD 与用户提供的参考资料生成，外部事实仍需通过来源链接核验。"
                }
              };
            }
          } catch (modelError) {
            modelTrace = {
              called: true,
              status: "failed",
              provider: "configured-provider",
              model: null,
              usage: null,
              error: modelError.message
            };
            results.understandJobIndustry = {
              ...localUnderstanding,
              researchStatus: {
                mode: "local-fallback",
                note: `模型增强失败，已保留本地 JD 结构化结果：${modelError.message}`
              }
            };
          }
        }
      }
      if (skillKey === "profileMatcher") results.profileMatcher = matchCandidateEvidence(results.understandJobIndustry, input.profile);
      if (skillKey === "interviewRetrospective") results.interviewRetrospective = reviewInterview({ job: input.job, profile: input.profile, interview: input.interview });
      if (skillKey === "riskDiagnoser") results.riskDiagnoser = diagnoseInterviewRisks(results.understandJobIndustry, results.profileMatcher.fit);
      if (skillKey === "prepPlanner") results.prepPlanner = generatePreparationPlan(input.job, results.understandJobIndustry, results.profileMatcher.fit, results.riskDiagnoser, results.interviewRetrospective);
      if (skillKey === "coverLetterTailor") {
        const modelResult = coverLetterExecutor ? await coverLetterExecutor({ job: input.job, profile: input.profile, options: input.options }) : null;
        modelTrace = modelResult?._trace || { called: false, provider: "local-fallback", model: null, usage: null };
        results.coverLetterTailor = modelResult?.coverLetter || modelResult || createLocalCoverLetter(input);
      }
      trace.push({
        step: trace.length + 1,
        callIndex: callCounts[skillKey],
        skillKey,
        skillName: SKILL_REGISTRY[skillKey].name,
        executionMode: skillKey === "coverLetterTailor" && coverLetterExecutor
          ? "model-or-validation"
          : skillKey === "understandJobIndustry"
            ? roleUnderstandingExecutor ? "skill-contract/model-assisted" : "skill-contract/local-jd-stage"
            : skillKey === "interviewRetrospective"
              ? "skill-contract/deterministic-review"
              : "local-rule",
        status: "success",
        startedAt: stepStartedAt,
        durationMs: Math.round((performance.now() - start) * 100) / 100,
        inputSummary: summarizeInput(skillKey, { ...input, results }),
        outputSummary: summarizeOutput(results[skillKey]),
        model: modelTrace
      });
    } catch (error) {
      trace.push({ step: trace.length + 1, callIndex: callCounts[skillKey], skillKey, skillName: SKILL_REGISTRY[skillKey].name, status: "failed", startedAt: stepStartedAt, durationMs: Math.round((performance.now() - start) * 100) / 100, inputSummary: summarizeInput(skillKey, { ...input, results }), errorType: error.name || "AgentToolError", errorMessage: error.message });
      return finish({ status: "failed", error: error.message, routing, plan, input: publicInput, output: results }, trace);
    }
  }
  const needsClarification = Object.values(results).some((result) => result?.status === "needs_clarification");
  return finish({ status: needsClarification ? "needs_clarification" : "success", routing, plan, input: publicInput, output: results }, trace);
}
