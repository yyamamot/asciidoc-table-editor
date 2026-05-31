import { parseAsciiDocTable } from "./parser";
import { projectGridModel } from "./grid-model";
import type { ColumnSpecUpdate, PlainCellStyleRangeReplacement, TableAppearanceUpdate, TableHeaderFooterUpdate } from "./emitter-types";
import type { LosslessTable, LosslessTableCell, TableAttributeEntry, TableDiagnostic, WriteBackResult } from "./types";
import { applyReplacements, blocked, findCell, hasDuplicateShorthand } from "./emitter-utils";

const STYLE_VALUES = new Set(["m", "s", "e", "h", "l", "d", "a"]);
const FRAME_VALUES = new Set(["topbot", "all", "none", "sides", "ends"]);
const GRID_VALUES = new Set(["all", "cols", "rows", "none"]);
const STRIPES_VALUES = new Set(["all", "even", "odd", "hover", "none"]);

export function replacePlainCellStyles(table: LosslessTable, request: PlainCellStyleRangeReplacement): WriteBackResult {
  const sourceCellIds = [...new Set(request.sourceCellIds)];
  if (sourceCellIds.length === 0) {
    return blocked(table, diagnostic("writeback.cell-style-empty", "No cells were selected for style update"));
  }
  const unsafe = unsafeStructuredEditDiagnostic(table, "Cell style update requires a source-safe table grid");
  if (unsafe !== undefined) {
    return blocked(table, unsafe);
  }

  const replacements: Array<{ start: number; end: number; text: string }> = [];
  if (request.style !== undefined && request.style.length > 0 && !STYLE_VALUES.has(request.style)) {
    return blocked(table, diagnostic("writeback.cell-style-value", `Unsupported cell style value: ${request.style}`));
  }
  for (const sourceCellId of sourceCellIds) {
    const cell = findCell(table, sourceCellId);
    if (cell === undefined) {
      return blocked(table, diagnostic("writeback.cell-not-found", `Cell ${sourceCellId} was not found`, sourceCellId));
    }
    const unsafeCell = unsafeCellSpecPatchDiagnostic(cell);
    if (unsafeCell !== undefined) {
      return blocked(table, unsafeCell);
    }
    replacements.push({
      start: cell.range.start.offset,
      end: cell.range.start.offset + cell.cellSpecRaw.length,
      text: updateCellSpecStyle(cell.cellSpecRaw, {
        style: request.style ?? cell.style,
        horizontalAlign: request.horizontalAlign ?? cell.horizontalAlign,
        verticalAlign: request.verticalAlign ?? cell.verticalAlign
      })
    });
  }

  const source = applyReplacements(table.raw, replacements);
  return source === table.raw ? { ok: true, source: table.raw, diagnostics: [] } : { ok: true, source, diagnostics: [] };
}

export function updateTableHeaderFooter(table: LosslessTable, request: TableHeaderFooterUpdate): WriteBackResult {
  const unsafe = unsafeAttributeEditDiagnostic(table);
  if (unsafe !== undefined) {
    return blocked(table, unsafe);
  }

  const options = new Set(table.attributes.options);
  if (request.noheader === true) {
    options.delete("header");
    options.add("noheader");
  } else if (request.noheader === false) {
    options.delete("noheader");
  }
  if (request.header === true) {
    options.delete("noheader");
    options.add("header");
  } else if (request.header === false) {
    options.delete("header");
  }
  if (request.footer === true) {
    options.add("footer");
  } else if (request.footer === false) {
    options.delete("footer");
  }

  return patchOptionsAttribute(table, Array.from(options), ["header", "footer", "noheader"]);
}

