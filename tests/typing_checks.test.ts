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
import type { VocabWord } from "../src/content/schema";
import { hydrateTyping } from "../src/lib/vocabulary";
import {
  createTypingTarget,
  judgeTyping,
  type TypingTarget,
} from "../src/components/typing/typing-checks";

interface TypingJson {
  readonly listeningRef: string;
  readonly sentences: readonly { readonly text: string; readonly wordIds: readonly string[] }[];
  readonly furigana: readonly [string, string][];
}

/** ことばの 正（画面は ここから 借りた 読みも 混ぜて 判定する）。 */
const VOCAB: readonly VocabWord[] = JSON.parse(
  readFileSync(join("content", "vocab", "vocabulary.json"), "utf8"),
).words;

const SCENES = ["kanryou", "okure", "shougai", "chousa", "chourei"] as const;

function load(scene: string): TypingJson {
  return JSON.parse(
    readFileSync(join("content", "typing", `houkoku_${scene}_typing.json`), "utf8"),
  ) as TypingJson;
}

function targetsOf(scene: string): TypingTarget[] {
  const doc = load(scene);
  /*
   * **画面と 同じ 辞書で** 判定する（`src/lib/content.ts` の `hydrateTyping` を 通した もの）。
   * 教材の 辞書だけで 見ると、語の 正に 長い 見出しが 入って 分け方が 変わっても 緑の まま（code-critic の 指摘）。
   */
  const furigana = buildFuriganaIndex(hydrateTyping(doc, VOCAB).furigana ?? []);
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
  "また、エラーが出た行を正しく表示できるかもテストしています。",
  "理由は何ですか。",
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

describe("IME が かなの 語を 漢字に 変えても 落とさない", () => {
  it("頃・迄・事・無い・様に・又・所 に 変えて 打っても 当たる", () => {
    const base = "一部の ユーザーが 予約できない 問題が 発生して います。";
    expect(judge("shougai", 1, `今日の 10時頃から、${base}`)).toEqual({ ok: true });
    expect(judge("okure", 5, "今の 所、明日の 午前中迄には 終わると 思います。")).toEqual({
      ok: true,
    });
    expect(
      judge(
        "kanryou",
        3,
        "又、タイトルを クリックすると、お知らせの 詳細画面が 開く 事も 確認しました。",
      ),
    ).toEqual({ ok: true });
    expect(judge("okure", 3, "CSVの データに 間違いが 無いか、一つずつ 確認して います。")).toEqual(
      {
        ok: true,
      },
    );
    expect(
      judge("kanryou", 2, "お知らせの タイトル、日にち、文章を 表示できる様に しました。"),
    ).toEqual({
      ok: true,
    });
  });

  it("お手本に その 漢字が ある 文では 戻さない（ちがう 文は 外れた まま）", () => {
    const target = createTypingTarget("仕事の 事を 話す。", {
      furigana: buildFuriganaIndex([
        ["仕事", "しごと"],
        ["事", "こと"],
        ["話", "はな"],
      ]),
    });
    expect(judgeTyping(target, "しごとの ことを はなす。")).toEqual({ ok: true });
    expect(judgeTyping(target, "仕こと の 事を 話す。").ok).toBe(false);
  });
});

describe("長い 入力でも 固まらない", () => {
  it("3000字を 貼り付けても すぐ 返る（どこまで 合って いたかの 探しは お手本の 2倍まで）", () => {
    const target = targetsOf("chousa")[0]!;
    const long = "あ".repeat(3000);
    const started = performance.now();
    expect(judgeTyping(target, long).ok).toBe(false);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
