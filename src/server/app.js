import http from "node:http";
import { publicSkillRegistry, SKILL_KEYS } from "../shared/skill-registry.js";
import {
  handleAgentRun,
  handleInterviewReview,
  handleAnalyzeJob,
  handleRoleUnderstanding,
  handleSelfIntroduction,
  handleCoverLetter,
  handleParseResume,
  handleExtractInterviewSource,
  handleExtractInterviewQuestions,
  serveStatic,
  serviceRuntime
} from "./services/career-service.js";
import { handleDataBootstrap, handleFileDownload, handleFileUpload, handleMetricsSummary, handleStatePersistence } from "./services/data-service.js";
import { databaseRuntime } from "./data/database.js";

const PORT = Number(process.env.PORT || 8787);

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

const postRoutes = new Map([
  ["/api/agent/run", handleAgentRun],
  ["/api/review-interview", handleInterviewReview],
  ["/api/analyze-job", handleAnalyzeJob],
  ["/api/role-understanding", handleRoleUnderstanding],
  ["/api/self-introduction", handleSelfIntroduction],
  ["/api/cover-letter", handleCoverLetter],
  ["/api/parse-resume", handleParseResume],
  ["/api/extract-interview-source", handleExtractInterviewSource],
  ["/api/extract-interview-questions", handleExtractInterviewQuestions],
  ["/api/data/state", handleStatePersistence],
  ["/api/data/file", handleFileUpload]
]);

const getRoutes = new Map([
  ["/api/data/bootstrap", handleDataBootstrap],
  ["/api/metrics/summary", handleMetricsSummary]
]);

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      ...serviceRuntime,
      architecture: "hybrid-workflow-agent",
      agentPlanner: "deterministic-planner",
      skillCount: SKILL_KEYS.length,
      database: { provider: databaseRuntime.provider, schemaVersion: databaseRuntime.schemaVersion }
    });
    return;
  }
  if (req.method === "GET" && req.url === "/api/skills") {
    sendJson(res, 200, { skills: publicSkillRegistry() });
    return;
  }
  const getHandler = req.method === "GET" ? getRoutes.get(req.url) : null;
  if (getHandler) {
    await getHandler(req, res);
    return;
  }
  if (req.method === "GET" && req.url.startsWith("/api/data/file/")) {
    await handleFileDownload(req, res);
    return;
  }
  const handler = req.method === "POST" ? postRoutes.get(req.url) : null;
  if (handler) {
    await handler(req, res);
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
  console.log(`AI provider: ${serviceRuntime.provider}, model: ${serviceRuntime.model}`);
  console.log(serviceRuntime.audioTranscription.available
    ? `Audio transcription: ${serviceRuntime.audioTranscription.provider}/${serviceRuntime.audioTranscription.model}${serviceRuntime.audioTranscription.diarization ? " (speaker diarization enabled)" : ""}.`
    : "Audio transcription key not set.");
  console.log(serviceRuntime.hasDeepSeekKey ? "DeepSeek key loaded." : "DEEPSEEK_API_KEY not set.");
});
