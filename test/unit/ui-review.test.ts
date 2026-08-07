import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  ScenarioBlockedError,
  createHarnessRunFinishedEvent,
  createUiReviewReport,
  didScenarioSourceChange,
  evaluateUiReviewSnapshot,
  loadUiReviewScenarioSpec,
  parseUiReviewScenarioSpec,
  resultForUiReviewChecks,
  runUiReviewScenario,
  type ScenarioStep,
  type UiReviewSnapshot
} from "../../src/harness";

describe("UI review checks", () => {
  it("accepts a basic visible table editor snapshot", () => {
    const checks = evaluateUiReviewSnapshot(snapshot());

    expect(resultForUiReviewChecks(checks)).toBe("pass");
  });

  it("flags clipped controls and detached popups", () => {
    const checks = evaluateUiReviewSnapshot(snapshot({
      geometry: {
        relationships: [{
          type: "popup-anchor",
          sourceReviewId: "merge-menu",
          targetReviewId: "merge-button",
          distance: 160
        }],
        elements: [
          element("clipped-button", "BUTTON", "button", rect(10, 10, 20, 20), {
            label: "Very long label",
            scrollWidth: 200,
            clientWidth: 20
          })
        ]
      }
    }));

    expect(checks.map((check) => check.id)).toContain("clipping-clipped-button");
    expect(checks.map((check) => check.id)).toContain("popup-anchor-merge-menu-merge-button");
    expect(resultForUiReviewChecks(checks)).toBe("needs-fix");
  });

  it("blocks structured source-changing actions in fallback mode", () => {
    const checks = evaluateUiReviewSnapshot(snapshot({
      selfReview: { mode: "fallback" },
      geometry: {
        elements: [
          element("merge-button", "BUTTON", "button", rect(10, 10, 96, 28), {
            action: "merge-cells"
          })
        ]
      }
    }));

    expect(checks.find((check) => check.id === "fallback-hides-structured-actions")?.passed).toBe(false);
  });

  it("requires preview pane and hides source-changing actions in preview mode", () => {
    const passingChecks = evaluateUiReviewSnapshot(snapshot({
      selfReview: { editorMode: "preview" },
      geometry: {
        elements: [
          element("table-grid", "SECTION", "region", rect(10, 80, 760, 500), { visible: false }),
          element("table-preview", "SECTION", "region", rect(10, 80, 760, 500))
        ]
      }
    }));
    expect(passingChecks.find((check) => check.id === "required-visible-table-preview")?.passed).toBe(true);
    expect(passingChecks.find((check) => check.id === "preview-hides-source-actions")?.passed).toBe(true);

    const blockedChecks = evaluateUiReviewSnapshot(snapshot({
      selfReview: { editorMode: "preview" },
      geometry: {
        elements: [
          element("table-grid", "SECTION", "region", rect(10, 80, 760, 500), { visible: false }),
          element("table-preview", "SECTION", "region", rect(10, 80, 760, 500)),
          element("merge-button", "BUTTON", "button", rect(10, 10, 96, 28), { action: "merge-cells" })
        ]
      }
    }));

    expect(blockedChecks.find((check) => check.id === "preview-hides-source-actions")?.passed).toBe(false);
  });

  it("creates an aggregate report", () => {
    const report = createUiReviewReport([{
      id: "scenario",
      result: "needs-fix",
      checks: [{ id: "bad", severity: "error", passed: false, summary: "Bad layout." }],
      artifactPaths: { screenshot: "screen.png" }
    }], { root: "/tmp/review" });

    expect(report.result).toBe("needs-fix");
    expect(report.findings[0]?.id).toBe("scenario:bad");
    expect(report.humanReviewNeeded).toContain("Native popup behavior");
  });

  it("runs every declared scenario step and records real started/finished command traces", async () => {
    const spec = parseUiReviewScenarioSpec({
      id: "all-actions",
      fixture: "fixtures/lossless/minimal-basic/source.adoc",
      expectedMode: "structured",
      expectedEditorMode: "preview",
      steps: [
        { id: "open", action: "open" },
        { id: "command", action: "command", command: "asciidocTable.openEditor" },
        { id: "paste", action: "paste", startSourceCellId: "cell:0:0", rows: [["A"]] },
        { id: "mode", action: "set-editor-mode", mode: "preview" },
        { id: "keyboard", action: "keyboard", key: "ArrowRight", shiftKey: true },
        { id: "menu", action: "context-menu", sourceCellId: "cell:0:0", item: "insert-row-after" }
      ],
      assertions: [{ id: "grid", type: "ui-review" }]
    });
    const executed: ScenarioStep[] = [];
    let tick = 0;
    const result = await runUiReviewScenario(spec, "run-1", {
      execute(step) {
        executed.push(step);
        return { target: step.action, details: { execution: executed.length } };
      }
    }, () => `2026-08-02T00:00:0${tick++}.000Z`);

    expect(result.outcome).toBe("passed");
    expect(executed.map((step) => step.action)).toEqual(["open", "command", "paste", "set-editor-mode", "keyboard", "context-menu"]);
    expect(result.events.map((event) => event.event)).toEqual(spec.steps.flatMap(() => ["scenario.step.started", "scenario.step.finished"]));
    expect(result.commandTrace).toHaveLength(spec.steps.length);
    expect(result.commandTrace[1]).toMatchObject({ action: "command", command: "asciidocTable.openEditor", outcome: "succeeded" });
  });

  it("blocks an unsupported action instead of ignoring it", () => {
    expect(() => parseUiReviewScenarioSpec({
      id: "unsupported",
      fixture: "fixtures/lossless/minimal-basic/source.adoc",
      expectedMode: "structured",
      steps: [{ id: "unknown", action: "drag-table" }],
      assertions: []
    })).toThrowError(ScenarioBlockedError);
  });

  it("stops at a failed step and records a failed trace entry", async () => {
    const spec = parseUiReviewScenarioSpec({
      id: "blocked",
      fixture: "fixtures/lossless/minimal-basic/source.adoc",
      expectedMode: "structured",
      steps: [
        { id: "open", action: "open" },
        { id: "command", action: "command", command: "unsupported.command" },
        { id: "not-run", action: "set-editor-mode", mode: "preview" }
      ],
      assertions: []
    });
    const executed: string[] = [];
    const result = await runUiReviewScenario(spec, "run-2", {
      execute(step) {
        executed.push(step.id);
        if (step.id === "command") throw new ScenarioBlockedError("unsupported", "unsupported-host-command");
        return {};
      }
    });

    expect(result).toMatchObject({ outcome: "blocked", failureClass: "unsupported-host-command" });
    expect(executed).toEqual(["open", "command"]);
    expect(result.events.at(-1)).toMatchObject({ event: "scenario.step.failed", outcome: "failed" });
    expect(result.commandTrace.at(-1)).toMatchObject({ stepId: "command", outcome: "failed" });
  });

  it("does not execute expected mode values as scenario actions", async () => {
    const spec = parseUiReviewScenarioSpec({
      id: "expected-is-assertion-only",
      fixture: "fixture.adoc",
      expectedMode: "structured",
      expectedEditorMode: "preview",
      steps: [{ id: "open", action: "open" }],
      assertions: []
    });
    const executed: ScenarioStep[] = [];
    await runUiReviewScenario(spec, "run-expected", {
      execute(step) {
        executed.push(step);
        return {};
      }
    });

    expect(executed).toEqual([{ id: "open", action: "open" }]);
  });

  it("blocks unknown aliases, missing files, malformed JSON, and missing fixtures", () => {
    const root = mkdtempSync(join(tmpdir(), "ui-review-loader-"));
    try {
      mkdirSync(join(root, "scenarios"));
      writeFileSync(join(root, "scenarios", "malformed.json"), "{", "utf8");
      writeFileSync(join(root, "scenarios", "missing-fixture.json"), JSON.stringify({
        id: "missing-fixture",
        fixture: "missing.adoc",
        expectedMode: "structured",
        steps: [{ id: "open", action: "open" }],
        assertions: []
      }), "utf8");
      const aliases = new Map([["malformed", "scenarios/malformed.json"]]);

      expect(loadUiReviewScenarioSpec("unknown", root, aliases)).toMatchObject({ ok: false, failureClass: "unknown-scenario-alias" });
      expect(loadUiReviewScenarioSpec("scenarios/missing.json", root, aliases)).toMatchObject({ ok: false, failureClass: "scenario-file-missing" });
      expect(loadUiReviewScenarioSpec("malformed", root, aliases)).toMatchObject({ ok: false, failureClass: "scenario-json-invalid" });
      expect(loadUiReviewScenarioSpec("scenarios/missing-fixture.json", root, aliases)).toMatchObject({ ok: false, failureClass: "scenario-fixture-missing" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("prioritizes blocked scenarios in the aggregate result", () => {
    const report = createUiReviewReport([
      { id: "pass", result: "pass", checks: [], artifactPaths: {} },
      { id: "blocked", result: "blocked", checks: [], artifactPaths: {} }
    ], {});

    expect(report.result).toBe("blocked");
  });

  it("marks harness completion failed when an assertion blocks an otherwise completed scenario", () => {
    expect(createHarnessRunFinishedEvent({
      ts: "2026-08-02T00:00:00.000Z",
      runId: "run-blocked",
      scenarioId: "scenario",
      target: "fixture.adoc",
      artifactPath: "/tmp/artifact",
      executionOutcome: "passed",
      assertionBlocked: true
    })).toMatchObject({
      level: "error",
      event: "harness.run.finished",
      outcome: "failed",
      failureClass: "scenario-assertion-blocked"
    });
  });

  it("measures mutation changes from the source before and after the step", () => {
    expect(didScenarioSourceChange("|===\n| A\n|===\n", "|===\n| A\n|===\n")).toBe(false);
    expect(didScenarioSourceChange("|===\n| A\n|===\n", "|===\n| B\n|===\n")).toBe(true);
  });

  it("writes consistent blocked artifacts for a script-level unknown alias", () => {
    const execution = spawnSync(process.execPath, ["scripts/review-ui-llm.mjs", "--single"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        ASCIIDOC_TABLE_UI_REVIEW_ID: "unit-blocked-artifact",
        ASCIIDOC_TABLE_NIGHTLY_SCENARIO_PATH: "unit-unknown-alias"
      }
    });
    expect(execution.status).toBe(1);
    const reviewRoot = [...execution.stdout.matchAll(/^ui review pack:\s*(.+)$/gmu)].at(-1)?.[1]?.trim();
    expect(reviewRoot).toBeTruthy();
    expect(existsSync(join(reviewRoot!, "ui-review-report.json"))).toBe(true);
    const report = JSON.parse(readFileSync(join(reviewRoot!, "ui-review-report.json"), "utf8"));
    expect(report).toMatchObject({ result: "blocked", scenarioResults: [{ id: "unit-blocked-artifact", result: "blocked" }] });
    const scenarioRoot = join(reviewRoot!, "scenarios", "unit-blocked-artifact");
    expect(readFileSync(join(scenarioRoot, "runtime.jsonl"), "utf8")).toContain('"event":"scenario.load.failed"');
    expect(readFileSync(join(scenarioRoot, "harness.jsonl"), "utf8")).toContain('"outcome":"failed"');
    expect(JSON.parse(readFileSync(join(scenarioRoot, "command-trace.json"), "utf8"))).toEqual([]);
  }, 15_000);

  it("keeps expectedEditorMode assertion-only in the end-to-end review script", () => {
    const root = mkdtempSync(join(tmpdir(), "ui-review-expected-mode-"));
    const scenarioPath = join(root, "scenario.json");
    try {
      writeFileSync(scenarioPath, JSON.stringify({
        id: "expected-preview-without-action",
        fixture: "fixtures/lossless/minimal-basic/source.adoc",
        expectedMode: "structured",
        expectedEditorMode: "preview",
        steps: [
          { id: "open", action: "open" },
          { id: "open-editor", action: "command", command: "asciidocTable.openEditor" }
        ],
        assertions: [{ id: "table-grid-visible", type: "ui-review" }]
      }), "utf8");
      const execution = spawnSync(process.execPath, ["scripts/review-ui-llm.mjs", "--single"], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          ASCIIDOC_TABLE_UI_REVIEW_ID: "unit-expected-mode-mismatch",
          ASCIIDOC_TABLE_NIGHTLY_SCENARIO_PATH: scenarioPath
        }
      });
      expect(execution.status).toBe(1);
      const reviewRoot = [...execution.stdout.matchAll(/^ui review pack:\s*(.+)$/gmu)].at(-1)?.[1]?.trim();
      expect(reviewRoot).toBeTruthy();
      const report = JSON.parse(readFileSync(join(reviewRoot!, "ui-review-report.json"), "utf8"));
      expect(report).toMatchObject({ result: "needs-fix" });
      const scenarioRoot = join(reviewRoot!, "scenarios", "unit-expected-mode-mismatch");
      const snapshot = JSON.parse(readFileSync(join(scenarioRoot, "ui-review-snapshot.json"), "utf8"));
      expect(snapshot.selfReview.editorMode).toBe("edit");
      expect(report.scenarioResults[0].checks).toContainEqual(expect.objectContaining({
        id: "scenario-expected-editor-mode",
        passed: false,
        evidence: "expected=preview, actual=edit"
      }));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 15_000);
});

type SnapshotOverrides = Omit<Partial<UiReviewSnapshot>, "geometry" | "selfReview"> & {
  geometry?: Partial<UiReviewSnapshot["geometry"]>;
  selfReview?: Partial<UiReviewSnapshot["selfReview"]>;
};

function snapshot(overrides: SnapshotOverrides = {}): UiReviewSnapshot {
  const baseElements = [
    element("shell", "DIV", "region", rect(0, 0, 1200, 800)),
    element("table-grid", "SECTION", "region", rect(10, 80, 760, 500)),
    element("cell-inspector", "ASIDE", "complementary", rect(800, 80, 360, 500))
  ];
  return {
    capturedAt: "2026-05-09T00:00:00.000Z",
    reason: "test",
    selfReview: {
      mode: "structured",
      inspectorOpen: true,
      isViewOnlyOrdering: false,
      ...overrides.selfReview
    },
    geometry: {
      viewport: overrides.geometry?.viewport ?? { width: 1200, height: 800 },
      elements: [...baseElements, ...(overrides.geometry?.elements ?? [])],
      relationships: overrides.geometry?.relationships ?? []
    }
  };
}

function element(
  reviewId: string,
  tagName: string,
  role: string,
  value: UiReviewSnapshot["geometry"]["elements"][number]["rect"],
  overrides: Partial<UiReviewSnapshot["geometry"]["elements"][number]> = {}
) {
  return {
    reviewId,
    tagName,
    role,
    label: reviewId,
    visible: true,
    disabled: false,
    rect: value,
    scrollWidth: value.width,
    scrollHeight: value.height,
    clientWidth: value.width,
    clientHeight: value.height,
    ...overrides
  };
}

function rect(x: number, y: number, width: number, height: number) {
  return {
    x,
    y,
    width,
    height,
    top: y,
    right: x + width,
    bottom: y + height,
    left: x
  };
}
