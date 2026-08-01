import { chmodSync, mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveVSCodeTestExecutable,
  type VSCodeTestTarget
} from "../support/vscode-test-launcher";

describe("VS Code test launcher", () => {
  it.each(["Electron", "Code"] as const)("accepts a signed-bundle-shaped %s executable", async (executableName) => {
    const workspacePath = temporaryDirectory();
    const download = async () => createMacBundle(workspacePath, "current", executableName);

    const resolved = await resolveVSCodeTestExecutable({
      workspacePath,
      target: "current",
      platform: "darwin-arm64",
      download
    });

    expect(resolved.executablePath).toMatch(new RegExp(`/${executableName}$`, "u"));
    expect(resolved.cacheState).toBe("clean-download");
  });

  it("reports a cached valid install", async () => {
    const workspacePath = temporaryDirectory();
    const executablePath = createMacBundle(workspacePath, "current", "Code");

    const resolved = await resolveVSCodeTestExecutable({
      workspacePath,
      target: "current",
      platform: "darwin-arm64",
      download: async () => executablePath
    });

    expect(resolved.cacheState).toBe("cached");
  });

  it("maps the minimum target to the pinned minimum VS Code version", async () => {
    const workspacePath = temporaryDirectory();
    const resolved = await resolveVSCodeTestExecutable({
      workspacePath,
      target: "minimum",
      platform: "darwin-arm64",
      download: async () => createMacBundle(workspacePath, "minimum", "Code")
    });

    expect(resolved.requestedVersion).toBe("1.105.0");
    expect(resolved.cacheRoot).toMatch(/vscode-darwin-arm64-1\.105\.0$/u);
  });

  it("prefers Electron when both executable names exist", async () => {
    const workspacePath = temporaryDirectory();
    const returnedPath = createMacBundle(workspacePath, "current", "Electron");
    const codePath = join(dirname(returnedPath), "Code");
    writeFileSync(codePath, "#!/bin/sh\nexit 0\n");
    chmodSync(codePath, 0o755);

    const resolved = await resolveVSCodeTestExecutable({
      workspacePath,
      target: "current",
      platform: "darwin-arm64",
      download: async () => returnedPath
    });

    expect(resolved.executablePath).toBe(returnedPath);
  });

  it("recovers once from a stale complete marker", async () => {
    const workspacePath = temporaryDirectory();
    const cacheRoot = cacheDirectory(workspacePath, "current");
    mkdirSync(cacheRoot, { recursive: true });
    writeFileSync(join(cacheRoot, "is-complete"), "");
    let calls = 0;

    const resolved = await resolveVSCodeTestExecutable({
      workspacePath,
      target: "current",
      platform: "darwin-arm64",
      download: async () => {
        calls += 1;
        const expected = expectedElectronPath(workspacePath, "current");
        if (calls === 2) {
          createMacBundle(workspacePath, "current", "Code");
        }
        return expected;
      }
    });

    expect(calls).toBe(2);
    expect(resolved.cacheState).toBe("recovered");
    expect(resolved.executablePath).toMatch(/\/Code$/u);
  });

  it.each([
    ["missing executable", undefined, undefined],
    ["version mismatch", "0.0.0", "stable"],
    ["quality mismatch", "1.131.0", "insider"]
  ])("fails after one recovery for %s", async (_label, version, quality) => {
    const workspacePath = temporaryDirectory();
    let calls = 0;

    await expect(resolveVSCodeTestExecutable({
      workspacePath,
      target: "current",
      platform: "darwin-arm64",
      download: async () => {
        calls += 1;
        return version
          ? createMacBundle(workspacePath, "current", "Code", { version, quality })
          : expectedElectronPath(workspacePath, "current");
      }
    })).rejects.toThrow(/requestedVersion=1\.131\.0.*expectedExecutables=.*Electron.*Code/u);
    expect(calls).toBe(2);
  });

  it("rejects a non-executable file", async () => {
    const workspacePath = temporaryDirectory();
    let calls = 0;

    await expect(resolveVSCodeTestExecutable({
      workspacePath,
      target: "current",
      platform: "darwin-arm64",
      download: async () => {
        calls += 1;
        const returnedPath = createMacBundle(workspacePath, "current", "Code");
        chmodSync(join(dirname(returnedPath), "Code"), 0o644);
        return expectedElectronPath(workspacePath, "current");
      }
    })).rejects.toThrow(/No valid stable VS Code executable/u);
    expect(calls).toBe(2);
  });

  it("rejects a symlinked executable without modifying the application bundle", async () => {
    const workspacePath = temporaryDirectory();
    let calls = 0;

    await expect(resolveVSCodeTestExecutable({
      workspacePath,
      target: "current",
      platform: "darwin-arm64",
      download: async () => {
        calls += 1;
        const codePath = createMacBundle(workspacePath, "current", "Code");
        symlinkSync(codePath, expectedElectronPath(workspacePath, "current"));
        return expectedElectronPath(workspacePath, "current");
      }
    })).rejects.toThrow(/symbolic links are not accepted/u);
    expect(calls).toBe(2);
  });

  it("does not remove a symlinked cache directory", async () => {
    const workspacePath = temporaryDirectory();
    const externalDirectory = temporaryDirectory();
    mkdirSync(join(workspacePath, ".vscode-test"), { recursive: true });
    symlinkSync(externalDirectory, cacheDirectory(workspacePath, "current"));

    await expect(resolveVSCodeTestExecutable({
      workspacePath,
      target: "current",
      platform: "darwin-arm64",
      download: async () => expectedElectronPath(workspacePath, "current")
    })).rejects.toThrow(/Refusing to remove symlinked VS Code cache/u);
  });

  it("rejects a downloader path outside the version-owned cache", async () => {
    const workspacePath = temporaryDirectory();
    const externalPath = join(temporaryDirectory(), "Code");
    writeFileSync(externalPath, "#!/bin/sh\nexit 0\n");
    chmodSync(externalPath, 0o755);

    await expect(resolveVSCodeTestExecutable({
      workspacePath,
      target: "current",
      platform: "darwin-arm64",
      download: async () => externalPath
    })).rejects.toThrow(/outside the requested cache root/u);
  });
});

