import { renderBaseStyles } from "./html-styles-base";
import { renderFeedbackStyles } from "./html-styles-feedback";
import { renderFormatReviewStyles } from "./html-styles-format";
import { renderGridStyles } from "./html-styles-grid";
import { renderInspectorStyles } from "./html-styles-inspector";
import { renderPreviewStyles } from "./html-styles-preview";

export function renderTableEditorStyles(model: { columnCount: number }): string {
  return [
    renderBaseStyles(),
    renderPreviewStyles(),
    renderFormatReviewStyles(),
    renderGridStyles(model),
    renderInspectorStyles(),
    renderFeedbackStyles()
  ].join("");
}
