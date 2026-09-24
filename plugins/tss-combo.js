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
 */
(function (root) {
  'use strict';
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

    var pop = null, ctxRef = null, done = false, onDoc = null, onKey = null;
    var items = [], hi = -1, composing = false;

    function teardown() {
      if (onDoc) document.removeEventListener('mousedown', onDoc, true);
      if (onKey) document.removeEventListener('keydown', onKey, true);
      onDoc = onKey = null;
      if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
      pop = null; items = []; hi = -1; composing = false;
    }
    // (コード, 値) を確定＝値セルは commit（履歴に積む）、コードセルは別列へ setValueRaw で書き戻す。
    // ★ setValueRaw を使う理由: コードは「値から導く派生値」なのでコード列を readOnly:true にしても貫通して書け、
    //   履歴に独立ステップを作らない（＝値のセルだけが 1 undo 単位）。undo/redo でコードも値に追従させたい場合は
    //   下の TssCombo.codeOf を onAfterChange に噛ませる（任意）。
    function commitPair(code, value) {
      if (done) return; done = true;
      var c = ctxRef; teardown();
      c.commit(value);                                    // 値列（このセル）＝履歴に積む
      if (codeField != null && c.grid && c.r != null) {
        try { c.grid.setValueRaw(c.r, codeField, code); } catch (e) {}   // コード列（別列・派生値・readOnly 貫通）
      }
    }
    function doCancel() { if (done) return; done = true; var c = ctxRef; teardown(); if (c.cancel) c.cancel(); }

    function position(anchor) {
      var r = anchor.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
      var left = Math.max(6, Math.min(r.left, window.innerWidth - pw - 6));
      var top = r.bottom + 2;
      if (top + ph > window.innerHeight - 6) top = Math.max(6, r.top - 2 - ph);   // 下にはみ出すなら上へ
      pop.style.left = left + 'px'; pop.style.top = top + 'px'; pop.style.minWidth = r.width + 'px';
    }

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
    function confirmInput(v) { commitPair(other ? other.code : '', v); }        // (その他code, 入力値) 確定
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
      open: function (ctx) {
        ctxRef = ctx; done = false;
        pop = document.createElement('div');
        pop.className = 'tg-combo' + (opts.className ? ' ' + opts.className : '');
        pop.setAttribute('role', 'listbox');
        document.body.appendChild(pop);
        // 現在値が選択肢に無い＝過去に「その他」で入れた値 → いきなり入力モードで復元
        var cur = ctx.value, known = cur != null && cur !== '' && list.some(function (o) { return o.label === String(cur); });
        if (other && cur != null && cur !== '' && !known) showInput(String(cur));
        else renderList(cur);
        position(ctx.td);
        onDoc = function (e) { if (pop && !pop.contains(e.target) && !(ctx.td && ctx.td.contains(e.target))) doCancel(); };
        onKey = handleKey;
        document.addEventListener('mousedown', onDoc, true);
        document.addEventListener('keydown', onKey, true);
      },
      close: function () { teardown(); },
    };
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
