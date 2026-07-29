import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { planAgentTask } from "../src/server/agent/planner.js";
import { persistEvalSummary } from "../src/server/data/database.js";

const root = dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(await readFile(join(root, "datasets", "routing.json"), "utf8"));
const startedAt = new Date().toISOString();
const results = cases.map((item) => {
  const actualSteps = planAgentTask(item.query).steps;
  const passed = JSON.stringify(actualSteps) === JSON.stringify(item.expectedSteps);
  return { id: item.id, passed, expectedSteps: item.expectedSteps, actualSteps };
});
const passed = results.filter((item) => item.passed).length;
const summary = { metric: "Deterministic Planner Exact Plan Accuracy", startedAt, passed, total: results.length, accuracy: passed / results.length, results };
const datasetVersion = createHash("sha256").update(JSON.stringify(cases)).digest("hex").slice(0, 16);
persistEvalSummary(summary, { evalType: "planner_exact_plan", datasetVersion, appVersion: "0.1.0" });
console.log(JSON.stringify(summary, null, 2));
if (passed !== results.length) process.exitCode = 1;
