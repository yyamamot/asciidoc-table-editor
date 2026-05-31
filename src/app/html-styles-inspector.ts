export function renderInspectorStyles(): string {
  return String.raw`.inspector {
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
  min-height: 0;
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
.table-settings {
  display: grid;
  gap: 6px;
  padding-top: 8px;
  padding-right: 8px;
  border-top: 1px solid var(--grid-border);
}
.table-settings details {
  box-sizing: border-box;
  border: 1px solid var(--grid-border);
  border-radius: 3px;
  background: color-mix(in srgb, var(--table-editor-background) 78%, transparent);
}
.table-settings summary {
  min-height: 28px;
  padding: 5px 7px;
  cursor: pointer;
  color: var(--table-editor-foreground);
  font-weight: 600;
}
.table-settings summary:focus {
  outline: 1px solid var(--table-editor-focus-border);
  outline-offset: -1px;
}
.table-settings details[open] summary {
  border-bottom: 1px solid var(--grid-border);
}
.table-settings h3 {
  margin: 0;
  font-size: 12px;
}
.settings-grid {
  display: grid;
  gap: 6px;
  padding: 8px;
}
.settings-grid label {
  display: grid;
  gap: 3px;
  color: var(--table-editor-description-foreground);
}
.settings-grid .checkbox-label {
  grid-template-columns: auto 1fr;
  align-items: center;
  column-gap: 8px;
  min-height: 30px;
}
.settings-grid input,
.settings-grid select {
  box-sizing: border-box;
  width: 100%;
  min-height: 26px;
  color: var(--table-editor-input-foreground);
  background: var(--table-editor-input-background);
  border: 1px solid var(--vscode-input-border, var(--grid-border));
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
`;
}
