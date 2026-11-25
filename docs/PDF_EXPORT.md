# BookCreator — 出版・PDF出力詳細設計

状態: ドラフト。Engineの [PUBLICATION_RENDERING](https://github.com/Fugu0141/BookCreator_LayoutEngine/blob/main/docs/PUBLICATION_RENDERING.md) を参照。正式確認はHTML、PDFはExport時生成。

## 1. 状態軸

保存: clean/dirty/saving/conflict。作業案: none/draft。組版: stale/running/partial/full/failed。検査: not-run/running/errors/warnings/ready。確定: none/finalized(snapshotId,planId,profile,fingerprint,acknowledgements)。出力ジョブ: idle/running/cancelled/failed/succeeded。軸を単一enumに詰め込まない。確定可能なのは保存成功した最新不変snapshot、全体計画、エラーなし、要確認警告承認済みの状態。未適用案は正式出力に混入しない。正式出力は確定対象の指紋と一致する場合のみ。試し出力は最新の有効全体計画で致命的エラーがない場合のみ。

## 2. 入力・計画・出力

snapshotは原稿・テーマ・manifest・素材・フォントのバイト/ハッシュと依存版、計測環境、出力プロファイルを含む。保存先・ズーム等は指紋外。実体を固定するか変更を検知して停止。入力変更/外部変更で確定解除。再起動時はローカル確定記録とキャッシュを検証、別環境なら再確認。既存の確定PDFは勝手に削除しない。
HTMLプレビューの確定PagePlanと出力投影から固定ページ描画を作り、Chromium等でPDF生成。独立した改ページを避け、フォント読込、画像、寸法、倍率、印刷CSS、色、背景を固定。フォント埋込の権利を確認。ベクター・選択可能文字を維持する目標。電子/両面印刷の違いは実空白とPDF順に投影、内頁面/番号は維持。本文のみ/範囲抽出は配置を維持。条件変更で配置が変わる場合は再確定。
PDFは一時出力→検査→同一ボリュームで安全に置換。上書きは確認。失敗・取消時は以前のPDFを維持。出力中に編集した場合も別revisionとして混入させず、完了時に旧版の出力と表示。ローカル優先、Webの正式PDF方式は保留。

## 3. 検査と診断

エラー: 内容欠落/切断、参照切れ、番号不正、未収束、フォント/素材不整合、正式出力の実質的不一致。警告: 代替フォント、許容分割、低解像度、余白/重なりの確認。情報: 派生空白、番号非表示。診断にcode/severity/revision/origin/page/relatedRanges/fix候補。診断をクリックしてWriting/Design/Layoutへ移動。確認は指紋に結び付く。
PDF検査はページ数・寸法、文字/番号、フォント、描画位置/視覚差を別々に測る。画像DPIは元画素と実配置寸法から算定。許容差、抽出/画像比較手法、テキストの数式・合字等の扱いはPoCで定義。検証不能な点は明示し、ページ数一致だけで成功としない。

PE-01 HTML確定と正式PDF、PE-02 試し出力、PE-03 出力中編集、PE-04 上書き失敗/取消、PE-05 digital/duplex、PE-06 範囲抽出、PE-07 環境差、PE-08 内容/寸法/配置不一致。全て未実装。
