# 次期マイルストーンと独立ツール設計

- 状態: レビュー用ドラフト / 2026-11-26
- 対象: BookCreator、BCM、LayoutEngine および制作支援ツール
- 位置付け: [DEVELOPMENT_PLAN](DEVELOPMENT_PLAN.md) の D02〜D07 を次の実装単位へ具体化する補助文書。既存正本・[DECISIONS](DECISIONS.md) を置換しない。
- 実装済みの範囲は各リポジトリの IMPLEMENTATION_STATUS を参照。以下は未実装の設計案。

## 1. 基準点と到達点

第2マイルストーンでは BCM の lossless block scanner、Engine の recursive layoutTree、両者の手動組み立て smoke test まで進んだ。記録上、ローカル単体・結合試験は合計26件成功。完全な CommonMark/GFM 解析、実測、ページ割付、GUI は未実装。リモートCI、ロックファイル、正式ライセンスも未確認・未完了。開発版公開ゲートは Q15 のまま変更しない。

次の到達点は「BCM原稿から意味を保持した中立入力を生成し、模擬計測で複数ページを割り付け、原稿範囲付きの診断・断片を取り出せること」。GUI・正式PDF・実計測の完了を意味しない。

## 2. データ経路と依存方向

    BCM source / book.yaml / theme files / assets
       |                  |
       v                  v
    BCM parse + index    BookCreator project loader
       |                  |
       +-----> document adapter -> semantic numbering
                                   -> theme compiler
                                   -> neutral LayoutInput
                                             |
                                    LayoutEngine + Measure adapter
                                             |
                                          PagePlan
                                             |
                              Preview / inspector / publication adapter

BookCreator が両ライブラリを利用し、BCM と Engine は相互依存しない。BookCreator固有の章順・採番・テーマ解決はアプリ側、ページ依存値・断片化は Engine 側。レンダラーは確定位置を描画し、自分で再割付しない。

## 3. 次期の実装契約（型名は案）

### BCM

現在の scanner を完全な parser と呼ばない。まず CommonMark/GFM 候補の構文コンテキストと BCM 拡張の境界を検証する。fence / inline code / HTML block / list / blockquote 内部の解釈は SPECIFICATION の正本に従い、未確定ケースは明示診断・fixture とする。未知構文を消去しない。原文の UTF-16 半開区間と解析 revision を保存する。ファイルの BOM/改行/文字コードを保持する責務は I/O アダプタにある。

次の公開境界候補: ParseResult, Diagnostic, ReferenceIndex, TextPatch。診断コードはライブラリ内で安定識別子を持つ。行列番号は source range から表示時に導出。reference index は明示された文書集合のみを対象とし、実ファイルを探索しない。局所パッチは期待原文・範囲・revision を検証し、仮適用と再解析を通す。未知要素を跨ぐ自動編集は禁止する。

### LayoutEngine

既存の geometry PoC を再利用し、まず単一の紙面、単一カラム、整数マイクロメートル、模擬計測の契約で割付を検証する。LAYOUT_MODEL の LayoutInput / Origin / PagePlan を段階的に型化し、最小未対応機能を capabilities と診断で明示。部分計画を complete としない。

各ブロックは origin（documentId, revision, blockKey, range?, persistentId?）を持つ。Measure adapter は利用可能幅、内容、環境指紋、継続情報から寸法と有効分割候補を返す。模擬計測結果は実HTMLとは区別。文字数による擬似計測を正式出力に使わない。

割付の最小アルゴリズム:
1. 入力と紙面・寸法を検証する。
2. 現在のページ残高で計測・境界制約を評価する。
3. 全体が収まれば配置。allow は最大の安全な境界、avoid は空ページ移動を優先し収まらない場合に警告付き分割、strict は分割せず空ページにも収まらない場合に停止。
4. 明示境界・面制約を尊重し、現在条件を満たすページ先頭では余計な空白を作らない。
5. 継続断片・境界理由・原文位置を記録し、前進不能を検出する。
6. 内容の重複/欠落、寸法、ページ順を検証。未対応機能や未収束の結果は正式出力不可。

