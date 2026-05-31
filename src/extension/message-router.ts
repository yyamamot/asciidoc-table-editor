import type * as vscode from "vscode";
import {
  isApplyFormatTableMessage,
  isMergeCellsMessage,
  isPasteImportedTableMessage,
  isPasteRectangularTableMessage,
  isReplaceCellWithBlockSourceMessage,
  isRequestFormatTableMessage,
  isRevealSourceCellMessage,
  isRowColumnEditMessage,
  isUiReviewSnapshotMessage,
  isUndoRedoMessage,
  isUnmergeCellMessage,
  isUpdateBlockCellSourceMessage,
  isUpdateCellStyleMessage,
  isUpdateCellContentMessage,
  isUpdateCellContentsMessage,
  isUpdateColumnSpecMessage,
  isUpdateHeaderFooterMessage,
  isUpdateTableAppearanceMessage
} from "./table-editor-messages";

export interface TableEditorMessageHandlers {
  readonly uiReviewSnapshot?: (snapshot: unknown) => void;
  readonly updateCellContent?: (message: unknown) => void;
  readonly updateCellContents?: (message: unknown) => void;
  readonly pasteRectangularTable?: (message: unknown) => void;
  readonly pasteImportedTable?: (message: unknown) => void;
  readonly updateBlockCellSource?: (message: unknown) => void;
  readonly replaceCellWithBlockSource?: (message: unknown) => void;
  readonly mergeCells?: (message: unknown) => void;
  readonly unmergeCell?: (message: unknown) => void;
  readonly rowColumnEdit?: (message: unknown) => void;
  readonly revealSourceCell?: (message: unknown) => void;
  readonly undoRedo?: (message: unknown) => void;
  readonly requestFormatTable?: (message: unknown) => void;
  readonly applyFormatTable?: (message: unknown) => void;
  readonly updateCellStyle?: (message: unknown) => void;
  readonly updateHeaderFooter?: (message: unknown) => void;
  readonly updateColumnSpec?: (message: unknown) => void;
  readonly updateTableAppearance?: (message: unknown) => void;
}

export function registerTableEditorMessageRouter(
  panel: vscode.WebviewPanel,
  handlers: TableEditorMessageHandlers
): vscode.Disposable {
  return panel.webview.onDidReceiveMessage((message: unknown) => {
    if (isUiReviewSnapshotMessage(message)) {
      handlers.uiReviewSnapshot?.(message.snapshot);
      return;
    }
    if (isUpdateCellContentMessage(message)) {
      handlers.updateCellContent?.(message);
      return;
    }
    if (isUpdateCellContentsMessage(message)) {
      handlers.updateCellContents?.(message);
      return;
    }
    if (isPasteRectangularTableMessage(message)) {
      handlers.pasteRectangularTable?.(message);
      return;
    }
    if (isPasteImportedTableMessage(message)) {
      handlers.pasteImportedTable?.(message);
      return;
    }
    if (isUpdateBlockCellSourceMessage(message)) {
      handlers.updateBlockCellSource?.(message);
      return;
    }
    if (isReplaceCellWithBlockSourceMessage(message)) {
      handlers.replaceCellWithBlockSource?.(message);
      return;
    }
    if (isMergeCellsMessage(message)) {
      handlers.mergeCells?.(message);
      return;
    }
    if (isUnmergeCellMessage(message)) {
      handlers.unmergeCell?.(message);
      return;
    }
    if (isRowColumnEditMessage(message)) {
      handlers.rowColumnEdit?.(message);
      return;
    }
    if (isRevealSourceCellMessage(message)) {
      handlers.revealSourceCell?.(message);
      return;
    }
    if (isUndoRedoMessage(message)) {
      handlers.undoRedo?.(message);
      return;
    }
    if (isRequestFormatTableMessage(message)) {
      handlers.requestFormatTable?.(message);
      return;
    }
    if (isApplyFormatTableMessage(message)) {
      handlers.applyFormatTable?.(message);
      return;
    }
    if (isUpdateCellStyleMessage(message)) {
      handlers.updateCellStyle?.(message);
      return;
    }
    if (isUpdateHeaderFooterMessage(message)) {
      handlers.updateHeaderFooter?.(message);
      return;
    }
    if (isUpdateColumnSpecMessage(message)) {
      handlers.updateColumnSpec?.(message);
      return;
    }
    if (isUpdateTableAppearanceMessage(message)) {
      handlers.updateTableAppearance?.(message);
    }
  });
}
