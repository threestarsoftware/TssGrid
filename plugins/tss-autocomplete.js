/*! TssAutocomplete — 候補サジェスト付きテキスト入力（TssGrid カスタムエディタ）。
 *
 *  自由入力＋候補の絞り込み。固定 dropdown の上位版（取引先名・商品名など「だいたい決まってるが新規もある」項目向け）。
 *  **IME変換中の Enter は奪わない**（変換確定が最優先＝TssGrid の流儀）。
 *
 *  使い方:
 *    columns: [ { data:'client', editor: TssAutocomplete({ source: ['三星商事','三星製作所', …] }) } ]
 *    // 動的候補: source: (query, {row,r,c,grid}) => string[]
 *
 *  opts:
 *    source   : string[] か (query, ctx)=>string[]。必須。
 *    strict   : true=候補から選んだ値のみ許可（既定 false=自由入力可）。
 *    minChars : この文字数以上で候補を出す（既定 0＝開いた時点で全件）。
 *    max      : 候補表示の最大件数（既定 20）。
 *    match    : 'includes'(既定) | 'startsWith' | (item, query)=>bool。大文字小文字は無視。
 *    openOnClick: 既定 true（プルダウン同様シングルクリックで開く）。
 *    icon     : セル右の目印（既定 '▾'）。className: ポップアップに付ける任意クラス。
 */
(function (root) {
  'use strict';
  function norm(s) { return String(s == null ? '' : s).toLowerCase(); }

  function TssAutocomplete(opts) {
    opts = opts || {};
    var getSource = typeof opts.source === 'function' ? opts.source : function () { return opts.source || []; };
    var strict = !!opts.strict;
    var minChars = opts.minChars || 0;
    var max = opts.max || 20;
    var matcher = (typeof opts.match === 'function') ? opts.match
      : (opts.match === 'startsWith' ? function (it, q) { return norm(it).indexOf(q) === 0; }
        : function (it, q) { return norm(it).indexOf(q) >= 0; });

    var pop, input, list, items = [], hi = -1, composing = false, ref = null, done = false, outside = null;

    function filter(q) {
      var ctx = ref ? ref.ctx : {};
      var src = getSource(q, { row: grid_row(ctx), r: ctx.r, c: ctx.c, grid: ctx.grid }) || [];
      var nq = norm(q);
      var out = [];
      for (var i = 0; i < src.length && out.length < max; i++) {
        if (nq.length < minChars) { out.push(src[i]); continue; }
        if (nq === '' || matcher(src[i], nq)) out.push(src[i]);
      }
      return out;
    }
    function grid_row(ctx) { try { return ctx.grid.getRow(ctx.r); } catch (e) { return null; } }

    function render() {
      var q = input.value;
      items = filter(q);
      hi = items.length ? 0 : -1;
      list.innerHTML = items.map(function (it, i) {
        return '<div class="tss-ac-item' + (i === hi ? ' hi' : '') + '" data-i="' + i + '">' + esc(it) + '</div>';
      }).join('');
      list.style.display = items.length ? 'block' : 'none';
    }
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function moveHi(d) {
      if (!items.length) return;
      hi = (hi + d + items.length) % items.length;
      var els = list.querySelectorAll('.tss-ac-item');
      for (var i = 0; i < els.length; i++) els[i].className = 'tss-ac-item' + (i === hi ? ' hi' : '');
      if (els[hi]) els[hi].scrollIntoView({ block: 'nearest' });
    }
    function chosenValue() {
      if (hi >= 0 && items[hi] != null) return items[hi];      // 候補ハイライトを採用
      if (strict) return null;                                  // strict は候補必須
      return input.value;                                       // 自由入力を採用
    }
    function onKey(e) {
      if (e.key === 'ArrowDown') { if (composing || e.isComposing) return; e.preventDefault(); moveHi(1); }
      else if (e.key === 'ArrowUp') { if (composing || e.isComposing) return; e.preventDefault(); moveHi(-1); }
      else if (e.key === 'Enter') {
        if (composing || e.isComposing) return;                 // ★ IME変換確定の Enter は奪わない
        e.preventDefault();
        var v = chosenValue(); if (v == null) return;           // strict で候補なし＝確定しない
        commit(v);
      } else if (e.key === 'Tab') {
        var t = chosenValue(); if (t != null) { e.preventDefault(); commit(t); }
      } else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    }
    function place(anchor) {
      var r = anchor.getBoundingClientRect();
      pop.style.left = Math.max(2, Math.min(r.left, window.innerWidth - pop.offsetWidth - 6)) + 'px';
      var top = r.bottom + 1;
      if (top + 220 > window.innerHeight) top = Math.max(2, r.top - 4 - Math.min(220, list.offsetHeight + input.offsetHeight));
      pop.style.top = top + 'px';
      pop.style.minWidth = r.width + 'px';
    }
    function show(anchor, value, ctx) {
      teardown();   // 既に開いていれば先に片付ける（open-while-open の取り残し防止・tss-calendar と同方針）
      done = false; ref = { ctx: ctx };
      pop = document.createElement('div'); pop.className = 'tss-ac' + (opts.className ? ' ' + opts.className : ''); pop.tabIndex = -1;
      pop.innerHTML = '<input class="tss-ac-input" type="text"><div class="tss-ac-list"></div>';
      document.body.appendChild(pop);
      input = pop.querySelector('.tss-ac-input'); list = pop.querySelector('.tss-ac-list');
      input.value = value == null ? '' : value;
      input.addEventListener('compositionstart', function () { composing = true; });
      input.addEventListener('compositionend', function () { composing = false; render(); });   // 変換確定後に候補更新
      input.addEventListener('input', function () { if (!composing) render(); });
      input.addEventListener('keydown', onKey);
      list.addEventListener('mousedown', function (e) { var it = e.target.closest('.tss-ac-item'); if (it) { e.preventDefault(); commit(items[+it.dataset.i]); } });
      render(); place(anchor);
      outside = function (e) { if (pop && !pop.contains(e.target) && !(anchor && anchor.contains && anchor.contains(e.target))) { var v = chosenOnOutside(); if (v == null) cancel(); else commit(v); } };
      setTimeout(function () { document.addEventListener('mousedown', outside, true); }, 0);
      input.focus(); input.setSelectionRange(input.value.length, input.value.length);
    }
    function chosenOnOutside() { if (strict) { var v = input.value; var src = getSource(v, {}) || []; return src.indexOf(v) >= 0 ? v : null; } return input.value; }
    function teardown() { if (outside) { document.removeEventListener('mousedown', outside, true); outside = null; } if (pop) { pop.remove(); pop = null; } items = []; hi = -1; composing = false; }
    function commit(v) { if (done) return; done = true; var f = ref.ctx.commit; teardown(); f(v); }
    function cancel() { if (done) return; done = true; var f = ref.ctx.cancel; teardown(); if (f) f(); }

    return {
      openOnClick: opts.openOnClick !== false,
      icon: opts.icon != null ? opts.icon : '▾',
      open: function (ctx) { show(ctx.td, ctx.value, ctx); },
      close: function () { teardown(); },
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = TssAutocomplete;
  else root.TssAutocomplete = TssAutocomplete;
})(typeof self !== 'undefined' ? self : this);
