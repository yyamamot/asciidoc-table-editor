import { createHash, randomUUID } from "node:crypto";
import * as vscode from "vscode";
import { findAsciiDocTableBlock, findAsciiDocTableBlocks, type TableBlockMatch } from "../core";

export type TrackedAnchor =
  | {
      readonly status: "valid";
      readonly lastKnownStart: number;
      readonly lastKnownEnd: number;
      readonly affinity: "table-block";
    }
  | { readonly status: "invalid" };

export type WriteBackConflictReason =
  | "revision-mismatch"
  | "document-replaced"
  | "table-not-found"
  | "table-ambiguous"
  | "table-changed"
  | "expected-raw-mismatch";

export type SessionTargetResolution =
  | { readonly status: "ready"; readonly tableBlock: TableBlockMatch }
  | {
      readonly status: "conflict";
      readonly reason: WriteBackConflictReason;
      readonly documentVersion: number;
      readonly revisionToken: string;
      readonly recoverable: boolean;
    }
  | {
      readonly status: "indeterminate";
      readonly reason: "apply-raced";
      readonly documentVersion: number;
      readonly lastKnownRevisionToken: string;
      readonly sourceState: "unknown";
    };

export type SessionUndoRedoPreparation = {
  readonly status: "ready";
  readonly direction: "undo" | "redo";
  readonly expectedIndex: number;
  readonly expectedRaw: string;
  readonly revisionToken: string;
};

export class TableEditorSessionTarget implements vscode.Disposable {
  readonly documentUri: string;
  baseDocumentVersion: number;
  trackedAnchor: TrackedAnchor;
  tableFingerprint: string;
  expectedRaw: string;
  revisionToken: string;

  private readonly changeSubscription?: vscode.Disposable;
  private readonly document: vscode.TextDocument;
  private lastKnownStart: number;
  private lastKnownEnd: number;
  private applying = false;
  private indeterminate = false;
  private readonly revisions: Array<{ raw: string; documentVersion: number }>;
  private revisionIndex = 0;

  constructor(document: vscode.TextDocument, tableBlock: TableBlockMatch, trackChanges = true) {
    this.document = document;
    this.documentUri = document.uri.toString();
    this.baseDocumentVersion = document.version;
    this.lastKnownStart = tableBlock.range.start.offset;
    this.lastKnownEnd = tableBlock.range.end.offset;
    this.trackedAnchor = this.validAnchor();
    this.tableFingerprint = fingerprint(tableBlock.raw);
    this.expectedRaw = tableBlock.raw;
    this.revisionToken = randomUUID();
    this.revisions = [{ raw: tableBlock.raw, documentVersion: document.version }];
    if (trackChanges) {
      this.changeSubscription = vscode.workspace.onDidChangeTextDocument((event) => this.trackDocumentChange(event));
    }
  }

  dispose(): void {
    this.changeSubscription?.dispose();
  }

  resolve(document: vscode.TextDocument, requestRevisionToken = this.revisionToken): SessionTargetResolution {
    if (this.indeterminate) {
      return this.indeterminateResult(document);
    }
    if (requestRevisionToken !== this.revisionToken) {
      return this.conflict(document, "revision-mismatch");
    }
    if (document !== this.document || document.uri.toString() !== this.documentUri) {
      return this.conflict(document, "document-replaced");
    }
    const candidates = this.anchorCandidates(document);
    if (candidates.length > 1) {
      return this.conflict(document, "table-ambiguous");
    }
    if (this.trackedAnchor.status === "invalid") {
      return this.conflict(document, candidates.length === 0 ? "table-not-found" : "table-changed");
    }

    const candidate = candidates[0];
    if (candidate === undefined) {
      return this.conflict(document, "table-not-found");
    }
    if (candidate.range.start.offset !== this.trackedAnchor.lastKnownStart
      || candidate.range.end.offset !== this.trackedAnchor.lastKnownEnd) {
      return this.conflict(document, "table-changed");
    }
    if (fingerprint(candidate.raw) !== this.tableFingerprint) {
      return this.conflict(document, "table-changed");
    }
    if (candidate.raw !== this.expectedRaw) {
      return this.conflict(document, "expected-raw-mismatch");
    }

    if (document.version !== this.baseDocumentVersion) {
      this.baseDocumentVersion = document.version;
    }
    return { status: "ready", tableBlock: candidate };
  }

  beginApply(): void {
    this.applying = true;
  }

  finishApply(document: vscode.TextDocument, expectedRaw: string): boolean {
    this.applying = false;
    if (document !== this.document || document.uri.toString() !== this.documentUri) {
      this.markIndeterminate();
      return false;
    }
    const candidate = findAsciiDocTableBlock(document.getText(), this.lastKnownStart);
    if (candidate === undefined || candidate.range.start.offset !== this.lastKnownStart || candidate.raw !== expectedRaw) {
      this.markIndeterminate();
      return false;
    }
    this.adopt(document, candidate, expectedRaw, true);
    this.revisions.splice(this.revisionIndex + 1);
    this.revisions.push({ raw: expectedRaw, documentVersion: document.version });
    this.revisionIndex = this.revisions.length - 1;
    if (this.revisions.length > 32) {
      this.revisions.shift();
      this.revisionIndex -= 1;
    }
    return true;
  }

