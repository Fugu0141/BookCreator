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


## 4. M04実測結果とM05着手 (2026-11-26)

M04の数学参考書preflight (PR #64、CI https://github.com/Fugu0141/BookCreator/actions/runs/45763742862 ) は160×200mm、3ページ、10数式、6採番、STIX埋込、全ページの画像検査に成功。固定fixtureのみでありPE-01〜08全体の合格ではない。

M05の第一段階では、試し出力専用に最新revision/fingerprint・full・publicationReady=false・エラーなし・0始まり連続ページ・物理寸法を検証する共通projectionを設ける。Engineが紙面余白込みで描いた未接続DOMを使い、ガイドを隠し、枠/プレビュー余白を除去、実寸の印刷ページ境界を指定する。再計測や独立ページ割付を行わない。対応寸法は30〜300mm、最大512ページに制限する。警告は保持し正式出力とは区別する。実PDF試験の新経路はCI未確認。

次の小段階: PE-02のDesktop試し出力（全冊・最新snapshotのみ、明示保存先、旧版の混入防止）、PE-04の一時ファイル検査と安全な保存・取消、PE-03の編集/外部変更競合の試験。その後、確定状態と正式出力、表紙/空白/範囲抽出/環境差の順に検証。PE-01〜08の完了条件は変更しない。

## Desktop試しPDFの構造検査（PRACTICAL-05c）

生成済みPDFをpdf-lib 1.17.1で読み込み、実ページツリーを走査する。全ページのMediaBox/CropBoxと原点・寸法、回転なし・UserUnit=1、ページ数、非空予定ページの内容ストリーム有無を検査する。物理寸法の暫定許容差は各軸1mm（約2.835pt）。圧縮オブジェクトストリームを含む実PDFの回帰テストを5件追加。Windowsパッケージへ依存ライブラリとライセンスを同梱する。

本検査は構造検査に限定する。ストリームの存在は可視内容、文字/番号/数式、画像、フォント埋め込み、配置の忠実性の保証ではない。contentFidelityVerified=false、publicationReady=falseを明示し、試し出力トランザクションの完全な検査コールバックとはまだ接続しない。実Chromium生成PDFの検査、PDF内容と紙面の比較、GUI/IPC接続は後続。新規CIと実機未確認。
