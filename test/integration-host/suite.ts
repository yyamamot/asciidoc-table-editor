import assert from "node:assert/strict";
import * as vscode from "vscode";

export async function run(): Promise<void> {
  await activateExtension();
  await testAsciiDocTableCodeLensTargetsTableBlocks();
  await testAsciiDocTableCodeLensOpensTargetTable();
  await testAsciiDocTableFormatCodeLensShowsReview();
  await testPlainCellContentWriteBackCommand();
  await testPlainCellContentsBatchWriteBackCommand();
  await testColsAttributeBatchWriteBackCommand();
  await testCustomSeparatorWriteBackCommand();
  await testHorizontalMergeWriteBackCommand();
  await testHorizontalUnmergeWriteBackCommand();
  await testRowColumnStructureEditCommands();
  await testUnsupportedCsvTableFallsBack();
  await testPlainCellContentUndoRedoUsesVSCodeStack();
  await testBlockCellSourceRevealCommand();
  await testBlockCellContentWriteBackCommandUsesVSCodeStack();
}

async function activateExtension(): Promise<void> {
  const extension = vscode.extensions.getExtension("yyamamot.asciidoc-table-editor");
  assert.ok(extension, "AsciiDoc Table Editor extension was not found in the host");
  await extension.activate();
}

async function testAsciiDocTableCodeLensTargetsTableBlocks(): Promise<void> {
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
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}

async function testAsciiDocTableCodeLensOpensTargetTable(): Promise<void> {
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
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}

async function testAsciiDocTableFormatCodeLensShowsReview(): Promise<void> {
  const editor = await openAsciiDocDocument([
    "|===",
    "| A | Long",
    "| Alpha | B",
    "|==="
  ].join("\n"));

  const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
    "vscode.executeCodeLensProvider",
    editor.document.uri
  );
  const formatLens = lenses.find((lens) => lens.command?.command === "asciidocTable.formatTable");
  assert.ok(formatLens?.command, "Format Table CodeLens was not provided");

  const result = await vscode.commands.executeCommand<{
    ok: boolean;
    model?: { formatReview?: { variants: Array<{ mode: string; after: string }> } };
  }>(
    formatLens.command.command,
    ...(formatLens.command.arguments ?? [])
  );

  assert.equal(result.ok, true, "Format Table CodeLens should open a format review");
  assert.ok(result.model?.formatReview?.variants.some((variant) => variant.mode === "table-layout" && variant.after.includes("| A     | Long")), "format review should include aligned source");
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}

async function testPlainCellContentWriteBackCommand(): Promise<void> {
  const editor = await openAsciiDocDocument([
    "|===",
    "| A | B",
    "|==="
  ].join("\n"));
  editor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0));

  const result = await vscode.commands.executeCommand<{ ok: boolean; diagnostics: unknown[] }>(
    "asciidocTable.test.replacePlainCellContent",
    "cell:0:1",
    " Bee"
  );

  assert.equal(result.ok, true);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(editor.document.getText(), [
    "|===",
    "| A | Bee",
    "|==="
  ].join("\n"));
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}

async function testPlainCellContentsBatchWriteBackCommand(): Promise<void> {
  const editor = await openAsciiDocDocument([
    "|===",
    "| A | B",
    "| C | D",
    "|==="
  ].join("\n"));
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
  assert.equal(editor.document.getText(), [
    "|===",
    "| A | Bee",
    "| Sea | D",
    "|==="
  ].join("\n"));
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}

async function testColsAttributeBatchWriteBackCommand(): Promise<void> {
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
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}

async function testCustomSeparatorWriteBackCommand(): Promise<void> {
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
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}

async function testHorizontalMergeWriteBackCommand(): Promise<void> {
  const editor = await openAsciiDocDocument([
    "|===",
    "| A |  | ",
    "|==="
  ].join("\n"));
  editor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0));

  const result = await vscode.commands.executeCommand<{ ok: boolean; diagnostics: unknown[] }>(
    "asciidocTable.test.mergePlainCellsHorizontally",
    ["cell:0:1", "cell:0:2"]
  );

  assert.equal(result.ok, true);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(editor.document.getText(), [
    "|===",
    "| A 2+| ",
    "|==="
  ].join("\n"));
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}

async function testHorizontalUnmergeWriteBackCommand(): Promise<void> {
  const editor = await openAsciiDocDocument([
    "|===",
    "| Keep 2+| ",
    "|==="
  ].join("\n"));
  editor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0));

  const result = await vscode.commands.executeCommand<{ ok: boolean; diagnostics: unknown[] }>(
    "asciidocTable.test.unmergePlainCellHorizontally",
    "cell:0:1"
  );

  assert.equal(result.ok, true);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(editor.document.getText(), [
    "|===",
    "| Keep |  | ",
    "|==="
  ].join("\n"));
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}

