import { Window } from "happy-dom";
import { createWebviewAppModel, renderTableEditorHtml } from "../../src/app";
import {
  mergePlainCellsHorizontally,
  parseAsciiDocTable,
  projectGridModel,
  pasteImportedTable,
  pasteRectangularPlainTable,
  deletePlainColumn,
  deletePlainRow,
  insertPlainColumnAfter,
  insertPlainColumnBefore,
  insertPlainRowAfter,
  insertPlainRowBefore,
  replaceBlockCellContent,
  replacePlainCellWithBlockContent,
  replacePlainCellContent,
  replacePlainCellContents,
  unmergePlainCellHorizontally,
  type WriteBackResult
} from "../../src/core";
import type { TableDiagnostic } from "../../src/core";

export type PostedMessage =
  | { type: "update-cell-content"; sourceCellId: string; contentRaw: string; selectedSourceCellId?: string }
  | { type: "update-cell-contents"; replacements: Array<{ sourceCellId: string; contentRaw: string }>; selectedSourceCellId?: string; diagnostics?: TableDiagnostic[] }
  | { type: "paste-rectangular-table"; startSourceCellId: string; rows: string[][]; selectedSourceCellId?: string; diagnostics?: TableDiagnostic[] }
  | {
      type: "paste-imported-table";
      startSourceCellId: string;
      rowCount: number;
      columnCount: number;
      cells: Array<{ row: number; col: number; rowSpan: number; colSpan: number; text: string }>;
      selectedSourceCellId?: string;
      diagnostics?: TableDiagnostic[];
    }
  | { type: "update-block-cell-source"; sourceCellId: string; contentRaw: string; selectedSourceCellId?: string }
  | { type: "replace-cell-with-block-source"; sourceCellId: string; contentRaw: string; selectedSourceCellId?: string; diagnostics?: TableDiagnostic[] }
  | { type: "request-merge-cells"; sourceCellIds: string[]; selectedSourceCellId?: string }
  | { type: "request-unmerge-cell"; sourceCellId: string; selectedSourceCellId?: string }
  | {
      type:
        | "request-insert-row-before"
        | "request-insert-row-after"
        | "request-delete-row"
        | "request-insert-column-before"
        | "request-insert-column-after"
        | "request-delete-column";
      sourceCellId: string;
      selectedSourceCellId?: string;
    }
  | { type: "request-undo" | "request-redo"; selectedSourceCellId?: string }
  | { type: "request-format-table"; selectedSourceCellId?: string }
  | { type: "apply-format-table"; mode?: string; selectedSourceCellId?: string }
  | { type: "ui-review-snapshot"; snapshot: unknown };


