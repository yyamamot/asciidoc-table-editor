export type MutationQueueOutcome = "completed" | "discarded";

export class TableEditorMutationQueue {
  private tail: Promise<void> = Promise.resolve();
  private disposed = false;
  private readonly pendingOperationIds = new Set<string>();
  private readonly completedOperationIds = new Set<string>();
  private readonly completedOrder: string[] = [];

  enqueue(operationId: string, task: () => void | Promise<void>): Promise<MutationQueueOutcome> {
    if (this.pendingOperationIds.has(operationId) || this.completedOperationIds.has(operationId)) {
      return Promise.resolve("discarded");
    }
    this.pendingOperationIds.add(operationId);
    const run = this.tail.then(async (): Promise<MutationQueueOutcome> => {
      if (this.disposed) {
        return "discarded";
      }
      await task();
      return "completed";
    });
    void run.finally(() => {
      this.pendingOperationIds.delete(operationId);
      this.completedOperationIds.add(operationId);
      this.completedOrder.push(operationId);
      if (this.completedOrder.length > 256) {
        const oldest = this.completedOrder.shift();
        if (oldest !== undefined) this.completedOperationIds.delete(oldest);
      }
    }).catch(() => undefined);
    this.tail = run.then(() => undefined, () => undefined);
    return run;
  }

  dispose(): void {
    this.disposed = true;
  }
}

export function operationIdOf(message: unknown): string | undefined {
  if (typeof message !== "object" || message === null) return undefined;
  const operationId = (message as { operationId?: unknown }).operationId;
  return typeof operationId === "string" && operationId.length > 0 ? operationId : undefined;
}
