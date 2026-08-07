import axe from "axe-core";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createHarness } from "./webview-harness";

describe("webview grid and menu accessibility", () => {
  it("owns origin cells through logical DOM rows while preserving merged spans", async () => {
    const harness = await createHarness("|===\n.2+| Vertical | A\n| B\n|===\n");
    const rows = harness.grid().querySelectorAll(":scope > [role='row']");
    const merged = harness.cell("cell:0:0");

    expect(rows).toHaveLength(2);
    expect(rows[0]?.contains(merged)).toBe(true);
    expect(rows[1]?.querySelector("[data-source-cell-id='cell:0:0']")).toBeNull();
    expect(merged.getAttribute("aria-rowspan")).toBe("2");
    expect(merged.getAttribute("aria-colspan")).toBe("1");
    expect(harness.grid().querySelector("[data-kind='covered']")).toBeNull();
    expect(merged.getAttribute("aria-label")).toContain("row 1, column 1, Span 2 x 1, editable, Vertical");
  });

  it("keeps one large-grid cell in the Tab order and moves the roving stop with arrows", async () => {
    const source = readFileSync("fixtures/lossless/large-table/source.adoc", "utf8");
    const harness = await createHarness(source);
    const cells = Array.from(harness.grid().querySelectorAll<HTMLElement>(".cell[data-kind='origin']"));
    const first = harness.cell("cell:0:0");
    const second = harness.cell("cell:0:1");

    expect(cells.length).toBeGreaterThan(200);
    expect(cells.filter((cell) => cell.tabIndex === 0)).toEqual([first]);
    first.focus();
    harness.keydown("ArrowRight");
    expect(harness.window.document.activeElement).toBe(second);
    expect(cells.filter((cell) => cell.tabIndex === 0)).toEqual([second]);

    const tab = new harness.window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Tab" });
    second.dispatchEvent(tab as unknown as Event);
    expect(tab.defaultPrevented).toBe(false);
    expect(cells.filter((cell) => cell.tabIndex === 0)).toEqual([second]);
  });

  it("announces only range endpoints and dimensions", async () => {
    const harness = await createHarness("|===\n| Alpha | Bravo\n| Charlie | Delta\n|===\n");
    harness.cell("cell:0:0").focus();
    harness.keydown("ArrowRight", { shiftKey: true });
    harness.keydown("ArrowDown", { shiftKey: true });
    const status = harness.window.document.querySelector("[data-grid-selection-status]");

    expect(status?.textContent).toBe("row 1, column 1 - row 2, column 2, 2 rows x 2 columns");
    expect(status?.textContent).not.toContain("Alpha");
    expect(status?.textContent).not.toContain("Delta");
  });

  it("opens and closes the structure menu without a mouse and restores grid focus", async () => {
    const harness = await createHarness("|===\n| A | B\n|===\n");
    const cell = harness.cell("cell:0:0");
    const items = Array.from(harness.contextMenu().querySelectorAll<HTMLButtonElement>("[role='menuitem']"));
    cell.focus();

    harness.keydown("F10", { shiftKey: true });
    expect(harness.contextMenu().classList.contains("is-open")).toBe(true);
    expect(harness.window.document.activeElement).toBe(items[0]);
    harness.keydown("ArrowDown");
    expect(harness.window.document.activeElement).toBe(items[1]);
    harness.keydown("End");
    expect(harness.window.document.activeElement).toBe(items.at(-1));
    harness.keydown("Home");
    expect(harness.window.document.activeElement).toBe(items[0]);
    harness.keydown("Escape");

    expect(harness.contextMenu().classList.contains("is-open")).toBe(false);
    expect(harness.contextMenu().getAttribute("aria-hidden")).toBe("true");
    expect(harness.window.document.activeElement).toBe(cell);
    expect(items.every((item) => item.tabIndex === -1)).toBe(true);

    harness.keydown("ContextMenu");
    expect(harness.contextMenu().classList.contains("is-open")).toBe(true);
    harness.keydown("ArrowDown");
    harness.keydown("Enter");
    expect(harness.lastMessage("request-insert-row-after")).toMatchObject({
      sourceCellId: "cell:0:0",
      selectedSourceCellId: "cell:0:0"
    });
    expect(harness.contextMenu().classList.contains("is-open")).toBe(false);
    expect(harness.window.document.activeElement).toBe(cell);

    harness.keydown("ContextMenu");
    harness.keydown(" ");
    expect(harness.lastMessage("request-insert-row-before")).toMatchObject({
      sourceCellId: "cell:0:0",
      selectedSourceCellId: "cell:0:0"
    });
    expect(harness.window.document.activeElement).toBe(cell);
  });

  it("does not open a stale cell menu after focus leaves the roving grid stop", async () => {
    const harness = await createHarness("|===\n| A | B\n|===\n");
    const cell = harness.cell("cell:0:0");
    const toolbarButton = harness.button("merge-cells");
    cell.focus();
    toolbarButton.focus();

    harness.keydown("F10", { shiftKey: true });
    expect(harness.contextMenu().classList.contains("is-open")).toBe(false);
    expect(harness.window.document.activeElement).toBe(toolbarButton);
    harness.keydown("ContextMenu");
    expect(harness.contextMenu().classList.contains("is-open")).toBe(false);
    expect(harness.window.document.activeElement).toBe(toolbarButton);
  });

  it("passes automated axe checks for the rendered grid and menu contract", async () => {
    const harness = await createHarness("|===\n2+| Merged\n| C | D\n|===\n");
    const result = await axe.run(harness.window.document.documentElement as unknown as Element, {
      rules: {
        "color-contrast": { enabled: false }
      }
    });

    expect(result.violations).toEqual([]);
  });
});
