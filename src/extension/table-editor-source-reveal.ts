import * as vscode from "vscode";
import { findAsciiDocTableBlock, parseAsciiDocTable } from "../core";
import type { SourceCellRevealResult } from "./types";

export async function revealSourceCellInEditor(
  editor: vscode.TextEditor,
  tableStartOffset: number,
  sourceCellId: string
): Promise<SourceCellRevealResult> {
  const source = editor.document.getText();
  const tableBlock = findAsciiDocTableBlock(source, tableStartOffset);
  const cell = tableBlock === undefined
    ? undefined
    : parseAsciiDocTable(tableBlock.raw).rows.flatMap((row) => row.cells).find((candidate) => candidate.nodeId === sourceCellId);

  if (tableBlock === undefined || cell === undefined) {
    return {
      ok: false,
      diagnostics: [{
        code: "source-cell-reveal.not-found",
        severity: "error",
        message: vscode.l10n.t("Reveal blocked: source cell was not found."),
        nodeId: sourceCellId
      }]
    };
  }

  const start = editor.document.positionAt(tableBlock.range.start.offset + cell.range.start.offset);
  const end = editor.document.positionAt(tableBlock.range.start.offset + cell.range.end.offset);
  const targetEditor = await vscode.window.showTextDocument(editor.document, editor.viewColumn ?? vscode.ViewColumn.One, false);
  const range = new vscode.Range(start, end);
  targetEditor.selection = new vscode.Selection(start, end);
  targetEditor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);

  return {
    ok: true,
    diagnostics: []
  };
}
