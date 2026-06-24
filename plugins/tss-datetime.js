/*! TssDatetime — 日付＋時刻を同時に設定するピッカー（TssGrid カスタムエディタ / 単体ウィジェット両用）
 *  保存値は常に 'YYYY-MM-DDTHH:MM'（kintone DATETIME と相互変換しやすい正規形。表示は列 format で整形）。
 *  使い方（グリッド）: columns: [{ type:'text', editor: TssDatetime({ step:5 }), format: TssDatetime.format }]
 *  使い方（単体）   : TssDatetime({step:15}).openAt(anchorEl, 'YYYY-MM-DDTHH:MM', onPick)
 *  opts: holidays / weekend / weekLabels / min / max（日付） / step(分刻み,既定1) / hour12 / icon(既定 '📅') / openOnClick(既定true) / className
 */
(function (root) {
  'use strict';
  function pad(n) { return String(n).padStart(2, '0'); }
  function isoD(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseISOd(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  // 'YYYY-MM-DD[ T]HH:MM'（時刻省略可）→ { d:Date, h:int|null, mi:int|null }
  function parseDT(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(String(s || '').trim());
    if (!m) return null;
    return { d: new Date(+m[1], +m[2] - 1, +m[3]), h: m[4] != null ? +m[4] : null, mi: m[5] != null ? +m[5] : null };
  }
  // 'HH:MM'（日付無し＝時刻のみ。kintone TIME フィールド互換）→ { h, m }
  function parseTimeOnly(s) { var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim()); if (!m) return null; var h = +m[1], mi = +m[2]; return (h <= 23 && mi <= 59) ? { h: h, m: mi } : null; }
  function sameDay(a, b) { return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var WD = ['日', '月', '火', '水', '木', '金', '土'];   // 既定の曜日ラベル（標準の日時に無い「曜日」を補う＝差別化点）

  function TssDatetime(opts) {
    opts = opts || {};
    var holidays = opts.holidays || {};
    var weekend = opts.weekend || [0, 6];
    var weekLabels = opts.weekLabels || ['日', '月', '火', '水', '木', '金', '土'];
    var step = Math.max(1, opts.step || 1);
    var hour12 = !!opts.hour12;
    var minD = parseISOd(opts.min), maxD = parseISOd(opts.max);
    var holName = function (h) { return h == null ? null : (typeof h === 'object' ? h.name : h); };
    var holType = function (h) { return (h && typeof h === 'object' && h.type) ? h.type : null; };
    var ty = new Date().getFullYear();
    var yrLo = opts.yearMin || (minD ? minD.getFullYear() : ty - 12);
    var yrHi = opts.yearMax || (maxD ? maxD.getFullYear() : ty + 12);

    var pop = null, view = null, selD = null, selH = null, selM = null, ref = null, done = false, outside = null;

    function dDisabled(d) { if (minD && d < minD) return true; if (maxD && d > maxD) return true; return false; }

    function calHTML() {
      var y = view.getFullYear(), m = view.getMonth(), start = new Date(y, m, 1).getDay(), today = new Date();
      var lo = Math.min(yrLo, y), hi = Math.max(yrHi, y), yrSel = '<select class="tss-cal-sel-yr" aria-label="年">';
      for (var yy = lo; yy <= hi; yy++) yrSel += '<option value="' + yy + '"' + (yy === y ? ' selected' : '') + '>' + yy + '年</option>';
      yrSel += '</select>';
      var monSel = '<select class="tss-cal-sel-mon" aria-label="月">';
      for (var mm = 0; mm < 12; mm++) monSel += '<option value="' + mm + '"' + (mm === m ? ' selected' : '') + '>' + (mm + 1) + '月</option>';
      monSel += '</select>';
      var html = '<div class="tss-cal-head">'
        + '<button type="button" class="tss-cal-nav" data-nav="-1" aria-label="前の月">‹</button>'
        + '<span class="tss-cal-sels">' + yrSel + monSel + '</span>'
        + '<button type="button" class="tss-cal-nav" data-nav="1" aria-label="次の月">›</button></div>'
        + '<div class="tss-cal-grid">';
      for (var w = 0; w < 7; w++) { var wc = w === 0 ? ' tss-cal-sun' : (w === 6 ? ' tss-cal-sat' : ''); html += '<div class="tss-cal-wl' + wc + '">' + esc(weekLabels[w]) + '</div>'; }
      var d = new Date(y, m, 1 - start);
      for (var i = 0; i < 42; i++) {
        var cls = 'tss-cal-day', dow = d.getDay(), k = isoD(d), h = holidays[k], nm = holName(h), tp = holType(h);
        if (d.getMonth() !== m) cls += ' tss-cal-other';
        if (dow === 0) cls += ' tss-cal-sun'; else if (dow === 6) cls += ' tss-cal-sat';
        if (h) { cls += ' tss-cal-holiday'; if (tp) cls += ' tss-cal-hol-' + tp; }
        if (sameDay(d, today)) cls += ' tss-cal-today';
        if (sameDay(d, selD)) cls += ' tss-cal-sel';
        if (dDisabled(d)) cls += ' tss-cal-disabled';
        html += '<div class="' + cls + '" data-d="' + k + '"' + (nm ? ' title="' + esc(nm) + '"' : '') + '>' + d.getDate() + '</div>';
        d.setDate(d.getDate() + 1);
      }
      return html + '</div>';
    }
    function timeHTML() {
      var hSel = '<select class="tss-time-h" aria-label="時"><option value=""></option>';
      if (hour12) { for (var i = 1; i <= 12; i++) { var d24 = (selH == null) ? null : ((selH % 12) || 12); hSel += '<option value="' + i + '"' + (d24 === i ? ' selected' : '') + '>' + i + '</option>'; } }
      else { for (var j = 0; j <= 23; j++) hSel += '<option value="' + j + '"' + (selH === j ? ' selected' : '') + '>' + pad(j) + '</option>'; }
      hSel += '</select>';
      var mins = []; for (var k = 0; k < 60; k += step) mins.push(k);
      if (selM != null && mins.indexOf(selM) < 0) { mins.push(selM); mins.sort(function (a, b) { return a - b; }); }
      var mSel = '<select class="tss-time-m" aria-label="分"><option value=""></option>';
      for (var n = 0; n < mins.length; n++) mSel += '<option value="' + mins[n] + '"' + (selM === mins[n] ? ' selected' : '') + '>' + pad(mins[n]) + '</option>';
      mSel += '</select>';
      var aSel = '';
      if (hour12) { var pm = selH != null && selH >= 12; aSel = '<select class="tss-time-ap" aria-label="午前/午後"><option value="AM"' + (!pm ? ' selected' : '') + '>AM</option><option value="PM"' + (pm ? ' selected' : '') + '>PM</option></select>'; }
      return '<div class="tss-dt-time-lbl">時刻</div><div class="tss-time-row">' + hSel + '<span class="tss-time-sep">:</span>' + mSel + aSel + '</div>';
    }
    function readoutHTML() {
      var hasT = selH != null || selM != null;
      var t = hasT ? pad(selH == null ? 0 : selH) + ':' + pad(selM == null ? 0 : selM) : '';
      if (!selD) return hasT ? '<b class="tss-dt-ro-wd">' + t + '</b><span class="tss-dt-ro-empty">（日付なし）</span>' : '<span class="tss-dt-ro-empty">日付/時刻を選択</span>';
      var wd = (opts.weekLabels || WD)[selD.getDay()];
      return isoD(selD).replace(/-/g, '/') + '<b class="tss-dt-ro-wd">(' + esc(wd) + ')</b>' + (hasT ? ' ' + t : '');
    }
    function render() {
      pop.innerHTML = '<div class="tss-dt-readout">' + readoutHTML() + '</div>'
        + '<div class="tss-dt-body"><div class="tss-dt-cal">' + calHTML() + '</div><div class="tss-dt-time">' + timeHTML() + '</div></div>'
        + '<div class="tss-dt-btns"><button type="button" class="tss-dt-clear">クリア</button><span class="tss-dt-spacer"></span>'
        + '<button type="button" class="tss-dt-now">現在</button><button type="button" class="tss-dt-ok">決定</button></div>';
    }
    function readTime() {
      var hS = pop.querySelector('.tss-time-h'), mS = pop.querySelector('.tss-time-m'), aS = pop.querySelector('.tss-time-ap');
      selH = hS && hS.value !== '' ? +hS.value : null;
      selM = mS && mS.value !== '' ? +mS.value : null;
      if (hour12 && aS && selH != null) { selH = aS.value === 'PM' ? (selH === 12 ? 12 : selH + 12) : (selH === 12 ? 0 : selH); }
    }
    function value() {
      readTime();
      var hasT = selH != null || selM != null;
      var t = hasT ? pad(selH == null ? 0 : selH) + ':' + pad(selM == null ? 0 : selM) : '';
      if (selD && hasT) return isoD(selD) + 'T' + t;   // 日付＋時刻
      if (selD) return isoD(selD);                      // 日付のみ
      if (hasT) return t;                               // 時刻のみ（日付無し＝'HH:MM'）
      return '';
    }
    function place(anchor) {
      var r = anchor.getBoundingClientRect();
      pop.style.left = Math.max(2, Math.min(r.left, window.innerWidth - pop.offsetWidth - 6)) + 'px';
      var top = r.bottom + 2;
      if (top + pop.offsetHeight > window.innerHeight) top = Math.max(2, r.top - pop.offsetHeight - 2);
      pop.style.top = top + 'px';
    }
    function onClick(e) {
      var t = e.target;
      var nav = t.getAttribute && t.getAttribute('data-nav');
      if (nav) { view = new Date(view.getFullYear(), view.getMonth() + (+nav), 1); render(); return; }
      var dd = t.getAttribute && t.getAttribute('data-d');
      if (dd) { readTime(); var d = parseISOd(dd); if (!dDisabled(d)) { selD = d; render(); } return; }   // 日付選択しても閉じない（時刻も決めるため）
      if (t.classList.contains('tss-dt-now')) { var now = new Date(); selD = now; selH = now.getHours(); selM = Math.round(now.getMinutes() / step) * step; if (selM >= 60) selM = 60 - step; view = new Date(now.getFullYear(), now.getMonth(), 1); render(); return; }
      if (t.classList.contains('tss-dt-clear')) { commit(''); return; }
      if (t.classList.contains('tss-dt-ok')) { commit(value()); return; }
    }
    function onChange(e) {
      var t = e.target;
      if (t.classList.contains('tss-cal-sel-yr')) { view = new Date(+t.value, view.getMonth(), 1); render(); }
      else if (t.classList.contains('tss-cal-sel-mon')) { view = new Date(view.getFullYear(), +t.value, 1); render(); }
      else if (t.classList.contains('tss-time-h') || t.classList.contains('tss-time-m') || t.classList.contains('tss-time-ap')) { readTime(); var ro = pop.querySelector('.tss-dt-readout'); if (ro) ro.innerHTML = readoutHTML(); }
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      else if (e.key === 'Enter') { e.preventDefault(); commit(value()); }
    }
    function show(anchor, val, onPick, onCancel) {
      done = false;
      var p = parseDT(val), tp = p ? null : parseTimeOnly(val);   // 日付付き or 時刻のみ
      selD = p ? p.d : null;
      selH = p ? p.h : (tp ? tp.h : null);
      selM = p ? p.mi : (tp ? tp.m : null);
      view = selD ? new Date(selD.getFullYear(), selD.getMonth(), 1) : new Date();
      pop = document.createElement('div'); pop.className = 'tss-dt' + (opts.className ? ' ' + opts.className : ''); pop.tabIndex = -1;
      document.body.appendChild(pop);
      pop.addEventListener('mousedown', function (e) { if (e.target.tagName !== 'SELECT') e.preventDefault(); });   // フォーカスを奪わない（select 除く）
      pop.addEventListener('click', onClick);
      pop.addEventListener('change', onChange);
      pop.addEventListener('keydown', onKey);
      render(); place(anchor);
      ref = { pick: onPick, cancel: onCancel };
      outside = function (e) { if (pop && !pop.contains(e.target) && !(anchor && anchor.contains && anchor.contains(e.target))) commit(value()); };   // 外側クリックは確定（time と同方針）
      setTimeout(function () { document.addEventListener('mousedown', outside, true); }, 0);
      pop.focus();
    }
    function teardown() { if (outside) { document.removeEventListener('mousedown', outside, true); outside = null; } if (pop) { pop.remove(); pop = null; } }
    function commit(v) { if (done) return; done = true; var f = ref.pick; teardown(); f(v); }
    function cancel() { if (done) return; done = true; var f = ref.cancel; teardown(); if (f) f(); }

    return {
      open: function (ctx) { show(ctx.td, ctx.value, function (v) { ctx.commit(v); }, function () { ctx.cancel(); }); },
      close: function () { teardown(); },
      icon: opts.icon != null ? opts.icon : '📅',
      openOnClick: opts.openOnClick !== false,
      openAt: function (anchorEl, val, onPick) { show(anchorEl, val, function (v) { onPick(v); }, null); },
    };
  }

  // 表示整形ヘルパ: 'YYYY-MM-DDTHH:MM' → 'YYYY/MM/DD(曜) HH:MM'（列 format に渡せる）。
  // 標準の日時表示で空欄になる「曜日」を必ず埋める＝本プラグインの目玉。weekday:false で曜日を消せる。
  TssDatetime.format = function (v, o) {
    var p = parseDT(v);
    if (!p) return parseTimeOnly(v) ? v : (v || '');   // 時刻のみ('HH:MM')はそのまま表示／不正値は素通し
    var d = p.d, wd = (o && o.weekday === false) ? '' : '(' + (o && o.weekLabels || WD)[d.getDay()] + ')';
    var t = (p.h != null) ? ' ' + pad(p.h) + ':' + pad(p.mi == null ? 0 : p.mi) : '';
    return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + wd + t;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TssDatetime;
  else root.TssDatetime = TssDatetime;
})(typeof self !== 'undefined' ? self : this);
