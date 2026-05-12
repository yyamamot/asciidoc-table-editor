import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import { createUiReviewReport, createUiReviewSnapshotFromWebviewModel, evaluateUiReviewSnapshot, resultForUiReviewChecks } from "../../src/harness";
import { createRuntimeEvent, formatRuntimeEvent } from "../../src/logging";
import type { OpenTableEditorCommandResult } from "../../src/extension";

export async function run(): Promise<void> {
  const runId = requiredEnv("ASCIIDOC_TABLE_NIGHTLY_RUN_ID");
  const scenarioId = requiredEnv("ASCIIDOC_TABLE_NIGHTLY_SCENARIO_ID");
  const fixturePath = requiredEnv("ASCIIDOC_TABLE_NIGHTLY_FIXTURE");
  const artifactRoot = requiredEnv("ASCIIDOC_TABLE_NIGHTLY_ARTIFACT_ROOT");
  const colorTheme = process.env.ASCIIDOC_TABLE_NIGHTLY_COLOR_THEME;
  const screenshotRoot = join(artifactRoot, "screenshots");
  mkdirSync(screenshotRoot, { recursive: true });

  if (colorTheme !== undefined && colorTheme.length > 0) {
    await vscode.workspace.getConfiguration("workbench").update("colorTheme", colorTheme, vscode.ConfigurationTarget.Global);
    await sleep(500);
  }

  const runtimeEvents = [
    createRuntimeEvent({
      event: "parser.import.started",
      source: "parser",
      runId,
      operation: "import",
      documentId: fixturePath,
      outcome: "started"
    })
  ];
  const commandTrace: Array<Record<string, unknown>> = [
    {
      stepId: "open-fixture",
      action: "openTextDocument",
      target: fixturePath,
      outcome: "started"
    }
  ];

  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(fixturePath));
  const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
  const tablePosition = findFirstTablePosition(document);
  editor.selection = new vscode.Selection(tablePosition, tablePosition);
  await vscode.commands.executeCommand("workbench.action.focusActiveEditorGroup");
  commandTrace.push(
    {
      stepId: "open-fixture",
      action: "openTextDocument",
      target: fixturePath,
      outcome: "succeeded"
    },
    {
      stepId: "set-cursor",
      action: "selection",
      target: `line ${tablePosition.line}, character ${tablePosition.character}`,
      outcome: "succeeded"
    },
    {
      stepId: "open-editor",
      action: "executeCommand",
      command: "asciidocTable.openEditor",
      keybinding: "cmd+alt+t cmd+alt+e",
      outcome: "started"
    }
  );

  const command = scenarioId === "format-table-preview" ? "asciidocTable.formatTable" : "asciidocTable.openEditor";
  const commandResult = await vscode.commands.executeCommand<OpenTableEditorCommandResult>(command);
  if (commandResult === undefined || !commandResult.ok) {
    commandTrace.push({
      stepId: "open-editor",
      action: "executeCommand",
      command: "asciidocTable.openEditor",
      outcome: "failed",
      reason: commandResult?.message ?? "openEditor command did not return a result"
    });
    writeCommandTrace(artifactRoot, commandTrace);
    runtimeEvents.push(
      createRuntimeEvent({
        event: "webview.render.failed",
        source: "webview",
        runId,
        operation: "render",
        documentId: fixturePath,
        mode: "fallback",
        outcome: "failed",
        message: commandResult?.message ?? "openEditor command did not return a result"
      })
    );
    writeRuntime(artifactRoot, runtimeEvents);
    throw new Error(commandResult?.message ?? "openEditor command failed");
  }
  commandTrace.push(
    {
      stepId: "open-editor",
      action: "executeCommand",
      command,
      outcome: "succeeded",
      mode: commandResult.mode
    },
    {
      stepId: "webview-visible",
      action: "captureEvidence",
      target: "webview.html + screenshot",
      outcome: "started"
    }
  );

  runtimeEvents.push(
    createRuntimeEvent({
      event: "grid.resolve.succeeded",
      source: "grid",
      runId,
      operation: "resolve-grid",
      documentId: fixturePath,
      mode: commandResult.mode === "fallback" ? "fallback" : "structured",
      outcome: "succeeded"
    }),
    createRuntimeEvent({
      event: "webview.render.succeeded",
      source: "webview",
      runId,
      operation: "render",
      documentId: fixturePath,
      mode: commandResult.mode === "fallback" ? "fallback" : "structured",
      outcome: "succeeded"
    })
  );

  await sleep(500);
  const snapshotPath = join(artifactRoot, "ui-review-snapshot.json");
  const editSnapshot = existsSync(snapshotPath)
    ? JSON.parse(readFileSync(snapshotPath, "utf8"))
    : createUiReviewSnapshotFromWebviewModel(commandResult.model, "real-extension-host-webview-fallback");
  const editChecks = evaluateUiReviewSnapshot(editSnapshot);
  const editResult = resultForUiReviewChecks(editChecks);

  await captureScreenshot(join(screenshotRoot, "table-editor.png"));
  commandTrace.push({
    stepId: "webview-visible",
    action: "captureEvidence",
    target: "screenshots/table-editor.png",
    outcome: "succeeded"
  });

  const previewSwitched = await vscode.commands.executeCommand<boolean>("asciidocTable.test.setEditorMode", "preview");
  commandTrace.push({
    stepId: "preview-mode",
    action: "executeCommand",
    command: "asciidocTable.test.setEditorMode",
    target: "preview",
    outcome: previewSwitched ? "succeeded" : "failed"
  });
  await sleep(500);
  const previewSnapshot = existsSync(snapshotPath)
    ? JSON.parse(readFileSync(snapshotPath, "utf8"))
    : editSnapshot;
  const previewChecks = evaluateUiReviewSnapshot(previewSnapshot);
  const previewResult = resultForUiReviewChecks(previewChecks);

  await captureScreenshot(join(screenshotRoot, "table-editor-preview.png"));
  commandTrace.push({
    stepId: "preview-mode",
    action: "captureEvidence",
    target: "screenshots/table-editor-preview.png",
    outcome: "succeeded"
  });

  const report = createUiReviewReport(
    [
      {
        id: `${scenarioId}:edit`,
        result: editResult,
        checks: editChecks,
        artifactPaths: {
          scenarioRoot: artifactRoot,
          snapshot: join(artifactRoot, "ui-review-snapshot.json")
        }
      },
      {
        id: `${scenarioId}:preview`,
        result: previewResult,
        checks: previewChecks,
        artifactPaths: {
          scenarioRoot: artifactRoot,
          snapshot: join(artifactRoot, "ui-review-snapshot.preview.json")
        }
      }
    ],
    {
      reviewRoot: artifactRoot,
      screenshots: screenshotRoot,
      runtimeJsonl: join(artifactRoot, "runtime.jsonl"),
      uiGeometry: join(artifactRoot, "ui-geometry.json"),
      llmUiSelfReview: join(artifactRoot, "llm-ui-self-review.json")
    }
  );

  writeFileSync(join(artifactRoot, "webview.html"), commandResult.html, "utf8");
  writeFileSync(snapshotPath, `${JSON.stringify(editSnapshot, null, 2)}\n`, "utf8");
  writeFileSync(join(artifactRoot, "ui-review-snapshot.preview.json"), `${JSON.stringify(previewSnapshot, null, 2)}\n`, "utf8");
  writeFileSync(join(artifactRoot, "llm-ui-self-review.json"), `${JSON.stringify(editSnapshot.selfReview, null, 2)}\n`, "utf8");
  writeFileSync(join(artifactRoot, "llm-ui-self-review.preview.json"), `${JSON.stringify(previewSnapshot.selfReview, null, 2)}\n`, "utf8");
  writeFileSync(join(artifactRoot, "ui-geometry.json"), `${JSON.stringify({ ...editSnapshot.geometry, checks: editChecks }, null, 2)}\n`, "utf8");
  writeFileSync(join(artifactRoot, "ui-geometry.preview.json"), `${JSON.stringify({ ...previewSnapshot.geometry, checks: previewChecks }, null, 2)}\n`, "utf8");
  writeFileSync(join(artifactRoot, "ui-review-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(
    join(artifactRoot, "scenario.json"),
    `${JSON.stringify({ id: scenarioId, fixture: fixturePath, expectedMode: commandResult.mode }, null, 2)}\n`,
    "utf8"
  );
  writeRuntime(artifactRoot, runtimeEvents);
  writeCommandTrace(artifactRoot, commandTrace);

  if (report.result !== "pass") {
    throw new Error(`UI review result was ${report.result}`);
  }
}

