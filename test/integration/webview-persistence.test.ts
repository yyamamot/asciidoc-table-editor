import { describe, expect, it } from "vitest";
import { applyWebviewMessage, createHarness } from "./webview-harness";

describe("webview layout persistence interactions", () => {
  it("persists grid column widths and scroll before source-changing paste", async () => {
    const source = "|===\n| A | B\n| C | D\n|===\n";
    const harness = await createHarness(source);
    harness.grid().style.gridTemplateColumns = "140px 220px";
    harness.gridWrap().scrollLeft = 33;
    harness.gridWrap().scrollTop = 7;

    harness.cell("cell:1:0").focus();
    harness.paste("Longer value\tB");

    expect(harness.vscodeState()).toMatchObject({
      gridState: {
        columnCount: 2,
        columnWidths: [140, 220],
        scrollLeft: 33,
        scrollTop: 7
      }
    });

    const restored = await createHarness(source, undefined, undefined, {
      initialState: {
        gridState: {
          columnCount: 2,
          columnWidths: [140, 220],
          scrollLeft: 33,
          scrollTop: 7
        }
      }
    });
    expect(restored.grid().style.gridTemplateColumns).toBe("140px 220px");
    expect(restored.gridWrap().scrollLeft).toBe(33);
    expect(restored.gridWrap().scrollTop).toBe(7);
  });

  it("persists grid column widths from before direct edit changes cell text", async () => {
    const source = "|===\n| A | B\n|===\n";
    const harness = await createHarness(source);
    harness.grid().style.gridTemplateColumns = "140px 220px";
    harness.gridWrap().scrollLeft = 41;
    harness.gridWrap().scrollTop = 9;

    const first = harness.cell("cell:0:0");
    first.dispatchEvent(new harness.window.MouseEvent("dblclick", { bubbles: true }) as unknown as Event);
    harness.grid().style.gridTemplateColumns = "480px 220px";
    first.textContent = "Very long edited value";
    harness.keydown("Enter");

    expect(harness.lastMessage("update-cell-content")).toMatchObject({
      sourceCellId: "cell:0:0",
      contentRaw: " Very long edited value"
    });
    expect(harness.vscodeState()).toMatchObject({
      gridState: {
        columnCount: 2,
        columnWidths: [140, 220],
        scrollLeft: 41,
        scrollTop: 9
      }
    });
  });

  it("applies clear results locally without resizing the grid on the first delete", async () => {
    const source = "|===\n| Alpha | Beta\n| Gamma | Delta\n|===\n";
    const harness = await createHarness(source, undefined, undefined, { autoAcknowledgeMutations: false });
    harness.grid().style.gridTemplateColumns = "180px 240px";
    harness.gridWrap().scrollLeft = 37;
    harness.gridWrap().scrollTop = 11;

    harness.cell("cell:0:0").focus();
    harness.keydown("ArrowRight", { shiftKey: true });
    harness.keydown("Delete");

    const clearMessage = harness.lastMessage("update-cell-contents");
    expect(clearMessage).toMatchObject({
      replacements: [
        { sourceCellId: "cell:0:0", contentRaw: " " },
        { sourceCellId: "cell:0:1", contentRaw: " " }
      ]
    });
    expect(harness.vscodeState()).toMatchObject({
      gridState: {
        columnCount: 2,
        columnWidths: [180, 240],
        scrollLeft: 37,
        scrollTop: 11
      }
    });
    harness.dispatchExtensionMessage({
      type: "cell-content-update-result",
      operationId: clearMessage.operationId,
      revisionToken: "revision-after-clear",
      documentVersion: 2,
      result: { ok: true, diagnostics: [] }
    });

    expect(harness.cell("cell:0:0").textContent).toBe("Alpha");
    const applied = applyWebviewMessage(source, clearMessage);
    expect(applied.ok).toBe(true);
    const refreshed = await createHarness(applied.source, "cell:0:0", undefined, {
      initialState: harness.vscodeState(),
      revisionToken: "revision-after-clear"
    });
    expect(refreshed.grid().style.gridTemplateColumns).toBe("180px 240px");
    expect(refreshed.cell("cell:0:0").textContent).toBe("");
    expect(refreshed.cell("cell:0:1").textContent).toBe("");
  });

  it("falls back to measured cell widths before the first merge changes the grid", async () => {
    const source = "|===\n| A | B\n|===\n";
    const harness = await createHarness(source);
    Object.defineProperty(harness.cell("cell:0:0"), "getBoundingClientRect", {
      value: () => ({ width: 140, height: 34, x: 0, y: 0, top: 0, right: 140, bottom: 34, left: 0, toJSON: () => ({}) })
    });
    Object.defineProperty(harness.cell("cell:0:1"), "getBoundingClientRect", {
      value: () => ({ width: 220, height: 34, x: 140, y: 0, top: 0, right: 360, bottom: 34, left: 140, toJSON: () => ({}) })
    });
    harness.gridWrap().scrollLeft = 29;
    harness.gridWrap().scrollTop = 5;

    harness.cell("cell:0:0").focus();
    harness.keydown("ArrowRight", { shiftKey: true });
    harness.button("merge-cells").click();

    expect(harness.lastMessage("request-merge-cells")).toMatchObject({
      sourceCellIds: ["cell:0:0", "cell:0:1"]
    });
    expect(harness.vscodeState()).toMatchObject({
      gridState: {
        columnCount: 2,
        columnWidths: [140, 220],
        scrollLeft: 29,
        scrollTop: 5
      }
    });
  });
});
