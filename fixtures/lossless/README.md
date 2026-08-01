# Lossless Fixtures

`*/source.adoc`がlossless fixture inventoryの正本である。全fixtureは次を必須とする。

- `source.adoc`: 入力source
- `expect.lossless.summary.json`: `schemaVersion: 1`のcompact AST / Grid summary
- `expect.noop.adoc`: no-op emit結果。`source.adoc`とUTF-16 text equalityであること

`expect.diagnostics.json`はdiagnosticを期待するfixtureだけに置く。不在はdiagnosticなしを意味する。entryは`code` / `severity`だけを持ち、canonical sort後の重複を含む実結果とexactに一致させる。`expect.table.json` / `expect.grid.json`は必要時だけ追加する。

通常testはexpectationを自動更新しない。fixture更新時はsource、summary、noop、必要なdiagnosticsを同じ変更へ含め、metadataとsource ownershipの差分をreviewする。
