// =============================================================================
// TssGrid 型定義（公開APIの契約）
//   - これが「外から呼べるもの」の正本。エディタ補完にはここに宣言したものだけ出る
//     ＝内部メソッド（setCell / pushCmd / place など）は候補に出ず、自然に守られる。
//   - 低レベルだが公開しているメソッドは JSDoc に「通常は○○を推奨」と明記（逃げ道は塞がない）。
//   - v1 ドラフト。実装と差異を見つけたら本ファイルを正として揃える/直す。
//   - 使い方:
//       <script src="tssgrid.js"> 読み込み時 … グローバル TssGrid / HistoryManager に型が付く
//       import { TssGrid } from 'tssgrid' … ESM entry 整備後（§npm化）に有効
// =============================================================================

export type MoveDir = 'down' | 'up' | 'right' | 'left' | 'none';
export type CellType = 'text' | 'number' | 'date' | 'time' | 'dropdown' | 'checkbox';
export type ChangeSource = 'edit' | 'paste' | 'fill' | 'delete' | 'undo' | 'redo';

/** 1つの値変更（onBeforeChange / onAfterChange の配列要素）。newValue を書き換えると整形確定。 */
export interface ChangeItem {
  r: number;
  c: number;
  oldValue: any;
  newValue: any;
  source: ChangeSource;
}

/** 選択範囲。r0/c0=開始、r1/c1=終了（昇順とは限らない）。 */
export interface SelectionRange { r0: number; c0: number; r1: number; c1: number; }
export interface CellCoord { r: number; c: number; }
export interface SelectionInfo { range: SelectionRange; active: CellCoord; extent: CellCoord; }

/** validator が弾いたセル（onInvalid / getInvalidCells）。 */
export interface Rejection { r: number; c: number; value: any; code?: string; level?: string; message?: string; }
/** 読み取り専用セルへの変更を弾いた時（onReadOnly）。 */
export interface ReadOnlyBlock { r: number; c: number; value: any; }

/** 行/列の挿入・削除の情報（onStructureChange / onBeforeStructureChange）。 */
export interface StructureInfo { type: 'insertRow' | 'deleteRows' | 'insertCol' | 'deleteCols'; undo?: boolean; [k: string]: any; }

/** validator の戻り値: true=OK / 文字列=エラー文 / オブジェクト=メッセージカタログ解決用。 */
export type ValidatorResult = true | string | { code: string; params?: Record<string, any>; level?: string };

/** 列定義（options.columns[c]）。`data` は data オブジェクトのキー（または列 index）。 */
export interface ColumnDef {
  /** data オブジェクトのキー。配列データなら省略可（位置で対応）。 */
  data?: string | number;
  /** ヘッダ見出し（headers より優先）。 */
  title?: string;
  /** セルタイプ。既定 'text'。 */
  type?: CellType;
  /** dropdown の選択肢。 */
  options?: Array<string | { value: string; label?: string }>;
  /** 列ごとの初期幅(px)。列定義に同居＝並べ替え/コピペで幅が追従。 */
  width?: number;
  /** false でこの列だけリサイズ禁止。 */
  resizable?: boolean;
  /** 列既定の水平/垂直整列。 */
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  /** 列単位の読み取り専用。関数でセル単位判定も可。 */
  readOnly?: boolean | ((value: any, cell: CellCoord) => boolean);
  /** 入力検証。編集/貼付/フィルの全経路に効く。 */
  validator?: (value: any, cell: CellCoord) => ValidatorResult;
  /** カスタム編集UI（薄いオブジェクト契約 or それを返す関数）。 */
  editor?: object | (() => object);
  /** 入力の正規化（保存値へ変換）。 */
  parse?: (input: string, cell: CellCoord) => any;
  /** 表示の整形（保存値→表示）。文字列 or 宣言的 CellFormat。 */
  format?: string | object | ((value: any, cell: CellCoord) => string);
  /** 数値型: 千区切り表示。 */
  thousands?: boolean;
  /** 数値型: 接頭辞（例 '¥'）。 */
  prefix?: string;
  /** 値/行を見てセルに付与する CSS クラス（条件付き書式）。 */
  cellClass?: (r: number, c: number, value: any, row: any) => string;
  /** セル単位のインラインスタイル（連続色・データバー等）。 */
  cellStyle?: (r: number, c: number, value: any, row: any) => Partial<CSSStyleDeclaration> | Record<string, string>;
  /** true で表示だけ生HTML（値はテキスト保存のまま）。 */
  html?: boolean;
  /** 列単位の折り返し。 */
  wordWrap?: boolean;
  /** 空セルの薄いヒント文字。 */
  placeholder?: string;
  [k: string]: any;
}

