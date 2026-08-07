# Changelog

## Unreleased

- **BREAKING CHANGE:** Preserve implicit table headers and existing `cols` specifications during formatting; Cell-per-line output no longer replaces custom column widths, alignment, or styles with `[cols=N*]`, and may materialize an implicit header as `%header`.
- Keep Table Editor write-back attached to the intended table, stop safely after conflicting external edits, and prevent rapid operations or stale responses from rolling the grid back.
- Sanitize rendered table previews with an allowlist and restrict preview resources and links with a tighter Content Security Policy.
- Speed up previews for tables with many block cells through batched rendering and caching.
- Improve Grid and structure-menu keyboard navigation, restore focus after menu actions, and announce merged cells and selected ranges to screen readers.
- Apply the active VS Code locale to the Table Editor and provide consistent English and Japanese diagnostic messages.
- Fix Column spec and Table appearance panels so existing source values are loaded into the controls.
- Require Node.js 24 for development and CI, and validate the Extension Host against fixed minimum and current VS Code versions.
- Honor explicit `cols` column counts when diagnosing ragged rows without synthesizing missing cells.
- Preserve variable-length and nested delimited blocks, and ignore table-like source inside opaque blocks during table detection.
- Reject unsafe plain and block cell replacements atomically when content would change separators, boundaries, or the parsed grid structure.
- Resolve column insertions and deletions against the logical span-aware grid, and update supported `cols` metadata atomically without rewriting unrelated column specs.
- Preserve duplicate-cell style and alignment modifiers, custom separators, and table-local line endings when expanding cells or inserting table attributes.
- Retain comments, blank lines, unknown source, and inter-cell layout as table- or row-owned lossless segments, and diagnose unknown lowercase cell styles without rewriting their raw syntax.
- Contain malformed clipboard HTML and invalid numeric entities as diagnostics or TSV fallback results instead of leaking parser exceptions or partial HTML cells.
- Preserve block and multiline cell source, trailing whitespace, mixed line endings, and final-newline state when applying Cell-per-line formatting.
- Improve large-table parsing with a shared UTF-16 source-position index and enforce all lossless fixtures through versioned summaries, no-op checks, Grid invariants, and deterministic property tests.

## 0.0.3

- Support cell style and alignment controls in the Table Editor.
- Support header, footer, and noheader table option controls.
- Support column spec editing for width and style.
- Support table appearance settings for title, attributes, and preview-backed options.
- Support stacked table attributes, header colspan tables, and span-heavy table shapes.
- Preserve multiline cell continuations, cell-scoped attributes, and escaped pipes.
- Improve handling for explicit `a|` block cells, image macros, links, and footnotes.

## 0.0.2

- Support Asciidoctor-compatible table delimiters such as `|====`.
- Preserve PSV cell hard line break continuations that use trailing `+`.
- Fix cell edits from the Table Editor when the source editor is hidden.
- Keep large tables, previews, and format reviews scrollable inside the Table Editor.

## 0.0.1

- Initial Marketplace-ready release.
- Edit AsciiDoc pipe tables in a grid with cell editing, range selection, merge / unmerge, row / column operations, and VS Code undo / redo.
- Paste tables from office tools and browsers, including auto-expanding rectangular paste, supported merged cells, links, inline formatting, and list-to-block-cell paste.
- Preview rendered AsciiDoc tables, edit block cell raw source, and review table formatting before applying it.
