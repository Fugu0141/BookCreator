# UX-10i — 保持型リアルタイム組版 (Retained Live Layout)

2026-11-27 / 設計提案。LIVE_PRODUCTION_DESIGN.md と SYSTEM_BOUNDARIES.md を継承し、性能改善の実装順序を変更する。実装・性能目標は未達を含む。

## 根拠と基準
Canva の描画モデルとレンダラーの分離、Figma の増分依存計算、ProseMirror の変更トランザクションと DOM 保持を参考にする。ただし Canva の非公開アルゴリズムを推定で採用せず、GPU や Rust への置換は残存ボトルネックを確認するまで行わない。参考: https://prosemirror.net/docs/guide/ （transactions / view）。
BookCreator #154 の15ページ実編集は全交換235.4ms、旧部分更新251.4ms。#155 / LayoutEngine #43 は未変更ページDOM生成の省略を導入し、Desktop全5CI・149単体・GUI parity成功。既定OFF、速度効果未確認。段落増分計測は既定ON。
現状は renderer.jsx の renderRequest が原稿収集・解析・全体計測巡回・全体ページ計画・紙面公開を実施。browser-page-measure.ts は全section/blockを巡回、pagination.ts の paginateMeasured は全体を計算する。live-preview-delay は100ms末尾debounce、layout-scheduler は古いrunning処理の完了を待つ。measured-paper は全ページの逆引きとthumbnailを列挙。各処理の時間寄与は未確定。

## 新しい標準経路
編集transaction → 変更集合/依存関係 → 変更ブロックの実測 → 影響開始境界から再組版 → 変更された可視断片のみ公開。
画面外、thumbnail、診断は低優先度で追従。編集状態を唯一の正本とし、紙面用の偽レイアウトは作らない。保存・出版は独立。出版は最新revisionの全冊検証を必須とする。

| 所有者 | 責務 |
|---|---|
| Desktop/editor | revision付き編集・Undo・IME transaction、変更範囲 |
| Markdown/Core | stable logical block ID、依存集合、最新source map。offsetのみで識別しない |
| LayoutEngine | 実測値とページ境界checkpoint、同一規則の再開・収束計画。DOMを持たない |
| Desktop/paper-display | 対象・revision・font epoch一致のpatch、可視DOM、最新逆引き |
| scheduler | 可視優先・小step・新revision時の協調中断、thumbnail遅延 |

書籍/原稿範囲/フォント/用紙/素材のepochでセッションを所有。未知の依存は広域失効。上限・LRU・解放を定義。旧revisionの逆引き・出版は禁止。選択・スクロール・通常ズームは組版不要。寸法に影響しない色は再描画のみ。数式は式・フォント・サイズ・描画方式でartifactと寸法を識別、移動だけでは再コンパイルしない。画像/部品も素材と依存スロットで失効。出版用のベクター・原式を保持する。

## 組版checkpoint
従来の paginateMeasured を正解オラクルとする。変更に先行する安全境界から再開。checkpointは次のsection/block、unit cursor、ページ番号、使用高さ、break reason、split/keep policy等の必要文脈を保持。最初は既存の単段組版のみ。前後の依存、ページ状態が一致したと証明できる場合だけ後続計画を再利用。単に高さやページ数が一致しただけでは不可。連続section・明示改ページ・分割・末尾削除・警告・最新originを検査。将来の脚注等は文脈契約を拡張。証明不能なら末尾まで、必要なら全生成へ戻す。
全体入力検証と最新source mapへの置換は、配置再計算の省略とは分けて計測する。出力を全計画として返す限りメタデータ走査/コピーは残る。

## 表示・スケジューラ
次フレームを入力反応の目標とし、重い全冊処理をrequestAnimationFrame内で実行しない。固定100ms待ちを再設計し、最大待ちで連続編集の飢餓を防ぐ。DOM実測を無理にWorkerに移さず、純粋解析/計画を必要に応じ分離。未確定の上流境界があるページは旧版と明示。viewport virtualizationは計画と独立、placeholderで位置と高さを保持。可視範囲/近傍から実体化し、最新でない範囲の逆引きを拒否。thumbnailは可視または要求時に生成。

## 実装順序
1. UX-10i-1: LayoutEngine純粋ページ計画の再開・収束。まず安全な境界から前半再計算を省略し、次に後半収束。従来APIを維持し全計画/diagnostics/origin parityを検査。
2. UX-10i-2: stable block identity、変更集合、計測値の所有。解析・全冊IPC読取の削減。外部編集/保存競合を拒否。
3. UX-10i-3: sparse assemblyと接続、可視ページ優先、画面外DOM/thumbnail遅延生成。
4. UX-10i-4: 協調step・優先度、待ち時間再設計、IME・切替回帰。既存保存/出版経路を維持。
キャッシュ方式の総当たりは保留。各段階は独立API、統合経路の正確性と性能を同一ゲートで判定。

## 受入
暫定目標（未計測）：60Hzで入力・選択・ドラッグ次フレーム、局所本文の最新実紙面paint p95 50ms以下、通常改ページ伝播p95 100ms以下。全体設定変更は別予算。50ms超long taskを抑制。実paintはDOM公開完了と区別する。
局所編集で安全に境界不変なら変更ブロック以外の新規実測0、後続ページ再配置・DOM生成0を構造検査。境界変化なら収束まで。長冊・数式・部品・参照・IME・Windows/DPI・連続操作で完全組版との一致、メモリ上限、原稿保存安全性を確認。全5CI成功だけでは速度達成としない。

## UX-10j 追記（2026-11-28）
#227 の Electron 合成15ページ原稿・4対比較（Worker/直接確定OFF、全5CI成功）では、16ms→8msにより単発本文の最終DOM中央値40.2→34.05ms、連続数式41.75→32.85ms、連続入力タイマー遅延p95 13.4→2.5ms。入力イベント処理p95は1.3→1.9ms、単発の1対は悪化。連続入力は全4対改善、紙面一致・未変更ページ維持を確認。計測: https://github.com/Fugu0141/BookCreator/actions/runs/46113519526 。
この結果を基に、再利用可能な選択原稿の執筆時のみ8msを既定にする。初回・全冊・設定は100ms、比較用16msへの切替は残す。Workerは#225/#226で最終DOMへの寄与が小さく初回負荷があるため既定OFFを維持。従来の性能試験は16msを明示して比較可能性を保つ。WindowsパッケージsmokeとLinux DOMベンチは実画素paintや低速実機、長冊の性能保証ではない。今回の既定変更CIと実機確認は別途必要。