export function updateColumnSpec(table: LosslessTable, request: ColumnSpecUpdate): WriteBackResult {
  const unsafe = unsafeAttributeEditDiagnostic(table);
  if (unsafe !== undefined) {
    return blocked(table, unsafe);
  }
  if (!Number.isInteger(request.columnIndex) || request.columnIndex < 0) {
    return blocked(table, diagnostic("writeback.column-spec-index", "Column spec update requires a valid column index"));
  }
  if (request.style !== undefined && request.style.length > 0 && !STYLE_VALUES.has(request.style)) {
    return blocked(table, diagnostic("writeback.column-style-value", `Unsupported column style value: ${request.style}`));
  }

  const columnCount = Math.max(table.attributes.columnCount ?? 0, projectGridModel(table).columnCount, request.columnIndex + 1);
  if (columnCount <= 0) {
    return blocked(table, diagnostic("writeback.column-spec-empty", "Column spec update requires at least one column"));
  }

  const columns = Array.from({ length: columnCount }, (_, index) => table.attributes.columns[index]?.raw ?? "");
  const existing = table.attributes.columns[request.columnIndex];
  columns[request.columnIndex] = buildColumnSpec(columns[request.columnIndex], {
    ...request,
    widthRaw: request.widthRaw ?? existing?.widthRaw,
    horizontalAlign: request.horizontalAlign ?? existing?.horizontalAlign,
    verticalAlign: request.verticalAlign ?? existing?.verticalAlign,
    style: request.style ?? existing?.style
  });
  return patchAttribute(table, "cols", columns.join(","), { quote: "\"" });
}

export function updateTableAppearance(table: LosslessTable, request: TableAppearanceUpdate): WriteBackResult {
  const unsafe = unsafeAttributeEditDiagnostic(table);
  if (unsafe !== undefined) {
    return blocked(table, unsafe);
  }

  let source = table.raw;
  let current = table;
  if (request.title !== undefined) {
    source = patchTitle(current, request.title);
    current = parseAsciiDocTable(source);
  }

  const replacements: Array<{ name: string; value: string | undefined; quote?: "\"" }> = [];
  if (request.id !== undefined) {
    replacements.push({ name: "id", value: request.id || undefined });
  }
  if (request.role !== undefined) {
    replacements.push({ name: "role", value: request.role || undefined });
  }
  if (request.width !== undefined) {
    replacements.push({ name: "width", value: request.width || undefined });
  }
  if (request.frame !== undefined) {
    if (request.frame && !FRAME_VALUES.has(request.frame)) {
      return blocked(current, diagnostic("writeback.appearance-frame", `Unsupported frame value: ${request.frame}`));
    }
    replacements.push({ name: "frame", value: request.frame || undefined });
  }
  if (request.grid !== undefined) {
    if (request.grid && !GRID_VALUES.has(request.grid)) {
      return blocked(current, diagnostic("writeback.appearance-grid", `Unsupported grid value: ${request.grid}`));
    }
    replacements.push({ name: "grid", value: request.grid || undefined });
  }
  if (request.stripes !== undefined) {
    if (request.stripes && !STRIPES_VALUES.has(request.stripes)) {
      return blocked(current, diagnostic("writeback.appearance-stripes", `Unsupported stripes value: ${request.stripes}`));
    }
    replacements.push({ name: "stripes", value: request.stripes || undefined });
  }

  let result: WriteBackResult = { ok: true, source: current.raw, diagnostics: [] };
  for (const replacement of replacements) {
    result = patchAttribute(parseAsciiDocTable(result.source), replacement.name, replacement.value, { quote: replacement.quote });
    if (!result.ok) {
      return result;
    }
  }
  if (request.autowidth !== undefined) {
    result = patchOption(parseAsciiDocTable(result.source), "autowidth", request.autowidth);
  }
  return result;
}

function updateCellSpecStyle(
  cellSpecRaw: string,
  request: Pick<PlainCellStyleRangeReplacement, "style" | "horizontalAlign" | "verticalAlign">
): string {
  const span = cellSpecRaw.match(/^(?:\d+\*)?(?:\d+)?(?:\.\d+)?\+/u)?.[0] ?? cellSpecRaw.match(/^\d+\*/u)?.[0] ?? "";
  let rest = cellSpecRaw.slice(span.length);
  rest = rest.replace(/\.([<^>])/gu, "").replace(/[<^>]/gu, "");
  rest = rest.replace(/[a-z]$/u, "");
  const horizontal = alignToken(request.horizontalAlign);
  const vertical = request.verticalAlign === undefined ? "" : `.${alignToken(request.verticalAlign)}`;
  const style = request.style ?? "";
  return `${span}${horizontal}${vertical}${style}${rest}`;
}

