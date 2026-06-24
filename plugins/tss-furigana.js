/*! TssFurigana — 氏名→フリガナ 自動入力プラグイン。**辞書不要**。
 *
 *  スマホの連絡先のように「漢字を入力すると よみ が別列に自動で入る」。仕組みは**辞書引きではなく**、
 *  IME変換の **composition イベントから「変換前の読み（かな）」を拾う**だけ。だから辞書データを持たない。
 *  TssGrid は**アクティブセルに本物の <input> を重ねる**設計（IME堅牢の核）なので composition が確実に取れる＝相性抜群。
 *
 *  使い方:
 *    plugins: [ TssFurigana({ source: 'name', target: 'kana' }) ]            // 氏名→フリガナ
 *    plugins: [ TssFurigana({ pairs: [{source:'sei',target:'seiKana'}, …], katakana:false }) ]  // 複数ペア / ひらがな出力
 *
 *  opts:
 *    source / target … 漢字を入れる列 / 読みを入れる列（dataキー）。target は手修正可（readOnlyにはしない）。
 *    pairs           … 複数ペアを配列で（source/target の代わり / 併用可）。
 *    katakana        … true(既定)=カタカナ出力 / false=ひらがな出力。
 *
 *  仕組みの限界（正直に）: **手入力（IME変換）した時だけ**読みが取れる。貼り付け・既存値の漢字からは取れない。
 *  変換のクセで拾い損ねる語もある＝「自動入力＋手直しできる」が現実解（target は編集可のまま）。
 */
(function (root) {
  'use strict';
  // ひらがな → カタカナ
  function toKatakana(s) { return s.replace(/[ぁ-ゖ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); }); }
  // 全部かな（ひら/カタ/長音/濁点）か＝変換前の「読み」かどうか
  function isKana(s) { return !!s && /^[ぁ-んァ-ヶー゛゜ー\s]+$/.test(s); }

  function TssFurigana(opts) {
    opts = opts || {};
    var pairs = opts.pairs ? opts.pairs.slice() : [];
    if (opts.source && opts.target) pairs.push({ source: opts.source, target: opts.target });
    var toKata = opts.katakana !== false;

    return function (grid) {
      var ed = grid.editor;
      if (!ed || !pairs.length) return { name: 'furigana' };
      // source 列の index ＋ target 列キー を解決
      var map = [];
      pairs.forEach(function (p) {
        var si = -1; for (var c = 0; c < grid.COLS; c++) if (grid.columns[c] && grid.columns[c].data === p.source) { si = c; break; }
        if (si >= 0) map.push({ srcIdx: si, targetKey: p.target });
      });
      if (!map.length) return { name: 'furigana' };

      // acc = このセル編集で打った読みの累積（漢字変換を複数回しても連結）。seg = 変換中セグメントの読み。
      var acc = '', seg = '', lastKey = null;
      function onStart() {
        var key = grid.active.r + ',' + grid.active.c;
        if (key !== lastKey) { acc = ''; lastKey = key; }   // 別セルに移ったら読みをリセット
        seg = '';
      }
      function onUpdate(e) { if (isKana(e.data)) seg = e.data; }   // 変換前の全かなを保持（漢字化したら更新せず最後のかなが残る）
      function onEnd() { acc += seg; seg = ''; }                   // 1変換ぶんの読みを累積
      ed.addEventListener('compositionstart', onStart);
      ed.addEventListener('compositionupdate', onUpdate);
      ed.addEventListener('compositionend', onEnd);

      // セル確定（onAfterChange）で、source 列が変わっていたら読みを target へ。貼付/フィルは acc 空＝何もしない。
      var prevAfter = grid.onAfterChange;
      grid.onAfterChange = function (changes, source) {
        if (prevAfter) { try { prevAfter.call(grid, changes, source); } catch (e) {} }
        if (source !== 'undo' && source !== 'redo' && acc) {
          for (var i = 0; i < changes.length; i++) {
            var ch = changes[i];
            for (var m = 0; m < map.length; m++) if (ch.c === map[m].srcIdx) {
              grid.setValueRaw(ch.r, map[m].targetKey, toKata ? toKatakana(acc) : acc);
            }
          }
        }
        acc = ''; seg = ''; lastKey = null;   // コミットでリセット
      };

      return {
        name: 'furigana',
        destroy: function () {
          ed.removeEventListener('compositionstart', onStart);
          ed.removeEventListener('compositionupdate', onUpdate);
          ed.removeEventListener('compositionend', onEnd);
          grid.onAfterChange = prevAfter;
        },
      };
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = TssFurigana;
  else root.TssFurigana = TssFurigana;
})(typeof self !== 'undefined' ? self : this);
