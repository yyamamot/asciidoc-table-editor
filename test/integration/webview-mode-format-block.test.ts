import { describe, expect, it } from "vitest";
import { applyWebviewMessage, createHarness } from "./webview-harness";

describe("webview mode format and block interactions", () => {
  it("drives undo and redo shortcuts through DOM events", async () => {
    const harness = await createHarness("|===\n| A | B\n|===\n");

    harness.keydown("z", { metaKey: true });
    expect(harness.lastMessage("request-undo")).toMatchObject({ type: "request-undo", selectedSourceCellId: "cell:0:0" });

    harness.keydown("z", { metaKey: true, shiftKey: true });
    expect(harness.lastMessage("request-redo")).toMatchObject({ type: "request-redo", selectedSourceCellId: "cell:0:0" });
  });

  it("toggles between edit and preview mode without sending edit messages", async () => {
    const harness = await createHarness("|===\n| A | B\n|===\n");

    harness.modeButton("preview").click();
    expect(harness.editorView("preview").hidden).toBe(false);
    expect(harness.editorView("edit").hidden).toBe(true);
    expect(harness.previewScreen().hidden).toBe(false);
    expect(harness.previewPane().innerHTML).toContain("<table");
    expect(harness.button("merge-cells").hidden).toBe(true);

    const messageCount = harness.messages.length;
    harness.button("merge-cells").click();
    harness.keydown("Delete");
    harness.openContextMenu("cell:0:0");
    expect(harness.contextMenu().classList.contains("is-open")).toBe(false);
    expect(harness.messages).toHaveLength(messageCount);

    harness.modeButton("edit").click();
    expect(harness.editorView("preview").hidden).toBe(true);
    expect(harness.editorView("edit").hidden).toBe(false);
    expect(harness.button("merge-cells").hidden).toBe(false);
  });

  it("posts apply format from the format review view and returns to edit on cancel", async () => {
    const harness = await createHarness("|===\n| A | B\n|===\n", undefined, undefined, {
      formatReview: {
        before: "|===\n| A | B\n|===\n",
        selectedMode: "table-layout",
        variants: [{
          mode: "table-layout",
          label: "Table layout",
          after: "|===\n| A | B\n|===\n",
          changedLineCount: 1,
          formattedRowCount: 1,
          preservedRowCount: 0,
          diagnostics: []
        }, {
          mode: "cell-per-line",
          label: "Cell-per-line",
          after: "[cols=2*]\n|===\n| A\n| B\n|===\n",
          changedLineCount: 4,
          formattedRowCount: 1,
          preservedRowCount: 0,
          diagnostics: []
        }]
      }
    });

    expect(harness.window.document.querySelector("[data-review-target='format-review']")?.hasAttribute("hidden")).toBe(false);
    const formatReview = harness.window.document.querySelector("[data-review-target='format-review']") as HTMLElement | null;
    const beforePane = harness.window.document.querySelector("[data-format-review-before]") as HTMLElement | null;
    const afterPane = harness.window.document.querySelector("[data-format-review-after]:not([hidden])") as HTMLElement | null;
    expect(formatReview).not.toBeNull();
    expect(beforePane).not.toBeNull();
    expect(afterPane).not.toBeNull();
    beforePane!.scrollTop = 12;
    afterPane!.scrollLeft = 8;
    expect(beforePane!.scrollTop).toBe(12);
    expect(afterPane!.scrollLeft).toBe(8);
    expect(harness.button("apply-format-table").hidden).toBe(false);
    expect(harness.button("cancel-format-table").hidden).toBe(false);
    (harness.window.document.querySelector("[data-action='select-format-mode'][data-format-mode='cell-per-line']") as HTMLButtonElement | null)?.click();
    harness.button("apply-format-table").click();
    expect(harness.lastMessage("apply-format-table")).toMatchObject({ type: "apply-format-table", mode: "cell-per-line" });

    harness.button("cancel-format-table").click();
    expect(harness.editorView("edit").hidden).toBe(false);
  });

  it("opens format review from the editor toolbar", async () => {
    const harness = await createHarness("|===\n| A | B\n|===\n");

    harness.button("format-table").click();

    expect(harness.lastMessage("request-format-table")).toMatchObject({
      type: "request-format-table",
      selectedSourceCellId: "cell:0:0"
    });
  });

  it("initializes with the browser host adapter when VS Code API is unavailable", async () => {
    const harness = await createHarness("|===\n| A | B\n|===\n", undefined, "<table><tbody><tr><td>preview</td></tr></tbody></table>", {
      exposeVsCodeApi: false
    });

    harness.modeButton("preview").click();
    expect(harness.editorView("preview").hidden).toBe(false);
    expect(harness.window.localStorage.getItem("asciidoc-table-editor:webview-state")).toContain("preview");

    harness.modeButton("edit").click();
    harness.cell("cell:0:0").focus();
    harness.keydown("z", { metaKey: true });
    expect(harness.lastMessage("request-undo")).toMatchObject({
      type: "request-undo",
      selectedSourceCellId: "cell:0:0"
    });
  });

  it("shows rendered block content in the full-screen table preview", async () => {
    const harness = await createHarness("|===\na| * item\n* detail\n| plain\n|===\n", undefined, "<table><tbody><tr><td><ul><li>item</li><li>detail</li></ul></td></tr></tbody></table>");

    harness.modeButton("preview").click();

    expect(harness.previewScreen().hidden).toBe(false);
    expect(harness.previewPane().innerHTML).toContain("<ul>");
    expect(harness.previewPane().innerHTML).toContain("<li>detail</li>");
  });

  it("shows row and column edit failures returned from the extension", async () => {
    const harness = await createHarness("|===\n2+| A\n| B | C\n|===\n");
    harness.openContextMenu("cell:0:0");
    harness.menuItem("delete-row").click();
    const request = harness.lastMessage("request-delete-row") as unknown as { operationId: string; revisionToken: string };

    harness.dispatchExtensionMessage({
      type: "row-column-edit-result",
      operationId: request.operationId,
      revisionToken: request.revisionToken,
      documentVersion: 1,
      result: {
        ok: false,
        diagnostics: [{
          code: "writeback.unsafe-structure-cell",
          severity: "error",
          message: "Cell cell:0:0 prevents source-safe row or column edits"
        }]
      }
    });

    expect(harness.diagnosticsText()).toContain("Row/column edit failed");
    expect(harness.diagnosticsText()).toContain("writeback.unsafe-structure-cell");
  });

  it("edits block cell raw source from the bottom editor without leaving the webview", async () => {
    const source = "|===\na| * item\n* detail\n| plain\n|===\n";
    const harness = await createHarness(source);
    const gridBefore = harness.grid();
    const blockCell = harness.cell("cell:0:0");

    const blockEditor = harness.textarea("contentRaw");
    const blockApplyButton = harness.button("update-block-cell-source");
    expect(blockEditor.value).toBe("* item\n* detail");
    expect(harness.blockPreview().innerHTML).toContain("<ul>");
    expect(blockEditor.disabled).toBe(false);
    expect(blockApplyButton.disabled).toBe(false);

    blockEditor.value = "* updated\n* next";
    blockApplyButton.click();
    const message = harness.lastMessage("update-block-cell-source");
    expect(message).toMatchObject({
      sourceCellId: "cell:0:0",
      contentRaw: " * updated\n* next",
      selectedSourceCellId: "cell:0:0"
    });
    expect(applyWebviewMessage(source, message)).toMatchObject({
      ok: true,
      source: "|===\na| * updated\n* next\n| plain\n|===\n"
    });
    harness.dispatchExtensionMessage({
      type: "block-cell-update-result",
      operationId: message.operationId,
      revisionToken: "revision-after-block-update",
      documentVersion: 2,
      result: { ok: true, diagnostics: [] },
    });
    expect(harness.grid()).toBe(gridBefore);
    expect(harness.cell("cell:0:0")).toBe(blockCell);
    expect(blockCell.dataset.editContent).toBe("* item\n* detail");

    const applied = applyWebviewMessage(source, message);
    expect(applied.ok).toBe(true);
    const refreshed = await createHarness(
      applied.source,
      message.selectedSourceCellId,
      "<table><tbody><tr><td><ul><li>updated</li><li>next</li></ul></td></tr></tbody></table>",
      { revisionToken: "revision-after-block-update" }
    );
    expect(refreshed.cell("cell:0:0").dataset.editContent).toBe("* updated\n* next");
    expect(refreshed.textarea("contentRaw").value).toBe("* updated\n* next");
    refreshed.modeButton("preview").click();
    expect(refreshed.previewPane().innerHTML).toContain("updated");

    refreshed.cell("cell:1:0").focus();
    expect(refreshed.button("update-cell-content").disabled).toBe(false);
  });

  it("shows block cell update failures returned from the extension", async () => {
    const harness = await createHarness("|===\na| * item\n|===\n");
    harness.cell("cell:0:0").focus();
    harness.textarea("contentRaw").value = "* draft";
    harness.button("update-block-cell-source").click();
    const request = harness.lastMessage("update-block-cell-source");

    harness.dispatchExtensionMessage({
      type: "block-cell-update-result",
      operationId: request.operationId,
      revisionToken: request.revisionToken,
      documentVersion: 1,
      result: {
        ok: false,
        diagnostics: [{
          code: "writeback.not-block-cell",
          severity: "error",
          message: "Cell cell:0:0 is not a block cell"
        }]
      }
    });

    expect(harness.diagnosticsText()).toContain("Block cell update failed");
    expect(harness.diagnosticsText()).toContain("writeback.not-block-cell");
  });
});
