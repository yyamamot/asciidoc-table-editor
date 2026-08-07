import type * as vscode from "vscode";
import {
  isApplyFormatTableMessage,
  hasTableEditorOperationEnvelope,
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
import { operationIdOf, TableEditorMutationQueue } from "./table-editor-mutation-queue";

export interface TableEditorMessageHandlers {
  readonly uiReviewSnapshot?: (snapshot: unknown) => void;
  readonly mutationError?: (message: unknown, error: unknown) => void | Promise<void>;
  readonly updateCellContent?: (message: unknown) => void | Promise<void>;
  readonly updateCellContents?: (message: unknown) => void | Promise<void>;
  readonly pasteRectangularTable?: (message: unknown) => void | Promise<void>;
  readonly pasteImportedTable?: (message: unknown) => void | Promise<void>;
  readonly updateBlockCellSource?: (message: unknown) => void | Promise<void>;
  readonly replaceCellWithBlockSource?: (message: unknown) => void | Promise<void>;
  readonly mergeCells?: (message: unknown) => void | Promise<void>;
  readonly unmergeCell?: (message: unknown) => void | Promise<void>;
  readonly rowColumnEdit?: (message: unknown) => void | Promise<void>;
  readonly revealSourceCell?: (message: unknown) => void;
  readonly undoRedo?: (message: unknown) => void | Promise<void>;
  readonly requestFormatTable?: (message: unknown) => void | Promise<void>;
  readonly applyFormatTable?: (message: unknown) => void | Promise<void>;
  readonly updateCellStyle?: (message: unknown) => void | Promise<void>;
  readonly updateHeaderFooter?: (message: unknown) => void | Promise<void>;
  readonly updateColumnSpec?: (message: unknown) => void | Promise<void>;
  readonly updateTableAppearance?: (message: unknown) => void | Promise<void>;
}

export function registerTableEditorMessageRouter(
  panel: vscode.WebviewPanel,
  handlers: TableEditorMessageHandlers
): vscode.Disposable {
  const queue = new TableEditorMutationQueue();
  const enqueue = (message: unknown, handler: ((message: unknown) => void | Promise<void>) | undefined): void => {
    if (handler === undefined || !hasTableEditorOperationEnvelope(message)) return;
    const operationId = operationIdOf(message);
    if (operationId === undefined) return;
    void queue.enqueue(operationId, async () => {
      try {
        await handler(message);
      } catch (error: unknown) {
        await handlers.mutationError?.(message, error);
      }
    }).catch(() => undefined);
  };
  const messageSubscription = panel.webview.onDidReceiveMessage((message: unknown) => {
    if (isUiReviewSnapshotMessage(message)) {
      handlers.uiReviewSnapshot?.(message.snapshot);
      return;
    }
    if (isUpdateCellContentMessage(message)) {
      enqueue(message, handlers.updateCellContent);
      return;
    }
    if (isUpdateCellContentsMessage(message)) {
      enqueue(message, handlers.updateCellContents);
      return;
    }
    if (isPasteRectangularTableMessage(message)) {
      enqueue(message, handlers.pasteRectangularTable);
      return;
    }
    if (isPasteImportedTableMessage(message)) {
      enqueue(message, handlers.pasteImportedTable);
      return;
    }
    if (isUpdateBlockCellSourceMessage(message)) {
      enqueue(message, handlers.updateBlockCellSource);
      return;
    }
    if (isReplaceCellWithBlockSourceMessage(message)) {
      enqueue(message, handlers.replaceCellWithBlockSource);
      return;
    }
    if (isMergeCellsMessage(message)) {
      enqueue(message, handlers.mergeCells);
      return;
    }
    if (isUnmergeCellMessage(message)) {
      enqueue(message, handlers.unmergeCell);
      return;
    }
    if (isRowColumnEditMessage(message)) {
      enqueue(message, handlers.rowColumnEdit);
      return;
    }
    if (isRevealSourceCellMessage(message)) {
      handlers.revealSourceCell?.(message);
      return;
    }
    if (isUndoRedoMessage(message)) {
      enqueue(message, handlers.undoRedo);
      return;
    }
    if (isRequestFormatTableMessage(message)) {
      enqueue(message, handlers.requestFormatTable);
      return;
    }
    if (isApplyFormatTableMessage(message)) {
      enqueue(message, handlers.applyFormatTable);
      return;
    }
    if (isUpdateCellStyleMessage(message)) {
      enqueue(message, handlers.updateCellStyle);
      return;
    }
    if (isUpdateHeaderFooterMessage(message)) {
      enqueue(message, handlers.updateHeaderFooter);
      return;
    }
    if (isUpdateColumnSpecMessage(message)) {
      enqueue(message, handlers.updateColumnSpec);
      return;
    }
    if (isUpdateTableAppearanceMessage(message)) {
      enqueue(message, handlers.updateTableAppearance);
    }
  });
  const panelSubscription = panel.onDidDispose(() => queue.dispose());
  return {
    dispose: () => {
      queue.dispose();
      messageSubscription.dispose();
      panelSubscription.dispose();
    }
  };
}
