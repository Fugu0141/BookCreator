# BookCreator — プロジェクト形式 v1（詳細設計ドラフト）

正本: 本書はBookCreatorのディスク上のプロジェクト形式を規定する。BCM構文は [BCM仕様](https://github.com/Fugu0141/BookCreator_Markdown/blob/main/docs/SPECIFICATION.md)、部品配置の意味論は [Engine LAYOUT_MODEL](https://github.com/Fugu0141/BookCreator_LayoutEngine/blob/main/docs/LAYOUT_MODEL.md) を参照。実装前案。

## 1. ディレクトリと保存

    book.yaml
    manuscript/*.md
    assets/
    themes/default/theme.yaml
    themes/default/components/*.yaml
    layouts/*.yaml
    bibliography.yaml
    fonts/
    .bookcreator/
    dist/

原稿、テーマ、素材、書籍設定、文献、必要な再配布可能フォントを正本とする。.bookcreatorはローカル設定、復旧ジャーナル、キャッシュ、確定記録のみ。distは派生出力。Gitは後者2つを既定除外。隠しフォルダや名前の変更は正本の意味を変えない。プロジェクトはbook.yamlのディレクトリをルートとする。拡張子は.mdのまま。フォルダ配置は推奨であって、manifestの明示参照が正本。

## 2. manifestの型と例

    schemaVersion: 1
    documentFormat: {name: bcm, version: 1}
    title: "Unity入門"
    language: ja
    theme: themes/default/theme.yaml
    bibliography: bibliography.yaml
    page:
      size: A4
      binding: left
      firstInteriorSide: right
      defaultSectionStart: page
      margin: {top: 18mm, bottom: 20mm, inner: 23mm, outer: 18mm}
    sections:
      - {id: front, type: cover, role: front-cover, src: assets/cover.png, fit: cover}
      - {id: intro, type: manuscript, role: front-matter, path: manuscript/intro.md}
      - {id: unity, type: manuscript, role: body, path: manuscript/unity.md, startOn: right}
      - {id: git, type: manuscript, role: body, path: manuscript/git.md}
      - {id: back, type: cover, role: back-cover, src: layouts/back.yaml}
    numbering:
      - {start: "section:unity", endExclusive: "section:back", initial: 1, format: decimal, position: outer-bottom, countBlank: true, printBlank: false}
    headings:
      levels:
        "1": {label: "章", numbered: true, pattern: "第{n}章", toc: true}
        "2": {label: "節", numbered: true, pattern: "{path}", toc: true}
        "3": {label: "小節", numbered: true, pattern: "{path}", toc: true}
    counters:
      figure: {resetAtLevel: 1, pattern: "図{path}.{n}"}
      table: {resetAtLevel: 1, pattern: "表{path}.{n}"}
      code: {resetAtLevel: 1, pattern: "リスト{path}.{n}"}
      equation: {resetAtLevel: 1, pattern: "式({path}.{n})"}
    output:
      defaultProfile: digital

schemaVersionとdocumentFormatは必須、未知必須形式は読取専用。title/language/theme/page/sections必須。bibliography/numbering/headings/counters/output任意（既定値をスキーマで明示）。未指定テーマ属性を保存時に一括展開しない。page.sizeはプリセットまたは{width,height}の物理長、leftのみ初期対応。内頁開始面はright既定、defaultSectionStartはpage既定。余白は物理長で非負、本文領域が正。配布版で未対応の縦書き/右綴じを無断変換しない。

sectionsは順序付きでID一意、ファイル名/見出しとは独立。type=manuscript/cover/blank。manuscriptはpath・role(front-matter/body/back-matter)、startOn=page/continuous/left/right/spread-start/spread-end。coverはrole(front-cover/back-cover)、srcまたは宣言参照、原稿の通常フローを持たない。初期は表紙/裏表紙それぞれ最大1件、最初/最後に置く。blankはcount正整数、numbered任意、内頁面を消費する。原稿ファイルの同一実体を複数sectionで参照することはID重複を避けるため初期は診断（必要時に明示的複製）。section順の変更はファイル内容を変えない。

numberingは順序付きの非重複区間。start/endExclusiveはsection:IDまたはblock:永続ID、終端はbook:endも使用可。アンカーが実在し有効なブロック境界であること。境界は組版にページ開始を要求する。initial正整数、format=decimal/roman-lower/roman-upper、print（任意、既定true）を番号の割当と別にする。旧例の「非表示」はprint=false。countBlankとprintBlankは別。数えない空白は番号未割当。表紙外の印刷面調整空白は番号なし。start直前の派生空白は前区間。position/フォントはテーマのページ番号部品と関連づけ、二重正本を作らない。

headings/countersは意味的番号の設定。patternは制限されたプレースホルダーで任意コードではない。番号印字とカウンタ増分を区別する。階層スキップ・独自部品の番号種別は実装fixtureで固定する。生成された番号は原稿へ書き戻さない。

### ファイル単位の章番号補完（Q16）

章依存の図・表・コード・数式の採番に必要な章番号が現在の原稿ファイル内にないときは、ファイル単位の派生章番号を補う。補完は原稿の見出しや目次項目を生成する操作ではない。初期の採番案: 出版順・原稿順に実章と補完章を一つの章カウンタから採番し、最初に章依存番号が必要になった時点で補完章を一度だけ作る。同一ファイル内の後続の対象はその番号を共有し、実際の番号付き章見出しが現れた場合は次の章番号を使う。ファイル境界では章コンテキストをリセットし、前ファイルの章番号を誤って流用しない。章依存番号を持たないファイルには補完番号を割り当てない。章依存採番を無効化した種別や番号なし要素には強制しない。補完章の番号は設定された開始値・カウンタに従い、図表等の種別別カウンタをリセットする。例えば前書きに図がある場合は図1.1、次の実章の図は図2.1。図を追加/移動したときの採番・参照は再計算し、永続IDは維持する。番号の飛びや重複を検査する。この共有カウンタと割当時点は衝突回避のための詳細設計案であり、fixtureで確認する。

## 3. 素材・文献・テーマの参照

manifestはルート相対、Markdown・インラインCanvasは原稿相対、外部Canvasとテーマは各宣言元相対。相対パスは/、絶対パス・UNC・範囲外・危険なsymlinkは禁止。大小文字、Unicode正規化、Windows予約名、同一実体の衝突を検出する。外部URLは自動取得しない。画像はコピー・ハッシュ重複検査、非破壊クロップ/回転、PNG/JPEG/WebP/安全SVG。フォントは実体・ライセンス・ハッシュ・ウェイトを照合。

文献の初期案はYAML（bibliography.yaml、schemaVersionとentriesのキー付き集合）、各entryはCSL互換を目標とする構造（id/type/title/author/issued/URL/DOI等）。引用キーをBCMのciteと一致させる。正式スキーマ、CSL/BibTeXインポート、引用書式はPoC後。原典のデータを推測で補わない。テーマ/CanvasはCOMPONENT_SYSTEMを参照。共有定義の編集と独立コピーを区別する。

## 4. 読み込みと更新

YAMLはデータのみ。重複キー、タグ、循環、過大な入れ子を拒否。未知属性を無断削除しない。正本ファイルのGUI更新は対象ノードの局所変更または明示差分を用いる。読込順はmanifest→参照境界/形式→テーマ・原稿・素材→BCM索引→意味的検証。壊れた文書も原文を保存/退避可能にする。書込は一時ファイル＋同一ボリュームで置換、複数ファイルは復旧ジャーナル。新旧ハッシュを記録し、クラッシュ復旧で外部編集を上書きしない。移行はバックアップと差分の確認を経て行う。

ファイル移動/改名はIDを維持し全既知参照を更新。未知構文が素材を参照する可能性がある場合は削除を安全と断定しない。プロジェクト排他・外部変更・UndoはEDITOR_TRANSACTIONSに従う。

## 5. 検証

PF-01 新規作成/再読込、PF-02 章順・ID維持、PF-03 未知形式の読取専用、PF-04 パス・symlink・Unicode衝突、PF-05 画像の参照とコピー、PF-06 保存途中の復旧、PF-07 番号区間・空白、PF-08 文献と引用キー。各fixtureは正本ファイルの前後・診断・結果を記録。未実装。

## Typography extension

See [TYPOGRAPHY_AND_FONTS.md](TYPOGRAPHY_AND_FONTS.md) for proposed font registration, role selection, local import and layout fingerprint contracts. Existing format stays unchanged until schema and fixtures are implemented.
