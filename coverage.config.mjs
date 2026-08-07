export const coverageDomains = Object.freeze({
  core: "src/core/",
  app: "src/app/",
  extension: "src/extension/"
});

export const coverageExcludedFiles = Object.freeze({
  core: Object.freeze([]),
  app: Object.freeze([]),
  extension: Object.freeze(["src/extension/types.ts"])
});

// These floors are derived from the clean Node 24 baseline and intentionally
// leave a one-to-two percentage-point rounding margin. Raise them when coverage
// improves; do not lower them without recording a new baseline.
export const coverageThresholds = Object.freeze({
  core: Object.freeze({ lines: 85, statements: 85, functions: 96, branches: 83 }),
  app: Object.freeze({ lines: 62, statements: 62, functions: 61, branches: 81 }),
  extension: Object.freeze({ lines: 50, statements: 50, functions: 39, branches: 55 })
});
