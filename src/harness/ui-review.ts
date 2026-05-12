import type { WebviewAppModel } from "../app";

export type UiReviewResult = "pass" | "needs-fix" | "human-review";
export type UiReviewSeverity = "error" | "warning" | "info";

export interface UiReviewRect {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface UiReviewElement {
  reviewId: string;
  tagName: string;
  role: string;
  label: string;
  visible: boolean;
  disabled: boolean;
  action?: string;
  rect: UiReviewRect;
  scrollWidth: number;
  scrollHeight: number;
  clientWidth: number;
  clientHeight: number;
}

export interface UiReviewRelationship {
  type: "popup-anchor" | "picker-anchor";
  sourceReviewId: string;
  targetReviewId: string;
  distance: number;
}

export interface UiReviewGeometry {
  viewport: {
    width: number;
    height: number;
  };
  elements: UiReviewElement[];
  relationships: UiReviewRelationship[];
}

export interface UiReviewSnapshot {
  capturedAt: string;
  reason: string;
  selfReview: {
    mode?: "structured" | "fallback";
    layout?: "horizontal" | "vertical";
    inspectorOpen?: boolean;
    inspectorTab?: string;
    isViewOnlyOrdering?: boolean;
    [key: string]: unknown;
  };
  geometry: UiReviewGeometry;
}

export interface UiReviewCheck {
  id: string;
  severity: UiReviewSeverity;
  passed: boolean;
  summary: string;
  evidence?: string;
}

export interface UiReviewScenarioResult {
  id: string;
  result: UiReviewResult;
  checks: UiReviewCheck[];
  artifactPaths: Record<string, string>;
}

export interface UiReviewReport {
  result: UiReviewResult;
  scenarioResults: UiReviewScenarioResult[];
  findings: UiReviewCheck[];
  humanReviewNeeded: string[];
  artifactPaths: Record<string, string>;
}

export interface UiReviewSnapshotOptions {
  readonly editorMode?: "edit" | "preview" | "format-review";
}

const STRUCTURED_SOURCE_ACTIONS = new Set([
  "merge-cells",
  "unmerge-cells",
  "update-cell-content",
  "update-block-cell-source",
  "update-cell-style",
  "insert-row",
  "insert-column",
  "delete-row",
  "delete-column"
]);

export function evaluateUiReviewSnapshot(snapshot: UiReviewSnapshot): UiReviewCheck[] {
  const checks: UiReviewCheck[] = [];
  const visibleElements = snapshot.geometry.elements.filter((element) => element.visible);
  const byReviewId = new Map(snapshot.geometry.elements.map((element) => [element.reviewId, element]));
  const editorMode = snapshot.selfReview.editorMode === "format-review" ? "format-review" : snapshot.selfReview.editorMode === "preview" ? "preview" : "edit";

  for (const id of ["shell", editorMode === "format-review" ? "format-review" : editorMode === "preview" ? "table-preview" : "table-grid"]) {
    const element = byReviewId.get(id);
    checks.push({
      id: `required-visible-${id}`,
      severity: "error",
      passed: Boolean(element?.visible && element.rect.width > 0 && element.rect.height > 0),
      summary: `${id} must be visible and non-empty.`
    });
  }

  const shell = byReviewId.get("shell");
  checks.push({
    id: "shell-no-horizontal-overflow",
    severity: "error",
    passed: !shell || shell.scrollWidth <= shell.clientWidth + 2,
    summary: "The webview shell must not create page-level horizontal overflow.",
    ...(shell && shell.scrollWidth > shell.clientWidth + 2 ? { evidence: `scrollWidth=${shell.scrollWidth}, clientWidth=${shell.clientWidth}` } : {})
  });

  if (editorMode === "preview" || editorMode === "format-review") {
    const visibleSourceActions = visibleElements
      .map((element) => element.action)
      .filter((action): action is string => Boolean(action && STRUCTURED_SOURCE_ACTIONS.has(action)));
    checks.push({
      id: `${editorMode}-hides-source-actions`,
      severity: "error",
      passed: visibleSourceActions.length === 0,
      summary: "Readonly review modes must not expose structured source-changing actions.",
      ...(visibleSourceActions.length > 0 ? { evidence: visibleSourceActions.join(", ") } : {})
    });
  }

  if (snapshot.selfReview.inspectorOpen) {
    const inspector = byReviewId.get("cell-inspector");
    checks.push({
      id: "inspector-visible-when-open",
      severity: "error",
      passed: Boolean(inspector?.visible && inspector.rect.width > 0 && inspector.rect.width < snapshot.geometry.viewport.width * 0.9),
      summary: "Cell inspector must be visible without covering almost the whole viewport."
    });
  }

  for (const element of visibleElements) {
    if (element.rect.width <= 0 || element.rect.height <= 0) {
      checks.push({
        id: `nonzero-${element.reviewId}`,
        severity: "error",
        passed: false,
        summary: `Visible element ${element.reviewId} has zero size.`
      });
    }
    if (isOutsideViewport(element, snapshot.geometry.viewport)) {
      checks.push({
        id: `viewport-${element.reviewId}`,
        severity: "warning",
        passed: false,
        summary: `Visible element ${element.reviewId} is outside the viewport.`
      });
    }
    if (isClippingCandidate(element) && (element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2)) {
      checks.push({
        id: `clipping-${element.reviewId}`,
        severity: "error",
        passed: false,
        summary: `Text or content may be clipped in ${element.reviewId}.`
      });
    }
  }

  for (const relationship of snapshot.geometry.relationships) {
    const limit = relationship.type === "popup-anchor" ? 96 : 48;
    checks.push({
      id: `${relationship.type}-${relationship.sourceReviewId}-${relationship.targetReviewId}`,
      severity: "error",
      passed: relationship.distance <= limit,
      summary: `${relationship.type} distance must stay near its anchor.`
    });
  }

  if (snapshot.selfReview.mode === "fallback") {
    const structuredActions = visibleElements
      .map((element) => element.action)
      .filter((action): action is string => Boolean(action && STRUCTURED_SOURCE_ACTIONS.has(action)));
    checks.push({
      id: "fallback-hides-structured-actions",
      severity: "error",
      passed: structuredActions.length === 0,
      summary: "Fallback mode must not expose structured source-changing actions.",
      ...(structuredActions.length > 0 ? { evidence: structuredActions.join(", ") } : {})
    });
  }

  return checks;
}

export function resultForUiReviewChecks(checks: UiReviewCheck[]): UiReviewResult {
  if (checks.some((check) => !check.passed && check.severity === "error")) {
    return "needs-fix";
  }
  if (checks.some((check) => !check.passed && check.severity === "warning")) {
    return "human-review";
  }
  return "pass";
}

export function createUiReviewReport(
  scenarioResults: UiReviewScenarioResult[],
  artifactPaths: Record<string, string>
): UiReviewReport {
  const findings = scenarioResults.flatMap((scenario) =>
    scenario.checks
      .filter((check) => !check.passed)
      .map((check) => ({
        ...check,
        id: `${scenario.id}:${check.id}`
      }))
  );
  const result = scenarioResults.some((scenario) => scenario.result === "needs-fix")
    ? "needs-fix"
    : scenarioResults.some((scenario) => scenario.result === "human-review")
      ? "human-review"
      : "pass";

  return {
    result,
    scenarioResults,
    findings,
    humanReviewNeeded: [
      "Animation smoothness",
      "Hover timing",
      "Native popup behavior",
      "Long-session editing comfort"
    ],
    artifactPaths
  };
}

export function createUiReviewSnapshotFromWebviewModel(
  model: WebviewAppModel,
  reason: string,
  options: UiReviewSnapshotOptions = {}
): UiReviewSnapshot {
  const editorMode = options.editorMode === "format-review" && model.formatReview !== undefined ? "format-review" : options.editorMode === "preview" ? "preview" : "edit";
  const viewport = { width: 1200, height: 800 };
  const gridWidth = Math.max(320, Math.min(900, model.columnCount * 128));
  const gridHeight = Math.max(160, Math.min(560, model.rowCount * 42 + 40));
  const elements: UiReviewElement[] = [
    element("shell", "MAIN", "region", "AsciiDoc Table Editor", 0, 0, viewport.width, viewport.height),
    element("table-grid", "DIV", "grid", "AsciiDoc table grid", 12, 52, gridWidth, gridHeight, {
      visible: editorMode === "edit"
    }),
    element("cell-editor-bar", "SECTION", "region", "Edit content", 12, Math.min(660, 52 + gridHeight + 12), gridWidth, 104, {
      visible: editorMode === "edit" && model.mode === "table-grid"
    }),
    element("diagnostics", "FOOTER", "status", "Diagnostics", 12, 52 + gridHeight + 124, gridWidth, 40),
    ...model.cells
      .flat()
      .filter((cell) => cell !== undefined)
      .slice(0, 30)
      .map((cell, index) => {
        const row = cell.row;
        const col = cell.col;
        const width = cell.kind === "origin" ? Math.max(96, cell.colSpan * 128) : 128;
        const height = cell.kind === "origin" ? Math.max(34, cell.rowSpan * 42) : 42;
        return element(
          `cell-${index}`,
          "DIV",
          "gridcell",
          cell.kind === "origin" ? cell.contentRaw.trim() : "covered",
          12 + col * 128,
          52 + row * 42,
          width,
          height,
          {
            visible: editorMode === "edit",
            disabled: cell.kind === "covered" || (cell.kind === "origin" && !cell.editable)
          }
        );
      })
  ];

  if (model.mode === "table-grid") {
    elements.push(element("merge-button", "BUTTON", "button", "Merge cells", 12, 12, 120, 30, {
      action: "merge-cells",
      visible: editorMode === "edit"
    }));
    elements.push(element("table-preview", "DIV", "region", "Table preview", 28, 52, Math.min(1040, viewport.width - 56), 620, {
      visible: editorMode === "preview"
    }));
    elements.push(element("format-review", "SECTION", "region", "Format Review", 28, 52, Math.min(1040, viewport.width - 56), 620, {
      visible: editorMode === "format-review"
    }));
  }

  return {
    capturedAt: new Date().toISOString(),
    reason,
    selfReview: {
      mode: model.mode === "fallback" ? "fallback" : "structured",
      editorMode,
      layout: "horizontal",
      inspectorOpen: false,
      rowCount: model.rowCount,
      columnCount: model.columnCount,
      diagnosticCount: model.diagnostics.length
    },
    geometry: {
      viewport,
      elements,
      relationships: []
    }
  };
}

function element(
  reviewId: string,
  tagName: string,
  role: string,
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
  overrides: Partial<UiReviewElement> = {}
): UiReviewElement {
  return {
    reviewId,
    tagName,
    role,
    label,
    visible: true,
    disabled: false,
    rect: { x, y, width, height, top: y, right: x + width, bottom: y + height, left: x },
    scrollWidth: width,
    scrollHeight: height,
    clientWidth: width,
    clientHeight: height,
    ...overrides
  };
}

function isClippingCandidate(element: UiReviewElement): boolean {
  return ["BUTTON", "INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) || element.role === "button";
}

function isOutsideViewport(element: UiReviewElement, viewport: UiReviewGeometry["viewport"]): boolean {
  return element.rect.right < -1 ||
    element.rect.bottom < -1 ||
    element.rect.left > viewport.width + 1 ||
    element.rect.top > viewport.height + 1;
}
