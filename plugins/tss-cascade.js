/*! TssCascade — 多段（フライアウト）プルダウン。TssGrid カスタムエディタ（ポップアップ型）。
 *
 *  メニューのように「大分類 ▸ 中分類 ▸ 小分類」とフライアウトで開き、葉を選ぶとセルに確定。
 *  葉に `other:true` を付けると、その葉は「その他」＝選ぶと入力欄に切替わり、打った文字をセルに確定。
 *
 *  ── 2つの保存モード ───────────────────────────────────────────────
 *  (1) codeField 無し（従来）:
 *      葉の value（未指定なら label）を**値セルに**保存。表示は TssCascade.pathFormat でパスに。
 *      「その他」を選んだら、打った文字をそのまま値セルに保存。
 *  (2) codeField あり（コードと表示を分離・combo と同じ流儀）:
 *      ・値セル        … 普通の葉＝パス「有給 / 私用」／その他＝打った文字「通院」
 *      ・codeField セル … 普通の葉＝その葉の value／その他＝その「その他」ノードの value
 *      ＝「その他」が枝ごとにあっても（有給▸その他／午前休▸その他）、codeField を見れば
 *        どの枝の「その他」かが分かる（文字だけで親が消えない）。値は人が読む表示に使う。
 *
 *  使い方（勤怠の区分・枝ごとの「その他」コード）:
 *    const OPTS = [
 *      { label:'有給', children:[
 *        { label:'私用', value:'paid:personal' },
 *        { label:'その他', other:true, value:'paid:other' },   // ← この枝の「その他」コード
 *      ] },
 *      { label:'午前休', children:[
 *        { label:'私用', value:'am_half:personal' },
 *        { label:'その他', other:true, value:'am_half:other' },
 *      ] },
 *    ];
 *    columns: [
 *      { data:'categoryCode' },                                 // コード列（paid:other 等・hidden:true でも可）
 *      { data:'leaveReason', editor: TssCascade({
 *          options: OPTS,
 *          codeField: 'categoryCode',   // コードの書き戻し先（data キー or 列 index）
 *      }) },
 *    ]
 *    // 「有給 ▸ その他」で「通院」と入力 → leaveReason='通院' / categoryCode='paid:other'
 *
 *  opts:
 *    options     : 入れ子配列 [{ label, value?, children?, other? }]。必須。value 未指定の葉は label を保存。
 *    codeField   : コードの書き戻し先の列（data キー or index）。指定時はモード(2)。省略でモード(1)。
 *    separator   : 値セルに入れるパスの区切り（既定 ' / '）。pathFormat と合わせると良い。
 *    otherPlaceholder : 「その他」入力欄のプレースホルダ（既定 '自由入力'）。
 *    openOnClick : 既定 true（プルダウン同様シングルクリックで開く）。
 *    className   : ポップアップに付ける任意クラス。
 *  静的:
 *    TssCascade.pathFormat(options, { separator }) => (value)=>string   // 列 format 用（モード1の表示）
 *    TssCascade.pathOf(options, value, sep?) => string
 */
