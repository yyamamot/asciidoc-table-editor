import { describe, expect, it } from "vitest";
import { projectGridModel, type LosslessTable, type LosslessTableCell } from "../../src/core";

describe("projectGridModel", () => {
  it("projects horizontal spans as origin and covered cells", () => {
    const table = tableFixture([
      [cell("c1", { colSpan: 2 }), cell("c2")],
      [cell("c3"), cell("c4"), cell("c5")]
    ]);

    const grid = projectGridModel(table);

    expect(grid.rowCount).toBe(2);
    expect(grid.columnCount).toBe(3);
    expect(grid.cells[0][0]).toMatchObject({ kind: "origin", sourceCellId: "c1", colSpan: 2 });
    expect(grid.cells[0][1]).toMatchObject({ kind: "covered", coveredBy: "grid:c1" });
    expect(grid.cells[0][2]).toMatchObject({ kind: "origin", sourceCellId: "c2" });
    expect(grid.diagnostics).toEqual([]);
  });

  it("projects vertical and rectangular spans", () => {
    const table = tableFixture([
      [cell("c1", { rowSpan: 2, colSpan: 2 }), cell("c2")],
      [cell("c3")]
    ]);

    const grid = projectGridModel(table);

    expect(grid.rowCount).toBe(2);
    expect(grid.columnCount).toBe(3);
    expect(grid.cells[0][0]).toMatchObject({ kind: "origin", sourceCellId: "c1", rowSpan: 2, colSpan: 2 });
    expect(grid.cells[0][1]).toMatchObject({ kind: "covered", coveredBy: "grid:c1" });
    expect(grid.cells[1][0]).toMatchObject({ kind: "covered", coveredBy: "grid:c1" });
    expect(grid.cells[1][1]).toMatchObject({ kind: "covered", coveredBy: "grid:c1" });
    expect(grid.cells[1][2]).toMatchObject({ kind: "origin", sourceCellId: "c3" });
  });

  it("marks block cells as non-editable origins", () => {
    const table = tableFixture([[cell("block", { isBlockContent: true, style: "a" })]]);

    const grid = projectGridModel(table);

    expect(grid.cells[0][0]).toMatchObject({
      kind: "origin",
      sourceCellId: "block",
      editable: false,
      blockContent: true,
      style: "a"
    });
  });

  it("reports ragged rows without dropping the partial grid", () => {
    const table = tableFixture([[cell("c1"), cell("c2")], [cell("c3")]]);

    const grid = projectGridModel(table);

    expect(grid.rowCount).toBe(2);
    expect(grid.columnCount).toBe(2);
    expect(grid.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "grid.ragged-row",
        severity: "warning"
      })
    );
  });

  it("reports spans that extend beyond the source row count", () => {
    const table = tableFixture([[cell("c1", { rowSpan: 3 }), cell("c2")], [cell("c3")]]);

    const grid = projectGridModel(table);

    expect(grid.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "grid.span-overflow",
        severity: "error",
        nodeId: "c1"
      })
    );
  });
});

function tableFixture(rows: LosslessTableCell[][]): LosslessTable {
  return {
    nodeId: "table:test",
    kind: "table",
    raw: "",
    range: range(),
    delimiter: {
      startRaw: "|===",
      endRaw: "|===",
      separator: "|"
    },
    attributes: {
      options: [],
      columns: []
    },
    rows: rows.map((cells, index) => ({
      nodeId: `row:${index}`,
      kind: "row",
      role: "body",
      raw: "",
      range: range(),
      cells,
      retained: [],
      errors: []
    })),
    retained: [],
    errors: []
  };
}

function cell(
  nodeId: string,
  options: Partial<Pick<LosslessTableCell, "rowSpan" | "colSpan" | "style" | "isBlockContent">> = {}
): LosslessTableCell {
  return {
    nodeId,
    kind: "cell",
    raw: "",
    range: range(),
    cellSpecRaw: "",
    delimiterRaw: "|",
    contentRaw: nodeId,
    rowSpan: options.rowSpan ?? 1,
    colSpan: options.colSpan ?? 1,
    style: options.style,
    isBlockContent: options.isBlockContent ?? false,
    errors: []
  };
}

function range() {
  return {
    start: { offset: 0, line: 0, column: 0 },
    end: { offset: 0, line: 0, column: 0 }
  };
}
