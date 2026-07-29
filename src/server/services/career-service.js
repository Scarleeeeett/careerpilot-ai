import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import { existsSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, isAbsolute, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parseAgentRunInput, parseReviewInterviewInput, formatValidationError } from "../schemas/agent.js";
import { runAgentTask } from "../agent/runner.js";
import { persistAgentRun, persistLegacyRun, saveFileAsset } from "../data/database.js";
import { SKILL_REGISTRY } from "../../shared/skill-registry.js";
import { parseDocumentFile } from "./file-parser.js";
import {
  extractInterviewQuestionCandidates,
  normalizeInterviewQuestion,
  parseSpeakerTranscript
} from "./interview-question-extractor.js";

const PROJECT_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const PUBLIC_ROOT = join(PROJECT_ROOT, "public");
loadDotEnv(join(PROJECT_ROOT, ".env"));

const PROVIDER = (process.env.AI_PROVIDER || (process.env.DEEPSEEK_API_KEY ? "deepseek" : "openai")).toLowerCase();
const MODEL = process.env.AI_MODEL || process.env.OPENAI_MODEL || process.env.DEEPSEEK_MODEL || (PROVIDER === "deepseek" ? "deepseek-v4-flash" : "gpt-4o-mini");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const OPENAI_TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";
const ASR_PROVIDER = (process.env.ASR_PROVIDER || (process.env.DASHSCOPE_API_KEY ? "aliyun" : OPENAI_API_KEY ? "openai" : "none")).toLowerCase();
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
const ASR_MODEL = process.env.ASR_MODEL || (ASR_PROVIDER === "aliyun" ? "paraformer-v2" : OPENAI_TRANSCRIBE_MODEL);
const ASR_DIARIZATION = !/^(?:0|false|no)$/i.test(process.env.ASR_DIARIZATION || "true");
const ASR_SPEAKER_COUNT = Math.max(2, Math.min(100, Number(process.env.ASR_SPEAKER_COUNT || 2)));
const DASHSCOPE_API_HOST = (process.env.DASHSCOPE_API_HOST || "https://dashscope.aliyuncs.com").replace(/\/+$/, "");
const PROXY_URL = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || "http://127.0.0.1:7890";
const MAX_JSON_BODY_BYTES = Number(process.env.MAX_JSON_BODY_BYTES || 8 * 1024 * 1024);
const MAX_INTERVIEW_SOURCE_BODY_BYTES = Number(process.env.MAX_INTERVIEW_SOURCE_BODY_BYTES || 34 * 1024 * 1024);
const execFileAsync = promisify(execFile);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function readRequestBody(req, maxBytes = MAX_JSON_BODY_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error(`请求体超过 ${maxBytes} 字节限制`);
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function cleanJsonText(text) {
  return String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function buildPrompt({ job, profile }) {
  return `
你是 CareerPilot AI 的求职分析 Workflow。请严格基于输入的 JD 和个人资料生成结构化 JSON。

重要边界：
- 不要编造用户没有提供的经历、指标、上线结果、A/B test、内部数据权限。
- 如果证据不足，必须写成 risk / missingEvidence，而不是替用户夸大。
- 输出必须服务于 AI 产品/产品经理求职准备。

当前岗位：
公司：${job.company || ""}
岗位：${job.title || ""}
方向：${job.type || ""}
状态：${job.status || ""}
JD：
${job.jd || ""}

个人资料：
目标岗位：${profile.target || ""}
目标行业：${profile.industry || ""}
简历文本：
${profile.resume || ""}
核心项目：
${profile.projects || ""}

请按以下 workflow 输出：
1. JD Parser：拆解岗位类型、核心职责、必备能力、加分能力、关键词。
2. Profile Matcher：把 JD 要求映射到个人资料，给出强匹配、可迁移匹配、短板和推荐主讲项目。
3. Risk Diagnoser：识别面试追问、风险点、不能夸大的边界、缺少证据。
4. Prep Planner：生成准备任务、1 分钟自我介绍角度、Interview Brief。

模块输入规则：
- jobUnderstanding 和 capabilityRequirements 主要基于 JD，不要强行引用个人简历。
- personalStrategy、prepFocus、applicationMaterials.coverLetter、applicationMaterials.selfIntroduction 必须同时结合 JD 和简历文本。
- 如果简历文本为空或证据不足，必须明确写出“缺少简历正文/缺少证据”，不要编造学校、公司、项目、指标或到岗时间。
- Cover Letter 和自我介绍只能使用个人资料中提供过的经历与项目。

同时必须把结果聚焦成求职者真正关心的 4 个问题：
1. 这个岗位是干什么的：业务背景、目标用户、可能负责的工作。
2. 它真正需要什么能力：必须准备、加分准备、隐藏考点。
3. 我应该怎么匹配它：主讲项目、推荐讲法、优势、短板、不要这样说。
4. 我接下来重点准备什么：30 分钟必做、2 小时深度准备、高概率面试问题。
5. 基于用户资料和岗位理解，写一段可用于投递消息的 Cover Letter，以及一段 60 秒中文自我介绍。

不要输出泛泛的 JD 总结。每一句都要服务于求职准备。
`.trim();
}

function buildRoleUnderstandingPrompt({ job, references = "" }) {
  return `
你是 CareerPilot AI 的「岗位理解 Skill」。你的任务不是复述 JD，而是帮助求职者理解一个陌生行业岗位到底在什么业务里、服务谁、为什么需要这个岗位。

输入：
公司：${job.company || ""}
岗位：${job.title || ""}
岗位方向：${job.type || ""}
JD：
${job.jd || ""}

用户补充参考资料/链接：
${references || "无"}

请输出合法 JSON，不要 Markdown。要求：
1. 明确区分「来自 JD 的事实」「基于公司/行业常识的推断」「需要继续核验的信息」。
2. 不要假装你实时浏览了网页；没有用户提供链接时，参考链接只能给官网/搜索建议，并标记为待核验。
3. 重点加深业务理解，不要只总结职责。
4. 输出要能帮助求职者面试时讲清：公司做什么、这个岗位在公司中台/业务链路里的占位、涉及哪些业务对象、可能具体做什么、需要补什么行业知识。

JSON 结构：
{
  "roleUnderstanding": {
    "companyBusiness": {
      "summary": "公司主营业务/产品/客户是谁",
      "businessModel": "公司大致如何创造价值或商业化",
      "sourceBasis": "这部分依据：JD/用户资料/公开常识/待核验"
    },
    "rolePositioning": {
      "oneSentence": "这个岗位在公司里的作用/占位",
      "orgLocation": "更像前台业务/中台效率/产品交付/客户运营/数据分析/研发支持中的哪类",
      "whyNeeded": "公司为什么需要这个岗位"
    },
    "businessMap": {
      "businessObjects": ["岗位会服务或影响的对象，如销售、运营、客户、车企、物流客户等"],
      "workflows": ["该岗位可能嵌入的业务流程"],
      "dataAndSystems": ["可能接触的数据、系统、工具、看板、CRM字段等"]
    },
    "likelyWork": [
      {
        "task": "可能负责的具体工作",
        "businessMeaning": "这项工作解决什么业务问题",
        "deliverable": "可能交付物"
      }
    ],
    "industryPrimer": {
      "mustKnowTerms": ["面试前必须理解的行业/业务术语"],
      "questionsToResearch": ["还需要调研的问题"],
      "interviewAngles": ["面试时可以主动表达的业务理解角度"]
    },
    "sourceLinks": [
      {
        "title": "参考资料名称或搜索建议",
        "url": "https://...",
        "type": "official/news/search/user-provided",
        "confidence": "high/medium/low",
        "note": "为什么参考它；如果只是搜索建议，要写待核验"
      }
    ]
  }
}
`.trim();
}

function buildSelfIntroductionPrompt({ job, profile, roleUnderstanding = null, options = {} }) {
  const scene = options.scene || "业务面";
  const length = options.length || "60秒";
  return `
你是 CareerPilot AI 的「自我介绍 Skill」。你的任务不是润色简历，而是为具体岗位生成一段面试开场叙事。

核心原则：
1. 自我介绍必须从岗位反推，先判断这个岗位想听候选人证明什么。
2. 只能使用简历/个人资料里真实出现的学校、经历、项目、技能；不要编造姓名、到岗时间、指标、客户、融资、上线结果。
3. 经历要翻译成岗位语言，而不是复述简历。每段经历都要说明它为什么对这个岗位有用。
4. 语气要像真人面试可说出口，清楚、克制、有判断，不要营销腔、不要“赋能/闭环/抓手”等空话堆砌。
5. 如果岗位是早期/创业/0-1/Agent/AI 产品，要突出复杂系统抽象、规则设计、PMF/用户验证、AI 链路理解；如果简历没有对应证据，必须提醒风险。

生成参数：
面试场景：${scene}
目标时长：${length}

当前岗位：
公司：${job.company || ""}
岗位：${job.title || ""}
方向：${job.type || ""}
JD：
${job.jd || ""}

岗位理解 Skill 结果：
${JSON.stringify(roleUnderstanding || {}, null, 2)}

个人资料：
目标岗位：${profile.target || ""}
目标行业：${profile.industry || ""}
简历版本：${profile.activeResumeName || profile.resumeFileName || ""}
简历文本：
${profile.resume || ""}
核心项目/补充素材：
${profile.projects || ""}

请输出合法 JSON，不要 Markdown。JSON 结构：
{
  "selfIntroduction": {
    "scene": "${scene}",
    "length": "${length}",
    "roleDemand": "这个岗位最想听候选人证明什么",
    "positioning": "一句话候选人定位，不要只是学校+专业",
    "selectedEvidence": [
      {
        "resumeEvidence": "简历中的真实经历/项目",
        "jobRelevance": "它对应岗位里的什么要求",
        "talkingPoint": "面试里应该怎么讲"
      }
    ],
    "motivation": "为什么投这家公司/岗位，必须贴合公司业务或岗位命题",
    "script": "按目标时长生成的完整中文自我介绍，可直接念",
    "versions": {
      "30秒": "更短版本",
      "60秒": "标准版本",
      "90秒": "更完整版本"
    },
    "riskBoundaries": ["不能夸大的点/容易被追问的点"],
    "followUpQuestions": ["面试官可能顺着自我介绍追问的问题"]
  }
}
`.trim();
}

function validateCoverLetterInput({ job = {}, profile = {}, options = {} }) {
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

  if (/英语|英文|海外|出海|english|global/i.test(jd) && !/CET|TOEFL|IELTS|TEM|英语|英文|海外/i.test(sourceText)) {
    optionalQuestions.push("JD 涉及英语或海外业务；如有语言成绩或英文工作经历，可补充后再增强文案。");
  }
  const toolHits = [...new Set((jd.match(/SQL|Python|Axure|Figma|Sketch|XMind/gi) || []).map((item) => item.toUpperCase()))];
  const missingTools = toolHits.filter((tool) => !new RegExp(tool, "i").test(sourceText));
  if (missingTools.length) {
    optionalQuestions.push(`JD 提到 ${missingTools.join("、")}；如真实使用过，请补充具体使用场景，否则文案会省略。`);
  }
  return { blockingQuestions, optionalQuestions, internship };
}

function buildCoverLetterPrompt({ job, profile, options = {}, validation }) {
  return `
你是 CareerPilot AI 的 Cover Letter Tailor Skill。请根据目标 JD 和用户明确选择的简历/项目素材，生成可直接发送的求职沟通文案。

事实边界：
- 只能使用下面输入中明确出现的事实，不得补写学校、公司、项目、数据、工具、语言成绩或到岗条件。
- “参与”不得改成“主导”，“熟悉”不得改成“精通”。
- 只选择 1–3 段最匹配且经得住追问的经历，不要堆砌整份简历。
- 不要把岗位要求反写成用户已经具备的能力。
- 不泄露手机号、邮箱、证件号等非必要个人信息。

目标岗位：
公司：${job.company || ""}
岗位：${job.title || ""}
方向：${job.type || ""}
JD：
${job.jd || ""}

用户授权素材：
目标岗位：${profile.target || ""}
目标行业：${profile.industry || ""}
简历版本：${profile.activeResumeName || profile.resumeFileName || ""}
简历正文：
${profile.resume || ""}
项目补充：
${profile.projects || ""}

生成参数：
渠道：${options.channel || "中文邮件 Cover Letter"}
语言：${options.language || "跟随 JD"}
最早到岗：${options.arrivalDate || "未提供"}
每周实习：${options.daysPerWeek || "未提供"}
连续时长：${options.duration || "未提供"}
可选补充问题：${validation.optionalQuestions.join("；") || "无"}

渠道长度：BOSS/牛客/微信 80–160 汉字；内推自荐 120–220 汉字；中文邮件 250–450 汉字；英文 Cover Letter 200–350 个英文单词；极简招呼 50–90 汉字。
默认跟随 JD 主语言。英文求职信使用英文结构，不要直译中文开场白。

输出合法 JSON，不要 Markdown：
{
  "coverLetter": {
    "status": "success",
    "mode": "from_scratch",
    "channel": "实际渠道",
    "language": "中文或英文",
    "jdJudgment": "岗位更偏向什么，招聘方最想快速确认什么",
    "selectedEvidence": [
      { "sourceEvidence": "用户素材中的原始事实", "jobRelevance": "对应哪项岗位要求", "wordingBoundary": "表达边界" }
    ],
    "recommended": "推荐版正文",
    "shorter": "更短版正文",
    "tradeoffs": ["保留或弱化某项内容的原因"],
    "optionalQuestions": ["可进一步增强文案但不阻塞生成的问题"],
    "qualityChecks": ["已完成的事实与渠道检查"]
  }
}
`.trim();
}

const analysisSchema = {
  type: "object",
  definitions: {
    keywordHits: {
      type: "object",
      additionalProperties: false,
      required: ["ai", "data", "user", "business", "delivery"],
      properties: {
        ai: { type: "array", items: { type: "string" } },
        data: { type: "array", items: { type: "string" } },
        user: { type: "array", items: { type: "string" } },
        business: { type: "array", items: { type: "string" } },
        delivery: { type: "array", items: { type: "string" } }
      }
    }
  },
  additionalProperties: false,
  required: ["analysis"],
  properties: {
    analysis: {
      type: "object",
      additionalProperties: false,
      required: ["roleType", "coreTasks", "requiredSkills", "riskQuestions", "prepSuggestions", "score", "jdHits", "profileHits", "workflow", "focused"],
      properties: {
        roleType: { type: "string" },
        coreTasks: { type: "array", items: { type: "string" } },
        requiredSkills: { type: "array", items: { type: "string" } },
        riskQuestions: { type: "array", items: { type: "string" } },
        prepSuggestions: { type: "array", items: { type: "string" } },
        score: { type: "number" },
        jdHits: { "$ref": "#/definitions/keywordHits" },
        profileHits: { "$ref": "#/definitions/keywordHits" },
        workflow: {
          type: "object",
          additionalProperties: false,
          required: ["understandJobIndustry", "profileMatcher", "riskDiagnoser", "prepPlanner"],
          properties: {
            understandJobIndustry: {
              type: "object",
              additionalProperties: false,
              required: ["roleType", "coreTasks", "requiredSkills", "bonusSkills", "businessKeywords", "aiKeywords", "dataKeywords", "rawKeywordHits"],
              properties: {
                roleType: { type: "string" },
                coreTasks: { type: "array", items: { type: "string" } },
                requiredSkills: { type: "array", items: { type: "string" } },
                bonusSkills: { type: "array", items: { type: "string" } },
                businessKeywords: { type: "array", items: { type: "string" } },
                aiKeywords: { type: "array", items: { type: "string" } },
                dataKeywords: { type: "array", items: { type: "string" } },
                rawKeywordHits: { "$ref": "#/definitions/keywordHits" }
              }
            },
            profileMatcher: {
              type: "object",
              additionalProperties: false,
              required: ["userProfile", "fit"],
              properties: {
                userProfile: {
                  type: "object",
                  additionalProperties: false,
                  required: ["targetRoles", "targetIndustries", "coreProjects", "productSignals", "aiSignals", "dataSignals", "businessSignals", "rawKeywordHits"],
                  properties: {
                    targetRoles: { type: "array", items: { type: "string" } },
                    targetIndustries: { type: "array", items: { type: "string" } },
                    coreProjects: { type: "array", items: { type: "string" } },
                    productSignals: { type: "array", items: { type: "string" } },
                    aiSignals: { type: "array", items: { type: "string" } },
                    dataSignals: { type: "array", items: { type: "string" } },
                    businessSignals: { type: "array", items: { type: "string" } },
                    rawKeywordHits: { "$ref": "#/definitions/keywordHits" }
                  }
                },
                fit: {
                  type: "object",
                  additionalProperties: false,
                  required: ["score", "strongMatches", "transferableMatches", "gaps", "recommendedProjects"],
                  properties: {
                    score: { type: "number" },
                    strongMatches: { type: "array", items: { type: "string" } },
                    transferableMatches: { type: "array", items: { type: "string" } },
                    gaps: { type: "array", items: { type: "string" } },
                    recommendedProjects: { type: "array", items: { type: "string" } }
                  }
                }
              }
            },
            riskDiagnoser: {
              type: "object",
              additionalProperties: false,
              required: ["likelyQuestions", "riskPoints", "boundaries", "missingEvidence"],
              properties: {
                likelyQuestions: { type: "array", items: { type: "string" } },
                riskPoints: { type: "array", items: { type: "string" } },
                boundaries: { type: "array", items: { type: "string" } },
                missingEvidence: { type: "array", items: { type: "string" } }
              }
            },
            prepPlanner: {
              type: "object",
              additionalProperties: false,
              required: ["todoList", "oneMinuteIntroAngle", "interviewBrief", "prepSuggestions"],
              properties: {
                todoList: { type: "array", items: { type: "string" } },
                oneMinuteIntroAngle: { type: "string" },
                interviewBrief: { type: "array", items: { type: "string" } },
                prepSuggestions: { type: "array", items: { type: "string" } }
              }
            }
          }
        },
        focused: {
          type: "object",
          additionalProperties: false,
          required: ["summary", "jobUnderstanding", "capabilityRequirements", "personalStrategy", "prepFocus", "applicationMaterials"],
          properties: {
            summary: {
              type: "object",
              additionalProperties: false,
              required: ["roleType", "priority", "fitLevel", "prepFocus"],
              properties: {
                roleType: { type: "string" },
                priority: { type: "string" },
                fitLevel: { type: "string" },
                prepFocus: { type: "string" }
              }
            },
            jobUnderstanding: {
              type: "object",
              additionalProperties: false,
              required: ["roleSummary", "companyPositioning", "businessContext", "targetUsers", "likelyResponsibilities"],
              properties: {
                roleSummary: { type: "string" },
                companyPositioning: { type: "string" },
                businessContext: { type: "string" },
                targetUsers: { type: "array", items: { type: "string" } },
                likelyResponsibilities: { type: "array", items: { type: "string" } }
              }
            },
            capabilityRequirements: {
              type: "object",
              additionalProperties: false,
              required: ["mustHave", "niceToHave", "hiddenExpectations"],
              properties: {
                mustHave: { type: "array", items: { type: "string" } },
                niceToHave: { type: "array", items: { type: "string" } },
                hiddenExpectations: { type: "array", items: { type: "string" } }
              }
            },
            personalStrategy: {
              type: "object",
              additionalProperties: false,
              required: ["mainProject", "recommendedFraming", "advantages", "gaps", "avoidSaying"],
              properties: {
                mainProject: { type: "string" },
                recommendedFraming: { type: "string" },
                advantages: { type: "array", items: { type: "string" } },
                gaps: { type: "array", items: { type: "string" } },
                avoidSaying: { type: "array", items: { type: "string" } }
              }
            },
            prepFocus: {
              type: "object",
              additionalProperties: false,
              required: ["thirtyMinutePlan", "twoHourPlan", "likelyQuestions"],
              properties: {
                thirtyMinutePlan: { type: "array", items: { type: "string" } },
                twoHourPlan: { type: "array", items: { type: "string" } },
                likelyQuestions: { type: "array", items: { type: "string" } }
              }
            },
            applicationMaterials: {
              type: "object",
              additionalProperties: false,
              required: ["coverLetter", "selfIntroduction"],
              properties: {
                coverLetter: { type: "string" },
                selfIntroduction: { type: "string" }
              }
            }
          }
        }
      }
    }
  }
};

async function callOpenAI(payload) {
  if (!OPENAI_API_KEY) {
    throw new Error("缺少 OPENAI_API_KEY 环境变量");
  }

  const data = await postJson("https://api.openai.com/v1/responses", {
      model: MODEL,
      input: [
        {
          role: "system",
          content: "你是严谨的 AI 产品求职教练。必须输出符合 schema 的中文 JSON，不要输出多余解释。"
        },
        {
          role: "user",
          content: buildPrompt(payload)
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "careerpilot_analysis",
          strict: true,
          schema: analysisSchema
        }
      }
    }, {
      "Authorization": `Bearer ${OPENAI_API_KEY}`
  });

  const text = data.output_text
    || data.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
  if (!text) {
    throw new Error("OpenAI 返回为空");
  }
  return JSON.parse(cleanJsonText(text));
}

async function callDeepSeek(payload) {
  if (!DEEPSEEK_API_KEY) {
    throw new Error("缺少 DEEPSEEK_API_KEY 环境变量");
  }

  const prompt = `${buildPrompt(payload)}

请只输出 JSON，不要 Markdown，不要解释。JSON 必须符合这个顶层结构：
{
  "analysis": {
    "roleType": "string",
    "coreTasks": ["string"],
    "requiredSkills": ["string"],
    "riskQuestions": ["string"],
    "prepSuggestions": ["string"],
    "score": 0,
    "jdHits": {"ai":[],"data":[],"user":[],"business":[],"delivery":[]},
    "profileHits": {"ai":[],"data":[],"user":[],"business":[],"delivery":[]},
    "workflow": {
      "understandJobIndustry": {
        "roleType": "string",
        "coreTasks": ["string"],
        "requiredSkills": ["string"],
        "bonusSkills": ["string"],
        "businessKeywords": ["string"],
        "aiKeywords": ["string"],
        "dataKeywords": ["string"],
        "rawKeywordHits": {"ai":[],"data":[],"user":[],"business":[],"delivery":[]}
      },
      "profileMatcher": {
        "userProfile": {
          "targetRoles": ["string"],
          "targetIndustries": ["string"],
          "coreProjects": ["string"],
          "productSignals": ["string"],
          "aiSignals": ["string"],
          "dataSignals": ["string"],
          "businessSignals": ["string"],
          "rawKeywordHits": {"ai":[],"data":[],"user":[],"business":[],"delivery":[]}
        },
        "fit": {
          "score": 0,
          "strongMatches": ["string"],
          "transferableMatches": ["string"],
          "gaps": ["string"],
          "recommendedProjects": ["string"]
        }
      },
      "riskDiagnoser": {
        "likelyQuestions": ["string"],
        "riskPoints": ["string"],
        "boundaries": ["string"],
        "missingEvidence": ["string"]
      },
      "prepPlanner": {
        "todoList": ["string"],
        "oneMinuteIntroAngle": "string",
        "interviewBrief": ["string"],
        "prepSuggestions": ["string"]
      }
    },
    "focused": {
      "summary": {
        "roleType": "string",
        "priority": "高/中/低",
        "fitLevel": "强匹配/可冲/需要补强/不建议",
        "prepFocus": "string"
      },
      "jobUnderstanding": {
        "roleSummary": "string",
        "companyPositioning": "string",
        "businessContext": "string",
        "targetUsers": ["string"],
        "likelyResponsibilities": ["string"]
      },
      "capabilityRequirements": {
        "mustHave": ["string"],
        "niceToHave": ["string"],
        "hiddenExpectations": ["string"]
      },
      "personalStrategy": {
        "mainProject": "string",
        "recommendedFraming": "string",
        "advantages": ["string"],
        "gaps": ["string"],
        "avoidSaying": ["string"]
      },
      "prepFocus": {
        "thirtyMinutePlan": ["string"],
        "twoHourPlan": ["string"],
        "likelyQuestions": ["string"]
      },
      "applicationMaterials": {
        "coverLetter": "string",
        "selfIntroduction": "string"
      }
    }
  }
}`;

  const data = await postJson("https://api.deepseek.com/chat/completions", {
    model: MODEL,
    messages: [
      {
        role: "system",
        content: "你是严谨的 AI 产品求职教练。你必须输出合法 json。不要输出 Markdown，不要输出解释。"
      },
      {
        role: "user",
        content: prompt
      }
    ],
    response_format: { type: "json_object" },
    stream: false,
    max_tokens: 6000
  }, {
    "Authorization": `Bearer ${DEEPSEEK_API_KEY}`
  });

  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("DeepSeek 返回为空");
  }
  const result = JSON.parse(cleanJsonText(text));
  normalizeAnalysis(result.analysis);
  return result;
}

function emptyHits() {
  return { ai: [], data: [], user: [], business: [], delivery: [] };
}

function normalizeAnalysis(analysis) {
  analysis.score = Number(analysis.score || analysis.workflow?.profileMatcher?.fit?.score || 0);
  analysis.jdHits = { ...emptyHits(), ...(analysis.jdHits || {}) };
  analysis.profileHits = { ...emptyHits(), ...(analysis.profileHits || {}) };
  analysis.workflow = analysis.workflow || {};
  analysis.workflow.understandJobIndustry = analysis.workflow.understandJobIndustry || analysis.workflow.jdParser || {};
  analysis.workflow.understandJobIndustry.rawKeywordHits = { ...emptyHits(), ...(analysis.workflow.understandJobIndustry.rawKeywordHits || analysis.jdHits) };
  analysis.workflow.profileMatcher.userProfile.rawKeywordHits = { ...emptyHits(), ...(analysis.workflow.profileMatcher.userProfile.rawKeywordHits || analysis.profileHits) };
  analysis.riskQuestions = analysis.riskQuestions || analysis.workflow.riskDiagnoser.likelyQuestions || [];
  analysis.prepSuggestions = analysis.prepSuggestions || analysis.workflow.prepPlanner.prepSuggestions || [];
  analysis.focused = analysis.focused || null;
  if (analysis.focused) {
    analysis.focused.jobUnderstanding = analysis.focused.jobUnderstanding || {};
    analysis.focused.jobUnderstanding.companyPositioning = analysis.focused.jobUnderstanding.companyPositioning || "公司定位信息不足，需要结合官网和产品线补充。";
    analysis.focused.applicationMaterials = analysis.focused.applicationMaterials || {
      coverLetter: "",
      selfIntroduction: ""
    };
  }
}

async function callModel(payload) {
  if (PROVIDER === "deepseek") return callDeepSeek(payload);
  return callOpenAI(payload);
}

async function callRoleUnderstanding(payload) {
  const prompt = buildRoleUnderstandingPrompt(payload);
  if (PROVIDER === "deepseek") {
    if (!DEEPSEEK_API_KEY) throw new Error("缺少 DEEPSEEK_API_KEY 环境变量");
    const data = await postJson("https://api.deepseek.com/chat/completions", {
      model: MODEL,
      messages: [
        { role: "system", content: "你是严谨的岗位业务研究助手。必须输出合法 JSON，不要 Markdown，不要解释。" },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      stream: false,
      max_tokens: 3000
    }, {
      "Authorization": `Bearer ${DEEPSEEK_API_KEY}`
    });
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("DeepSeek 返回为空");
    const result = JSON.parse(cleanJsonText(text));
    result._trace = { called: true, provider: PROVIDER, model: MODEL, usage: data.usage || null };
    return result;
  }
  if (!OPENAI_API_KEY) throw new Error("缺少 OPENAI_API_KEY 环境变量");
  const data = await postJson("https://api.openai.com/v1/responses", {
    model: MODEL,
    input: [
      { role: "system", content: "你是严谨的岗位业务研究助手。必须输出合法 JSON，不要 Markdown，不要解释。" },
      { role: "user", content: prompt }
    ],
    text: { format: { type: "json_object" } }
  }, {
    "Authorization": `Bearer ${OPENAI_API_KEY}`
  });
  const text = data.output_text
    || data.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
  if (!text) throw new Error("OpenAI 返回为空");
  const result = JSON.parse(cleanJsonText(text));
  result._trace = { called: true, provider: PROVIDER, model: MODEL, usage: data.usage || null };
  return result;
}

async function callSelfIntroduction(payload) {
  const prompt = buildSelfIntroductionPrompt(payload);
  if (PROVIDER === "deepseek") {
    if (!DEEPSEEK_API_KEY) throw new Error("缺少 DEEPSEEK_API_KEY 环境变量");
    const data = await postJson("https://api.deepseek.com/chat/completions", {
      model: MODEL,
      messages: [
        { role: "system", content: "你是严谨的 AI 产品面试教练。必须输出合法 JSON，不要 Markdown，不要解释。" },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      stream: false,
      max_tokens: 3500
    }, {
      "Authorization": `Bearer ${DEEPSEEK_API_KEY}`
    });
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("DeepSeek 返回为空");
    return JSON.parse(cleanJsonText(text));
  }
  if (!OPENAI_API_KEY) throw new Error("缺少 OPENAI_API_KEY 环境变量");
  const data = await postJson("https://api.openai.com/v1/responses", {
    model: MODEL,
    input: [
      { role: "system", content: "你是严谨的 AI 产品面试教练。必须输出合法 JSON，不要 Markdown，不要解释。" },
      { role: "user", content: prompt }
    ],
    text: { format: { type: "json_object" } }
  }, {
    "Authorization": `Bearer ${OPENAI_API_KEY}`
  });
  const text = data.output_text
    || data.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
  if (!text) throw new Error("OpenAI 返回为空");
  return JSON.parse(cleanJsonText(text));
}

async function callCoverLetter(payload) {
  const validation = validateCoverLetterInput(payload);
  if (validation.blockingQuestions.length) {
    return {
      _trace: { called: false, provider: PROVIDER, model: MODEL, usage: null, reason: "input_validation" },
      coverLetter: {
        status: "needs_clarification",
        mode: "from_scratch",
        channel: payload.options?.channel || "中文邮件 Cover Letter",
        language: payload.options?.language || "跟随 JD",
        blockingQuestions: validation.blockingQuestions,
        optionalQuestions: validation.optionalQuestions,
        recommended: "",
        shorter: ""
      }
    };
  }
  const prompt = buildCoverLetterPrompt({ ...payload, validation });
  let result;
  let modelUsage = null;
  if (PROVIDER === "deepseek") {
    if (!DEEPSEEK_API_KEY) throw new Error("缺少 DEEPSEEK_API_KEY 环境变量");
    const data = await postJson("https://api.deepseek.com/chat/completions", {
      model: MODEL,
      messages: [
        { role: "system", content: "你是严谨的求职沟通文案助手。必须忠于用户素材并输出合法 JSON，不要 Markdown，不要解释。" },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      stream: false,
      max_tokens: 3200
    }, {
      "Authorization": `Bearer ${DEEPSEEK_API_KEY}`
    });
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("DeepSeek 返回为空");
    result = JSON.parse(cleanJsonText(text));
    modelUsage = data.usage || null;
  } else {
    if (!OPENAI_API_KEY) throw new Error("缺少 OPENAI_API_KEY 环境变量");
    const data = await postJson("https://api.openai.com/v1/responses", {
      model: MODEL,
      input: [
        { role: "system", content: "你是严谨的求职沟通文案助手。必须忠于用户素材并输出合法 JSON，不要 Markdown，不要解释。" },
        { role: "user", content: prompt }
      ],
      text: { format: { type: "json_object" } }
    }, {
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    });
    const text = data.output_text
      || data.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
    if (!text) throw new Error("OpenAI 返回为空");
    result = JSON.parse(cleanJsonText(text));
    modelUsage = data.usage || null;
  }
  result.coverLetter = result.coverLetter || result;
  result.coverLetter.status = "success";
  result.coverLetter.optionalQuestions = result.coverLetter.optionalQuestions || validation.optionalQuestions;
  result._trace = { called: true, provider: PROVIDER, model: MODEL, usage: modelUsage };
  return result;
}

function postJson(url, payload, headers = {}) {
  const body = JSON.stringify(payload);
  const target = new URL(url);
  const requestHeaders = {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    ...headers
  };

  return new Promise((resolve, reject) => {
    const handleResponse = (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text };
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(data.error?.message || `HTTP ${res.statusCode}: ${text.slice(0, 300)}`));
          return;
        }
        resolve(data);
      });
    };

    if (PROXY_URL) {
      const normalizedProxy = PROXY_URL.startsWith("http") ? PROXY_URL : `http://${PROXY_URL}`;
      const proxy = new URL(normalizedProxy);
      const connectReq = http.request({
        host: proxy.hostname,
        port: Number(proxy.port || 80),
        method: "CONNECT",
        path: `${target.hostname}:443`,
        timeout: 30000
      });

      connectReq.on("connect", (res, socket) => {
        if (res.statusCode !== 200) {
          socket.destroy();
          reject(new Error(`代理连接失败：HTTP ${res.statusCode}`));
          return;
        }
        const secureSocket = tls.connect({
          socket,
          servername: target.hostname
        });
        secureSocket.on("secureConnect", () => {
          const req = https.request({
            host: target.hostname,
            path: `${target.pathname}${target.search}`,
            method: "POST",
            headers: requestHeaders,
            createConnection: () => secureSocket
          }, handleResponse);
          req.on("error", reject);
          req.write(body);
          req.end();
        });
        secureSocket.on("error", reject);
      });

      connectReq.on("timeout", () => {
        connectReq.destroy(new Error("代理连接超时"));
      });
      connectReq.on("error", reject);
      connectReq.end();
      return;
    }

    const req = https.request({
      hostname: target.hostname,
      path: `${target.pathname}${target.search}`,
      method: "POST",
      headers: requestHeaders,
      timeout: 30000
    }, handleResponse);

    req.on("timeout", () => {
      req.destroy(new Error("OpenAI 连接超时"));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function buildMultipartBody({ fields = {}, file }) {
  const boundary = `----CareerPilot${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  const chunks = [];
  const append = (value) => chunks.push(Buffer.from(value, "utf8"));
  for (const [name, value] of Object.entries(fields)) {
    append(`--${boundary}\r\nContent-Disposition: form-data; name="${String(name).replace(/["\r\n]/g, "")}"\r\n\r\n${value}\r\n`);
  }
  const safeName = String(file.fileName || "interview-audio").replace(/["\r\n]/g, "");
  append(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeName}"\r\nContent-Type: ${file.mimeType || "application/octet-stream"}\r\n\r\n`);
  chunks.push(file.buffer);
  append(`\r\n--${boundary}--\r\n`);
  return { body: Buffer.concat(chunks), boundary };
}

function postMultipart(url, payload, headers = {}) {
  const { body, boundary } = buildMultipartBody(payload);
  const target = new URL(url);
  const requestHeaders = {
    "Content-Type": `multipart/form-data; boundary=${boundary}`,
    "Content-Length": body.length,
    ...headers
  };
  return new Promise((resolve, reject) => {
    const handleResponse = (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let data;
        try { data = JSON.parse(text); } catch { data = { raw: text }; }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(data.error?.message || `HTTP ${res.statusCode}: ${text.slice(0, 300)}`));
          return;
        }
        resolve(data);
      });
    };
    const send = (requestOptions) => {
      const req = https.request({ ...requestOptions, method: "POST", headers: requestHeaders }, handleResponse);
      req.setTimeout(120000, () => req.destroy(new Error("音频转写连接超时")));
      req.on("error", reject);
      req.end(body);
    };
    if (PROXY_URL) {
      const normalizedProxy = PROXY_URL.startsWith("http") ? PROXY_URL : `http://${PROXY_URL}`;
      const proxy = new URL(normalizedProxy);
      const connectReq = http.request({ host: proxy.hostname, port: Number(proxy.port || 80), method: "CONNECT", path: `${target.hostname}:443`, timeout: 30000 });
      connectReq.on("connect", (res, socket) => {
        if (res.statusCode !== 200) {
          socket.destroy();
          reject(new Error(`代理连接失败：HTTP ${res.statusCode}`));
          return;
        }
        const secureSocket = tls.connect({ socket, servername: target.hostname });
        secureSocket.on("secureConnect", () => send({ host: target.hostname, path: `${target.pathname}${target.search}`, createConnection: () => secureSocket }));
        secureSocket.on("error", reject);
      });
      connectReq.on("timeout", () => connectReq.destroy(new Error("代理连接超时")));
      connectReq.on("error", reject);
      connectReq.end();
      return;
    }
    send({ hostname: target.hostname, path: `${target.pathname}${target.search}` });
  });
}

