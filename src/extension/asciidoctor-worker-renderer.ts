import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { Worker } from "node:worker_threads";

export interface AsciidoctorWorkerRenderResult {
  readonly ok: boolean;
  readonly html?: string;
  readonly message?: string;
}

export interface AsciidoctorWorkerRenderOptions {
  readonly workerPath?: string;
  readonly vendorNodeModulesPath?: string;
  readonly timeoutMs?: number;
}

export interface AsciidoctorWorkerBatchItem {
  readonly source: string;
}

export interface AsciidoctorWorkerBatchResult extends AsciidoctorWorkerRenderResult {
  readonly index: number;
}

const workerTimeoutMs = 10_000;
const vendorDirectoryName = "asciidoctor-core-3.0.4";
let activeWorkerCount = 0;
let startedWorkerCount = 0;

export async function renderAsciiDocWithVendoredWorker(
  source: string,
  options: AsciidoctorWorkerRenderOptions = {}
): Promise<AsciidoctorWorkerRenderResult> {
  const results = await renderAsciiDocBatchWithVendoredWorker([{ source }], options);
  return results[0] ?? { ok: false, message: "Preview worker did not return HTML" };
}

export async function renderAsciiDocBatchWithVendoredWorker(
  items: readonly AsciidoctorWorkerBatchItem[],
  options: AsciidoctorWorkerRenderOptions = {}
): Promise<AsciidoctorWorkerBatchResult[]> {
  if (items.length === 0) return [];
  const workerPath = options.workerPath ?? resolveWorkerPath();
  const vendorNodeModulesPath = options.vendorNodeModulesPath ?? resolveVendorNodeModulesPath();
  if (!existsSync(workerPath)) {
    return failureResults(items.length, `Preview worker was not found: ${workerPath}`);
  }
  if (!existsSync(join(vendorNodeModulesPath, "@asciidoctor", "core", "package.json"))) {
    return failureResults(items.length, `Vendored Asciidoctor package was not found: ${vendorNodeModulesPath}`);
  }

  return runWorker(workerPath, vendorNodeModulesPath, items.map((item) => item.source), options.timeoutMs ?? workerTimeoutMs);
}

export function previewWorkerLifecycleForTest(): { readonly active: number; readonly started: number } {
  return { active: activeWorkerCount, started: startedWorkerCount };
}

export function resetPreviewWorkerLifecycleForTest(): void {
  if (activeWorkerCount !== 0) {
    throw new Error("Cannot reset preview worker lifecycle while workers are active");
  }
  startedWorkerCount = 0;
}

export function resolvePreviewVendorNodeModulesPathForSmoke(): string {
  return resolveVendorNodeModulesPath();
}

export function resolvePreviewWorkerPathForSmoke(): string {
  return resolveWorkerPath();
}

function runWorker(
  workerPath: string,
  vendorNodeModulesPath: string,
  sources: readonly string[],
  timeoutMs: number
): Promise<AsciidoctorWorkerBatchResult[]> {
  return new Promise((resolve) => {
    const worker = new Worker(workerPath, {
      workerData: {
        sources,
        vendorNodeModulesPath
      }
    });
    activeWorkerCount += 1;
    startedWorkerCount += 1;
    let settled = false;
    let timeout: NodeJS.Timeout;
    const finish = (results: AsciidoctorWorkerBatchResult[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      void worker.terminate().catch(() => undefined).finally(() => {
        activeWorkerCount -= 1;
        resolve(results);
      });
    };
    timeout = setTimeout(() => {
      finish(failureResults(sources.length, `Preview worker timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    worker.once("message", (message: unknown) => {
      finish(parseWorkerMessage(message, sources.length));
    });

    worker.once("error", (error) => {
      finish(failureResults(sources.length, error.message));
    });

    worker.once("exit", (code) => {
      if (!settled) finish(failureResults(sources.length, `Preview worker exited before returning a batch (code ${code})`));
    });
  });
}

function parseWorkerMessage(message: unknown, expectedCount: number): AsciidoctorWorkerBatchResult[] {
  if (typeof message !== "object" || message === null) {
    return failureResults(expectedCount, "Preview worker returned an invalid message");
  }
  const record = message as { results?: unknown };
  if (!Array.isArray(record.results) || record.results.length !== expectedCount) {
    return failureResults(expectedCount, "Preview worker returned an invalid batch");
  }
  const results: AsciidoctorWorkerBatchResult[] = [];
  for (let index = 0; index < expectedCount; index += 1) {
    if (!Object.hasOwn(record.results, index)) return failureResults(expectedCount, "Preview worker returned a sparse batch");
    const entry = record.results[index];
    if (typeof entry !== "object" || entry === null || (entry as { index?: unknown }).index !== index) {
      return failureResults(expectedCount, "Preview worker returned an invalid batch item");
    }
    const item = entry as { ok?: unknown; html?: unknown; message?: unknown };
    if (item.ok === true && typeof item.html === "string") {
      results.push({ index, ok: true, html: item.html });
    } else if (item.ok === false && typeof item.message === "string") {
      results.push({ index, ok: false, message: item.message });
    } else {
      return failureResults(expectedCount, "Preview worker returned an invalid batch item");
    }
  }
  return results;
}

function failureResults(count: number, message: string): AsciidoctorWorkerBatchResult[] {
  return Array.from({ length: count }, (_, index) => ({ index, ok: false, message }));
}

function resolveWorkerPath(): string {
  const distWorkerPath = join(__dirname, "workers", "asciidoctor-preview-worker.cjs");
  if (existsSync(distWorkerPath)) {
    return distWorkerPath;
  }
  return join(__dirname, "asciidoctor-preview-worker.cjs");
}

function resolveVendorNodeModulesPath(): string {
  const distVendorPath = join(__dirname, "vendor", vendorDirectoryName, "node_modules");
  if (existsSync(distVendorPath)) {
    return distVendorPath;
  }
  return join(dirname(dirname(__dirname)), "node_modules");
}
