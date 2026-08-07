#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import {
  applyModelReviewToScenarioResults,
  createEvidenceManifest,
  loadModelReview,
  rewriteModelDerivedArtifacts,
  rootAssertionResults,
  sha256
} from "./ui-model-review.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const singleScenario = process.argv.includes("--single");
const deprecatedLlmAlias = process.argv.includes("--deprecated-llm-alias");
const runId = `ui-review-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const reviewRoot = join(root, ".tmp", "ui-review-pack", runId);
const scenariosRoot = join(reviewRoot, "scenarios");
const screenshotsRoot = join(reviewRoot, "screenshots");
const scenarioAliases = new Map([
  ["smoke", "fixtures/harness/table-grid-smoke/scenario.json"],
  ["table-grid", "fixtures/harness/table-grid-smoke/scenario.json"],
  ["grid-keyboard-accessibility", "fixtures/harness/grid-keyboard-accessibility/scenario.json"],
  ...[
    "fallback", "merge-cells", "unmerge-cells", "block-cell-readonly", "diagnostics", "ja-responsive", "large-table",
    "table-spec-header-footer", "table-spec-column-cell-spec", "official-table-syntax-compat", "table-attribute-preview",
    "block-cell-boundary", "clipboard-auto-expand-paste", "clipboard-merged-cell-paste", "block-cell-paste", "duplicate-cells",
    "clipboard-rich-content-diagnostics", "unsupported-data-table", "nested-table-non-goal", "preview-comprehensive", "preview-security",
    "format-table-preview", "stale-session-conflict", "rapid-mutation-order"
  ].map((id) => [id, `fixtures/harness/${id}/scenario.json`]),
  ["large-table-scroll", "fixtures/harness/large-table/scenario.json"]
]);

const scenarioMatrix = singleScenario
  ? [{
      id: process.env.ASCIIDOC_TABLE_UI_REVIEW_ID || "single",
      scenarioInput: process.env.ASCIIDOC_TABLE_NIGHTLY_SCENARIO_PATH || "table-grid"
    }]
  : [
      { id: "table-grid", scenarioInput: "fixtures/harness/table-grid-smoke/scenario.json" },
      { id: "merge-cells", scenarioInput: "fixtures/harness/merge-cells/scenario.json" },
      { id: "unmerge-cells", scenarioInput: "fixtures/harness/unmerge-cells/scenario.json" },
      { id: "block-cell-readonly", scenarioInput: "fixtures/harness/block-cell-readonly/scenario.json" },
      { id: "diagnostics", scenarioInput: "fixtures/harness/diagnostics/scenario.json" },
      { id: "fallback", scenarioInput: "fixtures/harness/fallback/scenario.json" },
      { id: "ja-responsive", scenarioInput: "fixtures/harness/ja-responsive/scenario.json" },
      { id: "large-table", scenarioInput: "fixtures/harness/large-table/scenario.json" },
      { id: "table-spec-header-footer", scenarioInput: "fixtures/harness/table-spec-header-footer/scenario.json" },
      { id: "table-spec-column-cell-spec", scenarioInput: "fixtures/harness/table-spec-column-cell-spec/scenario.json" },
      { id: "official-table-syntax-compat", scenarioInput: "fixtures/harness/official-table-syntax-compat/scenario.json" },
      { id: "table-attribute-preview", scenarioInput: "fixtures/harness/table-attribute-preview/scenario.json" },
      { id: "block-cell-boundary", scenarioInput: "fixtures/harness/block-cell-boundary/scenario.json" },
      { id: "clipboard-auto-expand-paste", scenarioInput: "fixtures/harness/clipboard-auto-expand-paste/scenario.json" },
      { id: "clipboard-merged-cell-paste", scenarioInput: "fixtures/harness/clipboard-merged-cell-paste/scenario.json" },
      { id: "block-cell-paste", scenarioInput: "fixtures/harness/block-cell-paste/scenario.json" },
      { id: "duplicate-cells", scenarioInput: "fixtures/harness/duplicate-cells/scenario.json" },
      { id: "clipboard-rich-content-diagnostics", scenarioInput: "fixtures/harness/clipboard-rich-content-diagnostics/scenario.json" },
      { id: "unsupported-data-table", scenarioInput: "fixtures/harness/unsupported-data-table/scenario.json" },
      { id: "nested-table-non-goal", scenarioInput: "fixtures/harness/nested-table-non-goal/scenario.json" },
      { id: "preview-comprehensive", scenarioInput: "fixtures/harness/preview-comprehensive/scenario.json" },
      { id: "format-table-preview", scenarioInput: "fixtures/harness/format-table-preview/scenario.json" }
    ];

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});

async function main() {
  if (deprecatedLlmAlias) {
    console.warn("review:ui:llm is deprecated; use review:ui:deterministic.");
  }
  mkdirSync(reviewRoot, { recursive: true });
  mkdirSync(scenariosRoot, { recursive: true });
  mkdirSync(screenshotsRoot, { recursive: true });

  run("pnpm", ["run", "build:test"]);
  const uiReview = await import(pathToFileURL(join(root, "out", "src", "harness", "ui-review.js")).href);
  const core = await import(pathToFileURL(join(root, "out", "src", "core", "index.js")).href);
  const app = await import(pathToFileURL(join(root, "out", "src", "app", "index.js")).href);
  const scenarioRunner = await import(pathToFileURL(join(root, "out", "src", "harness", "scenario-runner.js")).href);
  const webviewHarness = await import(pathToFileURL(join(root, "out", "test", "integration", "webview-harness.js")).href);
  const scenarioResults = [];
  const aggregateSelfReview = {};
  const aggregateGeometry = {};
  const runtimeJsonl = [];
  const harnessJsonl = [];
  const commandTrace = [];
  const modelAssertionIds = [];

  for (const scenario of scenarioMatrix) {
    const scenarioRoot = join(scenariosRoot, scenario.id);
    mkdirSync(scenarioRoot, { recursive: true });
    const loaded = loadScenario(scenario.scenarioInput, scenarioRunner);
    if (!loaded.ok) {
      const blocked = createBlockedScenarioResult(scenario.id, scenarioRoot, loaded, runId);
      scenarioResults.push(blocked.result);
      harnessJsonl.push(JSON.stringify(blocked.event));
      runtimeJsonl.push(JSON.stringify(blocked.runtimeEvent));
      writeFileSync(join(scenarioRoot, "scenario-error.json"), JSON.stringify(loaded, null, 2), "utf8");
      writeFileSync(join(scenarioRoot, "harness.jsonl"), `${JSON.stringify(blocked.event)}\n`, "utf8");
      writeFileSync(join(scenarioRoot, "runtime.jsonl"), `${JSON.stringify(blocked.runtimeEvent)}\n`, "utf8");
      writeFileSync(join(scenarioRoot, "command-trace.json"), "[]\n", "utf8");
      writeFileSync(join(scenarioRoot, "assertion-results.json"), "[]\n", "utf8");
      continue;
    }
    const scenarioSpec = loaded.spec;
    modelAssertionIds.push(...scenarioSpec.assertions
      .filter((assertion) => assertion.type === "vlm-review")
      .map((assertion) => assertion.id));
    const state = createScenarioState(scenarioSpec, loaded.path, app);
    const execution = await scenarioRunner.runUiReviewScenario(
      scenarioSpec,
      runId,
      createScenarioAdapter(state, core, scenarioRunner, webviewHarness)
    );
    harnessJsonl.push(...execution.events.map((entry) => JSON.stringify(entry)));
    commandTrace.push(...execution.commandTrace.map((entry) => ({ scenarioId: scenario.id, ...entry })));
    const snapshot = createWebviewSnapshot(state, uiReview, core, app);
    const checks = [
      ...uiReview.evaluateUiReviewSnapshot(snapshot),
      ...evaluateScenarioContract(scenarioSpec, snapshot),
      ...evaluateScenarioAssertions(scenarioSpec, state, core)
    ];
    if (execution.outcome === "blocked") {
      checks.unshift({
        id: "scenario-execution-blocked",
        severity: "error",
        passed: false,
        summary: execution.message ?? "Scenario execution was blocked.",
        evidence: execution.failureClass
      });
    }
    const assertionBlocked = checks.some((check) => check.status === "blocked");
    const result = execution.outcome === "blocked" || assertionBlocked ? "blocked" : uiReview.resultForUiReviewChecks(checks);
    const runtimeEvent = JSON.stringify({
      ts: new Date().toISOString(),
      level: execution.outcome === "blocked" || assertionBlocked ? "error" : "info",
      event: execution.outcome === "blocked" || assertionBlocked ? "scenario.execution.failed" : "webview.render.succeeded",
      source: "webview",
      runId,
      operation: "render",
      documentId: scenarioSpec.fixture,
      mode: snapshot.selfReview.mode,
      outcome: execution.outcome === "blocked" || assertionBlocked ? "failed" : "succeeded"
    });
    const harnessEvent = JSON.stringify(scenarioRunner.createHarnessRunFinishedEvent({
      ts: new Date().toISOString(),
      runId,
      scenarioId: scenario.id,
      target: scenarioSpec.fixture,
      artifactPath: scenarioRoot,
      executionOutcome: execution.outcome,
      assertionBlocked,
      executionFailureClass: execution.failureClass
    }));
    runtimeJsonl.push(runtimeEvent);
    harnessJsonl.push(harnessEvent);
    writeFileSync(join(scenarioRoot, "scenario.json"), JSON.stringify(redactScenarioArtifact(scenarioSpec), null, 2), "utf8");
    writeFileSync(join(scenarioRoot, "ui-review-snapshot.json"), JSON.stringify(snapshot, null, 2), "utf8");
    writeFileSync(join(scenarioRoot, "ui-self-review.json"), JSON.stringify(snapshot.selfReview, null, 2), "utf8");
    writeFileSync(join(scenarioRoot, "ui-geometry.json"), JSON.stringify({ ...snapshot.geometry, checks }, null, 2), "utf8");
    writeFileSync(join(scenarioRoot, "runtime.jsonl"), `${runtimeEvent}\n`, "utf8");
    writeFileSync(join(scenarioRoot, "harness.jsonl"), `${[...execution.events.map((entry) => JSON.stringify(entry)), harnessEvent].join("\n")}\n`, "utf8");
    writeFileSync(join(scenarioRoot, "command-trace.json"), JSON.stringify(execution.commandTrace, null, 2), "utf8");
    writeFileSync(join(scenarioRoot, "assertion-results.json"), JSON.stringify(checks.filter((check) => check.assertionType), null, 2), "utf8");
    aggregateSelfReview[scenario.id] = snapshot.selfReview;
    aggregateGeometry[scenario.id] = { ...snapshot.geometry, checks };
    scenarioResults.push({
      id: scenario.id,
      result,
      checks,
      artifactPaths: {
        scenarioRoot,
        snapshot: join(scenarioRoot, "ui-review-snapshot.json")
      }
    });
  }

  writeFileSync(join(reviewRoot, "runtime.jsonl"), `${runtimeJsonl.join("\n")}\n`, "utf8");
  writeFileSync(join(reviewRoot, "harness.jsonl"), `${harnessJsonl.join("\n")}\n`, "utf8");
  writeFileSync(join(reviewRoot, "workspace-state.json"), JSON.stringify({ scaffold: true }, null, 2), "utf8");
  writeFileSync(join(reviewRoot, "command-trace.json"), JSON.stringify(commandTrace, null, 2), "utf8");
  writeFileSync(join(reviewRoot, "ui-self-review.json"), JSON.stringify(aggregateSelfReview, null, 2), "utf8");
  writeFileSync(join(reviewRoot, "ui-geometry.json"), JSON.stringify(aggregateGeometry, null, 2), "utf8");
  writeFileSync(join(reviewRoot, "assertion-results.json"), JSON.stringify(rootAssertionResults(scenarioResults), null, 2), "utf8");
  const deterministicReport = uiReview.createUiReviewReport(scenarioResults, {
    reviewRoot,
    screenshots: screenshotsRoot,
    scenarios: scenariosRoot,
    runtimeJsonl: join(reviewRoot, "runtime.jsonl"),
    harnessJsonl: join(reviewRoot, "harness.jsonl"),
    workspaceState: join(reviewRoot, "workspace-state.json"),
    commandTrace: join(reviewRoot, "command-trace.json")
  });
  const preliminaryReport = {
    ...deterministicReport,
    reviewKind: "deterministic",
    deterministicResult: deterministicReport.result
  };
  writeFileSync(join(reviewRoot, "ui-review-report.json"), JSON.stringify(preliminaryReport, null, 2), "utf8");
  const prompt = createPrompt(deterministicReport, modelAssertionIds);
  const promptHash = sha256(prompt);
  const evidenceManifest = createEvidenceManifest({ workspaceRoot: root, reviewRoot, scenariosRoot, screenshotsRoot });
  const evidenceHash = sha256(JSON.stringify(evidenceManifest.entries));
  writeFileSync(join(reviewRoot, "evidence-manifest.json"), JSON.stringify({ ...evidenceManifest, evidenceHash }, null, 2), "utf8");
  const modelReview = loadModelReview({ root, promptHash, evidenceHash, expectedAssertionIds: modelAssertionIds });
  const enrichedScenarioResults = applyModelReviewToScenarioResults(scenarioResults, modelReview.artifact);
  rewriteModelDerivedArtifacts({ scenarioResults: enrichedScenarioResults, aggregateGeometry, reviewRoot, scenariosRoot });
  const enrichedReport = uiReview.createUiReviewReport(enrichedScenarioResults, deterministicReport.artifactPaths);
  const report = {
    ...enrichedReport,
    result: deterministicReport.result,
    reviewKind: "deterministic",
    deterministicResult: deterministicReport.result,
    modelReview: {
      policy: modelReview.artifact.policy,
      status: modelReview.artifact.status,
      artifactPath: join(reviewRoot, "model-ui-review.json")
    }
  };
  writeFileSync(join(reviewRoot, "ui-review-report.json"), JSON.stringify(report, null, 2), "utf8");
  writeFileSync(join(reviewRoot, "ui-review-prompt.md"), prompt, "utf8");
  writeFileSync(join(reviewRoot, "model-ui-review.json"), JSON.stringify(modelReview.artifact, null, 2), "utf8");
  console.log(`\nui review pack: ${reviewRoot}`);
  console.log(`ui review result: ${report.result}`);
  console.log(`model UI review status: ${modelReview.artifact.status} (${modelReview.artifact.policy})`);
  if (report.result === "needs-fix" || report.result === "blocked") {
    process.exitCode = 1;
  }
  if (modelReview.fail) process.exitCode = 1;
}

function redactScenarioArtifact(scenarioSpec) {
  const contentFields = new Set(["html", "rows", "sourceLabel", "text", "value"]);
  return {
    ...scenarioSpec,
    steps: scenarioSpec.steps.map((step) => Object.fromEntries(
      Object.entries(step).map(([key, value]) => [key, contentFields.has(key) ? "[redacted]" : value])
    ))
  };
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function loadScenario(input, scenarioRunner) {
  return scenarioRunner.loadUiReviewScenarioSpec(input, root, scenarioAliases);
}

function createBlockedScenarioResult(id, scenarioRoot, loaded, currentRunId) {
  const check = {
    id: "scenario-load-blocked",
    severity: "error",
    passed: false,
    summary: loaded.message,
    evidence: loaded.failureClass
  };
  const event = {
    ts: new Date().toISOString(),
    level: "error",
    event: "harness.run.finished",
    runId: currentRunId,
    scenarioId: id,
    tool: "vscode",
    target: loaded.path ?? loaded.input,
    outcome: "failed",
    failureClass: loaded.failureClass,
    artifactPath: scenarioRoot
  };
  const runtimeEvent = {
    ts: event.ts,
    level: "error",
    event: "scenario.load.failed",
    source: "harness",
    runId: currentRunId,
    operation: "scenario-load",
    documentId: loaded.path ?? loaded.input,
    outcome: "failed",
    failureClass: loaded.failureClass
  };
  return {
    event,
    runtimeEvent,
    result: { id, result: "blocked", checks: [check], artifactPaths: { scenarioRoot } }
  };
}

function createScenarioState(scenario, scenarioPath, app) {
  const fixturePath = resolve(root, scenario.fixture);
  if (!existsSync(fixturePath)) {
    throw new Error(`Scenario fixture was not found for ${scenarioPath}: ${fixturePath}`);
  }
  const source = readFileSync(fixturePath, "utf8");
  const previewHtml = scenario.id === "preview-security" ? app.sanitizePreviewHtml(extractPreviewSecurityHtml(source)) : undefined;
  return {
    source,
    previewHtml,
    fixturePath,
    fixtureOpened: false,
    editorOpened: false,
    editorMode: "edit",
    formatResult: undefined,
    diagnostics: [],
    rapidMutation: scenario.id === "rapid-mutation-order" ? {
      requestCountAfterDoubleApply: 0,
      busyAfterDoubleApply: false,
      draftRetainedAfterStale: false,
      staleIgnored: false,
      busyAfterStale: false,
      activeApplied: false,
      tokenAdvanced: false,
      busyCleared: false
    } : undefined
  };
}

function createScenarioAdapter(state, core, scenarioRunner, webviewHarness) {
  return {
    async execute(step) {
      if (step.action === "open") {
        state.fixtureOpened = true;
        return { target: state.fixturePath, details: { byteLength: Buffer.byteLength(state.source, "utf8") } };
      }
      if (!state.fixtureOpened) {
        throw new scenarioRunner.ScenarioBlockedError(`Step ${step.id} requires the fixture to be opened first.`, "scenario-precondition-failed");
      }
      if (step.action === "command") {
        if (step.command === "asciidocTable.openEditor") {
          state.editorOpened = true;
          await refreshHarness(state, webviewHarness);
          return { target: step.command, details: { adapter: "webview-integration-harness", editorOpened: true } };
        }
        if (step.command === "asciidocTable.formatTable") {
          const harness = state.harness;
          if (harness) harness.button("format-table").click();
          const posted = harness?.lastMessage("request-format-table");
          const result = core.formatAsciiDocTable(core.parseAsciiDocTable(state.source));
          if (!result.ok) {
            throw new scenarioRunner.ScenarioBlockedError(result.diagnostics.map((diagnostic) => diagnostic.message).join("; "), "host-command-blocked");
          }
          state.formatResult = result;
          state.editorOpened = true;
          state.editorMode = "format-review";
          await refreshHarness(state, webviewHarness, posted?.selectedSourceCellId);
          return { target: step.command, details: { adapter: harness ? "webview-integration-harness" : "simulated-host", ...(posted ? { postedMessage: posted.type } : {}), changed: result.changed, mode: result.mode } };
        }
        if (step.command === "asciidocTable.test.setEditorMode") {
          state.editorMode = editorMode(step.target, scenarioRunner);
          if (state.editorMode === "format-review") {
            throw new scenarioRunner.ScenarioBlockedError("format-review requires the format command.", "invalid-command-target");
          }
          requireHarness(state, step, scenarioRunner).modeButton(state.editorMode).click();
          return { target: step.command, details: { adapter: "webview-integration-harness", domEvent: "click", editorMode: actualEditorMode(state.harness) } };
        }
        if (step.command === "asciidocTable.test.showStaleSessionConflict") {
          const diagnostic = {
            code: "writeback.table-changed",
            severity: "error",
            message: "Target AsciiDoc table block changed outside the editor"
          };
          requireHarness(state, step, scenarioRunner).dispatchExtensionMessage({
            type: "cell-content-update-result",
            result: { ok: false, diagnostics: [diagnostic] }
          });
          state.diagnostics = [diagnostic];
          return { target: step.command, details: { adapter: "simulated-host", postedMessage: "cell-content-update-result", diagnosticCode: diagnostic.code } };
        }
        if (step.command === "asciidocTable.test.injectWrongOperationSuccess") {
          const harness = requireHarness(state, step, scenarioRunner);
          const rapid = requireRapidMutationState(state, step, scenarioRunner);
          const active = rapid.activeRequest;
          if (!active) {
            throw new scenarioRunner.ScenarioBlockedError("No active mutation request was captured.", "scenario-precondition-failed");
          }
          const draftBefore = harness.textarea("contentRaw").value;
          const cellBefore = harness.cell(active.sourceCellId).dataset.content;
          harness.dispatchExtensionMessage({
            type: "cell-content-update-result",
            operationId: `${active.operationId}-stale`,
            revisionToken: "review-stale-revision",
            documentVersion: 2,
            result: { ok: true, diagnostics: [] }
          });
          const draftAfter = harness.textarea("contentRaw").value;
          const cellAfter = harness.cell(active.sourceCellId).dataset.content;
          rapid.draftRetainedAfterStale = draftAfter === draftBefore && draftAfter === state.expectedDraft;
          rapid.staleIgnored = cellAfter === cellBefore;
          rapid.busyAfterStale = mutationBusy(harness);
          return {
            target: step.command,
            details: {
              adapter: "simulated-host",
              resultKind: "stale-success",
              requestCount: rapid.requestCountAfterDoubleApply,
              busy: rapid.busyAfterStale,
              draftRetained: rapid.draftRetainedAfterStale,
              staleIgnored: rapid.staleIgnored
            }
          };
        }
        if (step.command === "asciidocTable.test.injectActiveOperationSuccess") {
          const harness = requireHarness(state, step, scenarioRunner);
          const rapid = requireRapidMutationState(state, step, scenarioRunner);
          const active = rapid.activeRequest;
          if (!active) {
            throw new scenarioRunner.ScenarioBlockedError("No active mutation request was captured.", "scenario-precondition-failed");
          }
          const advancedRevisionToken = "review-active-revision";
          const applied = webviewHarness.applyWebviewMessage(state.source, active);
          if (!applied.ok) {
            throw new scenarioRunner.ScenarioBlockedError(applied.diagnostics.map((diagnostic) => diagnostic.message).join("; "), "host-writeback-blocked");
          }
          state.source = applied.source;
          await refreshHarness(state, webviewHarness, active.sourceCellId, advancedRevisionToken);
          rapid.activeApplied = state.harness.cell(active.sourceCellId).dataset.content === active.contentRaw.trim();
          rapid.busyCleared = !mutationBusy(state.harness);

          const refreshedHarness = state.harness;
          const beforeProbeCount = refreshedHarness.messages.length;
          refreshedHarness.button("update-cell-content").click();
          const probe = refreshedHarness.messages.slice(beforeProbeCount).find((message) => message.type === "update-cell-content");
          rapid.tokenAdvanced = probe?.revisionToken === advancedRevisionToken;
          if (probe) {
            const probeApplied = webviewHarness.applyWebviewMessage(state.source, probe);
            if (!probeApplied.ok) {
              throw new scenarioRunner.ScenarioBlockedError(probeApplied.diagnostics.map((diagnostic) => diagnostic.message).join("; "), "host-writeback-blocked");
            }
            state.source = probeApplied.source;
            await refreshHarness(state, webviewHarness, probe.sourceCellId, "review-probe-revision");
          }
          rapid.busyCleared = rapid.busyCleared && !mutationBusy(state.harness);
          return {
            target: step.command,
            details: {
              adapter: "simulated-host",
              resultKind: "active-success",
              requestCount: rapid.requestCountAfterDoubleApply,
              activeApplied: rapid.activeApplied,
              tokenAdvanced: rapid.tokenAdvanced,
              busyCleared: rapid.busyCleared
            }
          };
        }
        throw new scenarioRunner.ScenarioBlockedError(`Unsupported Host command: ${step.command}`, "unsupported-host-command");
      }
      if (!state.editorOpened) {
        throw new scenarioRunner.ScenarioBlockedError(`Step ${step.id} requires the Table Editor to be opened first.`, "scenario-precondition-failed");
      }
      if (step.action === "set-editor-mode") {
        if (step.mode === "format-review") {
          throw new scenarioRunner.ScenarioBlockedError("format-review requires the format command.", "invalid-command-target");
        }
        requireHarness(state, step, scenarioRunner).modeButton(step.mode).click();
        state.editorMode = step.mode;
        return { target: step.mode, details: { domEvent: "click", editorMode: actualEditorMode(state.harness) } };
      }
      if (step.action === "paste") {
        const harness = requireHarness(state, step, scenarioRunner);
        harness.cell(step.startSourceCellId).focus();
        const beforeMessageCount = harness.messages.length;
        if (step.rows) {
          const text = step.rows.map((row) => row.join("\t")).join("\n");
          if (step.format === "html-table") {
            harness.pasteHtml(`<table>${step.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeScenarioHtml(cell)}</td>`).join("")}</tr>`).join("")}</table>`, text);
          } else {
            harness.paste(text);
          }
        } else if (step.html) {
          harness.pasteHtml(step.html, step.text ?? "");
        } else {
          harness.paste(step.text);
        }
        const mutation = await applyPostedMutation(state, beforeMessageCount, webviewHarness, scenarioRunner, step);
        return { target: step.startSourceCellId, details: { domEvent: "paste", ...mutation } };
      }
      if (step.action === "keyboard") {
        const harness = requireHarness(state, step, scenarioRunner);
        const beforeMessageCount = harness.messages.length;
        harness.keydown(step.key, modifierDetails(step));
        const mutation = await applyPostedMutationIfPresent(state, beforeMessageCount, webviewHarness, scenarioRunner, step);
        const document = state.harness.window.document;
        return {
          target: step.key,
          details: {
            domEvent: "keydown",
            modifiers: modifierDetails(step),
            activeSourceCellId: activeSourceCellId(state.harness),
            activeRole: document.activeElement?.getAttribute("role") || "",
            menuOpen: Boolean(document.querySelector("[data-context-menu='cell'].is-open")),
            rangeAnnouncement: document.querySelector("[data-grid-selection-status]")?.textContent || "",
            tabStopCount: document.querySelectorAll(".cell[data-kind='origin'][tabindex='0']").length,
            ...mutation
          }
        };
      }
      if (step.action === "select-cell") {
        requireHarness(state, step, scenarioRunner).cell(step.sourceCellId).focus();
        return { target: step.sourceCellId, details: { domEvent: "focus", activeSourceCellId: activeSourceCellId(state.harness) } };
      }
      if (step.action === "set-cell-draft") {
        const harness = requireHarness(state, step, scenarioRunner);
        harness.cell(step.sourceCellId).focus();
        const editor = harness.textarea("contentRaw");
        editor.value = step.value;
        editor.dispatchEvent(new harness.window.Event("input", { bubbles: true }));
        state.expectedDraft = step.value;
        return { target: step.sourceCellId, details: { domEvent: "focus+input", draftLength: step.value.length } };
      }
      if (step.action === "button") {
        const harness = requireHarness(state, step, scenarioRunner);
        const beforeMessageCount = harness.messages.length;
        harness.button(step.button).click();
        if (state.rapidMutation && step.button === "update-cell-content") {
          const posted = harness.messages.slice(beforeMessageCount).filter((message) => message.type !== "ui-review-snapshot");
          const sourceMessages = harness.messages.filter((message) => message.type !== "ui-review-snapshot");
          const active = [...sourceMessages].reverse().find((message) => message.type === "update-cell-content");
          if (active && !state.rapidMutation.activeRequest) {
            state.rapidMutation.activeRequest = active;
          }
          state.rapidMutation.requestCountAfterDoubleApply = sourceMessages.filter((message) => message.type === "update-cell-content").length;
          state.rapidMutation.busyAfterDoubleApply = mutationBusy(harness);
          return {
            target: step.button,
            details: {
              domEvent: "click",
              postedMessage: posted.map((message) => message.type).join(",") || undefined,
              requestCount: state.rapidMutation.requestCountAfterDoubleApply,
              busy: state.rapidMutation.busyAfterDoubleApply
            }
          };
        }
        const mutation = await applyPostedMutationIfPresent(state, beforeMessageCount, webviewHarness, scenarioRunner, step);
        return { target: step.button, details: { domEvent: "click", ...mutation } };
      }
      if (step.action === "context-menu") {
        const harness = requireHarness(state, step, scenarioRunner);
        const beforeMessageCount = harness.messages.length;
        harness.openContextMenu(step.sourceCellId);
        if (!step.item) {
          const opened = harness.contextMenu().classList.contains("is-open");
          if (!opened) {
            throw new scenarioRunner.ScenarioBlockedError(`Context menu did not open for ${step.sourceCellId}.`, "dom-action-not-executed");
          }
          return { target: step.sourceCellId, details: { domEvent: "contextmenu", opened } };
        }
        harness.menuItem(step.item).click();
        const mutation = await applyPostedMutation(state, beforeMessageCount, webviewHarness, scenarioRunner, step);
        return { target: step.item, details: { domEvent: "contextmenu+click", ...mutation } };
      }
      throw new scenarioRunner.ScenarioBlockedError(`Unsupported scenario action: ${step.action}`);
    }
  };
}

async function refreshHarness(state, webviewHarness, selectedSourceCellId, revisionToken) {
  state.harness?.window?.close();
  const formatReview = state.formatResult?.ok ? formatReviewModel(state.source, state.formatResult) : undefined;
  state.harness = await webviewHarness.createHarness(state.source, selectedSourceCellId, state.previewHtml, {
    diagnostics: state.diagnostics,
    ...(revisionToken ? { revisionToken } : {}),
    ...(formatReview ? { formatReview } : {})
  });
}

function extractPreviewSecurityHtml(source) {
  const match = source.match(/\n\+\+\+\+\r?\n([\s\S]*?)\r?\n\+\+\+\+(?:\r?\n|$)/u);
  if (!match) throw new Error("preview-security fixture must contain a passthrough block.");
  return match[1];
}

function requireHarness(state, step, scenarioRunner) {
  if (!state.harness) {
    throw new scenarioRunner.ScenarioBlockedError(`Step ${step.id} requires an active Webview harness.`, "scenario-precondition-failed");
  }
  return state.harness;
}

function requireRapidMutationState(state, step, scenarioRunner) {
  if (!state.rapidMutation) {
    throw new scenarioRunner.ScenarioBlockedError(`Step ${step.id} requires the rapid mutation scenario.`, "scenario-precondition-failed");
  }
  return state.rapidMutation;
}

function mutationBusy(harness) {
  return harness.window.document.querySelector("[data-review-target='shell']")?.getAttribute("aria-busy") === "true";
}

async function applyPostedMutation(state, beforeMessageCount, webviewHarness, scenarioRunner, step) {
  const details = await applyPostedMutationIfPresent(state, beforeMessageCount, webviewHarness, scenarioRunner, step);
  if (!details.postedMessage) {
    throw new scenarioRunner.ScenarioBlockedError(`Step ${step.id} did not post a source-changing message.`, "dom-action-not-executed");
  }
  return details;
}

async function applyPostedMutationIfPresent(state, beforeMessageCount, webviewHarness, scenarioRunner, step) {
  const posted = state.harness.messages.slice(beforeMessageCount).filter((message) => message.type !== "ui-review-snapshot");
  if (posted.length === 0) return {};
  const sourceBeforeStep = state.source;
  let selectedSourceCellId;
  for (const message of posted) {
    const result = webviewHarness.applyWebviewMessage(state.source, message);
    if (!result.ok) {
      throw new scenarioRunner.ScenarioBlockedError(result.diagnostics.map((diagnostic) => diagnostic.message).join("; "), "host-writeback-blocked");
    }
    state.source = result.source;
    state.diagnostics = message.diagnostics ?? [];
    selectedSourceCellId = message.selectedSourceCellId;
  }
  await refreshHarness(state, webviewHarness, selectedSourceCellId);
  return {
    postedMessage: posted.map((message) => message.type).join(","),
    changed: scenarioRunner.didScenarioSourceChange(sourceBeforeStep, state.source)
  };
}

function formatReviewModel(source, result) {
  return {
    before: source,
    selectedMode: result.mode,
    variants: [{
      mode: result.mode,
      label: result.mode,
      after: result.source,
      changedLineCount: result.summary.changedLineCount,
      formattedRowCount: result.summary.formattedRowCount,
      preservedRowCount: result.summary.preservedRowCount,
      diagnostics: result.diagnostics.map((diagnostic) => diagnostic.message)
    }]
  };
}

function actualEditorMode(harness) {
  if (!harness) return "edit";
  const formatReview = harness.window.document.querySelector("[data-editor-view='format-review']");
  if (formatReview && !formatReview.hasAttribute("hidden")) return "format-review";
  const preview = harness.window.document.querySelector("[data-editor-view='preview']");
  return preview && !preview.hasAttribute("hidden") ? "preview" : "edit";
}

function activeSourceCellId(harness) {
  return harness?.window.document.activeElement?.getAttribute?.("data-source-cell-id") ?? undefined;
}

function escapeScenarioHtml(value) {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
}

function editorMode(value, scenarioRunner) {
  if (value === "edit" || value === "preview" || value === "format-review") return value;
  throw new scenarioRunner.ScenarioBlockedError(`Unsupported editor mode: ${String(value)}`, "invalid-command-target");
}

function modifierDetails(step) {
  return {
    shiftKey: Boolean(step.shiftKey),
    altKey: Boolean(step.altKey),
    ctrlKey: Boolean(step.ctrlKey),
    metaKey: Boolean(step.metaKey)
  };
}

function evaluateScenarioContract(scenario, snapshot) {
  const checks = [];
  if (scenario.expectedMode === "structured" || scenario.expectedMode === "fallback") {
    const actualMode = snapshot.selfReview.mode === "fallback" ? "fallback" : "structured";
    checks.push({
      id: "scenario-expected-mode",
      severity: "error",
      passed: actualMode === scenario.expectedMode,
      summary: `Scenario expectedMode must match the rendered mode.`,
      ...(actualMode !== scenario.expectedMode ? { evidence: `expected=${scenario.expectedMode}, actual=${actualMode}` } : {})
    });
  }
  if (scenario.expectedEditorMode === "edit" || scenario.expectedEditorMode === "preview" || scenario.expectedEditorMode === "format-review") {
    const actualEditorMode = snapshot.selfReview.editorMode === "format-review" ? "format-review" : snapshot.selfReview.editorMode === "preview" ? "preview" : "edit";
    checks.push({
      id: "scenario-expected-editor-mode",
      severity: "error",
      passed: actualEditorMode === scenario.expectedEditorMode,
      summary: `Scenario expectedEditorMode must match the rendered editor mode.`,
      ...(actualEditorMode !== scenario.expectedEditorMode ? { evidence: `expected=${scenario.expectedEditorMode}, actual=${actualEditorMode}` } : {})
    });
  }
  return checks;
}

function evaluateScenarioAssertions(scenario, state, core) {
  return scenario.assertions.map((assertion) => {
    if (assertion.type === "vlm-review") {
      return {
        id: `assertion-${assertion.id}`,
        severity: "info",
        passed: false,
        status: "not-run",
        assertionType: assertion.type,
        provenance: "model-derived-review",
        summary: `${assertion.id} was not run; no model-derived review response was configured.`
      };
    }
    const evaluated = evaluateDomAssertion(assertion.id, state, core);
    if (!evaluated) {
      return {
        id: `assertion-${assertion.id}`,
        severity: "error",
        passed: false,
        status: "blocked",
        assertionType: assertion.type,
        provenance: "headless-dom",
        summary: `Unsupported ui-review assertion: ${assertion.id}`
      };
    }
    return {
      id: `assertion-${assertion.id}`,
      severity: "error",
      passed: evaluated.passed,
      status: evaluated.passed ? "passed" : "failed",
      assertionType: assertion.type,
      provenance: "headless-dom",
      summary: evaluated.summary,
      ...(evaluated.evidence ? { evidence: evaluated.evidence } : {})
    };
  });
}

function evaluateDomAssertion(id, state, core) {
  const document = state.harness?.window.document;
  if (!document) return { passed: false, summary: `${id} requires a rendered Webview DOM.` };
  const grid = document.querySelector("[data-review-target='table-grid']");
  const cells = Array.from(document.querySelectorAll(".cell[data-kind='origin']"));
  const spanned = cells.filter((cell) => cell.getAttribute("data-spanned") === "true");
  const blockCells = cells.filter((cell) => cell.getAttribute("data-block") === "true");
  const preview = document.querySelector("[data-review-target='table-preview']");
  const sourceActions = Array.from(document.querySelectorAll("[data-source-action='true']"));
  const parsedGrid = core.projectGridModel(core.parseAsciiDocTable(state.source));
  const result = (passed, summary, evidence) => ({ passed, summary, ...(evidence ? { evidence } : {}) });
  switch (id) {
    case "table-grid-visible":
      return result(Boolean(grid && !grid.hasAttribute("hidden")), "The table grid is rendered in the Webview DOM.");
    case "covered-cell-visible":
    case "rectangular-span-visible":
    case "merged-imported-cell-visible":
      return result(spanned.length > 0, "A spanned origin cell is represented in the rendered grid.", `spannedOrigins=${spanned.length}`);
    case "covered-cell-not-editable":
      return result(spanned.length > 0 && cells.length < parsedGrid.rowCount * parsedGrid.columnCount, "Covered grid slots are omitted from editable DOM cells.", `domOrigins=${cells.length}, gridSlots=${parsedGrid.rowCount * parsedGrid.columnCount}`);
    case "block-cell-readonly":
      return result(blockCells.some((cell) => cell.getAttribute("aria-readonly") === "true"), "Block cells are rendered readonly.");
    case "block-cell-raw-editor-visible":
      return result(Boolean(document.querySelector("textarea[data-inspector-control='contentRaw']")), "The block raw-source editor is present.");
    case "block-cell-preview-visible":
      return result(Boolean(document.querySelector("[data-inspector-block-preview]")), "The block-cell preview is present.");
    case "diagnostics-visible":
      return result((document.querySelector("[data-review-target='diagnostics']")?.textContent?.trim().length ?? 0) > 0, "Diagnostics are visible in the rendered DOM.");
    case "fallback-hides-structured-actions":
    case "unsupported-data-table-hides-structured-actions":
      return result(sourceActions.length === 0, "Fallback DOM contains no structured source-changing actions.", `sourceActions=${sourceActions.length}`);
    case "preview-pane-visible":
      return result(Boolean(preview && !preview.closest("[hidden]")), "Preview pane is visible after the scenario action.");
    case "preview-hides-source-actions":
      return result(sourceActions.every((element) => element.hasAttribute("hidden") || element.closest("[hidden]") !== null), "Preview mode hides every structured source-changing action.");
    case "preview-security-active-content-removed": {
      const activeContent = preview?.querySelector("script, style, form, iframe, object, embed, svg, math, base, meta, link, [src], [action], [formaction], [xlink\\:href], [onload], [onerror], [onclick]");
      const safeLink = preview?.querySelector('a[href="https://example.com/safe"]');
      return result(
        !activeContent && Boolean(safeLink),
        "Preview DOM contains the safe absolute link and no active content or active-content attributes.",
        `activeContent=${activeContent?.tagName ?? "none"}, safeLink=${Boolean(safeLink)}`
      );
    }
    case "ja-text-visible":
      return result(/[ぁ-んァ-ヶ一-龠]/u.test(document.body.textContent ?? ""), "Japanese fixture text is present in the DOM.");
    case "large-grid-visible":
      return result(Number(grid?.getAttribute("aria-rowcount") ?? 0) >= 20, "The large-table grid exposes its full row count.", `rowCount=${grid?.getAttribute("aria-rowcount")}`);
    case "grid-keyboard-accessibility": {
      const rows = Array.from(grid?.querySelectorAll(":scope > [role='row']") ?? []);
      const tabStops = cells.filter((cell) => cell.getAttribute("tabindex") === "0");
      const menu = document.querySelector("[data-context-menu='cell']");
      const menuItems = Array.from(menu?.querySelectorAll("[role='menuitem']") ?? []);
      const rangeAnnouncement = document.querySelector("[data-grid-selection-status]")?.textContent ?? "";
      const namedCells = cells.every((cell) => (cell.getAttribute("aria-label") ?? "").trim().length > 0);
      const passed = rows.length === Number(grid?.getAttribute("aria-rowcount") ?? -1) &&
        tabStops.length === 1 && namedCells &&
        menu?.getAttribute("aria-hidden") === "true" && menuItems.every((item) => item.getAttribute("tabindex") === "-1") &&
        /row 1, column 1 - row 2, column 2, 2 rows x 2 columns/u.test(rangeAnnouncement);
      return result(
        passed,
        "Grid rows, roving tabindex, keyboard menu closure, cell names, and bounded range announcement satisfy the accessibility contract.",
        `rows=${rows.length}, tabStops=${tabStops.length}, namedCells=${namedCells}, menuHidden=${menu?.getAttribute("aria-hidden")}, range=${rangeAnnouncement}`
      );
    }
    case "header-footer-roles-visible":
      return result(Boolean(document.querySelector(".cell[data-row-role='header']") && document.querySelector(".cell[data-row-role='footer']")), "Header and footer row roles are represented in DOM metadata.");
    case "column-cell-spec-metadata-visible":
      return result(cells.some((cell) => ["data-column-width", "data-column-style", "data-style", "data-horizontal-align", "data-vertical-align"].some((name) => Boolean(cell.getAttribute(name)))), "Column or cell spec metadata is represented in DOM data attributes.");
    case "column-a-block-cell-visible":
      return result(blockCells.length > 0, "Column-style block cells are represented in the grid.");
    case "duplicate-style-alignment-visible":
      return result(cells.some((cell) => Boolean(cell.getAttribute("data-style")) && Boolean(cell.getAttribute("data-horizontal-align"))), "Duplicate style/alignment metadata is represented in the grid.");
    case "block-cell-boundary-preserved":
      return result(blockCells.length > 0 && state.source.includes("| not a table cell"), "Block-cell source-like lines remain inside a readonly block cell.");
    case "auto-expand-paste-regression":
      return result(parsedGrid.rowCount >= 3 && parsedGrid.columnCount >= 4, "Paste expanded the actual table grid.", `rows=${parsedGrid.rowCount}, columns=${parsedGrid.columnCount}`);
    case "duplicate-cells-visible-as-plain-cells":
      return result(cells.length >= 2 && cells.every((cell) => cell.getAttribute("aria-readonly") === "false"), "Duplicate shorthand is projected as editable origin cells.");
    case "nested-table-raw-block-preserved":
      return result(blockCells.length > 0 && state.source.includes("!==="), "Nested table source remains in a readonly block cell.");
    case "table-attributes-rendered-preview":
      return result(Boolean(preview?.querySelector("table")), "Table preview DOM contains a rendered table.");
    case "frame-grid-stripes-raw-retained":
      return result(/(?:frame|grid|stripes)=/u.test(state.source), "Frame, grid, or stripes attributes remain in source after preview interaction.");
    case "rich-content-pastes-as-plain-text":
      return result(state.source.includes("*Rich*") && state.source.includes("_Text_"), "Rich clipboard markup was mapped through the actual paste/write-back path.");
    case "format-review-visible":
      return result(Boolean(document.querySelector("[data-review-target='format-review']:not([hidden])")), "Format review is visible after the format command.");
    case "stale-session-draft-remains-visible": {
      const diagnosticText = document.querySelector("[data-review-target='diagnostics']")?.textContent ?? "";
      const draft = document.querySelector("textarea[data-cell-editor-control='contentRaw']")?.value;
      return result(
        diagnosticText.includes("writeback.table-changed") && draft === state.expectedDraft,
        "A stale-session conflict is visible without replacing the unsent cell draft.",
        `diagnostic=${diagnosticText.includes("writeback.table-changed")}, draftRetained=${draft === state.expectedDraft}`
      );
    }
    case "rapid-mutation-order-stable": {
      const rapid = state.rapidMutation;
      const draft = document.querySelector("textarea[data-cell-editor-control='contentRaw']")?.value;
      const passed = Boolean(rapid &&
        rapid.requestCountAfterDoubleApply === 1 &&
        rapid.busyAfterDoubleApply &&
        rapid.draftRetainedAfterStale &&
        rapid.staleIgnored &&
        rapid.busyAfterStale &&
        rapid.activeApplied &&
        rapid.tokenAdvanced &&
        rapid.busyCleared &&
        draft === state.expectedDraft);
      return result(
        passed,
        "Rapid mutation ordering keeps one active request, ignores stale results, and applies only the matching result.",
        `requestCount=${rapid?.requestCountAfterDoubleApply ?? 0}, busyDuring=${Boolean(rapid?.busyAfterDoubleApply && rapid?.busyAfterStale)}, draftRetained=${Boolean(rapid?.draftRetainedAfterStale && draft === state.expectedDraft)}, staleIgnored=${Boolean(rapid?.staleIgnored)}, activeApplied=${Boolean(rapid?.activeApplied)}, tokenAdvanced=${Boolean(rapid?.tokenAdvanced)}, busyCleared=${Boolean(rapid?.busyCleared)}`
      );
    }
    default:
      return undefined;
  }
}

function createWebviewSnapshot(state, uiReview, core, app) {
  const parsed = core.parseAsciiDocTable(state.source);
  const grid = core.projectGridModel(parsed);
  const model = app.createWebviewAppModel(grid, {
    diagnostics: state.diagnostics,
    ...(state.formatResult?.ok ? {
      formatReview: {
        before: state.source,
        selectedMode: state.formatResult.mode,
        variants: [{
          mode: state.formatResult.mode,
          label: state.formatResult.mode,
          after: state.formatResult.source,
          changedLineCount: state.formatResult.summary.changedLineCount,
          formattedRowCount: state.formatResult.summary.formattedRowCount,
          preservedRowCount: state.formatResult.summary.preservedRowCount,
          diagnostics: state.formatResult.diagnostics.map((diagnostic) => diagnostic.message)
        }]
      }
    } : {})
  });
  state.editorMode = actualEditorMode(state.harness);
  return uiReview.createUiReviewSnapshotFromWebviewModel(model, "headless-webview-ui-review", { editorMode: state.editorMode });
}

function createPrompt(report, modelAssertionIds) {
  return [
    "# Model UI Review Prompt",
    "",
    "Review this AsciiDoc Table Editor UI evidence pack.",
    "",
    "## Inputs",
    "",
    "- Read `ui-review-report.json` first.",
    "- Use `ui-self-review.json` and `ui-geometry.json` for logical UI state and geometry.",
    "- Inspect screenshots under `screenshots/` when present.",
    "- Per-scenario raw artifacts are under `scenarios/<scenario-id>/`.",
    "- Verify file hashes against `evidence-manifest.json`.",
    "",
    "## Checklist",
    "",
    "- Popup / picker / menu is close to its anchor.",
    "- Text is not clipped or overlapped.",
    "- Cell inspector does not hide the whole workspace.",
    "- Fallback mode does not show structured source-changing actions.",
    "- Merged cells and covered cells remain visually distinguishable.",
    "- Block cell readonly / fallback state is clear.",
    "- Header / footer row styling remains visible and does not look like ordinary body rows.",
    "- Column and cell spec metadata such as alignment, style, and block cells is still represented in the grid / inspector evidence.",
    "- Clipboard paste auto-expand scenarios keep the grid layout stable after source-changing paste.",
    "- Imported merged-cell paste scenarios show spanned cells clearly and do not expose covered slots as editable cells.",
    "- Block cell paste scenarios keep block cells readonly in the grid and route editing through Raw / Preview inspector behavior.",
    "- Unsupported data tables and non-goal nested table structured editing do not expose unsafe source-changing actions.",
    "- Preview mode shows the full-screen rendered preview pane and hides Grid / Inspector source-changing actions.",
    "- Preview evidence includes header/footer, alignment classes, span rendering, and block/list content.",
    "",
    "## Release Self-review Addendum",
    "",
    "- Treat this as a release blocker if any scenario result is not `pass`.",
    "- Confirm every standard scenario listed in `ui-review-report.json` has a per-scenario artifact directory.",
    "- For screenshot-sensitive changes, require a matching `test:nightly:visual` debug bundle and inspect the real PNG.",
    "- Explicitly call out any missing coverage instead of accepting a green matrix as complete.",
    "",
    "## Deterministic Result",
    "",
    `- result: ${report.result}`,
    `- findings: ${report.findings.length}`,
    "",
    "## Required Structured Response",
    "",
    "Return JSON only. The response field must contain exactly this shape:",
    "",
    "```json",
    JSON.stringify({ assertions: modelAssertionIds.map((id) => ({ id, result: "pass" })) }, null, 2),
    "```",
    "",
    "Each result must be pass, needs-fix, or human-review. Include every listed assertion exactly once.",
    ""
  ].join("\n");
}
