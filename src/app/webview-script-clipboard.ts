export function renderWebviewClipboardScript(): string {
  return `        const parseClipboardTable = (text) => text
          .replace(/\\r\\n/g, "\\n")
          .replace(/\\r/g, "\\n")
          .split("\\n")
          .filter((row, index, rows) => index < rows.length - 1 || row.length > 0)
          .map((row) => row.split("\\t"));
        const htmlContainsRichContent = (html) => {
          const template = document.createElement("template");
          template.innerHTML = html;
          return Boolean(template.content.querySelector("b,strong,i,em,code,a,ul,ol,li,br,[style]"));
        };
        const htmlContainsUnsupportedInlineRichContent = (html) => {
          const template = document.createElement("template");
          template.innerHTML = html;
          return Boolean(template.content.querySelector("br,[style]")) ||
            Array.from(template.content.querySelectorAll("a")).some((anchor) => !isSafeLinkHref(anchor.getAttribute("href") || ""));
        };
        const emptyInlineMarks = (marks) => !marks || (!marks.bold && !marks.italic && !marks.monospace);
        const sameInlineMarks = (left, right) =>
          Boolean(left && left.bold) === Boolean(right && right.bold) &&
          Boolean(left && left.italic) === Boolean(right && right.italic) &&
          Boolean(left && left.monospace) === Boolean(right && right.monospace);
        const isSafeLinkHref = (href) => /^(?:https?:|mailto:)/i.test((href || "").trim());
        const mergeInlineMarks = (left, right) => ({
          bold: Boolean(left && left.bold) || Boolean(right && right.bold) || undefined,
          italic: Boolean(left && left.italic) || Boolean(right && right.italic) || undefined,
          monospace: Boolean(left && left.monospace) || Boolean(right && right.monospace) || undefined
        });
        const inlineMarksFromElement = (element) => {
          const tagName = element.tagName.toLowerCase();
          const style = (element.getAttribute("style") || "").toLowerCase();
          return {
            bold: tagName === "b" || tagName === "strong" || /font-weight\\s*:\\s*(?:bold|[6-9]00)\\b/u.test(style) || /font\\s*:\\s*[^;]*\\bbold\\b/u.test(style) || undefined,
            italic: tagName === "i" || tagName === "em" || /font-style\\s*:\\s*italic\\b/u.test(style) || /font\\s*:\\s*[^;]*\\bitalic\\b/u.test(style) || undefined,
            monospace: tagName === "code" || /font-family\\s*:\\s*[^;]*(?:monospace|mono|courier|menlo|consolas)/u.test(style) || /font\\s*:\\s*[^;]*(?:monospace|mono|courier|menlo|consolas)/u.test(style) || undefined
          };
        };
        const appendInlineSegment = (segments, text, marks, linkHref) => {
          if (!text) {
            return;
          }
          const normalizedText = text.replace(/\\u00a0/g, " ");
          if (!normalizedText) {
            return;
          }
          const nextMarks = emptyInlineMarks(marks) ? undefined : marks;
          const nextLinkHref = (linkHref || "").trim() || undefined;
          const last = segments.at(-1);
          if (last && sameInlineMarks(last.marks, nextMarks) && last.linkHref === nextLinkHref) {
            last.text += normalizedText;
            return;
          }
          segments.push({ text: normalizedText, marks: nextMarks, linkHref: nextLinkHref });
        };
        const collectInlineSegments = (node, marks, linkHref, segments) => {
          if (node.nodeType === Node.TEXT_NODE) {
            appendInlineSegment(segments, node.textContent || "", marks, linkHref);
            return;
          }
          if (node.nodeType !== Node.ELEMENT_NODE) {
            return;
          }
          const element = node;
          if (element.tagName.toLowerCase() === "br") {
            appendInlineSegment(segments, "\\n", marks, linkHref);
            return;
          }
          const nextMarks = mergeInlineMarks(marks, inlineMarksFromElement(element));
          const nextLinkHref = element.tagName.toLowerCase() === "a"
            ? element.getAttribute("href") || undefined
            : linkHref;
          for (const child of Array.from(element.childNodes)) {
            collectInlineSegments(child, nextMarks, nextLinkHref, segments);
          }
        };
        const normalizeInlineSegments = (segments) => {
          const normalized = [];
          for (const segment of segments) {
            const text = segment.text.replace(/\\s+/g, " ");
            if (!text) {
              continue;
            }
            const last = normalized.at(-1);
            if (last && sameInlineMarks(last.marks, segment.marks) && last.linkHref === segment.linkHref) {
              last.text += text;
            } else {
              normalized.push({ text, marks: segment.marks, linkHref: segment.linkHref });
            }
          }
          if (normalized.length === 0) {
            return [];
          }
          normalized[0].text = normalized[0].text.trimStart();
          normalized[normalized.length - 1].text = normalized[normalized.length - 1].text.trimEnd();
          return normalized.filter((segment) => segment.text.length > 0);
        };
        const applyInlineMarks = (text, marks) => {
          if (!text || emptyInlineMarks(marks)) {
            return text;
          }
          let current = text;
          if (marks.monospace) {
            current = "\`" + current.replace(/\`/g, "\\\\\`") + "\`";
          }
          if (marks.italic) {
            current = "_" + current.replace(/_/g, "\\\\_") + "_";
          }
          if (marks.bold) {
            current = "*" + current.replace(/\\*/g, "\\\\*") + "*";
          }
          return current;
        };
        const applyLinkHref = (text, linkHref) => {
          const href = (linkHref || "").trim();
          if (!href || !isSafeLinkHref(href)) {
            return text;
          }
          if (!text.trim() || text.trim() === href) {
            return href;
          }
          return href + "[" + text.replace(/\\]/g, "\\\\]") + "]";
        };
        const inlineSegmentsFromCell = (cell) => {
          const segments = [];
          const initialMarks = inlineMarksFromElement(cell);
          const initialLinkHref = cell.tagName.toLowerCase() === "a" ? cell.getAttribute("href") || undefined : undefined;
          for (const child of Array.from(cell.childNodes)) {
            collectInlineSegments(child, initialMarks, initialLinkHref, segments);
          }
          return normalizeInlineSegments(segments);
        };
        const inlineSegmentsFromFragment = (html) => {
          const template = document.createElement("template");
          template.innerHTML = html;
          if (template.content.querySelector("table,ul,ol,li")) {
            return null;
          }
          const segments = [];
          for (const child of Array.from(template.content.childNodes)) {
            collectInlineSegments(child, {}, undefined, segments);
          }
          return normalizeInlineSegments(segments);
        };
        const mapInlineSegmentsAsciiDoc = (segments, fallbackText) => {
          const sourceSegments = segments.length > 0 ? segments : [{ text: fallbackText }];
          return sourceSegments.map((segment) => applyLinkHref(applyInlineMarks(segment.text, segment.marks), segment.linkHref)).join("");
        };
        const mappedInlineTextFromHtml = (html) => {
          const segments = inlineSegmentsFromFragment(html);
          if (!segments || segments.length === 0) {
            return "";
          }
          return mapInlineSegmentsAsciiDoc(segments, "");
        };
        const mappedInlineTextFromNode = (node) => {
          const segments = [];
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node;
            const initialMarks = inlineMarksFromElement(element);
            const initialLinkHref = element.tagName.toLowerCase() === "a" ? element.getAttribute("href") || undefined : undefined;
            for (const child of Array.from(element.childNodes)) {
              collectInlineSegments(child, initialMarks, initialLinkHref, segments);
            }
          } else {
            collectInlineSegments(node, {}, undefined, segments);
          }
          return mapInlineSegmentsAsciiDoc(normalizeInlineSegments(segments), (node.textContent || "").replace(/\\u00a0/g, " ").replace(/\\s+/g, " ").trim());
        };
        const blockLinesFromNodes = (nodes) => {
          const lines = [];
          let current = [];
          const pushCurrent = () => {
            const line = mapInlineSegmentsAsciiDoc(normalizeInlineSegments(current), "").trim();
            if (line || lines.length > 0) {
              lines.push(line);
            }
            current = [];
          };
          const visit = (node, marks, linkHref) => {
            if (node.nodeType === Node.TEXT_NODE) {
              appendInlineSegment(current, node.textContent || "", marks, linkHref);
              return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) {
              return;
            }
            const element = node;
            if (element.tagName.toLowerCase() === "br") {
              pushCurrent();
              return;
            }
            const nextMarks = mergeInlineMarks(marks, inlineMarksFromElement(element));
            const nextLinkHref = element.tagName.toLowerCase() === "a"
              ? element.getAttribute("href") || undefined
              : linkHref;
            for (const child of Array.from(element.childNodes)) {
              visit(child, nextMarks, nextLinkHref);
            }
          };
          for (const node of nodes) {
            visit(node, {}, undefined);
          }
          pushCurrent();
          return lines.filter((line, index, allLines) => line.length > 0 || index < allLines.length - 1);
        };
        const blockContentFromHtml = (html) => {
          const template = document.createElement("template");
          template.innerHTML = html;
          if (template.content.querySelector("table")) {
            return null;
          }
          if (template.content.querySelector("img,svg,video,audio,canvas")) {
            return { ok: false, reason: labels.pasteBlockedImportedTable, diagnostics: richClipboardDiagnostics() };
          }
          const lists = Array.from(template.content.querySelectorAll("ul,ol"));
          if (lists.length > 0) {
            const lines = [];
            for (const list of lists) {
              const marker = list.tagName.toLowerCase() === "ol" ? ". " : "* ";
              for (const item of Array.from(list.children).filter((child) => child.tagName.toLowerCase() === "li")) {
                const itemText = mappedInlineTextFromNode(item).trim();
                if (itemText) {
                  lines.push(marker + itemText);
                }
              }
            }
            if (lines.length > 0) {
              return { ok: true, content: lines.join("\\n"), diagnostics: htmlContainsUnsupportedInlineRichContent(html) ? richClipboardDiagnostics() : [] };
            }
          }
          const paragraphs = Array.from(template.content.querySelectorAll("p"));
          if (paragraphs.length > 1) {
            const lines = paragraphs.map((paragraph) => mappedInlineTextFromNode(paragraph).trim()).filter(Boolean);
            if (lines.length > 1) {
              return { ok: true, content: lines.join("\\n"), diagnostics: htmlContainsUnsupportedInlineRichContent(html) ? richClipboardDiagnostics() : [] };
            }
          }
          if (template.content.querySelector("br")) {
            const lines = blockLinesFromNodes(Array.from(template.content.childNodes));
            if (lines.length > 1) {
              return { ok: true, content: lines.join("\\n"), diagnostics: htmlContainsUnsupportedInlineRichContent(html) ? richClipboardDiagnostics() : [] };
            }
          }
          return null;
        };
        const plainTextFromHtml = (html) => {
          const template = document.createElement("template");
          template.innerHTML = html;
          const listItems = Array.from(template.content.querySelectorAll("li"))
            .map((item) => (item.textContent || "").replace(/\\u00a0/g, " ").replace(/\\s+/g, " ").trim())
            .filter(Boolean);
          if (listItems.length > 0) {
            return listItems.join("\\n");
          }
          return (template.content.textContent || "").replace(/\\u00a0/g, " ").replace(/\\s+/g, " ").trim();
        };
        const parseHtmlClipboardTable = (html) => {
          const template = document.createElement("template");
          template.innerHTML = html;
          const table = template.content.querySelector("table");
          if (!table) {
            return null;
          }
          if (table.querySelector("td table, th table")) {
            return { ok: false, reason: labels.pasteBlockedImportedTable };
          }
          const occupied = new Set();
          const importedCells = [];
          let richContentDropped = false;
          let rowCount = 0;
          let columnCount = 0;
          const key = (row, col) => row + ":" + col;
          for (const [rowIndex, row] of Array.from(table.querySelectorAll("tr")).entries()) {
            let colIndex = 0;
            for (const cell of Array.from(row.children).filter((child) => child.tagName === "TD" || child.tagName === "TH")) {
              if (cell.querySelector("ul,ol,li,br,[style]") || cell.hasAttribute("style") ||
                Array.from(cell.querySelectorAll("a")).some((anchor) => !isSafeLinkHref(anchor.getAttribute("href") || ""))) {
                richContentDropped = true;
              }
              const rowSpan = Number(cell.getAttribute("rowspan") || "1");
              const colSpan = Number(cell.getAttribute("colspan") || "1");
              if (!Number.isFinite(rowSpan) || !Number.isFinite(colSpan) || rowSpan < 1 || colSpan < 1) {
                return { ok: false, reason: labels.pasteBlockedImportedTable };
              }
              while (occupied.has(key(rowIndex, colIndex))) {
                colIndex += 1;
              }
              const segments = inlineSegmentsFromCell(cell);
              const plainText = (cell.textContent || "").replace(/\\u00a0/g, " ").replace(/\\s+/g, " ").trim();
              importedCells.push({
                row: rowIndex,
                col: colIndex,
                rowSpan,
                colSpan,
                text: mapInlineSegmentsAsciiDoc(segments, plainText)
              });
              for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
                for (let colOffset = 0; colOffset < colSpan; colOffset += 1) {
                  const slot = key(rowIndex + rowOffset, colIndex + colOffset);
                  if (occupied.has(slot)) {
                    return { ok: false, reason: labels.pasteBlockedImportedTable };
                  }
                  occupied.add(slot);
                }
              }
              colIndex += colSpan;
              columnCount = Math.max(columnCount, colIndex);
            }
            rowCount = Math.max(rowCount, rowIndex + 1);
          }
          if (rowCount === 0 || columnCount === 0 || importedCells.length === 0) {
            return { ok: false, reason: labels.pasteBlockedImportedTable };
          }
          for (let row = 0; row < rowCount; row += 1) {
            for (let col = 0; col < columnCount; col += 1) {
              if (!occupied.has(key(row, col))) {
                return { ok: false, reason: labels.pasteBlockedImportedRagged };
              }
            }
          }
          const rows = Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => ""));
          for (const cell of importedCells) {
            rows[cell.row][cell.col] = cell.text;
          }
          return {
            ok: true,
            rows,
            rowCount,
            columnCount,
            cells: importedCells,
            richContentDropped,
            hasSpans: importedCells.some((cell) => cell.rowSpan > 1 || cell.colSpan > 1)
          };
        };
        const isBlockOriginCell = (cell) => cell?.dataset.kind === "origin" && cell.dataset.block === "true";
        const htmlSingleCellText = (html) => {
          const imported = parseHtmlClipboardTable(html);
          if (!imported?.ok || imported.rowCount !== 1 || imported.columnCount !== 1 || imported.cells.length !== 1) {
            return null;
          }
          return imported.cells[0].text;
        };
        const plainTextLooksLikeTable = (text) => parseClipboardTable(text).some((row) => row.length > 1);
        const pasteBlockCellContent = (text) => {
          if (!selectedCell || !isBlockOriginCell(selectedCell)) {
            return false;
          }
          postSourceMessage({
            type: "update-block-cell-source",
            sourceCellId: selectedCell.dataset.sourceCellId || "",
            contentRaw: (selectedCell.dataset.leading || " ") + text,
            selectedSourceCellId: selectedCell.dataset.sourceCellId || "",
            reason: "paste"
          });
          return true;
        };
        const replacePlainCellWithBlockContent = (text, diagnostics = []) => {
          if (!selectedCell || !isPlainPasteTarget(selectedCell)) {
            showClipboardDiagnostic(labels.pasteBlockedPlainRange);
            return false;
          }
          postSourceMessage({
            type: "replace-cell-with-block-source",
            sourceCellId: selectedCell.dataset.sourceCellId || "",
            contentRaw: (selectedCell.dataset.leading || " ") + text,
            selectedSourceCellId: selectedCell.dataset.sourceCellId || "",
            diagnostics,
            reason: "paste"
          });
          return true;
        };
        const richClipboardDiagnostics = () => [{
          code: "paste.rich-content-dropped",
          severity: "warning",
          message: labels.pasteRichContentDropped
        }];
        const pasteRowsFromClipboard = (rows, diagnostics = []) => {
          if (!selectedCell) {
            return;
          }
          if (rows.length === 0 || rows[0].length === 0) {
            return;
          }
          const startRow = Number(selectedCell.dataset.row || "0");
          const startCol = Number(selectedCell.dataset.col || "0");
          const currentRowCount = gridRowCount();
          const currentColumnCount = gridColumnCount();
          let requiresExpansion = false;
          const replacements = [];
          const seenSourceIds = new Set();
          for (let rowOffset = 0; rowOffset < rows.length; rowOffset += 1) {
            for (let colOffset = 0; colOffset < rows[rowOffset].length; colOffset += 1) {
              const targetRow = startRow + rowOffset;
              const targetCol = startCol + colOffset;
              const target = cellAt(targetRow, targetCol);
              if (!target) {
                if (targetRow >= currentRowCount || targetCol >= currentColumnCount) {
                  requiresExpansion = true;
                  continue;
                }
                showClipboardDiagnostic(labels.pasteBlockedPlainRange);
                return;
              }
              if (!isPlainPasteTarget(target)) {
                showClipboardDiagnostic(labels.pasteBlockedPlainRange);
                return;
              }
              const sourceCellId = target.dataset.sourceCellId || "";
              if (seenSourceIds.has(sourceCellId)) {
                showClipboardDiagnostic(labels.pasteBlockedMergedOverlap);
                return;
              }
              seenSourceIds.add(sourceCellId);
              replacements.push({
                sourceCellId,
                contentRaw: (target.dataset.leading || " ") + rows[rowOffset][colOffset]
              });
            }
          }
          if (requiresExpansion) {
            postSourceMessage({
              type: "paste-rectangular-table",
              startSourceCellId: selectedCell.dataset.sourceCellId || "",
              rows,
              selectedSourceCellId: selectedCell.dataset.sourceCellId || "",
              diagnostics,
              reason: "paste"
            });
            return;
          }
          postSourceMessage({
            type: "update-cell-contents",
            replacements,
            selectedSourceCellId: replacements.at(-1)?.sourceCellId || selectedCell.dataset.sourceCellId || "",
            diagnostics,
            reason: "paste"
          });
        };
        const pasteImportedTableFromClipboard = (imported, diagnostics = []) => {
          if (!selectedCell) {
            return;
          }
          postSourceMessage({
            type: "paste-imported-table",
            startSourceCellId: selectedCell.dataset.sourceCellId || "",
            rowCount: imported.rowCount,
            columnCount: imported.columnCount,
            cells: imported.cells,
            selectedSourceCellId: selectedCell.dataset.sourceCellId || "",
            diagnostics,
            reason: "paste"
          });
        };
        const pasteCellsFromClipboard = (text, diagnostics = []) => pasteRowsFromClipboard(parseClipboardTable(text), diagnostics);
`;
}
