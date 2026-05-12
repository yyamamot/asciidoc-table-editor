import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findAsciiDocTableBlock, findAsciiDocTableBlocks } from "../../src/core";

describe("findAsciiDocTableBlock", () => {
  it("returns the cursor-contained table block", () => {
    const source = [
      "= Doc",
      "",
      "|===",
      "| A | B",
      "|===",
      "",
      "|===",
      "| C | D",
      "|===",
      ""
    ].join("\n");
    const cursorOffset = source.indexOf("| C");
    const block = findAsciiDocTableBlock(source, cursorOffset);

    expect(block?.raw).toBe("|===\n| C | D\n|===\n");
    expect(block?.range.start.offset).toBe(source.lastIndexOf("|===\n| C"));
  });

  it("includes contiguous table metadata lines in the returned block", () => {
    const source = [
      "= Doc",
      "",
      ".Inventory",
      "[cols=3*,separator=¦]",
      "|===",
      "¦ A",
      "¦ B",
      "¦ C",
      "|===",
      ""
    ].join("\n");
    const cursorOffset = source.indexOf("¦ B");
    const block = findAsciiDocTableBlock(source, cursorOffset);

    expect(block?.raw).toBe(".Inventory\n[cols=3*,separator=¦]\n|===\n¦ A\n¦ B\n¦ C\n|===\n");
    expect(block?.range.start.offset).toBe(source.indexOf(".Inventory"));
  });

  it("returns a metadata-prefixed table when the cursor is on the attribute line", () => {
    const source = ".Inventory\n[cols=2*]\n|===\n| A\n| B\n|===\n";
    const cursorOffset = source.indexOf("[cols");
    const block = findAsciiDocTableBlock(source, cursorOffset);

    expect(block?.raw).toBe(source);
  });

  it("returns undefined when the cursor is outside a table", () => {
    const source = "= Doc\n\n|===\n| A\n|===\n";

    expect(findAsciiDocTableBlock(source, 0)).toBeUndefined();
  });

  it("does not pair adjacent table delimiters when the cursor is between tables", () => {
    const source = [
      "|===",
      "| A",
      "|===",
      "",
      "between",
      "",
      "|===",
      "| B",
      "|===",
      ""
    ].join("\n");

    expect(findAsciiDocTableBlock(source, source.indexOf("between"))).toBeUndefined();
  });

  it("ignores table-looking source inside delimited code fences", () => {
    const source = [
      "= Doc",
      "",
      "[source,asciidoc]",
      "------",
      "|===",
      "| sample | not a live table",
      "|===",
      "------",
      "",
      "|===",
      "| A | B",
      "|===",
      ""
    ].join("\n");

    const blocks = findAsciiDocTableBlocks(source);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.raw).toBe("|===\n| A | B\n|===\n");
  });

  it("keeps the manual fixture samples and quick reference available as live tables", () => {
    const source = readFileSync(join(process.cwd(), "fixtures", "manual", "basic.adoc"), "utf8");
    const blocks = findAsciiDocTableBlocks(source);

    expect(blocks).toHaveLength(10);
    expect(blocks[0]?.raw).toContain("| hello | world | ready");
    expect(blocks[1]?.raw).toContain("2.2+| Rectangular merge");
    expect(blocks[2]?.raw).toContain("[options=\"header,footer\",cols=3*]");
    expect(blocks[3]?.raw).toContain("[cols=\"1,<,^,>,2a\"]");
    expect(blocks[4]?.raw).toContain("[cols=\"2,2,5a\"]");
    expect(blocks[9]?.raw).toContain("| not a table cell");
  });
});
