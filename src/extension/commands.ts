import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import * as vscode from "vscode";
import { AsciiDocTableCodeLensProvider } from "./table-editor-codelens";
import { applyBlockCellContentToEditor, applyHorizontalMergeToEditor, applyHorizontalUnmergeToEditor, applyImportedTablePasteToEditor, applyPlainCellBlockContentToEditor, applyPlainCellContentToEditor, applyPlainCellContentsToEditor, applyRectangularPasteToEditor, applyRowColumnEditToEditor } from "./table-editor-document-edits";
import { createFormatPreviewModel, createFormatReviewModel, formatEnabled } from "./format-command";
import { createTableEditorPanel, latestPanel } from "./panel";
import { registerTableEditorMessageRouter } from "./message-router";
import { createTableEditorLabels } from "./table-editor-labels";
import { renderTableEditorPreview } from "./table-editor-preview";
import { revealSourceCellInEditor } from "./table-editor-source-reveal";
import type { CellContentReplacement, CellContentUpdateResult, OpenTableEditorTarget, RowColumnEditMessage, SourceCellRevealResult, UndoRedoResult } from "./types";
import { createWebviewAppModel, renderTableEditorHtml, type WebviewAppModel } from "../app";
import { findAsciiDocTableBlock, formatAsciiDocTable, parseAsciiDocTable, projectGridModel, recommendedTableFormatMode, type TableDiagnostic, type TableFormatMode, type TableFormatResult } from "../core";

export type OpenTableEditorCommandResult =
  | {
      ok: true;
      mode: WebviewAppModel["mode"];
      model: WebviewAppModel;
      html: string;
      diagnostics: WebviewAppModel["diagnostics"];
    }
  | {
      ok: false;
      reason: "no-editor" | "no-table";
      message: string;
    };