export async function createHarness(
  source: string,
  selectedSourceCellId?: string,
  tablePreviewHtml = "<table><tbody><tr><td>preview</td></tr></tbody></table>",
  options: { exposeVsCodeApi?: boolean; initialState?: unknown; diagnostics?: TableDiagnostic[]; formatReview?: NonNullable<Parameters<typeof createWebviewAppModel>[1]>["formatReview"] } = {}
) {
  const messages: PostedMessage[] = [];
  let vscodeState = options.initialState ?? {};
  const model = createWebviewAppModel(projectGridModel(parseAsciiDocTable(source)), {
    preview: {
      tableHtml: tablePreviewHtml,
      blockCellHtmlBySourceCellId: {
        "cell:0:0": "<ul><li>item</li><li>detail</li></ul>"
      }
    },
    diagnostics: options.diagnostics,
    formatReview: options.formatReview
  });
  const html = renderTableEditorHtml(model, "testNonce", { selectedSourceCellId });
  const window = new Window({ url: "https://webview.test/" });
  (window as unknown as { requestAnimationFrame: (callback: FrameRequestCallback) => number }).requestAnimationFrame = (callback: FrameRequestCallback): number => {
    callback(0);
    return 1;
  };
  window.addEventListener("asciidoc-table-editor-message", (event) => {
    messages.push((event as unknown as CustomEvent<PostedMessage>).detail);
  });
  if (options.exposeVsCodeApi !== false) {
    (window as unknown as { acquireVsCodeApi: () => { postMessage(message: PostedMessage): void; getState(): unknown; setState(state: unknown): void } }).acquireVsCodeApi = () => ({
      postMessage(message: PostedMessage): void {
        messages.push(message);
      },
      getState(): unknown {
        return vscodeState;
      },
      setState(state: unknown): void {
        vscodeState = state ?? {};
      }
    });
  }
  window.document.write(html);
  for (const script of Array.from(window.document.querySelectorAll("script[nonce='testNonce']"))) {
    window.eval(script.textContent ?? "");
  }
  await window.happyDOM.waitUntilComplete();

  return {
    window,
    messages,
    vscodeState(): unknown {
      return vscodeState;
    },
    grid(): HTMLElement {
      const grid = window.document.querySelector("[data-review-target='table-grid']") as unknown as HTMLElement | null;
      if (grid === null) {
        throw new Error("grid not found");
      }
      return grid;
    },
    gridWrap(): HTMLElement {
      const gridWrap = window.document.querySelector(".grid-wrap") as unknown as HTMLElement | null;
      if (gridWrap === null) {
        throw new Error("grid wrap not found");
      }
      return gridWrap;
    },
    cell(sourceCellId: string): HTMLElement {
      const cell = window.document.querySelector(`.cell[data-source-cell-id="${sourceCellId}"][data-kind="origin"]`) as unknown as HTMLElement | null;
      if (cell === null) {
        throw new Error(`cell not found: ${sourceCellId}`);
      }
      return cell;
    },
    button(action: string): HTMLButtonElement {
      const button = window.document.querySelector(`button[data-action="${action}"]`) as unknown as HTMLButtonElement | null;
      if (button === null) {
        throw new Error(`button not found: ${action}`);
      }
      return button;
    },
    modeButton(mode: "edit" | "preview"): HTMLButtonElement {
      const button = window.document.querySelector(`button[data-action="set-editor-mode"][data-editor-mode-value="${mode}"]`) as unknown as HTMLButtonElement | null;
      if (button === null) {
        throw new Error(`mode button not found: ${mode}`);
      }
      return button;
    },
    editorView(mode: "edit" | "preview"): HTMLElement {
      const view = window.document.querySelector(`[data-editor-view="${mode}"]`) as unknown as HTMLElement | null;
      if (view === null) {
        throw new Error(`editor view not found: ${mode}`);
      }
      return view;
    },
    previewScreen(): HTMLElement {
      const screen = window.document.querySelector("[data-review-target='table-preview-screen']") as unknown as HTMLElement | null;
      if (screen === null) {
        throw new Error("preview screen not found");
      }
      return screen;
    },
    previewPane(): HTMLElement {
      const pane = window.document.querySelector("[data-review-target='table-preview']") as unknown as HTMLElement | null;
      if (pane === null) {
        throw new Error("preview pane not found");
      }
      return pane;
    },
    contextMenu(): HTMLElement {
      const menu = window.document.querySelector("[data-context-menu='cell']") as unknown as HTMLElement | null;
      if (menu === null) {
        throw new Error("context menu not found");
      }
      return menu;
    },
    blockPreview(): HTMLElement {
      const panel = window.document.querySelector("[data-inspector-block-preview]") as unknown as HTMLElement | null;
      if (panel === null) {
        throw new Error("block preview not found");
      }
      return panel;
    },
    textarea(control: string): HTMLTextAreaElement {
      const textarea = window.document.querySelector(`textarea[data-inspector-control="${control}"]`) as unknown as HTMLTextAreaElement | null;
      if (textarea === null) {
        throw new Error(`textarea not found: ${control}`);
      }
      return textarea;
    },
    menuItem(action: string): HTMLButtonElement {
      const button = window.document.querySelector(`[data-context-menu="cell"] button[data-action="${action}"]`) as unknown as HTMLButtonElement | null;
      if (button === null) {
        throw new Error(`menu item not found: ${action}`);
      }
      return button;
    },
    openContextMenu(sourceCellId: string): void {
      const cell = window.document.querySelector(`.cell[data-source-cell-id="${sourceCellId}"][data-kind="origin"]`) as unknown as HTMLElement | null;
      if (cell === null) {
        throw new Error(`cell not found: ${sourceCellId}`);
      }
      cell.dispatchEvent(new window.MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 80,
        clientY: 80
      }) as unknown as Event);
    },
    dispatchExtensionMessage(message: unknown): void {
      window.dispatchEvent(new window.MessageEvent("message", { data: message }));
    },
    diagnosticsText(): string {
      return window.document.querySelector("[data-review-target='diagnostics']")?.textContent ?? "";
    },
    keydown(key: string, init: KeyboardEventInit = {}): void {
      (window.document as unknown as { dispatchEvent(event: unknown): boolean }).dispatchEvent(
        new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...(init as Record<string, unknown>) })
      );
    },
    copy(): Record<string, string> {
      const data: Record<string, string> = {};
      const event = new window.Event("copy", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: {
          setData(type: string, value: string): void {
            data[type] = value;
          }
        }
      });
      (window.document as unknown as { dispatchEvent(event: unknown): boolean }).dispatchEvent(event);
      return data;
    },
    paste(text: string): void {
      const event = new window.Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: {
          getData(type: string): string {
            return type === "text/plain" ? text : "";
          }
        }
      });
      (window.document as unknown as { dispatchEvent(event: unknown): boolean }).dispatchEvent(event);
    },
    pasteHtml(html: string, text: string): void {
      const event = new window.Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: {
          getData(type: string): string {
            if (type === "text/html") {
              return html;
            }
            if (type === "text/plain") {
              return text;
            }
            return "";
          }
        }
      });
      (window.document as unknown as { dispatchEvent(event: unknown): boolean }).dispatchEvent(event);
    },
    selectedRangeIds(): string[] {
      return Array.from(window.document.querySelectorAll(".cell.is-range-selected") as unknown as HTMLElement[])
        .map((cell) => cell.dataset.sourceCellId ?? "");
    },
    lastMessage<TType extends PostedMessage["type"]>(type: TType): Extract<PostedMessage, { type: TType }> {
      const message = [...messages].reverse().find((candidate) => candidate.type === type);
      if (message === undefined) {
        throw new Error(`message not posted: ${type}`);
      }
      return message as Extract<PostedMessage, { type: TType }>;
    }
  };
}

