import { readFileSync } from "node:fs";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function compareKeys(basePath, localizedPath) {
  const base = readJson(basePath);
  const localized = readJson(localizedPath);
  const missing = Object.keys(base).filter((key) => !(key in localized));
  const extra = Object.keys(localized).filter((key) => !(key in base));

  return { missing, extra };
}

const checks = [
  ["package.nls.json", "package.nls.ja.json"],
  ["l10n/bundle.l10n.json", "l10n/bundle.l10n.ja.json"]
];

let failed = false;

for (const [basePath, localizedPath] of checks) {
  const { missing, extra } = compareKeys(basePath, localizedPath);
  if (missing.length > 0 || extra.length > 0) {
    failed = true;
    console.error(`${localizedPath} does not match ${basePath}`);
    for (const key of missing) {
      console.error(`  missing: ${key}`);
    }
    for (const key of extra) {
      console.error(`  extra: ${key}`);
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log("l10n keys are covered");
