import assert from "node:assert/strict";
import * as vscode from "vscode";
import { findAsciiDocTableBlock } from "../../src/core";
import { applyCellContentUpdate, applyRectangularPaste, applyUndoRedo } from "../../src/extension/command-webview-handlers";
import { registerTableEditorMessageRouter } from "../../src/extension/message-router";
import { TableEditorMutationQueue } from "../../src/extension/table-editor-mutation-queue";
import { createTableEditorSessionTarget } from "../../src/extension/table-editor-session-target";
import { closeAllEditors, openAsciiDocDocument } from "./host-harness";

export async function testPanelMutationQueueRunsFIFOAndDiscardsStaleRevision(): Promise<void> {
  const original = ["|===", "| PRIVATE_ALPHA | PRIVATE_BETA", "|==="].join("\n");
  const editor = await openAsciiDocDocument(original);
  const tableBlock = findAsciiDocTableBlock(original, 0);
  assert.ok(tableBlock);
  const session = createTableEditorSessionTarget(editor.document, tableBlock);
  const queue = new TableEditorMutationQueue();
  const messages: unknown[] = [];
  const refreshedHtml: string[] = [];
  const webviewPanel = panel(messages, undefined, refreshedHtml);
  const initialToken = session.revisionToken;

  const first = queue.enqueue("operation-1", () => applyCellContentUpdate(editor, webviewPanel, session, {
    operationId: "operation-1",
    revisionToken: initialToken,
    sourceCellId: "cell:0:1",
    contentRaw: " first"
  }));
  const second = queue.enqueue("operation-2", () => applyCellContentUpdate(editor, webviewPanel, session, {
    operationId: "operation-2",
    revisionToken: initialToken,
    sourceCellId: "cell:0:1",
    contentRaw: " second"
  }));
  assert.deepEqual(await Promise.all([first, second]), ["completed", "completed"]);
  assert.ok(editor.document.getText().includes("| PRIVATE_ALPHA | first"));
  assert.ok(!editor.document.getText().includes("second"));

  assert.equal(refreshedHtml.length, 1, "successful mutation must replace the full Webview HTML");
  assert.match(refreshedHtml[0] ?? "", new RegExp(session.revisionToken.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
  assert.ok(!refreshedHtml[0]?.includes(initialToken), "refresh HTML must not retain the stale revision token");
  assert.equal(messages.length, 1, "successful full refresh must not also post a mutation payload");
  const staleResult = messages[0] as MutationResult;
  assert.equal(staleResult.operationId, "operation-2");
  assert.equal(staleResult.result?.diagnostics?.[0]?.code, "writeback.revision-mismatch");
  assert.equal(staleResult.revisionToken, session.revisionToken);
  assert.equal(typeof staleResult.documentVersion, "number");
  assertPrivacySafeFailure(staleResult, ["PRIVATE_ALPHA", "PRIVATE_BETA", "first", "second", original]);
  session.dispose();
  queue.dispose();
  await closeAllEditors();
}

export async function testDisposedMutationQueueDropsWaitingOperations(): Promise<void> {
  const queue = new TableEditorMutationQueue();
  const calls: string[] = [];
  let release!: () => void;
  const blocker = new Promise<void>((resolve) => { release = resolve; });
  const first = queue.enqueue("operation-1", async () => {
    calls.push("first-start");
    await blocker;
    calls.push("first-end");
  });
  const second = queue.enqueue("operation-2", () => { calls.push("second"); });
  await Promise.resolve();
  queue.dispose();
  release();

  assert.equal(await first, "completed");
  assert.equal(await second, "discarded");
  assert.deepEqual(calls, ["first-start", "first-end"]);
}

export async function testMutationQueueRetainsPendingOperationIdsPastCompletedHistoryLimit(): Promise<void> {
  const queue = new TableEditorMutationQueue();
  let release!: () => void;
  const blocker = new Promise<void>((resolve) => { release = resolve; });
  const pending = [queue.enqueue("operation-0", () => blocker)];
  for (let index = 1; index <= 256; index += 1) {
    pending.push(queue.enqueue(`operation-${index}`, () => undefined));
  }

  assert.equal(await queue.enqueue("operation-0", () => assert.fail("pending duplicate must not run")), "discarded");
  queue.dispose();
  release();
  await Promise.all(pending);
}

export async function testMessageRouterSerializesPanelMutations(): Promise<void> {
  const calls: string[] = [];
  let receive!: (message: unknown) => void;
  let release!: () => void;
  const blocker = new Promise<void>((resolve) => { release = resolve; });
  const webviewPanel = {
    webview: {
      onDidReceiveMessage: (listener: (message: unknown) => void) => {
        receive = listener;
        return { dispose: () => undefined };
      }
    },
    onDidDispose: () => ({ dispose: () => undefined })
  } as unknown as vscode.WebviewPanel;
  const subscription = registerTableEditorMessageRouter(webviewPanel, {
    updateCellContent: async (message) => {
      const operationId = (message as { operationId?: string }).operationId ?? "missing";
      calls.push(`${operationId}-start`);
      if (operationId === "operation-1") await blocker;
      calls.push(`${operationId}-end`);
    }
  });
  receive({ type: "update-cell-content", sourceCellId: "cell:0:0", contentRaw: " missing-envelope" });
  receive({ type: "update-cell-content", operationId: "", revisionToken: "", sourceCellId: "cell:0:0", contentRaw: " empty-envelope" });
  await Promise.resolve();
  assert.deepEqual(calls, [], "missing or empty operation envelopes must be discarded before the handler");
  receive({ type: "update-cell-content", operationId: "operation-1", revisionToken: "revision-1", sourceCellId: "cell:0:0", contentRaw: " first" });
  receive({ type: "update-cell-content", operationId: "operation-2", revisionToken: "revision-1", sourceCellId: "cell:0:0", contentRaw: " second" });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(calls, ["operation-1-start"]);
  release();
  await waitFor(() => calls.length === 4);
  assert.deepEqual(calls, ["operation-1-start", "operation-1-end", "operation-2-start", "operation-2-end"]);
  subscription.dispose();
}

export async function testMessageRouterReportsHandlerFailureAndContinuesQueue(): Promise<void> {
  const calls: string[] = [];
  let receive!: (message: unknown) => void;
  const webviewPanel = {
    webview: {
      onDidReceiveMessage: (listener: (message: unknown) => void) => {
        receive = listener;
        return { dispose: () => undefined };
      }
    },
    onDidDispose: () => ({ dispose: () => undefined })
  } as unknown as vscode.WebviewPanel;
  const subscription = registerTableEditorMessageRouter(webviewPanel, {
    updateCellContent: (message) => {
      const operationId = (message as { operationId: string }).operationId;
      calls.push(`handler:${operationId}`);
      if (operationId === "operation-fails") throw new Error("expected failure");
    },
    mutationError: (message) => {
      calls.push(`failure:${(message as { operationId: string }).operationId}`);
    }
  });

  receive({ type: "update-cell-content", operationId: "operation-fails", revisionToken: "revision-1", sourceCellId: "cell:0:0", contentRaw: " first" });
  receive({ type: "update-cell-content", operationId: "operation-next", revisionToken: "revision-1", sourceCellId: "cell:0:0", contentRaw: " second" });
  await waitFor(() => calls.length === 3);
  assert.deepEqual(calls, ["handler:operation-fails", "failure:operation-fails", "handler:operation-next"]);
  subscription.dispose();
}

export async function testQueuedPasteCompletesBeforeStaleUndoIsDiscarded(): Promise<void> {
  const original = ["|===", "| A | B", "|==="].join("\n");
  const editor = await openAsciiDocDocument(original);
  const tableBlock = findAsciiDocTableBlock(original, 0);
  assert.ok(tableBlock);
  const session = createTableEditorSessionTarget(editor.document, tableBlock);
  const queue = new TableEditorMutationQueue();
  const messages: unknown[] = [];
  const webviewPanel = panel(messages);
  const initialToken = session.revisionToken;

  const paste = queue.enqueue("paste-operation", () => applyRectangularPaste(editor, webviewPanel, session, {
    operationId: "paste-operation",
    revisionToken: initialToken,
    startSourceCellId: "cell:0:0",
    rows: [["pasted"]]
  }));
  const undo = queue.enqueue("undo-operation", () => applyUndoRedo(editor, webviewPanel, session, {
    type: "request-undo",
    operationId: "undo-operation",
    revisionToken: initialToken
  }));
  await Promise.all([paste, undo]);

  assert.ok(editor.document.getText().includes("pasted"), "the queued paste must remain applied");
  const staleUndo = messages.at(-1) as MutationResult;
  assert.equal(staleUndo.operationId, "undo-operation");
  assert.equal(staleUndo.result?.diagnostics?.[0]?.code, "writeback.revision-mismatch");
  session.dispose();
  queue.dispose();
  await closeAllEditors();
}

export async function testQueueWaitsForHtmlRefreshBeforeStartingNextTask(): Promise<void> {
  const original = ["|===", "| A | B", "|==="].join("\n");
  const editor = await openAsciiDocDocument(original);
  const tableBlock = findAsciiDocTableBlock(original, 0);
  assert.ok(tableBlock);
  const session = createTableEditorSessionTarget(editor.document, tableBlock);
  const queue = new TableEditorMutationQueue();
  const events: string[] = [];
  const webviewPanel = panel([], events);
  const update = queue.enqueue("update-operation", () => applyCellContentUpdate(editor, webviewPanel, session, {
    operationId: "update-operation",
    revisionToken: session.revisionToken,
    sourceCellId: "cell:0:1",
    contentRaw: " updated"
  }));
  const next = queue.enqueue("next-operation", () => { events.push("next-task"); });
  await Promise.all([update, next]);
  assert.deepEqual(events, ["html-refresh", "next-task"]);
  session.dispose();
  queue.dispose();
  await closeAllEditors();
}

type MutationResult = {
  readonly operationId?: string;
  readonly documentVersion?: number;
  readonly revisionToken?: string;
  readonly result?: { readonly ok?: boolean; readonly diagnostics?: readonly { readonly code?: string }[] };
};

function panel(messages: unknown[], htmlEvents?: string[], htmlValues?: string[]): vscode.WebviewPanel {
  const webview = {
    postMessage: async (message: unknown) => {
      messages.push(message);
      return true;
    }
  } as { postMessage: (message: unknown) => Promise<boolean>; html?: string };
  Object.defineProperty(webview, "html", {
    set: (value: string) => {
      htmlEvents?.push("html-refresh");
      htmlValues?.push(value);
    }
  });
  return { webview } as unknown as vscode.WebviewPanel;
}

function assertPrivacySafeFailure(message: unknown, forbiddenValues: readonly string[]): void {
  const serialized = JSON.stringify(message);
  for (const key of ["contentRaw", "replacements", "tablePreviewHtml", "blockCellPreviewHtml", "applied"]) {
    assert.ok(!serialized.includes(`\"${key}\"`), `failure result must not include ${key}`);
  }
  for (const value of forbiddenValues) {
    assert.ok(!serialized.includes(value), "failure result must not include source or fixture cell text");
  }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(predicate(), true);
}
