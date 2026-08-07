import assert from "node:assert/strict";
import * as vscode from "vscode";
import { findAsciiDocTableBlock } from "../../src/core";
import { applyPlainCellContentToEditor } from "../../src/extension/table-editor-document-edits";
import { applyUndoRedo } from "../../src/extension/command-webview-handlers";
import { createTableEditorSessionTarget, type SessionUndoRedoPreparation } from "../../src/extension/table-editor-session-target";
import { closeAllEditors, focusTextEditorForUndoRedo, openAsciiDocDocument, waitForDocumentText } from "./host-harness";

export async function testSessionTargetSafelyRebasesChangesBeforeTable(): Promise<void> {
  const original = ["= Tables", "", "|===", "| A | B", "|==="].join("\n");
  const editor = await openAsciiDocDocument(original);
  const session = sessionAt(editor, original.indexOf("|==="));

  await replace(editor, 0, 0, "intro\n");
  let result = await applyPlainCellContentToEditor(editor, session, "cell:0:1", " Bee");
  assert.equal(result.ok, true);
  assert.ok(editor.document.getText().includes("| A | Bee"));

  await replace(editor, 0, "intro\n".length, "");
  result = await applyPlainCellContentToEditor(editor, session, "cell:0:1", " B");
  assert.equal(result.ok, true);
  assert.equal(editor.document.getText(), original);
  session.dispose();
  await closeAllEditors();
}

export async function testSessionTargetTracksUtf16MultiChangeBeforeTable(): Promise<void> {
  const original = ["alpha", "beta", "|===", "| A | B", "|==="].join("\n");
  const editor = await openAsciiDocDocument(original);
  const session = sessionAt(editor, original.indexOf("|==="));
  const applied = await editor.edit((builder) => {
    builder.insert(editor.document.positionAt(0), "😀");
    builder.insert(editor.document.positionAt(original.indexOf("beta")), "前");
  });
  assert.equal(applied, true);

  const result = await applyPlainCellContentToEditor(editor, session, "cell:0:1", " Bee");
  assert.equal(result.ok, true);
  assert.ok(editor.document.getText().includes("😀alpha"));
  assert.ok(editor.document.getText().includes("前beta"));
  assert.ok(editor.document.getText().includes("| A | Bee"));
  session.dispose();
  await closeAllEditors();
}

export async function testSessionTargetBlocksTargetChangesAndDeletionAtomically(): Promise<void> {
  const original = ["|===", "| A | B", "|==="].join("\n");
  const editor = await openAsciiDocDocument(original);
  let session = sessionAt(editor, 0);
  const cellOffset = editor.document.getText().indexOf(" B");
  await replace(editor, cellOffset, cellOffset + 2, " changed");
  const externallyChanged = editor.document.getText();
  let result = await applyPlainCellContentToEditor(editor, session, "cell:0:1", " overwritten");
  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), ["writeback.table-changed"]);
  assert.equal(editor.document.getText(), externallyChanged);
  session.dispose();

  await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  const deletedEditor = await openAsciiDocDocument(original);
  session = sessionAt(deletedEditor, 0);
  await replace(deletedEditor, 0, original.length, "");
  result = await applyPlainCellContentToEditor(deletedEditor, session, "cell:0:1", " overwritten");
  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), ["writeback.table-not-found"]);
  assert.equal(deletedEditor.document.getText(), "");
  session.dispose();
  await closeAllEditors();
}

export async function testStaleParallelSessionCannotOverwriteFirstSession(): Promise<void> {
  const original = ["|===", "| A | B", "|==="].join("\n");
  const editor = await openAsciiDocDocument(original);
  const first = sessionAt(editor, 0);
  const second = sessionAt(editor, 0);

  const firstResult = await applyPlainCellContentToEditor(editor, first, "cell:0:1", " first");
  const afterFirst = editor.document.getText();
  const secondResult = await applyPlainCellContentToEditor(editor, second, "cell:0:1", " second");
  assert.equal(firstResult.ok, true);
  assert.equal(secondResult.ok, false);
  assert.deepEqual(secondResult.diagnostics.map((diagnostic) => diagnostic.code), ["writeback.table-changed"]);
  assert.equal(editor.document.getText(), afterFirst);
  first.dispose();
  second.dispose();
  await closeAllEditors();
}

