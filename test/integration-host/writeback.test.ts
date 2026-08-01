import assert from "node:assert/strict";
import * as vscode from "vscode";
import { applyPlainCellBlockContentToEditor } from "../../src/extension/table-editor-document-edits";
import { closeAllEditors, openAsciiDocDocument } from "./host-harness";

type HostWriteBackResult = {
  readonly ok: boolean;
  readonly diagnostics: readonly { readonly code: string }[];
};

export async function testPlainCellContentWriteBackCommand(): Promise<void> {
  const editor = await openAsciiDocDocument(["|===", "| A | B", "|==="].join("\n"));
  editor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0));

  const result = await vscode.commands.executeCommand<{ ok: boolean; diagnostics: unknown[] }>(
    "asciidocTable.test.replacePlainCellContent",
    "cell:0:1",
    " Bee"
  );

  assert.equal(result.ok, true);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(editor.document.getText(), ["|===", "| A | Bee", "|==="].join("\n"));
  await closeAllEditors();
}

export async function testPlainCellContentsBatchWriteBackCommand(): Promise<void> {
  const editor = await openAsciiDocDocument(["|===", "| A | B", "| C | D", "|==="].join("\n"));
  editor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0));

  const result = await vscode.commands.executeCommand<{ ok: boolean; diagnostics: unknown[] }>(
    "asciidocTable.test.replacePlainCellContents",
    [
      { sourceCellId: "cell:0:1", contentRaw: " Bee" },
      { sourceCellId: "cell:1:0", contentRaw: " Sea" }
    ]
  );

  assert.equal(result.ok, true);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(editor.document.getText(), ["|===", "| A | Bee", "| Sea | D", "|==="].join("\n"));
  await closeAllEditors();
}

export async function testColsAttributeBatchWriteBackCommand(): Promise<void> {
  const editor = await openAsciiDocDocument([
    "[cols=3*]",
    "|===",
    "| A",
    "| B",
    "| C",
    "",
    "| D",
    "| E",
    "| F",
    "|==="
  ].join("\n"));
  editor.selection = new vscode.Selection(new vscode.Position(2, 0), new vscode.Position(2, 0));

  const result = await vscode.commands.executeCommand<{ ok: boolean; diagnostics: unknown[] }>(
    "asciidocTable.test.replacePlainCellContents",
    [
      { sourceCellId: "cell:0:1", contentRaw: " Bee" },
      { sourceCellId: "cell:1:2", contentRaw: " Fox" }
    ]
  );

  assert.equal(result.ok, true);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(editor.document.getText(), [
    "[cols=3*]",
    "|===",
    "| A",
    "| Bee",
    "| C",
    "",
    "| D",
    "| E",
    "| Fox",
    "|==="
  ].join("\n"));
  await closeAllEditors();
}

export async function testCustomSeparatorWriteBackCommand(): Promise<void> {
  const editor = await openAsciiDocDocument([
    "[cols=2*,separator=¦]",
    "|===",
    "¦ Pipe | content",
    "¦ Right cell",
    "|==="
  ].join("\n"));
  editor.selection = new vscode.Selection(new vscode.Position(2, 0), new vscode.Position(2, 0));

  const result = await vscode.commands.executeCommand<{ ok: boolean; diagnostics: unknown[] }>(
    "asciidocTable.test.replacePlainCellContent",
    "cell:0:1",
    " Updated"
  );

  assert.equal(result.ok, true);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(editor.document.getText(), [
    "[cols=2*,separator=¦]",
    "|===",
    "¦ Pipe | content",
    "¦ Updated",
    "|==="
  ].join("\n"));
  await closeAllEditors();
}

export async function testUnsafePlainCellContentLeavesDocumentUnchanged(): Promise<void> {
  const originalSource = ["|===", "| A | B", "|==="].join("\n");
  const editor = await openAsciiDocDocument(originalSource);
  editor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0));

  const result = await vscode.commands.executeCommand<HostWriteBackResult>(
    "asciidocTable.test.replacePlainCellContent",
    "cell:0:1",
    " Bee\n| injected"
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), ["writeback.unsafe-plain-cell-content"]);
  assert.equal(editor.document.getText(), originalSource);
  await closeAllEditors();
}

export async function testUnsafePlainCellContentsBatchLeavesDocumentUnchanged(): Promise<void> {
  const originalSource = ["|===", "| A | B", "| C | D", "|==="].join("\n");
  const editor = await openAsciiDocDocument(originalSource);
  editor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0));

  const result = await vscode.commands.executeCommand<HostWriteBackResult>(
    "asciidocTable.test.replacePlainCellContents",
    [
      { sourceCellId: "cell:0:1", contentRaw: " Bee" },
      { sourceCellId: "cell:1:0", contentRaw: " Sea\r| injected" }
    ]
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), ["writeback.unsafe-plain-cell-content"]);
  assert.equal(editor.document.getText(), originalSource);
  await closeAllEditors();
}

export async function testUnsafePlainToBlockContentLeavesDocumentUnchanged(): Promise<void> {
  const originalSource = ["= Table", "", "|===", "| A | B", "|==="].join("\n");
  const editor = await openAsciiDocDocument(originalSource);
  const tableStartOffset = originalSource.indexOf("|===");

  const result = await applyPlainCellBlockContentToEditor(editor, tableStartOffset, {
    sourceCellId: "cell:0:0",
    contentRaw: " * item\n|==="
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), ["writeback.unsafe-block-cell-content"]);
  assert.equal(editor.document.getText(), originalSource);
  await closeAllEditors();
}
