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
let pdfBytes;
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(`file://${absHtml}`, { waitUntil: "networkidle" });

  // Webフォントと画像が揃う前に印刷すると、豆腐や空白の絵で固まった PDF ができる。
  // fonts.ready と onload/onerror は「失敗しても解決する」ので、待つだけでは足りない——
  // 待ったあとに実在を確かめ、欠けていたら成功終了せずここで止める
  //（白抜け・豆腐の PDF が「wrote OK」で配布されるのが最悪の失敗のため）。
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    await Promise.all(
      [...document.images].map((img) =>
        img.complete ? null : new Promise((r) => ((img.onload = r), (img.onerror = r))),
      ),
    );
  });

  const fontOk = await page.evaluate(() => document.fonts.check('16px "M PLUS Rounded 1c"'));
  if (!fontOk) {
    console.error(
      "フォント M PLUS Rounded 1c が読み込めていない（ネットワーク？）。代替フォントのまま出さずに中止する。",
    );
    process.exit(1);
  }
  const broken = await page.evaluate(() =>
    [...document.images]
      .filter((img) => !img.complete || img.naturalWidth === 0)
      .map((img) => img.getAttribute("src")),
  );
  if (broken.length > 0) {
    console.error(`読み込めない画像がある: ${broken.join(", ")}`);
    process.exit(1);
  }

  /*
   * 使われなくなった絵の 置き去りを 知らせる（止めはしない）。
   *
   * スライドを 差し替えると 古い絵が img/ に 残る。PDF は 原稿からしか 組まれないので
   * 出力は 変わらず、**次の担当者が どちらが 現用か 分からなくなる**（org_now.jpg と
   * w08_orgnow.jpg のような 並びが できる）。2026-08-17 に 実際に 13枚 積もった
   * ——しかも squash merge の 3-way が 一度 消した 9枚を 黙って 生き返らせていた。
   */
  const used = new Set(
    await page.evaluate(() =>
      [...document.images].map((img) => (img.getAttribute("src") ?? "").split("/").pop() ?? ""),
    ),
  );
  const imgDir = path.join(path.dirname(absHtml), "img");
  if (fs.existsSync(imgDir)) {
    const orphans = fs.readdirSync(imgDir).filter((name) => !used.has(name));
    if (orphans.length > 0) {
      console.warn(`⚠ 原稿から 参照されていない 絵が ${orphans.length}枚: ${orphans.join(", ")}`);
    }
  }

  fs.mkdirSync(path.dirname(absPdf), { recursive: true });
  pdfBytes = await page.pdf({
    path: absPdf,
    width: "960px",
    height: "540px",
    printBackground: true,
  });
} finally {
  await browser.close();
}

console.log(`wrote ${pdfPath} (${(pdfBytes.length / 1024 / 1024).toFixed(2)} MB)`);

if (jsonPath) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(pdfBytes) }).promise;
  const expected = JSON.parse(fs.readFileSync(jsonPath, "utf8")).pageCount;
  if (doc.numPages !== expected) {
    console.error(`pageCount がずれています: PDF=${doc.numPages}枚 / JSON=${expected}枚`);
    process.exit(1);
  }
  console.log(`pageCount OK (${doc.numPages}枚)`);
}
