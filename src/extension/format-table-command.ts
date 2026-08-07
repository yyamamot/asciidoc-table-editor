import * as vscode from "vscode";
import { createWebviewAppModel, renderTableEditorHtml } from "../app";
import { findAsciiDocTableBlock, formatAsciiDocTable, parseAsciiDocTable, projectGridModel, recommendedTableFormatMode, type TableFormatMode, type TableFormatResult } from "../core";
import { applyFormatReview, reportInvalidTableEditorMessage, reportMutationHandlerFailure, type MutationRequestMetadata } from "./command-webview-handlers";
import { createNonce, resolveTargetEditor, writeUiReviewSnapshotIfRequested, type OpenTableEditorCommandResult } from "./command-utils";
import { createFormatReviewModel, formatEnabled } from "./format-command";
import { registerTableEditorMessageRouter } from "./message-router";
import { createTableEditorPanel } from "./panel";
import { createTableEditorLabels } from "./table-editor-labels";
import { renderTableEditorPreview } from "./table-editor-preview";
import type { OpenTableEditorTarget } from "./types";
import { createTableEditorSessionTarget } from "./table-editor-session-target";

export function registerFormatTableCommand(): vscode.Disposable {
  return vscode.commands.registerCommand("asciidocTable.formatTable", async (target?: OpenTableEditorTarget): Promise<OpenTableEditorCommandResult> => {
    const editor = await resolveTargetEditor(target);
    if (editor === undefined) {
      const message = vscode.l10n.t("Open an AsciiDoc document before formatting a table.");
      void vscode.window.showWarningMessage(message);
      return { ok: false, reason: "no-editor", message };
    }
    if (!formatEnabled(editor.document.uri)) {
      const message = vscode.l10n.t("AsciiDoc table formatting is disabled by settings.");
      void vscode.window.showInformationMessage(message);
      return { ok: false, reason: "no-table", message };
    }

    const source = editor.document.getText();
    const cursorOffset = typeof target?.tableStartOffset === "number"
      ? target.tableStartOffset
      : editor.document.offsetAt(editor.selection.active);
    const tableBlock = findAsciiDocTableBlock(source, cursorOffset);
    if (tableBlock === undefined) {
      const message = vscode.l10n.t("Place the cursor inside an AsciiDoc table before formatting.");
      void vscode.window.showWarningMessage(message);
      return { ok: false, reason: "no-table", message };
    }

    const parsed = parseAsciiDocTable(tableBlock.raw);
    const formatResults = [
      formatAsciiDocTable(parsed, { mode: "table-layout" }),
      formatAsciiDocTable(parsed, { mode: "cell-per-line" })
    ];
    const changedResults = formatResults.filter((result): result is Extract<TableFormatResult, { ok: true }> => result.ok && result.changed);
    if (formatResults.every((result) => !result.ok)) {
      const message = vscode.l10n.t("Table cannot be formatted safely.");
      void vscode.window.showWarningMessage(message);
      const preview = await renderTableEditorPreview(tableBlock.raw);
      const diagnostics = formatResults.flatMap((result) => result.diagnostics);
      const model = createWebviewAppModel(projectGridModel(parsed), {
        preview: preview.preview,
        tableAttributes: parsed.attributes,
        diagnostics: [...preview.diagnostics, ...diagnostics]
      });
      return { ok: true, mode: model.mode, model, html: renderTableEditorHtml(model, createNonce(), {}, createTableEditorLabels()), diagnostics: model.diagnostics };
    }
    if (changedResults.length === 0) {
      const message = vscode.l10n.t("No table formatting changes were needed.");
      void vscode.window.showInformationMessage(message);
      const preview = await renderTableEditorPreview(tableBlock.raw);
      const model = createWebviewAppModel(projectGridModel(parsed), {
        preview: preview.preview,
        tableAttributes: parsed.attributes,
        diagnostics: preview.diagnostics
      });
      return { ok: true, mode: model.mode, model, html: renderTableEditorHtml(model, createNonce(), {}, createTableEditorLabels()), diagnostics: model.diagnostics };
    }

    const preview = await renderTableEditorPreview(tableBlock.raw);
    const formatReview = createFormatReviewModel(tableBlock.raw, changedResults, recommendedTableFormatMode(parsed), createTableEditorLabels());
    const model = createWebviewAppModel(projectGridModel(parsed), {
      preview: preview.preview,
      tableAttributes: parsed.attributes,
      diagnostics: preview.diagnostics,
      formatReview
    });
    const sessionTarget = createTableEditorSessionTarget(editor.document, tableBlock);
    const html = renderTableEditorHtml(model, createNonce(), { revisionToken: sessionTarget.revisionToken } as Parameters<typeof renderTableEditorHtml>[2], createTableEditorLabels());
    const panel = createTableEditorPanel();
    panel.onDidDispose(() => sessionTarget.dispose());
    registerTableEditorMessageRouter(panel, {
      uiReviewSnapshot: writeUiReviewSnapshotIfRequested,
      invalidMessage: (message, resultType) => reportInvalidTableEditorMessage(editor, panel, sessionTarget, message, resultType),
      mutationError: (message, error) => reportMutationHandlerFailure(editor, panel, sessionTarget, message, error),
      applyFormatTable: (message) => applyFormatReview(editor, panel, sessionTarget, formatReview, (message as { mode?: TableFormatMode }).mode, (message as { selectedSourceCellId?: string }).selectedSourceCellId, message as MutationRequestMetadata)
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
