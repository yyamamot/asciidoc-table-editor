import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

export type RuntimeLogLevel = "debug" | "info" | "warn" | "error";
export type RuntimeLogMode = "structured" | "fallback";
export type RuntimeLogOutcome = "started" | "succeeded" | "failed";

export interface RuntimeEvent {
  ts: string;
  level: RuntimeLogLevel;
  event: string;
  source: string;
  runId: string;
  operation: string;
  documentId?: string;
  mode?: RuntimeLogMode;
  outcome?: RuntimeLogOutcome;
  message?: string;
  data?: Record<string, string | number | boolean>;
}

export interface RuntimeEventInput {
  level?: RuntimeLogLevel;
  event: string;
  source: string;
  runId: string;
  operation: string;
  documentId?: string;
  mode?: RuntimeLogMode;
  outcome?: RuntimeLogOutcome;
  message?: string;
  data?: Record<string, string | number | boolean>;
  now?: Date;
}

export function createRuntimeEvent(input: RuntimeEventInput): RuntimeEvent {
  return {
    ts: (input.now ?? new Date()).toISOString(),
    level: input.level ?? levelForOutcome(input.outcome),
    event: input.event,
    source: input.source,
    runId: input.runId,
    operation: input.operation,
    documentId: input.documentId,
    mode: input.mode,
    outcome: input.outcome,
    message: input.message,
    data: input.data
  };
}

export function formatRuntimeEvent(event: RuntimeEvent): string {
  validateRuntimeEvent(event);
  return JSON.stringify(event);
}

export function parseRuntimeJsonl(content: string): RuntimeEvent[] {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid runtime JSONL at line ${index + 1}: ${(error as Error).message}`);
      }

      validateRuntimeEvent(value);
      return value;
    });
}

export function appendRuntimeEvent(filePath: string, event: RuntimeEvent): void {
  mkdirSync(dirname(filePath), { recursive: true });
  appendFileSync(filePath, `${formatRuntimeEvent(event)}\n`, "utf8");
}

export function readRuntimeJsonl(filePath: string): RuntimeEvent[] {
  return parseRuntimeJsonl(readFileSync(filePath, "utf8"));
}

export function createSeedRuntimeEvents(runId: string, documentId = "document:test"): RuntimeEvent[] {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return [
    createRuntimeEvent({
      now,
      event: "parser.import.started",
      source: "parser",
      runId,
      operation: "import",
      documentId,
      outcome: "started"
    }),
    createRuntimeEvent({
      now,
      event: "projection.run.succeeded",
      source: "projection",
      runId,
      operation: "project",
      documentId,
      mode: "structured",
      outcome: "succeeded"
    }),
    createRuntimeEvent({
      now,
      event: "grid.resolve.succeeded",
      source: "grid",
      runId,
      operation: "resolve-grid",
      documentId,
      mode: "structured",
      outcome: "succeeded"
    }),
    createRuntimeEvent({
      now,
      event: "emitter.export.succeeded",
      source: "emitter",
      runId,
      operation: "export",
      documentId,
      mode: "structured",
      outcome: "succeeded"
    }),
    createRuntimeEvent({
      now,
      event: "ui.command.executed",
      source: "ui",
      runId,
      operation: "command",
      documentId,
      outcome: "succeeded"
    })
  ];
}

export function validateRuntimeEvent(value: unknown): asserts value is RuntimeEvent {
  if (!isObject(value)) {
    throw new Error("Runtime event must be an object");
  }

  requireString(value, "ts");
  requireString(value, "level");
  requireString(value, "event");
  requireString(value, "source");
  requireString(value, "runId");
  requireString(value, "operation");

  const level = value.level;
  if (typeof level !== "string" || !["debug", "info", "warn", "error"].includes(level)) {
    throw new Error(`Invalid runtime level: ${String(level)}`);
  }

  if ("message" in value && typeof value.message === "string" && value.message.length > 500) {
    throw new Error("Runtime event message is too long");
  }

  if ("raw" in value || "sourceText" in value) {
    throw new Error("Runtime event must not contain raw source text");
  }
}

function levelForOutcome(outcome: RuntimeLogOutcome | undefined): RuntimeLogLevel {
  if (outcome === "failed") {
    return "error";
  }
  return "info";
}

function requireString(value: Record<string, unknown>, key: string): asserts value is Record<string, unknown> {
  if (typeof value[key] !== "string" || value[key].length === 0) {
    throw new Error(`Runtime event requires string field: ${key}`);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
