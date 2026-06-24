/*! TssMerge — 矩形セル結合（colspan×rowspan）の軽量プラグイン。
 *
 *  アンカー=(r,c)=左上が値・編集・選択の対象。覆われた従属セルは描画スキップ＋読取専用（貼付/フィルは弾く）。
 *  行/列の挿入削除では結合座標がコア側で縦横対称に追従（undo 対応）。
 *  並べ替え/行移動との関係: ソートは結合中つねにロック。行移動は「横結合のみ」なら可（行と一緒に移動）、
 *  「縦結合(rowspan>1)」が在る間はロック（行順を崩すと縦結合が分断＝auto-split を避ける割り切り）。
 *
 *  使い方:
 *    grid = new TssGrid(el, { plugins: [ TssMerge.plugin({ merges: [{r:0,c:1,colspan:3},{r:1,c:0,rowspan:2}] }) ] });
 *    grid.setMerge(0, 1, 3);      // (0,1) を起点に3列を横結合（rowspan 省略=1）
 *    grid.setMerge(1, 0, 1, 2);   // (1,0) を起点に2行を縦結合（colspan,rowspan）
 *    grid.setMerge(2, 2, 2, 2);   // 2x2 の矩形結合
 *    grid.mergeSelection();       // 選択矩形を結合（既存結合を含めば飲み込んで1つに＝Excel流）
 *    grid.setMerge(0, 0, 4, 1, true);  // 第5引数 absorb=true で重なる既存結合を飲み込む
 *    grid.removeMerge(0, 1);      // (0,1) を含む結合を解除
 *    grid.getMerges();            // [{r,c,colspan,rowspan}, ...]
 *    grid.destroyMerged();        // 全結合を解除
 *
 *  opts(plugin): merges（初期結合の配列 [{r,c,colspan,rowspan?}]）。
 *  Undo: setMerge/removeMerge/mergeSelection/destroyMerged は履歴に積む（結合と、結合時にクリアした従属
 *        セルの値の両方を復元）。初期 merges（opts）は履歴に積まない（設定扱い）。
 *  注意: frozen 境界をまたぐ結合は想定外（ネストヘッダと同じ制約）。結合範囲のコピーは従属位置が空セル。
 */
