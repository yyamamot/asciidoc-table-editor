import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emitNoopTable, parseAsciiDocTable, projectGridModel, replacePlainCellStyles } from "../../src/core";
import type { LosslessTable, RetainedSegment, SourceRange } from "../../src/core";
import { blockDelimiter, openDelimitedBlockDelimiter, updateDelimitedBlockStack } from "../../src/core/parser-blocks";
import { createSourcePositionIndex, positionAt } from "../../src/core/parser-source";

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

describe("source position index", () => {
  it.each([
    ["LF with final newline", "\n", true],
    ["LF without final newline", "\n", false],
    ["CRLF with final newline", "\r\n", true],
    ["CRLF without final newline", "\r\n", false],
    ["bare CR with existing column semantics", "\r", true]
  ])("matches the UTF-16 prefix-scan oracle at every offset for %s", (_label, eol, finalNewline) => {
    const source = `ASCII漢🙂${eol}次é${finalNewline ? eol : ""}`;
    const index = createSourcePositionIndex(source);
    const emojiOffset = source.indexOf("🙂");

    expect(emojiOffset).toBeGreaterThanOrEqual(0);
    for (let offset = 0; offset <= source.length; offset += 1) {
      expect(positionAt(index, offset)).toEqual(positionAtForTest(source, offset));
    }
    expect(positionAt(index, emojiOffset + 1)).toEqual(positionAtForTest(source, emojiOffset + 1));
  });
});

