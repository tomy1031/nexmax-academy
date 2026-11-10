import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLIENT_ID, judgeAddressed } from "@/components/listening/people";
import { contentSchema, type Scenario } from "@/content/schema";

/**
 * 要件定義（STEP11）の たいわ — **ふつうの 聞き方で 札が 開くか**
 *
 * 2026-11-10 に オープンな たいわ（open-talk.ts）に した とき、別の AI の チェックで
 * 「教材の ヒントどおりに 聞いても 10枚中 7枚が 開かない」と 分かった。札は キーワードが
 * **2語 以上** 当たると 開く（`LOCAL_CONFIDENT_HITS`）が、この 教材の キーワードは
 * 「給料／きゅうりょう」の ような 漢字と 読みの 組だけで、ふつうの 質問は 1語しか 当たらなかった。
 * 学生は 聞けたと 思うのに 札が 閉じたままに なる。ここで「学生が 聞きそうな 文 → 開く 札」を 固定する。
 */

const scenario = contentSchema.parse(
  JSON.parse(readFileSync(join("content", "scenarios", "youken_aoba.json"), "utf8")),
) as Scenario;
const reqs = scenario.interview.reqs;

function opens(utterance: string): string | null {
  const outcome = judgeAddressed({ utterance, reqs, openIds: new Set(), targetId: CLIENT_ID });
  return outcome.kind === "opened" ? outcome.reqId : null;
}

/** 学生が 聞きそうな 文と、開く べき 札。 */
const ASKS: ReadonlyArray<readonly [string, string]> = [
  ["この ページの 目的は 何ですか", "r1"],
  ["なぜ 採用ページを 作りますか", "r1"],
  ["ページを 見た 人に 何を して ほしいですか", "r1"],
  ["どんな 人に 来て ほしいですか", "r2"],
  ["どんな 人を さがして いますか", "r2"],
  ["一人目の 仕事は 何ですか", "r3"],
  ["茶道の 先生は 何を しますか", "r3"],
  ["二人目の 仕事は 何ですか", "r4"],
  ["店長は どんな 仕事を しますか", "r4"],
  ["応募の 条件は 何ですか", "r5"],
  ["どんな 資格が いりますか", "r5"],
  ["英語は 必要ですか", "r5"],
  ["経験は 必要ですか", "r5"],
  ["いつから 働きますか", "r6"],
  ["仕事は 何月から 始まりますか", "r6"],
  ["給料は どのくらいですか", "r7"],
  ["給料は いくらですか", "r7"],
  ["一人目の 給料は いくらですか", "r7"],
  ["サイトの 予算は いくらですか", "r8"],
  ["ページを 作る お金は いくらですか", "r8"],
  ["サイトは いつまでに 出しますか", "r9"],
  ["納期は いつですか", "r9"],
  ["どうやって 応募しますか", "r10"],
  ["応募に 何が 必要ですか", "r10"],
  ["面接は 何回 ありますか", "r10"],
];

describe("要件定義（STEP11）の たいわ: ふつうの 聞き方で 札が 開く", () => {
  it.each(ASKS)("「%s」で %s が 開く", (utterance, reqId) => {
    expect(opens(utterance)).toBe(reqId);
  });

  it("教材の ヒント（『』の 文）で、その 札が 開く", () => {
    for (const req of reqs) {
      const quoted = /『([^』]+)』/u.exec(req.hint ?? "")?.[1];
      if (!quoted) continue;
      expect(opens(quoted), `${req.id} の ヒント「${quoted}」`).toBe(req.id);
    }
  });

  it("話題が ちがう 質問では 札を 開かない（あいまいな 質問で べつの 札を 開けない）", () => {
    for (const utterance of [
      "Aobaの コンセプトは 何ですか",
      "なぜ プノンペンに 店を 出しますか",
      "休みは 何日ですか",
      "ありがとうございます",
    ]) {
      expect(opens(utterance), utterance).toBeNull();
    }
  });
});
