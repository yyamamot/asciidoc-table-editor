export function renderBaseStyles(): string {
  return String.raw`:root {
  color-scheme: light dark;
  --table-editor-font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  --table-editor-editor-font-family: var(--vscode-editor-font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace);
  --table-editor-foreground: var(--vscode-foreground, #1f2328);
  --table-editor-background: var(--vscode-editor-background, #ffffff);
  --table-editor-panel-background: var(--vscode-panel-background, #f6f8fa);
  --table-editor-sidebar-background: var(--vscode-sideBar-background, #f6f8fa);
  --table-editor-button-foreground: var(--vscode-button-foreground, #ffffff);
  --table-editor-button-background: var(--vscode-button-background, #0969da);
  --table-editor-secondary-button-foreground: var(--vscode-button-secondaryForeground, var(--table-editor-foreground));
  --table-editor-secondary-button-background: var(--vscode-button-secondaryBackground, transparent);
  --table-editor-input-foreground: var(--vscode-input-foreground, var(--table-editor-foreground));
  --table-editor-input-background: var(--vscode-input-background, var(--table-editor-background));
  --table-editor-focus-border: var(--vscode-focusBorder, #0969da);
  --table-editor-description-foreground: var(--vscode-descriptionForeground, #6e7781);
  --table-editor-code-background: var(--vscode-textCodeBlock-background, color-mix(in srgb, currentColor 6%, transparent));
  --grid-border: color-mix(in srgb, currentColor 28%, transparent);
  --grid-covered: color-mix(in srgb, currentColor 8%, transparent);
  --grid-origin: color-mix(in srgb, currentColor 3%, transparent);
  --grid-warning: #8a5a00;
  --grid-error: #b42318;
  --adoc-hl-delimiter: #c586c0;
  --adoc-hl-cell: #d19a66;
  --adoc-hl-attribute: #4ec9b0;
  --adoc-hl-span: #b5cea8;
  --adoc-hl-link: #4daafc;
  --adoc-hl-strong: #dcdcaa;
  --adoc-hl-emphasis: #9cdcfe;
  --adoc-hl-mono: #ce9178;
}
[hidden] {
  display: none !important;
}
body {
  margin: 0;
  font-family: var(--table-editor-font-family);
  color: var(--table-editor-foreground);
  background: var(--table-editor-background);
  overflow: hidden;
}
.shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--grid-border);
  background: var(--table-editor-sidebar-background);
  min-width: 0;
  overflow: hidden;
}
.title {
  flex: 0 1 auto;
  min-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
.status {
  flex: 1 1 120px;
  min-width: 0;
  overflow: hidden;
  text-align: right;
  text-overflow: ellipsis;
  font-size: 12px;
  color: var(--table-editor-description-foreground);
  white-space: nowrap;
}
.command-bar {
  display: flex;
  align-items: center;
  flex: 0 1 auto;
  gap: 6px;
  min-width: 0;
  overflow-x: auto;
}
.toolbar-button {
  min-width: 32px;
  min-height: 28px;
  padding: 3px 8px;
  color: var(--table-editor-secondary-button-foreground);
  background: var(--table-editor-secondary-button-background);
  border: 1px solid var(--grid-border);
  border-radius: 3px;
  font: inherit;
  white-space: nowrap;
}
.toolbar-button.icon-button {
  display: inline-grid;
  place-items: center;
  width: 32px;
  padding: 3px;
}
.toolbar-button.icon-label-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}
.toolbar-button svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  stroke: currentColor;
}
.toolbar-button:focus {
  outline: 1px solid var(--table-editor-focus-border);
  outline-offset: 1px;
}
.mode-toggle,
.tab-list {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--grid-border);
  border-radius: 3px;
  overflow: hidden;
}
.mode-toggle button,
.tab-list button {
  min-height: 28px;
  padding: 3px 9px;
  color: var(--table-editor-secondary-button-foreground);
  background: var(--table-editor-secondary-button-background);
  border: 0;
  border-right: 1px solid var(--grid-border);
  font: inherit;
}
.mode-toggle button,
.tab-list button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  padding: 5px 9px;
}
.mode-toggle svg,
.tab-list svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
}
.mode-toggle button:last-child,
.tab-list button:last-child {
  border-right: 0;
}
.mode-toggle button[aria-pressed="true"],
.tab-list button[aria-selected="true"] {
  color: var(--table-editor-button-foreground);
  background: var(--table-editor-button-background);
}
.context-menu {
  position: fixed;
  z-index: 10;
  display: none;
  min-width: 190px;
  padding: 4px 0;
  color: var(--vscode-menu-foreground, var(--table-editor-foreground));
  background: var(--vscode-menu-background, var(--vscode-editorWidget-background, var(--table-editor-background)));
  border: 1px solid var(--vscode-menu-border, var(--grid-border));
  box-shadow: 0 4px 12px rgb(0 0 0 / 30%);
}
.context-menu.is-open {
  display: block;
}
.context-menu button {
  display: block;
  width: 100%;
  min-height: 28px;
  padding: 4px 12px;
  color: inherit;
  background: transparent;
  border: 0;
  font: inherit;
  text-align: left;
}
.context-menu button:hover,
.context-menu button:focus {
  color: var(--vscode-menu-selectionForeground, var(--vscode-list-activeSelectionForeground, var(--table-editor-button-foreground)));
  background: var(--vscode-menu-selectionBackground, var(--vscode-list-activeSelectionBackground, var(--table-editor-button-background)));
  outline: none;
}
.context-menu .separator {
  height: 1px;
  margin: 4px 0;
  background: var(--grid-border);
}
.grid-wrap {
  box-sizing: border-box;
  height: 100%;
  overflow: auto;
  padding: 12px;
  min-height: 0;
  min-width: 0;
  overscroll-behavior: contain;
}
.workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 300px);
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
`;
}
