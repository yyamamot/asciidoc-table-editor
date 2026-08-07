import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import {
  applyPortableTableEditorMessage,
  createPortableTableEditorSession,
  createWebviewAppModel,
  renderTableEditorHtml,
  type TableEditorHostMessage
} from "../../src/app";
import { parseAsciiDocTable, projectGridModel } from "../../src/core";

describe("static site portability seed", () => {
  it("boots the copied core/app boundary without VS Code API", async () => {
    const source = readFileSync(join(process.cwd(), "fixtures", "manual", "basic.adoc"), "utf8");
    const tableStart = source.indexOf("|===");
    const tableEnd = source.indexOf("|===", tableStart + 4) + 4;
    const tableSource = source.slice(tableStart, tableEnd);
    const model = createWebviewAppModel(projectGridModel(parseAsciiDocTable(tableSource)), {
      preview: {
        tableHtml: "<table><tbody><tr><td>preview</td></tr></tbody></table>",
        blockCellHtmlBySourceCellId: {}
      }
    });
    const html = renderTableEditorHtml(model, "staticSeedNonce");
    const window = new Window({ url: "https://static.example/" });
    const messages: TableEditorHostMessage[] = [];

    (window as unknown as { requestAnimationFrame: (callback: FrameRequestCallback) => number }).requestAnimationFrame = (callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    };
    window.addEventListener("asciidoc-table-editor-message", (event) => {
      messages.push((event as unknown as CustomEvent<TableEditorHostMessage>).detail);
    });

    window.document.write(html);
    for (const script of Array.from(window.document.querySelectorAll("script[nonce='staticSeedNonce']"))) {
      window.eval(script.textContent ?? "");
    }
    await window.happyDOM.waitUntilComplete();

    const previewButton = window.document.querySelector("[data-action='set-editor-mode'][data-editor-mode-value='preview']") as HTMLButtonElement | null;
    expect(previewButton).not.toBeNull();
    previewButton?.click();
    expect(window.document.querySelector("[data-editor-view='preview']")?.hasAttribute("hidden")).toBe(false);
    expect(window.localStorage.getItem("asciidoc-table-editor:webview-state")).toContain("preview");

    const firstCell = window.document.querySelector(".cell[data-kind='origin']") as HTMLElement | null;
    expect(firstCell).not.toBeNull();
    firstCell?.focus();
    (window.document as unknown as { dispatchEvent(event: unknown): boolean }).dispatchEvent(new window.KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "z",
      metaKey: true
    }));
    expect(messages.at(-1)).toMatchObject({ type: "request-undo" });
  });

  it("applies source-safe edits through the portable controller", async () => {
    let session = await createPortableTableEditorSession({
      source: "|===\n| A | B\n| C | D\n|===\n",
      previewAdapter: () => ({
        tableHtml: "<table><tbody><tr><td>preview</td></tr></tbody></table>",
        blockCellHtmlBySourceCellId: {}
      })
    });

    const cellEdit = await applyPortableTableEditorMessage(session, {
      type: "update-cell-content",
      operationId: "portable-operation-1",
      revisionToken: "portable-revision-1",
      sourceCellId: "cell:0:0",
      contentRaw: "Alpha"
    });
    expect(cellEdit.handled).toBe(true);
    if (cellEdit.handled) {
      expect(cellEdit.message).toMatchObject({
        type: "cell-content-update-result",
        operationId: "portable-operation-1",
        revisionToken: "portable-revision-1",
        result: { ok: true }
      });
    }
    session = cellEdit.session;
    expect(session.source).toContain("|Alpha | B");

    const merge = await applyPortableTableEditorMessage(session, {
      type: "request-merge-cells",
      sourceCellIds: ["cell:0:0", "cell:0:1"]
    });
    expect(merge.handled).toBe(true);
    if (merge.handled) {
      expect(merge.message).toMatchObject({ type: "merge-cells-result", result: { ok: true } });
    }
    session = merge.session;
    expect(session.source).toContain("2+|Alpha");

    const undo = await applyPortableTableEditorMessage(session, { type: "request-undo" });
    expect(undo.handled).toBe(false);
  });

  it("supports block edits and format review without extension code", async () => {
    const blockSession = await createPortableTableEditorSession({
      source: "|===\na| * A\n| B\n|===\n"
    });
    const blockEdit = await applyPortableTableEditorMessage(blockSession, {
      type: "update-block-cell-source",
      sourceCellId: "cell:0:0",
      contentRaw: "* Changed"
    });
    expect(blockEdit.handled).toBe(true);
    if (blockEdit.handled) {
      expect(blockEdit.message).toMatchObject({ type: "block-cell-update-result", result: { ok: true } });
    }
    expect(blockEdit.session.source).toContain("a|* Changed");

    const formatSession = await createPortableTableEditorSession({
      source: "|===\n| col1 | col2 | col3\n\n| hello | world | ready\n| test | message | draft\n|===\n"
    });
    const formatReview = await applyPortableTableEditorMessage(formatSession, {
      type: "request-format-table"
    });
    expect(formatReview.handled).toBe(true);
    expect(formatReview.session.model.formatReview).toBeDefined();
  });

  it("keeps portable sessions atomic for unsafe plain and block replacements", async () => {
    let previewCalls = 0;
    const previewAdapter = () => {
      previewCalls += 1;
      return {
        tableHtml: "<table><tbody><tr><td>preview</td></tr></tbody></table>",
        blockCellHtmlBySourceCellId: {}
      };
    };
    const plainSession = await createPortableTableEditorSession({
      source: "|===\n| A | B\n| C | D\n|===\n",
      previewAdapter,
      selectedSourceCellId: "cell:0:1"
    });
    expect(previewCalls).toBe(1);

    const plainFailures = [
      {
        message: {
          type: "update-cell-content" as const,
          sourceCellId: "cell:0:0",
          contentRaw: "Alpha\n| injected",
          selectedSourceCellId: "cell:0:0"
        },
        code: "writeback.unsafe-plain-cell-content"
      },
      {
        message: {
          type: "update-cell-contents" as const,
          replacements: [
            { sourceCellId: "cell:0:0", contentRaw: "Alpha" },
            { sourceCellId: "cell:0:1", contentRaw: "Beta\r\n| injected" }
          ],
          selectedSourceCellId: "cell:0:1"
        },
        code: "writeback.unsafe-plain-cell-content"
      },
      {
        message: {
          type: "replace-cell-with-block-source" as const,
          sourceCellId: "cell:0:0",
          contentRaw: "* item\n|===\n* tail",
          selectedSourceCellId: "cell:0:0"
        },
        code: "writeback.unsafe-block-cell-content"
      },
      {
        message: {
          type: "replace-cell-with-block-source" as const,
          sourceCellId: "cell:0:0",
          contentRaw: " * item\n* tail",
          selectedSourceCellId: "cell:0:0"
        },
        code: "writeback.cell-replacement-validation-failed"
      }
    ];

    for (const failure of plainFailures) {
      const result = await applyPortableTableEditorMessage(plainSession, failure.message);
      expect(result.handled).toBe(true);
      if (result.handled) {
        expect(result.message?.result).toMatchObject({
          ok: false,
          diagnostics: [expect.objectContaining({ code: failure.code, severity: "error" })]
        });
      }
      expect(result.session).toBe(plainSession);
      expect(result.session.source).toBe(plainSession.source);
      expect(result.session.model).toBe(plainSession.model);
      expect(result.session.selectedSourceCellId).toBe("cell:0:1");
      expect(previewCalls).toBe(1);
    }

    const blockSession = await createPortableTableEditorSession({
      source: "|===\na| * old\n| B\n|===\n",
      previewAdapter,
      selectedSourceCellId: "cell:0:0"
    });
    expect(previewCalls).toBe(2);
    const blockFailure = await applyPortableTableEditorMessage(blockSession, {
      type: "update-block-cell-source",
      sourceCellId: "cell:0:0",
      contentRaw: "* changed\n|===\n* tail",
      selectedSourceCellId: "cell:0:0"
    });
    expect(blockFailure.handled).toBe(true);
    if (blockFailure.handled) {
      expect(blockFailure.message?.result).toMatchObject({
        ok: false,
        diagnostics: [expect.objectContaining({
          code: "writeback.unsafe-block-cell-content",
          severity: "error"
        })]
      });
    }
    expect(blockFailure.session).toBe(blockSession);
    expect(blockFailure.session.source).toBe(blockSession.source);
    expect(blockFailure.session.model).toBe(blockSession.model);
    expect(blockFailure.session.selectedSourceCellId).toBe("cell:0:0");
    expect(previewCalls).toBe(2);
  });

  it("keeps copied app/core files free of VS Code and Node Worker dependencies", () => {
    const portableFiles = [
      ...collectTypeScriptFiles(join(process.cwd(), "src", "app")),
      ...collectTypeScriptFiles(join(process.cwd(), "src", "core"))
    ];

    for (const file of portableFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/from\s+["']vscode["']|require\(["']vscode["']\)/);
      expect(source, file).not.toContain("node:worker_threads");
      expect(source, file).not.toContain("../extension");
      expect(source, file).not.toContain("/extension");
    }
  });
});

function collectTypeScriptFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectTypeScriptFiles(path);
    }
    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });
}
