export function renderFormatReviewStyles(): string {
  return String.raw`.format-review {
  box-sizing: border-box;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 12px;
  height: 100%;
  overflow: hidden;
  min-height: 0;
  min-width: 0;
  padding: 12px;
  background: var(--table-editor-background);
}
.format-review > div:first-child {
  min-width: 0;
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
  min-width: 0;
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
  min-height: 0;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--grid-border);
  background: var(--table-editor-code-background);
  font-family: var(--table-editor-editor-font-family);
  white-space: pre;
  overscroll-behavior: contain;
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
  min-width: 0;
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
`;
}
