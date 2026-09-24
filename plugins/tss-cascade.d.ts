// TssCascade — 多段（フライアウト）プルダウン（TssGrid カスタムエディタ・ポップアップ型）。
import { EditorDef } from '../src/tssgrid';

export = TssCascade;
export as namespace TssCascade;

declare function TssCascade(opts: TssCascade.Options): EditorDef;

declare namespace TssCascade {
  /** ノード。枝は `children`、葉は `value`（未指定なら `label` を保存）。 */
  interface Node { label: string; value?: string | number; children?: Node[]; }

  interface Options {
    /** 入れ子の選択肢。 */
    options: Node[];
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
