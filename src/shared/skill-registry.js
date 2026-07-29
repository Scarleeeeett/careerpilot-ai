export const SKILL_KEYS = [
  "understandJobIndustry",
  "profileMatcher",
  "interviewRetrospective",
  "riskDiagnoser",
  "prepPlanner",
  "coverLetterTailor"
];

export const SKILL_REGISTRY = {
  understandJobIndustry: {
    name: "understand-job-industry",
    version: "1.0.0",
    purpose: "从公司、岗位和 JD 建立可追溯的岗位与行业理解，并输出业务线待确认项、岗位要求映射和研究问题。",
    dependencies: [],
    source: "skills/understand-job-industry/SKILL.md"
  },
  profileMatcher: {
    name: "match_candidate_evidence",
    version: "1.0.0",
    purpose: "只基于候选人资料识别证据覆盖、可迁移点和缺口。",
    dependencies: ["understandJobIndustry"],
    source: "skills/match-candidate-evidence/SKILL.md"
  },
  interviewRetrospective: {
    name: "interview-retrospective",
    version: "1.1.0",
    purpose: "从 Word 或音频提取真实面试问答，再生成逐题复盘、岗位认知更新、准备覆盖评测和下一轮行动。",
    dependencies: [],
    source: "skills/interview-retrospective/SKILL.md"
  },
  riskDiagnoser: {
    name: "diagnose_interview_risks",
    version: "1.0.0",
    purpose: "识别高概率追问、证据风险和禁止夸大的边界。",
    dependencies: ["understandJobIndustry", "profileMatcher"],
    source: "skills/diagnose-interview-risks/SKILL.md"
  },
  prepPlanner: {
    name: "generate_preparation_plan",
    version: "1.0.0",
    purpose: "把岗位、证据和风险转成可执行的面试准备任务。",
    dependencies: ["understandJobIndustry", "profileMatcher", "riskDiagnoser"],
    source: "skills/generate-preparation-plan/SKILL.md"
  },
  coverLetterTailor: {
    name: "coverletter-tailor",
    version: "1.0.0",
    purpose: "根据 JD、真实经历与发送渠道生成不夸大的求职沟通文案。",
    dependencies: [],
    source: "skills/coverletter-tailor/SKILL.md"
  }
};

export function publicSkillRegistry() {
  return Object.fromEntries(SKILL_KEYS.map((key) => [key, { key, ...SKILL_REGISTRY[key] }]));
}
