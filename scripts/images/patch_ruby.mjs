/**
 * 焼いた ふりがなの 1〜2字だけを 直す（絵には 触らない）。
 *
 * 使うのは **撮り直しを 2回 しても 同じ 字で 間違える とき**だけ（2026-09-25、
 * 連絡の まんが p13「10分」の ぷん が 4回 続けて ぶん に なった）。
 * 背景色は すぐ そばの 画素（sample）から とり、字は Hiragino Sans で 重ねる。
 *
 *   node scripts/images/patch_ruby.mjs <in.png> <out.png> '<ops JSON>'
 *   ops: [{x,y,w,h,sample:[x,y], text?, size?, weight?, tx?, ty?}]
 *   text を 省くと 消すだけ（余計な ふりがなを 消す）。
 */
import { chromium } from "playwright";
import fs from "node:fs";
const [src, dst, json] = process.argv.slice(2);
const ops = JSON.parse(json);
const browser = await chromium.launch();
const page = await browser.newPage();
const b64 = fs.readFileSync(src).toString("base64");
const out = await page.evaluate(
  async ({ b64, ops }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    for (const op of ops) {
      const [r, gg, b] = g.getImageData(op.sample[0], op.sample[1], 1, 1).data;
      g.fillStyle = `rgb(${r},${gg},${b})`;
      g.fillRect(op.x, op.y, op.w, op.h);
      if (op.text) {
        g.fillStyle = "#111";
        g.font = `${op.weight ?? 700} ${op.size}px "Hiragino Sans", sans-serif`;
        g.textBaseline = "alphabetic";
        g.fillText(op.text, op.tx, op.ty);
      }
    }
    return c.toDataURL("image/png").split(",")[1];
  },
  { b64, ops },
);
fs.writeFileSync(dst, Buffer.from(out, "base64"));
await browser.close();