  cancelApply(): void {
    this.applying = false;
  }

  prepareUndoRedo(document: vscode.TextDocument, direction: "undo" | "redo"): SessionUndoRedoPreparation | Exclude<SessionTargetResolution, { status: "ready" }> {
    const resolution = this.resolve(document);
    if (resolution.status !== "ready") {
      return resolution;
    }
    if (this.revisions[this.revisionIndex]?.documentVersion !== document.version) {
      return this.conflict(document, "revision-mismatch");
    }
    const expectedIndex = direction === "undo" ? this.revisionIndex - 1 : this.revisionIndex + 1;
    const expectedRevision = this.revisions[expectedIndex];
    if (expectedRevision === undefined) {
      return this.conflict(document, "revision-mismatch");
    }
    return { status: "ready", direction, expectedIndex, expectedRaw: expectedRevision.raw, revisionToken: this.revisionToken };
  }

  reacquireAfterUndoRedo(document: vscode.TextDocument, preparation: SessionUndoRedoPreparation): SessionTargetResolution {
    if (this.indeterminate) {
      return this.indeterminateResult(document);
    }
    if (document !== this.document || document.uri.toString() !== this.documentUri) {
      return this.conflict(document, "document-replaced");
    }
    if (preparation.revisionToken !== this.revisionToken) {
      return this.conflict(document, "revision-mismatch");
    }
    const candidates = this.anchorCandidates(document);
    if (candidates.length > 1) {
      return this.conflict(document, "table-ambiguous");
    }
    const candidate = candidates[0];
    if (candidate === undefined) {
      return this.conflict(document, "table-not-found");
    }
    if (candidate.range.start.offset !== this.lastKnownStart || candidate.raw !== preparation.expectedRaw) {
      return this.conflict(document, "table-changed");
    }
    this.revisionIndex = preparation.expectedIndex;
    const revision = this.revisions[this.revisionIndex];
    if (revision !== undefined) {
      revision.documentVersion = document.version;
    }
    this.adopt(document, candidate, preparation.expectedRaw, true);
    return { status: "ready", tableBlock: candidate };
  }

  private trackDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    if (this.applying || event.document.uri.toString() !== this.documentUri || this.trackedAnchor.status === "invalid") {
      return;
    }
    const start = this.trackedAnchor.lastKnownStart;
    const end = this.trackedAnchor.lastKnownEnd;
    let deltaBefore = 0;
    for (const change of event.contentChanges) {
      const changeStart = change.rangeOffset;
      const changeEnd = change.rangeOffset + change.rangeLength;
      const insertionAtStart = change.rangeLength === 0 && changeStart === start;
      if (changeEnd <= start && !insertionAtStart) {
        deltaBefore += change.text.length - change.rangeLength;
      } else if (changeStart < end) {
        this.trackedAnchor = { status: "invalid" };
        return;
      }
    }
    this.lastKnownStart = start + deltaBefore;
    this.lastKnownEnd = end + deltaBefore;
    this.trackedAnchor = this.validAnchor();
  }

  private adopt(document: vscode.TextDocument, tableBlock: TableBlockMatch, raw: string, issueToken: boolean): void {
    this.baseDocumentVersion = document.version;
    this.lastKnownStart = tableBlock.range.start.offset;
    this.lastKnownEnd = tableBlock.range.end.offset;
    this.trackedAnchor = this.validAnchor();
    this.expectedRaw = raw;
    this.tableFingerprint = fingerprint(raw);
    if (issueToken) {
      this.revisionToken = randomUUID();
    }
  }

  private markIndeterminate(): void {
    this.applying = false;
    this.indeterminate = true;
    this.trackedAnchor = { status: "invalid" };
  }

  private anchorCandidates(document: vscode.TextDocument): TableBlockMatch[] {
    return findAsciiDocTableBlocks(document.getText()).filter((candidate) =>
      candidate.range.start.offset < this.lastKnownEnd && candidate.range.end.offset > this.lastKnownStart
    );
  }

  private conflict(document: vscode.TextDocument, reason: WriteBackConflictReason): Extract<SessionTargetResolution, { status: "conflict" }> {
    return {
      status: "conflict",
      reason,
      documentVersion: document.version,
      revisionToken: this.revisionToken,
      recoverable: true
    };
  }

  private indeterminateResult(document: vscode.TextDocument): Extract<SessionTargetResolution, { status: "indeterminate" }> {
    return {
      status: "indeterminate",
      reason: "apply-raced",
      documentVersion: document.version,
      lastKnownRevisionToken: this.revisionToken,
      sourceState: "unknown"
    };
  }

  private validAnchor(): TrackedAnchor {
    return {
      status: "valid",
      lastKnownStart: this.lastKnownStart,
      lastKnownEnd: this.lastKnownEnd,
      affinity: "table-block"
    };
  }
}

export function createTableEditorSessionTarget(document: vscode.TextDocument, tableBlock: TableBlockMatch): TableEditorSessionTarget {
  return new TableEditorSessionTarget(document, tableBlock);
}

export function createEphemeralTableEditorSessionTarget(document: vscode.TextDocument, tableBlock: TableBlockMatch): TableEditorSessionTarget {
  return new TableEditorSessionTarget(document, tableBlock, false);
}

function fingerprint(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}
