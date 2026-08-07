import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type ScenarioEditorMode = "edit" | "preview" | "format-review";

export type ScenarioStep =
  | { readonly id: string; readonly action: "open" }
  | { readonly id: string; readonly action: "command"; readonly command: string; readonly target?: string }
  | {
      readonly id: string;
      readonly action: "paste";
      readonly startSourceCellId: string;
      readonly format?: "plain" | "html-table";
      readonly rows?: readonly (readonly string[])[];
      readonly html?: string;
      readonly text?: string;
      readonly sourceLabel?: string;
    }
  | { readonly id: string; readonly action: "set-editor-mode"; readonly mode: ScenarioEditorMode }
  | {
      readonly id: string;
      readonly action: "keyboard";
      readonly key: string;
      readonly shiftKey?: boolean;
      readonly altKey?: boolean;
      readonly ctrlKey?: boolean;
      readonly metaKey?: boolean;
    }
  | { readonly id: string; readonly action: "select-cell"; readonly sourceCellId: string }
  | { readonly id: string; readonly action: "button"; readonly button: string }
  | {
      readonly id: string;
      readonly action: "context-menu";
      readonly sourceCellId: string;
      readonly item?: string;
    };

export type AssertionSpec =
  | { readonly id: string; readonly type: "ui-review" }
  | { readonly id: string; readonly type: "vlm-review" };

export interface UiReviewScenarioSpec {
  readonly id: string;
  readonly fixture: string;
  readonly expectedMode: "structured" | "fallback";
  readonly expectedEditorMode?: ScenarioEditorMode;
  readonly formatReview?: boolean;
  readonly steps: readonly ScenarioStep[];
  readonly assertions: readonly AssertionSpec[];
}

export interface ScenarioStepExecution {
  readonly target?: string;
  readonly details?: Record<string, unknown>;
}

export interface ScenarioStepAdapter {
  execute(step: ScenarioStep): ScenarioStepExecution | Promise<ScenarioStepExecution>;
}

export interface ScenarioTraceEvent {
  readonly ts: string;
  readonly level: "info" | "error";
  readonly event: "scenario.step.started" | "scenario.step.finished" | "scenario.step.failed";
  readonly runId: string;
  readonly scenarioId: string;
  readonly stepId: string;
  readonly tool: "vscode";
  readonly target: string;
  readonly outcome: "started" | "succeeded" | "failed";
  readonly failureClass?: string;
  readonly message?: string;
}

export interface ScenarioCommandTraceEntry {
  readonly stepId: string;
  readonly action: ScenarioStep["action"];
  readonly command?: string;
  readonly target: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly outcome: "succeeded" | "failed";
  readonly details?: Record<string, unknown>;
  readonly message?: string;
}

export interface ScenarioExecutionResult {
  readonly outcome: "passed" | "blocked";
  readonly events: readonly ScenarioTraceEvent[];
  readonly commandTrace: readonly ScenarioCommandTraceEntry[];
  readonly failureClass?: string;
  readonly message?: string;
}

export interface HarnessRunFinishedEvent {
  readonly ts: string;
  readonly level: "info" | "error";
  readonly event: "harness.run.finished";
  readonly runId: string;
  readonly scenarioId: string;
  readonly tool: "vscode";
  readonly target: string;
  readonly outcome: "succeeded" | "failed";
  readonly failureClass?: string;
  readonly artifactPath: string;
}

export class ScenarioBlockedError extends Error {
  constructor(message: string, readonly failureClass = "unsupported-scenario-step") {
    super(message);
    this.name = "ScenarioBlockedError";
  }
}

export type ScenarioLoadResult =
  | { readonly ok: true; readonly spec: UiReviewScenarioSpec; readonly path: string }
  | { readonly ok: false; readonly failureClass: string; readonly message: string; readonly input: string; readonly path?: string };

