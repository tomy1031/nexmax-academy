import { describe, expect, it } from "vitest";
import { loadUnitIndex } from "../src/lib/records/units";

/**
 * 教材の 台帳 —— 記録の id を **人が 読める 名前**に 戻す（実データで 見る）
 *
 * ここは 純関数では なく **いまの 教材そのもの**を 読む。理由は 2026-09-09 の
 * 指摘「AI松井社長とはなそう の 元のしつもんが 空でしたが、これは 接続不可能ですか？」
 * ——空だったのは 台帳の 鍵の 作り方が 足りて いなかった からで、
 * 「引ける はず」を 教材ごと 固定して おかないと また 静かに 外れる。
 */
describe("教材から しつもんを 引き直す", () => {
  it("対話ゲームの 出だしは **ばん＋何手目**で 引ける（松井社長）", async () => {
    const { prompts } = await loadUnitIndex();

    /*
     * 記録に 入って いるのは `talk:talk` という **ばん**だけ。手数は `attempt`
     *（`talk-game-session.tsx` が `talk.turns + 1` を 入れる）に あるので、
     * 1手目 = openers[0] から 順に ひもづく。
     */
    expect(prompts["kaisha_matsui:talk:talk#1"]).toBe(
      "Webサイトを 見ましたね。NEXT MAKEの どこが いいと 思いましたか。",
    );
    expect(prompts["kaisha_matsui:talk:talk#5"]).toBe(
      "日本に 行くまでに、何を がんばりたいですか。",
    );
  });

  it("聞く ばんは うながしの 文（手数では 分かれない）", async () => {
    const { prompts } = await loadUnitIndex();
    expect(prompts["kaisha_matsui:talk:listen"]).toBe(
      "では、こんどは あなたの ばんです。私に 聞いて みたい ことを 話して ください。",
    );
  });

  it("ツール教材（調査）の こたえも 問いの 文で 引ける", async () => {
    const { prompts } = await loadUnitIndex();
    /*
     * 調査（リサーチ）の ツールは 静的な 1枚で、問いの 文は アプリから 読めない。
     * 台帳（`src/content/link-answers.ts`）から 引けて はじめて、先生の 画面の
     * 「もんだい」の 列が id（`kaikyuu`）では なく 文に なる（2026-09-11）。
     */
    expect(prompts["houkoku_search:kaikyuu_order"]).toBe(
      "日本の 会社の 階級を、えらい 順に ならべて ください。",
    );
    expect(prompts["houkoku_search:joushi"]).toBe("「上司」との 関係は、日本と ちがいますか。");
  });

  it("出だしを 使いきった あとは 鍵を 作らない（AIの 深掘りは 教材に 無い）", async () => {
    const { prompts } = await loadUnitIndex();
    // 予備の 文（`probes`）で 埋めると、**聞かれて いない 文**を 先生に 見せる ことに なる。
    expect(prompts["kaisha_matsui:talk:talk#6"]).toBeUndefined();
  });

  it("ヘンディさんの ミーティングは これまでどおり 問いの id で 引ける", async () => {
    const { prompts } = await loadUnitIndex();
    const hendy = Object.keys(prompts).filter(
      (key) => key.startsWith("kaisha_houkoku_meeting:") && !key.includes("talk:"),
    );
    expect(hendy.length).toBeGreaterThan(0);
  });
});
