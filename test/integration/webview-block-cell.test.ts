import { describe, expect, it } from "vitest";
import { applyWebviewMessage, createHarness } from "./webview-harness";

describe("webview block cell paste interactions", () => {
  it("pastes non-table unordered list HTML as a new block cell", async () => {
    const source = "[cols=2*]\n|===\n| A | B\n| C | D\n|===\n";
    const harness = await createHarness(source);
    const html = [
      "<ul style=\"list-style-type: '—  '\">",
      "<li style=\"margin: 0\"><font style=\"font: 10px Hiragino\">A</font></li>",
      "<li style=\"margin: 0\"><font style=\"font: 10px Hiragino\">B</font></li>",
      "</ul>"
    ].join("");

    harness.cell("cell:0:0").focus();
    harness.pasteHtml(html, "A\nB");

    const message = harness.lastMessage("replace-cell-with-block-source");
    expect(message).toMatchObject({
      sourceCellId: "cell:0:0",
      contentRaw: " * A\n* B",
      diagnostics: [expect.objectContaining({ code: "paste.rich-content-dropped", severity: "warning" })]
    });
    expect(harness.diagnosticsText()).toContain("unsupported rich clipboard content");
    const result = applyWebviewMessage(source, message);
    expect(result).toMatchObject({
      ok: true,
      source: "[cols=2*]\n|===\na| * A\n* B\n| B\n| C | D\n|===\n"
    });
    const refreshed = await createHarness(result.source, message.selectedSourceCellId, undefined, {
      diagnostics: message.diagnostics
    });
    expect(refreshed.diagnosticsText()).toContain("paste.rich-content-dropped");
    expect(refreshed.diagnosticsText()).toContain("Unsupported rich clipboard content was simplified.");
    expect(refreshed.cell("cell:0:0").dataset.block).toBe("true");
    expect(refreshed.textarea("contentRaw").value).toBe("* A\n* B");
  });

  it("rejects an outer table delimiter when converting a plain cell to block source", async () => {
    const source = "|===\n| A | B\n|===\n";
    const result = applyWebviewMessage(source, {
      type: "replace-cell-with-block-source",
      sourceCellId: "cell:0:0",
      contentRaw: " * item\n|===\n* tail",
      selectedSourceCellId: "cell:0:0"
    });
    expect(result).toMatchObject({
      ok: false,
      source,
      diagnostics: [expect.objectContaining({
        code: "writeback.unsafe-block-cell-content",
        severity: "error"
      })]
    });
  });

  it("pastes non-table ordered list HTML as a new block cell with inline mapping", async () => {
    const source = "[cols=2*]\n|===\n| A | B\n| C | D\n|===\n";
    const harness = await createHarness(source);
    const html = "<ol><li><b>A</b></li><li><a href=\"https://example.com\">B</a></li></ol>";

    harness.cell("cell:0:0").focus();
    harness.pasteHtml(html, "");

    const message = harness.lastMessage("replace-cell-with-block-source");
    expect(message).toMatchObject({
      sourceCellId: "cell:0:0",
      contentRaw: " . *A*\n. https://example.com[B]"
    });
    expect(message.diagnostics ?? []).toHaveLength(0);
    expect(applyWebviewMessage(source, message)).toMatchObject({
      ok: true,
      source: "[cols=2*]\n|===\na| . *A*\n. https://example.com[B]\n| B\n| C | D\n|===\n"
    });
  });

  it("rejects plain-to-block conversion when implicit columns would change grid topology", async () => {
    const source = "|===\n| A | B\n| C | D\n|===\n";
    const harness = await createHarness(source);

    harness.cell("cell:0:0").focus();
    harness.pasteHtml("<ol><li>A</li><li>B</li></ol>", "A\nB");

    expect(applyWebviewMessage(source, harness.lastMessage("replace-cell-with-block-source"))).toMatchObject({
      ok: false,
      source,
      diagnostics: [expect.objectContaining({
        code: "writeback.cell-replacement-validation-failed",
        severity: "error"
      })]
    });
  });

  it("displays duplicate shorthand as editable cells and expands it on edit", async () => {
    const source = "|===\n2*| A\n|===\n";
    const harness = await createHarness(source);

    expect(harness.cell("cell:0:0").textContent).toContain("A");
    expect(harness.cell("cell:0:1").textContent).toContain("A");
    harness.cell("cell:0:1").dispatchEvent(new harness.window.MouseEvent("dblclick", { bubbles: true }) as unknown as Event);
    harness.cell("cell:0:1").textContent = "B";
    harness.keydown("Enter");

    const message = harness.lastMessage("update-cell-content");
    expect(message).toMatchObject({ sourceCellId: "cell:0:1", contentRaw: " B" });
    expect(applyWebviewMessage(source, message)).toMatchObject({
      ok: true,
      source: "|===\n| A | B\n|===\n"
    });
  });

  it("pastes an HTML table with imported spans", async () => {
    const source = "|===\n| A | B | C\n| D | E | F\n|===\n";
    const harness = await createHarness(source);

    harness.cell("cell:0:0").focus();
    harness.pasteHtml("<table><tr><td colspan=\"2\"><b>Wide</b></td><td><a href=\"https://example.com\">Tail</a></td></tr><tr><td>Next</td><td><code>Value</code></td><td>Done</td></tr></table>", "Wide\tTail\nNext\tValue\tDone");

    const message = harness.lastMessage("paste-imported-table");
    expect(message).toMatchObject({
      startSourceCellId: "cell:0:0",
      rowCount: 2,
      columnCount: 3,
      cells: [
        { row: 0, col: 0, rowSpan: 1, colSpan: 2, text: "*Wide*" },
        { row: 0, col: 2, rowSpan: 1, colSpan: 1, text: "https://example.com[Tail]" },
        { row: 1, col: 0, rowSpan: 1, colSpan: 1, text: "Next" },
        { row: 1, col: 1, rowSpan: 1, colSpan: 1, text: "`Value`" },
        { row: 1, col: 2, rowSpan: 1, colSpan: 1, text: "Done" }
      ]
    });
    expect(applyWebviewMessage(source, message)).toMatchObject({
      ok: true,
      source: "|===\n2+| *Wide*  | https://example.com[Tail]\n| Next | `Value` | Done\n|===\n"
    });
  });

  it("posts auto-expand paste when clipboard table exceeds the current grid", async () => {
    const source = "|===\n| A | B\n| C | D\n|===\n";
    const harness = await createHarness(source);

    harness.cell("cell:1:1").focus();
    harness.pasteHtml("<table><tr><td><b>x</b></td><td>y</td><td>z</td></tr><tr><td>p</td><td><em>q</em></td><td>r</td></tr></table>", "x\ty\tz\np\tq\tr");

    const message = harness.lastMessage("paste-rectangular-table");
    expect(message).toMatchObject({
      startSourceCellId: "cell:1:1",
      rows: [
        ["*x*", "y", "z"],
        ["p", "_q_", "r"]
      ],
      selectedSourceCellId: "cell:1:1"
    });
    expect(applyWebviewMessage(source, message)).toMatchObject({
      ok: true,
      source: "|===\n| A | B |  | \n| C | *x* | y | z\n|  | p | _q_ | r\n|===\n"
    });
  });

  it("posts auto-expand paste for TSV that exceeds the current grid", async () => {
    const source = "|===\n| A | B\n| C | D\n|===\n";
    const harness = await createHarness(source);

    harness.cell("cell:1:1").focus();
    harness.paste("x\ty\np\tq");

    const message = harness.lastMessage("paste-rectangular-table");
    expect(message).toMatchObject({
      startSourceCellId: "cell:1:1",
      rows: [
        ["x", "y"],
        ["p", "q"]
      ],
      selectedSourceCellId: "cell:1:1"
    });
    expect(applyWebviewMessage(source, message)).toMatchObject({
      ok: true,
      source: "|===\n| A | B | \n| C | x | y\n|  | p | q\n|===\n"
    });
  });

  it("blocks direct paste when the target range crosses a block cell", async () => {
    const source = "|===\n| A | B\na| * item\n| D\n|===\n";
    const harness = await createHarness(source);

    harness.cell("cell:0:0").focus();
    harness.pasteHtml("<table><tr><td>x</td></tr><tr><td>y</td></tr></table>", "x\ny");

    expect(harness.messages.some((message) => message.type === "update-cell-contents")).toBe(false);
    expect(harness.messages.some((message) => message.type === "paste-rectangular-table")).toBe(false);
    expect(harness.diagnosticsText()).toContain("Paste blocked");
  });

  it("pastes plain text into a selected block cell as raw block source", async () => {
    const source = "|===\na| * old\n|===\n";
    const harness = await createHarness(source);

    harness.cell("cell:0:0").focus();
    harness.paste("* item\n* next");

    const message = harness.lastMessage("update-block-cell-source");
    expect(message).toMatchObject({
      sourceCellId: "cell:0:0",
      contentRaw: " * item\n* next",
      selectedSourceCellId: "cell:0:0"
    });
    expect(applyWebviewMessage(source, message)).toMatchObject({
      ok: true,
      source: "|===\na| * item\n* next\n|===\n"
    });
  });

  it("rejects an outer table delimiter in block source without changing source", async () => {
    const source = "|===\na| * old\n| B\n|===\n";
    const harness = await createHarness(source);

    harness.cell("cell:0:0").focus();
    harness.paste("* changed\n|===\n* tail");

    const result = applyWebviewMessage(source, harness.lastMessage("update-block-cell-source"));
    expect(result).toMatchObject({
      ok: false,
      source,
      diagnostics: [expect.objectContaining({
        code: "writeback.unsafe-block-cell-content",
        severity: "error"
      })]
    });
  });

  it("keeps non-table rich HTML paste into a block cell as plain raw source", async () => {
    const source = "|===\na| * old\n|===\n";
    const harness = await createHarness(source);

    harness.cell("cell:0:0").focus();
    harness.pasteHtml("<a href=\"https://example.com\"><b>Aaa</b></a>", "Aaa");

    const message = harness.lastMessage("update-block-cell-source");
    expect(message).toMatchObject({
      sourceCellId: "cell:0:0",
      contentRaw: " Aaa",
      selectedSourceCellId: "cell:0:0"
    });
  });

  it("blocks multi-cell table paste when a block cell is selected", async () => {
    const source = "|===\na| * old\n|===\n";
    const harness = await createHarness(source);

    harness.cell("cell:0:0").focus();
    harness.pasteHtml("<table><tr><td>A</td><td>B</td></tr></table>", "A\tB");

    expect(harness.messages.some((message) => message.type === "update-block-cell-source")).toBe(false);
    expect(harness.messages.some((message) => message.type === "paste-imported-table")).toBe(false);
    expect(harness.diagnosticsText()).toContain("table paste must start from a plain cell");
  });

  it("keeps block-cell-boundary fixture source-like lines out of the editable grid", async () => {
    const source = [
      "[cols=2*]",
      "|===",
      "a| [source]",
      "------",
      ".....",
      "| not a table cell",
      "2+| not a span",
      ".....",
      "------",
      "--",
      "| still not a table cell",
      "--",
      "| After block",
      "",
      "| Plain left | Plain right",
      "|===",
      ""
    ].join("\n");
    const harness = await createHarness(source);

    expect(harness.cell("cell:0:0").getAttribute("aria-readonly")).toBe("true");
    expect(harness.cell("cell:0:1").textContent).toBe("After block");
    expect(harness.cell("cell:1:0").textContent).toBe("Plain left");
    expect(() => harness.cell("cell:2:0")).toThrow("cell not found: cell:2:0");
    expect(harness.diagnosticsText()).not.toContain("grid.ragged-row");
  });
});
