import assert from "node:assert/strict";
import * as vscode from "vscode";

export async function openAsciiDocDocument(content: string): Promise<vscode.TextEditor> {
  const document = await vscode.workspace.openTextDocument({ content, language: "asciidoc" });
  return vscode.window.showTextDocument(document);
}

export async function closeAllEditors(): Promise<void> {
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}

export async function focusTextEditorForUndoRedo(editor: vscode.TextEditor): Promise<void> {
  await vscode.window.showTextDocument(editor.document, editor.viewColumn ?? vscode.ViewColumn.One, false);
  await vscode.commands.executeCommand("workbench.action.focusActiveEditorGroup");
}

export async function waitForDocumentText(document: vscode.TextDocument, expected: string): Promise<void> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (document.getText() === expected) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(document.getText(), expected);
}

