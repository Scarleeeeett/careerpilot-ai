import {
  databaseRuntime,
  getMetricsSummary,
  loadFileAsset,
  loadLatestState,
  recordMetricEvent,
  saveFileAsset,
  saveStateSnapshot
} from "../data/database.js";

const MAX_BODY_BYTES = Number(process.env.MAX_JSON_BODY_BYTES || 8 * 1024 * 1024);
const MAX_FILE_BODY_BYTES = Number(process.env.MAX_FILE_BODY_BYTES || 64 * 1024 * 1024);

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

async function readJson(req, limit = MAX_BODY_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error(`请求体超过 ${limit} 字节限制`);
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export async function handleDataBootstrap(_req, res) {
  try {
    const latest = loadLatestState();
    sendJson(res, 200, {
      ok: true,
      hasPersistedState: Boolean(latest),
      database: { provider: databaseRuntime.provider, schemaVersion: databaseRuntime.schemaVersion },
      ...(latest || {})
    });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || "读取数据库失败" });
  }
}

export async function handleStatePersistence(req, res) {
  try {
    const body = await readJson(req);
    if (!body.state || typeof body.state !== "object" || Array.isArray(body.state)) {
      sendJson(res, 400, { ok: false, error: "state 必须是对象" });
      return;
    }
    const source = String(body.source || "browser-sync").slice(0, 100);
    const saved = saveStateSnapshot(body.state, {
      source,
      forceSnapshot: source === "legacy-localstorage"
    });
    recordMetricEvent(source === "legacy-localstorage" ? "legacy_state_migrated" : "state_synced", {
      value: 1,
      dimensions: {
        appVersion: body.state.appVersion || "",
        jobCount: Array.isArray(body.state.jobs) ? body.state.jobs.length : 0,
        resumeCount: Array.isArray(body.state.profile?.resumes) ? body.state.profile.resumes.length : 0
      }
    });
    sendJson(res, 200, { ok: true, ...saved });
  } catch (error) {
    sendJson(res, error.statusCode || (error instanceof SyntaxError ? 400 : 500), { ok: false, error: error.message || "保存数据库失败" });
  }
}

export async function handleMetricsSummary(_req, res) {
  try {
    sendJson(res, 200, { ok: true, ...getMetricsSummary() });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || "读取指标失败" });
  }
}

export async function handleFileUpload(req, res) {
  try {
    const body = await readJson(req, MAX_FILE_BODY_BYTES);
    const asset = saveFileAsset({
      category: String(body.category || "attachment").slice(0, 100),
      entityId: body.entityId ? String(body.entityId).slice(0, 300) : null,
      fileName: String(body.fileName || "file").slice(0, 500),
      mimeType: String(body.mimeType || "application/octet-stream").slice(0, 200),
      data: body.data || ""
    });
    sendJson(res, 200, { ok: true, asset });
  } catch (error) {
    sendJson(res, error.statusCode || (error instanceof SyntaxError ? 400 : 500), { ok: false, error: error.message || "文件保存失败" });
  }
}

export async function handleFileDownload(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const id = decodeURIComponent(url.pathname.slice("/api/data/file/".length));
    const asset = loadFileAsset(id);
    if (!asset) {
      sendJson(res, 404, { ok: false, error: "文件不存在" });
      return;
    }
    const safeName = asset.fileName.replace(/[\r\n"]/g, "_");
    res.writeHead(200, {
      "Content-Type": asset.mimeType,
      "Content-Length": asset.buffer.length,
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, max-age=3600"
    });
    res.end(asset.buffer);
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || "文件读取失败" });
  }
}
