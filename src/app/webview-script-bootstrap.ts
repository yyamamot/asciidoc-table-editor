export function renderWebviewBootstrapScript(selectedSourceCellId: string, mode: string): string {
  return `        const requestedInitialCell = ${JSON.stringify(selectedSourceCellId)};
        const initialCell = (requestedInitialCell
          ? Array.from(document.querySelectorAll(".cell")).find((cell) => cell.dataset.sourceCellId === requestedInitialCell)
          : null) || document.querySelector(".cell[data-kind='origin']") || document.querySelector(".cell");
        if (initialCell) {
          selectCell(initialCell);
        }
        setEditorMode(editorMode);
        setFormatMode(formatMode);
        setBlockInspectorTab(blockInspectorTab);
        applyGridState(initialState.gridState);
        const capture = () => {
          const selfReviewText = document.getElementById("llm-ui-self-review")?.textContent || "{}";
          let selfReview = {};
          try {
            selfReview = JSON.parse(selfReviewText);
          } catch {
            selfReview = { mode: "${mode}", parseError: "llm-ui-self-review" };
          }
          selfReview = { ...selfReview, editorMode, blockInspectorTab };
          const targets = Array.from(document.querySelectorAll("[data-review-target], .cell"));
          vscode.postMessage({
            type: "ui-review-snapshot",
            snapshot: {
              capturedAt: new Date().toISOString(),
              reason: "webview-dom",
              selfReview,
              geometry: {
                viewport: {
                  width: window.innerWidth,
                  height: window.innerHeight
                },
                elements: targets.map(elementFor),
                relationships: []
              }
            }
          });
        };
        requestAnimationFrame(() => requestAnimationFrame(capture));
`;
}
