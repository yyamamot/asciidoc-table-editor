import { describe, expect, it } from "vitest";
import { applyWebviewMessage, createHarness } from "./webview-harness";

describe("webview rich clipboard paste interactions", () => {
  it("maps supported rich HTML table content to AsciiDoc inline syntax", async () => {
    const source = "|===\n| A | B | C\n|===\n";
    const harness = await createHarness(source);

    harness.cell("cell:0:0").focus();
    harness.pasteHtml("<table><tr><td>A <b>B</b></td><td><em>C</em></td><td><code>D</code></td></tr></table>", "A B\tC\tD");

    const message = harness.lastMessage("update-cell-contents");
    expect(message).toMatchObject({
      replacements: [
        { sourceCellId: "cell:0:0", contentRaw: " A *B*" },
        { sourceCellId: "cell:0:1", contentRaw: " _C_" },
        { sourceCellId: "cell:0:2", contentRaw: " `D`" }
      ]
    });
    expect(message.diagnostics ?? []).toHaveLength(0);
    expect(applyWebviewMessage(source, message)).toMatchObject({
      ok: true,
      source: "|===\n| A *B* | _C_ | `D`\n|===\n"
    });
  });

  it("maps links in HTML table paste to AsciiDoc link syntax", async () => {
    const source = "|===\n| A | B\n|===\n";
    const harness = await createHarness(source);

    harness.cell("cell:0:0").focus();
    harness.pasteHtml("<table><tr><td><b><i>Name</i></b></td><td><a href=\"https://example.com\">Value</a></td></tr></table>", "Name\tValue");

    const message = harness.lastMessage("update-cell-contents");
    expect(message).toMatchObject({
      replacements: [
        { sourceCellId: "cell:0:0", contentRaw: " *_Name_*" },
        { sourceCellId: "cell:0:1", contentRaw: " https://example.com[Value]" }
      ]
    });
    expect(message.diagnostics ?? []).toHaveLength(0);
  });

  it("falls back to text for unsupported links with diagnostics", async () => {
    const source = "|===\n| A | B\n|===\n";
    const harness = await createHarness(source);

    harness.cell("cell:0:0").focus();
    harness.pasteHtml("<table><tr><td><a href=\"javascript:alert(1)\">Bad</a></td><td><a href=\"/relative\">Relative</a></td></tr></table>", "Bad\tRelative");

    const message = harness.lastMessage("update-cell-contents");
    expect(message).toMatchObject({
      replacements: [
        { sourceCellId: "cell:0:0", contentRaw: " Bad" },
        { sourceCellId: "cell:0:1", contentRaw: " Relative" }
      ],
      diagnostics: [expect.objectContaining({ code: "paste.rich-content-dropped", severity: "warning" })]
    });
    expect(harness.diagnosticsText()).toContain("unsupported rich clipboard content");
  });

  it("maps style-derived rich HTML table content to AsciiDoc inline syntax", async () => {
    const source = "|===\n| A | B\n|===\n";
    const harness = await createHarness(source);

    harness.cell("cell:0:0").focus();
    harness.pasteHtml("<table><tr><td><span style=\"font-weight: 700; font-style: italic\">Name</span></td><td><span style=\"font-family: Menlo\">Code</span></td></tr></table>", "Name\tCode");

    const message = harness.lastMessage("update-cell-contents");
    expect(message).toMatchObject({
      replacements: [
        { sourceCellId: "cell:0:0", contentRaw: " *_Name_*" },
        { sourceCellId: "cell:0:1", contentRaw: " `Code`" }
      ],
      diagnostics: [expect.objectContaining({ code: "paste.rich-content-dropped", severity: "warning" })]
    });
  });

  it("maps a browser copied non-table bold fragment to AsciiDoc inline syntax", async () => {
    const source = "|===\n| A | B\n|===\n";
    const harness = await createHarness(source);
    const html = "<meta charset='utf-8'><b style=\"line-height: 17.6px; color: rgb(42, 42, 42); font-family: メイリオ, Arial, sans-serif; font-size: 16px;\">このように太字で</b>";

    harness.cell("cell:0:0").focus();
    harness.pasteHtml(html, "このように太字で");

    const message = harness.lastMessage("update-cell-contents");
    expect(message).toMatchObject({
      replacements: [
        { sourceCellId: "cell:0:0", contentRaw: " *このように太字で*" }
      ],
      diagnostics: [expect.objectContaining({ code: "paste.rich-content-dropped", severity: "warning" })]
    });
    expect(applyWebviewMessage(source, message)).toMatchObject({
      ok: true,
      source: "|===\n| *このように太字で* | B\n|===\n"
    });
  });

  it("maps supported non-table rich HTML fragments without diagnostics", async () => {
    const source = "|===\n| A | B\n|===\n";
    const harness = await createHarness(source);

    harness.cell("cell:0:0").focus();
    harness.pasteHtml("<strong>A</strong> <em>B</em> <code>C</code>", "A B C");

    const message = harness.lastMessage("update-cell-contents");
    expect(message).toMatchObject({
      replacements: [
        { sourceCellId: "cell:0:0", contentRaw: " *A* _B_ `C`" }
      ]
    });
    expect(message.diagnostics ?? []).toHaveLength(0);
  });

  it("maps nested non-table rich HTML fragments", async () => {
    const source = "|===\n| A | B\n|===\n";
    const harness = await createHarness(source);

    harness.cell("cell:0:0").focus();
    harness.pasteHtml("<b><i>A</i></b>", "A");

    const message = harness.lastMessage("update-cell-contents");
    expect(message).toMatchObject({
      replacements: [
        { sourceCellId: "cell:0:0", contentRaw: " *_A_*" }
      ]
    });
  });

  it("maps links in non-table HTML fragments to AsciiDoc link syntax", async () => {
    const source = "|===\n| A | B\n|===\n";
    const harness = await createHarness(source);

    harness.cell("cell:0:0").focus();
    harness.pasteHtml("<a href=\"https://example.com\">Example</a> <a href=\"mailto:user@example.com\">Mail</a>", "Example Mail");

    const message = harness.lastMessage("update-cell-contents");
    expect(message).toMatchObject({
      replacements: [
        { sourceCellId: "cell:0:0", contentRaw: " https://example.com[Example] mailto:user@example.com[Mail]" }
      ]
    });
    expect(message.diagnostics ?? []).toHaveLength(0);
  });

  it("keeps bare URL when link label equals href", async () => {
    const source = "|===\n| A | B\n|===\n";
    const harness = await createHarness(source);

    harness.cell("cell:0:0").focus();
    harness.pasteHtml("<a href=\"https://example.com\">https://example.com</a>", "https://example.com");

    const message = harness.lastMessage("update-cell-contents");
    expect(message).toMatchObject({
      replacements: [
        { sourceCellId: "cell:0:0", contentRaw: " https://example.com" }
      ]
    });
  });

  it("pastes unsupported rich non-table HTML with limited formatting diagnostics", async () => {
    const source = "|===\n| A | B\n|===\n";
    const harness = await createHarness(source);

    harness.cell("cell:0:0").focus();
    harness.pasteHtml("<p><font style=\"font: 10px Helvetica\"><b>Aaa</b></font></p>", "Aaa");

    const message = harness.lastMessage("update-cell-contents");
    expect(message).toMatchObject({
      replacements: [
        { sourceCellId: "cell:0:0", contentRaw: " *Aaa*" }
      ],
      diagnostics: [expect.objectContaining({ code: "paste.rich-content-dropped", severity: "warning" })]
    });
    expect(harness.diagnosticsText()).toContain("unsupported rich clipboard content");
    const result = applyWebviewMessage(source, message);
    const refreshed = await createHarness(result.source, message.selectedSourceCellId, undefined, {
      diagnostics: message.diagnostics
    });
    expect(refreshed.diagnosticsText()).toContain("paste.rich-content-dropped");
    expect(refreshed.diagnosticsText()).toContain("Unsupported rich clipboard content was simplified.");
  });

  it("extracts plain text from rich non-table HTML when text/plain is empty", async () => {
    const source = "|===\n| A | B\n|===\n";
    const harness = await createHarness(source);

    harness.cell("cell:0:0").focus();
    harness.pasteHtml("<p><font style=\"font: 10px Helvetica\"><b>Aaa</b></font></p>", "");

    const message = harness.lastMessage("update-cell-contents");
    expect(message).toMatchObject({
      replacements: [
        { sourceCellId: "cell:0:0", contentRaw: " *Aaa*" }
      ],
      diagnostics: [expect.objectContaining({ code: "paste.rich-content-dropped", severity: "warning" })]
    });
    expect(applyWebviewMessage(source, message)).toMatchObject({
      ok: true,
      source: "|===\n| *Aaa* | B\n|===\n"
    });
  });
});
