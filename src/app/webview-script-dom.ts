export function renderWebviewDomScript(): string {
  return `        const rectFor = (element) => {
          const rect = element.getBoundingClientRect();
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            left: rect.left
          };
        };
        const elementFor = (element, index) => ({
          reviewId: element.dataset.reviewTarget || element.dataset.sourceCellId || "cell-" + index,
          tagName: element.tagName,
          role: element.getAttribute("role") || "",
          label: element.getAttribute("aria-label") || element.textContent.trim(),
          visible: Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length),
          disabled: element.getAttribute("aria-readonly") === "true",
          action: element.dataset.action,
          rect: rectFor(element),
          scrollWidth: element.scrollWidth,
          scrollHeight: element.scrollHeight,
          clientWidth: element.clientWidth,
          clientHeight: element.clientHeight
        });
        const inspectorFields = {
          sourceCellId: document.querySelector("[data-inspector-field='sourceCellId']"),
          kind: document.querySelector("[data-inspector-field='kind']"),
          position: document.querySelector("[data-inspector-field='position']"),
          span: document.querySelector("[data-inspector-field='span']"),
          readonly: document.querySelector("[data-inspector-field='readonly']"),
          content: document.querySelector("[data-inspector-field='content']")
        };
        const contentEditor = document.querySelector("[data-inspector-control='contentRaw']");
        const contentEditorLabel = document.querySelector("[data-cell-editor-label='content']");
        const applyButton = document.querySelector("[data-cell-editor-action='apply']");
        const editAction = document.querySelector("[data-inspector-action='edit-cell']");
        const cellEditorFields = {
          sourceCellId: document.querySelector("[data-cell-editor-field='sourceCellId']"),
          position: document.querySelector("[data-cell-editor-field='position']"),
          state: document.querySelector("[data-cell-editor-field='state']")
        };
        const blockEditAction = document.querySelector("[data-inspector-action='edit-block-cell']");
        const undoButton = document.querySelector("[data-action='undo-table-edit']");
        const redoButton = document.querySelector("[data-action='redo-table-edit']");
        const contextMenu = document.querySelector("[data-context-menu='cell']");
        const mergeButton = document.querySelector("[data-action='merge-cells']");
        const unmergeButton = document.querySelector("[data-action='unmerge-cell']");
        const formatTableButton = document.querySelector("[data-action='format-table']");
        const cellStyleButtons = Array.from(document.querySelectorAll("[data-action^='cell-align-']"));
        const cellStyleSelect = document.querySelector("[data-action='cell-style-select']");
        const applyColumnSpecButton = document.querySelector("[data-action='apply-column-spec']");
        const applyTableAppearanceButton = document.querySelector("[data-action='apply-table-appearance']");
        const focusDiagnosticsButton = document.querySelector("[data-action='focus-diagnostics']");
        const diagnostics = document.querySelector("[data-review-target='diagnostics']");
        const gridWrap = document.querySelector(".grid-wrap");
        const grid = document.querySelector("[data-review-target='table-grid']");
        const editorModeButtons = Array.from(document.querySelectorAll("[data-action='set-editor-mode']"));
        const editViews = Array.from(document.querySelectorAll("[data-editor-view='edit']"));
        const previewViews = Array.from(document.querySelectorAll("[data-editor-view='preview']"));
        const formatReviewViews = Array.from(document.querySelectorAll("[data-editor-view='format-review']"));
        const sourceActionButtons = Array.from(document.querySelectorAll("[data-source-action='true']"));
        const applyFormatButton = document.querySelector("[data-action='apply-format-table']");
        const cancelFormatButton = document.querySelector("[data-action='cancel-format-table']");
        const formatModeButtons = Array.from(document.querySelectorAll("[data-action='select-format-mode']"));
        const formatSummaries = Array.from(document.querySelectorAll("[data-format-summary]"));
        const formatAfterPanes = Array.from(document.querySelectorAll("[data-format-review-after]"));
        const blockPreviewPane = document.querySelector("[data-inspector-block-preview]");
        const tablePreviewPane = document.querySelector("[data-review-target='table-preview']");
        const initialState = vscode.getState?.() || {};
        let editorMode = formatReviewViews.length > 0 ? "format-review" : initialState.editorMode === "preview" ? "preview" : "edit";
        let formatMode = typeof initialState.formatMode === "string" ? initialState.formatMode : applyFormatButton?.dataset.formatMode || "table-layout";
        let blockInspectorTab = "preview";
        let selectedCell = null;
        let rangeAnchorCell = null;
        let suppressNextFocusSelection = false;
        let editingCell = null;
        let editingOriginalValue = "";
        let editingGridStateBeforeEdit = null;
        let statusMessageTimer = null;
        const updateField = (name, value) => {
          const field = inspectorFields[name];
          if (field) {
            field.textContent = value;
          }
        };
        const updateCellEditorField = (name, value) => {
          const field = cellEditorFields[name];
          if (field) {
            field.textContent = value;
          }
        };
        const formatStatusTemplate = (template, values) => String(template || "")
          .replaceAll("{operation}", values.operation || "")
          .replaceAll("{message}", values.message || "")
          .replaceAll("{code}", values.code || "");
        const setStatusMessage = (message, options = {}) => {
          if (diagnostics) {
            diagnostics.textContent = message;
            if (statusMessageTimer) {
              window.clearTimeout(statusMessageTimer);
              statusMessageTimer = null;
            }
            if (options.autoClear) {
              statusMessageTimer = window.setTimeout(() => {
                if (diagnostics.textContent === message) {
                  diagnostics.textContent = "";
                }
                statusMessageTimer = null;
              }, options.timeoutMs || 4500);
            }
          }
        };
        const showClipboardDiagnostic = (message, options = {}) => setStatusMessage(message, options);
        const showResultDiagnostic = (operation, result) => {
          if (!diagnostics) {
            return;
          }
          if (result?.ok) {
            setStatusMessage(formatStatusTemplate(labels.operationAppliedMessage, { operation }), { autoClear: true });
            return;
          }
          const diagnostic = result?.diagnostics?.[0];
          setStatusMessage(diagnostic
            ? formatStatusTemplate(labels.operationBlockedMessage, { operation, message: diagnostic.message, code: diagnostic.code })
            : formatStatusTemplate(labels.operationBlockedWithoutDetailMessage, { operation }));
        };
        const displayContentForGridCell = (sourceContent) => {
          let output = "";
          let cursor = 0;
          const pattern = new RegExp("\\\\b(?:https?://[^\\\\s\\\\[]+|mailto:[^\\\\s\\\\[]+)\\\\[([^\\\\]\\\\n]+)\\\\]", "gu");
          for (const match of sourceContent.matchAll(pattern)) {
            const index = match.index || 0;
            output += sourceContent.slice(cursor, index);
            output += (match[1] || "").replace(/\\\]/gu, "]");
            cursor = index + match[0].length;
          }
          return output + sourceContent.slice(cursor);
        };
        const gridColumnCount = () => Array.from(document.querySelectorAll(".cell[data-kind='origin']")).reduce((max, cell) => {
          const col = Number(cell.dataset.col || "0");
          const colSpan = Number(cell.dataset.colSpan || "1");
          return Math.max(max, col + colSpan);
        }, 0);
        const gridRowCount = () => Array.from(document.querySelectorAll(".cell[data-kind='origin']")).reduce((max, cell) => {
          const row = Number(cell.dataset.row || "0");
          const rowSpan = Number(cell.dataset.rowSpan || "1");
          return Math.max(max, row + rowSpan);
        }, 0);
        const cellMeasuredColumnWidths = (columnCount) => {
          const widths = Array.from({ length: columnCount }, () => 0);
          for (const cell of Array.from(document.querySelectorAll(".cell[data-kind='origin']"))) {
            const col = Number(cell.dataset.col || "0");
            const colSpan = Math.max(1, Number(cell.dataset.colSpan || "1"));
            const rectWidth = cell.getBoundingClientRect().width;
            if (!Number.isFinite(rectWidth) || rectWidth <= 0) {
              continue;
            }
            const perColumnWidth = Math.round(rectWidth / colSpan);
            for (let offset = 0; offset < colSpan && col + offset < columnCount; offset += 1) {
              widths[col + offset] = Math.max(widths[col + offset], perColumnWidth);
            }
          }
          return widths.every((width) => width > 0) ? widths : undefined;
        };
        const captureGridState = () => {
          if (!grid) {
            return undefined;
          }
          const columnCount = gridColumnCount();
          const computedColumns = window.getComputedStyle(grid).gridTemplateColumns
            .split(" ")
            .map((value) => Number.parseFloat(value))
            .filter((value) => Number.isFinite(value) && value > 0);
          const columnWidths = computedColumns.length === columnCount
            ? computedColumns
            : cellMeasuredColumnWidths(columnCount);
          if (!columnWidths || columnCount === 0) {
            return undefined;
          }
          return {
            columnCount,
            columnWidths: columnWidths.map((value) => Math.max(96, Math.round(value))),
            scrollLeft: gridWrap?.scrollLeft || 0,
            scrollTop: gridWrap?.scrollTop || 0
          };
        };
        const applyGridState = (gridState) => {
          if (!grid || !gridState || !Array.isArray(gridState.columnWidths)) {
            return;
          }
          if (gridState.columnCount !== gridColumnCount()) {
            return;
          }
          grid.style.gridTemplateColumns = gridState.columnWidths
            .map((width) => Math.max(96, Number(width) || 96) + "px")
            .join(" ");
          requestAnimationFrame(() => {
            if (gridWrap) {
              gridWrap.scrollLeft = Number(gridState.scrollLeft) || 0;
              gridWrap.scrollTop = Number(gridState.scrollTop) || 0;
            }
          });
        };
        const persistUiState = (extraState = {}) => {
          vscode.setState?.({ ...(vscode.getState?.() || {}), editorMode, blockInspectorTab, formatMode, ...extraState });
        };
        const persistGridState = (preferredGridState) => {
          const gridState = preferredGridState || captureGridState();
          if (gridState) {
            persistUiState({ gridState });
          } else {
            persistUiState();
          }
        };
        const postSourceMessage = (message, options = {}) => {
          persistGridState(options.gridState);
          vscode.postMessage(message);
        };
`;
}
