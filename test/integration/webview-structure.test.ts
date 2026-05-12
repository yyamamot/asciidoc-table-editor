import { describe, expect, it } from "vitest";
import { applyWebviewMessage, createHarness } from "./webview-harness";

describe("webview row and column structure interactions", () => {
  it("drives row and column structure context menu clicks through the real webview script", async () => {
    const source = "|===\n| A | B\n| C | D\n|===\n";
    const harness = await createHarness(source);

    harness.openContextMenu("cell:0:0");
    harness.menuItem("insert-row-after").click();
    const insertRowMessage = harness.lastMessage("request-insert-row-after");
    expect(insertRowMessage).toMatchObject({ sourceCellId: "cell:0:0", selectedSourceCellId: "cell:0:0" });
    expect(applyWebviewMessage(source, insertRowMessage)).toMatchObject({
      ok: true,
      source: "|===\n| A | B\n|  | \n| C | D\n|===\n"
    });

    harness.openContextMenu("cell:1:1");
    harness.menuItem("insert-row-before").click();
    const insertRowBeforeMessage = harness.lastMessage("request-insert-row-before");
    expect(insertRowBeforeMessage).toMatchObject({ sourceCellId: "cell:1:1", selectedSourceCellId: "cell:1:1" });
    expect(applyWebviewMessage(source, insertRowBeforeMessage)).toMatchObject({
      ok: true,
      source: "|===\n| A | B\n|  | \n| C | D\n|===\n"
    });

    harness.openContextMenu("cell:0:0");
    harness.menuItem("insert-column-after").click();
    const insertColumnMessage = harness.lastMessage("request-insert-column-after");
    expect(insertColumnMessage).toMatchObject({ sourceCellId: "cell:0:0", selectedSourceCellId: "cell:0:0" });
    expect(applyWebviewMessage(source, insertColumnMessage)).toMatchObject({
      ok: true,
      source: "|===\n| A |  | B\n| C |  | D\n|===\n"
    });

    harness.openContextMenu("cell:0:1");
    harness.menuItem("insert-column-before").click();
    const insertColumnBeforeMessage = harness.lastMessage("request-insert-column-before");
    expect(insertColumnBeforeMessage).toMatchObject({ sourceCellId: "cell:0:1", selectedSourceCellId: "cell:0:1" });
    expect(applyWebviewMessage(source, insertColumnBeforeMessage)).toMatchObject({
      ok: true,
      source: "|===\n| A |  | B\n| C |  | D\n|===\n"
    });

    harness.openContextMenu("cell:0:0");
    harness.menuItem("delete-column").click();
    const deleteColumnMessage = harness.lastMessage("request-delete-column");
    expect(deleteColumnMessage).toMatchObject({ sourceCellId: "cell:0:0", selectedSourceCellId: "cell:0:0" });
    expect(applyWebviewMessage(source, deleteColumnMessage)).toMatchObject({
      ok: true,
      source: "|===\n| B\n| D\n|===\n"
    });

    harness.openContextMenu("cell:0:0");
    harness.menuItem("delete-row").click();
    const deleteRowMessage = harness.lastMessage("request-delete-row");
    expect(deleteRowMessage).toMatchObject({ sourceCellId: "cell:0:0", selectedSourceCellId: "cell:0:0" });
    expect(applyWebviewMessage(source, deleteRowMessage)).toMatchObject({
      ok: true,
      source: "|===\n| C | D\n|===\n"
    });
  });

  it("drives span-aware row and column structure edits through the real webview script", async () => {
    const rowSpanSource = "|===\n| A | B\n.2+| V | C\n| D\n|===\n";
    const rowHarness = await createHarness(rowSpanSource);

    rowHarness.openContextMenu("cell:1:1");
    rowHarness.menuItem("insert-row-after").click();
    const insertRowMessage = rowHarness.lastMessage("request-insert-row-after");
    expect(insertRowMessage).toMatchObject({ sourceCellId: "cell:1:1", selectedSourceCellId: "cell:1:1" });
    expect(applyWebviewMessage(rowSpanSource, insertRowMessage)).toMatchObject({
      ok: true,
      source: "|===\n| A | B\n.3+| V | C\n| \n| D\n|===\n"
    });

    const colSpanSource = "|===\n2+| H | C\n| A | B | C\n|===\n";
    const colHarness = await createHarness(colSpanSource);

    colHarness.openContextMenu("cell:0:0");
    colHarness.menuItem("insert-column-after").click();
    const insertColumnMessage = colHarness.lastMessage("request-insert-column-after");
    expect(insertColumnMessage).toMatchObject({ sourceCellId: "cell:0:0", selectedSourceCellId: "cell:0:0" });
    expect(applyWebviewMessage(colSpanSource, insertColumnMessage)).toMatchObject({
      ok: true,
      source: "|===\n3+| H | C\n| A |  | B | C\n|===\n"
    });
  });
});
