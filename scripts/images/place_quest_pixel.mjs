/**
 * クエストの ドット絵を「本物の ドット絵」に 直して `public/img/quest/` に 置く。
 *
 *   node scripts/images/place_quest_pixel.mjs <生成した PNG の フォルダ>
 *   （フォルダの 中に sprites/ と bg/ が ある。指示書は scripts/images/quest_pixel_*.json）
 *
 * ## なぜ 直すのか
 * Codex の「ドット絵」は 1024px の 絵の 上に ドットを 描いた もので、1ドットの 大きさが
 * そろって いない・ふちが にじむ・1枚 1MB を 超える。そのまま 拡大すると ぼやけ、
 * 教室の 回線にも 重い。だから **升目ごとに 中央の 色を とって**、背景は 横256、
 * 人物は 128 ほどの 小さな PNG に 直す（1枚 2〜25KB）。画面では image-rendering: pixelated で
 * 拡大する（`quest-styles.ts`）。
 *
 * ## 升目の 取りかた
 * 升目の **中央 50% だけ**を 見て、その 中央値を その ドットの 色に する——ふちの にじみを
 * 拾わない。人物は マゼンタ（#FF00FF）か 透明の 背景を 抜く（升目の 半分 以上が 背景なら 透明）。
 * 最後に 色数を しぼる（ディザ なし）。
 *
 * 2026-10-20 に ウォーターフォールクエストの ドット絵化（tomy さんの 指定）で 作った。
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const [rawDir] = process.argv.slice(2);
if (!rawDir) {
  console.error("usage: node scripts/images/place_quest_pixel.mjs <生成した PNG の フォルダ>");
  process.exit(1);
}
const OUT = path.join(process.cwd(), "public", "img", "quest");

/** 升目ごとに 中央の 色を とって w×h の 小さな 絵に する。 */
async function pixelize(inPath, w, h, { key = false, colours = 64 } = {}) {
  const { data, info } = await sharp(inPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const isMagenta = (r, g, b) => r > 170 && b > 170 && g < 110 && Math.abs(r - b) < 80;
  const out = Buffer.alloc(w * h * 4);
  const cw = info.width / w;
  const ch = info.height / h;
  const median = (arr) => arr.sort((a, b) => a - b)[arr.length >> 1];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const x0 = Math.floor((x + 0.25) * cw);
      const x1 = Math.max(x0 + 1, Math.floor((x + 0.75) * cw));
      const y0 = Math.floor((y + 0.25) * ch);
      const y1 = Math.max(y0 + 1, Math.floor((y + 0.75) * ch));
      const R = [];
      const G = [];
      const B = [];
      let bg = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy += 1) {
        for (let xx = x0; xx < x1; xx += 1) {
          const i = (yy * info.width + xx) * 4;
          n += 1;
          if (data[i + 3] < 128 || (key && isMagenta(data[i], data[i + 1], data[i + 2]))) {
            bg += 1;
            continue;
          }
          R.push(data[i]);
          G.push(data[i + 1]);
          B.push(data[i + 2]);
        }
      }
      const o = (y * w + x) * 4;
      if (bg * 2 >= n) continue; // 透明（Buffer は 0 で 埋まって いる）
      out[o] = median(R);
      out[o + 1] = median(G);
      out[o + 2] = median(B);
      out[o + 3] = 255;
    }
  }
  return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png({
    palette: true,
    colours,
    dither: 0,
    compressionLevel: 9,
  });
}

/** 置く 先と 大きさ（生成した 名前 → public/img/quest の 中）。 */
const JOBS = [];
const bgNames = {
  bg_ch1_office: 1,
  bg_ch2_kickoff: 2,
  bg_ch3_youkyu: 3,
  bg_ch4_youken: 4,
  bg_ch5_estimate: 5,
  bg_ch6_sekkei: 6,
  bg_ch7_kaihatsu: 7,
  bg_ch8_test: 8,
  bg_ch9_release: 9,
  bg_ch10_hoshu: 10,
};
for (const [name, n] of Object.entries(bgNames)) {
  JOBS.push({
    src: `bg/${name}.png`,
    dest: `bg/ch${String(n).padStart(2, "0")}.png`,
    w: 256,
    h: 171,
    colours: 256,
  });
}
JOBS.push({ src: "bg/waterfall_map.png", dest: "waterfall.png", w: 96, h: 144, colours: 128 });

// 相手役（場面ごと）。1・4 は 見本の ときに 作った 絵
const enemySrc = (id) =>
  id === 1
    ? "sprites/enemy_yamada_tanomoshii.png"
    : id === 4
      ? "sprites/enemy_angel_sekkachi.png"
      : `sprites/enemy_p${String(id).padStart(2, "0")}.png`;
for (let id = 1; id <= 30; id += 1) {
  JOBS.push({
    src: enemySrc(id),
    dest: `enemy/p${String(id).padStart(2, "0")}.png`,
    w: 128,
    h: 128,
    key: true,
  });
}
JOBS.push({
  src: "sprites/enemy_angel_base.png",
  dest: "enemy/angel.png",
  w: 128,
  h: 128,
  key: true,
});
JOBS.push({
  src: "sprites/enemy_engineer_base.png",
  dest: "enemy/engineer.png",
  w: 128,
  h: 128,
  key: true,
});

// 仲間の ネクマックス（性格タイプ × 男女・タイプが まだの 人）
const CODES = [
  "ENFP",
  "ENFJ",
  "ENTP",
  "ENTJ",
  "INFP",
  "INFJ",
  "INTP",
  "INTJ",
  "ESFP",
  "ESFJ",
  "ESTP",
  "ESTJ",
  "ISFP",
  "ISFJ",
  "ISTP",
  "ISTJ",
];
for (const code of CODES) {
  for (const suffix of ["", "_f"]) {
    JOBS.push({
      src: `sprites/nexmax_${code}${suffix}.png`,
      dest: `nexmax/${code}${suffix}.png`,
      w: 120,
      h: 120,
      key: true,
    });
  }
}
JOBS.push({ src: "sprites/nexmax_base.png", dest: "nexmax/base.png", w: 120, h: 120, key: true });

const missing = [];
for (const job of JOBS) {
  const src = path.join(rawDir, job.src);
  if (!fs.existsSync(src)) {
    missing.push(job.src);
    continue;
  }
  const dest = path.join(OUT, job.dest);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await (
    await pixelize(src, job.w, job.h, { key: job.key, colours: job.colours ?? 64 })
  ).toFile(dest);
}

// しるし（2×2 に 並んだ 4つを 切り分ける）
const icons = path.join(rawDir, "bg", "icons.png");
if (fs.existsSync(icons)) {
  const sheet = await (await pixelize(icons, 64, 64, { key: true, colours: 32 })).toBuffer();
  fs.mkdirSync(path.join(OUT, "ui"), { recursive: true });
  for (const [i, name] of ["coin", "bug", "heart", "star"].entries()) {
    const part = await sharp(sheet)
      .extract({ left: (i % 2) * 32, top: Math.floor(i / 2) * 32, width: 32, height: 32 })
      .png()
      .toBuffer();
    await sharp(part)
      .trim({ threshold: 0 })
      .png({ palette: true, colours: 32 })
      .toFile(path.join(OUT, "ui", `${name}.png`));
  }
} else {
  missing.push("bg/icons.png");
}

console.log(`placed ${JOBS.length + 4 - missing.length} / ${JOBS.length + 4}`);
if (missing.length) console.log("missing:", missing.join(" "));
