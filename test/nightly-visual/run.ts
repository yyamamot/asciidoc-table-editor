import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { runTests } from "@vscode/test-electron";
import { buildDebugBundle, createHarnessEvent, type HarnessEvent, type HarnessScenarioSpec } from "../../src/harness";
import { createRuntimeEvent, parseRuntimeJsonl, type RuntimeEvent } from "../../src/logging";

async function main(): Promise<void> {
  const runId = `nightly-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`;
  const workspacePath = process.cwd();
  const artifactRoot = join(workspacePath, ".tmp", "harness");
  const visualRoot = join(workspacePath, ".tmp", "nightly-visual", runId);
  const userDataDir = join(visualRoot, "user-data");
  const extensionsDir = join(visualRoot, "extensions");
  const hostArtifactRoot = join(visualRoot, "host-artifacts");
  mkdirSync(userDataDir, { recursive: true });
  mkdirSync(extensionsDir, { recursive: true });
  mkdirSync(hostArtifactRoot, { recursive: true });

  const scenario = loadScenario(workspacePath) ?? {
    id: "table-grid-smoke",
    fixture: "fixtures/lossless/comprehensive-psv/source.adoc",
    expectedMode: "structured",
    steps: [
      { id: "launch-vscode", action: "launch" },
      { id: "open-fixture", action: "open" },
      { id: "open-editor", action: "command" }
    ],
    assertions: [
      { id: "vscode-ready", target: "vscode.launch.ready" },
      { id: "webview-html", target: "webview.html" },
      { id: "screenshot", target: "screenshots/table-editor.png" },
      { id: "debug-bundle", target: "artifact.debug-bundle.created" }
    ]
  };

  const harnessEvents: HarnessEvent[] = [
    createHarnessEvent({
      event: "vscode.launch.started",
      runId,
      scenarioId: scenario.id,
      stepId: "launch-vscode",
      tool: "vscode",
      outcome: "started"
    }),
    createHarnessEvent({
      event: "command.exec.started",
      runId,
      scenarioId: scenario.id,
      stepId: "open-editor",
      tool: "vscode",
      target: "asciidocTable.openEditor",
      outcome: "started"
    })
  ];
  let runtimeEvents: RuntimeEvent[] = [];

  try {
    await runTests({
      extensionDevelopmentPath: workspacePath,
      extensionTestsPath: join(workspacePath, "out", "test", "nightly-visual", "host.js"),
      launchArgs: [
        join(workspacePath, "fixtures", "lossless"),
        "--user-data-dir",
        userDataDir,
        "--extensions-dir",
        extensionsDir
      ],
      extensionTestsEnv: {
        ASCIIDOC_TABLE_NIGHTLY_RUN_ID: runId,
        ASCIIDOC_TABLE_NIGHTLY_SCENARIO_ID: scenario.id,
        ASCIIDOC_TABLE_NIGHTLY_FIXTURE: scenario.fixture ? resolveWorkspacePath(workspacePath, scenario.fixture) : join(workspacePath, "fixtures/lossless/comprehensive-psv/source.adoc"),
        ASCIIDOC_TABLE_NIGHTLY_ARTIFACT_ROOT: hostArtifactRoot,
        ASCIIDOC_TABLE_NIGHTLY_COLOR_THEME: process.env.ASCIIDOC_TABLE_NIGHTLY_COLOR_THEME ?? "",
        ASCIIDOC_TABLE_WEBVIEW_SNAPSHOT_PATH: join(hostArtifactRoot, "ui-review-snapshot.json"),
        ASCIIDOC_TABLE_ENABLE_TEST_COMMANDS: "1"
      }
    });
    harnessEvents.push(
      createHarnessEvent({
        event: "vscode.launch.ready",
        runId,
        scenarioId: scenario.id,
        stepId: "launch-vscode",
        tool: "vscode",
        outcome: "succeeded"
      }),
      createHarnessEvent({
        event: "command.exec.finished",
        runId,
        scenarioId: scenario.id,
        stepId: "open-editor",
        tool: "vscode",
        target: "asciidocTable.openEditor",
        outcome: "succeeded"
      })
    );
  } catch (error) {
    harnessEvents.push(
      createHarnessEvent({
        event: "vscode.launch.failed",
        runId,
        scenarioId: scenario.id,
        stepId: "launch-vscode",
        tool: "vscode",
        outcome: "failed",
        target: error instanceof Error ? error.message : String(error)
      })
    );
  }

  try {
    runtimeEvents = parseRuntimeJsonl(readText(join(hostArtifactRoot, "runtime.jsonl")));
  } catch {
    runtimeEvents = [
      createRuntimeEvent({
        event: "webview.render.failed",
        source: "webview",
        runId,
        operation: "render",
        documentId: scenario.fixture,
        mode: "fallback",
        outcome: "failed",
        message: "Host runtime.jsonl was not created"
      })
    ];
  }

  const screenshotCandidates = [
    { sourcePath: join(hostArtifactRoot, "screenshots", "table-editor.png"), fileName: "table-editor.png" },
    { sourcePath: join(hostArtifactRoot, "screenshots", "table-editor-preview.png"), fileName: "table-editor-preview.png" }
  ];
  const screenshots = screenshotCandidates.filter((screenshot) => fileLooksNonEmptyPng(screenshot.sourcePath));
  if (screenshots.length > 0) {
    harnessEvents.push(...screenshots.map((screenshot) =>
      createHarnessEvent({
        event: "artifact.screenshot.captured",
        runId,
        scenarioId: scenario.id,
        tool: "vscode",
        target: screenshot.sourcePath,
        outcome: "succeeded",
        artifactPath: screenshot.sourcePath
      })
    ));
  } else {
    createComputerUseHandoff(workspacePath, runId, scenario.id, hostArtifactRoot);
    harnessEvents.push(
      createHarnessEvent({
        event: "artifact.screenshot.failed",
        runId,
        scenarioId: scenario.id,
        tool: "vscode",
        target: screenshotCandidates[0].sourcePath,
        outcome: "failed"
      }),
      createHarnessEvent({
        event: "computer-use.handoff.created",
        runId,
        scenarioId: scenario.id,
        tool: "harness",
        target: join(workspacePath, ".tmp", "computer-use-f5", runId),
        outcome: "succeeded"
      })
    );
  }

  const result = buildDebugBundle({
    artifactRoot,
    runId,
    scenario,
    runtimeEvents,
    harnessEvents,
    screenshots,
    workspaceState: {
      cwd: workspacePath,
      visualRoot,
      userDataDir,
      extensionsDir,
      hostArtifactRoot
    },
    commandTrace: readJsonIfExists(join(hostArtifactRoot, "command-trace.json")) ?? [
      {
        command: "asciidocTable.openEditor",
        keybinding: "cmd+alt+t cmd+alt+e",
        outcome: harnessEvents.some((event) => event.event === "command.exec.finished") ? "succeeded" : "failed"
      }
    ]
  });
  for (const fileName of [
    "webview.html",
    "ui-review-snapshot.json",
    "ui-review-snapshot.preview.json",
    "llm-ui-self-review.json",
    "llm-ui-self-review.preview.json",
    "ui-geometry.json",
    "ui-geometry.preview.json",
    "ui-review-report.json"
  ]) {
    copyIfExists(join(hostArtifactRoot, fileName), join(result.artifactRoot, fileName));
  }
  copyIfExists(
    join(hostArtifactRoot, "screenshots", "table-editor.capture.json"),
    join(result.artifactRoot, "screenshots", "table-editor.capture.json")
  );
  copyIfExists(
    join(hostArtifactRoot, "screenshots", "table-editor-preview.capture.json"),
    join(result.artifactRoot, "screenshots", "table-editor-preview.capture.json")
  );

  console.log(`nightly visual harness result: ${result.outcome}`);
  console.log(`debug bundle: ${result.artifactRoot}`);
  if (result.outcome !== "passed" || screenshots.length === 0) {
    process.exitCode = 1;
  }
}

