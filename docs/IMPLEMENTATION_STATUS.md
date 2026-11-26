# First development milestone (0.0.1)

Implemented: platform-neutral document revision guard and patch adapter contract, layout-result revision/fingerprint guard, full-plan requirement for review, and Q15 preview-release gate. This is not the complete application or publication state machine. React/Electron shell, actual BCM/Engine dependency integration, GUI, storage, rendering, Git and PDF are not yet implemented. The release checker only evaluates supplied check results and is not a substitute for performing the checks. Local Node 22.16.0 / TypeScript 5.8.3: six unit tests passed on the working copy. Full acceptance suite and integration tests not run. Network restrictions prevented npm installation and lockfile generation. Generate and commit package-lock.json and use npm ci before reproducible release. License is still undecided; no release.

## Second development milestone

Extended the pinned cross-repository smoke test with BCM nested component/heading ranges and a manually constructed measured row/stack/canvas heading tree. The fixture does not yet implement a production AST-to-layout compiler or actual text measurement. Six core and two integration tests passed locally; combined across repositories: 26/26. Source/test blob hashes were compared against GitHub. CI workflow pins updated library commits; remote CI results not verified. No lockfile, GUI, or release yet.

## Third milestone — manuscript pagination adapter PoC

Added compileMeasuredManuscript using injected BCM scanner and block ID index, plain ATX headings/plain paragraphs/leaf figure/any pagebreak only, explicit test measurement, origin preservation, and diagnostic rejection of unsupported blocks. This is not a full AST/theme/manifest compiler; no reference resolution, chapter numbering, resource I/O or actual text measurement. Outputs are never publication-ready. Added two cross-library tests and pinned experimental library commits. Tests/CI not yet verified.

Formal review guard now requires an explicit publicationReady=true in addition to revision/fingerprint/full plan. Legacy or experimental plans remain displayable but not formally reviewable; this guard is not itself publication validation.

## M03 continuation — schema/inspector integration

Compiler now requires the BCM partial schema validator and rejects its diagnostics before measurement. Added integration fixture for a rejected remote asset path and validated local figure width via Engine Inspector; CI pins updated to experimental library commits. Earlier core/integration CI including formal review guard succeeded. Latest integration fixture not yet verified. Full parser, semantic references, project-root/symlink checks, real measurement and GUI remain pending.

Review: previous core and integration checks succeeded. CI now pins merged BCM/Engine commits including BCM boundary/FIFO review fixes; latest combination requires re-verification. No formal release or publication readiness change.

## M04 — browser preview preparation

Separated semantic preparation from fixture measurement; introduced a restricted browser-preview request adapter for exact single-line source paragraphs and plain ATX headings, with source offsets and heading constraints. Unsupported features (figures, manual pagebreaks, multiline paragraphs) are diagnosed rather than silently omitted. No publication readiness. New integration tests pending.

Added loopback-only browser preview demo: text input, content dimensions, measured page rendering, exact source selection and stale result invalidation. No save, Electron/React, project files, theme editor, full Markdown, or publication output. Chrome integration smoke test pending.

## M04 — desktop workspace PoC

Added experimental Electron/React shell with a sandboxed renderer, allowlisted UI protocol and narrow IPC, book.yaml loading, ordered manuscript list, source edits, conflict-checked single-file saves and measured preview. Mixed line endings read-only. No full project creation, manifest editing, journal/recovery, actual book-wide theme/page preview, structural GUI, component editor or PDF. See DESKTOP_WORKSPACE_POC.md for limits. Unit and real Electron CI pending verification.

## M04 — font roles and bundled Noto Sans JP

Added independent preview body/heading family and weight settings; editor display separate. Locally bundled Noto Sans JP Variable with OFL notice and font asset fingerprint; default body 400/heading 700. No runtime network font download. Preview font changes invalidate layout. Generic fonts are environment-dependent; glyph coverage, project theme persistence, import, per-block overrides and PDF embedding not yet implemented. CI pending.

## M04 — new project and theme persistence

Desktop new-project form creates an exclusive child directory, book.yaml (written last), initial manuscript, theme, and resource directories. Existing paths never overwritten. Theme typography v1 stores stable font IDs and role weights, with optimistic hash checks and temp-file replacement. Existing theme metadata preserved semantically; YAML formatting may normalize. Separate source/theme dirty states; preview dimensions remain temporary. New project failure can leave a partial folder for manual recovery, not automatically deleted. No section management, font import, complete theme compiler, project lock/journal or multi-OS verification. CI pending.

## M04 — project font import

Added restricted static TTF/OTF import with SHA-256 per-face catalog, user rights/notice metadata, structural table checks, project-specific font protocol, sandboxed FontFace loading, font manager list/sample and independent font selection with persisted theme IDs. Real font fixture and Electron smoke verification added. No complete parser, glyph coverage, font collections, variable/italic, local-only fonts, deletion, PDF embedding or formal publication. CI pending.

## M04 — physical book composition

Added A4/A5/JIS B5 paper presets and physical margins, first interior side, manuscript ordering/start mode editing, conflict-checked manifest save, multi-manuscript preview including unsaved selected text, explicit pagebreak and alternating margins. Whole-book preview rejects unsupported cover/blank/physical-side starts and unsupported BCM. No creation/removal of additional sections, spread view, numbering, complete theme compilation or PDF. Cross-file fragment selection reports document ID rather than automatically switching. Snapshot is not a disk watcher; only preview. CI pending.

## M04 — Component Lab heading PoC

Added a shared strict flat row/column heading design compiler, live measured sample, decoration rectangles, editable physical spacing/color/size, explicit discard and apply to theme. Actual book preview consumes saved definition and uses same Engine measurement/placement. Heading typography inherited. One content slot, no nested nodes, free canvas, extra text, multiple component bindings or arbitrary BCM overrides. CI pending.

## M04 — per-level components and fixed labels

H1–H6 design overrides with shared fallback, fixed label elements with independent font/color/size, content font override and reset. Existing schema v1 migrates to v2 on save. Theme validation and real browser/Electron tests added; CI pending. No nested layouts or arbitrary component binding yet.

## M04 — nested component groups

Recursive row/column groups with stable IDs, group/ungroup, sibling reorder, physical width/spacing/background, recursive font validation and actual measured page rendering. Existing designs remain readable. CI pending; no Canvas, dynamic slots or arbitrary component registry.

