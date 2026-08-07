import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";

const MAX_RESPONSE_BYTES = 64 * 1024;
const INVALID_RESPONSE_MESSAGE = "Model review response is invalid.";
const TRANSIENT_KEYS = new Set([
  "artifactPath", "artifactPaths", "capturedAt", "finishedAt", "harnessJsonl", "reviewRoot", "runId",
  "runtimeJsonl", "scenarioRoot", "scenarios", "screenshots", "startedAt", "ts", "workspaceState"
]);

export function loadModelReview({ root, promptHash, evidenceHash, expectedAssertionIds, env = process.env }) {
  const configuredPolicy = env.ASCIIDOC_TABLE_MODEL_REVIEW_POLICY;
  const policy = configuredPolicy === "required" ? "required" : "optional";
  const base = {
    reviewerKind: "model", policy, promptHash, evidenceHash,
    provider: null, model: null, response: null, result: null
  };
  if (configuredPolicy !== undefined && configuredPolicy !== "optional" && configuredPolicy !== "required") {
    return blocked(base, policy, "model-review.policy-invalid", "The model review policy is invalid.");
  }
  const configuredPath = env.ASCIIDOC_TABLE_MODEL_REVIEW_RESPONSE_PATH;
  if (!configuredPath) {
    const status = policy === "required" ? "blocked" : "not-run";
    return {
      artifact: {
        ...base,
        status,
        ...safeReason(
          policy === "required" ? "model-review.response-required" : "model-review.response-not-configured",
          policy === "required" ? "A required model review response was not configured." : "No model review response was configured."
        )
      },
      fail: policy === "required"
    };
  }

  const responsePath = resolve(root, configuredPath);
  let size;
  try {
    size = statSync(responsePath).size;
  } catch {
    return blocked(base, policy, "model-review.response-unavailable", INVALID_RESPONSE_MESSAGE);
  }
  if (size > MAX_RESPONSE_BYTES) {
    return blocked(base, policy, "model-review.response-too-large", INVALID_RESPONSE_MESSAGE);
  }
  let text;
  try {
    text = readFileSync(responsePath, "utf8");
  } catch {
    return blocked(base, policy, "model-review.response-unavailable", INVALID_RESPONSE_MESSAGE);
  }
  let responseArtifact;
  try {
    responseArtifact = JSON.parse(text);
  } catch {
    return blocked(base, policy, "model-review.response-json-invalid", INVALID_RESPONSE_MESSAGE);
  }
  const validation = validateModelResponse(responseArtifact, promptHash, evidenceHash, expectedAssertionIds);
  if (validation) return blocked(base, policy, validation.code, validation.message);

  const artifact = {
    reviewerKind: "model",
    policy,
    status: responseArtifact.result,
    provider: responseArtifact.provider,
    model: responseArtifact.model,
    promptHash,
    evidenceHash,
    response: { assertions: responseArtifact.response.assertions.map(({ id, result }) => ({ id, result })) },
    result: responseArtifact.result
  };
  return { artifact, fail: policy === "required" && artifact.status !== "pass" };
}

function blocked(base, policy, code, message) {
  return { artifact: { ...base, status: "blocked", ...safeReason(code, message) }, fail: policy === "required" };
}

function safeReason(code, message) {
  return { reasonCode: code, reason: message };
}

