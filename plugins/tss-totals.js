/*! TssTotals — 列方向の集計（合計/平均/件数/最小/最大）プラグイン。**計算だけ＝描画は利用者側**。
 *
 *  「縦の合計」をコアに埋めると合計行の置き場が minSpareRows/ソート/空行処理と衝突して肥大化する。
 *  そこで **集計ロジックだけ** を担い、結果は onTotals コールバック / getTotals() で返す。
 *  どこに出すかは自由＝プレーンなフッタ、ラベル、あるいは **別の TssGrid（合計表）** に流すのも一行。
 *
 *  使い方:
 *    plugins: [ TssTotals({
 *      columns: { amount: 'sum', quantity: 'sum', price: 'avg' },   // dataキー → 集計種別
 *      onTotals: (t) => { footer.textContent = '合計 ' + t.amount; } // 再計算のたびに呼ばれる
 *    }) ]
 *    // ↑ formula と併用するときは plugins:[TssFormula, TssTotals]（合計を formula 結果の後に出すため）
 *
 *  opts:
 *    columns: { dataキー: 'sum'|'avg'|'count'|'min'|'max' | ((rawValues, numbers)=>number) }
 *             count=非空セル数 / sum・avg・min・max=数値セルのみ。関数で独自集計も可。
 *    skipEmpty: 全列が空の行を除外（既定 true。末尾の予備空行などを集計から外す）
 *    decimals:  結果の小数桁（avg 等。既定 null=丸めない）
 *    onTotals:  (totals) => void   再計算のたびに呼ばれる。totals = { dataキー: 数値 }
 *
 *  handle（usePlugin の戻り / grid.getPlugin('totals')）:
 *    getTotals() … 最新の集計オブジェクト / recompute() … 手動再計算 / destroy() … フック解除
 */
(function (root) {
  'use strict';
  function TssTotals(opts) {
    opts = opts || {};
    var spec = opts.columns || {};
    var skipEmpty = opts.skipEmpty !== false;
    var decimals = (opts.decimals == null) ? null : opts.decimals;
    var onTotals = (typeof opts.onTotals === 'function') ? opts.onTotals : null;

    function aggregate(kind, values) {
      var nums = [];
      for (var i = 0; i < values.length; i++) { var s = values[i]; if (s === '' || s == null) continue; var n = Number(s); if (isFinite(n)) nums.push(n); }
      if (typeof kind === 'function') { try { return kind(values, nums); } catch (e) { return 0; } }
      var sum = 0, k;
      switch (kind) {
        case 'sum': for (k = 0; k < nums.length; k++) sum += nums[k]; return sum;
        case 'avg': if (!nums.length) return 0; for (k = 0; k < nums.length; k++) sum += nums[k]; return sum / nums.length;
        case 'count': { var c = 0; for (k = 0; k < values.length; k++) if (values[k] !== '' && values[k] != null) c++; return c; }
        case 'min': return nums.length ? Math.min.apply(null, nums) : 0;
        case 'max': return nums.length ? Math.max.apply(null, nums) : 0;
        default: return 0;
      }
    }

    // この plugin の実体（usePlugin が factory(grid, opts) として呼ぶ）
    return function (grid) {
      var last = {};
      function emptyRow(r) {
        for (var c = 0; c < grid.COLS; c++) { var k = grid.columns[c] && grid.columns[c].data; if (k == null) continue; if (grid.data[r][c] !== '' && grid.data[r][c] != null) return false; }
        return true;
      }
      function compute() {
        var totals = {}, keys = Object.keys(spec);
        for (var ki = 0; ki < keys.length; ki++) {
          var key = keys[ki];
          var col = -1; for (var cc = 0; cc < grid.COLS; cc++) if (grid.columns[cc] && grid.columns[cc].data === key) { col = cc; break; }
          if (col < 0) { totals[key] = 0; continue; }
          var vals = [];
          for (var r = 0; r < grid.ROWS; r++) { if (skipEmpty && emptyRow(r)) continue; vals.push(grid.data[r][col]); }
          var v = aggregate(spec[key], vals);
          if (decimals != null && typeof v === 'number') { var p = Math.pow(10, decimals); v = Math.round(v * p) / p; }
          totals[key] = v;
        }
        last = totals;
        if (onTotals) { try { onTotals(totals); } catch (e) {} }
        return totals;
      }

      // 変更フック: いずれも「先に他のフック(prev)を回してから合計」＝formula 等の派生結果を反映した後に集計。
      var prevAfter = grid.onAfterChange;
      grid.onAfterChange = function (ch, src) { if (prevAfter) { try { prevAfter.call(grid, ch, src); } catch (e) {} } compute(); };
      var prevSetData = grid.setData.bind(grid);
      grid.setData = function (rows) { prevSetData(rows); compute(); };
      var prevStruct = grid.onStructureChange;
      grid.onStructureChange = function (info) { if (prevStruct) { try { prevStruct.call(grid, info); } catch (e) {} } compute(); };

      compute();   // 初期集計

      return {
        name: 'totals',
        getTotals: function () { return last; },
        recompute: compute,
        destroy: function () { grid.onAfterChange = prevAfter; grid.setData = prevSetData; grid.onStructureChange = prevStruct; },
      };
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = TssTotals;
  else root.TssTotals = TssTotals;
})(typeof self !== 'undefined' ? self : this);
