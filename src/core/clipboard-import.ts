import type { TableDiagnostic } from "./types";

export interface ClipboardTableImportInput {
  readonly html?: string;
  readonly text?: string;
  readonly sourceLabel?: string;
}

export type ClipboardTableImportSource = "html" | "tsv" | "none";

export interface ClipboardImportedCell {
  readonly row: number;
  readonly col: number;
  readonly rowSpan: number;
  readonly colSpan: number;
  readonly text: string;
  readonly segments?: ClipboardTextSegment[];
  readonly richContent?: ClipboardRichContentMetadata;
}

export interface ClipboardTextSegment {
  readonly text: string;
  readonly marks?: ClipboardInlineMarks;
  readonly linkHref?: string;
}

export interface ClipboardInlineMarks {
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly monospace?: boolean;
}

export interface ClipboardRichContentMetadata {
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly monospace?: boolean;
  readonly link?: boolean;
  readonly list?: boolean;
  readonly lineBreak?: boolean;
  readonly style?: boolean;
}

export type ClipboardTableImportResult =
  | {
      readonly ok: true;
      readonly source: "html" | "tsv";
      readonly rowCount: number;
      readonly columnCount: number;
      readonly cells: ClipboardImportedCell[];
      readonly diagnostics: TableDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly source: ClipboardTableImportSource;
      readonly rowCount: number;
      readonly columnCount: number;
      readonly cells: ClipboardImportedCell[];
      readonly diagnostics: TableDiagnostic[];
    };

interface HtmlCellDraft {
  rowSpan: number;
  colSpan: number;
  text: string;
  segments: ClipboardTextSegment[];
  richContent?: ClipboardRichContentMetadata;
}

interface HtmlRowDraft {
  cells: HtmlCellDraft[];
}

interface ParsedTag {
  name: string;
  closing: boolean;
  selfClosing: boolean;
  attrs: Record<string, string>;
}

const RICH_CONTENT_TAGS = new Set(["b", "strong", "i", "em", "code", "a", "ul", "ol", "li", "br"]);

export function parseClipboardTable(input: ClipboardTableImportInput): ClipboardTableImportResult {
  const html = input.html ?? "";
  const text = input.text ?? "";
  if (html.trim().length > 0) {
    const htmlResult = parseHtmlClipboardTable(html, input.sourceLabel);
    if (htmlResult.ok || htmlResult.source === "html") {
      return htmlResult;
    }
  }
  if (text.trim().length > 0) {
    return parseTsvClipboardTable(text);
  }
  return blocked("none", "import.clipboard-empty", "Clipboard does not contain a table-like HTML or TSV payload.");
}

