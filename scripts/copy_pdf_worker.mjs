#!/usr/bin/env node
/**
 * pdf.js の worker を public/ へ写す（npm install のあとに自動で走る）
 *
 * スライド教材（PDF）は**ブラウザの中で**描く。サーバで画像に変換する道は
 * 採っていない（Cloudflare Workers に変換の置き場が無い — schema.ts の slidesSchema）。
 * pdf.js は重い解析を worker に投げるので、その worker のファイルが
 * **同じサイトから配れる場所**に無いといけない。
 *
 * なぜ「バンドラに任せる」のではなく写すのか:
 *   `new URL("pdfjs-dist/…", import.meta.url)` と書けばバンドラが面倒を見てくれる、
 *   という書き方もある。ただし出来上がったURLが正しいかは**ブラウザで開くまで
 *   分からない**（ビルドは通るのに実行時だけ404になりうる）。ここは学習者が
 *   スライドを1枚も見られなくなる場所なので、置き場所を自分で決める。
 *
 * 写す先は .gitignore 済み（生成物をリポジトリに入れない）。npm ci のたびに作り直す。
 * 万一これが走らなくても pdf.js は worker 無しで描ける（遅くなるだけ）ので、
 * インストールそのものは止めない。
 */
import { copyFileSync, cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const PKG = join(ROOT, "node_modules", "pdfjs-dist");
/** 画面側（slide-deck.tsx）が読む場所。ここを変えるときは向こうも直す。 */
const PUBLIC = join(ROOT, "public", "pdfjs");

/**
 * legacy ビルドを使う。学習者の端末は新しいとは限らない
 *（カンボジアの教室の Android は数年前のものが混じる）。
 * legacy は古いブラウザ向けに変換ずみで、素のビルドより確実に動く。
 */
const WORKER = join(PKG, "legacy", "build", "pdf.worker.min.mjs");

/**
 * 本体（pdf.js そのもの）も写す。
 *
 * `import "pdfjs-dist"` と書いてバンドラに任せると、**サーバ側の束にも 500KB 入る**。
 * Cloudflare Workers に載せられるのは 圧縮して 3MB までで、サーバは canvas を
 * 描かないのだから まるごと むだ。ここに置いて、ブラウザが 開いたときだけ 取りに行く。
 */
const MAIN = join(PKG, "legacy", "build", "pdf.min.mjs");

/**
 * 日本語のスライドを 白いまま出さないための2つ。
 *
 * - cmaps … PDF が「この文字は書体のここ」という対応表を**自分の中に持たず**、
 *   名前で呼んでいるときに要る（日本語のPDFでよくある）。無いと本文が消える。
 * - standard_fonts … Helvetica のような「どのPDFにもあるはず」の書体の実体。
 *
 * どちらも pdf.js が**必要になった1ファイルだけ**取りに来るので、置いておいても
 * 学習者の通信は増えない。入れておかないと、崩れ方が「一部の資料だけ真っ白」に
 * なり、先生には原因がまったく見えない。
 */
const DATA_DIRS = ["cmaps", "standard_fonts"];

try {
  mkdirSync(dirname(join(PUBLIC, "x")), { recursive: true });
  copyFileSync(WORKER, join(PUBLIC, "pdf.worker.min.mjs"));
  copyFileSync(MAIN, join(PUBLIC, "pdf.min.mjs"));
  for (const dir of DATA_DIRS) {
    cpSync(join(PKG, dir), join(PUBLIC, dir), { recursive: true });
  }
} catch (e) {
  console.warn(
    `⚠ pdf.js の ファイルを 写せませんでした（${e.message}）。` +
      "スライドの 表示が 重く なったり、日本語が 出ない ことが あります。`npm ci` で 直ります。",
  );
}
