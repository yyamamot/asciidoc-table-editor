import type { TableAttributes, TableColumnSpec } from "./types";
import type { SourceLine } from "./parser-source";

export function parseTableAttributes(
  lines: Array<Pick<SourceLine, "index" | "text">>,
  delimiterLineIndex: number
): TableAttributes {
  if (delimiterLineIndex <= 0) {
    return { options: [], columns: [] };
  }

  const attributeLine = [...lines.slice(0, delimiterLineIndex)]
    .reverse()
    .find((line) => line.text.trim().startsWith("[") && line.text.trim().endsWith("]"));
  if (attributeLine === undefined) {
    return { options: [], columns: [] };
  }

  const attributes = parseAttributeList(attributeLine.text.trim());
  const columns = parseColumnSpecs(attributes.get("cols"));
  return {
    columnCount: columns.length || parseColumnCount(attributes.get("cols")),
    format: attributes.get("format")?.toLowerCase(),
    separator: parseSeparator(attributes.get("separator")),
    options: parseOptions(attributes),
    columns
  };
}

function parseAttributeList(raw: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const content = raw.slice(1, -1);
  let currentKey: string | undefined;
  for (const part of splitAttributeParts(content)) {
    const trimmed = part.trim();
    if (trimmed.startsWith("%")) {
      const optionValues = trimmed.slice(1).split("%").map((value) => value.trim()).filter(Boolean);
      const existing = attributes.get("options");
      attributes.set("options", [...(existing ? splitAttributeParts(existing) : []), ...optionValues].join(","));
      currentKey = "options";
      continue;
    }

    const [key, ...valueParts] = part.split("=");
    if (valueParts.length === 0) {
      if (currentKey === "options" && trimmed.length > 0) {
        const existing = attributes.get("options");
        attributes.set("options", [existing, trimmed].filter(Boolean).join(","));
      }
      continue;
    }
    currentKey = key.trim();
    attributes.set(currentKey, unquote(valueParts.join("=").trim()));
  }
  return attributes;
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
  const parts: string[] = [];
  let current = "";
  let quote: string | undefined;
  for (const character of content) {
    if ((character === "\"" || character === "'") && quote === undefined) {
      quote = character;
    } else if (character === quote) {
      quote = undefined;
    }

    if (character === "," && quote === undefined) {
      parts.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  parts.push(current);
  return parts;
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

