import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  appendRuntimeEvent,
  createRuntimeEvent,
  createSeedRuntimeEvents,
  formatRuntimeEvent,
  parseRuntimeJsonl,
  readRuntimeJsonl,
  validateRuntimeEvent
} from "../../src/logging";

describe("runtime JSONL logging", () => {
  it("formats and parses contract-compliant runtime events", () => {
    const event = createRuntimeEvent({
      now: new Date("2026-01-01T00:00:00.000Z"),
      event: "parser.import.started",
      source: "parser",
      runId: "run-1",
      operation: "import",
      documentId: "doc-1",
      outcome: "started"
    });

    const line = formatRuntimeEvent(event);
    expect(parseRuntimeJsonl(`${line}\n`)).toEqual([event]);
  });

  it("rejects malformed JSONL and raw source payloads", () => {
    expect(() => parseRuntimeJsonl("{bad json}\n")).toThrow("Invalid runtime JSONL");
    expect(() =>
      validateRuntimeEvent({
        ts: "2026-01-01T00:00:00.000Z",
        level: "info",
        event: "parser.import.started",
        source: "parser",
        runId: "run-1",
        operation: "import",
        raw: "|===\n| A\n|===\n"
      })
    ).toThrow("raw source text");
  });

  it("appends runtime JSONL to a file sink", () => {
    const root = mkdtempSync(join(tmpdir(), "asciidoc-table-runtime-"));
    const filePath = join(root, "runtime.jsonl");
    const event = createRuntimeEvent({
      event: "ui.command.executed",
      source: "ui",
      runId: "run-file",
      operation: "command",
      outcome: "succeeded"
    });

    appendRuntimeEvent(filePath, event);

    expect(readFileSync(filePath, "utf8")).toBe(`${formatRuntimeEvent(event)}\n`);
    expect(readRuntimeJsonl(filePath)).toEqual([event]);
  });

  it("creates seed events for parser, projection, grid, emitter, and UI command paths", () => {
    const events = createSeedRuntimeEvents("run-seed");

    expect(events.map((event) => event.event)).toEqual([
      "parser.import.started",
      "projection.run.succeeded",
      "grid.resolve.succeeded",
      "emitter.export.succeeded",
      "ui.command.executed"
    ]);
    expect(new Set(events.map((event) => event.runId))).toEqual(new Set(["run-seed"]));
  });
});
