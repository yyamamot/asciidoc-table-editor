import assert from "node:assert/strict";
import * as vscode from "vscode";
import { findAsciiDocTableBlock } from "../../src/core";
import { applyCellContentsUpdate, reportInvalidTableEditorMessage } from "../../src/extension/command-webview-handlers";
import { registerTableEditorMessageRouter } from "../../src/extension/message-router";
import { createTableEditorSessionTarget } from "../../src/extension/table-editor-session-target";
import { closeAllEditors, openAsciiDocDocument } from "./host-harness";

const KiB = 1024;

export async function testMessageRouterRejectsInvalidNumbersAndImportedGridGeometry(): Promise<void> {
  const calls: string[] = [];
  const invalid: InvalidCall[] = [];
  const { panel, receive } = testPanel();
  const subscription = registerTableEditorMessageRouter(panel, {
    invalidMessage: (message, resultType) => { invalid.push({ message, resultType }); },
    pasteImportedTable: () => { calls.push("paste-imported-table"); },
    updateColumnSpec: () => { calls.push("update-column-spec"); }
  });
  const base = importedMessage(2, 2, [cell(0, 0), cell(0, 1), cell(1, 0), cell(1, 1)]);
  const malformed: unknown[] = [];
  const invalidNumbers = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, -0.5, 0.5];
  for (const value of invalidNumbers) {
    malformed.push(
      { ...base, rowCount: value },
      { ...base, columnCount: value },
      { ...base, cells: [{ ...cell(0, 0), row: value }] },
      { ...base, cells: [{ ...cell(0, 0), col: value }] },
      { ...base, cells: [{ ...cell(0, 0), rowSpan: value }] },
      { ...base, cells: [{ ...cell(0, 0), colSpan: value }] },
      operation({ type: "request-update-column-spec", columnIndex: value })
    );
  }
  malformed.push(
    { ...base, rowCount: 0 },
    { ...base, columnCount: 0 },
    { ...base, cells: [{ ...cell(0, 0), rowSpan: 0 }] },
    { ...base, cells: [{ ...cell(0, 0), colSpan: 0 }] },
    { ...base, cells: [cell(0, 0), cell(0, 0)] },
    { ...base, cells: [cell(0, 0, 2, 2), cell(1, 1)] },
    { ...base, cells: [cell(1, 0, 2, 1)] },
    { ...base, cells: [cell(0, 1, 1, 2)] },
    { ...base, cells: [cell(2, 0)] },
    { ...base, cells: [cell(0, 2)] }
  );
  for (const message of malformed) receive(withUniqueOperation(message));

  await waitFor(() => invalid.length === malformed.length);
  assert.deepEqual(calls, [], "invalid numeric and imported-grid messages must not reach handlers");
  assert.equal(invalid.length, malformed.length);
  assert.ok(invalid.every(({ resultType }) =>
    resultType === "cell-content-update-result" || resultType === "table-settings-update-result"
  ));
  assertInvalidCallbacksAreMetadataOnly(invalid);
  subscription.dispose();
}