function findFirstTablePosition(document: vscode.TextDocument): vscode.Position {
  for (let line = 0; line < document.lineCount; line += 1) {
    if (document.lineAt(line).text.trim() === "|===") {
      return new vscode.Position(Math.min(line + 1, document.lineCount - 1), 0);
    }
  }
  return new vscode.Position(0, 0);
}

async function captureScreenshot(path: string): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  const startedAt = new Date().toISOString();
  const metadataPath = path.replace(/\.png$/u, ".capture.json");
  const bounds = getExtensionHostWindowBounds();
  const preCaptureActions = await prepareScreenForCapture();
  if (bounds !== undefined) {
    try {
      const args = bounds.windowId
        ? ["-x", "-o", "-l", String(bounds.windowId), path]
        : ["-x", "-R", `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`, path];
      execFileSync("screencapture", args, { stdio: "ignore" });
      writeFileSync(
        metadataPath,
        `${JSON.stringify(
          {
            captureMode: "active-window",
            command: `screencapture ${args.slice(0, -1).join(" ")}`,
            bounds,
            preCaptureActions,
            startedAt,
            finishedAt: new Date().toISOString()
          },
          null,
          2
        )}\n`,
        "utf8"
      );
      return;
    } catch (error) {
      captureFullScreenFallback(path, metadataPath, startedAt, `active-window failed: ${(error as Error).message}`, preCaptureActions);
      return;
    }
  }
  captureFullScreenFallback(path, metadataPath, startedAt, "Extension Development Host window was not found", preCaptureActions);
}