describe("parseAsciiDocTable", () => {
  it("keeps every parser-owned range aligned with the prefix-scan position oracle", () => {
    const source =
      ".表🙂 title\r\n" +
      "[%header]\n" +
      "[cols=\"1,2a\",role=概要]\r\n" +
      "|===\n" +
      "| A | B\r\n" +
      "\n" +
      "// retained\n" +
      "x*| C | D\r\n" +
      "|===";
    const parsed = parseAsciiDocTable(source);

    expect(parsed.attributes.title).toBeDefined();
    expect(parsed.attributes.lines).not.toHaveLength(0);
    expect(parsed.attributes.entries).not.toHaveLength(0);
    expect(parsed.rows).not.toHaveLength(0);
    expect(parsed.rows.flatMap((row) => row.cells)).not.toHaveLength(0);
    expect([...parsed.retained, ...parsed.rows.flatMap((row) => row.retained)]).not.toHaveLength(0);
    expect(parsed.rows.flatMap((row) => row.cells.flatMap((cell) => cell.errors))).not.toHaveLength(0);

    assertParserRangeIntegrity(source, parsed);
    expect(emitNoopTable(parsed)).toBe(source);
  });

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

  it.each(losslessSummaryFixtureIds())("matches the executable compact lossless summary for %s", (fixtureId) => {
    const source = fixture(fixtureId, "source.adoc");
    const expected = JSON.parse(fixture(fixtureId, "expect.lossless.summary.json")) as unknown;
    const parsed = parseAsciiDocTable(source);

    expect(compactLosslessSummary(parsed)).toEqual(expected);
  });

  it("materializes table and row retained segments in source order without overlapping canonical owners", () => {
    const source =
      "unclaimed preface\n" +
      "// table comment\n" +
      "[cols=2*]\n" +
      "|===\n" +
      "| A | B\n" +
      "\n" +
      "// between rows\n" +
      "////\n" +
      "comment block interior\n" +
      "////\n" +
      "| C\n" +
      "// row comment\n" +
      "| D\n" +
      "|===\n";
    const parsed = parseAsciiDocTable(source);

    expect(parsed.retained.map(({ nodeId, kind, raw }) => ({ nodeId, kind, raw }))).toEqual([
      { nodeId: "retained:table:0", kind: "unknown", raw: "unclaimed preface\n" },
      { nodeId: "retained:table:1", kind: "comment", raw: "// table comment\n" },
      { nodeId: "retained:table:2", kind: "raw", raw: "\n" },
      { nodeId: "retained:table:3", kind: "separator", raw: "|===\n" },
      { nodeId: "retained:table:4", kind: "blank", raw: "\n" },
      { nodeId: "retained:table:5", kind: "comment", raw: "// between rows\n" },
      { nodeId: "retained:table:6", kind: "comment", raw: "////\n" },
      { nodeId: "retained:table:7", kind: "comment", raw: "comment block interior\n" },
      { nodeId: "retained:table:8", kind: "comment", raw: "////\n" },
      { nodeId: "retained:table:9", kind: "separator", raw: "|===\n" }
    ]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].retained.map(({ nodeId, kind, raw }) => ({ nodeId, kind, raw }))).toEqual([
      { nodeId: "retained:row:0:0", kind: "raw", raw: " " },
      { nodeId: "retained:row:0:1", kind: "raw", raw: "\n" }
    ]);
    expect(parsed.rows[1].retained.map(({ nodeId, kind, raw }) => ({ nodeId, kind, raw }))).toEqual([
      { nodeId: "retained:row:1:0", kind: "raw", raw: "\n" },
      { nodeId: "retained:row:1:1", kind: "comment", raw: "// row comment\n" },
      { nodeId: "retained:row:1:2", kind: "raw", raw: "\n" }
    ]);
    assertRetainedIntegrity(source, parsed);
    expect(emitNoopTable(parsed)).toBe(source);
  });

  it.each([
    ["LF", "\n", true],
    ["CRLF", "\r\n", true],
    ["CRLF without final newline", "\r\n", false]
  ])("preserves %s retained line endings and final newline", (_label, eol, finalNewline) => {
    const source = `[cols=2*]${eol}|===${eol}| A | B${eol}${eol}| C | D${eol}|===${finalNewline ? eol : ""}`;
    const parsed = parseAsciiDocTable(source);
    const retained = [
      ...parsed.retained,
      ...parsed.rows.flatMap((row) => row.retained)
    ];

    assertRetainedIntegrity(source, parsed);
    expect(retained.some((segment) => segment.kind === "blank" && segment.raw === eol)).toBe(true);
    expect(parsed.retained.filter((segment) => segment.kind === "separator").map((segment) => segment.raw)).toEqual([
      `|===${eol}`,
      `|===${finalNewline ? eol : ""}`
    ]);
    expect(emitNoopTable(parsed)).toBe(source);
  });

  it("retains a body without source cells at table scope without creating empty rows", () => {
    const source = "[cols=2*]\n|===\n// body comment\norphan body source\n|===\n";
    const parsed = parseAsciiDocTable(source);

    expect(parsed.rows).toEqual([]);
    expect(parsed.retained.map(({ kind, raw }) => ({ kind, raw }))).toEqual([
      { kind: "raw", raw: "\n" },
      { kind: "separator", raw: "|===\n" },
      { kind: "comment", raw: "// body comment\n" },
      { kind: "unknown", raw: "orphan body source\n" },
      { kind: "separator", raw: "|===\n" }
    ]);
    assertRetainedIntegrity(source, parsed);
    expect(emitNoopTable(parsed)).toBe(source);
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
    expect(retainedRaw(parsed)).not.toContain(" next");
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
    expect(retainedRaw(parsed)).not.toContain("{set:cellbgcolor:#ffffff}");
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
    expect(retainedRaw(parsed)).not.toContain("* First point");
    expect(retainedRaw(parsed)).not.toContain("NOTE: Additional note");
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

  it.each(["a", "d", "e", "h", "l", "m", "s"])("recognizes known cell style %s without diagnostics", (style) => {
    const source = `|===\n${style}| Styled\n|===\n`;
    const parsed = parseAsciiDocTable(source);

    expect(parsed.rows[0].cells[0]).toMatchObject({
      cellSpecRaw: style,
      style,
      errors: []
    });
    expect(emitNoopTable(parsed)).toBe(source);
  });

  it("retains an unknown cell style and blocks structured style edits", () => {
    const source = "|===\nz| Unknown\n|===\n";
    const parsed = parseAsciiDocTable(source);
    const cell = parsed.rows[0].cells[0];
    const result = replacePlainCellStyles(parsed, {
      sourceCellIds: [cell.nodeId],
      style: "m"
    });

    expect(cell).toMatchObject({
      cellSpecRaw: "z",
      style: undefined,
      errors: [expect.objectContaining({ code: "cell.spec.unsupported", severity: "warning" })]
    });
    expect(emitNoopTable(parsed)).toBe(source);
    expect(result).toMatchObject({
      ok: false,
      source,
      diagnostics: [expect.objectContaining({ code: "writeback.unsafe-cell-diagnostics" })]
    });
  });

  it("retains unknown style raw while interpreting span and alignment", () => {
    const source = fixture("malformed-unknown-cell-spec", "source.adoc");
    const expected = fixture("malformed-unknown-cell-spec", "expect.noop.adoc");
    const expectedDiagnostics = JSON.parse(fixture("malformed-unknown-cell-spec", "expect.diagnostics.json")) as Array<{
      code: string;
      severity: string;
    }>;
    const parsed = parseAsciiDocTable(source);
    const grid = projectGridModel(parsed);
    const unknownCell = parsed.rows[0].cells[0];
    const knownCell = parsed.rows[0].cells[1];
    const cell = parsed.rows[1].cells[0];

    expect(unknownCell).toMatchObject({
      cellSpecRaw: "z",
      style: undefined,
      errors: [expect.objectContaining({ code: "cell.spec.unsupported", severity: "warning" })]
    });
    expect(knownCell).toMatchObject({ cellSpecRaw: "m", style: "m", errors: [] });

    expect(cell).toMatchObject({
      cellSpecRaw: "2+^.^z",
      colSpan: 2,
      rowSpan: 1,
      style: undefined,
      horizontalAlign: "center",
      verticalAlign: "middle"
    });
    expect(cell.errors).toMatchObject(expectedDiagnostics);
    expect(grid.cells[1][0]).toMatchObject({
      kind: "origin",
      colSpan: 2,
      style: undefined,
      horizontalAlign: "center",
      verticalAlign: "middle",
      diagnostics: expectedDiagnostics.map((diagnostic) => expect.objectContaining(diagnostic))
    });
    expect(grid.diagnostics).toHaveLength(2);
    expect(grid.diagnostics).toEqual(
      expect.arrayContaining(expectedDiagnostics.map((diagnostic) => expect.objectContaining(diagnostic)))
    );
    expect(grid.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain("grid.ragged-row");
    expect(grid.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain("grid.span-overflow");
    expect(emitNoopTable(parsed)).toBe(expected);
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
    assertRetainedIntegrity(source, parsed);
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
    expect(retainedRaw(parsed)).not.toContain("* detail");
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

function losslessSummaryFixtureIds(): string[] {
  const root = join(process.cwd(), "fixtures", "lossless");
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, "expect.lossless.summary.json")))
    .map((entry) => entry.name)
    .sort();
}

function compactLosslessSummary(table: LosslessTable): unknown {
  const grid = projectGridModel(table);
  const rows = table.rows.map((row) => ({
    nodeId: row.nodeId,
    cellOrder: row.cells.map((cell) => cell.nodeId),
    retained: row.retained.map(compactRetained)
  }));
  const cells = table.rows.flatMap((row) =>
    row.cells.map((cell) => ({
      nodeId: cell.nodeId,
      cellSpecRaw: cell.cellSpecRaw,
      rowSpan: cell.rowSpan,
      colSpan: cell.colSpan,
      contentRaw: cell.contentRaw,
      errors: cell.errors.map(({ code, severity }) => ({ code, severity }))
    }))
  );
  const tokenKindsSeen = Array.from(
    new Set([
      table.kind,
      ...table.retained.map((segment) => segment.kind),
      ...table.rows.flatMap((row) => [row.kind, ...row.retained.map((segment) => segment.kind), ...row.cells.map((cell) => cell.kind)])
    ])
  );

  return {
    nodeId: table.nodeId,
    kind: table.kind,
    raw: table.raw,
    range: compactRange(table.range),
    rowCount: table.rows.length,
    rowOrder: table.rows.map((row) => row.nodeId),
    rows,
    cells,
    retained: table.retained.map(compactRetained),
    documentErrors: table.errors.map(({ code, severity }) => ({ code, severity })),
    tokenKindsSeen,
    projectable: !grid.diagnostics.some((diagnostic) => diagnostic.severity === "error")
  };
}

function compactRetained(segment: RetainedSegment): unknown {
  return {
    nodeId: segment.nodeId,
    kind: segment.kind,
    raw: segment.raw,
    range: compactRange(segment.range)
  };
}

function compactRange(range: SourceRange): { start: number; end: number } {
  return { start: range.start.offset, end: range.end.offset };
}

function assertRetainedIntegrity(source: string, table: LosslessTable): void {
  const allRetained = [
    ...table.retained,
    ...table.rows.flatMap((row) => row.retained)
  ];
  expect(new Set(allRetained.map((segment) => segment.nodeId)).size).toBe(allRetained.length);
  for (const segment of allRetained) {
    expect(source.slice(segment.range.start.offset, segment.range.end.offset)).toBe(segment.raw);
    expect(segment.range.start).toEqual(positionAtForTest(source, segment.range.start.offset));
    expect(segment.range.end).toEqual(positionAtForTest(source, segment.range.end.offset));
  }
  expect(table.retained.map((segment) => segment.range.start.offset)).toEqual(
    [...table.retained].map((segment) => segment.range.start.offset).sort((left, right) => left - right)
  );
  assertNonOverlapping([
    ...table.retained.map((segment) => segment.range),
    ...(table.attributes.title === undefined ? [] : [table.attributes.title.range]),
    ...table.attributes.lines.map((line) => line.range),
    ...table.rows.map((row) => row.range)
  ]);
  for (const row of table.rows) {
    expect(row.retained.map((segment) => segment.range.start.offset)).toEqual(
      [...row.retained].map((segment) => segment.range.start.offset).sort((left, right) => left - right)
    );
    assertNonOverlapping([
      ...row.retained.map((segment) => segment.range),
      ...row.cells
        .filter((cell) => cell.duplicateIndex === undefined || cell.duplicateIndex === 0)
        .map((cell) => cell.range)
    ]);
  }
}

function assertParserRangeIntegrity(source: string, table: LosslessTable): void {
  const assertRange = (range: SourceRange): void => {
    expect(range.start).toEqual(positionAtForTest(source, range.start.offset));
    expect(range.end).toEqual(positionAtForTest(source, range.end.offset));
  };
  const assertOwnedRaw = (range: SourceRange, raw: string): void => {
    assertRange(range);
    expect(source.slice(range.start.offset, range.end.offset)).toBe(raw);
  };

  assertOwnedRaw(table.range, table.raw);
  if (table.attributes.title !== undefined) {
    assertOwnedRaw(table.attributes.title.range, table.attributes.title.raw);
    assertRange(table.attributes.title.valueRange);
    expect(source.slice(table.attributes.title.valueRange.start.offset, table.attributes.title.valueRange.end.offset)).toBe(
      table.attributes.title.text
    );
  }
  for (const line of table.attributes.lines) {
    assertOwnedRaw(line.range, line.raw);
    for (const entry of line.entries) {
      assertOwnedRaw(entry.range, entry.raw);
      if (entry.valueRange !== undefined) {
        assertRange(entry.valueRange);
        expect(source.slice(entry.valueRange.start.offset, entry.valueRange.end.offset)).toBe(entry.value);
      }
    }
  }
  for (const row of table.rows) {
    assertOwnedRaw(row.range, row.raw);
    for (const cell of row.cells) {
      assertOwnedRaw(cell.range, cell.raw);
      for (const diagnostic of cell.errors) {
        if (diagnostic.range !== undefined) {
          assertRange(diagnostic.range);
        }
      }
    }
    for (const segment of row.retained) {
      assertOwnedRaw(segment.range, segment.raw);
    }
    for (const diagnostic of row.errors) {
      if (diagnostic.range !== undefined) {
        assertRange(diagnostic.range);
      }
    }
  }
  for (const segment of table.retained) {
    assertOwnedRaw(segment.range, segment.raw);
  }
  for (const diagnostic of table.errors) {
    if (diagnostic.range !== undefined) {
      assertRange(diagnostic.range);
    }
  }
}

function retainedRaw(table: LosslessTable): string {
  return [...table.retained, ...table.rows.flatMap((row) => row.retained)].map((segment) => segment.raw).join("");
}

function positionAtForTest(source: string, offset: number): { offset: number; line: number; column: number } {
  let line = 0;
  let column = 0;
  for (let index = 0; index < offset; index += 1) {
    if (source[index] === "\n") {
      line += 1;
      column = 0;
    } else {
      column += 1;
    }
  }
  return { offset, line, column };
}

function assertNonOverlapping(ranges: SourceRange[]): void {
  const ordered = [...ranges].sort((left, right) => left.start.offset - right.start.offset || left.end.offset - right.end.offset);
  for (let index = 1; index < ordered.length; index += 1) {
    expect(ordered[index].start.offset).toBeGreaterThanOrEqual(ordered[index - 1].end.offset);
  }
}
