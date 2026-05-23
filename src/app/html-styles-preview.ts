export function renderPreviewStyles(): string {
  return String.raw`.preview-screen {
  box-sizing: border-box;
  height: 100%;
  overflow: auto;
  min-height: 0;
  min-width: 0;
  padding: 22px 28px;
  background: var(--table-editor-background);
  overscroll-behavior: contain;
}
.preview-pane {
  box-sizing: border-box;
  width: max-content;
  min-width: min(100%, 1040px);
  max-width: none;
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
  max-width: none;
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
`;
}
