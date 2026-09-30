/**
 * タイピングの 判定（src/components/typing/typing-checks.ts）の 見張り
 *
 * 2026-09-30 の 指定「重要な 文章を タイピングして、正解した 場合に 英文や 単語の 意味が
 * 出てくる」＋ 前の 指定「ひらがなでも 漢字ありでも どちらも 正しく 機能するように」。
 * 報告の リスニング 5場面の **全部の 文**で、漢字まじり・かなだけ・空白や 句読点なしが
 * 当たる ことを 機械で 見る——1文でも 外れると、正しく 打った 学習者が 先へ 進めない。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Tokenizer } from "kuromoji";
import { getTokenizer } from "../scripts/lib/yomi_check";
import { buildFuriganaIndex } from "../src/lib/text/furigana";
import { toHiragana } from "../src/lib/text/normalize";
import { buildSoundsIndex } from "../src/components/listening/listening-checks";
import { soundsLikeOf } from "../src/content/listening-sounds";
import {
  createTypingTarget,
  judgeTyping,
  type TypingTarget,
} from "../src/components/typing/typing-checks";

interface TypingJson {
  readonly listeningRef: string;
  readonly sentences: readonly { readonly text: string }[];
  readonly furigana: readonly (readonly [string, string])[];
}

const SCENES = ["kanryou", "okure", "shougai", "chousa", "chourei"] as const;

function load(scene: string): TypingJson {
  return JSON.parse(
    readFileSync(join("content", "typing", `houkoku_${scene}_typing.json`), "utf8"),
  ) as TypingJson;
}

function targetsOf(scene: string): TypingTarget[] {
  const doc = load(scene);
  const furigana = buildFuriganaIndex(doc.furigana);
  const sounds = buildSoundsIndex(soundsLikeOf(doc.listeningRef));
  return doc.sentences.map((item) => createTypingTarget(item.text, { furigana, sounds }));
}

/** 場面の n番目の 文の 判定 */
function judge(scene: string, index: number, input: string) {
  return judgeTyping(targetsOf(scene)[index]!, input);
}

/**
 * 形態素解析の 読みが **まちがって いる** 文（解析の 誤りで、学習者の 読みでは ない）。
 * 行＝ぎょう を くだり、正しく を まさしく、何ですか を なにですか と 読む。
 */
const TOKENIZER_MISREADS = new Set([
  "また、エラーが 出た 行を 正しく 表示できるかも テストして います。",
  "理由は 何ですか。",
]);

describe("報告の リスニング 5場面の タイピング — 全部の 文", () => {
  let tokenizer: Tokenizer;
  beforeAll(async () => {
    tokenizer = await getTokenizer();
  });

  for (const scene of SCENES) {
    it(`${scene}: お手本どおり・空白と 句読点なし・かなだけ（解析の 読み）で 当たる`, () => {
      const doc = load(scene);
      const targets = targetsOf(scene);
      doc.sentences.forEach((item, i) => {
        const target = targets[i]!;
        expect(judgeTyping(target, item.text), item.text).toEqual({ ok: true });
        expect(judgeTyping(target, item.text.replace(/[\s、。]/g, "")), item.text).toEqual({
          ok: true,
        });
        if (TOKENIZER_MISREADS.has(item.text)) return;
        // 読みは 教材の 読み辞書とは 別の 出どころ（kuromoji）で 作る——同じ 辞書で 作ると 自分に 当てるだけに なる
        const kana = toHiragana(
          tokenizer
            .tokenize(item.text)
            .map((token) =>
              token.reading && token.reading !== "*" ? token.reading : token.surface_form,
            )
            .join(""),
        );
        expect(judgeTyping(target, kana), `${item.text} ← ${kana}`).toEqual({ ok: true });
      });
    });
  }
});