export async function testMessageRouterRejectsQuotaAndDimensionOverflow(): Promise<void> {
  const calls: string[] = [];
  const snapshots: unknown[] = [];
  const invalid: InvalidCall[] = [];
  const { panel, receive } = testPanel();
  const subscription = registerTableEditorMessageRouter(panel, {
    invalidMessage: (message, resultType) => { invalid.push({ message, resultType }); },
    uiReviewSnapshot: (snapshot) => { snapshots.push(snapshot); },
    updateCellContent: () => { calls.push("update-cell-content"); },
    updateCellContents: () => { calls.push("update-cell-contents"); },
    pasteRectangularTable: () => { calls.push("paste-rectangular-table"); },
    pasteImportedTable: () => { calls.push("paste-imported-table"); }
  });
  const emojiOneByteOver = "😀".repeat(16 * KiB) + "x";
  const surrogateOneByteOver = "\ud800".repeat(21845) + "xx";
  assert.equal(Buffer.byteLength(emojiOneByteOver, "utf8"), 64 * KiB + 1);
  assert.equal(Buffer.byteLength(surrogateOneByteOver, "utf8"), 64 * KiB + 1);
  const malformed = [
    importedMessage(257, 1, [cell(0, 0)]),
    importedMessage(1, 65, [cell(0, 0)]),
    importedMessage(65, 64, [cell(0, 0, 65, 64)]),
    importedMessage(64, 64, Array.from({ length: 4097 }, (_, index) => cell(Math.floor(index / 64), index % 64))),
    operation({ type: "paste-rectangular-table", startSourceCellId: "cell:0:0", rows: Array.from({ length: 257 }, () => [""]) }),
    operation({ type: "paste-rectangular-table", startSourceCellId: "cell:0:0", rows: [Array.from({ length: 65 }, () => "")] }),
    operation({ type: "paste-rectangular-table", startSourceCellId: "cell:0:0", rows: [["a"], ["b", "c"]] }),
    operation({ type: "update-cell-content", sourceCellId: "cell:0:0", contentRaw: "x".repeat(64 * KiB + 1) }),
    operation({ type: "update-cell-content", sourceCellId: "cell:0:0", contentRaw: emojiOneByteOver }),
    operation({ type: "update-cell-content", sourceCellId: "cell:0:0", contentRaw: surrogateOneByteOver }),
    operation({
      type: "update-cell-contents",
      replacements: Array.from({ length: 17 }, (_, index) => ({
        sourceCellId: `cell:${index}:0`,
        contentRaw: "x".repeat(64 * KiB)
      }))
    })
  ];
  for (const message of malformed) receive(withUniqueOperation(message));
  const exactOneByteOver = mutationMessageWithExactUtf8Bytes(1024 * KiB + 1);
  assert.equal(Buffer.byteLength(JSON.stringify(exactOneByteOver), "utf8"), 1024 * KiB + 1);
  receive(exactOneByteOver);
  receive({ type: "ui-review-snapshot", snapshot: "x".repeat(1024 * KiB) });

  await waitFor(() => invalid.length === malformed.length + 1);
  assert.deepEqual(calls, [], "messages over row, column, slot, cell, or total-byte quotas must not reach handlers");
  assert.equal(invalid.length, malformed.length + 1);
  assert.ok(invalid.every(({ resultType }) => resultType === "cell-content-update-result"));
  assertInvalidCallbacksAreMetadataOnly(invalid);
  assert.deepEqual(snapshots, [], "oversized UI review snapshots must be rejected before their handler");
  subscription.dispose();
}

