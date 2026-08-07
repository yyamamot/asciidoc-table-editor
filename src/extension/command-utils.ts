import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import * as vscode from "vscode";
import { createWebviewAppModel, renderTableEditorHtml, type WebviewAppModel } from "../app";
import { parseAsciiDocTable, projectGridModel, type TableDiagnostic } from "../core";
import { createTableEditorLabels } from "./table-editor-labels";
import { renderTableEditorPreview } from "./table-editor-preview";
import type { CellContentReplacement, OpenTableEditorTarget } from "./types";
import type { TableEditorSessionTarget } from "./table-editor-session-target";

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

export function createNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let index = 0; index < 32; index += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

export async function resolveTargetEditor(target: OpenTableEditorTarget | undefined): Promise<vscode.TextEditor | undefined> {
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

export function writeUiReviewSnapshotIfRequested(snapshot: unknown): void {
  const snapshotPath = process.env.ASCIIDOC_TABLE_WEBVIEW_SNAPSHOT_PATH;
  if (!snapshotPath) {
    return;
  }
  mkdirSync(dirname(snapshotPath), { recursive: true });
  writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

export async function refreshPanelFromEditor(
  editor: vscode.TextEditor,
  panel: vscode.WebviewPanel,
  target: TableEditorSessionTarget,
  selectedSourceCellId?: string,
  diagnostics: readonly TableDiagnostic[] = []
): Promise<void> {
  const resolution = target.resolve(editor.document);
  const tableBlock = resolution.status === "ready" ? resolution.tableBlock : undefined;
  const model = tableBlock === undefined
    ? createMissingTableFallbackModel()
    : await createRefreshedTableEditorModel(tableBlock.raw, diagnostics);
  panel.webview.html = renderTableEditorHtml(model, createNonce(), { selectedSourceCellId }, createTableEditorLabels());
}

export async function createRefreshedTableEditorModel(tableSource: string, diagnostics: readonly TableDiagnostic[] = []): Promise<WebviewAppModel> {
  const preview = await renderTableEditorPreview(tableSource);
  const table = parseAsciiDocTable(tableSource);
  return createWebviewAppModel(projectGridModel(table), {
    preview: preview.preview,
    tableAttributes: table.attributes,
    diagnostics: [...preview.diagnostics, ...diagnostics]
  });
}

export function createMissingTableFallbackModel(): WebviewAppModel {
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

export function requiresFullRefreshForPlainCellUpdate(editor: vscode.TextEditor, target: TableEditorSessionTarget, sourceCellId: string): boolean {
  const resolution = target.resolve(editor.document);
  const tableBlock = resolution.status === "ready" ? resolution.tableBlock : undefined;
  if (tableBlock === undefined) {
    return true;
  }
  const table = parseAsciiDocTable(tableBlock.raw);
  const cell = table.rows.flatMap((row) => row.cells).find((candidate) => candidate.nodeId === sourceCellId);
  return (cell?.duplicateCount ?? 1) > 1;
}

export function requiresFullRefreshForPlainCellContentsUpdate(editor: vscode.TextEditor, target: TableEditorSessionTarget, replacements: readonly CellContentReplacement[]): boolean {
  const resolution = target.resolve(editor.document);
  const tableBlock = resolution.status === "ready" ? resolution.tableBlock : undefined;
  if (tableBlock === undefined) {
    return true;
  }
  const table = parseAsciiDocTable(tableBlock.raw);
  const cellsById = new Map(table.rows.flatMap((row) => row.cells).map((cell) => [cell.nodeId, cell]));
  return replacements.some((replacement) => (cellsById.get(replacement.sourceCellId)?.duplicateCount ?? 1) > 1);
}

export async function renderCurrentTablePreview(editor: vscode.TextEditor, target: TableEditorSessionTarget): Promise<Awaited<ReturnType<typeof renderTableEditorPreview>> | undefined> {
  const resolution = target.resolve(editor.document);
  const tableBlock = resolution.status === "ready" ? resolution.tableBlock : undefined;
  if (tableBlock === undefined) {
    return undefined;
  }
  return renderTableEditorPreview(tableBlock.raw);
}
