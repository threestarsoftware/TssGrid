/*! TssCalendar — 日付ピッカー（TssGrid のカスタムエディタ / 単体ウィジェット両用）
 *  休日カレンダーを JSON で渡せる（勤怠・シフト等向け）。CSS は tss-calendar.css をクラス/変数で自由に。
 *  使い方（グリッド）: columns: [{ type:'date', editor: TssCalendar({ holidays }) }]
 *  使い方（単体）   : TssCalendar({holidays}).openAt(anchorEl, isoValue, onPick)
 *
 *  opts.inline: 「キー派は打つ／マウス派はクリック」の型（**既定 true**）。
 *    本体の共有 input に乗るので **日付をそのまま直打ちでき（1文字目も落ちない）・IME 直打ちも効く**。
 *    カレンダーはフォーカスを奪わず"確認＋クリック補助"に降り、**矢印キーは奪わない**（＝文字カーソル/セル移動のまま）。
 *    打った内容に追従してカレンダーがその月/日へジャンプする。確定は Enter（打った値）or 日をクリック。
 *    inline:false で旧型（ポップアップにフォーカスし ←→↑↓ で日移動・Enter で選択）に戻せる。
 *    ただし **セルにいきなり打ち始めて上書き** ができなくなる（クリック/F2 で開いてから打つ）＝矢印で日を送りたい時だけ。
 */
