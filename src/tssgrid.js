/*!
 * TssGrid — 軽量・ノービルド・日本語IME堅牢な編集グリッド (vanilla JS)
 * UMD: <script src> なら window.TssGrid / window.HistoryManager、Node なら require で取得。
 * License: MIT
 */
(function (root) {
  'use strict';

  // 全 TssGrid 共有の内部クリップボード（file:// でもグリッド間コピペが効くように）
  let sharedClip = null;

  // ============================================================
  // HistoryManager — グリッドから独立。1個を複数グリッドで共有できる。
  //   command = { apply(), revert(), label }
  // ============================================================
  class HistoryManager {
    constructor(max = 200) { this.undoStack = []; this.redoStack = []; this.max = max; this.onChange = null; }
    push(cmd) {
      this.undoStack.push(cmd);
      if (this.undoStack.length > this.max) this.undoStack.shift();
      this.redoStack.length = 0;
      this._fire();
    }
    canUndo() { return this.undoStack.length > 0; }
    canRedo() { return this.redoStack.length > 0; }
    undo() { const c = this.undoStack.pop(); if (!c) return; c.revert(); this.redoStack.push(c); this._fire(); }
    redo() { const c = this.redoStack.pop(); if (!c) return; c.apply(); this.undoStack.push(c); this._fire(); }
    clear() { this.undoStack.length = 0; this.redoStack.length = 0; this._fire(); }
    _fire() { if (this.onChange) this.onChange(this); }
  }

  // ============================================================
  // TssGrid
  //   new TssGrid(container, {
  //     headers: string[], data: string[][],
  //     history?: HistoryManager,   // 省略時は自前生成（単体動作）
  //     name?: string,              // 履歴ラベル / 識別用
  //     showDump?: boolean,         // データ確認用の表示（既定 false）
  //     onChange?: (grid) => void,  // データ変更時コールバック（後方互換）
  //     // ---- イベント（V1）。changes = [{ r, c, oldValue, newValue, source }] ----
  //     onBeforeChange?: (changes, source) => false | changes | void,
  //        // 確定直前。false で全取消 / change.newValue を書換えると整形。
  //        // 1セルだけ拒否したい時は、その change.newValue を oldValue に戻す。
  //     onAfterChange?: (changes, source) => void,
  //        // 確定後。source: 'edit'|'paste'|'fill'|'delete'|'undo'|'redo'
  //     onEditStart?: ({ r, c, value }) => void,
  //     onEditEnd?:   ({ r, c, oldValue, newValue, canceled }) => void,
  //     onSelectionChange?: ({ range, active, extent }) => void,
  //     onBeforeSelectionChange?: ({ range, active, extent }) => false | void,  // false で選択中止
  //     onBeforePaste?: (data) => false | string[][] | void,  // data: 2次元文字列配列
  //     onAfterPaste?: (data, { range }) => void,             // 貼り付け確定後
  //     onBeforeCopy?: (data, { range }) => false | string[][] | void,  // 取消 / 差替え
  //     onAfterCopy?:  (data, { range, cut }) => void,
  //     onBeforeCut?:  (data, { range }) => false | string[][] | void,
  //     onBeforeStructureChange?: (info) => false | void,     // 行/列の挿入・削除の前。false で中止
  //     onStructureChange?: (info) => void,  // 挿入・削除の後。info.type / undo
  //   })
  // ============================================================
  class TssGrid {
    constructor(container, opts = {}) {
      this.name = opts.name || 'grid';
      this.columns = opts.columns || [];
      // 見出し: 明示 headers > columns の title/data 由来 > 既定 A,B,C
      this.headers = opts.headers || (this.columns.length
        ? this.columns.map((c, i) => (c && (c.title || c.data)) || TssGrid._colLabel(i))
        : ['A', 'B', 'C']);
      this.COLS = this.headers.length;
      // データ取り込み: 配列(string[][]) と オブジェクト配列(object[]) を自動判別。
      // オブジェクト時は columns[c].data をキーに 2次元へ展開し、元オブジェクトは _src に保持（非表示フィールド維持）。
      this._ingest(opts.data);   // → this.data(2D) / this._src / this.ROWS / this._objectMode
      this.history = opts.history || new HistoryManager();
      this.showDump = !!opts.showDump;
      this.onChange = opts.onChange || null;
      this.onBeforeChange = opts.onBeforeChange || null;
      this.onAfterChange = opts.onAfterChange || null;
      this.onEditStart = opts.onEditStart || null;
      this.onEditEnd = opts.onEditEnd || null;
      this.onSelectionChange = opts.onSelectionChange || null;
      this.onHeaderClick = opts.onHeaderClick || null;   // (c, e)=>false で列選択を抑止（ソートUI等を外部で組む用）
      this.onBeforePaste = opts.onBeforePaste || null;
      // 確定キーの移動方向（実行時変更可）。'down'|'up'|'right'|'left'|'none'
      this.enterMoves = opts.enterMoves || 'down';
      this.tabMoves = opts.tabMoves || 'right';
      // 初期カーソル位置。[r,c] か {r,c}（c は index か data キー）。未指定は [0,0]。
      this.initialCell = opts.initialCell || null;
      // 入力フロー制御: Enter/Tab の移動先を上書き。({r,c,key,shift})=>{r,c}|null（null で既定方向）。
      // 例: 出勤→退勤→所定外休→備考→次行の出勤、のように入力セルだけ巡れる（業務フォーム向け）。
      this.nextCell = opts.nextCell || null;
      // 列定義（任意）: columns[c] = { type, options, validator, checked, unchecked, parse, format, picker }
      //   type: 'text'(既定) | 'dropdown' | 'checkbox' | 'date' | 'time' | 'number'
      //   ── CellFormat（表示書式。保存値は正規・表示だけ整形・getData は保存値のまま）──
      //   number: decimals(小数桁/四捨五入) | thousands(true でカンマ区切り) | prefix/suffix(前後綴り '¥' '%' 等)。
      //           入力はグルーピングや前後綴り混じりでも parse で正規化（'1,234.50'→'1234.5'）。非数値は拒否。編集時は素の数値を表示。
      //           全角数字・符号は既定で半角化（'１２３'→'123'）。zenkaku:false で無効化。
      //   date:   format に**文字列パターン**を渡すと宣言的に表示（'yyyy/mm/dd' / 'yyyy年m月d日'）。トークン yyyy/yy/mm/m/dd/d。parse は組込。
      //   options: dropdown の選択肢。string[] または {value,label}[]（保存値=value・表示=label＝内部コードと表示名を分離）。
      //            クリア用の空オプションは自動で先頭に付く＝'' を入れない。getData/getRows は value で返る。
      //   allowEmpty: dropdown で空(クリア)を許すか（既定 true）。false＝空オプションを出さず空値も検証で弾く＝ラジオ的な必須選択
      //   validator: (value, {r,c}) => true|undefined(許可) | false|string(拒否, 文字列はエラー文)
      //   maxLength: 桁数(文字数)上限。編集中はそれ以上**打てない**＋貼り付け/setValue は超過分を**切り詰め**（無制限を避ける）
      //   checked/unchecked: checkbox の ON/OFF 保存値（既定 '1' / ''）
      //   parse:  (input, {r,c}) => 保存値 | false/null(不正)。入力文字列→保存値の正規化。
      //   format: (stored, {r,c}) => 表示文字列。保存値→セル表示の整形（getData は保存値のまま）。
      //   picker: date/time でネイティブピッカーを使うか（既定 true）。false でテキスト入力＋parse。
      //   hour12: time で 12時間制(AM/PM)表示・入力。保存値は常に 24h 'HH:MM'。実行時に切替→redraw()。
      //   readOnly: true（または (value,{r,c})=>bool）で読み取り専用。編集不可＋全経路で変更を拒否し old へ戻す。
      //   html: true で表示だけ生HTML（値 or format の戻りを innerHTML。画像/SVG/バッジ等）。値はテキスト保存のまま＝
      //         getData/コピペは無傷。エスケープを外す＝XSS責任は format/値の提供側（外部入力をそのまま埋めない）。表示用途は readOnly 推奨。
      //   cellClass: (value,{r,c,row,src}) => クラス文字列/配列。条件付き書式（見た目は業務側CSS）。全体版は opts.cellClass(r,c,value,row,src)。
      //             src=元レコード（オブジェクトデータ時。非表示フィールドも参照可＝休日区分など隠し列基準の色付けに）。
      //   ※ date は parse 既定で yyyymmdd / yyyy-mm-dd / yyyy/mm/dd を yyyy-mm-dd に正規化。
      //     parse/format を付けるか picker:false にするとテキスト入力（並び順を自分で決められる）。
      //     data: オブジェクト配列で渡す時の**バインド先キー**（例 {data:'品番'}）。getRows/getValue(r,'品番') で使う。
      this.onInvalid = opts.onInvalid || null; // (rejections, source) 検証で弾かれた時
      // 読み取り専用: グリッド全体（opts.readOnly）/ 列単位（columns[c].readOnly）。編集と全変更経路を拒否。
      this.readOnly = !!opts.readOnly;
      this.onReadOnly = opts.onReadOnly || null; // (blocked, source) 読み取り専用セルへの変更を弾いた時
      // 右クリックメニュー。true=既定項目 / false=無効 / 配列 or {items:[...]}=構成（組込キー＋カスタム項目）。
      const _cm = opts.contextMenu;
      this.contextMenu = _cm !== false;
      this._menuConfig = Array.isArray(_cm) ? _cm : (_cm && Array.isArray(_cm.items)) ? _cm.items : null;
      this.allowInsertRows = opts.allowInsertRows !== false;
      this.allowDeleteRows = opts.allowDeleteRows !== false;
      this.allowInsertCols = opts.allowInsertCols !== false;
      this.allowDeleteCols = opts.allowDeleteCols !== false;
      this.onStructureChange = opts.onStructureChange || null; // (info) 行/列の挿入・削除後
      this.onFilter = opts.onFilter || null;                 // ({count,total,cleared?}) 非破壊フィルタ適用/解除後
      this.onBeforeStructureChange = opts.onBeforeStructureChange || null; // (info)=>false で挿入/削除を中止
      this.onAfterPaste = opts.onAfterPaste || null;     // (data, {range}) 貼り付け確定後
      this.onBeforeCopy = opts.onBeforeCopy || null;     // (data, {range})=>false 取消 / 配列で差替え
      this.onAfterCopy = opts.onAfterCopy || null;       // (data, {range, cut}) クリップボード書込後
      this.onBeforeCut = opts.onBeforeCut || null;       // (data, {range})=>false 取消 / 配列で差替え
      this.onBeforeSelectionChange = opts.onBeforeSelectionChange || null; // ({range,active,extent})=>false で選択中止
      // 検証 NG 時の挙動: 'revert'(既定)=元の値に戻す / 'keep'=入力値を残してセルを赤く警告
      this.invalidMode = opts.invalidMode || 'revert';
      this._marksInvalid = this.invalidMode === 'keep';
      // keep モードの赤セルに validator メッセージを title= で出す（ホバーで理由）。false で無効。
      // 全エラーをまとめて出したい時は getInvalidCells() で [{r,c,value,message}] を取得（プログラム側で集計表示）。
      this.invalidTitle = opts.invalidTitle !== false;
      // メッセージカタログ（システム共通メッセージの別管理）: { code: 'text' | {level,text} } or (code,ctx)=>text。
      // validator が { code, params?, level? } を返すと、ここから本文を解決（{label}/{value}/params を差込）。本文を外部JSON/CSV/XMLに置ける。
      this.messages = opts.messages || null;
      // 貼り付けがグリッド範囲を超えた時: 'clip'(既定, はみ出し分を切り捨て) | 'error'(貼り付け中止)
      this.pasteOverflow = opts.pasteOverflow || 'clip';
      this.onPasteOverflow = opts.onPasteOverflow || null; // (info) => void。error 時に呼ぶ

      this.active = { r: 0, c: 0 }; this.extent = { r: 0, c: 0 };
      this.mode = 'nav'; this.dragging = false; this.filling = null;
      this._asRAF = 0; this._dragDir = 0; this._fillRow = null;   // ドラッグ/フィルの端自動スクロール状態
      this.pendingCut = null;
      this.headerDrag = null; this._colAnchor = 0; this._rowAnchor = 0;  // 行/列ヘッダ選択
      this._headerSel = null;   // 'col'/'row'/'all'=列/行/全選択モード（結合に拡張せず実列/行にクランプ＝Excel流）。null=通常セル選択
      // リサイズ（列幅・行高）
      // 列幅 colW[c]=px（未指定は既定）。指定方法は3通り、優先度＝実行時リサイズ/明示colW > columns[c].width > 既定:
      //  1) colWidths: [px, …]            … 位置指定（従来）
      //  2) colWidths: { dataキー: px, … } … 列ID（data キー）指定＝列を入れ替えても幅が追従する
      //  3) columns[c].width: px          … 列定義に同居（並べ替え・コピペしても幅が一緒に動く＝最も壊れにくい）
      this.colW = [];
      const _cw = opts.colWidths;
      if (Array.isArray(_cw)) this.colW = _cw.slice();
      else if (_cw && typeof _cw === 'object') for (const k in _cw) { const ci = this._resolveCol(k); if (ci >= 0) this.colW[ci] = _cw[k]; }
      for (let c = 0; c < this.COLS; c++) if (this.colW[c] == null && this.colCfg(c).width != null) this.colW[c] = this.colCfg(c).width;
      this.rowH = (opts.rowHeights || []).slice();     // rowH[r] = px（未指定は既定）
      this.defColW = opts.defaultColWidth || 120;
      this.defRowH = opts.defaultRowHeight || 28;
      this.minColW = opts.minColWidth || 30;
      this.minRowH = opts.minRowHeight || 18;
      this.resizing = null;
      // リサイズの見せ方: 'preview'(既定, Excel風に線でプレビュー→離して確定) | 'live'(即時反映)
      this.resizeMode = opts.resizeMode || 'preview';
      // 列固定: 左から frozenCols 列を横スクロールしても固定（行ヘッダの sticky と同じ仕組み）
      this.frozenCols = opts.frozenCols || 0;
      // 行固定: 上から frozenRows 行を縦スクロールしても固定（ヘッダ行の sticky と同じ仕組み・行版）
      this.frozenRows = opts.frozenRows || 0;
      // ネストヘッダ（ヘッダセル結合）: 複数段の見出し行。各段は配列で、要素は文字列 or {label,colspan}。
      // 最終段がリーフ（実列に対応＝並べ替え/全選択チェック等が効く）。例:
      //   nestedHeaders: [ ['基本', {label:'住所', colspan:2}], ['氏名','都道府県','市区町村'] ]
      this.nestedHeaders = (Array.isArray(opts.nestedHeaders) && opts.nestedHeaders.length) ? opts.nestedHeaders : null;
      // wrap の幅/高さ。固定列・縦スクロールのため指定推奨（数値=px / 文字列=そのまま）
      this.width = opts.width != null ? (typeof opts.width === 'number' ? opts.width + 'px' : opts.width) : null;
      this.height = opts.height != null ? (typeof opts.height === 'number' ? opts.height + 'px' : opts.height) : null;
      // リサイズ可否。列は columns[c].resizable:false で個別ロックも可（幅固定）
      this.resizeCols = opts.resizeCols !== false;
      this.resizeRows = opts.resizeRows !== false;
      // 行/列ヘッダの表示（false で行番号列・ヘッダ行を隠す）
      this.rowHeaders = opts.rowHeaders !== false;
      this.rowHeaderW = (opts.rowHeaderWidth | 0) || 40;   // 行番号列の幅(px)。大量行で桁数が増える時に広げる
      this.rowHeaderLabel = opts.rowHeaderLabel;   // 行ヘッダ表示: 未指定=行番号(r+1) / false=数字なし(空) / (r)=>文字列=カスタム
      this.colHeaders = opts.colHeaders !== false;
      // 行ヘッダの「つまみ」をドラッグして行を並べ替える（行番号列が必要）
      this.rowReorder = !!opts.rowReorder;
      this.rowReorderWhole = opts.rowReorder === 'header';   // 'header'=行ヘッダーセル全体が移動ハンドル（クリック=選択/ドラッグ=移動）／true=⠿アイコンのみ
      this.rowReorderMark = opts.rowReorderMark === undefined ? 'before' : opts.rowReorderMark;   // ⠿の位置: 'before'(番号の前/既定) | 'after'(番号の後) | false(出さない)
      // 選択カーソル（緑の選択枠・範囲・セルハイライト・フィルハンドル）を表示するか。
      // false で表示専用グリッド向けに非表示（内部の選択は保持＝コピーは可）。
      this.cursor = opts.cursor !== false;
      this.onAfterRowMove = opts.onAfterRowMove || null;   // (from, to) 行移動の確定後
      // 列ストレッチ: 'none'(既定) | 'last'(余白を最終列へ) | 'all'(全列で配分)。枠幅まで伸ばす。
      this.stretchH = opts.stretchH || 'none';
      // セル内折り返し（既定 nowrap）。grid 全体 or columns[c].wordWrap。
      this.wordWrap = !!opts.wordWrap;
      // 空セルのヒント表示（grid 全体 or columns[c].placeholder）。getData には入らない。
      this.placeholder = opts.placeholder != null ? String(opts.placeholder) : null;
      // 機能トグル
      // fillHandle: false で無効 / true で既定 / {direction,autoInsertRow} で詳細指定
      const _fh = opts.fillHandle;
      this.fillHandle = _fh !== false;
      this.fillDirection = (_fh && _fh.direction) || 'both';   // 'both'|'vertical'|'horizontal'
      this.fillAutoInsertRow = !!(_fh && _fh.autoInsertRow);   // 下へドラッグで行を自動追加
      this.onBeforeAutofill = opts.onBeforeAutofill || null;   // (src,target)=>false で取消
      this.onAfterAutofill = opts.onAfterAutofill || null;     // (src,target)
      this.copyPaste = opts.copyPaste !== false;     // false でコピー/カット/ペースト無効
      // 列幅オートフィット（内容に合わせて自動調整）。境界ダブルクリック / autoSizeColumn でも。
      this.autoColumnSize = !!opts.autoColumnSize;
      // データ入力支援
      this.minSpareRows = opts.minSpareRows | 0;     // 末尾に常に確保する空行数
      this.autoWrapRow = !!opts.autoWrapRow;         // Tab で行末→次行頭に折り返し
      this.autoWrapCol = !!opts.autoWrapCol;         // Enter で列末→次列頭に折り返し
      this.navSkipReadOnly = !!opts.navSkipReadOnly; // Tab/Enter 送りで readonly セルを飛ばす（伝票入力向け＝編集する所だけ移動）
      // 仮想スクロール（簡易版・固定行高ウィンドウイング）: 大量行で「可視窓＋バッファ」だけ描画。
      // 全行は data に保持・行座標は絶対のまま、tbody は窓ぶん＋上下スペーサ行のみ。幾何はモデル（一定行高）。
      // 制約(v1): 行高一定／セル結合・固定行列・折り返し非対応。指定時は無効化して警告。OFF時は一切作動せず従来通り。
      this.virtual = !!opts.virtual;
      this._vBuf = (opts.virtual && typeof opts.virtual === 'object' && opts.virtual.buffer) || 6;  // 窓の上下バッファ行数
      this._vStart = 0; this._vEnd = 0; this._vRAF = 0; this._vRendered = false;
      if (this.virtual && (this.frozenRows || this.frozenCols || this.wordWrap)) {
        try { console.warn('[TssGrid] virtual:true は固定行列/折り返し非対応のため、それらを無効化しました'); } catch (_) {}
        this.frozenRows = 0; this.frozenCols = 0; this.wordWrap = false;
      }
      // 行/列数の下限・上限（挿入/削除の境界。min は初期パディングにも使う）
      this.minRows = opts.minRows | 0; this.maxRows = opts.maxRows | 0;
      this.minCols = opts.minCols | 0; this.maxCols = opts.maxCols | 0;
      this.className = opts.className || null;        // コンテナ(.tssgrid)へ付ける任意クラス
      // 条件付き書式: 値/行/列を見てセルに付けるCSSクラスを返す。全体版 cellClass(r,c,value,row)（row=値配列）。
      // 列版は columns[c].cellClass(value,{r,c,row})。見た目は業務側CSS（.tssgrid td.xxx{…}）で。
      this.cellClass = opts.cellClass || null;
      // セル単位インラインスタイル: cellStyle(r,c,value,row,src)→{CSSプロパティ} or 'k:v;…'。列版 columns[c].cellStyle(value,{r,c,row,src})。
      // クラス（離散）では出せない連続色・データバー幅(CSS変数)向け。例: cellStyle:(r,c,v)=>({background:heat(v)})
      this.cellStyle = opts.cellStyle || null;
      // 列の非表示（描画で畳む＋移動/幅/コピーは隠し列をスキップ）。実行時は hideColumn/showColumn。
      this.hiddenCols = new Set((opts.hiddenColumns || []).map(Number));
      // セル単位の可変状態（キー "r,c"）。整列 / 実行時 readOnly。構造変更で _structCmd がキー追従。
      this._align = new Map();      // "r,c" → { h?, v? }（列既定は columns[c].align/valign）
      this._cellRO = new Set();     // "r,c"（セル単位の読み取り専用）
      // キーボード: グリッドより先に渡すフック / カスタムショートカット登録 / プラグイン
      this.onBeforeKeyDown = opts.onBeforeKeyDown || null;   // (e)=>false か preventDefault で既定を止める
      this._shortcuts = [];         // { keys, sig, handler, context, name }
      this._plugins = [];           // { name, handle }（handle.destroy で後始末）
      this._merges = null;          // セル結合（横）: [{r,c,colspan}] or null。null=結合なし＝全経路ゼロコスト
      this._listeners = [];         // destroy() 用に登録した document/window リスナを記録
      this._destroyed = false;
      (opts.shortcuts || []).forEach(s => this.addShortcut(s));

      this._padToMin();        // minRows/minCols まで空行・空列を補う
      this._build(container);
      this._bind();
      this.buildTable();
      { const ic = this._resolveInitialCell(); this.setActive(ic[0], ic[1]); }   // 初期カーソル
      this._ensureSpare();     // minSpareRows を確保
      if (this.autoColumnSize) this.autoSizeAllColumns();
      (opts.plugins || []).forEach(p => this.usePlugin(p));   // プラグイン初期化（全構築後）
    }

    // ---- データモデル（配列 / オブジェクト配列の両対応） ----
    _key(c) { const d = this.colCfg(c).data; return d != null ? d : null; }   // 列 c のバインド先キー（'a' / 'a.b.c' のネストパス可）
    _cellStr(v) { return v == null ? '' : String(v); }
    _colByKey(key) { for (let c = 0; c < this.COLS; c++) if (this._key(c) === key) return c; return -1; }
    // 列指定を index に解決（数値はそのまま / 文字列は data キーとして探す）
    _resolveCol(c) { return typeof c === 'number' ? c : this._colByKey(c); }
    // ネストパス取得 'name.last' → o.name.last（途中が無ければ undefined）
    _getPath(o, path) {
      if (o == null) return undefined;
      if (path.indexOf('.') < 0) return o[path];
      const ks = path.split('.'); let v = o;
      for (let i = 0; i < ks.length; i++) { if (v == null) return undefined; v = v[ks[i]]; }
      return v;
    }
    // ネストパス設定（途中の階層を copy-on-write でクローンしつつ書く＝元オブジェクトを汚さない）
    _setPathCOW(o, path, val) {
      if (path.indexOf('.') < 0) { o[path] = val; return; }
      const ks = path.split('.'); let t = o;
      for (let i = 0; i < ks.length - 1; i++) {
        const cur = t[ks[i]];
        t[ks[i]] = (cur && typeof cur === 'object') ? (Array.isArray(cur) ? cur.slice() : Object.assign({}, cur)) : {};
        t = t[ks[i]];
      }
      t[ks[ks.length - 1]] = val;
    }
    // オブジェクト1件 → 行配列（キーのある列だけ値を引く。無キー列は ''。ネストパス対応）
    _objToRow(o) { const row = []; for (let c = 0; c < this.COLS; c++) { const k = this._key(c); row.push(k != null ? this._cellStr(this._getPath(o, k)) : ''); } return row; }
    // 入力の取り込み。配列 or オブジェクト配列を自動判別し this.data(2D文字列) を作る。
    _ingest(rows) {
      rows = rows || [];
      const isObj = rows.length > 0 && !Array.isArray(rows[0]) && typeof rows[0] === 'object';
      this._objectMode = isObj;
      if (isObj) {
        this._src = rows.map(o => Object.assign({}, o));         // 非表示フィールドも保持
        this.data = rows.map(o => this._objToRow(o));
      } else {
        this._src = null;
        this.data = (rows.length ? rows : [new Array(this.COLS).fill('')]).map(r => r.slice());
      }
      this.ROWS = this.data.length;
    }

    // ---- 取得用 API ----
    getData() { return this.data.map(row => row.slice()); }   // 常に 2次元配列（後方互換）
    // オブジェクト配列で取り出す。_src（元の非表示フィールド）にキー列の現在値を上書きして返す。
    getRows() {
      return this.data.map((row, r) => {
        const o = this._src ? Object.assign({}, this._src[r]) : {};
        for (let c = 0; c < this.COLS; c++) { const k = this._key(c); if (k != null) this._setPathCOW(o, k, row[c]); }
        return o;
      });
    }
    getRow(r) { return this.getRows()[r]; }
    // getRow の対（行→列）。1列分の値を全行ぶん配列で。列は index か data キー。
    getColumn(c) { const ci = this._resolveCol(c); return ci < 0 ? undefined : this.data.map(row => row[ci]); }
    // 全列を「列ごとの値配列」で。見出しキーは data キー > headers。getRows の列方向版。
    getColumns() {
      const out = {};
      for (let c = 0; c < this.COLS; c++) { const k = this._key(c); out[k != null ? k : this.headers[c]] = this.data.map(row => row[c]); }
      return out;
    }
    setData(rows) { this._align.clear(); this._cellRO.clear(); this._unsortedData = null; this._allRows = this._allSrc = this._meta = this._filterFn = null; if (this.history) this.history.clear(); this._ingest(rows); this._padToMin(); this.buildTable(); const ic = this._resolveInitialCell(); this.setActive(ic[0], ic[1]); this._ensureSpare(); }
    // 初期カーソル位置を [r,c] に解決（c は index か data キー）。範囲内へクランプ。
    _resolveInitialCell() {
      const ic = this.initialCell; if (!ic) return [0, 0];
      let r, c;
      if (Array.isArray(ic)) { r = ic[0] | 0; c = ic[1]; } else { r = ic.r | 0; c = ic.c; }
      c = (typeof c === 'string') ? this._resolveCol(c) : (c | 0);
      return [this.clampR(r), this.clampC(c < 0 ? 0 : c)];
    }
    // Enter/Tab 確定後の移動。nextCell フックがセルを返せばそこへ、無ければ既定方向（_moveBy）。
    _advance(key, reverse) {
      if (typeof this.nextCell === 'function') {
        let nx; try { nx = this.nextCell({ r: this.active.r, c: this.active.c, key, shift: !!reverse }); } catch (_) {}
        if (nx && nx.r != null && nx.c != null) {
          const c = (typeof nx.c === 'string') ? this._resolveCol(nx.c) : nx.c;
          this.setActive(this.clampR(nx.r), this.clampC(c < 0 ? 0 : c)); return;
        }
      }
      this._moveBy(key === 'tab' ? this.tabMoves : this.enterMoves, reverse);
    }
    // CSV 文字列を返す（RFC4180 準拠のクォート）。opts: headers(既定true) / formatted(既定false=素の値, trueで表示形)
    //   / skipEmpty(既定true=空行除外) / eol(既定 '\r\n'=Excel向け)。JSON は getRows()+JSON.stringify で足りるので非内蔵。
    toCSV(opts) {
      const o = Object.assign({ headers: true, formatted: false, skipEmpty: true, eol: '\r\n' }, opts);
      const esc = s => { s = s == null ? '' : String(s); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      const lines = [];
      if (o.headers && this.headers) lines.push(this.headers.slice(0, this.COLS).map(esc).join(','));
      for (let r = 0; r < this.ROWS; r++) {
        if (o.skipEmpty && this._rowEmpty(r)) continue;
        const cells = [];
        for (let c = 0; c < this.COLS; c++) cells.push(esc(o.formatted ? this._displayValue(r, c) : this.data[r][c]));
        lines.push(cells.join(','));
      }
      return lines.join(o.eol);
    }
    // CSV を即ダウンロード（UTF-8 BOM 付きで Excel(日本語)が文字化けしない）。
    downloadCSV(filename, opts) {
      const blob = new Blob(['\uFEFF' + this.toCSV(opts)], { type: 'text/csv;charset=utf-8;' });   // 先頭BOMでExcel(日本語)の文字化けを防ぐ
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = filename || 'export.csv';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
    getValue(r, c) { const ci = this._resolveCol(c); return ci < 0 ? undefined : this.data[r][ci]; }
    // 値を1セット（列は index か data キー）。履歴に積まれ undo 可。検証は通常経路どおり。
    // force=true で読み取り専用セルにも書ける（計算列など、プログラムからの確定的な書き込み用）。
    setValue(r, c, val, force) {
      const ci = this._resolveCol(c); if (ci < 0) return;
      const before = this.snapSel(), changes = [];
      this.setCell(r, ci, this._cellStr(val), changes);
      this.pushCmd(changes, before, this.snapSel(), 'edit', !!force);
    }
    // 履歴に積まず・検証も通さず値を直接セット（readOnly も貫通）。表示書式は描画時に適用。
    // 計算列など「入力から導く派生値」向け。undo/redo では入力セルが履歴復元され、onAfterChange で
    // これを呼んで再計算する流儀にする＝派生値が独立した undo ステップにならず入力に追従する。
    setValueRaw(r, c, val) {
      const ci = this._resolveCol(c); if (ci < 0 || r < 0 || r >= this.ROWS) return;
      const v = this._cellStr(val);
      if (this.data[r][ci] === v) return;
      this.data[r][ci] = v;
      this._renderCell(r, ci);
    }
    // 列定義(format/hour12 等)を変えた後の再描画。データと選択は保持。
    redraw() { this.buildTable(); this.setActive(this.active.r, this.active.c); }

    // ---- 並べ替え（A方式: データ実体を並べ替え。Undo には積まない／状態は行に追従） ----
    // 行を order(=新しい並びの「元index配列」)で再配置。data/rowH/_src と セル状態(整列/cellRO)も行ごと追従。
    _applyRowOrder(order) {
      this.data = order.map(r => this.data[r]);
      this.rowH = order.map(r => this.rowH[r]);
      if (this._src) this._src = order.map(r => this._src[r]);
      const pos = new Map(); order.forEach((oldR, newR) => pos.set(oldR, newR));
      this._align = this._mapCellKeys(this._align, (r, c) => pos.has(r) ? [pos.get(r), c] : null);
      this._cellRO = this._mapCellKeys(this._cellRO, (r, c) => pos.has(r) ? [pos.get(r), c] : null);
      if (this._merges && !this._hasVMerge()) this._merges.forEach(m => { m.r = pos.get(m.r); });   // 横結合のみ行順追従（縦結合時はそもそも move/sort をロック済み）
      this.buildTable(); this.setActive(0, 0);
    }
    // 未入力（空）行はソート対象外＝最下部へ固定。[並べ替える行index, 末尾固定する空行index]
    _sortBuckets() {
      const all = this.data.map((_, r) => r);
      return [all.filter(r => !this._rowEmpty(r)), all.filter(r => this._rowEmpty(r))];
    }
    // 初回ソート時に「入力順（行参照の並び）」を記録。編集ではズレず、clearSort() で戻せる。
    _rememberOrder() { if (!this._unsortedData) this._unsortedData = this.data.slice(); }
    // 列 c（index か data キー）で並べ替え。dir='asc'(既定)|'desc'。数値っぽければ数値比較、でなければ文字列比較。
    sortBy(c, dir) {
      if (this._sortLocked()) return;   // 結合中はソート禁止（値による組み替えで結合帯が散らばる）
      const ci = this._resolveCol(c); if (ci < 0) return;
      const sgn = dir === 'desc' ? -1 : 1;
      this._rememberOrder();
      const [full, empty] = this._sortBuckets();
      full.sort((a, b) => {
        const va = this.data[a][ci], vb = this.data[b][ci];
        const na = TssGrid.toNum(va), nb = TssGrid.toNum(vb);
        const d = (na !== null && nb !== null) ? na - nb : String(va).localeCompare(String(vb));
        return d * sgn;
      });
      this._applyRowOrder(full.concat(empty));
    }
    // 任意比較で並べ替え。cmp(rowA, rowB) は行（配列 or オブジェクト）を受ける。空行は最下部固定。
    sortRows(cmp) {
      if (this._sortLocked()) return;   // 結合中はソート禁止
      this._rememberOrder();
      const rows = this._src ? this.getRows() : this.data;
      const [full, empty] = this._sortBuckets();
      full.sort((a, b) => cmp(rows[a], rows[b]));
      this._applyRowOrder(full.concat(empty));
    }
    // 並べ替えを解除して初期状態（入力順）に戻す。戻したら true。未ソートなら false。
    // 行参照ベースなので、ソート後に追加した行は末尾へ、削除済みの行は無視（堅牢）。
    clearSort() {
      if (!this._unsortedData) return false;
      const idxOf = new Map(this.data.map((row, i) => [row, i])), order = [];
      for (const ref of this._unsortedData) { const i = idxOf.get(ref); if (i !== undefined) { order.push(i); idxOf.delete(ref); } }
      this.data.forEach((row, i) => { if (idxOf.has(row)) order.push(i); });   // 後から増えた行は末尾へ
      this._unsortedData = null;
      this._applyRowOrder(order);
      return true;
    }
    isSorted() { return !!this._unsortedData; }

    // ---- 非破壊フィルタ（行インデックスマッパ） ----
    // フィルタ中も全行は _allRows に保持。this.data は可視部分集合（同じ行参照）＝編集は参照共有でマスタへ自動反映。
    // 選択/ナビ/結合/幾何は this.data(ビュー)と ROWS のまま無改変＝フィルタ未使用なら _allRows===null でゼロコスト。
    // 行ごとの可変状態(rowH/整列/セルRO)は行参照キーの _meta に退避して非破壊に往復。
    // フィルタ中も「行の挿入削除」は可（_allRows をマスタ追従＋Undo・同一フィルタ内）。filter/clearFilter は履歴クリア
    // （ビューindex基準の履歴が境界跨ぎで不整合になるため）。制限: 列の挿入削除・行移動・セル結合はロック。
    isFiltered() { return !!this._allRows; }
    // pred を関数化。関数はそのまま / {col: value|fn} は AND 条件（col は index か data キー） / falsy は解除。
    _normFilter(pred) {
      if (!pred) return null;
      if (typeof pred === 'function') return pred;
      if (typeof pred === 'object') {
        const conds = Object.keys(pred).map(k => {
          let ci = this._resolveCol(k); if (ci < 0) ci = this.headers.indexOf(k);   // data キー → 見出し名でも解決
          const want = pred[k]; return { ci, test: typeof want === 'function' ? want : (v => String(v) === String(want)) };
        }).filter(x => x.ci >= 0);
        return row => conds.every(cd => cd.test(row[cd.ci]));
      }
      return null;
    }
    // 現ビュー(this.data)の rowH/整列/セルRO を行参照キー(_meta)へ退避（ビューでの編集を保全）。
    _metaSyncFromView() {
      if (!this._meta) return;
      for (let r = 0; r < this.data.length; r++) this._meta.set(this.data[r], { a: new Map(), ro: new Set(), h: this.rowH[r] });
      this._align.forEach((v, k) => { const i = k.indexOf(','), ref = this.data[+k.slice(0, i)], m = ref && this._meta.get(ref); if (m) m.a.set(+k.slice(i + 1), v); });
      this._cellRO.forEach(k => { const i = k.indexOf(','), ref = this.data[+k.slice(0, i)], m = ref && this._meta.get(ref); if (m) m.ro.add(+k.slice(i + 1)); });
    }
    // 行参照列を this.data に据え、rowH/整列/RO を _meta から復元（ビューindex へ展開）。
    _metaApply(rows) {
      this.data = rows; this.ROWS = rows.length;
      this.rowH = rows.map(ref => { const m = this._meta.get(ref); return m ? m.h : undefined; });
      this._align = new Map(); this._cellRO = new Set();
      rows.forEach((ref, r) => { const m = this._meta.get(ref); if (!m) return; m.a.forEach((v, c) => this._align.set(r + ',' + c, v)); m.ro.forEach(c => this._cellRO.add(r + ',' + c)); });
    }
    // 絞り込み。pred=(row, masterIndex, src)=>bool / {col:value|fn} / falsy=解除。非破壊（編集は参照でマスタへ反映）。
    filter(pred) {
      if (this._merges && this._merges.length) return false;   // v1: 結合中は不可
      const fn = this._normFilter(pred);
      if (!fn) return this.clearFilter();
      if (this.mode === 'edit') this._commitActive();
      if (!this._allRows) { this._allRows = this.data.slice(); this._allSrc = this._src ? this._src.slice() : null; this._meta = new Map(); }
      this._metaSyncFromView();   // 既存ビューの編集(rowH/整列/RO)を ref へ退避
      this._filterFn = fn;
      const view = [], vsrc = this._allSrc ? [] : null;
      for (let i = 0; i < this._allRows.length; i++) { const row = this._allRows[i], src = this._allSrc ? this._allSrc[i] : undefined; if (fn(row, i, src)) { view.push(row); if (vsrc) vsrc.push(src); } }
      this._src = vsrc; this._metaApply(view); this._unsortedData = null;
      this.history.clear();   // ビューindex基準の履歴がフィルタ境界を跨ぐと不整合＝境界で履歴クリア（v1）
      this.buildTable();
      this._afterFilterSelect();
      if (this.onFilter) { try { this.onFilter({ count: view.length, total: this._allRows.length }); } catch (_) {} }
      return true;
    }
    // フィルタ解除＝全行を master 順で復元（フィルタ中に編集/値変更した分も含め非破壊に戻る）。
    clearFilter() {
      if (!this._allRows) return false;
      if (this.mode === 'edit') this._commitActive();
      this._metaSyncFromView();
      this._src = this._allSrc ? this._allSrc.slice() : null;
      this._metaApply(this._allRows.slice());
      this._allRows = this._allSrc = this._meta = this._filterFn = null; this._unsortedData = null;
      this.history.clear();   // フィルタ境界で履歴クリア（境界跨ぎの undo 不整合を回避・v1）
      this._padToMin(); this.buildTable(); this._ensureSpare();
      this._afterFilterSelect();
      if (this.onFilter) { try { this.onFilter({ count: this.ROWS, total: this.ROWS, cleared: true }); } catch (_) {} }
      return true;
    }
    _afterFilterSelect() {
      if (this.ROWS > 0) this.setActive(Math.min(this.active.r, this.ROWS - 1), this._snapVisCol(this.active.c));
      else { this.active = { r: 0, c: 0 }; this.extent = { r: 0, c: 0 }; this.selbox.style.display = this.selrange.style.display = this.fillhandle.style.display = 'none'; }
    }
    // マスタ(全行)を getRows 形式で取得（フィルタ中でも全件）。未フィルタなら getRows と同じ。
    getAllRows() {
      const rows = this._allRows || this.data, src = this._allRows ? this._allSrc : this._src;
      return rows.map((row, r) => { const o = src ? Object.assign({}, src[r]) : {}; for (let c = 0; c < this.COLS; c++) { const k = this._key(c); if (k != null) this._setPathCOW(o, k, row[c]); } return o; });
    }

    // ---- リスナ登録（destroy() 用に記録） / 後始末 ----
    _on(target, type, fn, opts) { target.addEventListener(type, fn, opts); this._listeners.push({ target, type, fn, opts }); }
    // グリッドを破棄: document/window リスナと ResizeObserver を外し、プラグインを destroy、DOM を空に。
    destroy() {
      if (this._destroyed) return;
      this._destroyed = true;
      if (this._vRAF) { try { cancelAnimationFrame(this._vRAF); } catch (_) {} this._vRAF = 0; }   // 仮想スクロールの保留フレームを破棄
      this._stopAutoScroll();   // ドラッグ自動スクロールの保留フレームを破棄
      for (const p of this._plugins) { if (p.handle && typeof p.handle.destroy === 'function') { try { p.handle.destroy(); } catch (_) {} } }
      this._plugins = [];
      if (this._ro) { try { this._ro.disconnect(); } catch (_) {} this._ro = null; }
      for (const l of this._listeners) { try { l.target.removeEventListener(l.type, l.fn, l.opts); } catch (_) {} }
      this._listeners = [];
      if (this._customEditor && this._customEditor.close) { try { this._customEditor.close(); } catch (_) {} }
      try { if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root); } catch (_) {}
    }

    // ---- カスタムショートカット（軽量 shortcut-manager / context） ----
    // keys: 'Ctrl+S' 等の文字列 or 配列。context: 'grid'(ナビ) | 'editor'(編集中) | 'all'(既定)。
    addShortcut(s) {
      const keys = Array.isArray(s.keys) ? s.keys : [s.keys];
      this._shortcuts.push({ name: s.name, context: s.context || 'all', handler: s.handler, sigs: keys.map(k => this._normSig(k)) });
    }
    removeShortcut(name) { this._shortcuts = this._shortcuts.filter(s => s.name !== name); }
    // 'Ctrl+Shift+K' → 正規シグネチャ。meta/cmd は Ctrl 扱い。1文字キーは小文字化。
    _normSig(str) {
      const parts = String(str).split('+').map(p => p.trim()).filter(Boolean);
      let ctrl = false, shift = false, alt = false, key = '';
      for (const p of parts) {
        const lp = p.toLowerCase();
        if (lp === 'ctrl' || lp === 'control' || lp === 'cmd' || lp === 'meta') ctrl = true;
        else if (lp === 'shift') shift = true;
        else if (lp === 'alt' || lp === 'option') alt = true;
        else key = p.length === 1 ? lp : p;
      }
      return (ctrl ? 'c' : '') + (shift ? 's' : '') + (alt ? 'a' : '') + ':' + key;
    }
    _evSig(e) {
      const key = e.key && e.key.length === 1 ? e.key.toLowerCase() : e.key;
      return ((e.ctrlKey || e.metaKey) ? 'c' : '') + (e.shiftKey ? 's' : '') + (e.altKey ? 'a' : '') + ':' + key;
    }
    // 登録ショートカットを照合。実行したら true（＝グリッド既定を抑止）。
    _runShortcuts(e) {
      if (!this._shortcuts.length) return false;
      const ctx = this.mode === 'edit' ? 'editor' : 'grid', sig = this._evSig(e);
      for (const sc of this._shortcuts) {
        if (sc.context !== 'all' && sc.context !== ctx) continue;
        if (sc.sigs.includes(sig)) {
          e.preventDefault();
          let ret; try { ret = sc.handler(e, { grid: this, context: ctx }); } catch (_) {}
          if (ret !== true) return true;   // handler が true を返した時だけ既定を続行
        }
      }
      return false;
    }

    // ---- プラグイン（軽量 base-plugin。init(grid)→任意の {destroy} を返す薄い契約） ----
    usePlugin(plugin, opts) {
      let factory = plugin, name;
      if (typeof plugin === 'string') { factory = TssGrid._plugins && TssGrid._plugins[plugin]; name = plugin; }
      if (!factory) return null;
      const handle = (typeof factory === 'function') ? factory(this, opts) : (typeof factory.init === 'function' ? factory.init(this, opts) : null);
      const entry = { name: name || (handle && handle.name) || (factory && factory.pluginName), handle: handle || {} };
      this._plugins.push(entry);
      return entry.handle;
    }
    getPlugin(name) { const p = this._plugins.find(p => p.name === name); return p ? p.handle : null; }
    static registerPlugin(name, factory) { (TssGrid._plugins || (TssGrid._plugins = {}))[name] = factory; }

    _build(container) {
      container.innerHTML =
        '<div class="tssgrid"><div class="tg-wrap">' +
        '<table class="tg-table"></table>' +
        '<div class="tg-selrange"></div><div class="tg-selbox"></div>' +
        '<div class="tg-copybox"></div><div class="tg-fillpreview"></div><div class="tg-fillhandle"></div>' +
        '<div class="tg-resizeguide"></div>' +
        '<input class="tg-editor nav" type="text" autocomplete="off" spellcheck="false">' +
        '<select class="tg-select" style="display:none"></select>' +
        '</div>' + (this.showDump ? '<pre class="tg-dump"></pre>' : '') +
        '<div class="tg-menu" style="display:none"></div></div>';
      const q = s => container.querySelector(s);
      this.wrap = q('.tg-wrap'); this.table = q('.tg-table');
      this.selrange = q('.tg-selrange'); this.selbox = q('.tg-selbox');
      this.copybox = q('.tg-copybox'); this.fillhandle = q('.tg-fillhandle'); this.fillpreview = q('.tg-fillpreview');
      this.resizeGuide = q('.tg-resizeguide');
      this.editor = q('.tg-editor'); this.select = q('.tg-select'); this.dumpEl = q('.tg-dump');
      this.menuEl = q('.tg-menu');
      this.root = q('.tssgrid');
      if (this.className) this.root.className += ' ' + this.className;  // 任意クラス（テーマ付け）
      if (this.wordWrap) this.root.classList.add('tg-wordwrap');        // グリッド全体の折り返し
      if (!this.cursor) this.root.classList.add('tg-no-cursor');        // 表示専用（選択枠なし＋セルカーソル既定）
      if (this.width) {
        this.wrap.style.width = this.width;                      // 幅制約（横スクロール／固定列用）
        if (this.dumpEl) this.dumpEl.style.width = this.width;   // ダンプ欄も枠幅に揃える
      }
      if (this.height) this.wrap.style.maxHeight = this.height;  // 高さ制約（縦スクロール用）
    }

    static esc(s) { return String(s).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])); }
    cellEl(r, c) { if (this._merges) { const a = this._anchorOf(r, c); r = a.r; c = a.c; } return this.table.querySelector('td[data-r="' + r + '"][data-c="' + c + '"]'); }
    activeTd() { return this.cellEl(this.active.r, this.active.c); }
    clampR(r) { return Math.max(0, Math.min(this.ROWS - 1, r)); }
    clampC(c) { return Math.max(0, Math.min(this.COLS - 1, c)); }
    renderDump() { if (this.dumpEl) this.dumpEl.textContent = JSON.stringify(this.data); if (this.onChange) this.onChange(this); }

    // ---- 列定義（セルタイプ / バリデータ） ----
    colCfg(c) { return this.columns[c] || {}; }
    colType(c) { return this.colCfg(c).type || 'text'; }
    // 読み取り専用判定（グリッド全体 / 列 readOnly: bool/関数 / セル単位 setCellReadOnly）。
    _isReadOnly(r, c) {
      if (this.readOnly) return true;
      if (this._merges && this._isCovered(r, c)) return true;   // 結合の従属セルは編集不可（貼付/フィルは既存の readOnly 経路で巻戻し）
      if (this._cellRO.has(r + ',' + c)) return true;   // セル単位の実行時トグル
      const ro = this.colCfg(c).readOnly;
      if (typeof ro === 'function') { try { return !!ro(this.data[r][c], { r, c }); } catch (_) { return false; } }
      return !!ro;
    }
    _hasReadOnly() { return this.readOnly || (this._merges && this._merges.length > 0) || this._cellRO.size > 0 || this.columns.some(cfg => cfg && cfg.readOnly); }
    // ---- セル単位の可変状態（整列 / 実行時 readOnly）。キーは "r,c"。 ----
    _ck(r, c) { return r + ',' + c; }
    // 列既定(align/valign) ＋ セル上書きを合成した実効整列。
    _cellAlign(r, c) {
      const cell = this._align.get(this._ck(r, c)) || {}, col = this.colCfg(c);
      return { h: cell.h || col.align || null, v: cell.v || col.valign || null };
    }
    _parseAlign(a) {
      if (a && typeof a === 'object') return { h: a.h || null, v: a.v || null };
      if (a === 'left' || a === 'center' || a === 'right') return { h: a };
      if (a === 'top' || a === 'middle' || a === 'bottom') return { v: a };
      return {};
    }
    getAlignment(r, c) { return this._cellAlign(r, c); }
    // 整列を設定（range 省略時は現在の選択範囲）。align='left|center|right|top|middle|bottom'|{h,v}|'reset'。非 Undo。
    setAlignment(align, range) {
      range = range || this.rectRange();
      const reset = align === 'reset' || align === 'none' || align == null;
      const { h, v } = reset ? {} : this._parseAlign(align);
      for (let r = range.r0; r <= range.r1; r++) for (let c = range.c0; c <= range.c1; c++) {
        const k = this._ck(r, c);
        if (reset) { this._align.delete(k); continue; }
        const cur = this._align.get(k) || {};
        if (h) cur.h = h; if (v) cur.v = v;
        this._align.set(k, cur);
      }
      this.buildTable(); this.setActive(this.active.r, this.active.c);
    }
    // セル単位の読み取り専用を設定（range 省略時は選択範囲）。非 Undo。
    setCellReadOnly(flag, range) {
      range = range || this.rectRange();
      for (let r = range.r0; r <= range.r1; r++) for (let c = range.c0; c <= range.c1; c++) {
        const k = this._ck(r, c);
        if (flag) this._cellRO.add(k); else this._cellRO.delete(k);
      }
      this.buildTable(); this.setActive(this.active.r, this.active.c);
    }
    // 構造変更でセル状態のキー("r,c")を追従。fn(r,c)→[r,c] | null(削除)。
    _mapCellKeys(coll, fn) {
      const isMap = coll instanceof Map, out = isMap ? new Map() : new Set();
      for (const e of coll) {
        const key = isMap ? e[0] : e, val = isMap ? e[1] : true;
        const [r, c] = key.split(',').map(Number), nk = fn(r, c);
        if (nk) { const k = nk[0] + ',' + nk[1]; isMap ? out.set(k, val) : out.add(k); }
      }
      return out;
    }
    _cloneCellState() { return { align: new Map(this._align), ro: new Set(this._cellRO) }; }
    _restoreCellState(s) { this._align = s.align; this._cellRO = s.ro; }
    _remapCellState(fn) { this._align = this._mapCellKeys(this._align, fn); this._cellRO = this._mapCellKeys(this._cellRO, fn); }
    // info.type → キー追従関数（行/列の挿入・削除）。
    _structRemapFn(info) {
      switch (info.type) {
        case 'insertRow': { const at = info.at; return (r, c) => [r >= at ? r + 1 : r, c]; }
        case 'deleteRows': { const { r0, r1 } = info, n = r1 - r0 + 1; return (r, c) => (r >= r0 && r <= r1) ? null : [r > r1 ? r - n : r, c]; }
        case 'insertCol': { const at = info.at; return (r, c) => [r, c >= at ? c + 1 : c]; }
        case 'deleteCols': { const { c0, c1 } = info, m = c1 - c0 + 1; return (r, c) => (c >= c0 && c <= c1) ? null : [r, c > c1 ? c - m : c]; }
        default: return null;
      }
    }
    // 構造変更で結合(矩形)の座標を追従。行/列の挿入削除を縦横対称に処理: 結合範囲の外なら平行移動、
    // 内側に挿入なら span 拡張、削除が範囲に重なれば縮小（端も削れたらアンカーを削除境界へ）、全消去なら解除。
    // 1x1 に縮んだ結合は解除。
    _remapMerges(info) {
      if (!this._merges || !this._merges.length) return;
      const out = [];
      for (const m of this._merges) {
        let { r, c, colspan } = m, rowspan = m.rowspan || 1;
        if (info.type === 'insertRow') { const at = info.at; if (at <= r) r++; else if (at < r + rowspan) rowspan++; }
        else if (info.type === 'deleteRows') {
          const { r0, r1 } = info, n = r1 - r0 + 1, top = r, bot = r + rowspan - 1;
          if (r0 <= top && r1 >= bot) continue;                          // 縦方向すべて消える
          if (r1 < top) r -= n;                                          // 全て上で削除=上シフト
          else if (r0 > bot) { /* 全て下で削除=影響なし */ }
          else { rowspan -= (Math.min(r1, bot) - Math.max(r0, top) + 1); if (r0 < top) r = r0; }   // 部分重なり=縮小
        }
        else if (info.type === 'insertCol') { const at = info.at; if (at <= c) c++; else if (at < c + colspan) colspan++; }
        else if (info.type === 'deleteCols') {
          const { c0, c1 } = info, n = c1 - c0 + 1, left = c, right = c + colspan - 1;
          if (c0 <= left && c1 >= right) continue;                       // 横方向すべて消える
          if (c1 < left) c -= n;                                         // 全て左で削除=左シフト
          else if (c0 > right) { /* 全て右で削除=影響なし */ }
          else { colspan -= (Math.min(c1, right) - Math.max(c0, left) + 1); if (c0 < left) c = c0; }   // 部分重なり=縮小
        }
        if (colspan >= 2 || rowspan >= 2) out.push({ r, c, colspan, rowspan });   // 1x1 に縮んだら結合解除
      }
      this._merges = out.length ? out : null;
    }
    _cbChecked(c) { const cfg = this.colCfg(c); return 'checked' in cfg ? String(cfg.checked) : '1'; }
    _cbUnchecked(c) { const cfg = this.colCfg(c); return 'unchecked' in cfg ? String(cfg.unchecked) : ''; }
    _isCheckedVal(c, v) {
      const cfg = this.colCfg(c);
      if ('checked' in cfg) return v === String(cfg.checked);
      return v === '1' || v === 'true' || v === 'TRUE' || v === 'yes' || v === '✓';
    }
    _hasColRules() { return this.columns.some(cfg => cfg && ((cfg.type && cfg.type !== 'text') || typeof cfg.validator === 'function' || typeof cfg.parse === 'function' || cfg.maxLength > 0)); }
    static _isISODate(s) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
      const [y, m, d] = s.split('-').map(Number);
      if (m < 1 || m > 12 || d < 1 || d > 31) return false;
      const dt = new Date(Date.UTC(y, m - 1, d));
      return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
    }
    static _isTime(s) {
      const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
      if (!m) return false;
      return +m[1] <= 23 && +m[2] <= 59 && (m[3] == null || +m[3] <= 59);
    }
    static _pad2(n) { return String(n).padStart(2, '0'); }
    // 列の既定見出し（Excel 風 A,B,…,Z,AA）。列挿入時の新規見出しに使う。
    static _colLabel(n) { let s = ''; n = n | 0; do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0); return s; }
    // 入力文字列 → 'yyyy-mm-dd'（不正は null）。yyyymmdd / yyyy-mm-dd / yyyy/mm/dd / yyyy.mm.dd を許容。
    static _parseDate(s) {
      s = String(s).trim(); if (s === '') return null;
      let y, m, d;
      const sep = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
      if (sep) { y = +sep[1]; m = +sep[2]; d = +sep[3]; }
      else if (/^\d{8}$/.test(s)) { y = +s.slice(0, 4); m = +s.slice(4, 6); d = +s.slice(6, 8); }
      else return null;
      const iso = y + '-' + TssGrid._pad2(m) + '-' + TssGrid._pad2(d);
      return TssGrid._isISODate(iso) ? iso : null;
    }
    // 入力文字列 → 24時間制 'HH:MM' / 'HH:MM:SS'（不正は null）。24h と 12h(AM/PM) の両方を受理。
    static _parseTime(s) {
      const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][.]?[Mm][.]?)?$/.exec(String(s).trim());
      if (!m) return null;
      let h = +m[1]; const mi = +m[2], se = m[3] == null ? null : +m[3];
      const ap = m[4] ? m[4][0].toLowerCase() : null;  // 'a' | 'p' | null
      if (ap) { if (h < 1 || h > 12) return null; h = ap === 'a' ? (h === 12 ? 0 : h) : (h === 12 ? 12 : h + 12); }
      if (h > 23 || mi > 59 || (se != null && se > 59)) return null;
      return TssGrid._pad2(h) + ':' + TssGrid._pad2(mi) + (se != null ? ':' + TssGrid._pad2(se) : '');
    }
    // 24時間制 'HH:MM[:SS]' → 12時間制 'h:MM[:SS] AM/PM' 表示。
    static _fmtTime12(s) {
      const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(s));
      if (!m) return s;
      let h = +m[1]; const ap = h < 12 ? 'AM' : 'PM';
      h = h % 12; if (h === 0) h = 12;
      return h + ':' + m[2] + (m[3] != null ? ':' + m[3] : '') + ' ' + ap;
    }
    // CellFormat: 入力(グルーピング/前後綴り混じり) → 正規化した数値文字列（保存値）。不正は null。
    // 全角→半角（数値文脈）。数字・符号・小数点・カンマ・%・¥・空白を半角化。業務フォームの IME 誤入力対策。
    static _zen2han(s) {
      return String(s)
        .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
        .replace(/＋/g, '+').replace(/[－−ー―]/g, '-')
        .replace(/．/g, '.').replace(/，/g, ',')
        .replace(/％/g, '%').replace(/￥/g, '¥').replace(/　/g, ' ');
    }
    static _parseNumber(v, cfg) {
      let s = String(v).trim();
      if (cfg.zenkaku !== false) s = TssGrid._zen2han(s);   // 既定で全角→半角（cfg.zenkaku:false で無効化）
      if (cfg.prefix) s = s.split(cfg.prefix).join('');
      if (cfg.suffix) s = s.split(cfg.suffix).join('');
      s = s.replace(/,/g, '').replace(/\s/g, '');
      if (s === '') return null;
      if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
      const n = Number(s);
      return Number.isFinite(n) ? String(n) : null;   // 正規（'1,234.50' → '1234.5'）
    }
    // CellFormat: 正規化数値文字列 → 表示（decimals/thousands/prefix/suffix）。getData は保存値のまま。
    static _formatNumber(v, cfg) {
      const n = Number(String(v).replace(/,/g, '').trim());
      if (!Number.isFinite(n)) return v;
      let s = cfg.decimals != null ? Math.abs(n).toFixed(cfg.decimals) : String(Math.abs(n));
      let [int, frac = ''] = s.split('.');
      if (cfg.thousands) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      const body = int + (frac ? '.' + frac : '');
      return (n < 0 ? '-' : '') + (cfg.prefix || '') + body + (cfg.suffix || '');
    }
    // CellFormat: 保存 ISO 'yyyy-mm-dd' をパターン表示。トークン: yyyy/yy/mm/m/dd/d（パターン文字は数字に置換＝衝突しない）。
    static _applyDatePattern(iso, pattern) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
      if (!m) return iso;   // ISO でなければそのまま（誤用時の保険）
      const y = m[1], mo = m[2], d = m[3];
      return String(pattern)
        .replace(/yyyy/g, y).replace(/yy/g, y.slice(2))
        .replace(/mm/g, mo).replace(/m/g, String(+mo))
        .replace(/dd/g, d).replace(/d/g, String(+d));
    }
    // 1セルの型強制 / 検証。{ ok, value, message } を返す。入力→保存値の正規化(parse)もここで。
    _coerceCell(r, c, value) {
      const cfg = this.colCfg(c); let v = value;
      const t = cfg.type || 'text';
      // parse: 入力文字列 → 保存値（カスタム優先 / 無ければ date・time の組込）
      if (v !== '') {
        if (typeof cfg.parse === 'function') {
          let p; try { p = cfg.parse(v, { r, c }); } catch (_) { p = null; }
          if (p == null || p === false) return { ok: false };
          v = String(p);
        } else if (t === 'date') {
          const p = TssGrid._parseDate(v); if (p == null) return { ok: false }; v = p;
        } else if (t === 'time') {
          const p = TssGrid._parseTime(v); if (p == null) return { ok: false }; v = p;
        } else if (t === 'number') {
          const p = TssGrid._parseNumber(v, cfg); if (p == null) return { ok: false }; v = p;
        }
      }
      if (t === 'dropdown') {
        if (v === '') { if (cfg.allowEmpty === false) return { ok: false }; }   // allowEmpty:false＝必須選択（空は不可）
        else if (!this._optList(c).some(o => o.value === v)) return { ok: false };   // 保存値は option の value と照合
      } else if (t === 'checkbox') {
        v = this._isCheckedVal(c, v) ? this._cbChecked(c) : this._cbUnchecked(c);
      }
      // 桁数(文字数)制限: maxLength 超過分を切り詰め（貼り付け/setValue もここで効く。入力中の打鍵は editor の maxlength でブロック）
      if (cfg.maxLength > 0 && typeof v === 'string' && v.length > cfg.maxLength) v = v.slice(0, cfg.maxLength);
      if (typeof cfg.validator === 'function') {
        let res; try { res = cfg.validator(v, { r, c }); } catch (_) { res = true; }
        if (res === false) return { ok: false, level: 'error' };
        if (typeof res === 'string') return { ok: false, level: 'error', message: res };   // 文字列＝そのまま本文（従来互換）
        if (res && typeof res === 'object') {   // { code, params?, level?, message? }＝コード管理。本文は messages から解決
          const m = this._resolveMessage(res.code, res.params, r, c, v);
          return { ok: false, code: res.code || null, level: res.level || m.level || 'error', message: res.message || m.message };
        }
      }
      return { ok: true, value: v };
    }
    // メッセージカタログ解決: code → { level, message }（{label}/{value}/params を差込）。カタログ未設定/未登録は code をそのまま。
    _resolveMessage(code, params, r, c, v) {
      const ctx = Object.assign({ label: (this.colCfg(c).title || this._key(c) || ''), value: v }, params || {});
      const interp = t => String(t).replace(/\{(\w+)\}/g, (_, k) => (ctx[k] != null ? ctx[k] : '{' + k + '}'));
      const cat = this.messages;
      if (typeof cat === 'function') { let t; try { t = cat(code, ctx); } catch (_) {} return { level: 'error', message: t != null ? String(t) : (code || '') }; }
      if (cat && typeof cat === 'object' && code != null) {
        const e = cat[code];
        if (e == null) return { level: 'error', message: String(code) };
        if (typeof e === 'object') return { level: e.level || 'error', message: interp(e.text != null ? e.text : (e.message != null ? e.message : code)) };
        return { level: 'error', message: interp(e) };
      }
      return { level: 'error', message: code || '' };
    }
    // 現在の全セルを検証し、NG セルを [{r,c,value,message}] で返す（空セルは検証対象＝必須dropdown等のみ拾う）。
    // 複数エラーをプログラム側でまとめて表示したい時に。invalidMode に依存せず「今の値」を判定する。
    getInvalidCells() {
      const out = [];
      for (let r = 0; r < this.ROWS; r++) for (let c = 0; c < this.COLS; c++) {
        if (this._isHidden(c)) continue;
        const v = this.data[r][c];
        const res = this._coerceCell(r, c, v);
        if (!res.ok) out.push({ r, c, key: this._key(c), value: v, code: res.code || null, level: res.level || 'error', message: res.message || null });
      }
      return out;
    }
    // ネイティブ入力(date/time ピッカー)を使う列か。使わない=テキスト入力。
    _nativeInputType(c) {
      const cfg = this.colCfg(c), t = cfg.type;
      if ((t === 'date' || t === 'time') && cfg.picker !== false && !cfg.format && typeof cfg.parse !== 'function' && !cfg.hour12) return t;
      return null;
    }
    _usesTextEditor(c) {
      if (this.colCfg(c).editor) return false;   // カスタムエディタは共有 input を使わない
      const t = this.colType(c);
      return t !== 'checkbox' && t !== 'dropdown' && !this._nativeInputType(c);
    }
    // 保存値 → セル表示文字列（format 適用）。getData は保存値のまま。
    _displayValue(r, c) {
      const cfg = this.colCfg(c), v = this.data[r][c];
      if (v === '') return v;
      if (typeof cfg.format === 'function') {
        try { const out = cfg.format(v, { r, c }); return out == null ? '' : String(out); } catch (_) { return v; }
      }
      if (typeof cfg.format === 'string') return TssGrid._applyDatePattern(v, cfg.format);  // 日付パターン表示
      if (cfg.type === 'number') return TssGrid._formatNumber(v, cfg);  // 数値書式（カンマ/小数/前後綴り）
      if (cfg.type === 'time' && cfg.hour12) return TssGrid._fmtTime12(v);  // 組込 12時間表示
      if (cfg.type === 'dropdown') return this._optLabel(c, v);  // options が {value,label} なら表示はラベル
      return v;
    }
    // dropdown の options を [{value,label}] に正規化（文字列なら value=label）。値↔表示を分けられる。
    _optList(c) {
      return (this.colCfg(c).options || []).map(o =>
        (o && typeof o === 'object') ? { value: String(o.value), label: String(o.label != null ? o.label : o.value) }
                                     : { value: String(o), label: String(o) });
    }
    _optLabel(c, value) { const o = this._optList(c).find(x => x.value === value); return o ? o.label : value; }
    // 編集開始時にエディタへ入れる文字列。number は Excel風に「素の数値」を出す（書式は表示専用）。
    // ネイティブ(date/time picker)は保存値、それ以外のテキスト編集は表示形。
    _editText(r, c) {
      if (this._nativeInputType(c)) return this.data[r][c];
      if (this.colType(c) === 'number') return this.data[r][c];
      return this._displayValue(r, c);
    }
    // td の中身を型に応じて描画。data は確定済み前提。空セルは placeholder（あれば）を表示。
    _cellHTML(r, c) {
      if (this.colType(c) === 'checkbox')
        return '<input type="checkbox" class="tg-cb" tabindex="-1"' + (this._isReadOnly(r, c) ? ' disabled' : '') + (this._isCheckedVal(c, this.data[r][c]) ? ' checked' : '') + '>';
      if (this.data[r][c] === '' && this._placeholder(c) != null) return TssGrid.esc(this._placeholder(c));
      // html:true の列は表示だけ生HTML（値はテキスト保存のまま）。エスケープを外す＝XSS責任は format/値の提供側。
      if (this.colCfg(c).html) return this._displayValue(r, c);
      return TssGrid.esc(this._displayValue(r, c));
    }
    // 条件付き書式: 列版 columns[c].cellClass(value,{r,c,row,src}) ＋ 全体版 cellClass(r,c,value,row,src)。
    // src = 元レコード（オブジェクトデータ時。非表示フィールドも見える＝休日区分など隠し列基準の色付けに）。
    _cellClasses(r, c) {
      const out = [], v = this.data[r][c], src = this._src ? this._src[r] : null;
      const push = x => { if (x) out.push(...(Array.isArray(x) ? x : String(x).split(/\s+/))); };
      const cc = this.colCfg(c).cellClass;
      if (typeof cc === 'function') { try { push(cc(v, { r, c, row: this.data[r], src })); } catch (_) {} }
      if (typeof this.cellClass === 'function') { try { push(this.cellClass(r, c, v, this.data[r], src)); } catch (_) {} }   // row=値配列, src=元レコード
      return out.filter(Boolean);
    }
    // 条件付きクラスをセルに反映（前回分 data-ccls を外してから付け直す＝値変更で追従）。
    _applyCellClass(td, r, c) {
      const prev = td.dataset.ccls ? td.dataset.ccls.split(' ') : [];
      for (const k of prev) if (k) td.classList.remove(k);
      const next = this._cellClasses(r, c);
      for (const k of next) td.classList.add(k);
      if (next.length) td.dataset.ccls = next.join(' '); else delete td.dataset.ccls;
    }
    // セル単位のインラインスタイル: 列版 columns[c].cellStyle(value,{r,c,row,src}) ＋ 全体版 cellStyle(r,c,value,row,src)。
    // 返り値は CSSプロパティのオブジェクト {'background':'#fde','--pct':'42%'} か文字列 'background:#fde;--pct:42%'。
    // cellClass（クラス＝離散）では出せない**連続値の背景色・データバー幅（CSS変数）**などに（プロパティ名は kebab/標準名 or --var）。
    _cellStyleObj(r, c) {
      const out = {}, v = this.data[r][c], src = this._src ? this._src[r] : null;
      const merge = res => {
        if (!res) return;
        if (typeof res === 'string') res.split(';').forEach(d => { const i = d.indexOf(':'); if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim(); });
        else if (typeof res === 'object') for (const k in res) out[k] = res[k];
      };
      const cs = this.colCfg(c).cellStyle;
      if (typeof cs === 'function') { try { merge(cs(v, { r, c, row: this.data[r], src })); } catch (_) {} }
      if (typeof this.cellStyle === 'function') { try { merge(this.cellStyle(r, c, v, this.data[r], src)); } catch (_) {} }
      return out;
    }
    // インラインスタイルをセルに反映（前回分 data-cstyle のプロパティを消してから付け直す＝値変更で追従）。
    _applyCellStyle(td, r, c) {
      const prev = td.dataset.cstyle ? td.dataset.cstyle.split(' ') : [];
      for (const k of prev) if (k) td.style.removeProperty(k);
      const obj = this._cellStyleObj(r, c), keys = Object.keys(obj);
      for (const k of keys) td.style.setProperty(k, obj[k]);
      if (keys.length) td.dataset.cstyle = keys.join(' '); else delete td.dataset.cstyle;
    }
    _renderCell(r, c) {
      if (this._merges && this._isCovered(r, c)) return;   // 従属セルは描画対象なし（cellEl はアンカーへ解決＝誤って上書きしない）
      const td = this.cellEl(r, c); if (!td) return;
      const ph = (this.data[r][c] === '' && this.colType(c) !== 'checkbox') ? this._placeholder(c) : null;
      if (this.colType(c) === 'checkbox' || (this.colCfg(c).html && ph == null)) td.innerHTML = this._cellHTML(r, c);
      else td.textContent = ph != null ? ph : this._displayValue(r, c);
      td.classList.toggle('tg-placeholder', ph != null);
      if (this._marksInvalid) {
        const res = this._coerceCell(r, c, this.data[r][c]);
        td.classList.toggle('tg-invalid', !res.ok);
        if (!res.ok) td.dataset.errLevel = res.level || 'error'; else delete td.dataset.errLevel;   // CSS で level 別トーン可
        if (this.invalidTitle) { if (!res.ok) td.title = res.message || '入力値が不正です'; else td.removeAttribute('title'); }
      }
      if (this.cellClass || this.colCfg(c).cellClass) this._applyCellClass(td, r, c);   // 条件付き書式
      if (this.cellStyle || this.colCfg(c).cellStyle) this._applyCellStyle(td, r, c);   // セル単位インラインスタイル
    }

    _colWidth(c) { return this.colW[c] != null ? this.colW[c] : this.defColW; }
    _rowHeight(r) { return this.rowH[r] != null ? this.rowH[r] : this.defRowH; }
    _rhW() { return this.rowHeaders ? this.rowHeaderW : 0; }   // 行ヘッダ列の幅（非表示なら 0）
    // 行ヘッダの表示内容: false=空（数字なし）/ 関数=カスタム（エスケープ）/ 既定=行番号(r+1)。
    _rowHeadLabel(r) {
      const L = this.rowHeaderLabel;
      if (L === false) return '';
      if (typeof L === 'function') { let v; try { v = L(r); } catch (_) {} return TssGrid.esc(v == null ? '' : v); }
      return (r + 1);
    }
    // ---- 列の非表示 ----
    _isHidden(c) { return this.hiddenCols.has(c); }
    _visCols() { const a = []; for (let c = 0; c < this.COLS; c++) if (!this.hiddenCols.has(c)) a.push(c); return a; }
    _firstVisCol() { for (let c = 0; c < this.COLS; c++) if (!this.hiddenCols.has(c)) return c; return 0; }
    _lastVisCol() { for (let c = this.COLS - 1; c >= 0; c--) if (!this.hiddenCols.has(c)) return c; return this.COLS - 1; }
    // c から方向 dir(+1/-1) の次の可視列。無ければ c のまま（端）。
    _stepVisCol(c, dir) { for (let n = c + dir; n >= 0 && n < this.COLS; n += dir) if (!this.hiddenCols.has(n)) return n; return c; }
    // c が隠れていれば最寄りの可視列へスナップ。
    _snapVisCol(c) {
      if (!this.hiddenCols.has(c)) return c;
      for (let d = 1; d < this.COLS; d++) {
        if (c + d < this.COLS && !this.hiddenCols.has(c + d)) return c + d;
        if (c - d >= 0 && !this.hiddenCols.has(c - d)) return c - d;
      }
      return c;
    }
    // ---- セル結合（矩形: colspan×rowspan）。アンカー=(r,c)=左上が値・編集・選択の対象。覆われたセルは描画スキップ＋読取専用。
    // 解決ヘルパは描画/ナビ/選択で共有。実際の merge/unmerge API と値クリア意味論は plugins/tss-merge が担う。
    // _merges が null の間は全分岐をショートサーキット＝結合未使用なら一切コスト無し。横結合は rowspan=1。
    _mergeAt(r, c) {   // (r,c) を覆う結合（アンカー自身も含む）。無ければ null
      if (!this._merges) return null;
      for (const m of this._merges) { const rs = m.rowspan || 1; if (r >= m.r && r < m.r + rs && c >= m.c && c < m.c + m.colspan) return m; }
      return null;
    }
    _isCovered(r, c) { const m = this._mergeAt(r, c); return !!m && !(m.r === r && m.c === c); }  // アンカー以外＝従属セル
    _anchorOf(r, c) { const m = this._mergeAt(r, c); return m ? { r: m.r, c: m.c } : { r, c }; }
    _colspanAt(r, c) { const m = this._mergeAt(r, c); return (m && m.r === r && m.c === c) ? m.colspan : 1; }
    _rowspanAt(r, c) { const m = this._mergeAt(r, c); return (m && m.r === r && m.c === c) ? (m.rowspan || 1) : 1; }
    // c から方向 dir の次セル（結合幅を跨ぐ）。アンカー/従属なら結合の端から踏み出す＝merge 内で詰まらない。
    _stepColM(r, c, dir) {
      if (!this._merges) return this._stepVisCol(c, dir);
      const m = this._mergeAt(r, c);
      return this._stepVisCol(m ? (dir > 0 ? m.c + m.colspan - 1 : m.c) : c, dir);
    }
    // r から方向 dir の次行（結合高を跨ぐ）。行は非表示概念が無いので素直に ±1（端は setActive の clampR 任せ）。
    _stepRowM(r, c, dir) {
      if (!this._merges) return r + dir;
      const m = this._mergeAt(r, c);
      return (m ? (dir > 0 ? m.r + (m.rowspan || 1) - 1 : m.r) : r) + dir;
    }
    // ソートは結合中ロック（値で行順を組み替えると結合帯が散らばり分かりにくい＝既定の方針）。
    _sortLocked() { return !!(this._merges && this._merges.length); }
    // 縦結合(rowspan>1)が在ると行移動は禁止（行順を崩すと結合が分断＝Handsontable の auto-split 相当を避ける）。
    // 横結合のみなら _applyRowOrder が座標追従するので移動可。
    _hasVMerge() { return !!(this._merges && this._merges.some(m => (m.rowspan || 1) > 1)); }
    isColumnHidden(c) { return this.hiddenCols.has(this.clampC(c)); }
    getHiddenColumns() { return [...this.hiddenCols].sort((a, b) => a - b); }
    hideColumn(c) {
      c = this.clampC(c);
      if (this.hiddenCols.has(c) || this._visCols().length <= 1) return;   // 最低1列は残す
      this.hiddenCols.add(c);
      this.buildTable(); this.setActive(this.active.r, this._snapVisCol(this.active.c));
    }
    showColumn(c) {
      c = this.clampC(c);
      if (!this.hiddenCols.has(c)) return;
      this.hiddenCols.delete(c);
      this.buildTable(); this.setActive(this.active.r, this.active.c);
    }
    toggleColumn(c) { this.hiddenCols.has(this.clampC(c)) ? this.showColumn(c) : this.hideColumn(c); }
    _placeholder(c) { const p = this.colCfg(c).placeholder; return p != null ? String(p) : this.placeholder; }
    _totalWidth() { let w = this._rhW(); for (let c = 0; c < this.COLS; c++) if (!this._isHidden(c)) w += this._colWidth(c); return w; }
    // テーブルに合計幅を明示。これが無いと狭い枠で fixed レイアウトが列を比例圧縮し、
    // 保存値(colW)と実描画幅がズレてリサイズのプレビュー線が外れる。
    _applyTableWidth() { this.table.style.width = this._totalWidth() + 'px'; }
    // 固定列の sticky left オフセットを設定（rowhead 40px + 先行列幅の累積）。幅変更後も呼ぶ。
    _applyFrozen() {
      if (!this.frozenCols) return;
      const leftOf = [];
      let left = this._rhW();
      for (let c = 0; c < this.COLS; c++) {
        leftOf[c] = left;                  // 列 c の sticky-left オフセット
        if (this._isHidden(c)) continue;   // 隠し列は幅0・固定対象外
        if (c < this.frozenCols) {
          const th = this.table.querySelector('thead th[data-c="' + c + '"]');
          if (th) th.style.left = left + 'px';
          this.table.querySelectorAll('td[data-c="' + c + '"]').forEach(td => td.style.left = left + 'px');
        }
        left += this._colWidth(c);
      }
      // ネストヘッダ: 固定範囲のグループ見出しも先頭列のオフセットで sticky-left に
      this.table.querySelectorAll('thead th.tg-grouphdr.tg-frozen').forEach(th => {
        const c0 = +th.dataset.c0;
        if (c0 >= 0 && leftOf[c0] != null) th.style.left = leftOf[c0] + 'px';
      });
    }
    // 左から n 列を固定（実行時変更可）
    freezeCols(n) { this.frozenCols = Math.max(0, Math.min(this.COLS, n | 0)); this.buildTable(); this.setActive(this.active.r, this.active.c); }
    // 行固定: 上から frozenRows 行を sticky top で固定。top はヘッダ高＋上の固定行高の累積。
    _applyFrozenRows() {
      if (!this.frozenRows) return;
      let top = this.colHeaders ? (this._theadH || 0) : 0;
      for (let r = 0; r < this.frozenRows && r < this.ROWS; r++) {
        const tr = this.table.querySelector('tr[data-r="' + r + '"]');
        if (tr) tr.querySelectorAll('th,td').forEach(cell => cell.style.top = top + 'px');
        top += this._rowHeight(r);
      }
    }
    // 上から n 行を固定（実行時変更可）
    freezeRows(n) { this.frozenRows = Math.max(0, Math.min(this.ROWS, n | 0)); this.buildTable(); this.setActive(this.active.r, this.active.c); }
    // リーフ（実列に対応する）ヘッダ行を生成。labels 指定時はその文字列/ {label} を見出しに使う。
    _leafHeaderTr(withCorner, labels) {
      let html = '<tr>' + (withCorner ? '<th class="rowhead corner"></th>' : '');
      for (let c = 0; c < this.COLS; c++) {
        const cls = [];
        if (c < this.frozenCols) { cls.push('tg-frozen'); if (c === this.frozenCols - 1) cls.push('tg-frozen-edge'); }
        if (this._isHidden(c)) cls.push('tg-hidden');
        const a = cls.length ? ' class="' + cls.join(' ') + '"' : '';
        const grip = (this.resizeCols && this.colCfg(c).resizable !== false) ? '<div class="tg-colgrip"></div>' : '';
        const headCb = (this.colType(c) === 'checkbox' && this.colCfg(c).headerCheckbox !== false) ? '<input type="checkbox" class="tg-cb tg-head-cb" tabindex="-1">' : '';
        let lbl = labels ? labels[c] : this.headers[c];
        if (lbl && typeof lbl === 'object') lbl = lbl.label != null ? lbl.label : '';
        html += '<th data-c="' + c + '"' + a + '>' + headCb + TssGrid.esc(lbl != null ? lbl : '') + grip + '</th>';
      }
      return html + '</tr>';
    }
    // ネストヘッダ: 各ヘッダ行を異なる top で sticky（段が重ならないように積む）。
    _applyHeaderSticky() {
      if (!this.nestedHeaders) return;
      let top = 0;
      this.table.querySelectorAll('thead tr').forEach(tr => {
        tr.querySelectorAll('th').forEach(th => { th.style.top = top + 'px'; });
        top += tr.offsetHeight;
      });
    }
    // 1行ぶんの <tr>…</tr> を生成（buildTable の本体ループと、仮想スクロールの窓再描画 _renderWindow で共用）。
    _rowHTML(r) {
      const rh = this.rowHeaders;
      const rgrip = (rh && this.resizeRows) ? '<div class="tg-rowgrip"></div>' : '';
      const canMove = rh && this.rowReorder && !this._hasVMerge();
      const lbl = this._rowHeadLabel(r);
      const after = this.rowReorderMark === 'after' && lbl !== '';   // 番号が無いなら「前/後」は無意味＝中央に固定（マージンも消す）
      const markCls = 'tg-rowmove' + (lbl === '' ? ' tg-mark-only' : (after ? ' tg-mark-after' : ''));
      const mark = (canMove && this.rowReorderMark !== false) ? '<span class="' + markCls + '" title="ドラッグで行を移動">⠿</span>' : '';
      const inner = after ? (lbl + mark) : (mark + lbl);   // ⠿ を番号の前/後に（rowReorderMark）。番号なしは前後どちらでも中央
      const rhCls = (canMove && this.rowReorderWhole) ? ' tg-rowmove-cell' : '';   // 'header'=行ヘッダーセル全体を掴み手に（grab カーソル）。番号/⠿の表示は独立
      const rcls = (r < this.frozenRows) ? (' tg-frozen-row' + (r === this.frozenRows - 1 ? ' tg-frozen-row-edge' : '')) : '';   // 行固定
      let html = '<tr data-r="' + r + '" class="tg-row' + rcls + '" style="height:' + this._rowHeight(r) + 'px">' + (rh ? '<th class="rowhead' + rhCls + '" data-r="' + r + '">' + inner + rgrip + '</th>' : '');
      for (let c = 0; c < this.COLS; c++) {
        if (this._merges && this._isCovered(r, c)) continue;   // 結合に覆われた従属セルは td を出さない（アンカーが colspan で覆う）
        const cs = this._merges ? this._colspanAt(r, c) : 1;   // 結合アンカーは colspan で従属列ぶんを覆う
        const rs = this._merges ? this._rowspanAt(r, c) : 1;   // 縦結合は rowspan で従属行ぶんを覆う
        const cls = [];
        if (cs > 1 || rs > 1) cls.push('tg-merged');   // 結合アンカー（CSS で中央寄せ等のフック）
        if (c < this.frozenCols) { cls.push('tg-frozen'); if (c === this.frozenCols - 1) cls.push('tg-frozen-edge'); }
        if (this._isHidden(c)) cls.push('tg-hidden');   // 非表示列
        if (this.colType(c) === 'dropdown') cls.push('tg-dropdown');  // ▾ キャレット表示用
        if (this.colType(c) === 'number') cls.push('tg-num');  // 数値は右寄せ
        if (this._isReadOnly(r, c)) cls.push('tg-readonly');  // 読み取り専用（淡色＋カーソル既定）
        if (this.colCfg(c).wordWrap) cls.push('tg-wrap-cell');  // 列単位の折り返し
        if (this.data[r][c] === '' && this._placeholder(c) != null) cls.push('tg-placeholder');  // 空セルのヒント
        const al = this._cellAlign(r, c);   // 整列（列既定＋セル上書き）
        if (al.h) cls.push('tg-h-' + al.h); if (al.v) cls.push('tg-v-' + al.v);
        let titleAttr = '';
        if (this._marksInvalid) { const _iv = this._coerceCell(r, c, this.data[r][c]); if (!_iv.ok) { cls.push('tg-invalid'); titleAttr = ' data-err-level="' + TssGrid.esc(_iv.level || 'error') + '"'; if (this.invalidTitle) titleAttr += ' title="' + TssGrid.esc(_iv.message || '入力値が不正です') + '"'; } }
        const ed = this.colCfg(c).editor;   // カスタムエディタが icon を申告していれば右端に表示
        const ico = (ed && ed.icon) ? ' data-ico="' + TssGrid.esc(ed.icon) + '"' : '';
        if (ico) cls.push('tg-haspicker');
        const ccls = (this.cellClass || this.colCfg(c).cellClass) ? this._cellClasses(r, c) : [];   // 条件付き書式
        for (const k of ccls) cls.push(k);
        const dccls = ccls.length ? ' data-ccls="' + TssGrid.esc(ccls.join(' ')) + '"' : '';
        let sty = '';   // セル単位インラインスタイル（連続色・データバー幅などCSS変数も）
        if (this.cellStyle || this.colCfg(c).cellStyle) {
          const so = this._cellStyleObj(r, c), sk = Object.keys(so);
          if (sk.length) { let css = ''; for (const k of sk) css += k + ':' + so[k] + ';'; sty = ' style="' + TssGrid.esc(css) + '" data-cstyle="' + TssGrid.esc(sk.join(' ')) + '"'; }
        }
        const a = cls.length ? ' class="' + cls.join(' ') + '"' : '';
        const csAttr = (cs > 1 ? ' colspan="' + cs + '"' : '') + (rs > 1 ? ' rowspan="' + rs + '"' : '');
        html += '<td' + a + ico + dccls + sty + titleAttr + csAttr + ' data-r="' + r + '" data-c="' + c + '">' + this._cellHTML(r, c) + '</td>';
      }
      return html + '</tr>';
    }
    // 仮想スクロール: 現在の scrollTop から描画すべき窓 [start,end)（絶対行）を算出。バッファ込み。
    _vWindow() {
      const rowH = this.defRowH;
      const viewH = (this.wrap && this.wrap.clientHeight) || parseInt(this.height, 10) || 400;
      const visible = Math.ceil(viewH / rowH) + 1;
      const scrollTop = this.wrap ? this.wrap.scrollTop : 0;
      let start = Math.floor(scrollTop / rowH) - this._vBuf;
      if (start < 0) start = 0;
      let end = start + visible + this._vBuf * 2;
      if (end > this.ROWS) end = this.ROWS;
      return { start, end };
    }
    // 仮想スクロール: tbody を窓ぶん＋上下スペーサ行に差し替え（buildTable せず軽量再描画）。
    _renderWindow(win, force) {
      if (!force && this._vRendered && win.start === this._vStart && win.end === this._vEnd) return false;
      const tbody = this.table && this.table.querySelector('tbody');
      if (!tbody) return false;
      const rh = this.rowHeaders, colsSpan = this.COLS + (rh ? 1 : 0);
      const topH = win.start * this.defRowH, botH = (this.ROWS - win.end) * this.defRowH;
      let html = '';
      if (topH > 0) html += '<tr class="tg-vspace" aria-hidden="true" style="height:' + topH + 'px"><td colspan="' + colsSpan + '"></td></tr>';
      for (let r = win.start; r < win.end; r++) html += this._rowHTML(r);
      if (botH > 0) html += '<tr class="tg-vspace" aria-hidden="true" style="height:' + botH + 'px"><td colspan="' + colsSpan + '"></td></tr>';
      tbody.innerHTML = html;
      this._vStart = win.start; this._vEnd = win.end; this._vRendered = true;
      this._syncHeaderCheckboxes();
      this.updateSelectionUI();   // セルが作り直されたので窓内の選択シェード/オーバーレイを再適用
      return true;
    }
    // 仮想スクロール: スクロールで窓がずれたら再描画（rAF スロットル）。
    _vSync() {
      if (!this.virtual || this._vRAF) return;
      this._vRAF = requestAnimationFrame(() => {
        this._vRAF = 0;
        if (this._destroyed) return;
        this._renderWindow(this._vWindow(), false);
      });
    }
    // 仮想スクロール: 行 r を可視域に入れる（scrollTop 調整→窓を同期描画）。setActive/setExtent から。
    _vEnsureVisible(r) {
      if (!this.virtual || !this.wrap) return;
      const rowH = this.defRowH, head = this._theadH || 0;
      const rowTop = head + r * rowH;
      const cur = this.wrap.scrollTop, viewH = this.wrap.clientHeight || 400;
      let st = cur;
      if (rowTop < cur + head) st = rowTop - head;                 // 上のヘッダ下に隠れてる→上端へ
      else if (rowTop + rowH > cur + viewH) st = rowTop + rowH - viewH;  // 下に隠れてる→下端へ
      if (st !== cur) this.wrap.scrollTop = st;
      this._renderWindow(this._vWindow(), false);   // 窓を即同期（place 前に DOM を確定）
    }
    buildTable() {
      if (this._customEditor && this._customCancel) this._customCancel();   // 開いているカスタムエディタを閉じる（body直下ポップアップの取り残し防止・_commitActive と同じ扱い）
      this._selhdrFg = null;   // 選択ヘッダ文字色キャッシュ破棄（テーマ変更に追従）
      const rh = this.rowHeaders;
      let html = '<colgroup>' + (rh ? '<col style="width:' + this.rowHeaderW + 'px">' : '');
      for (let c = 0; c < this.COLS; c++) html += '<col data-c="' + c + '"' + (this._isHidden(c) ? ' class="tg-hidden"' : '') + ' style="width:' + (this._isHidden(c) ? 0 : this._colWidth(c)) + 'px">';
      html += '</colgroup>';
      if (this.colHeaders) {
        html += '<thead>';
        if (this.nestedHeaders) {
          const nRows = this.nestedHeaders.length, leaf = this.nestedHeaders[nRows - 1];
          this.nestedHeaders.slice(0, -1).forEach((row, ri) => {   // 上段グループ行（colspan）
            html += '<tr class="tg-group-row">' + (rh && ri === 0 ? '<th class="rowhead corner" rowspan="' + nRows + '"></th>' : '');
            let c = 0;
            for (const spec of row) {
              const isObj = spec && typeof spec === 'object';
              const span = Math.max(1, (isObj && spec.colspan) ? spec.colspan : 1);
              const label = isObj ? (spec.label != null ? spec.label : '') : (spec != null ? spec : '');
              const c1 = c + span - 1;
              // 固定列の範囲に収まるグループ見出しは固定列に追従（left は _applyFrozen が設定）。境界をまたぐ群は固定しない。
              const froz = (c1 < this.frozenCols) ? (' tg-frozen' + (c1 === this.frozenCols - 1 ? ' tg-frozen-edge' : '')) : '';
              html += '<th class="tg-grouphdr' + froz + '" colspan="' + span + '" data-c0="' + c + '" data-c1="' + c1 + '">' + TssGrid.esc(label) + '</th>';
              c += span;
            }
            html += '</tr>';
          });
          html += this._leafHeaderTr(false, leaf);     // リーフ段（角は上で rowspan 済み）
        } else {
          html += this._leafHeaderTr(rh, null);
        }
        html += '</thead>';
      }
      html += '<tbody>';
      if (this.virtual) {
        const win = this._vWindow(); this._vStart = win.start; this._vEnd = win.end; this._vRendered = true;
        const colsSpan = this.COLS + (rh ? 1 : 0);
        const topH = win.start * this.defRowH, botH = (this.ROWS - win.end) * this.defRowH;
        if (topH > 0) html += '<tr class="tg-vspace" aria-hidden="true" style="height:' + topH + 'px"><td colspan="' + colsSpan + '"></td></tr>';
        for (let r = win.start; r < win.end; r++) html += this._rowHTML(r);
        if (botH > 0) html += '<tr class="tg-vspace" aria-hidden="true" style="height:' + botH + 'px"><td colspan="' + colsSpan + '"></td></tr>';
      } else {
        for (let r = 0; r < this.ROWS; r++) html += this._rowHTML(r);
      }
      html += '</tbody>';
      this.table.innerHTML = html;
      const thd = this.table.querySelector('thead');
      this._theadH = (this.colHeaders && thd) ? thd.offsetHeight : 0;   // ヘッダ高をキャッシュ（クリップ計算用）
      this._applyTableWidth();
      this._applyStretch();
      this._applyHeaderSticky();
      this._applyFrozen();
      this._applyFrozenRows();
      this._syncHeaderCheckboxes();
      this._buildGeomCache();   // 実測幾何キャッシュ（全 _apply 後＝幅高が確定してから）
      this.renderDump();
    }
    // ---- checkbox 列の全選択（ヘッダ） ----
    // c 以外の列が全部空＝「追加用の空行」。全選択や状態判定はこの行を対象外にする
    // （在庫だけ ON にして空行が中身ありに化け、空行が増殖するのを防ぐ）。
    _rowBlankExcept(r, c) {
      for (let cc = 0; cc < this.COLS; cc++) { if (cc === c) continue; if (this.data[r][cc] !== '') return false; }
      return true;
    }
    _columnCheckState(c) {
      let checked = 0, total = 0;
      for (let r = 0; r < this.ROWS; r++) {
        if (this._rowBlankExcept(r, c)) continue;
        total++; if (this._isCheckedVal(c, this.data[r][c])) checked++;
      }
      return total === 0 ? 'none' : (checked === total ? 'all' : (checked === 0 ? 'none' : 'some'));
    }
    // ヘッダの全選択チェックボックスの見た目を現在の列状態に同期（some は indeterminate）。
    _syncHeaderCheckboxes() {
      if (!this.colHeaders) return;
      for (let c = 0; c < this.COLS; c++) {
        if (this.colType(c) !== 'checkbox' || this.colCfg(c).headerCheckbox === false) continue;
        const cb = this.table.querySelector('thead th[data-c="' + c + '"] .tg-head-cb');
        if (!cb) continue;
        const st = this._columnCheckState(c);
        cb.checked = st === 'all'; cb.indeterminate = st === 'some';
      }
    }
    // 列 c の checkbox を全 ON/OFF（readOnly はスキップ）。1コマンドで履歴に積む＝Undo 一発。
    setColumnChecked(c, flag) {
      if (this.colType(c) !== 'checkbox') return;
      const val = flag ? this._cbChecked(c) : this._cbUnchecked(c);
      const before = this.snapSel(), changes = [];
      for (let r = 0; r < this.ROWS; r++) { if (this._isReadOnly(r, c) || this._rowBlankExcept(r, c)) continue; this.setCell(r, c, val, changes); }
      this.pushCmd(changes, before, this.snapSel(), 'edit');
      this._syncHeaderCheckboxes();
    }
    // ヘッダのチェックボックスクリック: 全 ON or 全 OFF をトグル（全部 ON なら OFF、それ以外は ON）。
    _toggleColumnAll(c) {
      if (this.colType(c) !== 'checkbox') return;
      this.setColumnChecked(c, this._columnCheckState(c) !== 'all');
    }
    // 列ストレッチ: 余白を埋めるよう col 幅を伸ばす（枠に幅制約がある時だけ効く）。colW は変えない。
    _applyStretch() {
      if (this.stretchH === 'none' || !this.stretchH) return;
      const avail = this.wrap ? this.wrap.clientWidth : 0;
      if (!avail) return;
      const base = this._rhW(), widths = [];
      let sum = 0;
      for (let c = 0; c < this.COLS; c++) { const wd = this._colWidth(c); widths.push(wd); sum += wd; }
      const extra = avail - base - sum;
      if (extra <= 0) return;   // 余白なし → 通常（_applyTableWidth のまま）
      if (this.stretchH === 'last') widths[this.COLS - 1] += extra;
      else { // 'all': ほぼ均等に配分し、端数は最終列へ
        const add = Math.floor(extra / this.COLS);
        for (let c = 0; c < this.COLS; c++) widths[c] += add;
        widths[this.COLS - 1] += extra - add * this.COLS;
      }
      for (let c = 0; c < this.COLS; c++) { const col = this.table.querySelector('colgroup col[data-c="' + c + '"]'); if (col) col.style.width = widths[c] + 'px'; }
      this.table.style.width = avail + 'px';
    }

    // セル(r,c)の幾何を「overlay 座標系（wrap padding box 基準・スクロール込みの content 座標）」で返す唯一の窓口。
    // place/placeRect/コピー枠/フィル枠 すべてここを通す＝座標変換式を一元化（散らばると frozen/overlay のズレ温床）。
    // 現状は DOM 実測（getBoundingClientRect）。border 分(clientLeft/Top)を引いて枠に正確に合わせる
    // （引かないと罫線の太さ分だけ右下にズレ、最終列/行で 1px はみ出してスクロールバーが出る）。
    // 将来 step2: ビルド時に実測キャッシュした幾何へ切替（DOM非依存＝仮想スクロールの土台。stretch/wordWrap/border で
    // 純モデルは合わないので "一から計算" でなく "実測キャッシュ"。切替時は実Chrome で現状とのピクセル一致を確認）。
    _cellRect(r, c) {
      const w = this.wrap.getBoundingClientRect(), t = this.cellEl(r, c).getBoundingClientRect();
      const left = t.left - w.left - this.wrap.clientLeft + this.wrap.scrollLeft;
      const top = t.top - w.top - this.wrap.clientTop + this.wrap.scrollTop;
      return { left, top, width: t.width, height: t.height };
    }
    // ハイブリッド: 固定セル(frozen行/列)は常に描画されている＝DOM実測（sticky×スクロールをタダで正しく処理）。
    // 非固定セルはモデル(キャッシュ)＝DOM非依存（画面外でも座標が出る＝仮想スクロールの土台）。
    // 非固定セルは静止時もスクロール中も model==DOM を実機実証済み（temp/hybrid-test.js）＝全DOMとピクセル不変。
    _cellRectAuto(r, c) {
      return (r < this.frozenRows || c < this.frozenCols) ? this._cellRect(r, c) : this._cellRectModel(r, c);
    }
    // 明示的に幾何キャッシュを取り直す公開API（画像/フォント等の遅延レイアウト後に呼ぶ保険。
    // 通常は buildTable/_reflow（ResizeObserver が table/wrap を監視）で自動更新される）。
    refreshGeometry() { this._buildGeomCache(); this.updateSelectionUI(); }
    place(elem, td) {
      // 仮想スクロールで active が窓外だと td=null。その場合は active 座標＋モデル幾何で配置（窓外なら overflow で隠れる）。
      const r = td ? +td.dataset.r : this.active.r, c = td ? +td.dataset.c : this.active.c, R = this._cellRectAuto(r, c);
      elem.style.left = R.left + 'px'; elem.style.top = R.top + 'px';
      elem.style.width = R.width + 'px'; elem.style.height = R.height + 'px';
      this._clipOverlay(elem, R.left, R.top, c, r);
    }
    placeRect(elem, r0, c0, r1, c1) {
      const L = this._colLefts, T = this._rowTops;
      let left, top, w, h;
      // 列/行/全選択(_headerSel)時は、角セルの結合アンカー解決で枠が範囲外へ膨らむのを避け、
      // 列左/行上の累積で「実列/行ピッタリ」にクランプ（非固定領域のみ。固定行列が絡む場合は従来へフォールバック）。
      if (this._headerSel && L && T && r0 >= this.frozenRows && c0 >= this.frozenCols) {
        left = L[c0]; top = T[r0];
        w = L[Math.min(c1 + 1, this.COLS)] - left; h = T[Math.min(r1 + 1, this.ROWS)] - top;
      } else {
        const A = this._cellRectAuto(r0, c0), B = this._cellRectAuto(r1, c1);
        left = A.left; top = A.top; w = B.left + B.width - A.left; h = B.top + B.height - A.top;
      }
      elem.style.left = left + 'px'; elem.style.top = top + 'px';
      elem.style.width = w + 'px'; elem.style.height = h + 'px';
      this._clipOverlay(elem, left, top, c0, r0);
    }
    // ---- 幾何キャッシュ（step2: DOM非依存幾何の土台）----
    // buildTable / _reflow で1回だけ実測して列左・行上の累積を作る。
    // 重要: sticky(ヘッダ/固定行列)はスクロール時に実位置がズレるので「位置」を実測しない。
    // 代わりに「行高・列幅（スクロール不変）」を実測し、原点(_theadH / _rhW)から累積＝スクロール非依存。
    // 行高は wordWrap で、列幅は stretch の DOM 改変で可変なので、モデル計算でなく実測が要る。
    _buildGeomCache() {
      if (!this.wrap || !this.table) { this._rowTops = this._colLefts = null; return; }
      const RT = new Array(this.ROWS + 1);
      if (this.virtual) {
        const base = this._theadH || 0, rowH = this.defRowH;   // 仮想モードは一定行高＝モデルで全行（窓外も算出可）
        for (let r = 0; r <= this.ROWS; r++) RT[r] = base + r * rowH;
      } else {
        const trs = this.table.querySelectorAll('tbody tr');
        RT[0] = this._theadH || 0;
        for (let r = 0; r < this.ROWS; r++) { const tr = trs[r]; RT[r + 1] = RT[r] + (tr ? tr.getBoundingClientRect().height : this._rowHeight(r)); }
      }
      this._rowTops = RT;
      // 列幅: リーフヘッダ th（マージ無しで確実）→ 無ければ colgroup col。stretch 後の実幅を拾う。
      const colEl = c => (this.colHeaders ? this.table.querySelector('thead th[data-c="' + c + '"]') : null) || this.table.querySelector('colgroup col[data-c="' + c + '"]');
      const CL = new Array(this.COLS + 1); CL[0] = this._rhW();
      for (let c = 0; c < this.COLS; c++) { const el = colEl(c); CL[c + 1] = CL[c] + (el ? el.getBoundingClientRect().width : (this._isHidden(c) ? 0 : this._colWidth(c))); }
      this._colLefts = CL;
    }
    // キャッシュからセル幾何を返す（_cellRect と同座標系・DOM非依存）。covered はアンカーの矩形に解決。
    _cellRectModel(r, c) {
      const L = this._colLefts, T = this._rowTops;
      if (!L || !T) return this._cellRect(r, c);   // 未構築なら DOM 実測へフォールバック
      const a = this._merges ? this._anchorOf(r, c) : { r, c };
      const cs = this._merges ? this._colspanAt(a.r, a.c) : 1, rs = this._merges ? this._rowspanAt(a.r, a.c) : 1;
      const left = L[a.c], top = T[a.r];
      return { left, top, width: L[Math.min(a.c + cs, this.COLS)] - left, height: T[Math.min(a.r + rs, this.ROWS)] - top };
    }
    // 開発用検証: モデル幾何(キャッシュ) vs DOM実測 の最大ズレ(px)と最悪セル。
    // 実Chrome で grid._geomDelta() を各デモ（frozen / nestedHeaders / merge / wordWrap）で実行し max≈0 を確認 →
    // place/placeRect を _cellRectModel へ切替（border-collapse 由来のズレが出たら補正項を入れる）。
    _geomDelta() {
      let max = 0, worst = null;
      for (let r = 0; r < this.ROWS; r++) for (let c = 0; c < this.COLS; c++) {
        if (this._merges && this._isCovered(r, c)) continue;
        const d = this._cellRect(r, c), m = this._cellRectModel(r, c);
        const e = Math.max(Math.abs(d.left - m.left), Math.abs(d.top - m.top), Math.abs(d.width - m.width), Math.abs(d.height - m.height));
        if (e > max) { max = e; worst = { r, c, dom: d, model: m }; }
      }
      return { max, worst };
    }
    // 固定ペイン: 左幅(行ヘッダ+frozenCols) と 上高(ヘッダ行+frozenRows)。上は buildTable でキャッシュした
    // ヘッダ高(_theadH)を使う（スクロール毎の offsetHeight 再読込を避ける）。
    _frozenPaneW() { let w = this._rhW(); for (let c = 0; c < this.frozenCols && c < this.COLS; c++) if (!this._isHidden(c)) w += this._colWidth(c); return w; }
    _frozenPaneH() { let h = this.colHeaders ? (this._theadH || 0) : 0; for (let r = 0; r < this.frozenRows && r < this.ROWS; r++) h += this._rowHeight(r); return h; }
    // 非固定セルのオーバーレイが固定領域の下に潜った分をクリップ（枠の漏れ防止）。
    // 左の固定領域＝行番号列＋固定列（_frozenPaneW）／上の固定領域＝ヘッダ行＋固定行（_frozenPaneH）。
    // どちらも「常時 sticky な行番号列/ヘッダ」を含むので、frozenCols/frozenRows が 0 でもクリップが効く（縦横対称）。
    // 固定セル自身（c0<frozenCols / r0<frozenRows）はその辺をクリップしない＝枠を見せる従来挙動を維持。
    _clipOverlay(elem, left, top, c0, r0) {
      let cl = 0, ct = 0;
      const leftFixed = this._frozenPaneW();    // 行番号列 + 固定列
      if (leftFixed > 0 && c0 >= this.frozenCols) cl = Math.max(0, (this.wrap.scrollLeft + leftFixed) - left);
      const topFixed = this._frozenPaneH();     // ヘッダ行 + 固定行
      if (topFixed > 0 && r0 >= this.frozenRows) ct = Math.max(0, (this.wrap.scrollTop + topFixed) - top);
      elem.style.clipPath = (cl || ct) ? ('inset(' + ct + 'px 0 0 ' + cl + 'px)') : '';
    }
    rectRange() {
      return {
        r0: Math.min(this.active.r, this.extent.r), r1: Math.max(this.active.r, this.extent.r),
        c0: Math.min(this.active.c, this.extent.c), c1: Math.max(this.active.c, this.extent.c),
      };
    }
    highlightRange() {
      this.table.querySelectorAll('td.sel, th.selhdr').forEach(el => el.classList.remove('sel', 'selhdr'));
      const { r0, r1, c0, c1 } = this.rectRange();
      // 選択範囲が及ぶ行/列ヘッダをハイライト（Excel 風のアフォーダンス）。仮想時は行ヘッダを窓内にクランプ（大量行で querySelector を無駄打ちしない）。
      const hlo = this.virtual ? Math.max(r0, this._vStart) : r0;
      const hhi = this.virtual ? Math.min(r1, this._vEnd - 1) : r1;
      for (let c = c0; c <= c1; c++) { const th = this.table.querySelector('thead th[data-c="' + c + '"]'); if (th) th.classList.add('selhdr'); }
      for (let r = hlo; r <= hhi; r++) { const th = this.table.querySelector('th.rowhead[data-r="' + r + '"]'); if (th) th.classList.add('selhdr'); }
      this.wrap.style.setProperty('--tg-selhdr-fg', this._selhdrTextColor());   // 選択ヘッダ文字色を背景輝度から自動（暗背景→白）
      if (r0 === r1 && c0 === c1) return;
      const clampMerge = this._headerSel && this._merges;   // 列/行選択では「範囲に収まらない結合」は塗らない（帯を塗り広げない）
      // 仮想スクロール: 窓内の行だけシェード（範囲枠 selrange は placeRect がモデル幾何で全域を描く）。
      for (let r = hlo; r <= hhi; r++) for (let c = c0; c <= c1; c++) {
        if (clampMerge) {
          const a = this._anchorOf(r, c), mc1 = a.c + this._colspanAt(a.r, a.c) - 1, mr1 = a.r + this._rowspanAt(a.r, a.c) - 1;
          if (a.r < r0 || mr1 > r1 || a.c < c0 || mc1 > c1) continue;   // 結合が選択範囲に収まらない＝塗らない
        }
        const el = this.cellEl(r, c); if (el) el.classList.add('sel');
      }
    }
    // 選択ヘッダの文字色を --tg-selhdr-bg の輝度から自動決定（暗背景→白／明背景→濃紺）。
    // 既定の明るい選択色は従来どおり濃紺、暗い選択ヘッダ（slate等）でも文字が読める。buildTable でキャッシュ破棄。
    _selhdrTextColor() {
      if (this._selhdrFg != null) return this._selhdrFg;
      let bg = '', m, r, g, b;
      try { bg = getComputedStyle(this.wrap).getPropertyValue('--tg-selhdr-bg').trim(); } catch (_) {}
      if (m = bg.match(/^#([0-9a-f]{3})$/i)) { r = parseInt(m[1][0] + m[1][0], 16); g = parseInt(m[1][1] + m[1][1], 16); b = parseInt(m[1][2] + m[1][2], 16); }
      else if (m = bg.match(/^#([0-9a-f]{6})$/i)) { r = parseInt(m[1].slice(0, 2), 16); g = parseInt(m[1].slice(2, 4), 16); b = parseInt(m[1].slice(4, 6), 16); }
      else if (m = bg.match(/rgba?\(([^)]+)\)/i)) { const p = m[1].split(',').map(parseFloat); r = p[0]; g = p[1]; b = p[2]; }
      const L = (r == null) ? 1 : (0.299 * r + 0.587 * g + 0.114 * b) / 255;   // 知覚輝度（簡易）
      return (this._selhdrFg = L < 0.55 ? '#fff' : '#1a3a6b');
    }
    updateSelectionUI() {
      if (!this.cursor) {   // 表示専用: 選択枠・範囲・フィルハンドルを出さない（選択自体は内部に保持）
        this.selbox.style.display = 'none'; this.selrange.style.display = 'none'; this.fillhandle.style.display = 'none';
        return;
      }
      this.highlightRange(); this._placeOverlays();
    }
    // 枠の位置合わせだけ（クラス操作なし）。スクロール時はこちらだけ呼ぶ＝ちらつかない。
    _placeOverlays() {
      const { r0, r1, c0, c1 } = this.rectRange();
      this.placeRect(this.selrange, r0, c0, r1, c1); this.selrange.style.display = 'block';
      this.place(this.selbox, this.activeTd()); this.selbox.style.display = 'block';
      // フィルハンドルは nav か、ドロップダウンを開いている時に表示（テキスト等の編集中は隠す）
      const selOpen = this.select && this.select.style.display !== 'none';
      if (this.fillHandle && (this.mode === 'nav' || selOpen || (this._customEditor && this._customKeepHandle))) {
        const R = this._cellRectAuto(r1, c1);   // 選択末尾セルの右下角（ハイブリッド経由）
        const fw = this.fillhandle.offsetWidth || 8;
        // ハンドルは角に半分はみ出す配置だが、最終列/行ではテーブル端を超えないようクランプ
        // （超えると overflow:auto の枠を押し広げてスクロールバーが出てしまう）。テーブルは
        // 枠(padding box)の原点 0 に置かれるので、上限は offsetWidth/Height - ハンドル幅。
        const maxL = this.table.offsetWidth - fw, maxT = this.table.offsetHeight - fw;
        const fhL = Math.min(R.left + R.width - 5, maxL);
        const fhT = Math.min(R.top + R.height - 5, maxT);
        this.fillhandle.style.left = fhL + 'px'; this.fillhandle.style.top = fhT + 'px';
        this.fillhandle.style.display = 'block';
        this._clipOverlay(this.fillhandle, fhL, fhT, c1, r1);   // 固定ペインに潜ったら隠す
      } else this.fillhandle.style.display = 'none';
    }
    toNav() {
      this.mode = 'nav'; this.editor.className = 'tg-editor nav';
      this.editor.type = 'text'; this.editor.value = '';
      if (this.select) this.select.style.display = 'none';
    }
    toEdit(value, caretEnd) {
      if (this._isReadOnly(this.active.r, this.active.c)) return;  // 読み取り専用は編集モードに入らない
      const starting = this.mode !== 'edit';
      if (starting) this.clearCopyMarquee();   // 編集開始でコピー/カットのマーキー（点線）を消す（Excel 流）
      this.mode = 'edit'; this.editor.className = 'tg-editor edit'; this.fillhandle.style.display = 'none';
      this.editor.type = this._nativeInputType(this.active.c) || 'text';
      const _ml = this.colCfg(this.active.c).maxLength;   // 桁数(文字数)上限＝打鍵をブロック（貼付/投入は _coerceCell で切り詰め）
      if (typeof _ml === 'number' && _ml > 0) this.editor.maxLength = _ml; else this.editor.removeAttribute('maxlength');
      if (value != null) this.editor.value = value;
      this.editor.focus();
      // setSelectionRange は text 系のみ対応（date/time input は例外を投げる）
      if (caretEnd && this.editor.type === 'text') { const l = this.editor.value.length; this.editor.setSelectionRange(l, l); }
      if (starting && this.onEditStart) { try { this.onEditStart({ r: this.active.r, c: this.active.c, value: this.editor.value }); } catch (_) {} }
    }
    _fireSelection() {
      if (!this.onSelectionChange) return;
      try { this.onSelectionChange({ range: this.rectRange(), active: { ...this.active }, extent: { ...this.extent } }); } catch (_) {}
    }
    // 選択変更の「前」フック。false を返すと選択を変えない（ナビゲーション/クリック/範囲拡張に効く）。
    _beforeSel(a, e) {
      if (!this.onBeforeSelectionChange) return true;
      const range = { r0: Math.min(a.r, e.r), c0: Math.min(a.c, e.c), r1: Math.max(a.r, e.r), c1: Math.max(a.c, e.c) };
      let r; try { r = this.onBeforeSelectionChange({ range, active: { ...a }, extent: { ...e } }); } catch (_) {}
      return r !== false;
    }
    setActive(r, c) {
      const a = { r: this.clampR(r), c: this._snapVisCol(this.clampC(c)) };   // 隠し列にはカーソルを置かない
      if (this._merges) { const an = this._anchorOf(a.r, a.c); a.r = an.r; a.c = an.c; }   // 結合内はアンカーへ
      if (!this._beforeSel(a, a)) return;
      this._headerSel = null;
      this.active = a; this.extent = { ...a };
      if (this.virtual) this._vEnsureVisible(a.r);   // 窓に入れてから placement（窓外なら activeTd=null になるため）
      this.place(this.editor, this.activeTd()); this.toNav(); this.editor.focus(); this.updateSelectionUI();
      if (!this.virtual) this.activeTd().scrollIntoView({ block: 'nearest', inline: 'nearest' });   // 仮想は _vEnsureVisible が可視化済み
      this._fireSelection();
    }
    setExtent(r, c) {
      const e = { r: this.clampR(r), c: this.clampC(c) };
      if (!this._beforeSel(this.active, e)) return;
      this.extent = e;
      if (this.virtual) this._vEnsureVisible(e.r);
      this.updateSelectionUI();
      if (!this.virtual) this.cellEl(this.extent.r, this.extent.c).scrollIntoView({ block: 'nearest', inline: 'nearest' });
      this._fireSelection();
    }
    selectRect(r0, c0, r1, c1) {
      const a = { r: r0, c: c0 }, e = { r: r1, c: c1 };
      if (!this._beforeSel(a, e)) return;
      this._headerSel = null;
      this.active = a; this.extent = e;
      this.place(this.editor, this.activeTd()); this.toNav(); this.editor.focus(); this.updateSelectionUI();
      this._fireSelection();
    }
    focusAndSelect(sel) {
      this.active = { ...sel.active }; this.extent = { ...sel.extent };
      if (this.virtual) this._vEnsureVisible(this.active.r);
      this.place(this.editor, this.activeTd()); this.toNav(); this.editor.focus(); this.updateSelectionUI();
      if (!this.virtual) this.activeTd().scrollIntoView({ block: 'nearest', inline: 'nearest' });
      this._fireSelection();
    }

    // ---- 行 / 列 / 全体 の選択（ヘッダクリック） ----
    selectCol(c) { c = this.clampC(c); this._colAnchor = c; this.selectRect(0, c, this.ROWS - 1, c); this._headerSel = 'col'; this.updateSelectionUI(); }
    selectRow(r) { r = this.clampR(r); this._rowAnchor = r; this.selectRect(r, 0, r, this.COLS - 1); this._headerSel = 'row'; this.updateSelectionUI(); }
    selectAll() { this._colAnchor = 0; this._rowAnchor = 0; this.selectRect(0, 0, this.ROWS - 1, this.COLS - 1); this._headerSel = 'all'; this.updateSelectionUI(); }
    _extendCol(c) { const a = { r: 0, c: this._colAnchor }, e = { r: this.ROWS - 1, c: this.clampC(c) }; if (!this._beforeSel(a, e)) return; this._headerSel = 'col'; this.active = a; this.extent = e;
      this.place(this.editor, this.activeTd()); this.toNav(); this.updateSelectionUI(); this._fireSelection(); }
    _extendRow(r) { const a = { r: this._rowAnchor, c: 0 }, e = { r: this.clampR(r), c: this.COLS - 1 }; if (!this._beforeSel(a, e)) return; this._headerSel = 'row'; this.active = a; this.extent = e;
      this.place(this.editor, this.activeTd()); this.toNav(); this.updateSelectionUI(); this._fireSelection(); }
    // ---- 列幅 / 行高 のリサイズ ----
    setColWidth(c, w) {
      w = Math.max(this.minColW, Math.round(w)); this.colW[c] = w;
      const col = this.table.querySelector('colgroup col[data-c="' + c + '"]');
      if (col) col.style.width = w + 'px';
      this._applyTableWidth();   // 合計幅も更新（圧縮防止）
      this._applyStretch();      // ストレッチ時は余白を再配分
      this._applyFrozen();       // 固定列の left オフセットも更新
      this._applyFrozenRows();   // 固定行の top オフセットも更新
      this._reflow();
    }
    // ---- 列幅オートフィット ----
    _measureText(text, font) {
      if (this._mctx === undefined) { const cv = document.createElement('canvas'); this._mctx = cv.getContext ? cv.getContext('2d') : null; }
      if (!this._mctx) { const m = /(\d+)px/.exec(font); return String(text).length * (m ? +m[1] : 13) * 0.6; }  // canvas 非対応(jsdom等)は概算
      this._mctx.font = font;
      return this._mctx.measureText(String(text)).width;
    }
    _colFont(bold) {
      const el = this.table.querySelector(bold ? 'thead th' : 'tbody td') || this.table;
      const view = this.table.ownerDocument.defaultView || window, cs = view.getComputedStyle(el);
      return (bold ? '600 ' : (cs.fontWeight || '400') + ' ') + (cs.fontSize || '13px') + ' ' + (cs.fontFamily || 'sans-serif');
    }
    // 列 c を内容に合わせて自動幅調整（min/max でクランプ）。checkbox は最小固定。
    autoSizeColumn(c) {
      if (this._isHidden(c) || this.colCfg(c).resizable === false) return;
      const cellFont = this._colFont(false), hdrFont = this._colFont(true);
      let max = (this.colHeaders && this.colType(c) !== 'checkbox') ? this._measureText(this.headers[c] || '', hdrFont) : 0;
      if (this.colType(c) !== 'checkbox') {
        for (let r = 0; r < this.ROWS; r++) {
          const v = this._displayValue(r, c);
          if (v) max = Math.max(max, this._measureText(v, cellFont));
        }
      }
      let extra = 14;   // padding 6+6 + slack 2
      if (this.colType(c) === 'dropdown') extra += 14;   // ▾ キャレット
      const w = this.colType(c) === 'checkbox' ? this.minColW : Math.max(this.minColW, Math.ceil(max + extra));
      const cap = this.autoColumnSizeMax || (typeof this.autoColumnSize === 'number' ? this.autoColumnSize : 0);
      this.setColWidth(c, cap ? Math.min(w, cap) : w);
    }
    autoSizeAllColumns() { for (let c = 0; c < this.COLS; c++) if (!this._isHidden(c)) this.autoSizeColumn(c); }
    setRowHeight(r, h) {
      h = Math.max(this.minRowH, Math.round(h)); this.rowH[r] = h;
      const tr = this.table.querySelector('tbody tr[data-r="' + r + '"]');
      if (tr) tr.style.height = h + 'px';
      this._reflow();
    }
    _startColResize(e) {
      e.preventDefault(); e.stopPropagation();
      const th = e.target.closest('th[data-c]'); if (!th) return;
      const c = +th.dataset.c;
      const wr = this.wrap.getBoundingClientRect(), tr = th.getBoundingClientRect();
      const edge = tr.left - wr.left + this.wrap.scrollLeft;   // 列の左端（content 座標）
      this.resizing = { type: 'col', c, start: e.clientX, base: this._colWidth(c), edge };
      if (this.resizeMode !== 'live') this._showGuide('col', edge + this._colWidth(c));
    }
    _startRowResize(e) {
      e.preventDefault(); e.stopPropagation();
      const th = e.target.closest('th[data-r]'); if (!th) return;
      const r = +th.dataset.r;
      const wr = this.wrap.getBoundingClientRect(), tr = th.getBoundingClientRect();
      const edge = tr.top - wr.top + this.wrap.scrollTop;      // 行の上端（content 座標）
      this.resizing = { type: 'row', r, start: e.clientY, base: this._rowHeight(r), edge };
      if (this.resizeMode !== 'live') this._showGuide('row', edge + this._rowHeight(r));
    }
    // ---- 行のドラッグ移動（つまみ） ----
    _startRowMove(e) {
      e.preventDefault(); e.stopPropagation();
      const th = e.target.closest('th[data-r]'); if (!th) return;
      if (this.mode === 'edit') this._commitActive();
      const from = +th.dataset.r, sel = this.rectRange();
      let r0 = from, r1 = from;
      if (sel.r1 > sel.r0 && from >= sel.r0 && from <= sel.r1) { r0 = sel.r0; r1 = sel.r1; }  // 範囲選択内を掴んだら範囲ごと
      this.rowMove = { r0, r1, to: from };
      if (typeof document !== 'undefined') document.body.style.cursor = 'grabbing';
    }
    // ドロップ位置（行 to の上端）にガイド線を出す。to===ROWS は最下端。
    _showRowDropLine(to) {
      let pos;
      if (to >= this.ROWS) pos = this.table.offsetHeight;
      else {
        const tr = this.table.querySelector('tr[data-r="' + to + '"]');
        const wr = this.wrap.getBoundingClientRect(), b = tr.getBoundingClientRect();
        pos = b.top - wr.top + this.wrap.scrollTop;
      }
      this._showGuide('row', pos);
    }
    // 1行を to（0..ROWS の「挿入境界」）へ移動。moveRows の単一版。
    moveRow(from, to) { this.moveRows(from, from, to); }
    // 連続する複数行 [r0..r1] を to（0..ROWS の挿入境界）へまとめて移動。data/状態は _applyRowOrder が追従。
    // Undo/Redo 対応: 適用した順列の「逆順列」を履歴に積む（行移動は意図的な編集なので戻せる）。
    moveRows(r0, r1, to) {
      if (this._hasVMerge() || this._allRows) return;   // 縦結合中／フィルタ中は行移動禁止（v1）。
      r0 = Math.max(0, r0 | 0); r1 = Math.min(this.ROWS - 1, r1 | 0);   // 横結合は _applyRowOrder が座標追従
      if (r1 < r0) return;
      if (to >= r0 && to <= r1 + 1) return;                // ブロック内/直後＝何もしない
      if (this.mode === 'edit') this._commitActive();
      const block = [], rest = [];
      for (let r = 0; r < this.ROWS; r++) (r >= r0 && r <= r1 ? block : rest).push(r);
      const ins = rest.filter(r => r < to).length;         // to より前に残る行数＝挿入位置
      const order = rest.slice(); order.splice(ins, 0, ...block);            // 適用順列 order[newRow]=oldRow
      const inv = new Array(order.length); order.forEach((o, n) => inv[o] = n);  // 逆順列（undo 用）
      const grid = this, n = block.length, selBefore = this.snapSel();
      const fire = () => { if (typeof grid.onAfterRowMove === 'function') { try { grid.onAfterRowMove(r0, ins, n); } catch (_) {} } };
      const doMove = () => { grid._applyRowOrder(order); grid.selectRect(ins, 0, ins + n - 1, grid.COLS - 1); };
      doMove();
      this.history.push({
        label: this.name,
        apply() { doMove(); fire(); },                                       // redo
        revert() { grid._applyRowOrder(inv); grid.focusAndSelect(selBefore); }, // undo
      });
      fire();
    }
    // リサイズのプレビュー線（content 座標で配置）
    _showGuide(type, pos) {
      const g = this.resizeGuide;
      if (type === 'col') { g.style.left = pos + 'px'; g.style.top = '0px'; g.style.width = '2px'; g.style.height = this.table.offsetHeight + 'px'; }
      else { g.style.top = pos + 'px'; g.style.left = '0px'; g.style.height = '2px'; g.style.width = this.table.offsetWidth + 'px'; }
      g.style.display = 'block';
    }

    _onHeaderMouseDown(e, th) {
      // ヘッダの全選択チェックボックス: 列選択ではなく全 ON/OFF トグル
      if (e.target.classList && e.target.classList.contains('tg-head-cb')) { e.preventDefault(); if (th.dataset.c != null) this._toggleColumnAll(+th.dataset.c); return; }
      e.preventDefault();
      if (this.mode === 'edit') this._commitActive();
      if (th.dataset.c0 != null) {                      // ネストヘッダのグループ → 範囲列を選択
        const c0 = +th.dataset.c0, c1 = Math.min(this.COLS - 1, +th.dataset.c1);
        this.selectRect(0, c0, this.ROWS - 1, c1); this._colAnchor = c0; this.editor.focus(); this.headerDrag = 'col';
        return;
      }
      if (th.dataset.c != null) {                       // 列ヘッダ
        const c = +th.dataset.c;
        if (this.onHeaderClick) { let r; try { r = this.onHeaderClick(c, e); } catch (_) {} if (r === false) { this.editor.focus(); return; } }   // 外部ソートUI等
        if (e.shiftKey) this._extendCol(c); else this.selectCol(c);
        this.editor.focus(); this.headerDrag = 'col';
      } else if (th.dataset.r != null) {                // 行ヘッダ
        const r = +th.dataset.r;
        if (e.shiftKey) this._extendRow(r); else this.selectRow(r);
        this.editor.focus();
        // 'header'モード: 行ヘッダーセル全体が移動ハンドル＝行を選択した上で移動を armする（クリック=選択のまま／ドラッグで移動）。縦結合/フィルタ中は不可。
        if (this.rowReorderWhole && !e.shiftKey && !this._hasVMerge() && !this._allRows) this._startRowMove(e);
        else this.headerDrag = 'row';   // 通常: ドラッグで複数行選択
      } else {                                          // 左上の角 → 全選択
        this.selectAll(); this.editor.focus();
      }
    }

    // ---- 変更 → コマンド化して history に積む ----
    snapSel() { return { active: { ...this.active }, extent: { ...this.extent } }; }
    setCell(r, c, val, changes) {
      if (this.data[r][c] === val) return;
      changes.push({ r, c, old: this.data[r][c], neu: val });
      this.data[r][c] = val; this._renderCell(r, c);
    }
    _applyCells(changes, key, source) {
      for (const ch of changes) { this.data[ch.r][ch.c] = ch[key]; this._renderCell(ch.r, ch.c); }
      this._syncHeaderCheckboxes();   // undo/redo でもヘッダ全選択を同期
      this.renderDump();
      if (source && this.onAfterChange) {
        const fromKey = key === 'neu' ? 'old' : 'neu';
        try { this.onAfterChange(changes.map(ch => ({ r: ch.r, c: ch.c, oldValue: ch[fromKey], newValue: ch[key], source })), source); } catch (_) {}
      }
    }
    _pubChanges(changes, source) { return changes.map(ch => ({ r: ch.r, c: ch.c, oldValue: ch.old, newValue: ch.neu, source })); }
    pushCmd(changes, selBefore, selAfter, source, force) {
      if (!changes.length) return;
      // 読み取り専用: 変更不可セルは invalidMode を問わず常に old へ巻き戻し、履歴にも積まない。
      // force=true（setValue の計算列書き込み等）は貫通させる＝ユーザー編集だけ守る。
      if (this._hasReadOnly() && !force) {
        const blocked = [];
        for (let i = changes.length - 1; i >= 0; i--) {
          const ch = changes[i];
          if (this._isReadOnly(ch.r, ch.c)) {
            blocked.push({ r: ch.r, c: ch.c, value: ch.neu });
            this.data[ch.r][ch.c] = ch.old; this._renderCell(ch.r, ch.c);
            changes.splice(i, 1);
          }
        }
        if (blocked.length && this.onReadOnly) { try { this.onReadOnly(blocked.reverse(), source); } catch (_) {} }
        if (!changes.length) { this.renderDump(); this.focusAndSelect(selBefore); return; }
      }
      // 列ルール（型強制 / バリデータ）: onBeforeChange より前に効かせる。値は適用済みなので巻き戻す。
      if (this._hasColRules()) {
        const rejections = [];
        for (const ch of changes) {
          const res = this._coerceCell(ch.r, ch.c, ch.neu);
          if (!res.ok) {
            rejections.push({ r: ch.r, c: ch.c, value: ch.neu, code: res.code || null, level: res.level || 'error', message: res.message });
            // 'keep': 入力値を残してセルを赤く（_renderCell が判定）。'revert': 元の値へ巻き戻す。
            if (!this._marksInvalid) { ch.neu = ch.old; this.data[ch.r][ch.c] = ch.old; }
            this._renderCell(ch.r, ch.c);
          } else if (res.value !== ch.neu) {
            ch.neu = res.value; this.data[ch.r][ch.c] = res.value; this._renderCell(ch.r, ch.c);
          }
        }
        for (let i = changes.length - 1; i >= 0; i--) if (changes[i].neu === changes[i].old) changes.splice(i, 1);
        if (rejections.length && this.onInvalid) { try { this.onInvalid(rejections, source); } catch (_) {} }
        if (!changes.length) { this.renderDump(); this.focusAndSelect(selBefore); return; }
      }
      // onBeforeChange: 検証 / 整形 / 取消。値は既に適用済みなので、取消は old へ巻き戻す。
      if (this.onBeforeChange) {
        const pub = this._pubChanges(changes, source);
        let ret; try { ret = this.onBeforeChange(pub, source); } catch (_) { ret = undefined; }
        if (ret === false) {                          // 全取消 → data/DOM を old へ戻す
          for (const ch of changes) { this.data[ch.r][ch.c] = ch.old; this._renderCell(ch.r, ch.c); }
          this.renderDump(); this.focusAndSelect(selBefore); return;
        }
        const fin = Array.isArray(ret) ? ret : pub;   // 整形後の newValue を反映
        for (let i = 0; i < changes.length; i++) {
          const nv = (fin[i] && 'newValue' in fin[i]) ? fin[i].newValue : changes[i].neu;
          if (nv !== changes[i].neu) { changes[i].neu = nv; this.data[changes[i].r][changes[i].c] = nv; this._renderCell(changes[i].r, changes[i].c); }
        }
        for (let i = changes.length - 1; i >= 0; i--) if (changes[i].neu === changes[i].old) changes.splice(i, 1); // 整形で無変更化したものは除外
        if (!changes.length) { this.focusAndSelect(selBefore); return; }
      }
      this.renderDump();
      const grid = this;
      this.history.push({
        label: this.name,
        apply() { grid._applyCells(changes, 'neu', 'redo'); grid.focusAndSelect(selAfter); },
        revert() { grid._applyCells(changes, 'old', 'undo'); grid.focusAndSelect(selBefore); },
      });
      if (this.onAfterChange) { try { this.onAfterChange(this._pubChanges(changes, source), source); } catch (_) {} }
      this._syncHeaderCheckboxes();   // ヘッダ全選択チェックの見た目を同期
      this._ensureSpare();   // 末尾の空行確保（minSpareRows）
    }
    commit() {
      const wasEditing = this.mode === 'edit';
      const r = this.active.r, c = this.active.c, oldValue = this.data[r][c];
      const before = this.snapSel(), changes = [];
      this.setCell(r, c, this.editor.value, changes);
      this.pushCmd(changes, before, this.snapSel(), 'edit');
      if (wasEditing && this.onEditEnd) { try { this.onEditEnd({ r, c, oldValue, newValue: this.data[r][c], canceled: false }); } catch (_) {} }
    }
    clearRange() {
      const before = this.snapSel(), changes = [], { r0, r1, c0, c1 } = this.rectRange();
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.setCell(r, c, '', changes);
      this.pushCmd(changes, before, this.snapSel(), 'delete');
    }

    // ---- 行/列の挿入・削除（構造変更。Undo に1コマンドで積む） ----
    // 並列配列（columns/colW は疎なことがある）を現在の COLS/ROWS 長に揃えてから splice する。
    _normalizeArrays() {
      while (this.columns.length < this.COLS) this.columns.push(undefined);
      while (this.colW.length < this.COLS) this.colW.push(undefined);
      while (this.rowH.length < this.ROWS) this.rowH.push(undefined);
    }
    _rowEmpty(r) { for (let c = 0; c < this.COLS; c++) if (this.data[r][c] !== '') return false; return true; }
    // minRows/minCols まで空行・空列を補う（初期化・setData 時。レンダ前提なし）。
    _padToMin() {
      while (this.ROWS < this.minRows) { this.data.push(new Array(this.COLS).fill('')); if (this._src) this._src.push({}); this.ROWS++; }
      while (this.COLS < this.minCols) {
        this.headers.push(TssGrid._colLabel(this.COLS)); this.columns.push(undefined);
        for (const row of this.data) row.push('');
        this.COLS++;
      }
    }
    // 末尾に常に minSpareRows 行の空行を確保（足りなければ追加。履歴には積まない）。
    _ensureSpare() {
      if (!this.minSpareRows || this._allRows) return;   // フィルタ中は末尾の自動空行を足さない（マスタ desync 回避）
      let empties = 0;
      for (let r = this.ROWS - 1; r >= 0; r--) { if (this._rowEmpty(r)) empties++; else break; }
      let added = 0;
      while (empties < this.minSpareRows) { this.data.push(new Array(this.COLS).fill('')); this.rowH.push(undefined); if (this._src) this._src.push({}); this.ROWS++; empties++; added++; }
      if (added && this.table) { this.buildTable(); this.setActive(this.active.r, this.active.c); }
    }
    // 構造変更を実行＋履歴に積む共通処理。doIt/undoIt は冪等（redo で再実行される）。
    _structCmd(doIt, undoIt, selAfterFn, selBefore, info) {
      // 挿入/削除の「前」フック。false で中止（履歴にも積まない）。redo では呼ばれない（確定済みの再実行）。
      if (this.onBeforeStructureChange) { let r; try { r = this.onBeforeStructureChange(info); } catch (_) {} if (r === false) return; }
      const grid = this, remap = this._structRemapFn(info);
      const cellBefore = this._cloneCellState();   // セル状態(整列/RO)の undo 用スナップショット
      const mergeBefore = this._merges ? this._merges.map(m => ({ ...m })) : null;   // 結合の undo 用スナップショット
      const run = () => { doIt(); if (remap) grid._remapCellState(remap); grid._remapMerges(info); };   // 構造変更＋セル状態キー＋結合座標を追従
      run(); this.buildTable(); const selAfter = selAfterFn();
      this.focusAndSelect(selAfter);
      this._ensureSpare();   // 末尾の空行確保（minSpareRows）
      if (this.onStructureChange) { try { this.onStructureChange(info); } catch (_) {} }
      this.history.push({
        label: this.name,
        apply() { run(); grid.buildTable(); grid.focusAndSelect(selAfter); if (grid.onStructureChange) { try { grid.onStructureChange(info); } catch (_) {} } },
        revert() { undoIt(); grid._restoreCellState(cellBefore); grid._merges = mergeBefore ? mergeBefore.map(m => ({ ...m })) : null; grid.buildTable(); grid.focusAndSelect(selBefore); if (grid.onStructureChange) { try { grid.onStructureChange({ ...info, undo: true }); } catch (_) {} } },
      });
    }
    // フィルタ中の挿入位置をマスタ(_allRows)へ写像。at=挿入後のビュー位置(data[at]=新行)。
    // 次の可視行(data[at+1])の手前へ＝「その行の上に挿入」がマスタでも自然。無ければ前の可視行の直後／末尾。
    _masterInsertIndex(at) {
      if (at + 1 < this.data.length) { const i = this._allRows.indexOf(this.data[at + 1]); if (i >= 0) return i; }
      if (at - 1 >= 0) { const i = this._allRows.indexOf(this.data[at - 1]); if (i >= 0) return i + 1; }
      return this._allRows.length;
    }
    insertRow(ri, where = 'above') {
      if (!this.allowInsertRows) return;
      if (this.maxRows && this.ROWS >= this.maxRows) return;   // 上限
      if (this.mode === 'edit') this._commitActive();
      this._normalizeArrays();
      const at = Math.max(0, Math.min(this.ROWS, where === 'below' ? ri + 1 : ri));
      const before = this.snapSel(), grid = this, c = this.active.c, frozenBump = at < this.frozenRows;
      let ref;   // 挿入した行参照（フィルタ中の _allRows 追従・undo 用に保持）
      const doIt = () => {
        ref = new Array(grid.COLS).fill('');
        grid.data.splice(at, 0, ref); grid.rowH.splice(at, 0, undefined); if (grid._src) grid._src.splice(at, 0, {}); grid.ROWS++;
        if (grid._allRows) { const mi = grid._masterInsertIndex(at); grid._allRows.splice(mi, 0, ref); if (grid._allSrc) grid._allSrc.splice(mi, 0, {}); }   // マスタにも挿入
        if (frozenBump) grid.frozenRows++;
      };
      const undoIt = () => {
        grid.data.splice(at, 1); grid.rowH.splice(at, 1); if (grid._src) grid._src.splice(at, 1); grid.ROWS--;
        if (grid._allRows && ref) { const i = grid._allRows.indexOf(ref); if (i >= 0) { grid._allRows.splice(i, 1); if (grid._allSrc) grid._allSrc.splice(i, 1); } }
        if (frozenBump) grid.frozenRows--;
      };
      this._structCmd(doIt, undoIt, () => ({ active: { r: at, c }, extent: { r: at, c } }), before, { type: 'insertRow', at });
    }
    deleteRows(r0, r1) {
      if (!this.allowDeleteRows) return;
      if (r1 == null) r1 = r0;
      const n = r1 - r0 + 1;
      if (this.ROWS - n < Math.max(1, this.minRows)) return;   // 下限（既定: 最低1行）
      if (this.mode === 'edit') this._commitActive();
      this._normalizeArrays();
      const before = this.snapSel(), grid = this, c = this.active.c;
      const frozenDelta = Math.max(0, Math.min(r1, this.frozenRows - 1) - r0 + 1);   // 固定行内で消える行数
      let saved;
      const doIt = () => {
        saved = { rows: grid.data.splice(r0, n), hs: grid.rowH.splice(r0, n), src: grid._src ? grid._src.splice(r0, n) : null }; grid.ROWS -= n; grid.frozenRows -= frozenDelta;
        if (grid._allRows) {   // マスタからも参照で除去（master index を undo 用に記録）
          saved.mis = []; saved.msrc = grid._allSrc ? [] : null;
          for (const ref of saved.rows) { const i = grid._allRows.indexOf(ref); if (i >= 0) { saved.mis.push(i); grid._allRows.splice(i, 1); if (grid._allSrc) { saved.msrc.push(grid._allSrc[i]); grid._allSrc.splice(i, 1); } } else saved.mis.push(-1); }
        }
      };
      const undoIt = () => {
        grid.data.splice(r0, 0, ...saved.rows); grid.rowH.splice(r0, 0, ...saved.hs); if (grid._src) grid._src.splice(r0, 0, ...saved.src); grid.ROWS += n; grid.frozenRows += frozenDelta;
        if (grid._allRows && saved.mis) {   // 記録 index へ逆順で戻す（前から戻すと index がズレるため）
          for (let k = saved.mis.length - 1; k >= 0; k--) { const mi = saved.mis[k]; if (mi < 0) continue; grid._allRows.splice(mi, 0, saved.rows[k]); if (grid._allSrc) grid._allSrc.splice(mi, 0, saved.msrc[k]); }
        }
      };
      this._structCmd(doIt, undoIt, () => { const rr = Math.min(r0, grid.ROWS - 1); return { active: { r: rr, c }, extent: { r: rr, c } }; }, before, { type: 'deleteRows', r0, r1 });
    }
    insertCol(ci, where = 'left') {
      if (!this.allowInsertCols) return;
      if (this._allRows) return;   // v1: フィルタ中は構造変更ロック
      if (this.maxCols && this.COLS >= this.maxCols) return;   // 上限
      if (this.mode === 'edit') this._commitActive();
      this._normalizeArrays();
      const at = Math.max(0, Math.min(this.COLS, where === 'right' ? ci + 1 : ci));
      const before = this.snapSel(), grid = this, r = this.active.r;
      const label = TssGrid._colLabel(this.COLS), frozenBump = at < this.frozenCols;
      const doIt = () => {
        grid.headers.splice(at, 0, label); grid.columns.splice(at, 0, undefined); grid.colW.splice(at, 0, undefined);
        for (const row of grid.data) row.splice(at, 0, '');
        grid.COLS++; if (frozenBump) grid.frozenCols++;
        grid.hiddenCols = new Set([...grid.hiddenCols].map(h => h >= at ? h + 1 : h));   // 隠し列インデックスをずらす
      };
      const undoIt = () => {
        grid.headers.splice(at, 1); grid.columns.splice(at, 1); grid.colW.splice(at, 1);
        for (const row of grid.data) row.splice(at, 1);
        grid.COLS--; if (frozenBump) grid.frozenCols--;
        grid.hiddenCols = new Set([...grid.hiddenCols].map(h => h > at ? h - 1 : h));
      };
      this._structCmd(doIt, undoIt, () => ({ active: { r, c: at }, extent: { r, c: at } }), before, { type: 'insertCol', at });
    }
    deleteCols(c0, c1) {
      if (!this.allowDeleteCols) return;
      if (this._allRows) return;   // v1: フィルタ中は構造変更ロック
      if (c1 == null) c1 = c0;
      const m = c1 - c0 + 1;
      if (this.COLS - m < Math.max(1, this.minCols)) return;   // 下限（既定: 最低1列）
      if (this.mode === 'edit') this._commitActive();
      this._normalizeArrays();
      const before = this.snapSel(), grid = this, r = this.active.r;
      const frozenDelta = Math.max(0, Math.min(c1, this.frozenCols - 1) - c0 + 1);
      let saved;
      const doIt = () => {
        saved = { headers: grid.headers.splice(c0, m), cfgs: grid.columns.splice(c0, m), ws: grid.colW.splice(c0, m), cells: grid.data.map(row => row.splice(c0, m)), hidden: [...grid.hiddenCols] };
        grid.COLS -= m; grid.frozenCols -= frozenDelta;
        grid.hiddenCols = new Set(saved.hidden.filter(h => h < c0 || h > c1).map(h => h > c1 ? h - m : h));   // 削除分を除き残りをずらす
      };
      const undoIt = () => {
        grid.headers.splice(c0, 0, ...saved.headers); grid.columns.splice(c0, 0, ...saved.cfgs); grid.colW.splice(c0, 0, ...saved.ws);
        grid.data.forEach((row, i) => row.splice(c0, 0, ...saved.cells[i]));
        grid.COLS += m; grid.frozenCols += frozenDelta;
        grid.hiddenCols = new Set(saved.hidden);   // 隠し状態を完全復元
      };
      this._structCmd(doIt, undoIt, () => { const cc = Math.min(c0, grid.COLS - 1); return { active: { r, c: cc }, extent: { r, c: cc } }; }, before, { type: 'deleteCols', c0, c1 });
    }

    // ---- 右クリックメニュー ----
    _onContextMenu(e) {
      if (!this.contextMenu) return;   // 無効時はブラウザ既定メニュー
      const th = e.target.closest('th'), td = e.target.closest('td[data-r]');
      if (!th && !td) return;
      e.preventDefault();
      if (this.mode === 'edit') this._commitActive();
      // 右クリック位置に選択を移す（既存選択の中ならそのまま＝範囲削除に使える）
      if (td) {
        const r = +td.dataset.r, c = +td.dataset.c, s = this.rectRange();
        if (!(r >= s.r0 && r <= s.r1 && c >= s.c0 && c <= s.c1)) this.setActive(r, c);
      } else if (th.dataset.c != null) { const c = +th.dataset.c, s = this.rectRange(); if (!(c >= s.c0 && c <= s.c1)) this.selectCol(c); }   // 既存選択の中なら維持（複数列右クリックで解除しない）
      else if (th.dataset.r != null) { const r = +th.dataset.r, s = this.rectRange(); if (!(r >= s.r0 && r <= s.r1)) this.selectRow(r); }   // 同上（複数行）
      this._showMenu(e.clientX, e.clientY);
    }
    // 既定のメニュー項目キー（allow フラグ・copyPaste で出し分け）。
    _defaultMenuKeys() {
      const k = [];
      if (this.allowInsertRows) k.push('row_above', 'row_below');
      if (this.allowDeleteRows) k.push('remove_row');
      const colOps = this.allowInsertCols || this.allowDeleteCols;
      if (k.length && colOps) k.push('---');
      if (this.allowInsertCols) k.push('col_left', 'col_right');
      if (this.allowDeleteCols) k.push('remove_col');
      const clip = [];
      if (this.copyPaste) clip.push('copy', 'cut', 'paste');
      clip.push('clear');
      if (k.length && clip.length) k.push('---');
      k.push(...clip);
      return k;
    }
    // 組込項目キー → 項目記述子（{label, act, danger, disabled} / {sep:true}）。不可なら null。
    _builtinItem(key, s) {
      const rows = s.r1 - s.r0 + 1, cols = s.c1 - s.c0 + 1;
      switch (key) {
        case 'row_above': return this.allowInsertRows ? { label: '行を上に挿入', act: () => this.insertRow(s.r0, 'above') } : null;
        case 'row_below': return this.allowInsertRows ? { label: '行を下に挿入', act: () => this.insertRow(s.r1, 'below') } : null;
        case 'remove_row': return this.allowDeleteRows ? { label: rows > 1 ? rows + ' 行を削除' : '行を削除', danger: true, disabled: this.ROWS - rows < Math.max(1, this.minRows), act: () => this.deleteRows(s.r0, s.r1) } : null;
        case 'col_left': return this.allowInsertCols ? { label: '列を左に挿入', act: () => this.insertCol(s.c0, 'left') } : null;
        case 'col_right': return this.allowInsertCols ? { label: '列を右に挿入', act: () => this.insertCol(s.c1, 'right') } : null;
        case 'remove_col': return this.allowDeleteCols ? { label: cols > 1 ? cols + ' 列を削除' : '列を削除', danger: true, disabled: this.COLS - cols < Math.max(1, this.minCols), act: () => this.deleteCols(s.c0, s.c1) } : null;
        case 'copy': return { label: 'コピー', disabled: !this.copyPaste, act: () => this.copy(false) };
        case 'cut': return { label: '切り取り', disabled: !this.copyPaste, act: () => this.copy(true) };
        case 'paste': return { label: '貼り付け', disabled: !this.copyPaste, act: () => this.paste() };
        case 'clear': return { label: '内容をクリア', act: () => this.clearRange() };
        case 'check_column': return this.colType(s.c0) === 'checkbox' ? { label: 'すべてチェック', act: () => this.setColumnChecked(s.c0, true) } : null;
        case 'uncheck_column': return this.colType(s.c0) === 'checkbox' ? { label: 'すべて外す', act: () => this.setColumnChecked(s.c0, false) } : null;
        case 'undo': return { label: '元に戻す', disabled: !this.history.canUndo(), act: () => this.history.undo() };
        case 'redo': return { label: 'やり直し', disabled: !this.history.canRedo(), act: () => this.history.redo() };
        default: return /^-+$/.test(key) || key === 'separator' ? { sep: true } : null;
      }
    }
    // メニュー構成（キー文字列／カスタム項目オブジェクト）→ 表示用記述子の配列。
    _resolveMenuItems(config, s) {
      const items = [];
      for (const entry of config) {
        if (typeof entry === 'string') { const it = this._builtinItem(entry, s); if (it) items.push(it); continue; }
        if (!entry || typeof entry !== 'object') continue;
        const hidden = typeof entry.hidden === 'function' ? !!entry.hidden.call(this, s) : !!entry.hidden;
        if (hidden) continue;
        const name = typeof entry.name === 'function' ? entry.name.call(this, s) : entry.name;
        if (entry.separator || /^-+$/.test(String(name))) { items.push({ sep: true }); continue; }
        const disabled = typeof entry.disabled === 'function' ? !!entry.disabled.call(this, s) : !!entry.disabled;
        const it = { label: String(name == null ? '' : name), disabled, danger: !!entry.danger };
        if (Array.isArray(entry.submenu)) it.submenu = entry.submenu;
        else it.act = () => { if (typeof entry.callback === 'function') { try { entry.callback.call(this, { range: { ...s }, key: entry.key }); } catch (_) {} } };
        items.push(it);
      }
      return items;
    }
    // 記述子配列 → HTML。actionable 項目は data-mi で _menuActions に紐付け（submenu も再帰でフラット登録）。
    _renderMenuItems(items, s) {
      let html = '';
      for (const it of items) {
        if (it.sep) { html += '<div class="tg-sep"></div>'; continue; }
        if (it.submenu) {
          const sub = this._renderMenuItems(this._resolveMenuItems(it.submenu, s), s);
          html += '<div class="tg-mi tg-has-sub' + (it.disabled ? ' tg-disabled' : '') + '">' + TssGrid.esc(it.label) + '<div class="tg-submenu">' + sub + '</div></div>';
        } else {
          const idx = this._menuActions.push(it.act) - 1;
          html += '<div class="tg-mi' + (it.danger ? ' tg-danger' : '') + (it.disabled ? ' tg-disabled' : '') + '" data-mi="' + idx + '">' + TssGrid.esc(it.label) + '</div>';
        }
      }
      return html;
    }
    _showMenu(x, y) {
      const s = this.rectRange();
      const config = this._menuConfig || this._defaultMenuKeys();
      const items = this._resolveMenuItems(config, s);
      if (!items.length) { this._hideMenu(); return; }   // 該当項目なし＝メニューを出さない（前回の残りも隠す）
      this._menuActions = [];
      this.menuEl.innerHTML = this._renderMenuItems(items, s);
      this.menuEl.style.display = 'block';
      // 画面外にはみ出さないよう調整
      const mw = this.menuEl.offsetWidth, mh = this.menuEl.offsetHeight;
      const vw = window.innerWidth, vh = window.innerHeight;
      this.menuEl.style.left = Math.min(x, vw - mw - 4) + 'px';
      this.menuEl.style.top = Math.min(y, vh - mh - 4) + 'px';
    }
    _hideMenu() { if (this.menuEl) this.menuEl.style.display = 'none'; }

    // ---- フィル ----
    fillRectFromPointer(pr, pc, src, twoD) {
      if (pr >= src.r0 && pr <= src.r1 && pc >= src.c0 && pc <= src.c1) return null;
      if (this.fillDirection !== 'both') twoD = false;   // 方向制限時は矩形(2D)フィルを無効
      if (twoD) return { r0: Math.min(src.r0, pr), r1: Math.max(src.r1, pr), c0: Math.min(src.c0, pc), c1: Math.max(src.c1, pc) };
      const dDown = pr - src.r1, dUp = src.r0 - pr, dRight = pc - src.c1, dLeft = src.c0 - pc;
      let vOver = Math.max(dDown, dUp, 0), hOver = Math.max(dRight, dLeft, 0);
      if (this.fillDirection === 'vertical') hOver = 0;     // 縦のみ
      if (this.fillDirection === 'horizontal') vOver = 0;   // 横のみ
      if (vOver === 0 && hOver === 0) return null;
      if (vOver >= hOver) return (dUp > dDown)
        ? { r0: this.clampR(pr), r1: src.r1, c0: src.c0, c1: src.c1 }
        : { r0: src.r0, r1: this.clampR(pr), c0: src.c0, c1: src.c1 };
      return (dLeft > dRight)
        ? { r0: src.r0, r1: src.r1, c0: this.clampC(pc), c1: src.c1 }
        : { r0: src.r0, r1: src.r1, c0: src.c0, c1: this.clampC(pc) };
    }
    static toNum(v) { const t = String(v).trim(); if (t === '') return null; const n = Number(t); return Number.isFinite(n) ? n : null; }
    static fmtNum(n) { return (Math.round(n * 1e10) / 1e10).toString(); }
    lineFill(srcVals, count, ctrl) {
      const nums = srcVals.map(TssGrid.toNum), numeric = nums.every(n => n !== null);
      let base = false, step = 0;
      if (numeric && srcVals.length >= 2) {
        step = nums[1] - nums[0]; base = true;
        for (let i = 2; i < nums.length; i++) if (Math.abs((nums[i] - nums[i - 1]) - step) > 1e-9) { base = false; break; }
      }
      let series = false, st = 0;
      if (numeric) { if (base) { series = !ctrl; st = step; } else { series = !!ctrl; st = 1; } }
      const out = [];
      if (series) { const last = nums[nums.length - 1]; for (let k = 1; k <= count; k++) out.push(TssGrid.fmtNum(last + st * k)); }
      else { for (let k = 0; k < count; k++) out.push(srcVals[k % srcVals.length]); }
      return out;
    }
    tileFill(src, fr, changes) {
      const sH = src.r1 - src.r0 + 1, sW = src.c1 - src.c0 + 1;
      for (let r = fr.r0; r <= fr.r1; r++) for (let c = fr.c0; c <= fr.c1; c++) {
        if (this._isHidden(c)) continue;   // 隠し列は埋めない
        const sr = src.r0 + ((((r - src.r0) % sH) + sH) % sH), sc = src.c0 + ((((c - src.c0) % sW) + sW) % sW);
        if (r === sr && c === sc) continue;
        this.setCell(r, c, this.data[sr][sc], changes);
      }
    }
    fillVertical(src, fr, changes, ctrl) {
      const down = fr.r1 > src.r1;
      for (let c = src.c0; c <= src.c1; c++) {
        if (this._isHidden(c)) continue;   // 隠し列は埋めない
        const sv = []; for (let r = src.r0; r <= src.r1; r++) sv.push(this.data[r][c]);
        if (down) { const n = fr.r1 - src.r1, out = this.lineFill(sv, n, ctrl); for (let k = 0; k < n; k++) this.setCell(src.r1 + 1 + k, c, out[k], changes); }
        else { const n = src.r0 - fr.r0, L = sv.length; for (let k = 0; k < n; k++) this.setCell(src.r0 - 1 - k, c, sv[L - 1 - (k % L)], changes); }
      }
    }
    fillHorizontal(src, fr, changes, ctrl) {
      const right = fr.c1 > src.c1;
      for (let r = src.r0; r <= src.r1; r++) {
        const sv = []; for (let c = src.c0; c <= src.c1; c++) if (!this._isHidden(c)) sv.push(this.data[r][c]);
        if (right) { const n = fr.c1 - src.c1, out = this.lineFill(sv, n, ctrl); for (let k = 0; k < n; k++) { const tc = src.c1 + 1 + k; if (!this._isHidden(tc)) this.setCell(r, tc, out[k], changes); } }
        else { const n = src.c0 - fr.c0, L = sv.length; for (let k = 0; k < n; k++) { const tc = src.c0 - 1 - k; if (!this._isHidden(tc)) this.setCell(r, tc, sv[L - 1 - (k % L)], changes); } }
      }
    }
    doFill(src, fr, ctrl) {
      if (this.onBeforeAutofill) { let r; try { r = this.onBeforeAutofill({ ...src }, { ...fr }); } catch (_) {} if (r === false) return; }
      const before = { active: { r: src.r0, c: src.c0 }, extent: { r: src.r1, c: src.c1 } };
      const changes = [];
      const vertical = fr.r0 < src.r0 || fr.r1 > src.r1, horizontal = fr.c0 < src.c0 || fr.c1 > src.c1;
      if (vertical && horizontal) this.tileFill(src, fr, changes);
      else if (vertical) this.fillVertical(src, fr, changes, ctrl);
      else this.fillHorizontal(src, fr, changes, ctrl);
      this.pushCmd(changes, before, { active: { r: fr.r0, c: fr.c0 }, extent: { r: fr.r1, c: fr.c1 } }, 'fill');
      if (this.onAfterAutofill) { try { this.onAfterAutofill({ ...src }, { ...fr }); } catch (_) {} }
    }

    // ---- コピペ ----
    copy(cut) {
      if (!this.copyPaste) return;
      const sel = this.rectRange(); let buf = [];
      const cols = this._visCols().filter(c => c >= sel.c0 && c <= sel.c1);   // 隠し列は除外
      for (let r = sel.r0; r <= sel.r1; r++) {
        const row = []; for (const c of cols) row.push(this.data[r][c]);
        buf.push(row);
      }
      // 「前」フック（cut は onBeforeCut / copy は onBeforeCopy）。false で中止 / 配列を返すと差替え。
      const info = { range: { ...sel }, cut: !!cut };
      const before = cut ? this.onBeforeCut : this.onBeforeCopy;
      if (before) { let r; try { r = before(buf, info); } catch (_) {} if (r === false) return; if (Array.isArray(r)) buf = r; }
      sharedClip = buf;
      this._writeClip(buf.map(row => row.join('\t')).join('\n'));
      this.pendingCut = cut ? { ...sel } : null;
      this.placeRect(this.copybox, sel.r0, sel.c0, sel.r1, sel.c1); this.copybox.style.display = 'block';
      if (this.onAfterCopy) { try { this.onAfterCopy(buf, info); } catch (_) {} }
    }
    _writeClip(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(() => this._execCopy(text));
      else this._execCopy(text);
    }
    _execCopy(text) {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (_) {} document.body.removeChild(ta); this.editor.focus();
    }
    static parseTSV(t) { t = t.replace(/\r\n/g, '\n').replace(/\r/g, '\n'); if (t.endsWith('\n')) t = t.slice(0, -1); return t.split('\n').map(l => l.split('\t')); }
    async paste() {
      if (!this.copyPaste) return;
      let text = null;
      try { if (navigator.clipboard && navigator.clipboard.readText) text = await navigator.clipboard.readText(); } catch (_) {}
      const g = (text && text.length) ? TssGrid.parseTSV(text) : sharedClip;
      if (!g || !g.length) return;
      this.pasteGrid(g);
    }
    pasteGrid(g) {
      if (this.onBeforePaste) {
        let ret; try { ret = this.onBeforePaste(g); } catch (_) { ret = undefined; }
        if (ret === false) return;
        if (Array.isArray(ret)) g = ret;
        if (!g || !g.length) return;
      }
      const before = this.snapSel(), changes = [], sel = this.rectRange();
      const visAll = this._visCols();
      let after;
      if (g.length === 1 && g[0].length === 1 && !(sel.r0 === sel.r1 && sel.c0 === sel.c1)) {
        const v = g[0][0];
        for (let r = sel.r0; r <= sel.r1; r++) for (let c = sel.c0; c <= sel.c1; c++) if (!this._isHidden(c)) this.setCell(r, c, v, changes);
        after = { active: { r: sel.r0, c: sel.c0 }, extent: { r: sel.r1, c: sel.c1 } };
      } else {
        const r0 = this.active.r, c0 = this.active.c;
        let maxw = 0; for (let i = 0; i < g.length; i++) maxw = Math.max(maxw, g[i].length);
        const p0 = visAll.indexOf(c0), availCols = visAll.length - p0;   // 貼り付けは可視列へ（隠し列をスキップ）
        // 範囲超過チェック（オプトイン）: はみ出すなら貼り付けを中止してエラー通知
        if (this.pasteOverflow === 'error' && (r0 + g.length > this.ROWS || maxw > availCols)) {
          if (this.onPasteOverflow) {
            try {
              this.onPasteOverflow({
                anchor: { r: r0, c: c0 }, height: g.length, width: maxw, rows: this.ROWS, cols: this.COLS,
                overRows: Math.max(0, r0 + g.length - this.ROWS), overCols: Math.max(0, maxw - availCols),
              });
            } catch (_) {}
          }
          return;  // 何も変更しない
        }
        let lastC = c0;
        for (let i = 0; i < g.length; i++) for (let j = 0; j < g[i].length; j++) {
          const r = r0 + i, c = visAll[p0 + j]; if (r < this.ROWS && c != null) { this.setCell(r, c, g[i][j], changes); lastC = c; }
        }
        after = { active: { r: r0, c: c0 }, extent: { r: Math.min(this.ROWS - 1, r0 + g.length - 1), c: lastC } };
      }
      if (this.pendingCut) { const cs = this.pendingCut; for (let r = cs.r0; r <= cs.r1; r++) for (let c = cs.c0; c <= cs.c1; c++) this.setCell(r, c, '', changes); this.pendingCut = null; this.copybox.style.display = 'none'; }
      this.pushCmd(changes, before, after, 'paste');
      this.focusAndSelect(after);
      if (this.onAfterPaste) {
        const range = { r0: after.active.r, c0: after.active.c, r1: after.extent.r, c1: after.extent.c };
        try { this.onAfterPaste(g, { range }); } catch (_) {}
      }
    }
    clearCopyMarquee() { this.copybox.style.display = 'none'; this.pendingCut = null; }

    _tdAtPoint(e) { const el = document.elementFromPoint(e.clientX, e.clientY); return el && el.closest ? el.closest('td[data-r]') : null; }
    // ポインタ Y から絶対行を算出（td が無い窓外/スペーサ上でも使える＝仮想スクロールのドラッグ用。一定行高モデル）。
    _rowFromPointerY(clientY) {
      const wr = this.wrap.getBoundingClientRect();
      const contentY = clientY - wr.top + this.wrap.scrollTop - (this.colHeaders ? (this._theadH || 0) : 0);
      return Math.max(0, Math.min(this.ROWS - 1, Math.floor(contentY / this.defRowH)));
    }
    // ポインタ X から列を算出（_colLefts 累積から。隠し列は飛ばす）。
    _colFromPointerX(clientX) {
      const wr = this.wrap.getBoundingClientRect(), x = clientX - wr.left + this.wrap.scrollLeft, L = this._colLefts;
      if (L) for (let c = this.COLS - 1; c >= 0; c--) if (!this._isHidden(c) && x >= L[c]) return c;
      return this.extent.c;
    }
    _stopAutoScroll() { if (this._asRAF) { try { cancelAnimationFrame(this._asRAF); } catch (_) {} this._asRAF = 0; } this._dragDir = 0; }
    _updateFillPreview(r, c, alt) {
      this._fillRow = r;
      const fr = this.fillRectFromPointer(r, c, this.filling.src, alt);
      if (fr) { this.placeRect(this.fillpreview, fr.r0, fr.c0, fr.r1, fr.c1); this.fillpreview.style.display = 'block'; }
      else this.fillpreview.style.display = 'none';
    }
    // ドラッグ/フィル中に上下端を越えたら自動スクロールしながら選択/プレビューを伸ばす。
    // 重要: 伸ばす先は「カウンタ加算」でなく常に【ポインタ位置の行】＝端を1pxだけ超えたら1行しか伸びない（暴走しない）。
    // 自動スクロール速度は端からのはみ出し量に比例（少し超えた＝ゆっくり / 大きく超えた＝速く）。
    _edgeAutoScroll(e, mode) {
      this._dragY = e.clientY; this._dragX = e.clientX; this._dragAlt = !!e.altKey; this._dragMode = mode;
      const r = this._rowFromPointerY(e.clientY), c = this._colFromPointerX(e.clientX);
      if (mode === 'drag') this._extendTo(r, c); else this._updateFillPreview(r, c, this._dragAlt);   // まずポインタ位置のセルへ
      const wr = this.wrap.getBoundingClientRect();
      const headB = wr.top + (this.colHeaders ? (this._theadH || 0) : 0);   // 上端＝ヘッダ下
      const leftB = wr.left + this._frozenPaneW();                          // 左端＝固定ペイン(行番号+固定列)の右
      const past = e.clientY > wr.bottom || e.clientY < headB || e.clientX > wr.right || e.clientX < leftB;
      if (past && !this._asRAF) this._asRAF = requestAnimationFrame(() => this._autoScrollTick());
    }
    _autoScrollTick() {
      this._asRAF = 0;
      if (!this.dragging && !this.filling) return;
      const wr = this.wrap.getBoundingClientRect();
      const headB = wr.top + (this.colHeaders ? (this._theadH || 0) : 0), leftB = wr.left + this._frozenPaneW();
      const amp = d => Math.min(24, 2 + d * 0.2);   // px/フレーム＝はみ出し量に比例（上限24・暴走しない）
      let v = 0, vh = 0;
      if (this._dragY > wr.bottom) v = amp(this._dragY - wr.bottom); else if (this._dragY < headB) v = -amp(headB - this._dragY);
      if (this._dragX > wr.right) vh = amp(this._dragX - wr.right); else if (this._dragX < leftB) vh = -amp(leftB - this._dragX);
      if (v !== 0) {
        const before = this.wrap.scrollTop;
        this.wrap.scrollTop = Math.max(0, before + v);
        if (this.wrap.scrollTop !== before && this.virtual) this._renderWindow(this._vWindow(), false);   // 縦は仮想時のみ再窓（非仮想で呼ぶと tbody を壊す）
      }
      if (vh !== 0) this.wrap.scrollLeft = Math.max(0, this.wrap.scrollLeft + vh);   // 横は全列描画なので scrollLeft だけ
      const r = this._rowFromPointerY(this._dragY), c = this._colFromPointerX(this._dragX);   // 伸ばす先は常にポインタのセル
      if (this._dragMode === 'drag') this._extendTo(r, c); else this._updateFillPreview(r, c, this._dragAlt);
      const maxTop = this.wrap.scrollHeight - this.wrap.clientHeight, maxLeft = this.wrap.scrollWidth - this.wrap.clientWidth;
      const vStuck = (v > 0 && this.wrap.scrollTop >= maxTop) || (v < 0 && this.wrap.scrollTop <= 0);
      const hStuck = (vh > 0 && this.wrap.scrollLeft >= maxLeft) || (vh < 0 && this.wrap.scrollLeft <= 0);
      if ((v !== 0 && !vStuck) || (vh !== 0 && !hStuck)) this._asRAF = requestAnimationFrame(() => this._autoScrollTick());
    }
    // setExtent の自動可視化(_vEnsureVisible)を伴わない版＝自動スクロールは _autoScrollTick が手動制御するため、二重スクロールを避ける。
    _extendTo(r, c) {
      const e = { r: this.clampR(r), c: this.clampC(c) };
      if (!this._beforeSel(this.active, e)) return;
      this.extent = e; this.updateSelectionUI(); this._fireSelection();
    }

    // スクロール / リサイズでセル位置が動いた時、エディタと選択枠を貼り直す
    _reflow() {
      if (this.stretchH !== 'none') this._applyStretch();   // 枠幅が変わったら余白を再配分
      this._buildGeomCache();   // 幅/枠が変わったので実測幾何を取り直す（リサイズ/ResizeObserver/window resize）
      if (this.virtual) this._renderWindow(this._vWindow(), false);   // 枠高が変われば窓行数も変わる＝窓を同期
      const td = this.activeTd(); if (!td) return;
      this.place(this.editor, td);
      if (this.select && this.select.style.display !== 'none') this.place(this.select, td);
      this.updateSelectionUI();
    }

    _bind() {
      if (this.virtual) this.wrap.addEventListener('scroll', () => this._vSync(), { passive: true });  // 仮想スクロール: 窓再描画
      this.editor.addEventListener('keydown', (e) => this._onKey(e));
      this.editor.addEventListener('compositionstart', () => {
        if (this.mode !== 'nav') return;
        if (this._usesTextEditor(this.active.c)) this.toEdit(null, false);
      });
      this.editor.addEventListener('beforeinput', (e) => {
        if (this.mode !== 'nav' || !(e.inputType || '').startsWith('insert')) return;
        const c = this.active.c, t = this.colType(c);
        if (this._usesTextEditor(c)) { this.toEdit(null, false); return; }  // text / parse・format 付き date・time
        e.preventDefault();
        if (this.colCfg(c).editor) this._openCustomEditor(this.active.r, c);   // カスタムエディタ
        else if (t === 'dropdown') this._openSelect();
        else if (t === 'date' || t === 'time') this.toEdit(this.data[this.active.r][c], true);  // ネイティブピッカー
        // checkbox は文字入力を無視（Space / クリックでトグル）
      });
      this.editor.addEventListener('blur', () => {
        if (this._customEditor) return;   // カスタムエディタが奪ったフォーカスでの blur は無視
        if (this.mode === 'edit' && (!this.select || this.select.style.display === 'none')) { this.commit(); this.toNav(); this.updateSelectionUI(); }
      });
      this.select.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this._commitSelect(); this._advance('enter', e.shiftKey); }
        else if (e.key === 'Tab') { e.preventDefault(); this._commitSelect(); this._advance('tab', e.shiftKey); }
        else if (e.key === 'Escape') { e.preventDefault(); this._cancelSelect(); }
      });
      this.select.addEventListener('blur', () => { if (this.mode === 'edit' && this.select.style.display !== 'none') this._commitSelect(); });
      // 選択肢を選んだら即確定（移動はしない＝Excel と同様にそのセルに留まる）。
      // ネイティブの一覧で Enter/クリック確定すると change のみ発火し keydown(Enter) が来ないため、
      // ここでエディタへフォーカスを戻さないと以降キー操作が効かなくなる（カーソルキーがブラウザ既定に流れる）。
      this.select.addEventListener('change', () => {
        if (this.mode === 'edit' && this.select.style.display !== 'none') { this._commitSelect(); this.editor.focus(); }
      });

      this.table.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;   // 右/中クリックは選択ドラッグを開始しない（右は contextmenu で処理）
        const cls = e.target.classList;
        if (cls && cls.contains('tg-colgrip')) { this._startColResize(e); return; }  // 列幅リサイズ
        if (cls && cls.contains('tg-rowgrip')) { this._startRowResize(e); return; }  // 行高リサイズ
        if (cls && cls.contains('tg-rowmove') && !this.rowReorderWhole) { this._startRowMove(e); return; }    // ⠿つまみドラッグ移動（'header'モードはセル全体扱い＝_onHeaderMouseDown 経由で選択も伴う）
        const th = e.target.closest('th');
        if (th) { this._onHeaderMouseDown(e, th); return; }   // 行/列/全体 選択
        const td = e.target.closest('td[data-r]'); if (!td) return;
        e.preventDefault();
        const r = +td.dataset.r, c = +td.dataset.c;
        // 同じセルでカスタムエディタが開いていたら、再クリックは「閉じるだけ」（トグル）
        const wasOpenHere = this._customEditor && this._customCell && this._customCell.r === r && this._customCell.c === c;
        if (this.mode === 'edit') this._commitActive();
        if (e.shiftKey) { this.toNav(); this.setExtent(r, c); this.editor.focus(); return; }
        this.setActive(r, c); this.dragging = true;
        // チェックボックスを直接クリックしたらトグル（範囲選択は阻害しない）
        if (e.target.classList && e.target.classList.contains('tg-cb')) { this.dragging = false; this._toggleCheckbox(r, c); return; }
        // ドロップダウンはシングルクリックで即開く
        if (this.colType(c) === 'dropdown') { this.dragging = false; this._openSelect(); }
        // カスタムエディタが openOnClick を申告していれば、ドロップダウン同様シングルクリックで開く（再クリックは開かない＝トグル）
        else { const ed = this.colCfg(c).editor; if (ed && ed.openOnClick && !wasOpenHere) { this.dragging = false; this._openCustomEditor(r, c); } }
      });
      // ヘッダ全選択チェックは mousedown で処理済み。click のネイティブ・トグルを止めて二重反転を防ぐ
      this.table.addEventListener('click', (e) => {
        if (e.target.classList && e.target.classList.contains('tg-head-cb')) e.preventDefault();
      });
      this.table.addEventListener('dblclick', (e) => {
        // 列境界グリップのダブルクリック＝オートフィット（Excel風）
        if (e.target.classList && e.target.classList.contains('tg-colgrip')) {
          const th = e.target.closest('th[data-c]'); if (th) this.autoSizeColumn(+th.dataset.c); return;
        }
        const td = e.target.closest('td[data-r]'); if (!td) return;
        this.setActive(+td.dataset.r, +td.dataset.c); this._beginEdit(this.active.r, this.active.c);
      });
      this.fillhandle.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); this.filling = { src: this.rectRange() }; this._fillRow = null; });
      // 右クリックメニュー（行/列の挿入・削除）
      this.table.addEventListener('contextmenu', (e) => this._onContextMenu(e));
      this.menuEl.addEventListener('mousedown', (e) => {
        e.preventDefault();   // メニュー内クリックでエディタの blur 確定を防ぐ
        const mi = e.target.closest('.tg-mi');
        if (!mi || mi.classList.contains('tg-disabled') || mi.classList.contains('tg-has-sub')) return;  // 親項目は開くだけ
        const idx = mi.getAttribute('data-mi'); if (idx == null) return;
        this._hideMenu();
        const act = this._menuActions && this._menuActions[+idx];
        if (typeof act === 'function') act();
      });
      // メニュー外クリック / Esc / スクロールで閉じる
      this._docDown = (e) => { if (this.menuEl.style.display !== 'none' && !this.menuEl.contains(e.target)) this._hideMenu(); };
      this._on(document, 'mousedown', this._docDown, true);
      this._on(document, 'keydown', (e) => { if (e.key === 'Escape') this._hideMenu(); });
      this.wrap.addEventListener('scroll', () => this._hideMenu());
      // スクロール時は枠の位置合わせのみ（highlightRange を呼ばない＝ちらつき防止。
      // 枠はネイティブにスクロール追従するので、これは主に固定列の補正用）
      this.wrap.addEventListener('scroll', () => {
        const td = this.activeTd(); if (!td) return;
        this.place(this.editor, td);
        if (this.select && this.select.style.display !== 'none') this.place(this.select, td);
        this._placeOverlays();
      });
      // リサイズ追従: テーブルの寸法が変わったら選択枠を貼り直す（ウィンドウ／コンテナ幅変更など）
      if (typeof ResizeObserver !== 'undefined') {
        this._ro = new ResizeObserver(() => this._reflow());
        this._ro.observe(this.table); this._ro.observe(this.wrap);
      } else if (typeof window !== 'undefined' && window.addEventListener) {
        this._on(window, 'resize', () => this._reflow());
      }

      // document: 自分が掴んでる時だけ反応（複数インスタンスでも衝突しない）
      this._on(document, 'mousemove', (e) => {
        if (this.resizing) {
          const rz = this.resizing;
          if (rz.type === 'col') {
            rz.size = Math.max(this.minColW, rz.base + (e.clientX - rz.start));
            if (this.resizeMode === 'live') this.setColWidth(rz.c, rz.size);
            else this._showGuide('col', rz.edge + rz.size);
          } else {
            rz.size = Math.max(this.minRowH, rz.base + (e.clientY - rz.start));
            if (this.resizeMode === 'live') this.setRowHeight(rz.r, rz.size);
            else this._showGuide('row', rz.edge + rz.size);
          }
          return;
        }
        if (this.rowMove) {
          const rm = this.rowMove;
          const el = document.elementFromPoint(e.clientX, e.clientY);
          const tr = el && el.closest ? el.closest('tr[data-r]') : null;
          let to = rm.to;
          if (tr) { const r = +tr.dataset.r, b = tr.getBoundingClientRect(); to = (e.clientY > b.top + b.height / 2) ? r + 1 : r; }
          rm.to = to;
          if (to >= rm.r0 && to <= rm.r1 + 1) this.resizeGuide.style.display = 'none';   // 自分の中＝移動無し
          else this._showRowDropLine(to);
          return;
        }
        if (this.headerDrag) {
          const el = document.elementFromPoint(e.clientX, e.clientY);
          const th = el && el.closest ? el.closest('th') : null;
          if (th) {
            if (this.headerDrag === 'col' && th.dataset.c != null) this._extendCol(+th.dataset.c);
            else if (this.headerDrag === 'row' && th.dataset.r != null) this._extendRow(+th.dataset.r);
          }
          return;
        }
        if (this.dragging) {
          const td = this._tdAtPoint(e);
          if (td) { this._stopAutoScroll(); this.setExtent(+td.dataset.r, +td.dataset.c); }
          else this._edgeAutoScroll(e, 'drag');   // 窓外/端＝自動スクロール＋モデル幾何で伸ばす
        }
        else if (this.filling) {
          const td = this._tdAtPoint(e);
          if (td) { this._stopAutoScroll(); this._updateFillPreview(+td.dataset.r, +td.dataset.c, e.altKey); }
          else this._edgeAutoScroll(e, 'fill');
        }
      });
      this._on(document, 'mouseup', (e) => {
        if (this.resizing) {
          const rz = this.resizing; this.resizing = null; this.resizeGuide.style.display = 'none';
          if (this.resizeMode !== 'live' && rz.size != null) {   // 離した時に確定
            if (rz.type === 'col') this.setColWidth(rz.c, rz.size); else this.setRowHeight(rz.r, rz.size);
          }
          this._reflow(); return;
        }
        if (this.rowMove) {
          const rm = this.rowMove; this.rowMove = null;
          if (typeof document !== 'undefined') document.body.style.cursor = '';
          this.resizeGuide.style.display = 'none';
          this.moveRows(rm.r0, rm.r1, rm.to);
          return;
        }
        if (this.headerDrag) { this.headerDrag = null; return; }
        if (this.dragging) { this.dragging = false; this._stopAutoScroll(); return; }
        if (this.filling) {
          this._stopAutoScroll();
          // autoInsertRow: フィルハンドルをテーブル下端より下へドロップしたら、足りない行を追加（縦フィル時）
          if (this.fillAutoInsertRow && this.fillDirection !== 'horizontal' && !this._tdAtPoint(e)) {
            const tb = this.table.getBoundingClientRect();
            const extra = Math.min(1000, Math.ceil((e.clientY - tb.bottom) / this.defRowH));
            if (extra > 0) {
              for (let i = 0; i < extra; i++) { this.data.push(new Array(this.COLS).fill('')); this.rowH.push(undefined); if (this._src) this._src.push({}); this.ROWS++; }
              this.buildTable();
            }
          }
          // 確定の対象セル: td があればそれ、無ければ（窓外）モデル幾何＝直近のフィル行/ポインタ位置から。
          const td = this._tdAtPoint(e);
          const tr = td ? +td.dataset.r : (this._fillRow != null ? this._fillRow : this._rowFromPointerY(e.clientY));
          const tc = td ? +td.dataset.c : this._colFromPointerX(e.clientX);
          const fr = this.fillRectFromPointer(tr, tc, this.filling.src, e.altKey);
          this.fillpreview.style.display = 'none';
          const src = this.filling.src; this.filling = null;
          if (fr) { this.doFill(src, fr, e.ctrlKey || e.metaKey); this.selectRect(fr.r0, fr.c0, fr.r1, fr.c1); }
        }
      });
    }

    // ---- 型に応じた編集の入口 ----
    _beginEdit(r, c) {
      this.clearCopyMarquee();   // 編集開始でコピー/カットのマーキー（点線）を消す（dropdown/checkbox/カスタム含む）
      if (this.colCfg(c).editor) { this._openCustomEditor(r, c); return; }   // カスタムエディタ
      const t = this.colType(c);
      if (t === 'checkbox') { this._toggleCheckbox(r, c); return; }
      if (t === 'dropdown') { this._openSelect(); return; }
      this.toEdit(this._editText(r, c), true);
    }
    // カスタムエディタ口（base-editor 相当）。columns[c].editor = オブジェクト or ()=>オブジェクト。
    // 契約: editor.open({ grid, r, c, value, td, commit(value), cancel() }) / 任意で editor.close()。
    // 確定は commit→pushCmd（関所）を通すので検証/整形/読取専用が効く。
    _openCustomEditor(r, c) {
      if (this._isReadOnly(r, c)) return;
      const def = this.colCfg(c).editor, ed = typeof def === 'function' ? def() : def;
      if (!ed || typeof ed.open !== 'function') return;
      this._customEditor = ed; this._customCell = { r, c }; this.mode = 'edit';
      // openOnClick のエディタ（プルダウン同様）は開いている間もフィルハンドルを出す＝そのまま埋められる
      this._customKeepHandle = !!ed.openOnClick;
      if (this._customKeepHandle) this._placeOverlays(); else this.fillhandle.style.display = 'none';
      let done = false;
      const finish = () => { done = true; if (ed.close) { try { ed.close(); } catch (_) {} } this._customEditor = null; this._customCell = null; this._customKeepHandle = false; this.mode = 'nav'; };
      const commit = (val) => {
        if (done) return; finish();
        const before = this.snapSel(), changes = [];
        this.setCell(r, c, this._cellStr(val), changes);
        this.pushCmd(changes, before, this.snapSel(), 'edit');
        if (this.onEditEnd) { try { this.onEditEnd({ r, c, oldValue: this.data[r][c], newValue: this.data[r][c], canceled: false }); } catch (_) {} }
      };
      const cancel = () => { if (done) return; finish(); this.setActive(r, c); if (this.onEditEnd) { try { this.onEditEnd({ r, c, oldValue: this.data[r][c], newValue: this.data[r][c], canceled: true }); } catch (_) {} } };
      this._customCancel = cancel;
      try { ed.open({ grid: this, r, c, value: this.data[r][c], td: this.cellEl(r, c), commit, cancel }); } catch (_) { finish(); }
      if (this.onEditStart) { try { this.onEditStart({ r, c, value: this.data[r][c] }); } catch (_) {} }
    }
    _commitActive() {
      if (this._customEditor) { if (this._customCancel) this._customCancel(); return; }   // カスタム編集中の外側操作は取消
      if (this.select && this.select.style.display !== 'none') this._commitSelect();
      else this.commit();
    }
    // checkbox: ON/OFF をトグルして関所を通す
    _toggleCheckbox(r, c) {
      if (this._isReadOnly(r, c)) return;  // 読み取り専用はトグル不可
      const cur = this.data[r][c];
      const nv = this._isCheckedVal(c, cur) ? this._cbUnchecked(c) : this._cbChecked(c);
      const before = this.snapSel(), changes = [];
      this.setCell(r, c, nv, changes);
      this.pushCmd(changes, before, this.snapSel(), 'edit');
    }
    // dropdown: <select> を開く
    _openSelect() {
      const r = this.active.r, c = this.active.c, cfg = this.colCfg(c);
      if (this._isReadOnly(r, c)) return;  // 読み取り専用は <select> を開かない
      const opts = this._optList(c), values = opts.map(o => o.value), cur = this.data[r][c];
      const allowEmpty = cfg.allowEmpty !== false;   // 既定: クリア用の空オプションを先頭に付ける
      let html = allowEmpty ? '<option value=""></option>' : '';
      for (const o of opts) html += '<option value="' + TssGrid.esc(o.value) + '">' + TssGrid.esc(o.label) + '</option>';   // value↔label 分離
      this.select.innerHTML = html;
      this.select.value = values.includes(cur) ? cur : (allowEmpty ? '' : (values[0] || ''));   // 保存は value。空不可なら先頭候補
      this.mode = 'edit';
      this.place(this.select, this.activeTd());
      this.select.style.display = 'block'; this.select.focus();
      this.updateSelectionUI();  // ドロップダウンを開いてもフィルハンドルは出したまま
      // ネイティブの選択肢リストまで開く（.focus() だけでは開かない）。未対応/非ユーザー操作時は黙って無視。
      if (typeof this.select.showPicker === 'function') { try { this.select.showPicker(); } catch (_) {} }
      if (this.onEditStart) { try { this.onEditStart({ r, c, value: cur }); } catch (_) {} }
    }
    _commitSelect() {
      const r = this.active.r, c = this.active.c, oldValue = this.data[r][c], v = this.select.value;
      this.select.style.display = 'none'; this.mode = 'nav';
      const before = this.snapSel(), changes = [];
      this.setCell(r, c, v, changes);
      this.pushCmd(changes, before, this.snapSel(), 'edit');
      if (this.onEditEnd) { try { this.onEditEnd({ r, c, oldValue, newValue: this.data[r][c], canceled: false }); } catch (_) {} }
    }
    _cancelSelect() {
      const r = this.active.r, c = this.active.c, v = this.data[r][c];
      this.select.style.display = 'none';
      if (this.onEditEnd) { try { this.onEditEnd({ r, c, oldValue: v, newValue: v, canceled: true }); } catch (_) {} }
      this.setActive(r, c);
    }

    // 確定キーの移動。dir は enterMoves/tabMoves の値、reverse は Shift 押下。
    _moveBy(dir, reverse) {
      const D = { down: [1, 0], up: [-1, 0], right: [0, 1], left: [0, -1], none: [0, 0] };
      let [dr, dc] = D[dir] || D.down;
      if (reverse) { dr = -dr; dc = -dc; }
      let r = this.active.r, c = this.active.c;
      // navSkipReadOnly 時は readonly セルを飛ばして次の編集可能セルまで送る（伝票入力向け）。
      // OFF 時はループは1回で抜け＝従来挙動と完全同一（回帰ゼロ）。
      for (let g = 0, lim = this.ROWS * this.COLS + 2; g < lim; g++) {
        let nr = r, nc = c;
        if (dc !== 0) {   // 横移動は隠し列をスキップ＋結合幅を跨ぐ
          const stepc = this._stepColM(r, c, dc > 0 ? 1 : -1);
          if (stepc !== c) nc = stepc;
          else if (this.autoWrapRow) { nc = dc > 0 ? this._firstVisCol() : this._lastVisCol(); nr = r + (dc > 0 ? 1 : -1); }
        }
        if (dr !== 0) {
          nr = this._stepRowM(r, c, dr > 0 ? 1 : -1);   // 縦移動は結合高を跨ぐ
          if (this.autoWrapCol) {   // 縦の端で列送り（送り先も可視列）
            if (nr >= this.ROWS) { nr = 0; nc = this._stepVisCol(c, 1); }
            else if (nr < 0) { nr = this.ROWS - 1; nc = this._stepVisCol(c, -1); }
          }
        }
        if (nr === r && nc === c) break;                                       // 端で動かない＝終了
        r = nr; c = nc;
        if (r < 0 || r >= this.ROWS || c < 0 || c >= this.COLS) break;          // 範囲外＝setActive のクランプに委ねる
        if (!this.navSkipReadOnly || !this._isReadOnly(r, c)) break;            // skip無効 or readonly でない＝確定
      }
      this.setActive(r, c);
    }

    _onKey(e) {
      const composing = e.isComposing || e.keyCode === 229;
      // onBeforeKeyDown: グリッドより先にユーザーへ。false / preventDefault で既定を止める。
      if (this.onBeforeKeyDown) { let r; try { r = this.onBeforeKeyDown(e); } catch (_) {} if (r === false || e.defaultPrevented) return; }
      // カスタムショートカット（IME 変換中は除く）
      if (!composing && this._runShortcuts(e)) return;
      if (this.mode === 'edit') {
        if (composing) return;
        if (e.key === 'Enter') { e.preventDefault(); this.commit(); this._advance('enter', e.shiftKey); return; }
        if (e.key === 'Tab') { e.preventDefault(); this.commit(); this._advance('tab', e.shiftKey); return; }
        // Esc／編集中の Ctrl+Z ＝ この編集をキャンセルして元値に戻す（nav へ）。
        // input ベース編集では「打ち始め」時に元値が input に入らないためネイティブ undo では元値に戻せない。
        // ここで元値（this.data[r][c]＝未確定）に戻す＝Excel流。続けて Ctrl+Z すると nav の history.undo で前の確定操作へ連鎖。
        const ctrl = e.ctrlKey || e.metaKey;
        if (e.key === 'Escape' || (ctrl && !e.shiftKey && e.key.toLowerCase() === 'z')) {
          e.preventDefault();
          const r = this.active.r, c = this.active.c, v = this.data[r][c];
          if (this.onEditEnd) { try { this.onEditEnd({ r, c, oldValue: v, newValue: v, canceled: true }); } catch (_) {} }
          this.setActive(r, c); return;
        }
        return;
      }
      if (composing) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); this.history.undo(); return; }
      if (ctrl && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); this.history.redo(); return; }
      if (ctrl && e.key.toLowerCase() === 'c') { e.preventDefault(); this.copy(false); return; }
      if (ctrl && e.key.toLowerCase() === 'x') { e.preventDefault(); this.copy(true); return; }
      if (ctrl && e.key.toLowerCase() === 'v') { e.preventDefault(); this.paste(); return; }
      if (e.shiftKey && e.key.startsWith('Arrow')) {
        e.preventDefault();
        let { r, c } = this.extent;
        if (e.key === 'ArrowUp') r = this._stepRowM(r, c, -1); else if (e.key === 'ArrowDown') r = this._stepRowM(r, c, 1);
        else if (e.key === 'ArrowLeft') c = this._stepColM(r, c, -1); else c = this._stepColM(r, c, 1);  // 隠し列スキップ＋結合跨ぎ
        this.setExtent(r, c); return;
      }
      // Space: チェックボックス列ならトグル（テキスト列はそのまま入力に流す）
      if (e.key === ' ' && this.colType(this.active.c) === 'checkbox') { e.preventDefault(); this._toggleCheckbox(this.active.r, this.active.c); return; }
      switch (e.key) {
        case 'ArrowUp': e.preventDefault(); this.setActive(this._stepRowM(this.active.r, this.active.c, -1), this.active.c); return;
        case 'ArrowDown': e.preventDefault(); this.setActive(this._stepRowM(this.active.r, this.active.c, 1), this.active.c); return;
        case 'ArrowLeft': e.preventDefault(); this.setActive(this.active.r, this._stepColM(this.active.r, this.active.c, -1)); return;
        case 'ArrowRight': e.preventDefault(); this.setActive(this.active.r, this._stepColM(this.active.r, this.active.c, 1)); return;
        case 'Enter': e.preventDefault(); this._advance('enter', e.shiftKey); return;
        case 'Tab': e.preventDefault(); this._advance('tab', e.shiftKey); return;
        case 'F2': e.preventDefault(); this._beginEdit(this.active.r, this.active.c); return;
        case 'Delete': e.preventDefault(); this.clearRange(); return;
        case 'Backspace': e.preventDefault();
          if (this.colType(this.active.c) === 'text') this.toEdit('', true); else this.clearRange();
          return;
        case 'Escape': this.clearCopyMarquee(); return;
      }
    }
  }

  // ---- UMD export ----
  const api = { TssGrid, HistoryManager };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.TssGrid = TssGrid; root.HistoryManager = HistoryManager; }

})(typeof self !== 'undefined' ? self : this);
