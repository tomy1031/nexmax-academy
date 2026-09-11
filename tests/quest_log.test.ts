import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { questSchema, type Quest, type QuestOption } from "../src/content/schema";
import {
  QUEST_LOG_FURIGANA,
  questLogLines,
  questLogOpening,
  type QuestLogLine,
} from "../src/lib/quest/log";
import {
  createQuestState,
  currentPhase,
  questReducer,
  RISK_PHASE_ID,
  type QuestMember,
  type QuestState,
} from "../src/lib/quest/state";
import {
  annotateRuby,
  buildFuriganaIndex,
  mergeFuriganaEntries,
  uncoveredKanji,
} from "../src/lib/text/furigana";

/**
 * ログの 読み — **画面が 書いた 文が 画面の 読みで 読まれる**ことを 固定する
 *
 * `lint:content` は 教材データ（JSON）しか 見ないので、コードが 組み立てる 文の
 * 読みは どの 機械検査にも かからなかった。その 穴で 2つ 出て いた（2026-09-11）:
 *   - 「レベルが 上がった！」が 教材の `["上","うえ"]` に 当たって **うえがった**
 *   - 「【警告】N個の…」の 警・告・個 が 裸の 漢字（規律2）
 *
 * ここは **遊んで 出た 文を そのまま** 検査する。文を 直書きすると、
 * `questLogLines` の 中身が 変わった ときに テストだけ 古い まま 緑に なる。
 */

const quest: Quest = questSchema.parse(
  JSON.parse(
    readFileSync(join(__dirname, "..", "content", "quests", "waterfall_quest.json"), "utf8"),
  ),
);

/** 画面が 実際に 使う 索引（教材の 読み辞書に ログの 読みを 重ねた もの）。 */
const logIndex = buildFuriganaIndex(mergeFuriganaEntries(quest.furigana, QUEST_LOG_FURIGANA));

/** ログの 読みだけの 索引（教材に 頼って いないかを 見る）。 */
const ownIndex = buildFuriganaIndex(QUEST_LOG_FURIGANA);

/** 教材の 字（`option.resultText`）。ログの 読みだけでは 読めなくて よい。 */
const RESULT_TEXTS = new Set(
  quest.phases.flatMap((phase) => phase.options.map((option) => option.resultText)),
);

const MEMBER: QuestMember = { id: "a", name: "アン", type: "ISTJ", gender: "female" };

function optionIndex(state: QuestState, type: QuestOption["type"]): number {
  const phase = currentPhase(quest, state)!;
  return phase.options.findIndex(
    (option, index) => option.type === type && !state.chosen.includes(index),
  );
}

/** 1手 打って、出た ログを 集めて、解説を 閉じる。 */
function play(state: QuestState, type: QuestOption["type"], into: QuestLogLine[]): QuestState {
  const chosen = questReducer(quest, state, {
    type: "choose",
    optionIndex: optionIndex(state, type),
  });
  into.push(...questLogLines(quest, chosen));
  const next = questReducer(quest, chosen, { type: "advance" });
  // 場面が 進んだ 先で 爆発が 鳴る ことが ある（第8章の 入口）
  if (next.event?.kind === "risk") {
    into.push(...questLogLines(quest, next));
    return questReducer(quest, next, { type: "advance" });
  }
  return next;
}

/** 出た ログを ぜんぶ 集める（良い 手・外した 手・倒れる・爆発の 4通り）。 */
function everyLine(): QuestLogLine[] {
  const lines: QuestLogLine[] = [];

  // 1) 通しで いちばん 良い 手（場面クリア・レベルアップ・リスク0の 爆発が 出る）
  let state = createQuestState(quest, [MEMBER]);
  for (let i = 0; i < quest.phases.length; i += 1) {
    state = play(play(state, "critical", lines), "hit", lines);
  }

  // 2) 外した 手（お金の 減り・ダメージ）
  play(createQuestState(quest, [MEMBER]), "miss", lines);

  // 3) 倒れる（体力を 1 にして 外す）
  const weak: QuestState = {
    ...createQuestState(quest, [MEMBER]),
    players: createQuestState(quest, [MEMBER]).players.map((player) => ({ ...player, hp: 1 })),
  };
  play(weak, "miss", lines);

  // 4) リスクが 溜まった ままの 爆発（第8章の 入口に 座らせる）
  const at = quest.phases.findIndex((phase) => phase.id === RISK_PHASE_ID);
  const loaded: QuestState = {
    ...createQuestState(quest, [MEMBER]),
    phaseIndex: at - 1,
    hiddenRisk: 12,
    budget: 100000,
    players: createQuestState(quest, [MEMBER]).players.map((p) => ({ ...p, hp: 999, maxHp: 999 })),
  };
  play(play(loaded, "critical", lines), "hit", lines);

  return lines;
}

