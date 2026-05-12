import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
  const workspacePath = process.cwd();
  const runId = `integration-host-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`;
  const runRoot = join(workspacePath, ".tmp", "integration-host", runId);
  const userDataDir = join(runRoot, "user-data");
  const extensionsDir = join(runRoot, "extensions");
  mkdirSync(userDataDir, { recursive: true });
  mkdirSync(extensionsDir, { recursive: true });

  await runTests({
    extensionDevelopmentPath: workspacePath,
    extensionTestsPath: join(workspacePath, "out", "test", "integration-host", "suite.js"),
    launchArgs: [
      join(workspacePath, "fixtures", "lossless"),
      "--user-data-dir",
      userDataDir,
      "--extensions-dir",
      extensionsDir
    ],
    extensionTestsEnv: {
      ASCIIDOC_TABLE_ENABLE_TEST_COMMANDS: "1"
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