export function applyWebviewMessage(source: string, message: PostedMessage): WriteBackResult {
  const table = parseAsciiDocTable(source);
  if (message.type === "update-cell-content") {
    return replacePlainCellContent(table, message.sourceCellId, message.contentRaw);
  }
  if (message.type === "update-cell-contents") {
    return replacePlainCellContents(table, message.replacements);
  }
  if (message.type === "paste-rectangular-table") {
    return pasteRectangularPlainTable(table, {
      startSourceCellId: message.startSourceCellId,
      rows: message.rows
    });
  }
  if (message.type === "paste-imported-table") {
    return pasteImportedTable(table, {
      startSourceCellId: message.startSourceCellId,
      rowCount: message.rowCount,
      columnCount: message.columnCount,
      cells: message.cells
    });
  }
  if (message.type === "update-block-cell-source") {
    return replaceBlockCellContent(table, {
      sourceCellId: message.sourceCellId,
      contentRaw: message.contentRaw
    });
  }
  if (message.type === "replace-cell-with-block-source") {
    return replacePlainCellWithBlockContent(table, {
      sourceCellId: message.sourceCellId,
      contentRaw: message.contentRaw
    });
  }
  if (message.type === "request-merge-cells") {
    return mergePlainCellsHorizontally(table, { sourceCellIds: message.sourceCellIds });
  }
  if (message.type === "request-unmerge-cell") {
    return unmergePlainCellHorizontally(table, { sourceCellId: message.sourceCellId });
  }
  if (message.type === "request-insert-row-before") {
    return insertPlainRowBefore(table, { sourceCellId: message.sourceCellId });
  }
  if (message.type === "request-insert-row-after") {
    return insertPlainRowAfter(table, { sourceCellId: message.sourceCellId });
  }
  if (message.type === "request-delete-row") {
    return deletePlainRow(table, { sourceCellId: message.sourceCellId });
  }
  if (message.type === "request-insert-column-after") {
    return insertPlainColumnAfter(table, { sourceCellId: message.sourceCellId });
  }
  if (message.type === "request-insert-column-before") {
    return insertPlainColumnBefore(table, { sourceCellId: message.sourceCellId });
  }
  if (message.type === "request-delete-column") {
    return deletePlainColumn(table, { sourceCellId: message.sourceCellId });
  }
  return {
    ok: false,
    source,
    diagnostics: [{
      code: "test.unsupported-message",
      severity: "error",
      message: `Unsupported message ${message.type}`
    }]
  };
}
