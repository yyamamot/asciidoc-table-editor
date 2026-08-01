import assert from "node:assert/strict";
import * as vscode from "vscode";
import { closeAllEditors, focusTextEditorForUndoRedo, openAsciiDocDocument, waitForDocumentText } from "./host-harness";

export async function testBlockCellSourceRevealCommand(): Promise<void> {
  const editor = await openAsciiDocDocument([
    "= Table",
    "",
    "|===",
    "a| * item",
    "* detail",
    "| Plain",
    "|==="
  ].join("\n"));
  editor.selection = new vscode.Selection(new vscode.Position(3, 0), new vscode.Position(3, 0));

  const result = await vscode.commands.executeCommand<{ ok: boolean; diagnostics: unknown[] }>(
    "asciidocTable.test.revealSourceCell",
    "cell:0:0"
  );

  assert.equal(result.ok, true);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(editor.document.getText(editor.selection), "a| * item\n* detail");
  assert.equal(editor.selection.start.line, 3);
  assert.equal(editor.selection.start.character, 0);
  await closeAllEditors();
}

export async function testBlockCellContentWriteBackCommandUsesVSCodeStack(): Promise<void> {
  const editor = await openAsciiDocDocument([
    "= Table",
    "",
    "|===",
    "a| * item",
    "| Plain",
    "|==="
  ].join("\n"));
  editor.selection = new vscode.Selection(new vscode.Position(3, 0), new vscode.Position(3, 0));

  const originalSource = editor.document.getText();
  const result = await vscode.commands.executeCommand<{ ok: boolean; diagnostics: unknown[] }>(
    "asciidocTable.test.replaceBlockCellContent",
    "cell:0:0",
    " * updated\n* next"
  );
  const editedSource = editor.document.getText();

  assert.equal(result.ok, true);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(editedSource, [
    "= Table",
    "",
    "|===",
    "a| * updated",
    "* next",
    "| Plain",
    "|==="
  ].join("\n"));

  await focusTextEditorForUndoRedo(editor);
  await vscode.commands.executeCommand("undo");
  await waitForDocumentText(editor.document, originalSource);

  await focusTextEditorForUndoRedo(editor);
  await vscode.commands.executeCommand("redo");
  await waitForDocumentText(editor.document, editedSource);
  await closeAllEditors();
}

export async function testUnsafeBlockCellContentLeavesDocumentUnchanged(): Promise<void> {
  const originalSource = [
    "= Table",
    "",
    "|===",
    "a| * item",
    "| Plain",
    "|==="
  ].join("\n");
  const editor = await openAsciiDocDocument(originalSource);
  editor.selection = new vscode.Selection(new vscode.Position(3, 0), new vscode.Position(3, 0));

  const result = await vscode.commands.executeCommand<{
    readonly ok: boolean;
    readonly diagnostics: readonly { readonly code: string }[];
  }>(
    "asciidocTable.test.replaceBlockCellContent",
    "cell:0:0",
    " * updated\n|==="
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), ["writeback.unsafe-block-cell-content"]);
  assert.equal(editor.document.getText(), originalSource);
  await closeAllEditors();
}
