import { renderWebviewBootstrapScript } from "./webview-script-bootstrap";
import { renderWebviewClipboardScript } from "./webview-script-clipboard";
import { renderWebviewDomScript } from "./webview-script-dom";
import { renderWebviewEditingScript } from "./webview-script-editing";
import { renderWebviewFormatReviewScript } from "./webview-script-format-review";
import { renderWebviewSelectionScript } from "./webview-script-selection";

export function renderWebviewScript(nonce: string, scriptLabels: string, selectedSourceCellId: string, mode: string, revisionToken: string): string {
  return `    <script nonce="${nonce}">
      (() => {
        const injectedHost = window.__ASCIIDOC_TABLE_EDITOR_HOST__ || window.__ASCIIDOC_TABLE_HOST__;
        const vscode = injectedHost || (typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : {
          postMessage(message) {
            window.dispatchEvent(new CustomEvent("asciidoc-table-editor-message", { detail: message }));
          },
          getState() {
            return window.__ASCIIDOC_TABLE_BROWSER_STATE__ || {};
          },
          setState(state) {
            window.__ASCIIDOC_TABLE_BROWSER_STATE__ = state || {};
          },
        });
        const labels = ${scriptLabels};
        const initialRevisionToken = ${JSON.stringify(revisionToken)};
${renderWebviewDomScript()}${renderWebviewFormatReviewScript()}${renderWebviewSelectionScript()}${renderWebviewClipboardScript()}${renderWebviewEditingScript()}${renderWebviewBootstrapScript(selectedSourceCellId, mode)}      })();
    </script>`;
}