/** new TssGrid(container, options) のオプション。 */
export interface TssGridOptions {
  headers?: string[];
  /** 初期データ。2次元配列 or オブジェクト配列。 */
  data?: any[][] | Record<string, any>[];
  /** 渡すと複数グリッドで Undo を共有。 */
  history?: HistoryManager;
  name?: string;
  showDump?: boolean;
  /** Enter 確定後の移動方向（既定 'down'）。Shift で逆。実行時に書換可。 */
  enterMoves?: MoveDir;
  /** Tab 確定後の移動方向（既定 'right'）。Shift で逆。実行時に書換可。 */
  tabMoves?: MoveDir;
  initialCell?: [number, number] | { r: number; c: number | string };
  /** 入力フロー制御。Enter/Tab の移動先を上書き（null で既定方向）。入力セルだけ巡回できる。 */
  nextCell?: (a: { r: number; c: number; key: string; shift: boolean }) => { r: number; c: number } | null;
  columns?: ColumnDef[];
  /** 検証NG時。'revert'=元に戻す / 'keep'=赤く警告して残す。 */
  invalidMode?: 'revert' | 'keep';
  invalidTitle?: boolean;
  /** エラーの共通メッセージカタログ。 */
  messages?: Record<string, any> | ((info: { code: string; params?: any; level?: string }) => string);
  pasteOverflow?: 'clip' | 'error';
  colWidths?: number[] | Record<string, number>;
  rowHeights?: number[] | Record<string, number>;
  defaultColWidth?: number;
  defaultRowHeight?: number;
  minColWidth?: number;
  minRowHeight?: number;
  resizeMode?: 'preview' | 'live';
  /** 左から固定する列数。freezeCols(n) でも変更可。 */
  frozenCols?: number;
  /** 上から固定する行数。freezeRows(n) でも変更可。frozenCols 併用で四隅固定。 */
  frozenRows?: number;
  /** ヘッダ結合（複数段見出し）。最下段がリーフ＝実列。 */
  nestedHeaders?: Array<Array<string | { label: string; colspan?: number }>>;
  width?: number | string;
  height?: number | string;
  resizeCols?: boolean;
  resizeRows?: boolean;
  /** false で選択カーソルを非表示（表示専用グリッド向け・内部選択は保持）。 */
  cursor?: boolean;
  stretchH?: 'none' | 'last' | 'all';
  rowHeaders?: boolean;
  colHeaders?: boolean;
  hiddenColumns?: number[];
  wordWrap?: boolean;
  placeholder?: string;
  className?: string;
  /** false でフィル完全OFF。詳細指定も可。 */
  fillHandle?: boolean | { direction?: 'vertical' | 'horizontal' | 'both'; autoInsertRow?: boolean };
  autoColumnSize?: boolean | number;
  copyPaste?: boolean;
  minSpareRows?: number;
  autoWrapRow?: boolean;
  autoWrapCol?: boolean;
  minRows?: number;
  maxRows?: number;
  minCols?: number;
  maxCols?: number;
  /** グリッド全体を読み取り専用（ビューア用途）。 */
  readOnly?: boolean;
  contextMenu?: boolean | any[] | { items: any[] };
  allowInsertRows?: boolean;
  allowDeleteRows?: boolean;
  allowInsertCols?: boolean;
  allowDeleteCols?: boolean;
  shortcuts?: any[];
  /** プラグイン（関数 or 登録名）。init(grid) で初期化。 */
  plugins?: any[];