export async function testInvalidMessageResultMetadataDiagnosticsAndPrivacy(): Promise<void> {
  const source = "|===\n| PRIVATE_FIXTURE_ALPHA | PRIVATE_FIXTURE_BETA\n|===";
  const editor = await openAsciiDocDocument(source);
  const tableBlock = findAsciiDocTableBlock(source, 0);
  assert.ok(tableBlock);
  const target = createTableEditorSessionTarget(editor.document, tableBlock);
  const posted: unknown[] = [];
  const panel = {
    webview: {
      postMessage: async (message: unknown) => {
        posted.push(message);
        return true;
      }
    }
  } as unknown as vscode.WebviewPanel;

  await reportInvalidTableEditorMessage(editor, panel, target, {
    type: "request-update-table-appearance",
    operationId: "operation-invalid-current",
    revisionToken: target.revisionToken
  }, "table-settings-update-result");
  const current = posted[0] as MutationResult;
  assert.equal(current.type, "table-settings-update-result");
  assert.equal(current.operationId, "operation-invalid-current");
  assert.equal(current.documentVersion, editor.document.version);
  assert.equal(current.revisionToken, target.revisionToken);
  assert.equal(current.result?.ok, false);
  assert.equal(current.result?.diagnostics?.[0]?.code, "webview.message.invalid");
  assertPrivacySafeResult(current, source);

  await reportInvalidTableEditorMessage(editor, panel, target, {
    type: "update-block-cell-source",
    operationId: "operation-invalid-stale",
    revisionToken: "stale-revision-token"
  }, "block-cell-update-result");
  const stale = posted[1] as MutationResult;
  assert.equal(stale.type, "block-cell-update-result");
  assert.equal(stale.operationId, "operation-invalid-stale");
  assert.equal(stale.documentVersion, editor.document.version);
  assert.equal(stale.revisionToken, target.revisionToken);
  assert.equal(stale.result?.ok, false);
  assert.equal(stale.result?.diagnostics?.[0]?.code, "writeback.revision-mismatch");
  assertPrivacySafeResult(stale, source);

  await applyCellContentsUpdate(editor, panel, target, {
    operationId: "operation-canonical-diagnostic",
    revisionToken: target.revisionToken,
    replacements: [{ sourceCellId: "missing-cell", contentRaw: "PRIVATE_REPLACEMENT_CONTENT" }],
    diagnostics: [{
      code: "paste.rich-content-dropped",
      severity: "warning",
      message: "PRIVATE_WEBVIEW_DIAGNOSTIC"
    }]
  });
  const canonical = posted[2] as MutationResult;
  assert.equal(canonical.type, "cell-content-update-result");
  assert.equal(canonical.operationId, "operation-canonical-diagnostic");
  assert.equal(canonical.result?.ok, false);
  assert.equal(canonical.result?.diagnostics?.[0]?.code, "paste.rich-content-dropped");
  assert.equal(canonical.result?.diagnostics?.[0]?.message, "Pasted unsupported rich clipboard content with limited formatting.");
  assert.ok(!JSON.stringify(canonical).includes("PRIVATE_WEBVIEW_DIAGNOSTIC"));
  assert.ok(!JSON.stringify(canonical).includes("PRIVATE_REPLACEMENT_CONTENT"));
  assertPrivacySafeResult(canonical, source);

  target.dispose();
  await closeAllEditors();
}

export async function testRouterDoesNotEchoPrivateDiagnosticsAndRespondsToInvalidRevisionEnvelopes(): Promise<void> {
  const source = "|===\n| PRIVATE_SOURCE_ALPHA | PRIVATE_SOURCE_BETA\n|===";
  const editor = await openAsciiDocDocument(source);
  const tableBlock = findAsciiDocTableBlock(source, 0);
  assert.ok(tableBlock);
  const target = createTableEditorSessionTarget(editor.document, tableBlock);
  const posted: unknown[] = [];
  const handlerCalls: unknown[] = [];
  let receive!: (message: unknown) => void;
  const panel = {
    webview: {
      onDidReceiveMessage: (listener: (message: unknown) => void) => {
        receive = listener;
        return { dispose: () => undefined };
      },
      postMessage: async (message: unknown) => {
        posted.push(message);
        return true;
      }
    },
    onDidDispose: () => ({ dispose: () => undefined })
  } as unknown as vscode.WebviewPanel;
  const subscription = registerTableEditorMessageRouter(panel, {
    updateCellContent: (message) => { handlerCalls.push(message); },
    invalidMessage: (message, resultType) => reportInvalidTableEditorMessage(editor, panel, target, message, resultType)
  });
  receive({
    type: "update-cell-content",
    operationId: "operation-private-diagnostic",
    revisionToken: target.revisionToken,
    sourceCellId: "cell:0:0",
    contentRaw: "PRIVATE_CONTENT_RAW",
    diagnostics: [{ code: "PRIVATE_CODE", severity: "error", message: "PRIVATE_DIAGNOSTIC_MESSAGE" }]
  });
  receive({ type: "update-cell-content", operationId: "operation-missing-revision", sourceCellId: "cell:0:0", contentRaw: "draft" });
  receive({ type: "update-cell-content", operationId: "operation-empty-revision", revisionToken: "", sourceCellId: "cell:0:0", contentRaw: "draft" });
  receive({ type: "update-cell-content", operationId: "operation-wrong-revision", revisionToken: "wrong-revision", sourceCellId: "cell:0:0", contentRaw: 1 });

  await waitFor(() => posted.length === 4);
  assert.deepEqual(handlerCalls, [], "invalid diagnostic or revision envelopes must not reach the mutation handler");
  const results = posted as MutationResult[];
  assert.deepEqual(results.map(({ operationId }) => operationId), [
    "operation-private-diagnostic",
    "operation-missing-revision",
    "operation-empty-revision",
    "operation-wrong-revision"
  ]);
  for (const result of results) {
    assert.equal(result.type, "cell-content-update-result");
    assert.equal(result.documentVersion, editor.document.version);
    assert.equal(result.revisionToken, target.revisionToken);
    assert.equal(result.result?.ok, false);
    assertPrivacySafeResult(result, source);
    const serialized = JSON.stringify(result);
    for (const privateValue of ["PRIVATE_CONTENT_RAW", "PRIVATE_CODE", "PRIVATE_DIAGNOSTIC_MESSAGE"]) {
      assert.ok(!serialized.includes(privateValue), "Host invalid-message response must not echo Webview diagnostics or content");
    }
  }
  assert.equal(results[0]?.result?.diagnostics?.[0]?.code, "webview.message.invalid");
  assert.equal(results[0]?.result?.diagnostics?.[0]?.message, "The Table Editor rejected an invalid or oversized message.");
  assert.equal(results[3]?.result?.diagnostics?.[0]?.code, "writeback.revision-mismatch");
  subscription.dispose();
  target.dispose();
  await closeAllEditors();
}