export function registerAsciiDocTableCommands(context: vscode.ExtensionContext): void {
  const showParserInfo = vscode.commands.registerCommand("asciidocTable.showParserInfo", () => {
    const editor = vscode.window.activeTextEditor;
    const source = editor?.document.getText() ?? "";
    const parsed = parseAsciiDocTable(source);
    const cellCount = parsed.rows.reduce((sum, row) => sum + row.cells.length, 0);
    void vscode.window.showInformationMessage(
      vscode.l10n.t("AsciiDoc Table parser scaffold is ready.") + ` (${cellCount} cells)`
    );
  });

  const openEditor = vscode.commands.registerCommand("asciidocTable.openEditor", async (target?: OpenTableEditorTarget): Promise<OpenTableEditorCommandResult> => {
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
    const model = createWebviewAppModel(grid, preview);
    const html = renderTableEditorHtml(model, createNonce(), {}, createTableEditorLabels());
    const tableStartOffset = tableBlock.range.start.offset;
    const panel = createTableEditorPanel();
    let formatReview = model.formatReview;
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
      applyFormatTable: (message) => void applyFormatReview(editor, panel, tableStartOffset, formatReview, (message as { mode?: TableFormatMode }).mode, (message as { selectedSourceCellId?: string }).selectedSourceCellId)
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

  const formatTable = vscode.commands.registerCommand("asciidocTable.formatTable", async (target?: OpenTableEditorTarget): Promise<OpenTableEditorCommandResult> => {
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
        diagnostics: preview.diagnostics
      });
      return { ok: true, mode: model.mode, model, html: renderTableEditorHtml(model, createNonce(), {}, createTableEditorLabels()), diagnostics: model.diagnostics };
    }

    const preview = await renderTableEditorPreview(tableBlock.raw);
    const formatReview = createFormatReviewModel(tableBlock.raw, changedResults, recommendedTableFormatMode(parsed), createTableEditorLabels());
    const model = createWebviewAppModel(projectGridModel(parsed), {
      preview: preview.preview,
      diagnostics: preview.diagnostics,
      formatReview
    });
    const html = renderTableEditorHtml(model, createNonce(), {}, createTableEditorLabels());
    const tableStartOffset = tableBlock.range.start.offset;
    const panel = createTableEditorPanel();
    registerTableEditorMessageRouter(panel, {
      uiReviewSnapshot: writeUiReviewSnapshotIfRequested,
      applyFormatTable: (message) => void applyFormatReview(editor, panel, tableStartOffset, formatReview, (message as { mode?: TableFormatMode }).mode, (message as { selectedSourceCellId?: string }).selectedSourceCellId)
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

  const subscriptions: vscode.Disposable[] = [
    showParserInfo,
    openEditor,
    formatTable,
    vscode.languages.registerCodeLensProvider({ language: "asciidoc" }, new AsciiDocTableCodeLensProvider()),
    vscode.languages.registerCodeLensProvider({ language: "adoc" }, new AsciiDocTableCodeLensProvider())
  ];

  if (process.env.ASCIIDOC_TABLE_ENABLE_TEST_COMMANDS === "1") {
    subscriptions.push(vscode.commands.registerCommand(
      "asciidocTable.test.setEditorMode",
      async (mode: "edit" | "preview"): Promise<boolean> => {
        const panel = latestPanel();
        if (panel === undefined) {
          return false;
        }
        await panel.webview.postMessage({ type: "set-editor-mode-for-review", mode });
        return true;
      }
    ));
    subscriptions.push(vscode.commands.registerCommand(
      "asciidocTable.test.replacePlainCellContent",
      async (sourceCellId: string, contentRaw: string): Promise<CellContentUpdateResult> => {
        const editor = vscode.window.activeTextEditor;
        if (editor === undefined) {
          return {
            ok: false,
            diagnostics: [{
              code: "writeback.no-active-editor",
              severity: "error",
              message: "No active editor was available"
            }]
          };
        }
        const source = editor.document.getText();
        const tableBlock = findAsciiDocTableBlock(source, editor.document.offsetAt(editor.selection.active));
        if (tableBlock === undefined) {
          return {
            ok: false,
            diagnostics: [{
              code: "writeback.table-not-found",
              severity: "error",
              message: "No AsciiDoc table block was found"
            }]
          };
        }
        return applyPlainCellContentToEditor(editor, tableBlock.range.start.offset, sourceCellId, contentRaw);
      }
    ));
    subscriptions.push(vscode.commands.registerCommand(
      "asciidocTable.test.replacePlainCellContents",
      async (replacements: CellContentReplacement[]): Promise<CellContentUpdateResult> => {
        const editor = vscode.window.activeTextEditor;
        if (editor === undefined) {
          return {
            ok: false,
            diagnostics: [{
              code: "writeback.no-active-editor",
              severity: "error",
              message: "No active editor was available"
            }]
          };
        }
        const source = editor.document.getText();
        const tableBlock = findAsciiDocTableBlock(source, editor.document.offsetAt(editor.selection.active));
        if (tableBlock === undefined) {
          return {
            ok: false,
            diagnostics: [{
              code: "writeback.table-not-found",
              severity: "error",
              message: "No AsciiDoc table block was found"
            }]
          };
        }
        return applyPlainCellContentsToEditor(editor, tableBlock.range.start.offset, replacements);
      }
    ));
    subscriptions.push(vscode.commands.registerCommand(
      "asciidocTable.test.mergePlainCellsHorizontally",
      async (sourceCellIds: string[]): Promise<CellContentUpdateResult> => {
        const editor = vscode.window.activeTextEditor;
        if (editor === undefined) {
          return {
            ok: false,
            diagnostics: [{
              code: "writeback.no-active-editor",
              severity: "error",
              message: "No active editor was available"
            }]
          };
        }
        const source = editor.document.getText();
        const tableBlock = findAsciiDocTableBlock(source, editor.document.offsetAt(editor.selection.active));
        if (tableBlock === undefined) {
          return {
            ok: false,
            diagnostics: [{
              code: "writeback.table-not-found",
              severity: "error",
              message: "No AsciiDoc table block was found"
            }]
          };
        }
        return applyHorizontalMergeToEditor(editor, tableBlock.range.start.offset, sourceCellIds);
      }
    ));
    subscriptions.push(vscode.commands.registerCommand(
      "asciidocTable.test.unmergePlainCellHorizontally",
      async (sourceCellId: string): Promise<CellContentUpdateResult> => {
        const editor = vscode.window.activeTextEditor;
        if (editor === undefined) {
          return {
            ok: false,
            diagnostics: [{
              code: "writeback.no-active-editor",
              severity: "error",
              message: "No active editor was available"
            }]
          };
        }
        const source = editor.document.getText();
        const tableBlock = findAsciiDocTableBlock(source, editor.document.offsetAt(editor.selection.active));
        if (tableBlock === undefined) {
          return {
            ok: false,
            diagnostics: [{
              code: "writeback.table-not-found",
              severity: "error",
              message: "No AsciiDoc table block was found"
            }]
          };
        }
        return applyHorizontalUnmergeToEditor(editor, tableBlock.range.start.offset, sourceCellId);
      }
    ));
    subscriptions.push(vscode.commands.registerCommand(
      "asciidocTable.test.editRowColumnStructure",
      async (operation: RowColumnEditMessage["type"], sourceCellId: string): Promise<CellContentUpdateResult> => {
        const editor = vscode.window.activeTextEditor;
        if (editor === undefined) {
          return {
            ok: false,
            diagnostics: [{
              code: "writeback.no-active-editor",
              severity: "error",
              message: "No active editor was available"
            }]
          };
        }
        const source = editor.document.getText();
        const tableBlock = findAsciiDocTableBlock(source, editor.document.offsetAt(editor.selection.active));
        if (tableBlock === undefined) {
          return {
            ok: false,
            diagnostics: [{
              code: "writeback.table-not-found",
              severity: "error",
              message: "No AsciiDoc table block was found"
            }]
          };
        }
        return applyRowColumnEditToEditor(editor, tableBlock.range.start.offset, { type: operation, sourceCellId });
      }
    ));
    subscriptions.push(vscode.commands.registerCommand(
      "asciidocTable.test.replaceBlockCellContent",
      async (sourceCellId: string, contentRaw: string): Promise<CellContentUpdateResult> => {
        const editor = vscode.window.activeTextEditor;
        if (editor === undefined) {
          return {
            ok: false,
            diagnostics: [{
              code: "writeback.no-active-editor",
              severity: "error",
              message: "No active editor was available"
            }]
          };
        }
        const source = editor.document.getText();
        const tableBlock = findAsciiDocTableBlock(source, editor.document.offsetAt(editor.selection.active));
        if (tableBlock === undefined) {
          return {
            ok: false,
            diagnostics: [{
              code: "writeback.table-not-found",
              severity: "error",
              message: "No AsciiDoc table block was found"
            }]
          };
        }
        return applyBlockCellContentToEditor(editor, tableBlock.range.start.offset, { sourceCellId, contentRaw });
      }
    ));
    subscriptions.push(vscode.commands.registerCommand(
      "asciidocTable.test.revealSourceCell",
      async (sourceCellId: string): Promise<SourceCellRevealResult> => {
        const editor = vscode.window.activeTextEditor;
        if (editor === undefined) {
          return {
            ok: false,
            diagnostics: [{
              code: "source-cell-reveal.no-active-editor",
              severity: "error",
              message: "No active editor was available"
            }]
          };
        }
        const source = editor.document.getText();
        const tableBlock = findAsciiDocTableBlock(source, editor.document.offsetAt(editor.selection.active));
        if (tableBlock === undefined) {
          return {
            ok: false,
            diagnostics: [{
              code: "source-cell-reveal.table-not-found",
              severity: "error",
              message: "No AsciiDoc table block was found"
            }]
          };
        }
        return revealSourceCellInEditor(editor, tableBlock.range.start.offset, sourceCellId);
      }
    ));
  }

  context.subscriptions.push(...subscriptions);
}

async function applyCellContentUpdate(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  tableStartOffset: number,
  message: { sourceCellId: string; contentRaw: string; selectedSourceCellId?: string }
): Promise<void> {
  const requiresRefresh = requiresFullRefreshForPlainCellUpdate(editor, tableStartOffset, message.sourceCellId);
  const result = await applyPlainCellContentToEditor(editor, tableStartOffset, message.sourceCellId, message.contentRaw);
  const preview = result.ok && !requiresRefresh
    ? await renderCurrentTablePreview(editor, tableStartOffset)
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
  if (!result.ok) {
    return;
  }

  if (requiresRefresh) {
    await refreshPanelFromEditor(editor, panel, tableStartOffset, message.selectedSourceCellId ?? message.sourceCellId);
  }
}

async function applyCellContentsUpdate(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  tableStartOffset: number,
  message: { replacements: CellContentReplacement[]; selectedSourceCellId?: string; diagnostics?: readonly TableDiagnostic[] }
): Promise<void> {
  const requiresRefresh = requiresFullRefreshForPlainCellContentsUpdate(editor, tableStartOffset, message.replacements);
  const result = await applyPlainCellContentsToEditor(editor, tableStartOffset, message.replacements);
  const resultWithDiagnostics = mergeResultDiagnostics(result, message.diagnostics);
  const preview = result.ok && !requiresRefresh
    ? await renderCurrentTablePreview(editor, tableStartOffset)
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
  if (!result.ok) {
    return;
  }

  if (requiresRefresh) {
    await refreshPanelFromEditor(editor, panel, tableStartOffset, message.selectedSourceCellId ?? message.replacements.at(-1)?.sourceCellId, message.diagnostics);
  }
}

async function applyRectangularPaste(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  tableStartOffset: number,
  message: { startSourceCellId: string; rows: readonly (readonly string[])[]; selectedSourceCellId?: string; diagnostics?: readonly TableDiagnostic[] }
): Promise<void> {
  const result = await applyRectangularPasteToEditor(editor, tableStartOffset, {
    startSourceCellId: message.startSourceCellId,
    rows: message.rows
  });
  const resultWithDiagnostics = mergeResultDiagnostics(result, message.diagnostics);
  await panel.webview.postMessage({ type: "cell-content-update-result", result: resultWithDiagnostics });
  if (!result.ok) {
    return;
  }

  await refreshPanelFromEditor(editor, panel, tableStartOffset, message.selectedSourceCellId ?? message.startSourceCellId, message.diagnostics);
}

async function applyImportedPaste(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  tableStartOffset: number,
  message: Parameters<typeof applyImportedTablePasteToEditor>[2] & { selectedSourceCellId?: string }
): Promise<void> {
  const result = await applyImportedTablePasteToEditor(editor, tableStartOffset, message);
  const resultWithDiagnostics = mergeResultDiagnostics(result, message.diagnostics);
  await panel.webview.postMessage({ type: "cell-content-update-result", result: resultWithDiagnostics });
  if (!result.ok) {
    return;
  }

  await refreshPanelFromEditor(editor, panel, tableStartOffset, message.selectedSourceCellId ?? message.startSourceCellId, message.diagnostics);
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

async function applyBlockCellSourceUpdate(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  tableStartOffset: number,
  message: { sourceCellId: string; contentRaw: string; selectedSourceCellId?: string }
): Promise<void> {
  const result = await applyBlockCellContentToEditor(editor, tableStartOffset, {
    sourceCellId: message.sourceCellId,
    contentRaw: message.contentRaw
  });
  const preview = result.ok
    ? await renderCurrentTablePreview(editor, tableStartOffset)
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
  if (!result.ok) {
    return;
  }
}

async function applyPlainCellBlockSourceReplace(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  tableStartOffset: number,
  message: { sourceCellId: string; contentRaw: string; selectedSourceCellId?: string; diagnostics?: readonly TableDiagnostic[] }
): Promise<void> {
  const result = await applyPlainCellBlockContentToEditor(editor, tableStartOffset, {
    sourceCellId: message.sourceCellId,
    contentRaw: message.contentRaw
  });
  const resultWithDiagnostics = mergeResultDiagnostics(result, message.diagnostics);
  await panel.webview.postMessage({ type: "block-cell-update-result", result: resultWithDiagnostics });
  if (!result.ok) {
    return;
  }

  await refreshPanelFromEditor(editor, panel, tableStartOffset, message.selectedSourceCellId ?? message.sourceCellId, message.diagnostics);
}

async function applyMergeCells(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  tableStartOffset: number,
  message: { sourceCellIds: string[]; selectedSourceCellId?: string }
): Promise<void> {
  const result = await applyHorizontalMergeToEditor(editor, tableStartOffset, message.sourceCellIds);
  await panel.webview.postMessage({ type: "merge-cells-result", result });
  if (!result.ok) {
    return;
  }

  await refreshPanelFromEditor(editor, panel, tableStartOffset, message.selectedSourceCellId ?? message.sourceCellIds[0]);
}

async function applyUnmergeCell(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  tableStartOffset: number,
  message: { sourceCellId: string; selectedSourceCellId?: string }
): Promise<void> {
  const result = await applyHorizontalUnmergeToEditor(editor, tableStartOffset, message.sourceCellId);
  await panel.webview.postMessage({ type: "unmerge-cell-result", result });
  if (!result.ok) {
    return;
  }

  await refreshPanelFromEditor(editor, panel, tableStartOffset, message.selectedSourceCellId ?? message.sourceCellId);
}

async function applyRowColumnEdit(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  tableStartOffset: number,
  message: RowColumnEditMessage
): Promise<void> {
  const result = await applyRowColumnEditToEditor(editor, tableStartOffset, message);
  await panel.webview.postMessage({ type: "row-column-edit-result", result });
  if (!result.ok) {
    return;
  }

  await refreshPanelFromEditor(editor, panel, tableStartOffset, message.selectedSourceCellId ?? message.sourceCellId);
}

async function applyRevealSourceCell(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  tableStartOffset: number,
  message: { sourceCellId: string; selectedSourceCellId?: string }
): Promise<void> {
  const result = await revealSourceCellInEditor(editor, tableStartOffset, message.sourceCellId);
  await panel.webview.postMessage({ type: "source-cell-reveal-result", result });
}

async function applyUndoRedo(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  tableStartOffset: number,
  message: { type: "request-undo" | "request-redo"; selectedSourceCellId?: string }
): Promise<void> {
  const result = await runEditorUndoRedo(editor, message.type === "request-undo" ? "undo" : "redo");
  await panel.webview.postMessage({ type: "undo-redo-result", result });
  await refreshPanelFromEditor(editor, panel, tableStartOffset, message.selectedSourceCellId);
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

async function refreshPanelFromEditor(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  tableStartOffset: number,
  selectedSourceCellId?: string,
  diagnostics: readonly TableDiagnostic[] = []
): Promise<void> {
  const source = editor.document.getText();
  const tableBlock = findAsciiDocTableBlock(source, tableStartOffset);
  const model = tableBlock === undefined
    ? createMissingTableFallbackModel()
    : await createRefreshedTableEditorModel(tableBlock.raw, diagnostics);
  panel.webview.html = renderTableEditorHtml(model, createNonce(), { selectedSourceCellId }, createTableEditorLabels());
  panel.reveal(vscode.ViewColumn.Beside, true);
}

async function openFormatReviewInPanel(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  tableStartOffset: number,
  selectedSourceCellId?: string
): Promise<WebviewAppModel["formatReview"] | undefined> {
  if (!formatEnabled(editor.document.uri)) {
    await panel.webview.postMessage({
      type: "format-table-result",
      result: {
        ok: false,
        diagnostics: [{
          code: "format.disabled",
          severity: "warning",
          message: "AsciiDoc table formatting is disabled by settings."
        }]
      }
    });
    return undefined;
  }
  const tableBlock = findAsciiDocTableBlock(editor.document.getText(), tableStartOffset);
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

async function applyFormatReview(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  tableStartOffset: number,
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
  const source = editor.document.getText();
  const tableBlock = findAsciiDocTableBlock(source, tableStartOffset);
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
    await refreshPanelFromEditor(editor, panel, tableStartOffset, selectedSourceCellId, result.diagnostics);
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

  const editApplied = await editor.edit((builder) => {
    builder.replace(
      new vscode.Range(
        tableBlock.range.start.line,
        tableBlock.range.start.column,
        tableBlock.range.end.line,
        tableBlock.range.end.column
      ),
      variant.after
    );
  });
  if (!editApplied) {
    const result = {
      ok: false,
      diagnostics: [{
        code: "format.edit-not-applied",
        severity: "error" as const,
        message: "VS Code did not apply the table format edit"
      }]
    };
    await panel.webview.postMessage({ type: "format-table-result", result });
    return;
  }
  const result = { ok: true, diagnostics: [] };
  await panel.webview.postMessage({ type: "format-table-result", result });
  await refreshPanelFromEditor(editor, panel, tableStartOffset, selectedSourceCellId);
}

async function createRefreshedTableEditorModel(tableSource: string, diagnostics: readonly TableDiagnostic[] = []): Promise<WebviewAppModel> {
  const preview = await renderTableEditorPreview(tableSource);
  return createWebviewAppModel(projectGridModel(parseAsciiDocTable(tableSource)), {
    preview: preview.preview,
    diagnostics: [...preview.diagnostics, ...diagnostics]
  });
}

function requiresFullRefreshForPlainCellUpdate(editor: vscode.TextEditor, tableStartOffset: number, sourceCellId: string): boolean {
  const tableBlock = findAsciiDocTableBlock(editor.document.getText(), tableStartOffset);
  if (tableBlock === undefined) {
    return true;
  }
  const table = parseAsciiDocTable(tableBlock.raw);
  const cell = table.rows.flatMap((row) => row.cells).find((candidate) => candidate.nodeId === sourceCellId);
  return (cell?.duplicateCount ?? 1) > 1;
}

function requiresFullRefreshForPlainCellContentsUpdate(editor: vscode.TextEditor, tableStartOffset: number, replacements: readonly CellContentReplacement[]): boolean {
  const tableBlock = findAsciiDocTableBlock(editor.document.getText(), tableStartOffset);
  if (tableBlock === undefined) {
    return true;
  }
  const table = parseAsciiDocTable(tableBlock.raw);
  const cellsById = new Map(table.rows.flatMap((row) => row.cells).map((cell) => [cell.nodeId, cell]));
  return replacements.some((replacement) => (cellsById.get(replacement.sourceCellId)?.duplicateCount ?? 1) > 1);
}

async function renderCurrentTablePreview(editor: vscode.TextEditor, tableStartOffset: number): Promise<Awaited<ReturnType<typeof renderTableEditorPreview>> | undefined> {
  const tableBlock = findAsciiDocTableBlock(editor.document.getText(), tableStartOffset);
  if (tableBlock === undefined) {
    return undefined;
  }
  return renderTableEditorPreview(tableBlock.raw);
}

function createMissingTableFallbackModel(): WebviewAppModel {
  return createWebviewAppModel({
    tableId: "missing-table",
    rowCount: 0,
    columnCount: 0,
    columns: [],
    cells: [],
    diagnostics: [{
      code: "writeback.table-not-found",
      severity: "error",
      message: "Target AsciiDoc table block was not found after undo/redo"
    }]
  });
}

async function resolveTargetEditor(target: OpenTableEditorTarget | undefined): Promise<vscode.TextEditor | undefined> {
  if (!target?.documentUri) {
    return vscode.window.activeTextEditor;
  }

  const uri = vscode.Uri.parse(target.documentUri);
  const visible = vscode.window.visibleTextEditors.find((editor) => editor.document.uri.toString() === target.documentUri);
  const editor = visible ?? await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri), vscode.ViewColumn.One);
  if (typeof target.tableStartOffset === "number") {
    const position = editor.document.positionAt(target.tableStartOffset);
    editor.selection = new vscode.Selection(position, position);
  }
  return editor;
}

function writeUiReviewSnapshotIfRequested(snapshot: unknown): void {
  const snapshotPath = process.env.ASCIIDOC_TABLE_WEBVIEW_SNAPSHOT_PATH;
  if (!snapshotPath) {
    return;
  }
  mkdirSync(dirname(snapshotPath), { recursive: true });
  writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}


function createNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let index = 0; index < 32; index += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