固定見開き、反復部品、脚注予約、ページ参照、目次収束などは段階的に PAGINATION の全要件へ拡張する。Q12/Q16/Q17を削除しない。

### BookCreator

Document adapter は解析結果を読み取り専用で参照し、原稿の第二正本を作らない。ブロック種別を解決し、章・図表番号と参照を解決してからテーマのスロットに内容を渡す。部品の token/variant/個別属性の出所を保持する。未知・未対応の内容は位置付きの診断を返し、無言で除外して出版可能にしない。

変換の入力: immutable workspace snapshot（文書、manifest、テーマ、素材の識別・ハッシュ、revision、対象スキーマ版）。出力: 中立 LayoutInput（作成可能な場合）と診断。ページ計算は Engine に委譲する。PagePlan受信時に revision と fingerprint を照合する。原稿編集、テーマ適用、素材変更、フォント実体変更で必要な派生結果を失効させる。

初期は全文再解析・全体再計算を正しさの基準とし、差分更新は同じ入力で完全計算と一致することを検証後に導入する。キャンセルされた計画や古いプレビューからの編集・確定は禁止。

## 4. 制作支援ツール（提案・仮称）

独立性は利用可能な公開APIと責務で確保し、初期から別リポジトリやGUIを乱立させない。名称・配布名は未確定。CLI は Node 専用の薄い I/O 層とし、コアはブラウザでも使えるよう維持する。

| ツール | 配置案 | 責務 | 初期出力 |
| --- | --- | --- | --- |
| BCM CLI | BCM 内 | parse / validate / refs。文法・ID・参照切れの検査 | JSON AST・診断 |
| Layout Inspector | Engine 内 | 中立 LayoutInput を模擬計測し、配置・制約・分割理由を検査 | PagePlan JSON・診断 |
| BookCreator CLI | 本体内 | check / plan。manifest・素材・テーマ・BCMをまとめて検査し中立入力を生成 | 診断・計画 |
| Component Lab | 本体の開発用UI | 部品単体と紙面上の挙動をストレステスト。Design UI と同じコンパイラを再利用 | テスト表示・結果 |
| Publication Checker | 本体の出力アダプタ | HTML確定後の PDF と期待出力計画の照合 | ページ数・寸法・差異診断 |

コマンド案（実装済みではない）:

    bcm parse chapter.md
    bcm validate chapter1.md chapter2.md
    bcm refs chapter1.md chapter2.md
    layout-inspector plan layout-input.json --measure fixture
    bookcreator check ./book
    bookcreator plan ./book --measure fixture

CLI は機械可読 stdout と人間向け stderr を分離できるようにする。終了コード案: 0=成功（要求操作に必要な診断エラーなし）、1=検証エラー、2=引数/I/O/内部エラー。警告や未対応 capabilities を結果に含める。明示されたパスのみを読み込み、symlink・パス逸脱・入力サイズをアプリ境界で検証。既定では原稿、テーマを変更しない。出力ファイル書込は明示オプションのみ。未検証の正式PDF生成・自動修正・npm公開は対象外。Publication Checker の正式検査は PDF_EXPORT と PUBLICATION_RENDERING に従う。

別リポジトリへの分離条件: 独立した利用者/配布要求、安定したAPI、依存の独立性、ライセンス・保守体制が確認できた時点。現時点では追加リポジトリ不要という提案。

## 5. 次の作業チケットと完了基準

