/**
 * 口パク 6枚の 台帳を 人物カードから 作る（`scripts/images/<id>_mouth.json`）。
 *
 * プロンプトは **スタジオの「口パク」と 同じ `buildMouthPrompt()`** を 通す。
 * 手で 書き写すと、先生が スタジオで 作り直した ときに 絵柄が 戻らない
 *（docs/skills/codex_image_generation.md §6.5 と 同じ 考え方）。
 *
 * 台帳の 1枚目は `closed`。`gen_images.mjs` は 1枚目の 合格画像を 以後の 参照に 足すので、
 * 口の 形ちがい 5枚は **閉じた 口の 絵を 見ながら** 撮られる。
 * それでも 髪や 影は 少し ずれるので、仕上げは `composite_mouth.mjs` が
 * 閉じた 口の 絵に **口の まわりだけ** を 重ねて 6枚を そろえる。
 *
 * 使い方: node --import tsx scripts/images/build_mouth_ledgers.ts okuda nyam fujiki
 */
import fs from "node:fs";
import path from "node:path";

import { buildMouthPrompt, MOUTH_SHAPES } from "../../src/lib/manga-prompt";

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error("usage: node --import tsx scripts/images/build_mouth_ledgers.ts <id>...");
  process.exit(1);
}

for (const id of ids) {
  const card = JSON.parse(fs.readFileSync(`content/characters/${id}.json`, "utf8")) as {
    role: string;
    looks: string;
  };
  const ledger = {
    refs: [`public/img/characters/${id}/sheet.webp`],
    _comment:
      "口パク 6枚（VisemeFace）。設定画だけを 参照に 渡す。プロンプトは build_mouth_ledgers.ts が buildMouthPrompt() から 作る（手で 直さない）。生の 6枚は composite_mouth.mjs で 閉じた 口の 絵に 口だけ 重ねてから 置く。",
    scenes: MOUTH_SHAPES.map((shape) => ({
      out: `${id}_mouth_${shape.key}`,
      dest: `public/img/characters/${id}/mouth/${shape.key}.webp`,
      title: `${id} の 口パク（${shape.key}）`,
      scene: buildMouthPrompt(card, shape),
      output: "Output: one square image, 1024x1024.",
    })),
  };
  const file = path.join("scripts/images", `${id}_mouth.json`);
  fs.writeFileSync(file, `${JSON.stringify(ledger, null, 2)}\n`);
  console.log("wrote", file);
}
