/*! TssSum — 条件付き合計グリッドの軽量プラグイン。
 *
 *  tss-totals との住み分け: tss-totals は「列ごとの集計（sum/avg/min/max/count）」を onTotals で返す。
 *  tss-sum は「同じ列を条件別に複数集計＝ラベル付きの"合計行"（小計/消費税10%/消費税8%/合計 など）」＋
 *  ソースと整列した表示グリッドまで担う（per-column キーでは消費税10%と8%が衝突するため別抽象が要る）。
 *
 *  ソースグリッドと「同一の列構成」の readonly 集計グリッドを作るので、金額列の幾何を共有し
 *  画面でも印刷でも値が縦にピッタリ揃う。各合計行は宣言で（条件＋対象）または派生で定義する。
 *  ソースの onAfterChange / onStructureChange を包んで自動で再計算する。
 *
 *  使い方:
 *    const sum = TssSum.attach(grid, document.getElementById('sumgrid'), {
 *      rows: [
 *        { label: '小計（税抜）',  of: r => (+r[2]||0)*(+r[3]||0) },                                  // 全データ行の合計
 *        { label: '消費税（10%）', when: r => r[4]==='10%', of: r => Math.round((+r[2]||0)*(+r[3]||0)*0.10) }, // 条件付き
 *        { label: '消費税（8%）',  when: r => r[4]==='8%',  of: r => Math.round((+r[2]||0)*(+r[3]||0)*0.08) },
 *        { label: '合計（税込）',  total: v => v[0]+v[1]+v[2] },                                      // 既出行から派生
 *      ],
 *      format: v => '¥' + Number(v).toLocaleString('ja-JP'),
 *      onCompute: vals => { ... },   // 計算後フック（上部の総額表示など）
 *    });
 *    sum.refresh();   // 手動再計算 / sum.detach();   // フック解除＋集計グリッド破棄
 *
 *  行の定義:
 *    { label, when?(row)->bool, of(row)->number }  … when に一致するデータ行で of(row) を合計（when 省略＝全行）
 *    { label, total(priorValues[])->number }        … それまでの行の値配列から派生（小計＋税 など）
 *  opts: rows(必須) / valueCol(既定=最終列) / sumCol(of 省略時に合計する列) / format / rowHeight(既定28)
 *        / onCompute(vals) / name / TssGrid(モジュール利用時にコンストラクタを注入)
 *  返り値: { grid, refresh, detach }
 *  注意: ラベルの横結合に window.TssMerge を使う（無ければラベルは先頭列のみ）。集計グリッドは表示専用。
 */
(function (root) {
  'use strict';

  function TssSum() { /* 名前空間。attach を使う */ }

  TssSum.attach = function (source, mountEl, opts) {
    opts = opts || {};
    var Grid = opts.TssGrid || root.TssGrid;
    if (!Grid) throw new Error('TssSum: TssGrid が見つかりません（opts.TssGrid で渡してください）');
    var rows = opts.rows || [];
    var COLS = source.COLS;
    var valueCol = (opts.valueCol != null) ? opts.valueCol : COLS - 1;
    var fmt = opts.format || function (v) { return v; };

    // ソースと同じ列幅・行ヘッダ・全体幅でミラー（＝金額列が揃う）。全セル readonly。
    var columns = [];
    for (var c = 0; c < COLS; c++) {
      var col = { width: source._colWidth(c), readOnly: true };
      if (c === valueCol) { col.align = 'right'; col.format = fmt; }
      columns.push(col);
    }
    var data = rows.map(function (spec) {
      var r = new Array(COLS).fill('');
      r[0] = (spec.label != null) ? spec.label : '';   // ラベルは先頭列（アンカー）
      return r;
    });
    var plugins = [];
    if (root.TssMerge && valueCol > 1) {   // ラベルを valueCol の手前まで横結合
      plugins.push(root.TssMerge.plugin({
        merges: rows.map(function (_, r) { return { r: r, c: 0, colspan: valueCol }; }),
      }));
    }
    var tg = new Grid(mountEl, {
      name: opts.name || (source.name ? source.name + '-sum' : 'sum'),
      width: source.width, rowHeight: opts.rowHeight || 28,
      rowHeaders: source.rowHeaders, colHeaders: false,
      columns: columns, data: data, plugins: plugins,
    });

    function num(v) { return Number(v) || 0; }
    function refresh() {
      var src = source.data, vals = [];
      for (var i = 0; i < rows.length; i++) {
        var spec = rows[i], v;
        if (typeof spec.total === 'function') {
          v = spec.total(vals.slice());
        } else {
          v = 0;
          for (var k = 0; k < src.length; k++) {
            var row = src[k];
            if (spec.when && !spec.when(row)) continue;
            v += spec.of ? num(spec.of(row)) : num(row[(opts.sumCol != null) ? opts.sumCol : valueCol]);
          }
        }
        vals[i] = v;
        tg.data[i][valueCol] = String(v);
      }
      tg.buildTable();
      if (opts.onCompute) { try { opts.onCompute(vals.slice()); } catch (e) {} }
    }

    // ソースの変更フックを包んで自動再計算（既存ハンドラは温存）
    var origAC = source.onAfterChange, origSC = source.onStructureChange;
    source.onAfterChange = function () { if (origAC) origAC.apply(this, arguments); refresh(); };
    source.onStructureChange = function () { if (origSC) origSC.apply(this, arguments); refresh(); };
    refresh();

    return {
      grid: tg,
      refresh: refresh,
      detach: function () {
        source.onAfterChange = origAC; source.onStructureChange = origSC;
        if (tg.destroy) tg.destroy();
      },
    };
  };

  if (typeof module === 'object' && module.exports) module.exports = TssSum;
  root.TssSum = TssSum;
})(typeof window !== 'undefined' ? window : this);
