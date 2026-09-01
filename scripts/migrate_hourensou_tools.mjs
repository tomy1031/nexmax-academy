#!/usr/bin/env node
/**
 * 旧アプリの「1枚で完結する練習ページ」を public/tools/hourensou/ へ写す
 *
 * 対象は Slack風の練習・連絡文の練習・調べ学習の3枚。どれも **リンク教材**
 *（`content/links/*.json` → `LinkView` が iframe で開く）の行き先になる。
 *
 * ## なぜ丸ごと写すのか（作り直さない）
 * 中身は先生が作った練習そのもので、教材としての価値はそこにある。
 * article や quizset に作り替えると、Slackの画面らしさ（サイドバー・
 * スタンプ・下書き欄）が消えて別物になる。**見た目ごと残す**のが目的なので、
 * ファイルはそのまま持ってきて、行き先だけを直す。
 *
 * ## 直すのは4つだけ
 *  1. 相対パス（`../../styles.css` → 同じフォルダ）
 *  2. 旧サイトのヘッダ・フッタ（枠の中に別サイトのナビが出てしまう）
 *  3. **パスワードの関門**（2026-08-29 の指定「パスワードで開く仕組みはなし」）
 *  4. 旧サイトへ出ていくナビカード（この枠の中では行き先が無い）
 *
 * 実行: node scripts/migrate_hourensou_tools.mjs [旧アプリのパス]
 * 一度きりの移植なので、CI では回さない（結果はコミット済み）。
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OLD = process.argv[2] ?? join(import.meta.dirname, "..", "..", "nextmake_onbording");
const OUT = join(import.meta.dirname, "..", "public", "tools", "hourensou");

/** 旧サイトのヘッダ・フッタを描く呼び出し（枠の中では出さない）。 */
const CHROME_CALLS = /^\s*render(?:Header|Footer)\([^)]*\);\s*$/gm;

/** 旧サイトへ出ていくナビカードの塊。 */
const NAV_CARDS =
  /\s*<!--\s*Nav(?:igation)?\s*Cards?[^>]*-->[\s\S]*?<div class="nav-cards">[\s\S]*?<\/div>\s*<\/div>/g;

/** ページごとの追加の直し。 */
const EXTRA = {
  /*
   * 調べ学習は「次のページへ」がパスワードで閉じていた。関門そのものを外し、
   * 中の階級の話は 報告の よみもの に移したので、この枠には行き先を置かない。
   */
  houkoku_search: (html) =>
    html
      // 旧サイトのナビバー（ドロップダウンごと）
      .replace(/\s*<!--\s*Navigation\s*-->\s*<nav class="navbar">[\s\S]*?<\/nav>/, "")
      .replace(/\s*<!--\s*Footer\s*-->\s*<footer class="footer">[\s\S]*?<\/footer>/, "")
      /*
       * パスワードの関門ごと（開いた先のリンクも旧サイト内なので一緒に落とす）。
       * **囲みの `</section>` は残す**——関門の塊は 節の途中にあり、節の閉じまで
       * 一緒に消すと 開いたままの `<section>` が 残る（実際に そうなった）。
       */
      .replace(/\s*<!--\s*Password Protected Navigation\s*-->[\s\S]*?(<\/section>)/, "\n        $1")
      .replace(/\s*<!--\s*Script for Auto-Unlock\s*-->[\s\S]*?<\/script>/, "")
      .replace(/\s*<!--\s*Navigation \(Back\)\s*-->[\s\S]*?<\/section>/, ""),
};

const PAGES = [
  {
    id: "renraku_slack",
    from: "lecture/renraku/slack.html",
    note: "Slack風の 練習（Renraku Master）。外の CDN だけで 動くので 手を 入れない",
  },
  { id: "renraku_contact", from: "listening/renraku/contact.html" },
  { id: "houkoku_search", from: "listening/houkoku/search.html" },
];

mkdirSync(OUT, { recursive: true });

// 共有の見た目と部品。旧アプリの中では 2つ上に あったものを 同じフォルダへ 置く。
for (const shared of ["styles.css", "app.js"]) {
  copyFileSync(join(OLD, shared), join(OUT, shared));
}

for (const page of PAGES) {
  let html = readFileSync(join(OLD, page.from), "utf8");

  html = html
    .replace(/\.\.\/\.\.\/styles\.css/g, "styles.css")
    .replace(/\.\.\/\.\.\/app\.js/g, "app.js")
    // アイコンは アプリ本体が 出す（枠の中の ページには 要らない）
    .replace(/\s*<link rel="icon"[^>]*>/g, "")
    .replace(CHROME_CALLS, "")
    .replace(NAV_CARDS, "");

  html = (EXTRA[page.id] ?? ((x) => x))(html);

  writeFileSync(join(OUT, `${page.id}.html`), html);
  console.log(`${page.id}.html  ${html.length} bytes`);
}
