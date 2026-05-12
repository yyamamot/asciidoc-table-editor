import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mapClipboardInlineAsciiDoc, parseClipboardTable } from "../../src/core";

describe("parseClipboardTable", () => {
  it("extracts a plain table from a Numbers-like HTML clipboard payload", () => {
    const result = parseClipboardTable({
      html: fixture("numbers-copied-table.html"),
      sourceLabel: "Numbers"
    });

    expect(result).toMatchObject({
      ok: true,
      source: "html",
      rowCount: 3,
      columnCount: 3
    });
    expect(result.cells.map((cell) => cell.text)).toEqual(["Name", "Value", "Status", "hello", "world", "ready", "test", "message", "draft"]);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "import.source-label", severity: "info" }));
  });

  it("keeps rowspan and colspan from browser HTML table clipboard payloads", () => {
    const result = parseClipboardTable({ html: fixture("browser-spans-table.html") });

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ source: "html", rowCount: 3, columnCount: 3 });
    expect(result.cells).toContainEqual(expect.objectContaining({ row: 0, col: 0, colSpan: 2, rowSpan: 1, text: "Horizontal" }));
    expect(result.cells).toContainEqual(expect.objectContaining({ row: 1, col: 0, colSpan: 1, rowSpan: 2, text: "Vertical" }));
  });

  it("extracts text from a Pages-like payload and records rich content diagnostics", () => {
    const result = parseClipboardTable({ html: fixture("pages-copied-table.html"), sourceLabel: "Pages" });

    expect(result.ok).toBe(true);
    expect(result.cells).toContainEqual(expect.objectContaining({ row: 1, col: 0, rowSpan: 2, text: "Block" }));
    expect(result.cells).toContainEqual(expect.objectContaining({ row: 1, col: 1, text: "Plain text" }));
    expect(result.cells).toContainEqual(expect.objectContaining({ row: 2, col: 1, text: "List item" }));
    expect(result.cells).toContainEqual(expect.objectContaining({ row: 1, col: 1, richContent: expect.objectContaining({ bold: true }) }));
    expect(result.cells).toContainEqual(expect.objectContaining({ row: 2, col: 1, richContent: expect.objectContaining({ list: true }) }));
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "import.bold-content-dropped", severity: "warning" }));
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "import.list-content-dropped", severity: "warning" }));
  });

  it("records rich metadata for inline styles, links, code, italics, and line breaks", () => {
    const result = parseClipboardTable({
      html: "<table><tr><td style=\"font-weight:bold\"><em>em</em><br><code>code</code> <a href=\"https://example.com\">link</a></td></tr></table>"
    });

    expect(result.ok).toBe(true);
    expect(result.cells[0]).toMatchObject({
      text: "em code link",
      richContent: {
        italic: true,
        monospace: true,
        link: true,
        lineBreak: true,
        style: true
      }
    });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        "import.italic-content-dropped",
        "import.monospace-content-dropped",
        "import.line-break-content-dropped",
        "import.style-dropped"
      ])
    );
  });

  it("keeps text segments for inline rich content mapping", () => {
    const result = parseClipboardTable({
      html: "<table><tr><td>A <b>B</b> <em>C</em> <code>D</code></td></tr></table>"
    });

    expect(result.ok).toBe(true);
    expect(result.cells[0].segments).toEqual([
      { text: "A " },
      { text: "B", marks: { bold: true } },
      { text: " " },
      { text: "C", marks: { italic: true } },
      { text: " " },
      { text: "D", marks: { monospace: true } }
    ]);
    expect(mapClipboardInlineAsciiDoc(result.cells[0])).toBe("A *B* _C_ `D`");
  });

  it("maps nested inline rich content in deterministic wrapper order", () => {
    const result = parseClipboardTable({
      html: "<table><tr><td><b><i>A</i></b></td></tr></table>"
    });

    expect(result.ok).toBe(true);
    expect(result.cells[0].segments).toEqual([
      { text: "A", marks: { bold: true, italic: true } }
    ]);
    expect(mapClipboardInlineAsciiDoc(result.cells[0])).toBe("*_A_*");
  });

  it("uses style-derived marks for inline mapping", () => {
    const result = parseClipboardTable({
      html: "<table><tr><td><span style=\"font-weight: 700; font-style: italic\">A</span></td></tr></table>"
    });

    expect(result.ok).toBe(true);
    expect(result.cells[0]).toMatchObject({
      richContent: {
        bold: true,
        italic: true,
        style: true
      },
      segments: [
        { text: "A", marks: { bold: true, italic: true } }
      ]
    });
    expect(mapClipboardInlineAsciiDoc(result.cells[0])).toBe("*_A_*");
  });

  it("maps safe links to AsciiDoc link syntax", () => {
    const result = parseClipboardTable({
      html: "<table><tr><td><a href=\"https://example.com\">Example</a></td><td><a href=\"https://example.com\">https://example.com</a></td><td><a href=\"mailto:user@example.com\">Mail</a></td></tr></table>"
    });

    expect(result.ok).toBe(true);
    expect(result.cells[0].segments).toEqual([{ text: "Example", linkHref: "https://example.com" }]);
    expect(mapClipboardInlineAsciiDoc(result.cells[0])).toBe("https://example.com[Example]");
    expect(mapClipboardInlineAsciiDoc(result.cells[1])).toBe("https://example.com");
    expect(mapClipboardInlineAsciiDoc(result.cells[2])).toBe("mailto:user@example.com[Mail]");
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain("import.link-content-dropped");
  });

  it("keeps inline marks inside mapped link labels", () => {
    const result = parseClipboardTable({
      html: "<table><tr><td><a href=\"https://example.com\"><b>Example</b></a></td></tr></table>"
    });

    expect(result.ok).toBe(true);
    expect(result.cells[0].segments).toEqual([{ text: "Example", marks: { bold: true }, linkHref: "https://example.com" }]);
    expect(mapClipboardInlineAsciiDoc(result.cells[0])).toBe("https://example.com[*Example*]");
  });

  it("falls back to text for unsafe links and keeps diagnostics", () => {
    const result = parseClipboardTable({
      html: "<table><tr><td><a href=\"javascript:alert(1)\">Bad</a></td><td><a href=\"/relative\">Relative</a></td><td><a href=\"#local\">Anchor</a></td></tr></table>"
    });

    expect(result.ok).toBe(true);
    expect(result.cells.map((cell) => mapClipboardInlineAsciiDoc(cell))).toEqual(["Bad", "Relative", "Anchor"]);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "import.link-content-dropped", severity: "warning" }));
  });

  it("parses representative Word for Mac clipboard table HTML", () => {
    const result = parseClipboardTable({ html: fixture("word-desktop-mac-table.html"), sourceLabel: "Word desktop Mac" });

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ source: "html", rowCount: 2, columnCount: 2 });
    expect(result.cells.map((cell) => cell.text)).toEqual(["Name", "Notes", "Alpha", "Item"]);
    expect(result.cells).toContainEqual(expect.objectContaining({ row: 0, col: 0, richContent: expect.objectContaining({ bold: true }) }));
    expect(result.cells).toContainEqual(expect.objectContaining({ row: 1, col: 1, richContent: expect.objectContaining({ list: true }) }));
  });

  it("parses representative Word web clipboard table HTML", () => {
    const result = parseClipboardTable({ html: fixture("word-web-chrome-table.html"), sourceLabel: "Word web Chrome" });

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ source: "html", rowCount: 2, columnCount: 2 });
    expect(result.cells.map((cell) => cell.text)).toEqual(["Name", "Link", "Alpha", "Beta"]);
    expect(result.cells).toContainEqual(expect.objectContaining({ row: 0, col: 0, richContent: expect.objectContaining({ style: true }) }));
    expect(result.cells).toContainEqual(expect.objectContaining({ row: 0, col: 1, richContent: expect.objectContaining({ link: true }) }));
  });

  it("parses representative Excel for Mac merged clipboard table HTML", () => {
    const result = parseClipboardTable({ html: fixture("excel-desktop-mac-merged-table.html"), sourceLabel: "Excel desktop Mac" });

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ source: "html", rowCount: 3, columnCount: 3 });
    expect(result.cells).toContainEqual(expect.objectContaining({ row: 0, col: 0, colSpan: 2, rowSpan: 1, text: "Merged header" }));
    expect(result.cells).toContainEqual(expect.objectContaining({ row: 1, col: 0, colSpan: 1, rowSpan: 2, text: "Group" }));
    expect(result.cells).toContainEqual(expect.objectContaining({ row: 0, col: 0, richContent: expect.objectContaining({ style: true }) }));
  });

  it("parses representative Excel web clipboard table HTML", () => {
    const result = parseClipboardTable({ html: fixture("excel-web-chrome-table.html"), sourceLabel: "Excel web Chrome" });

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ source: "html", rowCount: 2, columnCount: 3 });
    expect(result.cells.map((cell) => cell.text)).toEqual(["Name", "Value", "Status", "hello", "world", "ready"]);
    expect(result.cells).toContainEqual(expect.objectContaining({ row: 0, col: 0, richContent: expect.objectContaining({ style: true }) }));
  });

  it("falls back to TSV when HTML does not contain a table", () => {
    const result = parseClipboardTable({
      html: "<p>not a table</p>",
      text: fixture("plain-table.tsv")
    });

    expect(result).toMatchObject({
      ok: true,
      source: "tsv",
      rowCount: 3,
      columnCount: 3
    });
    expect(result.cells[4]).toMatchObject({ row: 1, col: 1, text: "world" });
  });

  it("blocks ragged HTML tables without producing a write-back candidate", () => {
    const result = parseClipboardTable({ html: fixture("ragged-table.html") });

    expect(result.ok).toBe(false);
    expect(result.source).toBe("html");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "import.ragged-row", severity: "error" }));
  });

  it("blocks empty clipboard data", () => {
    const result = parseClipboardTable({});

    expect(result).toMatchObject({
      ok: false,
      source: "none",
      rowCount: 0,
      columnCount: 0
    });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "import.clipboard-empty" }));
  });
});

function fixture(name: string): string {
  return readFileSync(join(process.cwd(), "fixtures", "import", "clipboard", name), "utf8");
}