function requestJsonWithMethod(url, { method = "GET", headers = {}, body = null, timeoutMs = 120000 } = {}) {
  const target = new URL(url);
  const payload = body === null ? null : Buffer.isBuffer(body) ? body : Buffer.from(String(body), "utf8");
  const requestHeaders = {
    ...headers,
    ...(payload ? { "Content-Length": payload.length } : {})
  };

  return new Promise((resolve, reject) => {
    const handleResponse = (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text };
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(data.error?.message || data.message || `${data.code ? `${data.code}: ` : ""}HTTP ${res.statusCode}: ${text.slice(0, 500)}`));
          return;
        }
        resolve(data);
      });
    };

    const send = (requestOptions) => {
      const req = https.request({ ...requestOptions, method, headers: requestHeaders }, handleResponse);
      req.setTimeout(timeoutMs, () => req.destroy(new Error(`请求超时：${target.hostname}`)));
      req.on("error", reject);
      if (payload) req.write(payload);
      req.end();
    };

    if (PROXY_URL) {
      const normalizedProxy = PROXY_URL.startsWith("http") ? PROXY_URL : `http://${PROXY_URL}`;
      const proxy = new URL(normalizedProxy);
      const connectReq = http.request({
        host: proxy.hostname,
        port: Number(proxy.port || 80),
        method: "CONNECT",
        path: `${target.hostname}:443`,
        timeout: 30000
      });
      connectReq.on("connect", (res, socket) => {
        if (res.statusCode !== 200) {
          socket.destroy();
          reject(new Error(`代理连接失败：HTTP ${res.statusCode}`));
          return;
        }
        const secureSocket = tls.connect({ socket, servername: target.hostname });
        secureSocket.on("secureConnect", () => send({
          host: target.hostname,
          path: `${target.pathname}${target.search}`,
          createConnection: () => secureSocket
        }));
        secureSocket.on("error", reject);
      });
      connectReq.on("timeout", () => connectReq.destroy(new Error("代理连接超时")));
      connectReq.on("error", reject);
      connectReq.end();
      return;
    }

    send({ hostname: target.hostname, path: `${target.pathname}${target.search}` });
  });
}

