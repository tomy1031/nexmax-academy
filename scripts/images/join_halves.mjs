/**
 * 縦長の 絵 2枚を、同じ 高さに 縮めて 左右に 並べ、1枚の 横長の 絵に する。
 *
 * 語の 多い 図（「ウォーターフォールと アジャイル」）は 1枚で 描かせると 字・読み・矢印が
 * 毎回 どこかで 崩れた ので、左右を 別々に 作って ここで つなぐ（台帳
 * `scripts/images/kaihatsu_waterfall_agile.json`）。あいだに 細い クリーム色の すきまを 置く。
 *
 *   node scripts/images/join_halves.mjs <左.png> <右.png> <出力.png> [高さ=1024] [すきま=16]
 */
import fs from "node:fs";
import { chromium } from "playwright";

const [left, right, dst, heightArg, gapArg] = process.argv.slice(2);
if (!left || !right || !dst) {
  console.error(
    "usage: node scripts/images/join_halves.mjs <左.png> <右.png> <出力.png> [高さ] [すきま]",
  );
  process.exit(1);
}
const height = Number(heightArg ?? 1024);
const gap = Number(gapArg ?? 16);

const browser = await chromium.launch(
  process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : {},
);
const page = await browser.newPage();
const out = await page.evaluate(
  async ({ a, b, height, gap }) => {
    const load = async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      return img;
    };
    const [l, r] = [await load(a), await load(b)];
    const lw = Math.round((l.width * height) / l.height);
    const rw = Math.round((r.width * height) / r.height);
    const c = document.createElement("canvas");
    c.width = lw + gap + rw;
    c.height = height;
    const g = c.getContext("2d");
    g.imageSmoothingQuality = "high";
    g.fillStyle = "#fbf6ea";
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(l, 0, 0, lw, height);
    g.drawImage(r, lw + gap, 0, rw, height);
    return c.toDataURL("image/png").split(",")[1];
  },
  {
    a: fs.readFileSync(left).toString("base64"),
    b: fs.readFileSync(right).toString("base64"),
    height,
    gap,
  },
);
fs.writeFileSync(dst, Buffer.from(out, "base64"));
await browser.close();
console.log(dst);