function validateModelResponse(response, promptHash, evidenceHash, expectedAssertionIds) {
  const invalid = (code, message) => ({ code, message });
  if (typeof response !== "object" || response === null || Array.isArray(response) ||
      !hasExactKeys(response, ["reviewerKind", "provider", "model", "promptHash", "evidenceHash", "result", "response"])) {
    return invalid("model-review.schema-invalid", INVALID_RESPONSE_MESSAGE);
  }
  if (response.reviewerKind !== "model" || !isSafeReviewToken(response.provider) || !isSafeReviewToken(response.model)) {
    return invalid("model-review.provenance-invalid", INVALID_RESPONSE_MESSAGE);
  }
  if (response.promptHash !== promptHash) return invalid("model-review.prompt-mismatch", INVALID_RESPONSE_MESSAGE);
  if (response.evidenceHash !== evidenceHash) return invalid("model-review.evidence-mismatch", INVALID_RESPONSE_MESSAGE);
  if (response.result !== "pass" && response.result !== "needs-fix" && response.result !== "human-review") {
    return invalid("model-review.result-invalid", INVALID_RESPONSE_MESSAGE);
  }
  if (typeof response.response !== "object" || response.response === null || Array.isArray(response.response) ||
      !hasExactKeys(response.response, ["assertions"]) || !Array.isArray(response.response.assertions)) {
    return invalid("model-review.assertions-invalid", INVALID_RESPONSE_MESSAGE);
  }
  const expected = new Set(expectedAssertionIds);
  if (expected.size !== expectedAssertionIds.length) {
    return invalid("model-review.expected-assertions-invalid", INVALID_RESPONSE_MESSAGE);
  }
  const actual = new Set();
  for (const assertion of response.response.assertions) {
    if (typeof assertion !== "object" || assertion === null || Array.isArray(assertion) ||
        !hasExactKeys(assertion, ["id", "result"]) || typeof assertion.id !== "string" || assertion.id.length === 0 || actual.has(assertion.id) ||
        (assertion.result !== "pass" && assertion.result !== "needs-fix" && assertion.result !== "human-review")) {
      return invalid("model-review.assertions-invalid", INVALID_RESPONSE_MESSAGE);
    }
    actual.add(assertion.id);
  }
  if (actual.size !== expected.size || [...actual].some((id) => !expected.has(id))) {
    return invalid("model-review.assertion-coverage-invalid", INVALID_RESPONSE_MESSAGE);
  }
  if (response.result !== aggregateAssertionResults(response.response.assertions)) {
    return invalid("model-review.aggregate-mismatch", INVALID_RESPONSE_MESSAGE);
  }
  return undefined;
}

export function applyModelReviewToScenarioResults(scenarioResults, modelArtifact) {
  const verdicts = new Map(modelArtifact.response?.assertions?.map((assertion) => [assertion.id, assertion.result]) ?? []);
  return scenarioResults.map((scenario) => ({
    ...scenario,
    checks: scenario.checks.map((check) => {
      if (check.provenance !== "model-derived-review") return check;
      const assertionId = check.id.replace(/^assertion-/u, "");
      const status = verdicts.get(assertionId) ?? modelArtifact.status;
      return {
        ...check,
        passed: status === "pass",
        status,
        severity: status === "needs-fix" || status === "blocked" ? "error" : status === "human-review" ? "warning" : "info",
        summary: modelAssertionSummary(assertionId, status)
      };
    })
  }));
}

export function rootAssertionResults(scenarioResults) {
  return scenarioResults.flatMap((scenario) => scenario.checks
    .filter((check) => check.assertionType)
    .map((check) => ({ scenarioId: scenario.id, ...check })));
}

export function rewriteModelDerivedArtifacts({ scenarioResults, aggregateGeometry, reviewRoot, scenariosRoot }) {
  for (const scenario of scenarioResults) {
    const scenarioRoot = join(scenariosRoot, scenario.id);
    writeFileSync(join(scenarioRoot, "assertion-results.json"), JSON.stringify(
      scenario.checks.filter((check) => check.assertionType), null, 2
    ), "utf8");
    const geometryPath = join(scenarioRoot, "ui-geometry.json");
    if (existsSync(geometryPath)) {
      const geometry = JSON.parse(readFileSync(geometryPath, "utf8"));
      const updated = { ...geometry, checks: scenario.checks };
      writeFileSync(geometryPath, JSON.stringify(updated, null, 2), "utf8");
      aggregateGeometry[scenario.id] = updated;
    }
  }
  writeFileSync(join(reviewRoot, "assertion-results.json"), JSON.stringify(rootAssertionResults(scenarioResults), null, 2), "utf8");
  writeFileSync(join(reviewRoot, "ui-geometry.json"), JSON.stringify(aggregateGeometry, null, 2), "utf8");
}

