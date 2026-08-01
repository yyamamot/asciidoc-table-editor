import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emitNoopTable, parseAsciiDocTable, projectGridModel } from "../../src/core";
import { blockDelimiter, openDelimitedBlockDelimiter, updateDelimitedBlockStack } from "../../src/core/parser-blocks";

describe("delimited block state", () => {
  it.each(["----", "-----", "------", "....", ".....", "......", "====", "=====", "======", "____", "_____", "______", "****", "*****", "******", "++++", "+++++", "++++++", "////", "/////", "//////", "--"])(
    "recognizes %s as a delimiter",
    (delimiter) => {
      expect(blockDelimiter(`  ${delimiter}  `)).toBe(delimiter);
    }
  );

  it.each(["-", "---", ".", "...", "===", "___", "***", "+++", "///", "-=-="])(
    "does not recognize %s as a delimiter",
    (delimiter) => {
      expect(blockDelimiter(delimiter)).toBeUndefined();
    }
  );

  it("tracks different and same-family nested blocks with exact LIFO closing", () => {
    let stack: readonly string[] = [];
    for (const line of ["-----", "....", "......", "......", "....", "-----"]) {
      stack = updateDelimitedBlockStack(stack, line);
    }
    expect(stack).toEqual([]);
    expect(openDelimitedBlockDelimiter("-----\n------\n------\n-----")).toBeUndefined();
    expect(openDelimitedBlockDelimiter("-----\n------\n-----")).toBe("-----");
  });
});

