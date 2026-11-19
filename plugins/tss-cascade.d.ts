// TssCascade — 多段（フライアウト）プルダウン（TssGrid カスタムエディタ・ポップアップ型）。
import { EditorDef } from '../src/tssgrid';

export = TssCascade;
export as namespace TssCascade;

declare function TssCascade(opts: TssCascade.Options): TssCascade.Editor;

declare namespace TssCascade {
  /** ノード。枝は `children`、葉は `value`（未指定なら `label` を保存）。
   *  `other:true` の葉は「その他」＝選ぶと入力欄に切替わり、打った文字を値に確定する。
   *  その時 codeField へ書くコードは、その「その他」ノード自身の `value`（枝ごとに変えられる）。 */
  interface Node { label: string; value?: string | number; children?: Node[]; other?: boolean; }

  interface Options {
    /** 入れ子の選択肢。 */
    options: Node[];
    /** コードの書き戻し先の列（data キー or 列 index）。
     *  指定時: 値セル＝普通の葉はパス「大 / 中 / 小」・その他は打った文字／codeField＝葉(その他ノード)の value。
     *  省略時: 葉の value を値セルに保存（従来・表示は pathFormat）。 */
    codeField?: string | number;
    /** 値セルに入れるパスの区切り（既定 ' / '）。pathFormat の separator と揃えると良い。 */
    separator?: string;
    /** 「その他」入力欄のプレースホルダ（既定 '自由入力'）。 */
    otherPlaceholder?: string;
    /** シングルクリックで開く（既定 true）。 */
    openOnClick?: boolean;
    /** セル右の目印（既定 '▾'／'' で消す）。 */
    icon?: string;
    /** ポップアップに付ける任意クラス。 */
    className?: string;
    /** 表示の仕方。'auto'（既定）＝指で操作する幅600px未満の画面（スマホ）は 'drill'、ほかは 'flyout'。
     *  'flyout'＝右へ横に開く（PC）／'drill'＝1枚の中で段を入れ替え、上の「‹ 親」で戻る（スマホ）。 */
    layout?: 'auto' | 'flyout' | 'drill';
  }

  /** openAt で選んだ結果。value＝値セルに入れるのと同じもの（codeField あり＝パス「有給 / 私用」かその他の文字／なし＝葉の value）。
   *  code＝葉（その他ノード）の value。other＝「その他」で入れたか。 */
  interface PickResult { value: string; code: string | number; other: boolean; }

  /** グリッドの `editor` として使えるほか、表の外（スマホのカード入力など）から単体で `openAt` を呼べる。 */
  interface Editor extends EditorDef {
    /** 欄の要素の下（入らなければ上）に開く。current＝今の値（文字）か { value, code }（codeField を使う定義なら code も）。
     *  今の選択の所にカーソル・「その他」は前の文字を入れて開く。スクロール・キーボードに付いていき、欄が画面から外れる／外側を押すと閉じて `onCancel`。 */
    openAt(anchorEl: Element, current: string | { value?: string; code?: string | number | null }, onPick: (r: PickResult) => void, onCancel?: () => void): void;
  }

  /** 列 format 用: 値 → 「大 / 中 / 小」のパス文字列を返す関数。 */
  function pathFormat(options: Node[], opts?: { separator?: string }): (value: any) => string;
  /** 値 → パス文字列（単発）。 */
  function pathOf(options: Node[], value: any, separator?: string): string;
}
