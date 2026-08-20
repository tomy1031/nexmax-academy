#!/usr/bin/env node
/**
 * 語彙メモ（GLOSSARY）を ことばの 正から 焼き込む（実行: npm run gen:content）
 *
 * 語彙メモは **性格診断の 画面**（`welcome-wizard.tsx`）など、クライアント側が
 * 直に import して 使う。学習者が 必ず 通る 画面なので、ここで サーバへ 取りに 行くと
 * 全員ぶんの 往復が 1つ 増える（2026-08-11 に Error 1102 を 出した 道と 同じ）。
 * だから **正は content/vocab に 1つ 置き、ここから TS へ 焼く**。
 *
 * 語彙メモに なるのは **英語の 意味（`englishMeaning`）を 持つ 語**である。
 * `GlossaryEntry` は 英語の 意味を 必ず 持つ かたちなので、持たない 語は そもそも
 * この形に できない。
 *
 * 生成物は**コミットする**。ずれていないかは `npm run lint:content` が検査する。
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const VOCAB_DIR = join(ROOT, "content", "vocab");
export const GLOSSARY_GENERATED_PATH = join(ROOT, "src", "content", "glossary.generated.ts");

const HAS_KANJI = /[㐀-鿿々]/;

export function collectGlossaryEntries() {
  if (!existsSync(VOCAB_DIR)) return [];
  const words = readdirSync(VOCAB_DIR)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => JSON.parse(readFileSync(join(VOCAB_DIR, f), "utf8")).words ?? []);
  return words
    .filter((w) => w.englishMeaning)
    .map((w) => ({
      term: w.term,
      // 漢字を 含まない 語は null（本文に ルビを 振る 必要が 無い）
      kanji: HAS_KANJI.test(w.term) ? w.term : null,
      reading: w.reading,
      meaning: w.meaningJa,
      englishTerm: w.englishTerm ?? "",
      englishMeaning: w.englishMeaning,
    }));
}

export function buildGlossarySource(entries) {
  const body = entries.map((e) => `  ${JSON.stringify(e)},`).join("\n");
  return `/**
 * 自動生成。手で編集しない（\`npm run gen:content\` で作り直す）。
 *
 * ことばの 正（content/vocab/*.json）の うち、英語の 意味を 持つ 語を
 * 語彙メモの かたちに 焼いた もの（scripts/generate_glossary.mjs）。
 * 語を 直したい ときは **正の JSON を 直す**。ここを 直しても 次の 生成で 消える。
 */

import type { GlossaryEntry } from "./glossary";

export const GENERATED_GLOSSARY: readonly GlossaryEntry[] = [
${body}
];
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const entries = collectGlossaryEntries();
  writeFileSync(GLOSSARY_GENERATED_PATH, buildGlossarySource(entries));
  console.log(`src/content/glossary.generated.ts を書き出しました（${entries.length}語）`);
}