function buildColumnSpec(raw: string, request: ColumnSpecUpdate): string {
  let rest = raw.replace(/^(\d+(?:\.\d+)?%?)/u, "");
  rest = rest.replace(/\.([<^>])/gu, "").replace(/[<^>]/gu, "").replace(/[a-z]$/u, "");
  const width = request.widthRaw ?? raw.match(/^(\d+(?:\.\d+)?%?)/u)?.[1] ?? "";
  const horizontal = alignToken(request.horizontalAlign);
  const vertical = request.verticalAlign === undefined ? "" : `.${alignToken(request.verticalAlign)}`;
  const style = request.style ?? "";
  return `${width}${horizontal}${vertical}${style}${rest}`;
}

function alignToken(value: ColumnSpecUpdate["horizontalAlign"] | ColumnSpecUpdate["verticalAlign"]): string {
  if (value === "left" || value === "top") {
    return "<";
  }
  if (value === "center" || value === "middle") {
    return "^";
  }
  if (value === "right" || value === "bottom") {
    return ">";
  }
  return "";
}

function unsafeStructuredEditDiagnostic(table: LosslessTable, message: string): TableDiagnostic | undefined {
  const attributeUnsafe = unsafeAttributeEditDiagnostic(table);
  if (attributeUnsafe !== undefined) {
    return attributeUnsafe;
  }
  const gridDiagnostic = projectGridModel(table).diagnostics.find((entry) => entry.severity === "error" || entry.code === "grid.ragged-row");
  if (gridDiagnostic !== undefined) {
    return { ...gridDiagnostic, code: "writeback.unsafe-grid", message };
  }
  return undefined;
}

function unsafeAttributeEditDiagnostic(table: LosslessTable): TableDiagnostic | undefined {
  const error = table.errors.find((entry) => entry.severity === "error");
  if (error !== undefined) {
    return { ...error, code: "writeback.unsafe-table", message: "Table attributes cannot be patched safely" };
  }
  if (table.attributes.format !== undefined && table.attributes.format !== "psv") {
    return diagnostic("writeback.unsupported-data-table", "Structured table attribute edits support only pipe-separated AsciiDoc tables");
  }
  return undefined;
}

function unsafeCellSpecPatchDiagnostic(cell: LosslessTableCell): TableDiagnostic | undefined {
  if (cell.errors.length > 0) {
    return diagnostic("writeback.unsafe-cell-diagnostics", `Cell ${cell.nodeId} has diagnostics and cannot be patched safely`, cell.nodeId);
  }
  if (cell.isBlockContent) {
    return diagnostic("writeback.unsafe-block-cell", `Block cell ${cell.nodeId} cannot be styled safely`, cell.nodeId);
  }
  if ((cell.duplicateCount ?? 1) > 1 || hasUnsupportedDuplicateSpec(cell.cellSpecRaw)) {
    return diagnostic("writeback.unsafe-duplicate-cell", `Duplicate shorthand cell ${cell.nodeId} cannot be styled safely`, cell.nodeId);
  }
  return undefined;
}

function hasUnsupportedDuplicateSpec(cellSpecRaw: string): boolean {
  return cellSpecRaw.includes("*");
}

function patchOption(table: LosslessTable, option: string, enabled: boolean): WriteBackResult {
  const options = new Set(table.attributes.options);
  if (enabled) {
    options.add(option);
  } else {
    options.delete(option);
  }
  return patchOptionsAttribute(table, Array.from(options), [option]);
}

function patchOptionsAttribute(table: LosslessTable, options: readonly string[], controlled: readonly string[]): WriteBackResult {
  const controlledSet = new Set(controlled);
  const optionEntries = table.attributes.entries.filter((entry) => entry.kind === "option" && controlledSet.has((entry.value ?? "").toLowerCase()));
  const sourceWithoutOptionShorthand = optionEntries.length === 0
    ? table.raw
    : applyReplacements(table.raw, optionEntries.map((entry) => optionEntryRemoval(table, entry, controlledSet)));
  const reparsed = sourceWithoutOptionShorthand === table.raw ? table : parseAsciiDocTable(sourceWithoutOptionShorthand);
  const namedOptions = reparsed.attributes.entries.find((entry) => entry.kind === "named" && entry.name === "options");
  if (namedOptions !== undefined) {
    const remaining = new Set(
      (namedOptions.value ?? "")
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0 && !controlledSet.has(value))
    );
    for (const option of options) {
      remaining.add(option);
    }
    return patchAttribute(reparsed, "options", Array.from(remaining).join(","), { omitWhenEmpty: true });
  }
  return patchAttribute(reparsed, "options", options.join(","), { omitWhenEmpty: true });
}

