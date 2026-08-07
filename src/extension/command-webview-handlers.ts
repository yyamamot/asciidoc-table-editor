import * as vscode from "vscode";
import type { WebviewAppModel } from "../app";
import { type TableDiagnostic, type TableFormatMode } from "../core";
import { createFormatPreviewModel } from "./format-command";
import { applyBlockCellContentToEditor, applyColumnSpecToEditor, applyHorizontalMergeToEditor, applyHorizontalUnmergeToEditor, applyImportedTablePasteToEditor, applyPlainCellBlockContentToEditor, applyPlainCellContentToEditor, applyPlainCellContentsToEditor, applyPlainCellStyleToEditor, applyRectangularPasteToEditor, applyRowColumnEditToEditor, applyTableAppearanceToEditor, applyTableBlockSourceReplacement, applyTableHeaderFooterToEditor, sessionTargetFailureResult } from "./table-editor-document-edits";
import { revealSourceCellInEditor } from "./table-editor-source-reveal";
import type { CellContentReplacement, CellContentUpdateResult, RowColumnEditMessage, UndoRedoResult } from "./types";
import { createTableEditorLabels } from "./table-editor-labels";
import { renderTableEditorHtml } from "../app";
import { createNonce, refreshPanelFromEditor } from "./command-utils";
import type { TableEditorSessionTarget } from "./table-editor-session-target";
import type { InvalidTableEditorMutationMessage, TableEditorMutationResultType } from "./table-editor-messages";

export type MutationRequestMetadata = {
  readonly operationId?: string;
  readonly revisionToken?: string;
};

type MutationContext = { readonly operationId: string };

export async function reportInvalidTableEditorMessage(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: InvalidTableEditorMutationMessage,
  resultType: TableEditorMutationResultType
): Promise<void> {
  const resolution = target.resolve(editor.document, message.revisionToken ?? target.revisionToken);
  await postMutationMessage(editor, panel, target, { operationId: message.operationId }, {
    type: resultType,
    result: resolution.status === "ready"
      ? {
          ok: false,
          diagnostics: [{
            code: "webview.message.invalid",
            severity: "error",
            message: vscode.l10n.t("The Table Editor rejected an invalid or oversized message.")
          }]
        }
      : sessionTargetFailureResult(resolution)
  });
}

export async function reportMutationHandlerFailure(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: unknown,
  _error: unknown
): Promise<void> {
  const operationId = typeof message === "object" && message !== null &&
    typeof (message as { operationId?: unknown }).operationId === "string"
    ? (message as { operationId: string }).operationId
    : "invalid-operation";
  await postMutationMessage(editor, panel, target, { operationId }, {
    type: mutationResultType(message),
    result: {
      ok: false,
      diagnostics: [{
        code: "writeback.apply-raced",
        severity: "error",
        message: "The table operation failed and its source state could not be verified"
      }]
    }
  });
}

export async function applyCellContentUpdate(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: { sourceCellId: string; contentRaw: string; selectedSourceCellId?: string } & MutationRequestMetadata
): Promise<void> {
  const mutation = await beginMutation(editor, panel, target, message, "cell-content-update-result");
  if (mutation === undefined) return;
  const result = await applyPlainCellContentToEditor(editor, target, message.sourceCellId, message.contentRaw);
  if (result.ok) {
    await refreshPanelFromEditor(editor, panel, target, message.selectedSourceCellId ?? message.sourceCellId);
    return;
  }
  await postMutationMessage(editor, panel, target, mutation, {
    type: "cell-content-update-result",
    result
  });
}

export async function applyCellContentsUpdate(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: { replacements: CellContentReplacement[]; selectedSourceCellId?: string; diagnostics?: readonly TableDiagnostic[] } & MutationRequestMetadata
): Promise<void> {
  const mutation = await beginMutation(editor, panel, target, message, "cell-content-update-result");
  if (mutation === undefined) return;
  const diagnostics = canonicalPasteDiagnostics(message.diagnostics);
  const result = await applyPlainCellContentsToEditor(editor, target, message.replacements);
  const resultWithDiagnostics = mergeResultDiagnostics(result, diagnostics);
  if (result.ok) {
    await refreshPanelFromEditor(editor, panel, target, message.selectedSourceCellId ?? message.replacements.at(-1)?.sourceCellId, diagnostics);
    return;
  }
  await postMutationMessage(editor, panel, target, mutation, {
    type: "cell-content-update-result",
    result: resultWithDiagnostics
  });
}

