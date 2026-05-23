import assert from "node:assert/strict";
import * as vscode from "vscode";
import { closeAllEditors, openAsciiDocDocument } from "./host-harness";

export async function testUnsupportedCsvTableFallsBack(): Promise<void> {
  const editor = await openAsciiDocDocument([
    "[format=csv]",
    "|===",
    "Name,Value",
    "A,1",
    "|==="
  ].join("\n"));
  editor.selection = new vscode.Selection(new vscode.Position(2, 0), new vscode.Position(2, 0));

  const result = await vscode.commands.executeCommand<{ ok: boolean; mode: string; diagnostics: Array<{ code: string }> }>(
    "asciidocTable.openEditor"
  );

  assert.equal(result.ok, true);
  assert.equal(result.mode, "fallback");
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), ["table.format.unsupported"]);
  await closeAllEditors();
}

