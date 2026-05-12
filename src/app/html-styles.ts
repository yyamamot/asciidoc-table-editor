export function renderTableEditorStyles(model: { columnCount: number }): string {
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
  min-height: 100vh;
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
  overflow: auto;
  padding: 12px;
  min-width: 0;
}
.workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 300px);
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
.preview-screen {
  overflow: auto;
  min-height: 0;
  padding: 22px 28px;
  background: var(--table-editor-background);
}
.preview-pane {
  box-sizing: border-box;
  width: min(100%, 1040px);
  min-height: 100%;
  margin: 0 auto;
  padding: 4px 0 40px;
  color: var(--table-editor-foreground);
  background: var(--table-editor-background);
  font-size: var(--vscode-editor-font-size, 13px);
  line-height: 1.55;
}
.preview-pane table {
  border-collapse: collapse;
  width: auto;
  max-width: 100%;
  margin: 0 0 16px;
}
.preview-pane th,
.preview-pane td {
  padding: 8px 10px;
  border: 1px solid var(--grid-border);
  vertical-align: top;
}
.preview-pane th {
  font-weight: 600;
  background: color-mix(in srgb, currentColor 5%, transparent);
}
.preview-pane .halign-left {
  text-align: left;
}
.preview-pane .halign-center {
  text-align: center;
}
.preview-pane .halign-right {
  text-align: right;
}
.preview-pane .valign-top {
  vertical-align: top;
}
.preview-pane .valign-middle {
  vertical-align: middle;
}
.preview-pane .valign-bottom {
  vertical-align: bottom;
}
.preview-pane p {
  margin: 0 0 12px;
}
.preview-pane ul,
.preview-pane ol {
  margin: 0 0 12px 1.4em;
  padding: 0;
}
.preview-pane li + li {
  margin-top: 3px;
}
.preview-pane pre,
.preview-pane code {
  font-family: var(--table-editor-editor-font-family);
}
.preview-pane pre {
  overflow: auto;
  padding: 10px;
  border: 1px solid var(--grid-border);
  background: var(--table-editor-code-background);
}
.format-review {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 12px;
  overflow: hidden;
  min-height: 0;
  padding: 12px;
  background: var(--table-editor-background);
}
.format-review-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0;
  color: var(--table-editor-description-foreground);
  font-size: 12px;
}
.format-review-summary strong {
  color: var(--table-editor-foreground);
}
.format-review-diff {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  overflow: hidden;
  min-height: 0;
}
.format-review-pane {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
}
.format-review-pane h3 {
  margin: 0 0 6px;
  font-size: 12px;
}
.format-review-pane pre {
  overflow: auto;
  margin: 0;
  padding: 8px;
  border: 1px solid var(--grid-border);
  background: var(--table-editor-code-background);
  font-family: var(--table-editor-editor-font-family);
  white-space: pre;
}
.format-review-line {
  display: block;
  min-height: 1lh;
}
.format-review-line.is-changed {
  background: color-mix(in srgb, var(--table-editor-focus-border) 20%, transparent);
  box-shadow: inset 3px 0 0 var(--table-editor-focus-border);
}
.adoc-hl {
  font: inherit;
}
.adoc-hl-delimiter,
.adoc-hl-cell {
  color: var(--adoc-hl-cell);
  font-weight: 600;
}
.adoc-hl-delimiter {
  color: var(--adoc-hl-delimiter);
}
.adoc-hl-attribute {
  color: var(--adoc-hl-attribute);
}
.adoc-hl-span,
.adoc-hl-style {
  color: var(--adoc-hl-span);
}
.adoc-hl-link {
  color: var(--adoc-hl-link);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.adoc-hl-strong {
  color: var(--adoc-hl-strong);
  font-weight: 600;
}
.adoc-hl-emphasis {
  color: var(--adoc-hl-emphasis);
  font-style: italic;
}
.adoc-hl-mono {
  color: var(--adoc-hl-mono);
}
.format-review-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.format-review-actions button {
  min-height: 30px;
  padding: 4px 10px;
  border: 1px solid var(--grid-border);
  border-radius: 3px;
  font: inherit;
}
.format-review-actions [data-action="apply-format-table"] {
  color: var(--table-editor-button-foreground);
  background: var(--table-editor-button-background);
  border-color: transparent;
}
.grid {
  display: grid;
  grid-template-columns: repeat(${Math.max(model.columnCount, 1)}, minmax(96px, max-content));
  width: max-content;
  min-width: 100%;
  border-top: 1px solid var(--grid-border);
  border-left: 1px solid var(--grid-border);
}
.cell {
  position: relative;
  min-height: 34px;
  padding: 7px 9px;
  border-right: 1px solid var(--grid-border);
  border-bottom: 1px solid var(--grid-border);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--grid-origin);
  outline: none;
}
.cell:focus,
.cell.is-selected {
  box-shadow: inset 0 0 0 2px var(--table-editor-focus-border);
}
.cell.is-range-selected {
  background: color-mix(in srgb, var(--vscode-list-activeSelectionBackground, #0969da) 52%, var(--grid-origin));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--table-editor-focus-border) 70%, white);
}
.cell.is-range-selected.is-selected {
  box-shadow: inset 0 0 0 2px var(--table-editor-focus-border), inset 0 0 0 999px color-mix(in srgb, var(--table-editor-focus-border) 12%, transparent);
}
.cell.is-editing {
  color: var(--table-editor-input-foreground);
  background: var(--table-editor-input-background);
  box-shadow: inset 0 0 0 2px var(--table-editor-focus-border);
  cursor: text;
}
.cell[data-spanned="true"] {
  background: color-mix(in srgb, var(--vscode-list-inactiveSelectionBackground, currentColor) 18%, var(--grid-origin));
  outline: 1px solid color-mix(in srgb, var(--table-editor-focus-border) 55%, var(--grid-border));
  outline-offset: -1px;
}
.cell[data-horizontal-align="left"] {
  text-align: left;
}
.cell[data-horizontal-align="center"] {
  text-align: center;
}
.cell[data-horizontal-align="right"] {
  text-align: right;
}
.cell[data-vertical-align="top"] {
  align-content: start;
}
.cell[data-vertical-align="middle"] {
  align-content: center;
}
.cell[data-vertical-align="bottom"] {
  align-content: end;
}
.cell[data-style="m"],
.cell[data-style="l"] {
  font-family: var(--table-editor-editor-font-family);
}
.cell[data-style="s"],
.cell[data-style="h"] {
  font-weight: 600;
}
.cell[data-style="e"] {
  font-style: italic;
}
.cell[data-style="h"] {
  background: color-mix(in srgb, var(--table-editor-focus-border) 16%, var(--grid-origin));
}
.cell[data-block="true"] {
  font-family: var(--table-editor-editor-font-family);
  padding-top: 18px;
}
.cell-badge {
  position: absolute;
  top: 3px;
  right: 4px;
  display: inline-grid;
  place-items: center;
  min-width: 24px;
  height: 14px;
  padding: 0 3px;
  border: 1px solid color-mix(in srgb, var(--table-editor-focus-border) 58%, var(--grid-border));
  border-radius: 3px;
  color: var(--table-editor-description-foreground);
  background: color-mix(in srgb, var(--table-editor-sidebar-background) 84%, var(--grid-origin));
  font-family: var(--table-editor-editor-font-family);
  font-size: 9px;
  line-height: 1;
}
.cell[data-row-role="header"],
.cell[data-row-role="footer"] {
  font-weight: 600;
  background: color-mix(in srgb, var(--table-editor-focus-border) 16%, var(--grid-origin));
  box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--table-editor-focus-border) 44%, var(--grid-border));
}
.cell[data-row-role="footer"] {
  background: color-mix(in srgb, var(--table-editor-description-foreground) 13%, var(--grid-origin));
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--table-editor-description-foreground) 46%, var(--grid-border));
}
.fallback-guidance {
  display: grid;
  gap: 6px;
  max-width: min(680px, 100%);
  margin: 8px 0 12px;
  padding: 10px 12px;
  border: 1px solid var(--grid-border);
  border-left: 3px solid var(--table-editor-focus-border);
  background: color-mix(in srgb, var(--table-editor-sidebar-background) 88%, var(--grid-origin));
}
.fallback-guidance span {
  color: var(--table-editor-description-foreground);
}
.fallback-guidance button {
  justify-self: start;
  min-height: 26px;
  padding: 3px 8px;
  color: var(--table-editor-button-foreground);
  background: var(--table-editor-button-background);
  border: 1px solid transparent;
  border-radius: 3px;
}
.inspector {
  display: grid;
  align-content: start;
  gap: 8px;
  box-sizing: border-box;
  width: 100%;
  overflow: auto;
  padding: 12px;
  border-left: 1px solid var(--grid-border);
  background: var(--table-editor-sidebar-background);
  font-size: 12px;
  min-width: 0;
}
.inspector h2 {
  margin: 0;
  font-size: 13px;
}
.inspector dl {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 6px 10px;
  margin: 0;
}
.inspector dt {
  color: var(--table-editor-description-foreground);
}
.inspector dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.inspector textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 72px;
  resize: vertical;
  font-family: var(--table-editor-editor-font-family);
  color: var(--table-editor-input-foreground);
  background: var(--table-editor-input-background);
  border: 1px solid var(--vscode-input-border, var(--grid-border));
  padding: 6px;
}
.inspector label:has([hidden]) {
  display: none;
}
.inspector button {
  width: 100%;
  min-height: 28px;
  color: var(--table-editor-button-foreground);
  background: var(--table-editor-button-background);
  border: 1px solid transparent;
}
.inspector button:disabled,
.inspector textarea:disabled {
  opacity: 0.6;
}
.cell-editor-bar {
  display: grid;
  grid-template-columns: minmax(112px, 0.2fr) minmax(180px, 1fr) minmax(128px, auto);
  gap: 10px;
  align-items: end;
  padding: 10px 12px;
  border-top: 1px solid var(--grid-border);
  background: var(--table-editor-sidebar-background);
  min-width: 0;
}
.cell-editor-meta {
  display: grid;
  gap: 2px;
  min-width: 0;
  font-size: 12px;
  color: var(--table-editor-description-foreground);
}
.cell-editor-meta strong {
  overflow: hidden;
  color: var(--table-editor-foreground);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell-editor-bar label {
  display: grid;
  gap: 3px;
  min-width: 0;
  font-size: 12px;
  color: var(--table-editor-description-foreground);
}
.cell-editor-bar textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 72px;
  max-height: 180px;
  resize: vertical;
  font-family: var(--table-editor-editor-font-family);
  color: var(--table-editor-input-foreground);
  background: var(--table-editor-input-background);
  border: 1px solid var(--vscode-input-border, var(--grid-border));
  padding: 6px;
}
.cell-editor-bar button {
  min-width: 110px;
  min-height: 40px;
  color: var(--table-editor-button-foreground);
  background: var(--table-editor-button-background);
  border: 1px solid transparent;
  border-radius: 3px;
  font: inherit;
}
@media (max-width: 960px) {
  .cell-editor-bar {
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
  }
  .cell-editor-bar button {
    width: 100%;
  }
}
.cell-editor-bar button:disabled,
.cell-editor-bar textarea:disabled {
  opacity: 0.6;
}
.block-preview-pane {
  min-height: 72px;
  padding: 6px;
  border: 1px solid var(--grid-border);
  background: var(--table-editor-background);
}
.diagnostics {
  display: grid;
  gap: 4px;
  padding: 8px 12px;
  border-top: 1px solid var(--grid-border);
  font-size: 12px;
  background: var(--table-editor-panel-background);
}
.diagnostics:empty {
  display: none;
}
@media (max-width: 720px) {
  .toolbar {
    align-items: flex-start;
  }
  .command-bar {
    overflow-x: auto;
    padding-bottom: 2px;
  }
  .status {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .workspace {
    grid-template-columns: minmax(0, 1fr);
  }
  .format-review-diff {
    grid-template-columns: minmax(0, 1fr);
  }
  .inspector {
    border-left: 0;
    border-top: 1px solid var(--grid-border);
  }
  .cell-editor-bar {
    grid-template-columns: minmax(0, 1fr);
  }
}
.diagnostic[data-severity="error"] {
  color: var(--grid-error);
}
.diagnostic[data-severity="warning"] {
  color: var(--grid-warning);
}
`;
}
