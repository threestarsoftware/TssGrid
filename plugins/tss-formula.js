/*! TssFormula — 行スコープの派生列（computed column）プラグイン。
 *
 *  「その行の値だけから計算する列」を columns 定義に formula 関数で書けるようにする。
 *  例: 金額 = 数量 × 単価 / 税込 = 金額 × 1.1 / 勤怠の勤務時間 など。
 *
 *  使い方:
 *    columns: [
 *      { data:'quantity', type:'number' },
 *      { data:'price',    type:'number' },
 *      { data:'amount',   type:'number', formula: (row) => row.quantity * row.price },        // ← 派生列
 *      { data:'withTax',  type:'number', formula: (row) => Math.round(row.amount * 1.1) },     // ← 前の formula 結果も使える
 *    ],
 *    plugins: [TssFormula]                 // または grid.usePlugin(TssFormula) / plugins:['formula']
 *
 *  仕様:
 *   - formula は **行スコープの純粋関数** `(row, ctx) => value`。row=その行の {dataキー:値}、ctx={r,c,grid}。
 *   - formula 列は **自動で readOnly**（計算結果＝手入力不可。明示済みなら尊重）。
 *   - **同じ行のどれかが変わると自動再計算**（編集/フィル/貼付/Undo/Redo すべて追従。依存解析はせず「同じ行が変わったら回す」＝単純で正しい）。
 *   - 書き込みは **setValueRaw**＝undo/redo 履歴に積まない（派生値が独立した Undo ステップにならない）。
 *   - **columns 定義順に評価**＝後ろの formula は前の formula 結果を参照できる。
 *   - 値は内部文字列。算術は JS が数値強制（'1200' * '5' = 6000）。`+` で連結を避けたいときは Number(row.x) を。
 *
 *  ※ 列方向の集計（縦の SUM/合計行）はこのプラグインの範囲外。合計は別の小さなグリッド＋関数で（勤怠デモの合計表が好例）。
 */
(function (root) {
  'use strict';
  function TssFormula(grid, opts) {
    opts = opts || {};

    // formula を持つ列を収集（無ければ何もしない）。formula 列は自動 readOnly。
    var fcols = [];
    for (var c = 0; c < grid.COLS; c++) {
      var cfg = grid.columns[c];
      if (cfg && typeof cfg.formula === 'function') { fcols.push(c); if (cfg.readOnly == null) cfg.readOnly = true; }
    }
    if (!fcols.length) return { name: 'formula' };

    // その行を {dataキー: 値} のオブジェクトに（formula へ渡す row）。
    function rowObject(r) {
      var o = {};
      for (var c = 0; c < grid.COLS; c++) { var k = grid.columns[c] && grid.columns[c].data; if (k != null) o[k] = grid.data[r][c]; }
      return o;
    }
    // 1行の formula 列を順に再計算（後続が前の結果を参照できるよう row を更新しながら）。
    function recalcRow(r) {
      if (r < 0 || r >= grid.ROWS) return;
      var o = rowObject(r);
      for (var i = 0; i < fcols.length; i++) {
        var c = fcols[i], v;
        try { v = grid.columns[c].formula(o, { r: r, c: c, grid: grid }); } catch (e) { v = ''; }
        if (v == null || (typeof v === 'number' && !isFinite(v))) v = '';   // null/NaN/Infinity は空
        grid.setValueRaw(r, c, v);
        var k = grid.columns[c].data; if (k != null) o[k] = grid.data[r][c];
      }
    }
    function recalcRows(rows) { rows.forEach(recalcRow); }
    function recalcAll() { for (var r = 0; r < grid.ROWS; r++) recalcRow(r); }

    // 変更フック: onAfterChange を包んで「変わった行」の formula を再計算。
    // setValueRaw は履歴も onAfterChange も起こさないので、ここで書いても再入しない＝ループしない。
    var prevAfter = grid.onAfterChange;
    grid.onAfterChange = function (changes, source) {
      var rows = new Set();
      for (var i = 0; i < changes.length; i++) rows.add(changes[i].r);
      recalcRows(rows);
      if (prevAfter) { try { prevAfter.call(grid, changes, source); } catch (e) {} }
    };
    // setData（全入替）後は全行再計算。
    var prevSetData = grid.setData.bind(grid);
    grid.setData = function (rows) { prevSetData(rows); recalcAll(); };
    // 行/列の挿入・削除後も全行再計算（新規行の formula を埋める）。
    var prevStruct = grid.onStructureChange;
    grid.onStructureChange = function (info) { recalcAll(); if (prevStruct) { try { prevStruct.call(grid, info); } catch (e) {} } };

    recalcAll();   // 初期計算

    return {
      name: 'formula',
      recalc: recalcRow,          // 手動で1行
      recalcAll: recalcAll,       // 手動で全行
      destroy: function () { grid.onAfterChange = prevAfter; grid.setData = prevSetData; grid.onStructureChange = prevStruct; },
    };
  }
  if (typeof TssGrid !== 'undefined' && TssGrid.registerPlugin) TssGrid.registerPlugin('formula', TssFormula);
  if (typeof module !== 'undefined' && module.exports) module.exports = TssFormula;
  else root.TssFormula = TssFormula;
})(typeof self !== 'undefined' ? self : this);
