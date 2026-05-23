import assert from "node:assert/strict";
import * as vscode from "vscode";
import { closeAllEditors, openAsciiDocDocument } from "./host-harness";

export async function testRowColumnStructureEditCommands(): Promise<void> {
  const editor = await openAsciiDocDocument(["|===", "| A | B", "| C | D", "|==="].join("\n"));
  editor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0));

  const insertRow = await vscode.commands.executeCommand<{ ok: boolean; diagnostics: unknown[] }>(
    "asciidocTable.test.editRowColumnStructure",
    "request-insert-row-after",
    "cell:0:0"
  );
  assert.equal(insertRow.ok, true);
  assert.equal(insertRow.diagnostics.length, 0);
  assert.equal(editor.document.getText(), ["|===", "| A | B", "|  | ", "| C | D", "|==="].join("\n"));

  const insertRowBefore = await vscode.commands.executeCommand<{ ok: boolean; diagnostics: unknown[] }>(
    "asciidocTable.test.editRowColumnStructure",
    "request-insert-row-before",
    "cell:1:0"
  );
  assert.equal(insertRowBefore.ok, true);
  assert.equal(insertRowBefore.diagnostics.length, 0);
  assert.equal(editor.document.getText(), ["|===", "| A | B", "|  | ", "|  | ", "| C | D", "|==="].join("\n"));

  const insertColumn = await vscode.commands.executeCommand<{ ok: boolean; diagnostics: unknown[] }>(
    "asciidocTable.test.editRowColumnStructure",
    "request-insert-column-after",
    "cell:0:0"
  );
  assert.equal(insertColumn.ok, true);
  assert.equal(insertColumn.diagnostics.length, 0);
  assert.equal(editor.document.getText(), ["|===", "| A |  | B", "|  |  | ", "|  |  | ", "| C |  | D", "|==="].join("\n"));

  const insertColumnBefore = await vscode.commands.executeCommand<{ ok: boolean; diagnostics: unknown[] }>(
    "asciidocTable.test.editRowColumnStructure",
    "request-insert-column-before",
    "cell:0:2"
  );
  assert.equal(insertColumnBefore.ok, true);
  assert.equal(insertColumnBefore.diagnostics.length, 0);
  assert.equal(editor.document.getText(), ["|===", "| A |  |  | B", "|  |  |  | ", "|  |  |  | ", "| C |  |  | D", "|==="].join("\n"));

  const deleteColumn = await vscode.commands.executeCommand<{ ok: boolean; diagnostics: unknown[] }>(
    "asciidocTable.test.editRowColumnStructure",
    "request-delete-column",
    "cell:0:1"
  );
  assert.equal(deleteColumn.ok, true);
  assert.equal(deleteColumn.diagnostics.length, 0);
  assert.equal(editor.document.getText(), ["|===", "| A |  | B", "|  |  | ", "|  |  | ", "| C |  | D", "|==="].join("\n"));

  const deleteRow = await vscode.commands.executeCommand<{ ok: boolean; diagnostics: unknown[] }>(
    "asciidocTable.test.editRowColumnStructure",
    "request-delete-row",
    "cell:1:0"
  );
  assert.equal(deleteRow.ok, true);
  assert.equal(deleteRow.diagnostics.length, 0);
  assert.equal(editor.document.getText(), ["|===", "| A |  | B", "|  |  | ", "| C |  | D", "|==="].join("\n"));
  await closeAllEditors();
}

