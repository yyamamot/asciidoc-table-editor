export function renderWebviewEditingScript(): string {
  return `        const setCellSourceContent = (cell, contentRaw) => {
          const leading = contentRaw.match(/^[ \t]*/u)?.[0] || "";
          const editContent = contentRaw.slice(leading.length);
          const sourceContent = contentRaw.trimStart();
          cell.dataset.leading = leading;
          cell.dataset.content = contentRaw.trim();
          cell.dataset.editContent = editContent;
          cell.title = contentRaw.trim();
          if (editingCell !== cell) {
            cell.textContent = displayContentForGridCell(sourceContent);
          }
          if (selectedCell === cell) {
            updateField("content", contentRaw.trim());
          }
          if (contentEditor && selectedCell === cell) {
            contentEditor.value = editContent;
          }
        };
        const setInspectorContent = (cell, value) => setCellSourceContent(cell, (cell.dataset.leading || " ") + value);
        const findOriginCellBySourceId = (sourceCellId) => Array.from(document.querySelectorAll(".cell[data-kind='origin']")).find((cell) => cell.dataset.sourceCellId === sourceCellId);
        const applyLocalCellContentUpdate = (applied) => {
          if (!applied || (!applied.sourceCellId && !Array.isArray(applied.replacements))) {
            return;
          }
          if (applied.sourceCellId && typeof applied.contentRaw !== "string") {
            return;
          }
          const cell = findOriginCellBySourceId(applied.sourceCellId || applied.replacements?.[0]?.sourceCellId);
          if (cell && applied.sourceCellId) {
            setCellSourceContent(cell, applied.contentRaw);
          }
          for (const replacement of applied.replacements || []) {
            const target = findOriginCellBySourceId(replacement.sourceCellId);
            if (target) {
              setCellSourceContent(target, replacement.contentRaw);
            }
          }
          if (typeof applied.tablePreviewHtml === "string" && tablePreviewPane) {
            tablePreviewPane.innerHTML = applied.tablePreviewHtml;
          }
          if (typeof applied.blockCellPreviewHtml === "string" && blockPreviewPane) {
            cell.dataset.blockPreviewHtml = applied.blockCellPreviewHtml;
            if (selectedCell === cell) {
              blockPreviewPane.innerHTML = applied.blockCellPreviewHtml;
            }
          }
          const selectedAfterUpdate = applied.selectedSourceCellId
            ? findOriginCellBySourceId(applied.selectedSourceCellId)
            : cell;
          if (selectedAfterUpdate) {
            selectCell(selectedAfterUpdate);
            focusCellWithoutSelectionReset(selectedAfterUpdate);
          }
        };
        const beginDirectEdit = (cell, initialValue) => {
          if (!isEditableOriginCell(cell)) {
            return;
          }
          if (editingCell && editingCell !== cell) {
            commitDirectEdit("new-edit");
          }
          selectCell(cell);
          editingCell = cell;
          editingOriginalValue = cell.dataset.content || "";
          editingGridStateBeforeEdit = captureGridState() || null;
          cell.classList.add("is-editing");
          cell.setAttribute("contenteditable", "plaintext-only");
          cell.setAttribute("aria-label", labels.editing + " " + (cell.dataset.sourceCellId || "cell"));
          cell.textContent = initialValue ?? editingOriginalValue;
          setInspectorContent(cell, directEditValue(cell));
          cell.focus();
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.selectNodeContents(cell);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        };
        const finishDirectEdit = () => {
          if (!editingCell) {
            return null;
          }
          const cell = editingCell;
          const value = directEditValue(cell);
          cell.classList.remove("is-editing");
          cell.removeAttribute("contenteditable");
          cell.removeAttribute("aria-label");
          editingCell = null;
          setInspectorContent(cell, value);
          return { cell, value };
        };
        const cancelDirectEdit = () => {
          if (!editingCell) {
            return;
          }
          const cell = editingCell;
          cell.textContent = editingOriginalValue;
          finishDirectEdit();
          editingGridStateBeforeEdit = null;
          setInspectorContent(cell, editingOriginalValue);
          cell.focus();
        };
        const commitDirectEdit = (reason) => {
          const finished = finishDirectEdit();
          if (!finished) {
            return;
          }
          const { cell, value } = finished;
          const nextCell = reason === "tab"
            ? nextEditableCell(cell, "next")
            : reason === "enter"
              ? nextEditableCell(cell, "row")
              : null;
          const selectedAfterCommit = nextCell?.dataset.sourceCellId || cell.dataset.sourceCellId || "";
          if (value === editingOriginalValue) {
            editingGridStateBeforeEdit = null;
            (nextCell || cell).focus();
            return;
          }
          const gridStateBeforeEdit = editingGridStateBeforeEdit;
          editingGridStateBeforeEdit = null;
          postSourceMessage({
            type: "update-cell-content",
            sourceCellId: cell.dataset.sourceCellId || "",
            contentRaw: (cell.dataset.leading || " ") + value,
            selectedSourceCellId: selectedAfterCommit,
            reason
          }, { gridState: gridStateBeforeEdit });
        };
        const applyContentEditorValue = () => {
          if (!selectedCell || !contentEditor || applyButton?.disabled) {
            return;
          }
          const blockContent = selectedCell.dataset.block === "true";
          postSourceMessage({
            type: blockContent ? "update-block-cell-source" : "update-cell-content",
            sourceCellId: selectedCell.dataset.sourceCellId || "",
            contentRaw: (selectedCell.dataset.leading || " ") + contentEditor.value,
            selectedSourceCellId: selectedCell.dataset.sourceCellId || "",
            reason: "bottom-cell-editor"
          });
        };
        if (applyButton) {
          applyButton.addEventListener("click", applyContentEditorValue);
        }
        contentEditor?.addEventListener("keydown", (event) => {
          const hasApplyModifier = event.metaKey || event.ctrlKey || event.getModifierState?.("Meta") || event.getModifierState?.("Control");
          const isApplyKey = event.key === "Enter" || event.code === "Enter";
          if (hasApplyModifier && !event.altKey && isApplyKey) {
            event.preventDefault();
            event.stopPropagation();
            applyContentEditorValue();
            return;
          }
          if (event.key === "Escape" && selectedCell) {
            event.preventDefault();
            event.stopPropagation();
            contentEditor.value = selectedCell.dataset.editContent || selectedCell.dataset.content || "";
          }
        });
        const selectedSourceCellId = () => selectedCell?.dataset.sourceCellId || "";
        const requestRowColumnEdit = (type) => {
          if (editorMode !== "edit") {
            return;
          }
          if (!selectedCell || selectedCell.dataset.kind !== "origin") {
            showClipboardDiagnostic(labels.structureEditBlockedOrigin);
            return;
          }
          postSourceMessage({
            type,
            sourceCellId: selectedSourceCellId(),
            selectedSourceCellId: selectedSourceCellId()
          });
        };
        const closeContextMenu = () => {
          contextMenu?.classList.remove("is-open");
          contextMenu?.setAttribute("aria-hidden", "true");
        };
        const openContextMenu = (cell, clientX, clientY) => {
          if (!contextMenu || !cell || editorMode !== "edit") {
            return;
          }
          selectCell(cell);
          const width = contextMenu.offsetWidth || 190;
          const height = contextMenu.offsetHeight || 200;
          const left = Math.max(4, Math.min(clientX, window.innerWidth - width - 4));
          const top = Math.max(4, Math.min(clientY, window.innerHeight - height - 4));
          contextMenu.style.left = left + "px";
          contextMenu.style.top = top + "px";
          contextMenu.classList.add("is-open");
          contextMenu.setAttribute("aria-hidden", "false");
        };
        const requestUndoRedo = (type) => {
          postSourceMessage({
            type,
            selectedSourceCellId: selectedSourceCellId()
          });
        };
        const isFormControlEventTarget = (target) => target instanceof HTMLElement &&
          target !== contentEditor &&
          Boolean(target.closest("input, select, textarea"));
        const requestCellStyleUpdate = (update) => {
          if (editorMode !== "edit") {
            return;
          }
          const sourceCellIds = selectedStyleSourceCellIds();
          if (!sourceCellIds) {
            return;
          }
          postSourceMessage({
            type: "request-update-cell-style",
            sourceCellIds,
            selectedSourceCellId: selectedSourceCellId(),
            ...update
          });
        };
        const tableSettingValue = (name) => {
          const control = document.querySelector("[data-table-setting='" + name + "']");
          if (control instanceof HTMLInputElement && control.type === "checkbox") {
            return control.checked;
          }
          return control instanceof HTMLInputElement || control instanceof HTMLSelectElement ? control.value : "";
        };
        const requestColumnSpecUpdate = () => {
          if (!selectedCell || selectedCell.dataset.kind !== "origin") {
            showClipboardDiagnostic(labels.structureEditBlockedOrigin);
            return;
          }
          postSourceMessage({
            type: "request-update-column-spec",
            columnIndex: Number(selectedCell.dataset.col || "0"),
            widthRaw: tableSettingValue("column-width") || undefined,
            style: tableSettingValue("column-style") || undefined,
            selectedSourceCellId: selectedSourceCellId()
          });
        };
        const requestTableAppearanceUpdate = () => {
          postSourceMessage({
            type: "request-update-table-appearance",
            title: tableSettingValue("title") || undefined,
            id: tableSettingValue("id") || undefined,
            role: tableSettingValue("role") || undefined,
            width: tableSettingValue("width") || undefined,
            frame: tableSettingValue("frame") || undefined,
            grid: tableSettingValue("grid") || undefined,
            stripes: tableSettingValue("stripes") || undefined,
            autowidth: tableSettingValue("autowidth"),
            selectedSourceCellId: selectedSourceCellId()
          });
        };
        window.addEventListener("message", (event) => {
          const message = event.data || {};
          if (message.type === "row-column-edit-result") {
            showResultDiagnostic(labels.rowColumnEdit, message.result);
          } else if (message.type === "merge-cells-result") {
            showResultDiagnostic(labels.mergeOperation, message.result);
          } else if (message.type === "unmerge-cell-result") {
            showResultDiagnostic(labels.unmergeOperation, message.result);
          } else if (message.type === "cell-content-update-result") {
            showResultDiagnostic(labels.cellUpdate, message.result);
            if (message.result?.ok) {
              applyLocalCellContentUpdate(message.applied);
            }
          } else if (message.type === "block-cell-update-result") {
            showResultDiagnostic(labels.blockCellUpdate, message.result);
            if (message.result?.ok) {
              applyLocalCellContentUpdate(message.applied);
            }
          } else if (message.type === "undo-redo-result") {
            showResultDiagnostic(labels.undoRedo, message.result);
          } else if (message.type === "format-table-result") {
            showResultDiagnostic(labels.formatTable, message.result);
          } else if (message.type === "cell-style-update-result") {
            showResultDiagnostic(labels.cellStyleUpdate, message.result);
          } else if (message.type === "table-settings-update-result") {
            showResultDiagnostic(labels.tableSettingsUpdate, message.result);
          } else if (message.type === "set-editor-mode-for-review") {
            setEditorMode(message.mode);
            requestAnimationFrame(() => requestAnimationFrame(capture));
          }
        });
        undoButton?.addEventListener("click", () => requestUndoRedo("request-undo"));
        redoButton?.addEventListener("click", () => requestUndoRedo("request-redo"));
        applyFormatButton?.addEventListener("click", () => {
          postSourceMessage({
            type: "apply-format-table",
            mode: formatMode,
            selectedSourceCellId: selectedSourceCellId()
          });
        });
        formatTableButton?.addEventListener("click", () => {
          if (editorMode !== "edit") {
            return;
          }
          postSourceMessage({
            type: "request-format-table",
            selectedSourceCellId: selectedSourceCellId()
          });
        });
        cancelFormatButton?.addEventListener("click", () => {
          for (const view of formatReviewViews) {
            view.remove();
          }
          setEditorMode("edit");
        });
        focusDiagnosticsButton?.addEventListener("click", () => diagnostics?.focus());
        for (const button of editorModeButtons) {
          button.addEventListener("click", () => setEditorMode(button.dataset.editorModeValue || "edit"));
        }
        for (const button of formatModeButtons) {
          button.addEventListener("click", () => setFormatMode(button.dataset.formatMode || "table-layout"));
        }
        for (const button of cellStyleButtons) {
          button.addEventListener("click", () => {
            const action = button.dataset.action || "";
            requestCellStyleUpdate({
              horizontalAlign: action === "cell-align-left" ? "left" : action === "cell-align-center" ? "center" : "right"
            });
          });
        }
        cellStyleSelect?.addEventListener("change", () => {
          const value = cellStyleSelect instanceof HTMLSelectElement ? cellStyleSelect.value : "";
          if (value) {
            requestCellStyleUpdate({ style: value });
          }
        });
        applyColumnSpecButton?.addEventListener("click", requestColumnSpecUpdate);
        applyTableAppearanceButton?.addEventListener("click", requestTableAppearanceUpdate);
        contextMenu?.addEventListener("click", (event) => {
          const button = event.target instanceof HTMLElement ? event.target.closest("button[data-action]") : null;
          if (!(button instanceof HTMLButtonElement)) {
            return;
          }
          closeContextMenu();
          const action = button.dataset.action || "";
          if (action === "insert-row-before") {
            requestRowColumnEdit("request-insert-row-before");
          } else if (action === "insert-row-after") {
            requestRowColumnEdit("request-insert-row-after");
          } else if (action === "insert-column-before") {
            requestRowColumnEdit("request-insert-column-before");
          } else if (action === "insert-column-after") {
            requestRowColumnEdit("request-insert-column-after");
          } else if (action === "delete-row") {
            requestRowColumnEdit("request-delete-row");
          } else if (action === "delete-column") {
            requestRowColumnEdit("request-delete-column");
          } else if (action === "mark-header") {
            postSourceMessage({ type: "request-update-header-footer", header: true, selectedSourceCellId: selectedSourceCellId() });
          } else if (action === "mark-noheader") {
            postSourceMessage({ type: "request-update-header-footer", noheader: true, selectedSourceCellId: selectedSourceCellId() });
          } else if (action === "toggle-footer") {
            postSourceMessage({ type: "request-update-header-footer", footer: true, selectedSourceCellId: selectedSourceCellId() });
          }
        });
        mergeButton?.addEventListener("click", () => {
          if (editorMode !== "edit") {
            return;
          }
          const sourceCellIds = selectedMergeSourceCellIds();
          if (!sourceCellIds) {
            return;
          }
          postSourceMessage({
            type: "request-merge-cells",
            sourceCellIds,
            selectedSourceCellId: sourceCellIds[0]
          });
        });
        unmergeButton?.addEventListener("click", () => {
          if (editorMode !== "edit") {
            return;
          }
          const sourceCellId = selectedUnmergeSourceCellId();
          if (!sourceCellId) {
            return;
          }
          postSourceMessage({
            type: "request-unmerge-cell",
            sourceCellId,
            selectedSourceCellId: sourceCellId
          });
        });
        document.addEventListener("keydown", (event) => {
          if (isFormControlEventTarget(event.target)) {
            return;
          }
          const isMacUndoRedo = event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "z";
          const isCtrlUndo = event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "z";
          const isCtrlShiftRedo = event.ctrlKey && !event.metaKey && !event.altKey && event.shiftKey && event.key.toLowerCase() === "z";
          const isCtrlYRedo = event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === "y";
          if (isMacUndoRedo || isCtrlUndo || isCtrlShiftRedo || isCtrlYRedo) {
            event.preventDefault();
            event.stopPropagation();
            if (editingCell) {
              finishDirectEdit();
            }
            requestUndoRedo((event.shiftKey || isCtrlYRedo) ? "request-redo" : "request-undo");
            return;
          }
          if (editorMode !== "edit") {
            return;
          }
          if (event.target === contentEditor) {
            return;
          }
          if (editingCell) {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              cancelDirectEdit();
              return;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              event.stopPropagation();
              commitDirectEdit(event.key === "Tab" ? "tab" : "enter");
              return;
            }
            requestAnimationFrame(() => {
              if (editingCell) {
                setInspectorContent(editingCell, directEditValue(editingCell));
              }
            });
            return;
          }
          if (event.key === "Escape") {
            closeContextMenu();
          }
          const printableKey = event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
          const navigationKeys = new Map([
            ["ArrowLeft", "left"],
            ["ArrowRight", "right"],
            ["ArrowUp", "up"],
            ["ArrowDown", "down"]
          ]);
          const navigationDirection = event.key === "Tab"
            ? event.shiftKey ? "previous" : "next"
            : navigationKeys.get(event.key);
          if (selectedCell && navigationDirection && !event.metaKey && !event.ctrlKey && !event.altKey) {
            event.preventDefault();
            event.stopPropagation();
            moveSelection(navigationDirection, event.shiftKey && event.key !== "Tab");
            return;
          }
          if (selectedCell && (event.key === "Delete" || event.key === "Backspace") && !event.metaKey && !event.ctrlKey && !event.altKey) {
            event.preventDefault();
            event.stopPropagation();
            clearSelectedCells();
            return;
          }
          const copyShortcut = (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "c";
          const pasteShortcut = (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "v";
          if (selectedCell && copyShortcut) {
            return;
          }
          if (selectedCell && pasteShortcut) {
            return;
          }
          if (selectedCell && isEditableOriginCell(selectedCell) && (event.key === "Enter" || event.key === "F2" || printableKey)) {
            event.preventDefault();
            event.stopPropagation();
            beginDirectEdit(selectedCell, printableKey ? event.key : undefined);
          }
        }, true);
        document.addEventListener("copy", (event) => {
          if (editorMode !== "edit" || !selectedCell || editingCell || isFormControlEventTarget(event.target)) {
            return;
          }
          const text = selectedClipboardText();
          if (text === null) {
            event.preventDefault();
            return;
          }
          event.preventDefault();
          event.clipboardData?.setData("text/plain", text);
          showClipboardDiagnostic(selectedRangeCells().length > 0 ? labels.copiedSelectedRange : labels.copiedSelectedCell, { autoClear: true });
        });
        document.addEventListener("paste", (event) => {
          if (editorMode !== "edit" || !selectedCell || editingCell || isFormControlEventTarget(event.target)) {
            return;
          }
          const html = event.clipboardData?.getData("text/html") || "";
          const text = event.clipboardData?.getData("text/plain") || "";
          const htmlRichDiagnostics = html.trim() && htmlContainsRichContent(html) ? richClipboardDiagnostics() : [];
          const htmlPlainText = html.trim() ? plainTextFromHtml(html) : "";
          const htmlMappedInlineText = html.trim() ? mappedInlineTextFromHtml(html) : "";
          const htmlMappedInlineDiagnostics = htmlMappedInlineText && htmlContainsUnsupportedInlineRichContent(html) ? htmlRichDiagnostics : [];
          const blockFallbackText = text || htmlPlainText;
          const fallbackText = htmlMappedInlineText || text || htmlPlainText;
          if (isBlockOriginCell(selectedCell)) {
            if (html.trim()) {
              const singleCellText = htmlSingleCellText(html);
              if (singleCellText !== null) {
                event.preventDefault();
                pasteBlockCellContent(singleCellText);
                return;
              }
              if (blockFallbackText && !plainTextLooksLikeTable(blockFallbackText)) {
                event.preventDefault();
                if (htmlRichDiagnostics.length > 0) {
                  showClipboardDiagnostic(labels.pasteRichContentDropped);
                }
                pasteBlockCellContent(blockFallbackText);
                return;
              }
              event.preventDefault();
              showClipboardDiagnostic(labels.pasteBlockedBlockMultiCell);
              return;
            }
            if (!text) {
              return;
            }
            event.preventDefault();
            if (plainTextLooksLikeTable(text)) {
              showClipboardDiagnostic(labels.pasteBlockedBlockMultiCell);
              return;
            }
            pasteBlockCellContent(text);
            return;
          }
          if (html.trim()) {
            const imported = parseHtmlClipboardTable(html);
            if (imported?.ok) {
              event.preventDefault();
              const diagnostics = imported.richContentDropped ? richClipboardDiagnostics() : [];
              if (imported.richContentDropped) {
                showClipboardDiagnostic(labels.pasteRichContentDropped);
              }
              if (imported.hasSpans) {
                pasteImportedTableFromClipboard(imported, diagnostics);
                return;
              }
              pasteRowsFromClipboard(imported.rows, diagnostics);
              return;
            }
            if (imported && !imported.ok) {
              event.preventDefault();
              showClipboardDiagnostic(imported.reason || labels.pasteBlockedImportedTable);
              return;
            }
            const blockContent = blockContentFromHtml(html);
            if (blockContent?.ok) {
              event.preventDefault();
              if (blockContent.diagnostics.length > 0) {
                showClipboardDiagnostic(labels.pasteRichContentDropped);
              }
              replacePlainCellWithBlockContent(blockContent.content, blockContent.diagnostics);
              return;
            }
            if (blockContent && !blockContent.ok) {
              event.preventDefault();
              showClipboardDiagnostic(blockContent.reason || labels.pasteBlockedImportedTable);
              return;
            }
          }
          if (!fallbackText) {
            return;
          }
          event.preventDefault();
          if (htmlMappedInlineDiagnostics.length > 0 || (htmlRichDiagnostics.length > 0 && !htmlMappedInlineText)) {
            showClipboardDiagnostic(labels.pasteRichContentDropped);
          }
          pasteCellsFromClipboard(fallbackText, htmlMappedInlineText ? htmlMappedInlineDiagnostics : htmlRichDiagnostics);
        });
        for (const cell of document.querySelectorAll(".cell")) {
          cell.addEventListener("mousedown", (event) => {
            if (event.shiftKey) {
              event.preventDefault();
              return;
            }
            beginMouseRangeSelection(cell, event);
          });
          cell.addEventListener("mouseenter", (event) => {
            if (event.buttons === 1) {
              extendMouseRangeSelection(cell, event);
            }
          });
          cell.addEventListener("focus", () => {
            if (!suppressNextFocusSelection) {
              selectCell(cell);
            }
          });
          cell.addEventListener("click", (event) => {
            closeContextMenu();
            if (suppressClickSelectionAfterMouseRange) {
              suppressClickSelectionAfterMouseRange = false;
              event.preventDefault();
              return;
            }
            selectCell(cell, event.shiftKey);
            if (event.shiftKey) {
              focusCellWithoutSelectionReset(cell);
            }
          });
          cell.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            event.stopPropagation();
            openContextMenu(cell, event.clientX, event.clientY);
          });
          cell.addEventListener("dblclick", () => beginDirectEdit(cell));
          cell.addEventListener("blur", () => {
            if (editingCell === cell) {
              window.setTimeout(() => {
                if (editingCell === cell) {
                  commitDirectEdit("blur");
                }
              }, 0);
            }
          });
        }
        document.addEventListener("mouseup", endMouseRangeSelection);
        gridWrap?.addEventListener("mouseleave", endMouseRangeSelection);
        document.addEventListener("click", (event) => {
          if (contextMenu && !contextMenu.contains(event.target)) {
            closeContextMenu();
          }
        });
`;
}