function parseHtmlClipboardTable(html: string, sourceLabel: string | undefined): ClipboardTableImportResult {
  const diagnostics: TableDiagnostic[] = [];
  const rows: HtmlRowDraft[] = [];
  let tableDepth = 0;
  let activeRow: HtmlRowDraft | undefined;
  let activeCell: HtmlCellDraft | undefined;
  let activeMarks: ClipboardInlineMarks = {};
  let activeLinkHref: string | undefined;
  const markStack: Array<{ tagName: string; previous: ClipboardInlineMarks }> = [];
  const linkStack: Array<string | undefined> = [];
  let foundTable = false;
  let nestedTable = false;

  for (const token of html.matchAll(/<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>|[^<]+/gu)) {
    const raw = token[0];
    if (raw.startsWith("<!--")) {
      continue;
    }
    const tag = raw.startsWith("<") ? parseTag(raw) : undefined;
    if (!tag) {
      if (activeCell && tableDepth === 1) {
        appendCellText(activeCell, decodeHtml(raw), activeMarks, activeLinkHref);
      }
      continue;
    }

    if (tag.name === "table") {
      if (!tag.closing) {
        if (tableDepth === 0) {
          foundTable = true;
        } else if (activeCell) {
          nestedTable = true;
        }
        tableDepth += 1;
      } else if (tableDepth > 0) {
        tableDepth -= 1;
        if (tableDepth === 0) {
          break;
        }
      }
      continue;
    }

    if (tableDepth !== 1) {
      continue;
    }

    if (activeCell) {
      if (!tag.closing && RICH_CONTENT_TAGS.has(tag.name)) {
        applyRichContentMetadata(activeCell, tag.name);
        if (tag.name !== "a" || !isSafeLinkHref(tag.attrs.href)) {
          diagnostics.push(richContentDiagnostic(tag.name));
        }
        if (tag.name === "br" && !tag.closing) {
          appendCellText(activeCell, "\n", activeMarks, activeLinkHref);
        }
      }
      if (tag.attrs.style !== undefined) {
        activeCell.richContent = { ...(activeCell.richContent ?? {}), ...richContentFromMarks(inlineMarksFromStyle(tag.attrs.style)), style: true };
        diagnostics.push({
          code: "import.style-dropped",
          severity: "warning",
          message: "Clipboard HTML contains inline style; initial import keeps plain text only."
        });
      }
      if (!tag.closing) {
        if (tag.name === "a") {
          linkStack.push(activeLinkHref);
          activeLinkHref = tag.attrs.href;
        }
        const nextMarks = mergeMarks(inlineMarksFromTag(tag.name), inlineMarksFromStyle(tag.attrs.style));
        if (!emptyMarks(nextMarks)) {
          markStack.push({ tagName: tag.name, previous: activeMarks });
          activeMarks = mergeMarks(activeMarks, nextMarks);
        }
      } else if (markStack.at(-1)?.tagName === tag.name) {
        activeMarks = markStack.pop()?.previous ?? {};
      }
      if (tag.closing && tag.name === "a") {
        activeLinkHref = linkStack.pop();
      }
    }

    if (tag.name === "tr") {
      if (!tag.closing) {
        activeRow = { cells: [] };
        rows.push(activeRow);
      } else {
        activeRow = undefined;
      }
      continue;
    }

    if (tag.name === "td" || tag.name === "th") {
      if (!tag.closing) {
        activeCell = {
          rowSpan: positiveIntegerAttribute(tag.attrs.rowspan),
          colSpan: positiveIntegerAttribute(tag.attrs.colspan),
          text: "",
          segments: [],
          richContent: undefined
        };
        if (tag.attrs.style !== undefined) {
          activeCell.richContent = { ...richContentFromMarks(inlineMarksFromStyle(tag.attrs.style)), style: true };
          activeMarks = mergeMarks(activeMarks, inlineMarksFromStyle(tag.attrs.style));
          diagnostics.push({
            code: "import.style-dropped",
            severity: "warning",
            message: "Clipboard HTML contains inline style; initial import keeps plain text only."
          });
        }
      } else if (activeCell && activeRow) {
        const segments = normalizeSegments(activeCell.segments);
        activeRow.cells.push({
          ...activeCell,
          text: normalizeCellText(activeCell.text),
          segments,
          richContent: activeCell.richContent === undefined || emptyRichContent(activeCell.richContent) ? undefined : activeCell.richContent
        });
        activeCell = undefined;
        activeMarks = {};
        activeLinkHref = undefined;
        markStack.length = 0;
        linkStack.length = 0;
      }
    }
  }

  if (!foundTable) {
    return blocked("none", "import.html-table-not-found", "Clipboard HTML does not contain a table.");
  }
  if (nestedTable) {
    diagnostics.push({
      code: "import.nested-table-unsupported",
      severity: "error",
      message: "Clipboard HTML contains a nested table, which is not supported by the initial import prototype."
    });
  }
  return projectImportedRows("html", rows, diagnostics, sourceLabel);
}

function parseTsvClipboardTable(text: string): ClipboardTableImportResult {
  const lines = text.replace(/\r\n/gu, "\n").replace(/\r/gu, "\n").split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  const rows = lines.map((line) => ({
    cells: line.split("\t").map((cell) => ({
          rowSpan: 1,
          colSpan: 1,
          text: cell,
          segments: [{ text: cell }],
          richContent: undefined
        }))
  }));
  return projectImportedRows("tsv", rows, []);
}