describe("parseAsciiDocTable", () => {
  it("creates a lossless scaffold document", () => {
    const source = "|===\n| A | B\n|===\n";
    const parsed = parseAsciiDocTable(source);

    expect(parsed.raw).toBe(source);
    expect(parsed.range.start).toEqual({ offset: 0, line: 0, column: 0 });
    expect(parsed.range.end.offset).toBe(source.length);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.errors).toEqual([]);
  });

  it("round-trips the minimal basic fixture without changing source", () => {
    const source = fixture("minimal-basic", "source.adoc");
    const expected = fixture("minimal-basic", "expect.noop.adoc");
    const parsed = parseAsciiDocTable(source);

    expect(emitNoopTable(parsed)).toBe(expected);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].cells.map((cell) => cell.contentRaw)).toEqual([" A", " B"]);
    expect(source.slice(parsed.rows[0].cells[0].range.start.offset, parsed.rows[0].cells[0].range.end.offset)).toBe("| A");
  });

  it("keeps table appearance attributes as structured metadata", () => {
    const source = ".Quarterly Report\n[%autowidth]\n[cols=\"1,2a\",id=report-table,role=summary,width=75%,frame=ends,grid=rows,stripes=even]\n|===\n| A | B\n|===\n";
    const parsed = parseAsciiDocTable(source);

    expect(parsed.attributes.title).toMatchObject({ text: "Quarterly Report" });
    expect(parsed.attributes.options).toContain("autowidth");
    expect(parsed.attributes.named).toMatchObject({
      id: "report-table",
      role: "summary",
      width: "75%",
      frame: "ends",
      grid: "rows",
      stripes: "even"
    });
    expect(parsed.attributes.columns).toMatchObject([
      { index: 0, raw: "1", widthRaw: "1" },
      { index: 1, raw: "2a", widthRaw: "2", style: "a" }
    ]);
  });

  it("keeps variable table delimiters byte-for-byte on no-op round-trip", () => {
    const source = "[%autowidth.stretch]\n|====\n|Actor |Endpoint |Command |Description |System A |System B |System C\n|User |GET /status |show status |Status check |Yes |Yes |No\n|====\n";
    const parsed = parseAsciiDocTable(source);
    const grid = projectGridModel(parsed);

    expect(parsed.delimiter.startRaw).toBe("|====");
    expect(parsed.delimiter.endRaw).toBe("|====");
    expect(emitNoopTable(parsed)).toBe(source);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].cells).toHaveLength(7);
    expect(grid.columnCount).toBe(7);
    expect(grid.diagnostics).toEqual([]);
  });

  it("does not close a table with a different delimiter length", () => {
    const parsed = parseAsciiDocTable("|===\n| A | B\n|====\n");

    expect(parsed.errors).toContainEqual(expect.objectContaining({ code: "table.block.unclosed", severity: "error" }));
    expect(parsed.rows).toEqual([]);
  });

  it("keeps hard line break continuation lines in the same plain cell", () => {
    const source = "[cols=2*]\n|===\n|A |B +\n next\n|C |D\n|===\n";
    const parsed = parseAsciiDocTable(source);
    const grid = projectGridModel(parsed);

    expect(emitNoopTable(parsed)).toBe(source);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].cells.map((cell) => cell.contentRaw)).toEqual(["A", "B +\n next"]);
    expect(grid.cells[0][1]).toMatchObject({
      kind: "origin",
      contentRaw: "B +\n next"
    });
    expect(grid.diagnostics).toEqual([]);
  });

  it("keeps non-marker lines after a completed row as trailing cell continuation", () => {
    const source =
      "|===\n" +
      "2+|Section note {set:cellbgcolor:#dddddd}\n" +
      "|Label |Value\n" +
      "|Item 1 |https://example.invalid/item-1 +\n" +
      "continued note\n" +
      "{set:cellbgcolor:#ffffff}\n" +
      "|Item 2 |Done\n" +
      "|===\n";
    const parsed = parseAsciiDocTable(source);
    const grid = projectGridModel(parsed);

    expect(emitNoopTable(parsed)).toBe(source);
    expect(parsed.rows).toHaveLength(4);
    expect(parsed.rows[2].cells[1].contentRaw).toBe("https://example.invalid/item-1 +\ncontinued note\n{set:cellbgcolor:#ffffff}");
    expect(grid.cells[2][1]).toMatchObject({
      kind: "origin",
      contentRaw: "https://example.invalid/item-1 +\ncontinued note\n{set:cellbgcolor:#ffffff}"
    });
    expect(grid.diagnostics).toEqual([]);
  });

  it("keeps seven-column hard line break continuation cells without ragged diagnostics", () => {
    const source = fixtureCompat("hardbreak-continuation.adoc");
    const parsed = parseAsciiDocTable(source);
    const grid = projectGridModel(parsed);

    expect(emitNoopTable(parsed)).toBe(source);
    expect(parsed.rows).toHaveLength(2);
    expect(grid.columnCount).toBe(7);
    expect(parsed.rows[1].cells[6].contentRaw).toBe("First note +\n Second note +\n Third note");
    expect(grid.diagnostics).toEqual([]);
  });

  it.each(["comprehensive-psv", "custom-separator"])("round-trips %s without changing source", (fixtureId) => {
    const source = fixture(fixtureId, "source.adoc");
    const expected = fixture(fixtureId, "expect.noop.adoc");
    const parsed = parseAsciiDocTable(source);

    expect(emitNoopTable(parsed)).toBe(expected);
  });

  it.each([
    ["horizontal-span", { rowSpan: 1, colSpan: 2 }],
    ["vertical-span", { rowSpan: 2, colSpan: 1 }],
    ["rectangular-span", { rowSpan: 2, colSpan: 2 }]
  ])("parses %s cell spans and projects covered cells", (fixtureId, span) => {
    const source = fixture(fixtureId, "source.adoc");
    const parsed = parseAsciiDocTable(source);
    const firstCell = parsed.rows[0].cells[0];
    const grid = projectGridModel(parsed);

    expect(firstCell).toMatchObject(span);
    expect(firstCell.cellSpecRaw).not.toBe("");
    expect(grid.cells[0][0]).toMatchObject({ kind: "origin", ...span });
    expect(grid.cells.flat().some((cell) => cell?.kind === "covered")).toBe(true);
  });

  it("groups consecutive cell lines into one logical row by inferred column count", () => {
    const source = "|===\n| hello | world\n\n| Plain\n| Cell\n|===\n";
    const parsed = parseAsciiDocTable(source);
    const grid = projectGridModel(parsed);

    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].cells.map((cell) => cell.contentRaw)).toEqual([" hello", " world"]);
    expect(parsed.rows[1].cells.map((cell) => cell.contentRaw)).toEqual([" Plain", " Cell"]);
    expect(grid.cells[1][0]).toMatchObject({ kind: "origin", sourceCellId: "cell:1:0" });
    expect(grid.cells[1][1]).toMatchObject({ kind: "origin", sourceCellId: "cell:1:1" });
    expect(grid.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain("grid.ragged-row");
  });

  it("keeps list and note continuations in a completed plain cell", () => {
    const source =
      "[cols=\"1,2\",options=\"header\"]\n" +
      "|===\n" +
      "|Name |Description\n" +
      "|Item A |Summary line.\n" +
      "\n" +
      "* First point\n" +
      "* Second point\n" +
      "\n" +
      "NOTE: Additional note. +\n" +
      "More note text.\n" +
      "|Item B |Done\n" +
      "|===\n";
    const parsed = parseAsciiDocTable(source);
    const grid = projectGridModel(parsed);

    expect(emitNoopTable(parsed)).toBe(source);
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[1].cells[1].contentRaw).toBe(
      "Summary line.\n\n* First point\n* Second point\n\nNOTE: Additional note. +\nMore note text."
    );
    expect(grid.diagnostics).toEqual([]);
  });

  it("keeps row-span occupancy while grouping multiline logical rows", () => {
    const source = "|===\n| hello | world\n\n| Plain\n| Cell\n\n.2+| Vertical merge\n| X\n\n| Y\n|===\n";
    const parsed = parseAsciiDocTable(source);
    const grid = projectGridModel(parsed);

    expect(parsed.rows).toHaveLength(4);
    expect(parsed.rows[1].cells.map((cell) => cell.contentRaw)).toEqual([" Plain", " Cell"]);
    expect(parsed.rows[2].cells.map((cell) => cell.contentRaw)).toEqual([" Vertical merge", " X"]);
    expect(parsed.rows[3].cells.map((cell) => cell.contentRaw)).toEqual([" Y"]);
    expect(grid.cells[2][0]).toMatchObject({ kind: "origin", rowSpan: 2, sourceCellId: "cell:2:0" });
    expect(grid.cells[2][1]).toMatchObject({ kind: "origin", sourceCellId: "cell:2:1" });
    expect(grid.cells[3][0]).toMatchObject({ kind: "covered", coveredBy: "grid:cell:2:0" });
    expect(grid.cells[3][1]).toMatchObject({ kind: "origin", sourceCellId: "cell:3:0" });
  });

  it("uses the cols attribute to group one-cell physical lines", () => {
    const source = "[cols=3*]\n|===\n| A\n| B\n| C\n\n| D\n| E\n| F\n|===\n";
    const parsed = parseAsciiDocTable(source);
    const grid = projectGridModel(parsed);

    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].cells.map((cell) => cell.contentRaw)).toEqual([" A", " B", " C"]);
    expect(parsed.rows[1].cells.map((cell) => cell.contentRaw)).toEqual([" D", " E", " F"]);
    expect(parsed.attributes.columns).toEqual([
      { index: 0, raw: "" },
      { index: 1, raw: "" },
      { index: 2, raw: "" }
    ]);
    expect(grid.columnCount).toBe(3);
    expect(grid.columns).toHaveLength(3);
    expect(grid.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain("grid.ragged-row");
  });

  it("keeps column width, alignment, and style specs as metadata", () => {
    const source = "[cols=\"1,<,^,>,2a\"]\n|===\n| A | B | C | D | E\n|===\n";
    const parsed = parseAsciiDocTable(source);
    const grid = projectGridModel(parsed);

    expect(parsed.attributes.columns).toMatchObject([
      { index: 0, raw: "1", widthRaw: "1" },
      { index: 1, raw: "<", horizontalAlign: "left" },
      { index: 2, raw: "^", horizontalAlign: "center" },
      { index: 3, raw: ">", horizontalAlign: "right" },
      { index: 4, raw: "2a", widthRaw: "2", style: "a" }
    ]);
    expect(grid.columns).toEqual(parsed.attributes.columns);
  });

  it("reports cells missing from an explicit column count without synthesizing cells", () => {
    const parsed = parseAsciiDocTable("[cols=3*]\n|===\n| A\n|===\n");
    const grid = projectGridModel(parsed);

    expect(parsed.attributes.columnCount).toBe(3);
    expect(grid.columnCount).toBe(3);
    expect(grid.cells[0]).toHaveLength(1);
    expect(grid.diagnostics.filter((diagnostic) => diagnostic.code === "grid.ragged-row")).toHaveLength(2);
  });

  it("inherits column style and alignment when a cell spec does not override them", () => {
    const source = "[cols=\"h,m,s,e\"]\n|===\n| A | B | C | D\ns| Explicit strong d| Explicit default >| Explicit right | Inherited emphasis\n|===\n";
    const parsed = parseAsciiDocTable(source);
    const grid = projectGridModel(parsed);

    expect(grid.cells[0][0]).toMatchObject({ kind: "origin", style: "h" });
    expect(grid.cells[0][1]).toMatchObject({ kind: "origin", style: "m" });
    expect(grid.cells[0][2]).toMatchObject({ kind: "origin", style: "s" });
    expect(grid.cells[0][3]).toMatchObject({ kind: "origin", style: "e" });
    expect(grid.cells[1][0]).toMatchObject({ kind: "origin", style: "s" });
    expect(grid.cells[1][1]).toMatchObject({ kind: "origin", style: "d" });
    expect(grid.cells[1][2]).toMatchObject({ kind: "origin", style: "s", horizontalAlign: "right" });
    expect(grid.cells[1][3]).toMatchObject({ kind: "origin", style: "e" });
  });

  it("inherits column AsciiDoc style as block cell content without rewriting source", () => {
    const source = "[cols=\"2,2,5a\"]\n|===\n|Firefox\n|ブラウザ\n|FirefoxはオープンソースのWEBブラウザです。\n\n下記のような特徴があります。:\n\n* 標準仕様準拠\n* 高パフォーマンス\n* 高い可搬性\n\nhttp://getfirefox.com[Firefoxをダウンロードする]!\n|===\n";
    const parsed = parseAsciiDocTable(source);
    const grid = projectGridModel(parsed);

    expect(emitNoopTable(parsed)).toBe(source);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].cells[2]).toMatchObject({
      style: undefined,
      effectiveStyle: "a",
      isBlockContent: true
    });
    expect(parsed.rows[0].cells[2].cellSpecRaw).toBe("");
    expect(parsed.rows[0].cells[2].contentRaw).toContain("* 標準仕様準拠");
    expect(parsed.rows[0].cells[2].contentRaw).toContain("http://getfirefox.com[Firefoxをダウンロードする]!");
    expect(grid.cells[0][2]).toMatchObject({
      kind: "origin",
      editable: false,
      blockContent: true,
      style: "a"
    });
    expect(grid.diagnostics).toEqual([]);
  });

  it("keeps explicit cell metadata separate from inherited effective column metadata", () => {
    const parsed = parseAsciiDocTable("[cols=\"m,>s\"]\n|===\n| A ^| B\n|===\n");
    const grid = projectGridModel(parsed);

    expect(parsed.rows[0].cells[0]).toMatchObject({
      style: undefined,
      horizontalAlign: undefined,
      effectiveStyle: "m"
    });
    expect(parsed.rows[0].cells[1]).toMatchObject({
      style: undefined,
      horizontalAlign: "center",
      effectiveStyle: "s",
      effectiveHorizontalAlign: "center"
    });
    expect(grid.cells[0][0]).toMatchObject({ kind: "origin", style: "m" });
    expect(grid.cells[0][1]).toMatchObject({ kind: "origin", style: "s", horizontalAlign: "center" });
  });

  it("keeps cell style and alignment specs as metadata without diagnostics", () => {
    const parsed = parseAsciiDocTable("[cols=5*]\n|===\n^.^a| Rich >| Right h| Header l| Literal d| Default\n|===\n");
    const grid = projectGridModel(parsed);

    expect(parsed.rows[0].cells[0]).toMatchObject({
      cellSpecRaw: "^.^a",
      style: "a",
      horizontalAlign: "center",
      verticalAlign: "middle",
      errors: []
    });
    expect(parsed.rows[0].cells[1]).toMatchObject({
      cellSpecRaw: ">",
      horizontalAlign: "right",
      errors: []
    });
    expect(parsed.rows[0].cells.slice(2).map((cell) => cell.style)).toEqual(["h", "l", "d"]);
    expect(grid.cells[0][0]).toMatchObject({
      kind: "origin",
      style: "a",
      horizontalAlign: "center",
      verticalAlign: "middle"
    });
  });

  it("projects duplicate cell shorthand as separate plain origin cells", () => {
    const source = "|===\n2*| A | B\n|===\n";
    const parsed = parseAsciiDocTable(source);
    const grid = projectGridModel(parsed);

    expect(emitNoopTable(parsed)).toBe(source);
    expect(parsed.rows[0].cells.map((cell) => cell.contentRaw)).toEqual([" A", " A", " B"]);
    expect(parsed.rows[0].cells[0]).toMatchObject({ duplicateCount: 2, duplicateIndex: 0, cellSpecRaw: "2*" });
    expect(parsed.rows[0].cells[1]).toMatchObject({ duplicateCount: 2, duplicateIndex: 1, cellSpecRaw: "2*" });
    expect(grid.cells[0][0]).toMatchObject({ kind: "origin", sourceCellId: "cell:0:0", contentRaw: " A" });
    expect(grid.cells[0][1]).toMatchObject({ kind: "origin", sourceCellId: "cell:0:1", contentRaw: " A" });
  });

  it("projects duplicate cell shorthand with style and alignment", () => {
    const source = "|===\n2*>m| A\n|===\n";
    const parsed = parseAsciiDocTable(source);
    const grid = projectGridModel(parsed);

    expect(emitNoopTable(parsed)).toBe(source);
    expect(parsed.rows[0].cells).toHaveLength(2);
    expect(parsed.rows[0].cells[0]).toMatchObject({
      duplicateCount: 2,
      duplicateIndex: 0,
      cellSpecRaw: "2*>m",
      style: "m",
      horizontalAlign: "right"
    });
    expect(parsed.rows[0].cells[1]).toMatchObject({
      duplicateCount: 2,
      duplicateIndex: 1,
      cellSpecRaw: "2*>m",
      style: "m",
      horizontalAlign: "right"
    });
    expect(grid.cells[0][0]).toMatchObject({ kind: "origin", style: "m", horizontalAlign: "right" });
    expect(grid.cells[0][1]).toMatchObject({ kind: "origin", style: "m", horizontalAlign: "right" });
    expect(grid.diagnostics).toEqual([]);
  });

  it("marks mixed duplicate cell specs as unsupported diagnostics", () => {
    const parsed = parseAsciiDocTable("|===\n2*2+| A\n|===\n");

    expect(parsed.rows[0].cells[0].errors).toContainEqual(
      expect.objectContaining({
        code: "cell.spec.duplicate-unsupported",
        severity: "error"
      })
    );
  });

  it("keeps the column/cell spec support-matrix fixture stable", () => {
    const source = fixture("table-spec-column-cell-spec", "source.adoc");
    const parsed = parseAsciiDocTable(source);
    const grid = projectGridModel(parsed);

    expect(parsed.attributes.columns).toMatchObject([
      { index: 0, raw: "1", widthRaw: "1" },
      { index: 1, raw: "<", horizontalAlign: "left" },
      { index: 2, raw: "^", horizontalAlign: "center" },
      { index: 3, raw: ">", horizontalAlign: "right" },
      { index: 4, raw: "2a", widthRaw: "2", style: "a" }
    ]);
    expect(grid.cells[0][0]).toMatchObject({
      kind: "origin",
      role: "header",
      style: "h",
      horizontalAlign: "center",
      verticalAlign: "middle"
    });
    expect(grid.cells[0][4]).toMatchObject({
      kind: "origin",
      editable: false,
      blockContent: true,
      style: "a"
    });
    expect(grid.cells[1][1]).toMatchObject({
      kind: "origin",
      horizontalAlign: "left"
    });
    expect(grid.cells[1][2]).toMatchObject({
      kind: "origin",
      horizontalAlign: "center"
    });
    expect(grid.cells[1][3]).toMatchObject({
      kind: "origin",
      horizontalAlign: "right"
    });
    expect(grid.cells[1][4]).toMatchObject({
      kind: "origin",
      editable: false,
      blockContent: true,
      style: "a"
    });
    expect(grid.diagnostics).toEqual([]);
  });

  it("marks explicit header and footer rows from table options", () => {
    const source = "[options=\"header,footer\",cols=2*]\n|===\n| Name | Value\n\n| A | 1\n\n| Total | 1\n|===\n";
    const parsed = parseAsciiDocTable(source);
    const grid = projectGridModel(parsed);

    expect(parsed.attributes.options).toEqual(["header", "footer"]);
    expect(parsed.rows.map((row) => row.role)).toEqual(["header", "body", "footer"]);
    expect(grid.cells[0][0]).toMatchObject({ kind: "origin", role: "header" });
    expect(grid.cells[2][0]).toMatchObject({ kind: "origin", role: "footer" });
  });

  it("keeps the header/footer support-matrix fixture stable", () => {
    const source = fixture("table-spec-header-footer", "source.adoc");
    const parsed = parseAsciiDocTable(source);
    const grid = projectGridModel(parsed);

    expect(parsed.rows.map((row) => row.role)).toEqual(["header", "body", "body", "footer"]);
    expect(grid.cells[0][0]).toMatchObject({ kind: "origin", role: "header", contentRaw: " Name" });
    expect(grid.cells[3][0]).toMatchObject({ kind: "origin", role: "footer", contentRaw: " Total" });
    expect(grid.diagnostics).toEqual([]);
  });

  it("marks shorthand header rows and conservative implicit header rows", () => {
    const explicit = parseAsciiDocTable("[%header,cols=2*]\n|===\n| Name | Value\n\n| A | 1\n|===\n");
    const implicit = parseAsciiDocTable("[cols=2*]\n|===\n| Name | Value\n\n| A | 1\n|===\n");
    const noHeader = parseAsciiDocTable("[%noheader,cols=2*]\n|===\n| Name | Value\n\n| A | 1\n|===\n");

    expect(explicit.attributes.options).toEqual(["header"]);
    expect(explicit.rows.map((row) => row.role)).toEqual(["header", "body"]);
    expect(implicit.rows.map((row) => row.role)).toEqual(["header", "body"]);
    expect(noHeader.rows.map((row) => row.role)).toEqual(["body", "body"]);
  });

  it("supports a custom PSV separator without splitting pipe characters in content", () => {
    const source = "[cols=2*,separator=¦]\n|===\n¦ Pipe | content\n¦ Right cell\n|===\n";
    const parsed = parseAsciiDocTable(source);
    const grid = projectGridModel(parsed);

    expect(parsed.delimiter.separator).toBe("¦");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].cells.map((cell) => cell.contentRaw)).toEqual([" Pipe | content", " Right cell"]);
    expect(grid.cells[0][0]).toMatchObject({ kind: "origin", contentRaw: " Pipe | content" });
    expect(grid.cells[0][1]).toMatchObject({ kind: "origin", contentRaw: " Right cell" });
  });

  it("does not split escaped cell separators inside PSV content", () => {
    const source = "[cols=2*]\n|===\n| The default separator is \\|.\n| The next cell\n|===\n";
    const parsed = parseAsciiDocTable(source);

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].cells.map((cell) => cell.contentRaw)).toEqual([" The default separator is \\|.", " The next cell"]);
  });

  it("reports unsupported data table formats instead of treating them as editable PSV", () => {
    const source = "[format=csv]\n|===\nName,Value\nA,1\n|===\n";
    const parsed = parseAsciiDocTable(source);
    const grid = projectGridModel(parsed);

    expect(parsed.rows).toEqual([]);
    expect(grid.diagnostics).toContainEqual(expect.objectContaining({ code: "table.format.unsupported", severity: "error" }));
  });

  it("projects the comprehensive PSV fixture without structural diagnostics", () => {
    const source = fixture("comprehensive-psv", "source.adoc");
    const parsed = parseAsciiDocTable(source);
    const grid = projectGridModel(parsed);

    expect(grid.rowCount).toBe(8);
    expect(grid.columnCount).toBe(4);
    expect(grid.diagnostics).toEqual([]);
    expect(grid.cells[1][3]).toMatchObject({ kind: "origin", contentRaw: " The default separator is \\|." });
    expect(grid.cells[2][0]).toMatchObject({ kind: "origin", colSpan: 2 });
    expect(grid.cells[3][0]).toMatchObject({ kind: "origin", rowSpan: 2 });
    expect(grid.cells[5][0]).toMatchObject({ kind: "origin", rowSpan: 2, colSpan: 2 });
    expect(grid.cells[7][3]).toMatchObject({ kind: "origin", editable: false, blockContent: true, style: "a" });
  });

  it("keeps block cell continuation lines in the block cell content", () => {
    const parsed = parseAsciiDocTable("|===\na| * item\n* detail\n| plain\n|===\n");
    const grid = projectGridModel(parsed);

    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].cells[0]).toMatchObject({
      isBlockContent: true,
      contentRaw: " * item\n* detail"
    });
    expect(grid.cells[0][0]).toMatchObject({
      kind: "origin",
      blockContent: true,
      contentRaw: " * item\n* detail"
    });
    expect(grid.cells[1][0]).toMatchObject({
      kind: "origin",
      contentRaw: " plain"
    });
  });

  it("keeps cell-looking lines inside block cell delimited blocks", () => {
    const parsed = parseAsciiDocTable("|===\na| [source]\n----\n| not a table cell\n----\n| after\n|===\n");
    const grid = projectGridModel(parsed);

    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].cells[0]).toMatchObject({
      isBlockContent: true,
      contentRaw: " [source]\n----\n| not a table cell\n----"
    });
    expect(parsed.rows[1].cells[0]).toMatchObject({
      contentRaw: " after"
    });
    expect(grid.diagnostics).toEqual([]);
  });

  it.each(["-----", "......", "=====", "______", "*****", "++++++", "/////", "--"])(
    "keeps cell and table delimiters inside a %s block cell",
    (delimiter) => {
      const source =
        `|===\r\na| ${delimiter}\r\n` +
        "| not a table cell\r\n" +
        "2+| not a span\r\n" +
        "|===\r\n" +
        `${delimiter}\r\n` +
        "| after\r\n" +
        "|===\r\n";
      const parsed = parseAsciiDocTable(source);
      const grid = projectGridModel(parsed);

      expect(emitNoopTable(parsed)).toBe(source);
      expect(parsed.delimiter.endRaw).toBe("|===");
      expect(parsed.rows).toHaveLength(2);
      expect(parsed.rows[0].cells).toHaveLength(1);
      expect(parsed.rows[0].cells[0].contentRaw).toContain("|===\r\n");
      expect(parsed.rows[1].cells[0].contentRaw).toBe(" after");
      expect(grid.diagnostics).toEqual([]);
    }
  );

  it("keeps differently nested delimited blocks opaque until exact LIFO closure", () => {
    const source =
      "|===\n" +
      "a| -----\n" +
      "......\n" +
      "|===\n" +
      "......\n" +
      "-----\n" +
      "| after\n" +
      "|===\n";
    const parsed = parseAsciiDocTable(source);

    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].cells[0].contentRaw).toContain("......\n|===\n......\n-----");
    expect(parsed.rows[1].cells[0].contentRaw).toBe(" after");
    expect(projectGridModel(parsed).diagnostics).toEqual([]);
  });

  it("keeps the block-cell-boundary fixture from treating source lines as cells", () => {
    const source = fixture("block-cell-boundary", "source.adoc");
    const parsed = parseAsciiDocTable(source);
    const grid = projectGridModel(parsed);

    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].cells).toHaveLength(2);
    expect(parsed.rows[0].cells[0]).toMatchObject({
      isBlockContent: true,
      contentRaw: " [source]\n------\n.....\n| not a table cell\n2+| not a span\n.....\n------\n--\n| still not a table cell\n--"
    });
    expect(parsed.rows[0].cells[1]).toMatchObject({ contentRaw: " After block" });
    expect(grid.rowCount).toBe(2);
    expect(grid.columnCount).toBe(2);
    expect(grid.diagnostics).toEqual([]);
  });

  it("keeps nested table source inside a block cell instead of projecting a child grid", () => {
    const source = fixture("nested-table-non-goal", "source.adoc");
    const parsed = parseAsciiDocTable(source);
    const grid = projectGridModel(parsed);

    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].cells[1]).toMatchObject({
      isBlockContent: true
    });
    expect(parsed.rows[0].cells[1].contentRaw).toContain("! Inner A ! Inner B");
    expect(grid.cells[0][1]).toMatchObject({
      kind: "origin",
      editable: false,
      blockContent: true
    });
    expect(grid.diagnostics).toEqual([]);
  });

  it("reports ambiguous block cells with unclosed delimited blocks", () => {
    const parsed = parseAsciiDocTable("|===\na| [source]\n----\n| not a table cell\n|===\n");
    const grid = projectGridModel(parsed);

    expect(parsed.rows[0].cells[0].errors).toContainEqual(expect.objectContaining({
      code: "block-cell.unclosed-delimited-block",
      severity: "error"
    }));
    expect(grid.diagnostics).toContainEqual(expect.objectContaining({
      code: "block-cell.unclosed-delimited-block",
      severity: "error"
    }));
  });

  it.each([
    ["malformed-ragged-row", "grid.ragged-row"],
    ["malformed-overlapping-span", "grid.span-overflow"]
  ])("keeps source and reports %s diagnostics", (fixtureId, expectedCode) => {
    const source = fixture(fixtureId, "source.adoc");
    const expected = fixture(fixtureId, "expect.noop.adoc");
    const parsed = parseAsciiDocTable(source);
    const grid = projectGridModel(parsed);

    expect(emitNoopTable(parsed)).toBe(expected);
    expect(grid.diagnostics.map((diagnostic) => diagnostic.code)).toContain(expectedCode);
  });
});

function fixture(fixtureId: string, fileName: string): string {
  return readFileSync(join(process.cwd(), "fixtures", "lossless", fixtureId, fileName), "utf8");
}

function fixtureCompat(fileName: string): string {
  return readFileSync(join(process.cwd(), "fixtures", "compat", "asciidoctor-table-syntax", "sources", fileName), "utf8");
}