function patchAttribute(
  table: LosslessTable,
  name: string,
  value: string | undefined,
  options: { quote?: "\"" | "'"; omitWhenEmpty?: boolean } = {}
): WriteBackResult {
  const existing = findNamedEntry(table, name);
  if ((value === undefined || value.length === 0) && options.omitWhenEmpty) {
    if (existing === undefined) {
      return { ok: true, source: table.raw, diagnostics: [] };
    }
    return { ok: true, source: applyReplacements(table.raw, [entryRemoval(table.raw, existing)]), diagnostics: [] };
  }

  if (existing !== undefined && existing.valueRange !== undefined && value !== undefined && !(options.quote !== undefined && existing.quote === undefined)) {
    return {
      ok: true,
      source: applyReplacements(table.raw, [{ start: existing.valueRange.start.offset, end: existing.valueRange.end.offset, text: value }]),
      diagnostics: []
    };
  }
  if (existing !== undefined && value !== undefined) {
    const rendered = renderNamedAttribute(name, value, existing.quote ?? options.quote);
    return { ok: true, source: applyReplacements(table.raw, [{ start: existing.range.start.offset, end: existing.range.end.offset, text: rendered }]), diagnostics: [] };
  }
  if (value === undefined || value.length === 0) {
    return { ok: true, source: table.raw, diagnostics: [] };
  }

  const rendered = `[${renderNamedAttribute(name, value, options.quote)}]\n`;
  const insertAt = delimiterStartOffset(table);
  return {
    ok: true,
    source: table.raw.slice(0, insertAt) + rendered + table.raw.slice(insertAt),
    diagnostics: []
  };
}

function findNamedEntry(table: LosslessTable, name: string): TableAttributeEntry | undefined {
  return table.attributes.entries.find((entry) => entry.kind === "named" && entry.name === name);
}

function renderNamedAttribute(name: string, value: string, quote: "\"" | "'" | undefined): string {
  return `${name}=${quote ?? ""}${value}${quote ?? ""}`;
}

function entryRemoval(source: string, entry: TableAttributeEntry): { start: number; end: number; text: string } {
  let start = entry.range.start.offset;
  let end = entry.range.end.offset;
  if (source[end] === ",") {
    end += 1;
    while (source[end] === " ") {
      end += 1;
    }
  } else {
    while (source[start - 1] === " ") {
      start -= 1;
    }
    if (source[start - 1] === ",") {
      start -= 1;
    }
  }
  return { start, end, text: "" };
}

function optionEntryRemoval(table: LosslessTable, entry: TableAttributeEntry, controlled: ReadonlySet<string>): { start: number; end: number; text: string } {
  const line = table.attributes.lines.find((candidate) =>
    candidate.range.start.offset <= entry.range.start.offset &&
    candidate.range.end.offset >= entry.range.end.offset
  );
  if (line !== undefined && line.entries.length > 0 && line.entries.every((candidate) => candidate.kind === "option" && controlled.has((candidate.value ?? "").toLowerCase()))) {
    let end = line.range.end.offset;
    if (table.raw[end] === "\r" && table.raw[end + 1] === "\n") {
      end += 2;
    } else if (table.raw[end] === "\n" || table.raw[end] === "\r") {
      end += 1;
    }
    return { start: line.range.start.offset, end, text: "" };
  }
  return entryRemoval(table.raw, entry);
}

function patchTitle(table: LosslessTable, title: string): string {
  if (table.attributes.title !== undefined) {
    return applyReplacements(table.raw, [{
      start: table.attributes.title.valueRange.start.offset,
      end: table.attributes.title.valueRange.end.offset,
      text: title
    }]);
  }
  const insertAt = delimiterStartOffset(table);
  return table.raw.slice(0, insertAt) + `.${title}\n` + table.raw.slice(insertAt);
}

function diagnostic(code: string, message: string, nodeId?: string): TableDiagnostic {
  return { code, severity: "error", message, nodeId };
}

function delimiterStartOffset(table: LosslessTable): number {
  const delimiter = table.delimiter.startRaw;
  if (delimiter.length === 0) {
    return 0;
  }
  const lineStart = table.raw.indexOf(delimiter);
  return lineStart < 0 ? 0 : lineStart;
}