export function mapClipboardInlineAsciiDoc(cell: Pick<ClipboardImportedCell, "segments" | "text">): string {
  const segments = cell.segments && cell.segments.length > 0 ? cell.segments : [{ text: cell.text }];
  return segments.map((segment) => applyLinkHref(applyInlineMarks(escapeAsciiDocInlineText(segment.text), segment.marks), segment.linkHref)).join("");
}

function appendCellText(cell: HtmlCellDraft, text: string, marks: ClipboardInlineMarks, linkHref: string | undefined): void {
  if (text.length === 0) {
    return;
  }
  cell.text += text;
  const last = cell.segments.at(-1);
  const nextMarks = emptyMarks(marks) ? undefined : marks;
  const nextLinkHref = linkHref?.trim() || undefined;
  if (last !== undefined && sameMarks(last.marks, nextMarks) && last.linkHref === nextLinkHref) {
    cell.segments[cell.segments.length - 1] = { ...last, text: last.text + text };
    return;
  }
  cell.segments.push({ text, marks: nextMarks, linkHref: nextLinkHref });
}

function normalizeSegments(segments: ClipboardTextSegment[]): ClipboardTextSegment[] {
  const normalized: ClipboardTextSegment[] = [];
  for (const segment of segments) {
    const text = segment.text.replace(/\u00a0/gu, " ").replace(/\s+/gu, " ");
    if (text.length === 0) {
      continue;
    }
    const last = normalized.at(-1);
    if (last !== undefined && sameMarks(last.marks, segment.marks) && last.linkHref === segment.linkHref) {
      normalized[normalized.length - 1] = { ...last, text: last.text + text };
    } else {
      normalized.push({ text, marks: segment.marks, linkHref: segment.linkHref });
    }
  }

  if (normalized.length === 0) {
    return [];
  }
  normalized[0] = { ...normalized[0], text: normalized[0].text.trimStart() };
  const lastIndex = normalized.length - 1;
  normalized[lastIndex] = { ...normalized[lastIndex], text: normalized[lastIndex].text.trimEnd() };
  return normalized.filter((segment) => segment.text.length > 0);
}

function inlineMarksFromTag(tagName: string): ClipboardInlineMarks {
  if (tagName === "b" || tagName === "strong") {
    return { bold: true };
  }
  if (tagName === "i" || tagName === "em") {
    return { italic: true };
  }
  if (tagName === "code") {
    return { monospace: true };
  }
  return {};
}

function inlineMarksFromStyle(style: string | undefined): ClipboardInlineMarks {
  if (style === undefined) {
    return {};
  }
  const lower = style.toLowerCase();
  return {
    bold: /font-weight\s*:\s*(?:bold|[6-9]00)\b/u.test(lower) || /font\s*:\s*[^;]*\bbold\b/u.test(lower),
    italic: /font-style\s*:\s*italic\b/u.test(lower) || /font\s*:\s*[^;]*\bitalic\b/u.test(lower),
    monospace: /font-family\s*:\s*[^;]*(?:monospace|mono|courier|menlo|consolas)/u.test(lower) ||
      /font\s*:\s*[^;]*(?:monospace|mono|courier|menlo|consolas)/u.test(lower)
  };
}

function mergeMarks(left: ClipboardInlineMarks, right: ClipboardInlineMarks): ClipboardInlineMarks {
  return {
    bold: left.bold || right.bold || undefined,
    italic: left.italic || right.italic || undefined,
    monospace: left.monospace || right.monospace || undefined
  };
}

function richContentFromMarks(marks: ClipboardInlineMarks): ClipboardRichContentMetadata {
  return {
    bold: marks.bold || undefined,
    italic: marks.italic || undefined,
    monospace: marks.monospace || undefined
  };
}

function emptyMarks(value: ClipboardInlineMarks | undefined): boolean {
  return value === undefined || Object.values(value).every((entry) => entry !== true);
}

