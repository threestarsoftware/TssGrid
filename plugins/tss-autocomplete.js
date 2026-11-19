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
 *    inline   : 「セルに打ちながら絞る」型（**既定 true**）。本体の共有 input に乗る＝**打鍵の1文字目も IME 直打ちも
 *               素のテキスト列と同じに効く**（自前 input を作らず focus も奪わない）。
 *               inline:false でポップアップの自前 input を開く旧型に戻せるが、**セルにいきなり打ち始めて上書き**が
 *               できなくなる（＝クリック/F2 で開いてから打つ）。表計算で一番よく使う操作を捨てる選択なので非推奨。
 *    strict   : true=候補から選んだ値のみ許可（既定 false=自由入力可）。
 *    minChars : この文字数以上で候補を出す（既定 0＝開いた時点で全件）。
 *    max      : 候補表示の最大件数（既定 20）。
 *    match    : 'includes'(既定) | 'startsWith' | (item, query)=>bool。大文字小文字は無視。
 *    openOnClick: 既定 true（プルダウン同様シングルクリックで開く）。
 *    icon     : セル右の目印（既定 '▾'）。className: ポップアップに付ける任意クラス。
 */
(function (root) {
  'use strict';
  // ---- 小窓の置き場所（tss-calendar / time / datetime / cascade / combo / autocomplete で同じ中身。直す時は全部）----
  // anchor の下（入らなければ上・どちらにも入らなければ広いほう）。見えている範囲（visualViewport＝スマホのキーボードを
  // 除いた所）に収め、ページ/表のスクロール・画面の向き・キーボードの出入り・小窓の大きさの変化に付いていく。
  // o.side:'right'＝右へ（多段の子）。o.fit＝入らない時は高さを縮めて中をスクロール（一覧向け＝欄に重ならない）。
  // o.onLost＝anchor が見える範囲から外れた時（単体で開いた時に閉じる用）。anchor は要素か、要素を返す関数。戻り値 { update, destroy }。
  function tssPlace(pop, anchor, o) {
    o = o || {};
    var W = window, vv = W.visualViewport, raf = 0, alive = true, ro = null, first = true;
    function place() {
      raf = 0; if (!alive || !pop.isConnected) return;
      var a = typeof anchor === 'function' ? anchor() : anchor;
      if (!a || !a.isConnected) return;
      var b = a.getBoundingClientRect(), m = 6, g = o.gap != null ? o.gap : 2;
      var V = vv ? { l: vv.offsetLeft, t: vv.offsetTop, w: vv.width, h: vv.height } : { l: 0, t: 0, w: W.innerWidth, h: W.innerHeight };
      if (o.onLost && !first && (b.bottom <= V.t || b.top >= V.t + V.h)) { o.onLost(); return; }   // 開いた瞬間は閉じない（開いた側の処理の途中で消えないように）
      var T = V.t + m, B = V.t + V.h - m, L = V.l + m, R = V.l + V.w - m;
      var st = pop.scrollTop; if (o.fit) pop.style.maxHeight = '';
      var w = pop.offsetWidth, h = pop.offsetHeight, top, left;
      if (o.side === 'right') {
        left = b.right - 2; if (left + w > R) left = b.left - w + 2;
        top = b.top - 4;
      } else {
        var below = B - b.bottom - g, above = b.top - g - T, down = h <= below || (h > above && below >= above);
        if (o.fit && h > (down ? below : above)) { pop.style.maxHeight = Math.max(60, down ? below : above) + 'px'; h = pop.offsetHeight; }
        top = down ? b.bottom + g : b.top - g - h;
        left = b.left; if (left + w > R) left = R - w;
      }
      pop.style.top = Math.max(T, Math.min(top, B - h)) + 'px';
      pop.style.left = Math.max(L, left) + 'px';
      if (o.fit && st) pop.scrollTop = st;
    }
    function req(e) {
      if (e && e.type === 'scroll' && e.target && e.target.nodeType === 1 && pop.contains(e.target)) return;   // 小窓の中のスクロールは無関係
      if (!raf) raf = W.requestAnimationFrame(place);
    }
    W.addEventListener('scroll', req, true); W.addEventListener('resize', req);
    if (vv) { vv.addEventListener('resize', req); vv.addEventListener('scroll', req); }
    if (W.ResizeObserver) { ro = new W.ResizeObserver(function () { req(); }); ro.observe(pop); }   // 中身が変わって大きさが変わった（月送り・候補の絞り込み等）
    place(); first = false;
    return {
      update: place,
      destroy: function () {
        alive = false; if (raf) W.cancelAnimationFrame(raf); raf = 0; if (ro) ro.disconnect();
        W.removeEventListener('scroll', req, true); W.removeEventListener('resize', req);
        if (vv) { vv.removeEventListener('resize', req); vv.removeEventListener('scroll', req); }
      }
    };
  }
  // 表の中で開いた時の anchor＝今のセル（表のスクロール・描き直しでセルの要素が替わっても追う）。単体の時は渡された要素。
  function tssAnchor(el, ctx) {
    if (!(ctx && ctx.grid && ctx.grid.cellEl && ctx.r != null)) return el;
    return function () { var t = null; try { t = ctx.grid.cellEl(ctx.r, ctx.c); } catch (e) {} return (t && t.isConnected) ? t : el; };
  }
  // 単体で開く時: ほかの文字欄のキーボードを閉じる（出たままだと小窓がキーボードの裏に開く）。
  function tssBlurOther(el) {
    var ae = document.activeElement;
    if (ae && ae !== el && !(el && el.contains && el.contains(ae)) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) { try { ae.blur(); } catch (e) {} }
  }
  function norm(s) { return String(s == null ? '' : s).toLowerCase(); }

  function TssAutocomplete(opts) {
    opts = opts || {};
    var inline = opts.inline !== false;   // true=共有 input に乗る（打鍵/IME直打ちが効く）／false=従来の自前 input ポップアップ
    var getSource = typeof opts.source === 'function' ? opts.source : function () { return opts.source || []; };
    var strict = !!opts.strict;
    var minChars = opts.minChars || 0;
    var max = opts.max || 20;
    var matcher = (typeof opts.match === 'function') ? opts.match
      : (opts.match === 'startsWith' ? function (it, q) { return norm(it).indexOf(q) === 0; }
        : function (it, q) { return norm(it).indexOf(q) >= 0; });

    var pop, input, list, items = [], hi = -1, composing = false, ref = null, done = false, outside = null, unbindComp = null;

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
    // IME 変換中か（inline では本体の共有 input 上のキーを受けるので keyCode 229 も見る）
    function imeOn(e) { return composing || e.isComposing || e.keyCode === 229; }
    function onKey(e) {
      if (e.key === 'ArrowDown') { if (imeOn(e)) return; e.preventDefault(); moveHi(1); }
      else if (e.key === 'ArrowUp') { if (imeOn(e)) return; e.preventDefault(); moveHi(-1); }
      else if (e.key === 'Enter') {
        if (imeOn(e)) return;                                   // ★ IME変換確定の Enter は奪わない
        e.preventDefault();
        var v = chosenValue(); if (v == null) return;           // strict で候補なし＝確定しない
        commit(v);
      } else if (e.key === 'Tab') {
        var t = chosenValue(); if (t != null) { e.preventDefault(); commit(t); }
      } else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    }
    var placer = null;   // 小窓の置き場所（tssPlace）
    function show(anchor, value, ctx) {
      teardown();   // 既に開いていれば先に片付ける（open-while-open の取り残し防止・tss-calendar と同方針）
      done = false; ref = { ctx: ctx };
      pop = document.createElement('div'); pop.className = 'tss-ac' + (opts.className ? ' ' + opts.className : ''); pop.tabIndex = -1;
      // inline は候補リストだけ（自前 input を作らない＝打鍵/IME は本体の共有 input のまま）
      pop.innerHTML = (inline ? '' : '<input class="tss-ac-input" type="text">') + '<div class="tss-ac-list"></div>';
      document.body.appendChild(pop);
      list = pop.querySelector('.tss-ac-list');
      if (inline) {
        input = ctx.input;                    // ★ 打鍵/IME が入る本体の共有 input をそのまま参照（値は本体が持つ）
        // 変換中は候補を更新しない（classic と同じ挙動）。確定後に更新。
        var cs = function () { composing = true; }, ce = function () { composing = false; render(); };
        input.addEventListener('compositionstart', cs);
        input.addEventListener('compositionend', ce);
        unbindComp = function () { input.removeEventListener('compositionstart', cs); input.removeEventListener('compositionend', ce); };
      } else {
        input = pop.querySelector('.tss-ac-input');
        input.value = value == null ? '' : value;
        input.addEventListener('compositionstart', function () { composing = true; });
        input.addEventListener('compositionend', function () { composing = false; render(); });   // 変換確定後に候補更新
        input.addEventListener('input', function () { if (!composing) render(); });
        input.addEventListener('keydown', onKey);
      }
      list.addEventListener('mousedown', function (e) { var it = e.target.closest('.tss-ac-item'); if (it) { e.preventDefault(); commit(items[+it.dataset.i]); } });   // preventDefault＝フォーカスを奪わない
      render(); pop.style.minWidth = anchor.getBoundingClientRect().width + 'px'; placer = tssPlace(pop, tssAnchor(anchor, ctx), { gap: 1 });
      if (!inline) {   // inline は外側クリック/blur を本体（_commitActive / blur）が処理する＝二重に閉じない
        outside = function (e) { if (pop && !pop.contains(e.target) && !(anchor && anchor.contains && anchor.contains(e.target))) { var v = chosenOnOutside(); if (v == null) cancel(); else commit(v); } };
        setTimeout(function () { document.addEventListener('pointerdown', outside, true); }, 0);
        input.focus(); input.setSelectionRange(input.value.length, input.value.length);
      }
    }
    function chosenOnOutside() { if (strict) { var v = input.value; var src = getSource(v, {}) || []; return src.indexOf(v) >= 0 ? v : null; } return input.value; }
    function teardown() { if (placer) { placer.destroy(); placer = null; } if (unbindComp) { unbindComp(); unbindComp = null; } if (outside) { document.removeEventListener('pointerdown', outside, true); outside = null; } if (pop) { pop.remove(); pop = null; } items = []; hi = -1; composing = false; }
    function commit(v) { if (done) return; done = true; var f = ref.ctx.commit; teardown(); f(v); }
    function cancel() { if (done) return; done = true; var f = ref.ctx.cancel; teardown(); if (f) f(); }

    return {
      inline: inline,                                     // true=本体の共有 input に乗る（_usesTextEditor が見る）
      openOnClick: opts.openOnClick !== false,
      icon: opts.icon != null ? opts.icon : '▾',
      open: function (ctx) { show(ctx.td, ctx.value, ctx); },
      close: function () { teardown(); },
      // ---- inline のみ: 入力/キーは本体の共有 input 経由で届く（自前 listener は張らない）----
      onInput: inline ? function () { if (!composing) render(); } : undefined,          // 打つたびに候補を絞る（変換中は据え置き）
      onKeyDown: inline ? function (e) { onKey(e); } : undefined,                        // ↑↓/Enter/Tab/Esc。preventDefault で本体既定を止める
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = TssAutocomplete;
  else root.TssAutocomplete = TssAutocomplete;
})(typeof self !== 'undefined' ? self : this);