(function (root) {
  'use strict';
  function pad(n) { return String(n).padStart(2, '0'); }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseISO(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function sameDay(a, b) { return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmtSlash(isoStr) { return String(isoStr).replace(/-/g, '/'); }                 // 'YYYY-MM-DD' → 'YYYY/MM/DD'（range の既定表示）
  function parseLoose(s) { var m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; } // slash/dash どちらも

  function TssCalendar(opts) {
    opts = opts || {};
    var holidays = opts.holidays || {};            // { 'YYYY-MM-DD': '名称'(string) | {name,type} }
    var weekend = opts.weekend || [0, 6];          // 0=日, 6=土
    var weekLabels = opts.weekLabels || ['日', '月', '火', '水', '木', '金', '土'];
    var monthLabel = opts.monthLabel || function (y, m) { return y + '年' + (m + 1) + '月'; };
    var minD = parseISO(opts.min), maxD = parseISO(opts.max);
    var disable = opts.disable || [];              // ['holiday','weekend'] など、選択不可にする種別
    var holName = function (h) { return h == null ? null : (typeof h === 'object' ? h.name : h); };
    var holType = function (h) { return (h && typeof h === 'object' && h.type) ? h.type : null; };

    var ty = new Date().getFullYear();
    var yrLo = opts.yearMin || (minD ? minD.getFullYear() : ty - 12);
    var yrHi = opts.yearMax || (maxD ? maxD.getFullYear() : ty + 12);
    var pop = null, view = null, sel = null, focus = null, ref = null, done = false, outside = null;
    var inline = opts.inline !== false;   // true=共有 input に乗る（直打ち可・矢印は本体に返す）／false=従来のフォーカス奪取型

    // ── 範囲選択（range）: 連続した日を1回の編集で選ぶ（休暇申請の開始〜終了 等）───────────
    //   range:true で「範囲も選べる」行になる（行ごとに切替えたい時は range:(ctx)=>boolean）。未指定は常に単日＝従来動作。
    //   range が有効な行では、カレンダー上部に「範囲で選ぶ」トグルが出る（文言は rangeToggleLabel）:
    //     OFF＝従来の単日（1クリックで確定・値は ISO・ツールチップ無し）／ON＝2クリック（開始→終了・間の色・ツールチップ）。
    //   トグルの初期状態は rangeDefault（true/関数(ctx)=>boolean・既定 OFF）。ただし **セル値が既に範囲なら ON で開く**。
    //   ON 時の確定値は rangeValue(開始ISO,終了ISO)（既定: 範囲 'YYYY/MM/DD～YYYY/MM/DD'／同日は ISO 'YYYY-MM-DD'。rangeValue は同日も呼ぶ）。
    //   休日スキップは利用側（返すのは範囲だけ）。
    var rangeOpt = opts.range;
    var rangeDefault = opts.rangeDefault;          // トグルの初期ON/OFF（bool or (ctx)=>bool・既定 false=OFF）
    var rangeToggleLabel = opts.rangeToggleLabel != null ? opts.rangeToggleLabel : '範囲で選ぶ';
    var rangeSep = opts.rangeSeparator != null ? opts.rangeSeparator : '～';
    var rangeValueFn = typeof opts.rangeValue === 'function' ? opts.rangeValue : null;
    var rangeTooltipFn = typeof opts.rangeTooltip === 'function' ? opts.rangeTooltip : null;
    function defRangeStr(aIso, bIso) { return fmtSlash(aIso) + rangeSep + fmtSlash(bIso); }     // 表示用（両端 slash・範囲）
    function rangeValOf(aIso, bIso) {
      if (rangeValueFn) return rangeValueFn(aIso, bIso);                                         // rangeValue は同日も必ず呼ぶ（利用側で形を決められる）
      return aIso === bIso ? aIso : defRangeStr(aIso, bIso);                                     // 既定: 単日＝ISO（範囲なしと同形）／範囲＝'YYYY/MM/DD～YYYY/MM/DD'
    }
    function rangeTipOf(aIso, bIso) { return rangeTooltipFn ? rangeTooltipFn(aIso, bIso) : (aIso === bIso ? fmtSlash(aIso) : defRangeStr(aIso, bIso)); }
    function isRangeValue(v) { v = String(v == null ? '' : v); return !!rangeSep && v.indexOf(rangeSep) >= 0; }   // 既定書式の範囲値か（区切りを含む）
    var rc = null;                 // この行で範囲が使えるなら { td, def } を持つ＝トグルを出す（open(ctx) で ctx 判定）
    var rangeActive = false;       // トグルの現在値（ON＝2クリック範囲／OFF＝単日）。rc 無しの行は常に false
    var rangeStart = null, hoverEnd = null;   // 範囲選択の途中状態（1クリック目＝rangeStart、プレビュー終端＝hoverEnd）
    function setRangeActive(on) { rangeActive = !!on; rangeStart = null; hoverEnd = null; clearTip(); render(); }  // トグル切替＝途中選択はリセット

    function disabled(d) {
      if (minD && d < minD) return true;
      if (maxD && d > maxD) return true;
      var k = iso(d);
      if (disable.indexOf('holiday') >= 0 && holidays[k]) return true;
      if (disable.indexOf('weekend') >= 0 && weekend.indexOf(d.getDay()) >= 0) return true;
      return false;
    }
    function render() {
      var y = view.getFullYear(), m = view.getMonth();
      var start = new Date(y, m, 1).getDay(), today = new Date();
      // 年・月はプルダウンで直接選べる（年送りが遅い問題の解消）。年範囲は min/max or 今日±12（view も内包）
      var lo = Math.min(yrLo, y), hi = Math.max(yrHi, y), yrSel = '<select class="tss-cal-sel-yr" aria-label="年">';
      for (var yy = lo; yy <= hi; yy++) yrSel += '<option value="' + yy + '"' + (yy === y ? ' selected' : '') + '>' + yy + '年</option>';
      yrSel += '</select>';
      var monSel = '<select class="tss-cal-sel-mon" aria-label="月">';
      for (var mm = 0; mm < 12; mm++) monSel += '<option value="' + mm + '"' + (mm === m ? ' selected' : '') + '>' + (mm + 1) + '月</option>';
      monSel += '</select>';
      // range が使える行はトグル（範囲で選ぶ）を上部に。OFF=単日1クリック／ON=2クリック範囲。
      // ★<label>＋ネイティブ checkbox だと click で input にフォーカスが移り、inline 時に共有 input が blur→
      //   本体が commit+close してカレンダーが閉じてしまう。so 非フォーカスな span で包み、checked は render が持ち、
      //   切替は pop の click（mousedown は preventDefault 済＝フォーカスを奪わない）で処理する（onClick 参照）。
      var toggle = rc ? '<span class="tss-cal-toggle" data-toggle="1"><input type="checkbox" class="tss-cal-range-cb" tabindex="-1"' + (rangeActive ? ' checked' : '') + '><span>' + esc(rangeToggleLabel) + '</span></span>' : '';
      var html = toggle + '<div class="tss-cal-head">'
        + '<button type="button" class="tss-cal-nav" data-nav="-1" aria-label="前の月">‹</button>'
        + '<span class="tss-cal-sels">' + yrSel + monSel + '</span>'
        + '<button type="button" class="tss-cal-nav" data-nav="1" aria-label="次の月">›</button></div>'
        + '<div class="tss-cal-grid">';
      for (var w = 0; w < 7; w++) {
        var wc = w === 0 ? ' tss-cal-sun' : (w === 6 ? ' tss-cal-sat' : '');
        html += '<div class="tss-cal-wl' + wc + '">' + esc(weekLabels[w]) + '</div>';
      }
      var d = new Date(y, m, 1 - start);
      for (var i = 0; i < 42; i++) {
        var cls = 'tss-cal-day', dow = d.getDay(), k = iso(d), h = holidays[k], nm = holName(h), tp = holType(h);
        if (d.getMonth() !== m) cls += ' tss-cal-other';
        if (dow === 0) cls += ' tss-cal-sun'; else if (dow === 6) cls += ' tss-cal-sat';
        if (h) { cls += ' tss-cal-holiday'; if (tp) cls += ' tss-cal-hol-' + tp; }
        if (sameDay(d, today)) cls += ' tss-cal-today';
        if (sameDay(d, sel)) cls += ' tss-cal-sel';
        if (sameDay(d, focus)) cls += ' tss-cal-focus';
        if (rc && rangeActive && rangeStart) {               // 範囲の途中＝開始〜(プレビュー)終端を塗る（ON のときだけ）
          var ra = rangeStart, rb = hoverEnd || rangeStart, lo = ra <= rb ? ra : rb, hi = ra <= rb ? rb : ra;
          if (d >= lo && d <= hi) cls += ' tss-cal-inrange';
          if (sameDay(d, ra)) cls += ' tss-cal-range-start';
          if (sameDay(d, rb)) cls += ' tss-cal-range-end';
        }
        if (disabled(d)) cls += ' tss-cal-disabled';
        html += '<div class="' + cls + '" data-d="' + k + '"' + (nm ? ' title="' + esc(nm) + '"' : '') + '>' + d.getDate() + '</div>';
        d.setDate(d.getDate() + 1);
      }
      pop.innerHTML = html + '</div>';
    }
    function place(anchor) {
      var r = anchor.getBoundingClientRect();
      pop.style.left = Math.max(2, Math.min(r.left, window.innerWidth - pop.offsetWidth - 6)) + 'px';
      var top = r.bottom + 2;
      if (top + pop.offsetHeight > window.innerHeight) top = Math.max(2, r.top - pop.offsetHeight - 2);
      pop.style.top = top + 'px';
    }
    function onClick(e) {
      // 「範囲で選ぶ」トグル: ネイティブ checkbox の toggle/フォーカスには頼らず click で反転（フォーカス不動＝inline でも閉じない）。
      if (e.target.closest && e.target.closest('.tss-cal-toggle')) { e.preventDefault(); setRangeActive(!rangeActive); return; }
      var nav = e.target.getAttribute && e.target.getAttribute('data-nav');
      if (nav) { view = new Date(view.getFullYear(), view.getMonth() + (+nav), 1); render(); return; }
      var dd = e.target.getAttribute && e.target.getAttribute('data-d');
      if (dd) { var d = parseISO(dd); if (!disabled(d)) pick(d); }
    }
    function onChange(e) {
      var t = e.target;
      if (t.classList && t.classList.contains('tss-cal-sel-yr')) { view = new Date(+t.value, view.getMonth(), 1); render(); }
      else if (t.classList && t.classList.contains('tss-cal-sel-mon')) { view = new Date(view.getFullYear(), +t.value, 1); render(); }
    }
    function onKey(e) {
      if (e.target && e.target.tagName === 'SELECT') return;   // 年/月プルダウン操作中は日移動しない
      if (!focus) focus = sel ? new Date(sel) : new Date(view);
      var k = e.key;
      if (k === 'Escape') { e.preventDefault(); cancel(); return; }
      if (k === 'Enter') { e.preventDefault(); if (!disabled(focus)) pick(focus); return; }
      var dx = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[k];
      if (dx != null) { e.preventDefault(); focus = new Date(focus); focus.setDate(focus.getDate() + dx); view = new Date(focus.getFullYear(), focus.getMonth(), 1); if (rc && rangeActive && rangeStart) { hoverEnd = new Date(focus); updateTip(); } render(); return; }
      if (k === 'PageUp' || k === 'PageDown') { e.preventDefault(); view = new Date(view.getFullYear(), view.getMonth() + (k === 'PageUp' ? -1 : 1), 1); render(); }
    }
    // range 途中: 日の上をなぞると終端プレビューを更新（間の色＋ツールチップ）。
    function onOver(e) {
      if (!(rc && rangeActive && rangeStart)) return;
      var dd = e.target.getAttribute && e.target.getAttribute('data-d');
      if (!dd) return;
      var d = parseISO(dd); if (!d || disabled(d)) return;
      if (!hoverEnd || !sameDay(hoverEnd, d)) { hoverEnd = d; render(); updateTip(); }
    }
    // 編集中セルに範囲ツールチップを出す（rangeTooltip で文面差替可）。
    function updateTip() {
      if (!(rc && rc.td)) return;
      var aIso = iso(rangeStart), bIso = iso(hoverEnd || rangeStart);
      if (bIso < aIso) { var t = aIso; aIso = bIso; bIso = t; }
      try { rc.td.title = rangeTipOf(aIso, bIso); } catch (e) { /* noop */ }
    }
    function clearTip() { if (rc && rc.td) { try { rc.td.title = ''; } catch (e) { /* noop */ } } }
    function show(anchor, value, onPick, onCancel, rangeCfg) {
      teardown();   // 既に開いていれば先に片付ける（前の pop 除去＋outside リスナ解除・open-while-open の取り残し防止）
      done = false; rc = rangeCfg || null; rangeStart = null; hoverEnd = null;
      rangeActive = rc ? (isRangeValue(value) || !!rc.def) : false;   // 既存値が範囲 or rangeDefault なら ON で開く
      sel = parseISO(value);
      // range の既存値（'YYYY/MM/DD～…' 等）は parseISO では取れない＝先頭日を緩く読んで月を合わせる。
      var initD = sel || (rc ? parseLoose(value) : null);
      view = initD ? new Date(initD.getFullYear(), initD.getMonth(), 1) : new Date();
      focus = initD ? new Date(initD) : new Date();
      pop = document.createElement('div'); pop.className = 'tss-cal' + (opts.className ? ' ' + opts.className : '') + (rc ? ' tss-cal-range' : '');
      pop.tabIndex = -1; document.body.appendChild(pop);
      pop.addEventListener('mousedown', function (e) { if (e.target.tagName !== 'SELECT') e.preventDefault(); });   // フォーカスを奪わない（select は除く）
      pop.addEventListener('click', onClick);
      pop.addEventListener('change', onChange);
      pop.addEventListener('keydown', onKey);
      if (rc) pop.addEventListener('mouseover', onOver);
      render(); place(anchor);
      ref = { pick: onPick, cancel: onCancel };
      // inline は「外側クリック/フォーカス」を本体（_commitActive / blur）が持つ＝二重に閉じない・共有 input から
      // フォーカスを奪わない（＝打ち続けられる）。矢印/Enter/Esc も本体の既定に返す（onKey は pop 未フォーカスなので発火しない）。
      if (inline) return;
      // 外側クリックで閉じる。ただしアンカー（開いた元セル）は除外＝再クリックはグリッド側でトグル処理させる
      outside = function (e) { if (pop && !pop.contains(e.target) && !(anchor && anchor.contains && anchor.contains(e.target))) cancel(); };
      setTimeout(function () { document.addEventListener('mousedown', outside, true); }, 0);
      pop.focus();
    }
    function teardown() { clearTip(); if (outside) { document.removeEventListener('mousedown', outside, true); outside = null; } if (pop) { pop.remove(); pop = null; } }
    function pick(d) {
      if (done) return;
      if (rc && rangeActive) {   // トグル ON＝2クリック範囲
        if (!rangeStart) { rangeStart = d; hoverEnd = d; focus = new Date(d); render(); updateTip(); return; }   // 1クリック目＝開始（閉じない）
        var aIso = iso(rangeStart), bIso = iso(d);                                                              // 2クリック目＝終了
        if (bIso < aIso) { var t = aIso; aIso = bIso; bIso = t; }                                              // 逆順は入替／同日は単日
        done = true; var fr = ref.pick; teardown(); fr(rangeValOf(aIso, bIso)); return;
      }
      done = true; var f = ref.pick; teardown(); f(iso(d));   // トグル OFF／range 無しの行＝単日1クリック（ISO）
    }
    function cancel() { if (done) return; done = true; var f = ref.cancel; teardown(); if (f) f(); }   // range 途中の取消も値は変えない（ref.cancel）

    return {
      // TssGrid カスタムエディタ契約
      open: function (ctx) {
        var rangeMode = typeof rangeOpt === 'function' ? !!rangeOpt(ctx) : !!rangeOpt;   // この行で範囲を使えるか（半休行は false＝トグル無し）
        var def = typeof rangeDefault === 'function' ? !!rangeDefault(ctx) : !!rangeDefault;  // トグル初期ON/OFF（行ごと可）
        var cfg = rangeMode ? { td: ctx.td, def: def } : null;
        show(ctx.td, ctx.value, function (v) { ctx.commit(v); }, function () { ctx.cancel(); }, cfg);
      },
      close: function () { teardown(); },
      icon: opts.icon != null ? opts.icon : '📅',     // セル右端に表示する合図（opts.icon:'' で消せる）
      openOnClick: opts.openOnClick !== false,        // シングルクリックで開く（既定 ON）
      inline: inline,                                 // true=共有 input に乗る（_usesTextEditor が見る）
      // inline のみ: 打った内容にカレンダーが追従（列の parse があれば表示形→保存値に変換して解釈）。
      // 矢印/Enter/Esc は本体に返す＝onKeyDown は持たない（キー派は打つ・マウス派はクリック）。
      onInput: inline ? function (v, ctx) {
        if (!pop) return;
        var d = null;
        // ★ 解釈は本体に訊く（ctx.parseCell＝セルの確定と同じ読み方）。ここで自前パーサを使うと
        //    「セルは受け付けるのにカレンダーは動かない」食い違いになる（col.parse を書かない列＝format だけの
        //    自然な使い方で 'yyyy/mm/dd' を打つと追従しなかった実バグ）。
        try { d = parseISO(ctx.parseCell ? ctx.parseCell(v) : v); } catch (e) { d = null; }
        if (!d) return;                               // 打ちかけ/不正はカレンダーを動かさない
        sel = d; focus = new Date(d); view = new Date(d.getFullYear(), d.getMonth(), 1); render();
      } : undefined,
      // 単体ウィジェット: 任意要素にアンカーして開く
      openAt: function (anchorEl, value, onPick) { show(anchorEl, value, function (v) { onPick(v); }, null); },
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = TssCalendar;
  else root.TssCalendar = TssCalendar;
})(typeof self !== 'undefined' ? self : this);
