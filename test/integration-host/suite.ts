import assert from "node:assert/strict";
import * as vscode from "vscode";
import { testBlockCellContentWriteBackCommandUsesVSCodeStack, testBlockCellSourceRevealCommand, testUnsafeBlockCellContentLeavesDocumentUnchanged } from "./block-cell.test";
import { testAsciiDocTableCodeLensIgnoresOpaqueDelimitedBlocks, testAsciiDocTableCodeLensOpensTargetTable, testAsciiDocTableCodeLensTargetsTableBlocks } from "./codelens.test";
import { testUnsupportedCsvTableFallsBack } from "./fallback.test";
import { testAsciiDocTableFormatCodeLensShowsReview } from "./format.test";
import { testHorizontalMergeWriteBackCommand, testHorizontalUnmergeWriteBackCommand } from "./merge.test";
import { testRowColumnStructureEditCommands } from "./structure.test";
import { testPlainCellContentUndoRedoUsesVSCodeStack } from "./undo-redo.test";
import { testColsAttributeBatchWriteBackCommand, testCustomSeparatorWriteBackCommand, testPlainCellContentsBatchWriteBackCommand, testPlainCellContentWriteBackCommand, testUnsafePlainCellContentLeavesDocumentUnchanged, testUnsafePlainCellContentsBatchLeavesDocumentUnchanged, testUnsafePlainToBlockContentLeavesDocumentUnchanged } from "./writeback.test";

export async function run(): Promise<void> {
  await activateExtension();
  await testAsciiDocTableCodeLensTargetsTableBlocks();
  await testAsciiDocTableCodeLensIgnoresOpaqueDelimitedBlocks();
  await testAsciiDocTableCodeLensOpensTargetTable();
  await testAsciiDocTableFormatCodeLensShowsReview();
  await testPlainCellContentWriteBackCommand();
  await testPlainCellContentsBatchWriteBackCommand();
  await testColsAttributeBatchWriteBackCommand();
  await testCustomSeparatorWriteBackCommand();
  await testUnsafePlainCellContentLeavesDocumentUnchanged();
  await testUnsafePlainCellContentsBatchLeavesDocumentUnchanged();
  await testHorizontalMergeWriteBackCommand();
  await testHorizontalUnmergeWriteBackCommand();
  await testRowColumnStructureEditCommands();
  await testUnsupportedCsvTableFallsBack();
  await testPlainCellContentUndoRedoUsesVSCodeStack();
  await testBlockCellSourceRevealCommand();
  await testBlockCellContentWriteBackCommandUsesVSCodeStack();
  await testUnsafeBlockCellContentLeavesDocumentUnchanged();
  await testUnsafePlainToBlockContentLeavesDocumentUnchanged();
}

async function activateExtension(): Promise<void> {
  const extension = vscode.extensions.getExtension("yyamamot.asciidoc-table-editor");
  assert.ok(extension, "AsciiDoc Table Editor extension was not found in the host");
  await extension.activate();
}