async function prepareAliyunDiarizationAudio(buffer, fileName) {
  if (!ASR_DIARIZATION) {
    return {
      buffer,
      fileName,
      mimeType: "application/octet-stream",
      cleanup: async () => {}
    };
  }

  if (process.platform !== "win32") {
    throw new Error("当前自动说话人分离需要在 Windows 上先将音频转为单声道");
  }

  const tempDirectory = await mkdtemp(join(tmpdir(), "careerpilot-asr-"));
  const inputExtension = extname(fileName).toLowerCase() || ".m4a";
  const inputPath = join(tempDirectory, `input${inputExtension}`);
  const outputPath = join(tempDirectory, "interview-mono.m4a");
  const scriptPath = join(PROJECT_ROOT, "scripts", "transcode-audio-mono.ps1");
  await writeFile(inputPath, buffer);
  try {
    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", scriptPath,
      "-InputPath", inputPath,
      "-OutputPath", outputPath
    ], { windowsHide: true, timeout: 10 * 60 * 1000, maxBuffer: 1024 * 1024 });
    return {
      buffer: await readFile(outputPath),
      fileName: "interview-mono.m4a",
      mimeType: "audio/mp4",
      cleanup: () => rm(tempDirectory, { recursive: true, force: true })
    };
  } catch (error) {
    await rm(tempDirectory, { recursive: true, force: true });
    throw new Error(`音频单声道转换失败：${error.stderr || error.message}`);
  }
}