export async function testRouterRejectsUnknownKeysAndMissingHandlers(): Promise<void> {
  const routed: unknown[] = [];
  const invalid: InvalidCall[] = [];
  const { panel, receive } = testPanel();
  const subscription = registerTableEditorMessageRouter(panel, {
    invalidMessage: (message, resultType) => { invalid.push({ message, resultType }); },
    updateCellContent: (message) => { routed.push(message); },
    updateCellContents: (message) => { routed.push(message); },
    pasteImportedTable: (message) => { routed.push(message); }
  });
  const malformed = [
    operation({ type: "update-cell-content", sourceCellId: "cell:0:0", contentRaw: "valid", unexpected: true }),
    operation({ type: "update-cell-contents", replacements: [{ sourceCellId: "cell:0:0", contentRaw: "valid", unexpected: true }] }),
    operation({ type: "paste-imported-table", startSourceCellId: "cell:0:0", rowCount: 1, columnCount: 1, cells: [{ ...cell(0, 0), unexpected: true }] })
  ];
  for (const message of malformed) receive(message);
  await waitFor(() => invalid.length === malformed.length);
  assert.deepEqual(routed, [], "unknown top-level and nested keys must not reach handlers");

  subscription.dispose();
  const noHandlerInvalid: InvalidCall[] = [];
  const second = testPanel();
  const noHandlerSubscription = registerTableEditorMessageRouter(second.panel, {
    invalidMessage: (message, resultType) => { noHandlerInvalid.push({ message, resultType }); }
  });
  second.receive(operation({ type: "update-cell-content", sourceCellId: "cell:0:0", contentRaw: "valid" }));
  await waitFor(() => noHandlerInvalid.length === 1);
  assert.equal(noHandlerInvalid[0]?.resultType, "cell-content-update-result");
  assertInvalidCallbacksAreMetadataOnly([...invalid, ...noHandlerInvalid]);
  noHandlerSubscription.dispose();
}

export async function testRouterFuzzRejectsUnknownShapesWithoutInvokingHandlers(): Promise<void> {
  const routed: unknown[] = [];
  const invalid: InvalidCall[] = [];
  const { panel, receive } = testPanel();
  const subscription = registerTableEditorMessageRouter(panel, {
    invalidMessage: (message, resultType) => { invalid.push({ message, resultType }); },
    updateCellContent: (message) => { routed.push(message); },
    updateColumnSpec: (message) => { routed.push(message); }
  });
  const cyclic = operation({ type: "update-cell-content", sourceCellId: "cell:0:0", contentRaw: "valid" });
  cyclic.self = cyclic;
  const silentShapes: unknown[] = [null, [], ["update-cell-content"], { type: "unknown-message", operationId: "operation-unknown", revisionToken: "revision-validation" }];
  const recognizedInvalid = [
    operation({ type: "update-cell-content", sourceCellId: 1, contentRaw: "valid" }),
    operation({ type: "update-cell-content", sourceCellId: "cell:0:0", contentRaw: true }),
    operation({ type: "request-update-column-spec", columnIndex: Number.NaN }),
    operation({ type: "request-update-column-spec", columnIndex: Number.POSITIVE_INFINITY }),
    cyclic
  ];
  for (const value of [...silentShapes, ...recognizedInvalid]) {
    assert.doesNotThrow(() => receive(value));
  }
  await waitFor(() => invalid.length === recognizedInvalid.length);
  assert.deepEqual(routed, []);
  assertInvalidCallbacksAreMetadataOnly(invalid);
  subscription.dispose();
}