function loadScenario(workspacePath: string): HarnessScenarioSpec | undefined {
  const scenarioPath = process.env.ASCIIDOC_TABLE_NIGHTLY_SCENARIO_PATH;
  if (!scenarioPath) {
    return undefined;
  }
  const resolvedPath = resolveWorkspacePath(workspacePath, scenarioPath);
  return JSON.parse(readFileSync(resolvedPath, "utf8")) as HarnessScenarioSpec;
}

function resolveWorkspacePath(workspacePath: string, path: string): string {
  return isAbsolute(path) ? path : join(workspacePath, path);
}

function copyIfExists(source: string, destination: string): void {
  if (existsSync(source)) {
    copyFileSync(source, destination);
  }
}

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function fileLooksNonEmptyPng(path: string): boolean {
  if (!existsSync(path) || statSync(path).size < 24) {
    return false;
  }
  const bytes = readFileSync(path);
  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

function readJsonIfExists(path: string): Array<Record<string, unknown>> | undefined {
  if (!existsSync(path)) {
    return undefined;
  }
  return JSON.parse(readFileSync(path, "utf8")) as Array<Record<string, unknown>>;
}

function createComputerUseHandoff(workspacePath: string, runId: string, scenarioId: string, hostArtifactRoot: string): void {
  const root = join(workspacePath, ".tmp", "computer-use-f5", runId);
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, "handoff.md"),
    [
      "# Computer Use Handoff",
      "",
      `- runId: ${runId}`,
      `- scenarioId: ${scenarioId}`,
      "- target: VS Code Extension Development Host",
      "- expected keybinding: `cmd+alt+t cmd+alt+e`",
      `- hostArtifactRoot: ${hostArtifactRoot}`,
      "",
      "## Steps",
      "",
      "1. Focus the Extension Development Host window.",
      "2. Open the fixture shown in `hostArtifactRoot/scenario.json` or use the currently opened fixture.",
      "3. Place the cursor inside the AsciiDoc table.",
      "4. Press `cmd+alt+t`, then `cmd+alt+e`.",
      "5. Confirm the AsciiDoc Table Editor Webview opens beside the editor.",
      "6. Capture a screenshot into `hostArtifactRoot/screenshots/table-editor.png`.",
      ""
    ].join("\n"),
    "utf8"
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
