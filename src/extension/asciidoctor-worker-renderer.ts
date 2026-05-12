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

const workerTimeoutMs = 10_000;
const vendorDirectoryName = "asciidoctor-core-3.0.4";

export async function renderAsciiDocWithVendoredWorker(
  source: string,
  options: AsciidoctorWorkerRenderOptions = {}
): Promise<AsciidoctorWorkerRenderResult> {
  const workerPath = options.workerPath ?? resolveWorkerPath();
  const vendorNodeModulesPath = options.vendorNodeModulesPath ?? resolveVendorNodeModulesPath();
  if (!existsSync(workerPath)) {
    return {
      ok: false,
      message: `Preview worker was not found: ${workerPath}`
    };
  }
  if (!existsSync(join(vendorNodeModulesPath, "@asciidoctor", "core", "package.json"))) {
    return {
      ok: false,
      message: `Vendored Asciidoctor package was not found: ${vendorNodeModulesPath}`
    };
  }

  return runWorker(workerPath, vendorNodeModulesPath, source, options.timeoutMs ?? workerTimeoutMs);
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
  source: string,
  timeoutMs: number
): Promise<AsciidoctorWorkerRenderResult> {
  return new Promise((resolve) => {
    const worker = new Worker(workerPath, {
      workerData: {
        source,
        vendorNodeModulesPath
      }
    });
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      void worker.terminate();
      resolve({
        ok: false,
      message: `Preview worker timed out after ${timeoutMs}ms`
    });
    }, timeoutMs);

    worker.once("message", (message: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      void worker.terminate();
      resolve(parseWorkerMessage(message));
    });

    worker.once("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      void worker.terminate();
      resolve({
        ok: false,
        message: error.message
      });
    });

    worker.once("exit", (code) => {
      if (settled || code === 0) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve({
        ok: false,
        message: `Preview worker exited with code ${code}`
      });
    });
  });
}

function parseWorkerMessage(message: unknown): AsciidoctorWorkerRenderResult {
  if (typeof message !== "object" || message === null) {
    return {
      ok: false,
      message: "Preview worker returned an invalid message"
    };
  }
  const record = message as { ok?: unknown; html?: unknown; message?: unknown };
  if (record.ok === true && typeof record.html === "string") {
    return {
      ok: true,
      html: record.html
    };
  }
  return {
    ok: false,
    message: typeof record.message === "string" ? record.message : "Preview worker did not return HTML"
  };
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
