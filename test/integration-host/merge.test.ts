import assert from "node:assert/strict";
import * as vscode from "vscode";
import { closeAllEditors, openAsciiDocDocument } from "./host-harness";

export async function testHorizontalMergeWriteBackCommand(): Promise<void> {
  const editor = await openAsciiDocDocument(["|===", "| A |  | ", "|==="].join("\n"));
  editor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0));

  const result = await vscode.commands.executeCommand<{ ok: boolean; diagnostics: unknown[] }>(
    "asciidocTable.test.mergePlainCellsHorizontally",
    ["cell:0:1", "cell:0:2"]
  );

  assert.equal(result.ok, true);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(editor.document.getText(), ["|===", "| A 2+| ", "|==="].join("\n"));
  await closeAllEditors();
}

export async function testHorizontalUnmergeWriteBackCommand(): Promise<void> {
  const editor = await openAsciiDocDocument(["|===", "| Keep 2+| ", "|==="].join("\n"));
  editor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0));

  const result = await vscode.commands.executeCommand<{ ok: boolean; diagnostics: unknown[] }>(
    "asciidocTable.test.unmergePlainCellHorizontally",
    "cell:0:1"
  );

  assert.equal(result.ok, true);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(editor.document.getText(), ["|===", "| Keep |  | ", "|==="].join("\n"));
  await closeAllEditors();
}

