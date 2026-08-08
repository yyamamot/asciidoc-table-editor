import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const version = requiredArg("version");
const checksumsPath = resolve(root, args.checksums ?? "SHA256SUMS.txt");
const outputPath = resolve(root, args.out ?? "release-notes.md");

if (!/^\d+\.\d+\.\d+$/u.test(version)) {
  throw new Error(`--version must match X.Y.Z; received: ${version}`);
}

const changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const sectionPattern = new RegExp(`^##\\s+${escapedVersion}\\s*$([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, "mu");
const changes = changelog.match(sectionPattern)?.[1]?.trim();
if (!changes) {
  throw new Error(`CHANGELOG.md does not contain a non-empty ## ${version} section`);
}

const checksumLines = readFileSync(checksumsPath, "utf8").trim().split(/\r?\n/u).filter(Boolean);
if (checksumLines.length === 0) {
  throw new Error(`${checksumsPath} is empty`);
}

const downloads = checksumLines.map((line) => {
  const [, ...fileNameParts] = line.trim().split(/\s+/u);
  const fileName = fileNameParts.join(" ");
  if (!fileName) {
    throw new Error(`Invalid checksum line: ${line}`);
  }
  return `- \`${fileName}\``;
});

const notes = [
  `# AsciiDoc Table Editor v${version}`,
  "",
  "## Changes",
  "",
  changes,
  "",
  "## Downloads",
  "",
  ...downloads,
  "",
  "Verify the downloaded VSIX with `SHA256SUMS.txt`.",
  ""
].join("\n");

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, notes, "utf8");
console.log(JSON.stringify({ outcome: "created", version, outputPath }));

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      throw new Error(`Unexpected argument: ${value}`);
    }
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function requiredArg(name) {
  const value = args[name];
  if (!value) {
    throw new Error(`Missing required --${name}`);
  }
  return value;
}