export function createEvidenceManifest({ workspaceRoot, reviewRoot, scenariosRoot, screenshotsRoot }) {
  const artifactPaths = [];
  for (const name of [
    "assertion-results.json", "command-trace.json", "harness.jsonl", "runtime.jsonl", "ui-geometry.json",
    "ui-review-report.json", "ui-self-review.json", "workspace-state.json"
  ]) {
    const path = join(reviewRoot, name);
    if (existsSync(path)) artifactPaths.push(path);
  }
  collectEvidenceFiles(scenariosRoot, artifactPaths, (path) => path.endsWith(".json") || path.endsWith(".jsonl"));
  collectEvidenceFiles(screenshotsRoot, artifactPaths, () => true);
  const entries = artifactPaths.sort().map((path) => evidenceManifestEntry(path, workspaceRoot, reviewRoot));
  return { version: 1, entries };
}

export function validateEvidenceManifest({ workspaceRoot, reviewRoot, manifest }) {
  try {
    if (typeof manifest !== "object" || manifest === null || manifest.version !== 1 || !Array.isArray(manifest.entries) ||
        typeof manifest.evidenceHash !== "string" || !/^[a-f0-9]{64}$/u.test(manifest.evidenceHash)) return false;
    const seen = new Set();
    for (const entry of manifest.entries) {
      if (typeof entry !== "object" || entry === null || typeof entry.path !== "string" || entry.path.length === 0 || seen.has(entry.path)) return false;
      const path = resolve(reviewRoot, entry.path);
      if (path !== reviewRoot && !path.startsWith(`${reviewRoot}${sep}`)) return false;
      if (!existsSync(path) || !statSync(path).isFile()) return false;
      const actual = evidenceManifestEntry(path, workspaceRoot, reviewRoot);
      if (JSON.stringify(actual) !== JSON.stringify(entry)) return false;
      seen.add(entry.path);
    }
    return sha256(JSON.stringify(manifest.entries)) === manifest.evidenceHash;
  } catch {
    return false;
  }
}

function evidenceManifestEntry(path, workspaceRoot, reviewRoot) {
  const artifactPath = relative(reviewRoot, path).split("\\").join("/");
  if (!path.endsWith(".json") && !path.endsWith(".jsonl")) {
    const bytes = readFileSync(path);
    return { path: artifactPath, kind: "binary", bytes: bytes.byteLength, hash: sha256(bytes) };
  }
  const text = readFileSync(path, "utf8");
  const value = path.endsWith(".jsonl")
    ? text.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line))
    : JSON.parse(text);
  const canonical = JSON.stringify(canonicalEvidence(value, workspaceRoot));
  return { path: artifactPath, kind: path.endsWith(".jsonl") ? "jsonl" : "json", hash: sha256(canonical) };
}

function collectEvidenceFiles(directory, paths, include) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collectEvidenceFiles(path, paths, include);
    else if (entry.isFile() && include(path)) paths.push(path);
  }
}

function canonicalEvidence(value, workspaceRoot) {
  if (Array.isArray(value)) return value.filter((entry) => entry?.provenance !== "model-derived-review").map((entry) => canonicalEvidence(entry, workspaceRoot));
  if (typeof value !== "object" || value === null) {
    return typeof value === "string" ? value.replaceAll(workspaceRoot, "<workspace>") : value;
  }
  return Object.fromEntries(Object.keys(value)
    .filter((key) => !TRANSIENT_KEYS.has(key) && key !== "modelReview")
    .sort()
    .map((key) => [key, canonicalEvidence(value[key], workspaceRoot)]));
}

function modelAssertionSummary(id, status) {
  if (status === "pass") return `${id} passed model-derived review.`;
  if (status === "needs-fix") return `${id} needs a UI fix according to model-derived review.`;
  if (status === "human-review") return `${id} requires human UI review.`;
  if (status === "blocked") return `${id} model-derived review was blocked.`;
  return `${id} model-derived review was not run.`;
}

function hasExactKeys(value, expected) {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && expected.slice().sort().every((key, index) => keys[index] === key);
}

function isSafeReviewToken(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(value);
}

function aggregateAssertionResults(assertions) {
  if (assertions.some((assertion) => assertion.result === "needs-fix")) return "needs-fix";
  if (assertions.some((assertion) => assertion.result === "human-review")) return "human-review";
  return "pass";
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