async function uploadAliyunTemporaryFile(file) {
  const policyResponse = await requestJsonWithMethod(
    `${DASHSCOPE_API_HOST}/api/v1/uploads?action=getPolicy&model=${encodeURIComponent(ASR_MODEL)}`,
    { headers: { Authorization: `Bearer ${DASHSCOPE_API_KEY}`, "Content-Type": "application/json" } }
  );
  const policy = policyResponse.data;
  if (!policy?.upload_host || !policy?.upload_dir) {
    throw new Error("百炼没有返回有效的临时文件上传凭证");
  }
  const maximumBytes = Number(policy.max_file_size_mb || 100) * 1024 * 1024;
  if (file.buffer.length > maximumBytes) {
    throw new Error(`转码后的音频超过百炼临时上传限制（${policy.max_file_size_mb || 100} MB）`);
  }
  const safeFileName = `interview-${Date.now()}.m4a`;
  const key = `${policy.upload_dir}/${safeFileName}`;
  await postMultipart(policy.upload_host, {
    fields: {
      OSSAccessKeyId: policy.oss_access_key_id,
      Signature: policy.signature,
      policy: policy.policy,
      "x-oss-object-acl": policy.x_oss_object_acl,
      "x-oss-forbid-overwrite": policy.x_oss_forbid_overwrite,
      key,
      success_action_status: "200"
    },
    file: { buffer: file.buffer, fileName: safeFileName, mimeType: file.mimeType }
  });
  return `oss://${key}`;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runAliyunTranscription(ossUrl) {
  const commonHeaders = {
    Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
    "X-DashScope-OssResourceResolve": "enable"
  };
  const parameters = {
    channel_id: [0],
    language_hints: ["zh", "en"],
    disfluency_removal_enabled: false,
    timestamp_alignment_enabled: true,
    diarization_enabled: ASR_DIARIZATION
  };
  if (ASR_DIARIZATION) parameters.speaker_count = ASR_SPEAKER_COUNT;
  const submission = await postJson(`${DASHSCOPE_API_HOST}/api/v1/services/audio/asr/transcription`, {
    model: ASR_MODEL,
    input: { file_urls: [ossUrl] },
    parameters
  }, {
    ...commonHeaders,
    "X-DashScope-Async": "enable"
  });
  const taskId = submission.output?.task_id;
  if (!taskId) throw new Error(submission.message || "百炼没有返回转写任务 ID");

  for (let attempt = 0; attempt < 300; attempt += 1) {
    const task = await requestJsonWithMethod(`${DASHSCOPE_API_HOST}/api/v1/tasks/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${DASHSCOPE_API_KEY}` }
    });
    const status = task.output?.task_status;
    if (status === "SUCCEEDED") {
      const result = task.output?.results?.find((item) => item.subtask_status === "SUCCEEDED");
      if (!result?.transcription_url) {
        const failed = task.output?.results?.find((item) => item.subtask_status === "FAILED");
        throw new Error(failed?.message || failed?.code || "百炼转写子任务没有返回结果地址");
      }
      return {
        result: await requestJsonWithMethod(result.transcription_url, { timeoutMs: 120000 }),
        usage: task.usage || null,
        taskId
      };
    }
    if (status === "FAILED" || status === "CANCELED" || status === "UNKNOWN") {
      throw new Error(task.message || `百炼转写任务失败：${status}`);
    }
    await wait(2000);
  }
  throw new Error("百炼转写等待超过 10 分钟，请稍后重试");
}