## M04 — bounded Canvas editing

Component Lab supports converting a nested group to fixed-height Canvas, numeric child X/Y/width, paint order and measured overflow diagnostics. Theme and actual book preview share the same compiled coordinates. CI pending. Not full-page/spread Canvas; no drag, rotation, anchors or general assets yet.

## M04 — Canvas direct manipulation and draft history

Measured preview pointer drag, bounds and 0.1 mm snap, single-gesture commit, automatic remeasurement, selection outline, bounded 64-entry undo/redo for draft design changes. Explicit Apply/Discard preserved. Actual Electron mouse-event smoke and pure history/coordinate tests added. CI pending; no resize handles, global history, or full-page Canvas.


## M04 — 数式関連サブマイルストーン完了 (2026-11-26)

PR #54〜#64（および Engine #23〜#28）で数式構文、フォントロール、STIX Two Math、複数行、部品本文/名前付きslot、章別採番、永続ID参照、GUI編集、Lab、3原稿総合試験を拡充。#64 の最終head c2d2c0976256e3588b7d889143da929c3ebabf24 は Core checks 45763742917、Cross-library smoke test 45763742862、Desktop workspace PoC 45763742900 が全て成功、main merge a3db29bc32d6809bfe43a7d97b634d7b7405f57f。実PDF preflight は3ページ、10数式、6採番ラベル、160×200mm、STIX埋込、3ページのラスタ検査成功。参照ログ: https://github.com/Fugu0141/BookCreator/actions/runs/45763742862 。これは数式関連のPoC完了であり、M04全体やQ15開発版公開、出版可能性の認定ではない。

未対応: 完全なTeX/BCM構文、全グリフ校正・全OSの字体差、図表/脚注/目次の全機能、正式PDF、保存済みsnapshot確定、ライセンス/公開ゲート。歴史的な上記各節の未確認記述はその時点の記録であり、現状の根拠はこの節と各PR/CIを参照。

## M05（作業上の仮称）— 試しPDF出力の共通基盤

revision/fingerprint、全計画、エラーなし、紙面寸法/順序を検証する trial print projection を追加。新しく生成した未接続の組版DOMだけを対象とし、ガイドとプレビュー枠を除去して固定ページを印刷する。M04の実PDF fixtureで共通処理を使う回帰試験に変更。CI未確認。Desktop保存UI/安全なファイル置換/正式出力は未実装。


## UX-02a — 制作工程を分けるWorkspaceシェル (2026-11-26)

