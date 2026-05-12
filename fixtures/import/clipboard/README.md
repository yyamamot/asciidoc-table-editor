# Clipboard Import Fixtures

This directory stores clipboard payload fixtures for `parseClipboardTable()`.

## Capture Real macOS Clipboard Payloads

1. Copy a table from the source application.
2. Run:

```bash
pnpm run capture:clipboard-fixture -- word-desktop-mac-actual-table
```

The command writes:

- `<fixture-id>.html`
- `<fixture-id>.txt`
- `<fixture-id>.metadata.json`

Use source-specific fixture IDs:

- `word-desktop-mac-actual-table`
- `word-web-chrome-actual-table`
- `excel-desktop-mac-actual-table`
- `excel-web-chrome-actual-table`

## Seed Fixtures

The `word-*-table.html` and `excel-*-table.html` files are representative seed payloads. They are not a substitute for captured Word / Excel payloads. Replace or supplement them with captured payloads when those apps are available.
