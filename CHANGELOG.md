# 変更履歴 (Changelog)

TssGrid の各リリースの変更点。日付は JST。形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) 準拠（ゆるめ）。
数値は特記なき限り**自社調べ**（headless Chrome / Windows 11・環境差あり）。

## [0.0.6] - 2026-06-30

### 追加
- ドラッグ選択・フィルハンドルが**表示領域の外（上下左右）まで自動スクロールしながら伸びる**ように。ビューも一緒にスクロールし、速度は端からのはみ出し量に比例（少し超え＝ゆっくり／大きく超え＝速く）。仮想スクロール時・非仮想時の両方で動作。
- `rowHeaderLabel` オプション: 行ヘッダの表示を指定（`false`＝数字なしの空ヘッダ／関数 `(r)=>文字列`＝カスタム表示／未指定＝従来の行番号）。空にしても溝は残り、クリックでの行選択は効く。
- `rowReorder: 'header'`: 行ヘッダーセル（左端の行番号の列）**全体**を行移動の掴み手に（クリック=行選択／ドラッグ=移動）。従来の `rowReorder: true` は ⠿ アイコンのみ掴める（不変）。
- `rowReorderMark` オプション: 行ヘッダーの ⠿ マークの位置を `'before'`（番号の前・既定）/ `'after'`（番号の後）/ `false`（出さない）から選べる。

### 修正
- 仮想スクロールでドラッグ選択／フィルが窓の端で止まっていた問題。
- フィルが端を1行超えただけで大量に伸びてしまう暴走を修正（伸ばす先を常にポインタ位置のセルに）。
- `examples/virtual.html`: 部署ドロップダウンの選択肢が出ない不具合（`options` 指定漏れ）を修正／表示中インジケータの更新でツールバーがずれる問題を修正／パネルを縦リサイズ可能に。

### ドキュメント
- 比較表（`examples/compare.html`）: 仮想スクロールの行を「対応（`virtual:true`・opt-in）」に更新し、デモリンクに `virtual.html` を追加。

## [0.0.5] - 2026-06-25

### 追加
- **仮想スクロール `virtual: true`**（コア）— 大量行を「画面に見える窓ぶん＋バッファだけ」描画。全件を一度に DOM 化しないので、初期描画が一瞬・スクロールも軽い。有効化はオプション一行。
  - 自社調べ: 10万行で初回描画 ≈ 46ms（全件描画 ≈ 10.5秒に対して）。デモ: `examples/virtual.html`。
  - 制約(v1): 行高一定／固定行列・折り返し・セル結合は非対応（指定時は自動無効化）。
- **`rowHeaderWidth` オプション**（コア）— 大量行で行番号の桁数が増える時に行ヘッダ幅を調整。

### ドキュメント
- README: 非破壊フィルタの説明を実測値に正確化（「絞り込み後が軽い」を自社調べ値で）＋仮想スクロール節を追加。
- 比較表（`examples/compare.html`）に Tabulator を追加（公式デモ準拠）。

## [0.0.4] - 2026-06-24

### 追加
- 見積書デモ（`examples/quote.html`）— 印刷／日付ピッカー／列幅固定／Enter 横送り（`nextCell`）。
- `navSkipReadOnly` オプション（Tab/Enter 送りで readonly セルを飛ばす＝伝票入力向け）。
- プラグイン `tss-datetime`（日付＋時刻の同時ピッカー・曜日つき・別フィールド結合・時刻のみ対応）。

### 修正
- 編集中の `Ctrl+Z` で元の値に戻せない不具合（input 編集を Esc 同等でキャンセル）。
- グリッド外周の右・下が二重線になる不具合（最終行/列のセル罫線を枠線に一本化）。
- 全幅見出し帯の結合セルで列/行選択が他列へ広がる不具合（Excel 流にクランプ）。
- 結合解除で見出しラベルが消える不具合。

## [0.0.3] - 2026-06-23

### 追加
- プラグイン `tss-sum`（条件付き合計）＋請求書デモで採用。

### 修正
- 請求書デモの合計欄を別グリッド化して金額列に完全整列／No. 列見出しが選択色になる不具合／印刷で選択枠を非表示。

## [0.0.2] - 2026-06-22

### 追加
- **npm パッケージ化**（`@threestarsoftware/tssgrid`）＋公開 API の型定義 `tssgrid.d.ts`。
- 請求書（インボイス対応）デモ。
- サイト: `/docs` ドキュメント・`/api` リファレンス（`.d.ts` から自動生成）・会社名フッター。

### 修正
- 行/列ヘッダ選択中の右クリックで複数選択が解除される不具合。

## [0.0.1] - 2026-06-19

- 初回公開。コア（編集グリッド／日本語 IME 堅牢・全角半角・セル結合・固定行列・非破壊フィルタ・条件付き書式・コピー/貼付・Undo/Redo ほか）＋同梱プラグイン＋サンプル一式。
- 目玉デモ（方眼ガント／在庫管理）をサイトでライブ化。

[0.0.6]: https://github.com/threestarsoftware/TssGrid/releases/tag/v0.0.6
[0.0.5]: https://github.com/threestarsoftware/TssGrid/releases/tag/v0.0.5
[0.0.4]: https://github.com/threestarsoftware/TssGrid/releases/tag/v0.0.4
[0.0.3]: https://github.com/threestarsoftware/TssGrid/releases/tag/v0.0.3
[0.0.2]: https://github.com/threestarsoftware/TssGrid/releases/tag/v0.0.2
[0.0.1]: https://github.com/threestarsoftware/TssGrid/releases/tag/v0.0.1
