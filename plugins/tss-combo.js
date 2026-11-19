/*! TssCombo — コード付きプルダウン＋「その他」で自由入力。TssGrid カスタムエディタ（ポップアップ型）。
 *
 *  ねらい: 「選択肢から選ぶ。ただし『その他』を選んだら自由入力」を **1操作で (コード, 値) のペア**にする。
 *  - 通常項目を選ぶ → 値セル＝そのラベル / コードセル＝その code
 *  - 「その他」を選ぶ → 入力欄に切替 → 値セル＝入力文字列 / コードセル＝その他の code（固定）
 *  業務側は「その他かどうか」を分岐せず (コード, 値) を読むだけでよい（コードはそのまま・値だけが選択/入力で変わる）。
 *
 *  使い方（値列にエディタを付け、codeField でコードの書き戻し先＝別列を指す）:
 *    columns: [
 *      { data:'payCode' },                                  // コード列（そのまま保存: 01/02/…/99）。hidden:true でも可
 *      { data:'payName', editor: TssCombo({
 *          options: [
 *            { code:'01', label:'現金' },
 *            { code:'02', label:'振込' },
 *            { code:'03', label:'クレジット' },
 *          ],
 *          other:     { code:'99', label:'その他' },        // これを選ぶと入力欄に切替（省略で「その他」無効＝素のコード選択）
 *          codeField: 'payCode',                            // コードの書き戻し先（data キー or 列 index）
 *      }) },
 *    ]
 *
 *  opts:
 *    options    : [{ code, label }]（`value` も code の別名として可／文字列は code=label）。必須。
 *    other      : { code, label } でその他を有効化。`other:true` なら {code:'99', label:'その他'}。省略で無効。
 *    codeField  : コードの書き戻し先の列（data キー or index）。省略時はコードを書かず値だけ確定。
 *    otherPlaceholder : 入力欄のプレースホルダ（既定 '自由入力'）。
 *    openOnClick: 既定 true（プルダウン同様シングルクリックで開く）。
 *    icon       : セル右の目印（既定 '▾'）。className: ポップアップに付ける任意クラス。
 *
 *  単体で開く（表の外＝スマホのカード入力など。一覧と同じ定義をそのまま使える）:
 *    const pay = TssCombo({ options, other:{ code:'99', label:'その他' } });
 *    pay.openAt(欄の要素, { value:'通院', code:'99' }, function (r) { r.value; r.code; r.other; }, onCancel?);
 *    // 今の値は文字だけでも可: openAt(el, '振込', fn)。欄が画面から外れたら閉じる（onCancel）。
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
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // options を [{code,label}] に正規化（value を code の別名に／文字列は両方同じ）。
  function normOpt(o) {
    if (o && typeof o === 'object') {
      var code = o.code != null ? o.code : (o.value != null ? o.value : o.label);
      return { code: String(code == null ? '' : code), label: String(o.label != null ? o.label : code) };
    }
    return { code: String(o), label: String(o) };
  }

  function TssCombo(opts) {
    opts = opts || {};
    var list = (opts.options || []).map(normOpt);
    var other = opts.other === true ? { code: '99', label: 'その他' }
      : (opts.other && typeof opts.other === 'object') ? normOpt(opts.other) : null;
    var codeField = opts.codeField;
    var placeholder = opts.otherPlaceholder != null ? opts.otherPlaceholder : '自由入力';

    var pop = null, ctxRef = null, done = false, onDoc = null, onKey = null, placer = null;
    var items = [], hi = -1, composing = false;

    function teardown() {
      if (placer) { placer.destroy(); placer = null; }
      if (onDoc) document.removeEventListener('pointerdown', onDoc, true);
      if (onKey) document.removeEventListener('keydown', onKey, true);
      onDoc = onKey = null;
      if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
      pop = null; items = []; hi = -1; composing = false;
    }
    // (コード, 値) を確定＝値セルは commit（履歴に積む）、コードセルは別列へ setValueRaw で書き戻す。
    // ★ setValueRaw を使う理由: コードは「値から導く派生値」なのでコード列を readOnly:true にしても貫通して書け、
    //   履歴に独立ステップを作らない（＝値のセルだけが 1 undo 単位）。undo/redo でコードも値に追従させたい場合は
    //   下の TssCombo.codeOf を onAfterChange に噛ませる（任意）。
    function commitPair(code, value, isOther) {
      if (done) return; done = true;
      var c = ctxRef; teardown();
      if (c.pick) { c.pick({ value: value, code: code, other: !!isOther }); return; }   // 単体（openAt）
      c.commit(value);                                    // 値列（このセル）＝履歴に積む
      if (codeField != null && c.grid && c.r != null) {
        try { c.grid.setValueRaw(c.r, codeField, code); } catch (e) {}   // コード列（別列・派生値・readOnly 貫通）
      }
    }
    function doCancel() { if (done) return; done = true; var c = ctxRef; teardown(); if (c.cancel) c.cancel(); }


    // ---- リスト表示（選択モード）----
    function renderList(highlight) {
      var rows = list.map(function (o, i) {
        return '<div class="tg-combo-item" data-i="' + i + '" role="option">' + esc(o.label) + '</div>';
      });
      if (other) rows.push('<div class="tg-combo-sep"></div>' +
        '<div class="tg-combo-item tg-combo-other" data-other="1" role="option">' + esc(other.label) + '…</div>');
      pop.innerHTML = rows.join('');
      items = pop.querySelectorAll('.tg-combo-item');
      hi = -1;
      Array.prototype.forEach.call(items, function (el, k) {
        el.addEventListener('mouseenter', function () { activate(k); });
        el.addEventListener('mousedown', function (e) { e.preventDefault(); });      // フォーカスを奪わない
        el.addEventListener('click', function (e) { e.stopPropagation(); choose(k); });
      });
      // 現在値に一致する項目をハイライト（無ければ先頭）
      var want = 0;
      if (highlight != null) for (var i = 0; i < list.length; i++) if (list[i].label === highlight) { want = i; break; }
      activate(want);
    }
    function activate(k) {
      if (k < 0 || k >= items.length) return;
      Array.prototype.forEach.call(items, function (el, i) { el.classList.toggle('active', i === k); });
      hi = k; if (items[k]) items[k].scrollIntoView({ block: 'nearest' });
    }
    function choose(k) {
      var el = items[k]; if (!el) return;
      if (el.dataset.other) return showInput('');                 // 「その他」→入力モードへ
      var o = list[k]; commitPair(o.code, o.label);               // 通常項目→(code, label) 確定
    }

    // ---- 入力表示（その他モード）----
    function showInput(initial) {
      pop.innerHTML = '<div class="tg-combo-inputwrap">' +
        '<input class="tg-combo-input" type="text" placeholder="' + esc(placeholder) + '">' +
        '<div class="tg-combo-actions"><button type="button" class="tg-combo-ok">確定</button>' +
        '<button type="button" class="tg-combo-back">戻る</button></div></div>';
      var input = pop.querySelector('.tg-combo-input');
      input.value = initial == null ? '' : initial;
      input.addEventListener('compositionstart', function () { composing = true; });
      input.addEventListener('compositionend', function () { composing = false; });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { if (composing || e.isComposing || e.keyCode === 229) return; e.preventDefault(); confirmInput(input.value); }
        else if (e.key === 'Escape') { e.preventDefault(); if (list.length) renderListWithHighlight(); else doCancel(); }
      });
      pop.querySelector('.tg-combo-ok').addEventListener('mousedown', function (e) { e.preventDefault(); confirmInput(input.value); });
      pop.querySelector('.tg-combo-back').addEventListener('mousedown', function (e) { e.preventDefault(); renderListWithHighlight(); });
      setTimeout(function () { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }, 0);
    }
    function confirmInput(v) { commitPair(other ? other.code : '', v, true); }        // (その他code, 入力値) 確定
    function renderListWithHighlight() { renderList(ctxRef ? ctxRef.value : null); }

    function handleKey(e) {
      if (!pop || pop.querySelector('.tg-combo-input')) return;      // 入力モードのキーは input 側で処理
      if (e.key === 'ArrowDown') { e.preventDefault(); activate((hi + 1) % items.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); activate((hi - 1 + items.length) % items.length); }
      else if (e.key === 'Enter') { e.preventDefault(); if (hi >= 0) choose(hi); }
      else if (e.key === 'Escape') { e.preventDefault(); doCancel(); }
    }

    return {
      openOnClick: opts.openOnClick !== false,
      icon: opts.icon != null ? opts.icon : '▾',
      open: function (ctx) { start(ctx, tssAnchor(ctx.td, ctx), false); },
      // 単体で開く: current＝今の値（文字）か { value, code }。onPick({ value, code, other })。
      openAt: function (anchorEl, current, onPick, onCancel) {
        tssBlurOther(anchorEl);
        var cur = (current && typeof current === 'object') ? current : { value: current };
        start({ value: cur.value == null ? '' : cur.value, code: cur.code, td: anchorEl, pick: onPick, cancel: onCancel || function () {} }, anchorEl, true);
      },
      close: function () { teardown(); },
    };

    // 開く（表の中・単体の共通）。anchor＝置き場所の基準（要素 or 要素を返す関数）。
    function start(ctx, anchor, standalone) {
        if (pop) teardown();
        ctxRef = ctx; done = false;
        pop = document.createElement('div');
        pop.className = 'tg-combo' + (opts.className ? ' ' + opts.className : '');
        pop.setAttribute('role', 'listbox');
        document.body.appendChild(pop);
        // 現在値が選択肢に無い＝過去に「その他」で入れた値 → いきなり入力モードで復元
        var cur = ctx.value, known = cur != null && cur !== '' && list.some(function (o) { return o.label === String(cur); });
        if (other && cur != null && cur !== '' && !known) showInput(String(cur));
        else renderList(cur);
        var aw = (typeof anchor === 'function' ? anchor() : anchor); if (aw) pop.style.minWidth = aw.getBoundingClientRect().width + 'px';
        placer = tssPlace(pop, anchor, { fit: true, onLost: standalone ? doCancel : null });   // 入らない時は高さを縮める（欄に重ならない）
        onDoc = function (e) { if (pop && !pop.contains(e.target) && !(ctx.td && ctx.td.contains(e.target))) doCancel(); };
        onKey = handleKey;
        document.addEventListener('pointerdown', onDoc, true);
        document.addEventListener('keydown', onKey, true);
    }
  }

  // 値 → コードを引く関数を返す（同じ options/other から）。undo/redo・貼付でコードを値に追従させたい時、
  //   onAfterChange: (chs) => chs.forEach(ch => { if (ch.c === 値列) grid.setValueRaw(ch.r, コード列, codeOf(grid.getValue(ch.r, 値列))); })
  // のように噛ませる（任意）。値が選択肢に無ければ other の code、空なら ''。
  TssCombo.codeOf = function (opts) {
    opts = opts || {};
    var list = (opts.options || []).map(normOpt);
    var other = opts.other === true ? { code: '99' }
      : (opts.other && typeof opts.other === 'object') ? normOpt(opts.other) : null;
    return function (value) {
      if (value == null || value === '') return '';
      for (var i = 0; i < list.length; i++) if (list[i].label === String(value)) return list[i].code;
      return other ? other.code : '';
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TssCombo;
  else root.TssCombo = TssCombo;
})(typeof self !== 'undefined' ? self : this);
