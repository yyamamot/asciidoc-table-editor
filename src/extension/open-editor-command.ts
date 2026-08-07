import * as vscode from "vscode";
import { createWebviewAppModel, renderTableEditorHtml, type WebviewAppModel } from "../app";
import { findAsciiDocTableBlock, parseAsciiDocTable, projectGridModel, type TableDiagnostic, type TableFormatMode } from "../core";
import { createTableEditorPanel } from "./panel";
import { registerTableEditorMessageRouter } from "./message-router";
import { createTableEditorLabels } from "./table-editor-labels";
import { renderTableEditorPreview } from "./table-editor-preview";
import { applyAppearanceUpdate, applyBlockCellSourceUpdate, applyCellContentsUpdate, applyCellContentUpdate, applyCellStyleUpdate, applyColumnSpecUpdate, applyFormatReview, applyHeaderFooterUpdate, applyImportedPaste, applyMergeCells, applyPlainCellBlockSourceReplace, applyRectangularPaste, applyRevealSourceCell, applyRowColumnEdit, applyUndoRedo, applyUnmergeCell, openFormatReviewInPanel, reportInvalidTableEditorMessage, reportMutationHandlerFailure, type MutationRequestMetadata } from "./command-webview-handlers";
import { createNonce, resolveTargetEditor, writeUiReviewSnapshotIfRequested, type OpenTableEditorCommandResult } from "./command-utils";
import type { CellContentReplacement, OpenTableEditorTarget, RowColumnEditMessage } from "./types";
import { applyImportedTablePasteToEditor } from "./table-editor-document-edits";
import { createTableEditorSessionTarget } from "./table-editor-session-target";

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
    const sessionTarget = createTableEditorSessionTarget(editor.document, tableBlock);
    const html = renderTableEditorHtml(model, createNonce(), { revisionToken: sessionTarget.revisionToken, locale: vscode.env.language } as Parameters<typeof renderTableEditorHtml>[2], createTableEditorLabels());
    const panel = createTableEditorPanel();
    panel.onDidDispose(() => sessionTarget.dispose());
    let formatReview: WebviewAppModel["formatReview"] = model.formatReview;
    registerTableEditorMessageRouter(panel, {
      uiReviewSnapshot: writeUiReviewSnapshotIfRequested,
      invalidMessage: (message, resultType) => reportInvalidTableEditorMessage(editor, panel, sessionTarget, message, resultType),
      mutationError: (message, error) => reportMutationHandlerFailure(editor, panel, sessionTarget, message, error),
      updateCellContent: (message) => applyCellContentUpdate(editor, panel, sessionTarget, message as { sourceCellId: string; contentRaw: string; selectedSourceCellId?: string } & MutationRequestMetadata),
      updateCellContents: (message) => applyCellContentsUpdate(editor, panel, sessionTarget, message as { replacements: CellContentReplacement[]; selectedSourceCellId?: string; diagnostics?: readonly TableDiagnostic[] } & MutationRequestMetadata),
      pasteRectangularTable: (message) => applyRectangularPaste(editor, panel, sessionTarget, message as { startSourceCellId: string; rows: readonly (readonly string[])[]; selectedSourceCellId?: string; diagnostics?: readonly TableDiagnostic[] } & MutationRequestMetadata),
      pasteImportedTable: (message) => applyImportedPaste(editor, panel, sessionTarget, message as Parameters<typeof applyImportedTablePasteToEditor>[2] & { selectedSourceCellId?: string } & MutationRequestMetadata),
      updateBlockCellSource: (message) => applyBlockCellSourceUpdate(editor, panel, sessionTarget, message as { sourceCellId: string; contentRaw: string; selectedSourceCellId?: string } & MutationRequestMetadata),
      replaceCellWithBlockSource: (message) => applyPlainCellBlockSourceReplace(editor, panel, sessionTarget, message as { sourceCellId: string; contentRaw: string; selectedSourceCellId?: string; diagnostics?: readonly TableDiagnostic[] } & MutationRequestMetadata),
      mergeCells: (message) => applyMergeCells(editor, panel, sessionTarget, message as { sourceCellIds: string[]; selectedSourceCellId?: string } & MutationRequestMetadata),
      unmergeCell: (message) => applyUnmergeCell(editor, panel, sessionTarget, message as { sourceCellId: string; selectedSourceCellId?: string } & MutationRequestMetadata),
      rowColumnEdit: (message) => applyRowColumnEdit(editor, panel, sessionTarget, message as RowColumnEditMessage & MutationRequestMetadata),
      revealSourceCell: (message) => void applyRevealSourceCell(editor, panel, sessionTarget, message as { sourceCellId: string; selectedSourceCellId?: string }),
      undoRedo: (message) => applyUndoRedo(editor, panel, sessionTarget, message as { type: "request-undo" | "request-redo"; selectedSourceCellId?: string } & MutationRequestMetadata),
      requestFormatTable: (message) => openFormatReviewInPanel(editor, panel, sessionTarget, message as { selectedSourceCellId?: string } & MutationRequestMetadata).then((nextFormatReview) => {
        if (nextFormatReview !== undefined) {
          formatReview = nextFormatReview;
        }
      }),
      applyFormatTable: (message) => applyFormatReview(editor, panel, sessionTarget, formatReview, (message as { mode?: TableFormatMode }).mode, (message as { selectedSourceCellId?: string }).selectedSourceCellId, message as MutationRequestMetadata),
      updateCellStyle: (message) => applyCellStyleUpdate(editor, panel, sessionTarget, message as { sourceCellIds: readonly string[]; style?: string; horizontalAlign?: "left" | "center" | "right"; verticalAlign?: "top" | "middle" | "bottom"; selectedSourceCellId?: string } & MutationRequestMetadata),
      updateHeaderFooter: (message) => applyHeaderFooterUpdate(editor, panel, sessionTarget, message as { header?: boolean; footer?: boolean; noheader?: boolean; selectedSourceCellId?: string } & MutationRequestMetadata),
      updateColumnSpec: (message) => applyColumnSpecUpdate(editor, panel, sessionTarget, message as { columnIndex: number; widthRaw?: string; horizontalAlign?: "left" | "center" | "right"; verticalAlign?: "top" | "middle" | "bottom"; style?: string; selectedSourceCellId?: string } & MutationRequestMetadata),
      updateTableAppearance: (message) => applyAppearanceUpdate(editor, panel, sessionTarget, message as { title?: string; id?: string; role?: string; width?: string; autowidth?: boolean; frame?: string; grid?: string; stripes?: string; selectedSourceCellId?: string } & MutationRequestMetadata)
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
