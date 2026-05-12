import { describe, expect, it } from "vitest";
import {
  createUiReviewReport,
  evaluateUiReviewSnapshot,
  resultForUiReviewChecks,
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
