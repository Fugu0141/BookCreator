# BookCreator — 編集トランザクション・復旧設計

状態: ドラフト。BCMの局所パッチAPIを使用し、BookCreatorが編集コマンド、複数ファイル操作、Undo、保存、外部変更の調停を担当する。

## 1. 状態と契約

WorkspaceはprojectId、workspaceRevision、各fileId/path/baseDiskHash/revision/content、dirty、作業案、選択、Undo/Redo、組版ジョブの参照を持つ。ディスク保存済みとメモリ編集中を区別。BCM AST、ProseMirror、CodeMirror、HTML、PagePlanはいずれも原文の第二正本にしない。選択はfileId＋nodeKey＋revision＋必要時永続ID。古い位置情報は自動で別ノードに適用しない。

    Command = {id, origin, expectedWorkspaceRevision, targets, preconditions, operation}
    Transaction = {id, before, after, textPatches, fileOperations, inverse, affectedDependencies}

コマンドを受信→revision/対象の前提検証→BCMまたはYAML局所パッチを生成→仮状態へ全適用→再解析・期待意味検査→一括commit→Undo登録→依存失効。構造GUIの操作が不正なら仮状態を破棄し原文不変。直接ソース入力は未完成構文でも受理して保存可能。プレビューは最後の有効版を明示し、そこからの編集/確定/出力は拒否。

## 2. 操作種別

insert/replace/move/duplicate/delete block、set/remove attribute、insert asset、rename/move file、update theme、update manifest、apply draft、undo/redo。単一書籍の複数ファイル操作は一つの論理トランザクション。移動は永続IDを維持、複製は新IDと内部参照を更新、範囲外参照を勝手に付替えない。移動時は宣言元相対パスを再計算。隣接する手動pagebreakは本文と一緒か独立か確認。未知構文に触れる破壊的操作は明示差分か制限。

ソース入力はエディタから変更範囲のみ受け取る。IME composition中の変換途中は表示に反映しても、構造変換・自動フォーマット・選択飛びを行わない。終了時に同期。GUIとソースの同期イベントにoriginとrevisionを付し、反射更新を新編集として登録しない。連続文字入力は自然なUndo単位にまとめ、ドラッグは終了時一操作。

## 3. 保存・復旧

原稿・テーマ・manifestの更新は保存直前にbaseDiskHashを比較する。外部変更時は自動上書きせず、比較/再読込/別名保全を提示。同一プロジェクトの複数書込みウィンドウは初期は単一writerを推奨し他は読取専用。プラットフォーム固有の排他をPoC。異常終了で古いロックを確認なく破棄しない。

複数ファイル保存: ジャーナルに対象・旧/新ハッシュ・一時ファイル・段階を記録→一時書込→置換→完了記録。全ファイルのOSレベル原子性は保証できないため、次回起動で旧/新/外部変更を識別し安全な復旧を選ぶ。復旧が失敗しても原稿退避を可能にする。保存に成功したファイルだけbaseを更新、未完了変更を保存済みにしない。オートセーブは明示的編集のみ、未適用のテーマ案や派生改ページを保存しない。

## 4. Undo・Git・ジョブ

Undoは成功済みトランザクションの逆操作、Redoは前提条件を再検証。外部変更/ブランチ切替後の古い履歴をそのまま再適用しない。履歴の再構築/破棄を明示し、未保存内容は保全。Git操作前に未保存・未適用案・競合を確認、ステージ対象はディスク上のみ。自動commit禁止。保存/変更後に影響依存を再評価しPagePlanを無効化。ジョブはsnapshot revisionを持ち取消可能、遅れて返った旧結果を捨てる。確定と未保存、作業案、検査・出力状態は別軸。

ET-01 局所編集のバイト保持、ET-02 IME、ET-03 画像追加失敗、ET-04 複数ファイルUndo、ET-05 外部変更直前保存、ET-06 クラッシュ途中、ET-07 古いPagePlan、ET-08 Git操作と未保存。実際のパッチ・ハッシュ・期待診断をテストする。未実装。
