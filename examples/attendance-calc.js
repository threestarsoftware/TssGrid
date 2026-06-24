/*!
 * attendance-calc.js — 勤怠計算エンジン（TssGrid 非依存・純粋関数）
 *
 * 元Excel「勤怠_雛形Ver036」の データシート の計算ロジックを移植したもの。
 * グリッド/DOM に一切依存しないので、デモ版(attendance.html)でも実用版(本物のDB/API)でも
 * そのまま使い回せる。仕様の根拠は docs/attendance-spec.md を参照。
 *
 * 使い方:
 *   const r = AttendanceCalc.recalc(
 *     { start:'09:00', end:'18:00', extraBreak:'01:00', isHoliday:false },
 *     AttendanceCalc.DEFAULT_SETTINGS);
 *   // r = { prescribedBreak:'01:00', work:'08:00', overtime:'00:30', night:'', holidayWork:'', late:'', early:'' }
 *
 * ブラウザ: <script> 読み込みで window.AttendanceCalc。Node: require('./attendance-calc.js')。
 */
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AttendanceCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ===== 時刻ユーティリティ =====
  // "HH:MM" → 秒。書式不正は null。
  function hhMmToSecond(s) {
    if (!/^\d{1,4}:[0-5][0-9]$/.test(s || '')) return null;
    var p = s.split(':'); return (+p[0]) * 3600 + (+p[1]) * 60;
  }
  // 秒 → "HH:MM"（負/null は空）。
  function hhMmFormat(sec) {
    if (sec == null || sec < 0) return '';
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
  // HH:MM 妥当性（空は許容＝クリア可）。24:00 も許容。バリデータ用。
  function isHhMm(v) { return v === '' || v == null || /^(([01]?\d|2[0-3]):[0-5]\d|24:00)$/.test(v); }
  // 入力整形: 全角→半角・"930"→"09:30"・"9"→"09:00" 等。セル parse 用。
  function timeConv(v) {
    var s = String(v).replace(/[０-９：]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    s = s.replace(/[^0-9:]/g, '').replace(/:{2,}/g, ':').replace(/(\d{1,4}):$/, '$1');
    s = s.replace(/^:/, '0:').replace(/^(\d{1,2}:\d)$/, '$10').replace(/^(\d{1,2}:)$/, '$100').replace(/^(\d{1,2})$/, '$1:00');
    if (s.length === 3) s = (+s >= 100 && +s <= 320) ? s + '0' : '0' + s;
    s = s.replace(/^(\d{2})(\d{2})$/, '$1:$2').replace(/^(\d):(\d{2})$/, '0$1:$2');   // 単桁時はゼロ詰め
    return s;
  }
  // "HH:MM" → 分（null許容）。
  function toMin(v) { var s = hhMmToSecond(v); return s == null ? null : s / 60; }
  // 分 → "HH:MM"（0以下は空）。表示用＝0を隠す。
  function fmtMin(m) { return (m > 0 ? hhMmFormat(Math.round(m) * 60) : ''); }
  // 区間 [a0,a1] と [b0,b1] の重なり（分）。
  function ovl(a0, a1, b0, b1) { return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)); }

  // ===== 既定の基本設定（元Excel「基本設定」名前付き範囲より。単位＝分／日内0時起点） =====
  var DEFAULT_SETTINGS = {
    roundIn: 5,                  // 出勤丸め単位（分）＝CEILING（切上げ）
    roundOut: 5,                 // 退勤丸め単位（分）＝FLOOR（切下げ）
    basicStartMin: 9 * 60,       // 基本始業 09:00（遅刻判定の基準）
    basicEndMin: 17.5 * 60,      // 基本終業 17:30（早退判定の基準）
    basicWorkMin: 7.5 * 60,      // 基本就業時間 7.5h（09:00-17:30 − 休憩1h の正味）
    nightStartMin: 22 * 60,      // 深夜（割増）開始 22:00
    breaks: [[12 * 60, 13 * 60]],// 標準休憩 [[開始,終了],...]（複数可）。所定外休が入力された日はこちらより優先。
  };

  // ===== 1日分の勤務計算（純粋関数） =====
  // input: { start, end, extraBreak, isHoliday }
  //   start/end/extraBreak … "HH:MM" か ""（未入力）。extraBreak=所定外休（実績休憩。あれば標準休憩に優先）。
  //   isHoliday … その日が休日（土/日/祝/会社休日）か。true なら稼働は全て休出へ。
  // settings: DEFAULT_SETTINGS 形（省略時は既定）。
  // 戻り: { prescribedBreak, work, overtime, night, holidayWork, late, early } 各 "HH:MM" か ""。
  function recalc(input, settings) {
    var S = settings || DEFAULT_SETTINGS;
    var res = { prescribedBreak: '', work: '', overtime: '', night: '', holidayWork: '', late: '', early: '' };
    var inM = toMin(input.start), outM = toMin(input.end), exM = toMin(input.extraBreak);
    if (inM == null || outM == null || outM <= inM) return res;     // 入退勤が揃わない/逆転 → 全空

    var H = Math.ceil(inM / S.roundIn) * S.roundIn;                 // 出勤 切上げ
    var I = Math.floor(outM / S.roundOut) * S.roundOut;             // 退勤 切下げ
    var autoBreak = S.breaks.reduce(function (s, b) { return s + ovl(H, I, b[0], b[1]); }, 0); // 標準休憩の重なり
    var brk = (exM != null) ? exM : autoBreak;                      // 所定外休があれば優先
    var workMin = Math.max(0, (I - H) - brk);                       // 実働
    var nightMin = Math.max(0, I - S.nightStartMin);                // 22:00 以降の稼働
    res.prescribedBreak = fmtMin(brk);                             // 所定休憩（休日でも表示）

    // 休日（土/日/祝/会社休日）の労働は全て「休出」へ。基本就業の概念がないので残業/遅刻/早退は付かない。
    if (input.isHoliday) {
      res.holidayWork = hhMmFormat(workMin * 60);                  // 休出＝稼働時間そのもの
      res.night = fmtMin(workMin > 0 ? nightMin : 0);             // 深夜割増は休日でも別計上
      return res;
    }
    res.work = hhMmFormat(workMin * 60);                           // 勤務時間
    res.overtime = fmtMin(Math.max(0, workMin - S.basicWorkMin - nightMin)); // 残業（基本超過 − 深夜分）
    res.night = fmtMin(workMin > S.basicWorkMin ? nightMin : 0);  // 深夜は残業到達時のみ
    res.late = fmtMin(Math.max(0, H - S.basicStartMin));          // 遅刻＝基本始業より遅い出勤
    res.early = fmtMin(Math.max(0, S.basicEndMin - I));           // 早退＝基本終業より早い退勤
    return res;
  }

  // ===== 有給取得日数（区分→日数）。有給=1.0 / 前半休・後半休=0.5 / その他=0 =====
  function paidDays(kbn) {
    return kbn === '有給' ? 1 : (kbn === '前半休' || kbn === '後半休') ? 0.5 : 0;
  }

  return {
    hhMmToSecond: hhMmToSecond, hhMmFormat: hhMmFormat, isHhMm: isHhMm, timeConv: timeConv,
    toMin: toMin, fmtMin: fmtMin, ovl: ovl,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS, recalc: recalc, paidDays: paidDays,
  };
});