export async function testSessionTargetDoesNotFallBackToIdenticalTable(): Promise<void> {
  const table = ["|===", "| A | B", "|==="].join("\n");
  const original = [table, "", table].join("\n");
  const editor = await openAsciiDocDocument(original);
  const secondStart = original.indexOf(table, table.length);
  const session = sessionAt(editor, secondStart);
  const secondCell = original.indexOf(" B", secondStart);
  await replace(editor, secondCell, secondCell + 2, " changed");
  const afterExternalEdit = editor.document.getText();

  const result = await applyPlainCellContentToEditor(editor, session, "cell:0:1", " fallback");
  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), ["writeback.table-changed"]);
  assert.equal(editor.document.getText(), afterExternalEdit);
  assert.equal(editor.document.getText().slice(0, table.length), table, "the identical first table must not be selected");
  session.dispose();
  await closeAllEditors();
}

export async function testSessionTargetReacquiresAfterUndoRedo(): Promise<void> {
  const original = ["|===", "| A | B", "|==="].join("\n");
  const editor = await openAsciiDocDocument(original);
  const session = sessionAt(editor, 0);
  const originalToken = session.revisionToken;
  const result = await applyPlainCellContentToEditor(editor, session, "cell:0:1", " Bee");
  assert.equal(result.ok, true);
  const edited = editor.document.getText();
  const editedToken = session.revisionToken;
  assert.notEqual(editedToken, originalToken);

  const undoPreparation = readyUndoRedo(session.prepareUndoRedo(editor.document, "undo"));
  await focusTextEditorForUndoRedo(editor);
  await vscode.commands.executeCommand("undo");
  await waitForDocumentText(editor.document, original);
  assert.equal(session.reacquireAfterUndoRedo(editor.document, undoPreparation).status, "ready");
  const undoToken = session.revisionToken;
  assert.notEqual(undoToken, editedToken);

  const redoPreparation = readyUndoRedo(session.prepareUndoRedo(editor.document, "redo"));
  await focusTextEditorForUndoRedo(editor);
  await vscode.commands.executeCommand("redo");
  await waitForDocumentText(editor.document, edited);
  assert.equal(session.reacquireAfterUndoRedo(editor.document, redoPreparation).status, "ready");
  assert.notEqual(session.revisionToken, undoToken);
  session.dispose();
  await closeAllEditors();
}

export async function testUndoRedoPreflightPreservesExternallyChangedTarget(): Promise<void> {
  const original = ["|===", "| A | B", "|==="].join("\n");
  const editor = await openAsciiDocDocument(original);
  const session = sessionAt(editor, 0);
  const cellOffset = original.indexOf(" B");
  await replace(editor, cellOffset, cellOffset + 2, " changed");
  const changed = editor.document.getText();
  const messages: unknown[] = [];

  await applyUndoRedo(editor, panel(messages), session, { type: "request-undo", ...mutationMetadata(session) });
  assert.equal(editor.document.getText(), changed, "preflight conflict must not invoke the document undo command");
  assert.equal(diagnosticCode(messages), "writeback.table-changed");
  session.dispose();
  await closeAllEditors();
}

export async function testUndoRedoDoesNotRecoverIndeterminateSession(): Promise<void> {
  const original = ["|===", "| A | B", "|==="].join("\n");
  const editor = await openAsciiDocDocument(original);
  const session = sessionAt(editor, 0);
  session.beginApply();
  const cellOffset = original.indexOf(" B");
  await replace(editor, cellOffset, cellOffset + 2, " raced");
  assert.equal(session.finishApply(editor.document, original), false);
  const raced = editor.document.getText();
  const messages: unknown[] = [];

  await applyUndoRedo(editor, panel(messages), session, { type: "request-undo", ...mutationMetadata(session) });
  assert.equal(editor.document.getText(), raced, "indeterminate state must not invoke undo or reacquire implicitly");
  assert.equal(diagnosticCode(messages), "writeback.apply-raced");
  assert.equal(session.resolve(editor.document).status, "indeterminate");
  session.dispose();
  await closeAllEditors();
}

