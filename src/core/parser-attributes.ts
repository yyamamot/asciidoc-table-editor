import type { SourceLine, SourcePositionIndex } from "./parser-source";
import { range } from "./parser-source";
import type { TableAttributeEntry, TableAttributeLine, TableAttributes, TableColumnSpec, TableTitle } from "./types";

export function parseTableAttributes(
  source: string,
  lines: SourceLine[],
  delimiterLineIndex: number,
  positionIndex: SourcePositionIndex
): TableAttributes {
  const empty = (): TableAttributes => ({ options: [], columns: [], lines: [], entries: [], named: {} });
  if (delimiterLineIndex <= 0) {
    return empty();
  }

  const attributeLines = collectTableAttributeLines(lines, delimiterLineIndex);
  const title = collectTableTitle(source, lines, delimiterLineIndex, attributeLines, positionIndex);
  if (attributeLines.length === 0) {
    return { ...empty(), title };
  }

  const parsedLines = attributeLines.map((line) => parseAttributeLine(source, line, positionIndex));
  const entries = parsedLines.flatMap((line) => line.entries);
  const attributes = mergeAttributeLists(parsedLines.map((line) => entriesToAttributeMap(line.entries)));
  const columns = parseColumnSpecs(attributes.get("cols"));
  return {
    columnCount: columns.length || parseColumnCount(attributes.get("cols")),
    format: attributes.get("format")?.toLowerCase(),
    separator: parseSeparator(attributes.get("separator")),
    options: parseOptions(attributes),
    columns,
    lines: parsedLines,
    entries,
    title,
    named: Object.fromEntries(Array.from(attributes.entries()).filter(([key]) => key !== "options"))
  };
}

function collectTableAttributeLines(
  lines: SourceLine[],
  delimiterLineIndex: number
): SourceLine[] {
  const attributeLines: SourceLine[] = [];
  for (let index = delimiterLineIndex - 1; index >= 0; index -= 1) {
    const line = lines[index];
    const trimmed = line.text.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      attributeLines.push(line);
      continue;
    }
    break;
  }
  return attributeLines.reverse();
}

function collectTableTitle(
  source: string,
  lines: SourceLine[],
  delimiterLineIndex: number,
  attributeLines: readonly SourceLine[],
  positionIndex: SourcePositionIndex
): TableTitle | undefined {
  const titleLineIndex = attributeLines[0]?.index === undefined ? delimiterLineIndex - 1 : attributeLines[0].index - 1;
  const line = lines[titleLineIndex];
  if (line === undefined) {
    return undefined;
  }
  const trimmedStart = line.text.match(/^\s*/u)?.[0].length ?? 0;
  if (line.text[trimmedStart] !== "." || line.text[trimmedStart + 1] === "." || line.text.slice(trimmedStart + 1).trim().length === 0) {
    return undefined;
  }
  const valueStart = line.offset + trimmedStart + 1;
  const valueEnd = line.offset + line.text.length;
  return {
    raw: line.text,
    text: line.text.slice(trimmedStart + 1),
    range: range(positionIndex, line.offset, line.offset + line.text.length),
    valueRange: range(positionIndex, valueStart, valueEnd)
  };
}

function mergeAttributeLists(lists: Map<string, string>[]): Map<string, string> {
  const merged = new Map<string, string>();
  for (const attributes of lists) {
    for (const [key, value] of attributes) {
      if (key === "options") {
        const existing = merged.get("options");
        merged.set("options", [existing, value].filter(Boolean).join(","));
        continue;
      }
      merged.set(key, value);
    }
  }
  return merged;
}

function entriesToAttributeMap(entries: readonly TableAttributeEntry[]): Map<string, string> {
  const attributes = new Map<string, string>();
  let currentKey: string | undefined;
  for (const entry of entries) {
    const trimmed = entry.raw.trim();
    if (entry.kind === "option") {
      const optionValues = (entry.value ?? trimmed.replace(/^%/u, "")).split("%").map((value) => value.trim()).filter(Boolean);
      const existing = attributes.get("options");
      attributes.set("options", [...(existing ? splitAttributeParts(existing) : []), ...optionValues].join(","));
      currentKey = "options";
      continue;
    }

    if (entry.kind === "positional") {
      if (currentKey === "options" && trimmed.length > 0) {
        const existing = attributes.get("options");
        attributes.set("options", [existing, trimmed].filter(Boolean).join(","));
      }
      continue;
    }
    currentKey = entry.name;
    if (entry.name !== undefined) {
      attributes.set(entry.name, entry.value ?? "");
    }
  }
  return attributes;
}

function parseAttributeLine(source: string, line: SourceLine, positionIndex: SourcePositionIndex): TableAttributeLine {
  const text = line.text.trim();
  const trimmedStart = line.text.indexOf("[");
  const content = text.slice(1, -1);
  const contentOffset = line.offset + trimmedStart + 1;
  return {
    raw: line.text,
    range: range(positionIndex, line.offset, line.offset + line.text.length),
    entries: splitAttributePartsWithOffsets(content).map((part) =>
      parseAttributeEntry(part.text, contentOffset + part.start, source, positionIndex)
    )
  };
}