function sameMarks(left: ClipboardInlineMarks | undefined, right: ClipboardInlineMarks | undefined): boolean {
  return Boolean(left?.bold) === Boolean(right?.bold) &&
    Boolean(left?.italic) === Boolean(right?.italic) &&
    Boolean(left?.monospace) === Boolean(right?.monospace);
}

function applyInlineMarks(text: string, marks: ClipboardInlineMarks | undefined): string {
  if (text.length === 0 || marks === undefined || emptyMarks(marks)) {
    return text;
  }
  let current = text;
  if (marks.monospace) {
    current = `\`${current.replace(/`/gu, "\\`")}\``;
  }
  if (marks.italic) {
    current = `_${current.replace(/_/gu, "\\_")}_`;
  }
  if (marks.bold) {
    current = `*${current.replace(/\*/gu, "\\*")}*`;
  }
  return current;
}

function applyLinkHref(text: string, linkHref: string | undefined): string {
  const href = linkHref?.trim();
  if (!href || !isSafeLinkHref(href)) {
    return text;
  }
  if (text.trim().length === 0 || text.trim() === href) {
    return href;
  }
  return `${href}[${text.replace(/\]/gu, "\\]")}]`;
}

function isSafeLinkHref(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return /^(?:https?:|mailto:)/iu.test(value.trim());
}

function escapeAsciiDocInlineText(text: string): string {
  return text;
}

function applyRichContentMetadata(cell: HtmlCellDraft, tagName: string): void {
  const current = cell.richContent ?? {};
  if (tagName === "b" || tagName === "strong") {
    cell.richContent = { ...current, bold: true };
  } else if (tagName === "i" || tagName === "em") {
    cell.richContent = { ...current, italic: true };
  } else if (tagName === "code") {
    cell.richContent = { ...current, monospace: true };
  } else if (tagName === "a") {
    cell.richContent = { ...current, link: true };
  } else if (tagName === "ul" || tagName === "ol" || tagName === "li") {
    cell.richContent = { ...current, list: true };
  } else if (tagName === "br") {
    cell.richContent = { ...current, lineBreak: true };
  }
}

function richContentDiagnostic(tagName: string): TableDiagnostic {
  if (tagName === "b" || tagName === "strong") {
    return {
      code: "import.bold-content-dropped",
      severity: "warning",
      message: "Clipboard HTML contains bold content; initial import keeps plain text only."
    };
  }
  if (tagName === "i" || tagName === "em") {
    return {
      code: "import.italic-content-dropped",
      severity: "warning",
      message: "Clipboard HTML contains italic content; initial import keeps plain text only."
    };
  }
  if (tagName === "code") {
    return {
      code: "import.monospace-content-dropped",
      severity: "warning",
      message: "Clipboard HTML contains monospace content; initial import keeps plain text only."
    };
  }
  if (tagName === "a") {
    return {
      code: "import.link-content-dropped",
      severity: "warning",
      message: "Clipboard HTML contains links; initial import keeps plain text only."
    };
  }
  if (tagName === "ul" || tagName === "ol" || tagName === "li") {
    return {
      code: "import.list-content-dropped",
      severity: "warning",
      message: "Clipboard HTML contains list content; initial import keeps plain text only."
    };
  }
  return {
    code: "import.line-break-content-dropped",
    severity: "warning",
    message: "Clipboard HTML contains line breaks; initial import keeps plain text only."
  };
}

function emptyRichContent(value: ClipboardRichContentMetadata): boolean {
  return Object.values(value).every((entry) => entry !== true);
}

