import { describe, expect, it } from "vitest";
import { formatAsciiDocTable, parseAsciiDocTable, recommendedTableFormatMode } from "../../src/core";

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

  it("removes redundant blank lines between rows in table-layout mode", () => {
    const result = formatAsciiDocTable(parseAsciiDocTable("|===\n| A | B\n\n| Alpha | Long\n|===\n"));

    expect(result).toMatchObject({ ok: true, changed: true });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected formatter success");
    }
    expect(result.source).toBe("|===\n| A     | B\n| Alpha | Long\n|===\n");
    expect(result.source).not.toContain("\n\n|");
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

  it("adds cols to an existing table attribute line in cell-per-line mode", () => {
    const result = formatAsciiDocTable(parseAsciiDocTable("[%header]\n|===\n| A | B\n|===\n"), { mode: "cell-per-line" });

    expect(result).toMatchObject({ ok: true });
    expect(result.source).toBe("[cols=2*,%header]\n|===\n| A\n| B\n|===\n");
  });

  it("keeps block cell content in cell-per-line mode", () => {
    const source = "[cols=2*]\n|===\na| * item\n* detail\n| Plain\n|===\n";
    const result = formatAsciiDocTable(parseAsciiDocTable(source), { mode: "cell-per-line" });

    expect(result).toMatchObject({ ok: true });
    expect(result.source).toContain("a| * item\n* detail");
    expect(result.source).toContain("| Plain");
  });

  it("recommends cell-per-line for wide or long-content tables", () => {
    expect(recommendedTableFormatMode(parseAsciiDocTable("|===\n| A | B | C | D\n|==="))).toBe("cell-per-line");
    expect(recommendedTableFormatMode(parseAsciiDocTable("|===\n| A | short\n|==="))).toBe("table-layout");
  });
});
