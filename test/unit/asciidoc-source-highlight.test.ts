import { describe, expect, it } from "vitest";
import { renderHighlightedAsciiDocSource } from "../../src/app";

describe("renderHighlightedAsciiDocSource", () => {
  it("highlights AsciiDoc table delimiters, cell operators, and attributes", () => {
    const html = renderHighlightedAsciiDocSource("[cols=2*]\n|===\n2+| A\n^m| Mono\n|===\n");

    expect(html).toContain('class="adoc-hl adoc-hl-attribute"');
    expect(html).toContain('class="adoc-hl adoc-hl-delimiter"');
    expect(html).toContain('class="adoc-hl adoc-hl-span"');
    expect(html).toContain('class="adoc-hl adoc-hl-style"');
    expect(html).toContain('class="adoc-hl adoc-hl-cell"');
  });

  it("highlights safe inline source without changing the text", () => {
    const source = "| *Strong* | _Emphasis_ | `Mono` | https://example.com[Link]\n";
    const html = renderHighlightedAsciiDocSource(source);

    expect(html).toContain('class="adoc-hl adoc-hl-strong"');
    expect(html).toContain('class="adoc-hl adoc-hl-emphasis"');
    expect(html).toContain('class="adoc-hl adoc-hl-mono"');
    expect(html).toContain('class="adoc-hl adoc-hl-link"');
    expect(html.replace(/<[^>]+>/gu, "")).toBe(source);
  });

  it("escapes source HTML before highlighting", () => {
    const html = renderHighlightedAsciiDocSource("| <script>alert(1)</script>\n");

    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});
