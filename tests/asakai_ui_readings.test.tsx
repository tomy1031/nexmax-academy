import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DayCount, DayProgress } from "../src/components/asakai/asakai-parts";
import { UI_FURIGANA } from "../src/components/asakai/ui-furigana";
import {
  annotateRuby,
  buildFuriganaIndex,
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