describe("数字・英字の 語も かなで 当たる（台帳 src/content/listening-sounds.ts）", () => {
  it("障害: 10時 は じゅうじ・十時 でも 当たる", () => {
    const base = "いちぶの ゆーざーが よやくできない もんだいが はっせいして います。";
    expect(judge("shougai", 1, `きょうの じゅうじごろから、${base}`)).toEqual({ ok: true });
    expect(judge("shougai", 1, `今日の 十時ごろから、${base}`)).toEqual({ ok: true });
    expect(judge("shougai", 1, `きょうの 10じごろから、${base}`)).toEqual({ ok: true });
    expect(
      judge("shougai", 4, "えーぴーあいで えらーが でて いる ことは かくにんしました。"),
    ).toEqual({
      ok: true,
    });
  });

  it("作業完了: GitHub・Issue は かな・全角・小文字でも、ください は 下さい でも 当たる", () => {
    expect(
      judge("kanryou", 7, "ぎっとはぶの いしゅーを つくったので、かくにんして ください。"),
    ).toEqual({
      ok: true,
    });
    expect(judge("kanryou", 7, "ＧｉｔＨｕｂのＩｓｓｕｅを作ったので、確認して下さい。")).toEqual({
      ok: true,
    });
    expect(judge("kanryou", 7, "githubのissueを作ったので確認してください")).toEqual({ ok: true });
  });

  it("遅れ: 午後5時 は ごごごじ・午後五時、一つずつ は 1つずつ でも 当たる", () => {
    expect(
      judge("okure", 6, "きょうの ごご ごじまでに、もう いちど じょうきょうを おしえて ください。"),
    ).toEqual({
      ok: true,
    });
    expect(judge("okure", 6, "今日の午後五時までに、もう一度状況を教えてください。")).toEqual({
      ok: true,
    });
    expect(judge("okure", 3, "CSVの データに 間違いが ないか、1つずつ 確認して います。")).toEqual({
      ok: true,
    });
    expect(
      judge(
        "okure",
        3,
        "しーえすぶいの でーたに まちがいが ないか、ひとつずつ かくにんして います。",
      ),
    ).toEqual({ ok: true });
  });

  it("技術調査: 100GB・360円・AWS・S3 も かなで 当たる", () => {
    expect(
      judge(
        "chousa",
        8,
        "ひゃくぎが ほぞんすると、りょうきんは つきに だいたい さんびゃくろくじゅうえんです。",
      ),
    ).toEqual({ ok: true });
    expect(
      judge(
        "chousa",
        3,
        "ふたつめは、えーだぶりゅーえすの えすすりーに がぞうを ほぞんする ほうほうです。",
      ),
    ).toEqual({ ok: true });
  });

  it("朝礼: 80％ は はちじっぱーせんと・80パーセント でも、Slack は すらっく でも 当たる", () => {
    const at = load("chourei").sentences.findIndex((item) => item.text.includes("80％"));
    expect(
      judge(
        "chourei",
        at,
        "しょうひんしょうさいきのう ぜんたいの しんちょくは、はちじっぱーせんとです。",
      ),
    ).toEqual({
      ok: true,
    });
    expect(judge("chourei", at, "商品詳細機能全体の進捗は、80パーセントです。")).toEqual({
      ok: true,
    });
    const last = load("chourei").sentences.length - 1;
    expect(
      judge("chourei", last, "ごぜんちゅうに かくにんして、わかったら すらっくで ほうこくします。"),
    ).toEqual({
      ok: true,
    });
  });
});

describe("ちがう 文は はっきり 外す（規律1）", () => {
  it("助詞が ちがう・語が 抜ける・余計な 字・空 は 外れる", () => {
    // ユーザーの 一覧の 打ちまちがい（タスク「は」）は リスニングどおり「を」が 正しい
    expect(judge("kanryou", 6, "次は どの タスクは すれば いいですか。").ok).toBe(false);
    expect(judge("kanryou", 6, "次は タスクを すれば いいですか。").ok).toBe(false);
    expect(judge("kanryou", 6, "次は どの タスクを すれば いいですかね。").ok).toBe(false);
    expect(judge("kanryou", 6, "").ok).toBe(false);
    expect(judge("kanryou", 6, "   ").ok).toBe(false);
  });

  it("外れた ときは、頭から 合って いた ところを 返す", () => {
    expect(judge("kanryou", 6, "次は どの タスクは すれば いいですか。")).toEqual({
      ok: false,
      matched: "次は どの タスク",
    });
    expect(judge("kanryou", 6, "つぎは どの たすくは")).toEqual({
      ok: false,
      matched: "つぎは どの たすく",
    });
    expect(judge("kanryou", 6, "あいう")).toEqual({ ok: false, matched: "" });
  });
});
