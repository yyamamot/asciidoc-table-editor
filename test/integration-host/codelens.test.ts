import assert from "node:assert/strict";
import * as vscode from "vscode";
import { closeAllEditors, openAsciiDocDocument } from "./host-harness";

export async function testAsciiDocTableCodeLensTargetsTableBlocks(): Promise<void> {
  const editor = await openAsciiDocDocument([
    "= Tables",
    "",
    "|===",
    "| A | B",
    "|===",
    "",
    "|===",
    "| C | D",
    "|==="
  ].join("\n"));

  const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
    "vscode.executeCodeLensProvider",
    editor.document.uri
  );

  assert.equal(lenses.length, 4, "expected open and format CodeLens per AsciiDoc table block");
  assert.deepEqual(lenses.map((lens) => lens.command?.command), [
    "asciidocTable.openEditor",
    "asciidocTable.formatTable",
    "asciidocTable.openEditor",
    "asciidocTable.formatTable"
  ]);
  assert.deepEqual(lenses.map((lens) => lens.command?.title), [
    "Open Table Editor",
    "Format Table",
    "Open Table Editor",
    "Format Table"
  ]);
  assert.deepEqual(lenses.map((lens) => lens.range.start.line), [2, 2, 6, 6]);
  await closeAllEditors();
}

export async function testAsciiDocTableCodeLensIgnoresOpaqueDelimitedBlocks(): Promise<void> {
  const editor = await openAsciiDocDocument([
    "|===",
    "| LIVE | table",
    "|===",
    "",
    "-----",
    "......",
    "|===",
    "| FAKE-NESTED | hidden",
    "|===",
    "......",
    "-----",
    "",
    "+++++",
    "|===",
    "| FAKE-PASSTHROUGH | hidden",
    "|===",
    "+++++",
    "",
    "/////",
    "|===",
    "| FAKE-UNCLOSED | hidden",
    "|==="
  ].join("\n"));

  const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
    "vscode.executeCodeLensProvider",
    editor.document.uri
  );

  assert.equal(lenses.length, 2, "expected CodeLens only for the live table outside opaque blocks");
  assert.deepEqual(lenses.map((lens) => lens.range.start.line), [0, 0]);
  await closeAllEditors();
}

export async function testAsciiDocTableCodeLensOpensTargetTable(): Promise<void> {
  const editor = await openAsciiDocDocument([
    "|===",
    "| A | B",
    "|===",
    "",
    "|===",
    "| Target | Table",
    "|==="
  ].join("\n"));

  const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
    "vscode.executeCodeLensProvider",
    editor.document.uri
  );
  const secondLens = lenses.find((lens) =>
    lens.range.start.line === 4 && lens.command?.command === "asciidocTable.openEditor"
  );
  assert.ok(secondLens?.command, "second table CodeLens was not provided");

  const result = await vscode.commands.executeCommand<{ ok: boolean; diagnostics?: unknown[] }>(
    secondLens.command.command,
    ...(secondLens.command.arguments ?? [])
  );

  assert.equal(result.ok, true, "CodeLens command should open the target table");
  assert.equal(result.diagnostics?.length ?? 0, 0);
  assert.equal(vscode.window.activeTextEditor?.selection.active.line, 4);
  await closeAllEditors();
}