function formatTranscriptTime(milliseconds) {
  const seconds = Math.max(0, Math.floor(Number(milliseconds || 0) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].map((value) => String(value).padStart(2, "0")).join(":");
}

function buildSpeakerTranscript(result) {
  const sentences = (result.transcripts || [])
    .flatMap((transcript) => (transcript.sentences || []).map((sentence) => ({
      speakerId: Number.isInteger(sentence.speaker_id) ? sentence.speaker_id : null,
      beginTime: Number(sentence.begin_time || 0),
      endTime: Number(sentence.end_time || sentence.begin_time || 0),
      text: String(sentence.text || "").trim()
    })))
    .filter((sentence) => sentence.text)
    .sort((left, right) => left.beginTime - right.beginTime);
  if (!sentences.length) throw new Error("百炼没有返回可用的转写句子");

  const speakerStats = new Map();
  for (const sentence of sentences) {
    if (sentence.speakerId === null) continue;
    const stats = speakerStats.get(sentence.speakerId) || { sentenceCount: 0, charCount: 0, questionScore: 0 };
    stats.sentenceCount += 1;
    stats.charCount += sentence.text.length;
    if (/[?？]\s*$/.test(sentence.text)) stats.questionScore += 3;
    if (/^(?:请|你|您|为什么|怎么|如何|能否|可以|有没有|是否|介绍|讲讲|说说|谈谈|什么|哪|如果)/.test(sentence.text)) stats.questionScore += 1;
    speakerStats.set(sentence.speakerId, stats);
  }
  const rankedSpeakers = [...speakerStats.entries()].sort((left, right) => {
    const score = ([, stats]) => stats.questionScore / Math.max(1, stats.sentenceCount) - stats.charCount / Math.max(1, stats.sentenceCount) / 500;
    return score(right) - score(left);
  });
  const interviewerSpeakerId = rankedSpeakers[0]?.[0] ?? null;
  const roleFor = (speakerId) => {
    if (speakerId === null) return "说话人";
    return speakerId === interviewerSpeakerId ? "面试官" : "候选人";
  };

  const segments = [];
  for (const sentence of sentences) {
    const role = roleFor(sentence.speakerId);
    const previous = segments.at(-1);
    if (previous && previous.speakerId === sentence.speakerId && sentence.beginTime - previous.endTime <= 2000) {
      previous.text += sentence.text;
      previous.endTime = sentence.endTime;
    } else {
      segments.push({ ...sentence, role });
    }
  }
  const text = segments.map((segment) => {
    const prefix = segment.role === "面试官" ? "Q" : segment.role === "候选人" ? "A" : `Speaker ${segment.speakerId ?? ""}`;
    return `${prefix}: [${formatTranscriptTime(segment.beginTime)}] ${segment.text}`;
  }).join("\n\n");
  return {
    text,
    segments,
    speakerMap: Object.fromEntries([...speakerStats.keys()].map((speakerId) => [speakerId, roleFor(speakerId)]))
  };
}

async function optimizeInterviewQuestionsWithDeepSeek(candidates = []) {
  const fallback = () => ({
    questionItems: candidates
      .filter((item) => item.fallbackKeep)
      .map((item) => ({
        title: item.fallbackQuestion,
        answer: item.answer,
        rawQuestion: item.rawQuestion,
        questionerRole: item.questionerRole,
        category: item.category,
        speakerId: item.speakerId,
        beginTime: item.beginTime,
        endTime: item.endTime
      })),
    questionExtraction: {
      optimized: false,
      provider: "local-rules",
      candidateCount: candidates.length
    }
  });
  if (!candidates.length || !DEEPSEEK_API_KEY) return fallback();

  const compactCandidates = candidates.map((item) => ({
    index: item.index,
    questionerRole: item.questionerRole,
    interviewerRaw: item.rawQuestion.slice(0, 700),
    previousTurn: item.previousTurn.slice(0, 500),
    replyFromOtherSpeaker: item.answer.slice(0, 900)
  }));
  try {
    const data = await postJson("https://api.deepseek.com/chat/completions", {
      model: MODEL,
      messages: [
        {
          role: "system",
          content: "你是面试逐字稿校对员。请区分面试官提问和候选人反问，并输出合法 JSON。"
        },
        {
          role: "user",
          content: `请处理下面按说话人切分的面试轮次。

规则：
1. questionerRole=面试官：只保留要求候选人回答的问题、追问或任务指令；“你还有什么问题吗”只是进入反问环节的过渡，keep=false。
2. questionerRole=候选人：只保留反问环节候选人真正向面试官提出的问题，category 必须为“反问”；回答中的澄清、反问句或口头确认不算反问。
3. 删除寒暄、确认词、复述、评价，以及反问环节中面试官对岗位的介绍和说明。
4. 去掉“嗯、呃、OK、明白”等口头语和无意义重复；可结合相邻轮次修复明显的同音转写错误。
5. 必须保留原意和所有实质子问题，不得补充原文没有的信息。
6. 面试官问题分类只能是：简历面（围绕简历、项目、实习经历与成果）、业务面（岗位知识、产品、技术、行业和方案）、行为面（动机、自我评价、协作、冲突、稳定性、时间安排）。候选人问题分类为反问。
7. 同一个 interviewerRaw 最多输出一个 optimizedQuestion；若不是问题，keep=false。
8. optimizedQuestion 使用自然、完整、简洁的中文问句；信息不确定时宁可少改。

只输出：
{"questions":[{"index":0,"keep":true,"optimizedQuestion":"...","category":"简历面"}]}

轮次：
${JSON.stringify(compactCandidates)}`
        }
      ],
      response_format: { type: "json_object" },
      stream: false,
      max_tokens: 8000,
      temperature: 0.1
    }, {
      "Authorization": `Bearer ${DEEPSEEK_API_KEY}`
    });
    const parsed = JSON.parse(cleanJsonText(data.choices?.[0]?.message?.content));
    const decisions = new Map((parsed.questions || []).map((item) => [Number(item.index), item]));
    const questionItems = candidates.flatMap((item) => {
      const decision = decisions.get(item.index);
      if (!decision?.keep) return [];
      const title = normalizeInterviewQuestion(decision.optimizedQuestion);
      if (!title) return [];
      return [{
        title,
        answer: item.answer,
        rawQuestion: item.rawQuestion,
        questionerRole: item.questionerRole,
        category: item.questionerRole === "候选人"
          ? "反问"
          : ["简历面", "业务面", "行为面"].includes(decision.category) ? decision.category : item.category,
        speakerId: item.speakerId,
        beginTime: item.beginTime,
        endTime: item.endTime
      }];
    });
    if (!questionItems.length) return fallback();
    return {
      questionItems,
      questionExtraction: {
        optimized: true,
        provider: "deepseek",
        model: MODEL,
        candidateCount: candidates.length,
        usage: data.usage || null
      }
    };
  } catch (error) {
    const result = fallback();
    result.questionExtraction.warning = `问题优化失败，已使用本地规则：${error.message}`;
    return result;
  }
}

async function handleExtractInterviewQuestions(req, res) {
  try {
    const body = JSON.parse(await readRequestBody(req, 2 * 1024 * 1024));
    const segments = Array.isArray(body.segments) && body.segments.length
      ? body.segments
      : parseSpeakerTranscript(body.transcript);
    if (!segments.length) throw new Error("没有识别到带 Q:/A: 说话人标记的转写内容");
    const result = await optimizeInterviewQuestionsWithDeepSeek(
      extractInterviewQuestionCandidates(segments)
    );
    sendJson(res, 200, { ok: true, ...result });
  } catch (error) {
    sendJson(res, error.statusCode || 400, { ok: false, error: error.message || "面试问题提取失败" });
  }
}

async function transcribeWithAliyun({ buffer, fileName }) {
  if (!DASHSCOPE_API_KEY) throw new Error("缺少 DASHSCOPE_API_KEY");
  const prepared = await prepareAliyunDiarizationAudio(buffer, fileName);
  try {
    const ossUrl = await uploadAliyunTemporaryFile(prepared);
    const transcription = await runAliyunTranscription(ossUrl);
    const speakerTranscript = buildSpeakerTranscript(transcription.result);
    const questions = await optimizeInterviewQuestionsWithDeepSeek(
      extractInterviewQuestionCandidates(speakerTranscript.segments)
    );
    return {
      ...speakerTranscript,
      ...questions,
      usage: transcription.usage,
      taskId: transcription.taskId
    };
  } finally {
    await prepared.cleanup();
  }
}

async function handleAnalyzeJob(req, res) {
  let body = {};
  const startedAt = new Date().toISOString();
  const start = performance.now();
  try {
    body = JSON.parse(await readRequestBody(req));
    const result = await callModel(body);
    persistLegacyRun({ taskType: "structured_job_analysis", input: body, result, provider: PROVIDER, model: MODEL, startedAt, durationMs: performance.now() - start });
    sendJson(res, 200, result);
  } catch (error) {
    persistLegacyRun({ taskType: "structured_job_analysis", input: body, result: {}, provider: PROVIDER, model: MODEL, startedAt, durationMs: performance.now() - start, status: "failed", error: error.message });
    sendJson(res, 500, { error: error.message || "分析失败" });
  }
}

async function handleRoleUnderstanding(req, res) {
  let body = {};
  const startedAt = new Date().toISOString();
  const start = performance.now();
  try {
    body = JSON.parse(await readRequestBody(req));
    const result = await callRoleUnderstanding(body);
    persistLegacyRun({ taskType: "role_understanding", input: body, result, provider: PROVIDER, model: MODEL, startedAt, durationMs: performance.now() - start });
    sendJson(res, 200, result);
  } catch (error) {
    persistLegacyRun({ taskType: "role_understanding", input: body, result: {}, provider: PROVIDER, model: MODEL, startedAt, durationMs: performance.now() - start, status: "failed", error: error.message });
    sendJson(res, 500, { error: error.message || "岗位理解失败" });
  }
}

async function handleSelfIntroduction(req, res) {
  let body = {};
  const startedAt = new Date().toISOString();
  const start = performance.now();
  try {
    body = JSON.parse(await readRequestBody(req));
    const result = await callSelfIntroduction(body);
    persistLegacyRun({ taskType: "self_introduction", input: body, result, provider: PROVIDER, model: MODEL, startedAt, durationMs: performance.now() - start });
    sendJson(res, 200, result);
  } catch (error) {
    persistLegacyRun({ taskType: "self_introduction", input: body, result: {}, provider: PROVIDER, model: MODEL, startedAt, durationMs: performance.now() - start, status: "failed", error: error.message });
    sendJson(res, 500, { error: error.message || "自我介绍生成失败" });
  }
}

async function handleCoverLetter(req, res) {
  let body = {};
  const startedAt = new Date().toISOString();
  const start = performance.now();
  try {
    body = JSON.parse(await readRequestBody(req));
    const result = await callCoverLetter(body);
    persistLegacyRun({ taskType: "cover_letter", input: body, result, provider: PROVIDER, model: MODEL, startedAt, durationMs: performance.now() - start });
    sendJson(res, 200, result);
  } catch (error) {
    persistLegacyRun({ taskType: "cover_letter", input: body, result: {}, provider: PROVIDER, model: MODEL, startedAt, durationMs: performance.now() - start, status: "failed", error: error.message });
    sendJson(res, 500, { error: error.message || "Cover Letter 生成失败" });
  }
}

async function handleAgentRun(req, res) {
  try {
    const body = JSON.parse(await readRequestBody(req));
    const input = parseAgentRunInput(body);
    const hasProviderKey = PROVIDER === "deepseek" ? Boolean(DEEPSEEK_API_KEY) : Boolean(OPENAI_API_KEY);
    const result = await runAgentTask(input, {
      coverLetterExecutor: hasProviderKey ? callCoverLetter : undefined,
      roleUnderstandingExecutor: hasProviderKey ? callRoleUnderstanding : undefined
    });
    const skillVersion = (result.routing?.plan || [])
      .map((key) => `${key}@${SKILL_REGISTRY[key]?.version || "unknown"}`)
      .join(",");
    persistAgentRun(result, input, { provider: PROVIDER, model: MODEL, appVersion: "0.1.0", promptVersion: "agent-run-v1", skillVersion });
    sendJson(res, result.status === "failed" ? 500 : 200, result);
  } catch (error) {
    const status = error.statusCode || (error.name === "ZodError" || error instanceof SyntaxError ? 400 : 500);
    sendJson(res, status, { ok: false, error: formatValidationError(error) });
  }
}

async function handleInterviewReview(req, res) {
  try {
    const request = parseReviewInterviewInput(JSON.parse(await readRequestBody(req)));
    const round = request.interviewRound;
    const input = parseAgentRunInput({
      query: `复盘${round.title || "本轮面试"}`,
      job: request.job,
      profile: request.candidate,
      interview: {
        mode: request.mode,
        roundId: round.id,
        roundName: round.title,
        roundDate: round.date,
        format: round.format,
        interviewer: round.interviewer,
        rawNotes: round.notes,
        sourceMaterial: round.sourceMaterial,
        questions: round.questionItems,
        priorPreparation: request.priorPreparation,
        preparationSnapshot: round.preparationSnapshot,
        previousRounds: request.previousRounds,
        preserveRawText: request.options.preserveRawText,
        generateImprovedAnswers: request.options.generateImprovedAnswers
      },
      requestedSkills: ["interviewRetrospective"]
    });
    const result = await runAgentTask(input);
    persistAgentRun(result, input, {
      provider: "deterministic",
      model: "interview-retrospective-v1",
      appVersion: "0.1.0",
      promptVersion: "interview-retrospective-v1",
      skillVersion: `interviewRetrospective@${SKILL_REGISTRY.interviewRetrospective.version}`
    });
    sendJson(res, result.status === "failed" ? 500 : 200, { ...result, review: result.output?.interviewRetrospective || null });
  } catch (error) {
    const status = error.statusCode || (error.name === "ZodError" || error instanceof SyntaxError ? 400 : 500);
    sendJson(res, status, { ok: false, error: formatValidationError(error) });
  }
}

async function handleParseResume(req, res) {
  try {
    const body = JSON.parse(await readRequestBody(req));
    const asset = saveFileAsset({
      category: "resume",
      entityId: body.resumeId || null,
      fileName: body.fileName || "resume",
      mimeType: body.fileType || "application/octet-stream",
      data: body.data || ""
    });
    const result = await parseDocumentFile(body);
    const text = String(result.text || "").replace(/\u0000/g, "").trim();
    if (!text) throw new Error("没有从文件中提取到可用正文");
    sendJson(res, 200, {
      ok: true,
      kind: result.kind,
      text,
      charCount: text.length,
      fileAssetId: asset.id,
      fileUrl: `/api/data/file/${asset.id}`
    });
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error.message || "简历解析失败" });
  }
}