function parseAttributeEntry(
  rawPart: string,
  rawStartOffset: number,
  source: string,
  positionIndex: SourcePositionIndex
): TableAttributeEntry {
  const leading = rawPart.match(/^\s*/u)?.[0].length ?? 0;
  const trailing = rawPart.match(/\s*$/u)?.[0].length ?? 0;
  const trimmed = rawPart.trim();
  const start = rawStartOffset + leading;
  const end = rawStartOffset + rawPart.length - trailing;
  const base = {
    raw: trimmed,
    range: range(positionIndex, start, end)
  };
  if (trimmed.startsWith("%")) {
    return {
      kind: "option",
      ...base,
      value: trimmed.slice(1)
    };
  }

  const equalsIndex = trimmed.indexOf("=");
  if (equalsIndex < 0) {
    return {
      kind: "positional",
      ...base,
      value: trimmed
    };
  }

  const name = trimmed.slice(0, equalsIndex).trim();
  const rawValue = trimmed.slice(equalsIndex + 1).trim();
  const quote = rawValue.startsWith("\"") && rawValue.endsWith("\"") ? "\"" : rawValue.startsWith("'") && rawValue.endsWith("'") ? "'" : undefined;
  const value = unquote(rawValue);
  const rawValueOffset = start + trimmed.indexOf(rawValue);
  const valueStart = rawValueOffset + (quote === undefined ? 0 : 1);
  const valueEnd = rawValueOffset + rawValue.length - (quote === undefined ? 0 : 1);
  return {
    kind: "named",
    ...base,
    name: name.toLowerCase(),
    value,
    valueRange: range(positionIndex, valueStart, valueEnd),
    quote
  };
}

function parseOptions(attributes: Map<string, string>): string[] {
  const raw = attributes.get("options");
  if (raw === undefined) {
    return [];
  }
  return splitAttributeParts(raw)
    .flatMap((part) => part.split(/\s+/u))
    .map((part) => part.trim().replace(/^%/u, "").toLowerCase())
    .filter(Boolean);
}

function parseColumnSpecs(value: string | undefined): TableColumnSpec[] {
  if (value === undefined) {
    return [];
  }

  const specs = splitAttributeParts(value).map((part) => part.trim()).filter(Boolean);
  const expanded = specs.flatMap((spec) => expandColumnSpec(spec));
  return expanded.map((spec, index) => parseColumnSpec(spec, index));
}

function expandColumnSpec(spec: string): string[] {
  const repeat = spec.match(/^(\d+)\*(.*)$/u);
  if (!repeat) {
    return [spec];
  }
  const count = Number.parseInt(repeat[1], 10);
  const repeatedSpec = repeat[2] || "";
  return Array.from({ length: count }, () => repeatedSpec);
}

function parseColumnSpec(raw: string, index: number): TableColumnSpec {
  const spec: TableColumnSpec = { index, raw };
  const widthMatch = raw.match(/^(\d+(?:\.\d+)?%?)/u);
  if (widthMatch) {
    spec.widthRaw = widthMatch[1];
  }

  if (raw.includes("<")) {
    spec.horizontalAlign = "left";
  } else if (raw.includes("^")) {
    spec.horizontalAlign = "center";
  } else if (raw.includes(">")) {
    spec.horizontalAlign = "right";
  }

  if (raw.includes(".<")) {
    spec.verticalAlign = "top";
  } else if (raw.includes(".^")) {
    spec.verticalAlign = "middle";
  } else if (raw.includes(".>")) {
    spec.verticalAlign = "bottom";
  }

  const styleMatch = raw.match(/[a-z]$/u);
  if (styleMatch) {
    spec.style = styleMatch[0];
  }
  return spec;
}

function splitAttributeParts(content: string): string[] {
  return splitAttributePartsWithOffsets(content).map((part) => part.text);
}

function splitAttributePartsWithOffsets(content: string): Array<{ text: string; start: number }> {
  const parts: string[] = [];
  const result: Array<{ text: string; start: number }> = [];
  let current = "";
  let quote: string | undefined;
  let start = 0;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if ((character === "\"" || character === "'") && quote === undefined) {
      quote = character;
    } else if (character === quote) {
      quote = undefined;
    }

    if (character === "," && quote === undefined) {
      parts.push(current);
      result.push({ text: current, start });
      current = "";
      start = index + 1;
    } else {
      current += character;
    }
  }
  parts.push(current);
  result.push({ text: current, start });
  return result;
}

function unquote(value: string): string {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseColumnCount(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const multiplier = value.match(/^(\d+)\*$/u);
  if (multiplier) {
    return Number.parseInt(multiplier[1], 10);
  }
  return splitAttributeParts(value).filter((part) => part.trim().length > 0).length || undefined;
}

function parseSeparator(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return [...value][0];
}