  // ---- イベント / コールバック -------------------------------------------
  /** 確定の直前。検証・自動整形。false で全取消、change.newValue 書換で整形。 */
  onBeforeChange?: (changes: ChangeItem[], source: ChangeSource) => boolean | void;
  /** 確定の直後（undo/redo 含む）。保存・再計算に。 */
  onAfterChange?: (changes: ChangeItem[], source: ChangeSource) => void;
  onEditStart?: (info: { r: number; c: number; value: any }) => void;
  onEditEnd?: (info: { r: number; c: number; oldValue: any; newValue: any; canceled: boolean }) => void;
  onSelectionChange?: (info: SelectionInfo) => void;
  onBeforeSelectionChange?: (info: SelectionInfo) => boolean | void;
  onBeforePaste?: (data: string[][]) => boolean | string[][] | void;
  onAfterPaste?: (data: string[][], info: { range: SelectionRange }) => void;
  onBeforeCopy?: (data: string[][], info: { range: SelectionRange }) => boolean | string[][] | void;
  onBeforeCut?: (data: string[][], info: { range: SelectionRange }) => boolean | string[][] | void;
  onAfterCopy?: (data: string[][], info: { range: SelectionRange; cut: boolean }) => void;
  onBeforeStructureChange?: (info: StructureInfo) => boolean | void;
  onStructureChange?: (info: StructureInfo) => void;
  onBeforeAutofill?: (src: SelectionRange, target: SelectionRange) => boolean | void;
  onAfterAutofill?: (src: SelectionRange, target: SelectionRange) => void;
  onBeforeKeyDown?: (e: KeyboardEvent) => boolean | void;
  onHeaderClick?: (c: number, e: MouseEvent) => boolean | void;
  onInvalid?: (rejections: Rejection[], source: ChangeSource) => void;
  onReadOnly?: (blocked: ReadOnlyBlock[], source: ChangeSource) => void;
  onChange?: (grid: TssGrid) => void;
  onPasteOverflow?: (info: { anchor: CellCoord; height: number; width: number; rows: number; cols: number; overRows: number; overCols: number }) => void;

  [k: string]: any;
}

export interface CsvOptions { formatted?: boolean; delimiter?: string; [k: string]: any; }

/** Undo/Redo 履歴。複数グリッドで共有すると Undo タイムラインが繋がる。 */
export declare class HistoryManager {
  constructor(max?: number);
  onChange: ((h: HistoryManager) => void) | null;
  push(cmd: { apply: () => void; revert: () => void }): void;
  undo(): void;
  redo(): void;
  clear(): void;
  canUndo(): boolean;
  canRedo(): boolean;
}

/**
 * 軽量・ノービルド・日本語IME堅牢な編集グリッド。
 * @example
 * const grid = new TssGrid(document.getElementById('app'), {
 *   columns: [{ data: 'name', title: '品名' }, { data: 'qty', title: '数量', type: 'number' }],
 *   data: [{ name: 'りんご', qty: 12 }],
 * });
 */
export declare class TssGrid {
  constructor(container: HTMLElement, options?: TssGridOptions);

  /** 行数 / 列数（読み取り）。 */
  readonly ROWS: number;
  readonly COLS: number;
  /** 列定義（実行時参照）。 */
  columns: ColumnDef[];
  /** 履歴マネージャ。 */
  history: HistoryManager;
  /** Enter/Tab 確定後の移動方向（代入で即反映）。 */
  enterMoves: MoveDir;
  tabMoves: MoveDir;

  // ---- データ -------------------------------------------------------------
  /** 全データを2次元配列で取得（コピー）。 */
  getData(): any[][];
  /** 全行をオブジェクト配列で取得（columns[c].data キー基準）。 */
  getRows(): Record<string, any>[];
  /** r 行目をオブジェクトで取得。 */
  getRow(r: number): Record<string, any>;
  /** 列を縦に取得（index か data キー）。 */
  getColumn(cOrKey: number | string): any[] | undefined;
  /** 全列を配列の配列で取得。 */
  getColumns(): any[][];
  /** 1セルの値を取得（c は index か data キー）。 */
  getValue(r: number, cOrKey: number | string): any;
  /** データを差し替え（履歴・フィルタ・整列状態はリセット）。 */
  setData(rows: any[][] | Record<string, any>[]): void;
  /** 1セルに書き込み（履歴あり・検証/onBeforeChange 経由）。force=true で readOnly 貫通。 */
  setValue(r: number, cOrKey: number | string, val: any, force?: boolean): void;
  /** 履歴に積まず・検証も通さず直接書き込み（計算列など派生値用。readOnly 貫通）。 */
  setValueRaw(r: number, cOrKey: number | string, val: any): void;

