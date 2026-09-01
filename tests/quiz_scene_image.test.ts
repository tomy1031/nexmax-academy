import { describe, expect, it } from "vitest";
import { quizQuestionSchema } from "@/content/schema";

/**
 * 設問の **場面の 絵**（`image`）
 *
 * 「いま 先輩に 話しかけて よいか」を 聞く 問いは、**先輩の 机の まわりが
 * どう なって いるか**が 答えの もとに なる。それを 字で 書き並べると、
 * 測って いるのが 場面の 読みでは なく 長い 日本語を 読む 速さに なる。
 *
 * 見張るのは 2つ。
 *  1. 絵を 付けた 問いが 保存できる（`src` あり／わくだけ の どちらも）
 *  2. **絵の 欄が 無い これまでの 教材が そのまま 通る**——ここが 落ちると、
 *     いま 動いて いる 教材が いっせいに 読めなく なる
 */

/** 絵の 欄を 持たない、これまでの かたちの とい。 */
const BASE = {
  id: "q1",
  type: "choose" as const,
  q: "先輩は でんわを して います。いま 話しかけますか。",
  explain: "でんわが おわってから 声を かけると、話が 通ります。",
  points: 1,
  options: ["すぐ 話しかける", "でんわが おわるまで まつ"],
  answer: 1,
};

describe("設問の 場面の 絵", () => {
  it("絵を 付けた といが 通る", () => {
    const parsed = quizQuestionSchema.safeParse({
      ...BASE,
      image: { src: "/img/quiz/senpai-desk.png", refs: [], status: "done" },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.image?.src).toBe("/img/quiz/senpai-desk.png");
  });

  it("絵が まだ 無い わくだけでも 通る（画面には 点線の わくが 出る）", () => {
    const parsed = quizQuestionSchema.safeParse({ ...BASE, image: { refs: [], status: "empty" } });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.image?.status).toBe("empty");
  });

  it("絵の 欄が 無い これまでの といも そのまま 通る", () => {
    const parsed = quizQuestionSchema.safeParse(BASE);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.image).toBeUndefined();
  });
});
