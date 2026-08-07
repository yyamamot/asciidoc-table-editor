import { renderHighlightedAsciiDocSource } from "./asciidoc-source-highlight";
import type { TableEditorWebviewLabels, WebviewAppModel } from "./types";
import { escapeHtml } from "./html-utils";

export function renderFormatReview(model: WebviewAppModel, labels: TableEditorWebviewLabels): string {
  const review = model.formatReview;
  if (review === undefined) {
    return "";
  }
  const selectedMode = review.selectedMode;
  const modeButtons = review.variants.map((variant) => `<button type="button" data-action="select-format-mode" data-format-mode="${escapeHtml(variant.mode)}" aria-pressed="${variant.mode === selectedMode ? "true" : "false"}">${escapeHtml(variant.label)}</button>`).join("");
  const summaries = review.variants.map((variant) => {
    const diagnostics = variant.diagnostics.length > 0
      ? `<div class="diagnostic" data-severity="warning">${variant.diagnostics.map((diagnostic) => `${escapeHtml(diagnostic.code)}: ${escapeHtml(localizedDiagnosticMessage(diagnostic.code, labels))}`).join("<br>")}</div>`
      : "";
    return `<div data-format-summary data-format-mode="${escapeHtml(variant.mode)}"${variant.mode === selectedMode ? "" : " hidden"}>
      <p class="format-review-summary">
        <span>${escapeHtml(labels.changedLines)}: <strong>${variant.changedLineCount}</strong></span>
        <span>${escapeHtml(labels.formattedRows)}: <strong>${variant.formattedRowCount}</strong></span>
        <span>${escapeHtml(labels.preservedRows)}: <strong>${variant.preservedRowCount}</strong></span>
      </p>
      ${diagnostics}
    </div>`;
  }).join("");
  const beforeHtml = renderFormatSourceWithChangedLines(review.before, review.variants.find((variant) => variant.mode === selectedMode)?.after ?? review.before);
  const afterPanes = review.variants
    .map((variant) => `<pre data-format-review-after data-format-mode="${escapeHtml(variant.mode)}"${variant.mode === selectedMode ? "" : " hidden"}>${renderFormatSourceWithChangedLines(variant.after, review.before)}</pre>`)
    .join("");
  return `<section class="format-review" data-editor-view="format-review" data-review-target="format-review" aria-label="${escapeHtml(labels.formatReview)}">
    <div>
      <h2>${escapeHtml(labels.formatReview)}</h2>
      <div class="mode-toggle format-review-mode" role="group" aria-label="${escapeHtml(labels.formatReview)}">
        ${modeButtons}
      </div>
      ${summaries}
    </div>
    <div class="format-review-diff">
      <section class="format-review-pane">
        <h3>${escapeHtml(labels.before)}</h3>
        <pre data-format-review-before>${beforeHtml}</pre>
      </section>
      <section class="format-review-pane">
        <h3>${escapeHtml(labels.after)}</h3>
        ${afterPanes}
      </section>
    </div>
    <div class="format-review-actions">
      <button type="button" data-action="cancel-format-table">${escapeHtml(labels.cancelFormat)}</button>
      <button type="button" data-action="apply-format-table" data-format-mode="${escapeHtml(selectedMode)}">${escapeHtml(labels.applyFormat)}</button>
    </div>
  </section>`;
}

function localizedDiagnosticMessage(code: string, labels: TableEditorWebviewLabels): string {
  return Object.prototype.hasOwnProperty.call(labels.diagnosticMessages, code)
    ? labels.diagnosticMessages[code] ?? labels.unknownDiagnosticMessage
    : labels.unknownDiagnosticMessage;
}

function renderFormatSourceWithChangedLines(source: string, comparison: string): string {
  const sourceLines = splitSourceLinesForReview(source);
  const comparisonLines = splitSourceLinesForReview(comparison);
  return sourceLines
    .map((line, index) => {
      const highlighted = renderHighlightedAsciiDocSource(line);
      const changedClass = line !== (comparisonLines[index] ?? "");
      return changedClass
        ? `<span class="format-review-line is-changed">${highlighted}</span>`
        : `<span class="format-review-line">${highlighted}</span>`;
    })
    .join("");
}

function splitSourceLinesForReview(source: string): string[] {
  const lines = source.split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") {
    return lines.slice(0, -1);
  }
  return lines;
}
