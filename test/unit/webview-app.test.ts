import { describe, expect, it } from "vitest";
import { createWebviewAppModel, displayContentForGridCell, renderTableEditorHtml } from "../../src/app";
import { parseAsciiDocTable, projectGridModel } from "../../src/core";
import { createUiReviewSnapshotFromWebviewModel } from "../../src/harness";

describe("webview table editor shell", () => {
  it("creates compact grid display text for AsciiDoc links", () => {
    expect(displayContentForGridCell("https://example.com[Example]")).toBe("Example");
    expect(displayContentForGridCell("https://example.com")).toBe("https://example.com");
    expect(displayContentForGridCell("prefix https://example.com[Example] suffix")).toBe("prefix Example suffix");
    expect(displayContentForGridCell("mailto:user@example.com[Mail]")).toBe("Mail");
    expect(displayContentForGridCell("https://example.com[broken")).toBe("https://example.com[broken");
  });

  it("renders grid cells and UI self-review metadata", () => {
    const grid = projectGridModel(parseAsciiDocTable("|===\n2+| A\n| B | C\n|===\n"));
    const model = createWebviewAppModel(grid, {
      preview: {
        tableHtml: "<table><tbody><tr><td>A</td></tr></tbody></table>",
        blockCellHtmlBySourceCellId: {}
      }
    });
    const html = renderTableEditorHtml(model, "testNonce");

    expect(model.mode).toBe("table-grid");
    expect(html).toContain('data-review-target="table-grid"');
    expect(html).toContain('aria-rowcount="2"');
    expect(html).toContain('aria-colcount="2"');
    expect(html).toContain("[hidden] {");
    expect(html).toContain("display: none !important;");
    expect(html).toContain("height: 100vh;");
    expect(html).toContain(".grid-wrap {\n  box-sizing: border-box;\n  height: 100%;\n  overflow: auto;");
    expect(html).toContain('id="llm-ui-self-review"');
    expect(html).toContain('data-kind="origin"');
    expect(html).toContain('data-row-role="body"');
    expect(html).toContain('data-spanned="true"');
    expect(html).toContain('aria-rowspan="1"');
    expect(html).toContain('aria-colspan="2"');
    expect(html).not.toContain('data-kind="covered"');
    expect(html).toContain('data-review-target="cell-inspector"');
    expect(html).toContain('data-review-target="cell-editor-bar"');
    expect(html).toContain('data-cell-editor-control="contentRaw"');
    expect(html).toContain('data-cell-editor-field="sourceCellId"');
    expect(html).toContain("Selected Cell");
    expect(html).toContain('data-action="undo-table-edit"');
    expect(html).toContain('data-action="redo-table-edit"');
    expect(html).toContain('data-action="set-editor-mode"');
    expect(html).toContain('data-action="format-table"');
    expect(html).toContain('data-icon-name="symbol-keyword"');
    expect(html).toContain('data-editor-mode-value="preview"');
    expect(html).toContain('aria-label="Edit"');
    expect(html).toContain('aria-label="Preview"');
    expect(html).toContain('data-icon-name="edit"');
    expect(html).toContain('data-icon-name="preview"');
    expect(html).not.toContain('aria-pressed="true">Edit</button>');
    expect(html).not.toContain('aria-pressed="false">Preview</button>');
    expect(html).toContain('class="preview-screen"');
    expect(html).toContain('data-review-target="table-preview-screen"');
    expect(html).toContain('data-review-target="table-preview"');
    expect(html).toContain(".preview-screen {\n  box-sizing: border-box;\n  height: 100%;\n  overflow: auto;");
    expect(html).toContain("width: max-content;");
    expect(html).toContain("max-width: none;");
    expect(html).toContain(".preview-pane .halign-left");
    expect(html).toContain(".preview-pane .halign-center");
    expect(html).toContain(".preview-pane .halign-right");
    expect(html).toContain(".preview-pane .valign-middle");
    expect(html).toContain("<table><tbody><tr><td>A</td></tr></tbody></table>");
    expect(html).toContain(".diagnostics:empty");
    expect(html).toContain('data-review-target="diagnostics" aria-live="polite" tabindex="-1"></footer>');
    expect(html).toContain('class="toolbar-button icon-button"');
    expect(html).toContain('class="toolbar-button icon-label-button"');
    expect(html).toContain('data-icon-source="codicon"');
    expect(html).toContain('data-icon-source="inline"');
    expect(html).toContain('aria-label="Undo"');
    expect(html).toContain('data-context-menu="cell"');
    expect(html).toContain("Insert row above");
    expect(html).toContain("Insert column left");
    expect(html).toContain('data-action="insert-row-before"');
    expect(html).toContain('data-action="insert-row-after"');
    expect(html).toContain('data-action="delete-row"');
    expect(html).toContain('data-action="insert-column-before"');
    expect(html).toContain('data-action="insert-column-after"');
    expect(html).toContain('data-action="delete-column"');
    expect(html).toContain('data-action="merge-cells"');
    expect(html).toContain('data-action="unmerge-cell"');
    expect(html).toContain('data-icon-name="merge-cells"');
    expect(html).toContain('data-icon-name="unmerge-cells"');
    expect(html).toContain("<span>Merge</span>");
    expect(html).toContain("<span>Unmerge</span>");
    expect(html).toContain('data-action="update-cell-content"');
    expect(html).toContain("Block Source");
    expect(html).toContain("block-cell-update-result");
    expect(html).toContain("setBlockInspectorTab");
    expect(html).toContain("setEditorMode");
    expect(html).toContain("request-undo");
    expect(html).toContain("request-redo");
    expect(html).toContain("isCtrlUndo");
    expect(html).toContain("isCtrlYRedo");
    expect(html).toContain("beginDirectEdit");
    expect(html).toContain("commitDirectEdit");
    expect(html).toContain("nextEditableCell");
    expect(html).toContain("moveSelection");
    expect(html).toContain("is-range-selected");
    expect(html).toContain("selectedRangeCells");
    expect(html).toContain("validatePlainRange");
    expect(html).toContain("suppressNextFocusSelection");
    expect(html).toContain("focusCellWithoutSelectionReset");
    expect(html).toContain("Copied selected range.");
    expect(html).toContain("Copy blocked: range must contain only editable unmerged plain cells.");
    expect(html).toContain("clearSelectedCells");
    expect(html).toContain("selectedMergeSourceCellIds");
    expect(html).toContain("requestRowColumnEdit");
    expect(html).toContain("request-insert-row-before");
    expect(html).toContain("request-insert-row-after");
    expect(html).toContain("request-insert-column-before");
    expect(html).toContain("request-delete-column");
    expect(html).toContain('cell.addEventListener("contextmenu"');
    expect(html).toContain("openContextMenu");
    expect(html).toContain("row-column-edit-result");
    expect(html).toContain("showResultDiagnostic");
    expect(html).toContain("operationAppliedMessage");
    expect(html).toContain("operationBlockedMessage");
    expect(html).not.toContain("appliedSuffix");
    expect(html).not.toContain("blockedSuffix");
    expect(html).toContain("request-merge-cells");
    expect(html).toContain("selectedUnmergeSourceCellId");
    expect(html).toContain("request-unmerge-cell");
    expect(html).toContain("Merge blocked: target range must form a rectangle.");
    expect(html).toContain("Unmerge blocked: selected cell is not merged.");
    expect(html).toContain("Clear blocked: target range must contain only editable unmerged plain cells.");
    expect(html).toContain('event.key === "Delete"');
    expect(html).toContain("ArrowRight");
    expect(html).toContain("ArrowDown");
    expect(html).toContain("parseClipboardTable");
    expect(html).toContain("update-cell-contents");
    expect(html).toContain("Paste blocked: target range must contain only editable unmerged plain cells.");
    expect(html).toContain('document.addEventListener("copy"');
    expect(html).toContain('document.addEventListener("paste"');
    expect(html).toContain("selectedSourceCellId");
    expect(html).toContain("contenteditable");
    expect(html).toContain("bottom-cell-editor");
    expect(html).toContain("request-format-table");
    expect(html).toContain("dblclick");
    expect(html).toContain('event.key === "F2"');
    expect(html).toContain("grid-column:1 / span 2");
    expect(html).toContain("<style nonce=\"testNonce\">.cell-layout-0");
    expect(html).toContain('class="cell cell-layout-0"');
    expect(html).not.toContain('style="grid-row:');
  });

  it("renders format review with before after source and actions", () => {
    const grid = projectGridModel(parseAsciiDocTable("|===\n| A | B\n|===\n"));
    const html = renderTableEditorHtml(createWebviewAppModel(grid, {
      formatReview: {
        before: "|===\n| A | B\n|===\n",
        selectedMode: "table-layout",
        variants: [{
          mode: "table-layout",
          label: "Table layout",
          after: "|===\n| A | B |\n|===\n",
          changedLineCount: 1,
          formattedRowCount: 1,
          preservedRowCount: 0,
          diagnostics: []
        }]
      }
    }), "testNonce");

    expect(html).toContain('data-editor-view="format-review"');
    expect(html).toContain('data-review-target="format-review"');
    expect(html).toContain('data-action="apply-format-table"');
    expect(html).toContain('data-action="cancel-format-table"');
    expect(html).toContain(".format-review {\n  box-sizing: border-box;\n  display: grid;");
    expect(html).toContain(".format-review-pane pre {\n  overflow: auto;");
    expect(html).toContain("overscroll-behavior: contain;");
    expect(html).toContain("Format Review");
    expect(html).toContain("Table layout");
    expect(html).toContain("Changed lines");
    expect(html).toContain("adoc-hl-cell");
    expect(html).toContain("format-review-line is-changed");
    expect(html).not.toContain("</span>\n<span class=\"format-review-line");
    expect(html).not.toContain("<span class=\"format-review-line\"></span></pre>");
    expect(html).toContain("--adoc-hl-delimiter");
  });

  it("can render with a selected source cell restored", () => {
    const grid = projectGridModel(parseAsciiDocTable("|===\n| A | B\n|===\n"));
    const html = renderTableEditorHtml(createWebviewAppModel(grid), "testNonce", {
      selectedSourceCellId: "cell:0:1"
    });

    expect(html).toContain('data-source-cell-id="cell:0:1"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain(">B</div>");
    expect(html).toContain('const requestedInitialCell = "cell:0:1"');
  });

  it("renders header and footer row roles as stable cell metadata", () => {
    const grid = projectGridModel(parseAsciiDocTable("[options=\"header,footer\",cols=2*]\n|===\n| Name | Value\n\n| A | 1\n\n| Total | 1\n|===\n"));
    const html = renderTableEditorHtml(createWebviewAppModel(grid), "testNonce");

    expect(html).toContain('data-row-role="header"');
    expect(html).toContain('data-row-role="body"');
    expect(html).toContain('data-row-role="footer"');
    expect(html).toContain('.cell[data-row-role="header"]');
    expect(html).toContain('.cell[data-row-role="footer"]');
    expect(html).toContain("box-shadow: inset 0 -1px 0");
  });

  it("renders cell alignment metadata for interaction and review hooks", () => {
    const grid = projectGridModel(parseAsciiDocTable("|===\n^.^a| Rich\n|===\n"));
    const html = renderTableEditorHtml(createWebviewAppModel(grid), "testNonce");

    expect(html).toContain('data-style="a"');
    expect(html).toContain('data-horizontal-align="center"');
    expect(html).toContain('data-vertical-align="middle"');
    expect(html).toContain('.cell[data-style="m"]');
    expect(html).toContain('.cell[data-style="s"]');
    expect(html).toContain('.cell[data-style="e"]');
    expect(html).toContain('.cell[data-horizontal-align="right"]');
  });

  it("renders covered cells through the origin span without visible covered cell chrome", () => {
    const grid = projectGridModel(parseAsciiDocTable("|===\n2+| A\n| B | C\n|===\n"));
    const html = renderTableEditorHtml(createWebviewAppModel(grid), "testNonce");

    expect(html).toContain('data-spanned="true"');
    expect(html).toContain("grid-column:1 / span 2");
    expect(html).not.toContain('data-covered-by="grid:cell:0:0"');
    expect(html).not.toContain('tabindex="0" data-kind="covered"');
  });

  it("enters fallback mode when grid has error diagnostics", () => {
    const grid = projectGridModel(parseAsciiDocTable("|===\n.3+| A | B\n| C\n|===\n"));
    const model = createWebviewAppModel(grid);
    const html = renderTableEditorHtml(model, "testNonce");

    expect(model.mode).toBe("fallback");
    expect(html).toContain('data-mode="fallback"');
    expect(html).toContain("grid.span-overflow");
    expect(html).toContain('data-review-target="fallback-guidance"');
    expect(html).toContain("Structured editing is disabled for this table.");
    expect(html).toContain('data-action="focus-diagnostics"');
    expect(html).not.toContain('data-action="update-cell-content"');
    expect(html).not.toContain('data-review-target="cell-editor-bar"');
    expect(html).not.toContain('data-action="update-block-cell-source"');
    expect(html).not.toContain('data-review-target="table-preview"');
    expect(html).not.toContain('data-context-menu="cell"');
    expect(html).not.toContain('data-action="insert-row-after"');
    expect(html).not.toContain('data-action="delete-column"');
    expect(html).not.toContain('data-action="merge-cells"');
    expect(html).not.toContain('data-action="unmerge-cell"');
    expect(html).toContain('data-action="undo-table-edit"');
    expect(html).toContain('data-action="redo-table-edit"');
  });

  it("creates UI review geometry from the webview model", () => {
    const model = createWebviewAppModel(projectGridModel(parseAsciiDocTable("|===\n| A | B\n|===\n")));
    const snapshot = createUiReviewSnapshotFromWebviewModel(model, "unit-test");

    expect(snapshot.selfReview).toMatchObject({
      mode: "structured",
      rowCount: 1,
      columnCount: 2
    });
    expect(snapshot.geometry.elements.map((element) => element.reviewId)).toContain("table-grid");
    expect(snapshot.geometry.elements.map((element) => element.reviewId)).toContain("table-preview");
    expect(snapshot.geometry.elements.some((element) => element.reviewId.startsWith("cell-"))).toBe(true);
  });

  it("creates preview-mode UI review geometry from the webview model", () => {
    const model = createWebviewAppModel(projectGridModel(parseAsciiDocTable("|===\n| A | B\n|===\n")));
    const snapshot = createUiReviewSnapshotFromWebviewModel(model, "unit-test", { editorMode: "preview" });
    const byId = new Map(snapshot.geometry.elements.map((element) => [element.reviewId, element]));

    expect(snapshot.selfReview.editorMode).toBe("preview");
    expect(byId.get("table-preview")?.visible).toBe(true);
    expect(byId.get("table-grid")?.visible).toBe(false);
    expect(byId.get("merge-button")?.visible).toBe(false);
  });

  it("renders block cells as readonly with bottom block source editing and inspector preview", () => {
    const grid = projectGridModel(parseAsciiDocTable("|===\na| * item\n* detail\n|===\n"));
    const html = renderTableEditorHtml(createWebviewAppModel(grid, {
      preview: {
        tableHtml: "<table></table>",
        blockCellHtmlBySourceCellId: { "cell:0:0": "<ul><li>item</li><li>detail</li></ul>" }
      }
    }), "testNonce");

    expect(html).toContain('data-block="true"');
    expect(html).toContain('class="cell-badge cell-badge-block"');
    expect(html).toContain('&lt;/&gt;');
    expect(html).toContain('aria-readonly="true"');
    expect(html).toContain('data-edit-content="* item\n* detail"');
    expect(html).toContain('data-inspector-control="contentRaw"');
    expect(html).toContain('data-action="update-block-cell-source"');
    expect(html).toContain("Apply Block Source");
    expect(html).toContain("* item\n* detail");
    expect(html).toContain('data-inspector-block-preview');
    expect(html).toContain("<ul><li>item</li><li>detail</li></ul>");
    expect(html).not.toContain('data-inspector-control="blockContentRaw"');
    expect(html).not.toContain('data-action="set-block-inspector-tab"');
    expect(html).toContain('data-inspector-action="edit-cell" hidden');
  });
});
