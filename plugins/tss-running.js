/*! TssRunningTotal — 残高／累計（running total）プラグイン。
 *
 *  「前の行の結果 ＋ この行の増減」で縦に積む列を作る。formula(行内) でも totals(全体合計) でも出せない
 *  **縦方向の連鎖**を担当。出納帳/通帳の残高、在庫受払の在庫数、経費・ポイントの累計など。
 *
 *  使い方（2通り）:
 *    // (a) 1列を単純累計: running += Number(row[delta])
 *    plugins: [ TssRunningTotal({ column: 'cum', delta: 'amount', initial: 0 }) ]
 *
 *    // (b) step 関数で自由に（入金-出金など）
 *    plugins: [ TssRunningTotal({
 *      column: 'balance', initial: 10000,                                  // 前残（期首）
 *      step: (prev, row) => prev + Number(row.deposit||0) - Number(row.withdraw||0),
 *    }) ]
 *
 *  opts:
 *    column   : 残高/累計を表示する列（dataキー）。**自動 readOnly**。
 *    initial  : 期首値（前残）。既定 0。
 *    delta    : (step 省略時) この列の数値を累計に足す。
 *    step     : (prev, row, {r,grid}) => newRunning  各行で残高をどう更新するか。
 *    skipEmpty: 全列が空の行は連鎖を進めず残高セルも空に（既定 true。末尾の予備空行対策）。
 *
 *  handle: recompute() / destroy()。formula と併用するなら plugins:[TssFormula, TssRunningTotal(...)]（派生列の後に累計）。
 *  自動追従するのは 編集 / 行の挿入・削除 / setData（＋それらの Undo/Redo）。
 *  ※ 行ドラッグ移動(rowReorder)を併用するときは順序が変わるので onAfterRowMove で handle.recompute() を呼ぶこと。
 */
(function (root) {
  'use strict';
  function TssRunningTotal(opts) {
    opts = opts || {};
    var colKey = opts.column;
    var initial = (opts.initial == null) ? 0 : opts.initial;
    var deltaKey = opts.delta;
    var step = (typeof opts.step === 'function') ? opts.step : null;
    var skipEmpty = opts.skipEmpty !== false;

    return function (grid) {
      // 対象列を自動 readOnly に
      for (var c = 0; c < grid.COLS; c++) if (grid.columns[c] && grid.columns[c].data === colKey) { if (grid.columns[c].readOnly == null) grid.columns[c].readOnly = true; break; }

      function rowObject(r) {
        var o = {};
        for (var c = 0; c < grid.COLS; c++) { var k = grid.columns[c] && grid.columns[c].data; if (k != null) o[k] = grid.data[r][c]; }
        return o;
      }
      function emptyRow(r) {
        for (var c = 0; c < grid.COLS; c++) { var k = grid.columns[c] && grid.columns[c].data; if (k == null) continue; if (grid.data[r][c] !== '' && grid.data[r][c] != null) return false; }
        return true;
      }
      var deltaIdx = -1; for (var dc = 0; dc < grid.COLS; dc++) if (grid.columns[dc] && grid.columns[dc].data === deltaKey) { deltaIdx = dc; break; }

      // 全行を上から走査して残高を積む（累計は前行に依存＝毎回フル再計算）。
      function compute() {
        var running = initial;
        for (var r = 0; r < grid.ROWS; r++) {
          if (skipEmpty && emptyRow(r)) { grid.setValueRaw(r, colKey, ''); continue; }   // 空行は連鎖を進めず空表示
          if (step) { try { running = step(running, rowObject(r), { r: r, grid: grid }); } catch (e) {} }
          else if (deltaIdx >= 0) { var n = Number(grid.data[r][deltaIdx]); running = running + (isFinite(n) ? n : 0); }
          grid.setValueRaw(r, colKey, running);
        }
      }

      // formula/totals と同じく onAfterChange/setData/onStructureChange を包む（prev を先に回してから累計）。
      var prevAfter = grid.onAfterChange;
      grid.onAfterChange = function (ch, src) { if (prevAfter) { try { prevAfter.call(grid, ch, src); } catch (e) {} } compute(); };
      var prevSetData = grid.setData.bind(grid);
      grid.setData = function (rows) { prevSetData(rows); compute(); };
      var prevStruct = grid.onStructureChange;
      grid.onStructureChange = function (info) { if (prevStruct) { try { prevStruct.call(grid, info); } catch (e) {} } compute(); };

      compute();   // 初期計算

      return {
        name: 'running',
        recompute: compute,
        destroy: function () { grid.onAfterChange = prevAfter; grid.setData = prevSetData; grid.onStructureChange = prevStruct; },
      };
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = TssRunningTotal;
  else root.TssRunningTotal = TssRunningTotal;
})(typeof self !== 'undefined' ? self : this);