(function (root) {
  'use strict';

  function TssMerge() { /* 名前空間。plugin を使う */ }

  TssMerge.plugin = function (opts) {
    opts = opts || {};
    return function (grid) {
      if (grid._tssMergeInstalled) return { name: 'merge' };   // 二重インストール防止
      grid._tssMergeInstalled = true;

      function cp(m) { return { r: m.r, c: m.c, colspan: m.colspan, rowspan: m.rowspan || 1 }; }
      function snapshot() { return grid._merges ? grid._merges.map(cp) : null; }
      function restore(snap) { grid._merges = snap ? snap.map(cp) : null; }
      // 矩形の正規化（範囲外/1x1 は null）。重なり判定はせず、呼び出し側で扱う。
      function rectOf(r, c, colspan, rowspan) {
        r |= 0; c |= 0; colspan |= 0; rowspan = rowspan ? rowspan | 0 : 1;
        if (r < 0 || r >= grid.ROWS || c < 0 || c >= grid.COLS) return null;
        colspan = Math.min(colspan, grid.COLS - c);
        rowspan = Math.min(rowspan, grid.ROWS - r);
        if (colspan < 1 || rowspan < 1 || (colspan < 2 && rowspan < 2)) return null;   // 1x1 は結合でない
        return { r: r, c: c, colspan: colspan, rowspan: rowspan };
      }
      // 矩形 m と重なる既存結合の配列（飲み込み対象の特定に使う）。
      function overlapping(m) {
        return (grid._merges || []).filter(function (x) {
          var xrs = x.rowspan || 1;
          return !(m.c + m.colspan <= x.c || x.c + x.colspan <= m.c || m.r + m.rowspan <= x.r || x.r + xrs <= m.r);
        });
      }
      // 結合矩形のうちアンカー以外（従属セル）を列挙。値クリア／復元に使う。
      function coveredOf(m) {
        var out = [];
        for (var rr = m.r; rr < m.r + m.rowspan; rr++) for (var cc = m.c; cc < m.c + m.colspan; cc++) {
          if (rr === m.r && cc === m.c) continue;
          out.push({ r: rr, c: cc });
        }
        return out;
      }
      // do/undo を実行＋履歴へ。コア _structCmd と同形（手動実行→push、apply=redo / revert=undo）。
      function commit(doFn, undoFn, selR, selC) {
        doFn(); grid.buildTable(); grid.setActive(selR, selC);
        grid.history.push({
          label: grid.name || 'merge',
          apply: function () { doFn(); grid.buildTable(); grid.setActive(selR, selC); },
          revert: function () { undoFn(); grid.buildTable(); grid.setActive(selR, selC); },
        });
      }

      // (r,c) を起点に colspan×rowspan を結合。rowspan 省略=1（横結合）。成功で true。範囲外/1x1 は false。Undo 対応。
      // 既存結合と重なる時: absorb=true なら飲み込んで1つに（Excel流）／false（既定）は拒否して false。
      grid.setMerge = function (r, c, colspan, rowspan, absorb) {
        var m = rectOf(r, c, colspan, rowspan); if (!m) return false;
        if (overlapping(m).length && !absorb) return false;   // 重なりは既定では拒否（従来挙動）
        var before = snapshot(), cleared = [];   // 従属セルの値クリア＝undo で復元
        coveredOf(m).forEach(function (p) { if (grid.data[p.r][p.c] !== '') cleared.push({ r: p.r, c: p.c, val: grid.data[p.r][p.c] }); });
        commit(
          function () {
            var hh = overlapping(m);   // 飲み込む結合は do の度に現在の _merges から再計算（undo→redo でも正しい）
            if (hh.length) grid._merges = (grid._merges || []).filter(function (x) { return hh.indexOf(x) < 0; });
            for (var k = 0; k < cleared.length; k++) grid.data[cleared[k].r][cleared[k].c] = '';
            (grid._merges || (grid._merges = [])).push(cp(m));
          },
          function () { restore(before); for (var k = 0; k < cleared.length; k++) grid.data[cleared[k].r][cleared[k].c] = cleared[k].val; },
          m.r, m.c);
        return true;
      };

      // (r,c) を覆う結合を解除。解除したら true。Undo 対応（値は戻さない＝結合時に消えたまま）。
      grid.removeMerge = function (r, c) {
        if (!grid._merges) return false;
        var hit = null;
        for (var i = 0; i < grid._merges.length; i++) { var m = grid._merges[i], mrs = m.rowspan || 1; if (r >= m.r && r < m.r + mrs && c >= m.c && c < m.c + m.colspan) { hit = m; break; } }
        if (!hit) return false;
        var before = snapshot(), key = cp(hit);
        commit(
          function () { grid._merges = (grid._merges || []).filter(function (m) { return !(m.r === key.r && m.c === key.c && m.colspan === key.colspan && (m.rowspan || 1) === key.rowspan); }); if (!grid._merges.length) grid._merges = null; },
          function () { restore(before); },
          r, c);
        return true;
      };

      // 現在の選択範囲（矩形）を結合。既存結合を含む場合は飲み込んで1つに（Excel流）。1x1 のみの選択は false。
      grid.mergeSelection = function () {
        var rr = grid.rectRange();
        return grid.setMerge(rr.r0, rr.c0, rr.c1 - rr.c0 + 1, rr.r1 - rr.r0 + 1, true);
      };

      grid.getMerges = function () { return (grid._merges || []).map(cp); };

      // 全結合を解除。Undo 対応。
      grid.destroyMerged = function () {
        if (!grid._merges) return;
        var before = snapshot();
        commit(function () { grid._merges = null; }, function () { restore(before); }, grid.active.r, grid.active.c);
      };

      // 初期結合（履歴に積まない＝設定扱い）。範囲検証し、重なるものは無視、従属セルの値はクリア。
      (opts.merges || []).forEach(function (mm) {
        var m = rectOf(mm.r, mm.c, mm.colspan, mm.rowspan); if (!m || overlapping(m).length) return;
        coveredOf(m).forEach(function (p) { grid.data[p.r][p.c] = ''; });
        (grid._merges || (grid._merges = [])).push(m);
      });
      if (grid._merges) grid.buildTable();

      return {
        name: 'merge',
        destroy: function () {
          grid._merges = null;
          grid._tssMergeInstalled = false;
          delete grid.setMerge; delete grid.removeMerge; delete grid.mergeSelection;
          delete grid.getMerges; delete grid.destroyMerged;
          if (grid.table) grid.buildTable();
        },
      };
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TssMerge;
  else root.TssMerge = TssMerge;
})(typeof self !== 'undefined' ? self : this);
