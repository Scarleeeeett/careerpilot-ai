export function normalizeInterviewQuestion(text = "") {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/^(?:(?:嗯+|呃+|啊+|哎+|诶+|好的?|行|OK|ok|明白|了解|对)[，,。.、\s]*)+/g, "")
    .replace(/[，,。\s]+$/g, "")
    .trim();
}

export function hasInterviewQuestionIntent(text = "") {
  const value = normalizeInterviewQuestion(text);
  if (!value || value.length < 3) return false;
  if (/[?？]/.test(value)) return true;
  return /(?:自我介绍|介绍一下|讲讲|说说|谈谈|展开说|举个例|为什么|怎么|如何|什么|哪些|哪个|是否|有没有|能不能|可以.{0,8}吗|你认为|你觉得|评价一下|预期是什么|时间.*样|主要承担|负责.*什么|输入是什么|关系是|现状是什么|应该包括|需要做哪些|还可以实习|还有其他|我想问|想了解|请问)/i.test(value);
}

export function classifyInterviewQuestion(text = "", questionerRole = "面试官") {
  if (questionerRole === "候选人") return "反问";
  const value = String(text || "");
  if (/(?:自我介绍|简历|实习经历|项目|其中主要承担|负责的|做过什么|收益|成果|指标|冷启动|作品不可用)/i.test(value)) return "简历面";
  if (/(?:优势|缺点|评价一下自己|为什么.*三个月|实习时间|开学后|实习预期|冲突|压力|失败|分歧|协作|推进|主动性|稳定)/i.test(value)) return "行为面";
  return "业务面";
}

function isReverseQuestionTurn(turn, previousTurn) {
  if (!turn?.text) return false;
  if (/(?:我|还)?想问(?:一下)?|想请问|请问/i.test(turn.text)) return true;
  return previousTurn?.role === "面试官"
    && /(?:你还有什么问(?:题)?|你有什么问(?:题)?|还有什么想问|可以反问|你还想了解)/i.test(previousTurn.text);
}

export function extractInterviewQuestionCandidates(segments = []) {
  const turns = [];
  for (const segment of segments) {
    if (!segment?.text || !["面试官", "候选人"].includes(segment.role)) continue;
    const previous = turns.at(-1);
    if (previous?.role === segment.role) {
      previous.text += segment.text;
      previous.endTime = segment.endTime;
    } else {
      turns.push({
        role: segment.role,
        speakerId: segment.speakerId,
        beginTime: Number(segment.beginTime || 0),
        endTime: Number(segment.endTime || segment.beginTime || 0),
        text: String(segment.text || "").trim()
      });
    }
  }

  const candidates = [];
  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index];
    const previousTurn = turns[index - 1] || null;
    const isInterviewerQuestion = turn.role === "面试官";
    const isCandidateReverseQuestion = turn.role === "候选人" && isReverseQuestionTurn(turn, previousTurn);
    if (!isInterviewerQuestion && !isCandidateReverseQuestion) continue;
    const replyRole = isInterviewerQuestion ? "候选人" : "面试官";
    const reply = turns[index + 1]?.role === replyRole ? turns[index + 1] : null;
    const questionerRole = isInterviewerQuestion ? "面试官" : "候选人";
    candidates.push({
      index: candidates.length,
      rawQuestion: turn.text,
      fallbackQuestion: normalizeInterviewQuestion(turn.text),
      answer: reply?.text || "",
      questionerRole,
      category: classifyInterviewQuestion(turn.text, questionerRole),
      speakerId: turn.speakerId,
      previousTurn: previousTurn?.text || "",
      beginTime: turn.beginTime,
      endTime: turn.endTime,
      fallbackKeep: isCandidateReverseQuestion || (
        hasInterviewQuestionIntent(turn.text)
        && !/(?:你还有什么问(?:题)?|你有什么问(?:题)?|还有什么想问|可以反问|你还想了解)/i.test(turn.text)
      )
    });
  }
  return candidates.slice(0, 60);
}

export function parseSpeakerTranscript(text = "") {
  return String(text || "")
    .replace(/\r/g, "")
    .split(/\n\s*\n|\n(?=(?:Q|A|问|答|面试官|候选人|我)[:：])/i)
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block) => {
      const match = block.match(/^(Q|A|问|答|面试官|候选人|我)[:：]\s*(?:\[(\d{2}):(\d{2}):(\d{2})\]\s*)?([\s\S]+)$/i);
      if (!match) return [];
      const beginTime = match[2]
        ? (Number(match[2]) * 3600 + Number(match[3]) * 60 + Number(match[4])) * 1000
        : 0;
      return [{
        role: /^(?:Q|问|面试官)$/i.test(match[1]) ? "面试官" : "候选人",
        speakerId: /^(?:Q|问|面试官)$/i.test(match[1]) ? 1 : 0,
        beginTime,
        endTime: beginTime,
        text: match[5].trim()
      }];
    });
}
