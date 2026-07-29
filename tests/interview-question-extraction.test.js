import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyInterviewQuestion,
  extractInterviewQuestionCandidates,
  parseSpeakerTranscript
} from "../src/server/services/interview-question-extractor.js";

test("按 Q/A 说话人轮次配对问题和候选人回答", () => {
  const segments = parseSpeakerTranscript(`
Q: [00:00:04] 我们开始吧。你先简单做个自我介绍。

A: [00:00:08] 您好，我叫小王。

Q: [00:01:01] 嗯，介绍一个你做过的项目吧。

A: [00:01:05] 我主要介绍智能创作项目。
`);
  const candidates = extractInterviewQuestionCandidates(segments);

  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].answer, "您好，我叫小王。");
  assert.equal(candidates[1].fallbackQuestion, "介绍一个你做过的项目吧");
  assert.equal(candidates[1].answer, "我主要介绍智能创作项目。");
});

test("本地问句判定排除面试官说明，保留无问号的任务指令", () => {
  const segments = parseSpeakerTranscript(`
Q: [00:00:04] 你先简单做个自我介绍。

A: [00:00:08] 您好，我叫小王。

Q: [00:22:03] 我们这边主要做豆包工具，会接入很多三方服务。

A: [00:22:20] 明白。

Q: [00:23:15] 好的，行，我们这样。
`);
  const candidates = extractInterviewQuestionCandidates(segments);

  assert.equal(candidates.length, 3);
  assert.equal(candidates[0].fallbackKeep, true);
  assert.equal(candidates[1].fallbackKeep, false);
  assert.equal(candidates[2].fallbackKeep, false);
});

test("候选人反问与面试官问题分开提取，并绑定面试官回答", () => {
  const segments = parseSpeakerTranscript(`
面试官：你还有什么问题吗？
候选人：我想了解一下，这个岗位入职后的核心目标是什么？
面试官：前两个月主要熟悉 MCP 和 Skill 的建设流程。
候选人：明白，谢谢。
`);
  const candidates = extractInterviewQuestionCandidates(segments);
  const reverseQuestion = candidates.find((item) => item.questionerRole === "候选人");

  assert.ok(reverseQuestion);
  assert.equal(reverseQuestion.category, "反问");
  assert.equal(reverseQuestion.answer, "前两个月主要熟悉 MCP 和 Skill 的建设流程。");
  assert.equal(classifyInterviewQuestion("请介绍一下你做过的项目", "面试官"), "简历面");
  assert.equal(classifyInterviewQuestion("你认为自己的缺点是什么", "面试官"), "行为面");
  assert.equal(classifyInterviewQuestion("你如何理解 MCP 和 Skill 的关系", "面试官"), "业务面");
});
