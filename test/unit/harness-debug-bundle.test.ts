import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createRuntimeEvent } from "../../src/logging";
import { buildDebugBundle, classifyFailure, createHarnessEvent, type HarnessScenarioSpec } from "../../src/harness";

describe("harness debug bundle", () => {
  it("writes the fixed debug bundle files and index", () => {
    const artifactRoot = mkdtempSync(join(tmpdir(), "asciidoc-table-harness-"));
    const result = buildDebugBundle({
      artifactRoot,
      runId: "run-debug",
      scenario: scenario("table-grid-smoke"),
      runtimeEvents: [
        createRuntimeEvent({
          event: "parser.import.started",
          source: "parser",
          runId: "run-debug",
          operation: "import",
          outcome: "started"
        })
      ],
      workspaceState: { workspacePath: "/tmp/workspace" },
      commandTrace: [{ command: "asciidocTable.openEditor" }]
    });

    expect(result.outcome).toBe("passed");
    expect(result.failureClass).toBe("none");
    for (const filePath of Object.values(result.files)) {
      expect(existsSync(filePath)).toBe(true);
    }
    expect(existsSync(join(result.artifactRoot, "screenshots"))).toBe(true);
    expect(readFileSync(result.files.logIndex, "utf8")).toContain('"failureClass": "none"');
    expect(readFileSync(result.files.harnessJsonl, "utf8")).toContain("artifact.debug-bundle.created");
  });

  it("classifies runtime, harness, and expected fallback failures", () => {
    const runtimeFailure = createRuntimeEvent({
      event: "parser.import.failed",
      source: "parser",
      runId: "run-failure",
      operation: "import",
      outcome: "failed"
    });
    const expectedFallback = createRuntimeEvent({
      event: "emitter.export.failed",
      source: "emitter",
      runId: "run-fallback",
      operation: "export",
      outcome: "failed"
    });
    const harnessFailure = createHarnessEvent({
      event: "command.exec.failed",
      runId: "run-harness",
      scenarioId: "scenario",
      tool: "vscode",
      outcome: "failed"
    });

    expect(classifyFailure([runtimeFailure], [], "structured")).toBe("runtime-failure");
    expect(classifyFailure([expectedFallback], [], "fallback")).toBe("expected-fallback");
    expect(classifyFailure([], [harnessFailure], "structured")).toBe("harness-failure");
  });
});

function scenario(id: string): HarnessScenarioSpec {
  return {
    id,
    fixture: "fixtures/lossless/minimal-basic/source.adoc",
    expectedMode: "structured",
    steps: [{ id: "open-editor", action: "command" }],
    assertions: [{ id: "grid-visible", target: "table-grid" }]
  };
}