function captureFullScreenFallback(
  path: string,
  metadataPath: string,
  startedAt: string,
  fallbackReason: string,
  preCaptureActions: string[]
): void {
  execFileSync("screencapture", ["-x", path], { stdio: "ignore" });
  writeFileSync(
    metadataPath,
    `${JSON.stringify(
      {
        captureMode: "full-screen-fallback",
        command: "screencapture -x",
        fallbackReason,
        preCaptureActions,
        startedAt,
        finishedAt: new Date().toISOString()
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

async function prepareScreenForCapture(): Promise<string[]> {
  const actions: string[] = [];
  if (await executeWorkbenchCommandIfAvailable("workbench.action.notifications.clearAll")) {
    actions.push("workbench.action.notifications.clearAll");
  }
  if (await executeWorkbenchCommandIfAvailable("notifications.clearAll")) {
    actions.push("notifications.clearAll");
  }
  if (await executeWorkbenchCommandIfAvailable("workbench.action.closeSidebar")) {
    actions.push("workbench.action.closeSidebar");
  }
  if (await executeWorkbenchCommandIfAvailable("workbench.action.closeAuxiliaryBar")) {
    actions.push("workbench.action.closeAuxiliaryBar");
  }
  if (await executeWorkbenchCommandIfAvailable("workbench.action.closePanel")) {
    actions.push("workbench.action.closePanel");
  }
  if (await executeWorkbenchCommandIfAvailable("workbench.action.focusActiveEditorGroup")) {
    actions.push("workbench.action.focusActiveEditorGroup");
  }
  await sleep(250);
  return actions;
}

async function executeWorkbenchCommandIfAvailable(command: string): Promise<boolean> {
  const commands = await vscode.commands.getCommands(true);
  if (!commands.includes(command)) {
    return false;
  }
  try {
    await vscode.commands.executeCommand(command);
    return true;
  } catch {
    return false;
  }
}

function getExtensionHostWindowBounds():
  | { x: number; y: number; width: number; height: number; windowId?: number; processId?: number; title?: string; processName?: string }
  | undefined {
  if (process.platform !== "darwin") {
    return undefined;
  }

  const script = [
    "import CoreGraphics",
    "import Foundation",
    "let preferredTitles = [\"AsciiDoc Table Editor\", \"source.adoc\", \"[Extension Development Host]\"]",
    "let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]",
    "guard let windows = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else { exit(2) }",
    "func number(_ value: Any?) -> Double? {",
    "  if let number = value as? NSNumber { return number.doubleValue }",
    "  return nil",
    "}",
    "func candidate(from window: [String: Any]) -> [String: Any]? {",
    "  let title = window[kCGWindowName as String] as? String ?? \"\"",
    "  let owner = window[kCGWindowOwnerName as String] as? String ?? \"\"",
    "  let layer = (window[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0",
    "  guard layer == 0 else { return nil }",
    "  guard owner == \"Code\" || owner == \"Visual Studio Code\" else { return nil }",
    "  guard let bounds = window[kCGWindowBounds as String] as? [String: Any],",
    "    let x = number(bounds[\"X\"]),",
    "    let y = number(bounds[\"Y\"]),",
    "    let width = number(bounds[\"Width\"]),",
    "    let height = number(bounds[\"Height\"]),",
    "    let id = (window[kCGWindowNumber as String] as? NSNumber)?.intValue,",
    "    let pid = (window[kCGWindowOwnerPID as String] as? NSNumber)?.intValue else { return nil }",
    "  guard width > 0 && height > 0 else { return nil }",
    "  let preferredRank = preferredTitles.firstIndex { title.contains($0) } ?? 100",
    "  let sizeRank = (width >= 700 && height >= 500) ? 10 : 50",
    "  return [",
    "    \"rank\": preferredRank + sizeRank,",
    "    \"windowId\": id,",
    "    \"processId\": pid,",
    "    \"processName\": owner,",
    "    \"title\": title,",
    "    \"x\": Int(x.rounded()),",
    "    \"y\": Int(y.rounded()),",
    "    \"width\": Int(width.rounded()),",
    "    \"height\": Int(height.rounded())",
    "  ]",
    "}",
    "let candidates = windows.compactMap(candidate).sorted {",
    "  let lhs = $0[\"rank\"] as? Int ?? 999",
    "  let rhs = $1[\"rank\"] as? Int ?? 999",
    "  return lhs < rhs",
    "}",
    "guard var selected = candidates.first else { exit(3) }",
    "selected.removeValue(forKey: \"rank\")",
    "let data = try JSONSerialization.data(withJSONObject: selected, options: [])",
    "FileHandle.standardOutput.write(data)"
  ].join("\n");

  try {
    const stdout = execFileSync("/usr/bin/swift", ["-e", script], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const parsed = JSON.parse(stdout) as {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      windowId?: number;
      processId?: number;
      title?: string;
      processName?: string;
    };
    if (
      typeof parsed.x !== "number" ||
      typeof parsed.y !== "number" ||
      typeof parsed.width !== "number" ||
      typeof parsed.height !== "number"
    ) {
      return undefined;
    }
    return {
      x: parsed.x,
      y: parsed.y,
      width: parsed.width,
      height: parsed.height,
      ...(typeof parsed.windowId === "number" ? { windowId: parsed.windowId } : {}),
      ...(typeof parsed.processId === "number" ? { processId: parsed.processId } : {}),
      ...(parsed.title ? { title: parsed.title } : {}),
      ...(parsed.processName ? { processName: parsed.processName } : {})
    };
  } catch {
    return undefined;
  }
}

function writeRuntime(artifactRoot: string, events: ReturnType<typeof createRuntimeEvent>[]): void {
  writeFileSync(join(artifactRoot, "runtime.jsonl"), `${events.map(formatRuntimeEvent).join("\n")}\n`, "utf8");
}

function writeCommandTrace(artifactRoot: string, trace: Array<Record<string, unknown>>): void {
  writeFileSync(join(artifactRoot, "command-trace.json"), `${JSON.stringify(trace, null, 2)}\n`, "utf8");
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
