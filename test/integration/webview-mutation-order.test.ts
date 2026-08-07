import { describe, expect, it } from "vitest";
import { createHarness } from "./webview-harness";

const source = "|===\n| A | B\n|===\n";

describe("Webview mutation ordering", () => {
  it("sends one delayed Apply request and exposes a busy disabled UI", async () => {
    const harness = await draftHarness("Draft");
    const apply = harness.button("update-cell-content");

    apply.click();
    apply.click();

    const requests = harness.messages.filter((message) => message.type === "update-cell-content");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ revisionToken: "revision-1", contentRaw: " Draft" });
    expect(requests[0]?.operationId).toEqual(expect.any(String));
    expect(apply.disabled).toBe(true);
    expect(harness.button("merge-cells").disabled).toBe(true);
    expect(harness.cell("cell:0:0").getAttribute("aria-readonly")).toBe("true");
    expect(harness.shell().getAttribute("aria-busy")).toBe("true");
  });

  it("ignores a result for another operation without changing draft, DOM, token, or busy state", async () => {
    const harness = await draftHarness("Draft");
    const apply = harness.button("update-cell-content");
    apply.click();
    const request = harness.lastMessage("update-cell-content");
    const diagnosticBeforeStaleResult = harness.diagnosticsText();

    harness.dispatchExtensionMessage({
      type: "cell-content-update-result",
      operationId: request.operationId,
      revisionToken: "",
      documentVersion: -1,
      result: { ok: false, diagnostics: [{ code: "writeback.table-changed", severity: "error", message: "invalid metadata" }] }
    });
    harness.dispatchExtensionMessage({
      type: "cell-content-update-result",
      operationId: `${request.operationId}-stale`,
      revisionToken: "revision-stale",
      documentVersion: 99,
      result: { ok: true, diagnostics: [] }
    });

    expect(harness.textarea("contentRaw").value).toBe("Draft");
    expect(harness.cell("cell:0:0").textContent).toBe("A");
    expect(harness.diagnosticsText()).toBe(diagnosticBeforeStaleResult);
    expect(apply.disabled).toBe(true);
    expect(harness.shell().getAttribute("aria-busy")).toBe("true");

    harness.dispatchExtensionMessage(appliedResult(request.operationId, "revision-2"));
    harness.textarea("contentRaw").value = "Next";
    apply.click();
    expect(harness.lastMessage("update-cell-content")).toMatchObject({ revisionToken: "revision-2", contentRaw: " Next" });
  });

  it("advances the revision token only after the matching successful result", async () => {
    const harness = await draftHarness("First");
    const apply = harness.button("update-cell-content");
    apply.click();
    const first = harness.lastMessage("update-cell-content");

    harness.dispatchExtensionMessage(appliedResult(first.operationId, "revision-2"));

    expect(harness.shell().getAttribute("aria-busy")).toBe("false");
    expect(apply.disabled).toBe(false);
    expect(harness.cell("cell:0:0").textContent).toBe("A");
    harness.textarea("contentRaw").value = "Second";
    apply.click();
    const second = harness.lastMessage("update-cell-content");
    expect(second.operationId).not.toBe(first.operationId);
    expect(second.revisionToken).toBe("revision-2");
  });

  for (const code of ["writeback.table-changed", "writeback.apply-raced"] as const) {
    it(`preserves the draft and blocks further mutation after ${code}`, async () => {
      const harness = await draftHarness("Unsaved draft");
      const apply = harness.button("update-cell-content");
      apply.click();
      const request = harness.lastMessage("update-cell-content");

      harness.dispatchExtensionMessage(rejectedResult(request.operationId, code, code === "writeback.table-changed"));

      expect(harness.textarea("contentRaw").value).toBe("Unsaved draft");
      expect(harness.cell("cell:0:0").textContent).toBe("A");
      expect(harness.shell().getAttribute("aria-busy")).toBe("false");
      expect(apply.disabled).toBe(true);
      expect(harness.button("merge-cells").disabled).toBe(true);
      expect(harness.grid().getAttribute("aria-readonly")).toBe("true");
      const beforeRetry = harness.messages.length;
      apply.click();
      expect(harness.messages).toHaveLength(beforeRetry);
    });
  }

  it("preserves the draft but permits retry after a non-conflict rejection", async () => {
    const harness = await draftHarness("Retry draft");
    const apply = harness.button("update-cell-content");
    apply.click();
    const first = harness.lastMessage("update-cell-content");

    harness.dispatchExtensionMessage(rejectedResult(first.operationId, "writeback.unsafe-plain-cell-content"));

    expect(harness.textarea("contentRaw").value).toBe("Retry draft");
    expect(harness.cell("cell:0:0").textContent).toBe("A");
    expect(harness.shell().getAttribute("aria-busy")).toBe("false");
    expect(apply.disabled).toBe(false);
    apply.click();
    const retry = harness.lastMessage("update-cell-content");
    expect(retry.operationId).not.toBe(first.operationId);
    expect(retry.revisionToken).toBe("revision-1");
  });
});

async function draftHarness(draft: string) {
  const harness = await createHarness(source, undefined, undefined, {
    revisionToken: "revision-1",
    autoAcknowledgeMutations: false
  });
  harness.cell("cell:0:0").focus();
  harness.textarea("contentRaw").value = draft;
  return harness;
}

function appliedResult(operationId: string, revisionToken: string) {
  return {
    type: "cell-content-update-result",
    operationId,
    revisionToken,
    documentVersion: 2,
    result: { ok: true, diagnostics: [] }
  };
}

function rejectedResult(operationId: string, code: string, withLeadingDiagnostic = false) {
  return {
    type: "cell-content-update-result",
    operationId,
    revisionToken: "revision-1",
    documentVersion: 1,
    result: {
      ok: false,
      diagnostics: [
        ...(withLeadingDiagnostic ? [{ code: "paste.rich-content-limited", severity: "warning", message: "limited" }] : []),
        { code, severity: "error", message: code }
      ]
    }
  };
}
