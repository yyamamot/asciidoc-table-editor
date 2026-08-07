export function renderGridStyles(model: { columnCount: number }): string {
  return String.raw`.grid {
  display: grid;
  grid-template-columns: repeat(${Math.max(model.columnCount, 1)}, minmax(96px, max-content));
  width: max-content;
  min-width: 100%;
  border-top: 1px solid var(--grid-border);
  border-left: 1px solid var(--grid-border);
}
.grid-row {
  display: contents;
}
.grid-selection-status {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
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
`;
}
