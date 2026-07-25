/*! TssFilter — ヘッダのオートフィルタUI（Excel風）。コアの非破壊 filter() を呼ぶだけ。
 *
 *  各リーフ見出しにロート(漏斗)アイコンを出し（ソートの▲▼と区別）、クリックでポップアップ。
 *  モード切替で「値を選択（Excel風チェックリスト・完全一致）／部分一致／前方一致」を選べる（列ごと独立）。
 *  複数列の条件は AND。適用は grid.filter(pred)／全解除で grid.clearFilter()。フィルタ済み列は印が付く。
 *  ※部分/前方一致は caseSensitive:false（既定）で大小無視。「値を選択」は文字列の完全一致（大小区別）。
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

      // active[c] は「Set（値を選択＝完全一致メンバーシップ）」か「{mode:'contains'|'prefix', q}（テキスト一致）」のどちらか。
      function buildPredicate() {
        const cols = Object.keys(active).map(Number).filter(c => active[c]);
        if (!cols.length) return null;
        const cs = !!opts.caseSensitive;
        const norm = s => cs ? String(s) : String(s).toLowerCase();
        return row => cols.every(c => {
          const a = active[c], v = String(row[c]);
          if (a instanceof Set) return a.has(v);                             // 値を選択（大小区別の完全一致）
          const hay = norm(v), q = norm(a.q);                                // テキスト一致（既定 大小無視・caseSensitive で区別）
          return a.mode === 'prefix' ? hay.startsWith(q) : hay.indexOf(q) >= 0;
        });
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
        const cur = active[c];
        const curMode = (cur && !(cur instanceof Set)) ? cur.mode : 'set';   // 現在の条件からモードを復元
        const allowed = (cur instanceof Set) ? cur : new Set(vals);          // 「値を選択」モードのチェック初期状態（未設定=全許可）
        pop = document.createElement('div');
        pop.className = 'tg-filter-pop';
        pop.innerHTML =
          '<div class="tg-filter-mode"><a data-mode="set">値を選択</a><a data-mode="contains">部分一致</a><a data-mode="prefix">前方一致</a></div>' +
          '<div class="tg-filter-text"><input type="text" placeholder="文字を入力…"></div>' +
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
        const textBox = pop.querySelector('.tg-filter-text');
        const textInput = textBox.querySelector('input');

        // モード切替: 'set'=値チェックリスト／'contains'|'prefix'=テキスト入力。表示を出し分ける。
        let mode = curMode;
        function showMode(m) {
          mode = m;
          pop.querySelectorAll('.tg-filter-mode a').forEach(a => a.classList.toggle('on', a.dataset.mode === m));
          const isSet = m === 'set';
          textBox.style.display = isSet ? 'none' : '';
          pop.querySelector('.tg-filter-search').style.display = isSet ? '' : 'none';
          pop.querySelector('.tg-filter-tools').style.display = isSet ? '' : 'none';
          list.style.display = isSet ? '' : 'none';
          (isSet ? search : textInput).focus();
        }
        pop.querySelectorAll('.tg-filter-mode a').forEach(a => a.onclick = () => showMode(a.dataset.mode));
        if (curMode !== 'set') textInput.value = cur.q;
        showMode(curMode);

        search.oninput = () => {
          const q = search.value.trim().toLowerCase();
          list.querySelectorAll('label').forEach(l => { l.style.display = (!q || l.textContent.toLowerCase().indexOf(q) >= 0) ? '' : 'none'; });
        };
        pop.querySelector('[data-act=all]').onclick = () => list.querySelectorAll('label:not([style*="none"]) input').forEach(cb => cb.checked = true);
        pop.querySelector('[data-act=none]').onclick = () => list.querySelectorAll('label:not([style*="none"]) input').forEach(cb => cb.checked = false);
        function doApply() {
          if (mode === 'set') {
            const checked = [...list.querySelectorAll('input:checked')].map(cb => cb.value);
            if (checked.length === vals.length) delete active[c];        // 全選択＝この列は無条件
            else active[c] = new Set(checked);
          } else {
            const q = textInput.value.trim();
            if (!q) delete active[c]; else active[c] = { mode: mode, q: q };   // 空欄＝無条件
          }
          closePop(); apply();
        }
        pop.querySelector('[data-act=apply]').onclick = doApply;
        textInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doApply(); } });
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
