# AsciiDoc Table Editor

[English](https://github.com/yyamamot/asciidoc-table-editor/blob/main/README.md) | 日本語

## Overview

AsciiDoc のパイプ区切りテーブルを、元のソースを壊しにくく、Git review しやすい差分を保ったまま GUI 編集できます。

`AsciiDoc Table Editor` は、仕様書、運用手順、移行メモ、技術文書を AsciiDoc で管理するチーム向けの VS Code 拡張です。AsciiDoc テーブルをグリッドとして開き、セル、span、ブロックセル、行、列、クリップボードインポート、整形を編集して、元の `.adoc` / `.asciidoc` / `.asc` ドキュメントに安全に書き戻します。

この拡張は AsciiDoc ソースを正本として扱います。未対応のテーブル構文を危険な構造化編集から外し、テーブル属性は可能な限り保持し、安全に扱えないソースは黙って正規化せず診断として表示します。

<!-- screenshot: readme-table-grid -->
<p align="center">
  <img src="https://raw.githubusercontent.com/yyamamot/asciidoc-table-editor/main/assets/readme-table-grid.png" alt="AsciiDoc Table Editor grid editor" width="413">
</p>

このエディターは短い確認サイクルを前提にしています。CodeLens または Command Palette からテーブルを開き、グリッドで編集し、必要に応じてプレビューや Format Review を確認してから、安全に書き戻せる変更だけを対象テーブルブロックに反映します。

## ブラウザで試す

静的サイト版は [asciidoc-table-editor.pages.dev](https://asciidoc-table-editor.pages.dev/) で試せます。VS Code 拡張をインストールせずに、グリッド編集、レンダリング済み AsciiDoc プレビュー、クリップボード貼り付け、ブロックセル編集、Format Review の挙動を確認できます。

静的サイト版は編集体験の確認に向いています。AsciiDoc CodeLens 連携、ローカルワークスペースの診断、ローカルの `.adoc` / `.asciidoc` / `.asc` ファイルへの書き戻しが必要な場合は VS Code 拡張を使ってください。

## この拡張でできること

- `.adoc` / `.asciidoc` / `.asc` ファイルの AsciiDoc パイプ区切りテーブルを開く
- `テーブルエディターを開く` CodeLens から特定のテーブルを開く
- 通常セルをグリッドまたは下部 Cell Editor で編集する
- キーボードまたはマウスドラッグで範囲選択する
- 矩形のセル範囲を merge / unmerge する
- コンテキストメニューから行 / 列を追加・削除する
- Word、Excel、Pages、Numbers、ブラウザからコピーしたテーブルを貼り付ける
- 貼り付けたテーブルがはみ出す場合に行 / 列を自動追加する
- 安全な範囲ではインポートされた結合セルを保持する
- クリップボードの太字、斜体、等幅、安全なリンクを AsciiDoc インライン構文に変換する
- テーブル以外のリスト / 複数行 HTML フラグメントをブロックセルとして貼り付ける
- ブロックセルの raw ソースを下部エディターで編集し、Inspector でプレビューする
- Edit とレンダリング済み AsciiDoc Preview を切り替える
- テーブル整形を確認してから適用する
- VS Code undo / redo でテーブル編集を戻す

## Installation

Marketplace からインストールする場合:

1. VS Code の Extensions view を開く
2. `AsciiDoc Table Editor` または `asciidoc-table-editor` を検索する
3. `Install` を押す
4. AsciiDoc テーブルを含むドキュメントを開く

検証用には VSIX からのインストールもできます。

```sh
pnpm run package:vsix
pnpm run install:vsix
```

## Quick Start

### 1. AsciiDoc テーブルを用意する

AsciiDoc ファイルにパイプ区切りテーブルを書きます。

```asciidoc
= Example

[cols="2,2,5a"]
|===
|Name |Type |Notes

|Firefox
|Browser
|Firefox is an open source web browser.

* Standards compliant
* High performance
* Portable
|===
```

### 2. テーブルエディターを開く

AsciiDoc テーブルの上に表示される `テーブルエディターを開く` CodeLens を使います。

Command Palette から開く場合は次を実行します。

- `AsciiDoc Table: テーブルエディターを開く`

<!-- screenshot: readme-codelens -->
<p align="center">
  <img src="https://raw.githubusercontent.com/yyamamot/asciidoc-table-editor/main/assets/readme-codelens.png" alt="Open Table Editor CodeLens above an AsciiDoc table" width="960">
</p>

### 3. Grid で編集する

通常セルを編集し、範囲選択、merge、Office tool からのテーブル貼り付け、選択セルの下部 Cell Editor を使います。ブロックセルはグリッド上では読み取り専用ですが、同じ下部エディターで raw AsciiDoc ソースを編集できます。

### 4. AsciiDoc Preview を確認する

プレビューに切り替えると、span、alignment、link、ブロックセルの内容を含むレンダリング済みテーブルを確認できます。

<!-- screenshot: readme-preview -->
<p align="center">
  <img src="https://raw.githubusercontent.com/yyamamot/asciidoc-table-editor/main/assets/readme-preview.png" alt="Rendered AsciiDoc table preview" width="960">
</p>

### 5. 確認してから整形する

CodeLens またはツールバーからテーブル整形を実行すると Format Review が開きます。変更前 / 変更後のソースと整形モードを確認してから適用します。

## Features

| 機能 | できること | 補足 |
| --- | --- | --- |
| テーブル Grid | 対応している AsciiDoc パイプ区切りテーブルを GUI 編集する | 通常セル、span、ブロックセル、行、列に対応 |
| CodeLens | 特定のテーブルブロックを開く | 同じテーブルに `テーブルを整形` も表示する |
| Cell Editor | 選択セルを安定した下部エディターで編集する | 通常セルとブロックセルの raw ソースを同じ場所で扱う |
| Merge / Unmerge | AsciiDoc span 構文を更新する | 安全に書き戻せる矩形範囲だけを対象にする |
| 行 / 列の編集 | 行 / 列を追加・削除する | 対応範囲では span-aware に更新する |
| クリップボード貼り付け | コピーしたテーブルを現在のグリッドに貼り付ける | HTML テーブルと TSV 風フォールバックに対応 |
| リッチクリップボード変換 | よく使うインライン内容を保持する | 太字、斜体、等幅、安全なリンク、list-to-block-cell paste |
| ブロックセルプレビュー | ブロックセルの内容のレンダリング済み view を表示する | 編集正本は raw ソースのまま |
| AsciiDoc Preview | 対象テーブルをレンダリング済み AsciiDoc として表示する | bundled `/core.0.4` を使用 |
| Format Review | テーブル整形を書き戻し前に確認する | テーブル layout と cell-per-line mode を表示 |
| 診断 / フォールバック | 安全でない構造化編集を止める | unsupported テーブルはソースを壊さず保持する |
| VS Code undo / redo | ドキュメント undo stack を使う | テーブル編集は VS Code ドキュメント編集として戻せる |

## 主な使い方

### テーブルを開く

AsciiDoc ドキュメントを開き、編集したいテーブルの上にある `テーブルエディターを開く` を使います。複数テーブルがあるドキュメントでも、CodeLens またはカーソル位置で選ばれたテーブルだけを対象にします。

### セルを編集する

セルを選択して、グリッドまたは下部 Cell Editor で編集します。Apply button または対応キーボード操作で AsciiDoc ドキュメントへ書き戻します。

### 範囲を選択して merge する

セルをドラッグするかキーボード範囲選択を使い、`Merge` を押します。AsciiDoc で安全に表現できる範囲か検証してから span 構文を書き戻します。

### Office tool から貼り付ける

Word、Excel、Pages、Numbers、ブラウザからテーブルをコピーし、貼り付け先セルを選んで貼り付けます。通常の矩形テーブルは現在のテーブルを拡張でき、インポートされた結合セルは安全な対象範囲で保持します。

### ブロックセルを編集する

ブロックセルはリスト、paragraph、source block、nested AsciiDoc content を含む可能性があるためグリッド上では読み取り専用です。下部 Cell Editor で raw content を編集し、Inspector プレビューでレンダリング結果を確認します。

### ソースを確認してから整形する

テーブル整形を実行すると Format Review が開きます。変更前 / 変更後のソースを確認し、問題なければ適用します。

## ソースを安全に保つ編集

この拡張は lossless テーブル parser とグリッド projection を中心に設計されています。GUI の都合で無関係なソースを書き換えないことを重視します。

- 対象テーブルブロックだけを書き戻す
- テーブル属性と unsupported ソースを可能な限り保持する
- ブロックセルの内容は raw AsciiDoc ソースとして保持する
- テーブル構造が malformed または安全でない場合は編集を block する
- lossy conversion を黙って行わず診断を表示する
- Pull Request や LLM review で読みやすいソースを保つ

## Limitations

| 事項 | 補足 |
| --- | --- |
| 構造化編集は AsciiDoc `psv` テーブル format が対象 | グリッドでの構造化編集は AsciiDoc パイプ区切りテーブルを主対象にします |
| CSV / TSV / DSV テーブル body | グリッドでの構造化編集には対応しません |
| nested テーブル | nested テーブルの構造化編集は対象外です。ブロックセルの raw editing とプレビューを使います |
| 複雑なブロックセル | リスト、source block、paragraph、nested content は raw ブロックソースとして編集します |
| ファイルインポート | `.xlsx` / `.docx` ファイルインポートには対応しません。クリップボード貼り付けを使います |
| リッチ書式の再現性 | クリップボード貼り付けは安全な subset だけを保持し、Word / Excel styling 全体は再現しません |
| unsupported テーブル | 安全でないテーブルは診断またはフォールバックにし、破壊的な書き戻しを避けます |

## Requirements / Compatibility

| 項目 | 内容 |
| --- | --- |
| VS Code | Desktop `1.105+` |
| ソースからのビルド用 Node.js | `22+` |
| 対象ファイル | `.adoc`, `.asciidoc`, `.asc` |
| Preview renderer | bundled `/core.0.4` |
| Marketplace package | `README.md`, `README.ja.md`, `LICENSE`, screenshot assets を同梱 |

## Source から build する

必要なもの:

- Node.js `22+`
- pnpm `10.30.3+`
- VS Code Desktop `1.105+`

依存関係をインストールして extension をビルドします。

```sh
pnpm install
pnpm run build
```

ローカル VSIX を作成します。

```sh
pnpm run package:vsix
```

生成した VSIX を VS Code にインストールします。

```sh
pnpm run install:vsix
```

主な検証ゲートを実行します。

```sh
pnpm run verify
```

UI 変更時の確認:

```sh
pnpm run verify:ui-change -- --scenario table-grid --id <feature-id>
```

## License

- License: [MIT](./LICENSE)