export async function applyRectangularPaste(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: { startSourceCellId: string; rows: readonly (readonly string[])[]; selectedSourceCellId?: string; diagnostics?: readonly TableDiagnostic[] } & MutationRequestMetadata
): Promise<void> {
  const mutation = await beginMutation(editor, panel, target, message, "cell-content-update-result");
  if (mutation === undefined) return;
  const diagnostics = canonicalPasteDiagnostics(message.diagnostics);
  const result = await applyRectangularPasteToEditor(editor, target, {
    startSourceCellId: message.startSourceCellId,
    rows: message.rows
  });
  const resultWithDiagnostics = mergeResultDiagnostics(result, diagnostics);
  if (result.ok) {
    await refreshPanelFromEditor(editor, panel, target, message.selectedSourceCellId ?? message.startSourceCellId, diagnostics);
    return;
  }
  await postMutationMessage(editor, panel, target, mutation, { type: "cell-content-update-result", result: resultWithDiagnostics });
}

export async function applyImportedPaste(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: Parameters<typeof applyImportedTablePasteToEditor>[2] & { selectedSourceCellId?: string } & MutationRequestMetadata
): Promise<void> {
  const mutation = await beginMutation(editor, panel, target, message, "cell-content-update-result");
  if (mutation === undefined) return;
  const diagnostics = canonicalPasteDiagnostics(message.diagnostics);
  const result = await applyImportedTablePasteToEditor(editor, target, {
    startSourceCellId: message.startSourceCellId,
    rowCount: message.rowCount,
    columnCount: message.columnCount,
    cells: message.cells
  });
  const resultWithDiagnostics = mergeResultDiagnostics(result, diagnostics);
  if (result.ok) {
    await refreshPanelFromEditor(editor, panel, target, message.selectedSourceCellId ?? message.startSourceCellId, diagnostics);
    return;
  }
  await postMutationMessage(editor, panel, target, mutation, { type: "cell-content-update-result", result: resultWithDiagnostics });
}

export async function applyBlockCellSourceUpdate(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: { sourceCellId: string; contentRaw: string; selectedSourceCellId?: string } & MutationRequestMetadata
): Promise<void> {
  const mutation = await beginMutation(editor, panel, target, message, "block-cell-update-result");
  if (mutation === undefined) return;
  const result = await applyBlockCellContentToEditor(editor, target, {
    sourceCellId: message.sourceCellId,
    contentRaw: message.contentRaw
  });
  if (result.ok) {
    await refreshPanelFromEditor(editor, panel, target, message.selectedSourceCellId ?? message.sourceCellId);
    return;
  }
  await postMutationMessage(editor, panel, target, mutation, {
    type: "block-cell-update-result",
    result
  });
}

export async function applyPlainCellBlockSourceReplace(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: { sourceCellId: string; contentRaw: string; selectedSourceCellId?: string; diagnostics?: readonly TableDiagnostic[] } & MutationRequestMetadata
): Promise<void> {
  const mutation = await beginMutation(editor, panel, target, message, "block-cell-update-result");
  if (mutation === undefined) return;
  const diagnostics = canonicalPasteDiagnostics(message.diagnostics);
  const result = await applyPlainCellBlockContentToEditor(editor, target, {
    sourceCellId: message.sourceCellId,
    contentRaw: message.contentRaw
  });
  const resultWithDiagnostics = mergeResultDiagnostics(result, diagnostics);
  if (result.ok) {
    await refreshPanelFromEditor(editor, panel, target, message.selectedSourceCellId ?? message.sourceCellId, diagnostics);
    return;
  }
  await postMutationMessage(editor, panel, target, mutation, { type: "block-cell-update-result", result: resultWithDiagnostics });
}

export async function applyMergeCells(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: { sourceCellIds: string[]; selectedSourceCellId?: string } & MutationRequestMetadata
): Promise<void> {
  const mutation = await beginMutation(editor, panel, target, message, "merge-cells-result");
  if (mutation === undefined) return;
  const result = await applyHorizontalMergeToEditor(editor, target, message.sourceCellIds);
  if (result.ok) {
    await refreshPanelFromEditor(editor, panel, target, message.selectedSourceCellId ?? message.sourceCellIds[0]);
    return;
  }
  await postMutationMessage(editor, panel, target, mutation, { type: "merge-cells-result", result });
}

