# BookCreator — 部品・テーマ詳細設計

状態: ドラフト。配置・サイズ・断片の意味論の正本は [Engine LAYOUT_MODEL](https://github.com/Fugu0141/BookCreator_LayoutEngine/blob/main/docs/LAYOUT_MODEL.md)。本書は保存、部品登録、テーマの継承、BCMとの変換、GUI責務を規定する。

## 1. 3つの情報層

- 共通定義: themes配下のtheme.yaml/部品定義。部品IDは表示名と独立。
- 個別インスタンス: Markdownの属性/Canvas宣言。原文の意味内容はBCM。
- 派生: 解決済み部品、計測、PagePlan。保存しない。

部品は通常フロー/インライン/反復装飾/固定ページ等の用途を持つ。同じツリー形式を利用するが適用可能な属性・スロットを種別ごとに制限する。インラインや表セルに独立改ページ/絶対ページ座標を許さない。

## 2. テーマ保存の初期案

    schemaVersion: 1
    id: default
    name: Default
    tokens:
      color: {accent: "#315b86", text: "#222222"}
      font: {body: "Noto Sans CJK JP"}
    components:
      heading.1: components/heading-1.yaml
      paragraph: components/paragraph.yaml
      codeBlock: components/code.yaml
    bindings:
      heading.1: heading.1
      paragraph: paragraph
      codeBlock: codeBlock
    repeats: []

各部品ファイルはid/schemaVersion/usage/slots/pagination/root/variantsを持つ。例:

    schemaVersion: 1
    id: heading.1
    usage: block
    slots:
      content: {type: inline, required: true}
      number: {type: text, required: false}
    pagination:
      startPosition: spread-start-top
      splitPolicy: avoid
      margin: {top: 8mm, bottom: 5mm}
      keepWithNext: true
    root:
      id: root
      type: row
      width: fill
      gap: 3mm
      children:
        - {id: bar, type: rect, width: 2mm, height: fill, fill: "$color.accent", decorative: true}
        - {id: title, type: text-slot, slot: content, width: fill, fontSize: 24pt, wrap: true}

部品構造はEngineの型へコンパイルする。slotはtext/inline/blocks/asset/number等の型を持つ。content/asset/caption/numberは原稿や採番から渡す予約スロット。部品自身に原稿をコピーしない。独自部品の追加属性はBCMのDirectiveRegistryへ型として渡す。必須/任意・数・読み順を検証。GUIで部品の使用先と影響を表示。色・フォント等のtoken参照は限定された構文で解決、欠落・循環はエラー。

## 3. 解決規則

親テーマ（任意）→当該テーマの部品既定→明示variant→Markdown個別上書き。欠落属性は継承、属性の削除は上位値への復帰。nullを万能の削除にしない。既定値の数値や列挙はスキーマで管理。親循環、部品ID衝突、未知ノード、型違反は診断。コンテナ構造の差分継承は複雑なため初期はroot単位で置換し、variantでは属性上書きを主とする案。ノードIDは定義内一意、移動で保持、複製で新規。読み順とz順は別。装飾は意味的順序に含めない。

## 4. BCMとの変換契約

| BCM属性 | エンジン入力/部品属性 |
| --- | --- |
| start-position | startPosition |
| split-policy | splitPolicy |
| keep-with-next/previous | keepWithNext/Previous |
| margin-* | margin各辺（左右系統混在不可） |
| margin-at-page-top/bottom | marginAtPageTop/Bottom |
| min-following-space | minFollowingSpace |
| align | horizontalAlign（適用対象限定） |
| width/height/font-size | 型付きサイズ/長さ |
| variant | テーマ解決時に消費 |
| figure crop-* / rotation / fit | 非破壊画像表示属性 |
| canvas mode | flow/page/spreadの配置種別 |

layoutの単一子なら子に有効な属性を適用、複数子ならグループ境界に適用。明示値と継承値の出所を保持し、Q12のcontinuous抑制は組版時のみ。テーマの型とBCMの属性の新規追加は3リポジトリの契約確認を行う。

## 5. 反復部品・自由配置

repeatsはrule ID、component ID、セクション/面/ページ種別条件、領域、9点アンカー、オフセット、reserve/overlay、z順、明示サイズを持つ。条件は宣言的AND/OR。空白・表紙は既定除外、番号区間優先。通常の部品startPositionと別。固定予約領域は配置前に確定。章末など結果依存の条件はEngineの収束処理へ。

Canvas宣言はschemaVersion/rootを持ち、rootはEngineノード定義に変換できる。modeは原稿側、表紙の役割はmanifest側。単純なインラインYAMLと外部ファイルを同一スキーマで扱う。保存時に二重化しない。共有Canvas編集では全参照変更または独立コピーを明示選択。相対パス再計算とIDの一意性を検査。

## 6. エディタ

Appearance/Structure/Pagination、レイヤーツリー、Component/Page/Spread/Stressプレビュー。実原稿は文脈として読取専用、選択した定義を作業案として編集。サンプルと実誌面、部分組版と全体組版を区別。ドラッグ中は一時状態、確定時に一操作。フローは順序・gap・幅・整列を変える、Canvasは座標・アンカーを変える。変換で情報を失う場合は差分と確認。グループ化、整列、複製、ロック、スナップ、Undo/Redo。ガイドは出力しない。適用時はテーマのみ変更し、影響範囲を再組版して確定解除。

CS-01 長いH1と縦線、CS-02 親テーマとvariant、CS-03 局所上書き、CS-04 名前付きスロット、CS-05 Canvas変換、CS-06 反復装飾、CS-07 作業案取消、CS-08 不正型・循環をfixture化する。配置の正しさはEngineの試験も必要。

## Typography extension

See [TYPOGRAPHY_AND_FONTS.md](TYPOGRAPHY_AND_FONTS.md) for proposed font registration, role selection, local import and layout fingerprint contracts. Existing format stays unchanged until schema and fixtures are implemented.

## Implemented Component Lab subset

Experimental `previewComponents: {schemaVersion: 1, heading: ...}` lives in theme.yaml and is separate from the proposed full external component registry. One semantic content slot plus up to seven decorative rectangles; flat row or column, physical micrometre lengths, hex colors, gap/padding, font size and line-height multiplier. Heading role supplies font family/weight, including registered project fonts. The same compiler and Engine layoutTree/strict pagination serve sample and actual headings. Sample text is transient; Apply writes only the recognized subtree with hash conflict guard, Discard writes nothing. Requires a successful sample measurement before Apply; other actual headings can still overflow and report errors. Unknown component format refuses editing. All heading levels share the single design for now; nested trees, literal static text, Canvas, split components, full role/binding inheritance and Undo/Redo are future work. Publication remains disabled.

## Per-level component registry and fixed labels (experimental)

`previewComponents` schemaVersion 2 stores `heading` (shared design or null) and `levels` (keys '1' through '6', optional overrides). Existing schemaVersion 1 is read and migrated on edit, without changing manuscripts. Missing levels inherit the shared design, otherwise normal plain heading. Reset removes the selected override. Each design has one semantic content slot; optional fixed labels have their own text, width, color, size, line height and optional stable font ID/weight. The content slot may also override font ID/weight. Missing font values inherit the book heading role. Main validates actual catalog IDs and exact imported face weight. Fixed text belongs to the design, never to source mapping or chapter numbering. The same Engine measurement and layout is used in sample and actual book. No full arbitrary component registry, nested containers, dynamic number slots, free Canvas, fragmentable body, or publication output yet.

## Recursive flow groups (experimental)

Heading designs now support `type: group` with stable ID, direction, fixed or fill width, gap, padding, background and ordered children. Existing flat designs remain valid. Exactly one content slot across the whole tree, global unique IDs, max depth 4, 32 nodes and 8 siblings. Rows accept at most one flexible child; columns resolve fill against inner width. The GUI wraps a selected node or it and the next sibling, unwraps, adds within groups, reorders siblings, edits group style. A group's width is derived from selection when wrapping; ungrouping or direction changes can require manual width adjustment, measured validation gates Apply. Recursive font resolution uses the existing stable project IDs. Same Engine path in samples and actual book; no Canvas, drag-and-drop, multi-selection, arbitrary component binding or split groups.

## Bounded component Canvas (experimental)

A nested group can use direction `canvas`, explicit height, zero gap and inner padding. Direct children require nonnegative x/y and positive fixed width (including the content slot). Coordinates refer to the top-left of the inner region; tree order is back-to-front paint order. Overlap is intentional; overflow is refused by measured layout. GUI converts a flow group to Canvas with editable initial positions; conversion does not preserve exact geometry. Returning to flow explicitly confirms removal of coordinates and fixed height. Group/ungroup inside Canvas is disabled pending geometry-preserving transforms. A successful sample measurement gates Apply. Existing flow definitions stay valid. No whole-page Canvas, anchors, rotations, direct dragging, standalone image assets, or publication-ready output.

## Direct Canvas manipulation and draft history

The measured preview is the hit-test surface. Pointer capture moves direct Canvas children temporarily, 0.1 mm snapping and clamping to measured inner bounds; release commits a single immutable draft revision and triggers actual remeasurement. Cancellation restores positions and does not commit. Tree selection is reflected by a selection outline. Draft history retains 64 prior snapshots, supports undo/redo and clears redo on a divergent edit; no-op edits are ignored. Undo/redo invalidates the measured preview and requires remeasurement before Apply. Ctrl/Cmd+Z, Shift+Z and Ctrl/Cmd+Y outside native form controls, plus buttons. Native input text editing retains its own undo. History is session-local to the open Component Lab; applying, resetting or discarding exits the session. No document-wide history, free resizing, anchors, persistent history, multi-select or publication output.

## Canvas keyboard editing (experimental)

Measured direct Canvas children are focusable via Tab. Arrow keys move the focused element by 0.1 mm (Shift+Arrow by 1 mm), preserving the other axis and clamping to measured inner bounds. Each accepted key operation is one draft history entry and remeasures; focus is restored if it has not moved elsewhere. Inputs retain native editing. Escape cancels a captured pointer gesture without committing, and pointer release uses its final coordinates. Preview measurement and successful interaction setup gate Apply. Key repeats during asynchronous remeasurement may be skipped; no resize handles, multi-selection, or full-page Canvas yet. PR #13 passed the Core checks, Cross-library smoke test and Desktop workspace PoC workflows before merge; the new keyboard tests are pending CI.

## Canvas resize handles (experimental)

A measured selected direct Canvas child exposes an editor-only resize handle. All direct children support width; rectangles and fixed-height Canvas groups also support height using the bottom-right handle. Text and flow groups preserve automatic height; resizing never scales fonts or line heights. The top-left position is unchanged, dimensions snap to 0.1 mm, and outer bounds and positive dimensions are enforced. During drag a dashed outline displays provisional size without changing actual measured text or saved data. Release commits one draft history entry and triggers full measurement; invalid nested geometry or text overflow blocks Apply until corrected or undone. Escape cancels without a history entry. Handles and outlines are not persisted or included in book preview. Numeric width/height fields remain the keyboard-accessible alternative. No rotation, proportional resize, left/top handles, multi-selection or whole-page Canvas. Unit geometry and actual Electron width/undo/redo/persistence tests added; CI pending.

## Canvas multi-selection and alignment (experimental)

Select a direct Canvas child in the tree, then add siblings using the alignment checkboxes. Selection never crosses Canvas boundaries. Measured selected boxes receive outlines; single-object resize handles are hidden during multi-selection. Left/center/right/top/middle/bottom align to the selection's outer bounding box, with integer micrometre rounding for half-unit centers. The other coordinate, width, measured height, source slot and paint order remain unchanged. Measurements come from the actual Engine preview, including text/flow height; invalid or missing measured geometry and out-of-range coordinates are refused. Each alignment is one immutable history edit followed by remeasurement; Apply remains gated. Repeated alignment retains selection; single-object selection, ordinary edits and undo/redo clear extra selections. Direct pointer moves remain single-object (selecting a preview element clears extra selections). No drag-box selection, collective move/resize, distribution, alignment guides, or cross-Canvas alignment yet. PR #15 passed all three CI workflows before merge; new alignment unit and real Electron workflow tests are pending.

## Equal-gap distribution and smart guides (experimental)

Three or more selected direct siblings can be distributed horizontally or vertically with equal physical gaps. Sort by leading edge, then stable ID; preserve the first leading and last trailing edges and all dimensions, the other axis and paint order. Integer micrometre rounding distributes residual error; insufficient space for non-overlapping placement is rejected without mutation. One history entry and actual remeasurement per distribution.

Direct single-child drag retains the 0.1 mm grid and optionally snaps the closest edge or center on each axis to a measured sibling or the Canvas inner edges/center within 0.8 mm. Smart snapping overrides grid rounding for exact alignment (half-micrometre ties rounded). Candidates are constrained to Canvas bounds and coordinate schema. Purple dashed guides show only during the gesture and are removed on release, cancellation and preview invalidation. Alt temporarily disables smart snapping; the session checkbox disables it entirely without changing saved theme data. Resize and keyboard nudges retain their previous behavior. No smart resize snapping, equal-gap drag guides, cross-Canvas snapping or collective drag yet. PR #16 passed all three CI workflows and was merged. New unit and Electron tests are pending CI.

## Component duplication and session locks (experimental)

Duplicate a selected decorative rectangle, fixed label or group that contains no semantic content slot. Deep-copy the entire subtree with new unique IDs; preserve styles, font references and dimensions. Insert immediately after the original in sibling/paint order; Canvas copies start at the same coordinates (intentional overlap), and flow copies use normal placement. Refuse duplication exceeding eight siblings or 32 total nodes, and fill-width duplicates in rows. The draft is remeasured before Apply; a copy may require repositioning. Duplicate is one Undo/Redo operation.

Lock a node for the current Component Lab session only. A locked group protects its entire subtree, including descendants. Guard all draft-history transitions against deletion, reparenting, direct property/subtree changes and relative sibling order changes of locked nodes. Locked elements remain selectable but cannot be directly moved/resized/nudged; locked selections cannot participate in alignment/distribution. Unlock before Undo/Redo if a history transition would change a protected node. Locks do not prevent indirect layout changes caused by other nodes or shared styles, and are not security boundaries. Lock metadata is not saved or rendered on paper; Apply/Discard ends the session. Persistent locks, multi-object duplication and clipboard support are future work. PR #17's snap tie test expectation was corrected; all three CI workflows then passed and it was merged. New duplication/lock tests await CI.

## Dynamic heading labels (experimental)

A `type: dynamic` node stores a named field, literal prefix/suffix, mandatory non-empty fallback, normal label geometry/style and optional stable font ID. Supported fields: chapter-number, chapter-title, heading-number, heading-title and heading-level. Prefix/suffix/fallback are at most 64 UTF-16 units each; final resolved text must fit the existing 256-unit label constraint. No expression evaluation, interpolation, arbitrary keys or external URLs. Resolution occurs in BookCreator before Engine measurement; the Engine receives ordinary literal label nodes. Exactly one semantic source slot remains; derived labels do not add source ranges or modify manuscript text. Unavailable fields use fallback; oversized/invalid resolved values produce a located diagnostic, not truncation.

Provisional numbering follows ordered manuscript sections. Each H1 starts the next global chapter; headings preceding the first H1 in a file (or files containing headings but no H1) get an implicit chapter and no chapter title. H2–H6 counters reset descendants when an ancestor advances; skipped levels use zero placeholders (e.g. 1.0.1). Files without headings consume no chapter. All supplied manuscripts participate, without role filtering, and existing number-like text is not parsed or stripped. This is preview-only heading numbering, not the final BCM numbering policy for figures/tables or publication. Component Lab uses an explicit sample chapter 3 and selected heading level. Desktop selected-manuscript preview with any dynamic definition first prepares the entire ordered snapshot (including current unsaved text), then selects the requested section; unsupported content elsewhere may therefore block it. No page-number, figure/table-number, cross-reference, role-specific numbering, or pagination-dependent slots yet. PR #21 passed all three CI checks and merged; new core, integration and Electron tests await CI.

## Named component library (experimental)

The project theme may contain a separate `previewComponentLibrary: {schemaVersion: 1, entries: [...]}` registry. Each entry has a generated stable component UUID, display name, explicit usage (currently heading only), and a validated independent heading design snapshot. Names are 1–80 UTF-16 units, trimmed and unique under NFC plus lowercase comparison. Up to 32 entries, subject to existing theme byte and YAML complexity limits. Missing registry is empty; invalid registry disables library operations independently of the applied heading definitions. Add/replace validates project font and image references; loading an entry requires actual measurement before Apply. Missing referenced resources can be diagnosed when measuring; deletion/rename is still possible. All changes use the theme revision guard and atomic replacement. Registration and catalog edits persist immediately, separately from the Lab draft; closing the Lab does not undo catalog edits.

Component Lab can register the measured draft, select and copy a registered component into the draft (one Undo/Redo entry; unavailable while nodes are locked), rename, replace after confirmation, and delete after confirmation. The target heading level is still applied explicitly through the existing save action. Reuse is snapshot copying, not live linking: changing or deleting a library entry does not affect existing applied designs. Project-relative resource IDs are retained, not embedded resource bytes or absolute paths. No cross-project import/export, linked bindings, non-heading usage, external component files, inheritance, or publication output yet. PR #22 passed all three CI checks and merged. New schema, persistence and Electron reuse tests await CI.

## Shared heading component references (experimental)

`previewComponents` schemaVersion 3 adds a `bindings` map keyed by default or heading levels '1'–'6', with library component UUID values. A target cannot simultaneously have a local design and a shared binding. Versions 1/2 remain readable; writes use version 2 when there are no shared bindings. Library schema remains 1. BookCreator resolves the shared references into independent concrete heading designs before existing layout compilation; no Engine changes or duplicated snapshots in persisted bindings. Level-specific designs/bindings override the default. Missing references, conflicting local definitions, invalid referenced resources and unsupported bindings fail closed. No recursive component references.

Component Lab shows the current direct or inherited binding, lists affected heading targets (including levels inheriting a bound default), and lets a user explicitly assign a measured draft equal to a library entry. Normal Apply on a shared or inherited design saves an independent local copy; reset removes the target override, returning to default inheritance. Shared library replacement updates all bound targets and invalidates paper preview; confirmation lists affected targets. Rename preserves the UUID; referenced entries cannot be deleted until direct bindings are removed. The workspace validates the complete resolved set and uses the existing theme revision guard. Actual manuscript overflow is still detected at preview time, not guaranteed by sample measurement. No cross-project references, generalized non-heading bindings, nested component references or publication output. PR #23 passed all three CI checks and merged. New schema, persistence and Electron tests await CI.

## Fragmentable paragraph component (experimental)

Optional independent theme field `previewParagraph` contains a validated schemaVersion 1 design with a zero-gap column and exactly one semantic content slot. It uses the existing stable font IDs, inherits the body role by default, and permits font size, line height, foreground/background and uniform physical padding. Applies to supported plain paragraphs only, never headings, and preserves their allow split policy. The Engine measures at inner width and reserves top/bottom padding once for every fragment, including continuations. Source offsets remain exact; no decoration becomes source text. A line plus padding must fit an empty page. Paragraph Lab has its own draft, sample, measurement gate, apply/reset and revision-guarded save; unsupported definitions fail closed without corrupting heading settings. No paragraph library entry or binding yet, no rich Markdown, nested content, multi-slot layout, widow/orphan constraints, continuation-specific decorations or publication output. Engine PR #12 and BookCreator PR #24 passed all CI and merged. BookCreator's new core, integration and Electron tests await CI.

## Typed component library and shared paragraph binding (experimental)

Library schemaVersion 2 permits both heading and paragraph usage, with the existing shared limit of 32 entries and unique names/IDs. Version 1 remains readable for heading-only catalogs; writes use v1 when no paragraph entries remain. Usage cannot change through replacement. Paragraph entries must pass the single-slot, zero-gap frame validator; heading bindings reject paragraph entries and paragraph bindings reject heading entries. Paragraph Lab filters entries by usage and offers measured registration, rename, replacement, deletion, independent draft copy and explicit shared assignment. The heading editor filters heading entries. The optional previewParagraph field is either a local v1 design or a v2 reference {schemaVersion: 2, componentId: UUID}. Reference resolution supplies the existing fragmentable design to the same adapter and Engine. Replacement of a bound paragraph entry affects all supported body paragraphs and invalidates preview; independent copies are unaffected. Bound entries cannot be deleted; normal Apply detaches into a local copy and reset restores ordinary body paragraphs. Theme revision checks, font checks and atomic writes apply. Unresolved bindings block deletion conservatively. No new layout rules, arbitrary usage conversion, multiple paragraph variants, example/note directives, or cross-project import. PR #25 passed all CI and merged; new tests await CI.

## Semantic study blocks (experimental)

Use existing BCM container syntax, not a new parser: `:::callout{kind="note|tip|warning|important"}` or `:::component{name="example|exercise|explanation"}`, followed by one supported plain source line and a matching closing fence. The vertical bars above denote choices, not literal values. Optional stable BCM ID and plain title (nonempty, up to 128 UTF-16 units) are supported. The seven names are built-in BookCreator preview presets, not arbitrary library IDs. All other attributes, unknown kinds, nested containers, multiple source lines, unsupported inline Markdown and empty content fail closed with source-located diagnostics. The BCM scanner/ID index is reused without changing its language or claiming full validation.

Each preset compiles to an ordinary strict column component with a derived label, background, padding and exactly one semantic body slot. Text uses the body font role; derived label and body are measured through the same Engine. The block origin includes the complete directive and optional persistent ID, but the clickable source slice maps to the exact child body, even when its text repeats in the title. Labels are derived, not copied into body source. Since these blocks are currently indivisible, a block taller than a page fails preview. Normal paragraph frames and headings keep their existing split rules. No automatic problem numbering, answer slots, rich inline formatting, theme customization, arbitrary library component references or split study blocks yet.

Desktop source editor can append a selected built-in template using BCM applyPatches at EOF; it checks the resulting scanner recognizes the new closed root block and has no scanner diagnostics. Existing source is preserved and the placeholder body is selected. The insertion is unsaved until normal source save, not a full structured editor. PR #26 passed all three CI checks and merged; the study block tests await CI.

## Editable study components and typed shared library

Component Lab supports study usage in addition to heading usage. The seven built-in study presets are now editable single-slot strict component trees, with the existing grouping, Canvas, image, typography, history and geometry features. Study dynamic labels resolve the localized kind name, manuscript title, or combined kind/title. The sample title is separate from the manuscript sample and not persisted. Study-specific fields are rejected in heading definitions, and heading-specific fields in study definitions. The body font role is inherited. A user can intentionally omit the derived label; the manuscript body remains the one semantic source slot.

Optional theme previewStudy schemaVersion 1 stores kinds keyed by the seven semantic kinds, each an independent validated design or {componentId: UUID} reference. Library schemaVersion 3 adds study usage; existing v1/v2 remain readable, and writes use the smallest version supporting the stored usages. The 32-entry limit is shared across all usages. Study entries can be shared across different semantic kinds, with labels resolved per occurrence; replacing a shared entry updates all bound kinds, while local copies are unchanged. Resource checks, theme revision guards and reference deletion protections apply. The GUI offers measured registration/assignment, copy, rename, replace, delete, independent Apply, and reset to built-in design. Both whole-book and selected manuscript preview consume the resolved definitions. The original source text and ID mapping remain unchanged. No automatic problem numbering, multiple slots, arbitrary user-defined semantic kinds, multiple paragraphs or study fragmentation yet. PR #27 initially failed the browser smoke because study-blocks.js was missing from the restricted demo server allowlist; fixed and all three CI passed before merge. New study editing tests await CI.

## User-defined study components referenced directly from manuscripts

A study-usage library entry can now be used without assigning it to one of the seven built-in kinds. The existing BCM syntax is `:::component{name="component-<UUID>" title="Optional title" #instance-id}`, followed by one supported plain source line and its closing fence. The UUID is the stored library ID, not the display name; the instance ID remains optional and distinct. Only study-usage entries are accepted. Missing/incorrect references produce a located diagnostic; no fallback to another component. The name and optional title resolve through study-kind/study-title/study-label. Rename and replacement update direct occurrences without changing manuscript source. Existing built-in names and theme assignments remain unchanged; no storage schema bump. Both browser adapters accept a validated catalog; the desktop supplies the active theme catalog and checks referenced resource errors. The fixture-only measured adapter may carry the unresolved semantic ID, not a publication-ready layout.

The custom library editor reuses Component Lab, starts with an editable note preset, previews the proposed display name, registers or replaces a measured draft without assigning it to a built-in kind, and can load/rename existing study entries. The source editor lists study library entries by display name and appends the UUID-based template through the existing scanner-checked patch flow. The entire existing catalog remains subject to the 32-entry combined limit. A saved study entry cannot be deleted while a listed manuscript contains its UUID (conservative literal substring check; even code/comments can block deletion). It checks all known manuscript files up to 128 files/16 MiB, rechecks before atomic theme replacement, and refuses unreadable/oversize scans. The renderer additionally checks its current unsaved source. Files outside the project manifest and concurrent external writes are not protected; unresolved references fail at preview. Direct references are shared by default, not embedded copies. Single plain-line strict layout, no custom attribute schemas, multiple slots, multi-paragraph or multi-page custom components, numbering or cross-project export yet. PR #28 passed all CI and merged; new integration, workspace and Electron tests await CI.

## Study occurrence numbering (experimental)

Study designs now support opt-in dynamic fields study-number (chapter.index, e.g. 3.2), study-index (chapter-local index, e.g. 2), and study-sequence (whole-book sequence, e.g. 8). Existing designs and presets retain their visible labels until a number field is added. Prefix/suffix and independent typography use the existing dynamic label controls. Counts are independent by built-in semantic kind or stable custom library UUID, regardless of the shared visual design or whether the number is displayed. Rename does not reset a custom counter. Counts are recomputed in ordered source traversal before measurement, not persisted in manuscript or theme; page breaks and layout changes do not affect counts.

A H1 begins a new chapter. At each manuscript boundary, the first heading or study occurrence before any H1 establishes an implicit chapter; a following H1 starts the next chapter. Chapter-local counters reset, global counters continue; files with neither headings nor study occurrences consume no chapter. This extends the provisional heading chapter rule so a pre-H1 study block can establish the chapter context even if it does not display a number. Chapter numbering and study numbering use the same traversal. Selected-manuscript preview with any numbered study design loads the ordered book snapshot (including the current unsaved text), then filters to the requested section. This can cause errors in another manuscript to block partial preview. Component Lab samples chapter 3, index 2 and sequence 8. No new schema version or BCM syntax is required. No configurable shared counter groups, manual start/skip/override, figure/table/answer numbering or cross-reference links yet. PR #29 passed all CI and merged. New unit, BCM integration and Electron tests await CI.

## Question and explanation links (experimental)

A question uses its existing persistent BCM instance ID, for example `:::component{name="exercise" #q-01 title="基本計算"}`. An explanation links to it with `:::component{name="explanation" answer-to="q-01"}`. Both containers retain the current one-plain-line body and closing fence. The optional typed `answer-to` attribute is BookCreator-specific component schema data, not new BCM syntax; it is also accepted on direct custom study components. Targets must be unlinked example, exercise, or custom study instances with unique IDs. Missing targets, unsupported target kinds, chains/self-links and duplicate IDs are rejected before preview. Multiple explanations may refer to one question; links can point forward or across manuscript files. The relationship is not inferred from displayed numbers or library IDs.

Before measurement a first ordered pass indexes each target's occurrence number, localized kind/display name and optional title. The existing ordered layout adapter then resolves the answer context. Linked explanations' default study-label includes the target's chapter.index (e.g. 解説 2.4); unlinked labels are unchanged. Custom designs may use answer-number, answer-index, answer-sequence, answer-title and answer-kind with existing prefix/suffix/fallback/typography controls. Own study-number fields remain separate and continue to count the occurrence's own kind (including linked custom occurrences). Component Lab offers an optional linked-question sample. Source body slices and persistent IDs remain intact. Selected-manuscript preview conservatively uses the full ordered snapshot if the source contains answer-to or the theme has number/answer fields. The source editor accepts optional instance IDs, provides UUID generation, and allows entering an answer target ID for explanation/custom study templates; validates local duplicate IDs and syntax before append. Cross-file references are validated when previewing the book, not when inserting or saving raw source. No auto-generated answer content, automatic question/answer relocation, ID rename cascade, click-to-jump links, custom target role declarations, multiple slots or publication output yet. PR #30 passed all three CI and merged; new unit, real BCM and Electron tests await CI.

## User-defined named source slots (experimental)

Study component designs may add up to eight named source slots alongside the required existing primary content slot. Names are unique lowercase ASCII identifiers (1–32 characters, first character a letter, subsequent letters/digits/hyphens), with content reserved for the primary slot. A slot has its own physical width, font ID/weight, size, line height, color, and coordinates in a Canvas group. The same tree bounds, layout measurement, history and locking rules apply; semantic slots and groups containing them cannot be duplicated. Component Lab allows adding, renaming, deleting and moving named slots and independently editing each sample before measured registration/Apply. Custom components and built-in example/exercise/explanation may use named slots; headings, paragraph frames and callout variants may not. Existing theme and library schema versions are retained; old readers reject unknown node types rather than silently omit them.

A multi-slot instance uses the existing BCM component container with explicit nested slot containers, each containing one nonempty supported plain line. The primary slot must be named content. Named slot declarations and source names must match exactly; no unknown, duplicate, missing or mixed implicit/explicit slot bodies. Source order may differ from visual placement order. The adapter retains exact per-slot UTF-16 offsets, including CRLF manuscripts, and preserves the existing instance identity, numbering and answer-to link. Source insertion uses the resolved design to generate the appropriate nested template, selecting the primary placeholder; existing single-slot templates stay unchanged. The pinned merged Layout Engine supports measured named slots, per-slot typography and distinct source ranges. Click or keyboard-activate a named slot to select only its corresponding raw text; the fragment itself retains primary source selection. No change to BCM scanner syntax. Changing the required slot set of a shared definition may require manual updates to existing instances; replacement warns and preview fails on mismatch, not automatic source migration. All slots are currently required, one plain line each, strict/indivisible component. Rich text, optional slots, multi-paragraph and multi-page study components are later work. Engine PR #13 passed both CI workflows and merged. New BookCreator unit, BCM integration and Electron tests await CI.

## Optional named slots and conditional groups (experimental)

A named study slot may carry optional: true (absent or false remains required). The primary content is always required. Omit the entire named slot container to omit its content; an explicitly empty slot is still invalid. When all additional slots are optional, a single plain body line or an explicit content-only nested container is valid. Unknown names, duplicates and missing required slots still fail closed. No generated placeholder or source slice is added for an omitted slot.

An optional slot can be wrapped in a group with showWhenSlot set to its name. This condition is permitted only on a study group containing exactly that one optional semantic slot and no primary or other semantic slot, plus any decorations. An occurrence with the slot omitted prunes that group including its labels, images and background; an ordinary group is pruned only if it becomes empty. The compiler strips optional and showWhenSlot metadata before the unchanged Engine call and recomputes actual row/column geometry per occurrence. Fixed Canvas dimensions and coordinates of surviving nodes do not automatically reflow. Other decorations outside the conditional group are retained. A group condition becomes invalid if the referenced slot is renamed or made required until the condition is removed/reconfigured. Stored definitions and manuscript offsets are never mutated by pruning.

Component Lab offers a per-slot optional checkbox, a conditional-group checkbox on eligible groups, and sample omission toggles to measure both variants. Source insertion defaults to required placeholders only; an explicit checkbox includes optional placeholders. Existing definitions and source syntax remain compatible; no schema version bump or Engine change. As with other measured drafts, a sample does not guarantee all variants or actual text fit. Changing required names or slot sets can require source edits; replacement warns, no automatic migration. Multi-paragraph, rich inline text, optional primary, multiple conditional sources, arbitrary expressions and multi-page study components are still unsupported. PR #32 passed all three CI checks and merged. New core, actual BCM and Electron tests await CI.

## Multiline plain manuscript text and paragraph spacing (experimental)

Ordinary body text runs may now contain adjacent raw lines and intervening empty lines, ending at headings/directives/other block kinds. Leading/trailing structural blank lines are not rendered; internal blank lines remain within the same fragmentable body frame. Study primary bodies and each explicit named slot may contain multiple supported plain lines/paragraphs with internal blank lines. The source slice is taken directly from the original manuscript, not reconstructed with LF: LF/CRLF code units and exact offsets survive. Standalone internal CR, unsupported inline markup, nested unsupported blocks, whitespace-only bodies, more than 255 separators or 10,000 UTF-16 units per body are rejected. The last structural newline is excluded as before. Heading text remains single-line. Existing single-line templates and component definitions remain compatible.

Optional paragraphGap (integer micrometres 0–30000) on paragraph and study root styles and named study slot definitions adds physical spacing to each internal empty logical line, on top of the base line height. Omitted means zero additional gap. The compiler strips it from geometry nodes and sends it only in multiline text requests. Paragraph Lab and Component Lab expose the setting; Component Lab has a multiline sample mode for primary and named slots, while sample content is never saved in the design. Ordinary text can split across pages; study trees remain strict/indivisible. The Engine keeps CRLF intact and preserves separators in logical source slices. Source selection uses exact contiguous ranges. No soft-wrap Markdown semantics, rich inline formatting, whitespace-only paragraph separators, widow/orphan rules or multi-page study component fragmentation yet. Engine PR #14 passed both CI workflows and merged; pinned in both integration and desktop CI. New BookCreator tests await CI.

## Restricted inline emphasis and raw source maps (experimental)

The browser adapter now recognizes a deliberately bounded subset of existing CommonMark emphasis syntax: paired ** for strong (weight 700) and paired * for emphasis (italic), on a single logical line with nonempty supported text and valid delimiter flanking. Works within plain ATX headings, ordinary paragraph runs, study primary content and named slots; original LF/CRLF preserved. It does not implement full CommonMark: no nesting, triple delimiters, underscores, escapes, inline code, links, HTML, math, hard-break spaces, or arbitrary extension syntax. Unsupported or ambiguous syntax is rejected, not stripped or silently rendered. The existing BCM block scanner remains unchanged; the restricted preview parser is host-side until a general lossless inline parser is available. Raw text remains in semantic fixture items; display text and disjoint logical style runs are derived at browser preparation. Heading dynamic title context uses display text. No markup changes are written to source.

For transformed text, the host retains a source map of logical ranges to exact raw content ranges and delimiter-inclusive outer ranges. The Engine receives logical text and inlineStyles, with sourceTextStart omitted for transformed text, so it never falsely asserts that logical text is a contiguous raw slice. The host maps each measured fragment to a raw envelope (including opening/closing delimiters where the fragment reaches the respective run boundary), including independently mapped named slots. Adjacent fragment envelopes cover the original text without losing delimiters. Click/keyboard selection in desktop and developer preview uses the host map; literal text still uses the previous contiguous mapping. A selected fragment may contain an unmatched delimiter when a styled run is split across pages: selection is navigation, not a standalone valid Markdown document. Grapheme splits at marker boundaries are rejected. Registered font availability and browser shaping restrictions still apply. Engine #15 passed both CI workflows and merged, pinned for integration and desktop. New unit, actual BCM and Electron tests await CI. GUI selection formatting, underline/color/font markup, full inline AST, nesting and math remain future work.

## Source selection formatting tools (experimental)

The desktop raw manuscript editor now has bold/italic toolbar buttons and Ctrl/Cmd+B/I shortcuts. Select a nonempty supported plain range on one raw line or top-level ATX heading, or a complete existing supported emphasis run (its inner text or entire raw envelope). Applying the same style removes it; applying the other style replaces it rather than nesting. The edit planner uses the actual BCM scanner and checks grapheme boundaries, supported study/slot containers, local inline grammar and the exact expected logical text and style ranges after the proposed change. It compares block structure and shifted source boundaries after rescanning. Headers, IDs, attributes, code/math, unsupported/ambiguous inline syntax, partial styled runs and multi-line selections are rejected. Existing scanner diagnostics block formatting. This deliberately conservative subset is not a general CommonMark context parser. Only an exact BCM patch is applied to the current draft; no whole-document serialization or automatic save. Selection is restored to the inner text after the controlled edit if generation and value still match, old preview is invalidated, IME composition is excluded. This is source editing, not WYSIWYG, and it does not introduce a separate manuscript undo stack. Full nested formatting, additional style controls, structural editing and unified undo/redo are future work. PR #35 had a missing public export, fixed and all three CI workflows passed before merge. New planner/GUI regression tests await CI.

## Combined inline style directive (experimental)

The host preview recognizes the provisional BCM inline directive `:style{text="重要な用語" weight="700" italic="true" underline="true" color="#123456" font="noto-sans-jp"}`. It follows the existing BCM colon/name/attribute convention, but is a BookCreator preview extension pending general BCM inline AST/spec integration. The text attribute comes first, contains a single nonempty supported plain line with no leading/trailing whitespace or escapes; remaining attributes are optional unique typed values, at least one required. Weight is integer 100–900, italic/underline accept true (omission inherits), color is six-digit hex, font is a stable existing built-in ID (noto-sans-jp/system-serif/system-sans/system-monospace) or font- plus 64 lowercase hexadecimal hash characters. Arbitrary CSS, file paths, URLs, HTML, unknown or duplicate attributes, nested markup and escaped text are rejected. In accordance with the BCM inline directive boundary rule, a directive cannot immediately follow an ASCII letter, digit, underscore or colon. This limits partial English-word selection for extended styles; do not silently insert a separator or rewrite the surrounding text. Existing simple ** and * syntax and legacy switching behavior remain supported.

All properties compile into the same disjoint typed Engine inline runs, retaining exact logical-to-raw UTF-16 source envelopes for navigation. A whole span or its inner text can be selected in the raw editor; underline/combined emphasis toggles, color application/reset and font/weight application/reset modify that exact span with a BCM patch and validate logical content, expected run properties and rescanned structure. A bold/italic toggle inside a style directive preserves the other attributes; the dedicated combined control toggles weight 700 plus italic. Legacy simple emphasis switches rather than nests when selecting the other basic emphasis button. Applying a font explicitly sets its chosen weight (which may replace bold); resetting the font clears the weight override as well. Registered static project faces must be loaded at the selected effective weight before desktop preview. Other inherited properties are unchanged; missing resource failures are explicit. No separate style metadata file, theme mutation or arbitrary font family strings. Ctrl/Cmd+U is the underline shortcut. Source editor is still raw BCM rather than WYSIWYG; nested/multiline partial style operations, mixed selections, font-size and baseline shifts remain unsupported. PR #36 passed all three CI and merged. New parser, real BCM planner/adapter and Electron regression tests await CI.

## Inline size and script editing (experimental)

The provisional :style directive accepts font-size="5.25mm" (1–30 mm, at most three fractional digits, stored as integer micrometres) and baseline="super" or baseline="sub". Omission inherits base size and normal baseline. As in Engine #16, absent size in a shifted run defaults to 70% of the surrounding base size; an explicit size overrides the default. The desktop source toolbar exposes physical size apply/reset, superscript/subscript toggles and baseline reset. Selection, semantic verification and raw source envelopes use the existing exact BCM patch path. To support adjacent ASCII notation without changing the existing BCM colon boundary rule, a deliberately restricted provisional shorthand ^digits^ and ~digits~ represents superscript/subscript, respectively (1–32 ASCII digits). The GUI generates it for a digit-only run with only baseline styling, e.g. x^2^ and H~2~O. Double tilde (GFM strikethrough), nesting, escaping, arbitrary non-digit shorthand and ambiguous boundaries are rejected. Compound script styles use :style where the existing colon boundary permits; a combined style in the middle of an ASCII word may still be rejected, with no invisible inserted separator or silent source alteration. These extensions are not yet integrated into the general BCM inline AST/spec. They are text styles, not TeX math. Engine #16 passed both CI workflows and merged; this stacked draft depends on BookCreator #37 and the mixed-family metric correction in Engine #17. Do not merge before those dependencies and all CI are green. Unit, actual BCM and Electron tests added; CI unverified.

## Manuscript lists (experimental M04)

Top-level scanner raw lines support `- `, `+ `, `* ` and decimal `1. `–`999. ` markers, one ASCII space after the marker, and one optional nested level aligned to the actual parent content column (two spaces for a bullet parent, three for a single-digit ordered parent). Each item has one nonempty supported inline body. A nested item must follow its parent; sibling ordered items start at the first explicit number and increment, including across blank-separated root siblings. Nested counters reset with each new parent; blank-separated nested items are rejected. A parent marker requiring four or more indentation spaces cannot currently have nested items. A paragraph adjacent to a list without a blank line is diagnosed; continuation lines, deeper nesting, task lists, lists inside components, tabs and unsupported Markdown are not silently approximated. The existing BCM scanner remains authoritative (four-space indentation is classified as code).

Each item has its own full raw origin including the marker and line ending, plus the exact body source offset or inline source map. Derived marker text is excluded from logical text. Both preview adapters pass a typed list descriptor to the Engine: 5 mm depth step, 14 mm marker column, 2 mm gap, body-role typography, splittable rows. Paragraph component frames do not apply to list items. Inline markup in existing list text renders. The source toolbar can toggle an isolated single-line root paragraph to a bullet or ordered item, switch its kind or remove its marker. The exact prefix patch preserves body text, CRLF, selection and surrounding scanner structure. Adjacent raw/code lines, neighboring lists even across blanks, nested items and protected contexts are rejected to prevent accidental merging, renumbering or reparenting. Subtree editing, continuation paragraphs and inline formatting edits inside lists are not yet supported. These are experimental defaults, not formal BCM grammar or publication readiness.

Engine #18 passed both CI workflows after startup diagnostics and was squash-merged; integration and desktop CI pin merged commit b14d520e629084cbcdd5b6590feeade8b30be4b5. BookCreator PR #39 passed all three CI workflows and merged. The current parser is intentionally limited to scanner-supported one-level nesting; deeper indentation remains scanner-classified code and is rejected rather than reinterpreted.

### List indentation editing (experimental)

The source toolbar adds indent/outdent for one existing list item. The exact BCM patch changes only its leading ASCII spaces, retaining the raw marker, inline markup, line endings and selection. Indent moves a root item with no children under the preceding root (possibly after existing children) without an intervening blank line; the parent's raw marker determines the child indentation. Outdent moves only the last child to root level. Operations that would move other items to another parent, exceed the supported two levels, or introduce unsupported four-space indentation are refused. The complete local list run is compiled before and after the proposed change; text, item order and unrelated depths must remain identical. Derived ordered numbers may change as the item moves. A full-document scanner check guards source boundaries; the editor uses existing stale-selection, IME and preview invalidation guards. Multi-item operations, child-subtree moves, arbitrary depth and list spacing styles remain future work. Integration and Electron tests added; CI not yet confirmed.

### Whole-run list conversion (experimental)

Selecting all bodies in an isolated run of 2–128 adjacent top-level raw lines enables the same bullet/ordered toolbar buttons for batch conversion. An entire supported plain paragraph run becomes one item per original source line; a homogeneous root list can change kind or remove its markers. New ordered markers use 1, 2, ...; existing numbers are intentionally regenerated only when converting to ordered. Original inline markup, body text, LF/CRLF, and surrounding source remain unchanged. Selection is restored across the converted run. The planner checks full scanner ranges and compiles both versions of the isolated run before applying one exact BCM patch. Partial runs, blank-separated selections, nested lists, mixed marker types, adjacent list groups, and protected code/directive contexts are refused. This does not move multiple items between levels or edit subtree structures. The single-item indent/outdent operation remains independently limited to one supported nested level. Core/BCM/Electron regression tests added; latest CI pending.


### M04 — BCM 独立数式プレビュー（実験的）

既存 BCM scanner が認識した `$$` フェンスのうち、本文が1行の独立数式を対象にする。LF/CRLFと式中の空白を保持し、式本体のUTF-16範囲を厳密に対応付ける。Engineの `parsePreviewMath` をホストから注入して検証し、未知コマンド・空式・複数行・未閉鎖フェンス・上限超過・validator未設定は診断で拒否。単独／全冊プレビュー共通で `displayMath: true` と `strict` を渡し、通常インライン書式や段落フレームを適用しない。プレビュー選択はレンダリングされたグリフではなく原稿の式本体へ戻る。フォントはEngineのnative MathMLフォールバック、初期サイズ4.2mm。GUI数式挿入、インライン数式、部品内数式、数式番号、専用数式フォントと出版検証は後続。CI未確認。


### M04 — GUI独立数式エディタ（実験的）

原稿のトップレベル空行または末尾のカーソルから独立数式を挿入し、既存の単一行数式ブロック内の選択から式本文を編集する。分数・平方根・添字・総和のひな型（式全体を置換）と安全なnative MathML参考プレビューを提供。Engine parserとBCM scannerで検証し、原稿改変はexact patchのみ。既存フェンス、改行、他ブロックを保全し、保護領域、混在改行での挿入、古い原稿スナップショット、IME中の適用は拒否する。紙面をクリックして式本文を選択後に再編集可能。キャンセルは無変更。インライン式・部品内式・構造化WYSIWYG式編集・番号付けは未対応。CI未確認。


### M04 — BCMインライン数式プレビュー（実験的）

トップレベルの通常本文だけで、BCM既存 `$...$` をEngineの型付きinlineMathへ接続する。開き直後・閉じ直前に空白不可、閉じ直後のASCII数字は拒否、同一行の単独ドル境界とbounded parserを検証する。エスケープしたドル `\$` は本文の文字として描画し、原文のエスケープを保全する。式全体は一つのU+FFFC論理atomとなり、UTF-16 source mapが元のドル付き範囲へ対応する。派生MathML glyphを原文と見なさず、通常断片と式単体のクリック／キーボード選択を分離。LF/CRLF、周囲の非重複書式、単独／全冊プレビューを維持。見出し・リスト・参考書部品・本文コンポーネントframe内の式、式内の入れ子装飾、GUIでの挿入・編集は後続。未対応領域と曖昧な金額記法は黙って組版せず診断する。Engine #20の確定SHAをpin。CI未確認。


### M04 — GUI本文内数式（実験的）

既存の独立数式ボタンとは別に本文内数式ボタンを追加し、ひな型・native MathML参考プレビュー・適用/破棄を共用する。通常本文の非空行にカーソルを置いて挿入、または既存の式本体/ドル付き範囲を選択して編集する。挿入は一つのexact patch、更新は式本体のみでフェンスを保存。選択を無断で置換しない。実BCM scannerとprepareManuscriptの前後構造、全論理本文・書式・数式atomを照合して周辺の意味を保全する。グラフェム分割、式外の選択範囲、装飾内、隣接ドル、閉じ直後ASCII数字、未対応原稿・本文フレームは拒否。勝手な空白挿入なし。原稿変更・テーマ変更・IME中の適用防止と選択復元を既存editorと共有する。見出し・リスト・参考書部品内の数式、独立↔インライン自動変換は後続。CI未確認。


### M04 — 独立数式の章別採番・参照（実験的）

BCM `:::layout{#eq-id numbered="true"}` の単一独立数式のみを対象に、章番号.式番号を書籍順で派生する。H1または章未開始時の見出し・参考書部品・最初の番号付き式を章開始とし、ファイル境界で章状態をリセットする。既存の裸の数式、numbered=false、省略は採番しない（書籍の既定採番設定は未実装）。数式の右端に `(2.1)` を実測配置、原稿本文に番号を書き込まない。通常本文の `:ref{target="eq-id" format="number"}` は `2.1`、label-number（既定）は `式 (2.1)` に解決し、前方・ファイル間参照にも対応。BCMの実参照token parserと既存のID重複検査を利用し、未解決・無番号・異種ターゲット、title/page、未知属性を拒否する。派生ラベルの一部を含む断片は元token全体を選択する。単独原稿のdesktop previewでも参照・layoutを含む場合は全冊コンテキストを使用。番号付き数式のGUI生成/編集、参照GUI、章設定・正式出版は後続。Engine #21 merged pin。CI未確認。


### M04 — GUI番号付き独立数式（実験的）

BookCreator #45の全3CI成功・mainマージ済み（7cbe62094e96b7f5b21a15831a4242df3d66ad8a）。独立数式の新規挿入で「章別の数式番号を付ける」を選択すると、GUIが eq-UUID を生成し、既存BCM layout wrapperとnumbered="true"により一つのexact patchで挿入する。既定は無番号。生成IDは適用前に表示し、同一原稿内の重複を拒否する。書籍全体の重複は既存の組版検証で拒否する。既存の単一独立数式を含む対応layout wrapperは紙面から選択して再編集できる。数式本文のみ置換し、ID、採番属性、フェンス、他ブロック、LF/CRLFを保全する。既存数式の採番設定とIDは読み取り専用（参照を破壊しないよう、既存式の採番変更・ID変更・参照挿入GUIは別途実装）。番号付き数式の挿入・再編集、参照解決・不正wrapper拒否の統合回帰試験と実Electron操作試験を追加。CI未確認、出版準備完了ではない。


### M04 — GUI数式参照挿入（実験的）

通常本文の非空行にカーソルを置き、数式参照ボタンから全冊のID付き番号付き独立数式を選択する。表示形式は label-number（既定）または number。原稿に保存するのはBCMの :ref token と永続IDのみで、番号は書籍順に派生する。未保存の選択原稿と現在の書籍順を使い、適用時には再読込した全冊スナップショット・原稿世代・IME状態を照合。変更や外部更新があれば拒否する。既存書式や数式atom、参照token内部、保護領域、選択置換、未対応原稿、重複・欠落IDは拒否。exact patch後に全冊を再準備し、対象以外の意味・範囲および周囲の論理本文・書式・数式atom・参照元範囲を比較する。挿入tokenを選択復元。既存参照のGUI更新、部品・見出し・リスト内の参照、採番切替は後続。実BCMとElectron試験追加、CI未確認。#46の全CI成功・main統合後に本PRをmainへ統合する。


### M04 — 既存独立数式の採番切替（実験的）

通常の独立数式または対応layout wrapperを選択し、数式採番切替ボタンを使用する。裸の数式を有番号化するときだけ新しいwrapperを追加し、IDがない場合はeq-UUIDを生成。既存wrapperは採番属性を変更し、IDがあれば保持する。解除時もwrapperとIDを保持し、再度有効化しても同一IDを使用する。数式本文と周辺原稿をexact patchで保全し、LF/CRLFの対応範囲を維持。全冊の現在の書籍順と選択原稿の未保存変更を使い、編集前後で実BCM検証とprepareManuscriptを実行する。別ファイルを含め参照されている式の採番解除、重複ID、非対応構文や原稿の外部変更・IME中の適用を拒否する。派生番号の変動は許容するが、他の数式・原稿ブロックの内容・ID・範囲を変えない。参照の自動削除やIDの変更はしない。実BCM統合試験とElectron試験を追加。#47に依存し、CI未確認、正式出版不可。


### M04 — 参考書部品内のインライン数式（実験的）

LayoutEngine #22の確定SHAをpin。BCM通常本文、独自本文フレーム、標準参考書部品、自作部品の既定本文・明示content・名前付きテキストスロットで同じ `$...$` を解析する。各スロット独立の論理atomとraw source mapを維持し、紙面の数式クリック・キーボード選択は所属スロットの元ドル付き範囲へ戻す。既存GUI数式editorから非空の意味的テキスト行に挿入・更新可能。前後の再準備、親部品/slotの同一性、再帰的scanner構造・ヘッダ属性・ID・論理本文/書式/全atomを照合する。ヘッダ、保護領域、通常文字選択の置換、スロット跨ぎ、未対応原稿を拒否。書籍文脈が必要な原稿のGUI編集は従来同様に制限される。部品Labの数式入りサンプル、部品内独立式、リスト・見出しの数式、部品内の式参照、専用フォントは後続。統合試験とElectron操作試験を追加、CI未確認。


### M04 — Component Lab / Paragraph Lab のBCM数式サンプル

参考書部品の本文と名前付きテキストスロット、独自本文フレームのサンプルに、明示的な「サンプルをBCMとして組版」切替を追加。初期値は従来どおり文字列そのまま。ONでは実原稿と同じrestricted inline parser・Engine MathMLで数式・文字書式を実測する。各スロットは独立し、固定ラベル・見出しLabは従来の文字列扱い。不正な式、未対応記法、幅超過を拒否して古いプレビュー/適用許可を破棄。サンプル本文・モードは保存せず、テーマの部品定義のみ保存する。サンプルから原稿への逆参照は作らない。部品内独立式は後続。統合テスト・Electron回帰試験を追加、CI未確認。


### M04 — 参考書部品内の独立数式（実験的）

LayoutEngine #23の確定SHAをpin。標準/自作の非分割参考書部品の本文および名前付きテキストスロットでは、BCM scannerが認識した単一行数式の三行 `$$` fenceを一つのdisplay atomに変換する。前後のLF/CRLFと各slot独立のsource mapを保全し、式の紙面選択はドルを含む元fenceに戻す。既存独立数式editorで既存式を更新、または意味的slotの内部空行へ挿入。部品・slot・原稿の他の範囲を変えず、採番UIは表示しない。Component LabのBCMサンプルモードも同じdisplay atomに対応。分割本文フレーム・部品内式番号・参照・全冊文脈が必要な原稿での編集は後続。CI未確認。


### M04 — 拡張数式構文とひな型

LayoutEngine #24・#25 の確定SHAを固定し、数式エディタに三角関数・極限・対数・ベクトル・累乗根・可変括弧・偏微分のひな型を追加。本文・独立式・部品・Labで同じ許可リスト型パーサーを使用。CIではOpenType MATHフォントを明示導入し、実測の再現性を高める。実行環境への数式フォント同梱・ユーザー選択・フォント能力検査は今後の作業。行列・場合分け・整列式のひな型にも対応。1行原稿内の行区切りで複数行表示（最大8行×8列、全64セル）。CI未確認。


### M04 — 独立数式フォント設定

LayoutEngine #26 の確定SHAを使用。フォント管理でライセンス確認済みの静的Regular TTF/OTF OpenType MATHフォントをインポートし、本文・見出しとは独立した数式ロールを選択できる。テーマの任意 `typography.roles.math` にハッシュベースの登録IDとweight 400を保存し、自動選択に戻すと省略する。旧テーマ・旧通常フォントmetadata互換。紙面・原稿エディタ・Component Lab・Paragraph Labの数式へ伝播。SFNTのMATHヘッダとサブテーブル境界の事前検査、既存権利・サイズ・ハッシュ検査、ブラウザの実測probeを組み合わせる。MATH全テーブル・全glyph coverageの完全検証や出版保証ではない。数学用フォント同梱はライセンス調査・配布パッケージ設計を別途行う。CI未確認。


### M04 — 標準数式フォント STIX Two Math

新規書籍は本文・見出しにNoto Sans JP、数式にSTIX Two Math Regularを指定する。既存テーマのmathロール省略は従来のシステム自動選択を維持し、勝手に再組版結果を変更しない。mathロール `font: stix-two-math, weight: 400` を明示選択すると同梱fontを使用する。自動選択、インポート済みMATHフォントにも切替可能。Fontsource等の分割サブセットではなくGoogle Fontsリポジトリの固定revision 477b6577b3a9a9e3229eb8e0946da806d2cf822b の完全TTFとOFL.txtをビルド時取得、Git blob SHA-1照合、SFNT/MATH事前検査。任意の `BC_STIX_SOURCE_DIR` で同一固定ファイルをオフラインビルド入力に指定可能。生成物にフォント・ライセンス・SHA-256を含め、起動時も固定blobとmanifestを照合する。実行時は既存のbookcreator://app許可リスト・CSP経由のみ、ネット取得なし。数式フォントのバイト列をプレビューフィンガープリントに含める。出典 https://github.com/google/fonts/tree/477b6577b3a9a9e3229eb8e0946da806d2cf822b/ofl/stixtwomath 、上流 https://github.com/stipub/stixfonts 、SIL OFL 1.1。正式配布パッケージ・出版保証・全glyph検証は別途。CI未確認。


### M04 — 複数行の独立数式原稿

LayoutEngine #27の確定SHAをpin。BCMの独立数式フェンスはLF/CRLFとインデントを含む式本体をそのまま保持し、専用parseDisplayMathで安全に解析する。通常独立式・layoutで採番した独立式・strict参考書部品の本文/名前付きスロット・Component Labで対応。数式エディタは独立数式のみtextarea化、インラインは従来の1行inputと単一行文法のまま。編集時にtextareaの改行を原稿の統一された改行形式に戻す。元のフェンス・永続ID・参照・UTF-16範囲を保全。入力ソースの改行自体は数式の組版上の改行ではない。aligned/matrix等の行区切り記法を使う。既存2048文字・AST・セル制限維持。混在改行原稿への複数行挿入・部品内採番・書籍文脈必須の部品編集は対象外。CI未確認。


### M04 — 参考書部品内の番号付き独立数式（原稿・紙面PoC）

LayoutEngine #28 の確定SHA cb19394c600538f65144dd2f24af83a62d117e88 を固定。既存の layout による採番式を非分割の参考書部品・名前付きスロットの直下でも解釈する。例えば：

```bcm
::::callout{kind="note"}
式の説明。

:::layout{#eq-note numbered="true"}
$$
x^2+1
$$
:::
::::

:ref{target="eq-note" format="label-number"} を参照。
```

章ごとに独立式と同じカウンターを使い、部品内は紙面のスロット配置順ではなく原稿の出現順を採用。永続IDの重複・無効な参照・非対応構文を拒否する。別文書の通常段落からの参照にも対応し、source mapはlayoutラッパー全体のUTF-16範囲を保持。GUIからの番号付与・解除、ラッパー内数式の編集、部品内からの参照、Labでの番号付きサンプル、正式出版は後続。CI未確認。


### M04 — 番号付き部品内数式の編集

紙面の式または番号を選択して独立数式エディタを開き、式本体のみを更新する。scanner所有のlayout範囲と永続ID・採番フラグ・slotを保持する。開く時と適用時に書籍全体の原稿スナップショットを取得し、現在の未保存原稿を反映して参照と重複IDを再検証する。外部更新・古い編集状態・無効な式は拒否。GUIからの部品内採番付与/解除・部品内参照・Labは後続。CI未確認。


### M04 — 部品内数式のGUI採番操作

既存の採番切替ツールバーを部品本文・名前付きslotの独立式にも接続する。採番開始時に永続IDを付与し、解除時はlayoutのnumbered属性をfalseにしてIDを保持する。再有効化は同じIDを使用。入れ子layoutのために必要な場合のみ祖先の開始・終了コロン数を増やし、数式本体や他の原稿内容は保存する。BCM scannerの境界条件を満たさない配置（例：数式直後に空行なしで通常段落が続く場合）は変更を拒否する。全冊の検証により参照中の数式の解除・重複IDを拒否する。挿入時の同時採番、部品内参照、Labの番号付きサンプルは後続。CI未確認。


### M04 — 部品内からの数式参照

部品本文・名前付きテキストslotの通常段落に既存の `:ref{target="eq-id" format="label-number"}` または `format="number"` を使用できる。通常独立式・部品内式のどちらも永続IDで参照し、全冊の章別採番確定後に解決する。参照ラベルのsource mapは元のトークン全体を指す。GUIは既存の参照挿入ツールを共用し、通常段落のカーソル位置でのみ挿入、数式・書式・既存参照の途中や不正な参照は拒否する。参照を含む部品内独立式の編集・採番解除も全冊検証する。全冊文脈が必要なインライン編集、Lab、挿入時同時採番は後続。CI未確認。
