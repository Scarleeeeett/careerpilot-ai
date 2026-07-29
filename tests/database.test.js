import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

test("旧浏览器状态会保存原始快照并拆分为版本化数据", async () => {
  const directory = mkdtempSync(join(tmpdir(), "careerpilot-database-test-"));
  process.env.CAREERPILOT_DATABASE_PATH = join(directory, "careerpilot.sqlite");
  const database = await import(`../src/server/data/database.js?test=${Date.now()}`);

  const state = {
    appVersion: "database-v1",
    profile: {
      target: "AI 产品经理",
      industry: "AI 应用",
      activeResumeId: "resume-1",
      resumes: [{ id: "resume-1", name: "AI 产品简历", resume: "真实项目经历", projects: "CareerPilot AI" }]
    },
    jobs: [{
      id: "job-1",
      company: "示例公司",
      title: "AI 产品经理",
      jd: "负责 Agent 产品和评测",
      resumeId: "resume-1",
      reviewRounds: [{
        id: "round-1",
        title: "一面",
        notes: "讨论了评测指标",
        preparationSnapshot: { generatedAt: "2026-07-20T00:00:00.000Z", contentHash: "snapshot-1" },
        questionItems: [{ id: "question-1", title: "如何设计评测？", answer: "先定义任务成功标准" }],
        aiReview: {
          status: "success",
          schemaVersion: "1.0",
          generatedAt: "2026-07-22T00:00:00.000Z",
          modes: ["full_review"],
          comparisonConfidence: "high",
          preparationAudit: { metrics: { preparationCoveragePct: 100 } },
          questionReviews: [{ questionId: "question-1", preparationStatus: "prepared" }]
        }
      }]
    }],
    traceHistory: [{
      runId: "legacy-run-1",
      jobId: "job-1",
      query: "分析岗位",
      status: "success",
      summary: { totalDurationMs: 12 },
      routing: { plan: ["understandJobIndustry"] },
      output: { understandJobIndustry: { coreTasks: ["设计 Agent"] } },
      trace: [{ step: 1, skillKey: "understandJobIndustry", status: "success", durationMs: 10 }]
    }]
  };

  const saved = database.saveStateSnapshot(state, { source: "legacy-localstorage", forceSnapshot: true });
  assert.ok(saved.snapshotId);
  assert.ok(saved.backupPath && existsSync(saved.backupPath));
  assert.deepEqual(database.loadLatestState().state, state);

  const metrics = database.getMetricsSummary();
  assert.equal(metrics.dataCounts.snapshots, 1);
  assert.equal(metrics.dataCounts.resumes, 1);
  assert.equal(metrics.dataCounts.resumeVersions, 1);
  assert.equal(metrics.dataCounts.jobs, 1);
  assert.equal(metrics.dataCounts.jdVersions, 1);
  assert.equal(metrics.dataCounts.interviews, 1);
  assert.equal(metrics.dataCounts.interviewReviews, 1);
  assert.equal(metrics.totals.total_runs, 1);

  const file = database.saveFileAsset({
    category: "resume",
    entityId: "resume-1",
    fileName: "resume.txt",
    mimeType: "text/plain",
    data: Buffer.from("真实简历原文件", "utf8").toString("base64")
  });
  assert.equal(database.loadFileAsset(file.id).buffer.toString("utf8"), "真实简历原文件");
  assert.equal(database.getMetricsSummary().dataCounts.files, 1);
});

test("Agent Run、步骤、产物和指标会同时落库", async () => {
  const database = await import("../src/server/data/database.js");
  const result = database.persistAgentRun({
    runId: "run-test-1",
    query: "分析岗位并准备面试",
    status: "success",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    summary: { totalDurationMs: 18 },
    routing: { plan: ["understandJobIndustry"] },
    output: { understandJobIndustry: { coreTasks: ["设计 Agent"] } },
    trace: [{
      step: 1,
      skillKey: "understandJobIndustry",
      skillName: "understand_job_industry",
      status: "success",
      durationMs: 10,
      inputSummary: { jdChars: 12 },
      outputSummary: { sizeChars: 20 },
      model: { called: false }
    }]
  }, { query: "分析岗位并准备面试", job: {}, profile: {}, interview: {} });

  assert.equal(result.runId, "run-test-1");
  const metrics = database.getMetricsSummary();
  assert.equal(metrics.totals.total_runs, 2);
  assert.equal(metrics.totals.successful_runs, 2);
  assert.equal(metrics.dataCounts.artifacts, 2);
});
