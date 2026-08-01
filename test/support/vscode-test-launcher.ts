import {
  constants as fsConstants,
  accessSync,
  existsSync,
  lstatSync,
  readFileSync,
  rmSync,
  statSync
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import {
  downloadAndUnzipVSCode,
  type DownloadOptions
} from "@vscode/test-electron";

type DownloadPlatform =
  | "darwin"
  | "darwin-arm64"
  | "win32-x64-archive"
  | "win32-arm64-archive"
  | "linux-x64"
  | "linux-arm64";

export type VSCodeTestTarget = "current" | "minimum";

export type ResolvedVSCodeExecutable = {
  readonly requestedVersion: string;
  readonly platform: string;
  readonly executablePath: string;
  readonly cacheRoot: string;
  readonly cacheState: "clean-download" | "cached" | "recovered";
};

export const VSCODE_TEST_VERSIONS: Readonly<Record<VSCodeTestTarget, string>> = {
  minimum: "1.105.0",
  current: "1.131.0"
};

type DownloadVSCode = (options: Partial<DownloadOptions>) => Promise<string>;

type ResolveVSCodeExecutableOptions = {
  readonly workspacePath: string;
  readonly target: VSCodeTestTarget;
  readonly platform?: DownloadPlatform;
  readonly download?: DownloadVSCode;
};

export async function resolveVSCodeTestExecutable(
  options: ResolveVSCodeExecutableOptions
): Promise<ResolvedVSCodeExecutable> {
  const requestedVersion = VSCODE_TEST_VERSIONS[options.target];
  const platform = options.platform ?? currentDownloadPlatform();
  const cachePath = resolve(options.workspacePath, ".vscode-test");
  const cacheRoot = resolve(cachePath, `vscode-${platform}-${requestedVersion}`);
  const download = options.download ?? downloadAndUnzipVSCode;
  const cacheExistedBeforeDownload = existsSync(cacheRoot);
  let lastFailure: ExecutableValidationError | undefined;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const returnedPath = await download({
      version: requestedVersion,
      platform,
      cachePath
    });

    try {
      const executablePath = validateDownloadedExecutable({
        returnedPath,
        requestedVersion,
        platform,
        cacheRoot
      });
      return {
        requestedVersion,
        platform,
        executablePath,
        cacheRoot,
        cacheState: attempt === 1
          ? "recovered"
          : cacheExistedBeforeDownload
            ? "cached"
            : "clean-download"
      };
    } catch (error) {
      lastFailure = asValidationError(error, returnedPath, platform);
      if (attempt === 1) {
        break;
      }
      removeOwnedCacheForRetry(cachePath, cacheRoot);
    }
  }

  throw new Error([
    "VS Code test launcher preflight failed after one cache recovery attempt.",
    `requestedVersion=${requestedVersion}`,
    `platform=${platform}`,
    `actualExecutable=${lastFailure?.returnedPath ?? "unknown"}`,
    `expectedExecutables=${lastFailure?.candidates.join(",") ?? "unknown"}`,
    `cacheRoot=${cacheRoot}`,
    `reason=${lastFailure?.message ?? "unknown"}`
  ].join(" "));
}