export async function testUndoWithoutSessionHistoryLeavesDocumentUnchanged(): Promise<void> {
  const original = ["|===", "| A | B", "|==="].join("\n");
  const editor = await openAsciiDocDocument(original);
  await replace(editor, 0, 0, "intro\n");
  const current = editor.document.getText();
  const session = sessionAt(editor, current.indexOf("|==="));
  const messages: unknown[] = [];

  await applyUndoRedo(editor, panel(messages), session, { type: "request-undo", ...mutationMetadata(session) });
  assert.equal(editor.document.getText(), current, "unrelated document undo history must not be consumed");
  assert.equal(diagnosticCode(messages), "writeback.revision-mismatch");
  session.dispose();
  await closeAllEditors();
}

export async function testUndoDoesNotConsumeNewerTargetExternalDocumentEdit(): Promise<void> {
  const original = ["|===", "| A | B", "|===", "", "tail"].join("\n");
  const editor = await openAsciiDocDocument(original);
  const session = sessionAt(editor, 0);
  const result = await applyPlainCellContentToEditor(editor, session, "cell:0:1", " Bee");
  assert.equal(result.ok, true);
  const end = editor.document.getText().length;
  await replace(editor, end, end, "\nexternal");
  const current = editor.document.getText();
  const messages: unknown[] = [];

  await applyUndoRedo(editor, panel(messages), session, { type: "request-undo", ...mutationMetadata(session) });
  assert.equal(editor.document.getText(), current, "a newer unrelated document edit must remain at the top of the VS Code undo stack");
  assert.equal(diagnosticCode(messages), "writeback.revision-mismatch");
  session.dispose();
  await closeAllEditors();
}

export async function testSessionTargetDetectsMultipleAnchorCandidates(): Promise<void> {
  const original = ["|===", "| A very long cell | Another long cell", "|==="].join("\n");
  const editor = await openAsciiDocDocument(original);
  const session = sessionAt(editor, 0);
  const twoTables = ["|===", "| A", "|===", "|===", "| B", "|==="].join("\n");
  assert.ok(twoTables.length < original.length);
  await replace(editor, 0, original.length, twoTables);
  const beforeAttempt = editor.document.getText();

  const resolution = session.resolve(editor.document);
  assert.equal(resolution.status, "conflict");
  if (resolution.status === "conflict") assert.equal(resolution.reason, "table-ambiguous");
  const result = await applyPlainCellContentToEditor(editor, session, "cell:0:0", " overwritten");
  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), ["writeback.table-ambiguous"]);
  assert.equal(editor.document.getText(), beforeAttempt);
  session.dispose();
  await closeAllEditors();
}

function sessionAt(editor: vscode.TextEditor, offset: number) {
  const tableBlock = findAsciiDocTableBlock(editor.document.getText(), offset);
  assert.ok(tableBlock);
  return createTableEditorSessionTarget(editor.document, tableBlock);
}

async function replace(editor: vscode.TextEditor, start: number, end: number, text: string): Promise<void> {
  const applied = await editor.edit((builder) => {
    builder.replace(new vscode.Range(editor.document.positionAt(start), editor.document.positionAt(end)), text);
  });
  assert.equal(applied, true);
}

function readyUndoRedo(value: ReturnType<ReturnType<typeof sessionAt>["prepareUndoRedo"]>): SessionUndoRedoPreparation {
  assert.equal(value.status, "ready");
  return value as SessionUndoRedoPreparation;
}

function panel(messages: unknown[]): vscode.WebviewPanel {
  return {
    webview: {
      postMessage: async (message: unknown) => {
        messages.push(message);
        return true;
      }
    }
  } as unknown as vscode.WebviewPanel;
}

function diagnosticCode(messages: unknown[]): string | undefined {
  const message = messages.at(-1) as { result?: { diagnostics?: readonly { code?: string }[] } } | undefined;
  return message?.result?.diagnostics?.[0]?.code;
}

let nextOperationId = 1;
function mutationMetadata(session: ReturnType<typeof sessionAt>): { operationId: string; revisionToken: string } {
  return { operationId: `host-test-${nextOperationId += 1}`, revisionToken: session.revisionToken };
}
