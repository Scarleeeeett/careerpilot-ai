import { SKILL_KEYS, SKILL_REGISTRY } from "../../shared/skill-registry.js";

const INTENTS = [
  ["coverLetterTailor", /cover\s*letter|求职信|开场白|私信|内推|自荐|投递文案|招呼/i],
  ["interviewRetrospective", /面试.*复盘|复盘.*(?:面试|一面|二面|三面|终面)|刚面试|面试记录|实际问题|真实问题|一面复盘|二面复盘|三面复盘|面试反馈|准备覆盖|岗位认知更新|多轮对比/i],
  ["riskDiagnoser", /风险|追问|问穿|短板|归因|雷区/i],
  ["prepPlanner", /准备(?!覆盖|质量|效果|命中|评估)|自我介绍|面试题|作战计划|行动计划|下一步|brief/i],
  ["profileMatcher", /匹配|简历|经历|证据|优势|缺口/i],
  ["understandJobIndustry", /\bjd\b|岗位|职责|能力|要求|做什么|行业|产业链|上下游|竞品|商业模式|业务线|公司.*产品/i]
];

function expandDependencies(selected) {
  const expanded = new Set();
  const visit = (key) => {
    for (const dependency of SKILL_REGISTRY[key].dependencies) visit(dependency);
    expanded.add(key);
  };
  selected.forEach(visit);
  return SKILL_KEYS.filter((key) => expanded.has(key));
}

export function planAgentTask(query, requestedSkills) {
  const selected = requestedSkills?.length
    ? requestedSkills
    : INTENTS.filter(([, pattern]) => pattern.test(query)).map(([key]) => key);
  if (!selected.length) {
    return { status: "needs_clarification", planner: "deterministic-planner", reason: "没有识别到当前 6 个 Skill 对应的任务，请说明要分析 JD、匹配简历、复盘面试、诊断风险、生成准备计划还是写求职文案。", selectedSkills: [], steps: [] };
  }
  const steps = expandDependencies([...new Set(selected)]);
  return {
    status: "ready",
    planner: "deterministic-planner",
    reason: selected.length > 1 ? "识别到组合意图，已按依赖关系生成多 Skill 执行计划。" : "已识别任务意图并补齐所需依赖。",
    selectedSkills: [...new Set(selected)],
    steps
  };
}