function createMacBundle(
  workspacePath: string,
  target: VSCodeTestTarget,
  executableName: "Electron" | "Code",
  metadata: { version?: string; quality?: string } = {}
): string {
  const appRoot = join(cacheDirectory(workspacePath, target), "Visual Studio Code.app", "Contents");
  const executablePath = join(appRoot, "MacOS", executableName);
  const resourcesPath = join(appRoot, "Resources", "app");
  mkdirSync(join(appRoot, "MacOS"), { recursive: true });
  mkdirSync(resourcesPath, { recursive: true });
  writeFileSync(executablePath, "#!/bin/sh\nexit 0\n");
  chmodSync(executablePath, 0o755);
  writeFileSync(join(resourcesPath, "package.json"), JSON.stringify({
    version: metadata.version ?? versionForTarget(target)
  }));
  writeFileSync(join(resourcesPath, "product.json"), JSON.stringify({
    quality: metadata.quality ?? "stable"
  }));
  return expectedElectronPath(workspacePath, target);
}

function expectedElectronPath(workspacePath: string, target: VSCodeTestTarget): string {
  return join(cacheDirectory(workspacePath, target), "Visual Studio Code.app", "Contents", "MacOS", "Electron");
}

function cacheDirectory(workspacePath: string, target: VSCodeTestTarget): string {
  return join(workspacePath, ".vscode-test", `vscode-darwin-arm64-${versionForTarget(target)}`);
}

function versionForTarget(target: VSCodeTestTarget): string {
  return target === "minimum" ? "1.105.0" : "1.131.0";
}

function temporaryDirectory(): string {
  return mkdtempSync(join(tmpdir(), "asciidoc-table-editor-vscode-test-"));
}