export async function applyUnmergeCell(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: { sourceCellId: string; selectedSourceCellId?: string } & MutationRequestMetadata
): Promise<void> {
  const mutation = await beginMutation(editor, panel, target, message, "unmerge-cell-result");
  if (mutation === undefined) return;
  const result = await applyHorizontalUnmergeToEditor(editor, target, message.sourceCellId);
  if (result.ok) {
    await refreshPanelFromEditor(editor, panel, target, message.selectedSourceCellId ?? message.sourceCellId);
    return;
  }
  await postMutationMessage(editor, panel, target, mutation, { type: "unmerge-cell-result", result });
}

export async function applyRowColumnEdit(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: RowColumnEditMessage & MutationRequestMetadata
): Promise<void> {
  const mutation = await beginMutation(editor, panel, target, message, "row-column-edit-result");
  if (mutation === undefined) return;
  const result = await applyRowColumnEditToEditor(editor, target, message);
  if (result.ok) {
    await refreshPanelFromEditor(editor, panel, target, message.selectedSourceCellId ?? message.sourceCellId);
    return;
  }
  await postMutationMessage(editor, panel, target, mutation, { type: "row-column-edit-result", result });
}

export async function applyCellStyleUpdate(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: { sourceCellIds: readonly string[]; style?: string; horizontalAlign?: "left" | "center" | "right"; verticalAlign?: "top" | "middle" | "bottom"; selectedSourceCellId?: string } & MutationRequestMetadata
): Promise<void> {
  const mutation = await beginMutation(editor, panel, target, message, "cell-style-update-result");
  if (mutation === undefined) return;
  const result = await applyPlainCellStyleToEditor(editor, target, message);
  if (result.ok) {
    await refreshPanelFromEditor(editor, panel, target, message.selectedSourceCellId ?? message.sourceCellIds[0]);
    return;
  }
  await postMutationMessage(editor, panel, target, mutation, { type: "cell-style-update-result", result });
}

export async function applyHeaderFooterUpdate(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: { header?: boolean; footer?: boolean; noheader?: boolean; selectedSourceCellId?: string } & MutationRequestMetadata
): Promise<void> {
  const mutation = await beginMutation(editor, panel, target, message, "table-settings-update-result");
  if (mutation === undefined) return;
  const result = await applyTableHeaderFooterToEditor(editor, target, message);
  if (result.ok) {
    await refreshPanelFromEditor(editor, panel, target, message.selectedSourceCellId);
    return;
  }
  await postMutationMessage(editor, panel, target, mutation, { type: "table-settings-update-result", result });
}

export async function applyColumnSpecUpdate(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: { columnIndex: number; widthRaw?: string; horizontalAlign?: "left" | "center" | "right"; verticalAlign?: "top" | "middle" | "bottom"; style?: string; selectedSourceCellId?: string } & MutationRequestMetadata
): Promise<void> {
  const mutation = await beginMutation(editor, panel, target, message, "table-settings-update-result");
  if (mutation === undefined) return;
  const result = await applyColumnSpecToEditor(editor, target, message);
  if (result.ok) {
    await refreshPanelFromEditor(editor, panel, target, message.selectedSourceCellId);
    return;
  }
  await postMutationMessage(editor, panel, target, mutation, { type: "table-settings-update-result", result });
}

export async function applyAppearanceUpdate(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: { title?: string; id?: string; role?: string; width?: string; autowidth?: boolean; frame?: string; grid?: string; stripes?: string; selectedSourceCellId?: string } & MutationRequestMetadata
): Promise<void> {
  const mutation = await beginMutation(editor, panel, target, message, "table-settings-update-result");
  if (mutation === undefined) return;
  const result = await applyTableAppearanceToEditor(editor, target, message);
  if (result.ok) {
    await refreshPanelFromEditor(editor, panel, target, message.selectedSourceCellId);
    return;
  }
  await postMutationMessage(editor, panel, target, mutation, { type: "table-settings-update-result", result });
}

