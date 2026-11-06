/*! TssSort — ヘッダクリックで並べ替えUI。コアの sortBy / clearSort を呼ぶだけ。
 *
 *  各リーフ見出しに ▲▼ インジケータを出し、クリックで「昇順 → 降順 → 元の順（clearSort）」を1列で循環。
 *  値の並べ替え自体は grid.sortBy(c,'asc'|'desc') / grid.clearSort()（コア機能）。空行（minSpareRows）は
 *  コア仕様どおり常に最下部のまま。本体クリックの列選択は従来どおり活きる（選択を奪わない）。
 *  tss-filter と同時に付けても、▲▼（ソート）と漏斗（フィルタ）は別アイコンで並ぶ＝ぶつからない。
 *
 *  使い方:
 *    const grid = new TssGrid(el, { plugins: [ TssSort.plugin() ] });                 // 全リーフ列に ▲▼
 *    TssSort.plugin({ columns: ['createdAt', 'workDate'] });                           // 対象列を限定（data キー or index）
 *    TssSort.plugin({ initial: { col: 'createdAt', dir: 'desc' } });                   // 初期の並び
 *    TssSort.plugin({ iconOnly: true });                                               // ▲▼ の所だけで並べ替え（本体クリックは純粋に選択）
 *    grid.getPlugin('sort').clear();                                                   // 並べ替え解除（入力順へ）
 *    grid.getPlugin('sort').getState();                                               // { col, dir } または null
 *
 *  opts: columns（対象列の配列・省略=全リーフ列） / initial（{col, dir:'asc'|'desc'}） / iconOnly（既定 false）。
 *  メモ: 単一列ソート（多段は grid.sortByCols を直接）。onHeaderClick / onHeaderRender フックを「連鎖」して使う
 *        （既存の指定があれば保ちつつ上乗せ）。sortBy→再描画→onHeaderRender 再実行で ▲▼ の点灯も自動更新。
 */
(function (root) {
  'use strict';

  function plugin(opts) {
    opts = opts || {};
    const iconOnly = !!opts.iconOnly;
    return function (grid) {
      const cur = { col: -1, dir: null };   // dir: 'asc' | 'desc' | null（唯一の状態）

      // 対象列 index の集合（省略時は全リーフ列）
      const targets = (() => {
        if (!opts.columns) return null;   // null = 全列
        const s = new Set();
        opts.columns.forEach(k => { const ci = grid._resolveCol ? grid._resolveCol(k) : (typeof k === 'number' ? k : -1); if (ci >= 0) s.add(ci); });
        return s;
      })();
      const isTarget = c => !targets || targets.has(c);

      // 昇順 → 降順 → 元の順（clearSort）を1列で循環。
      function cycle(c) {
        if (cur.col !== c) { cur.col = c; cur.dir = 'asc'; grid.sortBy(c, 'asc'); }
        else if (cur.dir === 'asc') { cur.dir = 'desc'; grid.sortBy(c, 'desc'); }
        else { cur.col = -1; cur.dir = null; if (!grid.clearSort()) grid.redraw(); }
      }

      // ---- クリック（onHeaderClick を連鎖）----
      const prevClick = grid.onHeaderClick;
      grid.onHeaderClick = function (c, e) {
        // ソート対象で、漏斗(filter)以外のクリック。iconOnly なら ▲▼ の上だけ。
        const onFunnel = e && e.target && e.target.closest && e.target.closest('.tg-filter-btn');
        const onInd = e && e.target && e.target.closest && e.target.closest('.tg-sort-ind');
        if (isTarget(c) && !onFunnel && (!iconOnly || onInd)) cycle(c);
        // 既存の onHeaderClick を尊重（false なら列選択を抑止）。ソート自身は選択を奪わない。
        if (prevClick) { let r; try { r = prevClick.call(grid, c, e); } catch (_) {} if (r === false) return false; }
        return undefined;   // 列選択は今までどおり通す
      };

      // ---- ▲▼ インジケータ（onHeaderRender を連鎖。再描画毎に自動で付け直し）----
      const prevRender = grid.onHeaderRender;
      grid.onHeaderRender = function (th, c) {
        if (prevRender) { try { prevRender.call(grid, th, c); } catch (_) {} }
        if (!isTarget(c)) return;
        th.classList.add('tg-sortable');
        const dir = (c === cur.col) ? cur.dir : null;
        const ind = document.createElement('span');
        ind.className = 'tg-sort-ind' + (dir ? ' ' + dir : '');
        ind.innerHTML = '<span class="tg-sort-up"></span><span class="tg-sort-dn"></span>';
        th.appendChild(ind);
      };
      grid.root.classList.add('tg-has-sort');
      if (iconOnly) grid.root.classList.add('tg-sort-icononly');

      // 初期の並び
      if (opts.initial && opts.initial.col != null) {
        const ci = grid._resolveCol ? grid._resolveCol(opts.initial.col) : (typeof opts.initial.col === 'number' ? opts.initial.col : -1);
        if (ci >= 0 && isTarget(ci)) { cur.col = ci; cur.dir = opts.initial.dir === 'desc' ? 'desc' : 'asc'; grid.sortBy(ci, cur.dir); }
      }
      grid.buildTable();   // インジケータを反映（onHeaderRender 実行）

      return {
        name: 'sort',
        // 現在の並び { col:(dataキー or index), dir } または null
        getState: () => (cur.col >= 0 ? { col: (grid.columns[cur.col] && grid.columns[cur.col].data != null ? grid.columns[cur.col].data : cur.col), dir: cur.dir } : null),
        // プログラムから並べ替え（UIの点灯も同期）
        sortBy: (c, dir) => {
          const ci = grid._resolveCol ? grid._resolveCol(c) : (typeof c === 'number' ? c : -1);
          if (ci < 0 || !isTarget(ci)) return;
          cur.col = ci; cur.dir = dir === 'desc' ? 'desc' : 'asc'; grid.sortBy(ci, cur.dir);
        },
        clear: () => { cur.col = -1; cur.dir = null; if (!grid.clearSort()) grid.redraw(); },
        destroy: function () {
          grid.onHeaderClick = prevClick || null;
          grid.onHeaderRender = prevRender || null;
          grid.root.classList.remove('tg-has-sort', 'tg-sort-icononly');
          if (grid.table) grid.table.querySelectorAll('.tg-sort-ind').forEach(el => el.remove());
          if (grid.table) grid.table.querySelectorAll('th.tg-sortable').forEach(th => th.classList.remove('tg-sortable'));
          grid.buildTable();
        },
      };
    };
  }

  const TssSort = { plugin: plugin };
  if (typeof module !== 'undefined' && module.exports) module.exports = TssSort;
  else root.TssSort = TssSort;
})(typeof self !== 'undefined' ? self : this);
