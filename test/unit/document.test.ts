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

  it("detects Asciidoctor-compatible variable table delimiters", () => {
    const source = ".Functions\n[%autowidth.stretch]\n|====\n| A | B\n|====\n";
    const cursorOffset = source.indexOf("| A");
    const block = findAsciiDocTableBlock(source, cursorOffset);

    expect(block?.raw).toBe(source);
    expect(block?.range.start.offset).toBe(0);
  });

  it("does not pair different table delimiter lengths", () => {
    const source = "|===\n| A | B\n|====\n";

    expect(findAsciiDocTableBlocks(source)).toEqual([]);
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

  it.each([
    ["five-character listing", "-----"],
    ["six-character literal", "......"],
    ["five-character example", "====="],
    ["six-character quote", "______"],
    ["five-character sidebar", "*****"],
    ["six-character passthrough", "++++++"],
    ["five-character comment", "/////"],
    ["open block", "--"]
  ])("ignores table-looking source inside %s blocks", (_name, delimiter) => {
    const source = [
      delimiter,
      "|===",
      "| sample | not a live table",
      "|===",
      delimiter,
      "|===",
      "| A | B",
      "|===",
      ""
    ].join("\n");

    const blocks = findAsciiDocTableBlocks(source);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.raw).toBe("|===\n| A | B\n|===\n");
  });

  it("keeps table delimiters inside a block cell opaque", () => {
    const source = [
      "|===",
      "a| before",
      "-----",
      "|===",
      "| sample | not a closing delimiter",
      "|===",
      "-----",
      "| after",
      "|===",
      ""
    ].join("\n");

    const blocks = findAsciiDocTableBlocks(source);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.raw).toBe(source);
  });

  it("tracks different-family and different-length nested blocks", () => {
    const source = [
      "-----",
      "+++++",
      "------",
      "|===",
      "| nested | not a live table",
      "|===",
      "------",
      "+++++",
      "-----",
      "|===",
      "| A | B",
      "|===",
      ""
    ].join("\n");

    const blocks = findAsciiDocTableBlocks(source);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.raw).toBe("|===\n| A | B\n|===\n");
  });

  it("fails closed after an unclosed top-level delimited block", () => {
    const source = [
      "|===",
      "| before",
      "|===",
      "-----",
      "|===",
      "| hidden | after the unclosed block",
      "|===",
      ""
    ].join("\n");

    const blocks = findAsciiDocTableBlocks(source);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.raw).toBe("|===\n| before\n|===\n");
  });

  it("does not return a table whose block cell is unclosed", () => {
    const source = [
      "|===",
      "a| before",
      "-----",
      "|===",
      "| hidden | not a closing delimiter",
      "|===",
      ""
    ].join("\n");

    expect(findAsciiDocTableBlocks(source)).toEqual([]);
  });

  it("does not include a preceding literal block delimiter as table metadata", () => {
    const source = [
      "....",
      "literal content",
      "....",
      "|===",
      "| A | B",
      "|===",
      ""
    ].join("\n");

    const blocks = findAsciiDocTableBlocks(source);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.raw).toBe("|===\n| A | B\n|===\n");
  });

  it("keeps mismatched delimiter lengths open instead of cross-closing", () => {
    const source = [
      "-----",
      "------",
      "-----",
      "------",
      "|===",
      "| hidden | strict LIFO leaves the outer block open",
      "|===",
      ""
    ].join("\n");

    expect(findAsciiDocTableBlocks(source)).toEqual([]);
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
