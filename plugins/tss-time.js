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
  function parseHM(s) { var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); if (!m) return null; var h = +m[1], mi = +m[2]; return (h <= 23 && mi <= 59) ? { h: h, m: mi } : null; }

  function TssTime(opts) {
    opts = opts || {};
    var step = Math.max(1, opts.step || 1);
    var hour12 = !!opts.hour12;
    var pop = null, ref = null, done = false, outside = null, ictx = null;   // ictx: inline の ctx（共有 input が真実）
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
    // 共有 input に見せる文字列。hour12 は 12h 表示形（"6:30 PM"＝列のセル表示と一致・parser も受ける）、
    // それ以外は 24h（= 保存値 = 表示）。これで編集中に 24h がちらっと出る食い違いを無くす。
    function readDisplay() {
      var hS = pop.querySelector('.tss-time-h'), mS = pop.querySelector('.tss-time-m'), aS = pop.querySelector('.tss-time-ap');
      if (!hS || hS.value === '' || mS.value === '') return readValue();
      if (hour12 && aS) return (+hS.value) + ':' + pad(+mS.value) + ' ' + aS.value;
      return readValue();
    }
    function setNow() {
      var d = new Date(), m = Math.round(d.getMinutes() / step) * step; if (m >= 60) m = 60 - step;
      render({ h: d.getHours(), m: m });
      mirrorToInput();   // inline: 現在ボタンの結果も共有 input へ
    }
    // inline のとき、select の内容を共有 input に流し込む（確定はしない）。これで「打つ」と「選ぶ」が input に集約。
    // 選び終えたらフォーカスを共有 input に戻す＝以降の「外クリックで確定」等が本体の既定どおり効く。
    function mirrorToInput() { if (ictx && ictx.inline && ictx.input) { if (ictx.setValue) { var v = readDisplay(); if (v !== '') ictx.input.value = v; } try { ictx.input.focus(); } catch (e) {} } }
    // 確定: inline は共有 input（打鍵 or ミラー済み）を真実として確定／非 inline は select を真実に。
    function commitFinal() { if (ictx && ictx.inline && ictx.input) commit(ictx.input.value); else commit(readValue()); }
    function onClick(e) {
      if (e.target.classList.contains('tss-time-now')) { setNow(); return; }
      if (e.target.classList.contains('tss-time-ok')) { commitFinal(); }
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      else if (e.key === 'Enter') { e.preventDefault(); commitFinal(); }
    }
    var placer = null;   // 小窓の置き場所（tssPlace）
    function show(anchor, value, onPick, onCancel, ctx) {
      teardown();   // 既に開いていれば先に片付ける（open-while-open の取り残し防止・tss-calendar と同方針）
      done = false; ictx = ctx || null;
      pop = document.createElement('div'); pop.className = 'tss-time' + (opts.className ? ' ' + opts.className : ''); pop.tabIndex = -1;
      document.body.appendChild(pop);
      pop.addEventListener('mousedown', function (e) { if (e.target.tagName !== 'SELECT') e.preventDefault(); });
      pop.addEventListener('click', onClick);
      pop.addEventListener('keydown', onKey);
      pop.addEventListener('change', function (e) { if (e.target.tagName === 'SELECT') mirrorToInput(); });   // inline: select を選んだら共有 input に反映（打鍵と集約）
      render(parseHM(value)); placer = tssPlace(pop, tssAnchor(anchor, ctx), { onLost: ctx ? null : cancel });
      ref = { pick: onPick, cancel: onCancel };
      if (inline && ictx && ictx.inline) { if (ictx.setPopup) ictx.setPopup(pop); return; }   // 表の中の inline だけ本体に任せる（openAt＝単体は下で自分で外側を見る）   // inline: ポップアップを本体に登録＝select へフォーカスが移っても編集を閉じない。外側クリック/フォーカスは本体が持つ（打ち続けられる）
      // 外側クリックは「確定」（時/分を選んで離す＝採用）。未変更なら同値 commit＝実質no-op。アンカーは除外（再クリックはグリッドがトグル）
      outside = function (e) { if (pop && !pop.contains(e.target) && !(anchor && anchor.contains && anchor.contains(e.target))) commit(readValue()); };
      setTimeout(function () { document.addEventListener('pointerdown', outside, true); }, 0);
      pop.focus();
    }
    function teardown() { if (placer) { placer.destroy(); placer = null; } if (outside) { document.removeEventListener('pointerdown', outside, true); outside = null; } if (pop) { pop.remove(); pop = null; } ictx = null; }
    function commit(v) { if (done) return; done = true; var f = ref.pick; teardown(); f(v); }
    function cancel() { if (done) return; done = true; var f = ref.cancel; teardown(); if (f) f(); }

    return {
      open: function (ctx) { show(ctx.td, ctx.value, function (v) { ctx.commit(v); }, function () { ctx.cancel(); }, ctx); },
      close: function () { teardown(); },
      icon: opts.icon != null ? opts.icon : '🕐',
      openOnClick: opts.openOnClick !== false,
      selectOnEdit: true,   // クリック/F2 の編集開始で中身を全選択＝打てば丸ごと置き換わる
      inline: inline,   // true=共有 input に乗る＝時刻をそのまま直打ちできる（矢印/Enter/Esc は本体の既定）
      openAt: function (anchorEl, value, onPick, onCancel) { tssBlurOther(anchorEl); show(anchorEl, value, function (v) { onPick(v); }, onCancel || null); },
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = TssTime;
  else root.TssTime = TssTime;
})(typeof self !== 'undefined' ? self : this);
