/*! TssDatetime — 日付＋時刻を同時に設定するピッカー（TssGrid カスタムエディタ / 単体ウィジェット両用）
 *  保存値は常に 'YYYY-MM-DDTHH:MM'（kintone DATETIME と相互変換しやすい正規形。表示は列 format で整形）。
 *  使い方（グリッド）: columns: [{ type:'text', editor: TssDatetime({ step:5 }), format: TssDatetime.format }]
 *  使い方（単体）   : TssDatetime({step:15}).openAt(anchorEl, 'YYYY-MM-DDTHH:MM', onPick)
 *  opts: holidays / weekend / weekLabels / min / max（日付） / step(分刻み,既定1) / hour12 / icon(既定 '📅') / openOnClick(既定true) / className
 *  opts.inline: 既定 true＝本体の共有 input に乗る（日時をそのまま直打ちでき・1文字目も落ちない・IME直打ちも効く／
 *    ピッカーはフォーカスを奪わずクリック補助に降りる）。inline:false で旧型（ピッカーにフォーカス）に戻せるが、
 *    **セルにいきなり打ち始めて上書き** ができなくなる（クリック/F2 で開いてから打つ）。
 */
(function (root) {
  'use strict';
  // ---- 小窓の置き場所と色（tss-calendar / time / datetime / cascade / combo / autocomplete で同じ中身。直す時は全部。tssTheme は filter / comment にも）----
  // anchor の下（入らなければ上・どちらにも入らなければ広いほう）。見えている範囲（visualViewport＝スマホのキーボードを
  // 除いた所）に収め、ページ/表のスクロール・画面の向き・キーボードの出入り・小窓の大きさの変化に付いていく。
  // o.side:'right'＝右へ（多段の子）。o.fit＝入らない時は高さを縮めて中をスクロール（一覧向け＝欄に重ならない）。
  // o.onLost＝anchor が見える範囲から外れた時（単体で開いた時に閉じる用）。anchor は要素か、要素を返す関数。戻り値 { update, destroy }。
  function tssPlace(pop, anchor, o) {
    o = o || {};
    tssTheme(pop, typeof anchor === 'function' ? anchor() : anchor);   // 欄の色・テーマを小窓へ
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
  // 小窓（body の直下に出す）に、開いた欄の色を写す。表やその親に付けた色・テーマ（data-tg-theme）は body の小窓には
  // 届かないため（html に付けたページ全体のテーマはそのまま届く）。写すのは tssgrid.css の ① 元の色だけ＝② は小窓の側で作る。
  var TSS_THEME_VARS = ['--tg-cell-bg', '--tg-fg', '--tg-border', '--tg-wrap-border', '--tg-header-bg', '--tg-header-fg', '--tg-accent', '--tg-accent-fg', '--tg-edit-accent', '--tg-invalid-fg'];
  function tssTheme(pop, el) {
    if (!pop || !pop.style) return;
    if (pop._tssThemed) { pop.removeAttribute('data-tg-theme'); for (var j = 0; j < TSS_THEME_VARS.length; j++) pop.style.removeProperty(TSS_THEME_VARS[j]); pop._tssThemed = false; }
    if (!el || !el.closest) return;
    var t = el.closest('[data-tg-theme]'); if (t === document.documentElement) t = null;
    if (!t && !el.closest('.tssgrid')) return;
    var cs = getComputedStyle(el);
    for (var i = 0; i < TSS_THEME_VARS.length; i++) { var v = cs.getPropertyValue(TSS_THEME_VARS[i]).trim(); if (v) pop.style.setProperty(TSS_THEME_VARS[i], v); }
    if (t) pop.setAttribute('data-tg-theme', t.getAttribute('data-tg-theme'));
    pop._tssThemed = true;
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

    var pop = null, view = null, selD = null, selH = null, selM = null, ref = null, done = false, outside = null, ictx = null;
    var inline = opts.inline !== false;   // true=共有 input に乗る（直打ち可・矢印は本体に返す）／false=従来のフォーカス奪取型
    // inline: ピッカー操作の結果を共有 input に「表示形」で反映＋フォーカスを input に戻す。
    // これで select へ移っても閉じず（②）、編集中の表示も一致（④）、クリックアウト確定も壊れない。
    function syncInput() {
      if (!(ictx && ictx.inline && ictx.input)) return;
      var v = value();
      ictx.input.value = v === '' ? '' : TssDatetime.format(v, { weekLabels: weekLabels });
      try { ictx.input.focus(); } catch (e) {}
    }

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
    function onClick(e) {
      var t = e.target;
      var nav = t.getAttribute && t.getAttribute('data-nav');
      if (nav) { view = new Date(view.getFullYear(), view.getMonth() + (+nav), 1); render(); syncInput(); return; }
      var dd = t.getAttribute && t.getAttribute('data-d');
      if (dd) { readTime(); var d = parseISOd(dd); if (!dDisabled(d)) { selD = d; render(); syncInput(); } return; }   // 日付選択しても閉じない（時刻も決めるため）
      if (t.classList.contains('tss-dt-now')) { var now = new Date(); selD = now; selH = now.getHours(); selM = Math.round(now.getMinutes() / step) * step; if (selM >= 60) selM = 60 - step; view = new Date(now.getFullYear(), now.getMonth(), 1); render(); syncInput(); return; }
      if (t.classList.contains('tss-dt-clear')) { commit(''); return; }
      if (t.classList.contains('tss-dt-ok')) { commit(value()); return; }
    }
    function onChange(e) {
      var t = e.target;
      if (t.classList.contains('tss-cal-sel-yr')) { view = new Date(+t.value, view.getMonth(), 1); render(); }
      else if (t.classList.contains('tss-cal-sel-mon')) { view = new Date(view.getFullYear(), +t.value, 1); render(); }
      else if (t.classList.contains('tss-time-h') || t.classList.contains('tss-time-m') || t.classList.contains('tss-time-ap')) { readTime(); var ro = pop.querySelector('.tss-dt-readout'); if (ro) ro.innerHTML = readoutHTML(); }
      syncInput();   // 年/月/時/分/AM-PM いずれの変更も共有 input（表示形）へ反映＋input へフォーカスを戻す
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      else if (e.key === 'Enter') { e.preventDefault(); commit(value()); }
    }
    var placer = null;   // 小窓の置き場所（tssPlace）
    function show(anchor, val, onPick, onCancel, ctx) {
      teardown();   // 既に開いていれば先に片付ける（open-while-open の取り残し防止・tss-calendar と同方針）
      done = false; ictx = ctx || null;
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
      render(); placer = tssPlace(pop, tssAnchor(anchor, ctx), { onLost: ctx ? null : cancel });
      ref = { pick: onPick, cancel: onCancel };
      // ★ ポップアップを本体に登録＝年/月/時/分の <select> へフォーカスが移っても編集を閉じない（②）。
      if (inline && ictx && ictx.inline) { if (ictx.setPopup) ictx.setPopup(pop); return; }   // 表の中の inline だけ本体に任せる（openAt＝単体は下で自分で外側を見る）   // inline は外側クリック/フォーカスを本体が持つ（打ち続けられる）
      outside = function (e) { if (pop && !pop.contains(e.target) && !(anchor && anchor.contains && anchor.contains(e.target))) commit(value()); };   // 外側クリックは確定（time と同方針）
      setTimeout(function () { document.addEventListener('pointerdown', outside, true); }, 0);
      pop.focus();
    }
    function teardown() { if (placer) { placer.destroy(); placer = null; } if (outside) { document.removeEventListener('pointerdown', outside, true); outside = null; } if (pop) { pop.remove(); pop = null; } ictx = null; }
    function commit(v) { if (done) return; done = true; var f = ref.pick; teardown(); f(v); }
    function cancel() { if (done) return; done = true; var f = ref.cancel; teardown(); if (f) f(); }

    return {
      open: function (ctx) {
        // 列に parse が無ければ付与＝表示形↔保存形の round-trip（打鍵追従・blur/Enter 確定）を成立させる。
        if (ctx.grid && typeof ctx.c === 'number') { var cc = ctx.grid.colCfg(ctx.c); if (cc && typeof cc.parse !== 'function') cc.parse = TssDatetime.parse; }
        show(ctx.td, ctx.value, function (v) { ctx.commit(v); }, function () { ctx.cancel(); }, ctx);
      },
      close: function () { teardown(); },
      icon: opts.icon != null ? opts.icon : '📅',
      openOnClick: opts.openOnClick !== false,
      selectOnEdit: true,   // クリック/F2 の編集開始で中身を全選択＝打てば丸ごと置き換わる
      inline: inline,   // true=共有 input に乗る＝日時をそのまま直打ちできる（矢印/Enter/Esc は本体の既定）
      // inline のみ: 打った内容にピッカーが追従（ctx.parseCell＝セルの確定と同じ読み方。上で付けた parse を使う）。
      onInput: inline ? function (v, ctx) {
        if (!pop) return;
        var iso = null; try { iso = ctx.parseCell ? ctx.parseCell(v) : v; } catch (e) { iso = null; }
        var p = parseDT(iso), tp = p ? null : parseTimeOnly(iso);
        if (!p && !tp) return;   // 打ちかけ/不正はピッカーを動かさない
        if (p) { selD = p.d; if (p.h != null) selH = p.h; if (p.mi != null) selM = p.mi; view = new Date(p.d.getFullYear(), p.d.getMonth(), 1); }
        else { selH = tp.h; selM = tp.m; }
        render();
      } : undefined,
      openAt: function (anchorEl, val, onPick, onCancel) { tssBlurOther(anchorEl); show(anchorEl, val, function (v) { onPick(v); }, onCancel || null); },
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

  // 表示形 → 保存形。format の逆。'YYYY/MM/DD(曜) HH:MM'・'YYYY-MM-DDTHH:MM'・'YYYY/MM/DD'・'HH:MM' を受け、
  // 'YYYY-MM-DDTHH:MM'（または 'YYYY-MM-DD' / 'HH:MM'）へ正規化。これを列 parse に付けると、打鍵追従も
  // 確定（blur/Enter/決定）の round-trip も成立する（inline で editor が入力/表示を握るのに必須）。解釈不可は素通し。
  TssDatetime.parse = function (v) {
    var s = String(v == null ? '' : v).trim();
    if (s === '') return '';
    var m = /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:\s*\([^)]*\))?(?:[ T]+(\d{1,2}):(\d{2}))?/.exec(s);
    if (m) {
      var iso = m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
      if (m[4] != null) iso += 'T' + pad(+m[4]) + ':' + pad(+m[5]);
      return iso;
    }
    var t = /^(\d{1,2}):(\d{2})$/.exec(s);
    if (t) return pad(+t[1]) + ':' + pad(+t[2]);
    return s;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TssDatetime;
  else root.TssDatetime = TssDatetime;
})(typeof self !== 'undefined' ? self : this);
