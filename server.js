import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
loadDotEnv(join(ROOT, ".env"));

const PORT = Number(process.env.PORT || 8787);
const PROVIDER = (process.env.AI_PROVIDER || (process.env.DEEPSEEK_API_KEY ? "deepseek" : "openai")).toLowerCase();
const MODEL = process.env.AI_MODEL || process.env.OPENAI_MODEL || process.env.DEEPSEEK_MODEL || (PROVIDER === "deepseek" ? "deepseek-v4-flash" : "gpt-4o-mini");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const PROXY_URL = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || "http://127.0.0.1:7890";

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

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
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
          required: ["jdParser", "profileMatcher", "riskDiagnoser", "prepPlanner"],
          properties: {
            jdParser: {
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
      "jdParser": {
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
  analysis.workflow.jdParser.rawKeywordHits = { ...emptyHits(), ...(analysis.workflow.jdParser.rawKeywordHits || analysis.jdHits) };
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
    return JSON.parse(cleanJsonText(text));
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
  return JSON.parse(cleanJsonText(text));
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

async function handleAnalyzeJob(req, res) {
  try {
    const body = JSON.parse(await readRequestBody(req));
    const result = await callModel(body);
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "分析失败" });
  }
}

async function handleRoleUnderstanding(req, res) {
  try {
    const body = JSON.parse(await readRequestBody(req));
    const result = await callRoleUnderstanding(body);
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "岗位理解失败" });
  }
}

async function handleSelfIntroduction(req, res) {
  try {
    const body = JSON.parse(await readRequestBody(req));
    const result = await callSelfIntroduction(body);
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "自我介绍生成失败" });
  }
}

async function parseResumeFile({ fileName = "", fileType = "", data = "" }) {
  const buffer = Buffer.from(String(data).replace(/^data:.*?;base64,/, ""), "base64");
  const lowerName = fileName.toLowerCase();
  if (!buffer.length) throw new Error("文件内容为空");

  if (lowerName.endsWith(".txt") || lowerName.endsWith(".md") || fileType.startsWith("text/")) {
    return { text: buffer.toString("utf8"), kind: "text" };
  }

  if (lowerName.endsWith(".pdf") || fileType === "application/pdf") {
    const pdfParseModule = await import("pdf-parse");
    const pdfParse = pdfParseModule.default || pdfParseModule;
    const parsed = await pdfParse(buffer);
    return { text: parsed.text || "", kind: "pdf" };
  }

  if (lowerName.endsWith(".docx") || fileType.includes("officedocument.wordprocessingml.document")) {
    const mammoth = await import("mammoth");
    const parsed = await mammoth.extractRawText({ buffer });
    return { text: parsed.value || "", kind: "docx" };
  }

  if (lowerName.endsWith(".doc") || fileType === "application/msword") {
    throw new Error("暂不支持旧版 .doc 正文解析，请另存为 .docx 或 PDF 后上传");
  }

  throw new Error("暂不支持该文件格式");
}

async function handleParseResume(req, res) {
  try {
    const body = JSON.parse(await readRequestBody(req));
    const result = await parseResumeFile(body);
    const text = String(result.text || "").replace(/\u0000/g, "").trim();
    if (!text) throw new Error("没有从文件中提取到可用正文");
    sendJson(res, 200, {
      ok: true,
      kind: result.kind,
      text,
      charCount: text.length
    });
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error.message || "简历解析失败" });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const fullPath = normalize(join(ROOT, requested));
  if (!fullPath.startsWith(ROOT)) {
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

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      provider: PROVIDER,
      model: MODEL,
      hasOpenAIKey: Boolean(OPENAI_API_KEY),
      hasDeepSeekKey: Boolean(DEEPSEEK_API_KEY),
      proxy: PROXY_URL ? PROXY_URL.replace(/\/\/.*@/, "//***@") : ""
    });
    return;
  }
  if (req.method === "POST" && req.url === "/api/analyze-job") {
    await handleAnalyzeJob(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/role-understanding") {
    await handleRoleUnderstanding(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/self-introduction") {
    await handleSelfIntroduction(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/parse-resume") {
    await handleParseResume(req, res);
    return;
  }
  if (req.method === "GET") {
    await serveStatic(req, res);
    return;
  }
  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(PORT, () => {
  console.log(`CareerPilot AI running at http://localhost:${PORT}`);
  console.log(`AI provider: ${PROVIDER}, model: ${MODEL}`);
  console.log(OPENAI_API_KEY ? "OpenAI key loaded." : "OPENAI_API_KEY not set.");
  console.log(DEEPSEEK_API_KEY ? "DeepSeek key loaded." : "DEEPSEEK_API_KEY not set.");
  console.log(PROXY_URL ? `Proxy enabled: ${PROXY_URL}` : "Proxy not set for Node. If OpenAI times out, set HTTPS_PROXY.");
});
