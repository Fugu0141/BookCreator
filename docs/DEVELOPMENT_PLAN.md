# BookCreator — 開発計画・横断PoC

- 状態: 実装前計画。ソースコード・CI・実測結果はまだない。
- 対象: BookCreator、BookCreator_Markdown（BCM）、BookCreator_LayoutEngine（Engine）
- 詳細設計は各リポジトリの正本を参照する。未決事項は [DECISIONS.md](DECISIONS.md)。

## 1. 開発の入口・依存方向

BookCreator → BCM（parse/validate/patch/reference index）
BookCreator → Engine（中立LayoutInput/measure/layout/PagePlan）
BCM ↛ Engine、Engine ↛ BCM。両ライブラリはアプリに依存しない。

BookCreator側のdocument adapterが原文とASTを扱い、theme compilerが解決済み部品と意味的内容を中立入力へ変換する。Engineは配置・ページ依存の値を解決。renderer/PDF adapterは確定したPagePlanを描画する。GUIは原文を第二正本へ複製しない。

各パッケージのAPI、スキーマ、formatVersionとパッケージのSemVerは別。初期は開発版0.x。相互運用fixtureに各commit/依存版を記録し、未公開依存は固定commitまたは明示ローカル参照で検証。リリースは固定依存とロックファイルを用いる。破壊変更は先に仕様・fixtureを変更し、両側のCIを確認する。まだnpm名、Node最低対応版、パッケージマネージャは未確定。

## 2. 具体的な作業順序

| ID | リポジトリ | 成果物 | 先行条件/完了基準 |
| --- | --- | --- | --- |
| D01 | 各 | 開発基盤: TS strict、lint/typecheck/test、CIの最小構成 | 実行環境・依存候補を記録。公開前のライセンス確認 |
| D02 | BCM | 仕様fixture・AST/source range・構文解析PoC | D01、BCM-01/03/04/05/06/14 |
| D03 | BCM | 属性検証・opaque・局所パッチ・参照索引 | D02、BCM-02/07〜13/15〜20の構文/編集部分 |
| D04 | Engine | 中立型、単位、模擬計測、row/column/stack/canvas | D01、LM-01〜07、LE-01/02 |
| D05 | Engine | ページ割付・断片・面・番号 | D04、PG-01〜07/11、LE-03/04/05/07 |
| D06 | Engine | HTML計測/固定描画PoC、脚注・目次・再組版 | D04/D05、PG-08〜10、LE-06/08/09 |
| D07 | BookCreator | manifest/テーマの読み込み、BCM→Engine変換fixture | D02/D04、原文・部品・origin・IDの契約 |
| D08 | BookCreator | 最小desktop/UI、ローカル保存・画像、HTML→PDF | D03/D05/D06/D07、POC-01〜05の基本ケース |
| D09 | 各 | Web共通性、安全性、依存監査・性能、3OS | D01以降随時、POC-06〜08、未達理由記録 |
| D08b | BookCreator | 構造GUI文章編集・基本部品エディタ | D03/D04/D07/D08、GUI⇔原稿の局所同期、画像属性編集、基本部品作成/変更・紙面プレビュー・適用/取消が成立 |
| D10 | BookCreator | 開発版公開ゲート | D08/D08b/D09の基準に達し、ライセンス確定（Q15） |
| D11 | BookCreator/Engine | 高度な部品GUI・自由配置の拡充、専門書機能、Git | 開発版後も基本設計の全目標を維持 |
| D12 | 各 | 品質・移行・配布・安定版 | DESIGN.mdの全該当受入テスト、既知制限を明示 |

D02とD04は並行可能。ライブラリの完全完成を待たず最小契約でD07を試す。PoCと製品コードを区別し、失敗した案を無断で本番に固定しない。アプリの全体実装前にP0を確認。初期開発版の公開範囲はQ15で確定。D08bを公開前の必須作業とし、ソース編集とPDFだけでの公開は行わない。

