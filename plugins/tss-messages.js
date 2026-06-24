/*! TssMessages — システム共通メッセージのカタログ作成ヘルパー（CSV/行配列 → grid.messages 用マップ）。
 *
 *  エラー本文をコードで一元管理（トーン統一・多言語・差し替え）。validator は { code, params } を返すだけにし、
 *  本文は外部の設定（CSV/JSON/XML→行配列）に置く。ここはその設定を grid.messages の形に変換する係。
 *
 *  形: grid.messages = { CODE: { level, text } }（text に {label}/{value}/任意params のプレースホルダ）。
 *
 *  使い方:
 *    // CSV（1行目ヘッダ: code,level,text）から
 *    const cat = TssMessages.fromCSV(`code,level,text
 *    E_REQUIRED,error,{label}は必須です
 *    E_RANGE,error,{label}は{min}〜{max}の範囲で
 *    W_LONG,warn,{label}が長めです`);
 *    new TssGrid(el, { messages: cat, columns:[{ data:'age', title:'年齢',
 *      validator: v => v===''||(+v>=0&&+v<=120) || { code:'E_RANGE', params:{min:0,max:120} } }] });
 *
 *    // 既に配列（JSON等）なら: TssMessages.fromRows([{code,level,text}, …])
 */
(function (root) {
  'use strict';
  // 1行を CSV としてパース（"..." クォート・"" エスケープ・カンマ/改行をフィールド内に許容）
  function parseCSV(text) {
    var rows = [], row = [], i = 0, f = '', q = false, s = String(text);
    while (i < s.length) {
      var ch = s[i];
      if (q) {
        if (ch === '"') { if (s[i + 1] === '"') { f += '"'; i += 2; continue; } q = false; i++; continue; }
        f += ch; i++; continue;
      }
      if (ch === '"') { q = true; i++; continue; }
      if (ch === ',') { row.push(f); f = ''; i++; continue; }
      if (ch === '\r') { i++; continue; }
      if (ch === '\n') { row.push(f); rows.push(row); row = []; f = ''; i++; continue; }
      f += ch; i++;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows.filter(function (r) { return r.length && !(r.length === 1 && r[0] === ''); });
  }

  function fromRows(rows) {
    var cat = {};
    (rows || []).forEach(function (r) {
      var code = (r.code != null ? r.code : r[0]); if (code == null || code === '') return;
      var level = (r.level != null ? r.level : r[1]) || 'error';
      var text = (r.text != null ? r.text : (r.message != null ? r.message : r[2])) || '';
      cat[String(code).trim()] = { level: String(level).trim() || 'error', text: String(text) };
    });
    return cat;
  }

  function fromCSV(text) {
    var rows = parseCSV(text); if (!rows.length) return {};
    var head = rows[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var hasHeader = head.indexOf('code') >= 0 || head.indexOf('text') >= 0 || head.indexOf('message') >= 0;
    var ic = head.indexOf('code'), il = head.indexOf('level'), it = head.indexOf('text');
    if (it < 0) it = head.indexOf('message');
    var body = hasHeader ? rows.slice(1) : rows;
    return fromRows(body.map(function (r) {
      return hasHeader
        ? { code: r[ic < 0 ? 0 : ic], level: il < 0 ? 'error' : r[il], text: r[it < 0 ? 2 : it] }
        : { code: r[0], level: r[1], text: r[2] };
    }));
  }

  var TssMessages = { fromRows: fromRows, fromCSV: fromCSV, parseCSV: parseCSV };
  if (typeof module !== 'undefined' && module.exports) module.exports = TssMessages;
  else root.TssMessages = TssMessages;
})(typeof self !== 'undefined' ? self : this);
