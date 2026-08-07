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
          label: element.classList.contains("cell")
            ? (element.dataset.sourceCellId || "cell-" + index)
            : (element.getAttribute("aria-label") || element.textContent.trim()),
          visible: Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length),
          disabled: element.getAttribute("aria-readonly") === "true" || element.getAttribute("aria-disabled") === "true" || Boolean(element.disabled),
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
        let currentRevisionToken = initialRevisionToken;
        let activeOperationId = null;
        let mutationOperationSequence = 0;
        let mutationSessionBlocked = false;
        const mutationControlState = new Map();
        const mutationCellReadonlyState = new Map();
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
        const localizedDiagnosticMessage = (code) => Object.prototype.hasOwnProperty.call(labels.diagnosticMessages || {}, code)
          ? labels.diagnosticMessages[code]
          : labels.unknownDiagnosticMessage;
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
            ? formatStatusTemplate(labels.operationBlockedMessage, { operation, message: localizedDiagnosticMessage(diagnostic.code), code: diagnostic.code })
            : formatStatusTemplate(labels.operationBlockedWithoutDetailMessage, { operation }));
        };
        const sourceMutationControls = () => Array.from(document.querySelectorAll([
          "[data-source-action='true']",
          "[data-inspector-control='contentRaw']",
          "[data-cell-editor-action='apply']",
          "[data-action='undo-table-edit']",
          "[data-action='redo-table-edit']",
          "[data-action='apply-format-table']",
          "[data-action='apply-column-spec']",
          "[data-action='apply-table-appearance']",
          "[data-context-menu='cell'] button[data-action]"
        ].join(", "))).filter((element) => "disabled" in element);
        const setMutationBusy = (busy) => {
          const shell = document.querySelector("[data-review-target='shell']");
          shell?.setAttribute("aria-busy", busy ? "true" : "false");
          if (busy) {
            for (const control of sourceMutationControls()) {
              if (!mutationControlState.has(control)) {
                mutationControlState.set(control, {
                  disabled: Boolean(control.disabled),
                  ariaDisabled: control.getAttribute("aria-disabled")
                });
              }
              control.disabled = true;
              control.setAttribute("aria-disabled", "true");
            }
            for (const cell of document.querySelectorAll(".cell[data-kind='origin']")) {
              if (!mutationCellReadonlyState.has(cell)) {
                mutationCellReadonlyState.set(cell, cell.getAttribute("aria-readonly"));
              }
              cell.setAttribute("aria-readonly", "true");
            }
            grid?.setAttribute("aria-readonly", "true");
            setStatusMessage(labels.operationInProgressMessage);
            return;
          }
          for (const [control, state] of mutationControlState) {
            control.disabled = state.disabled;
            if (state.ariaDisabled === null) {
              control.removeAttribute("aria-disabled");
            } else {
              control.setAttribute("aria-disabled", state.ariaDisabled);
            }
          }
          mutationControlState.clear();
          for (const [cell, readonly] of mutationCellReadonlyState) {
            if (readonly === null) {
              cell.removeAttribute("aria-readonly");
            } else {
              cell.setAttribute("aria-readonly", readonly);
            }
          }
          mutationCellReadonlyState.clear();
          if (!mutationSessionBlocked && editorMode === "edit") {
            grid?.setAttribute("aria-readonly", "false");
          }
        };
        const blockMutationSession = () => {
          mutationSessionBlocked = true;
          for (const control of sourceMutationControls()) {
            control.disabled = true;
            control.setAttribute("aria-disabled", "true");
          }
          for (const cell of document.querySelectorAll(".cell[data-kind='origin']")) {
            cell.setAttribute("aria-readonly", "true");
          }
          grid?.setAttribute("aria-readonly", "true");
        };
        const isSourceMutationUnavailable = () => activeOperationId !== null || mutationSessionBlocked;
        const isBlockingMutationFailure = (result) => {
          const blockingCodes = new Set([
            "writeback.apply-raced",
            "writeback.revision-mismatch",
            "writeback.document-replaced",
            "writeback.table-not-found",
            "writeback.table-ambiguous",
            "writeback.table-changed",
            "writeback.expected-raw-mismatch"
          ]);
          return Array.isArray(result?.diagnostics) &&
            result.diagnostics.some((diagnostic) => blockingCodes.has(diagnostic?.code));
        };
        const acceptMutationResult = (message) => {
          if (!activeOperationId || message.operationId !== activeOperationId) {
            return false;
          }
          if (typeof message.revisionToken !== "string" || message.revisionToken.length === 0 ||
              !Number.isInteger(message.documentVersion) || message.documentVersion < 0 ||
              typeof message.result !== "object" || message.result === null ||
              typeof message.result.ok !== "boolean") {
            return false;
          }
          activeOperationId = null;
          if (message.result.ok) {
            currentRevisionToken = message.revisionToken;
          }
          const blocked = !message.result?.ok && isBlockingMutationFailure(message.result);
          setMutationBusy(false);
          if (blocked) {
            blockMutationSession();
          }
          return true;
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
          if (isSourceMutationUnavailable()) {
            return false;
          }
          persistGridState(options.gridState);
          mutationOperationSequence += 1;
          const operationId = globalThis.crypto?.randomUUID?.() ||
            "operation-" + Date.now() + "-" + mutationOperationSequence + "-" + Math.random().toString(36).slice(2);
          activeOperationId = operationId;
          setMutationBusy(true);
          vscode.postMessage({ ...message, operationId, revisionToken: currentRevisionToken });
          return true;
        };
`;
}
