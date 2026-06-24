/*! TssFilter — ヘッダのオートフィルタUI（Excel風）。コアの非破壊 filter() を呼ぶだけ。
 *
 *  各リーフ見出しにロート(漏斗)アイコンを出し（ソートの▲▼と区別）、クリックで「値チェックリスト＋絞り込み検索」ポップアップ。
 *  複数列の条件は AND。適用は grid.filter(pred)／全解除で grid.clearFilter()。フィルタ済み列は印が付く。
 *
 *  使い方:
 *    const grid = new TssGrid(el, { plugins: [ TssFilter.plugin() ] });   // 全列にフィルタUI
 *    TssFilter.plugin({ columns: ['部署', 2] });                          // 対象列を限定（data キー or index）
 *    grid.getPlugin('filter').clearAll();                                  // 全条件クリア
 *
 *  opts: columns（対象列の配列・省略=全列） / caseSensitive（既定 false・値一致は文字列）。
 *  メモ: 値候補はマスタ全行(_allRows)から集計＝絞り込み中でも全値が出る。grid.filter() は履歴クリア（コア仕様）。
 */
(function (root) {
  'use strict';
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  // ロート（漏斗＝filter）アイコン。currentColor で .on の色替えに追従。ソートの▼と区別。
  const FUNNEL = '<svg class="tg-filter-ico" viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M1.5 3h13l-5 6v4.2l-3-1.6V9z" fill="currentColor"/></svg>';

  function plugin(opts) {
    opts = opts || {};
    return function (grid) {
      const active = {};            // colIndex -> Set(許可する値文字列)
      let pop = null, popCol = -1;

      // 対象列 index の集合（省略時は全列）
      const targets = (() => {
        if (!opts.columns) return null;   // null = 全列
        const s = new Set();
        opts.columns.forEach(k => { const ci = grid._resolveCol ? grid._resolveCol(k) : (typeof k === 'number' ? k : -1); if (ci >= 0) s.add(ci); });
        return s;
      })();
      const isTarget = c => !targets || targets.has(c);

      // マスタ全行（フィルタ中でも全件）から列 c の重複なし値（出現順）。
      function distinctValues(c) {
        const rows = grid._allRows || grid.data, seen = new Set(), out = [];
        for (const row of rows) { const v = String(row[c]); if (!seen.has(v)) { seen.add(v); out.push(v); } }
        return out;
      }

      function buildPredicate() {
        const cols = Object.keys(active).map(Number).filter(c => active[c]);
        if (!cols.length) return null;
        return row => cols.every(c => active[c].has(String(row[c])));
      }
      function apply() {
        const p = buildPredicate();
        if (p) grid.filter(p); else grid.clearFilter();
        decorate();
      }
      grid.clearAllFilters = function () { for (const k in active) delete active[k]; apply(); };

      // ---- ヘッダ装飾（buildTable をラップして毎回付け直す） ----
      function decorate() {
        const ths = grid.table ? grid.table.querySelectorAll('thead th[data-c]') : [];
        ths.forEach(th => {
          const c = +th.dataset.c;
          let btn = th.querySelector('.tg-filter-btn');
          if (!isTarget(c)) { if (btn) btn.remove(); return; }
          if (!btn) { btn = document.createElement('span'); btn.className = 'tg-filter-btn'; btn.innerHTML = FUNNEL; th.appendChild(btn); }
          btn.dataset.fc = c;
          btn.classList.toggle('on', !!active[c]);
        });
      }
      const origBuild = grid.buildTable.bind(grid);
      grid.buildTable = function () { origBuild(); decorate(); };

      // ---- ポップアップ ----
      function closePop() { if (pop) { pop.remove(); pop = null; popCol = -1; } }
      function openPop(c, anchor) {
        closePop();
        popCol = c;
        const vals = distinctValues(c);
        const allowed = active[c] || new Set(vals);   // 未設定なら全許可
        pop = document.createElement('div');
        pop.className = 'tg-filter-pop';
        pop.innerHTML =
          '<div class="tg-filter-search"><input type="text" placeholder="値を検索…"></div>' +
          '<div class="tg-filter-tools"><a data-act="all">すべて</a> / <a data-act="none">解除</a></div>' +
          '<div class="tg-filter-list">' +
          vals.map(v => '<label><input type="checkbox" value="' + esc(v) + '"' + (allowed.has(v) ? ' checked' : '') + '><span>' + (v === '' ? '(空白)' : esc(v)) + '</span></label>').join('') +
          '</div>' +
          '<div class="tg-filter-btns"><button data-act="apply">適用</button><button data-act="clear">クリア</button></div>';
        document.body.appendChild(pop);
        // 位置（アンカーの下・はみ出しは画面内へ）
        const r = anchor.getBoundingClientRect();
        const pw = 220, ph = Math.min(320, pop.offsetHeight || 300);
        let left = r.left, top = r.bottom + 2;
        if (left + pw > window.innerWidth - 6) left = window.innerWidth - pw - 6;
        if (top + ph > window.innerHeight - 6) top = Math.max(6, r.top - ph - 2);
        pop.style.left = Math.max(6, left) + 'px'; pop.style.top = top + 'px';

        const search = pop.querySelector('.tg-filter-search input');
        const list = pop.querySelector('.tg-filter-list');
        search.focus();
        search.oninput = () => {
          const q = search.value.trim().toLowerCase();
          list.querySelectorAll('label').forEach(l => { l.style.display = (!q || l.textContent.toLowerCase().indexOf(q) >= 0) ? '' : 'none'; });
        };
        pop.querySelector('[data-act=all]').onclick = () => list.querySelectorAll('label:not([style*="none"]) input').forEach(cb => cb.checked = true);
        pop.querySelector('[data-act=none]').onclick = () => list.querySelectorAll('label:not([style*="none"]) input').forEach(cb => cb.checked = false);
        pop.querySelector('[data-act=apply]').onclick = () => {
          const checked = [...list.querySelectorAll('input:checked')].map(cb => cb.value);
          if (checked.length === vals.length) delete active[c];        // 全選択＝この列は無条件
          else active[c] = new Set(checked);
          closePop(); apply();
        };
        pop.querySelector('[data-act=clear]').onclick = () => { delete active[c]; closePop(); apply(); };
      }

      function onHeadClick(e) {
        const btn = e.target.closest && e.target.closest('.tg-filter-btn');
        if (!btn) return;
        e.stopPropagation(); e.preventDefault();
        const c = +btn.dataset.fc;
        if (pop && popCol === c) { closePop(); return; }   // トグル
        openPop(c, btn);
      }
      function onDocDown(e) { if (pop && !pop.contains(e.target) && !(e.target.closest && e.target.closest('.tg-filter-btn'))) closePop(); }

      grid.table.addEventListener('mousedown', onHeadClick, true);   // sort等より先に拾う（capture）
      document.addEventListener('mousedown', onDocDown);
      decorate();

      return {
        name: 'filter',
        clearAll: () => grid.clearAllFilters(),
        destroy: function () {
          closePop();
          grid.table.removeEventListener('mousedown', onHeadClick, true);
          document.removeEventListener('mousedown', onDocDown);
          grid.buildTable = origBuild;
          delete grid.clearAllFilters;
          for (const k in active) delete active[k];
          if (grid.isFiltered && grid.isFiltered()) grid.clearFilter();
          if (grid.table) grid.table.querySelectorAll('.tg-filter-btn').forEach(b => b.remove());
        },
      };
    };
  }

  const TssFilter = { plugin: plugin };
  if (typeof module !== 'undefined' && module.exports) module.exports = TssFilter;
  else root.TssFilter = TssFilter;
})(typeof self !== 'undefined' ? self : this);
