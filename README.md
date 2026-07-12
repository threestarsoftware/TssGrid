# TssGrid

軽量・ノービルド・**日本語IMEに強い**編集グリッド（vanilla JS / 依存なし / MIT）。

Excel ライクなセル入力・範囲選択・フィル（連番/2D）・コピペ（Excel相互）・Undo/Redo を、
バンドラ無し・`<script>` 一発で使える小さなコンポーネントとして提供する。

## なぜ作ったか

無料の Web グリッドは「日本語IMEが弱い」「商用は有料化」「中国製で採用しづらい」のどれかに当たりがち。
TssGrid は **IME堅牢 × ノービルド × MIT** を満たすことを目的にしている。

主要グリッド（Handsontable / AG Grid / jspreadsheet CE / SpreadJS）との**機能比較と立ち位置**は → [`examples/compare.html`](https://tssgrid.threestarsoftware.co.jp/examples/compare.html)（他社が強い領域＝TssGridの伸びしろも正直に併記）。

## 導入事例（Showcase）— 使ってる方へ 📣

TssGrid を使っている会社・ブランドを [`examples/showcase.html`](https://tssgrid.threestarsoftware.co.jp/examples/showcase.html) に**無料・承認制**で掲載します（個人・小規模も歓迎）。掲載すると**サイトURLへリンク**（被リンク）し、相互に宣伝になります。
- **申請**: [導入事例の掲載申請（GitHub Issue）](https://github.com/threestarsoftware/TssGrid/issues/new?template=showcase.yml) から、会社名＋ロゴ（PNG/JPG・200KB目安）を送るだけ。内容を確認のうえ承認・掲載します（スパム防止のため承認制）。
- **バッジ**: 採用いただいた方は `Powered by TssGrid` バッジを自社サイトに貼っていただけると嬉しいです（任意）。

> 仕組み: 申請(Issue) → メンテナが `showcase/adopters.js` に追記（＝承認）→ ページに表示。サーバー不要・GitHub だけで完結。

## 特長

- **IME堅牢**: アクティブセルに常時フォーカスした本物の `<input>` を重ねる方式。「あ」が「a」に化けない / 変換確定の Enter でセルが飛ばない。
- **ノービルド**: 素の HTML/JS。`file://` で直接開ける（外部Excelからの貼り付けのみ http 推奨。後述）。
- **依存なし / MIT**: 商用利用可。
- 範囲選択（ドラッグ / Shift+矢印 / Shift+クリック）、フィルハンドル（連番 / 2D矩形）、Excel相互コピペ、Undo/Redo。
- **Undo を上位で共有**: `HistoryManager` を外出しにし、複数グリッドへ同じインスタンスを注入すると **1本の Undo タイムライン**になる。

## クイックスタート

```html
<link rel="stylesheet" href="src/tssgrid.css">
<div id="grid"></div>
<script src="src/tssgrid.js"></script>
<script>
  const grid = new TssGrid(document.getElementById('grid'), {
    headers: ['名前', 'よみ', '数値'],
    data: [['彩瀬', 'あやせ', '1'], ['', '', '2']],
  });
  // 値の取得
  // grid.getData()  -> string[][]
</script>
```

**npm / バンドラ（Vite・Webpack・Next・Nuxt・Angular …）**:

```bash
npm i @threestarsoftware/tssgrid
```
```js
import { TssGrid, HistoryManager } from '@threestarsoftware/tssgrid';
import '@threestarsoftware/tssgrid/tssgrid.css';
// プラグインは個別に: import '@threestarsoftware/tssgrid/plugins/tss-merge.js'
```
**型定義 (`.d.ts`) 同梱**なので TypeScript ではそのまま補完が効きます（APIリファレンス → [tssgrid…/api](https://tssgrid.threestarsoftware.co.jp/api.html)）。

**Node / CommonJS**:

```js
const { TssGrid, HistoryManager } = require('@threestarsoftware/tssgrid');
```

（UMD。`<script>` 読み込みでは `window.TssGrid` / `window.HistoryManager`。CDN は `https://cdn.jsdelivr.net/npm/@threestarsoftware/tssgrid`。）

## フレームワークで使う（React / Vue / Angular）

専用ラッパーは**作りません**。vanilla on DOM なので CRA/Vite/Next/Webpack/Angular/Nuxt でそのまま動きます。コツは **マウント時に生成し、アンマウント時に `grid.destroy()`** するだけ（リスナ・ResizeObserver・DOM を後始末。idempotent）。

**React**:
```jsx
import { useEffect, useRef } from 'react';
import { TssGrid } from '@threestarsoftware/tssgrid';
import '@threestarsoftware/tssgrid/tssgrid.css';

function Grid({ columns, data }) {
  const ref = useRef(null);
  useEffect(() => {
    const grid = new TssGrid(ref.current, { columns, data });
    return () => grid.destroy();        // 後始末
  }, []);
  return <div ref={ref} />;
}
```

**Vue 3**:
```vue
<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { TssGrid } from '@threestarsoftware/tssgrid';
import '@threestarsoftware/tssgrid/tssgrid.css';
const el = ref(null); let grid;
onMounted(() => { grid = new TssGrid(el.value, { columns, data }); });
onBeforeUnmount(() => grid?.destroy());
</script>
<template><div ref="el"></div></template>
```

**Angular**:
```ts
import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { TssGrid } from '@threestarsoftware/tssgrid';

@Component({ selector: 'app-grid', template: '<div #host></div>' })
export class GridComponent implements AfterViewInit, OnDestroy {
  @ViewChild('host') host!: ElementRef;
  private grid!: TssGrid;
  ngAfterViewInit() { this.grid = new TssGrid(this.host.nativeElement, { columns, data }); }
  ngOnDestroy() { this.grid.destroy(); }
}
```

## 複数グリッドで Undo を共有

```js
const history = new HistoryManager();
new TssGrid(elA, { name: '甲', history, headers, data });
new TssGrid(elB, { name: '乙', history, headers, data });
// 甲乙どちらで編集しても、Ctrl+Z は「やった順の逆」で戻り、該当グリッドが自動でフォーカスされる。
// history.undo() / history.redo() を上位の Undo ボタンに繋げてもよい。
```

`history` を渡さなければグリッドが自前で `HistoryManager` を生成する（単体動作。コードは同じ）。

## データの持ち方（配列 / オブジェクト配列）

`data` は **2次元配列**（`string[][]`）でも **オブジェクト配列**（`object[]`）でも渡せます（**自動判別**）。列にキーを紐付けると、列名でアクセスできます。

```js
const grid = new TssGrid(el, {
  columns: [
    { data: '品番' },                    // ← columns[c].data で列にキーを紐付け
    { data: '品名' },
    { data: '数量', type: 'number', thousands: true },
  ],
  data: [
    { 品番: 'P-100', 品名: 'ボルト', 数量: '1200', id: 42 },  // ← オブジェクト配列で渡せる
    { 品番: 'P-101', 品名: 'ナット', 数量: '1200', id: 43 },
  ],
});

grid.getValue(0, '品番');     // → 'P-100'（列名 or 列index でアクセス）
grid.setValue(0, '数量', '5'); // → 列名で書き込み（Undo 可）
grid.getRow(0);               // → {品番:'P-100', 品名:'ボルト', 数量:'1200', id:42}（1行を横断）
grid.getColumn('品番');       // → ['P-100','P-101',...]（getRow の対。1列を縦断）
grid.getRows();               // → [{品番:'P-100', ...}, ...]（全行をオブジェクト配列で）
grid.getColumns();            // → {品番:['P-100',...], 品名:[...], 数量:[...]}（列ごとの値配列）

grid.toCSV();                 // → CSV文字列（RFC4180クォート / 既定は素の値・空行除外）
grid.downloadCSV('在庫.csv'); // → UTF-8 BOM付きで即ダウンロード（Excel日本語が文字化けしない）
// JSON出力は専用APIなし＝ JSON.stringify(grid.getRows()) で足ります（JSONは標準、CSVは非標準なので内蔵）
```

- **CSV出力**: `toCSV(opts)` / `downloadCSV(filename, opts)`。`opts`: `headers`(既定true) / `formatted`(既定false＝素の値で数値はそのまま, trueで表示形 `¥1,234`) / `skipEmpty`(既定true＝空行除外) / `eol`(既定 `'\r\n'`)。`"`/カンマ/改行を含むセルは自動でクォート。**CSV入力（読込）は非内蔵**＝Excelからの貼り付けで取り込めるため（パースが必要なら PapaParse 等を）。
- **Excel(xlsx)出力**: コア非搭載（zipバイナリで重いため）。`getRows()` + **ExcelJS**（MIT, CDN+SRI）でサンプル提供。数値を数値のまま・太字ヘッダ・`¥#,##0`書式・ヘッダ行固定まで付けられます → 動く例: [`examples/excel-export.html`](https://tssgrid.threestarsoftware.co.jp/examples/excel-export.html)。
- **Excel(xlsx)読込**: 同じく ExcelJS でサンプル提供。**データ（セルの値）のみ**取り込み（書式・数式は無視＝**数式は結果値**、日付は ISO）。1行目を見出し、2行目以降を `setData` に → 動く例: [`examples/excel-import.html`](https://tssgrid.threestarsoftware.co.jp/examples/excel-import.html)（外部ファイル不要の「生成→読込」round-trip 付き）。CSV と違い ExcelJS がパースを担うので自前実装は不要。
- **CSV読込**: コア非搭載（簡単な取り込みは Excel からの貼り付けで足りるため）。**PapaParse**（MIT, CDN+SRI）でサンプル提供。素朴な `split(',')` では壊れる**クォート内カンマ・改行・`""` エスケープ**（RFC4180）を正しく解き、**文字コード指定**（Excel の **Shift_JIS** な `.csv` も読める）・**大容量のストリーミング/Worker**まで対応。1行目を見出し、2行目以降を `setData` に → 動く例: [`examples/csv-import.html`](https://tssgrid.threestarsoftware.co.jp/examples/csv-import.html)（クォート/改行入りの「生成→読込」round-trip ＋ ファイル D&D・文字コード切替付き）。

- **保存値は常に文字列の2次元配列**を内部に持ち、描画・編集・コピペ・履歴はすべて従来どおり。オブジェクト配列は**入出力時の変換層**です（大きな作りは変えていません）。
- **`getData()`** は常に2次元配列を返す（後方互換）。**`getRows()`** はオブジェクト配列で返す。
- **画面に出さないフィールド**（上の `id` など）も `getRows()` で**保持**されます（元オブジェクトを内部に退避。編集・行挿入・削除をしても維持）。
- 見出し `headers` を省略すると、`columns[c].title`（あれば）→ `data` キー → `A,B,C…` の順で補完します。
- `getValue` / `setValue` の列指定は **数値index** でも **`data` キー文字列** でも可。`setData(rows)` も配列/オブジェクトを自動判別。
- 配列形式しか使わない場合は今までどおり。`getRows()` は `data` キーのある列だけを対象にします。
- **ネストパス対応**: `columns[c].data` は **`'name.last'` のようなドット区切り**も指定できます（Handsontable 互換）。

```js
new TssGrid(el, {
  columns: [{ data: 'age' }, { data: 'name.last' }, { data: 'name.first' }],
  data: [{ name: { first: '佐藤', last: '一郎' }, age: 25 }, /* … */ ],
});
grid.getValue(0, 'name.last');   // → '一郎'
grid.getRows()[0];               // → { name: { first:'佐藤', last:'一郎' }, age:'25' }（入れ子で復元、非バインドの入れ子フィールドも保持）
```

## 整列 / セル単位の読み取り専用（実行時）

```js
// 整列（range 省略時は現在の選択範囲）。'left'|'center'|'right'|'top'|'middle'|'bottom'|{h,v}|'reset'
grid.setAlignment('center');
grid.setAlignment('right', { r0: 0, c0: 2, r1: 5, c1: 2 });
grid.getAlignment(0, 2);            // → { h:'right', v:null }
new TssGrid(el, { columns: [{ align: 'center', valign: 'middle' }] });   // 列既定

// セル単位の読み取り専用（実行時トグル。列の readOnly とは別に効く）
grid.setCellReadOnly(true);                                   // 選択範囲を読取専用に
grid.setCellReadOnly(false, { r0: 1, c0: 1, r1: 1, c1: 1 });  // 解除
```

- 整列はセル上書き＞列既定（`columns[c].align`/`valign`）の順。数値列の既定右寄せも上書きできます。
- どちらも**列の挿入・削除でセルに自動追従**（Undo も整合）。`setData` で新データを入れるとクリアされます。
- `setAlignment`/`setCellReadOnly` 自体は Undo に積みません（書式・状態のため。`setColWidth` と同様）。

## 並べ替え（ソート）

コアにソートUIは持たせていません（業務フォーム志向）。**並べ替えは数行で外から**組めます。

```js
grid.sortBy('数量', 'asc');        // 列キー or index で並べ替え（数値っぽければ数値比較）
grid.sortBy(2, 'desc');
grid.sortRows((a, b) => a.qty - b.qty);   // 任意比較（行はオブジェクト/配列）
```
- `sortBy`/`sortRows` は**データ実体を並べ替え**ます。整列・セル readOnly・checkbox・隠しフィールド（`_src`）は**行ごと追従**します。**Undo には積みません**（書式系と同じ割り切り）。
- **未入力（空）行はソート対象外**＝元の順序のまま**最下部に固定**（`minSpareRows` の追加用行が上に来ない）。
- `clearSort()` で**初期状態（入力順）に戻せます**（`isSorted()` で判定）。行参照ベースなので**編集してもズレず**、ソート後に追加した行は末尾へ、削除済みは無視。

**ヘッダクリックで並べ替え（▲▼インジケータ付き）も外部で**組めます（→ 動く例: [`examples/sort.html`](https://tssgrid.threestarsoftware.co.jp/examples/sort.html)）:

```js
let sortCol = -1, dir = 'asc';
const base = ['品番', '数量', '単価'];
new TssGrid(el, {
  headers: base.slice(),
  onHeaderClick(c) {                                  // ヘッダクリックを横取り
    dir = (sortCol === c && dir === 'asc') ? 'desc' : 'asc'; sortCol = c;
    grid.headers = base.map((h, i) => i === c ? h + (dir === 'asc' ? ' ▲' : ' ▼') : h);  // ▲▼ は文字を足すだけ
    grid.sortBy(c, dir);
    return false;                                     // 既定の列選択は抑止
  },
});
```

### 行のドラッグ移動（rowReorder）

`rowReorder: true` で**行ヘッダ左に「つまみ」⠿**が出て、ドラッグで行を並べ替えられます（ドロップ位置に緑のガイド線）。データ実体ごと動くので**値・整列・readOnly・隠しフィールドも追従**、行番号は自動で振り直し（→ 動く例: [`examples/row-reorder.html`](https://tssgrid.threestarsoftware.co.jp/examples/row-reorder.html)）。**複数行**は行ヘッダで範囲選択（クリック→Shift＋クリック）してから選択内のつまみを掴めば**まとめて移動**します。

```js
new TssGrid(el, {
  rowReorder: true,                              // 行ヘッダにつまみを表示
  onAfterRowMove: (from, to, count) => { /* … */ },// 確定後（from=元の先頭, to=新しい先頭, count=行数）
});
grid.moveRow(from, to);                           // 1行（to は 0..ROWS の挿入境界）
grid.moveRows(r0, r1, to);                        // 連続する複数行をまとめて移動
```
- 行移動は**Undo/Redo 対応**（`Ctrl+Z`/`Ctrl+Y`。意図的な編集なので戻せる。※`sortBy` の並べ替えは履歴非対象でこちらと別）。
- `minSpareRows` と併用すると追加用の空行が末尾以外に動くことがあるので、入力途中の表では `rowReorder` を切るか並べ替え確定後に使うのが無難。

### 非破壊フィルタ（`filter` / `clearFilter`）

**コア内蔵**の非破壊フィルタ（行インデックスマッパ）。全行は内部の `_allRows`（マスタ）に保持したまま、**絞り込んだ可視部分集合だけを描画**します。要点は**絞り込み後の描画・ライブ検索が軽い**こと（自社調べ：10万行を保持して約200行に絞り込み → 初回描画 ≈ 0.5 秒、絞り込み済みのライブ検索 ≈ 数 ms）→ 動く例: [`examples/filter-live.html`](https://tssgrid.threestarsoftware.co.jp/examples/filter-live.html)。
なお**全件をそのままスクロール表示**したい大量行は、仮想スクロール `virtual: true` を使います（下記）。

```js
grid.filter(row => row[2] >= 100);     // 述語: (row, masterIndex, src) => bool
grid.filter({ 部署: '営業' });          // 簡易形: {列キー or 見出し名: 値|関数}（AND）
grid.clearFilter();                    // 解除＝全行へ（フィルタ中の編集も残る＝非破壊）
grid.isFiltered();                     // 真偽
grid.getAllRows();                     // マスタ全行（フィルタ中でも全件）
// onFilter: ({count, total, cleared}) => {...}
```
- **非破壊**: フィルタ中に編集した値も、**行参照の共有**でマスタへ自動反映。`clearFilter()` で全件＋編集が残る。`rowH`/整列/セル readOnly も非破壊に往復。
- **フィルタ中の行挿入/削除OK**（マスタへ追従＋**Undo対応**／同一フィルタ内）。**ソートはビュー内**で有効。
- **選択/ナビ/結合/幾何はビューのまま無改変**＝フィルタ未使用なら一切コスト無し。
- 制限（v1）: フィルタ中は **列の挿入削除・行移動・セル結合**はロック（解除してから）。`filter`/`clearFilter` は**Undo履歴をクリア**（ビューindex基準の履歴が境界を跨ぐと不整合になるため）。
- **フィルタUI**（ヘッダの絞り込み等）はコアに入れず**プラグイン** `tss-filter`（下記）で。素朴な `setData` 差し替え方式の旧サンプルは [`examples/filter.html`](https://tssgrid.threestarsoftware.co.jp/examples/filter.html)。

### 仮想スクロール（`virtual: true`）

大量行を**全件そのままスクロール表示**したい時に。全行は `data` に保持したまま、**画面に見える窓ぶん＋バッファだけを描画**します（固定行高ウィンドウイング）。全件を一度に DOM 化しないので**初期描画が一瞬・スクロールも軽い**。有効化は**オプション一行**だけ。

```js
new TssGrid(el, { virtual: true, data, /* … */ });
new TssGrid(el, { virtual: { buffer: 10 }, data });   // 窓の上下バッファ行数（既定6）
```
- **自社調べ**（headless Chrome / Win11）: 10 万行で**初回描画 ≈ 46 ms**（全件描画 ≈ 10.5 秒に対して）。スクロール 1 コマの窓差し替え ≈ 3 ms。動く例: [`examples/virtual.html`](https://tssgrid.threestarsoftware.co.jp/examples/virtual.html)。
- 制約（v1）: **行高一定**／**固定行列・折り返し・セル結合は非対応**（指定時は自動で無効化＋警告）。行番号の桁数が増える場合は `rowHeaderWidth` で行ヘッダ幅を広げられます。
- フィルタとの関係: `filter()` は「絞り込んだ部分集合だけ描く」軽さ、`virtual` は「絞らず全件をスクロールする」軽さ。用途で使い分け（v1 では併用は未対応）。

### 同梱プラグイン: ヘッダ オートフィルタ（filter UI）

`plugins/tss-filter.js`＋`.css`＝ 各見出しの**ロート（漏斗）アイコン**をクリックで**値チェックリスト＋検索**のポップアップ（Excel風。ソートの▲▼と区別できるアイコン）。複数列の条件は **AND**。中身は上の**コア `filter()` を呼ぶだけ**。動く例: [`examples/filter-ui.html`](https://tssgrid.threestarsoftware.co.jp/examples/filter-ui.html)。

```html
<link rel="stylesheet" href="plugins/tss-filter.css">
<script src="plugins/tss-filter.js"></script>
```
```js
plugins: [ TssFilter.plugin() ]                 // 全列にフィルタUI
plugins: [ TssFilter.plugin({ columns:['部署', 2] }) ]   // 対象列を限定
grid.getPlugin('filter').clearAll();            // 全条件クリア
```
- 値候補は**マスタ全行から集計**（絞り込み中でも全値が出る）。フィルタ済み列に印。値は HTML エスケープ。

### 同梱プラグイン: 共有マスタ（複数グリッドで1データ）

`plugins/tss-shared.js`＝ **1つのマスタ（同じ行データ）を複数グリッドで共有**。左右を**別フィルタ/別ソート**で表示でき、**片方の編集がもう片方の同じ行へ即反映**（行参照を共有）。A系/B系を並べて突き合わせ編集する用途。動く例: [`examples/shared-master.html`](https://tssgrid.threestarsoftware.co.jp/examples/shared-master.html)。

```html
<script src="plugins/tss-shared.js"></script>
```
```js
const shared = TssShared.create(masterRows, { headers:[...], columns:[...], rowHeaders:true });
const gridA = shared.attach(hostA, { plugins:[TssFilter.plugin()] });
const gridB = shared.attach(hostB, { plugins:[TssFilter.plugin()] });
gridA.filter({ 部署:'営業' });  gridB.filter({ 勤務地:'東京' });   // 各々別フィルタ
gridA.insertRow(0); gridA.deleteRows(2);   // 行の挿入/削除も両ビュー＆マスタへ伝播
shared.getMaster();                         // マスタ全行（getRows 形式）。 shared.detach(gridA);
```
- **値編集**は行参照共有で即反映。**行/列の挿入削除**も伝播（構造変更後は他ビューを master から再構成＝フィルタは再適用・そのビューのソートはリセット）。
- **配列データ／オブジェクト配列データ どちらも対応**（オブジェクト時は非表示フィールドも保持）。`minSpareRows:0` 推奨。
- 連携に [同期スクロール](#同梱プラグイン-同期スクロール左右2表を並べて比較) を足せば「並べて比較＋同時スクロール＋同時編集」に。

## ショートカット / プラグイン / 破棄

**カスタムショートカット**（軽量 shortcut-manager 相当。`context` は `'grid'`=ナビ / `'editor'`=編集中 / `'all'`）:

```js
new TssGrid(el, {
  shortcuts: [
    { keys: 'Ctrl+D', name: 'dup', context: 'grid', handler: (e, { grid }) => grid.insertRow(grid.active.r, 'below') },
    { keys: ['Ctrl+S', 'Ctrl+Shift+S'], handler: () => save() },   // 複数キー可
  ],
});
grid.addShortcut({ keys: 'Ctrl+K', handler: () => {} });   // 実行時に追加
grid.removeShortcut('dup');
```
- マッチすると既定動作を抑止します（`handler` が `true` を返すと既定も続行）。`cmd`/`meta` は `Ctrl` 扱い。
- 全キーをまとめて捌きたいなら **`onBeforeKeyDown(e)`**（`false` / `preventDefault()` でグリッド既定を止める）。

**プラグイン**（軽量 base-plugin 相当。`init(grid)→{destroy?}` の薄い契約）:

```js
const autoSavePlugin = (grid) => {
  const prev = grid.onAfterChange;
  grid.onAfterChange = (ch, src) => { prev && prev(ch, src); localStorage.setItem('grid', JSON.stringify(grid.getData())); };
  return { name: 'autosave', destroy() { grid.onAfterChange = prev; } };
};
new TssGrid(el, { plugins: [autoSavePlugin] });
grid.usePlugin(autoSavePlugin);                 // 実行時に追加
TssGrid.registerPlugin('autosave', autoSavePlugin);   // 名前登録 → plugins:['autosave'] で使える
```

**破棄**: SPA でグリッドを出し入れするときは **`grid.destroy()`** で document/window リスナ・ResizeObserver・プラグインを全解除し、DOM も除去します（**リーク防止**）。

## カスタムエディタ

組込エディタ（text/dropdown/checkbox/date/time/number）以外に、**独自の編集UI**を列に差せます。`columns[c].editor` に**薄いオブジェクト契約**を渡すだけ。

```js
const myEditor = {
  // 編集開始時に呼ばれる。UI を出して、確定で commit(値) / 取消で cancel() を呼ぶ。
  open({ grid, r, c, value, td, commit, cancel }) {
    const inp = document.createElement('input');
    inp.value = value;
    const box = td.getBoundingClientRect();
    Object.assign(inp.style, { position: 'fixed', left: box.left + 'px', top: box.top + 'px', width: box.width + 'px' });
    document.body.appendChild(inp); inp.focus();
    inp.onkeydown = e => { if (e.key === 'Enter') commit(inp.value); if (e.key === 'Escape') cancel(); };
    this._inp = inp;
  },
  close() { this._inp.remove(); },     // 任意。後片付け
};

new TssGrid(el, { columns: [{ editor: myEditor }] });
// editor は () => ({...}) のファクトリでも可（セルごとに生成したい時）
```

- `open` が受け取る `{ grid, r, c, value, td, commit, cancel }` だけ知っていれば作れます。F2 / ダブルクリック / 文字入力で開きます。
- **`commit(value)` は通常の確定経路（pushCmd）を通る**ので、`validator`/`parse`/`format`/読み取り専用がそのまま効き、**Undo にも積まれます**。
- 編集中に別セルをクリックすると `cancel()` 相当で閉じます。描画（セルの見た目）は従来どおり `format` 等で制御。

### 同梱プラグイン: 休日カレンダー対応の日付ピッカー

`plugins/tss-calendar.js`＝ ネイティブ `<input type=date>` では出来ない**会社の休日カレンダー（JSON）対応**の日付ピッカー。勤怠・シフト・予約などで効きます（動く例: [`examples/calendar.html`](https://tssgrid.threestarsoftware.co.jp/examples/calendar.html)）。

```html
<link rel="stylesheet" href="plugins/tss-calendar.css">
<script src="plugins/tss-calendar.js"></script>
```
```js
const cal = TssCalendar({
  holidays: { '2026-01-01': '元日', '2026-08-13': { name: '夏季休業', type: 'company' } },  // 日付→名称
  weekend: [0, 6],            // 既定。土日を色分け
  // min, max, disable:['holiday','weekend']（選択不可）, weekLabels, monthLabel …
});
new TssGrid(el, { columns: [{ type: 'date', editor: cal, format: 'yyyy/mm/dd' }] });
```
- セル右端に **📅** が出て**シングルクリックで開閉**（再クリックで閉じる＝トグル）、開いている間も**フィルハンドルで下へコピー可**（ドロップダウンと同じ操作感）。**年・月はプルダウン**で直接ジャンプ。祝日は赤＋**名称ツールチップ**、土日は色分け、キーボード操作（矢印/Enter/Esc/PageUp・Down）。保存値は ISO のまま。
- 見た目は CSS 変数（`--cal-accent` など）と `tss-cal-*` クラスで自由に（依存ゼロ）。グリッド外でも `cal.openAt(anchorEl, isoValue, onPick)` で単体利用可。
- `opts`: `icon`(既定 `'📅'`, `''` で消す) / `openOnClick`(既定 true) / `yearMin`・`yearMax`(年プルダウンの範囲) も。
- 仕組み: カスタムエディタが **`icon` / `openOnClick` を申告**すると、グリッドが右端アイコン表示＋シングルクリック起動を行います（自作エディタでも同様に使えます）。

### 同梱プラグイン: 時刻ピッカー（時/分プルダウン）

`plugins/tss-time.js`＝ 業務の時刻入力向けの**時/分プルダウン**ピッカー（クロックフェイスのようなリッチさは省き、任意時刻を素早く）。保存値は常に **24h `'HH:MM'`**（組込 `type:'time'` と互換）。動く例: [`examples/time.html`](https://tssgrid.threestarsoftware.co.jp/examples/time.html)。

```html
<link rel="stylesheet" href="plugins/tss-time.css">
<script src="plugins/tss-time.js"></script>
```
```js
const t = TssTime({ step: 15, hour12: false });   // 15分刻み / 24h
new TssGrid(el, { columns: [{ type: 'time', editor: t }] });
```
- `opts`: `step`(分刻み, 既定1) / `hour12`(AM/PM 表示, 既定false) / `icon`(既定 `'🕐'`) / `openOnClick`(既定true) / `className`。
- 🕐 を**シングルクリックで開閉**、**現在**/**決定**ボタン、キーボード（Enter 決定 / Esc 取消）、外側クリックで採用、フィルで下へコピー。見た目は `--time-*` 変数と `tss-time-*` クラスで自由に。

### 同梱プラグイン: 派生列（formula / computed column）

`plugins/tss-formula.js`＝「その行の値だけから計算する列」を `columns[c].formula` 関数で書けるようにする。金額＝数量×単価、税込＝金額×1.1 のような**派生列**を宣言的に。動く例: [`examples/formula.html`](https://tssgrid.threestarsoftware.co.jp/examples/formula.html)。

```html
<script src="plugins/tss-formula.js"></script>
```
```js
new TssGrid(el, {
  columns: [
    { data: 'quantity', type: 'number' },
    { data: 'price',    type: 'number' },
    { data: 'amount',  type: 'number', formula: (row) => row.quantity * row.price },          // ← 派生列
    { data: 'withTax', type: 'number', formula: (row) => Math.round(row.amount * 1.1) },       // ← 前の formula 結果も使える
  ],
  plugins: [TssFormula],   // これだけ。grid.usePlugin(TssFormula) / plugins:['formula'] でも可
});
```
- `formula` は**行スコープの純粋関数** `(row, {r,c,grid}) => value`（`row`=その行の `{dataキー:値}`）。文字列ではなく**関数**で渡す（`eval` 不要・CSP安全）。
- formula 列は**自動 readOnly** / **同じ行が変わると自動再計算**（編集・フィル・貼付・Undo/Redo すべて追従）/ 書き込みは履歴に積まない（派生値が独立 Undo 段にならない）/ **columns 定義順に評価**＝後ろの formula は前の結果を使える。
- 値は内部文字列なので算術は JS が数値強制（`'120' * '18' = 2160`）。`+` の連結を避けたいときは `Number(row.x)` を。
- **列方向の集計（縦の SUM・合計行）は formula の範囲外**＝下の `TssTotals` で。

### 同梱プラグイン: 列の集計（totals / 縦の SUM・平均…）

`plugins/tss-totals.js`＝ 列方向の集計（`sum`/`avg`/`count`/`min`/`max`/独自関数）を担う。**計算だけで描画はしない**＝結果を `onTotals` で受けて好きな場所へ（フッタ・ラベル・**別の TssGrid の合計表**でも）。`formula` と併用すると派生列の後に集計が連動。動く例: [`examples/formula.html`](https://tssgrid.threestarsoftware.co.jp/examples/formula.html)（明細＝formula／合計＝totals）。

```html
<script src="plugins/tss-totals.js"></script>
```
```js
new TssGrid(el, {
  columns: [ /* …amount 等… */ ],
  plugins: [ TssFormula, TssTotals({
    columns: { quantity: 'sum', amount: 'sum', price: 'avg' },   // dataキー → 集計種別
    skipEmpty: true,                                              // 全列空の行を除外（既定true）
    onTotals: (t) => { footerEl.textContent = '合計 ' + t.amount; },  // 再計算のたびに呼ばれる
  }) ],
});
// 取得は handle 経由でも: grid.getPlugin('totals').getTotals()  // → { quantity:…, amount:… }
```
- **コアに合計行を埋めない**理由＝置き場が `minSpareRows`/ソート/空行処理と衝突して肥大化するため。集計を外出しして「どこに出すかは自由」にした。
- formula と併用時は **`plugins: [TssFormula, TssTotals(...)]` の順**（合計を派生列の結果の後に計算するため）。`sum`/`avg`/`min`/`max` は数値セルのみ・`count` は非空セル数。

### 同梱プラグイン: 条件付き合計（tss-sum / ラベル付き合計行・整列表示）

`plugins/tss-sum.js`＝ **ラベル付きの"合計行"**（小計・消費税10%・消費税8%・合計 など）を、**条件(`when`)＋対象(`of`)を宣言**で定義して作る。`tss-totals` が「列ごと1値」なのに対し、こちらは**同じ列を条件別に何本でも集計**でき（消費税10%と8%は両方 amount 由来＝per-column では衝突する）、**ソースと同一列構成の readonly 集計グリッドを生成**するので**金額が縦にピッタリ揃う**（画面でも印刷でも）。請求書・見積などの合計欄に。動く例: [`examples/invoice.html`](https://tssgrid.threestarsoftware.co.jp/examples/invoice.html)（インボイス請求書の合計欄）。

```html
<script src="plugins/tss-merge.js"></script>  <!-- ラベルの横結合に利用 -->
<script src="plugins/tss-sum.js"></script>
```
```js
const sum = TssSum.attach(grid, document.getElementById('sumgrid'), {
  format: v => '¥' + Number(v).toLocaleString('ja-JP'),
  rows: [
    { label: '小計（税抜）',  of: r => (+r[2]||0)*(+r[3]||0) },                                  // 全データ行の合計
    { label: '消費税（10%）', when: r => r[4]==='10%', of: r => Math.round((+r[2]||0)*(+r[3]||0)*0.10) }, // 条件付き
    { label: '消費税（8%）',  when: r => r[4]==='8%',  of: r => Math.round((+r[2]||0)*(+r[3]||0)*0.08) },
    { label: '合計（税込）',  total: v => v[0]+v[1]+v[2] },                                      // 既出行から派生
  ],
  onCompute: vals => { /* 上部の総額表示など */ },
});
// sum.refresh() 手動再計算 / sum.detach() フック解除＋集計グリッド破棄
```
- 行は **`{label, when?, of}`**（`when` 一致行で `of(row)` を合計＝SUMIF）または **`{label, total}`**（既出行の値から派生）。`row` は内部配列（列index）で受ける。
- ソースの **`onAfterChange`/`onStructureChange` を自動で包んで再計算**＝編集・行追加削除・Undo すべてに追従。集計グリッドは**表示専用**（同一列幅で `金額` 列が揃う）。

### 同梱プラグイン: 残高／累計（running total・縦の連鎖）

`plugins/tss-running.js`＝「**前の行の結果 ＋ この行の増減**」で縦に積む列。`formula`（行内）でも `totals`（全体合計）でも出せない**縦方向の連鎖**を担う。出納帳/通帳の**残高**、在庫受払の**在庫数**、経費・ポイントの**累計**など。動く例: [`examples/running.html`](https://tssgrid.threestarsoftware.co.jp/examples/running.html)（現金出納帳＝入金・出金→残高）。

```html
<script src="plugins/tss-running.js"></script>
```
```js
new TssGrid(el, {
  columns: [ /* …deposit, withdraw, balance… */ ],
  plugins: [ TssRunningTotal({
    column: 'balance', initial: 10000,                                       // 残高列（自動readOnly）／前残
    step: (prev, row) => prev + Number(row.deposit||0) - Number(row.withdraw||0),
  }) ],
  // 単純累計なら step の代わりに delta: 'amount'（running += Number(row.amount)）
});
```
- 編集・行の挿入/削除・`setData`（＋それらの Undo/Redo）で**上から全部引き直し**。書き込みは履歴に積まない。
- `column`(残高列) / `initial`(前残) / `delta` か `step` / `skipEmpty`(全列空の行は連鎖を進めず空表示、既定true)。
- **行ドラッグ移動(rowReorder)併用時**は順序が変わるので `onAfterRowMove` で `handle.recompute()` を呼ぶ。

> 「**行＝formula／列＝totals／縦＝running**」の3点が揃う。いずれも `setValueRaw`＋`onAfterChange` ラップで動く**プラグイン**。

### 同梱プラグイン: 氏名→フリガナ 自動入力（furigana・辞書不要）

`plugins/tss-furigana.js`（**辞書不要**）＝ 漢字を入力（IME変換）すると**読みが別列に自動で入る**（スマホ連絡先の よみがな 自動入力と同じ）。辞書引きではなく、**IME変換の composition イベントから「変換前のかな」を拾う**方式。TssGrid は**アクティブセルに本物の `<input>` を重ねる**設計なので composition が確実に取れる＝「**IMEに強い**」を機能で体現。動く例: [`examples/furigana.html`](https://tssgrid.threestarsoftware.co.jp/examples/furigana.html)。

```html
<script src="plugins/tss-furigana.js"></script>
```
```js
new TssGrid(el, {
  columns: [ { data: 'name', title: '氏名' }, { data: 'kana', title: 'フリガナ' }, /* … */ ],
  plugins: [ TssFurigana({ source: 'name', target: 'kana', katakana: true }) ],
  // 複数ペアは pairs: [{source,target}, …] / ひらがな出力は katakana:false
});
```
- `source`(漢字を入れる列) → `target`(読みを入れる列)。`target` は **readOnly にしない**＝**手修正できる**。
- **正直な限界**: 手入力（IME変換）した時だけ取れる。**貼り付け・既存の漢字からは取れない**（辞書を持たないため）。「自動入力＋手直し」が現実解。

### 同梱プラグイン: セル内ミニ計算式（calc・=12*3）

`plugins/tss-calc.js`（**eval/Function 不使用**）＝ セルに `=12*3+5` と打つと確定時に **41** に。四則 `+ - * /`・括弧・小数対応の**自前再帰下降パーサ**（CSP安全）。`columns[c].parse`（入力変換）seam に乗るだけ。動く例: [`examples/calc.html`](https://tssgrid.threestarsoftware.co.jp/examples/calc.html)。

```html
<script src="plugins/tss-calc.js"></script>
```
```js
// (a) 列の parse に直接（一番素直）
columns: [ { data: 'amount', type: 'number', parse: TssCalc() } ]
// (b) プラグインで対象列にまとめて注入（既存 parse があれば合成）
plugins: [ TssCalc.plugin({ columns: ['quantity', 'price'] }) ]   // columns 省略で number 列すべて
```
- `=` 始まりは強制評価、`=` 無しの素の式（`120*1.1`）も計算（`bare:false` で無効化）。**ただの数値・文字は素通り**。構文エラー/0除算は入力を残す（validator が弾く）。
- `prefix`(既定 `'='`) / `bare`(既定 true) / `decimals`(結果の小数桁)。`formula` と併用すると「式で入力→派生列が再計算」も連動。

### 同梱プラグイン: オートコンプリート（autocomplete エディタ）

`plugins/tss-autocomplete.js`＝ 自由入力＋**候補の絞り込み**。固定 dropdown の上位版で「だいたい決まってるが新規もある」項目（取引先・商品名）向け。**IME変換中の Enter は奪わない**（変換確定が最優先）。動く例: [`examples/autocomplete.html`](https://tssgrid.threestarsoftware.co.jp/examples/autocomplete.html)。

```html
<link rel="stylesheet" href="plugins/tss-autocomplete.css">
<script src="plugins/tss-autocomplete.js"></script>
```
```js
columns: [
  { data: 'client', editor: TssAutocomplete({ source: ['三星商事','三星製作所', …] }) },          // 自由入力可
  { data: 'pay',    editor: TssAutocomplete({ source: ['現金','振込', …], strict: true }) },        // 候補のみ
];
// 動的候補: source: (query, {row,r,c,grid}) => string[]
```
- ↑↓で候補移動・Enter確定・Esc取消・クリック選択。`source`(配列 or 関数) / `strict`(候補のみ) / `minChars` / `max` / `match`(`includes`/`startsWith`/関数) / `openOnClick`。
- カスタムエディタ契約（`editor.open/close`）に乗るだけ。見た目は `tss-ac-*` クラスと `--ac-*` 変数で。

### 同梱プラグイン: セル内スパークライン（sparkline・ミニグラフ）

`plugins/tss-sparkline.js`（**SVG自前描画**）＝ セルの数列を**ミニ折れ線/棒**で描く。`columns[c].html:true` ＋ `format`（format が返す SVG がセルに入る）seam に乗るだけ。Chart.js 等は積まない。動く例: [`examples/sparkline.html`](https://tssgrid.threestarsoftware.co.jp/examples/sparkline.html)（月次売上→動向グラフ・編集でライブ更新）。

```html
<script src="plugins/tss-sparkline.js"></script>
```
```js
// 値 "12,15,9,20,18"（カンマ/空白区切り）→ ミニ折れ線
{ data:'trend', title:'動向', html:true, readOnly:true, format: TssSparkline({ width:96, height:24, fill:'rgba(13,148,136,.12)' }) }

// formula で月次列から数列を組み立てると、月を編集→グラフがライブ更新
{ data:'trend', html:true, readOnly:true, format: TssSparkline(),
  formula: (row) => ['m4','m5','m6','m7','m8','m9'].map(k=>row[k]).filter(v=>v!=='').join(',') }
```
- `type`('line'/'bar') / `width` / `height` / `color` / `strokeWidth` / `fill`(折れ線下の塗り) / `min`・`max`(既定は自動)。
- 数値しか SVG に入れない＝安全。`formula`/`html-cells` と同じ仕組みで、**有料グリッドの "セル内グラフ" を無料で**。

### 同梱プラグイン: セル内 横棒グラフ（bar・データバー）

`plugins/tss-bar.js`＝ セルの数値を**横棒**で描く（認知率・進捗%・スコア）。`html:true`＋`format` seam。`type:'number'` 併用で**バーのまま編集**（値を打つと伸びる）。動く例: [`examples/bar.html`](https://tssgrid.threestarsoftware.co.jp/examples/bar.html)。

```html
<script src="plugins/tss-bar.js"></script>
```
```js
// 表示専用
{ data:'rate', title:'認知率', html:true, readOnly:true, format: TssBar({ max:100, suffix:'%', decimals:1 }) }
// バーのまま編集（値を打つと伸びる）＋ 閾値で色分け
{ data:'rate', type:'number', html:true, format: TssBar({ max:100, suffix:'%', color: v => v < 40 ? '#dc2626' : '#0d9488' }) }
```
- `min`/`max`(既定0/100) / `color`(文字列 or `(value)=>色`＝閾値色分け) / `track` / `height` / `radius` / `showValue` / `decimals` / `suffix` / `labelWidth`。

### 同梱プラグイン: ヒートマップ / 背景データバー（cellStyle）

`plugins/tss-heatmap.js`＝ コアの `cellStyle` フックに乗せる**連続色（ヒートマップ）**と**背景データバー**。`tss-bar.js`（前景の棒＋ラベル）と違い、**セル背景**を塗る＝**数値はそのまま見せて編集できる**。動く例: [`examples/heatmap.html`](https://tssgrid.threestarsoftware.co.jp/examples/heatmap.html)。

```html
<script src="plugins/tss-heatmap.js"></script>
```
```js
// ヒートマップ: 低→高で背景連続色。文字色は自動コントラスト。
{ data:'sales', type:'number', cellStyle: TssHeatmap({ min:100000, max:400000, colors:['#f8b4b4','#fff','#93c5fd'] }) }
// 背景データバー: 数値はそのまま・背景に棒（編集可）
{ data:'rate', type:'number', cellStyle: TssDataBar({ min:0, max:100, color:'rgba(13,148,136,.22)' }) }
```
- `TssHeatmap`: `min`/`max`（明示。セル単位呼び出しで列範囲を知らないため）/ `colors`(2色以上のストップ) or `low`/`high` / `text`(自動文字色, 既定on)。
- `TssDataBar`: `min`/`max` / `color` / `align`('left'/'right')。編集で即更新。

> 「セル内グラフ」3点: **前景の折れ線/棒＝`html:true`+`format`（tss-sparkline / tss-bar）**、**背景の連続色/バー＝`cellStyle`（tss-heatmap）**。どれもノービルド。

### グラフ連携（Chart.js などと）— 編集でライブ更新

セル内グラフより大きく見せたいときは、**外部チャートライブラリ（MIT）と連携**。データの持ち主はグリッド、グラフはその"ビュー"です。連携は `onAfterChange` で `grid.getRows()` → `chart.data` → `chart.update()` するだけ。コアには積まず **CDN+SRI のサンプル**として提供（excel-export と同じ位置づけ）。動く例: [`examples/chart-chartjs.html`](https://tssgrid.threestarsoftware.co.jp/examples/chart-chartjs.html)（Chart.js・MIT・編集で折れ線/棒がリアルタイム更新）。

```js
const chart = new Chart(ctx, { type:'line', data: toChartData(grid) });
new TssGrid(el, { columns, data, onAfterChange: () => { chart.data = toChartData(grid); chart.update(); } });
```
- **おすすめ（いずれも `<script>`/CDN で no-build）**: **Chart.js**（MIT・定番・バランス◎）/ **ApexCharts**（MIT・モダンで映え）/ **Apache ECharts**（Apache-2.0・多機能）/ **uPlot**（MIT・超軽量）。Highcharts/AG Charts は商用有料なので MIT 方針なら避ける。

### 同梱プラグイン: 2択トグル（toggle・有効｜無効）

`plugins/tss-toggle.js`＋`.css`＝ ラジオの2択を**並んだセグメント（有効｜無効）**で表示、クリックで切替。チェックボックスより**2ラベルが見える**。値は dropdown 同様 **value を保存**。動く例: [`examples/toggle.html`](https://tssgrid.threestarsoftware.co.jp/examples/toggle.html)。

```html
<link rel="stylesheet" href="plugins/tss-toggle.css">
<script src="plugins/tss-toggle.js"></script>
```
```js
plugins: [ TssToggle.plugin({ columns: {
  status: ['有効', '無効'],                                      // 文字列2つ（value=label）
  pub:    [{ value:'1', label:'公開' }, { value:'0', label:'非公開' }],  // value/label 分離
} }) ]
```
- クリックでその側に確定（`setValue`＝**検証・Undo を通る**）。アクティブセルで **Space** で反対側へトグル。2値以外の打ち込みは自動 validator で拒否。
- 単純な ON/OFF 1個なら組込 `type:'checkbox'`、3択以上は `type:'dropdown'`。見た目は `--tg-toggle-accent` 等で。

### 同梱プラグイン: セル結合（merge・横/縦/矩形）

`plugins/tss-merge.js`＝ データセルの**矩形結合**（`colspan`×`rowspan`）。左上の**アンカーが値・編集・選択の対象**で、覆われた従属セルは**描画スキップ＋読み取り専用**（貼り付け・フィルは弾く）。動く例: [`examples/merge.html`](https://tssgrid.threestarsoftware.co.jp/examples/merge.html)。（見出しの結合は `nestedHeaders` を参照）

```html
<script src="plugins/tss-merge.js"></script>
```
```js
plugins: [ TssMerge.plugin({ merges: [
  { r:0, c:0, colspan:1, rowspan:2 },   // 縦結合（2行）
  { r:0, c:2, colspan:2 },              // 横結合（rowspan 省略=1）
] }) ]
```
| API | 説明 |
|---|---|
| `grid.setMerge(r, c, colspan, rowspan?)` | (r,c) を起点に結合。`rowspan` 省略=横結合。従属セルの値はクリア（Excel流）。成功で `true`、範囲外/1×1/既存結合と重なれば `false` |
| `grid.mergeSelection()` | 選択中の矩形を結合 |
| `grid.removeMerge(r, c)` | (r,c) を含む結合を解除 |
| `grid.getMerges()` | `[{r,c,colspan,rowspan}, …]` |
| `grid.destroyMerged()` | 全結合を解除 |

- **Undo 対応**: `setMerge`/`removeMerge`/`mergeSelection`/`destroyMerged` は履歴に積み、結合時にクリアした値も復元（初期 `merges` は設定扱いで非対象）。
- **行/列の挿入削除**で結合座標が縦横対称に追従（拡張・縮小・解除、Undo 対応）。
- **割り切り**: ソートは結合中ロック。行移動は**横結合のみ可**（行と一緒に移動）、**縦結合がある間はロック**（行順を崩すと縦結合が分断＝auto-split を避ける）。
- 既知の限界: frozen 境界をまたぐ結合は想定外。結合範囲のコピーは従属位置が空セル。

### 同梱プラグイン: 同期スクロール（syncscroll・左右2表を並べて比較）

`plugins/tss-syncscroll.js`＝ 並べた複数グリッドのスクロールを連動（Excel「並べて比較＋同時にスクロール」相当）。A系/B系で別々に絞り込んだ表を**突き合わせながら編集**する用途に。動く例: [`examples/sync-scroll.html`](https://tssgrid.threestarsoftware.co.jp/examples/sync-scroll.html)。

```html
<script src="plugins/tss-syncscroll.js"></script>
```
```js
const link = TssSyncScroll.link([gridA, gridB]);                 // 既定: 相対・縦横ピクセル
const link = TssSyncScroll.link([gA, gB], { by: 'row' });        // 行で揃える（行高が違っても対応行が並ぶ）
const link = TssSyncScroll.link([gA, gB], { relative: false });  // 絶対（スナップして一致）
link.unlink();                                                   // 連動解除
```
- **`relative: true`（既定・Excel流）**＝ ON した時点の**位置差を保ったまま移動量(delta)だけ連動**。連動OFF→片方スクロール→ON でも“その場から”続けて同期できる。`false` で絶対スナップ。
- **`by`**: `'pixel'`(既定・スクロール量) / `'row'`（コアの実測行高キャッシュ `_rowTops` で行を揃える＝**左右で行高が違っても**対応行が並ぶ）。
- **`axis`**: `'both'`(既定) / `'vertical'` / `'horizontal'`。`link()` は `{ unlink, rebase, grids }` を返す（`rebase()`＝相対モードで“今の差”を基準化）。

## 実例: 在庫管理ミニアプリ（機能てんこ盛り）

TssGrid 1本（＋カレンダープラグイン）で組んだ**業務画面のショーケース** → 動く例: [`examples/inventory.html`](https://tssgrid.threestarsoftware.co.jp/examples/inventory.html)。項目を差し替えれば**勤怠・発注・工程**などにも転用できます。

入っている機能: ドロップダウン / 数値書式 / **計算列**（金額＝数量×単価, 読み取り専用）/ チェックボックス＋ヘッダ全選択 / 休日カレンダー / 入力検証 / ヘッダクリックで並べ替え / 右クリックで行挿入削除・全チェック / 末尾に常に空行 / Excel相互コピペ・Undo / `getRows()` で保存 / **CSV出力**（BOM付）。

**計算列**は、読み取り専用セルへ `setValue(r, c, val, /*force*/ true)` で書き込みます（プログラムからの確定的な書き込みは readOnly を貫通＝ユーザー編集だけ保護）。

```js
onAfterChange: (changes) => {
  for (const ch of changes) if (ch.c === 数量 || ch.c === 単価) {
    const amt = String((+grid.getValue(ch.r, 数量) || 0) * (+grid.getValue(ch.r, 単価) || 0));
    grid.setValueRaw(ch.r, 金額, amt);   // ★ 計算列は setValueRaw（履歴に積まない派生値・readOnly貫通）
  }
}
```
> **計算列は `setValueRaw` で書く**のが正解です。`setValueRaw(r,c,val)` は**履歴に積まず・検証も通さず**値を直接セット（readOnly も貫通、表示書式は描画時に適用）。これにより計算結果は**独立した undo ステップにならず**、`undo`/`redo` では入力セルが履歴復元→`onAfterChange` で**自動的に再計算されて追従**します（入力1つ＝undo1回・計算列は勝手に付いてくる）。
> ※ 逆に `setValue(...,true)`（履歴あり）で計算列を書くと、計算結果が別の undo ステップになり、undo/redo 中の再計算が redo スタックを壊します。派生値は必ず `setValueRaw`。

## 実例: 方眼ガント（予定/実績・遅延管理）

専用ライブラリを積まず、**コアだけ**で組んだ**方眼ガント＋遅延管理**ツール → 動く例: [`examples/gantt.html`](https://tssgrid.threestarsoftware.co.jp/examples/gantt.html)。依存ゼロ。

入っている表現: **予定／実績の2段バー**（実績が予定より延びると**遅延を赤**で）/ **状態列**（完了・進行中・遅延・未着手）/ **期間＆「今日」線** / **進捗データバー**（`cellStyle` だけで描画）/ **曜日＋土日色**（`nestedHeaders` のリーフに改行を入れ `buildTable` ラップで色分け）。日付は手入力可（`format`＋`parse`＋`invalidMode:'keep'` で不正日を赤検証）。

> 「ガントの“升目”はグリッドそのもの」という割り切りで、専用コンポーネントなしに**スケジュール表をそのまま画面化**できます。バーをドラッグして日付を動かす版は将来候補（コアは無改変のまま外側で組める）。

## テーマ / 見た目のカスタマイズ

主要な色・サイズは **CSS 変数**にしてあり、業務側で**数個上書きするだけ**で統一感を出せます（フルのテーマエンジンは持たない軽量方針）。

```css
.tssgrid { --tg-accent: #c0392b; --tg-header-bg: #f3eaea; --tg-font-size: 14px; }  /* 全グリッド */
.myapp .tssgrid { --tg-edit-accent: #7b61ff; }                                      /* 特定業務だけ */
```
主な変数: `--tg-accent`(選択枠/フィル) / `--tg-edit-accent`(編集枠) / `--tg-border` / `--tg-wrap-border` / `--tg-header-bg`(ヘッダ背景の既定) / `--tg-colheader-bg`(列ヘッダ背景) / `--tg-rowhead-bg`(行番号列背景) / `--tg-header-fg`(列ヘッダ文字)・`--tg-rowhead-fg`(行番号文字) / `--tg-cell-bg` / `--tg-sel-bg`(選択背景) / `--tg-selhdr-bg`(選択中ヘッダ) / `--tg-readonly-bg`・`--tg-readonly-fg` / `--tg-placeholder-fg` / `--tg-invalid-fg`・`--tg-invalid-bg` / `--tg-box-color`・`--tg-box-width`(セル囲み) / `--tg-font-size` / `--tg-radius`。さらに細かくは従来どおり `.tssgrid .tg-xxx { … }` で上書きできます（全 CSS は `.tssgrid` 配下に scope 済み）。

- **ヘッダ色**: `--tg-header-bg` で列ヘッダ＋行番号列をまとめて、または `--tg-colheader-bg`／`--tg-rowhead-bg` で**別々に**（未指定なら `--tg-header-bg` を継ぐので後方互換）。選択中の列/行ヘッダは `--tg-selhdr-bg` が出るので、濃色テーマではこれも合わせると統一感が出ます。

**罫線まわり**: 色はセル全体なら `--tg-border`、セル単位なら `cellClass` で `border-right/bottom-color` を指定（各セルは右・下の罫線を持つ設計）。**任意の1セルを四角く囲む**なら border ではなく**同梱の `.tg-box` クラス**を `cellClass` で付与（`box-shadow: inset` ベースなので **A1・1行目・1列目・端セルでも全4辺を囲め、レイアウトも動きません**）。色/太さは `--tg-box-color`・`--tg-box-width`、用途別は `.tssgrid td.tg-box-warn{ --tg-box-color:#e67e22 }` のように。

```js
cellClass: (r, c, value, row) => isAlert(r, c) ? 'tg-box tg-box-warn' : ''   // 該当セルを橙枠で強調
```

## 列の表示/非表示

列を**プログラムから**隠せます（メニュー項目は付きません。`hiddenColumns` で初期指定も可）。

```js
grid.hideColumn(1);          // 列1を隠す
grid.showColumn(1);          // 再表示
grid.toggleColumn(1);        // 切替
grid.isColumnHidden(1);      // → true/false
grid.getHiddenColumns();     // → [1, 3]
new TssGrid(el, { hiddenColumns: [1] });   // 初期で隠す
```

- 隠し列は**畳まれ**（幅0）、**カーソル移動は隣の可視列へスキップ**、幅計算・固定列オフセットからも除外されます。
- **コピーは隠し列を除外**し、**貼り付けは可視列へ**流し込みます（見たままをコピペ）。
- **データは消えません**（表示だけ。`getData()`/`getRows()` には隠し列の値も入ります）。
- 最低1列は残ります（全列は隠せません）。列の挿入・削除をしても隠し状態のインデックスは自動で追従します。

## API

### `new TssGrid(container, options)`

| option | 型 | 既定 | 説明 |
|---|---|---|---|
| `headers` | `string[]` | `['A','B','C']` | 列見出し |
| `data` | `string[][]` | — | 初期データ（行 × 列） |
| `history` | `HistoryManager` | 自前生成 | 渡すと Undo を共有 |
| `name` | `string` | `'grid'` | 履歴ラベル / 識別 |
| `showDump` | `boolean` | `false` | データ確認用の表示 |
| `enterMoves` | `'down'\|'up'\|'right'\|'left'\|'none'` | `'down'` | Enter 確定後の移動方向 |
| `tabMoves` | `'down'\|'up'\|'right'\|'left'\|'none'` | `'right'` | Tab 確定後の移動方向 |
| `initialCell` | `[r,c]` or `{r,c}` | `[0,0]` | 初期カーソル位置。`c` は index か `data` キー（例 `{r:0, c:'start_hours'}`） |
| `nextCell` | `({r,c,key,shift})=>{r,c}\|null` | — | **入力フロー制御**: Enter/Tab の移動先を上書き（`null` で既定方向）。**入力セルだけを論理順で巡回**でき、readonly 列を飛ばせる（業務フォーム向け）|
| `columns` | `ColumnDef[]` | `[]` | 列ごとのセルタイプ / バリデータ（下記） |
| `invalidMode` | `'revert'\|'keep'` | `'revert'` | 検証 NG 時。`revert`=元の値に戻す / `keep`=入力値を残してセルを赤く警告 |
| `invalidTitle` | `boolean` | `true` | `keep` 時、赤セルに validator メッセージを `title=`（ホバーで理由）。`false` でOFF。全件は `getInvalidCells()` |
| `messages` | `{code:…}\|fn` | — | エラーの**共通メッセージカタログ**。`validator` が `{code,params,level}` を返すと本文を解決（`{label}`/`{value}`/params 差込）。本文を外部JSON/CSV/XMLで一元管理 |
| `pasteOverflow` | `'clip'\|'error'` | `'clip'` | 貼り付けがグリッド外に超過した時。`clip`=はみ出し分を切り捨て / `error`=貼り付け中止 |
| `colWidths` / `rowHeights` | `number[]` \| `{[key]:number}` | `[]` | 列幅 / 行高の初期値(px)。未指定の要素は既定値。`colWidths` は**配列（位置指定）でも、`{ dataキー: px }` のオブジェクト（列ID指定）でも可**＝後者は列を入れ替えても幅が追従する。列定義側に `columns[c].width` で同居指定も可（並べ替え・コピペで幅が一緒に動く＝最も壊れにくい）。優先度: 実行時リサイズ/明示 `colWidths` > `columns[c].width` > 既定 |
| `defaultColWidth` / `defaultRowHeight` | `number` | `120` / `28` | 既定の列幅 / 行高(px) |
| `minColWidth` / `minRowHeight` | `number` | `30` / `18` | リサイズの下限(px) |
| `resizeMode` | `'preview'\|'live'` | `'preview'` | リサイズの見せ方。`preview`=Excel風に線で予告→離して確定 / `live`=即時反映 |
| `frozenCols` | `number` | `0` | 左から固定する列数（横スクロールしても残る）。`freezeCols(n)` で実行時変更も可 |
| `frozenRows` | `number` | `0` | 上から固定する行数（縦スクロールしても残る）。`freezeRows(n)` で実行時変更も可。`frozenCols` 併用で**四隅固定** → 動く例: [`examples/frozen-rows.html`](https://tssgrid.threestarsoftware.co.jp/examples/frozen-rows.html) |
| `nestedHeaders` | `array[]` | — | **ヘッダ結合**（複数段見出し）。各段は配列で要素は文字列 or `{label,colspan}`。最下段が**リーフ＝実列**（並べ替え・全選択チェック等は機能）。上段グループのクリックで範囲列を選択 → 動く例: [`examples/nested-headers.html`](https://tssgrid.threestarsoftware.co.jp/examples/nested-headers.html) |
| `width` / `height` | `number\|string` | — | 枠(wrap)の幅/高さ。**指定するとテーブル自身に横/縦スクロールバーが出る**（未指定だと枠が内容幅まで広がりページ側がスクロール）。固定行/列・縦横スクロールを使うなら指定推奨 |
| `resizeCols` / `resizeRows` | `boolean` | `true` | 列幅/行高のリサイズ可否（全体）。`false` でグリップを出さない |
| `cursor` | `boolean` | `true` | 選択カーソル（青の選択枠/範囲/セルハイライト/フィルハンドル）を表示するか。`false` で**表示専用グリッド向けに非表示**＋セルカーソルも既定に（内部の選択は保持＝コピーは可）。合計表・サマリ等に |
| `columns[c].width` | `number` | — | 列ごとの初期幅(px)。**列定義に同居するので並べ替え・コピペで幅が一緒に動く**（`colWidths` より壊れにくい）。実行時リサイズ・明示 `colWidths` があればそちらが優先 |
| `columns[c].resizable` | `boolean` | `true` | 列ごとの幅ロック。`false` でその列だけリサイズ禁止 |
| `stretchH` | `'none'\|'last'\|'all'` | `'none'` | 列を枠幅まで伸ばす。`'last'`=余りを最終列へ / `'all'`=全列で配分（`width` 指定時に効く） |
| `rowHeaders` / `colHeaders` | `boolean` | `true` | 行番号列 / ヘッダ行の表示。`false` で隠す |
| `hiddenColumns` | `number[]` | `[]` | 初期で隠す列インデックス。実行時は `hideColumn`/`showColumn`/`toggleColumn`（→ [列の表示/非表示](#列の表示非表示)） |
| `wordWrap` | `boolean` | `false` | セル内で折り返し（行高は内容に合わせ伸びる）。`columns[c].wordWrap` で列単位も可 |
| `placeholder` | `string` | — | 空セルに薄いヒント文字（`getData` には入らない）。`columns[c].placeholder` で列単位も可 |
| `className` | `string` | — | コンテナ(`.tssgrid`)に付ける任意クラス（テーマ付け） |
| `fillHandle` | `boolean \| {direction,autoInsertRow}` | `true` | **`false`でフィル完全OFF**（ハンドルを出さない＝ドラッグでの消去/上書きなし。フィルの起点はハンドルのみなので fill 自体が無効に）。`{direction:'vertical'\|'horizontal'\|'both', autoInsertRow:true}`で詳細指定（下へドラッグで行追加）。設定/表示専用グリッドで誤フィルを防ぐのに有効 |
| `onBeforeAutofill` / `onAfterAutofill` | `(src,target)=>…` | — | フィル前後。before は `false` で取消。`src`/`target` = `{r0,c0,r1,c1}` |
| `autoColumnSize` | `boolean \| number` | `false` | 初期化時に列幅を内容に合わせて自動調整（数値=上限px）。`autoSizeColumn`/`autoSizeAllColumns` API・列境界ダブルクリックでも |
| `columns[c].align` / `valign` | `string` | — | 列既定の整列（→ [整列](#整列--セル単位の読み取り専用実行時)） |
| `columns[c].editor` | `object \| ()=>object` | — | カスタム編集UI（→ [カスタムエディタ](#カスタムエディタ)） |
| `copyPaste` | `boolean` | `true` | `false` でコピー/カット/ペーストを無効化 |
| `minSpareRows` | `number` | `0` | 末尾に常に確保する空行数（Excel風に下へ打ち足せる） |
| `autoWrapRow` / `autoWrapCol` | `boolean` | `false` | Tab で行末→次行頭 / Enter で列末→次列頭に折り返し |
| `minRows` / `maxRows` | `number` | — | 行数の下限/上限（min は初期パディング、削除の床。max は挿入の天井） |
| `minCols` / `maxCols` | `number` | — | 列数の下限/上限 |
| `readOnly` | `boolean` | `false` | **グリッド全体**を読み取り専用に（ビューア用途） |
| `columns[c].readOnly` | `boolean \| (value,{r,c})=>boolean` | — | **列単位**の読み取り専用。関数を渡すとセル単位で判定（→ [読み取り専用](#読み取り専用readonly)） |
| `onChange` | `(grid)=>void` | — | データ変更時に呼ばれる（後方互換） |
| `onInvalid` | `(rejections, source)=>void` | — | 列ルールで弾かれた時。`rejections = [{ r, c, value, message }]` |
| `onReadOnly` | `(blocked, source)=>void` | — | 読み取り専用セルへの変更を弾いた時。`blocked = [{ r, c, value }]` |
| `contextMenu` | `boolean \| Array \| {items}` | `true` | 右クリックメニュー。`true`=既定項目 / `false`=無効 / **配列**=項目を構成（組込キー＋カスタム項目）（→ [右クリックメニュー](#右クリックメニュー行列の挿入削除)） |
| `allowInsertRows` / `allowDeleteRows` | `boolean` | `true` | 行の挿入 / 削除の可否（メニュー項目の表示も連動） |
| `allowInsertCols` / `allowDeleteCols` | `boolean` | `true` | 列の挿入 / 削除の可否 |
| `onStructureChange` | `(info)=>void` | — | 行/列の挿入・削除後。`info = { type, ... , undo? }` |
| `onBeforeStructureChange` | `(info)=>false\|void` | — | 行/列の挿入・削除の前。`false` で中止 |
| `onAfterPaste` | `(data,{range})=>void` | — | 貼り付け確定後 |
| `onBeforeCopy` / `onBeforeCut` | `(data,{range})=>false\|string[][]\|void` | — | コピー/カットの前。`false` で取消・配列で差替え |
| `onAfterCopy` | `(data,{range,cut})=>void` | — | クリップボード書込後（cut でも発火） |
| `onBeforeSelectionChange` | `({range,active,extent})=>false\|void` | — | 選択変更の前。`false` で中止 |
| `onBeforeKeyDown` | `(e)=>false\|void` | — | キーをグリッドより先に。`false` / `preventDefault()` で既定を止める |
| `onHeaderClick` | `(c, e)=>false\|void` | — | 列ヘッダのクリック。`false` で既定（列選択）を抑止（ソートUI等を外部で組む用） |
| `shortcuts` | `Array` | `[]` | カスタムショートカット（→ [ショートカット / プラグイン](#ショートカット--プラグイン--破棄)） |
| `plugins` | `Array` | `[]` | プラグイン（関数 or 登録名）。`init(grid)` で初期化 |
| `onPasteOverflow` | `(info)=>void` | — | `pasteOverflow:'error'` で超過時。`info = { anchor:{r,c}, height, width, rows, cols, overRows, overCols }` |

`enterMoves` / `tabMoves` は **Shift 押下で逆方向**に移動します（例: 既定で Shift+Enter は上、Shift+Tab は左）。プロパティとして実行時に書き換えても次のキー入力から反映されます（例: `grid.enterMoves = 'right'`）。

**入力フロー制御（`nextCell`）**: Enter/Tab の移動先を上書きして、**入力セルだけを論理順で巡回**できます（readonly の計算列を飛ばす／行末で次行の先頭入力へ）。"Excel ではなくシステム" だからできる、フォームに近い入力体験（→ 実例: [`examples/attendance.html`](https://tssgrid.threestarsoftware.co.jp/examples/attendance.html)）:

```js
const FLOW = [3, 4, 5, 13];                    // 出勤→退勤→所定外休→備考（入力列だけ）
new TssGrid(el, {
  initialCell: { r: 0, c: 3 },                 // 初期カーソル＝1日目の出勤
  nextCell: ({ r, c, shift }) => {
    const i = FLOW.indexOf(c);
    if (i < 0) return null;                     // 入力列以外は既定移動
    return i < FLOW.length - 1 ? { r, c: FLOW[i + 1] } : { r: r + 1, c: FLOW[0] };  // 備考→次行の出勤
  },
});
```

メソッド: `getData()` / `getRows()` / `getRow(r)` / `getColumn(cOrKey)` / `getColumns()` / `setData(rows)` / `getValue(r,cOrKey)` / `setValue(r,cOrKey,val,force?)` / `setValueRaw(r,cOrKey,val)`（履歴に積まない派生値書き込み・計算列用） / `hideColumn(c)` / `showColumn(c)` / `toggleColumn(c)` / `isColumnHidden(c)` / `getHiddenColumns()` / `setAlignment(align,range?)` / `getAlignment(r,c)` / `setCellReadOnly(flag,range?)` / `autoSizeColumn(c)` / `autoSizeAllColumns()` / `sortBy(cOrKey, dir)` / `sortRows(cmp)` / `addShortcut(s)` / `removeShortcut(name)` / `usePlugin(fn)` / `getPlugin(name)` / `destroy()` / `setActive(r,c)` / `selectRow(r)` / `selectCol(c)` / `selectAll()` / `setColWidth(c,px)` / `setRowHeight(r,px)` / `freezeCols(n)` / `freezeRows(n)` / `moveRow(from,to)` / `moveRows(r0,r1,to)` / `clearSort()` / `toCSV(opts)` / `downloadCSV(name,opts)` / `insertRow(ri,'above'|'below')` / `deleteRows(r0,r1?)` / `insertCol(ci,'left'|'right')` / `deleteCols(c0,c1?)` / `redraw()`（列定義変更後の再描画, データ・選択は保持）ほか。

## イベント

入力・貼付・フィル・Delete の **すべての値変更が同じ `changes` 形式で同じフックを通る**ので、検証や整形を **一度書けば全経路に効きます**。

```js
new TssGrid(el, {
  headers, data,

  // 確定の“直前”。検証・自動整形のフック。changes = [{ r, c, oldValue, newValue, source }]
  onBeforeChange(changes, source) {
    // ・return false        → 変更を全部取り消す
    // ・change.newValue を書換 → 整形して確定（例: 全角→半角、trim、大文字化…）
    // ・1セルだけ拒否したい   → その change.newValue を oldValue に戻す
    changes.forEach(c => { c.newValue = c.newValue.trim(); });
    if (changes.some(c => c.c === 0 && c.newValue === '')) return false; // 例: A列必須
  },

  // 確定の“直後”。保存・再計算など。source: 'edit'|'paste'|'fill'|'delete'|'undo'|'redo'
  onAfterChange(changes, source) { /* save(grid.getData()) など */ },

  // 編集の開始 / 終了（IME確定後に発火。Esc キャンセルは canceled:true）
  onEditStart({ r, c, value }) {},
  onEditEnd({ r, c, oldValue, newValue, canceled }) {},

  // 選択範囲の変更。before は false で“選択させない”ことも可（特定セルへの移動を禁止 等）
  onBeforeSelectionChange({ range, active, extent }) { /* return false で選択中止 */ },
  onSelectionChange({ range, active, extent }) {}, // range = { r0, c0, r1, c1 }

  // 貼り付けの前後。before は 2次元文字列配列を加工/取消、after は確定後の通知
  onBeforePaste(data) { /* return false で取消 / 加工した string[][] を返すと置換 */ },
  onAfterPaste(data, { range }) { /* 貼り付け確定後。range = 落ちた範囲 */ },

  // コピー / カットの前後。before は false で取消・配列で差替え可
  onBeforeCopy(data, { range }) {},
  onBeforeCut(data, { range }) {},
  onAfterCopy(data, { range, cut }) {},

  // 行/列の挿入・削除の前後。before は false で中止できる
  onBeforeStructureChange(info) { /* info.type = 'insertRow'|'deleteRows'|'insertCol'|'deleteCols'。return false で中止 */ },
  onStructureChange(info) {},   // 後。undo 時は info.undo = true
});
```

`onBeforeChange` で取り消した変更は **履歴（Undo）にも積まれません**。`undo`/`redo` では `onBeforeChange` は呼ばれず、`onAfterChange` のみ `source:'undo'|'redo'` で発火します。`onBefore*` 系（`Paste`/`Copy`/`Cut`/`StructureChange`/`SelectionChange`）は **`false` を返すとその操作を中止**します（履歴にも積まれません）。挿入/削除・コピー/カットの `onBefore*` は **redo では再発火しません**（確定済み操作の再実行のため）。

## セルタイプ / バリデータ

`columns` で列ごとに型と検証を指定できます。検証は `onBeforeChange` の **手前** に効くので、編集・貼付・フィルのどの経路でも同じルールが適用されます。

```js
new TssGrid(el, {
  headers: ['担当', '状態', '完了', '期限', '数量'],
  columns: [
    {},                                            // text（既定）
    { type: 'dropdown', options: ['未着手','進行中','完了'] },
    { type: 'checkbox' },                          // 既定 ON='1' / OFF=''
    { type: 'date' },                              // ISO(YYYY-MM-DD)。不正値は拒否
    { validator: v => v === '' || /^\d+$/.test(v) ? true : '数値で入力' },
  ],
  onInvalid(rej) { alert(rej.map(x => x.message).filter(Boolean).join('\n')); },
});
```

| `type` | 編集 UI | 保存値 / 検証 |
|---|---|---|
| `'text'`（既定） | テキスト入力 | そのまま |
| `'dropdown'` | `<select>`（`options` 必須）。セルに ▾ を表示、**1クリックで一覧が開き**、選ぶと即確定 | 選択肢 or 空のみ許可。範囲外は拒否。**クリア用の空オプションは自動で先頭に付く**ので `options` に `''` を入れない（入れると空が二重）。`allowEmpty:false` で**空オプションを出さず空値も弾く**＝ラジオ的な必須選択。**`options` は `string[]` または `{value,label}[]`＝保存値(value=内部コード)と表示(label)を分離**（`getData`/`getRows` は value で返る・検証も value で照合） |
| `'checkbox'` | Space / クリックでトグル | `checked`(既定 `'1'`) / `unchecked`(既定 `''`)。貼付値も正規化 |
| `'date'` | `<input type="date">` | `YYYY-MM-DD` のみ。実在しない日付（例 `2026-02-30`）は拒否 |
| `'time'` | `<input type="time">` / テキスト | `HH:MM[:SS]`（24時間制）で保存。`hour12:true` で AM/PM 表示・入力 |
| `'number'` | テキスト（編集時は素の数値） | 数値のみ。`decimals`/`thousands`/`prefix`/`suffix` で表示書式（→ [CellFormat](#cellformat宣言的な表示書式数値--日付)）。**全角→半角を既定で正規化**（`１２３`→`123`、`zenkaku:false`で無効化）。右寄せ |

- **`validator(value, { r, c })`**: `true`/`undefined` で許可、`false` で拒否、**文字列を返すとエラーメッセージ付きで拒否**。型と併用可（型 → validator の順で評価）。
- 検証 NG 時の挙動は **`invalidMode`** で選べます:
  - `'revert'`（既定）: 元の値に巻き戻す。
  - `'keep'`: **入力値を残してセルを赤く**警告（`td.tg-invalid`）。値を直せば赤は自動で消えます。フォームのように「後でまとめて直す」運用向き。`getData()` には不正値も入るので、保存前に再検証してください。
  - `keep` 時は**赤セルにホバーで理由（`title`＝validator のメッセージ）**が出ます。`invalidTitle:false` でOFF。
- どちらのモードでも確定時に `onInvalid(rejections, source)` が呼ばれます（`rejections=[{r,c,value,message}]`）。
- **全エラーをまとめて取得**: `grid.getInvalidCells()` → `[{r,c,key,value,code,level,message}]`（今の値を全セル検証）。保存前チェックや**エラー一覧パネル**の表示に → 動く例: [`examples/validation.html`](https://tssgrid.threestarsoftware.co.jp/examples/validation.html)（赤＋ホバー＋一覧パネルがライブ更新）。

#### エラーを コード / レベル / 共通メッセージ で管理（messages カタログ）

業務システム向けに、**エラー本文を外部の共通メッセージ（設定系）で一元管理**できます（トーン統一・差し替え・多言語）。`validator` は**コードを返すだけ**にし、本文は `messages` カタログから解決します。

```js
new TssGrid(el, {
  messages: {                                              // システム共通メッセージ（外部JSON/CSV/XML から）
    E_RANGE: { level: 'error', text: '{label}は {min}〜{max} の範囲で入力してください' },
    W_LONG:  { level: 'warn',  text: '{label}がやや長めです（{value}）' },
  },
  columns: [{ data:'age', title:'年齢',
    validator: v => v==='' || (+v>=0 && +v<=120) || { code:'E_RANGE', params:{min:0,max:120} } }],
});
```
- `validator` の戻り: `true/undefined`=OK / `false`=拒否 / **文字列**=その本文 / **`{ code, params?, level?, message? }`**=コード管理。
- `messages` は `{ code: 'text' | {level,text} }` か関数 `(code, ctx)=>text`。本文は **`{label}`（列タイトル）・`{value}`・任意 `params`** を差し込み。
- 各エラーは **`code` / `level` / 解決済み `message`** を持ち、`getInvalidCells()`・`onInvalid` で取得。**`keep` モードでは `level` で色分け**（赤セルに `data-err-level`＝error/warn、CSS でトーン指定）。保存可否は `getInvalidCells()` を level でフィルタしてプログラム側で判断。
- カタログを**CSVから作る**ヘルパー: `plugins/tss-messages.js` の `TssMessages.fromCSV(text)` / `fromRows(rows)`（`code,level,text` の設定ファイルを読込）。動く例: [`examples/messages.html`](https://tssgrid.threestarsoftware.co.jp/examples/messages.html)。
- checkbox の保存値は `checked` / `unchecked` で変更可（例: `{ type:'checkbox', checked:'TRUE', unchecked:'FALSE' }`）。
- **checkbox 列はヘッダに全選択チェックボックス**が出ます（クリックで全 ON/全 OFF、部分選択は indeterminate）。`columns[c].headerCheckbox: false` で非表示に。プログラムからは **`setColumnChecked(c, true/false)`**（readOnly セルはスキップ・**Undo 一発**）。右クリックメニューに出したいときは `contextMenu` に組込キー **`'check_column'` / `'uncheck_column'`** を入れます。見た目は外部CSS `.tssgrid .tg-head-cb { … }` で変更可。

### 入力の正規化 / 表示の整形（`parse` / `format`）

**保存値**（`getData()` が返す内部値）と、**入力**・**表示**を分離できます。外部ライブラリは同梱せず、必要なら列のフックに差し込む方針です。

| フック | 向き | 役割 |
|---|---|---|
| `parse(input, { r, c })` | 入力 → 保存値 | 入力文字列を保存値に正規化。`false`/`null` を返すと不正扱い。編集・貼付・フィルの全経路に効く |
| `format(stored, { r, c })` | 保存値 → 表示 | セルに出す文字列を整形（保存値そのものは変えない） |

```js
columns: [
  // 日付を yyyymmdd で打ちたい: テキスト入力にして、保存は ISO・表示は yyyy/mm/dd
  { type: 'date', picker: false, format: v => v ? v.replace(/-/g, '/') : '' },
  // 任意フォーマット（外部ライブラリも可）: 入力 "500円" → 保存 "500" → 表示 "500円"
  { parse: s => (s.match(/^(\d+)円$/) || [])[1] ?? false, format: v => v ? v + '円' : '' },
]
```

- **`type:'date'` の既定 `parse`**: `yyyymmdd` / `yyyy-mm-dd` / `yyyy/mm/dd` / `yyyy.mm.dd` を `yyyy-mm-dd` に正規化（実在日チェック付き）。`time` は `HH:MM[:SS]` を 24時間制に正規化（`1:30 PM` などの AM/PM 入力も受理）。
- **編集 UI**: `date`/`time` は既定でネイティブのピッカー（`<input type=date/time>`）。**`picker:false`** か `parse`/`format` を付けると**テキスト入力**になり、入力の並び順を自分で決められます（ネイティブの表示順はブラウザのロケール依存なので、yyyymmdd 固定で打ちたい時はこちら）。
- 評価順は **`parse` → 型チェック → `maxLength` → `validator`**。`format` は表示時のみ。`invalidMode:'keep'` なら `parse` 失敗値もそのまま赤く残ります。
- **`columns[c].maxLength`**: 桁数（文字数）上限。**編集中はそれ以上打てない**（`<input maxlength>`）＋**貼り付け・`setValue` は超過分を切り詰め**。社員番号・電話・郵便番号など「無制限ではない」項目に。例: `{ data:'code', maxLength: 5 }`。さらに厳密な書式は `validator` 併用（`{ maxLength:8, validator: v => /^[A-Z0-9]+$/.test(v) || '英数字のみ' }`）。

### CellFormat（宣言的な表示書式：数値 / 日付）

`parse`/`format` 関数を書かずに、**列定義のオプションだけ**で数値・日付の表示書式を指定できます。**保存値は正規のまま**（`getData()` は素の値）、**表示だけ**整形します。

```js
columns: [
  // 数値: type:'number' + 書式オプション
  { type: 'number', thousands: true },                          // 1234567 → 1,234,567
  { type: 'number', thousands: true, decimals: 2, prefix: '¥' },// 1234.5  → ¥1,234.50
  { type: 'number', decimals: 1, suffix: '%' },                 // 33.33   → 33.3%
  // 日付: type:'date' + 文字列パターン
  { type: 'date', format: 'yyyy年m月d日' },                     // 2026-06-30 → 2026年6月30日
]
```

| オプション（`type:'number'`） | 役割 |
|---|---|
| `decimals` | 小数桁（四捨五入して表示）。省略時は保存値のまま |
| `thousands` | `true` で 3桁カンマ区切り |
| `prefix` / `suffix` | 数値の前後に付ける文字（`'¥'` `'%'` `' 円'` など） |

- **入力**: グルーピングや前後綴り混じり（`'¥1,234'` `'50%'`）でも `parse` が正規化（`'1,234.50' → '1234.5'`）。非数値は拒否（検証経路に乗る）。
- **全角→半角**: 全角数字・符号を**既定で半角化**（`'１２３' → '123'`、`'１，２３４．５' → '1234.5'`、`'￥１，０００' → '1000'`）。IME 誤入力に強い。`zenkaku:false` で無効化。
- **非数値の扱いは `invalidMode`**: `'revert'`（既定＝黙って戻す）/ `'keep'`（**セルを赤くエラー**＋`onInvalid` でメッセージ）。両モードとも全角→半角は効く（→ 動く例: [`examples/number-input.html`](https://tssgrid.threestarsoftware.co.jp/examples/number-input.html)）。
- **編集時は素の数値**を表示（Excel 流。`¥1,234` のセルを編集すると `1234`）。
- 数値列は**右寄せ**（`td.tg-num`）。
- **日付パターン**（`type:'date'` に**文字列**の `format`）: トークン `yyyy` `yy` `mm` `m` `dd` `d`。`parse` は組込のまま（`20260630` 等で入力可）。
- これらは内部で `parse`/`format` の上に薄く乗っているだけなので、関数版の `format`/`parse` を渡せば従来どおり完全カスタムにできます（関数が優先）。

### 条件付き書式（cellClass）

**値・行・列を見てセルにCSSクラスを付ける**フックです。**ルールエンジンは持たず**、付けるのはクラスだけ＝見た目は業務側CSSで自由（リーンコア方針）。**編集すると即座に再評価**されます（→ 動く例: [`examples/conditional-format.html`](https://tssgrid.threestarsoftware.co.jp/examples/conditional-format.html)）。

```js
columns: [
  { data: '差分', type: 'number',
    cellClass: (value, { r, c, row }) => +value < 0 ? 'tg-neg' : '' },   // 列版（値で判定）
],
cellClass: (r, c, value, row, src) => src.holiday_kbn === '1' ? 'sat' : '',  // 全体版（src=元レコード＝非表示フィールドも見える）
// CSS は業務側で: .tssgrid td.tg-neg { color:#c00 } .tssgrid td.tg-row-ng { background:#fdecea }
```
- 列版 `columns[c].cellClass(value, {r,c,row,src})` ／ 全体版 `cellClass(r,c,value,row,src)`。返り値は文字列／配列／空（クラス無し）。
- `src` は**元レコード**（オブジェクトデータ時）。**画面に出していない隠しフィールド基準の色付け**（勤怠の `holiday_kbn` で土日祝を色分け等）に使えます → 実例: [`examples/attendance.html`](https://tssgrid.threestarsoftware.co.jp/examples/attendance.html)。
- **他列に依存する行ルール**（状態で行を色分け等）は、依存先の編集時に `grid.redraw()` で行全体を再評価（`onAfterChange: () => grid.redraw()`）。
- 同じセルに行ルールとセルルールが両方付く場合は **CSSの記述順（後勝ち）**で優先を決めます（セル個別を後に書く）。

### セル単位インラインスタイル（cellStyle）— 連続色・データバー

`cellClass` が**クラス（離散）**なのに対し、`cellStyle` は**セルに直接インラインCSS／CSS変数を差す**フック。**値に応じた連続色（ヒートマップ）や背景データバー**など、クラスでは出せない表現に（**編集できる数値セルのまま**）。返り値は CSSプロパティのオブジェクト or 文字列。

```js
// 全体版 cellStyle(r,c,value,row,src) ／ 列版 columns[c].cellStyle(value,{r,c,row,src})
columns: [
  { data: '売上', type: 'number',
    cellStyle: (v) => ({ background: heat(+v), color: '#fff' }) },   // 連続色（オブジェクト）
  { data: '進捗', type: 'number',
    cellStyle: (v) => `--pct:${v}%` },                                // CSS変数も（'k:v;…' 文字列も可）
]
```
- 返り値プロパティ名は **CSS標準名/kebab/`--変数`**（`background`・`background-color`・`--pct` 等）。`{r,c,row,src}` は cellClass と同じ。
- **編集で即再評価**（`_renderCell` 経由）。前回分は自動でクリアして付け直し。連続色/バーの既製ヘルパーは下記 `TssHeatmap`/`TssDataBar`。

### セルに画像 / SVG / HTML（html:true）

列に `html: true` を付けると、その列は**表示だけ生HTML**になります（値 or `format` の戻りを innerHTML）。**値はテキスト保存のまま**＝`getData()`・コピペ・CSV は無傷で、**見た目だけ**HTML化。画像・SVGアイコン・状態バッジ・進捗バー・★評価などに（→ 動く例: [`examples/html-cells.html`](https://tssgrid.threestarsoftware.co.jp/examples/html-cells.html)）。

```js
columns: [
  { data:'状態',   html:true, readOnly:true, format:(v)=> badgeHtml(v) },   // SVGドット＋ラベル
  { data:'写真',   html:true, readOnly:true, format:(url)=> `<img src="${url}" height="22">` },
  { data:'アイコン', html:true, readOnly:true },                            // 値に inline SVG をそのまま
]
```
- ⚠️ **エスケープを外す＝XSSの責任は `format`/値の提供側**。外部由来の文字列をそのまま埋めないこと。**表示用途なので `readOnly` 推奨**。
- 非 `html` 列は従来どおりエスケープされ安全（`<img>` 等はテキスト表示）。
- 画像は行高(既定28px)を超えると `overflow:hidden` で切れるので `rowHeights` で調整。

### 読み取り専用（readOnly）

セル・列・グリッド全体を編集不可にできます。**編集モードに入れず**（クリック・F2・ダブルクリック・文字入力）、**貼り付け・フィル・Delete などの全変更経路でも拒否**して元の値に戻します（履歴にも積みません）。読み取り専用セルも**選択・コピーは可能**です。

```js
new TssGrid(el, {
  readOnly: false,                       // ← グリッド全体を読み取り専用にするならここで
  columns: [
    { readOnly: true },                  // 列まるごと固定（ID・計算結果など）
    {},                                  // 編集可
    // セル単位の判定: 「完了」の行だけロック
    { type: 'dropdown', options: ['受付','出荷','完了'], readOnly: v => v === '完了' },
  ],
  onReadOnly: (blocked) => console.log('変更を拒否:', blocked),  // [{ r, c, value }]
});
```

- 列の `readOnly` は **`true`** または **`(value, { r, c }) => boolean`**（セル単位の判定）。
- 読み取り専用セルは淡色表示（`td.tg-readonly`）。checkbox は `disabled`、dropdown は ▾ を出しません。
- 検証（`validator`）とは独立。`invalidMode` に関係なく常に元の値へ戻します。

### セル内改行（複数行入力・multiline）

列に `multiline: true` を付けると、その列だけ**セル内で改行**できます（メモ・議事録・備考など）。TssGrid の本命である**日本語 IME の直打ち（セルに来ていきなり変換入力・1文字目が落ちない）はそのまま**——編集は隠しテキストエリアで行いますが、開いてから打つのではなく**そのまま打ち始められます**（→ 動く例: [`examples/multiline.html`](https://tssgrid.threestarsoftware.co.jp/examples/multiline.html)）。

```js
new TssGrid(el, {
  defaultRowHeight: 64,          // 見せる行数ぶんの高さを確保（固定・自動では伸びない）
  multilineEnter: 'commit',      // 既定=Excel風（Enter=確定 / Alt+Enter=改行）。'newline' でメモ帳風
  columns: [
    { data: 'task', title: '項目' },
    { data: 'memo', title: 'メモ', width: 340, multiline: true },   // ← これだけ
  ],
  data: rows,
});
```

- **行の高さは固定**（内容で伸びない＝行高一定なので**大量行・仮想スクロールでも崩れない**）。`defaultRowHeight` / `rowHeights` で見せる行数ぶんを確保し、はみ出しはクリップ。複数行セルの**右上に薄いヒント**が出て「ここは複数行」と分かります。
- **編集を始めると箱が内容ぶん下へ伸びて全行が見えます**（浮いたオーバーレイなので**行の高さ・スクロールには不干渉**・確定で元のクランプ表示に戻る）。`multilineEditMaxLines`（既定 `10`）で頭打ち＋箱内スクロール、画面端では上へフリップしてビューポートからはみ出しません。
- **`multilineEnter`**: `'commit'`（既定・Excel風＝Enter で確定 / **Alt+Enter で改行**）／ `'newline'`（メモ帳風＝Enter で改行 / **Ctrl+Enter で確定**）。同一画面での混在は非対応（起動時に選ぶ）。
- **`multilineMark`**: 右上ヒントの表示（既定 `true`）。`false` で消す。色は CSS 変数 **`--tg-ml-mark`** で列/業務ごとに変えられます。
- **`multilineEditMaxLines`**: 編集で伸びる箱の最大行数（既定 `10`）。
- **コピー / 貼り付け**は Excel / Sheets と往復しても崩れません（改行を含むセルは引用符付き TSV で入出力）。改行コードは内部 **LF** に統一されます（貼り付け・入力とも CRLF→LF 正規化。`setData` で渡した値のみ無改変）。
- ネイティブの日付/時刻ピッカー（素の `type:'date'`/`'time'`）は従来どおり（別要素なので multiline と競合しません）。

### 右クリックメニュー（行/列の挿入・削除）

セルやヘッダを**右クリック**すると、行/列の挿入・削除メニューが出ます。複数行/列を選択しておけば**まとめて削除**できます。挿入・削除は **Undo/Redo に1操作で積まれ**（`Ctrl+Z` / `Ctrl+Y`）、列の挿入・削除では `frozenCols` も自動で追従します。

```js
new TssGrid(el, {
  contextMenu: true,        // 既定 true。false でブラウザ既定メニューに戻す
  allowInsertRows: true,    // 各操作は個別に ON/OFF（メニュー項目の表示も連動）
  allowDeleteRows: true,
  allowInsertCols: true,
  allowDeleteCols: true,
  onStructureChange: (info) => console.log(info.type),  // 'insertRow' | 'deleteRows' | 'insertCol' | 'deleteCols'
});
```

プログラムからも操作できます: **`insertRow(ri, 'above'|'below')`** / **`deleteRows(r0, r1?)`** / **`insertCol(ci, 'left'|'right')`** / **`deleteCols(c0, c1?)`**。最低1行・1列は残します。

既定メニューには行/列の挿入・削除に加え **コピー / 切り取り / 貼り付け / 内容をクリア** も入ります（クリップボードは `copyPaste:false` で消えます）。

#### メニューを自分で構成する

`contextMenu` に**配列**を渡すと、出す項目を選び、独自項目を足せます。

```js
new TssGrid(el, {
  contextMenu: [
    'row_above', 'row_below', 'remove_row',
    '---------',                       // 区切り線（ダッシュのみの文字列）
    'copy', 'cut', 'paste', 'clear',
    '---------',
    // カスタム項目
    { name: '行を複製', key: 'dup', callback({ range }) { /* range = {r0,c0,r1,c1} */ } },
    { name: '完了にする', disabled: ({ r0 }) => r0 === 0, callback() {} },  // disabled/hidden は関数も可
    // サブメニュー
    { name: '一括操作', submenu: [
      { name: 'エクスポート', callback() {} },
      'clear',
    ] },
  ],
});
```

- **組込キー**: `row_above` / `row_below` / `remove_row` / `col_left` / `col_right` / `remove_col` / `copy` / `cut` / `paste` / `clear` / `undo` / `redo`、区切りは `'---------'`（ダッシュのみ）。
- **カスタム項目**: `{ name, callback, disabled?, hidden?, key?, submenu? }`。`name`/`disabled`/`hidden` は**関数**も可（引数は選択範囲 `{r0,c0,r1,c1}`）。`callback` の `this` はグリッド、引数は `{ range, key }`。
- `submenu` に配列を渡すとフライアウトの**サブメニュー**になります（同じ組込キー／カスタム項目が使えます）。

#### 時刻の 12時間制（AM/PM）

```js
columns: [ { type: 'time', hour12: true } ]   // 表示・入力が 1:30 PM 形式。保存値は常に '13:30'(24h)
```

- 保存値は常に 24時間制 `HH:MM` なので、`hour12` を切り替えても**データは曖昧になりません**。
- 入力は `1:30 PM` / `1:30pm` / `13:30` のいずれも受理（24時間制に正規化）。
- 実行時に表示を切り替えるには、列の `hour12` を変更して **`grid.redraw()`**（データと選択は保持）。

```js
grid.columns[4].hour12 = !grid.columns[4].hour12;
grid.redraw();
```

### `HistoryManager`

`push(cmd)` / `undo()` / `redo()` / `canUndo()` / `canRedo()` / `clear()` / `onChange`。
command は `{ apply(), revert(), label }`。

## キーボード / マウス

| 操作 | 動作 |
|---|---|
| 矢印 | セル移動 |
| Shift+矢印 / ドラッグ / Shift+クリック | 範囲選択 |
| 行/列ヘッダをクリック（ドラッグ・Shift+クリックで複数） | 行・列の選択。左上の角で全選択 |
| 列ヘッダ右端 / 行ヘッダ下端をドラッグ | 列幅 / 行高のリサイズ（既定はドラッグ中に線でプレビュー→離して確定） |
| `frozenCols` で左 N 列を固定 | 横スクロールしても残る（`width` で枠幅を制約してスクロール可能に） |
| 文字入力 / F2 / ダブルクリック | 編集 |
| Enter / Tab | 確定して移動（既定 下 / 右。`enterMoves`・`tabMoves` で変更可、Shift で逆方向） |
| Delete | 選択範囲クリア |
| Ctrl+C / V / X | コピー / 貼付 / 切取（TSVでExcel相互） |
| Ctrl+Z / Ctrl+Y(Ctrl+Shift+Z) | Undo / Redo |
| フィルハンドル(右下)をドラッグ | コピー。数値2つ以上=連番 / 単一+Ctrl=+1 / Alt=2D矩形 / Ctrlで連番↔コピー反転 |

## 設計メモ

- **なぜ `<input>` で contenteditable ではないか**: IMEのcomposition が contenteditable だとブラウザ間で不安定。変換中の `beforeinput` キャンセルも効かないため「入力抑制」目的でも結局確定時バリデーションが必要。`<input>` の方が IME が安定し、値がクリーンな文字列で、ペーストもプレーン、キャレット操作も簡単。
- **入力制限**は「打たせて確定時に検証/変換」が基本（IME中はキーを弾けないため）。`.tg-editor.invalid`（赤）のCSSフックを用意済み。
- **XSS**: セル/見出しは `&<>` をエスケープしてから描画。値はプレーン文字列のみ。

## 制限

- 外部（Excel等）→グリッドの貼り付けはブラウザのクリップボード読取許可が必要。`file://` で読めない場合は http（ローカルサーバ）で開く。グリッド間・グリッド内のコピペは内部バッファで常に動く。
- 仮想スクロールは `virtual: true` で対応（固定行高・固定行列/折り返し/セル結合は非対応）。日付の連番フィルはコピー扱い（数値のみ連番）。

## License

MIT
