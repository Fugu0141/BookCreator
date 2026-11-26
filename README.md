# BookCreator

Markdownを正本として、GUIによる書籍デザイン、自動組版、見開き管理、PDF出力、GitHub連携を組み合わせるローカルファーストの書籍制作ソフトウェアを目指します。

**Status:** Development prototype 0.0.1: experimental desktop workspace and browser preview, not a released or publication-ready application.

## Related projects

- [BookCreator Markdown (BCM)](https://github.com/Fugu0141/BookCreator_Markdown) — independent document parser, validation, source-preserving edits.
- [BookCreator Layout Engine](https://github.com/Fugu0141/BookCreator_LayoutEngine) — independent pagination and layout library.

BookCreator consumes both libraries. Neither library requires the other or the application.

## Start here / 開発を始める前に

| Document | Purpose |
| --- | --- |
| [DESIGN.md](DESIGN.md) | 基本設計・製品要件・受入テスト |
| [DEVELOPMENT_PLAN](docs/DEVELOPMENT_PLAN.md) | 3リポジトリの実装順・PoC・公開ゲート |
| [DECISIONS](docs/DECISIONS.md) | 決定済み・未決・確認事項 |
| [PRE_IMPLEMENTATION_REVIEW](docs/PRE_IMPLEMENTATION_REVIEW.md) | リスクとレビュー記録 |
| [PROJECT_FORMAT](docs/PROJECT_FORMAT.md) | book.yaml・原稿・素材・番号・文献 |
| [COMPONENT_SYSTEM](docs/COMPONENT_SYSTEM.md) | テーマ・部品・BCM属性の変換 |
| [EDITOR_TRANSACTIONS](docs/EDITOR_TRANSACTIONS.md) | 局所編集・Undo・原稿保全 |
| [UI_DESIGN](docs/UI_DESIGN.md) | 画面と操作の契約 |
| [PDF_EXPORT](docs/PDF_EXPORT.md) | HTML出版確認、PDF生成・検査 |
| [GIT_INTEGRATION](docs/GIT_INTEGRATION.md) | Git/GitHub、認証・競合 |
| [PLATFORM_ARCHITECTURE](docs/PLATFORM_ARCHITECTURE.md) | Desktop/Web、IPC・セキュリティ |

BCMの正本は[言語仕様](https://github.com/Fugu0141/BookCreator_Markdown/blob/main/docs/SPECIFICATION.md)、組版モデルの正本は[LAYOUT_MODEL](https://github.com/Fugu0141/BookCreator_LayoutEngine/blob/main/docs/LAYOUT_MODEL.md)。詳細設計はすべてドラフト。矛盾を発見した場合は勝手に要件を変更せず、DECISIONSと当該正本を確認する。

## Development

TypeScript / React / Electronを中心にWindows、Linux、macOSを目標とし、ブラウザへの移植性を初期から検証する。まずBCMとEngineの最小PoCを進め、共通fixtureでアプリ側の変換を確認する。実測プレビューおよびReact/Electronの開発版を起動できる。正式リリース・出版確定は未対応。


## Local development / ローカル開発

Node.js 22 or later and npm are required. Run from this repository:

```sh
npm install
npm run typecheck
npm test
```

TypeScript 5.8.3 is pinned. The lockfile is not yet generated; see [implementation status](docs/IMPLEMENTATION_STATUS.md). GitHub Actions is configured for initial checks; full conformance is pending.

Cross-library smoke test: clone the three repositories into sibling directories named BookCreator, BookCreator_Markdown, and BookCreator_LayoutEngine, then install and build each. Run `node --test tests/integration.mjs` from BookCreator. The CI integration job pins the two library commits.

## License

MITを第一希望とする。依存関係の確認と最終決定は未完了であり、現時点では正式なLICENSEを追加していない。

## Web preview on GitHub Pages (experimental)

After enabling Settings → Pages → Source: GitHub Actions, run **Web preview Pages** from the Actions tab on `main`. The workflow builds the pinned sibling libraries, tests the static site under `/BookCreator/`, then publishes only the demo assets. Pull requests run the test without publishing. The expected project URL is `https://fugu0141.github.io/BookCreator/` (available only after successful deployment). Click 数式サンプルを試す to explore equation numbering and references. Input is ephemeral and stays in the browser; no cloud storage, project file access, Component Lab, custom font manager or PDF export. This is an experimental demo, not a public software release.

## Experimental browser preview demo

Build BookCreator, BookCreator_Markdown and BookCreator_LayoutEngine in sibling directories (use the pinned commits in the integration workflow). Then run `npm run preview:demo` from BookCreator and open http://127.0.0.1:4173. Edit plain ATX headings and single-source-line paragraphs, change the content dimensions, and generate an experimental preview. Click a page fragment to select the corresponding source range. No file I/O, persistence, PDF, or full Markdown support. The local server serves only the listed build modules and demo files. `npm run preview:smoke` runs the headless Chrome integration check.

## Windows desktop development package (experimental)

For Windows 10/11 x64, open [Windows desktop development package](https://github.com/Fugu0141/BookCreator/actions/workflows/windows-preview.yml) in Actions. Choose a successful run and download the `BookCreator-Windows-x64-preview` artifact (GitHub login required; expires after 14 days). To create a fresh build after the workflow is on main, use Run workflow on main. Pull requests also build and validate an artifact.

Extract the entire ZIP to a writable folder, e.g. Documents/BookCreator-preview, and double-click `BookCreator.exe`. Keep the resources and DLLs beside the executable. Node.js, Git and npm are not required to launch. Create a separate book folder using the new project button; back up important manuscripts. This is unsigned, portable development software, not an installer or a formal release. Windows may warn about unsigned apps; only run artifacts from your own trusted build, and do not disable system security. ARM64, Windows on ARM emulation, installer, signing, auto-update and formal publication are not verified or implemented. CI tests the relocated package with Japanese path characters, isolated renderer, local workspace, inline and numbered display math, bundled fonts and source save. It does not establish all Windows features work.

## Experimental desktop application

See [desktop workspace PoC](docs/DESKTOP_WORKSPACE_POC.md) for build instructions and supported project features. The app is a development prototype, not a release.

Desktop preview includes locally bundled Noto Sans JP Variable (SIL OFL 1.1, Fontsource package pinned); its license notice is copied into the generated build directory. Body, heading and editor fonts can be selected independently in the experimental UI; book typography is not persisted yet.

Desktop can create a new book in a selected parent folder and save supported body/heading typography to the theme YAML. Page dimensions in preview are still independent experimental settings. Existing folders are never overwritten.

Desktop font manager can copy explicitly shareable static upright TTF/OTF faces into the current project, retain license metadata, preview and select them by role. Experimental only; imported fonts are not automatically authorized for PDF or redistribution.

Desktop supports physical paper and margins from book.yaml, manuscript reordering and whole-book experimental preview (supported plain manuscript sections only). B5 means JIS B5.

Component Lab prototype edits a shared heading component (row/column, text slot, decorative rectangles, size, gap, padding, color) with actual measurement and theme apply/discard. It is not the complete component editor yet.

Component Lab supports shared and H1–H6-specific heading designs, fixed labels and independent font selection. Imported static faces use registered project IDs and exact weights.

Component Lab supports nested row/column groups with group/ungroup, width, padding, gap and background. Experimental strict heading components only.

Nested groups can use bounded free-position Canvas with explicit physical X/Y coordinates and fixed height. Numeric editing only; whole-page Canvas is future work.

Component Lab supports moving measured Canvas children by pointer drag and local draft undo/redo. Release commits one edit; Apply still requires a successful measurement.
