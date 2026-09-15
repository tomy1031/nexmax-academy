import { describe, expect, it } from "vitest";

import houkoku from "../content/meetings/houkoku_meeting.json";
import { meetingSchema } from "@/content/schema";

/**
 * 報告の 練習ミーティング（`houkoku_meeting`）の **実データ**を そのまま 見る。
 *
 * ## なぜ「無い こと」を 見張るのか
 * `affection`（💗 きょりメーター・とっておきの話）は **付けても スキーマが 通る**——
 * 画面の 側は `meeting.affection` が あれば 黙って ハートを 出す 作りなので、
 * 誰かが もう一度 足しても **テストも lint も 緑の まま**で、次の 授業で
 * 学習者の 画面にだけ ハートが 戻る。だから ここで 名ざしで 止める。
 *
 * 外した 理由（2026-09-10 の 指定・`docs/constraints.md`）:
 * 「💗 ヘンディさんとの きょり0/5というパラメーターは意味不明です。
 *   正しく自分の状況を伝えられるのが重要なことなので、距離もエピソードも無駄しかありません」
 *
 * ここは **正しい 要素（用件 → 結論 → 事実 → お願い）を 正しく 伝えられるか**だけを 見る 教材で、
 * 距離は 測る ものでは ない。同じ 決めごとは 朝礼・夕礼（`asakai`）の スキーマにも 書いてある。
 */
describe("報告の 練習ミーティング", () => {
  it("meetingSchema に 合う", () => {
    expect(meetingSchema.safeParse(houkoku).success).toBe(true);
  });

  it("好感度（💗 きょりメーター・とっておきの話）を 持たない", () => {
    expect(houkoku).not.toHaveProperty("affection");
  });

  /*
   * とっておきの話が 担って いた「**なぜ 早く 言うのか**」は 消さずに 残す
   *（AGENTS.md 規律10「仕組みを 外す ときは 引き継ぎ先を 決めてから」）。
   * 引き継ぎ先は この 教材の 中に 2つ ある——6問目の 受け答えと、おわりの ことば。
   */
  it("「悪い ニュースは 早く」の 学びは 教材の 中に 残って いる", () => {
    const mikomi = houkoku.questions.find((question) => question.id === "q6_mikomi");
    expect(mikomi?.echo).toContain("早く 言って くれたので、予定を 変えられます");
    expect(houkoku.closing).toContain("悪い ニュースは 早く");
  });
});
