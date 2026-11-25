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
