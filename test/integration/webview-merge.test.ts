import { describe, expect, it } from "vitest";
import { applyWebviewMessage, createHarness } from "./webview-harness";

describe("webview merge interactions", () => {
  it("drives toolbar merge and unmerge button clicks through the real webview script", async () => {
    const mergeSource = "|===\n| A |  | \n|===\n";
    const mergeHarness = await createHarness(mergeSource);

    mergeHarness.cell("cell:0:1").focus();
    mergeHarness.keydown("ArrowRight", { shiftKey: true });
    mergeHarness.button("merge-cells").click();

    const mergeMessage = mergeHarness.lastMessage("request-merge-cells");
    expect(mergeMessage).toMatchObject({
      sourceCellIds: ["cell:0:1", "cell:0:2"],
      selectedSourceCellId: "cell:0:1"
    });
    expect(applyWebviewMessage(mergeSource, mergeMessage)).toMatchObject({
      ok: true,
      source: "|===\n| A 2+| \n|===\n"
    });

    const unmergeSource = "|===\n| A 2+| \n|===\n";
    const unmergeHarness = await createHarness(unmergeSource, "cell:0:1");
    unmergeHarness.button("unmerge-cell").click();

    const unmergeMessage = unmergeHarness.lastMessage("request-unmerge-cell");
    expect(unmergeMessage).toMatchObject({
      sourceCellId: "cell:0:1",
      selectedSourceCellId: "cell:0:1"
    });
    expect(applyWebviewMessage(unmergeSource, unmergeMessage)).toMatchObject({
      ok: true,
      source: "|===\n| A |  | \n|===\n"
    });
  });

  it("merges a non-empty selected range by keeping only the top-left content", async () => {
    const source = "|===\n| A | B\n|===\n";
    const harness = await createHarness(source);

    harness.cell("cell:0:0").focus();
    harness.keydown("ArrowRight", { shiftKey: true });
    expect(harness.selectedRangeIds()).toEqual(["cell:0:0", "cell:0:1"]);
    harness.button("merge-cells").click();

    const mergeMessage = harness.lastMessage("request-merge-cells");
    expect(mergeMessage).toMatchObject({
      sourceCellIds: ["cell:0:0", "cell:0:1"],
      selectedSourceCellId: "cell:0:0"
    });
    expect(applyWebviewMessage(source, mergeMessage)).toMatchObject({
      ok: true,
      source: "|===\n2+| A\n|===\n"
    });
  });

  it("selects cells by mouse drag and merges the selected range", async () => {
    const source = "|===\n| A | B\n|===\n";
    const harness = await createHarness(source);
    const start = harness.cell("cell:0:0");
    const end = harness.cell("cell:0:1");

    start.dispatchEvent(new harness.window.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, buttons: 1 }) as unknown as Event);
    end.dispatchEvent(new harness.window.MouseEvent("mouseenter", { bubbles: true, cancelable: true, button: 0, buttons: 1 }) as unknown as Event);
    (harness.window.document as unknown as { dispatchEvent(event: unknown): boolean }).dispatchEvent(new harness.window.MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0, buttons: 0 }) as unknown as Event);
    end.dispatchEvent(new harness.window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }) as unknown as Event);

    expect(harness.selectedRangeIds()).toEqual(["cell:0:0", "cell:0:1"]);
    harness.button("merge-cells").click();

    const mergeMessage = harness.lastMessage("request-merge-cells");
    expect(mergeMessage).toMatchObject({
      sourceCellIds: ["cell:0:0", "cell:0:1"],
      selectedSourceCellId: "cell:0:0"
    });
    expect(applyWebviewMessage(source, mergeMessage)).toMatchObject({
      ok: true,
      source: "|===\n2+| A\n|===\n"
    });
  });

  it("selects a rectangular merge range by mouse drag", async () => {
    const source = "|===\n| col1 | col2 | col3\n\n| hello | world | ready\n| test | message | draft\n| next | value | done\n|===\n";
    const harness = await createHarness(source);
    const start = harness.cell("cell:1:0");
    const end = harness.cell("cell:2:1");

    start.dispatchEvent(new harness.window.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, buttons: 1 }) as unknown as Event);
    end.dispatchEvent(new harness.window.MouseEvent("mouseenter", { bubbles: true, cancelable: true, button: 0, buttons: 1 }) as unknown as Event);
    (harness.window.document as unknown as { dispatchEvent(event: unknown): boolean }).dispatchEvent(new harness.window.MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0, buttons: 0 }) as unknown as Event);
    end.dispatchEvent(new harness.window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }) as unknown as Event);

    expect(harness.selectedRangeIds()).toEqual(["cell:1:0", "cell:1:1", "cell:2:0", "cell:2:1"]);
    harness.button("merge-cells").click();

    const mergeMessage = harness.lastMessage("request-merge-cells");
    expect(mergeMessage).toMatchObject({
      sourceCellIds: ["cell:1:0", "cell:1:1", "cell:2:0", "cell:2:1"],
      selectedSourceCellId: "cell:1:0"
    });
    expect(applyWebviewMessage(source, mergeMessage)).toMatchObject({
      ok: true,
      source: "|===\n| col1 | col2 | col3\n\n2.2+| hello | ready\n| draft\n| next | value | done\n|===\n"
    });
  });

  it("merges an existing merged cell with an adjacent plain cell from the real webview script", async () => {
    const source = "|===\n2+| A | B\n|===\n";
    const harness = await createHarness(source);

    harness.cell("cell:0:0").focus();
    harness.keydown("ArrowRight", { shiftKey: true });
    harness.button("merge-cells").click();

    const mergeMessage = harness.lastMessage("request-merge-cells");
    expect(mergeMessage).toMatchObject({
      sourceCellIds: ["cell:0:0", "cell:0:1"],
      selectedSourceCellId: "cell:0:0"
    });
    expect(applyWebviewMessage(source, mergeMessage)).toMatchObject({
      ok: true,
      source: "|===\n3+| A\n|===\n"
    });
  });

  it("keeps paste and unmerge safe around visible merged cells", async () => {
    const source = "|===\n2+| Wide | Tail\n| A | B | C\n|===\n";
    const harness = await createHarness(source);

    harness.cell("cell:0:0").focus();
    harness.paste("X\tY");
    expect(harness.diagnosticsText()).toContain("Paste blocked");
    expect(harness.messages.some((message) => message.type === "update-cell-contents")).toBe(false);

    harness.button("unmerge-cell").click();
    const unmergeMessage = harness.lastMessage("request-unmerge-cell");
    expect(unmergeMessage).toMatchObject({
      sourceCellId: "cell:0:0",
      selectedSourceCellId: "cell:0:0"
    });
    expect(applyWebviewMessage(source, unmergeMessage)).toMatchObject({
      ok: true,
      source: "|===\n| Wide |  | Tail\n| A | B | C\n|===\n"
    });
  });

  it("blocks mouse drag merge when the range contains a block cell", async () => {
    const source = "|===\n| A | B\na| * item\n| D\n|===\n";
    const harness = await createHarness(source);

    harness.cell("cell:0:0").dispatchEvent(new harness.window.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, buttons: 1 }) as unknown as Event);
    harness.cell("cell:1:0").dispatchEvent(new harness.window.MouseEvent("mouseenter", { bubbles: true, cancelable: true, button: 0, buttons: 1 }) as unknown as Event);
    (harness.window.document as unknown as { dispatchEvent(event: unknown): boolean }).dispatchEvent(new harness.window.MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0, buttons: 0 }) as unknown as Event);
    harness.cell("cell:1:0").dispatchEvent(new harness.window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }) as unknown as Event);

    harness.button("merge-cells").click();

    expect(harness.messages.some((message) => message.type === "request-merge-cells")).toBe(false);
    expect(harness.diagnosticsText()).toContain("Merge blocked");
  });

  it("drives vertical and rectangular merge/unmerge from the toolbar", async () => {
    const source = "|===\n| col1 | col2 | col3\n\n| hello | world | ready\n| test | message | draft\n| next | value | done\n|===\n";
    const verticalHarness = await createHarness(source);
    verticalHarness.cell("cell:1:0").focus();
    verticalHarness.keydown("ArrowDown", { shiftKey: true });
    verticalHarness.button("merge-cells").click();
    const verticalMergeMessage = verticalHarness.lastMessage("request-merge-cells");
    expect(verticalMergeMessage).toMatchObject({
      sourceCellIds: ["cell:1:0", "cell:2:0"],
      selectedSourceCellId: "cell:1:0"
    });
    expect(applyWebviewMessage(source, verticalMergeMessage)).toMatchObject({
      ok: true,
      source: "|===\n| col1 | col2 | col3\n\n.2+| hello | world | ready\n| message | draft\n| next | value | done\n|===\n"
    });

    const rectangularHarness = await createHarness(source);
    rectangularHarness.cell("cell:1:0").focus();
    rectangularHarness.keydown("ArrowRight", { shiftKey: true });
    rectangularHarness.keydown("ArrowDown", { shiftKey: true });
    rectangularHarness.button("merge-cells").click();
    const rectangularMergeMessage = rectangularHarness.lastMessage("request-merge-cells");
    expect(rectangularMergeMessage).toMatchObject({
      sourceCellIds: ["cell:1:0", "cell:1:1", "cell:2:0", "cell:2:1"],
      selectedSourceCellId: "cell:1:0"
    });
    const rectangularMergeResult = applyWebviewMessage(source, rectangularMergeMessage);
    expect(rectangularMergeResult).toMatchObject({
      ok: true,
      source: "|===\n| col1 | col2 | col3\n\n2.2+| hello | ready\n| draft\n| next | value | done\n|===\n"
    });

    if (!rectangularMergeResult.ok) {
      throw new Error("rectangular merge failed");
    }
    const unmergeHarness = await createHarness(rectangularMergeResult.source, "cell:1:0");
    unmergeHarness.button("unmerge-cell").click();
    const rectangularUnmergeMessage = unmergeHarness.lastMessage("request-unmerge-cell");
    expect(rectangularUnmergeMessage).toMatchObject({
      sourceCellId: "cell:1:0",
      selectedSourceCellId: "cell:1:0"
    });
    expect(applyWebviewMessage(rectangularMergeResult.source, rectangularUnmergeMessage)).toMatchObject({
      ok: true,
      source: "|===\n| col1 | col2 | col3\n\n| hello |  | ready\n|  |  | draft\n| next | value | done\n|===\n"
    });
  });

  it("blocks unmerge when selected cell is not merged", async () => {
    const source = "|===\n| A | B\n|===\n";
    const harness = await createHarness(source);

    harness.cell("cell:0:0").focus();
    harness.button("unmerge-cell").click();

    expect(harness.diagnosticsText()).toContain("Unmerge blocked");
    expect(harness.messages.some((message) => message.type === "request-unmerge-cell")).toBe(false);
  });
});
