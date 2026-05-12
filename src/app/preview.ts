export interface TableEditorPreviewRenderResult {
  readonly html: string;
  readonly diagnostics: Array<{
    readonly code: string;
    readonly severity: "error" | "warning" | "info";
    readonly message: string;
    readonly nodeId?: string;
  }>;
}

export function sanitizePreviewHtml(input: string): string {
  return input
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, "")
    .replace(/\sstyle\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, "")
    .replace(/\son[a-z][\w:-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, "")
    .replace(/\s(?:href|src)\s*=\s*(["'])\s*(?:javascript:|data:|vbscript:)[\s\S]*?\1/giu, "")
    .replace(/\s(?:href|src)\s*=\s*(?:javascript:|data:|vbscript:)[^\s>]*/giu, "");
}