function validateDownloadedExecutable(options: {
  readonly returnedPath: string;
  readonly requestedVersion: string;
  readonly platform: string;
  readonly cacheRoot: string;
}): string {
  assertPathOwnedByCache(options.returnedPath, options.cacheRoot);
  const candidates = executableCandidates(options.returnedPath, options.platform);
  const failures: string[] = [];

  for (const candidate of candidates) {
    if (isSymbolicLink(candidate)) {
      throw new ExecutableValidationError(
        `Refusing a modified application bundle: symbolic links are not accepted (${candidate})`,
        options.returnedPath,
        candidates
      );
    }
  }

  for (const candidate of candidates) {
    try {
      validateExecutableFile(candidate);
      validateBundleMetadata(candidate, options.requestedVersion, options.platform);
      return candidate;
    } catch (error) {
      failures.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new ExecutableValidationError(
    `No valid stable VS Code executable was found. ${failures.join("; ")}`,
    options.returnedPath,
    candidates
  );
}

function isSymbolicLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function executableCandidates(returnedPath: string, platform: string): string[] {
  if (!platform.startsWith("darwin")) {
    return [resolve(returnedPath)];
  }
  const macOSDirectory = dirname(resolve(returnedPath));
  return [join(macOSDirectory, "Electron"), join(macOSDirectory, "Code")];
}

function validateExecutableFile(path: string): void {
  const linkStat = lstatSync(path);
  if (!statSync(path).isFile()) {
    throw new Error("path is not a regular file");
  }
  accessSync(path, fsConstants.X_OK);
}

function validateBundleMetadata(executablePath: string, requestedVersion: string, platform: string): void {
  const appResources = platform.startsWith("darwin")
    ? resolve(dirname(executablePath), "..", "Resources", "app")
    : resolve(dirname(executablePath), "resources", "app");
  const packageMetadata = readJson(join(appResources, "package.json"));
  const productMetadata = readJson(join(appResources, "product.json"));

  if (packageMetadata.version !== requestedVersion) {
    throw new Error(`version mismatch: expected ${requestedVersion}, actual ${String(packageMetadata.version)}`);
  }
  if (productMetadata.quality !== "stable") {
    throw new Error(`quality mismatch: expected stable, actual ${String(productMetadata.quality)}`);
  }
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function removeOwnedCacheForRetry(cachePath: string, cacheRoot: string): void {
  const expectedParent = resolve(cachePath);
  const resolvedCacheRoot = resolve(cacheRoot);
  const relativeCacheRoot = relative(expectedParent, resolvedCacheRoot);
  if (
    relativeCacheRoot.length === 0
    || relativeCacheRoot.startsWith(`..${sep}`)
    || relativeCacheRoot === ".."
    || relativeCacheRoot.includes(sep)
  ) {
    throw new Error(`Refusing to remove VS Code cache outside the owned cache root: ${resolvedCacheRoot}`);
  }
  if (!existsSync(resolvedCacheRoot)) {
    return;
  }
  if (lstatSync(resolvedCacheRoot).isSymbolicLink()) {
    throw new Error(`Refusing to remove symlinked VS Code cache: ${resolvedCacheRoot}`);
  }
  rmSync(resolvedCacheRoot, { recursive: true, force: true });
}

function assertPathOwnedByCache(path: string, cacheRoot: string): void {
  const relativePath = relative(resolve(cacheRoot), resolve(path));
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
    throw new ExecutableValidationError(
      `Downloader returned a path outside the requested cache root: ${path}`,
      path,
      [cacheRoot]
    );
  }
}

function currentDownloadPlatform(): DownloadPlatform {
  if (process.platform === "darwin") {
    return process.arch === "arm64" ? "darwin-arm64" : "darwin";
  }
  if (process.platform === "win32") {
    return process.arch === "arm64" ? "win32-arm64-archive" : "win32-x64-archive";
  }
  if (process.platform === "linux") {
    return process.arch === "arm64" ? "linux-arm64" : "linux-x64";
  }
  throw new Error(`Unsupported VS Code test platform: ${process.platform}/${process.arch}`);
}

function asValidationError(error: unknown, returnedPath: string, platform: string): ExecutableValidationError {
  if (error instanceof ExecutableValidationError) {
    return error;
  }
  return new ExecutableValidationError(
    error instanceof Error ? error.message : String(error),
    returnedPath,
    executableCandidates(returnedPath, platform)
  );
}

class ExecutableValidationError extends Error {
  constructor(
    message: string,
    readonly returnedPath: string,
    readonly candidates: readonly string[]
  ) {
    super(message);
  }
}
