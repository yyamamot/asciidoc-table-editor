import { describe, expect, it } from "vitest";
import { formatAsciiDocTable, parseAsciiDocTable, projectGridModel, recommendedTableFormatMode } from "../../src/core";

describe("formatAsciiDocTable", () => {
  it("aligns plain PSV table cells without touching delimiters", () => {
    const result = formatAsciiDocTable(parseAsciiDocTable("|===\n| A | Long\n| Alpha | B\n|===\n"));

    expect(result).toMatchObject({ ok: true, changed: true });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected formatter success");
    }
    expect(result.source).toBe("|===\n| A     | Long\n| Alpha | B\n|===\n");
    expect(result.summary.changedLineCount).toBe(1);
  });

  it("preserves variable table delimiters in table-layout mode", () => {
    const result = formatAsciiDocTable(parseAsciiDocTable("|====\n| A | Long\n| Alpha | B\n|====\n"));

    expect(result).toMatchObject({ ok: true, changed: true });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected formatter success");
    }
    expect(result.source).toBe("|====\n| A     | Long\n| Alpha | B\n|====\n");
  });

  it("removes redundant blank lines between rows in table-layout mode", () => {
    const result = formatAsciiDocTable(parseAsciiDocTable("|===\n| A | B\n\n| Alpha | Long\n|===\n"));

    expect(result).toMatchObject({ ok: true, changed: true });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected formatter success");
    }
    expect(result.source).toBe("[%header]\n|===\n| A     | B\n| Alpha | Long\n|===\n");
    expect(result.source).not.toContain("\n\n|");
    expect(parseAsciiDocTable(result.source).rows.map((row) => row.role)).toEqual(["header", "body"]);
  });

  it("preserves span, style, alignment, and duplicate shorthand specs", () => {
    const result = formatAsciiDocTable(parseAsciiDocTable("|===\n2+| H\n^m| Mono | X\n2*| D\n|===\n"));

    expect(result).toMatchObject({ ok: true });
    expect(result.source).toContain("2+| H");
    expect(result.source).toContain("^m| Mono");
    expect(result.source).toContain("2*| D");
  });

  it("preserves block cell row source instead of formatting block content", () => {
    const source = "|===\na| * item\n* detail\n| Plain\n|===\n";
    const result = formatAsciiDocTable(parseAsciiDocTable(source));

    expect(result).toMatchObject({ ok: true });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected formatter success");
    }
    expect(result.source).toContain("a| * item\n* detail");
    expect(result.summary.preservedRowCount).toBe(1);
  });

  it("preserves hard line break continuation rows instead of flattening multiline cells", () => {
    const source = "[cols=2*]\n|===\n| A | B +\n next\n| C | D\n|===\n";
    const result = formatAsciiDocTable(parseAsciiDocTable(source));

    expect(result).toMatchObject({ ok: true });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected formatter success");
    }
    expect(result.source).toBe("[cols=2*]\n|===\n| A | B +\n next\n| C | D\n|===\n");
    expect(result.summary.preservedRowCount).toBe(1);
  });

  it("blocks unsupported data table formats", () => {
    const result = formatAsciiDocTable(parseAsciiDocTable("[format=csv]\n|===\nA,B\n|===\n"));

    expect(result).toMatchObject({ ok: false });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("table.format.unsupported");
  });

  it("blocks nested tables inside block cells", () => {
    const result = formatAsciiDocTable(parseAsciiDocTable("|===\na| nested\n|===\n| A\n|===\n|===\n"));

    expect(result).toMatchObject({ ok: false });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("format.nested-table");
  });

  it("formats a table as one source cell per line and adds cols when missing", () => {
    const result = formatAsciiDocTable(parseAsciiDocTable("|===\n| A | Long\n| Alpha | B\n|===\n"), { mode: "cell-per-line" });

    expect(result).toMatchObject({ ok: true, changed: true, mode: "cell-per-line" });
    expect(result.source).toBe("[cols=2*]\n|===\n| A\n| Long\n\n| Alpha\n| B\n|===\n");
  });

  it("preserves variable table delimiters in cell-per-line mode", () => {
    const result = formatAsciiDocTable(parseAsciiDocTable("|====\n| A | B\n|====\n"), { mode: "cell-per-line" });

    expect(result).toMatchObject({ ok: true, changed: true, mode: "cell-per-line" });
    expect(result.source).toBe("[cols=2*]\n|====\n| A\n| B\n|====\n");
  });

  it("keeps one blank line between logical rows in cell-per-line mode", () => {
    const result = formatAsciiDocTable(parseAsciiDocTable("|===\n| A | B\n| C | D\n| E | F\n|===\n"), { mode: "cell-per-line" });

    expect(result).toMatchObject({ ok: true });
    expect(result.source).toBe("[cols=2*]\n|===\n| A\n| B\n\n| C\n| D\n\n| E\n| F\n|===\n");
  });

  it("keeps existing cols attribute in cell-per-line mode", () => {
    const source = "[cols=2*]\n|===\n| A | B\n|===\n";
    const result = formatAsciiDocTable(parseAsciiDocTable(source), { mode: "cell-per-line" });

    expect(result).toMatchObject({ ok: true });
    expect(result.source).toBe("[cols=2*]\n|===\n| A\n| B\n|===\n");
  });

  it("adds a standalone cols attribute without rewriting existing table attributes", () => {
    const result = formatAsciiDocTable(parseAsciiDocTable("[%header]\n|===\n| A | B\n|===\n"), { mode: "cell-per-line" });

    expect(result).toMatchObject({ ok: true });
    expect(result.source).toBe("[%header]\n[cols=2*]\n|===\n| A\n| B\n|===\n");
  });

  it("preserves custom column widths, alignment, styles, quotes, and attribute ordering", () => {
    const source = ".Custom\r\n[%header]\r\n[cols='1<,2^m,3>a']\r\n|===\r\n| A | B | C\r\n| D | E | F\r\n|===\r\n";
    const result = formatAsciiDocTable(parseAsciiDocTable(source), { mode: "cell-per-line" });

    expect(result).toMatchObject({ ok: true });
    expect(result.source).toBe(".Custom\r\n[%header]\r\n[cols='1<,2^m,3>a']\r\n|===\r\n| A\r\n| B\r\n| C\r\n\r\n| D\r\n| E\r\n| F\r\n|===\r\n");
    const reparsed = parseAsciiDocTable(result.source);
    expect(reparsed.attributes.entries.find((entry) => entry.kind === "named" && entry.name === "cols")).toMatchObject({
      raw: "cols='1<,2^m,3>a'",
      value: "1<,2^m,3>a",
      quote: "'"
    });
    expect(reparsed.rows.map((row) => row.role)).toEqual(["header", "body"]);
  });

  it.each(["table-layout", "cell-per-line"] as const)("preserves implicit header row roles in %s mode", (mode) => {
    const source = "|===\n| Name | Value\n\n| Alpha | 1\n|===\n";
    const before = parseAsciiDocTable(source);
    const result = formatAsciiDocTable(before, { mode });

    expect(result).toMatchObject({ ok: true });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected formatter success");
    }
    expect(parseAsciiDocTable(result.source).rows.map((row) => row.role)).toEqual(before.rows.map((row) => row.role));
  });

  it.each(["header", "noheader", "footer"] as const)("preserves the explicit %s option", (option) => {
    const source = `[%${option}]\n|===\n| A | B\n| C | D\n|===\n`;
    const result = formatAsciiDocTable(parseAsciiDocTable(source), { mode: "cell-per-line" });

    expect(result).toMatchObject({ ok: true });
    expect(result.source).toBe(`[%${option}]\n[cols=2*]\n|===\n| A\n| B\n\n| C\n| D\n|===\n`);
    expect(parseAsciiDocTable(result.source).attributes.options).toContain(option);
  });

  it("preserves named options, stacked attributes, title, and CRLF exactly", () => {
    const source = '.Options\r\n[role=wide]\r\n[options="header,footer"]\r\n|===\r\n| A | B\r\n| C | D\r\n|===\r\n';
    const result = formatAsciiDocTable(parseAsciiDocTable(source), { mode: "cell-per-line" });

    expect(result).toMatchObject({ ok: true });
    expect(result.source).toBe('.Options\r\n[role=wide]\r\n[options="header,footer"]\r\n[cols=2*]\r\n|===\r\n| A\r\n| B\r\n\r\n| C\r\n| D\r\n|===\r\n');
  });

  it("rejects row-role drift atomically", () => {
    const source = "|===\n| A | B\n| C | D\n|===\n";
    const table = parseAsciiDocTable(source);
    table.rows[0].role = "footer";

    const result = formatAsciiDocTable(table);

    expect(result).toMatchObject({ ok: false, source });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["format.row-role-changed"]);
  });

  it("rejects column semantic drift atomically", () => {
    const source = "[cols=2*]\n|===\n| A | B\n| C | D\n|===\n";
    const table = parseAsciiDocTable(source);
    table.attributes.columns[0].style = "m";

    const result = formatAsciiDocTable(table, { mode: "cell-per-line" });

    expect(result).toMatchObject({ ok: false, source });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["format.column-semantics-changed"]);
  });

  it("keeps block cell content in cell-per-line mode", () => {
    const source = "[cols=2*]\n|===\na| * item\n* detail\n| Plain\n|===\n";
    const result = formatAsciiDocTable(parseAsciiDocTable(source), { mode: "cell-per-line" });

    expect(result).toMatchObject({ ok: true });
    expect(result.source).toContain("a| * item\n* detail");
    expect(result.source).toContain("| Plain");
  });

  it.each([
    ["LF", "\n"],
    ["CRLF", "\r\n"]
  ])("preserves list block source including trailing whitespace with %s", (_label, eol) => {
    const source = `[cols=2*]${eol}` + `|===${eol}` + `a| * item  ${eol}` + `* detail\t${eol}` + `| Plain${eol}` + `|===${eol}`;
    const parsed = parseAsciiDocTable(source);
    const originalCell = parsed.rows[0].cells[0];
    const originalSlice = source.slice(originalCell.range.start.offset, originalCell.range.end.offset);
    const result = formatAsciiDocTable(parsed, { mode: "cell-per-line" });

    expect(result).toMatchObject({ ok: true, source });
    expect(result.source).toContain(`* item  ${eol}* detail\t`);
    const reparsed = parseAsciiDocTable(result.source);
    const reparsedCell = reparsed.rows[0].cells[0];
    expect(result.source.slice(reparsedCell.range.start.offset, reparsedCell.range.end.offset)).toBe(originalSlice);
    expect(reparsedCell).toMatchObject({
      raw: originalCell.raw,
      contentRaw: originalCell.contentRaw,
      isBlockContent: true
    });
  });

  it.each([
    ["LF", "\n"],
    ["CRLF", "\r\n"]
  ])("preserves delimited block source including trailing whitespace with %s", (_label, eol) => {
    const source =
      `[cols=2*]${eol}` +
      `|===${eol}` +
      `a| [source]${eol}` +
      `----${eol}` +
      `const value = 1;  ${eol}` +
      `return value;\t${eol}` +
      `----${eol}` +
      `| Plain${eol}` +
      `|===${eol}`;
    const parsed = parseAsciiDocTable(source);
    const originalCell = parsed.rows[0].cells[0];
    const originalSlice = source.slice(originalCell.range.start.offset, originalCell.range.end.offset);
    const result = formatAsciiDocTable(parsed, { mode: "cell-per-line" });

    expect(result).toMatchObject({ ok: true, source });
    expect(result.source).toContain(`const value = 1;  ${eol}return value;\t${eol}----`);
    const reparsed = parseAsciiDocTable(result.source);
    const reparsedCell = reparsed.rows[0].cells[0];
    expect(result.source.slice(reparsedCell.range.start.offset, reparsedCell.range.end.offset)).toBe(originalSlice);
    expect(reparsedCell).toMatchObject({
      raw: originalCell.raw,
      contentRaw: originalCell.contentRaw,
      isBlockContent: true
    });
  });

  it("preserves mixed block EOLs, body-external source, and a missing final newline", () => {
    const blockSlice = "a| * item  \n* detail\t";
    const source = ".Mixed EOL table\r\n" + "[cols=2*]\n" + "|===\r\n" + `${blockSlice}\r\n` + "| Plain\r\n" + "| C | D\n" + "|===";
    const result = formatAsciiDocTable(parseAsciiDocTable(source), { mode: "cell-per-line" });

    expect(result).toMatchObject({ ok: true, changed: true });
    expect(result.source.startsWith(".Mixed EOL table\r\n[cols=2*]\n|===\r\n")).toBe(true);
    expect(result.source).toContain(blockSlice);
    expect(result.source.endsWith("|===")).toBe(true);
    expect(result.source.endsWith("\n")).toBe(false);
    expect(result.source.endsWith("\r")).toBe(false);
  });

  it("reparses preserved block metadata and grid coordinates after cell-per-line formatting", () => {
    const source = "[cols=2*]\n" + "|===\n" + "a| * item  \n" + "* detail\t\n" + "| Plain\n" + "| C | D\n" + "|===\n";
    const original = parseAsciiDocTable(source);
    const originalBlock = original.rows[0].cells[0];
    const result = formatAsciiDocTable(original, { mode: "cell-per-line" });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected formatter success");
    }
    const reparsed = parseAsciiDocTable(result.source);
    const grid = projectGridModel(reparsed);
    const reparsedBlock = reparsed.rows[0].cells[0];

    expect(reparsed.attributes.columnCount).toBe(2);
    expect(reparsed.errors).toEqual([]);
    expect(reparsedBlock).toMatchObject({
      raw: originalBlock.raw,
      cellSpecRaw: "a",
      delimiterRaw: "|",
      contentRaw: originalBlock.contentRaw,
      isBlockContent: true
    });
    expect(result.source.slice(reparsedBlock.range.start.offset, reparsedBlock.range.end.offset)).toBe(originalBlock.raw);
    expect(grid).toMatchObject({ rowCount: 2, columnCount: 2, diagnostics: [] });
    expect(grid.cells[0][0]).toMatchObject({ kind: "origin", row: 0, col: 0, blockContent: true });
    expect(grid.cells[0][1]).toMatchObject({ kind: "origin", row: 0, col: 1, contentRaw: " Plain" });
    expect(grid.cells[1][0]).toMatchObject({ kind: "origin", row: 1, col: 0, contentRaw: " C" });
    expect(grid.cells[1][1]).toMatchObject({ kind: "origin", row: 1, col: 1, contentRaw: " D" });
  });

  it("blocks cell-per-line formatting atomically when a block cell canonical source is inconsistent", () => {
    const source = "[cols=2*]\n|===\na| * item\n* detail\n| Plain\n|===\n";
    const parsed = parseAsciiDocTable(source);
    parsed.rows[0].cells[0].raw = `${parsed.rows[0].cells[0].raw}tampered`;
    const result = formatAsciiDocTable(parsed, { mode: "cell-per-line" });

    expect(result).toMatchObject({ ok: false, source });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("format.unsafe-block-cell-source");
  });

  it.each([
    ["comment", "// retained between rows\n", "// retained between rows\n"],
    ["unknown", "// row boundary\nretained unknown source\n", "retained unknown source\n"]
  ])("blocks cell-per-line formatting atomically for unsafe %s retained content", (kind, betweenRows, retained) => {
    const source = `[cols=2*]\n|===\n| A | B\n${betweenRows}| C | D\n|===\n`;
    const parsed = parseAsciiDocTable(source);

    expect(parsed.retained.some((segment) => segment.kind === kind && segment.raw === retained)).toBe(true);
    const result = formatAsciiDocTable(parsed, { mode: "cell-per-line" });

    expect(result).toMatchObject({ ok: false, source });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("format.unsafe-retained-content");
  });

  it("recommends cell-per-line for wide or long-content tables", () => {
    expect(recommendedTableFormatMode(parseAsciiDocTable("|===\n| A | B | C | D\n|==="))).toBe("cell-per-line");
    expect(recommendedTableFormatMode(parseAsciiDocTable("|===\n| A | short\n|==="))).toBe("table-layout");
  });
});
