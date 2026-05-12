export interface TableEditorHostAdapter {
  readonly postMessage: (message: unknown) => void;
  readonly getState?: () => unknown;
  readonly setState?: (state: unknown) => void;
}

export function renderTableEditorHostAdapterScript(): string {
  return `window.__ASCIIDOC_TABLE_EDITOR_HOST__ = window.__ASCIIDOC_TABLE_EDITOR_HOST__ || (() => {
  if (typeof acquireVsCodeApi === "function") {
    return acquireVsCodeApi();
  }
  const stateKey = "asciidoc-table-editor:webview-state";
  return {
    postMessage(message) {
      window.dispatchEvent(new CustomEvent("asciidoc-table-editor-message", { detail: message }));
    },
    getState() {
      try {
        return JSON.parse(window.localStorage.getItem(stateKey) || "{}");
      } catch {
        return {};
      }
    },
    setState(state) {
      window.localStorage.setItem(stateKey, JSON.stringify(state || {}));
    }
  };
})();`;
}
