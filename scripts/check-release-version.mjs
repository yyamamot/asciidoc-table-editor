import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const releaseVersion = process.env.RELEASE_VERSION;

if (!/^\d+\.\d+\.\d+$/u.test(releaseVersion ?? "")) {
  throw new Error(`RELEASE_VERSION must match X.Y.Z; received: ${releaseVersion ?? "missing"}`);
}

if (packageJson.version !== releaseVersion) {
  throw new Error(`package.json version ${String(packageJson.version)} does not match release version ${releaseVersion}`);
}

const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
const escapedVersion = releaseVersion.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const sectionPattern = new RegExp(`^##\\s+${escapedVersion}\\s*$([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, "mu");
const section = changelog.match(sectionPattern)?.[1]?.trim();
if (!section) {
  throw new Error(`CHANGELOG.md does not contain a non-empty ## ${releaseVersion} section`);
}

console.log(JSON.stringify({ outcome: "passed", version: releaseVersion }));
