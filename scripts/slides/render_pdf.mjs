/**
 * スライド原稿（HTML）を PDF に印刷する。
 *
 * 使い方:
 *   node scripts/slides/render_pdf.mjs <原稿.html> <出力.pdf> [<教材.json>]
 *   例: node scripts/slides/render_pdf.mjs scripts/slides/ai_jidai/index.html \
 *         public/slides/ai-jidai.pdf content/slides/ai_jidai.json
 *
 * なぜこの形か:
 * - `kind: "slides"` は PDF 専用（src/content/schema.ts の設計コメント参照）。
 *   前例 intro-mirai.pdf も HeadlessChrome(Skia) の HTML→PDF 印刷で作られており、
 *   同じ系譜に乗せる（960×540・16:9）。
 * - ふりがなは PDF の中ではトグルできないので、原稿側で <ruby> を直書きする。
 *   フォントは Chromium がサブセット埋め込みするため、配布物は自己完結する。
 * - 教材 JSON を渡すと、印刷後に pdfjs で実ページ数を読み、`pageCount` と
 *   突き合わせる。ずれていたら非0で終了する（枚数ずれはアプリのしおり・
 *   「n まい」表示を静かに壊すため、ここで止める）。
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const [htmlPath, pdfPath, jsonPath] = process.argv.slice(2);
if (!htmlPath || !pdfPath) {
  console.error("usage: node scripts/slides/render_pdf.mjs <原稿.html> <出力.pdf> [<教材.json>]");
  process.exit(1);
}

const absHtml = path.resolve(htmlPath);
const absPdf = path.resolve(pdfPath);

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(`file://${absHtml}`, { waitUntil: "networkidle" });

  // Webフォントと画像が揃う前に印刷すると、豆腐や空白の絵で固まった PDF ができる
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    await Promise.all(
      [...document.images].map((img) =>
        img.complete ? null : new Promise((r) => ((img.onload = r), (img.onerror = r))),
      ),
    );
  });

  fs.mkdirSync(path.dirname(absPdf), { recursive: true });
  await page.pdf({ path: absPdf, width: "960px", height: "540px", printBackground: true });
} finally {
  await browser.close();
}

const bytes = fs.statSync(absPdf).size;
console.log(`wrote ${pdfPath} (${(bytes / 1024 / 1024).toFixed(2)} MB)`);

if (jsonPath) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(absPdf)) }).promise;
  const expected = JSON.parse(fs.readFileSync(jsonPath, "utf8")).pageCount;
  if (doc.numPages !== expected) {
    console.error(`pageCount がずれています: PDF=${doc.numPages}枚 / JSON=${expected}枚`);
    process.exit(1);
  }
  console.log(`pageCount OK (${doc.numPages}枚)`);
}
