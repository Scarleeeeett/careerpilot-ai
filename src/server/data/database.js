import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const PROJECT_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const DEFAULT_DATA_DIR = process.env.CAREERPILOT_DATA_DIR || join(PROJECT_ROOT, "data");
const DATABASE_PATH = process.env.CAREERPILOT_DATABASE_PATH || join(DEFAULT_DATA_DIR, "careerpilot.sqlite");
const DATA_DIR = process.env.CAREERPILOT_DATA_DIR || dirname(DATABASE_PATH);
const FILES_DIR = process.env.CAREERPILOT_FILES_DIR || join(DATA_DIR, "files");
const BACKUPS_DIR = process.env.CAREERPILOT_BACKUPS_DIR || join(DATA_DIR, "backups");

mkdirSync(dirname(DATABASE_PATH), { recursive: true });
mkdirSync(FILES_DIR, { recursive: true });
mkdirSync(BACKUPS_DIR, { recursive: true });

const db = new DatabaseSync(DATABASE_PATH);
db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");

function now() {
  return new Date().toISOString();
}

function json(value, fallback = {}) {
  return JSON.stringify(value ?? fallback);
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function hash(value) {
  return createHash("sha256").update(Buffer.isBuffer(value) ? value : typeof value === "string" ? value : json(value)).digest("hex");
}

function text(value) {
  return value === undefined || value === null ? "" : String(value);
}

function nullable(value) {
  return value === undefined || value === null || value === "" ? null : value;
}

function transaction(operation) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_snapshots (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      app_version TEXT,
      content_hash TEXT NOT NULL,
      state_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_app_snapshots_created_at ON app_snapshots(created_at DESC);

    CREATE TABLE IF NOT EXISTS resumes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      target TEXT,
      industry TEXT,
      active_version_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS resume_versions (
      id TEXT PRIMARY KEY,
      resume_id TEXT NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      resume_text TEXT NOT NULL,
      projects_text TEXT NOT NULL,
      file_name TEXT,
      file_type TEXT,
      file_asset_id TEXT,
      parse_status TEXT,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(resume_id, content_hash)
    );
    CREATE INDEX IF NOT EXISTS idx_resume_versions_resume ON resume_versions(resume_id, version_number DESC);

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      company TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT,
      business_line TEXT,
      status TEXT,
      channel TEXT,
      application_date TEXT,
      link TEXT,
      bound_resume_id TEXT,
      active_jd_version_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jd_versions (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      jd_text TEXT NOT NULL,
      research_references TEXT,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(job_id, content_hash)
    );
    CREATE INDEX IF NOT EXISTS idx_jd_versions_job ON jd_versions(job_id, version_number DESC);

    CREATE TABLE IF NOT EXISTS interview_sessions (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      round_date TEXT,
      format TEXT,
      interviewer TEXT,
      source_draft TEXT,
      notes TEXT,
      next_steps TEXT,
      audio_json TEXT,
      feedback_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_interview_sessions_job ON interview_sessions(job_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS interview_questions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      answer TEXT,
      thinking TEXT,
      gap TEXT,
      next_answer TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_interview_questions_session ON interview_questions(session_id);

    CREATE TABLE IF NOT EXISTS interview_reviews (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
      run_id TEXT,
      version_number INTEGER NOT NULL,
      schema_version TEXT NOT NULL,
      status TEXT NOT NULL,
      modes_json TEXT,
      preparation_snapshot_json TEXT,
      comparison_confidence TEXT,
      metrics_json TEXT,
      result_json TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(session_id, content_hash)
    );
    CREATE INDEX IF NOT EXISTS idx_interview_reviews_session_version ON interview_reviews(session_id, version_number DESC);

    CREATE TABLE IF NOT EXISTS agent_runs (
      run_id TEXT PRIMARY KEY,
      task_type TEXT NOT NULL,
      status TEXT NOT NULL,
      query TEXT,
      job_id TEXT,
      jd_version_id TEXT,
      resume_version_id TEXT,
      interview_session_id TEXT,
      prompt_version TEXT,
      skill_version TEXT,
      provider TEXT,
      model TEXT,
      app_version TEXT,
      git_sha TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      duration_ms REAL,
      input_tokens INTEGER,
      output_tokens INTEGER,
      total_tokens INTEGER,
      estimated_cost REAL,
      input_json TEXT NOT NULL,
      output_json TEXT NOT NULL,
      routing_json TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_runs_job ON agent_runs(job_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_task ON agent_runs(task_type, started_at DESC);

    CREATE TABLE IF NOT EXISTS agent_steps (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
      step_number INTEGER NOT NULL,
      call_index INTEGER,
      skill_key TEXT,
      skill_name TEXT,
      execution_mode TEXT,
      status TEXT NOT NULL,
      started_at TEXT,
      duration_ms REAL,
      input_summary_json TEXT,
      output_summary_json TEXT,
      model_json TEXT,
      error_type TEXT,
      error_message TEXT,
      UNIQUE(run_id, step_number)
    );

    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      run_id TEXT REFERENCES agent_runs(run_id) ON DELETE SET NULL,
      job_id TEXT,
      artifact_type TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      content_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_artifacts_job_type ON artifacts(job_id, artifact_type, version_number DESC);

    CREATE TABLE IF NOT EXISTS metric_events (
      id TEXT PRIMARY KEY,
      event_name TEXT NOT NULL,
      run_id TEXT,
      job_id TEXT,
      value REAL,
      dimensions_json TEXT,
      occurred_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_metric_events_name_time ON metric_events(event_name, occurred_at DESC);

    CREATE TABLE IF NOT EXISTS file_assets (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      entity_id TEXT,
      file_name TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(category, entity_id, content_hash)
    );
    CREATE INDEX IF NOT EXISTS idx_file_assets_entity ON file_assets(category, entity_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS application_stage_events (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      from_status TEXT,
      to_status TEXT NOT NULL,
      source TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_stage_events_job_time ON application_stage_events(job_id, occurred_at DESC);

    CREATE TABLE IF NOT EXISTS eval_runs (
      id TEXT PRIMARY KEY,
      eval_type TEXT NOT NULL,
      dataset_version TEXT,
      app_version TEXT,
      total_cases INTEGER NOT NULL,
      passed_cases INTEGER NOT NULL,
      accuracy REAL NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      details_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_eval_runs_type_time ON eval_runs(eval_type, started_at DESC);

    CREATE TABLE IF NOT EXISTS eval_case_results (
      id TEXT PRIMARY KEY,
      eval_run_id TEXT NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL,
      dimension TEXT,
      node TEXT,
      passed INTEGER NOT NULL,
      expected_json TEXT,
      actual_json TEXT,
      error_message TEXT,
      UNIQUE(eval_run_id, case_id)
    );
  `);

  db.prepare("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(?, ?)").run(1, now());
  db.prepare("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(?, ?)").run(2, now());
  db.prepare("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(?, ?)").run(3, now());
  db.prepare("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(?, ?)").run(4, now());
}

migrate();

function ensureResumeVersion(resume, profile = {}, source = "state-sync") {
  if (!resume?.id) return null;
  const timestamp = resume.updatedAt || resume.createdAt || now();
  db.prepare(`
    INSERT INTO resumes(id, name, target, industry, created_at, updated_at)
    VALUES(?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      target = excluded.target,
      industry = excluded.industry,
      updated_at = excluded.updated_at
  `).run(resume.id, text(resume.name || resume.fileName || "未命名简历"), text(profile.target), text(profile.industry), timestamp, timestamp);

  const contentHash = hash({ resume: text(resume.resume), projects: text(resume.projects), fileName: text(resume.fileName), fileType: text(resume.fileType) });
  const existing = db.prepare("SELECT id FROM resume_versions WHERE resume_id = ? AND content_hash = ?").get(resume.id, contentHash);
  let versionId = existing?.id;
  if (!versionId) {
    versionId = randomUUID();
    const next = db.prepare("SELECT COALESCE(MAX(version_number), 0) + 1 AS value FROM resume_versions WHERE resume_id = ?").get(resume.id).value;
    db.prepare(`
      INSERT INTO resume_versions(
        id, resume_id, version_number, content_hash, resume_text, projects_text,
        file_name, file_type, file_asset_id, parse_status, source, created_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      versionId, resume.id, next, contentHash, text(resume.resume), text(resume.projects),
      text(resume.fileName), text(resume.fileType), nullable(resume.fileAssetId), text(resume.parseStatus), source, timestamp
    );
  }
  db.prepare("UPDATE resumes SET active_version_id = ?, updated_at = ? WHERE id = ?").run(versionId, timestamp, resume.id);
  return versionId;
}

function ensureJobAndJdVersion(job, source = "state-sync") {
  if (!job?.id) return null;
  const existingJob = db.prepare("SELECT status FROM jobs WHERE id = ?").get(job.id);
  const createdAt = job.createdAt || now();
  const updatedAt = job.updatedAt || createdAt;
  db.prepare(`
    INSERT INTO jobs(
      id, company, title, type, business_line, status, channel, application_date,
      link, bound_resume_id, created_at, updated_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      company = excluded.company,
      title = excluded.title,
      type = COALESCE(NULLIF(excluded.type, ''), jobs.type),
      business_line = COALESCE(NULLIF(excluded.business_line, ''), jobs.business_line),
      status = COALESCE(NULLIF(excluded.status, ''), jobs.status),
      channel = COALESCE(NULLIF(excluded.channel, ''), jobs.channel),
      application_date = COALESCE(NULLIF(excluded.application_date, ''), jobs.application_date),
      link = COALESCE(NULLIF(excluded.link, ''), jobs.link),
      bound_resume_id = COALESCE(excluded.bound_resume_id, jobs.bound_resume_id),
      updated_at = excluded.updated_at
  `).run(
    job.id, text(job.company || "未命名公司"), text(job.title || "未命名岗位"), text(job.type), text(job.businessLine),
    text(job.status), text(job.channel), text(job.date), text(job.link), nullable(job.resumeId), createdAt, updatedAt
  );

  const contentHash = hash({ jd: text(job.jd), references: text(job.researchReferences) });
  const existing = db.prepare("SELECT id FROM jd_versions WHERE job_id = ? AND content_hash = ?").get(job.id, contentHash);
  let versionId = existing?.id;
  if (!versionId) {
    versionId = randomUUID();
    const next = db.prepare("SELECT COALESCE(MAX(version_number), 0) + 1 AS value FROM jd_versions WHERE job_id = ?").get(job.id).value;
    db.prepare(`
      INSERT INTO jd_versions(id, job_id, version_number, content_hash, jd_text, research_references, source, created_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?)
    `).run(versionId, job.id, next, contentHash, text(job.jd), text(job.researchReferences), source, updatedAt);
  }
  db.prepare("UPDATE jobs SET active_jd_version_id = ?, updated_at = ? WHERE id = ?").run(versionId, updatedAt, job.id);
  const incomingStatus = text(job.status);
  const hasStageEvent = Boolean(db.prepare("SELECT 1 AS value FROM application_stage_events WHERE job_id = ? LIMIT 1").get(job.id));
  if (incomingStatus && (!existingJob || text(existingJob.status) !== incomingStatus || !hasStageEvent)) {
    db.prepare(`
      INSERT INTO application_stage_events(id, job_id, from_status, to_status, source, occurred_at)
      VALUES(?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), job.id, hasStageEvent ? nullable(existingJob?.status) : null, incomingStatus, source, updatedAt);
  }
  return versionId;
}

function syncBrowserEvalRun(evalRun, appVersion = "", source = "browser") {
  if (!evalRun?.startedAt) return null;
  const regression = Array.isArray(evalRun.regressionResults) ? evalRun.regressionResults : [];
  const routing = Array.isArray(evalRun.routingResults) ? evalRun.routingResults : [];
  const results = [...regression, ...routing];
  const passed = results.filter((item) => item.passed).length;
  const id = `browser-${hash({ startedAt: evalRun.startedAt, results }).slice(0, 32)}`;
  db.prepare(`
    INSERT OR IGNORE INTO eval_runs(
      id, eval_type, dataset_version, app_version, total_cases, passed_cases,
      accuracy, started_at, completed_at, details_json
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, "browser_offline_eval", source, text(appVersion), results.length, passed, results.length ? passed / results.length : 0, evalRun.startedAt, evalRun.completedAt || now(), json(evalRun));
  for (const item of results) {
    db.prepare(`
      INSERT OR IGNORE INTO eval_case_results(
        id, eval_run_id, case_id, dimension, node, passed, expected_json, actual_json, error_message
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), id, text(item.id), text(item.dimension || (item.expectedSkill ? "routing" : "regression")), text(item.node), item.passed ? 1 : 0, json(item.expected ?? item.expectedSkill ?? {}), json(item.actual ?? item.actualSkill ?? {}), nullable(item.error));
  }
  return id;
}

function insertInterviewReview(sessionId, review, { runId = null, preparationSnapshot = {} } = {}) {
  if (!review || typeof review !== "object" || !sessionId) return null;
  const contentJson = json(review);
  const contentHash = hash(contentJson);
  const existing = db.prepare("SELECT id FROM interview_reviews WHERE session_id = ? AND content_hash = ?").get(sessionId, contentHash);
  if (existing) return existing.id;
  const id = randomUUID();
  const version = db.prepare("SELECT COALESCE(MAX(version_number), 0) + 1 AS value FROM interview_reviews WHERE session_id = ?").get(sessionId).value;
  db.prepare(`
    INSERT INTO interview_reviews(
      id, session_id, run_id, version_number, schema_version, status, modes_json,
      preparation_snapshot_json, comparison_confidence, metrics_json, result_json,
      content_hash, generated_at, created_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, sessionId, nullable(runId), version, text(review.schemaVersion || "1.0"), text(review.status || "success"),
    json(review.modes || []), json(preparationSnapshot || {}), text(review.comparisonConfidence),
    json(review.preparationAudit?.metrics || {}), contentJson, contentHash, review.generatedAt || now(), now()
  );
  return id;
}

function syncInterviewSessions(job) {
  for (const round of job.reviewRounds || []) {
    if (!round?.id) continue;
    const createdAt = round.createdAt || now();
    const updatedAt = round.updatedAt || createdAt;
    db.prepare(`
      INSERT INTO interview_sessions(
        id, job_id, title, round_date, format, interviewer, source_draft, notes,
        next_steps, audio_json, feedback_json, created_at, updated_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        round_date = excluded.round_date,
        format = excluded.format,
        interviewer = excluded.interviewer,
        source_draft = excluded.source_draft,
        notes = excluded.notes,
        next_steps = excluded.next_steps,
        audio_json = excluded.audio_json,
        feedback_json = excluded.feedback_json,
        updated_at = excluded.updated_at
    `).run(
      round.id, job.id, text(round.title || "未命名面试"), text(round.date), text(round.format), text(round.interviewer),
      text(round.sourceDraft), text(round.notes), text(round.nextSteps), json(round.audio, null), json(round.aiReview || round.feedbackAnalysis, null), createdAt, updatedAt
    );

    for (const question of round.questionItems || []) {
      if (!question?.id) continue;
      const questionCreatedAt = question.createdAt || createdAt;
      const questionUpdatedAt = question.updatedAt || updatedAt;
      db.prepare(`
        INSERT INTO interview_questions(id, session_id, title, answer, thinking, gap, next_answer, created_at, updated_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          answer = excluded.answer,
          thinking = excluded.thinking,
          gap = excluded.gap,
          next_answer = excluded.next_answer,
          updated_at = excluded.updated_at
      `).run(
        question.id, round.id, text(question.title || "未命名问题"), text(question.answer), text(question.thinking),
        text(question.gap), text(question.nextAnswer), questionCreatedAt, questionUpdatedAt
      );
    }

    for (const review of round.aiReviewHistory || []) insertInterviewReview(round.id, review, { preparationSnapshot: round.preparationSnapshot || {} });
    insertInterviewReview(round.id, round.aiReview, { runId: round.aiReviewRunId || round.feedbackRunId, preparationSnapshot: round.preparationSnapshot || {} });
  }
}

function syncArtifacts(job) {
  const candidates = [];
  if (job.analysis) candidates.push(["job_analysis", job.analysis]);
  if (job.prep) candidates.push(["interview_prep", job.prep]);
  if (job.coverLetterSkill) candidates.push(["cover_letter", job.coverLetterSkill]);
  if (job.selfIntroductionSkill) candidates.push(["self_introduction", job.selfIntroductionSkill]);
  if (job.analysisModules) {
    for (const [key, value] of Object.entries(job.analysisModules)) candidates.push([`analysis_module:${key}`, value]);
  }

  for (const [artifactType, content] of candidates) {
    if (!content) continue;
    const contentJson = json(content);
    const contentHash = hash(contentJson);
    const exists = db.prepare("SELECT id FROM artifacts WHERE job_id = ? AND artifact_type = ? AND content_hash = ?").get(job.id, artifactType, contentHash);
    if (exists) continue;
    const version = db.prepare("SELECT COALESCE(MAX(version_number), 0) + 1 AS value FROM artifacts WHERE job_id = ? AND artifact_type = ?").get(job.id, artifactType).value;
    db.prepare(`
      INSERT INTO artifacts(id, run_id, job_id, artifact_type, version_number, content_hash, content_json, created_at)
      VALUES(?, NULL, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), job.id, artifactType, version, contentHash, contentJson, content.generatedAt || now());
  }
}

export function saveStateSnapshot(state, { source = "state-sync", forceSnapshot = false } = {}) {
  if (!state || typeof state !== "object") throw new TypeError("state 必须是对象");
  const stateJson = json(state);
  const contentHash = hash(stateJson);
  const timestamp = now();

  const saved = transaction(() => {
    const latest = db.prepare("SELECT content_hash FROM app_snapshots ORDER BY created_at DESC LIMIT 1").get();
    let snapshotId = null;
    if (forceSnapshot || latest?.content_hash !== contentHash) {
      snapshotId = randomUUID();
      db.prepare(`
        INSERT INTO app_snapshots(id, source, app_version, content_hash, state_json, created_at)
        VALUES(?, ?, ?, ?, ?, ?)
      `).run(snapshotId, source, text(state.appVersion), contentHash, stateJson, timestamp);
    }

    const profile = state.profile || {};
    const resumes = Array.isArray(profile.resumes) ? profile.resumes : [];
    for (const resume of resumes) ensureResumeVersion(resume, profile, source);
    for (const job of state.jobs || []) {
      ensureJobAndJdVersion(job, source);
      syncInterviewSessions(job);
      syncArtifacts(job);
    }
    syncBrowserEvalRun(state.evalRun, state.appVersion, source);

    return { snapshotId, contentHash, savedAt: timestamp };
  });

  const archivedRuns = [
    ...(Array.isArray(state.traceHistory) ? state.traceHistory : []),
    ...(state.skillRun?.runId && !(state.traceHistory || []).some((run) => run.runId === state.skillRun.runId) ? [state.skillRun] : [])
  ];
  let migratedRunCount = 0;
  const runMigrationErrors = [];
  for (const run of archivedRuns) {
    if (!run?.runId) continue;
    try {
      persistAgentRun(run, {
        query: run.query || "",
        job: {},
        profile: {},
        interview: {}
      }, {
        jobId: run.jobId || null,
        taskType: source === "legacy-localstorage" ? "legacy_trace" : undefined,
        appVersion: state.appVersion || "",
        promptVersion: "legacy-browser-trace",
        skillVersion: "legacy-browser"
      });
      migratedRunCount += 1;
    } catch (error) {
      runMigrationErrors.push({ runId: run.runId, error: error.message });
    }
  }
  let backupPath = null;
  if (source.startsWith("legacy") && saved.snapshotId) backupPath = createDatabaseBackup("legacy-migration");
  return { ...saved, migratedRunCount, runMigrationErrors, backupPath };
}

export function loadLatestState() {
  const row = db.prepare("SELECT id, source, app_version, state_json, created_at FROM app_snapshots ORDER BY created_at DESC LIMIT 1").get();
  if (!row) return null;
  return {
    snapshotId: row.id,
    source: row.source,
    appVersion: row.app_version,
    state: parseJson(row.state_json, {}),
    savedAt: row.created_at
  };
}

function usageFromRun(run) {
  return (run.trace || []).reduce((usage, step) => {
    const current = step.model?.usage || {};
    usage.input += Number(current.prompt_tokens ?? current.input_tokens ?? 0);
    usage.output += Number(current.completion_tokens ?? current.output_tokens ?? 0);
    usage.total += Number(current.total_tokens ?? 0);
    return usage;
  }, { input: 0, output: 0, total: 0 });
}

function inferTaskType(run) {
  const plan = run.routing?.plan || run.plan?.steps || [];
  if (plan.includes("interviewRetrospective") || plan.includes("interviewFeedbackAnalyzer")) return "interview_retrospective";
  if (plan.includes("coverLetterTailor")) return "cover_letter";
  if (plan.includes("prepPlanner")) return "interview_prep";
  if (plan.includes("profileMatcher")) return "candidate_match";
  return plan[0] || "agent_task";
}

export function persistAgentRun(run, rawInput = {}, metadata = {}) {
  if (!run?.runId) throw new TypeError("Agent Run 缺少 runId");
  const usage = usageFromRun(run);
  const jobId = rawInput.job?.id || metadata.jobId || null;
  const startedAt = run.startedAt || now();
  const completedAt = run.completedAt || now();
  const provider = metadata.provider || (run.trace || []).find((step) => step.model?.provider)?.model?.provider || null;
  const model = metadata.model || (run.trace || []).find((step) => step.model?.model)?.model?.model || null;

  return transaction(() => {
    const existedBefore = Boolean(db.prepare("SELECT 1 AS value FROM agent_runs WHERE run_id = ?").get(run.runId));
    let jdVersionId = null;
    let resumeVersionId = null;
    if (rawInput.job?.id) jdVersionId = ensureJobAndJdVersion(rawInput.job, "agent-run");
    if (rawInput.profile?.resumeId) resumeVersionId = ensureResumeVersion({
      id: rawInput.profile.resumeId,
      name: rawInput.profile.activeResumeName || rawInput.profile.resumeFileName || "运行时简历",
      resume: rawInput.profile.resume || "",
      projects: rawInput.profile.projects || "",
      fileName: rawInput.profile.resumeFileName || "",
      fileType: rawInput.profile.resumeFileType || ""
    }, rawInput.profile, "agent-run");

    db.prepare(`
      INSERT INTO agent_runs(
        run_id, task_type, status, query, job_id, jd_version_id, resume_version_id,
        interview_session_id, prompt_version, skill_version, provider, model, app_version,
        git_sha, started_at, completed_at, duration_ms, input_tokens, output_tokens,
        total_tokens, estimated_cost, input_json, output_json, routing_json,
        error_message, created_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id) DO UPDATE SET
        status = excluded.status,
        completed_at = excluded.completed_at,
        duration_ms = excluded.duration_ms,
        input_tokens = excluded.input_tokens,
        output_tokens = excluded.output_tokens,
        total_tokens = excluded.total_tokens,
        output_json = excluded.output_json,
        routing_json = excluded.routing_json,
        error_message = excluded.error_message
    `).run(
      run.runId, metadata.taskType || inferTaskType(run), text(run.status || "unknown"), text(run.query || rawInput.query),
      nullable(jobId), nullable(jdVersionId), nullable(resumeVersionId), nullable(rawInput.interview?.roundId),
      text(metadata.promptVersion || "agent-run-v1"), text(metadata.skillVersion || "registry-current"), nullable(provider), nullable(model),
      text(metadata.appVersion || "0.1.0"), nullable(metadata.gitSha || process.env.GIT_SHA), startedAt, completedAt,
      Number(run.summary?.totalDurationMs || 0), usage.input, usage.output, usage.total || usage.input + usage.output,
      nullable(metadata.estimatedCost), json(rawInput), json(run.output || {}), json(run.routing || run.plan || {}), nullable(run.error), now()
    );

    const interviewReview = run.output?.interviewRetrospective;
    if (interviewReview && rawInput.interview?.roundId && jobId) {
      const roundId = rawInput.interview.roundId;
      const timestamp = interviewReview.generatedAt || completedAt;
      db.prepare(`
        INSERT INTO interview_sessions(id, job_id, title, round_date, format, interviewer, source_draft, notes, next_steps, audio_json, feedback_json, created_at, updated_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET feedback_json = excluded.feedback_json, updated_at = excluded.updated_at
      `).run(
        roundId, jobId, text(rawInput.interview.roundName || "未命名面试"), text(rawInput.interview.roundDate), text(rawInput.interview.format),
        text(rawInput.interview.interviewer), "", text(rawInput.interview.rawNotes), "", null, json(interviewReview), timestamp, timestamp
      );
      insertInterviewReview(roundId, interviewReview, { runId: run.runId, preparationSnapshot: rawInput.interview.preparationSnapshot || {} });
    }

    db.prepare("DELETE FROM agent_steps WHERE run_id = ?").run(run.runId);
    for (const step of run.trace || []) {
      db.prepare(`
        INSERT INTO agent_steps(
          id, run_id, step_number, call_index, skill_key, skill_name, execution_mode,
          status, started_at, duration_ms, input_summary_json, output_summary_json,
          model_json, error_type, error_message
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(), run.runId, Number(step.step || 0), Number(step.callIndex || 1), text(step.skillKey), text(step.skillName),
        text(step.executionMode), text(step.status || "unknown"), nullable(step.startedAt), Number(step.durationMs || 0),
        json(step.inputSummary || {}), json(step.outputSummary || {}), json(step.model || {}), nullable(step.errorType), nullable(step.errorMessage)
      );
    }

    for (const [artifactType, content] of Object.entries(run.output || {})) {
      const contentJson = json(content);
      const contentHash = hash(contentJson);
      const exists = db.prepare("SELECT id FROM artifacts WHERE run_id = ? AND artifact_type = ? AND content_hash = ?").get(run.runId, artifactType, contentHash);
      if (exists) continue;
      const version = db.prepare("SELECT COALESCE(MAX(version_number), 0) + 1 AS value FROM artifacts WHERE job_id IS ? AND artifact_type = ?").get(jobId, artifactType).value;
      db.prepare(`
        INSERT INTO artifacts(id, run_id, job_id, artifact_type, version_number, content_hash, content_json, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), run.runId, nullable(jobId), artifactType, version, contentHash, contentJson, completedAt);
    }

    if (!existedBefore) {
      recordMetricEvent("agent_run_completed", {
        runId: run.runId,
        jobId,
        value: run.status === "success" ? 1 : 0,
        dimensions: { status: run.status, taskType: metadata.taskType || inferTaskType(run), provider, model }
      });
    }

    return { runId: run.runId, persistedAt: now() };
  });
}

export function persistLegacyRun({ taskType, input, result, provider, model, startedAt, durationMs, status = "success", error = null }) {
  const runId = randomUUID();
  const run = {
    runId,
    query: taskType,
    status,
    startedAt: startedAt || now(),
    completedAt: now(),
    summary: { totalDurationMs: Number(durationMs || 0) },
    routing: { planner: "legacy-fixed-endpoint", plan: [taskType] },
    output: result || {},
    error,
    trace: [{
      step: 1,
      callIndex: 1,
      skillKey: taskType,
      skillName: taskType,
      executionMode: "legacy-fixed-endpoint",
      status,
      startedAt: startedAt || now(),
      durationMs: Number(durationMs || 0),
      inputSummary: { jobId: input?.job?.id || null, jdChars: text(input?.job?.jd).length, resumeChars: text(input?.profile?.resume).length },
      outputSummary: { sizeChars: json(result || {}).length },
      model: { called: Boolean(provider), provider: provider || null, model: model || null, usage: result?._trace?.usage || null },
      errorMessage: error
    }]
  };
  return persistAgentRun(run, input, { taskType, provider, model, promptVersion: `${taskType}-v1` });
}

export function recordMetricEvent(eventName, { runId = null, jobId = null, value = null, dimensions = {}, occurredAt = now() } = {}) {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO metric_events(id, event_name, run_id, job_id, value, dimensions_json, occurred_at)
    VALUES(?, ?, ?, ?, ?, ?, ?)
  `).run(id, eventName, nullable(runId), nullable(jobId), value === null ? null : Number(value), json(dimensions), occurredAt);
  return id;
}

export function saveFileAsset({ category = "attachment", entityId = null, fileName = "file", mimeType = "application/octet-stream", data = "" }) {
  const buffer = Buffer.from(String(data).replace(/^data:.*?;base64,/, ""), "base64");
  if (!buffer.length) throw new Error("文件内容为空");
  const contentHash = hash(buffer);
  const existing = db.prepare("SELECT id, file_name, mime_type, size_bytes, created_at FROM file_assets WHERE category = ? AND entity_id IS ? AND content_hash = ?")
    .get(text(category), nullable(entityId), contentHash);
  if (existing) return { id: existing.id, fileName: existing.file_name, mimeType: existing.mime_type, size: existing.size_bytes, createdAt: existing.created_at, deduplicated: true };

  const suffix = extname(text(fileName)).toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 12);
  const storagePath = join(FILES_DIR, `${contentHash}${suffix}`);
  if (!existsSync(storagePath)) writeFileSync(storagePath, buffer, { flag: "wx" });
  const id = randomUUID();
  const createdAt = now();
  db.prepare(`
    INSERT INTO file_assets(id, category, entity_id, file_name, mime_type, size_bytes, content_hash, storage_path, created_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, text(category), nullable(entityId), text(fileName || "file"), text(mimeType || "application/octet-stream"), buffer.length, contentHash, storagePath, createdAt);
  recordMetricEvent("file_asset_saved", { value: buffer.length, dimensions: { category, mimeType } });
  return { id, fileName: text(fileName || "file"), mimeType: text(mimeType || "application/octet-stream"), size: buffer.length, createdAt, deduplicated: false };
}

export function loadFileAsset(id) {
  const row = db.prepare("SELECT id, file_name, mime_type, size_bytes, storage_path FROM file_assets WHERE id = ?").get(id);
  if (!row || !existsSync(row.storage_path)) return null;
  return { id: row.id, fileName: row.file_name, mimeType: row.mime_type || "application/octet-stream", size: row.size_bytes, buffer: readFileSync(row.storage_path) };
}

export function createDatabaseBackup(label = "manual") {
  const safeLabel = text(label).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 60) || "backup";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = join(BACKUPS_DIR, `${safeLabel}-${timestamp}.sqlite`);
  const escaped = destination.replaceAll("'", "''");
  db.exec(`VACUUM INTO '${escaped}'`);
  return destination;
}

export function getMetricsSummary() {
  const totals = db.prepare(`
    SELECT
      COUNT(*) AS total_runs,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successful_runs,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_runs,
      SUM(CASE WHEN status = 'needs_clarification' THEN 1 ELSE 0 END) AS clarification_runs,
      AVG(duration_ms) AS average_duration_ms,
      SUM(total_tokens) AS total_tokens
    FROM agent_runs
  `).get();
  const byTask = db.prepare(`
    SELECT task_type, status, COUNT(*) AS count, AVG(duration_ms) AS average_duration_ms
    FROM agent_runs GROUP BY task_type, status ORDER BY task_type, status
  `).all();
  const applicationFunnel = db.prepare("SELECT status, COUNT(*) AS count FROM jobs GROUP BY status ORDER BY count DESC").all();
  const stageTransitions = db.prepare("SELECT from_status, to_status, COUNT(*) AS count FROM application_stage_events GROUP BY from_status, to_status ORDER BY count DESC").all();
  const latestEvals = db.prepare("SELECT id, eval_type, dataset_version, app_version, total_cases, passed_cases, accuracy, started_at FROM eval_runs ORDER BY started_at DESC LIMIT 20").all();
  const dataCounts = {
    resumes: db.prepare("SELECT COUNT(*) AS value FROM resumes").get().value,
    resumeVersions: db.prepare("SELECT COUNT(*) AS value FROM resume_versions").get().value,
    jobs: db.prepare("SELECT COUNT(*) AS value FROM jobs").get().value,
    jdVersions: db.prepare("SELECT COUNT(*) AS value FROM jd_versions").get().value,
    interviews: db.prepare("SELECT COUNT(*) AS value FROM interview_sessions").get().value,
    interviewReviews: db.prepare("SELECT COUNT(*) AS value FROM interview_reviews").get().value,
    artifacts: db.prepare("SELECT COUNT(*) AS value FROM artifacts").get().value,
    files: db.prepare("SELECT COUNT(*) AS value FROM file_assets").get().value,
    evalRuns: db.prepare("SELECT COUNT(*) AS value FROM eval_runs").get().value,
    stageEvents: db.prepare("SELECT COUNT(*) AS value FROM application_stage_events").get().value,
    snapshots: db.prepare("SELECT COUNT(*) AS value FROM app_snapshots").get().value
  };
  return { totals, byTask, applicationFunnel, stageTransitions, latestEvals, dataCounts, generatedAt: now() };
}

export function persistEvalSummary(summary, { evalType = "planner_exact_plan", datasetVersion = "routing-v1", appVersion = "0.1.0" } = {}) {
  const results = Array.isArray(summary?.results) ? summary.results : [];
  const passed = Number(summary?.passed ?? results.filter((item) => item.passed).length);
  const total = Number(summary?.total ?? results.length);
  const startedAt = summary.startedAt || now();
  const id = summary.id || randomUUID();
  return transaction(() => {
    db.prepare(`
      INSERT INTO eval_runs(id, eval_type, dataset_version, app_version, total_cases, passed_cases, accuracy, started_at, completed_at, details_json)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, evalType, datasetVersion, appVersion, total, passed, total ? passed / total : 0, startedAt, now(), json(summary));
    for (const item of results) {
      db.prepare(`
        INSERT INTO eval_case_results(id, eval_run_id, case_id, dimension, node, passed, expected_json, actual_json, error_message)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), id, text(item.id), text(item.dimension), text(item.node), item.passed ? 1 : 0, json(item.expectedSteps ?? item.expected ?? {}), json(item.actualSteps ?? item.actual ?? {}), nullable(item.error));
    }
    return { id, passed, total, accuracy: total ? passed / total : 0 };
  });
}

export const databaseRuntime = {
  provider: "sqlite",
  path: DATABASE_PATH,
  schemaVersion: 4
};
