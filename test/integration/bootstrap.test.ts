import { describe, expect, it } from "vitest";
import { parseAsciiDocTable } from "../../src/core";

describe("bootstrap integration", () => {
  it("keeps source available for future round-trip gates", () => {
    const source = "|===\n2+| merged\n|===\n";
    expect(parseAsciiDocTable(source).raw).toBe(source);
  });
});