## 3. 横断PoCと合格条件

| PoC | 入力/作業 | 判定 |
| --- | --- | --- |
| POC-01 原稿往復 | CRLF/BOM/日本語・絵文字・コード・未知記法、画像を含む複数ファイル、GUI変更・Undo | 変更外バイト列不変、意図した属性のみ更新、原文欠落なし |
| POC-02 部品 | 長いH1、縦線、overlay、Canvas、余白・アンカー | 計測と固定描画の整合、循環/overflow診断、読み順維持 |
| POC-03 ページ | 模擬計測と実HTMLで段落/コード/表、開始面、continuous | 不要空白なし、strictは分割しない、断片→原文範囲と境界理由 |
| POC-04 出版 | 表紙・本文・固定見開き・番号、HTML確定→PDF出力 | digital/duplex面の整合、PDFページ数/寸法/内容/位置を実測比較。違えば正式出力失敗 |
| POC-05 専門書 | 数式、脚注、図表番号、目次、相互参照、長いコード | 内容欠落なし、収束または理由付き停止、参照更新 |
| POC-06 Web | 同一データでdesktop/browserの縮小編集・保存・計測 | 共通コアのブラウザビルド、形式の意味維持、無断送信なし。Web正式PDFは保留 |
| POC-07 安全性 | 外部変更・途中終了・古いrevision・未信頼素材/IPC | 原稿保全、範囲外操作を拒否、旧結果を誤使用しない |
| POC-08 性能/依存 | 100ページ・50画像程度、小規模、各OSの利用可能環境 | 冷/温キャッシュ、入力遅延、組版/PDF時間、ピークメモリ、依存/ライセンス、OS差を記録 |

数値性能目標とPDF視覚差の許容範囲は実測後に決定。検査不能な箇所を成功扱いしない。既存エンジン（例: Vivliostyle）と独自案の比較は独自エンジンの採用判断に用いる。必要機能がないなら独自実装を検討し、製品要件を無断削減しない。

## 4. 最小の共通fixture（設計例）

原稿A: H1、段落、幅75%のfigure（永続ID fig-unity）。原稿B: continuous、先頭H1、途中H1、fig-unityへのref、明示pagebreak、コード。テーマ: H1にpage-top、縦線、文字量で伸長。内頁開始right、表紙あり、本文番号1開始。模擬計測で先頭H1が前ページに収まる寸法を設定。
期待: BCMの解析・参照検証成功、画像幅編集でfigure属性のみ変更。EngineはBの先頭の部品由来page-topを抑制し途中H1は適用。手動pagebreakは維持。図のIDと原文位置から断片に移動可能。電子閲覧/両面印刷で面調整空白が異なっても内頁番号は同じ。HTML確定後にのみPDF生成し一致を検査する。
具体的な本文・測定値・期待ページ列は実装時にfixtureファイルに固定する。実測結果ではない。

## 5. 記録・公開ゲート

Q15の機能ゲート: GUIで文章・見出し・リスト・画像等を編集し、原文への局所書戻しとUndo/Redoが成立する。基本部品エディタではrow/column等の基本構造、文字・図形・色・余白・配置を編集し、実際の紙面でプレビューし、適用/取消できることを最低限とする（具体的な基本範囲は実装時の検証案）。基本機能での教材作成・保存・再編集・HTML確認・PDF出力を一連のfixtureで検査。高度な自由配置編集等の全製品目標は維持する。

各タスクには仕様節、fixture ID、対応コミット、結果（pass/fail/blocked/not-run）、実行環境、未達と代替案を付す。未検証機能を完了と表記しない。公開前にLICENSE/第三者ライセンス・配布権・脆弱性/データ保全、インストール手順、既知制約、バックアップ/形式移行方針を確認する。Web版の正式出力・公開は別ゲート。原稿や秘密情報をテスト用に無断公開しない。