BC-UI-R2 (PR #68) に沿う第一段階。起動時ホーム、新規/既存書籍から執筆へ、執筆/デザイン/レイアウト/出版のナビと独立書籍設定を追加。執筆では紙面を既定非表示、組版操作で表示、任意に折りたたむ。共通フォント、部品、素材管理はDesignへ移設。レイアウトは紙面専用表示、出版は未実装の出力を提供しない。編集中バッファ、テーマ設定、書籍設定は同一プロジェクト内の画面切替で維持。数式/参照/部品の作業案やIPC処理中は切替を拒否し、取消または完了を促す。プレビューの原稿選択導線を維持。既存の編集・保存・計測APIを変更せず、Windows package smokeにホーム/各モード/未保存原稿保持/紙面既定非表示の検査を追加。既存Electron回帰試験を実際の表示面から操作するよう更新。CI未確認。

UX-02全体の完了ではない。共通保存の対象別処理、未保存/未適用案の適用・破棄・継続ダイアログ、複数バッファ、復元、キーボードナビ、構造GUI、詳細書式の段階表示、部品専用3ペイン、ページ一覧・出力UIは後続。実機ユーザー評価/Windows拡大率の確認は未実施。


## UX-02b — 保存対象・組版状態・次の操作を分離 (2026-11-26)

UX-02a (#69) に依存する追加改修。ヘッダで原稿/テーマ/書籍設定の未保存対象を区別し、ステータスバーで組版未実行/実行中/結果あり/失効/失敗と選択原稿・全冊の範囲を表示。組版の成功を正式出版可能とは扱わない。出版画面から未保存対象の各画面への導線を追加。空の原稿/紙面に次の操作を案内。IME中の遷移・原稿保存・切替と数式/参照等の作業案中の原稿切替を拒否し、変換終了後に解除。紙面から原稿へ戻る際にも現在の遷移ガードを確認。Windows package smokeで独立した保存/組版状態、出版面案内、IME開始/終了、編集による失効とディスク不変を検査。CI未確認。外部変更の即時監視、保存対象の一括処理、保存/破棄/取消の共通ダイアログ、完全なGUI編集、詳細ツールバー整理は後続。


## UX-03a — 執筆ツールバーの段階表示 (2026-11-26)

#69〜#71 の累積head e2e7b26fbbc7bb0a54ce04d9b9ef83f5f3008f2a で全5CI成功、#71をmainに統合（880695e27d6820a642187b49084643c6b56f0a8f）。Windows artifact: https://github.com/Fugu0141/BookCreator/actions/runs/45799857113/artifacts/15106008429 。#70は全変更を含む統合後に重複PRとして閉じた。#69/#70単独のcross-libraryはフォントfixtureインストール待ちだったが統合headでは成功。

UX-03aは原稿選択時の基本文字書式（太字・斜体・下線）とリスト、数式・参照、教材部品、詳細書式、表示の開閉ボタンを分け、既定では詳細を表示しない。詳細パネルは同時に1つのみ、開閉/モード・原稿切替で原文変更なし。ESCと閉じるボタン、aria-expanded/controls、選択保持、IME・数式/参照作業案中の開閉ガード（パネル切替）、既存コマンド/ID/局所パッチを維持。Windows package smokeで初期の非表示、パネル排他と原稿保持を検証し、既存Electron回帰は可視パネルへの導線を通す。CI未確認。選択種別に応じた詳細属性の有効化、教材部品のID/スロット詳細化、数式専用編集面、構造GUI、原稿ファイル管理、共通保存/取消ダイアログは後続。画面の実機利用者評価は未実施。


## UX-03b — 数式・教材部品の挿入詳細 (2026-11-26)

#72 のhead 91ced25de702652808d7fcfaad43aa5248fa8a73 は全5CI成功（Core 45800926207、Cross-library 45800926251、Desktop 45800926244、Pages 45800926205、Windows 45800926239）、main merge d561bf18d8f6991c40615add9275f6622a1a19e0。

教材部品は種類選択と原稿末尾追加を基本操作にし、任意ID・生成・解答先ID・任意スロットをネイティブdetailsへ移動。新しい原稿では閉じた状態から開始。既存の入力値・編集処理・IDを維持し、開閉は原文を変更しない。数式の永続IDも採番時または既存数式編集時の詳細表示へ移動。採番の有効化や数式入力・診断は基本表示のまま。Windows smokeで教材詳細の既定非表示・開閉・追加操作可視・原稿保全を検査し、既存Electron回帰試験は詳細を開く導線を追加。CI未確認。参照先の選択ピッカー、カーソル位置への教材挿入、数式の専用ダイアログ、選択依存の文字書式、構造GUI、実機評価は後続。


## UX-03c — 選択範囲に応じた文字書式 (2026-11-26)

UX-03bのWindows初回検査では閉じたdetails内の入力欄に矩形が残ることを検出。#73で閉じたdetailsのsummary以外を明示的にdisplay:noneにして再検査中。この変更は#73の修正headに依存する。

原稿の選択範囲が空なら基本文字書式を無効化し、詳細書式は案内だけを表示。非空の選択範囲で既存の部分書式操作を表示する。原稿変更・モード切替・selectionchangeで状態を同期し、原稿切替時はカーソル位置を先頭に戻す。IME・数式/参照作業案・IPC中は書式操作を拒否。選択範囲の構文上の妥当性・数式や参照等の保護範囲は従来の局所パッチ検証が最終判断する。Windows smokeで選択/解除と詳細欄、原稿不変を検査し、Electron回帰ではselectionchangeを待って可視・有効なボタンから操作する。CIおよび実機評価未確認。数式の種類別インスペクタ、GUI構造編集、教材参照ピッカーは後続。


## UX-04a — デザイン画面のカテゴリ分離 (2026-11-26)

UX-03c #74 のheadに依存。デザイン内にスタイル・部品ライブラリ・素材・フォントの4カテゴリを設け、同時に1カテゴリのみ表示する。新規・既存書籍を開いた時はスタイルから開始し、同一書籍内ではカテゴリと未保存の編集値を維持。スタイルには本文・見出しの参考見本と共通フォント設定の取消を追加（実測組版ではない）。部品の入口を見出し・本文・教材/自作のカードに分け、未保存フォント設定で部品編集不可の場合はスタイルに戻る導線を表示。素材・フォントの登録機能と権利検証、既存IPC/編集APIは維持。Windows smokeでカテゴリ排他・未保存設定保持を検査し、Electron回帰は各カテゴリから既存機能に到達する。CI・実機未確認。部品個別カード一覧、検索、割当/複製管理、詳細エディタ3ペイン、素材・フォント管理の一覧自体の改善は後続。


## UX-04b — 部品ライブラリの検索・個別カード (2026-11-26)

#75 のheadに依存。共通見出し/H1〜H6、本文、7種の教材部品、およびライブラリ登録部品を個別カードにし、部品名・設定状態による検索と種類フィルタを設けた。簡易見本は文字色・背景色と役割フォントの参考表示であり、実際の形状・配置・部品固有フォント・実寸を保証しない。個別/継承/共有参照の区別を表示。カードから対応する既存エディタを開き、登録部品はID・名称と複製したデザインを作業案に読み込む。計測前の上書き不可、テーマ適用と登録部品更新の区別、既存の保存・参照保護を維持。従来の対象指定も詳細欄から利用できる。Windows smokeでカードの検索/絞込・未保存テーマの編集拒否、Electron回帰で登録部品を直接開いて実測・取消した際のテーマ不変とH3への直接遷移を検査する。CI未確認。実測サムネイル、詳細使用箇所一覧、ライブラリの独立管理画面・専用3ペインは後続。


## UX-05a — 部品エディタの3ペイン化 (2026-11-26)

#75 全5CI成功・main merge a6d70fdf7e72492c8eee8e36f4ba64d111caa8d6。#76のheadに依存する。見出し・教材部品および本文フレームの既存エディタを、左レイヤー/ライブラリ、中央実測キャンバス/サンプル、右プロパティへ再配置した。自由配置座標は右側へ、計測と吸着設定は中央上部へ移した。表示領域は拡大し、各ペインでスクロールを管理する。キャンバスの物理寸法・計測・ドラッグ/リサイズ・履歴・保存・共有参照の実装は維持し、CSSによる縮尺変更は行わない。Desktop regressionに3ペインの実際の位置関係と既存操作の所属検査を追加。CI・実機未確認。現時点で全プロパティのタブ分類、サンプル切替の集約、ズーム/フィット、ペイン幅の変更、ウィンドウ拡大率検証は未実装。


## UX-05b — 要素追加メニューとプロパティ分類 (2026-11-26)

#77 head 2186035cdbd8eee8cb4d1dbac33dfcee0ed09ee7 の全5CI成功（Desktop 45803326822、Core 45803326851、Pages 45803326730、Cross-library 45803326761、Windows 45803326781）、main merge f8f0aaaf96761e3e130a0dfd39ab724df97fa150。矩形・固定文字・画像・動的文字・原稿スロット追加を1つの開閉式メニューに集約。部品と本文エディタのインスペクタを外観（色、フォント、画像表示・トリミング）、配置（寸法、座標、余白等）、詳細（固定文字、動的情報、スロット名・省略、代替テキスト等）へ分類し、同時に1分類のみ表示する。共通設定と選択要素の区別、既存の操作ID、計測・履歴・保存・ロック等の編集契約を維持。Desktop回帰でメニュー初期非表示、開閉、カテゴリ排他、各操作の所属を確認する試験を追加し、従来操作は対応する表示面へ遷移して実行する。CI・実機未確認。グループ化・ライブラリ操作の追加整理、キャンバスズーム・フィット、サンプル設定の段階表示は後続。


## UX-05c — キャンバスの表示倍率とサンプル設定 (2026-11-26)

#78 head cd9ba3d2fd17e71dc2b7588d918c13c72e569e28 全5CI成功（Desktop 45803758584、Windows 45803758632、Core 45803758597、Pages 45803758611、Cross-library 45803758551）、main merge b5f970c01c91d75f377ef4fc6af8240d67151490。見出し・教材・本文フレームで50/75/100/125/150/200%と幅フィット（25〜100%）を提供。実測完了後のプレビューホストにCSS zoomを適用し、プレビュー再生成と表示領域のリサイズにも追随する。ドラッグ中は倍率更新を停止し、既存の画面矩形から実測座標への変換を使用する。サンプル設定を初期折りたたみにして、開閉や倍率変更のみでは計測結果・履歴・保存内容を変更しない。Desktop回帰で倍率切替、実測寸法保持、75%での実マウスドラッグとリサイズの寸法、本文倍率切替、サンプル開閉を検証する試験を追加。CI・実機未確認。フィットはページ幅基準であり、高さ全体のフィットや自由倍率スライダー、ペイン幅調整、DPI別検証は後続。


## UX-06a — レイアウト画面のページナビゲーション (2026-11-26)

#79 head 2c3a371830ad5ade0723fbd62caba5a3b1419886 全5CI成功（Core 45804148537、Pages 45804148410、Cross-library 45804148412、Windows 45804148594、Desktop 45804148411）、main merge 12e59d1c044622679458845de13b6b3cd3241c3c。レイアウト画面に左ページ一覧、中央実測紙面、右ページ情報を追加。実際のプレビューDOMの物理ページ順と既存断片の原稿由来から一覧を生成し、前後移動・番号指定・一覧クリック・スクロール連動を提供。全冊と選択原稿の組版結果を区別。編集による無効化時は既存どおり紙面を破棄し、一覧・選択も消去。現在開いている原稿への断片移動は既存実装を維持。Windows smokeに複数ページの全冊組版、移動、原稿由来表示、無効化、保存内容不変の検査を追加。CI・実機未確認。ページサムネイル、印刷ページ番号、別原稿への直接ジャンプ、ページのズーム・高さフィット・ガイド切替、選択ブロックの詳細、出版前検査は後続。


## UX-06b — 紙面の表示倍率・ガイド・簡易サムネイル (2026-11-26)

#80 初回CIは4/5成功、Windowsパッケージの起動後テストが script execution error（run 45804650235, job 139856565962）。数値のCSS属性セレクタの引用漏れを修正し、実行式の診断を追加（#80 branch 34bae2490319497520ab60bf3a5e8fe6445a0560 と本branchに同一修正）。再検証待ち。紙面の50/75/100/125/150/200%、幅フィット、ページ全体フィット（10〜100%）を閲覧専用のCSS zoomで実装。表示領域のリサイズに追随し、倍率変更時は選択ページを基準に再配置する。余白ガイドはEngineのdata-content-guideだけを非表示にし、執筆へ戻れば通常表示に復帰。ページ一覧に実測断片の矩形を使った簡易見本を追加（1ページ最大60矩形、文字・画像の複製なし、実際の印刷サムネイルではない）。組版データ・寸法・履歴・保存契約は維持。Windows smokeに倍率、ガイド、ページ全体フィット、実測DOMの同一性と寸法不変、簡易見本を検査するケースを追加。CI・実機未確認。厳密なサムネイル描画、印刷番号、別原稿ジャンプ、出版前チェックは後続。


## UX-06c — 出版準備の工程表示と試作組版診断 (2026-11-26)

#81 head eedfd0c59af06b1121f8e231b658ae91bf6538a1 全5CI成功（Core 45805023695、Cross-library 45805023537、Desktop 45805023653、Pages 45805023658、Windows 45805023694）、main merge 8c65846f671348edce198f98b29686ee07ac558c。#80の変更・Windows修正は#81に含まれるため#80を重複統合せずクローズ。出版準備画面を保存（原稿・テーマ・書籍設定）、全冊組版、試作組版の診断、正式品質検査・確定・出力の4段階に分離。未保存、未組版、部分組版、無効化、実行中、失敗、全冊試作成功の状態を表示し、対応する作業面へ案内。出版準備から全冊組版を実行してレイアウトへ移動可能。組版失敗時には準備診断のコード・原稿ID・メッセージ、または実行例外を保持し、原稿等の変更で消去する。試作成功と正式出版可否を区別し、正式品質検査・警告確認・版確定・PDF出力は未実装表示のみで操作を露出しない。Windows smokeに保存/部分/全冊/失敗/回復状態と出力不可の検査を追加。CI・実機未確認。正式preflight、警告承認、snapshot確定、出力、診断位置への直接ジャンプは後続。


## UX-07a — ショートカット・サイドパネルの開閉 (2026-11-26)

#82のheadに依存。Ctrl/Cmd+Sは選択原稿の保存と共通処理、Ctrl/Cmd+1〜4は執筆/デザイン/レイアウト/出版への遷移と共通処理を利用する。IME変換中・busy・数式/参照の作業案・部品エディタなどの既存ガードを尊重し、テキスト入力のネイティブUndo/Redoは変更しない。Escでキー操作案内/執筆ツールを閉じる。実装済みショートカットをヘッダのキー操作案内に表示。執筆の原稿一覧、レイアウトのページ一覧/ページ情報を個別に開閉し、グリッド領域を再配分する。書籍を開き直すと既定の表示に戻す。Windows smokeにキー操作による遷移・保存・IMEガード・表示領域の拡張と原稿/組版状態の維持を検証するケースを追加。キーイベントはrendererへ合成入力して検証するため、OSレベルのアクセラレータ競合・実キーボード・DPI別実機検査は未確認。CI未確認。ネイティブメニュー、診断の詳細遷移、狭幅/Windows拡大率の系統検査は後続。


## UX-07b — 狭幅・短いビューポートと表示倍率への対応 (2026-11-26)

#83 head df7741f54dd8941147e5330c1cc559b039b4c2b6 全5CI成功（Core 45805761643、Cross-library 45805761484、Desktop 45805761528、Windows 45805761442、Pages 45805761389）、#82を含め main merge 563feb7e0ec983114c7cab4dcb58d25f2bf317d6。狭幅でのヘッダ/ボタン折り返し、保存表示維持、制作工程の横スクロール、短い高さでのツールバー・ステータス欄のスクロール、ホームの狭幅配置、執筆/紙面領域の柔軟な再配分、部品ダイアログの狭幅・短高対応を追加。組版の物理寸法・保存契約は不変。Windows package smokeにChromium UI倍率125/150/200%でホーム、執筆、レイアウト（サイドパネルを閉じる）の主要操作と領域の幾何検査、倍率復元、原稿・実測寸法の不変検査を追加。Desktop smokeで200%相当の部品エディタの計測・プロパティ選択・領域アクセスを検査。CI未確認。Chromium UI倍率はOSのDPI変更を模擬するための縮小CSSビューポート検査であり、実際のWindows表示スケール、複数モニター間DPI変更、実機の見た目/入力品質は未検証。次は診断導線、表示統一と実機評価。


## UX-07c — 組版診断とUIの統一 (2026-11-26)

#84 head a9f789e4240a48762d6188b1b49a3090ceeccede 全5CI成功（Core 45806189832、Pages 45806189829、Desktop 45806189780、Windows 45806189837、Cross-library 45806189891）、main merge 5a7e8d304778bbe490e34d53b8354181fc1ab188。試作組版失敗時の診断を共通パネルと出版準備で表示し、診断コード・原稿ID・行番号・メッセージを共通化。原稿範囲を組版時のソースと照合し、現在の内容と一致する場合のみ選択して執筆画面に移動。他原稿の場合は既存の未保存確認・読込・世代ガードを利用し、一致しない場合は再組版を案内。原稿等の変更時に古い診断を破棄する。正式品質検査ではない。範囲なしの診断には直接移動ボタンを表示しない。共通の境界色・背景・二次ボタン・フォーカス表示を整理。Windows smokeに不正な数式の診断表示、原稿範囲選択、内容不変、修正後の古い診断消去を追加。CI未確認。他原稿への移動・外部変更・実機の操作感は個別の追加検証が必要。ネイティブDPI、正式品質検査、構造GUI編集は後続。


## UX-08a — 構造編集の初期実装 (2026-11-26)

#85 head 2bf86de0097f46ad61fda26d1f78d28270b7a382 全5CI成功（Core 45806773376、Pages 45806773559、Windows 45806773670、Desktop 45806773519、Cross-library 45806773564）、main merge c9d501a0c622bcdff2ca8076a736832ecce56157。ソース編集を既定のまま、原稿単位で構造編集（試作）を選べるようにした。BCM scannerのトップレベル範囲を使い、平文ATX見出し・独立した1行平文段落・閉じた独立数式を明示的な反映/取消で編集。同一の編集中原稿へ期待値付き局所パッチを適用し、再スキャンで種類・レベル・対象外の全ブロックの原文一致を検査。数式はEngine parserで検証。複雑なMarkdown、部品、コード、ラップ数式、未知/診断のある構造は変更せず、ソースの元範囲へ移動可能。編集中の案は保存・組版・画面切替をブロックし、IMEを保護する。Windows package smokeに切替、取消、無効入力、本文/数式変更、BCMコンテナ保持、ソース選択、原稿往復を追加。CI未確認。GUI既定化、複数行本文/リッチ書式、組版スタイルに準拠した数式表示、教材部品の専用編集、挿入・並べ替え・Undo/Redo、分割表示、実機検証は後続。現時点では構造GUI全体完成ではない。


## UX-08b — 複数行本文・見出しレベル・文字書式 (2026-11-26)

#86 head 85fbed790858962d441d8a18f7e74b7c32c8c0eb 全5CI成功（Core 45807568969、Cross-library 45807568952、Pages 45807569348、Desktop 45807568986、Windows 45807568932）、main merge 178aaccdb2bc04b1e25330b7c183df2628f4d97b。トップレベルの連続raw行を一つの段落として投影し、既存parsePreviewInlineで対応範囲を判定。複数行本文の編集、H1〜H6の見出しレベル選択、選択範囲の太字・斜体・下線ボタン（既存planInlineFormat/期待値付きパッチ）を追加。表示時は既存パーサーの論理文字列と書式runをReactで描画し、任意HTMLを実行しない。編集欄はMarkdown記法を表示する段階的実装。反映時は段落数・対象外原文・対象範囲の一致を確認し、改行規約を維持。空行で段落を分割する変更や非対応構造はソース編集へ案内。Windows smokeに見出しレベル、複数行本文、太字表示と原稿往復、空行分割拒否の検査を追加。CI・実機未確認。インライン数式/参照の意味的編集、完全リッチテキスト入力、複数ブロック操作、挿入・履歴・教材部品GUIは後続。


## UX-08c — 構造編集の数式描画・入力支援 (2026-11-26)

#87 初回Desktop build失敗（45807977070, job 139868119102、JSX閉じ括弧過剰）。修正head a5360a9a985a4b2829a42aa7cfbf80744703f3e0 全5CI成功（Windows 45808161001、Cross-library 45808161017、Core 45808160993、Pages 45808160923、Desktop 45808160932）、main merge a48469a7953874c5228abffdaa4c981ddf8369b1。既存Engine createPreviewMathによる独立/本文内数式のMathML描画、書籍の数式フォント、編集中のプレビュー、対応構文のテンプレート（式全体を置換）を追加。既存parsePreviewInlineとparsePreviewMathで本文内数式の範囲を取得し、個別式の編集・取消・更新を段落の未確定案に限定。元の式範囲の一致、再解析、外部ブロックの保存、IMEガードを維持。見出し中の数式や参照解決が必要な段落は対象外。Windows smokeにMathML・分数テンプレート・不正式・複数本文内数式の一つだけ変更・外側反映まで原稿不変の検査を追加。CI/実機未確認。番号付きラップ数式、参照、教材部品内数式は既存ソース編集へ委ねる。構造GUIでの番号/参照、数式挿入、直接リッチ数式入力、教材部品GUIは後続。


## UX-08d — 教材部品の内容・既存スロットの構造編集 (2026-11-26)

#88 head aac11431db5b65200abfe2757a4557a9e977396c 全5CI成功（Pages 45808492661、Core 45808492689、Cross-library 45808492903、Windows 45808492976、Desktop 45808492734）、main merge fb3baa1c6016f6dcd45ed5c71829e0977b551d96。既存のstudyKind/customStudyIdとBCM scannerを利用し、補足/ポイント/注意/重要/例題/練習問題/解説および登録済み独自教材部品の本文・既存名前付きスロットを個別に編集。既存parsePreviewInlineとEngine MathMLによる文字書式/本文内数式/独立数式の内容プレビュー。外観の編集ではなく入力内容の編集。ID、title、answer-to、登録ID、外側ヘッダ、スロット名・フェンス・対象外の原稿を保持し、期待値付き局所パッチ後の再スキャンで外枠と各入力欄の一致を検査。編集中の保存/組版/移動・IMEガードと明示反映/取消を維持。参照トークン、番号付きラップ数式、未対応入れ子、未登録部品等はソースへ案内。名前付きスロットの新設/削除・ID/タイトル/リンク変更・デザイン準拠の完全表示・数式専用のフィールド入力は後続。Windows package smokeに複数スロット、独立/本文内数式、取消、不正構造、解答リンク保持、登録部品の内容変更を追加。CI・実機未確認。次はブロック挿入・移動・履歴、追加の意味的編集とUX-08の既定化判定。


## UX-08e — 構造ブロック操作・履歴の初期実装 (2026-11-26)

#89 初回Desktop 45809191408 / Windows 45809191635のsmoke失敗はテスト関数スコープとString.replaceの$$解釈による期待値誤り。修正head df9173b6d041806c02b182d79ba5f0d87036a3ae 全5CI成功（Windows 45809503094、Pages 45809503102、Core 45809503131、Cross-library 45809503089、Desktop 45809503258）、main merge ce22852d51294f402c89113f768f79b14fcfeaaf。構造GUIでH2見出し・本文・独立数式・既存7種の教材部品を安全なブロック境界の前/末尾に挿入。空原稿に対応。本文と番号なし独立数式のみ隣接移動・複製・確認付き削除に対応し、見出し・ID付き/教材部品・複雑な未対応構造は移動/複製/削除から保護。期待値付き局所パッチ・再スキャンで結果のブロック順/内容/診断を照合。構造編集の反映を同一原稿内の履歴（最大20操作、過去原稿の合計100万UTF-16単位まで）でUndo/Redo、ソース編集等による変更と原稿切替時に破棄。Ctrl/Cmd+Z、Shift+Z/Yは構造画面の入力欄外で利用、IME・未確定案・既存ネイティブ入力Undoを保護。原稿変更の組版無効化を維持。Windows smokeに空原稿作成、挿入、移動、複製、削除確認、Undo/Redo、保護、ソース変更による履歴消去を追加。CI・実機未確認。登録部品/名前付きスロットの挿入、章・採番・参照を含む移動/削除、ドラッグ並べ替え、GUI既定化、総合検証は後続。


## UX-08f-1 — 登録教材部品の構造挿入と既定化判定 (2026-11-26)

#90 head fd182da7fb0bf1fb8238d424d2b5d289edfadd3b 全5CI成功（Core 45809869285、Cross-library 45809869263、Pages 45809869332、Windows 45809869259、Desktop 45809869323）、main merge 779be2f774121a5897d78ffcd822746209eff85f。構造挿入選択肢を文章・数式、標準教材部品、登録教材部品に分類。現在のテーマ内の登録IDとusageを照合し、既存slottedStudyTemplate/namedSlotDefinitionsを再利用。共有バインディングを含む部品定義の必須欄を生成、任意欄は既定で省略し明示選択で追加。挿入前に入力欄一覧を表示。生成した部品のスキャン結果と欄名を照合し、対象外原稿は既存の操作検査で保護。既存Desktop smokeに登録部品の先頭挿入、Undo、任意欄なし/ありの末尾挿入、実測紙面との連携を追加し、従来のソース挿入検査も保持。CI・実機未確認。docs/STRUCTURED_EDITOR_READINESS.md に機能差と既定化ゲートを記載。GUI既定化は保留。数式番号/参照、ID/解答リンク、完全リッチ編集、総合実機評価は後続。


## UX-08f-2 — 数式番号・参照の構造GUI連携 (2026-11-26)

#91 初回4/5成功、Desktop smoke 45810444783 / job 139876561879 は必須欄と任意欄を持つ別登録デザインを同一と想定したテストでtimeout。multiId/optionalIdを分けて検証するよう修正（#91 head af0d92e75938216cbfdd885409071592ad1c45cb、本branchにも同一修正）。再CI実行中。構造画面でトップレベルの番号付き/ID付き独立数式ラッパーを既存inspectDisplayMathで識別し、MathML表示・数式編集・原文確認・採番切替を提供。番号なし独立数式からの採番も既存planEquationNumberingと全冊原稿スナップショットを再利用し、参照中の採番解除を拒否。本文の未変更編集案のカーソル位置から既存参照選択を開き、章番号・式番号・ID・原稿を提示、選択/取消/反映時の全冊スナップショット照合を維持。構造履歴に反映し、組版結果の無効化を維持。参照を含む本文は追加編集をソースへ案内し、表示番号は組版で確認。Windows smokeに採番、ID保持、数式変更、参照挿入/取消、参照中採番解除拒否、実測紙面、Undoを追加。CI・実機未確認。教材部品内番号付き式/参照の構造GUI、参照を含む文章の直接編集、参照表示の即時解決、部品間関連付けは後続。


## UX-08f-3 — 教材部品の永続IDと解答・解説の関連付け (2026-11-26)

#92 head 3a439e0b05e32c6b39d61ba8217269c501d5683c 全5CI成功（Cross-library 45810948484、Pages 45810948384、Core 45810948575、Desktop 45810948431、Windows 45810948705）、main merge 7fa61cf6e44736b2477a79c9a3dbb16e90e745e5。#91の同一修正を含むためクローズ（#91再CIのWindows 45810803464は検査後のMove-Itemのファイルロック）。構造GUIで例題・練習問題・解説・自作部品のID/関連付けパネルを追加。既存IDは変更不可、未設定のインスタンスIDはUUID生成。登録部品の定義IDとインスタンスIDは別。prepareManuscriptとcreateStudyNumberingを再利用し全冊の有効なID付き問題候補、章内番号、原稿、抜粋を提示。解説/独自部品のanswer-toを選択・解除し、既存ヘッダの属性範囲のみを期待値付きパッチで更新。全冊の再読込・revision/source一致・再解析で重複ID、無効な解答先、参照切れ、関連付けの連鎖を拒否し、Undo/Redo・組版無効化を維持。紙面への番号表示は既存の部品デザイン依存。Windows package smokeにID生成/取消、候補選択、関連付け/解除、全冊組版、Undoを追加。Desktop smokeに登録部品のID生成・定義ID保持・Undoを追加。CI/実機未確認。別原稿の対象選択・外部変更・重複IDの個別回帰検査、未対応構造からの修復、関連付けを含む削除/移動、リッチ編集・既定化は後続。


## UX-08f-4a — 記法を隠した文章編集と操作の整理 (2026-11-26)

#93 head 3644caf6e48411716934297af03acf16627df41b 全5CI成功（Core 45811640870、Pages 45811640923、Cross-library 45811640846、Desktop 45811640849、Windows 45811640837）、main merge 648b0b0cdb22150433de4bff6354f8959d0e6d4f。対応する本文・見出しに論理文字列のtextarea、書式プレビュー、選択文字の太字/斜体/下線・詳細の色/サイズ/標準フォント適用と解除を追加。既存のsourceMap、serializeInlineStyle、planInlineFormatを再利用し、変更範囲外の原文と書式を維持し、再解析で論理文字列・書式を照合。対応できない編集は案として保持して反映を禁止し、直前の有効入力へ復帰または取消。IME中の反映禁止。原稿への反映時は既存構造パッチ・Undo/Redoを使用。数式/参照を含む文は記法編集へ、複数書式範囲をまたぐ入力は拒否。文章編集と記法編集を明示的に選択でき、ブロック操作はdetailsで折りたたむ。Windows package smokeに論理入力、選択書式、無効入力、原稿往復、Undoと折りたたみを追加。CI・実機未確認。直接書式付きのcontenteditable/WYSIWYGではなく入力欄とプレビューの分離方式。任意の書式境界をまたぐ編集、段落分割/結合、リスト、取込フォント、数式/参照付き文章の論理編集は後続。GUI既定化は引き続き保留。


## UX-08f-4b — 段落分割・結合とリスト操作 (2026-11-26)

#94 初回4/5成功、Windows package smoke 45812136345 / job 139882407562 は文字選択後の書式ツール表示でtimeout。キーボード・ポインターによる選択検知を補強し、検査を明示的なキーボードイベントに変更（#94 head 6d8f769e290cd50dc82dc68c41e53af9fddcc6ff、本branchにも同一修正）。再CI待ち。構造GUIに平文のカーソル位置での段落分割（Ctrl/Cmd+Enter、明示ボタン）、既存改行位置での分割、隣接段落の結合を追加。分割・結合時の対象外原文を保持。組版側の既存仕様では空行を含む連続本文は同一の意味的ブロックとして扱う場合があるため、GUI上の段落区切りと正式組版上の段落スタイルは区別する。既存prepareManuscript/planListFormat/planListBatch/planListIndentを再利用し、対応する独立リストの表示・項目本文編集・箇条書き/番号付き変換・解除・2階層の変更を追加。安全な範囲の局所パッチ・再スキャン・構造履歴で検証。CI・実機未確認。任意の複雑な書式境界での分割、空項目/Enterによるリスト項目追加、3階層以上、連続性が曖昧なリスト、完全WYSIWYG入力、直接IME実機評価は後続。Windows package smokeにカーソル分割・結合・リスト変換・階層変更・項目編集・Undoを追加。GUI既定化は保留。


## UX-08f-4c — リスト項目の追加・削除 (2026-11-26)

#95 head 420d9195c398d9d790a39fef5fce56ee5820e8bd 全5CI成功（Core 45812759293、Cross-library 45812759336、Pages 45812759332、Desktop 45812759297、Windows 45812759557）、main merge cf96cb67a147bacae1e85f76a4f48e12eb41d54f。#94の再CIも全5成功、同一修正を含む#95統合後にクローズ。単一階層の統一マーカー・連続番号付きリストに限り、項目編集の案内で追加/削除、連番更新を可能にした。空項目のまま反映不可、最後の項目は削除不可、複雑な階層・非連続番号は従来の項目内容編集のみ。局所パッチ、再解析、周囲の構造照合、既存履歴を使用。Windows smokeに追加、空項目、番号更新、取消、削除、Undoを追加。新規CI・実機未確認。Enter/Tabによる操作や複雑な階層の項目数変更は後続。GUI既定化は保留。


## UX-08f-4d — キーボードでのリスト編集 (2026-11-26)

#96 head d54c723a9913088ee02648ef3c40c496377d98f9 のCore/Cross-library成功、他3CI実行中のためmain未統合。本ブランチは#96から分岐。単一階層の安全なリストでEnterによる追加・平文分割、空項目でBackspace削除、フォーカス移動を追加。IME中・選択範囲・書式途中の分割を保護。Tab/Shift+Tabは既存の階層変更プランナーを使用し、原稿ではなく未確定案へ反映。再解析、対象外原文、項目内容、対象外階層を検証し、通常のTab移動へのフォールバックを維持。反映時は既存履歴、取消時は原稿未変更。Windows package smokeにIMEガード、項目追加/削除、フォーカス、階層変更、Undoを追加。新規CI・実機未確認。空項目Enterでリスト終了、複雑な階層の項目追加/削除、完全WYSIWYGは未対応。


## UX-08f-5a — 数式・参照を含む本文の文章編集 (2026-11-26)

#97 head 2a0a37383d17b977feaa6a2b41eec484b0c0be11 から分岐（4CI成功、Windows実行中）。独立本文を既存parsePreviewInline/sourceMapで解析し、数式・数式参照・既存書式・エスケープ文字を保護部品として表示。参照は既存parseReferenceTokenで検査し、番号を推測せず参照先IDを表示。文章部分のみの未確定案を編集し、再解析で保護部品の原文・順序・文章部分と他ブロックの原文を照合。期待値付きパッチ、既存IMEガード・取消・Undoを利用。Windows smokeに参照付き文章の変更・無効入力・Undo、数式付き文章の表示と取消を追加。混在GUIでの数式/参照挿入・編集、書式変更、参照先選択、完全WYSIWYGは後続。新規CI・実機未確認。GUI既定化は保留。


## UX-08f-5b — 混在エディタでの数式編集・挿入 (2026-11-26)

#98 head acbb1816169aa2a29e0bbe6ef6117083d2e816e1 全5CI成功（Windows 45819975321、Cross-library 45819975213、Core 45819975212、Pages 45819975217、Desktop 45819975366）、main merge 01803eda241131f4ff7b1cd740133cd864790609。混在本文で数式を選択して編集、文章欄のカーソル位置に数式挿入を追加。既存数式テンプレート/MathML/パーサーを再利用し、数式は未確定案にのみ反映。既存参照・書式・エスケープ文字の原文と順序、変更対象外の本文、再解析による構造、文字境界を検査。IME中の操作・不正数式・選択範囲への挿入を拒否。原稿反映は従来の局所パッチ・Undo/Redo。Windows smokeに数式変更、無効入力、参照付き本文への挿入、原稿未変更とUndoを追加。新規CI・実機未確認。平文の文章編集からの数式挿入、数式削除、参照選択/変更、完全WYSIWYGは後続。GUI既定化保留。


## UX-08f-5c — 混在本文の数式参照選択・変更 (2026-11-26)

#99 head 94a00a4a0cbb02c4d57f58f06ecf496d8a6f74cb から分岐。混在本文内の参照選択/変更・カーソル位置への挿入を既存全冊参照選択パネルで実装。候補は番号付き数式のID・番号・原稿名・数式。原稿・書籍スナップショットを再読込し、本文案の局所パッチと参照トークンの変更を検証、全冊再解析と採番対象の同一性照合後に本文案と参照を一括で原稿へ反映する。取消は本文案を保持。参照以外の保護部品・周囲の原稿・文字境界を保持。Windows smokeに2つの数式間の参照先変更、表示形式、取消、本文案の同時反映、挿入、Undoを追加。新規CI/実機未確認。参照削除、壊れた参照の修復、平文GUIからの数式/参照挿入、完全WYSIWYGは後続。GUI既定化保留。


## UX-08f-5d — 通常の文章編集から数式・参照を挿入 (2026-11-26)

#100 head 4d23df8e121b317b8ec8f374b81b6dfb4d505de6 全5CI成功（Core 45821445529、Cross-library 45821445544、Pages 45821445596、Desktop 45821445634、Windows 45821445523）、main merge 44c1975f48b5f7d4d8c5324543cc337d6fa936dc。#99全コミットを含むためクローズ。通常文章編集のカーソル位置をsourceMapで安全な原文位置へ変換。数式テンプレート・MathMLを利用し、確認後は本文案と既存書式を保持して混在本文案へ遷移。参照は既存全冊候補・再読込・参照プランナーを利用し本文案と一括反映。IME・取消・Undo・不正入力ガードを維持。Windows smokeに数式挿入と取消、参照挿入と取消、Undoを追加。新規CI・実機未確認。書式途中への挿入、数式/参照削除、完全WYSIWYGは未対応。GUI既定化保留。


## UX-08f-5e — 数式・参照の削除と文章編集への復帰 (2026-11-26)

#101 head c6f26d5d40460f4b7ce2c858ba59864a3bde912b から分岐（Core/Cross-library/Pages成功、Desktop/Windows実行中）。混在本文内の数式または数式参照を選択し、明示確認後に本文案と削除を一括反映。前後の文字列をそのまま結合し、残る書式・参照・数式の原文/順序、対象外ブロック、書籍全体の採番対象を再解析で照合。空本文・不正な結合は拒否。最後の数式/参照削除後は通常の文章編集ボタンで続行可能。独立数式の本体とIDは保持。Windows smokeに取消・削除・通常編集復帰・Undo・参照元削除後の数式保持を追加。新規CI・実機未確認。複数書式をまたぐ編集と完全WYSIWYGは後続。GUI既定化保留。


## UX-08f-6a — 複数の書式範囲をまたぐ文章編集 (2026-11-26)

#102 head b7959cb95ade4d9664f0f6dd9818f5d591e0ac7a から分岐（Core/Cross-library/Pages成功、Desktop/Windows実行中）。通常の文章編集で太字・斜体・下線等の複数書式と通常文字をまたぐ削除/置換を許可。選択外の書式は維持、複数書式をまたぐ置換文字は通常書式。切断した書式区間だけ再シリアライズし、隣接する強調記号が衝突する場合は明示style記法を試行。再解析で文字列・書式範囲が完全一致する場合だけ許可。beforeinputの選択スナップショットは一致検証後に使用、IMEとグラフェム境界を保持。Windows smokeに書式横断置換・削除・取消・Undoを追加。新規CI・実機未確認。複数書式をまたぐ書式適用、数式/参照横断の自由選択は後続。GUI既定化保留。


## UX-08f-6b — 複数書式範囲をまたぐ書式適用・解除 (2026-11-26)

#103 head 9b31dcca0eccc58fce77e72c4667ebd3ca7d177a から分岐（Core/Cross-library/Pages/Windows成功、Desktop実行中）。論理選択範囲を既存sourceMapで分割し、太字・斜体・下線は全選択が設定済みなら解除、それ以外は全体に適用。色・サイズ・フォントの設定/解除は対象属性のみ変更（フォント解除時も独立ウェイト保持）。非対象原文と属性を保持し、書式分割・再シリアライズ後に文字列と書式範囲の完全一致を検査。aria-pressedで混在状態を通知。改行、特殊記号、表現不能な端の空白は拒否。単体テストとWindows smokeに複数範囲適用/解除/Undoを追加。新規CI・実機未確認。数式・参照横断選択と完全WYSIWYGは後続。GUI既定化保留。


## UX-08f-6c — 数式・参照を含む範囲選択 (2026-11-26)

#104 全5CI成功、main merge c3d589dfafb63223ecda26916fde331de05741f2。混在本文の範囲編集モードを追加。連続表示上でネイティブ選択し、テキストのUTF-16位置と数式/参照を1単位として対応付ける。数式・参照を完全に含む範囲の削除・置換を明示反映、残存トークン原文、書式・特殊記号、周囲の原稿構造、全冊採番対象を検証。グラフェム境界、古い選択、空本文、不正な記法を拒否。取消で本文案保持、Undoで一括反映を復元。Windows smokeに文章・数式・参照横断選択と取消・置換・Undoを追加。新規CI・実機未確認。書式/特殊記号をまたぐ選択編集、連続面への直接入力、キーボード範囲編集の操作性検証は後続。GUI既定化保留。
