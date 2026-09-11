import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuestResult } from "../src/components/quest/quest-result";
import { questSchema, type Quest } from "../src/content/schema";
import { createQuestState, type QuestMember, type QuestState } from "../src/lib/quest/state";
import { KANJI } from "../src/lib/text/furigana";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 終わりの 画面の ルビの 覆い（規律2）
 *
 * この 画面は **クリアするか 倒れるか**しないと 出ない ので、e2e の 裸の漢字の
 * 見張り（`tests/e2e/furigana.spec.ts`）が 届かない——30場面 遊ばせる わけには
 * いかない からである。効果（`useEffect`）を 使わない 見せるだけの 部品なので、
 * ここで **そのまま 描いて** 数える。
 *
 * 2026-09-11 の 検収で 3つの 終わりかた ぜんぶに 裸の 漢字が あった
 *（お金・一度・早く・相談・体力・減り・見ながら・万G）。
 */

const quest: Quest = questSchema.parse(
  JSON.parse(
    readFileSync(join(__dirname, "..", "content", "quests", "waterfall_quest.json"), "utf8"),
  ),
);

/** 名前は カタカナ。**名前の 漢字は 画面の 責任では ない**（名簿から 来る）。 */
const MEMBERS: QuestMember[] = [
  { id: "a", name: "アン", type: "ISTJ", gender: "female" },
  { id: "b", name: "ソカ", type: null, gender: "male" },
];

function ending(status: QuestState["status"]): QuestState {
  return { ...createQuestState(quest, MEMBERS), clearedPhases: 12, teamExp: 640, status };
}

/** `<ruby>` の 外に 残った 漢字（e2e の `bareKanjiTexts` と 同じ 見かた）。 */
function bareKanji(html: string): string[] {
  const text = html.replace(/<ruby>.*?<\/ruby>/g, "").replace(/<[^>]*>/g, "");
  return [...new Set([...text].filter((char) => KANJI.test(char)))];
}

const ENDINGS: readonly { name: string; status: QuestState["status"] }[] = [
  { name: "クリア", status: { kind: "cleared" } },
  { name: "お金が つきた", status: { kind: "over", reason: "budget" } },
  { name: "みんな 倒れた", status: { kind: "over", reason: "hp" } },
];

describe("終わりの 画面に 裸の 漢字が 無い", () => {
  it.each(ENDINGS)("$name", ({ status }) => {
    const html = renderToStaticMarkup(
      <QuestResult quest={quest} state={ending(status)} onRestart={() => {}} />,
    );
    expect(bareKanji(html)).toEqual([]);
  });

  /** 数えかたが 効いて いる ことの 確かめ（`<ruby>` を 外すと 見つかる）。 */
  it("ルビを 外すと 見つかる（数えかたが 空回りして いない）", () => {
    const html = renderToStaticMarkup(
      <QuestResult quest={quest} state={ending({ kind: "cleared" })} onRestart={() => {}} />,
    );
    expect(html).toContain("<ruby>");
    expect(bareKanji(html.replace(/<\/?ruby>|<rt>.*?<\/rt>/g, "")).length).toBeGreaterThan(0);
  });
});
