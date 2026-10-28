// TssComment — セルの注釈（Excel のコメント/メモ風）。マーカー＋ホバー吹き出し＋編集。
// ★セルのフック（cellClass/cellStyle/editor/format）を奪わない＝他プラグイン・条件付き書式と共存。
// 永続化は持たず onCommentChange で通知するだけ（保存/読込はホストが持つ）。
import { TssGrid } from '../src/tssgrid';

export = TssComment;
export as namespace TssComment;

declare function TssComment(grid: TssGrid, opts?: TssComment.Options): TssComment.Controller;

declare namespace TssComment {
  /** 保存済み/初期コメント1件（永続化の単位）。 */
  interface CommentRecord {
    /** 行の安定ID（`rowId` が返す値）。 */
    id: string | number;
    /** 列の `data` キー。 */
    dataKey: string;
    text: string;
  }

  /** onCommentChange に渡る変更情報。 */
  interface ChangeInfo {
    id: string;
    dataKey: string;
    /** 変更時点の表示上の行・列インデックス（参考）。 */
    r: number;
    c: number;
    /** 削除時は ''。 */
    text: string;
    action: 'set' | 'delete';
  }

  interface Labels {
    add?: string;
    edit?: string;
    remove?: string;
    placeholder?: string;
    save?: string;
    del?: string;
    cancel?: string;
  }

  interface Options {
    /** 初期（保存済み）コメント。 */
    comments?: CommentRecord[];
    /**
     * 行の安定ID。ソート/フィルタ/行削除/再読込に追従させるため、行を一意に指す値を返す
     * （例: `(row) => row.detailId`）。省略時は行インデックス（＝並べ替えると位置基準になる）。
     * `row` は `grid.getRows()[r]`（オブジェクト）。
     */
    rowId?: (row: Record<string, unknown>, r: number) => string | number;
    /** コメントが変わるたびに呼ぶ（永続化はホストへ委譲）。 */
    onCommentChange?: (info: ChangeInfo) => void;
    /** そのセルにコメントして良いか（既定 true）。保存済み行のロック等に。 */
    canComment?: (r: number, c: number) => boolean;
    /** 閲覧専用（マーカー＋ホバー表示のみ・編集/削除・メニュー・Shift+F2 を出さない）。 */
    readOnly?: boolean;
    /** ボタン/メニューの文言。 */
    labels?: Labels;
    /** 吹き出し/編集ポップアップに付ける任意クラス。 */
    className?: string;
  }

  /** contextMenu に混ぜる項目（挿入/編集・削除）。 */
  interface MenuItem {
    name: string | ((arg: unknown) => string);
    key: string;
    disabled?: (arg: unknown) => boolean;
    callback?: (arg: unknown) => void;
  }

  interface Controller {
    /** セルにコメントを設定（空文字なら削除扱い）。 */
    set(r: number, c: number, text: string): void;
    /** セルのコメント文字列（無ければ null）。 */
    get(r: number, c: number): string | null;
    /** セルのコメントを削除。 */
    remove(r: number, c: number): void;
    /** 編集ポップアップを開く。 */
    open(r: number, c: number): void;
    /** 保存済み一覧（ホストの永続化・グリッド作り直し時の貼り直し用）。 */
    getAll(): CommentRecord[];
    /** グリッドの `contextMenu` に混ぜる項目（挿入/編集・削除）。readOnly では空配列。 */
    menuItems(): MenuItem[];
    /** マーカーを貼り直す。 */
    refresh(): void;
    /** observer / リスナ / ポップアップを解除。 */
    destroy(): void;
  }
}
