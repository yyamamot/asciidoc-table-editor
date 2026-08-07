import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..");

describe("UI review provenance and release policy", () => {
  it("records an optional unconfigured model review as not-run without failing deterministic review", async () => {
    const execution = await runModelAssertionReview({ ASCIIDOC_TABLE_MODEL_REVIEW_POLICY: "optional" });
    try {
      expect(execution.status).toBe(0);
      const modelReview = readJson(join(execution.reviewRoot, "model-ui-review.json"));
      const deterministic = readJson(join(execution.reviewRoot, "ui-review-report.json"));
      expect(modelReview).toMatchObject({ reviewerKind: "model", policy: "optional", status: "not-run" });
      expect(modelReview).toHaveProperty("provider");
      expect(modelReview).toHaveProperty("model");
      expect(modelReview).toHaveProperty("response");
      expect(modelReview.promptHash).toMatch(/^[a-f0-9]{64}$/u);
      expect(modelReview.evidenceHash).toMatch(/^[a-f0-9]{64}$/u);
      expect(deterministic.result).toBe("pass");
      expect(readJson(join(execution.reviewRoot, "scenarios", "unit-provenance", "ui-review-snapshot.json")).reason).toBe("headless-webview-ui-review");
      expect(
        deterministic.findings
          .filter((finding: { provenance?: string }) => finding.provenance === "model-derived-review")
          .every((finding: { status?: string }) => finding.status === "not-run")
      ).toBe(true);
      expectModelAssertionArtifacts(execution.reviewRoot, "not-run");
    } finally {
      rmSync(execution.reviewRoot, { recursive: true, force: true });
    }
  }, 20_000);

  it("blocks and exits nonzero when model review is explicitly required but unconfigured", async () => {
    const execution = await runModelAssertionReview({ ASCIIDOC_TABLE_MODEL_REVIEW_POLICY: "required" });
    try {
      expect(execution.status).not.toBe(0);
      const modelReview = readJson(join(execution.reviewRoot, "model-ui-review.json"));
      expect(modelReview).toMatchObject({ reviewerKind: "model", policy: "required", status: "blocked" });
      expect(modelReview.status).not.toBe("pass");
      expectModelAssertionArtifacts(execution.reviewRoot, "blocked");
    } finally {
      rmSync(execution.reviewRoot, { recursive: true, force: true });
    }
  }, 20_000);

  it("accepts only a provenance-complete model response matching prompt and evidence hashes", async () => {
    const baseline = await runModelAssertionReview({ ASCIIDOC_TABLE_MODEL_REVIEW_POLICY: "optional" });
    const responseRoot = mkdtempSync(join(tmpdir(), "ui-model-response-"));
    try {
      expect(baseline.status).toBe(0);
      const expected = readJson(join(baseline.reviewRoot, "model-ui-review.json"));
      const responsePath = join(responseRoot, "response.json");
      writeFileSync(
        responsePath,
        JSON.stringify({
          reviewerKind: "model",
          provider: "unit-provider",
          model: "unit-model",
          promptHash: expected.promptHash,
          evidenceHash: expected.evidenceHash,
          result: "pass",
          response: { assertions: [{ id: "duplicate-cells-edit-expands-shorthand", result: "pass" }] }
        }),
        "utf8"
      );
      const reviewed = await runModelAssertionReview({
        ASCIIDOC_TABLE_MODEL_REVIEW_POLICY: "optional",
        ASCIIDOC_TABLE_MODEL_REVIEW_RESPONSE_PATH: responsePath
      });
      try {
        expect(reviewed.status).toBe(0);
        const artifact = readJson(join(reviewed.reviewRoot, "model-ui-review.json"));
        expect(artifact).toMatchObject({
          reviewerKind: "model",
          provider: "unit-provider",
          model: "unit-model",
          promptHash: expected.promptHash,
          evidenceHash: expected.evidenceHash,
          status: "pass",
          result: "pass",
          response: { assertions: [{ id: "duplicate-cells-edit-expands-shorthand", result: "pass" }] }
        });
        expectModelAssertionArtifacts(reviewed.reviewRoot, "pass");
      } finally {
        rmSync(reviewed.reviewRoot, { recursive: true, force: true });
      }

      writeFileSync(
        responsePath,
        JSON.stringify({
          reviewerKind: "model",
          provider: "unit-provider",
          model: "unit-model",
          promptHash: expected.promptHash,
          evidenceHash: "0".repeat(64),
          result: "pass",
          response: { assertions: [{ id: "duplicate-cells-edit-expands-shorthand", result: "pass" }] }
        }),
        "utf8"
      );
      const mismatched = await runModelAssertionReview({
        ASCIIDOC_TABLE_MODEL_REVIEW_POLICY: "optional",
        ASCIIDOC_TABLE_MODEL_REVIEW_RESPONSE_PATH: responsePath
      });
      try {
        expect(mismatched.status).toBe(0);
        expect(readJson(join(mismatched.reviewRoot, "model-ui-review.json"))).toMatchObject({
          policy: "optional",
          status: "blocked"
        });
        expectModelAssertionArtifacts(mismatched.reviewRoot, "blocked");
      } finally {
        rmSync(mismatched.reviewRoot, { recursive: true, force: true });
      }
    } finally {
      rmSync(baseline.reviewRoot, { recursive: true, force: true });
      rmSync(responseRoot, { recursive: true, force: true });
    }
  }, 30_000);

  it("projects needs-fix model assertions consistently into every review artifact", async () => {
    const baseline = await runModelAssertionReview({ ASCIIDOC_TABLE_MODEL_REVIEW_POLICY: "optional" });
    const responseRoot = mkdtempSync(join(tmpdir(), "ui-model-needs-fix-"));
    try {
      const expected = readJson(join(baseline.reviewRoot, "model-ui-review.json"));
      const responsePath = join(responseRoot, "response.json");
      writeFileSync(
        responsePath,
        JSON.stringify(
          modelResponse(expected, "needs-fix", {
            assertions: [{ id: "duplicate-cells-edit-expands-shorthand", result: "needs-fix" }]
          })
        ),
        "utf8"
      );
      const execution = await runModelAssertionReview({
        ASCIIDOC_TABLE_MODEL_REVIEW_POLICY: "optional",
        ASCIIDOC_TABLE_MODEL_REVIEW_RESPONSE_PATH: responsePath
      });
      try {
        expect(execution.status).toBe(0);
        expect(readJson(join(execution.reviewRoot, "model-ui-review.json"))).toMatchObject({ status: "needs-fix", result: "needs-fix" });
        expectModelAssertionArtifacts(execution.reviewRoot, "needs-fix");
      } finally {
        rmSync(execution.reviewRoot, { recursive: true, force: true });
      }
    } finally {
      rmSync(baseline.reviewRoot, { recursive: true, force: true });
      rmSync(responseRoot, { recursive: true, force: true });
    }
  }, 30_000);

  it("rejects non-exact, incomplete, duplicate, oversized, and aggregate-mismatched model responses", async () => {
    const baseline = await runModelAssertionReview({ ASCIIDOC_TABLE_MODEL_REVIEW_POLICY: "optional" });
    const responseRoot = mkdtempSync(join(tmpdir(), "ui-model-invalid-contract-"));
    try {
      const expected = readJson(join(baseline.reviewRoot, "model-ui-review.json"));
      const assertion = { id: "duplicate-cells-edit-expands-shorthand", result: "pass" };
      const invalidResponses = [
        modelResponse(expected, "pass", "free-form response"),
        modelResponse(expected, "pass", null),
        modelResponse(expected, "pass", { assertions: [assertion], unknown: true }),
        { ...modelResponse(expected, "pass", { assertions: [assertion] }), unknown: true },
        modelResponse(expected, "pass", { assertions: [{ ...assertion, unknown: true }] }),
        modelResponse(expected, "pass", { assertions: [] }),
        modelResponse(expected, "pass", { assertions: [{ id: "unknown-assertion", result: "pass" }] }),
        modelResponse(expected, "pass", { assertions: [assertion, assertion] }),
        modelResponse(expected, "needs-fix", { assertions: [assertion] }),
        modelResponse(expected, "pass", {
          assertions: Array.from({ length: 8192 }, (_, index) => ({ id: `oversized-${index}-${"x".repeat(128)}`, result: "pass" }))
        })
      ];
      for (const [index, response] of invalidResponses.entries()) {
        const responsePath = join(responseRoot, `response-${index}.json`);
        writeFileSync(responsePath, JSON.stringify(response), "utf8");
        const execution = await runModelAssertionReview({
          ASCIIDOC_TABLE_MODEL_REVIEW_POLICY: "optional",
          ASCIIDOC_TABLE_MODEL_REVIEW_RESPONSE_PATH: responsePath
        });
        try {
          expect(execution.status, `invalid response ${index}`).toBe(0);
          expect(readJson(join(execution.reviewRoot, "model-ui-review.json")), `invalid response ${index}`).toMatchObject({
            policy: "optional",
            status: "blocked"
          });
          expectModelAssertionArtifacts(execution.reviewRoot, "blocked");
        } finally {
          rmSync(execution.reviewRoot, { recursive: true, force: true });
        }
      }
    } finally {
      rmSync(baseline.reviewRoot, { recursive: true, force: true });
      rmSync(responseRoot, { recursive: true, force: true });
    }
  }, 90_000);

  it("redacts malformed model response content and paths behind a fixed safe reason", async () => {
    const responseRoot = mkdtempSync(join(tmpdir(), "PRIVATE_SECRET_PATH-"));
    try {
      const responsePath = join(responseRoot, "PRIVATE_SECRET_RESPONSE.json");
      writeFileSync(responsePath, '{"PRIVATE_SECRET_MARKER":', "utf8");
      const execution = await runModelAssertionReview({
        ASCIIDOC_TABLE_MODEL_REVIEW_POLICY: "optional",
        ASCIIDOC_TABLE_MODEL_REVIEW_RESPONSE_PATH: responsePath
      });
      try {
        expect(execution.status).toBe(0);
        const artifactText = readFileSync(join(execution.reviewRoot, "model-ui-review.json"), "utf8");
        const artifact = JSON.parse(artifactText);
        expect(artifact).toMatchObject({ status: "blocked", reason: "Model review response is invalid." });
        for (const output of [artifactText, artifact.reason, execution.stdout, execution.stderr]) {
          expect(output).not.toContain("PRIVATE_SECRET");
          expect(output).not.toContain(responsePath);
        }
      } finally {
        rmSync(execution.reviewRoot, { recursive: true, force: true });
      }
    } finally {
      rmSync(responseRoot, { recursive: true, force: true });
    }
  }, 30_000);

  it("changes evidenceHash when substantive scenario snapshot evidence changes", async () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "ui-review-evidence-change-"));
    const fixturePath = join(fixtureRoot, "source.adoc");
    const scenarioPath = join(fixtureRoot, "scenario.json");
    writeFileSync(
      scenarioPath,
      JSON.stringify({
        id: "evidence-change",
        fixture: fixturePath,
        expectedMode: "structured",
        steps: [
          { id: "open-fixture", action: "open" },
          { id: "open-editor", action: "command", command: "asciidocTable.openEditor" }
        ],
        assertions: [{ id: "table-grid-visible", type: "ui-review" }]
      }),
      "utf8"
    );
    try {
      writeFileSync(fixturePath, "|===\n| A\n|===\n", "utf8");
      const before = await runSingleReview({ ASCIIDOC_TABLE_NIGHTLY_SCENARIO_PATH: scenarioPath });
      writeFileSync(fixturePath, "|===\n| A | B\n| C | D\n|===\n", "utf8");
      const after = await runSingleReview({ ASCIIDOC_TABLE_NIGHTLY_SCENARIO_PATH: scenarioPath });
      try {
        const beforeArtifact = readJson(join(before.reviewRoot, "model-ui-review.json"));
        const afterArtifact = readJson(join(after.reviewRoot, "model-ui-review.json"));
        expect(beforeArtifact.promptHash).toBe(afterArtifact.promptHash);
        expect(beforeArtifact.evidenceHash).not.toBe(afterArtifact.evidenceHash);
      } finally {
        rmSync(before.reviewRoot, { recursive: true, force: true });
        rmSync(after.reviewRoot, { recursive: true, force: true });
      }
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }, 30_000);

  it("keeps deterministic review required while model review is optional unless release explicitly requires it", async () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "release-review-policy-"));
    try {
      const scriptPath = join(fixtureRoot, "scripts", "release-regression.mjs");
      mkdirSync(dirname(scriptPath), { recursive: true });
      copyFileSync(join(root, "scripts", "release-regression.mjs"), scriptPath);
      copyFileSync(join(root, "scripts", "ui-model-review.mjs"), join(fixtureRoot, "scripts", "ui-model-review.mjs"));
      const fakeBin = join(fixtureRoot, "bin");
      mkdirSync(fakeBin);
      const fakePnpm = join(fakeBin, "pnpm");
      writeFileSync(fakePnpm, "#!/bin/sh\nexit 0\n", "utf8");
      chmodSync(fakePnpm, 0o755);
      const reviewRoot = join(fixtureRoot, ".tmp", "ui-review-pack", "run-1");
      mkdirSync(reviewRoot, { recursive: true });
      const prompt = "# Trusted model review prompt\n";
      const evidenceValue = { value: "trusted evidence" };
      const evidenceText = JSON.stringify(evidenceValue);
      const evidencePath = join(reviewRoot, "evidence.json");
      const promptPath = join(reviewRoot, "ui-review-prompt.md");
      const entry = { path: "evidence.json", kind: "json", hash: sha256(evidenceText) };
      const entries = [entry];
      const promptHash = sha256(prompt);
      const evidenceHash = sha256(JSON.stringify(entries));
      writeFileSync(promptPath, prompt, "utf8");
      writeFileSync(evidencePath, evidenceText, "utf8");
      writeFileSync(join(reviewRoot, "evidence-manifest.json"), JSON.stringify({ version: 1, entries, evidenceHash }), "utf8");
      writeFileSync(
        join(reviewRoot, "ui-review-report.json"),
        JSON.stringify({
          result: "pass",
          scenarioResults: [
            {
              id: "release-scenario",
              checks: [{ id: "assertion-release-model-check", provenance: "model-derived-review", status: "blocked" }]
            }
          ]
        }),
        "utf8"
      );
      writeFileSync(join(reviewRoot, "model-ui-review.json"), JSON.stringify({ reviewerKind: "model", policy: "optional", status: "blocked" }), "utf8");
      const env = { ...process.env, PATH: `${fakeBin}:${process.env.PATH ?? ""}` };

      const optional = await runNodeProcess([scriptPath], { env });
      expect(optional.status).toBe(0);
      expect(optional.stdout).toContain("release regression result: pass");
      expect(optional.stdout).toMatch(/model.*blocked/iu);

      const required = await runNodeProcess([scriptPath, "--require-model-review"], { env });
      expect(required.status).not.toBe(0);
      expect(`${required.stdout}\n${required.stderr}`).toMatch(/model.*blocked/iu);
      expect(`${required.stdout}\n${required.stderr}`).not.toContain("Unknown argument");

      writeFileSync(
        join(reviewRoot, "model-ui-review.json"),
        JSON.stringify({
          reviewerKind: "model",
          policy: "required",
          status: "pass",
          result: "pass",
          provider: "unit-provider",
          model: "unit-model",
          promptHash,
          evidenceHash,
          response: { assertions: [{ id: "release-model-check", result: "pass" }] }
        }),
        "utf8"
      );
      const requiredPass = await runNodeProcess([scriptPath, "--require-model-review"], { env });
      expect(requiredPass.status, `${requiredPass.stdout}\n${requiredPass.stderr}`).toBe(0);

      const modelArtifactPath = join(reviewRoot, "model-ui-review.json");
      const validModelArtifact = readJson(modelArtifactPath);
      writeFileSync(modelArtifactPath, JSON.stringify({ ...validModelArtifact, promptHash: "a".repeat(64), evidenceHash: "b".repeat(64) }), "utf8");
      expect((await runNodeProcess([scriptPath, "--require-model-review"], { env })).status).not.toBe(0);

      writeFileSync(modelArtifactPath, JSON.stringify(validModelArtifact), "utf8");
      writeFileSync(promptPath, `${prompt}tampered\n`, "utf8");
      expect((await runNodeProcess([scriptPath, "--require-model-review"], { env })).status).not.toBe(0);
      writeFileSync(promptPath, prompt, "utf8");

      const tamperedEntries = [{ ...entry, hash: "c".repeat(64) }];
      const tamperedEvidenceHash = sha256(JSON.stringify(tamperedEntries));
      writeFileSync(
        join(reviewRoot, "evidence-manifest.json"),
        JSON.stringify({ version: 1, entries: tamperedEntries, evidenceHash: tamperedEvidenceHash }),
        "utf8"
      );
      writeFileSync(modelArtifactPath, JSON.stringify({ ...validModelArtifact, evidenceHash: tamperedEvidenceHash }), "utf8");
      expect((await runNodeProcess([scriptPath, "--require-model-review"], { env })).status).not.toBe(0);

      writeFileSync(join(reviewRoot, "evidence-manifest.json"), JSON.stringify({ version: 1, entries, evidenceHash }), "utf8");
      writeFileSync(modelArtifactPath, JSON.stringify(validModelArtifact), "utf8");

      writeFileSync(join(reviewRoot, "ui-review-report.json"), JSON.stringify({ result: "needs-fix", scenarioResults: [] }), "utf8");
      const deterministicFailure = await runNodeProcess([scriptPath], { env });
      expect(deterministicFailure.status).not.toBe(0);
      expect(`${deterministicFailure.stdout}\n${deterministicFailure.stderr}`).toMatch(/deterministic|UI review did not pass/iu);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }, 15_000);
});

