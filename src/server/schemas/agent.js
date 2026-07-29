import { z } from "zod";
import { SKILL_KEYS } from "../../shared/skill-registry.js";

const optionalText = z.string().max(100_000).optional().default("");

export const JobSchema = z.object({
  id: z.string().optional(),
  company: z.string().max(300).optional().default(""),
  title: z.string().max(300).optional().default(""),
  type: z.string().max(300).optional().default(""),
  businessLine: z.string().max(500).optional().default(""),
  geography: z.string().max(300).optional().default(""),
  jdUrl: z.string().max(2_000).optional().default(""),
  jd: optionalText
}).passthrough();

export const ProfileSchema = z.object({
  target: z.string().max(500).optional().default(""),
  industry: z.string().max(500).optional().default(""),
  resume: optionalText,
  projects: optionalText,
  activeResumeName: z.string().max(500).optional().default(""),
  resumeFileName: z.string().max(500).optional().default("")
}).passthrough();

const ReviewModeSchema = z.enum(["quick_review", "full_review", "careerpilot_evaluation", "cross_round", "next_round"]);
const LooseObjectSchema = z.object({}).passthrough();

export const InterviewQuestionSchema = z.object({
  id: z.string().max(300).optional().default(""),
  title: z.string().max(2_000).optional().default(""),
  answer: optionalText,
  thinking: optionalText,
  gap: optionalText,
  nextAnswer: optionalText
}).passthrough();

export const InterviewSchema = z.object({
  mode: z.array(ReviewModeSchema).max(5).optional().default([]),
  roundId: z.string().max(300).optional().default(""),
  roundName: z.string().max(300).optional().default(""),
  roundDate: z.string().max(100).optional().default(""),
  format: z.string().max(300).optional().default(""),
  interviewer: z.string().max(500).optional().default(""),
  rawNotes: optionalText,
  sourceMaterial: LooseObjectSchema.optional().default({}),
  questions: z.array(InterviewQuestionSchema).max(200).optional().default([]),
  priorPredictions: z.array(z.string().max(2_000)).max(200).optional().default([]),
  priorPrepRunId: z.string().max(300).optional().default(""),
  priorPreparation: LooseObjectSchema.optional().default({}),
  preparationSnapshot: LooseObjectSchema.optional().default({}),
  previousRounds: z.array(LooseObjectSchema).max(20).optional().default([]),
  preserveRawText: z.boolean().optional().default(true),
  generateImprovedAnswers: z.boolean().optional().default(true)
}).passthrough();

export const ReviewInterviewInputSchema = z.object({
  schemaVersion: z.string().max(20).optional().default("1.0"),
  mode: z.array(ReviewModeSchema).max(5).optional().default([]),
  job: JobSchema,
  candidate: ProfileSchema.optional().default({ target: "", industry: "", resume: "", projects: "", activeResumeName: "", resumeFileName: "" }),
  priorPreparation: LooseObjectSchema.optional().default({}),
  interviewRound: z.object({
    id: z.string().max(300),
    title: z.string().max(300).optional().default("本轮面试"),
    date: z.string().max(100).optional().default(""),
    format: z.string().max(300).optional().default(""),
    interviewer: z.string().max(500).optional().default(""),
    notes: optionalText,
    sourceMaterial: z.object({
      asset: LooseObjectSchema.nullable().optional().default(null),
      extraction: LooseObjectSchema.nullable().optional().default(null),
      rawText: optionalText
    }).passthrough().optional().default({ asset: null, extraction: null, rawText: "" }),
    preparationSnapshot: LooseObjectSchema.optional().default({}),
    questionItems: z.array(InterviewQuestionSchema).max(200).default([])
  }).passthrough(),
  previousRounds: z.array(LooseObjectSchema).max(20).optional().default([]),
  options: z.object({
    outputLanguage: z.string().max(50).optional().default("zh-CN"),
    preserveRawText: z.boolean().optional().default(true),
    generateImprovedAnswers: z.boolean().optional().default(true)
  }).passthrough().optional().default({ outputLanguage: "zh-CN", preserveRawText: true, generateImprovedAnswers: true })
});

export const AgentRunInputSchema = z.object({
  query: z.string().trim().min(1, "请描述希望 Agent 完成的任务").max(2_000),
  job: JobSchema.default({ id: "", company: "", title: "", type: "", businessLine: "", geography: "", jdUrl: "", jd: "" }),
  profile: ProfileSchema.default({ target: "", industry: "", resume: "", projects: "", activeResumeName: "", resumeFileName: "" }),
  interview: InterviewSchema.optional().default({ mode: [], roundId: "", roundName: "", roundDate: "", format: "", interviewer: "", rawNotes: "", questions: [], priorPredictions: [], priorPrepRunId: "", priorPreparation: {}, preparationSnapshot: {}, previousRounds: [], preserveRawText: true, generateImprovedAnswers: true }),
  options: z.object({
    channel: z.string().max(200).optional().default("中文邮件 Cover Letter"),
    language: z.string().max(100).optional().default("跟随 JD"),
    arrivalDate: z.string().max(100).optional().default(""),
    daysPerWeek: z.string().max(100).optional().default(""),
    duration: z.string().max(100).optional().default("")
  }).passthrough().optional().default({ channel: "中文邮件 Cover Letter", language: "跟随 JD", arrivalDate: "", daysPerWeek: "", duration: "" }),
  requestedSkills: z.array(z.enum(SKILL_KEYS)).max(SKILL_KEYS.length).optional()
});

export function parseAgentRunInput(value) {
  const normalized = value && typeof value === "object" ? {
    ...value,
    requestedSkills: Array.isArray(value.requestedSkills)
      ? value.requestedSkills.map((key) => key === "interviewFeedbackAnalyzer" ? "interviewRetrospective" : key)
      : value.requestedSkills
  } : value;
  return AgentRunInputSchema.parse(normalized);
}

export function parseReviewInterviewInput(value) {
  return ReviewInterviewInputSchema.parse(value);
}

export function formatValidationError(error) {
  if (!(error instanceof z.ZodError)) return error.message || "请求校验失败";
  return error.issues.map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`).join("；");
}
