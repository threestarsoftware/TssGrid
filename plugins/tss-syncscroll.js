/*! TssSyncScroll — 複数グリッドの同期スクロール（Excel「並べて比較＋同時にスクロール」相当）。
 *
 *  左右（or 上下）に並べた 2枚以上のグリッドのスクロールを連動。A系/B系で別々に絞り込んだ表を
 *  突き合わせながら編集する用途に。`grid.wrap`(overflow:auto のスクロール枠) の scroll を相手へ転写。
 *
 *  使い方:
 *    const link = TssSyncScroll.link([gridA, gridB]);                    // 既定: 相対・縦横ピクセル
 *    const link = TssSyncScroll.link([gA, gB], { by:'row' });            // 行で揃える
 *    const link = TssSyncScroll.link([gA, gB], { relative:false });      // 絶対(スナップして一致)
 *    link.unlink();                                                      // 連動解除（リスナ除去）
 *
 *  opts:
 *    relative: true(既定) — **ONにした時点の位置差を保ったまま、移動量(delta)だけ連動**（Excel流）。
 *                          連動OFF→片方スクロール→ONでも"その場から"続けて同期できる。
 *              false      — 絶対。常に相手をこちらに合わせてスナップ（pixel:同じ量 / row:同じ行index）。
 *    axis: 'both'(既定) | 'vertical' | 'horizontal'
 *    by:   'pixel'(既定・スクロール量) | 'row'(相手の同じ行を基準に揃える。コアの _rowTops を使用＝行高が違っても可)
 *
 *  メモ: 縦の連動量は by='row' なら行index、'pixel' なら px。横は常に px。フィードバックは
 *        「自分が動かした相手の echo は一度無視＋値が変わった時だけ動かす」で防止＋収束。
 */
(function (root) {
  'use strict';

  // scrollTop から「ヘッダ直下に見えている本体行」index（二分探索）。
  function rowAtTop(g) {
    var T = g._rowTops; if (!T) return 0;
    var target = (g.wrap.scrollTop || 0) + (g._theadH || 0);
    var lo = 0, hi = g.ROWS;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (T[mid] < target) lo = mid + 1; else hi = mid; }
    return Math.max(0, Math.min(lo, g.ROWS - 1));
  }
  // 行 r をヘッダ直下に揃える scrollTop（クランプ）。
  function topForRow(g, r) {
    var T = g._rowTops; if (!T) return null;
    r = Math.max(0, Math.min(Math.round(r), g.ROWS - 1));
    var top = (T[r] || 0) - (g._theadH || 0);
    var max = g.wrap.scrollHeight - g.wrap.clientHeight;
    return Math.max(0, Math.min(top, max < 0 ? 0 : max));
  }

  var TssSyncScroll = {
    link: function (grids, opts) {
      grids = (grids || []).filter(Boolean);
      opts = opts || {};
      var axis = opts.axis || 'both';
      var byRow = opts.by === 'row';
      var relative = opts.relative !== false;   // 既定 true
      var vert = axis === 'both' || axis === 'vertical';
      var horiz = axis === 'both' || axis === 'horizontal';

      // 縦の「同期座標」: row なら行index、pixel なら scrollTop。横は常に scrollLeft。
      function readV(g) { return byRow ? rowAtTop(g) : g.wrap.scrollTop; }
      // px 代入はブラウザが範囲内に自動クランプするので手動クランプ不要（値が変わる時だけ ignore を立てる）。
      function setScrollTop(st, px) { px = Math.round(px); if (st.g.wrap.scrollTop !== px) { st.ignore = true; st.g.wrap.scrollTop = px; } }
      function setScrollLeft(st, px) { px = Math.round(px); if (st.g.wrap.scrollLeft !== px) { st.ignore = true; st.g.wrap.scrollLeft = px; } }
      function writeV(st, v) { if (byRow) { var t = topForRow(st.g, v); if (t != null) setScrollTop(st, t); } else setScrollTop(st, v); }

      var states = grids.map(function (g) { return { g: g, ignore: false, v: readV(g), left: g.wrap.scrollLeft, onScroll: null }; });

      states.forEach(function (st) {
        st.onScroll = function () {
          if (st.ignore) { st.ignore = false; st.v = readV(st.g); st.left = st.g.wrap.scrollLeft; return; }   // 自分が動かされた echo
          if (relative) {
            var dV = readV(st.g) - st.v, dL = st.g.wrap.scrollLeft - st.left;   // 移動量だけ伝える＝位置差を保つ
            st.v = readV(st.g); st.left = st.g.wrap.scrollLeft;
            states.forEach(function (dst) {
              if (dst === st) return;
              if (vert && dV) { writeV(dst, dst.v + dV); dst.v = readV(dst.g); }
              if (horiz && dL) { setScrollLeft(dst, dst.g.wrap.scrollLeft + dL); dst.left = dst.g.wrap.scrollLeft; }
            });
          } else {
            var v = readV(st.g), l = st.g.wrap.scrollLeft;                      // 絶対＝相手をこちらに合わせる
            states.forEach(function (dst) {
              if (dst === st) return;
              if (vert) writeV(dst, v);
              if (horiz) setScrollLeft(dst, l);
            });
          }
        };
        st.g.wrap.addEventListener('scroll', st.onScroll, { passive: true });
      });

      return {
        grids: grids,
        // 現在位置を基準として取り直す（相対モードで明示的に"今の差"を基準化したい時に）。
        rebase: function () { states.forEach(function (st) { st.v = readV(st.g); st.left = st.g.wrap.scrollLeft; }); },
        unlink: function () { states.forEach(function (st) { st.g.wrap.removeEventListener('scroll', st.onScroll); }); states = []; },
      };
    },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TssSyncScroll;
  else root.TssSyncScroll = TssSyncScroll;
})(typeof self !== 'undefined' ? self : this);
