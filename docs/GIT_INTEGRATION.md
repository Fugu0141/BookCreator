# BookCreator — Git/GitHub連携詳細設計

状態: ドラフト。ローカル編集が正本。GitHubは任意。CLI呼び出しとAPIを分離。

## 1. 操作と安全性

ローカル: init/clone/status/diff/stage/unstage/commit/branch/history。リモート: fetch/pull(ff-only既定)/push/PR。PRはbase/head・タイトル・本文・差分を確認して送信。自動commit/push、force push、破壊的resetを初期提供しない。ブランチ保護・権限不足を診断。fork/LFSは段階導入。LFSポインタを画像として描画しない。
未保存・未適用案・作業ツリー変更を区別し、pull/branch/merge前に保存/保全/取消を選択。git indexはディスク保存済み対象のみ。競合時は原文/差分、テーマの構造、画像双方を比較。解決後は全参照を再検査、正式出力を再確認。旧Undoの無断再適用なし。

## 2. プロセス・認証

GitAdapterが型付き操作を受け、mainで引数・実行ディレクトリ・パス・権限を検証。任意shell文字列をrendererに公開しない。未信頼リポジトリのhook/filter/config/submodule/外部プロセスの実行リスクを検証し、必要な信頼確認と隔離を設計。Git同梱有無、認証方式（OS資格情報、GitHub OAuth/device flow等）、権限と配布条件はPoC後。秘密はOS保護ストレージに保持、原稿・manifest・ログ・IPCの不要な応答へ出さない。失敗/オフラインでもローカル編集・PDF可。
WebはGit CLIを直接利用できない。GitHub API等の別adapterは将来検証。Desktopと同等機能を保証せず、能力に応じUIを制限する。

## 3. 検証

GI-01 初期化/clone、GI-02 stage/commit/push分離、GI-03 未保存状態の切替、GI-04 分岐と競合、GI-05 PRと権限、GI-06 LFS・大容量画像、GI-07 未信頼リポジトリと資格情報、GI-08 オフライン。全て未実装。
