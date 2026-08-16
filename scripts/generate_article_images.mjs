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

/** 生成器へ渡す1枚ぶんの指示。教材の prompt をそのまま使い、体裁だけ足す。 */
function buildPrompt(prompt) {
  return `${prompt}\n\nOutput: a single square illustration, soft cream background, no letters or numbers anywhere.`;
}

/** 先頭のモデルから順に試す（混んでいる・使えないときは次へ）。 */
async function generate(prompt) {
  let lastError = new Error("生成器が 1つも ありません");
  for (const model of IMAGE_MODELS) {
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
      if (!inline) throw new Error(`${model}: 絵が 返って きませんでした（安全ブロックの可能性）`);
      return Buffer.from(inline.data, "base64");
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.log(`   （${lastError.message}。つぎの 生成器を ためします）`);
    }
  }
  throw lastError;
}

/** png/jpeg を webp にする。sharp が無い環境ではそのまま返す（拡張子で判断させない）。 */
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

async function main() {
  if (!apiKey && !dryRun) {
    console.error("GEMINI_API_KEY が ありません。");
    process.exit(1);
  }

  const files = (await readdir(ARTICLES_DIR)).filter((f) => f.endsWith(".json"));
  let made = 0;

  for (const file of files) {
    const full = path.join(ARTICLES_DIR, file);
    const article = JSON.parse(await readFile(full, "utf8"));
    let touched = false;

    for (const [index, block] of article.blocks.entries()) {
      if (block.kind !== "image" || block.status === "done" || !block.prompt) continue;

      const rel = `${OUT_DIR}/${article.id}/b${index}.webp`;
      console.log(`▶ ${article.id} の ${index}番目: ${block.caption ?? "(説明なし)"}`);
      if (dryRun) {
        console.log(`   （下見なので 作りません）→ ${rel}`);
        continue;
      }

      const raw = await generate(block.prompt);
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

  console.log(made === 0 ? "作る 絵は ありませんでした。" : `${made}枚 作りました。`);
}

await main();
