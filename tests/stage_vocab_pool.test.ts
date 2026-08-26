import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { vocabSchema, type VocabWord } from "../src/content/schema";
import { appearsAsWord, stageVocabPool } from "../src/lib/vocab/stage-pool";

/**
 * ステージの ことばの 候補（願い #203）。
 *
 * 見るのは 2つ。**この 課に 出て くる 語だけを 出す**ことと、
 * **複合語の 一部を 拾わない**こと（「外国」から「国」を 拾うと、
 * 覚えるべき 語が 埋もれる）。
 */

const VOCAB = vocabSchema.parse(
  JSON.parse(readFileSync(join(__dirname, "..", "content", "vocab", "vocabulary.json"), "utf8")),
);

const find = (term: string): VocabWord => {
  const word = VOCAB.words.find((w) => w.term === term);
  if (!word) throw new Error(`ことばの 正に 「${term}」が ありません`);
  return word;
};

describe("語として 出て いるか", () => {
  it("前後が 漢字なら 語と みなさない（「外国」から「国」を 拾わない）", () => {
    expect(appearsAsWord("外国の 会社と はたらきます。", "国")).toBe(false);
    expect(appearsAsWord("その 国の ことばを 学びます。", "国")).toBe(true);
  });

  it("分かち書きの 空白を またいでも 見つける", () => {
    expect(appearsAsWord("会社の 経営 理念を 調べます。", "経営理念")).toBe(true);
  });

  it("読み辞書が 切れ目を 決めて いる 語は、前後が 漢字でも 語", () => {
    const units = new Set(["連合会"]);
    expect(appearsAsWord("育成連合会の 人と 話します。", "連合会")).toBe(false);
    expect(appearsAsWord("育成連合会の 人と 話します。", "連合会", units)).toBe(true);
  });
});

describe("ステージの ことばの 候補", () => {
  const nouki = find("納期");
  const kigyou = find("企業");

  it("本文に 出て くる 語だけを 拾う", () => {
    const pool = stageVocabPool({
      vocab: [nouki, kigyou],
      texts: ["納期は、できた ものを わたす 日です。"],
      playingIds: new Set(),
      refs: [],
    });
    expect(pool.appears.map((w) => w.term)).toEqual(["納期"]);
    expect(pool.playing).toEqual([]);
  });

  it("いま 出題中の 語は、本文に 出て いなくても 別の かたまりに 出る", () => {
    const pool = stageVocabPool({
      vocab: [nouki, kigyou],
      texts: ["納期は、できた ものを わたす 日です。"],
      playingIds: new Set([kigyou.id]),
      refs: [],
    });
    expect(pool.playing.map((w) => w.term)).toEqual(["企業"]);
    expect(pool.appears.map((w) => w.term)).toEqual(["納期"]);
  });

  it("学習用サイトに 出る 語は、本文が 無くても 候補に なる（焼き込みを 見る）", () => {
    const pool = stageVocabPool({
      vocab: VOCAB.words,
      texts: [],
      playingIds: new Set(),
      refs: ["nextmake_gakushu_site"],
    });
    expect(pool.appears.length).toBeGreaterThan(100);
    expect(pool.appears.map((w) => w.term)).toContain("経営理念");
  });

  it("1文字の 語は 候補に しない（N5の 基礎語と 動詞の 語幹）", () => {
    const single = VOCAB.words.find((w) => w.term.length === 1);
    if (!single) return;
    const pool = stageVocabPool({
      vocab: [single],
      texts: [`これは ${single.term} です。`],
      playingIds: new Set(),
      refs: [],
    });
    expect(pool.appears).toEqual([]);
  });
});