export async function testMessageRouterRejectsEmptyAndDuplicateMutationCollections(): Promise<void> {
  const routed: unknown[] = [];
  const invalid: InvalidCall[] = [];
  const { panel, receive } = testPanel();
  const subscription = registerTableEditorMessageRouter(panel, {
    invalidMessage: (message, resultType) => { invalid.push({ message, resultType }); },
    updateCellContents: (message) => { routed.push(message); },
    mergeCells: (message) => { routed.push(message); },
    updateCellStyle: (message) => { routed.push(message); }
  });
  const malformed = [
    operation({ type: "update-cell-contents", replacements: [] }),
    operation({
      type: "update-cell-contents",
      replacements: [
        { sourceCellId: "cell:0:0", contentRaw: "first" },
        { sourceCellId: "cell:0:0", contentRaw: "second" }
      ]
    }),
    operation({ type: "request-merge-cells", sourceCellIds: [] }),
    operation({ type: "request-merge-cells", sourceCellIds: ["cell:0:0", "cell:0:0"] }),
    operation({ type: "request-update-cell-style", sourceCellIds: [] }),
    operation({ type: "request-update-cell-style", sourceCellIds: ["cell:0:0", "cell:0:0"], style: "a" })
  ];
  for (const message of malformed) receive(withUniqueOperation(message));

  await waitFor(() => invalid.length === malformed.length);
  assert.deepEqual(routed, [], "empty or duplicate mutation collections must not reach handlers");
  assert.equal(invalid.length, malformed.length);
  assert.deepEqual(invalid.map(({ resultType }) => resultType), [
    "cell-content-update-result",
    "cell-content-update-result",
    "merge-cells-result",
    "merge-cells-result",
    "cell-style-update-result",
    "cell-style-update-result"
  ]);
  assertInvalidCallbacksAreMetadataOnly(invalid);
  subscription.dispose();
}

export async function testInvalidMessagesShareMutationQueueReservationAndFifo(): Promise<void> {
  const events: string[] = [];
  let release!: () => void;
  const blocker = new Promise<void>((resolve) => { release = resolve; });
  const { panel, receive } = testPanel();
  const subscription = registerTableEditorMessageRouter(panel, {
    updateCellContent: async (message) => {
      const operationId = (message as { operationId: string }).operationId;
      events.push(`handler:${operationId}:start`);
      if (operationId === "operation-pending") await blocker;
      events.push(`handler:${operationId}:end`);
    },
    invalidMessage: (message) => {
      events.push(`invalid:${(message as { operationId: string }).operationId}`);
    }
  });
  receive(operationWithId("operation-pending", { type: "update-cell-content", sourceCellId: "cell:0:0", contentRaw: "valid" }));
  receive(operationWithId("operation-pending", { type: "update-cell-content", sourceCellId: "cell:0:0", contentRaw: 1 }));
  receive(operationWithId("operation-invalid-next", { type: "update-cell-content", sourceCellId: "cell:0:0", contentRaw: 1 }));
  receive(operationWithId("operation-valid-last", { type: "update-cell-content", sourceCellId: "cell:0:0", contentRaw: "valid" }));
  await settle();
  assert.deepEqual(events, ["handler:operation-pending:start"]);

  release();
  await waitFor(() => events.includes("handler:operation-valid-last:end"));
  assert.deepEqual(events, [
    "handler:operation-pending:start",
    "handler:operation-pending:end",
    "invalid:operation-invalid-next",
    "handler:operation-valid-last:start",
    "handler:operation-valid-last:end"
  ]);
  subscription.dispose();
}