function projectImportedRows(
  source: "html" | "tsv",
  rows: HtmlRowDraft[],
  diagnostics: TableDiagnostic[],
  sourceLabel?: string
): ClipboardTableImportResult {
  const occupied = new Map<string, true>();
  const cells: ClipboardImportedCell[] = [];
  let columnCount = 0;

  rows.forEach((row, rowIndex) => {
    let colIndex = 0;
    for (const cell of row.cells) {
      while (occupied.has(key(rowIndex, colIndex))) {
        colIndex += 1;
      }
      if (cell.rowSpan < 1 || cell.colSpan < 1) {
        diagnostics.push({
          code: "import.invalid-span",
          severity: "error",
          message: "Clipboard table contains an invalid rowspan or colspan."
        });
        continue;
      }
      cells.push({
        row: rowIndex,
        col: colIndex,
        rowSpan: cell.rowSpan,
        colSpan: cell.colSpan,
        text: cell.text,
        segments: cell.segments.length > 0 ? cell.segments : undefined,
        richContent: cell.richContent
      });
      for (let rowOffset = 0; rowOffset < cell.rowSpan; rowOffset += 1) {
        for (let colOffset = 0; colOffset < cell.colSpan; colOffset += 1) {
          const occupiedKey = key(rowIndex + rowOffset, colIndex + colOffset);
          if (occupied.has(occupiedKey)) {
            diagnostics.push({
              code: "import.overlapping-span",
              severity: "error",
              message: "Clipboard table contains overlapping spans."
            });
          }
          occupied.set(occupiedKey, true);
        }
      }
      colIndex += cell.colSpan;
      columnCount = Math.max(columnCount, colIndex);
    }
  });

  if (rows.length === 0 || cells.length === 0 || columnCount === 0) {
    diagnostics.push({
      code: "import.empty-table",
      severity: "error",
      message: "Clipboard table does not contain importable cells."
    });
  }

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const occupiedColumns = Array.from({ length: columnCount }, (_, colIndex) => occupied.has(key(rowIndex, colIndex)));
    if (occupiedColumns.some((value) => !value)) {
      diagnostics.push({
        code: "import.ragged-row",
        severity: "error",
        message: "Clipboard table is not rectangular after span projection."
      });
      break;
    }
  }

  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  const sourceDiagnostic: TableDiagnostic = {
    code: "import.source-label",
    severity: "info",
    message: `Clipboard import source: ${sourceLabel ?? ""}`
  };
  const nextDiagnostics: TableDiagnostic[] = sourceLabel
      ? [
          sourceDiagnostic,
          ...dedupeDiagnostics(diagnostics)
        ]
      : dedupeDiagnostics(diagnostics);
  if (errors.length > 0) {
    return {
      ok: false,
      source,
      rowCount: rows.length,
      columnCount,
      cells,
      diagnostics: nextDiagnostics
    };
  }
  return {
    ok: true,
    source,
    rowCount: rows.length,
    columnCount,
    cells,
    diagnostics: nextDiagnostics
  };
}

function blocked(source: ClipboardTableImportSource, code: string, message: string): ClipboardTableImportResult {
  return {
    ok: false,
    source,
    rowCount: 0,
    columnCount: 0,
    cells: [],
    diagnostics: [{ code, severity: "error", message }]
  };
}

function parseTag(raw: string): ParsedTag | undefined {
  const match = /^<\s*(\/)?\s*([A-Za-z][A-Za-z0-9:-]*)([\s\S]*?)(\/)?\s*>$/u.exec(raw);
  if (!match) {
    return undefined;
  }
  return {
    name: match[2].toLowerCase(),
    closing: match[1] === "/",
    selfClosing: match[4] === "/",
    attrs: parseAttributes(match[3])
  };
}

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of raw.matchAll(/([A-Za-z_:][A-Za-z0-9_:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+))/gu)) {
    attrs[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

function positiveIntegerAttribute(value: string | undefined): number {
  if (!value) {
    return 1;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeCellText(value: string): string {
  return value.replace(/\u00a0/gu, " ").replace(/\s+/gu, " ").trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/giu, "\u00a0")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, "\"")
    .replace(/&#39;/giu, "'")
    .replace(/&amp;/giu, "&")
    .replace(/&#x([0-9a-f]+);/giu, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/gu, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)));
}

function dedupeDiagnostics(diagnostics: TableDiagnostic[]): TableDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const identity = `${diagnostic.code}\n${diagnostic.message}`;
    if (seen.has(identity)) {
      return false;
    }
    seen.add(identity);
    return true;
  });
}

function key(row: number, col: number): string {
  return `${row}:${col}`;
}
