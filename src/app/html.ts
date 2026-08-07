import { renderTableEditorHostAdapterScript } from "./host-adapter";
import { DEFAULT_TABLE_EDITOR_LABELS } from "./labels";
import { renderWebviewScript } from "./webview-script";
import { renderFormatReview } from "./html-format-review";
import { renderGrid } from "./html-grid";
import { renderBottomCellEditor, renderContextMenu, renderDiagnostics, renderFallbackGuidance, renderInspector } from "./html-inspector";
import { renderPreviewScreen, renderToolbar } from "./html-shell";
import { renderTableEditorStyles } from "./html-styles";
import { escapeHtml, escapeJsonScript } from "./html-utils";
import type { RenderTableEditorOptions, TableEditorWebviewLabels, WebviewAppModel } from "./types";
export { displayContentForGridCell } from "./html-grid";

export function renderTableEditorHtml(
  model: WebviewAppModel,
  nonce: string,
  options: RenderTableEditorOptions = {},
  labels: TableEditorWebviewLabels = DEFAULT_TABLE_EDITOR_LABELS
): string {
  const grid = renderGrid(model, options, labels, nonce);
  const diagnostics = renderDiagnostics(model.diagnostics, labels);
  const scriptLabels = escapeJsonScript(JSON.stringify(labels));
  const reviewMetadata = escapeJsonScript(
    JSON.stringify({
      component: "table-grid",
      mode: model.mode,
      rowCount: model.rowCount,
      columnCount: model.columnCount,
      diagnosticCount: model.diagnostics.length
    })
  );

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(labels.title)}</title>
  <style nonce="${nonce}">
${renderTableEditorStyles(model)}
  </style>
</head>
<body>
  <main class="shell" data-review-target="shell" data-mode="${model.mode}" aria-label="${escapeHtml(labels.title)}">
    ${renderToolbar(model, labels)}
    <section class="workspace" data-editor-view="edit" aria-label="${escapeHtml(labels.title)}">
      <div class="grid-wrap" aria-label="${escapeHtml(labels.tableGrid)}">
        ${renderFallbackGuidance(model, labels)}
        ${grid}
      </div>
      ${renderInspector(model, labels, options.selectedSourceCellId)}
    </section>
    ${model.mode === "table-grid" && model.formatReview !== undefined ? renderFormatReview(model, labels) : ""}
    ${model.mode === "table-grid" ? renderBottomCellEditor(model, labels) : ""}
    ${renderPreviewScreen(model, labels)}
    ${model.mode === "table-grid" ? renderContextMenu(labels) : ""}
    ${diagnostics}
    <script type="application/json" id="llm-ui-self-review">${reviewMetadata}</script>
    <script nonce="${nonce}">${options.hostBridgeScript ?? renderTableEditorHostAdapterScript()}</script>
    ${renderWebviewScript(nonce, scriptLabels, options.selectedSourceCellId ?? "", model.mode, options.revisionToken ?? "portable-session")}
  </main>
</body>
</html>`;
}