export async function applyRevealSourceCell(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: { sourceCellId: string; selectedSourceCellId?: string }
): Promise<void> {
  const resolution = target.resolve(editor.document);
  const result = resolution.status === "ready"
    ? await revealSourceCellInEditor(editor, resolution.tableBlock.range.start.offset, message.sourceCellId)
    : sessionTargetFailureResult(resolution);
  await panel.webview.postMessage({ type: "source-cell-reveal-result", result });
}

export async function applyUndoRedo(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: { type: "request-undo" | "request-redo"; selectedSourceCellId?: string } & MutationRequestMetadata
): Promise<void> {
  const mutation = await beginMutation(editor, panel, target, message, "undo-redo-result");
  if (mutation === undefined) return;
  const direction = message.type === "request-undo" ? "undo" : "redo";
  const preparation = target.prepareUndoRedo(editor.document, direction);
  if (preparation.status !== "ready") {
    await postMutationMessage(editor, panel, target, mutation, { type: "undo-redo-result", result: sessionTargetFailureResult(preparation) });
    return;
  }
  let result = await runEditorUndoRedo(editor, direction);
  if (result.ok) {
    const reacquired = target.reacquireAfterUndoRedo(editor.document, preparation);
    if (reacquired.status !== "ready") {
      result = sessionTargetFailureResult(reacquired);
    }
  }
  if (result.ok) {
    await refreshPanelFromEditor(editor, panel, target, message.selectedSourceCellId);
    return;
  }
  await postMutationMessage(editor, panel, target, mutation, { type: "undo-redo-result", result });
}

export async function openFormatReviewInPanel(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: { selectedSourceCellId?: string } & MutationRequestMetadata
): Promise<WebviewAppModel["formatReview"] | undefined> {
  const mutation = await beginMutation(editor, panel, target, message, "format-table-result");
  if (mutation === undefined) return undefined;
  const resolution = target.resolve(editor.document);
  const tableBlock = resolution.status === "ready" ? resolution.tableBlock : undefined;
  if (tableBlock === undefined) {
    const result = {
      ok: false,
      diagnostics: [{
        code: "format.table-not-found",
        severity: "error" as const,
        message: "Target AsciiDoc table block was not found"
      }]
    };
    await postMutationMessage(editor, panel, target, mutation, { type: "format-table-result", result });
    return undefined;
  }
  const preview = await createFormatPreviewModel(tableBlock.raw, createTableEditorLabels());
  if (!preview.ok) {
    const hasError = preview.model.diagnostics.some((diagnostic) => diagnostic.severity === "error");
    await postMutationMessage(editor, panel, target, mutation, {
      type: "format-table-result",
      result: { ok: !hasError, diagnostics: preview.model.diagnostics }
    });
    return undefined;
  }
  panel.webview.html = renderTableEditorHtml(preview.model, createNonce(), { selectedSourceCellId: message.selectedSourceCellId, revisionToken: target.revisionToken } as Parameters<typeof renderTableEditorHtml>[2], createTableEditorLabels());
  panel.reveal(vscode.ViewColumn.Beside, true);
  return preview.formatReview;
}

export async function applyFormatReview(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  formatReview: WebviewAppModel["formatReview"] | undefined,
  mode?: TableFormatMode,
  selectedSourceCellId?: string,
  metadata: MutationRequestMetadata = {}
): Promise<void> {
  const mutation = await beginMutation(editor, panel, target, metadata, "format-table-result");
  if (mutation === undefined) return;
  if (formatReview === undefined) {
    await postMutationMessage(editor, panel, target, mutation, {
      type: "format-table-result",
      result: {
        ok: false,
        diagnostics: [{
          code: "format.preview-missing",
          severity: "error",
          message: "Format preview was not found"
        }]
      }
    });
    return;
  }
  const resolution = target.resolve(editor.document);
  const tableBlock = resolution.status === "ready" ? resolution.tableBlock : undefined;
  if (tableBlock === undefined || tableBlock.raw !== formatReview.before) {
    const result = {
      ok: false,
      diagnostics: [{
        code: "format.preview-stale",
        severity: "error" as const,
        message: "Format preview is stale. Re-run format."
      }]
    };
    await postMutationMessage(editor, panel, target, mutation, { type: "format-table-result", result });
    return;
  }
  const selectedMode = mode ?? formatReview.selectedMode;
  const variant = formatReview.variants.find((candidate) => candidate.mode === selectedMode);
  if (variant === undefined) {
    await postMutationMessage(editor, panel, target, mutation, {
      type: "format-table-result",
      result: {
        ok: false,
        diagnostics: [{
          code: "format.mode-missing",
          severity: "error",
          message: "Format mode was not found"
        }]
      }
    });
    return;
  }

  const editApplied = await applyTableBlockSourceReplacement(editor, target, tableBlock, variant.after);
  if (editApplied !== "applied") {
    const result = {
      ok: false,
      diagnostics: [{
          code: editApplied === "indeterminate" ? "writeback.apply-raced" : "format.edit-not-applied",
        severity: "error" as const,
          message: editApplied === "indeterminate"
            ? "The table format edit completed but its source state could not be verified"
            : "VS Code did not apply the table format edit"
      }]
    };
    await postMutationMessage(editor, panel, target, mutation, { type: "format-table-result", result });
    return;
  }
  await refreshPanelFromEditor(editor, panel, target, selectedSourceCellId);
}

