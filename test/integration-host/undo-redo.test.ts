import assert from "node:assert/strict";
import * as vscode from "vscode";
import { closeAllEditors, focusTextEditorForUndoRedo, openAsciiDocDocument, waitForDocumentText } from "./host-harness";

export async function testPlainCellContentUndoRedoUsesVSCodeStack(): Promise<void> {
  const editor = await openAsciiDocDocument([
    "= Tables",
    "",
    "|===",
    "| A | B",
    "|===",
    "",
    "|===",
    "| Other | Table",
    "|==="
  ].join("\n"));
  editor.selection = new vscode.Selection(new vscode.Position(3, 0), new vscode.Position(3, 0));

  const originalSource = editor.document.getText();
  const result = await vscode.commands.executeCommand<{ ok: boolean; diagnostics: unknown[] }>(
    "asciidocTable.test.replacePlainCellContent",
    "cell:0:1",
    " Bee"
  );
  const editedSource = editor.document.getText();

  assert.equal(result.ok, true);
  assert.equal(result.diagnostics.length, 0);
  assert.notEqual(editedSource, originalSource);
  assert.ok(editedSource.includes("| A | Bee"));
  assert.ok(editedSource.includes("| Other | Table"), "unrelated table block should remain intact");

  await focusTextEditorForUndoRedo(editor);
  await vscode.commands.executeCommand("undo");
  await waitForDocumentText(editor.document, originalSource);

  await focusTextEditorForUndoRedo(editor);
  await vscode.commands.executeCommand("redo");
  await waitForDocumentText(editor.document, editedSource);

  await closeAllEditors();
}

