export interface TableEditorPreviewRenderResult {
  readonly html: string;
  readonly diagnostics: Array<{
    readonly code: string;
    readonly severity: "error" | "warning" | "info";
    readonly message: string;
    readonly nodeId?: string;
  }>;
}

const ALLOWED_TAGS = new Set([
  "a", "abbr", "b", "blockquote", "br", "caption", "code", "col", "colgroup", "dd", "del", "div", "dl", "dt",
  "em", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "kbd", "li", "mark", "ol", "p", "pre", "q", "s",
  "samp", "small", "span", "strong", "sub", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul", "var"
]);
const VOID_TAGS = new Set(["br", "col", "hr"]);
const DROP_CONTENT_TAGS = new Set([
  "base", "embed", "form", "iframe", "link", "math", "meta", "noscript", "object", "script", "style", "svg", "template"
]);
const DROP_VOID_TAGS = new Set(["base", "embed", "link", "meta"]);
const GLOBAL_ATTRIBUTES = new Set(["aria-label", "class", "dir", "id", "lang", "title"]);
const TAG_ATTRIBUTES: Readonly<Record<string, ReadonlySet<string>>> = {
  a: new Set(["href"]),
  col: new Set(["span"]),
  ol: new Set(["start", "type"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan", "scope"])
};

export function sanitizePreviewHtml(input: string): string {
  let output = "";
  let cursor = 0;
  const suppressed: string[] = [];
  while (cursor < input.length) {
    const opening = input.indexOf("<", cursor);
    if (opening < 0) {
      if (suppressed.length === 0) output += input.slice(cursor);
      break;
    }
    if (suppressed.length === 0) output += input.slice(cursor, opening);
    const closing = findTagEnd(input, opening + 1);
    if (closing < 0) {
      if (suppressed.length === 0) output += "&lt;";
      cursor = opening + 1;
      continue;
    }
    const token = input.slice(opening + 1, closing);
    cursor = closing + 1;
    if (/^!--/u.test(token) || /^\s*[!?]/u.test(token)) continue;
    const parsed = parseTag(token);
    if (!parsed) continue;
    if (suppressed.length > 0) {
      if (!parsed.closing && DROP_CONTENT_TAGS.has(parsed.name) && !parsed.selfClosing && !DROP_VOID_TAGS.has(parsed.name)) suppressed.push(parsed.name);
      else if (parsed.closing && parsed.name === suppressed.at(-1)) suppressed.pop();
      continue;
    }
    if (DROP_CONTENT_TAGS.has(parsed.name)) {
      if (!parsed.closing && !parsed.selfClosing && !DROP_VOID_TAGS.has(parsed.name)) suppressed.push(parsed.name);
      continue;
    }
    if (!ALLOWED_TAGS.has(parsed.name)) continue;
    if (parsed.closing) {
      if (!VOID_TAGS.has(parsed.name)) output += `</${parsed.name}>`;
      continue;
    }
    output += `<${parsed.name}${sanitizeAttributes(parsed.name, parsed.attributes)}${VOID_TAGS.has(parsed.name) || parsed.selfClosing ? " />" : ">"}`;
  }
  return output;
}

function findTagEnd(input: string, start: number): number {
  let quote = "";
  for (let index = start; index < input.length; index += 1) {
    const character = input[index];
    if (quote !== "") {
      if (character === quote) quote = "";
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  return -1;
}

function parseTag(token: string): { name: string; closing: boolean; selfClosing: boolean; attributes: string } | undefined {
  const match = token.match(/^\s*(\/)?\s*([A-Za-z][A-Za-z0-9-]*)([\s\S]*?)\s*(\/)?\s*$/u);
  if (!match) return undefined;
  return { name: match[2].toLowerCase(), closing: match[1] === "/", selfClosing: match[4] === "/", attributes: match[3] };
}

function sanitizeAttributes(tagName: string, input: string): string {
  const output: string[] = [];
  const attributePattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gyu;
  let cursor = 0;
  while (cursor < input.length) {
    while (/\s/u.test(input[cursor] ?? "")) cursor += 1;
    if (cursor >= input.length) break;
    attributePattern.lastIndex = cursor;
    const match = attributePattern.exec(input);
    if (!match || match.index !== cursor) break;
    cursor = attributePattern.lastIndex;
    const name = match[1].toLowerCase();
    const allowed = GLOBAL_ATTRIBUTES.has(name) || TAG_ATTRIBUTES[tagName]?.has(name);
    if (!allowed) continue;
    const value = decodeHtmlAttribute(match[2] ?? match[3] ?? match[4] ?? "");
    const sanitized = sanitizeAttributeValue(tagName, name, value);
    if (sanitized !== undefined) output.push(` ${name}="${escapeAttribute(sanitized)}"`);
  }
  return output.join("");
}

function sanitizeAttributeValue(tagName: string, name: string, value: string): string | undefined {
  if (name === "href") {
    const url = value.trim();
    if (!isAllowedPreviewUrl(url)) return undefined;
    return url.startsWith("#") ? `#preview-${url.slice(1)}` : url;
  }
  if (name === "id") return /^[_A-Za-z][_A-Za-z0-9:.-]{0,127}$/u.test(value) ? `preview-${value}` : undefined;
  if (name === "class") {
    const tokens = value.split(/\s+/u).filter((token) => /^[A-Za-z0-9_-]{1,64}$/u.test(token));
    return tokens.length > 0 ? tokens.slice(0, 32).join(" ") : undefined;
  }
  if (name === "dir") return value === "ltr" || value === "rtl" || value === "auto" ? value : undefined;
  if (name === "colspan" || name === "rowspan" || (tagName === "col" && name === "span")) {
    return /^(?:[1-9]|[1-9][0-9]{1,2}|1000)$/u.test(value) ? value : undefined;
  }
  if (name === "scope") return ["col", "colgroup", "row", "rowgroup"].includes(value) ? value : undefined;
  if (tagName === "ol" && name === "type") return ["1", "a", "A", "i", "I"].includes(value) ? value : undefined;
  if (tagName === "ol" && name === "start") return /^-?[0-9]{1,6}$/u.test(value) ? value : undefined;
  return value.slice(0, 1024);
}

function isAllowedPreviewUrl(value: string): boolean {
  const normalized = value.trim();
  if (normalized.startsWith("#")) return !/[\u0000-\u001f\u007f]/u.test(normalized);
  if (/[\u0000-\u0020\u007f]/u.test(normalized) || normalized.startsWith("//")) return false;
  try {
    const url = new URL(normalized);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/giu, (_match, hex: string) => safeCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);?/gu, (_match, decimal: string) => safeCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&(colon|tab|newline);/giu, (_match, name: string) => name.toLowerCase() === "colon" ? ":" : name.toLowerCase() === "tab" ? "\t" : "\n")
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, '"')
    .replace(/&apos;/giu, "'")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">");
}

function safeCodePoint(value: number): string {
  return Number.isInteger(value) && value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : "";
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