| ID | 担当 | 作業 | 合格基準 | 依存 |
| --- | --- | --- | --- | --- |
| M03-A | BCM | CommonMark/GFM と BCM のコンテキストPoC | fence、inline code、quote/list、HTML、未知構文の期待範囲・診断を記録。対応外を明示 | D02 |
| M03-B | BCM | 属性検証・参照索引・局所変更 | 重複ID/欠落参照、未知属性、CRLF/絵文字、stale revision をfixture化 | M03-A |
| M03-C | Engine | 最小 LayoutInput/Measure/PagePlan と単一カラム割付 | allow/avoid/strict、改ページ、前進不能、origin保持のfixture | D04 |
| M03-D | 本体 | 変換器の最小実装 | heading/paragraph/figure を実際に解析・変換。手作り部品ツリーによる代用を統合fixtureから外す | M03-A,C |
| M03-E | 3リポ | 共通fixtureとCI更新 | 固定commit/実行環境、各結果、未対応を記録。旧smoke testも維持 | M03-B,C,D |
| M03-F | BCM/Engine | CLI最小コマンド | 読取専用、JSON、終了コード、失敗診断のテスト | M03-B,C |
| M04-A | 本体/Engine | HTML計測PoC、実紙面プレビュー | 模擬との差を記録、font/image readiness、描画位置、取消、古い結果拒否 | M03-E |
| M04-B | 本体 | Desktop shell・workspace保存・Writing GUI | 新規/開く/保存、構造編集/原稿同期、IME、Undo、外部変更、復旧 | M03-E |
| M04-C | 本体 | Component Lab と基本部品エディタ | row/column、文字・図形・色・余白、長いH1、Apply/Discard | M04-A,B |

M03-A/C は並行可能。M03-D は最初の共通型を使って早期に結合する。M04以降も Q15 および全製品目標を維持。D08/D08b/D09/D10の公開ゲートをこの表で置換しない。

## 6. 横断fixtureの最小具体例（模擬値・未実行）

- 本文領域: 高さ100mm、幅100mm、余白控除済み。段落行高さ10mm、H1高さ20mm（装飾込み）、figure高さ30mm。値は実文字計測ではない。
- A原稿: H1、4行段落、figure（ID fig-a、幅75%）。Aの合計90mm。
- B原稿: continuous、先頭H1、2行段落、途中H1（部品既定page-top）、fig-aへの参照を含む段落、明示pagebreak、コード。Aの残り10mmではBのH1を置けないので自然に次ページへ。別fixtureではAを70mmとし、BのH1が既定page-topの抑制で同じページに入ることを検証する。
- 途中H1のpage-topと明示pagebreakは維持。実際の段落分割候補と孤立行/keep制約を入力に固定し、期待ページ列を機械可読にする。
- figure幅のGUI相当変更（75%→50%）で原文中の値だけが変わり、他バイトが同一であること。古い revision で同じ編集を再実行すると拒否すること。幅だけの変更で高さが自動変化するケースは別fixtureにする。
- strictの巨大要素は診断停止、allow/avoidの安全分割は内容を一度ずつ保持すること。未対応の表/数式等は診断付きで正式出力不可。
- Q16: 章番号なしファイルの補完番号は実章と同じカウンタを共有、見出し自動挿入なし。実章との境界と複数ファイルの試験は PROJECT_FORMAT に従う。
- Q17: 同一解決済み脚注IDを1ページで2回、別ページで1回参照した時、同じ番号で各ページ1回。脚注位置移動の再計算は PAGINATION PG-12 として検証。

fixture は入力・環境・依存commit・期待・実測・pass/fail/blocked/not-run を区別し、実測前に成功と表記しない。模擬データを実際の出版結果として扱わない。

## 7. リスク・保留

- DEVELOPMENT_PLAN / ARCHITECTURE / LAYOUT_MODEL などの古い「未実装」表記は、現状の IMPLEMENTATION_STATUS と区別して読む。次の実装更新時に該当節の状態・根拠を揃える。
- 依存導入と npm lockfile、リモート CI の検証は未完了。実行環境で解消できるか確認し、公開前に必須化する。
- 最終ライセンス（Q14）、Web正式PDF（Q11）は既存の保留を維持。新たな公開名・配布形態は仮案。
- Component Lab、Inspector等は既存の機能責務を再利用する提案で、別製品を確定するものではない。BookCreator外の独自ツールを意味している場合、対象を特定して別途設計する。
- 本文・ソースコード・既存決定の変更はこのドラフトでは行わない。
