import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DayCount, DayProgress } from "../src/components/asakai/asakai-parts";
import { UI_FURIGANA } from "../src/components/asakai/ui-furigana";
import {
  annotateRuby,
  buildFuriganaIndex,
  KANJI,
  mergeFuriganaEntries,
  type FuriganaEntry,
} from "../src/lib/text/furigana";

/*
 * 朝礼・夕礼の **画面が 自分で 出す 字**の 読み（2026-09-28 の 点検）。
 *
 * 画面の 字は 教材の 読み辞書と 重ねて 描く（教材が 後勝ち）。教材の 辞書には
 * 1字の 見出し ["日","にち"]・["上","あ"] が ある ので、画面の「この日」「今日」
 * 「上から」が **このにち・いまにち・あから** に なって いた。検査は「ルビが
 * 付いて いるか」しか 見ない ので、どれも 素通りして いた。
 */
const MEETINGS = ["asakai_kantan", "asakai_muzukashii"] as const;

const indexOf = (id: string) => {
  const meeting = JSON.parse(
    readFileSync(join(__dirname, "..", "content", "meetings", `${id}.json`), "utf8"),
  ) as { furigana: FuriganaEntry[] };
  return buildFuriganaIndex(mergeFuriganaEntries(UI_FURIGANA, meeting.furigana));
};

/** 読みを「字〔よみ〕」の 形で 1本の 文に する。 */
const read = (text: string, id: string) =>
  annotateRuby(text, indexOf(id))
    .map((seg) => (seg.reading ? `${seg.text}〔${seg.reading}〕` : seg.text))
    .join("");

describe.each(MEETINGS)("%s の 画面の 字", (id) => {
  it.each([
    ["この 曜日を はじめから", "曜日〔ようび〕"],
    ["今日の 評価", "今日〔きょう〕"],
    [
      "つぎは 報告メモの やる ことを、上から 1つずつ 声に 出して 言って みましょう。",
      "上から〔うえから〕",
    ],
    ["作業記録を そのまま 読み上げて います。", "読み上げて〔よみあげて〕"],
  ])("「%s」は %s と 読む", (text, expected) => {
    const got = read(text, id);
    expect(got).toContain(expected);
    expect(got).not.toMatch(/日〔にち〕|上〔あ〕/u);
  });
});

/*
 * 週の けっかの ★と「その 曜日だけ 話し直す」（2026-09-29）。
 * 画面が 自分で 出す 字なので、裸の 漢字と 送りがなの 読みちがいを ここで 見る。
 * 漢字の 範囲は エンジンと 同じ `KANJI`（々・拡張Aも 拾う）。
 */
describe.each(MEETINGS)("%s の 週の けっかの ★", (id) => {
  it.each([
    ["1回で ぜんぶ 言えた 曜日", ["回〔かい〕", "言えた〔いえた〕", "曜日〔ようび〕"]],
    [
      "報告メモの ことを、最初の 報告で ぜんぶ 言えた 曜日に ★が 付きます（聞き返し 0回）。★は 合格の 数に 入りません。",
      [
        "最初の〔さいしょの〕",
        "付きます〔つきます〕",
        "聞き返し〔ききかえし〕",
        "合格〔ごうかく〕",
        "入りません〔はいりません〕",
      ],
    ],
    [
      "表の「もう いちど」で、★が ない 曜日だけ 話し直せます。",
      ["表の〔ひょうの〕", "話し直せます〔はなしなおせます〕"],
    ],
    [
      "表の「もう いちど」で、★が ない 曜日を 話し直しましょう。",
      ["話し直しましょう〔はなしなおしましょう〕"],
    ],
    [
      "話し直すと、その 曜日を 数え直します。前より 悪く なった ときは、前の けっかが 残ります。",
      [
        "話し直すと〔はなしなおすと〕",
        "数え直します〔かぞえなおします〕",
        "前より〔まえより〕",
        "悪く〔わるく〕",
        "残ります〔のこります〕",
      ],
    ],
    ["1回で ぜんぶ 言えました", ["回〔かい〕", "言えました〔いえました〕"]],
    ["やめて 今週の けっかに もどる", ["今週〔こんしゅう〕"]],
    [" ぜんぶ 話しました。", ["話"]],
    ["今週の けっかに もどる ▶", ["今週〔こんしゅう〕"]],
  ])("「%s」", (text, expected) => {
    const got = read(text, id);
    for (const one of expected) expect(got).toContain(one);
    const bare = annotateRuby(text, indexOf(id)).filter(
      (seg) => !seg.reading && KANJI.test(seg.text),
    );
    expect(bare.map((seg) => seg.text)).toEqual([]);
  });
});

/*
 * 聞き返しの ポップアップの 主ボタンと 札（2026-10-09）。「一度」は 画面の 辞書に 無く、
 * 裸の 漢字に なって いた（見張りは e2e の bareKanjiTexts だけ）。
 */
describe.each(MEETINGS)("%s の 聞き返しの ポップアップ", (id) => {
  it.each([
    ["もう一度報告", ["一度〔いちど〕", "報告〔ほうこく〕"]],
    [
      "内容: 伝わりませんでした",
      ["内容〔ないよう〕", "伝わりませんでした〔つたわりませんでした〕"],
    ],
  ])("「%s」", (text, expected) => {
    const got = read(text, id);
    for (const one of expected) expect(got).toContain(one);
    const bare = annotateRuby(text, indexOf(id)).filter(
      (seg) => !seg.reading && KANJI.test(seg.text),
    );
    expect(bare.map((seg) => seg.text)).toEqual([]);
  });
});

describe("数字＋日 は 手書きの ルビで 読む", () => {
  it("5日 は いつか", () => {
    expect(renderToStaticMarkup(<DayCount n={5} />)).toContain("<rt>いつか</rt>");
  });
  it("4日 は よっか", () => {
    expect(renderToStaticMarkup(<DayCount n={4} />)).toContain("<rt>よっか</rt>");
  });
  it("2日目 / 5日 は ふつかめ / いつか", () => {
    const html = renderToStaticMarkup(<DayProgress at={2} total={5} />);
    expect(html).toContain("<rt>ふつかめ</rt>");
    expect(html).toContain("<rt>いつか</rt>");
  });
});
