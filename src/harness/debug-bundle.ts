import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RuntimeEvent } from "../logging";
import { formatRuntimeEvent } from "../logging";

export type HarnessOutcome = "passed" | "failed" | "blocked";
export type HarnessFailureClass = "runtime-failure" | "harness-failure" | "expected-fallback" | "none";

export interface HarnessScenarioSpec {
  id: string;
  fixture: string;
  expectedMode: "structured" | "fallback";
  steps: Array<{ id: string; action: string }>;
  assertions: Array<{ id: string; target: string }>;
}

export interface HarnessEvent {
  ts: string;
  level: "debug" | "info" | "warn" | "error";
  event: string;
  runId: string;
  scenarioId: string;
  stepId?: string;
  tool?: "vscode" | "computer-use" | "macos" | "harness";
  target?: string;
  outcome?: "started" | "succeeded" | "failed";
  artifactPath?: string;
}

export interface DebugBundleInput {
  artifactRoot: string;
  runId: string;
  scenario: HarnessScenarioSpec;
  runtimeEvents: RuntimeEvent[];
  harnessEvents?: HarnessEvent[];
  workspaceState?: Record<string, unknown>;
  commandTrace?: Array<Record<string, unknown>>;
  screenshots?: Array<{ sourcePath: string; fileName: string }>;
}

export interface DebugBundleResult {
  runId: string;
  scenarioId: string;
  outcome: HarnessOutcome;
  failureClass: HarnessFailureClass;
  artifactRoot: string;
  files: Record<string, string>;
}

export function createHarnessEvent(input: Omit<HarnessEvent, "ts" | "level"> & { level?: HarnessEvent["level"]; now?: Date }): HarnessEvent {
  return {
    ts: (input.now ?? new Date()).toISOString(),
    level: input.level ?? (input.outcome === "failed" ? "error" : "info"),
    event: input.event,
    runId: input.runId,
    scenarioId: input.scenarioId,
    stepId: input.stepId,
    tool: input.tool,
    target: input.target,
    outcome: input.outcome,
    artifactPath: input.artifactPath
  };
}

export function buildDebugBundle(input: DebugBundleInput): DebugBundleResult {
  const bundleRoot = join(input.artifactRoot, input.runId);
  const screenshotsRoot = join(bundleRoot, "screenshots");
  mkdirSync(screenshotsRoot, { recursive: true });

  const harnessEvents = [
    createHarnessEvent({
      event: "harness.run.started",
      runId: input.runId,
      scenarioId: input.scenario.id,
      tool: "harness",
      outcome: "started"
    }),
    ...(input.harnessEvents ?? [])
  ];
  const failureClass = classifyFailure(input.runtimeEvents, harnessEvents, input.scenario.expectedMode);
  const outcome: HarnessOutcome = failureClass === "none" || failureClass === "expected-fallback" ? "passed" : "failed";
  const finishedEvent = createHarnessEvent({
    event: "harness.run.finished",
    runId: input.runId,
    scenarioId: input.scenario.id,
    tool: "harness",
    outcome: outcome === "passed" ? "succeeded" : "failed"
  });
  const debugBundleEvent = createHarnessEvent({
    event: "artifact.debug-bundle.created",
    runId: input.runId,
    scenarioId: input.scenario.id,
    tool: "harness",
    outcome: "succeeded",
    artifactPath: bundleRoot
  });
  const allHarnessEvents = [...harnessEvents, finishedEvent, debugBundleEvent];

  const files = {
    runtimeJsonl: join(bundleRoot, "runtime.jsonl"),
    harnessJsonl: join(bundleRoot, "harness.jsonl"),
    logIndex: join(bundleRoot, "log-index.json"),
    scenario: join(bundleRoot, "scenario.json"),
    workspaceState: join(bundleRoot, "workspace-state.json"),
    commandTrace: join(bundleRoot, "command-trace.json"),
    summary: join(bundleRoot, "summary.md")
  };

  for (const screenshot of input.screenshots ?? []) {
    copyFileSync(screenshot.sourcePath, join(screenshotsRoot, screenshot.fileName));
  }

  writeFileSync(files.runtimeJsonl, `${input.runtimeEvents.map(formatRuntimeEvent).join("\n")}\n`, "utf8");
  writeFileSync(files.harnessJsonl, `${allHarnessEvents.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");
  writeFileSync(files.scenario, `${JSON.stringify(input.scenario, null, 2)}\n`, "utf8");
  writeFileSync(files.workspaceState, `${JSON.stringify(input.workspaceState ?? {}, null, 2)}\n`, "utf8");
  writeFileSync(files.commandTrace, `${JSON.stringify(input.commandTrace ?? [], null, 2)}\n`, "utf8");
  writeFileSync(
    files.logIndex,
    `${JSON.stringify(
      {
        runId: input.runId,
        scenarioId: input.scenario.id,
        runtimeEvents: input.runtimeEvents.length,
        harnessEvents: allHarnessEvents.length,
        failureClass,
        outcome
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  writeFileSync(files.summary, renderSummary(input.runId, input.scenario.id, outcome, failureClass), "utf8");

  return {
    runId: input.runId,
    scenarioId: input.scenario.id,
    outcome,
    failureClass,
    artifactRoot: bundleRoot,
    files
  };
}

export function classifyFailure(
  runtimeEvents: RuntimeEvent[],
  harnessEvents: HarnessEvent[],
  expectedMode: "structured" | "fallback"
): HarnessFailureClass {
  const failedRuntime = runtimeEvents.filter((event) => event.outcome === "failed" || event.level === "error");
  const failedHarness = harnessEvents.filter((event) => event.outcome === "failed" || event.level === "error");

  if (failedHarness.length > 0) {
    return "harness-failure";
  }

  if (failedRuntime.length > 0) {
    const fallbackAllowed = expectedMode === "fallback" && failedRuntime.every((event) => isExpectedFallbackFailure(event.event));
    return fallbackAllowed ? "expected-fallback" : "runtime-failure";
  }

  return "none";
}

function isExpectedFallbackFailure(event: string): boolean {
  return event === "validator.run.failed" || event === "emitter.export.failed";
}

function renderSummary(runId: string, scenarioId: string, outcome: HarnessOutcome, failureClass: HarnessFailureClass): string {
  return `# Harness Debug Bundle

- runId: ${runId}
- scenarioId: ${scenarioId}
- outcome: ${outcome}
- failureClass: ${failureClass}
`;
}
