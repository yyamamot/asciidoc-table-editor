import * as vscode from "vscode";
import type { WebviewAppModel } from "../app";
import { type TableDiagnostic, type TableFormatMode } from "../core";
import { createFormatPreviewModel } from "./format-command";
import { applyBlockCellContentToEditor, applyColumnSpecToEditor, applyHorizontalMergeToEditor, applyHorizontalUnmergeToEditor, applyImportedTablePasteToEditor, applyPlainCellBlockContentToEditor, applyPlainCellContentToEditor, applyPlainCellContentsToEditor, applyPlainCellStyleToEditor, applyRectangularPasteToEditor, applyRowColumnEditToEditor, applyTableAppearanceToEditor, applyTableBlockSourceReplacement, applyTableHeaderFooterToEditor, sessionTargetFailureResult } from "./table-editor-document-edits";
import { revealSourceCellInEditor } from "./table-editor-source-reveal";
import type { CellContentReplacement, CellContentUpdateResult, RowColumnEditMessage, UndoRedoResult } from "./types";
import { createTableEditorLabels } from "./table-editor-labels";
import { renderTableEditorHtml } from "../app";
import { createNonce, refreshPanelFromEditor, renderCurrentTablePreview, requiresFullRefreshForPlainCellContentsUpdate, requiresFullRefreshForPlainCellUpdate } from "./command-utils";
import type { TableEditorSessionTarget } from "./table-editor-session-target";

export async function applyCellContentUpdate(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: { sourceCellId: string; contentRaw: string; selectedSourceCellId?: string }
): Promise<void> {
  const requiresRefresh = requiresFullRefreshForPlainCellUpdate(editor, target, message.sourceCellId);
  const result = await applyPlainCellContentToEditor(editor, target, message.sourceCellId, message.contentRaw);
  const preview = result.ok && !requiresRefresh
    ? await renderCurrentTablePreview(editor, target)
    : undefined;
  await panel.webview.postMessage({
    type: "cell-content-update-result",
    result,
    applied: result.ok && !requiresRefresh
      ? {
          sourceCellId: message.sourceCellId,
          contentRaw: message.contentRaw,
          selectedSourceCellId: message.selectedSourceCellId ?? message.sourceCellId,
          tablePreviewHtml: preview?.preview.tableHtml
        }
      : undefined
  });
  if (result.ok && requiresRefresh) {
    await refreshPanelFromEditor(editor, panel, target, message.selectedSourceCellId ?? message.sourceCellId);
  }
}

export async function applyCellContentsUpdate(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: { replacements: CellContentReplacement[]; selectedSourceCellId?: string; diagnostics?: readonly TableDiagnostic[] }
): Promise<void> {
  const requiresRefresh = requiresFullRefreshForPlainCellContentsUpdate(editor, target, message.replacements);
  const result = await applyPlainCellContentsToEditor(editor, target, message.replacements);
  const resultWithDiagnostics = mergeResultDiagnostics(result, message.diagnostics);
  const preview = result.ok && !requiresRefresh
    ? await renderCurrentTablePreview(editor, target)
    : undefined;
  await panel.webview.postMessage({
    type: "cell-content-update-result",
    result: resultWithDiagnostics,
    applied: result.ok && !requiresRefresh
      ? {
          replacements: message.replacements,
          selectedSourceCellId: message.selectedSourceCellId ?? message.replacements.at(-1)?.sourceCellId,
          tablePreviewHtml: preview?.preview.tableHtml
        }
      : undefined
  });
  if (result.ok && requiresRefresh) {
    await refreshPanelFromEditor(editor, panel, target, message.selectedSourceCellId ?? message.replacements.at(-1)?.sourceCellId, message.diagnostics);
  }
}

export async function applyRectangularPaste(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: { startSourceCellId: string; rows: readonly (readonly string[])[]; selectedSourceCellId?: string; diagnostics?: readonly TableDiagnostic[] }
): Promise<void> {
  const result = await applyRectangularPasteToEditor(editor, target, {
    startSourceCellId: message.startSourceCellId,
    rows: message.rows
  });
  const resultWithDiagnostics = mergeResultDiagnostics(result, message.diagnostics);
  await panel.webview.postMessage({ type: "cell-content-update-result", result: resultWithDiagnostics });
  if (result.ok) {
    await refreshPanelFromEditor(editor, panel, target, message.selectedSourceCellId ?? message.startSourceCellId, message.diagnostics);
  }
}