(function (root) {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function leafVal(n) { return n.value !== undefined ? n.value : n.label; }
  function isBranch(n) { return !n.other && n.children && n.children.length; }

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
    var codeField = opts.codeField;
    var sep = opts.separator || ' / ';
    var placeholder = opts.otherPlaceholder != null ? opts.otherPlaceholder : '自由入力';

    var panels = [];              // 開いているパネル(div)。panels[0]=root, [1]=sub, …
    var chosen = [];              // chosen[d] = 深さ d で降りた枝ノード（葉のパス復元に使う）
    var ctxRef = null, done = false, onDoc = null, onKey = null, composing = false;

    function teardown() {
      panels.forEach(function (p) { if (p.parentNode) p.parentNode.removeChild(p); });
      panels = []; chosen = [];
      if (onDoc) document.removeEventListener('mousedown', onDoc, true);
      if (onKey) document.removeEventListener('keydown', onKey, true);
      onDoc = onKey = null; composing = false;
    }
    function closeFrom(depth) { while (panels.length > depth) { var p = panels.pop(); if (p.parentNode) p.parentNode.removeChild(p); } if (chosen.length > depth) chosen.length = depth; }
    function doCancel() { if (done) return; done = true; var c = ctxRef; teardown(); c.cancel(); }

    // 書き戻し: 値セルは commit（履歴に積む）、codeField は別列へ setValueRaw（readOnly 貫通・独立undoを作らない）。
    function writeCode(code) {
      var c = ctxRef;
      if (codeField != null && c.grid && c.r != null) { try { c.grid.setValueRaw(c.r, codeField, code); } catch (e) {} }
    }
    // 普通の葉を確定。モード(2)は値＝パス／code＝葉value、モード(1)は値＝葉value（従来）。
    function commitLeaf(n, depth) {
      if (done) return; done = true;
      var c = ctxRef;
      var path = chosen.slice(0, depth).map(function (x) { return x.label; }).concat(n.label).join(sep);
      teardown();
      if (codeField != null) { c.commit(path); writeCode(leafVal(n)); }
      else c.commit(leafVal(n));
    }
    // 「その他」を確定。値＝打った文字／code＝その他ノードの value（枝ごとに違うコード）。
    function commitOther(n, text) {
      if (done) return; done = true;
      var c = ctxRef; teardown();
      c.commit(text);
      if (codeField != null) writeCode(leafVal(n));
    }

    function position(pop, anchor, depth) {
      var pw = pop.offsetWidth, ph = pop.offsetHeight, vw = window.innerWidth, vh = window.innerHeight, left, top;
      if (depth === 0) { left = anchor.left; top = anchor.bottom + 2; }
      else { left = anchor.right - 2; top = anchor.top - 4; }               // 親アイテムの右へフライアウト
      if (left + pw > vw - 6) left = depth === 0 ? Math.max(6, vw - pw - 6) : Math.max(6, anchor.left - pw + 2);  // 右端で左へフリップ
      if (top + ph > vh - 6) top = Math.max(6, vh - ph - 6);
      pop.style.left = Math.max(6, left) + 'px'; pop.style.top = top + 'px';
    }

    // 「その他」の入力パネル（submenu 相当・panels[depth+1] に積む＝外側クリックで閉じない）。
    function openInput(n, depth, anchor) {
      closeFrom(depth + 1);
      var pop = document.createElement('div');
      pop.className = 'tg-cascade tg-casc-inputpop' + (opts.className ? ' ' + opts.className : '');
      pop._isInput = true; pop._depth = depth + 1;
      pop.innerHTML = '<div class="tg-casc-inputwrap">' +
        '<input class="tg-casc-input" type="text" placeholder="' + esc(placeholder) + '">' +
        '<div class="tg-casc-actions"><button type="button" class="tg-casc-ok">確定</button>' +
        '<button type="button" class="tg-casc-back">戻る</button></div></div>';
      document.body.appendChild(pop);
      panels[depth + 1] = pop;
      position(pop, anchor, depth + 1);

      var input = pop.querySelector('.tg-casc-input');
      function back() { closeFrom(depth + 1); var pp = panels[depth]; if (pp && pp._active != null && pp._items[pp._active]) pp._items[pp._active].focus(); }
      input.addEventListener('compositionstart', function () { composing = true; });
      input.addEventListener('compositionend', function () { composing = false; });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { if (composing || e.isComposing || e.keyCode === 229) return; e.preventDefault(); commitOther(n, input.value); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); back(); }
      });
      pop.querySelector('.tg-casc-ok').addEventListener('mousedown', function (e) { e.preventDefault(); commitOther(n, input.value); });
      pop.querySelector('.tg-casc-back').addEventListener('mousedown', function (e) { e.preventDefault(); back(); });
      setTimeout(function () { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }, 0);
      return pop;
    }

    function openPanel(nodes, depth, anchor) {
      closeFrom(depth);
      var pop = document.createElement('div');
      pop.className = 'tg-cascade' + (opts.className ? ' ' + opts.className : '');
      pop.setAttribute('role', 'menu');
      pop.innerHTML = nodes.map(function (n, i) {
        var branch = isBranch(n), other = !!n.other;
        return '<div class="tg-casc-item' + (branch ? ' branch' : '') + (other ? ' tg-casc-other' : '') + '" data-i="' + i + '" role="menuitem" tabindex="-1">' +
          '<span class="tg-casc-label">' + esc(n.label) + (other ? '…' : '') + '</span>' + (branch ? '<span class="tg-casc-arrow">▸</span>' : '') + '</div>';
      }).join('');
      document.body.appendChild(pop);
      panels[depth] = pop;
      position(pop, anchor, depth);

      var items = pop.querySelectorAll('.tg-casc-item');
      pop._items = items; pop._active = null; pop._depth = depth;
      pop._activate = function (idx) { Array.prototype.forEach.call(items, function (el, k) { el.classList.toggle('active', k === idx); }); pop._active = idx; };
      pop._enter = function (idx, viaKey) {          // ホバー/→: 枝なら submenu を開く。葉/その他はそれ以上開かない。
        var n = nodes[idx]; if (!n) return; pop._activate(idx);
        if (isBranch(n)) {
          chosen[depth] = n;
          openPanel(n.children, depth + 1, items[idx].getBoundingClientRect());
          if (viaKey) { var sub = panels[depth + 1], f = sub._items[0]; if (f) { sub._activate(0); f.focus(); } }
        } else closeFrom(depth + 1);
      };
      pop._choose = function (idx) {                 // クリック/Enter: 枝→開く／その他→入力へ／葉→確定
        var n = nodes[idx]; if (!n) return;
        if (n.other) { pop._activate(idx); openInput(n, depth, items[idx].getBoundingClientRect()); }
        else if (isBranch(n)) pop._enter(idx, true);
        else commitLeaf(n, depth);
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
      if (pop._isInput) return;                       // 入力モードのキーは input 側で処理
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
