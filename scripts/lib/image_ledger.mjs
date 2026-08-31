/**
 * 画像の 台帳（`scripts/images/*.json`）を 読んで、**絵の URL → プロンプト・参照画像**の
 * 索引に する。
 *
 * ## なぜ 共有に するのか
 * 教材を 組み立てる スクリプト（`gen_hourensou_content.mjs` /
 * `gen_kaihatsu_content.mjs`）は、絵の スロットに **プロンプトも** 入れる。
 * これを それぞれの スクリプトに 直書きすると、同じ 事実が 2か所に なり、必ず 片方が
 * 古くなる——報連相で 実際に 起きた。まんがの 9コマは ヘンディの 見た目を
 * 「light blue shirt, ID lanyard」と 書いて いて、人物カードの「紺の スーツ・
 * ネクタイ・ストラップ無し」と 食い違った まま 9コマ ぜんぶに 焼かれて いた。
 *
 * **台帳が 正**。ここは その 読み方だけを 持つ。
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LEDGER_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "images");

/**
 * 台帳が 実際に 画像生成へ 渡すのと 同じ 組み立て
 * （`scripts/slides/gen_images.mjs` と そろえて ある）。
 */
export function buildPrompt(ledger, scene, { withOutput = true } = {}) {
  const parts = [ledger.style, scene.scene];
  if (Array.isArray(scene.text) && scene.text.length > 0) {
    parts.push(`The Japanese words in this picture are exactly: ${scene.text.join(" / ")}.`);
  }
  // 大きさの 一文は **絵を 作る ときだけ** 要る。教材データに 焼く プロンプトからは
  // 外す——管理画面の「作り直す」は 出力先の 大きさを 自分で 決めるので、
  // 中に 別の 大きさが 書いて あると 食い違う。
  if (withOutput) {
    parts.push(
      scene.output ?? `Output: one landscape illustration, ${ledger.output ?? "1536x1024"}.`,
    );
  }
  parts.push(ledger.noText, ledger.negative);
  return parts.filter(Boolean).join(" ");
}

/** 絵の URL（`/img/...`）→ `{ prompt, refs }` の 索引を 作る。 */
export function loadImageLedgers() {
  const index = new Map();
  for (const file of readdirSync(LEDGER_DIR).filter((f) => f.endsWith(".json"))) {
    let ledger;
    try {
      ledger = JSON.parse(readFileSync(join(LEDGER_DIR, file), "utf8"));
    } catch {
      continue; // 台帳では ない JSON は 飛ばす
    }
    if (!Array.isArray(ledger.scenes)) continue;
    for (const scene of ledger.scenes) {
      if (!scene.dest || !scene.scene) continue;
      // `public/img/...` は 配信では `/img/...`
      index.set(scene.dest.replace(/^public/, ""), {
        prompt: buildPrompt(ledger, scene, { withOutput: false }),
        refs: (ledger.refs ?? []).map((r) => r.replace(/^public/, "")),
      });
    }
  }
  return index;
}

/**
 * 教材スクリプト用の 絵スロット 2種を 作る。
 *
 * `img(src)` … もう ある 絵（`status:"done"`）。**同じ パスに 新しい 絵を 上書きすれば
 *              画面が 変わる**ので、絵が 届いた ときに JSON を 書き換えなくて よい。
 * `emptySlot(url)` … まだ 絵が 無い スロット（画面は 点線わくを 出す）。
 * `missing` … 台帳に 載って いない 絵の 一覧（見つけたら 台帳に 足す）。
 */
export function createImageSlots() {
  const ledger = loadImageLedgers();
  const missing = new Set();
  const look = (src) => {
    const found = ledger.get(src);
    if (!found) missing.add(src);
    return found;
  };
  return {
    missing,
    img: (src) => {
      const found = look(src);
      return found
        ? { src, prompt: found.prompt, refs: found.refs, status: "done" }
        : { src, refs: [], status: "done" };
    },
    emptySlot: (url) => {
      const found = look(url);
      return found
        ? { prompt: found.prompt, refs: found.refs, status: "empty" }
        : { refs: [], status: "empty" };
    },
  };
}
