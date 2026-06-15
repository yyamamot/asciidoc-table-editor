import * as vscode from "vscode";
import type { TableEditorWebviewLabels, WebviewAppModel } from "../app";
import {
  formatAsciiDocTable,
  parseAsciiDocTable,
  projectGridModel,
  recommendedTableFormatMode,
  type TableFormatMode,
  type TableFormatResult
} from "../core";
import { createWebviewAppModel } from "../app";
import { renderTableEditorPreview } from "./table-editor-preview";

export function formatEnabled(resource: vscode.Uri): boolean {
  return vscode.workspace.getConfiguration("asciidocTable.format", resource).get<boolean>("enabled", true);
}

export function createFormatReviewModel(
  before: string,
  results: readonly Extract<TableFormatResult, { ok: true }>[],
  recommendedMode: TableFormatMode,
  labels: TableEditorWebviewLabels
): NonNullable<WebviewAppModel["formatReview"]> {
  const selectedMode = results.some((result) => result.mode === recommendedMode) ? recommendedMode : results[0]?.mode ?? "table-layout";
  return {
    before,
    selectedMode,
    variants: results.map((result) => ({
      mode: result.mode,
      label: result.mode === "cell-per-line" ? labels.cellPerLine : labels.tableLayout,
      after: result.source,
      changedLineCount: result.summary.changedLineCount,
      formattedRowCount: result.summary.formattedRowCount,
      preservedRowCount: result.summary.preservedRowCount,
      diagnostics: result.diagnostics.map((diagnostic) => diagnostic.message)
    }))
  };
}

export async function createFormatPreviewModel(
  tableSource: string,
  labels: TableEditorWebviewLabels
): Promise<
  | { readonly ok: true; readonly model: WebviewAppModel; readonly formatReview: NonNullable<WebviewAppModel["formatReview"]> }
  | { readonly ok: false; readonly model: WebviewAppModel; readonly changed: false }
> {
  const parsed = parseAsciiDocTable(tableSource);
  const formatResults = [
    formatAsciiDocTable(parsed, { mode: "table-layout" }),
    formatAsciiDocTable(parsed, { mode: "cell-per-line" })
  ];
  const preview = await renderTableEditorPreview(tableSource);
  const changedResults = formatResults.filter((result): result is Extract<TableFormatResult, { ok: true }> => result.ok && result.changed);
  if (changedResults.length === 0) {
    const diagnostics = formatResults.flatMap((result) => result.diagnostics);
    return {
      ok: false,
      changed: false,
      model: createWebviewAppModel(projectGridModel(parsed), {
        preview: preview.preview,
        tableAttributes: parsed.attributes,
        diagnostics: [...preview.diagnostics, ...diagnostics]
      })
    };
  }

  const formatReview = createFormatReviewModel(tableSource, changedResults, recommendedTableFormatMode(parsed), labels);
  return {
    ok: true,
    formatReview,
    model: createWebviewAppModel(projectGridModel(parsed), {
      preview: preview.preview,
      tableAttributes: parsed.attributes,
      diagnostics: preview.diagnostics,
      formatReview
    })
  };
}