export function loadUiReviewScenarioSpec(
  input: string,
  root: string,
  aliases: ReadonlyMap<string, string>
): ScenarioLoadResult {
  const aliasPath = aliases.get(input);
  if (!aliasPath && !input.includes("/") && !input.endsWith(".json")) {
    return { ok: false, failureClass: "unknown-scenario-alias", message: `Unknown scenario alias: ${input}`, input };
  }
  const path = resolve(root, aliasPath ?? input);
  if (!existsSync(path)) {
    return { ok: false, failureClass: "scenario-file-missing", message: `Scenario file was not found: ${path}`, input, path };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return {
      ok: false,
      failureClass: "scenario-json-invalid",
      message: `Scenario JSON could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
      input,
      path
    };
  }
  try {
    const spec = parseUiReviewScenarioSpec(parsed);
    const fixturePath = resolve(root, spec.fixture);
    if (!existsSync(fixturePath)) {
      return { ok: false, failureClass: "scenario-fixture-missing", message: `Scenario fixture was not found: ${fixturePath}`, input, path };
    }
    return { ok: true, spec, path };
  } catch (error) {
    return {
      ok: false,
      failureClass: error instanceof ScenarioBlockedError ? error.failureClass : "invalid-scenario-schema",
      message: error instanceof Error ? error.message : String(error),
      input,
      path
    };
  }
}

export function createHarnessRunFinishedEvent(input: {
  readonly ts: string;
  readonly runId: string;
  readonly scenarioId: string;
  readonly target: string;
  readonly artifactPath: string;
  readonly executionOutcome: ScenarioExecutionResult["outcome"];
  readonly assertionBlocked: boolean;
  readonly executionFailureClass?: string;
}): HarnessRunFinishedEvent {
  const failed = input.executionOutcome === "blocked" || input.assertionBlocked;
  return {
    ts: input.ts,
    level: failed ? "error" : "info",
    event: "harness.run.finished",
    runId: input.runId,
    scenarioId: input.scenarioId,
    tool: "vscode",
    target: input.target,
    outcome: failed ? "failed" : "succeeded",
    ...(failed ? { failureClass: input.executionFailureClass ?? (input.assertionBlocked ? "scenario-assertion-blocked" : "scenario-execution-blocked") } : {}),
    artifactPath: input.artifactPath
  };
}

export function didScenarioSourceChange(before: string, after: string): boolean {
  return before !== after;
}

export function parseUiReviewScenarioSpec(value: unknown): UiReviewScenarioSpec {
  if (!isRecord(value)) {
    throw new ScenarioBlockedError("Scenario JSON must contain an object.", "invalid-scenario-schema");
  }
  const id = requiredString(value, "id");
  const fixture = requiredString(value, "fixture");
  if (value.expectedMode !== "structured" && value.expectedMode !== "fallback") {
    throw new ScenarioBlockedError("Scenario expectedMode must be structured or fallback.", "invalid-scenario-schema");
  }
  const expectedEditorMode = optionalEditorMode(value.expectedEditorMode, "expectedEditorMode");
  if (value.formatReview !== undefined && typeof value.formatReview !== "boolean") {
    throw new ScenarioBlockedError("Scenario formatReview must be boolean.", "invalid-scenario-schema");
  }
  if (!Array.isArray(value.steps) || value.steps.length === 0) {
    throw new ScenarioBlockedError("Scenario steps must be a non-empty array.", "invalid-scenario-schema");
  }
  if (!Array.isArray(value.assertions)) {
    throw new ScenarioBlockedError("Scenario assertions must be an array.", "invalid-scenario-schema");
  }
  const steps = value.steps.map(parseScenarioStep);
  const stepIds = new Set<string>();
  for (const step of steps) {
    if (stepIds.has(step.id)) {
      throw new ScenarioBlockedError(`Duplicate scenario step id: ${step.id}`, "invalid-scenario-schema");
    }
    stepIds.add(step.id);
  }
  const assertions = value.assertions.map(parseAssertionSpec);
  return {
    id,
    fixture,
    expectedMode: value.expectedMode,
    ...(expectedEditorMode === undefined ? {} : { expectedEditorMode }),
    ...(value.formatReview === undefined ? {} : { formatReview: value.formatReview }),
    steps,
    assertions
  };
}

export async function runUiReviewScenario(
  spec: UiReviewScenarioSpec,
  runId: string,
  adapter: ScenarioStepAdapter,
  now: () => string = () => new Date().toISOString()
): Promise<ScenarioExecutionResult> {
  const events: ScenarioTraceEvent[] = [];
  const commandTrace: ScenarioCommandTraceEntry[] = [];
  for (const step of spec.steps) {
    const startedAt = now();
    const target = targetForStep(step);
    events.push(event(spec, runId, step.id, target, startedAt, "started"));
    try {
      const execution = await adapter.execute(step);
      const finishedAt = now();
      events.push(event(spec, runId, step.id, execution.target ?? target, finishedAt, "succeeded"));
      commandTrace.push({
        stepId: step.id,
        action: step.action,
        ...(step.action === "command" ? { command: step.command } : {}),
        target: execution.target ?? target,
        startedAt,
        finishedAt,
        outcome: "succeeded",
        ...(execution.details === undefined ? {} : { details: execution.details })
      });
    } catch (error) {
      const finishedAt = now();
      const message = error instanceof Error ? error.message : String(error);
      const failureClass = error instanceof ScenarioBlockedError ? error.failureClass : "scenario-step-failed";
      events.push(event(spec, runId, step.id, target, finishedAt, "failed", failureClass, message));
      commandTrace.push({
        stepId: step.id,
        action: step.action,
        ...(step.action === "command" ? { command: step.command } : {}),
        target,
        startedAt,
        finishedAt,
        outcome: "failed",
        message
      });
      return { outcome: "blocked", events, commandTrace, failureClass, message };
    }
  }
  return { outcome: "passed", events, commandTrace };
}

function parseScenarioStep(value: unknown): ScenarioStep {
  if (!isRecord(value)) {
    throw new ScenarioBlockedError("Scenario step must be an object.", "invalid-scenario-schema");
  }
  const id = requiredString(value, "id");
  switch (value.action) {
    case "open":
      return { id, action: "open" };
    case "command":
      return { id, action: "command", command: requiredString(value, "command"), ...(optionalString(value.target) ? { target: value.target as string } : {}) };
    case "set-editor-mode":
      return { id, action: "set-editor-mode", mode: requiredEditorMode(value.mode, "mode") };
    case "keyboard":
      return {
        id,
        action: "keyboard",
        key: requiredString(value, "key"),
        ...optionalBooleans(value, ["shiftKey", "altKey", "ctrlKey", "metaKey"])
      };
    case "select-cell":
      return { id, action: "select-cell", sourceCellId: requiredString(value, "sourceCellId") };
    case "button":
      return { id, action: "button", button: requiredString(value, "button") };
    case "context-menu":
      return {
        id,
        action: "context-menu",
        sourceCellId: requiredString(value, "sourceCellId"),
        ...(optionalString(value.item) ? { item: value.item as string } : {})
      };
    case "paste": {
      const rows = parseRows(value.rows);
      const html = optionalString(value.html);
      const text = optionalString(value.text);
      if (rows === undefined && html === undefined && text === undefined) {
        throw new ScenarioBlockedError(`Paste step ${id} requires rows, html, or text.`, "invalid-scenario-schema");
      }
      if (value.format !== undefined && value.format !== "plain" && value.format !== "html-table") {
        throw new ScenarioBlockedError(`Paste step ${id} has an unsupported format.`, "invalid-scenario-schema");
      }
      return {
        id,
        action: "paste",
        startSourceCellId: requiredString(value, "startSourceCellId"),
        ...(value.format === undefined ? {} : { format: value.format }),
        ...(rows === undefined ? {} : { rows }),
        ...(html === undefined ? {} : { html }),
        ...(text === undefined ? {} : { text }),
        ...(optionalString(value.sourceLabel) ? { sourceLabel: value.sourceLabel as string } : {})
      };
    }
    default:
      throw new ScenarioBlockedError(`Unsupported scenario action: ${String(value.action)}`, "unsupported-scenario-step");
  }
}

function parseAssertionSpec(value: unknown): AssertionSpec {
  if (!isRecord(value)) {
    throw new ScenarioBlockedError("Scenario assertion must be an object.", "invalid-scenario-schema");
  }
  const id = requiredString(value, "id");
  if (value.type !== "ui-review" && value.type !== "vlm-review") {
    throw new ScenarioBlockedError(`Unsupported assertion type: ${String(value.type)}`, "unsupported-assertion");
  }
  return { id, type: value.type };
}

function event(
  spec: UiReviewScenarioSpec,
  runId: string,
  stepId: string,
  target: string,
  ts: string,
  outcome: "started" | "succeeded" | "failed",
  failureClass?: string,
  message?: string
): ScenarioTraceEvent {
  return {
    ts,
    level: outcome === "failed" ? "error" : "info",
    event: outcome === "started" ? "scenario.step.started" : outcome === "succeeded" ? "scenario.step.finished" : "scenario.step.failed",
    runId,
    scenarioId: spec.id,
    stepId,
    tool: "vscode",
    target,
    outcome,
    ...(failureClass === undefined ? {} : { failureClass }),
    ...(message === undefined ? {} : { message })
  };
}

function targetForStep(step: ScenarioStep): string {
  switch (step.action) {
    case "open": return "fixture";
    case "command": return step.command;
    case "paste": return step.startSourceCellId;
    case "set-editor-mode": return step.mode;
    case "keyboard": return step.key;
    case "select-cell": return step.sourceCellId;
    case "button": return step.button;
    case "context-menu": return step.item ?? step.sourceCellId;
  }
}

function parseRows(value: unknown): readonly (readonly string[])[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.some((row) => !Array.isArray(row) || row.length === 0 || row.some((cell) => typeof cell !== "string"))) {
    throw new ScenarioBlockedError("Paste rows must be a non-empty rectangular string matrix.", "invalid-scenario-schema");
  }
  const width = value[0]?.length;
  if (value.some((row) => row.length !== width)) {
    throw new ScenarioBlockedError("Paste rows must be rectangular.", "invalid-scenario-schema");
  }
  return value as string[][];
}

function optionalBooleans(value: Record<string, unknown>, keys: readonly string[]): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const key of keys) {
    if (value[key] !== undefined && typeof value[key] !== "boolean") {
      throw new ScenarioBlockedError(`Scenario step ${key} must be boolean.`, "invalid-scenario-schema");
    }
    if (typeof value[key] === "boolean") result[key] = value[key] as boolean;
  }
  return result;
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const result = optionalString(value[key]);
  if (result === undefined) {
    throw new ScenarioBlockedError(`Scenario ${key} must be a non-empty string.`, "invalid-scenario-schema");
  }
  return result;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function requiredEditorMode(value: unknown, key: string): ScenarioEditorMode {
  const mode = optionalEditorMode(value, key);
  if (mode === undefined) {
    throw new ScenarioBlockedError(`Scenario ${key} must be edit, preview, or format-review.`, "invalid-scenario-schema");
  }
  return mode;
}

function optionalEditorMode(value: unknown, key: string): ScenarioEditorMode | undefined {
  if (value === undefined) return undefined;
  if (value === "edit" || value === "preview" || value === "format-review") return value;
  throw new ScenarioBlockedError(`Scenario ${key} must be edit, preview, or format-review.`, "invalid-scenario-schema");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