export async function testMessageRouterAcceptsValidMaximumPayloads(): Promise<void> {
  const imported: unknown[] = [];
  const updates: unknown[] = [];
  const batchUpdates: unknown[] = [];
  const invalid: InvalidCall[] = [];
  const { panel, receive } = testPanel();
  const subscription = registerTableEditorMessageRouter(panel, {
    invalidMessage: (message, resultType) => { invalid.push({ message, resultType }); },
    pasteImportedTable: (message) => { imported.push(message); },
    updateCellContent: (message) => { updates.push(message); },
    updateCellContents: (message) => { batchUpdates.push(message); }
  });
  const emojiMaximum = "😀".repeat(16 * KiB);
  const surrogateMaximum = "\ud800".repeat(21845) + "x";
  assert.equal(Buffer.byteLength(emojiMaximum, "utf8"), 64 * KiB);
  assert.equal(Buffer.byteLength(surrogateMaximum, "utf8"), 64 * KiB);
  receive(importedMessage(64, 64, Array.from({ length: 4096 }, (_, index) => cell(Math.floor(index / 64), index % 64))));
  receive(importedMessage(256, 16, Array.from({ length: 4096 }, (_, index) => cell(Math.floor(index / 16), index % 16))));
  receive(operation({ type: "update-cell-content", sourceCellId: "cell:0:0", contentRaw: "\u00e9".repeat(32 * KiB) }));
  receive(operation({ type: "update-cell-content", sourceCellId: "cell:0:0", contentRaw: emojiMaximum }));
  receive(operation({ type: "update-cell-content", sourceCellId: "cell:0:0", contentRaw: surrogateMaximum }));
  const maximumByteMessage = mutationMessageWithExactUtf8Bytes(1024 * KiB);
  assert.equal(Buffer.byteLength(JSON.stringify(maximumByteMessage), "utf8"), 1024 * KiB);
  receive(maximumByteMessage);

  await waitFor(() => imported.length === 2 && updates.length === 3 && batchUpdates.length === 1);
  assert.equal(imported.length, 2, "maximum 64 columns, 256 rows, and 4096 slots must remain valid");
  assert.equal(updates.length, 3, "ASCII-independent emoji and surrogate payloads at exactly 64 KiB must remain valid");
  assert.equal(batchUpdates.length, 1, "a message containing exactly 1 MiB of UTF-8 JSON must remain valid");
  assert.deepEqual(invalid, []);
  subscription.dispose();
}

export async function testMessageValidationFuzzNeverInvokesHandler(): Promise<void> {
  const routed: unknown[] = [];
  const invalid: InvalidCall[] = [];
  const { panel, receive } = testPanel();
  const subscription = registerTableEditorMessageRouter(panel, {
    invalidMessage: (message, resultType) => { invalid.push({ message, resultType }); },
    pasteImportedTable: (message) => { routed.push(message); }
  });
  let seed = 0x115c0de;
  const next = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  for (let index = 0; index < 128; index += 1) {
    const rowCount = next() % 256 + 1;
    const columnCount = next() % 64 + 1;
    const row = next() % rowCount;
    const col = next() % columnCount;
    const malformed = index % 4 === 0
      ? { ...cell(row, col), row: rowCount + next() % 1024 }
      : index % 4 === 1
        ? { ...cell(row, col), col: columnCount + next() % 1024 }
        : index % 4 === 2
          ? { ...cell(row, col), rowSpan: rowCount - row + 1 + next() % 8 }
          : { ...cell(row, col), colSpan: columnCount - col + 1 + next() % 8 };
    receive(withUniqueOperation(importedMessage(rowCount, columnCount, [malformed])));
  }

  await waitFor(() => invalid.length === 128);
  assert.deepEqual(routed, [], "deterministic malformed-coordinate fuzz cases must all be rejected");
  assert.equal(invalid.length, 128);
  assert.ok(invalid.every(({ resultType }) => resultType === "cell-content-update-result"));
  assertInvalidCallbacksAreMetadataOnly(invalid);
  subscription.dispose();
}

