import * as vscode from "vscode";
import { createWebviewAppModel, renderTableEditorHtml, type WebviewAppModel } from "../app";
import { findAsciiDocTableBlock, parseAsciiDocTable, projectGridModel, type TableDiagnostic, type TableFormatMode } from "../core";
import { createTableEditorPanel } from "./panel";
import { registerTableEditorMessageRouter } from "./message-router";
import { createTableEditorLabels } from "./table-editor-labels";
import { renderTableEditorPreview } from "./table-editor-preview";
import { applyAppearanceUpdate, applyBlockCellSourceUpdate, applyCellContentsUpdate, applyCellContentUpdate, applyCellStyleUpdate, applyColumnSpecUpdate, applyFormatReview, applyHeaderFooterUpdate, applyImportedPaste, applyMergeCells, applyPlainCellBlockSourceReplace, applyRectangularPaste, applyRevealSourceCell, applyRowColumnEdit, applyUndoRedo, applyUnmergeCell, openFormatReviewInPanel } from "./command-webview-handlers";
import { createNonce, resolveTargetEditor, writeUiReviewSnapshotIfRequested, type OpenTableEditorCommandResult } from "./command-utils";
import type { CellContentReplacement, OpenTableEditorTarget, RowColumnEditMessage } from "./types";
import { applyImportedTablePasteToEditor } from "./table-editor-document-edits";

export function registerOpenEditorCommand(): vscode.Disposable {
  return vscode.commands.registerCommand("asciidocTable.openEditor", async (target?: OpenTableEditorTarget): Promise<OpenTableEditorCommandResult> => {
    const editor = await resolveTargetEditor(target);
    if (editor === undefined) {
      const message = vscode.l10n.t("Open an AsciiDoc document before opening the table editor.");
      void vscode.window.showWarningMessage(message);
      return { ok: false, reason: "no-editor", message };
    }

    const source = editor.document.getText();
    const cursorOffset = typeof target?.tableStartOffset === "number"
      ? target.tableStartOffset
      : editor.document.offsetAt(editor.selection.active);
    const tableBlock = findAsciiDocTableBlock(source, cursorOffset);
    if (tableBlock === undefined) {
      const message = vscode.l10n.t("Place the cursor inside an AsciiDoc table before opening the table editor.");
      void vscode.window.showWarningMessage(message);
      return { ok: false, reason: "no-table", message };
    }

    const parsed = parseAsciiDocTable(tableBlock.raw);
    const grid = projectGridModel(parsed);
    const preview = await renderTableEditorPreview(tableBlock.raw);
    const model = createWebviewAppModel(grid, { ...preview, tableAttributes: parsed.attributes });
    const html = renderTableEditorHtml(model, createNonce(), {}, createTableEditorLabels());
    const tableStartOffset = tableBlock.range.start.offset;
    const panel = createTableEditorPanel();
    let formatReview: WebviewAppModel["formatReview"] = model.formatReview;
    registerTableEditorMessageRouter(panel, {
      uiReviewSnapshot: writeUiReviewSnapshotIfRequested,
      updateCellContent: (message) => void applyCellContentUpdate(editor, panel, tableStartOffset, message as { sourceCellId: string; contentRaw: string; selectedSourceCellId?: string }),
      updateCellContents: (message) => void applyCellContentsUpdate(editor, panel, tableStartOffset, message as { replacements: CellContentReplacement[]; selectedSourceCellId?: string; diagnostics?: readonly TableDiagnostic[] }),
      pasteRectangularTable: (message) => void applyRectangularPaste(editor, panel, tableStartOffset, message as { startSourceCellId: string; rows: readonly (readonly string[])[]; selectedSourceCellId?: string; diagnostics?: readonly TableDiagnostic[] }),
      pasteImportedTable: (message) => void applyImportedPaste(editor, panel, tableStartOffset, message as Parameters<typeof applyImportedTablePasteToEditor>[2] & { selectedSourceCellId?: string }),
      updateBlockCellSource: (message) => void applyBlockCellSourceUpdate(editor, panel, tableStartOffset, message as { sourceCellId: string; contentRaw: string; selectedSourceCellId?: string }),
      replaceCellWithBlockSource: (message) => void applyPlainCellBlockSourceReplace(editor, panel, tableStartOffset, message as { sourceCellId: string; contentRaw: string; selectedSourceCellId?: string; diagnostics?: readonly TableDiagnostic[] }),
      mergeCells: (message) => void applyMergeCells(editor, panel, tableStartOffset, message as { sourceCellIds: string[]; selectedSourceCellId?: string }),
      unmergeCell: (message) => void applyUnmergeCell(editor, panel, tableStartOffset, message as { sourceCellId: string; selectedSourceCellId?: string }),
      rowColumnEdit: (message) => void applyRowColumnEdit(editor, panel, tableStartOffset, message as RowColumnEditMessage),
      revealSourceCell: (message) => void applyRevealSourceCell(editor, panel, tableStartOffset, message as { sourceCellId: string; selectedSourceCellId?: string }),
      undoRedo: (message) => void applyUndoRedo(editor, panel, tableStartOffset, message as { type: "request-undo" | "request-redo"; selectedSourceCellId?: string }),
      requestFormatTable: (message) => void openFormatReviewInPanel(editor, panel, tableStartOffset, (message as { selectedSourceCellId?: string }).selectedSourceCellId).then((nextFormatReview) => {
        if (nextFormatReview !== undefined) {
          formatReview = nextFormatReview;
        }
      }),
      applyFormatTable: (message) => void applyFormatReview(editor, panel, tableStartOffset, formatReview, (message as { mode?: TableFormatMode }).mode, (message as { selectedSourceCellId?: string }).selectedSourceCellId),
      updateCellStyle: (message) => void applyCellStyleUpdate(editor, panel, tableStartOffset, message as { sourceCellIds: readonly string[]; style?: string; horizontalAlign?: "left" | "center" | "right"; verticalAlign?: "top" | "middle" | "bottom"; selectedSourceCellId?: string }),
      updateHeaderFooter: (message) => void applyHeaderFooterUpdate(editor, panel, tableStartOffset, message as { header?: boolean; footer?: boolean; noheader?: boolean; selectedSourceCellId?: string }),
      updateColumnSpec: (message) => void applyColumnSpecUpdate(editor, panel, tableStartOffset, message as { columnIndex: number; widthRaw?: string; horizontalAlign?: "left" | "center" | "right"; verticalAlign?: "top" | "middle" | "bottom"; style?: string; selectedSourceCellId?: string }),
      updateTableAppearance: (message) => void applyAppearanceUpdate(editor, panel, tableStartOffset, message as { title?: string; id?: string; role?: string; width?: string; autowidth?: boolean; frame?: string; grid?: string; stripes?: string; selectedSourceCellId?: string })
    });
    panel.webview.html = html;
    return {
      ok: true,
      mode: model.mode,
      model,
      html,
      diagnostics: model.diagnostics
    };
  });
}
