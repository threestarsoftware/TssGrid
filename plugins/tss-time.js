/*! TssTime — 時刻ピッカー（TssGrid のカスタムエディタ / 単体ウィジェット両用）
 *  時/分プルダウン方式（業務の任意時刻入力向き）。保存値は常に 24h 'HH:MM'（type:'time' と互換）。
 *  使い方（グリッド）: columns: [{ type:'time', editor: TssTime({ step:15 }) }]
 *  opts: step(分刻み,既定1) / hour12(AM/PM表示,既定false) / icon(既定 '🕐') / openOnClick(既定true) / className
 *  opts.inline: 既定 true＝本体の共有 input に乗る（時刻をそのまま直打ちでき・1文字目も落ちない・IME直打ちも効く／
 *    ピッカーはフォーカスを奪わずクリック補助に降りる）。inline:false で旧型（ピッカーにフォーカス）に戻せるが、
 *    **セルにいきなり打ち始めて上書き** ができなくなる（クリック/F2 で開いてから打つ）。
 */
(function (root) {
  'use strict';
  function pad(n) { return String(n).padStart(2, '0'); }
  function parseHM(s) { var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); if (!m) return null; var h = +m[1], mi = +m[2]; return (h <= 23 && mi <= 59) ? { h: h, m: mi } : null; }

  function TssTime(opts) {
    opts = opts || {};
    var step = Math.max(1, opts.step || 1);
    var hour12 = !!opts.hour12;
    var pop = null, ref = null, done = false, outside = null;
    var inline = opts.inline !== false;   // true=共有 input に乗る（直打ち可・矢印は本体に返す）／false=従来のフォーカス奪取型

    function opt(val, label, sel) { return '<option value="' + val + '"' + (sel ? ' selected' : '') + '>' + label + '</option>'; }
    function render(cur) {
      var h = cur ? cur.h : null, mi = cur ? cur.m : null;
      // 時
      var hSel = '<select class="tss-time-h" aria-label="時"><option value=""></option>';
      if (hour12) { for (var i = 1; i <= 12; i++) { var d24 = (h == null) ? null : ((h % 12) || 12); hSel += opt(i, i, d24 === i); } }
      else { for (var j = 0; j <= 23; j++) hSel += opt(j, pad(j), h === j); }
      hSel += '</select>';
      // 分（step 刻み。現在値が刻みに無ければ補う）
      var mins = []; for (var k = 0; k < 60; k += step) mins.push(k);
      if (mi != null && mins.indexOf(mi) < 0) { mins.push(mi); mins.sort(function (a, b) { return a - b; }); }
      var mSel = '<select class="tss-time-m" aria-label="分"><option value=""></option>';
      for (var n = 0; n < mins.length; n++) mSel += opt(mins[n], pad(mins[n]), mi === mins[n]);
      mSel += '</select>';
      // AM/PM
      var aSel = '';
      if (hour12) { var pm = h != null && h >= 12; aSel = '<select class="tss-time-ap" aria-label="午前/午後">' + opt('AM', 'AM', !pm) + opt('PM', 'PM', pm) + '</select>'; }
      pop.innerHTML = '<div class="tss-time-row">' + hSel + '<span class="tss-time-sep">:</span>' + mSel + aSel + '</div>'
        + '<div class="tss-time-btns"><button type="button" class="tss-time-now">現在</button><button type="button" class="tss-time-ok">決定</button></div>';
    }
    function readValue() {
      var hS = pop.querySelector('.tss-time-h'), mS = pop.querySelector('.tss-time-m'), aS = pop.querySelector('.tss-time-ap');
      if (hS.value === '' || mS.value === '') return '';
      var h = +hS.value, m = +mS.value;
      if (hour12 && aS) { var ap = aS.value; h = ap === 'PM' ? (h === 12 ? 12 : h + 12) : (h === 12 ? 0 : h); }
      return pad(h) + ':' + pad(m);
    }
    function setNow() {
      var d = new Date(), m = Math.round(d.getMinutes() / step) * step; if (m >= 60) m = 60 - step;
      render({ h: d.getHours(), m: m });
    }
    function place(anchor) {
      var r = anchor.getBoundingClientRect();
      pop.style.left = Math.max(2, Math.min(r.left, window.innerWidth - pop.offsetWidth - 6)) + 'px';
      var top = r.bottom + 2;
      if (top + pop.offsetHeight > window.innerHeight) top = Math.max(2, r.top - pop.offsetHeight - 2);
      pop.style.top = top + 'px';
    }
    function onClick(e) {
      if (e.target.classList.contains('tss-time-now')) { setNow(); return; }
      if (e.target.classList.contains('tss-time-ok')) { commit(readValue()); }
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      else if (e.key === 'Enter') { e.preventDefault(); commit(readValue()); }
    }
    function show(anchor, value, onPick, onCancel) {
      teardown();   // 既に開いていれば先に片付ける（open-while-open の取り残し防止・tss-calendar と同方針）
      done = false;
      pop = document.createElement('div'); pop.className = 'tss-time' + (opts.className ? ' ' + opts.className : ''); pop.tabIndex = -1;
      document.body.appendChild(pop);
      pop.addEventListener('mousedown', function (e) { if (e.target.tagName !== 'SELECT') e.preventDefault(); });
      pop.addEventListener('click', onClick);
      pop.addEventListener('keydown', onKey);
      render(parseHM(value)); place(anchor);
      ref = { pick: onPick, cancel: onCancel };
      if (inline) return;   // inline は外側クリック/フォーカスを本体が持つ＝共有 input から奪わない（打ち続けられる）
      // 外側クリックは「確定」（時/分を選んで離す＝採用）。未変更なら同値 commit＝実質no-op。アンカーは除外（再クリックはグリッドがトグル）
      outside = function (e) { if (pop && !pop.contains(e.target) && !(anchor && anchor.contains && anchor.contains(e.target))) commit(readValue()); };
      setTimeout(function () { document.addEventListener('mousedown', outside, true); }, 0);
      pop.focus();
    }
    function teardown() { if (outside) { document.removeEventListener('mousedown', outside, true); outside = null; } if (pop) { pop.remove(); pop = null; } }
    function commit(v) { if (done) return; done = true; var f = ref.pick; teardown(); f(v); }
    function cancel() { if (done) return; done = true; var f = ref.cancel; teardown(); if (f) f(); }

    return {
      open: function (ctx) { show(ctx.td, ctx.value, function (v) { ctx.commit(v); }, function () { ctx.cancel(); }); },
      close: function () { teardown(); },
      icon: opts.icon != null ? opts.icon : '🕐',
      openOnClick: opts.openOnClick !== false,
      inline: inline,   // true=共有 input に乗る＝時刻をそのまま直打ちできる（矢印/Enter/Esc は本体の既定）
      openAt: function (anchorEl, value, onPick) { show(anchorEl, value, function (v) { onPick(v); }, null); },
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = TssTime;
  else root.TssTime = TssTime;
})(typeof self !== 'undefined' ? self : this);