async function handleExtractInterviewSource(req, res) {
  try {
    const body = JSON.parse(await readRequestBody(req, MAX_INTERVIEW_SOURCE_BODY_BYTES));
    const fileName = String(body.fileName || "interview-source");
    const fileType = String(body.fileType || "application/octet-stream");
    const buffer = Buffer.from(String(body.data || "").replace(/^data:.*?;base64,/, ""), "base64");
    if (!buffer.length) throw new Error("文件内容为空");
    if (buffer.length > 25 * 1024 * 1024) {
      const error = new Error("面试材料不能超过 25 MiB；请压缩音频或拆分后上传");
      error.statusCode = 413;
      throw error;
    }
    const asset = saveFileAsset({
      category: "interview-source",
      entityId: body.roundId || null,
      fileName,
      mimeType: fileType,
      data: body.data || ""
    });
    const lowerName = fileName.toLowerCase();
    const isAudio = fileType.startsWith("audio/") || /\.(flac|mp3|mp4|mpeg|mpga|m4a|ogg|wav|webm)$/i.test(lowerName);
    if (isAudio) {
      const asrConfigured = ASR_PROVIDER === "aliyun" ? Boolean(DASHSCOPE_API_KEY) : ASR_PROVIDER === "openai" ? Boolean(OPENAI_API_KEY) : false;
      if (!asrConfigured) {
        sendJson(res, 200, {
          ok: true,
          status: "needs_configuration",
          sourceType: "audio",
          text: "",
          message: "音频已安全保存，但当前未配置 OPENAI_API_KEY，无法自动转写。配置后可重新提取。",
          asset: { ...asset, url: `/api/data/file/${asset.id}` }
        });
        return;
      }
      const transcription = ASR_PROVIDER === "aliyun"
        ? await transcribeWithAliyun({ buffer, fileName })
        : await postMultipart("https://api.openai.com/v1/audio/transcriptions", {
            fields: { model: OPENAI_TRANSCRIBE_MODEL, language: "zh" },
            file: { buffer, fileName, mimeType: fileType }
          }, { Authorization: `Bearer ${OPENAI_API_KEY}` });
      const text = String(transcription.text || "").replace(/\u0000/g, "").trim();
      if (!text) throw new Error("语音服务没有返回可用转写文本");
      sendJson(res, 200, {
        ok: true,
        status: "extracted",
        sourceType: "audio",
        text,
        charCount: text.length,
        provider: ASR_PROVIDER,
        model: ASR_PROVIDER === "aliyun" ? ASR_MODEL : OPENAI_TRANSCRIBE_MODEL,
        diarization: ASR_PROVIDER === "aliyun" ? {
          enabled: ASR_DIARIZATION,
          speakerCount: ASR_SPEAKER_COUNT,
          speakerMap: transcription.speakerMap || {},
          segments: transcription.segments || []
        } : null,
        questionItems: transcription.questionItems || [],
        questionExtraction: transcription.questionExtraction || null,
        usage: transcription.usage || null,
        asset: { ...asset, url: `/api/data/file/${asset.id}` }
      });
      return;
    }
    const parsed = await parseDocumentFile(body);
    const text = String(parsed.text || "").replace(/\u0000/g, "").trim();
    if (!text) throw new Error("没有从 Word 文件中提取到可用正文");
    sendJson(res, 200, {
      ok: true,
      status: "extracted",
      sourceType: "document",
      kind: parsed.kind,
      text,
      charCount: text.length,
      asset: { ...asset, url: `/api/data/file/${asset.id}` }
    });
  } catch (error) {
    sendJson(res, error.statusCode || 400, { ok: false, error: error.message || "面试材料提取失败" });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const fullPath = normalize(join(PUBLIC_ROOT, requested));
  const relativePath = relative(PUBLIC_ROOT, fullPath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(fullPath);
    res.writeHead(200, {
      "Content-Type": contentTypes[extname(fullPath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

export const serviceRuntime = {
  provider: PROVIDER,
  model: MODEL,
  hasOpenAIKey: Boolean(OPENAI_API_KEY),
  audioTranscription: {
    available: ASR_PROVIDER === "aliyun" ? Boolean(DASHSCOPE_API_KEY) : ASR_PROVIDER === "openai" ? Boolean(OPENAI_API_KEY) : false,
    provider: ASR_PROVIDER,
    model: ASR_MODEL,
    diarization: ASR_PROVIDER === "aliyun" && ASR_DIARIZATION,
    speakerCount: ASR_PROVIDER === "aliyun" && ASR_DIARIZATION ? ASR_SPEAKER_COUNT : null
  },
  hasDeepSeekKey: Boolean(DEEPSEEK_API_KEY),
  hasDashScopeKey: Boolean(DASHSCOPE_API_KEY),
  proxy: PROXY_URL ? PROXY_URL.replace(/\/\/.*@/, "//***@") : ""
};

export {
  handleAgentRun,
  handleInterviewReview,
  handleAnalyzeJob,
  handleRoleUnderstanding,
  handleSelfIntroduction,
  handleCoverLetter,
  handleParseResume,
  handleExtractInterviewSource,
  handleExtractInterviewQuestions,
  transcribeWithAliyun,
  extractInterviewQuestionCandidates,
  parseSpeakerTranscript,
  optimizeInterviewQuestionsWithDeepSeek,
  serveStatic
};
