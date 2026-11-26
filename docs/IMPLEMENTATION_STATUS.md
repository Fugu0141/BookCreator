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
