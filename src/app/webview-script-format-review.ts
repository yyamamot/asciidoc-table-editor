export function renderWebviewFormatReviewScript(): string {
  return `        const setEditorMode = (nextMode) => {
          editorMode = nextMode === "format-review" && formatReviewViews.length > 0 ? "format-review" : nextMode === "preview" ? "preview" : "edit";
          for (const view of editViews) {
            view.hidden = editorMode !== "edit";
          }
          for (const view of previewViews) {
            view.hidden = editorMode !== "preview";
          }
          for (const view of formatReviewViews) {
            view.hidden = editorMode !== "format-review";
          }
          for (const button of editorModeButtons) {
            button.setAttribute("aria-pressed", String(button.dataset.editorModeValue === editorMode));
          }
          for (const button of sourceActionButtons) {
            button.hidden = editorMode !== "edit";
            button.disabled = editorMode !== "edit" || isSourceMutationUnavailable();
          }
          closeContextMenu();
          persistUiState();
        };
        const setFormatMode = (nextMode) => {
          const allowed = formatModeButtons.some((button) => button.dataset.formatMode === nextMode);
          formatMode = allowed ? nextMode : applyFormatButton?.dataset.formatMode || "table-layout";
          for (const button of formatModeButtons) {
            button.setAttribute("aria-pressed", String(button.dataset.formatMode === formatMode));
          }
          for (const summary of formatSummaries) {
            summary.hidden = summary.dataset.formatMode !== formatMode;
          }
          for (const pane of formatAfterPanes) {
            pane.hidden = pane.dataset.formatMode !== formatMode;
          }
          if (applyFormatButton) {
            applyFormatButton.dataset.formatMode = formatMode;
          }
          persistUiState();
        };
        const setBlockInspectorTab = (nextTab) => {
          blockInspectorTab = "preview";
          persistUiState();
        };
`;
}
