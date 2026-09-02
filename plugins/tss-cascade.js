/*! TssCascade — 多段（フライアウト）プルダウン。TssGrid カスタムエディタ（ポップアップ型）。
 *
 *  メニューのように「大分類 ▸ 中分類 ▸ 小分類」とフライアウトで開き、葉を選ぶとセルに確定。
 *  保存はその葉の value（未指定なら label）。表示は TssCascade.pathFormat で「大 / 中 / 小」のパスにできる。
 *
 *  使い方:
 *    const OPTS = [
 *      { label:'営業', children:[
 *        { label:'国内', children:[ {label:'東日本', value:'sales.jp.east'}, {label:'西日本', value:'sales.jp.west'} ] },
 *        { label:'海外', value:'sales.global' },
 *      ] },
 *      { label:'開発', children:[ … ] },
 *    ];
 *    columns: [
 *      { data:'category', editor: TssCascade({ options: OPTS }),
 *        format: TssCascade.pathFormat(OPTS) },   // 表示を「営業 / 国内 / 東日本」に（任意）
 *    ]
 *
 *  opts:
 *    options     : 入れ子配列 [{ label, value?, children? }]。必須。value 未指定の葉は label を保存。
 *    openOnClick : 既定 true（プルダウン同様シングルクリックで開く）。
 *    className   : ポップアップに付ける任意クラス。
 *  静的:
 *    TssCascade.pathFormat(options, { separator }) => (value)=>string   // 列 format 用
 *    TssCascade.pathOf(options, value, sep?) => string
 */
