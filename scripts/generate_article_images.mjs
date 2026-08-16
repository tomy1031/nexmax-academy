/**
 * 読み物（article）の「え は じゅんびちゅう」を埋める。
 *
 * ## なぜスクリプトなのか
 * 絵の生成には鍵が要る。鍵は GitHub の Environment Secrets（`Preview`）にあり、
 * AI の作業環境には無い。**ユーザーに手を動かさせない**（docs/constraints.md 運用の制約）
 * ため、鍵の要る仕事は GitHub Actions（`.github/workflows/make-images.yml`）に寄せ、
 * ここはその中身だけを受け持つ。
 *
 * ## 何をするか
 * `content/articles/*.json` の image ブロックのうち `status: "empty"` のものを探し、
 * **すでに書いてあるプロンプトをそのまま**使って1枚ずつ描き、webp にして
 * `public/img/articles/<記事ID>/b<番号>.webp` へ置き、JSON を `status: "done"` ＋ `src` に直す。
 *
 * プロンプトを**書き足さない**のは、絵の指示が教材データ側の正であるため
 * （docs/skills/codex_image_generation.md の「マスター記述は逐語使用」と同じ考え方）。
 *
 * ## キャラクターの絵はここでは作らない
 * 人物の絵は設定画を参照入力に渡して描く決まり（絶対規律7・スキル §6.5）で、
 * 生成器も Codex image-gen-2 が第一。ここが扱うのは**記事の説明図**だけにする。
 *
 * 使い方: `GEMINI_API_KEY=... npm run make:images [-- --dry-run]`
 *（モデル名を `src/lib/ai/models.ts` から読むので tsx 経由で走らせる）
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { Buffer } from "node:buffer";

const ARTICLES_DIR = "content/articles";
const OUT_DIR = "public/img/articles";
/**
 * 生成器は**アプリと同じもの**を使う（`src/lib/ai/models.ts` の IMAGE_MODELS）。
 * ここに名前を書き写すと、先生の画面と絵柄が割れる。先頭から順に試す。
 */
const { IMAGE_MODELS } = await import("../src/lib/ai/models.ts");
const endpointOf = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const dryRun = process.argv.includes("--dry-run");
const apiKey = (process.env.GEMINI_API_KEY ?? "").trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 生成器へ渡す1枚ぶんの指示。教材の prompt をそのまま使い、体裁だけ足す。 */
function buildPrompt(prompt) {
  return `${prompt}\n\nOutput: a single square illustration, soft cream background, no letters or numbers anywhere.`;
}

/**
 * 先頭のモデルから順に試す。
 *
 * **429（使いすぎ）は待てば通ることがある**ので、間をあけて もう一度 ためす。
 * Gemini の無料枠は小さい（docs/constraints.md 2026-08-07「Gemini無料枠は少ない」）ので、
 * 1分あたりの上限にすぐ当たる。**その日の上限**のときは何度待っても通らないため、
 * 回数を決めてあきらめ、次の生成器へ移る。
 */
async function generate(prompt) {
  let lastError = new Error("生成器が 1つも ありません");
  const waits = [0, 20_000, 45_000];

  for (const model of IMAGE_MODELS) {
    for (const wait of waits) {
      if (wait > 0) {
        console.log(`   （${wait / 1000}秒 待って もう一度 ためします）`);
        await sleep(wait);
      }
      try {
        const response = await fetch(`${endpointOf(model)}?key=${encodeURIComponent(apiKey)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: buildPrompt(prompt) }] }],
            generationConfig: { responseModalities: ["IMAGE"] },
          }),
        });
        // 本文には鍵が混ざりうるので、状態の番号だけ出す（規律4）
        if (!response.ok) throw new Error(`${model}: HTTP ${response.status}`);
        const json = await response.json();
        const parts = json?.candidates?.[0]?.content?.parts ?? [];
        const inline = parts.find((p) => p?.inlineData?.data)?.inlineData;
        if (!inline)
          throw new Error(`${model}: 絵が 返って きませんでした（安全ブロックの可能性）`);
        return Buffer.from(inline.data, "base64");
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        console.log(`   （${lastError.message}）`);
        // 使いすぎ以外は待っても変わらないので、次の生成器へ
        if (!lastError.message.includes("429")) break;
      }
    }
  }
  throw lastError;
}

/** png/jpeg を webp にする。sharp が無い環境ではそのまま返す。 */
async function toWebp(buffer) {
  try {
    const { default: sharp } = await import("sharp");
    return {
      data: await sharp(buffer).resize({ width: 1024 }).webp({ quality: 84 }).toBuffer(),
      ext: "webp",
    };
  } catch {
    return { data: buffer, ext: "png" };
  }
}

/**
 * 途中で上限に当たっても、**そこまでに描けたぶんは残す**。
 * 1枚も描けなかったときだけ失敗にする（成果があるのに落ちると PR が出ない）。
 */
async function main() {
  if (!apiKey && !dryRun) {
    console.error("GEMINI_API_KEY が ありません。");
    process.exit(1);
  }

  const files = (await readdir(ARTICLES_DIR)).filter((f) => f.endsWith(".json"));
  let made = 0;
  let failed = 0;

  for (const file of files) {
    const full = path.join(ARTICLES_DIR, file);
    const article = JSON.parse(await readFile(full, "utf8"));
    let touched = false;

    for (const [index, block] of article.blocks.entries()) {
      if (block.kind !== "image" || block.status === "done" || !block.prompt) continue;

      console.log(`▶ ${article.id} の ${index}番目: ${block.caption ?? "(説明なし)"}`);
      if (dryRun) {
        console.log(`   （下見なので 作りません）→ ${OUT_DIR}/${article.id}/b${index}.webp`);
        continue;
      }

      // 2枚目からは間をあける（1分あたりの上限に当たりにくくする）
      if (made + failed > 0) await sleep(15_000);

      let raw;
      try {
        raw = await generate(block.prompt);
      } catch (e) {
        // ここで止めない。描けたぶんを残して先へ進む
        console.log(`   この まいは 作れませんでした: ${e instanceof Error ? e.message : e}`);
        failed += 1;
        continue;
      }

      const { data, ext } = await toWebp(raw);
      const outPath = `${OUT_DIR}/${article.id}/b${index}.${ext}`;
      await mkdir(path.dirname(outPath), { recursive: true });
      await writeFile(outPath, data);

      block.status = "done";
      block.src = `/${outPath.replace(/^public\//, "")}`;
      touched = true;
      made += 1;
      console.log(`   できました → ${block.src}（${Math.round(data.length / 1024)} KB）`);
    }

    if (touched) await writeFile(full, `${JSON.stringify(article, null, 2)}\n`);
  }

  console.log(made === 0 ? "作れた 絵は ありませんでした。" : `${made}枚 作りました。`);
  if (failed > 0) {
    console.log(`${failed}枚は 作れませんでした（鍵の 使いすぎの ことが 多い）。`);
  }
  // 作る対象があったのに1枚も作れなかった → 気づけるように失敗にする
  if (made === 0 && failed > 0) process.exitCode = 1;
}

await main();
