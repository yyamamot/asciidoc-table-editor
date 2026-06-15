# Changelog

## Unreleased

- Fix Column spec and Table appearance panels so existing source values are loaded into the controls.

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