const LINES = everyLine();
const OWN_LINES = LINES.filter((line) => !RESULT_TEXTS.has(line.text));

/** ログが 書く 文の 型。1つでも 出て いなければ 検査が 空っぽに なっている。 */
const TEMPLATES: readonly { name: string; match: RegExp }[] = [
  { name: "行動", match: /の 行動！$/ },
  { name: "お金が 減った", match: /^お金が \d+万 減った！$/ },
  { name: "ダメージ", match: /は \d+の ダメージ！$/ },
  { name: "たおれた", match: /は たおれて しまった！$/ },
  { name: "レベルアップ", match: /は レベルが 上がった！$/ },
  { name: "テスト スタート", match: /^===== テスト スタート =====$/ },
  { name: "バグ ゼロ", match: /^すごい！ バグは ひとつも なかった！$/ },
  { name: "警告", match: /^【警告】\d+個の 大きな バグが 見つかった！$/ },
  { name: "やり直し", match: /^やり直しだ！ お金 -\d+万、みんなに \d+の ダメージ！$/ },
];

describe("ログの 文が 出そろって いる", () => {
  it.each(TEMPLATES)("$name の 行が 出る", ({ match }) => {
    expect(OWN_LINES.some((line) => match.test(line.text))).toBe(true);
  });
});

describe("ルビの 覆い（規律2）", () => {
  it("遊んで 出た ログに 裸の 漢字が 無い", () => {
    const bare = LINES.filter((line) => uncoveredKanji(line.text, logIndex).length > 0);
    expect(bare.map((line) => line.text)).toEqual([]);
  });

  it("はじめの 1行にも 裸の 漢字が 無い", () => {
    expect(uncoveredKanji(questLogOpening(quest), logIndex)).toEqual([]);
  });

  /**
   * 画面が 書く ことばは **教材の 辞書に 頼らない**。教材を 1本 足した ときに
   * 「その クエストでだけ 裸の 漢字」に ならない ように するため。
   */
  it("画面が 書く ことばは ログの 読みだけで 読める", () => {
    const bare = OWN_LINES.filter((line) => uncoveredKanji(line.text, ownIndex).length > 0);
    expect(bare.map((line) => line.text)).toEqual([]);
  });
});

describe("読みの 中身", () => {
  const readingOf = (text: string, surface: string) =>
    annotateRuby(text, logIndex).find((segment) => segment.text === surface)?.reading;

  it("「レベルが 上がった」は あがった（教材の 上=うえ に 負けない）", () => {
    const line = OWN_LINES.find((item) => /レベルが 上がった/.test(item.text))!;
    expect(readingOf(line.text, "上が")).toBe("あが");
    expect(annotateRuby(line.text, logIndex).some((s) => s.reading === "うえ")).toBe(false);
  });

  it("「警告」は けいこく、「個」は こ", () => {
    const line = OWN_LINES.find((item) => /^【警告】/.test(item.text))!;
    expect(readingOf(line.text, "警告")).toBe("けいこく");
    expect(readingOf(line.text, "個")).toBe("こ");
  });

  /**
   * 教材の 側は 変えて いない。「確認した上で」は うえで の まま で なければ
   * ならない（`["上が","あが"]` が 長さで 先に 当たるだけ）。
   */
  it("教材の「上で」は うえで の まま", () => {
    expect(readingOf("確認した上で 進める", "上")).toBe("うえ");
  });
});
