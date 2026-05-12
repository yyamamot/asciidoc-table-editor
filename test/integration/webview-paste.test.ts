import { describe, expect, it } from "vitest";
import { applyWebviewMessage, createHarness } from "./webview-harness";

describe("webview clipboard paste interactions", () => {
  it("pastes an HTML table directly into editable plain cells", async () => {
    const source = "|===\n| A | B\n|===\n";
    const harness = await createHarness(source);

    harness.cell("cell:0:0").focus();
    harness.pasteHtml("<table><tr><td>Name</td><td>Value</td></tr></table>", "Name\tValue");

    const message = harness.lastMessage("update-cell-contents");
    expect(message).toMatchObject({
      replacements: [
        { sourceCellId: "cell:0:0", contentRaw: " Name" },
        { sourceCellId: "cell:0:1", contentRaw: " Value" }
      ],
      selectedSourceCellId: "cell:0:1"
    });
    expect(applyWebviewMessage(source, message)).toMatchObject({
      ok: true,
      source: "|===\n| Name | Value\n|===\n"
    });
  });

  it("shows link labels in the grid while keeping source text for edit and copy", async () => {
    const source = "|===\n| https://example.com[Example] | B\n|===\n";
    const harness = await createHarness(source);
    const first = harness.cell("cell:0:0");

    expect(first.textContent).toBe("Example");
    expect(first.dataset.content).toBe("https://example.com[Example]");
    expect(first.getAttribute("title")).toBe("https://example.com[Example]");
    expect(harness.copy()["text/plain"]).toBe("https://example.com[Example]");

    first.dispatchEvent(new harness.window.MouseEvent("dblclick", { bubbles: true }) as unknown as Event);
    expect(first.textContent).toBe("https://example.com[Example]");
    harness.keydown("Escape");
  });
});