export async function applyImportedPaste(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: Parameters<typeof applyImportedTablePasteToEditor>[2] & { selectedSourceCellId?: string }
): Promise<void> {
  const result = await applyImportedTablePasteToEditor(editor, target, message);
  const resultWithDiagnostics = mergeResultDiagnostics(result, message.diagnostics);
  await panel.webview.postMessage({ type: "cell-content-update-result", result: resultWithDiagnostics });
  if (result.ok) {
    await refreshPanelFromEditor(editor, panel, target, message.selectedSourceCellId ?? message.startSourceCellId, message.diagnostics);
  }
}

export async function applyBlockCellSourceUpdate(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: { sourceCellId: string; contentRaw: string; selectedSourceCellId?: string }
): Promise<void> {
  const result = await applyBlockCellContentToEditor(editor, target, {
    sourceCellId: message.sourceCellId,
    contentRaw: message.contentRaw
  });
  const preview = result.ok
    ? await renderCurrentTablePreview(editor, target)
    : undefined;
  await panel.webview.postMessage({
    type: "block-cell-update-result",
    result,
    applied: result.ok
      ? {
          sourceCellId: message.sourceCellId,
          contentRaw: message.contentRaw,
          selectedSourceCellId: message.selectedSourceCellId ?? message.sourceCellId,
          tablePreviewHtml: preview?.preview.tableHtml,
          blockCellPreviewHtml: preview?.preview.blockCellHtmlBySourceCellId[message.sourceCellId]
        }
      : undefined
  });
}

export async function applyPlainCellBlockSourceReplace(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: { sourceCellId: string; contentRaw: string; selectedSourceCellId?: string; diagnostics?: readonly TableDiagnostic[] }
): Promise<void> {
  const result = await applyPlainCellBlockContentToEditor(editor, target, {
    sourceCellId: message.sourceCellId,
    contentRaw: message.contentRaw
  });
  const resultWithDiagnostics = mergeResultDiagnostics(result, message.diagnostics);
  await panel.webview.postMessage({ type: "block-cell-update-result", result: resultWithDiagnostics });
  if (result.ok) {
    await refreshPanelFromEditor(editor, panel, target, message.selectedSourceCellId ?? message.sourceCellId, message.diagnostics);
  }
}

export async function applyMergeCells(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: { sourceCellIds: string[]; selectedSourceCellId?: string }
): Promise<void> {
  const result = await applyHorizontalMergeToEditor(editor, target, message.sourceCellIds);
  await panel.webview.postMessage({ type: "merge-cells-result", result });
  if (result.ok) {
    await refreshPanelFromEditor(editor, panel, target, message.selectedSourceCellId ?? message.sourceCellIds[0]);
  }
}

export async function applyUnmergeCell(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: { sourceCellId: string; selectedSourceCellId?: string }
): Promise<void> {
  const result = await applyHorizontalUnmergeToEditor(editor, target, message.sourceCellId);
  await panel.webview.postMessage({ type: "unmerge-cell-result", result });
  if (result.ok) {
    await refreshPanelFromEditor(editor, panel, target, message.selectedSourceCellId ?? message.sourceCellId);
  }
}

export async function applyRowColumnEdit(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: RowColumnEditMessage
): Promise<void> {
  const result = await applyRowColumnEditToEditor(editor, target, message);
  await panel.webview.postMessage({ type: "row-column-edit-result", result });
  if (result.ok) {
    await refreshPanelFromEditor(editor, panel, target, message.selectedSourceCellId ?? message.sourceCellId);
  }
}

export async function applyCellStyleUpdate(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: { sourceCellIds: readonly string[]; style?: string; horizontalAlign?: "left" | "center" | "right"; verticalAlign?: "top" | "middle" | "bottom"; selectedSourceCellId?: string }
): Promise<void> {
  const result = await applyPlainCellStyleToEditor(editor, target, message);
  await panel.webview.postMessage({ type: "cell-style-update-result", result });
  if (result.ok) {
    await refreshPanelFromEditor(editor, panel, target, message.selectedSourceCellId ?? message.sourceCellIds[0]);
  }
}

