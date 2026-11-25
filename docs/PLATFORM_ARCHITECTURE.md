# BookCreator — プラットフォーム設計

TypeScript strict、React、Electronを採用方針。BCM・Layout Engineは外部独立パッケージ。共通コアはブラウザで利用可能にし、UIはWeb/desktopで共有を目標とする。初期はDesktop、Webは縮小PoC。

## 1. 境界

apps/desktop(main/preload/renderer)、apps/web、packages/core/document/components/layout/ui/platform/platform-desktop/platform-web。documentはBCM APIと編集状態の変換、layoutはEngineの中立入力とPagePlanの変換。BCM/Engineの実装をコピーしない。core/uiはfs/child_process/Electronに依存しない。Platformはstorage、resources、git、credentials、layoutRuntime、pdf、capabilitiesを型付き契約として提供する。未対応は明示結果とし、黙って実行を省略しない。
Electron rendererはnodeIntegration=false、contextIsolation/sandboxを有効。preloadは用途別最小API、mainで送信元・引数・プロジェクト範囲を再検証。組版用環境を資格情報・UI・任意ネットワークから分離。未信頼HTML/SVG/CSS/YAML等はデータとして検証。任意shell/ファイル/URL操作を許可しない。WebはOPFS/IndexedDB等と明示import/export、容量/消去/バックアップの診断。原稿の無断送信は禁止。

## 2. 開発・品質

Node.js、依存、パッケージマネージャの版はPoCで固定、ロックファイル追跡。Vitest/Playwright候補、3OS CI、ブラウザの共通コアビルド検査。パッケージ間は公開型を利用し、ライブラリ版を固定。未公開ライブラリは開発時の明示的ローカル参照または固定commitで検証、リリース時の依存経路は別途確定。ライセンス・依存の監査は公開ゲート。
入力遅延、組版/出力時間、メモリ、キャッシュ、取消を小規模/100ページ50画像程度で測定。サムネイル仮想化、計測キャッシュ、差分更新を検証。フォントやOSによる差は入力指紋で区別。同じChromiumでも同じ結果とは限らない。インストーラ/署名/更新/IMEは各OSで検証。Web正式PDF方式と公開時期は保留。PA-01〜06: 共通ビルド、IPC拒否、未信頼素材、3OS、Web保存、性能・取消。未実装。
