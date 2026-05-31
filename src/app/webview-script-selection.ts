export function renderWebviewSelectionScript(): string {
  return `        const clearRangeSelection = () => {
          for (const current of document.querySelectorAll(".cell.is-range-selected")) {
            current.classList.remove("is-range-selected");
          }
        };
        const rangeBounds = (startCell, endCell) => {
          const startRow = Number(startCell.dataset.row || "0");
          const startCol = Number(startCell.dataset.col || "0");
          const endRow = Number(endCell.dataset.row || "0");
          const endCol = Number(endCell.dataset.col || "0");
          return {
            top: Math.min(startRow, endRow),
            bottom: Math.max(startRow, endRow),
            left: Math.min(startCol, endCol),
            right: Math.max(startCol, endCol)
          };
        };
        const cellsInRange = (startCell, endCell) => {
          const bounds = rangeBounds(startCell, endCell);
          const cells = [];
          for (let row = bounds.top; row <= bounds.bottom; row += 1) {
            for (let col = bounds.left; col <= bounds.right; col += 1) {
              const cell = cellAt(row, col);
              if (cell) {
                cells.push(cell);
              }
            }
          }
          return cells;
        };
        const validatePlainRange = (cells) => {
          if (cells.length === 0) {
            return false;
          }
          const sourceIds = new Set();
          for (const cell of cells) {
            if (!isPlainPasteTarget(cell)) {
              return false;
            }
            const sourceCellId = cell.dataset.sourceCellId || "";
            if (sourceIds.has(sourceCellId)) {
              return false;
            }
            sourceIds.add(sourceCellId);
          }
          return true;
        };
        const selectedStyleSourceCellIds = () => {
          if (!selectedCell) {
            return null;
          }
          const rangeCells = selectedRangeCells();
          const targets = rangeCells.length > 0 ? rangeCells : [selectedCell];
          if (!validatePlainRange(targets)) {
            showClipboardDiagnostic(labels.styleEditBlockedPlainRange);
            return null;
          }
          return targets.map((target) => target.dataset.sourceCellId || "");
        };
        const mergeSourceCellIdsForRange = (cells) => {
          if (cells.length === 0) {
            return null;
          }
          const sourceIds = new Set();
          const result = [];
          for (const cell of cells) {
            if (!isEditableOriginCell(cell)) {
              return null;
            }
            const sourceCellId = cell.dataset.sourceCellId || "";
            if (!sourceIds.has(sourceCellId)) {
              sourceIds.add(sourceCellId);
              result.push(sourceCellId);
            }
          }
          return result;
        };
        const selectedRangeCells = () => rangeAnchorCell && selectedCell && rangeAnchorCell !== selectedCell
          ? cellsInRange(rangeAnchorCell, selectedCell)
          : [];
        const renderRangeSelection = () => {
          clearRangeSelection();
          for (const cell of selectedRangeCells()) {
            cell.classList.add("is-range-selected");
          }
        };
        const focusCellWithoutSelectionReset = (cell) => {
          suppressNextFocusSelection = true;
          cell.focus();
          suppressNextFocusSelection = false;
        };
        let mouseRangeSelecting = false;
        let mouseRangeMoved = false;
        let suppressClickSelectionAfterMouseRange = false;
        const selectCell = (cell, extendRange = false) => {
          if (editingCell && editingCell !== cell) {
            commitDirectEdit("selection-change");
          }
          if (!extendRange) {
            rangeAnchorCell = cell;
            clearRangeSelection();
          } else if (!rangeAnchorCell) {
            rangeAnchorCell = selectedCell || cell;
          }
          selectedCell = cell;
          for (const current of document.querySelectorAll(".cell.is-selected")) {
            current.classList.remove("is-selected");
            current.setAttribute("aria-selected", "false");
          }
          cell.classList.add("is-selected");
          cell.setAttribute("aria-selected", "true");
          updateField("sourceCellId", cell.dataset.sourceCellId || "");
          updateField("kind", cell.dataset.kind || "");
          updateField("position", labels.row + " " + (Number(cell.dataset.row || "0") + 1) + ", " + labels.column + " " + (Number(cell.dataset.col || "0") + 1));
          updateField("span", (cell.dataset.rowSpan || "1") + " x " + (cell.dataset.colSpan || "1"));
          const readonly = cell.getAttribute("aria-readonly") === "true";
          updateField("readonly", labels.grid + ": " + (readonly ? labels.readonly : labels.editable));
          updateField("content", cell.dataset.content || (cell.dataset.coveredBy ? labels.coveredBy + " " + cell.dataset.coveredBy : ""));
          const editContent = cell.dataset.editContent || cell.dataset.content || "";
          const blockContent = cell.dataset.block === "true";
          const plainEditable = !readonly && !blockContent;
          const blockEditable = blockContent && cell.dataset.kind === "origin";
          const sourceEditable = plainEditable || blockEditable;
          if (editAction) {
            editAction.hidden = true;
          }
          if (contentEditorLabel) {
            contentEditorLabel.textContent = blockEditable ? labels.blockSource : labels.editContent;
          }
          if (contentEditor) {
            contentEditor.value = editContent;
            contentEditor.disabled = !sourceEditable;
          }
          if (applyButton) {
            applyButton.disabled = !sourceEditable;
            applyButton.dataset.action = blockEditable ? "update-block-cell-source" : "update-cell-content";
            applyButton.textContent = blockEditable ? labels.applyBlockSource : labels.applyCellContent;
          }
          updateCellEditorField("sourceCellId", cell.dataset.sourceCellId || "");
          updateCellEditorField("position", labels.row + " " + (Number(cell.dataset.row || "0") + 1) + ", " + labels.column + " " + (Number(cell.dataset.col || "0") + 1));
          updateCellEditorField("state", (cell.dataset.rowSpan || "1") + " x " + (cell.dataset.colSpan || "1") + " / " + (blockEditable ? labels.blockSource : plainEditable ? labels.editable : labels.readonly));
          if (blockEditAction) {
            blockEditAction.hidden = !blockContent;
          }
          if (blockPreviewPane) {
            blockPreviewPane.innerHTML = blockContent ? cell.dataset.blockPreviewHtml || "" : "";
          }
          setBlockInspectorTab("preview");
          if (extendRange) {
            renderRangeSelection();
          }
        };
        const beginMouseRangeSelection = (cell, event) => {
          if (editorMode !== "edit" || event.button !== 0 || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey || editingCell) {
            return false;
          }
          mouseRangeSelecting = true;
          mouseRangeMoved = false;
          selectCell(cell);
          focusCellWithoutSelectionReset(cell);
          event.preventDefault();
          return true;
        };
        const extendMouseRangeSelection = (cell, event) => {
          if (!mouseRangeSelecting || editorMode !== "edit") {
            return;
          }
          if (cell !== selectedCell) {
            mouseRangeMoved = true;
            selectCell(cell, true);
            focusCellWithoutSelectionReset(cell);
          }
          event.preventDefault();
        };
        const endMouseRangeSelection = () => {
          if (!mouseRangeSelecting) {
            return;
          }
          suppressClickSelectionAfterMouseRange = mouseRangeMoved;
          mouseRangeSelecting = false;
          mouseRangeMoved = false;
        };
        const isEditableOriginCell = (cell) => Boolean(cell && cell.dataset.kind === "origin" && cell.getAttribute("aria-readonly") !== "true");
        const isPlainPasteTarget = (cell) => isEditableOriginCell(cell) && cell.dataset.rowSpan === "1" && cell.dataset.colSpan === "1";
        const gridCells = () => Array.from(document.querySelectorAll(".cell"));
        const editableCells = () => Array.from(document.querySelectorAll(".cell")).filter(isEditableOriginCell);
        const cellAt = (row, col) => gridCells().find((cell) => {
          const cellRow = Number(cell.dataset.row || "0");
          const cellCol = Number(cell.dataset.col || "0");
          const rowSpan = Number(cell.dataset.rowSpan || "1");
          const colSpan = Number(cell.dataset.colSpan || "1");
          return row >= cellRow && row < cellRow + rowSpan && col >= cellCol && col < cellCol + colSpan;
        }) || null;
        const moveSelection = (direction, extendRange = false) => {
          if (!selectedCell) {
            return;
          }
          const cells = gridCells();
          const row = Number(selectedCell.dataset.row || "0");
          const col = Number(selectedCell.dataset.col || "0");
          const rowSpan = Number(selectedCell.dataset.rowSpan || "1");
          const colSpan = Number(selectedCell.dataset.colSpan || "1");
          const index = cells.indexOf(selectedCell);
          const target = direction === "left"
            ? cellAt(row, col - 1)
            : direction === "right"
              ? cellAt(row, col + colSpan)
              : direction === "up"
                ? cellAt(row - 1, col)
                : direction === "down"
                  ? cellAt(row + rowSpan, col)
                  : direction === "previous"
                    ? cells[index - 1] || null
                    : cells[index + 1] || null;
          if (target) {
            selectCell(target, extendRange);
            focusCellWithoutSelectionReset(target);
          }
        };
        const nextEditableCell = (cell, direction) => {
          const cells = editableCells();
          if (direction === "row") {
            const row = Number(cell.dataset.row || "0");
            const col = Number(cell.dataset.col || "0");
            return cells.find((candidate) => Number(candidate.dataset.row || "0") > row && Number(candidate.dataset.col || "0") === col) || null;
          }
          const index = cells.indexOf(cell);
          return index >= 0 ? cells[index + 1] || null : null;
        };
        const directEditValue = (cell) => cell?.textContent || "";
        const contentForClipboard = (cell) => cell?.dataset.content || "";
        const selectedClipboardText = () => {
          const rangeCells = selectedRangeCells();
          if (rangeCells.length === 0) {
            return contentForClipboard(selectedCell);
          }
          if (!validatePlainRange(rangeCells)) {
            showClipboardDiagnostic(labels.copyBlockedPlainRange);
            return null;
          }
          const bounds = rangeBounds(rangeAnchorCell, selectedCell);
          const rows = [];
          for (let row = bounds.top; row <= bounds.bottom; row += 1) {
            const values = [];
            for (let col = bounds.left; col <= bounds.right; col += 1) {
              values.push(contentForClipboard(cellAt(row, col)));
            }
            rows.push(values.join("\\t"));
          }
          return rows.join("\\n");
        };
        const selectedMergeSourceCellIds = () => {
          const rangeCells = selectedRangeCells();
          if (rangeCells.length < 2) {
            showClipboardDiagnostic(labels.mergeBlockedTooSmall);
            return null;
          }
          const sourceCellIds = mergeSourceCellIdsForRange(rangeCells);
          if (!sourceCellIds) {
            showClipboardDiagnostic(labels.mergeBlockedPlainRange);
            return null;
          }
          if (sourceCellIds.length < 2) {
            showClipboardDiagnostic(labels.mergeBlockedTooSmall);
            return null;
          }
          return sourceCellIds;
        };
        const selectedUnmergeSourceCellId = () => {
          if (!selectedCell || selectedCell.dataset.kind !== "origin") {
            showClipboardDiagnostic(labels.unmergeBlockedOrigin);
            return null;
          }
          if (Number(selectedCell.dataset.colSpan || "1") <= 1 && Number(selectedCell.dataset.rowSpan || "1") <= 1) {
            showClipboardDiagnostic(labels.unmergeBlockedNotMerged);
            return null;
          }
          return selectedCell.dataset.sourceCellId || "";
        };
        const clearSelectedCells = () => {
          if (!selectedCell) {
            return;
          }
          const rangeCells = selectedRangeCells();
          const targets = rangeCells.length > 0 ? rangeCells : [selectedCell];
          if (!validatePlainRange(targets)) {
            showClipboardDiagnostic(labels.clearBlockedPlainRange);
            return;
          }
          const replacements = targets.map((target) => ({
            sourceCellId: target.dataset.sourceCellId || "",
            contentRaw: target.dataset.leading || " "
          }));
          postSourceMessage({
            type: "update-cell-contents",
            replacements,
            selectedSourceCellId: selectedCell.dataset.sourceCellId || "",
            reason: "clear"
          });
        };
`;
}
