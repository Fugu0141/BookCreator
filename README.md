# BookCreator

Markdownを正本として、GUIによる書籍デザイン、自動組版、見開き管理、PDF出力、GitHub連携を組み合わせるローカルファーストの書籍制作ソフトウェアを目指します。

**Status:** Pre-implementation design. No runnable application, packages, CI results, or released version yet.

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

TypeScript / React / Electronを中心にWindows、Linux、macOSを目標とし、ブラウザへの移植性を初期から検証する。まずBCMとEngineの最小PoCを進め、共通fixtureでアプリ側の変換を確認する。具体的なビルドコマンドは実装基盤を作成後に記載する。

## License

MITを第一希望とする。依存関係の確認と最終決定は未完了であり、現時点では正式なLICENSEを追加していない。