type ChildExecution = { status: number | null; stdout: string; stderr: string };
type ReviewExecution = ChildExecution & { reviewRoot: string };

async function runSingleReview(extraEnv: Record<string, string>): Promise<ReviewExecution> {
  const execution = await runNodeProcess(["scripts/review-ui-llm.mjs", "--single"], {
    cwd: root,
    env: {
      ...process.env,
      ASCIIDOC_TABLE_UI_REVIEW_ID: "unit-provenance",
      ASCIIDOC_TABLE_NIGHTLY_SCENARIO_PATH: "fixtures/harness/table-grid-smoke/scenario.json",
      ...extraEnv
    }
  });
  const reviewRoot = [...execution.stdout.matchAll(/^ui review pack:\s*(.+)$/gmu)].at(-1)?.[1]?.trim();
  expect(reviewRoot, `${execution.stdout}\n${execution.stderr}`).toBeTruthy();
  return { status: execution.status, stdout: execution.stdout, stderr: execution.stderr, reviewRoot: reviewRoot! };
}

function runModelAssertionReview(extraEnv: Record<string, string>): Promise<ReviewExecution> {
  return runSingleReview({
    ASCIIDOC_TABLE_NIGHTLY_SCENARIO_PATH: "fixtures/harness/duplicate-cells/scenario.json",
    ...extraEnv
  });
}