(function (root) {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function leafVal(n) { return n.value !== undefined ? n.value : n.label; }

  // 値 → ラベルのパス配列（[大, 中, 小]）。見つからなければ null。
  function findPath(nodes, value, trail) {
    trail = trail || [];
    for (var i = 0; i < (nodes || []).length; i++) {
      var n = nodes[i], t = trail.concat(n.label);
      if (n.children && n.children.length) { var r = findPath(n.children, value, t); if (r) return r; }
      else if (String(leafVal(n)) === String(value)) return t;
    }
    return null;
  }

  function TssCascade(opts) {
    opts = opts || {};
    var roots = opts.options || [];
    var panels = [];              // 開いているパネル(div)。panels[0]=root, [1]=sub, …
    var ctxRef = null, done = false, onDoc = null, onKey = null;

    function teardown() {
      panels.forEach(function (p) { if (p.parentNode) p.parentNode.removeChild(p); });
      panels = [];
      if (onDoc) document.removeEventListener('mousedown', onDoc, true);
      if (onKey) document.removeEventListener('keydown', onKey, true);
      onDoc = onKey = null;
    }
    function closeFrom(depth) { while (panels.length > depth) { var p = panels.pop(); if (p.parentNode) p.parentNode.removeChild(p); } }
    function commitLeaf(n) { if (done) return; done = true; var c = ctxRef; teardown(); c.commit(leafVal(n)); }
    function doCancel() { if (done) return; done = true; var c = ctxRef; teardown(); c.cancel(); }

    function position(pop, anchor, depth) {
      var pw = pop.offsetWidth, ph = pop.offsetHeight, vw = window.innerWidth, vh = window.innerHeight, left, top;
      if (depth === 0) { left = anchor.left; top = anchor.bottom + 2; }
      else { left = anchor.right - 2; top = anchor.top - 4; }               // 親アイテムの右へフライアウト
      if (left + pw > vw - 6) left = depth === 0 ? Math.max(6, vw - pw - 6) : Math.max(6, anchor.left - pw + 2);  // 右端で左へフリップ
      if (top + ph > vh - 6) top = Math.max(6, vh - ph - 6);
      pop.style.left = Math.max(6, left) + 'px'; pop.style.top = top + 'px';
    }

    function openPanel(nodes, depth, anchor) {
      closeFrom(depth);
      var pop = document.createElement('div');
      pop.className = 'tg-cascade' + (opts.className ? ' ' + opts.className : '');
      pop.setAttribute('role', 'menu');
      pop.innerHTML = nodes.map(function (n, i) {
        var branch = n.children && n.children.length;
        return '<div class="tg-casc-item' + (branch ? ' branch' : '') + '" data-i="' + i + '" role="menuitem" tabindex="-1">' +
          '<span class="tg-casc-label">' + esc(n.label) + '</span>' + (branch ? '<span class="tg-casc-arrow">▸</span>' : '') + '</div>';
      }).join('');
      document.body.appendChild(pop);
      panels[depth] = pop;
      position(pop, anchor, depth);

      var items = pop.querySelectorAll('.tg-casc-item');
      pop._items = items; pop._active = null; pop._depth = depth;
      pop._activate = function (idx) { Array.prototype.forEach.call(items, function (el, k) { el.classList.toggle('active', k === idx); }); pop._active = idx; };
      pop._enter = function (idx, viaKey) {          // 分岐なら submenu を開く（ホバー/→）。葉なら深いパネルを閉じる。
        var n = nodes[idx]; if (!n) return; pop._activate(idx);
        if (n.children && n.children.length) {
          openPanel(n.children, depth + 1, items[idx].getBoundingClientRect());
          if (viaKey) { var sub = panels[depth + 1], f = sub._items[0]; if (f) { sub._activate(0); f.focus(); } }
        } else closeFrom(depth + 1);
      };
      pop._choose = function (idx) {                 // クリック/Enter：分岐→開く、葉→確定
        var n = nodes[idx]; if (!n) return;
        if (n.children && n.children.length) pop._enter(idx, true); else commitLeaf(n);
      };
      Array.prototype.forEach.call(items, function (el) {
        var idx = +el.dataset.i;
        el.addEventListener('mouseenter', function () { pop._enter(idx, false); });
        el.addEventListener('click', function (e) { e.stopPropagation(); pop._choose(idx); });
      });
      return pop;
    }

    function handleKey(e) {
      var pop = panels[panels.length - 1]; if (!pop) return;
      var items = pop._items, idx = pop._active == null ? -1 : pop._active, n;
      if (e.key === 'ArrowDown') { e.preventDefault(); n = (idx + 1) % items.length; pop._activate(n); items[n].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); n = (idx - 1 + items.length) % items.length; pop._activate(n); items[n].focus(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); if (idx >= 0) pop._enter(idx, true); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); if (panels.length > 1) { closeFrom(panels.length - 1); var pp = panels[panels.length - 1]; if (pp._active != null) pp._items[pp._active].focus(); } }
      else if (e.key === 'Enter') { e.preventDefault(); if (idx >= 0) pop._choose(idx); }
      else if (e.key === 'Escape') { e.preventDefault(); doCancel(); }
    }

    return {
      openOnClick: opts.openOnClick !== false,
      open: function (ctx) {
        ctxRef = ctx; done = false;
        openPanel(roots, 0, ctx.td.getBoundingClientRect());
        onDoc = function (e) { for (var i = 0; i < panels.length; i++) if (panels[i].contains(e.target)) return; doCancel(); };
        onKey = handleKey;
        document.addEventListener('mousedown', onDoc, true);
        document.addEventListener('keydown', onKey, true);
        var f = panels[0]._items[0]; if (f) { panels[0]._activate(0); f.focus(); }
      },
      close: function () { teardown(); },
    };
  }

  TssCascade.pathFormat = function (options, o) {
    o = o || {}; var sep = o.separator || ' / ';
    return function (value) { if (value === '' || value == null) return ''; var p = findPath(options || [], value); return p ? p.join(sep) : String(value); };
  };
  TssCascade.pathOf = function (options, value, sep) { var p = findPath(options || [], value); return p ? p.join(sep || ' / ') : (value == null ? '' : String(value)); };

  if (typeof module !== 'undefined' && module.exports) module.exports = TssCascade;
  else root.TssCascade = TssCascade;
})(typeof self !== 'undefined' ? self : this);