type InvalidCall = { readonly message: unknown; readonly resultType: string };
type MutationResult = {
  readonly type?: string;
  readonly operationId?: string;
  readonly documentVersion?: number;
  readonly revisionToken?: string;
  readonly result?: { readonly ok?: boolean; readonly diagnostics?: readonly { readonly code?: string; readonly message?: string }[] };
};

function assertPrivacySafeResult(result: unknown, source: string): void {
  const serialized = JSON.stringify(result);
  for (const key of ["contentRaw", "replacements", "rows", "cells", "tablePreviewHtml", "blockCellPreviewHtml", "applied"]) {
    assert.ok(!serialized.includes(`\"${key}\"`), `invalid-message result must not include ${key}`);
  }
  for (const value of [source, "PRIVATE_FIXTURE_ALPHA", "PRIVATE_FIXTURE_BETA"]) {
    assert.ok(!serialized.includes(value), "invalid-message result must not include fixture or source content");
  }
}

function assertInvalidCallbacksAreMetadataOnly(calls: readonly InvalidCall[]): void {
  for (const { message } of calls) {
    assert.equal(typeof message, "object");
    assert.ok(message !== null && !Array.isArray(message));
    assert.deepEqual(Object.keys(message as Record<string, unknown>).sort(), ["operationId", "revisionToken", "type"]);
    const metadata = message as { operationId?: unknown; revisionToken?: unknown; type?: unknown };
    assert.equal(typeof metadata.operationId, "string");
    assert.equal(typeof metadata.revisionToken, "string");
    assert.equal(typeof metadata.type, "string");
  }
}

function importedMessage(rowCount: number, columnCount: number, cells: unknown[]): Record<string, unknown> {
  return operation({ type: "paste-imported-table", startSourceCellId: "cell:0:0", rowCount, columnCount, cells });
}

function cell(row: number, col: number, rowSpan = 1, colSpan = 1): Record<string, unknown> {
  return { row, col, rowSpan, colSpan, text: "" };
}

function operation(message: Record<string, unknown>): Record<string, unknown> {
  return withUniqueOperation(message);
}

function operationWithId(operationId: string, message: Record<string, unknown>): Record<string, unknown> {
  return { ...message, operationId, revisionToken: "revision-validation" };
}

function mutationMessageWithExactUtf8Bytes(targetBytes: number): Record<string, unknown> {
  const message = operation({
    type: "update-cell-contents",
    replacements: Array.from({ length: 17 }, (_, index) => ({ sourceCellId: `cell:${index}:0`, contentRaw: "" }))
  });
  const replacements = message.replacements as Array<{ sourceCellId: string; contentRaw: string }>;
  let remaining = targetBytes - Buffer.byteLength(JSON.stringify(message), "utf8");
  for (const replacement of replacements) {
    const bytes = Math.min(64 * KiB, remaining);
    replacement.contentRaw = "x".repeat(bytes);
    remaining -= bytes;
  }
  assert.equal(remaining, 0, "exact-byte fixture must fit within per-cell quotas");
  return message;
}

let operationSequence = 0;

function withUniqueOperation(message: unknown): Record<string, unknown> {
  assert.equal(typeof message, "object");
  assert.ok(message !== null && !Array.isArray(message));
  operationSequence += 1;
  return {
    ...(message as Record<string, unknown>),
    operationId: `operation-validation-${operationSequence}`,
    revisionToken: "revision-validation"
  };
}

function testPanel(): { panel: vscode.WebviewPanel; receive(message: unknown): void } {
  let listener: ((message: unknown) => void) | undefined;
  const panel = {
    webview: {
      onDidReceiveMessage: (callback: (message: unknown) => void) => {
        listener = callback;
        return { dispose: () => undefined };
      }
    },
    onDidDispose: () => ({ dispose: () => undefined })
  } as unknown as vscode.WebviewPanel;
  return {
    panel,
    receive: (message: unknown) => {
      assert.ok(listener, "message router listener was not registered");
      listener(message);
    }
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(predicate(), true);
}
