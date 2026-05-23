export function renderFeedbackStyles(): string {
  return String.raw`.block-preview-pane {
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
