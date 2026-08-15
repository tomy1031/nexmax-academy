import { describe, expect, it } from "vitest";
import { fillAnswer, fillName, NAME_MARK, NO_NAME } from "../src/lib/meeting/speech";
import { needsJapaneseInput } from "../src/lib/meeting/input";
import { hintPatterns, hintSegments } from "../src/lib/meeting/hint";

/**
 * `◯◯` を 何で 埋めるか。
 *
 * 画面の中で 順番に 置換して いた ころは、呼び名を 入れる 関数が 先に 走って
 * `◯◯` を 全部 食べ、受け答えが **学習者の 名前**を 復唱していた。
 * 役ごとに 分けた いま、ここで 固定する。
 */

describe("呼び名の 差し込み（ask / closing / reward）", () => {
  it("◯◯ が 呼び名に なる", () => {
    expect(fillName("◯◯さんは、どこから 来ましたか。", "ソピア")).toBe(
      "ソピアさんは、どこから 来ましたか。",
    );
  });

  it("◯◯ が いくつ あっても ぜんぶ 埋まる（目印を 画面に 残さない）", () => {
    expect(fillName("◯◯さん、◯◯さん。", "ソカ")).toBe("ソカさん、ソカさん。");
    expect(fillName("◯◯さん、◯◯さん。", "ソカ")).not.toContain(NAME_MARK);
  });

  it("名前が まだ 無い 学習者には「あなた」（◯◯ の ままには しない）", () => {
    expect(fillName("◯◯さん、こんにちは。", "")).toBe(`${NO_NAME}さん、こんにちは。`);
    expect(fillName("◯◯さん、こんにちは。", "   ")).toBe(`${NO_NAME}さん、こんにちは。`);
  });
});

describe("答えの 差し込み（echo）", () => {
  it("◯◯ は **学習者の 答え**に なる（名前では ない）", () => {
    expect(
      fillAnswer("そうです、◯◯ですね。サービスの ページを 見たんですね。", "ホームページ"),
    ).toBe("そうです、ホームページですね。サービスの ページを 見たんですね。");
  });

  it("答えが 空の ときは おうむ返しを 作らない（画面に 出す 文が 無い）", () => {
    expect(fillAnswer("◯◯さんですね。", "")).toBe("");
    expect(fillAnswer("◯◯さんですね。", "  ")).toBe("");
  });

  it("学習者の 名前は 混ざらない（この 順番の 取りちがえが 実際の バグだった）", () => {
    const echo = "そうです、◯◯ですね。";
    const learnerName = "ソピア";
    const answer = "ホームページを 作る 会社";
    // 呼び名を 先に 差し込んで から 答えを 入れると、答えが 入る ところが 残らない
    expect(fillAnswer(fillName(echo, learnerName), answer)).toBe("そうです、ソピアですね。");
    // 役を 分けた いまの 道
    expect(fillAnswer(echo, answer)).toBe("そうです、ホームページを 作る 会社ですね。");
  });
});

describe("型文（hint）の ◯◯ は どちらでも ない", () => {
  it("呼び名で 埋めない — 穴の まま 見せる", () => {
    const [pattern] = hintPatterns("「わたしは ◯◯から 来ました。」");
    expect(pattern).toBe("わたしは ◯◯から 来ました。");
    // 穴は 穴として 切り出される（画面は ここに 点線の 下じきを 描く）
    expect(hintSegments(pattern ?? "").some((seg) => seg.blank)).toBe(true);
  });
});

describe("日本語入力に なって いるか の 見守り", () => {
  it("ラテン文字だけの ときに 声を かける（IMEが 切れた まま 打った）", () => {
    expect(needsJapaneseInput("watashi wa Sopheak desu")).toBe(true);
    expect(needsJapaneseInput("Homepage")).toBe(true);
  });

  it("漢字・カタカナ混じりの 答えは 通す（ミーティングでは それが 正常）", () => {
    expect(needsJapaneseInput("ホームページを 作る 会社です。")).toBe(false);
    expect(needsJapaneseInput("わたしは カンボジアから 来ました。")).toBe(false);
    expect(needsJapaneseInput("たのしいです。")).toBe(false);
  });

  it("日本語に ローマ字が 混ざる のは 正しい 書き方（名前・会社名）", () => {
    expect(needsJapaneseInput("わたしは Sopheak です。")).toBe(false);
    expect(needsJapaneseInput("ITを 勉強して います。")).toBe(false);
  });

  it("空・記号だけでは 何も 言わない", () => {
    expect(needsJapaneseInput("")).toBe(false);
    expect(needsJapaneseInput("   ")).toBe(false);
    expect(needsJapaneseInput("……")).toBe(false);
  });
});
