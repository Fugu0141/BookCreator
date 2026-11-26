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
