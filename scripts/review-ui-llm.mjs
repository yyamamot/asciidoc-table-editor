#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(new URL("..", import.meta.url).pathname);
const singleScenario = process.argv.includes("--single");
const runId = `ui-review-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const reviewRoot = join(root, ".tmp", "ui-review-pack", runId);
const scenariosRoot = join(reviewRoot, "scenarios");
const screenshotsRoot = join(reviewRoot, "screenshots");

const scenarioMatrix = singleScenario
  ? [{
      id: process.env.ASCIIDOC_TABLE_UI_REVIEW_ID || "single",
      scenarioPath: process.env.ASCIIDOC_TABLE_NIGHTLY_SCENARIO_PATH || "fixtures/harness/table-grid-smoke/scenario.json"
    }]
  : [
      { id: "table-grid", scenarioPath: "fixtures/harness/table-grid-smoke/scenario.json" },
      { id: "merge-cells", scenarioPath: "fixtures/harness/merge-cells/scenario.json" },
      { id: "unmerge-cells", scenarioPath: "fixtures/harness/unmerge-cells/scenario.json" },
      { id: "block-cell-readonly", scenarioPath: "fixtures/harness/block-cell-readonly/scenario.json" },
      { id: "diagnostics", scenarioPath: "fixtures/harness/diagnostics/scenario.json" },
      { id: "fallback", scenarioPath: "fixtures/harness/fallback/scenario.json" },
      { id: "ja-responsive", scenarioPath: "fixtures/harness/ja-responsive/scenario.json" },
      { id: "large-table", scenarioPath: "fixtures/harness/large-table/scenario.json" },
      { id: "table-spec-header-footer", scenarioPath: "fixtures/harness/table-spec-header-footer/scenario.json" },
      { id: "table-spec-column-cell-spec", scenarioPath: "fixtures/harness/table-spec-column-cell-spec/scenario.json" },
      { id: "official-table-syntax-compat", scenarioPath: "fixtures/harness/official-table-syntax-compat/scenario.json" },
      { id: "table-attribute-preview", scenarioPath: "fixtures/harness/table-attribute-preview/scenario.json" },
      { id: "block-cell-boundary", scenarioPath: "fixtures/harness/block-cell-boundary/scenario.json" },
      { id: "clipboard-auto-expand-paste", scenarioPath: "fixtures/harness/clipboard-auto-expand-paste/scenario.json" },
      { id: "clipboard-merged-cell-paste", scenarioPath: "fixtures/harness/clipboard-merged-cell-paste/scenario.json" },
      { id: "block-cell-paste", scenarioPath: "fixtures/harness/block-cell-paste/scenario.json" },
      { id: "duplicate-cells", scenarioPath: "fixtures/harness/duplicate-cells/scenario.json" },
      { id: "clipboard-rich-content-diagnostics", scenarioPath: "fixtures/harness/clipboard-rich-content-diagnostics/scenario.json" },
      { id: "unsupported-data-table", scenarioPath: "fixtures/harness/unsupported-data-table/scenario.json" },
      { id: "nested-table-non-goal", scenarioPath: "fixtures/harness/nested-table-non-goal/scenario.json" },
      { id: "preview-comprehensive", scenarioPath: "fixtures/harness/preview-comprehensive/scenario.json" },
      { id: "format-table-preview", scenarioPath: "fixtures/harness/format-table-preview/scenario.json" }
    ];

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});

async function main() {
  mkdirSync(reviewRoot, { recursive: true });
  mkdirSync(scenariosRoot, { recursive: true });
  mkdirSync(screenshotsRoot, { recursive: true });

  run("pnpm", ["run", "build:test"]);
  const uiReview = await import(pathToFileURL(join(root, "out", "src", "harness", "ui-review.js")).href);
  const core = await import(pathToFileURL(join(root, "out", "src", "core", "index.js")).href);
  const app = await import(pathToFileURL(join(root, "out", "src", "app", "index.js")).href);
  const scenarioResults = [];
  const aggregateSelfReview = {};
  const aggregateGeometry = {};
  const runtimeJsonl = [];
  const harnessJsonl = [];

  for (const scenario of scenarioMatrix) {
    const scenarioSpec = readJsonIfExists(join(root, scenario.scenarioPath)) ?? { id: scenario.id, expectedMode: "structured" };
    const scenarioRoot = join(scenariosRoot, scenario.id);
    mkdirSync(scenarioRoot, { recursive: true });
    const snapshot = createWebviewSnapshot(scenarioSpec, uiReview, core, app);
    const checks = [
      ...uiReview.evaluateUiReviewSnapshot(snapshot),
      ...evaluateScenarioContract(scenarioSpec, snapshot)
    ];
    const result = uiReview.resultForUiReviewChecks(checks);
    const runtimeEvent = JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      event: "webview.render.succeeded",
      source: "webview",
      runId,
      operation: "render",
      documentId: scenarioSpec.fixture ?? "fixtures/manual/basic.adoc",
      mode: snapshot.selfReview.mode,
      outcome: "succeeded"
    });
    const harnessEvent = JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      event: "harness.run.finished",
      runId,
      scenarioId: scenario.id,
      tool: "vscode",
      target: scenarioSpec.fixture ?? "fixtures/manual/basic.adoc",
      outcome: "succeeded",
      artifactPath: scenarioRoot
    });
    runtimeJsonl.push(runtimeEvent);
    harnessJsonl.push(harnessEvent);
    writeFileSync(join(scenarioRoot, "scenario.json"), JSON.stringify(scenarioSpec, null, 2), "utf8");
    writeFileSync(join(scenarioRoot, "ui-review-snapshot.json"), JSON.stringify(snapshot, null, 2), "utf8");
    writeFileSync(join(scenarioRoot, "llm-ui-self-review.json"), JSON.stringify(snapshot.selfReview, null, 2), "utf8");
    writeFileSync(join(scenarioRoot, "ui-geometry.json"), JSON.stringify({ ...snapshot.geometry, checks }, null, 2), "utf8");
    writeFileSync(join(scenarioRoot, "runtime.jsonl"), `${runtimeEvent}\n`, "utf8");
    writeFileSync(join(scenarioRoot, "harness.jsonl"), `${harnessEvent}\n`, "utf8");
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
  writeFileSync(join(reviewRoot, "command-trace.json"), JSON.stringify({ scaffold: true }, null, 2), "utf8");
  writeFileSync(join(reviewRoot, "llm-ui-self-review.json"), JSON.stringify(aggregateSelfReview, null, 2), "utf8");
  writeFileSync(join(reviewRoot, "ui-geometry.json"), JSON.stringify(aggregateGeometry, null, 2), "utf8");
  const report = uiReview.createUiReviewReport(scenarioResults, {
    reviewRoot,
    screenshots: screenshotsRoot,
    scenarios: scenariosRoot,
    runtimeJsonl: join(reviewRoot, "runtime.jsonl"),
    harnessJsonl: join(reviewRoot, "harness.jsonl"),
    workspaceState: join(reviewRoot, "workspace-state.json"),
    commandTrace: join(reviewRoot, "command-trace.json")
  });
  writeFileSync(join(reviewRoot, "ui-review-report.json"), JSON.stringify(report, null, 2), "utf8");
  writeFileSync(join(reviewRoot, "ui-review-prompt.md"), createPrompt(report), "utf8");
  console.log(`\nui review pack: ${reviewRoot}`);
  console.log(`ui review result: ${report.result}`);
  if (report.result === "needs-fix") {
    process.exitCode = 1;
  }
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

function readJsonIfExists(path) {
  if (!existsSync(path)) {
    return undefined;
  }
  return JSON.parse(readFileSync(path, "utf8"));
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

function createWebviewSnapshot(scenario, uiReview, core, app) {
  const fixturePath = join(root, scenario.fixture ?? "fixtures/lossless/minimal-basic/source.adoc");
  let source = existsSync(fixturePath)
    ? readFileSync(fixturePath, "utf8")
    : "|===\n| A | B\n|===\n";
  source = applyScenarioSourceSteps(source, scenario, core);
  const parsed = core.parseAsciiDocTable(source);
  const grid = core.projectGridModel(parsed);
  const formatResult = scenario.formatReview ? core.formatAsciiDocTable(parsed) : undefined;
  const model = app.createWebviewAppModel(grid, {
    ...(formatResult?.ok && formatResult.changed ? {
      formatReview: {
        before: source,
        after: formatResult.source,
        changedLineCount: formatResult.summary.changedLineCount,
        formattedRowCount: formatResult.summary.formattedRowCount,
        preservedRowCount: formatResult.summary.preservedRowCount,
        diagnostics: formatResult.diagnostics.map((diagnostic) => diagnostic.message)
      }
    } : {})
  });
  const editorMode = scenario.expectedEditorMode === "format-review" ? "format-review" : scenario.expectedEditorMode === "preview" ? "preview" : "edit";
  return uiReview.createUiReviewSnapshotFromWebviewModel(model, "webview-model-ui-review", { editorMode });
}

function applyScenarioSourceSteps(source, scenario, core) {
  let current = source;
  for (const step of scenario.steps ?? []) {
    if (step.action !== "paste" || !Array.isArray(step.rows) || typeof step.startSourceCellId !== "string") {
      continue;
    }
    const table = core.parseAsciiDocTable(current);
    const result = core.pasteRectangularPlainTable(table, {
      startSourceCellId: step.startSourceCellId,
      rows: step.rows
    });
    if (result.ok) {
      current = result.source;
    }
  }
  return current;
}

function createPrompt(report) {
  return [
    "# LLM UI Review Prompt",
    "",
    "Review this AsciiDoc Table Editor UI evidence pack.",
    "",
    "## Inputs",
    "",
    "- Read `ui-review-report.json` first.",
    "- Use `llm-ui-self-review.json` and `ui-geometry.json` for logical UI state and geometry.",
    "- Inspect screenshots under `screenshots/` when present.",
    "- Per-scenario raw artifacts are under `scenarios/<scenario-id>/`.",
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
    "## Final Response Template",
    "",
    "- Result: pass / needs-fix / human-review",
    "- Evidence: screenshots and JSON files checked",
    "- Findings: severity, area, summary, suggested fix",
    "- Human review needed: only smoothness, hover timing, native popup behavior, or long-session comfort",
    ""
  ].join("\n");
}