  // ---- 並べ替え / フィルタ -------------------------------------------------
  /** 列で並べ替え（c は index か data キー）。 */
  sortBy(cOrKey: number | string, dir?: 'asc' | 'desc'): void;
  /** 比較関数で並べ替え。 */
  sortRows(cmp: (a: any[], b: any[]) => number): void;
  /** 並べ替え解除（入力順に戻す）。 */
  clearSort(): void;
  isSorted(): boolean;
  /** 非破壊フィルタ。pred(row, masterIndex, src)=>boolean、または { col: 値|fn }。 */
  filter(pred: ((row: any[], masterIndex: number, src: any) => boolean) | Record<string, any>): void;
  /** フィルタ解除（フィルタ中に編集/追加した行も含め全部戻る）。 */
  clearFilter(): void;
  isFiltered(): boolean;
  /** フィルタ中でも全行（マスタ）を取得。 */
  getAllRows(): Record<string, any>[];

  // ---- 選択 / カーソル ----------------------------------------------------
  setActive(r: number, c: number): void;
  setExtent(r: number, c: number): void;
  selectRect(r0: number, c0: number, r1: number, c1: number): void;
  selectRow(r: number): void;
  selectCol(c: number): void;
  selectAll(): void;

  // ---- 行 / 列 構造 -------------------------------------------------------
  insertRow(ri: number, where?: 'above' | 'below'): void;
  deleteRows(r0: number, r1?: number): void;
  insertCol(ci: number, where?: 'left' | 'right'): void;
  deleteCols(c0: number, c1?: number): void;
  /** 1行を移動（Undo 対応）。 */
  moveRow(from: number, to: number): void;
  /** 複数行をまとめて移動（Undo 対応）。 */
  moveRows(r0: number, r1: number, to: number): void;

  // ---- 列の表示 / 幅 / 固定 / 行高 ---------------------------------------
  hideColumn(c: number): void;
  showColumn(c: number): void;
  toggleColumn(c: number): void;
  isColumnHidden(c: number): boolean;
  getHiddenColumns(): number[];
  setColWidth(c: number, px: number): void;
  autoSizeColumn(c: number): void;
  autoSizeAllColumns(): void;
  freezeCols(n: number): void;
  freezeRows(n: number): void;
  setRowHeight(r: number, px: number): void;

  // ---- セル状態 / 検証 ----------------------------------------------------
  setAlignment(align: string, range?: SelectionRange): void;
  getAlignment(r: number, c: number): string;
  setCellReadOnly(flag: boolean, range?: SelectionRange): void;
  /** 今の全セルを検証し、NG を一覧で返す（保存前チェック等）。 */
  getInvalidCells(): Rejection[];

  // ---- 出力 / 再描画 / 破棄 ----------------------------------------------
  toCSV(opts?: CsvOptions): string;
  downloadCSV(filename: string, opts?: CsvOptions): void;
  /** 列定義変更後などの再描画（データ・選択は保持）。 */
  redraw(): void;
  /** 画像/フォント等の遅延レイアウト後に幾何キャッシュを再構築する保険。 */
  refreshGeometry(): void;
  /** グリッドを破棄（リスナ除去・DOM 撤去・idempotent）。フレームワークの teardown で呼ぶ。 */
  destroy(): void;

  // ---- 拡張 ---------------------------------------------------------------
  addShortcut(s: { name: string; keys: string; handler: (grid: TssGrid, e: KeyboardEvent) => void }): void;
  removeShortcut(name: string): void;
  usePlugin(plugin: ((grid: TssGrid, opts?: any) => any) | string, opts?: any): any;
  getPlugin(name: string): any;

  // ---- 低レベル（公開はするが通常は上位APIを推奨） -----------------------
  /** 選択範囲（または range）をクリア。※通常は値消去なら setValue('') を推奨。一括の低レベル手段。 */
  clearRange(): void;
  /** 選択範囲をクリップボードへ。cut=true で切り取り。 */
  copy(cut?: boolean): void;
  /** テーブルDOMを再構築（低レベル）。※通常は redraw() を推奨。主にプラグイン拡張者向け。 */
  buildTable(): void;
  /** セルの DOM 要素を返す（低レベル・内部DOM構造に依存）。結合セルはアンカーに解決。 */
  cellEl(r: number, c: number): HTMLTableCellElement | null;

  [k: string]: any;
}

// グローバル（<script> 読み込み時の window.TssGrid / window.HistoryManager）にも型を付ける。
declare global {
  interface Window {
    TssGrid: typeof TssGrid;
    HistoryManager: typeof HistoryManager;
  }
}
