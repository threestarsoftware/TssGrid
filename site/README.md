# TssGrid サイト（ノービルド静的サイト）

`site/` 一式で完結する **ビルド不要の静的サイト**です。ローカルでは `index.html` をブラウザで開くだけで確認できます（一部ブラウザは `file://` だと制限があるので、後述の簡易サーバ推奨）。

```
site/
├ index.html              … トップ（LP＋ライブデモ）
├ docs.html               … ガイド（README.md を fetch して整形表示。正本=README）
├ api.html                … APIリファレンス（src/tssgrid.d.ts から自動生成。正本=.d.ts）
├ favicon.svg / .png      … サイトアイコン（T ロゴ。svg を png に書き出したもの）
├ CNAME                   … 公開サブドメイン（要編集）
├ assets/
│  ├ site.css             … サイト共通デザイン
│  ├ site.js              … モバイルナビ・年号・コピーボタン
│  └ lib/                 … ライブデモ用の TssGrid 一式（スナップショット）
│     ├ tssgrid.js / tssgrid.css
│     ├ tss-merge.js
│     └ tss-calendar.js / .css
├ demos/                  … 目玉サンプルのライブ版（examples/ からの複製・スナップショット）
│  ├ gantt.html           … 方眼ガント（コアのみ）
│  └ inventory.html       … 在庫管理アプリ（コア＋tss-calendar）
└ articles/
   ├ index.html           … 記事一覧
   ├ _template.html       … 記事の雛形（コピーして使う）
   └ cell-merge-3libs.html… 記事サンプル
```

> **`demos/` はスナップショット（二重管理に注意）**: Pages は `site/` 配信のため、`examples/*.html`（`../src/` 参照）はそのままではサイト上でライブにならない。そこで目玉だけ `site/demos/` に複製し、資産パスを `../assets/lib/` に向け、さらに**「← TssGrid」戻るバー**を注入してある（単独で開いてもサイトへ戻れるように）。**元の `examples/` や `src/`・`plugins/` を更新したら、作り直す**:
> ```
> node scripts/build-site-demos.mjs
> ```
> どのデモを出すか・必要プラグインは同スクリプト上部の `DEMOS` 配列で管理（新しい目玉を足すのも1行）。なお `src/tssgrid.js`・`.css` 自体の更新時は `site/assets/lib/` のコアも別途コピーが要る。公開後に CDN（jsDelivr）参照へ切り替えれば、この二重管理は解消できる（下記）。

> **`api.html` は `src/tssgrid.d.ts` から自動生成**（引く用のAPIリファレンス・正本は .d.ts なのでドリフトしない）。**.d.ts を更新したら作り直す**:
> ```
> npm i --no-save typescript && node scripts/build-api-docs.mjs && rm -rf node_modules
> ```
> 一方 `docs.html`（ガイド）は実行時に `README.md` を fetch して整形するだけ（生成不要・README が更新されれば自動で最新）。サイトは **ガイド(docs)｜API(api)** の2本立て。

## 記事を追加する手順
1. `articles/_template.html` を複製して `articles/<好きな名前>.html` にする。
2. 先頭の `<title>` / `<meta description>` と、`<header class="art-head">` のタイトル・日付・カテゴリを書き換える。あわせて **OGP/Twitter ブロックの `FILE`（自分のファイル名）・`og:title`/`og:description`（タイトル・概要を揃える）** も差し替える（SNS カード・検索用。画像は共通の `assets/og.png` のままでOK）。
3. `<div class="prose">` の中に本文を書く（見出し・コード・表・callout の見本が入っているので、要らないものは消す）。
4. `articles/index.html` と トップの「記事」欄に、1行リンク（`<a class="post-row">…`）をコピーして追記。

記事内で TssGrid を実際に動かしたいときは、雛形末尾の `<script>` を残して `#article-demo` を使う。

## ローカル確認（簡易サーバ）
`file://` だと一部動かないことがあるので、`site/` 直下で：
```
python -m http.server 8080      # → http://localhost:8080/
```

## GitHub Pages で公開（GitHub Actions 方式）
GitHub Pages の「Deploy from a branch」はフォルダを `/(root)` か `/docs` しか選べず、**`/site` は選べない**。
そこで本リポは **GitHub Actions** で `site/` フォルダだけを配信する（`.github/workflows/deploy-pages.yml`）。

1. リポジトリの **Settings → Pages → Source** を「**GitHub Actions**」にする。
2. これで `main` への push のたびに、ワークフローが `site/` を Pages へデプロイする（手動実行は Actions タブ → Run workflow）。
3. **独立サブドメイン**にする場合：
   - `site/CNAME` に使うサブドメイン（例: `tssgrid.threestarsoftware.co.jp`）を1行で書く（成果物に含まれ Pages が拾う）。
   - DNS 側に **CNAME レコード**を1本追加：`tssgrid` → `<ユーザー名>.github.io`（Apex でなくサブドメインなので CNAME でOK）。
   - Pages 設定の Custom domain に同じ値が入る／Enforce HTTPS を待つ。

> Cloudflare Pages / Netlify を使う場合は、公開ディレクトリに `site` を指定するだけ（ブランチ配信のフォルダ制限が無いので Actions すら不要）。どれも無料枠で足ります。

## `assets/lib/` の更新について
ライブデモ用にコア/プラグインを**コピー（スナップショット）**しています。本体を更新したら、ここも更新するか、
公開後は **CDN（jsDelivr 等）参照**に切り替えると二重管理が消えます。その際は
**SRI（`integrity`）＋ `crossorigin`** を付けて CDN 改ざんに備えます（本プロジェクトの chart-chartjs と同じ運用）：
```html
<script src="https://cdn.jsdelivr.net/gh/threestarsoftware/TssGrid@vX.Y.Z/src/tssgrid.js"
        integrity="sha384-…（リリース時に生成したハッシュ）"
        crossorigin="anonymous"></script>
```
ハッシュは `openssl dgst -sha384 -binary tssgrid.js | openssl base64 -A` で生成。