export async function applyHeaderFooterUpdate(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: { header?: boolean; footer?: boolean; noheader?: boolean; selectedSourceCellId?: string }
): Promise<void> {
  const result = await applyTableHeaderFooterToEditor(editor, target, message);
  await panel.webview.postMessage({ type: "table-settings-update-result", result });
  if (result.ok) {
    await refreshPanelFromEditor(editor, panel, target, message.selectedSourceCellId);
  }
}

export async function applyColumnSpecUpdate(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: { columnIndex: number; widthRaw?: string; horizontalAlign?: "left" | "center" | "right"; verticalAlign?: "top" | "middle" | "bottom"; style?: string; selectedSourceCellId?: string }
): Promise<void> {
  const result = await applyColumnSpecToEditor(editor, target, message);
  await panel.webview.postMessage({ type: "table-settings-update-result", result });
  if (result.ok) {
    await refreshPanelFromEditor(editor, panel, target, message.selectedSourceCellId);
  }
}

export async function applyAppearanceUpdate(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  message: { title?: string; id?: string; role?: string; width?: string; autowidth?: boolean; frame?: string; grid?: string; stripes?: string; selectedSourceCellId?: string }
): Promise<void> {
  const result = await applyTableAppearanceToEditor(editor, target, message);
  await panel.webview.postMessage({ type: "table-settings-update-result", result });
  if (result.ok) {
    await refreshPanelFromEditor(editor, panel, target, message.selectedSourceCellId);
  }
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
  message: { type: "request-undo" | "request-redo"; selectedSourceCellId?: string }
): Promise<void> {
  const direction = message.type === "request-undo" ? "undo" : "redo";
  const preparation = target.prepareUndoRedo(editor.document, direction);
  if (preparation.status !== "ready") {
    await panel.webview.postMessage({ type: "undo-redo-result", result: sessionTargetFailureResult(preparation) });
    return;
  }
  let result = await runEditorUndoRedo(editor, direction);
  if (result.ok) {
    const reacquired = target.reacquireAfterUndoRedo(editor.document, preparation);
    if (reacquired.status !== "ready") {
      result = sessionTargetFailureResult(reacquired);
    }
  }
  await panel.webview.postMessage({ type: "undo-redo-result", result });
  if (result.ok) {
    await refreshPanelFromEditor(editor, panel, target, message.selectedSourceCellId);
  }
}

export async function openFormatReviewInPanel(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  selectedSourceCellId?: string
): Promise<WebviewAppModel["formatReview"] | undefined> {
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
    await panel.webview.postMessage({ type: "format-table-result", result });
    return undefined;
  }
  const preview = await createFormatPreviewModel(tableBlock.raw, createTableEditorLabels());
  if (!preview.ok) {
    const hasError = preview.model.diagnostics.some((diagnostic) => diagnostic.severity === "error");
    await panel.webview.postMessage({
      type: "format-table-result",
      result: { ok: !hasError, diagnostics: preview.model.diagnostics }
    });
    return undefined;
  }
  panel.webview.html = renderTableEditorHtml(preview.model, createNonce(), { selectedSourceCellId }, createTableEditorLabels());
  panel.reveal(vscode.ViewColumn.Beside, true);
  return preview.formatReview;
}

export async function applyFormatReview(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  formatReview: WebviewAppModel["formatReview"] | undefined,
  mode?: TableFormatMode,
  selectedSourceCellId?: string
): Promise<void> {
  if (formatReview === undefined) {
    await panel.webview.postMessage({
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
    await panel.webview.postMessage({ type: "format-table-result", result });
    return;
  }
  const selectedMode = mode ?? formatReview.selectedMode;
  const variant = formatReview.variants.find((candidate) => candidate.mode === selectedMode);
  if (variant === undefined) {
    await panel.webview.postMessage({
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
    await panel.webview.postMessage({ type: "format-table-result", result });
    return;
  }
  const result = { ok: true, diagnostics: [] };
  await panel.webview.postMessage({ type: "format-table-result", result });
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