function mergeResultDiagnostics<T extends CellContentUpdateResult>(result: T, diagnostics: readonly TableDiagnostic[] | undefined): T {
  if (diagnostics === undefined || diagnostics.length === 0) {
    return result;
  }
  return {
    ...result,
    diagnostics: [...diagnostics, ...result.diagnostics]
  };
}

function canonicalPasteDiagnostics(diagnostics: readonly TableDiagnostic[] | undefined): readonly TableDiagnostic[] | undefined {
  if (!diagnostics?.some((diagnostic) =>
    diagnostic.code === "paste.rich-content-dropped" && diagnostic.severity === "warning"
  )) {
    return undefined;
  }
  return [{
    code: "paste.rich-content-dropped",
    severity: "warning",
    message: vscode.l10n.t("Pasted unsupported rich clipboard content with limited formatting.")
  }];
}

async function beginMutation(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  metadata: MutationRequestMetadata,
  resultType: string
): Promise<MutationContext | undefined> {
  const operationId = typeof metadata.operationId === "string" && metadata.operationId.length > 0
    ? metadata.operationId
    : "invalid-operation";
  const resolution = typeof metadata.revisionToken === "string" && metadata.revisionToken.length > 0
    ? target.resolve(editor.document, metadata.revisionToken)
    : target.resolve(editor.document, "invalid-revision");
  if (resolution.status !== "ready") {
    await postMutationMessage(editor, panel, target, { operationId }, {
      type: resultType,
      result: sessionTargetFailureResult(resolution)
    });
    return undefined;
  }
  return { operationId };
}

async function postMutationMessage(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  mutation: MutationContext,
  message: Record<string, unknown>
): Promise<boolean> {
  return panel.webview.postMessage({
    ...message,
    operationId: mutation.operationId,
    ...target.currentRevision(editor.document)
  });
}

function mutationResultType(message: unknown): string {
  const type = typeof message === "object" && message !== null
    ? (message as { type?: unknown }).type
    : undefined;
  if (type === "update-block-cell-source" || type === "replace-cell-with-block-source") return "block-cell-update-result";
  if (type === "request-merge-cells") return "merge-cells-result";
  if (type === "request-unmerge-cell") return "unmerge-cell-result";
  if (typeof type === "string" && (type.startsWith("request-insert-") || type.startsWith("request-delete-"))) return "row-column-edit-result";
  if (type === "request-undo" || type === "request-redo") return "undo-redo-result";
  if (type === "request-format-table" || type === "apply-format-table") return "format-table-result";
  if (type === "request-update-cell-style") return "cell-style-update-result";
  if (type === "request-update-header-footer" || type === "request-update-column-spec" || type === "request-update-table-appearance") return "table-settings-update-result";
  return "cell-content-update-result";
}

async function runEditorUndoRedo(editor: vscode.TextEditor, command: "undo" | "redo"): Promise<UndoRedoResult> {
  await vscode.window.showTextDocument(editor.document, editor.viewColumn ?? vscode.ViewColumn.One, false);
  await vscode.commands.executeCommand("workbench.action.focusActiveEditorGroup");
  try {
    await vscode.commands.executeCommand(command);
  } catch (error) {
    return {
      ok: false,
      diagnostics: [{
        code: `writeback.${command}-failed`,
        severity: "error",
        message: error instanceof Error ? error.message : String(error)
      }]
    };
  }

  return {
    ok: true,
    diagnostics: []
  };
}
