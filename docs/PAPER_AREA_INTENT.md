# PAPER-GUI-03: 個別ブロックの占有領域操作（接続準備）

既存部品デザインの widthPercent は実測内容幅、minHeightPercent は最小高さ。登録部品の定義を編集すると複数の使用箇所に影響するため、執筆紙面の個別操作とは分離する。

LayoutEngine IL-04/06 の契約に合わせ、個別占有率は placement.sizeConstraints.minWidthPercent / minHeightPercent として生成する。0 は制約解除であり、Engineには送らない。占有率は本文矩形の軸ごとの割合。文字の折り返し・描画サイズ変更は別の再計測操作。固定配置には占有ドラッグを適用せず、固定解除も暗黙に行わない。競合はEngineの診断として扱う。

paper-area-intent.mjs は選択中の documentId / blockKey / revision / fingerprint / 単一断片を照合し、既存の位置・余白・他の寸法制約を保ったまま、新しい個別配置意図の候補を返す。入力を変更しない。ドラッグ中はCSSピクセルの仮ガイド用サイズを返し、ポインター確定だけで候補を生成する。取消・微小移動・元の位置への復帰・古い計画は無操作。既存 areaPercentFromDrag を共用する。

このPRは独立したGUI側の純粋計算モジュールと試験に限定する。画面にはまだ接続しない。現在の blockKey は永続IDとは限らないため、候補を保存ファイルに直接書き込まない。永続ID対応・意図スキーマ・Undo/Redo・Engine再計測/描画・PDFとの整合性が検証できるまでは操作ハンドルを有効化しない。通常の紙面・部品定義・PDF経路は変更なし。ILリポジトリへの変更なし。
