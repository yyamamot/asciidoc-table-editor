type TokenKind =
  | "attribute"
  | "delimiter"
  | "cell"
  | "span"
  | "style"
  | "link"
  | "strong"
  | "emphasis"
  | "mono";

interface TokenMatch {
  readonly start: number;
  readonly end: number;
  readonly kind: TokenKind;
}

const TOKEN_PATTERNS: ReadonlyArray<{ readonly kind: TokenKind; readonly pattern: RegExp }> = [
  { kind: "delimiter", pattern: /^\|={3,}$/gmu },
  { kind: "attribute", pattern: /^\[[^\]\n]+\]/gmu },
  { kind: "link", pattern: /\b(?:https?:\/\/[^\s\[]+|mailto:[^\s\[]+)\[[^\]\n]+\]/gu },
  { kind: "mono", pattern: /`[^`\n]+`/gu },
  { kind: "strong", pattern: /\*[^*\n]+\*/gu },
  { kind: "emphasis", pattern: /_[^_\n]+_/gu },
  { kind: "span", pattern: /(?:^|[ \t])(?:\d+\*)?(?:\d+(?:\.\d+)?\+|\.\d+\+)(?=[.<^>a-z]*\|)/gmu },
  { kind: "style", pattern: /(?:^|[ \t])(?:[.<^>]+)?[a-z](?=\|)/gmu },
  { kind: "cell", pattern: /\|/gu },
];

export function renderHighlightedAsciiDocSource(source: string): string {
  const tokens = collectTokens(source);
  let output = "";
  let cursor = 0;
  for (const token of tokens) {
    if (token.start < cursor) {
      continue;
    }
    output += escapeHtml(source.slice(cursor, token.start));
    output += `<span class="adoc-hl adoc-hl-${token.kind}">${escapeHtml(source.slice(token.start, token.end))}</span>`;
    cursor = token.end;
  }
  output += escapeHtml(source.slice(cursor));
  return output;
}

function collectTokens(source: string): readonly TokenMatch[] {
  const matches: TokenMatch[] = [];
  for (const { kind, pattern } of TOKEN_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      const value = match[0];
      if (value.length === 0 || match.index === undefined) {
        continue;
      }
      const leadingWhitespace = value.match(/^[ \t]/u)?.[0] ?? "";
      matches.push({
        start: match.index + leadingWhitespace.length,
        end: match.index + value.length,
        kind,
      });
    }
  }
  return matches.sort((left, right) => {
    if (left.start !== right.start) {
      return left.start - right.start;
    }
    return right.end - left.end;
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