function runNodeProcess(args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Promise<ChildExecution> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

function modelResponse(expected: Record<string, any>, result: string, response: unknown): Record<string, unknown> {
  return {
    reviewerKind: "model",
    provider: "unit-provider",
    model: "unit-model",
    promptHash: expected.promptHash,
    evidenceHash: expected.evidenceHash,
    result,
    response
  };
}

function expectModelAssertionArtifacts(reviewRoot: string, status: string): void {
  const report = readJson(join(reviewRoot, "ui-review-report.json"));
  const modelArtifact = readJson(join(reviewRoot, "model-ui-review.json"));
  const scenario = report.scenarioResults.find((candidate: { id?: string }) => candidate.id === "unit-provenance");
  const scenarioRoot = join(reviewRoot, "scenarios", "unit-provenance");
  const assertionResults = readJsonArray(join(scenarioRoot, "assertion-results.json"));
  const geometry = readJson(join(scenarioRoot, "ui-geometry.json"));
  const isModelAssertion = (candidate: { id?: string; provenance?: string }): boolean =>
    candidate.provenance === "model-derived-review" && candidate.id?.includes("duplicate-cells-edit-expands-shorthand") === true;
  const scenarioAssertion = scenario?.checks?.find(isModelAssertion);
  const assertionArtifact = assertionResults.find(isModelAssertion);
  const geometryAssertion = geometry.checks?.find(isModelAssertion);
  const rootFinding = report.findings?.find(isModelAssertion);

  expect(modelArtifact.status).toBe(status);
  expect(report.modelReview?.status).toBe(status);
  expect(scenarioAssertion?.status).toBe(status);
  expect(assertionArtifact?.status).toBe(status);
  expect(geometryAssertion?.status).toBe(status);
  if (status === "pass") {
    expect(rootFinding).toBeUndefined();
  } else {
    expect(rootFinding?.status).toBe(status);
  }
  expect(scenarioAssertion?.provenance).toBe("model-derived-review");
  expect(assertionArtifact).toEqual(scenarioAssertion);
  expect(geometryAssertion).toEqual(scenarioAssertion);
}

function readJson(path: string): Record<string, any> {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readJsonArray(path: string): Array<Record<string, any>> {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
