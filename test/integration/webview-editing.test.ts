import { describe, expect, it } from "vitest";
import { applyWebviewMessage, createHarness } from "./webview-harness";

describe("webview editing interactions", () => {
  it("drives direct edit through the real webview script and applies the message to source", async () => {
    const source = "|===\n| A | B\n|===\n";
    const harness = await createHarness(source);
    const first = harness.cell("cell:0:0");

    first.dispatchEvent(new harness.window.MouseEvent("dblclick", { bubbles: true }) as unknown as Event);
    first.textContent = "Alpha";
    harness.keydown("Enter");

    const message = harness.lastMessage("update-cell-content");
    expect(message).toMatchObject({
      sourceCellId: "cell:0:0",
      contentRaw: " Alpha"
    });
    expect(applyWebviewMessage(source, message)).toMatchObject({
      ok: true,
      source: "|===\n| Alpha | B\n|===\n"
    });
  });

  it("edits the selected plain cell from the bottom cell editor bar", async () => {
    const source = "|===\n| A | B\n|===\n";
    const harness = await createHarness(source);
    const second = harness.cell("cell:0:1");

    second.focus();
    const editor = harness.textarea("contentRaw");
    expect(editor.value).toBe("B");
    editor.value = "Beta";
    harness.button("update-cell-content").click();

    const message = harness.lastMessage("update-cell-content");
    expect(message).toMatchObject({
      sourceCellId: "cell:0:1",
      contentRaw: " Beta",
      selectedSourceCellId: "cell:0:1"
    });
    expect(applyWebviewMessage(source, message)).toMatchObject({
      ok: true,
      source: "|===\n| A | Beta\n|===\n"
    });
  });

  it("edits a merged origin cell from the bottom cell editor bar", async () => {
    const source = "|===\n.2+| Vertical merge | A\n| B\n|===\n";
    const harness = await createHarness(source);
    const merged = harness.cell("cell:0:0");

    merged.focus();
    expect(merged.getAttribute("aria-readonly")).toBe("false");
    const editor = harness.textarea("contentRaw");
    expect(editor.disabled).toBe(false);
    expect(editor.value).toBe("Vertical merge");
    editor.value = "Vertical label";
    harness.button("update-cell-content").click();

    const message = harness.lastMessage("update-cell-content");
    expect(message).toMatchObject({
      sourceCellId: "cell:0:0",
      contentRaw: " Vertical label",
      selectedSourceCellId: "cell:0:0"
    });
    expect(applyWebviewMessage(source, message)).toMatchObject({
      ok: true,
      source: "|===\n.2+| Vertical label | A\n| B\n|===\n"
    });
  });

  it("applies successful single-cell updates without replacing the webview grid", async () => {
    const harness = await createHarness("|===\n| A | B\n|===\n");
    const second = harness.cell("cell:0:1");
    const gridBefore = harness.grid();

    second.focus();
    const editor = harness.textarea("contentRaw");
    editor.value = "https://example.com[Example]";
    harness.button("update-cell-content").click();

    harness.dispatchExtensionMessage({
      type: "cell-content-update-result",
      result: { ok: true, diagnostics: [] },
      applied: {
        sourceCellId: "cell:0:1",
        contentRaw: " https://example.com[Example]",
        selectedSourceCellId: "cell:0:1",
        tablePreviewHtml: "<table><tbody><tr><td>Example</td></tr></tbody></table>"
      }
    });

    expect(harness.grid()).toBe(gridBefore);
    expect(harness.cell("cell:0:1")).toBe(second);
    expect(second.textContent).toBe("Example");
    expect(second.dataset.editContent).toBe("https://example.com[Example]");
    expect(editor.value).toBe("https://example.com[Example]");
    harness.modeButton("preview").click();
    expect(harness.previewPane().innerHTML).toContain("Example");
  });

  it("supports Cmd/Ctrl+Enter apply and Escape reset in the bottom cell editor bar", async () => {
    const source = "|===\n| A | B\n|===\n";
    const harness = await createHarness(source);

    harness.cell("cell:0:0").focus();
    const editor = harness.textarea("contentRaw");
    editor.focus();
    editor.value = "Draft";
    editor.dispatchEvent(new harness.window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }) as unknown as Event);
    expect(editor.value).toBe("A");
    expect(editor.disabled).toBe(false);
    expect(harness.button("update-cell-content").disabled).toBe(false);

    editor.value = "Alpha";
    const applyEvent = new harness.window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter", code: "Enter", ctrlKey: true });
    editor.dispatchEvent(applyEvent as unknown as Event);
    expect(harness.lastMessage("update-cell-content")).toMatchObject({
      sourceCellId: "cell:0:0",
      contentRaw: " Alpha"
    });
  });

  it("does not start cell editing while typing in table settings controls", async () => {
    const harness = await createHarness("|===\n| A | B\n|===\n");
    const titleInput = harness.window.document.querySelector("[data-table-setting='title']") as HTMLInputElement | null;

    expect(titleInput).not.toBeNull();
    titleInput?.focus();
    titleInput!.value = "Draft title";
    titleInput?.dispatchEvent(new harness.window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "D" }) as unknown as Event);
    titleInput?.dispatchEvent(new harness.window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "ArrowRight" }) as unknown as Event);

    expect(harness.messages.filter((message) => message.type === "update-cell-content")).toEqual([]);
    expect(harness.cell("cell:0:0").getAttribute("contenteditable")).toBeNull();
    expect(titleInput?.value).toBe("Draft title");
  });

  it("drives Shift+Arrow range selection, copy, paste, and clear through DOM events", async () => {
    const source = "|===\n| A | B\n| C | D\n|===\n";
    const harness = await createHarness(source);

    harness.cell("cell:0:0").focus();
    harness.keydown("ArrowRight", { shiftKey: true });
    expect(harness.selectedRangeIds()).toEqual(["cell:0:0", "cell:0:1"]);

    const copyData = harness.copy();
    expect(copyData["text/plain"]).toBe("A\tB");

    harness.cell("cell:1:0").focus();
    harness.paste("X\tY");
    const pasteMessage = harness.lastMessage("update-cell-contents");
    expect(pasteMessage).toMatchObject({
      replacements: [
        { sourceCellId: "cell:1:0", contentRaw: " X" },
        { sourceCellId: "cell:1:1", contentRaw: " Y" }
      ],
      selectedSourceCellId: "cell:1:1"
    });
    expect(applyWebviewMessage(source, pasteMessage)).toMatchObject({
      ok: true,
      source: "|===\n| A | B\n| X | Y\n|===\n"
    });

    harness.keydown("ArrowRight", { shiftKey: true });
    harness.keydown("Delete");
    const clearMessage = harness.lastMessage("update-cell-contents");
    expect(clearMessage).toMatchObject({
      replacements: [
        { sourceCellId: "cell:1:0", contentRaw: " " },
        { sourceCellId: "cell:1:1", contentRaw: " " }
      ]
    });
  });

  it("keeps single click as single selection after mouse range selection", async () => {
    const source = "|===\n| A | B\n| C | D\n|===\n";
    const harness = await createHarness(source);

    harness.cell("cell:0:0").dispatchEvent(new harness.window.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, buttons: 1 }) as unknown as Event);
    harness.cell("cell:0:1").dispatchEvent(new harness.window.MouseEvent("mouseenter", { bubbles: true, cancelable: true, button: 0, buttons: 1 }) as unknown as Event);
    (harness.window.document as unknown as { dispatchEvent(event: unknown): boolean }).dispatchEvent(new harness.window.MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0, buttons: 0 }) as unknown as Event);
    harness.cell("cell:0:1").dispatchEvent(new harness.window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }) as unknown as Event);
    expect(harness.selectedRangeIds()).toEqual(["cell:0:0", "cell:0:1"]);

    harness.cell("cell:1:0").dispatchEvent(new harness.window.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, buttons: 1 }) as unknown as Event);
    harness.cell("cell:1:0").dispatchEvent(new harness.window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }) as unknown as Event);
    expect(harness.selectedRangeIds()).toEqual([]);
    expect(harness.copy()["text/plain"]).toBe("C");
  });

  it("copies TSV from a mouse drag selected range", async () => {
    const source = "|===\n| A | B\n| C | D\n|===\n";
    const harness = await createHarness(source);

    harness.cell("cell:0:0").dispatchEvent(new harness.window.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, buttons: 1 }) as unknown as Event);
    harness.cell("cell:1:1").dispatchEvent(new harness.window.MouseEvent("mouseenter", { bubbles: true, cancelable: true, button: 0, buttons: 1 }) as unknown as Event);
    (harness.window.document as unknown as { dispatchEvent(event: unknown): boolean }).dispatchEvent(new harness.window.MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0, buttons: 0 }) as unknown as Event);
    harness.cell("cell:1:1").dispatchEvent(new harness.window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }) as unknown as Event);

    expect(harness.selectedRangeIds()).toEqual(["cell:0:0", "cell:0:1", "cell:1:0", "cell:1:1"]);
    expect(harness.copy()["text/plain"]).toBe("A\tB\nC\tD");
  });
});
