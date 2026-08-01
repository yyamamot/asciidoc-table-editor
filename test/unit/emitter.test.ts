import { describe, expect, it } from "vitest";
import {
  deletePlainColumn,
  deletePlainRow,
  emitNoopTable,
  insertPlainColumnAfter,
  insertPlainColumnBefore,
  insertPlainRowAfter,
  insertPlainRowBefore,
  mergePlainCellsHorizontally,
  pasteImportedTable,
  pasteRectangularPlainTable,
  parseAsciiDocTable,
  replaceBlockCellContent,
  replacePlainCellContent,
  replacePlainCellWithBlockContent,
  replacePlainCellContents,
  replacePlainCellStyles,
  unmergePlainCellHorizontally,
  updateColumnSpec,
  updateTableAppearance,
  updateTableHeaderFooter
} from "../../src/core";

describe("write-back emitter", () => {
  it("keeps no-op output byte-for-byte identical", () => {
    const source = "|===\n| A | B\n|===\n";
    const table = parseAsciiDocTable(source);

    expect(emitNoopTable(table)).toBe(source);
  });

  it("patches plain cell content by source range", () => {
    const table = parseAsciiDocTable("|===\n| A | B\n|===\n");
    const result = replacePlainCellContent(table, "cell:0:1", " Bee");

    expect(result).toEqual({
      ok: true,
      source: "|===\n| A | Bee\n|===\n",
      diagnostics: []
    });
  });

  it("escapes unescaped default separators without double-escaping existing escapes", () => {
    const table = parseAsciiDocTable("|===\n| A\n|===\n");

    expect(replacePlainCellContent(table, "cell:0:0", " Pipe | value")).toMatchObject({
      ok: true,
      source: "|===\n| Pipe \\| value\n|===\n"
    });
    expect(replacePlainCellContent(table, "cell:0:0", " Existing \\| value")).toMatchObject({
      ok: true,
      source: "|===\n| Existing \\| value\n|===\n"
    });
    expect(replacePlainCellContent(table, "cell:0:0", " Double \\\\| value")).toMatchObject({
      ok: true,
      source: "|===\n| Double \\\\| value\n|===\n"
    });
  });

  it("rejects every line-break form in plain cell content", () => {
    const table = parseAsciiDocTable("|===\n| A\n|===\n");
    for (const contentRaw of [" A\nB", " A\r\nB", " A\rB"]) {
      const result = replacePlainCellContent(table, "cell:0:0", contentRaw);
      expect(result).toMatchObject({
        ok: false,
        source: table.raw,
        diagnostics: [expect.objectContaining({ code: "writeback.unsafe-plain-cell-content" })]
      });
    }
  });

  it("rejects a custom separator but preserves ordinary pipe characters", () => {
    const table = parseAsciiDocTable("[separator=¦]\n|===\n¦ A\n|===\n");

    expect(replacePlainCellContent(table, "cell:0:0", " Pipe | value")).toMatchObject({
      ok: true,
      source: "[separator=¦]\n|===\n¦ Pipe | value\n|===\n"
    });
    expect(replacePlainCellContent(table, "cell:0:0", " Unsafe ¦ value")).toMatchObject({
      ok: false,
      source: table.raw,
      diagnostics: [expect.objectContaining({ code: "writeback.unsafe-plain-cell-content" })]
    });
  });

  it("patches merged origin cell content without changing span syntax", () => {
    const horizontal = replacePlainCellContent(parseAsciiDocTable("|===\n2+| Wide | Tail\n|===\n"), "cell:0:0", " Wider");
    const vertical = replacePlainCellContent(parseAsciiDocTable("|===\n.2+| Tall | A\n| B\n|===\n"), "cell:0:0", " Taller");
    const rectangular = replacePlainCellContent(parseAsciiDocTable("|===\n2.2+| Block | C\n| D\n|===\n"), "cell:0:0", " Bigger");

    expect(horizontal).toEqual({
      ok: true,
      source: "|===\n2+| Wider | Tail\n|===\n",
      diagnostics: []
    });
    expect(vertical).toEqual({
      ok: true,
      source: "|===\n.2+| Taller | A\n| B\n|===\n",
      diagnostics: []
    });
    expect(rectangular).toEqual({
      ok: true,
      source: "|===\n2.2+| Bigger | C\n| D\n|===\n",
      diagnostics: []
    });
  });

  it("patches multiple plain cells in one table source rewrite", () => {
    const table = parseAsciiDocTable("|===\n| A | B\n| C | D\n|===\n");
    const result = replacePlainCellContents(table, [
      { sourceCellId: "cell:0:1", contentRaw: " Bee" },
      { sourceCellId: "cell:1:0", contentRaw: " Sea" }
    ]);

    expect(result).toEqual({
      ok: true,
      source: "|===\n| A | Bee\n| Sea | D\n|===\n",
      diagnostics: []
    });
  });

  it("preflights every batch input before checking target structure", () => {
    const table = parseAsciiDocTable("|===\n2+| Wide | Tail\n|===\n");
    const result = replacePlainCellContents(table, [
      { sourceCellId: "cell:0:0", contentRaw: " Wider" },
      { sourceCellId: "cell:0:1", contentRaw: " Unsafe\nvalue" }
    ]);

    expect(result).toMatchObject({
      ok: false,
      source: table.raw,
      diagnostics: [expect.objectContaining({ code: "writeback.unsafe-plain-cell-content" })]
    });
  });

  it("preserves attributes and non-target diagnostic cells during validated replacement", () => {
    const source = "[cols=2*]\n|===\n| A qz| B\n|===\n";
    const result = replacePlainCellContent(parseAsciiDocTable(source), "cell:0:0", " Updated");

    expect(result).toEqual({
      ok: true,
      source: "[cols=2*]\n|===\n| Updated qz| B\n|===\n",
      diagnostics: []
    });
  });

  it("patches explicit cell style and alignment without changing content", () => {
    const table = parseAsciiDocTable("[cols=\"m\"]\n|===\n| A >| B\n|===\n");
    const result = replacePlainCellStyles(table, {
      sourceCellIds: ["cell:0:0", "cell:0:1"],
      style: "s",
      horizontalAlign: "center",
      verticalAlign: "middle"
    });

    expect(result).toEqual({
      ok: true,
      source: "[cols=\"m\"]\n|===\n^.^s| A ^.^s| B\n|===\n",
      diagnostics: []
    });
  });

  it("patches header footer options through table attributes", () => {
    const result = updateTableHeaderFooter(parseAsciiDocTable("[%header]\n|===\n| A | B\n|===\n"), {
      noheader: true,
      footer: true
    });

    expect(result).toEqual({
      ok: true,
      source: "[options=noheader,footer]\n|===\n| A | B\n|===\n",
      diagnostics: []
    });
  });

  it("expands cols multiplier to explicit specs when a column is edited", () => {
    const result = updateColumnSpec(parseAsciiDocTable("[cols=3*]\n|===\n| A | B | C\n|===\n"), {
      columnIndex: 1,
      widthRaw: "2",
      horizontalAlign: "right",
      style: "m"
    });

    expect(result).toEqual({
      ok: true,
      source: "[cols=\",2>m,\"]\n|===\n| A | B | C\n|===\n",
      diagnostics: []
    });
  });

  it("patches table appearance attributes and title", () => {
    const result = updateTableAppearance(parseAsciiDocTable(".Old\n[frame=ends]\n|===\n| A | B\n|===\n"), {
      title: "New",
      width: "75%",
      frame: "all",
      autowidth: true
    });

    expect(result).toEqual({
      ok: true,
      source: ".New\n[frame=all]\n[width=75%]\n[options=autowidth]\n|===\n| A | B\n|===\n",
      diagnostics: []
    });
  });

  it("expands duplicate shorthand when one duplicate cell is edited", () => {
    const table = parseAsciiDocTable("|===\n2*| A\n|===\n");
    const result = replacePlainCellContent(table, "cell:0:1", " B");

    expect(result).toEqual({
      ok: true,
      source: "|===\n| A | B\n|===\n",
      diagnostics: []
    });
  });

  it("expands duplicate shorthand before batch paste-style replacement", () => {
    const table = parseAsciiDocTable("|===\n2*| A | C\n|===\n");
    const result = replacePlainCellContents(table, [
      { sourceCellId: "cell:0:0", contentRaw: " X" },
      { sourceCellId: "cell:0:1", contentRaw: " Y" }
    ]);

    expect(result).toEqual({
      ok: true,
      source: "|===\n| X | Y | C\n|===\n",
      diagnostics: []
    });
  });

  it("rejects duplicate expansion when style or alignment modifiers would be lost", () => {
    const table = parseAsciiDocTable("|===\n2*>m| A\n|===\n");
    const result = replacePlainCellContent(table, "cell:0:1", " B");

    expect(result).toMatchObject({
      ok: false,
      source: table.raw,
      diagnostics: [expect.objectContaining({ code: "writeback.cell-replacement-validation-failed" })]
    });
  });

  it("expands duplicate shorthand before merge write-back", () => {
    const table = parseAsciiDocTable("|===\n2*| A | C\n|===\n");
    const result = mergePlainCellsHorizontally(table, {
      sourceCellIds: ["cell:0:0", "cell:0:1"]
    });

    expect(result).toEqual({
      ok: true,
      source: "|===\n2+| A | C\n|===\n",
      diagnostics: []
    });
  });

  it("expands duplicate shorthand before row and column structure edit", () => {
    const insertColumn = insertPlainColumnAfter(parseAsciiDocTable("|===\n2*| A\n|===\n"), {
      sourceCellId: "cell:0:0"
    });
    const insertRow = insertPlainRowAfter(parseAsciiDocTable("|===\n2*| A\n|===\n"), {
      sourceCellId: "cell:0:0"
    });

    expect(insertColumn).toEqual({
      ok: true,
      source: "|===\n| A |  | A\n|===\n",
      diagnostics: []
    });
    expect(insertRow).toEqual({
      ok: true,
      source: "|===\n| A | A\n|  | \n|===\n",
      diagnostics: []
    });
  });

  it("blocks duplicate batch replacements", () => {
    const table = parseAsciiDocTable("|===\n| A | B\n|===\n");
    const result = replacePlainCellContents(table, [
      { sourceCellId: "cell:0:1", contentRaw: " Bee" },
      { sourceCellId: "cell:0:1", contentRaw: " Beta" }
    ]);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "writeback.duplicate-cell-replacement",
        severity: "error"
      })
    );
  });

  it("auto-expands a plain rectangular paste beyond the current grid", () => {
    const table = parseAsciiDocTable("|===\n| A | B\n| C | D\n|===\n");
    const result = pasteRectangularPlainTable(table, {
      startSourceCellId: "cell:1:1",
      rows: [
        ["x", "y", "z"],
        ["p", "q", "r"]
      ]
    });

    expect(result).toEqual({
      ok: true,
      source: "|===\n| A | B |  | \n| C | x | y | z\n|  | p | q | r\n|===\n",
      diagnostics: []
    });
  });

  it("rolls rectangular auto-expansion back to the operation-start source on unsafe input", () => {
    const table = parseAsciiDocTable("|===\n| A | B\n|===\n");
    const result = pasteRectangularPlainTable(table, {
      startSourceCellId: "cell:0:1",
      rows: [["safe", "unsafe\nvalue"]]
    });

    expect(result).toMatchObject({
      ok: false,
      source: table.raw,
      diagnostics: [expect.objectContaining({ code: "writeback.unsafe-plain-cell-content" })]
    });
  });

  it("pastes imported horizontal span cells as AsciiDoc span syntax", () => {
    const table = parseAsciiDocTable("|===\n| A | B | C\n|===\n");
    const result = pasteImportedTable(table, {
      startSourceCellId: "cell:0:0",
      rowCount: 1,
      columnCount: 3,
      cells: [
        { row: 0, col: 0, rowSpan: 1, colSpan: 2, text: "Wide" },
        { row: 0, col: 2, rowSpan: 1, colSpan: 1, text: "Tail" }
      ]
    });

    expect(result).toEqual({
      ok: true,
      source: "|===\n2+| Wide  | Tail\n|===\n",
      diagnostics: []
    });
  });

  it("pastes imported vertical and rectangular spans with auto expansion", () => {
    const table = parseAsciiDocTable("|===\n| A | B\n| C | D\n|===\n");
    const result = pasteImportedTable(table, {
      startSourceCellId: "cell:1:1",
      rowCount: 2,
      columnCount: 3,
      cells: [
        { row: 0, col: 0, rowSpan: 2, colSpan: 1, text: "Tall" },
        { row: 0, col: 1, rowSpan: 2, colSpan: 2, text: "Block" }
      ]
    });

    expect(result).toEqual({
      ok: true,
      source: "|===\n| A | B |  | \n| C .2+| Tall 2.2+| Block \n|    \n|===\n",
      diagnostics: []
    });
  });

  it("blocks auto-expand paste for merged or block target tables", () => {
    const merged = pasteRectangularPlainTable(parseAsciiDocTable("|===\n2+| A\n|===\n"), {
      startSourceCellId: "cell:0:0",
      rows: [["x"]]
    });
    const block = pasteRectangularPlainTable(parseAsciiDocTable("|===\na| * item\n|===\n"), {
      startSourceCellId: "cell:0:0",
      rows: [["x"]]
    });

    expect(merged.diagnostics).toContainEqual(expect.objectContaining({ code: "writeback.paste-merged-cell-overlap" }));
    expect(block.diagnostics).toContainEqual(expect.objectContaining({ code: "writeback.paste-block-cell-overlap" }));
  });

  it("blocks imported span paste over an existing merged or block target", () => {
    const merged = pasteImportedTable(parseAsciiDocTable("|===\n2+| A\n| B | C\n|===\n"), {
      startSourceCellId: "cell:0:0",
      rowCount: 1,
      columnCount: 1,
      cells: [{ row: 0, col: 0, rowSpan: 1, colSpan: 1, text: "x" }]
    });
    const block = pasteImportedTable(parseAsciiDocTable("|===\na| * item\n|===\n"), {
      startSourceCellId: "cell:0:0",
      rowCount: 1,
      columnCount: 1,
      cells: [{ row: 0, col: 0, rowSpan: 1, colSpan: 1, text: "x" }]
    });

    expect(merged.diagnostics).toContainEqual(expect.objectContaining({ code: "writeback.imported-paste-target-unsafe" }));
    expect(block.diagnostics).toContainEqual(expect.objectContaining({ code: "writeback.imported-paste-target-unsafe" }));
  });

  it("merges contiguous empty plain cells horizontally", () => {
    const table = parseAsciiDocTable("|===\n| Keep |  | \n|===\n");
    const result = mergePlainCellsHorizontally(table, {
      sourceCellIds: ["cell:0:1", "cell:0:2"]
    });

    expect(result).toEqual({
      ok: true,
      source: "|===\n| Keep 2+| \n|===\n",
      diagnostics: []
    });
  });

  it("merges three contiguous empty plain cells horizontally", () => {
    const table = parseAsciiDocTable("|===\n| Keep |  |  | \n|===\n");
    const result = mergePlainCellsHorizontally(table, {
      sourceCellIds: ["cell:0:1", "cell:0:2", "cell:0:3"]
    });

    expect(result).toEqual({
      ok: true,
      source: "|===\n| Keep 3+| \n|===\n",
      diagnostics: []
    });
  });

  it("blocks horizontal merge when selected cells are not contiguous", () => {
    const table = parseAsciiDocTable("|===\n| A |  | B | \n|===\n");
    const result = mergePlainCellsHorizontally(table, {
      sourceCellIds: ["cell:0:1", "cell:0:3"]
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "writeback.merge-non-rectangular-span-set",
        severity: "error"
      })
    );
  });

  it("merges cells with content by keeping only the top-left content", () => {
    const table = parseAsciiDocTable("|===\n| A | B\n|===\n");
    const result = mergePlainCellsHorizontally(table, {
      sourceCellIds: ["cell:0:0", "cell:0:1"]
    });

    expect(result).toEqual({
      ok: true,
      source: "|===\n2+| A\n|===\n",
      diagnostics: []
    });
  });

  it("extends an existing horizontal merged cell into an adjacent plain cell", () => {
    const table = parseAsciiDocTable("|===\n2+| A | B\n|===\n");
    const result = mergePlainCellsHorizontally(table, {
      sourceCellIds: ["cell:0:0", "cell:0:1"]
    });

    expect(result).toEqual({
      ok: true,
      source: "|===\n3+| A\n|===\n",
      diagnostics: []
    });
  });

  it("extends an existing vertical merged cell into adjacent plain cells", () => {
    const table = parseAsciiDocTable("|===\n.2+| A | B\n| C\n|===\n");
    const result = mergePlainCellsHorizontally(table, {
      sourceCellIds: ["cell:0:0", "cell:0:1", "cell:1:0"]
    });

    expect(result).toEqual({
      ok: true,
      source: "|===\n2.2+| A\n\n|===\n",
      diagnostics: []
    });
  });

  it("extends an existing rectangular merged cell into adjacent plain cells", () => {
    const table = parseAsciiDocTable("|===\n2.2+| A | B\n| C\n|===\n");
    const result = mergePlainCellsHorizontally(table, {
      sourceCellIds: ["cell:0:0", "cell:0:1", "cell:1:0"]
    });

    expect(result).toEqual({
      ok: true,
      source: "|===\n3.2+| A\n\n|===\n",
      diagnostics: []
    });
  });

  it("blocks existing merged range merge when an origin inside the rectangle is not selected", () => {
    const table = parseAsciiDocTable("|===\n.2+| A | B\n| C\n|===\n");
    const result = mergePlainCellsHorizontally(table, {
      sourceCellIds: ["cell:0:0", "cell:0:1"]
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "writeback.merge-non-rectangular-span-set",
        severity: "error"
      })
    );
  });

  it("merges vertical cells by adding a row span", () => {
    const table = parseAsciiDocTable("|===\n| A | \n| B | \n|===\n");
    const result = mergePlainCellsHorizontally(table, {
      sourceCellIds: ["cell:0:1", "cell:1:1"]
    });

    expect(result).toEqual({
      ok: true,
      source: "|===\n| A .2+| \n| B\n|===\n",
      diagnostics: []
    });
  });

  it("merges horizontal, vertical, and rectangular ranges from a plain 3x3 table", () => {
    const source = "|===\n| col1 | col2 | col3\n\n| hello | world | ready\n| test | message | draft\n| next | value | done\n|===\n";
    expect(
      mergePlainCellsHorizontally(parseAsciiDocTable(source), {
        sourceCellIds: ["cell:1:0", "cell:1:1"]
      })
    ).toMatchObject({
      ok: true,
      source: "|===\n| col1 | col2 | col3\n\n2+| hello | ready\n| test | message | draft\n| next | value | done\n|===\n"
    });
    expect(
      mergePlainCellsHorizontally(parseAsciiDocTable(source), {
        sourceCellIds: ["cell:1:0", "cell:2:0"]
      })
    ).toMatchObject({
      ok: true,
      source: "|===\n| col1 | col2 | col3\n\n.2+| hello | world | ready\n| message | draft\n| next | value | done\n|===\n"
    });
    expect(
      mergePlainCellsHorizontally(parseAsciiDocTable(source), {
        sourceCellIds: ["cell:1:0", "cell:1:1", "cell:2:0", "cell:2:1"]
      })
    ).toMatchObject({
      ok: true,
      source: "|===\n| col1 | col2 | col3\n\n2.2+| hello | ready\n| draft\n| next | value | done\n|===\n"
    });
  });

  it("unmerges horizontal column spans by restoring empty covered cells", () => {
    const table = parseAsciiDocTable("|===\n2+| A | B\n|===\n");
    const result = unmergePlainCellHorizontally(table, {
      sourceCellId: "cell:0:0"
    });

    expect(result).toEqual({
      ok: true,
      source: "|===\n| A |  | B\n|===\n",
      diagnostics: []
    });
  });

  it("preserves style spec while unmerging a horizontal span", () => {
    const table = parseAsciiDocTable("|===\n2+m| Mono\n|===\n");
    const result = unmergePlainCellHorizontally(table, {
      sourceCellId: "cell:0:0"
    });

    expect(result).toEqual({
      ok: true,
      source: "|===\nm| Mono | \n|===\n",
      diagnostics: []
    });
  });

  it("unmerges a three-column horizontal span", () => {
    const table = parseAsciiDocTable("|===\n3+| Wide\n|===\n");
    const result = unmergePlainCellHorizontally(table, {
      sourceCellId: "cell:0:0"
    });

    expect(result).toEqual({
      ok: true,
      source: "|===\n| Wide |  | \n|===\n",
      diagnostics: []
    });
  });

  it("unmerges rectangular spans by restoring empty covered cells", () => {
    const table = parseAsciiDocTable("|===\n2.2+| A\n| B | C\n|===\n");
    const result = unmergePlainCellHorizontally(table, {
      sourceCellId: "cell:0:0"
    });

    expect(result).toEqual({
      ok: true,
      source: "|===\n| A | \n|  |  | B | C\n|===\n",
      diagnostics: []
    });
  });

  it("blocks unmerge when the selected cell is not merged", () => {
    const table = parseAsciiDocTable("|===\n| A | B\n|===\n");
    const result = unmergePlainCellHorizontally(table, {
      sourceCellId: "cell:0:0"
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "writeback.unmerge-not-spanned",
        severity: "error"
      })
    );
  });

  it("inserts a plain row after the selected row", () => {
    const table = parseAsciiDocTable("|===\n| A | B\n| C | D\n|===\n");
    const result = insertPlainRowAfter(table, {
      sourceCellId: "cell:0:0"
    });

    expect(result).toEqual({
      ok: true,
      source: "|===\n| A | B\n|  | \n| C | D\n|===\n",
      diagnostics: []
    });
  });

  it("inserts a plain row before the selected row", () => {
    const table = parseAsciiDocTable("|===\n| A | B\n| C | D\n|===\n");
    const result = insertPlainRowBefore(table, {
      sourceCellId: "cell:1:0"
    });

    expect(result).toEqual({
      ok: true,
      source: "|===\n| A | B\n|  | \n| C | D\n|===\n",
      diagnostics: []
    });
  });

  it("deletes the selected plain row", () => {
    const table = parseAsciiDocTable("|===\n| A | B\n| C | D\n|===\n");
    const result = deletePlainRow(table, {
      sourceCellId: "cell:0:1"
    });

    expect(result).toEqual({
      ok: true,
      source: "|===\n| C | D\n|===\n",
      diagnostics: []
    });
  });

  it("inserts a plain column after the selected column", () => {
    const table = parseAsciiDocTable("|===\n| A | B\n| C | D\n|===\n");
    const result = insertPlainColumnAfter(table, {
      sourceCellId: "cell:0:0"
    });

    expect(result).toEqual({
      ok: true,
      source: "|===\n| A |  | B\n| C |  | D\n|===\n",
      diagnostics: []
    });
  });

  it("inserts a plain column before the selected column", () => {
    const table = parseAsciiDocTable("|===\n| A | B\n| C | D\n|===\n");
    const result = insertPlainColumnBefore(table, {
      sourceCellId: "cell:0:1"
    });

    expect(result).toEqual({
      ok: true,
      source: "|===\n| A |  | B\n| C |  | D\n|===\n",
      diagnostics: []
    });
  });

  it("deletes the selected plain column", () => {
    const table = parseAsciiDocTable("|===\n| A | B | C\n| D | E | F\n|===\n");
    const result = deletePlainColumn(table, {
      sourceCellId: "cell:0:1"
    });

    expect(result).toEqual({
      ok: true,
      source: "|===\n| A | C\n| D | F\n|===\n",
      diagnostics: []
    });
  });

  it("uses the Grid column of an origin after a horizontal span for column edits", () => {
    const source = "|===\n2+| A | B\n| C | D | E\n|===\n";

    expect(insertPlainColumnBefore(parseAsciiDocTable(source), { sourceCellId: "cell:0:1" })).toEqual({
      ok: true,
      source: "|===\n2+| A |  | B\n| C | D |  | E\n|===\n",
      diagnostics: []
    });
    expect(insertPlainColumnAfter(parseAsciiDocTable(source), { sourceCellId: "cell:0:1" })).toEqual({
      ok: true,
      source: "|===\n2+| A | B | \n| C | D | E | \n|===\n",
      diagnostics: []
    });
    expect(deletePlainColumn(parseAsciiDocTable(source), { sourceCellId: "cell:0:1" })).toEqual({
      ok: true,
      source: "|===\n2+| A\n| C | D\n|===\n",
      diagnostics: []
    });
  });

  it("keeps implicit column edits reparsable without adding cols metadata", () => {
    const source = "|===\n2+| A | B\n| C | D | E\n|===\n";
    const results = [
      insertPlainColumnBefore(parseAsciiDocTable(source), { sourceCellId: "cell:0:1" }),
      insertPlainColumnAfter(parseAsciiDocTable(source), { sourceCellId: "cell:0:1" }),
      deletePlainColumn(parseAsciiDocTable(source), { sourceCellId: "cell:0:1" })
    ];

    for (const result of results) {
      expect(result.ok).toBe(true);
      const reparsed = parseAsciiDocTable(result.source);
      expect(reparsed.attributes.named.cols).toBeUndefined();
      expect(reparsed.errors).toEqual([]);
      const logicalColumnCounts = reparsed.rows.map((row) =>
        row.cells.reduce((count, cell) => count + cell.colSpan, 0)
      );
      expect(new Set(logicalColumnCounts).size).toBe(1);
    }
  });

  it("synchronizes multiplier cols metadata with Grid-aware insert and delete", () => {
    const source = "[cols=3*]\n|===\n2+| A | B\n| C | D | E\n|===\n";

    const inserted = insertPlainColumnBefore(parseAsciiDocTable(source), { sourceCellId: "cell:0:1" });
    expect(inserted).toEqual({
      ok: true,
      source: "[cols=4*]\n|===\n2+| A |  | B\n| C | D |  | E\n|===\n",
      diagnostics: []
    });
    expect(parseAsciiDocTable(inserted.source).attributes).toMatchObject({ columnCount: 4 });

    const deleted = deletePlainColumn(parseAsciiDocTable(source), { sourceCellId: "cell:0:1" });
    expect(deleted).toEqual({
      ok: true,
      source: "[cols=2*]\n|===\n2+| A\n| C | D\n|===\n",
      diagnostics: []
    });
    expect(parseAsciiDocTable(deleted.source).attributes).toMatchObject({ columnCount: 2 });
  });

  it("preserves styled multiplier cols metadata while changing its count", () => {
    const source = "[cols=\"3*>m\"]\n|===\n2+| A | B\n| C | D | E\n|===\n";

    const inserted = insertPlainColumnAfter(parseAsciiDocTable(source), { sourceCellId: "cell:0:1" });
    expect(inserted).toEqual({
      ok: true,
      source: "[cols=\"4*>m\"]\n|===\n2+| A | B | \n| C | D | E | \n|===\n",
      diagnostics: []
    });
    expect(parseAsciiDocTable(inserted.source).attributes.columns).toHaveLength(4);
    expect(parseAsciiDocTable(inserted.source).attributes.columns.every((column) => column.raw === ">m")).toBe(true);

    const deleted = deletePlainColumn(parseAsciiDocTable(source), { sourceCellId: "cell:0:1" });
    expect(deleted).toEqual({
      ok: true,
      source: "[cols=\"2*>m\"]\n|===\n2+| A\n| C | D\n|===\n",
      diagnostics: []
    });
    expect(parseAsciiDocTable(deleted.source).attributes.columns).toHaveLength(2);
    expect(parseAsciiDocTable(deleted.source).attributes.columns.every((column) => column.raw === ">m")).toBe(true);
  });

  it("preserves explicit width metadata and clones the anchor column width", () => {
    const source = "[cols=\"1,2,3\"]\n|===\n2+| A | B\n| C | D | E\n|===\n";

    const inserted = insertPlainColumnBefore(parseAsciiDocTable(source), { sourceCellId: "cell:0:1" });
    expect(inserted).toEqual({
      ok: true,
      source: "[cols=\"1,2,3,3\"]\n|===\n2+| A |  | B\n| C | D |  | E\n|===\n",
      diagnostics: []
    });
    expect(parseAsciiDocTable(inserted.source).attributes.columns.map((column) => column.widthRaw)).toEqual(["1", "2", "3", "3"]);

    const deleted = deletePlainColumn(parseAsciiDocTable(source), { sourceCellId: "cell:0:1" });
    expect(deleted).toEqual({
      ok: true,
      source: "[cols=\"1,2\"]\n|===\n2+| A\n| C | D\n|===\n",
      diagnostics: []
    });
    expect(parseAsciiDocTable(deleted.source).attributes.columns.map((column) => column.widthRaw)).toEqual(["1", "2"]);
  });

  it("preserves styled explicit cols entries around Grid-aware insert and delete", () => {
    const source = "[cols=\"1<,2>m,3s\"]\n|===\n2+| A | B\n| C | D | E\n|===\n";

    const inserted = insertPlainColumnBefore(parseAsciiDocTable(source), { sourceCellId: "cell:0:1" });
    expect(inserted).toEqual({
      ok: true,
      source: "[cols=\"1<,2>m,3s,3s\"]\n|===\n2+| A |  | B\n| C | D |  | E\n|===\n",
      diagnostics: []
    });
    expect(parseAsciiDocTable(inserted.source).attributes.columns.map((column) => column.raw)).toEqual(["1<", "2>m", "3s", "3s"]);

    const deleted = deletePlainColumn(parseAsciiDocTable(source), { sourceCellId: "cell:0:1" });
    expect(deleted).toEqual({
      ok: true,
      source: "[cols=\"1<,2>m\"]\n|===\n2+| A\n| C | D\n|===\n",
      diagnostics: []
    });
    expect(parseAsciiDocTable(deleted.source).attributes.columns.map((column) => column.raw)).toEqual(["1<", "2>m"]);
  });

  it.each([
    ["mixed multiplier", "[cols=\"2*,1\"]\n|===\n| A | B | C\n|===\n"],
    ["empty segment", "[cols=\"1,,2\"]\n|===\n| A | B | C\n|===\n"],
    ["unknown shape", "[cols=\"1,$,2\"]\n|===\n| A | B | C\n|===\n"],
    ["count mismatch", "[cols=\"1,2\"]\n|===\n| A | B | C\n|===\n"],
    ["duplicate attributes", "[cols=\"1,2,3\"]\n[cols=\"1,2,3\"]\n|===\n| A | B | C\n|===\n"]
  ])("blocks column changes for unsafe %s cols metadata", (_label, source) => {
    for (const result of [
      insertPlainColumnAfter(parseAsciiDocTable(source), { sourceCellId: "cell:0:1" }),
      deletePlainColumn(parseAsciiDocTable(source), { sourceCellId: "cell:0:1" })
    ]) {
      expect(result.ok).toBe(false);
      expect(result.source).toBe(source);
      expect(result.diagnostics).toContainEqual(expect.objectContaining({
        code: "writeback.unsafe-column-metadata",
        severity: "error"
      }));
    }
  });

  it("keeps duplicate shorthand source unchanged when cols metadata blocks the edit", () => {
    const source = "[cols=\"2*,1\"]\n|===\n2*| A | B\n|===\n";

    for (const result of [
      insertPlainColumnAfter(parseAsciiDocTable(source), { sourceCellId: "cell:0:0" }),
      deletePlainColumn(parseAsciiDocTable(source), { sourceCellId: "cell:0:0" })
    ]) {
      expect(result.ok).toBe(false);
      expect(result.source).toBe(source);
      expect(result.diagnostics).toContainEqual(expect.objectContaining({
        code: "writeback.unsafe-column-metadata",
        severity: "error"
      }));
    }
  });

  it("keeps the last-column diagnostic ahead of cols metadata planning", () => {
    const source = "[cols=1*]\n|===\n| A\n|===\n";
    const result = deletePlainColumn(parseAsciiDocTable(source), { sourceCellId: "cell:0:0" });

    expect(result.ok).toBe(false);
    expect(result.source).toBe(source);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "writeback.delete-last-column",
      severity: "error"
    }));
  });

  it("expands vertical spans when inserting a row inside the span", () => {
    const table = parseAsciiDocTable("|===\n| A | B\n.2+| V | C\n| D\n|===\n");
    const result = insertPlainRowAfter(table, {
      sourceCellId: "cell:1:1"
    });

    expect(result).toEqual({
      ok: true,
      source: "|===\n| A | B\n.3+| V | C\n| \n| D\n|===\n",
      diagnostics: []
    });
  });

  it("shrinks vertical spans when deleting a covered row", () => {
    const table = parseAsciiDocTable("|===\n| A | B\n.3+| V | C\n| D\n| E\n|===\n");
    const result = deletePlainRow(table, {
      sourceCellId: "cell:2:0"
    });

    expect(result).toEqual({
      ok: true,
      source: "|===\n| A | B\n.2+| V | C\n| E\n|===\n",
      diagnostics: []
    });
  });

  it("blocks row delete when a vertical span starts on the deleted row", () => {
    const table = parseAsciiDocTable("|===\n| A | B\n.2+| V | C\n| D\n|===\n");
    const result = deletePlainRow(table, {
      sourceCellId: "cell:1:0"
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "writeback.delete-row-span-origin",
        severity: "error"
      })
    );
  });

  it("expands horizontal spans when inserting a column inside the span", () => {
    const table = parseAsciiDocTable("|===\n2+| H | C\n| A | B | C\n|===\n");
    const result = insertPlainColumnAfter(table, {
      sourceCellId: "cell:0:0"
    });

    expect(result).toEqual({
      ok: true,
      source: "|===\n3+| H | C\n| A |  | B | C\n|===\n",
      diagnostics: []
    });
  });

  it("shrinks horizontal spans when deleting a column inside the span", () => {
    const table = parseAsciiDocTable("|===\n3+| H | D\n| A | B | C | D\n|===\n");
    const result = deletePlainColumn(table, {
      sourceCellId: "cell:0:0"
    });

    expect(result).toEqual({
      ok: true,
      source: "|===\n2+| H | D\n| B | C | D\n|===\n",
      diagnostics: []
    });
  });

  it("updates rectangular spans for row and column structure edits", () => {
    const table = parseAsciiDocTable("|===\n2.2+| R | C\n| D\n|===\n");

    expect(insertPlainRowAfter(table, { sourceCellId: "cell:0:0" })).toEqual({
      ok: true,
      source: "|===\n2.3+| R | C\n| \n| D\n|===\n",
      diagnostics: []
    });
    expect(insertPlainColumnAfter(table, { sourceCellId: "cell:0:0" })).toEqual({
      ok: true,
      source: "|===\n3.2+| R | C\n| D\n|===\n",
      diagnostics: []
    });
    expect(deletePlainColumn(table, { sourceCellId: "cell:0:0" })).toEqual({
      ok: true,
      source: "|===\n.2+| R | C\n| D\n|===\n",
      diagnostics: []
    });
  });

  it("blocks row and column edits when block cells are present", () => {
    const table = parseAsciiDocTable("|===\n2+| A\n| B | C\n|===\n");
    const result = insertPlainRowAfter(table, {
      sourceCellId: "cell:1:0"
    });

    expect(result.ok).toBe(true);

    const blockTable = parseAsciiDocTable("|===\na| A | B\n| C | D\n|===\n");
    const blockResult = insertPlainRowAfter(blockTable, {
      sourceCellId: "cell:1:0"
    });

    expect(blockResult.ok).toBe(false);
    expect(blockResult.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "writeback.unsafe-structure-cell",
        severity: "error"
      })
    );
  });

  it("keeps batch replacement blocked for spanned cells", () => {
    const table = parseAsciiDocTable("|===\n2+| A\n|===\n");
    const result = replacePlainCellContents(table, [{ sourceCellId: "cell:0:0", contentRaw: " Bee" }]);

    expect(result.ok).toBe(false);
    expect(result.source).toBe(table.raw);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "writeback.unsafe-spanned-cell",
        severity: "error"
      })
    );
  });

  it("blocks targeted patch for block cells", () => {
    const table = parseAsciiDocTable("|===\na| A\n|===\n");
    const result = replacePlainCellContent(table, "cell:0:0", " Bee");

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "writeback.unsafe-block-cell",
        severity: "error"
      })
    );
  });

  it("patches only block cell content and preserves the block cell spec", () => {
    const table = parseAsciiDocTable("|===\na| A\n|===\n");
    const result = replaceBlockCellContent(table, {
      sourceCellId: "cell:0:0",
      contentRaw: " * updated"
    });

    expect(result.ok).toBe(true);
    expect(result.source).toBe("|===\na| * updated\n|===\n");
  });

  it("patches multiline block cell content without swallowing the next row", () => {
    const table = parseAsciiDocTable("|===\na| * item\n* detail\n| plain\n|===\n");
    const result = replaceBlockCellContent(table, {
      sourceCellId: "cell:0:0",
      contentRaw: " * updated\n* next"
    });

    expect(result.ok).toBe(true);
    expect(result.source).toBe("|===\na| * updated\n* next\n| plain\n|===\n");
  });

  it("preserves block whitespace, CRLF, and balanced nested delimiters", () => {
    const source = "[cols=2*]\r\n|===\r\na| old\r\n| next\r\n|===\r\n";
    const table = parseAsciiDocTable(source);
    const contentRaw = "  ----\r\n ..... \r\n....\r\n....\r\n ..... \r\n  ----  ";
    const result = replaceBlockCellContent(table, { sourceCellId: "cell:0:0", contentRaw });

    expect(result).toMatchObject({
      ok: true,
      source: `[cols=2*]\r\n|===\r\na|${contentRaw}\r\n| next\r\n|===\r\n`
    });
  });

  it("rejects outer table delimiters and unclosed delimited blocks in block content", () => {
    const table = parseAsciiDocTable("|===\na| old\n|===\n");
    for (const contentRaw of [" value\n |=== ", " ----\nunclosed"]) {
      const result = replaceBlockCellContent(table, { sourceCellId: "cell:0:0", contentRaw });
      expect(result).toMatchObject({
        ok: false,
        source: table.raw,
        diagnostics: [expect.objectContaining({ code: "writeback.unsafe-block-cell-content" })]
      });
    }
  });

  it("rejects block content that changes cell ownership after reparsing", () => {
    const table = parseAsciiDocTable("|===\na| old\n|===\n");
    const result = replaceBlockCellContent(table, { sourceCellId: "cell:0:0", contentRaw: " value | injected" });

    expect(result).toMatchObject({
      ok: false,
      source: table.raw,
      diagnostics: [expect.objectContaining({ code: "writeback.cell-replacement-validation-failed" })]
    });
  });

  it("converts a plain cell to a block cell with targeted source replacement", () => {
    const table = parseAsciiDocTable("[cols=2*]\n|===\n| A | B\n|===\n");
    const result = replacePlainCellWithBlockContent(table, {
      sourceCellId: "cell:0:0",
      contentRaw: " * item\n* next"
    });

    expect(result).toEqual({
      ok: true,
      source: "[cols=2*]\n|===\na| * item\n* next\n| B\n|===\n",
      diagnostics: []
    });
  });

  it("rejects plain-to-block conversion when inferred cardinality would change", () => {
    const table = parseAsciiDocTable("|===\n| A | B\n|===\n");
    const result = replacePlainCellWithBlockContent(table, {
      sourceCellId: "cell:0:0",
      contentRaw: " * item\n* next"
    });

    expect(result).toMatchObject({
      ok: false,
      source: table.raw,
      diagnostics: [expect.objectContaining({ code: "writeback.cell-replacement-validation-failed" })]
    });
  });

  it("uses table-local CRLF and CR boundaries for plain-to-block conversion", () => {
    const crlf = replacePlainCellWithBlockContent(parseAsciiDocTable("[cols=2*]\r\n|===\r\n| A | B\r\n|===\r\n"), {
      sourceCellId: "cell:0:0",
      contentRaw: " * one\r\n* two"
    });
    const cr = replacePlainCellWithBlockContent(parseAsciiDocTable("[cols=2*]\r|===\r| A | B\r|===\r"), {
      sourceCellId: "cell:0:0",
      contentRaw: " * one\r* two"
    });
    const mixed = replacePlainCellWithBlockContent(parseAsciiDocTable("[cols=2*]\n|===\r\n| A | B\n|===\n"), {
      sourceCellId: "cell:0:0",
      contentRaw: " * one\n* two"
    });

    expect(crlf).toMatchObject({ ok: true, source: "[cols=2*]\r\n|===\r\na| * one\r\n* two\r\n| B\r\n|===\r\n" });
    expect(cr).toMatchObject({ ok: true, source: "[cols=2*]\r|===\ra| * one\r* two\r| B\r|===\r" });
    expect(mixed).toMatchObject({ ok: true, source: "[cols=2*]\n|===\r\na| * one\n* two\r\n| B\n|===\n" });
  });

  it("blocks plain-to-block conversion for styled, spanned, and existing block cells", () => {
    const styled = replacePlainCellWithBlockContent(parseAsciiDocTable("|===\nm| Mono\n|===\n"), {
      sourceCellId: "cell:0:0",
      contentRaw: " * item"
    });
    const spanned = replacePlainCellWithBlockContent(parseAsciiDocTable("|===\n2+| Wide\n|===\n"), {
      sourceCellId: "cell:0:0",
      contentRaw: " * item"
    });
    const block = replacePlainCellWithBlockContent(parseAsciiDocTable("|===\na| * old\n|===\n"), {
      sourceCellId: "cell:0:0",
      contentRaw: " * item"
    });

    expect(styled).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "writeback.unsafe-block-convert-cell" })]
    });
    expect(spanned).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "writeback.unsafe-block-convert-cell" })]
    });
    expect(block).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "writeback.block-convert-already-block-cell" })]
    });
  });

  it("blocks block cell content patch for non-block and missing cells", () => {
    const table = parseAsciiDocTable("|===\n| A\n|===\n");

    expect(replaceBlockCellContent(table, { sourceCellId: "cell:0:0", contentRaw: " B" })).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "writeback.not-block-cell" })]
    });
    expect(replaceBlockCellContent(table, { sourceCellId: "cell:9:9", contentRaw: " B" })).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "writeback.cell-not-found" })]
    });
  });
});
