import { understandJobIndustry } from "./job-analysis.js";

export function validateCoverLetterInput({ job = {}, profile = {}, options = {} }) {
  const blockingQuestions = [];
  const optionalQuestions = [];
  const sourceText = `${profile.resume || ""}\n${profile.projects || ""}`.trim();
  const jd = String(job.jd || "").trim();
  const internship = /实习|intern/i.test(`${job.title || ""} ${jd}`);
  if (!jd) blockingQuestions.push("请先补充当前岗位的完整 JD。");
  if (!sourceText) blockingQuestions.push("请先选择并补充一份包含真实经历的简历或项目素材。");
  if (internship && !options.arrivalDate) blockingQuestions.push("请确认最早到岗时间。");
  if (internship && !options.daysPerWeek) blockingQuestions.push("请确认每周可实习天数。");
  if (internship && !options.duration) blockingQuestions.push("请确认可连续实习时长。");
  return { blockingQuestions, optionalQuestions, internship };
}

function selectEvidence(job, profile) {
  const sourceText = `${profile.projects || ""}\n${profile.resume || ""}`;
  const keywords = String(job.jd || "").match(/[A-Za-z][A-Za-z0-9+.#/-]{1,}|[\u4e00-\u9fa5]{2,6}/g) || [];
  return sourceText.split(/\r?\n|；|;/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 8 && !/@|(?:\+?86[- ]?)?1\d{10}|身份证|电话[:：]/i.test(line))
    .map((line, index) => ({ line, index, score: keywords.filter((word) => word.length > 1 && line.toLowerCase().includes(word.toLowerCase())).length }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3)
    .map((item) => item.line.slice(0, 140));
}

export function createLocalCoverLetter({ job, profile, options }) {
  const validation = validateCoverLetterInput({ job, profile, options });
  if (validation.blockingQuestions.length) {
    return { status: "needs_clarification", channel: options.channel, language: options.language, blockingQuestions: validation.blockingQuestions, optionalQuestions: validation.optionalQuestions, recommended: "", shorter: "" };
  }
  const jdProfile = understandJobIndustry(job);
  const evidence = selectEvidence(job, profile);
  const evidenceText = evidence.slice(0, 2).join("；");
  const availability = validation.internship ? `最早可于${options.arrivalDate}到岗，每周可实习${options.daysPerWeek}，可连续实习${options.duration}。` : "";
  return {
    status: "success",
    mode: "from_scratch",
    channel: options.channel,
    language: options.language,
    jdJudgment: `岗位更偏${jdProfile.roleType}，招聘方会重点判断候选人是否有与核心任务相符的真实证据。`,
    selectedEvidence: evidence.map((sourceEvidence) => ({ sourceEvidence, jobRelevance: "与 JD 核心任务存在关联", wordingBoundary: "保留原始责任强度" })),
    recommended: `您好，我希望申请${job.company || "贵司"}的${job.title || "目标"}岗位。我的相关经历包括：${evidenceText}。${availability}经历均来自当前所选简历，期待进一步沟通。`,
    shorter: `您好，我想申请${job.title || "该"}岗位。相关经历：${evidence[0] || evidenceText}。${availability}`,
    tradeoffs: ["只使用当前简历中的真实证据", "未补写未经确认的技能或成果"],
    blockingQuestions: [],
    optionalQuestions: validation.optionalQuestions,
    qualityChecks: ["已校验 JD 与简历来源", "未新增未经证实的经历"]
  };
}
