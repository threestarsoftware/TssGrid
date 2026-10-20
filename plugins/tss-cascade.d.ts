// TssCascade — 多段（フライアウト）プルダウン（TssGrid カスタムエディタ・ポップアップ型）。
import { EditorDef } from '../src/tssgrid';

export = TssCascade;
export as namespace TssCascade;

declare function TssCascade(opts: TssCascade.Options): EditorDef;

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
    /** ポップアップに付ける任意クラス。 */
    className?: string;
  }

  /** 列 format 用: 値 → 「大 / 中 / 小」のパス文字列を返す関数。 */
  function pathFormat(options: Node[], opts?: { separator?: string }): (value: any) => string;
  /** 値 → パス文字列（単発）。 */
  function pathOf(options: Node[], value: any, separator?: string): string;
}