async function testRowColumnStructureEditCommands(): Promise<void> {
  const editor = await openAsciiDocDocument([
    "|===",
    "| A | B",
    "| C | D",
    "|==="
  ].join("\n"));
  editor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0));

  const insertRow = await vscode.commands.executeCommand<{ ok: boolean; diagnostics: unknown[] }>(
    "asciidocTable.test.editRowColumnStructure",
    "request-insert-row-after",
    "cell:0:0"
  );
  assert.equal(insertRow.ok, true);
  assert.equal(insertRow.diagnostics.length, 0);
  assert.equal(editor.document.getText(), [
    "|===",
    "| A | B",
    "|  | ",
    "| C | D",
    "|==="
  ].join("\n"));

  const insertRowBefore = await vscode.commands.executeCommand<{ ok: boolean; diagnostics: unknown[] }>(
    "asciidocTable.test.editRowColumnStructure",
    "request-insert-row-before",
    "cell:1:0"
  );
  assert.equal(insertRowBefore.ok, true);
  assert.equal(insertRowBefore.diagnostics.length, 0);
  assert.equal(editor.document.getText(), [
    "|===",
    "| A | B",
    "|  | ",
    "|  | ",
    "| C | D",
    "|==="
  ].join("\n"));

  const insertColumn = await vscode.commands.executeCommand<{ ok: boolean; diagnostics: unknown[] }>(
    "asciidocTable.test.editRowColumnStructure",
    "request-insert-column-after",
    "cell:0:0"
  );
  assert.equal(insertColumn.ok, true);
  assert.equal(insertColumn.diagnostics.length, 0);
  assert.equal(editor.document.getText(), [
    "|===",
    "| A |  | B",
    "|  |  | ",
    "|  |  | ",
    "| C |  | D",
    "|==="
  ].join("\n"));

  const insertColumnBefore = await vscode.commands.executeCommand<{ ok: boolean; diagnostics: unknown[] }>(
    "asciidocTable.test.editRowColumnStructure",
    "request-insert-column-before",
    "cell:0:2"
  );
  assert.equal(insertColumnBefore.ok, true);
  assert.equal(insertColumnBefore.diagnostics.length, 0);
  assert.equal(editor.document.getText(), [
    "|===",
    "| A |  |  | B",
    "|  |  |  | ",
    "|  |  |  | ",
    "| C |  |  | D",
    "|==="
  ].join("\n"));

  const deleteColumn = await vscode.commands.executeCommand<{ ok: boolean; diagnostics: unknown[] }>(
    "asciidocTable.test.editRowColumnStructure",
    "request-delete-column",
    "cell:0:1"
  );
  assert.equal(deleteColumn.ok, true);
  assert.equal(deleteColumn.diagnostics.length, 0);
  assert.equal(editor.document.getText(), [
    "|===",
    "| A |  | B",
    "|  |  | ",
    "|  |  | ",
    "| C |  | D",
    "|==="
  ].join("\n"));

  const deleteRow = await vscode.commands.executeCommand<{ ok: boolean; diagnostics: unknown[] }>(
    "asciidocTable.test.editRowColumnStructure",
    "request-delete-row",
    "cell:1:0"
  );
  assert.equal(deleteRow.ok, true);
  assert.equal(deleteRow.diagnostics.length, 0);
  assert.equal(editor.document.getText(), [
    "|===",
    "| A |  | B",
    "|  |  | ",
    "| C |  | D",
    "|==="
  ].join("\n"));
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}

async function testUnsupportedCsvTableFallsBack(): Promise<void> {
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
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}

async function testPlainCellContentUndoRedoUsesVSCodeStack(): Promise<void> {
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

  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}

async function testBlockCellSourceRevealCommand(): Promise<void> {
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
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}

async function testBlockCellContentWriteBackCommandUsesVSCodeStack(): Promise<void> {
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
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}

async function openAsciiDocDocument(content: string): Promise<vscode.TextEditor> {
  const document = await vscode.workspace.openTextDocument({ content, language: "asciidoc" });
  return vscode.window.showTextDocument(document);
}

async function focusTextEditorForUndoRedo(editor: vscode.TextEditor): Promise<void> {
  await vscode.window.showTextDocument(editor.document, editor.viewColumn ?? vscode.ViewColumn.One, false);
  await vscode.commands.executeCommand("workbench.action.focusActiveEditorGroup");
}

async function waitForDocumentText(document: vscode.TextDocument, expected: string): Promise<void> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (document.getText() === expected) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(document.getText(), expected);
}
