import * as vscode from "vscode";
import { findAsciiDocTableBlock } from "../core";
import { latestPanel } from "./panel";
import { applyBlockCellContentToEditor, applyHorizontalMergeToEditor, applyHorizontalUnmergeToEditor, applyPlainCellContentToEditor, applyPlainCellContentsToEditor, applyRowColumnEditToEditor } from "./table-editor-document-edits";
import { revealSourceCellInEditor } from "./table-editor-source-reveal";
import type { CellContentReplacement, CellContentUpdateResult, RowColumnEditMessage, SourceCellRevealResult } from "./types";

export function registerTestCommands(): vscode.Disposable[] {
  if (process.env.ASCIIDOC_TABLE_ENABLE_TEST_COMMANDS !== "1") {
    return [];
  }

  return [
    vscode.commands.registerCommand(
      "asciidocTable.test.setEditorMode",
      async (mode: "edit" | "preview"): Promise<boolean> => {
        const panel = latestPanel();
        if (panel === undefined) {
          return false;
        }
        await panel.webview.postMessage({ type: "set-editor-mode-for-review", mode });
        return true;
      }
    ),
    vscode.commands.registerCommand(
      "asciidocTable.test.replacePlainCellContent",
      async (sourceCellId: string, contentRaw: string): Promise<CellContentUpdateResult> => {
        const context = activeTableContext("writeback");
        return context.ok
          ? applyPlainCellContentToEditor(context.editor, context.tableStartOffset, sourceCellId, contentRaw)
          : context.result;
      }
    ),
    vscode.commands.registerCommand(
      "asciidocTable.test.replacePlainCellContents",
      async (replacements: CellContentReplacement[]): Promise<CellContentUpdateResult> => {
        const context = activeTableContext("writeback");
        return context.ok
          ? applyPlainCellContentsToEditor(context.editor, context.tableStartOffset, replacements)
          : context.result;
      }
    ),
    vscode.commands.registerCommand(
      "asciidocTable.test.mergePlainCellsHorizontally",
      async (sourceCellIds: string[]): Promise<CellContentUpdateResult> => {
        const context = activeTableContext("writeback");
        return context.ok
          ? applyHorizontalMergeToEditor(context.editor, context.tableStartOffset, sourceCellIds)
          : context.result;
      }
    ),
    vscode.commands.registerCommand(
      "asciidocTable.test.unmergePlainCellHorizontally",
      async (sourceCellId: string): Promise<CellContentUpdateResult> => {
        const context = activeTableContext("writeback");
        return context.ok
          ? applyHorizontalUnmergeToEditor(context.editor, context.tableStartOffset, sourceCellId)
          : context.result;
      }
    ),
    vscode.commands.registerCommand(
      "asciidocTable.test.editRowColumnStructure",
      async (operation: RowColumnEditMessage["type"], sourceCellId: string): Promise<CellContentUpdateResult> => {
        const context = activeTableContext("writeback");
        return context.ok
          ? applyRowColumnEditToEditor(context.editor, context.tableStartOffset, { type: operation, sourceCellId })
          : context.result;
      }
    ),
    vscode.commands.registerCommand(
      "asciidocTable.test.replaceBlockCellContent",
      async (sourceCellId: string, contentRaw: string): Promise<CellContentUpdateResult> => {
        const context = activeTableContext("writeback");
        return context.ok
          ? applyBlockCellContentToEditor(context.editor, context.tableStartOffset, { sourceCellId, contentRaw })
          : context.result;
      }
    ),
    vscode.commands.registerCommand(
      "asciidocTable.test.revealSourceCell",
      async (sourceCellId: string): Promise<SourceCellRevealResult> => {
        const context = activeTableContext("source-cell-reveal");
        return context.ok
          ? revealSourceCellInEditor(context.editor, context.tableStartOffset, sourceCellId)
          : {
              ok: false,
              diagnostics: context.result.diagnostics.map((diagnostic) => ({
                ...diagnostic,
                code: diagnostic.code.replace("writeback", "source-cell-reveal")
              }))
            };
      }
    )
  ];
}

function activeTableContext(stage: "writeback" | "source-cell-reveal"):
  | { ok: true; editor: vscode.TextEditor; tableStartOffset: number }
  | { ok: false; result: CellContentUpdateResult } {
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined) {
    return {
      ok: false,
      result: {
        ok: false,
        diagnostics: [{
          code: `${stage}.no-active-editor`,
          severity: "error",
          message: "No active editor was available"
        }]
      }
    };
  }
  const source = editor.document.getText();
  const tableBlock = findAsciiDocTableBlock(source, editor.document.offsetAt(editor.selection.active));
  if (tableBlock === undefined) {
    return {
      ok: false,
      result: {
        ok: false,
        diagnostics: [{
          code: `${stage}.table-not-found`,
          severity: "error",
          message: "No AsciiDoc table block was found"
        }]
      }
    };
  }
  return { ok: true, editor, tableStartOffset: tableBlock.range.start.offset };
}

