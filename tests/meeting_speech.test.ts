import { describe, expect, it } from "vitest";
import {
  NAME_MARK,
  NO_NAME,
  answerCore,
  fillAnswer,
  fillName,
  shouldReplayAsk,
  stripDirections,
} from "../src/lib/meeting/speech";
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

  /*
   * 名前が まだ 無い 端末（診断を して いない・端末を 替えた）では、呼びかけに
   * 「あなた」を 入れると **「あなたさん」**に なって いた（実機で 出ていた）。
   * 日本語では 呼びかけは 落としても 文が 立つので、呼びかけごと 落とす。
   */
  it("名前が まだ 無い ときは 呼びかけごと 落とす（「あなたさん」に しない）", () => {
    expect(fillName("◯◯さんは、日本で どんな しごとを して みたいですか。", "")).toBe(
      "日本で どんな しごとを して みたいですか。",
    );
    expect(fillName("◯◯さん、こんにちは。", "")).toBe("こんにちは。");
    expect(fillName("◯◯さん、こんにちは。", "   ")).toBe("こんにちは。");
    expect(fillName("◯◯さんは、どこから 来ましたか。", "")).not.toContain(`${NO_NAME}さん`);
  });

  it("文の 途中の 呼びかけも 落とす（前の 文は 残す）", () => {
    expect(fillName("こんにちは。◯◯さんは、どこから 来ましたか。", "")).toBe(
      "こんにちは。どこから 来ましたか。",
    );
  });

  it("呼びかけで ない ◯◯ は「あなた」で 埋める（目印を 画面に 残さない）", () => {
    expect(fillName("きょうの ◯◯の 話、よかったです。", "")).toBe(
      `きょうの ${NO_NAME}の 話、よかったです。`,
    );
    expect(fillName("きょうの ◯◯の 話、よかったです。", "")).not.toContain(NAME_MARK);
  });
});

/*
 * おうむ返しに 入れる「答えの 中身」。
 *
 * 末尾の「します。」だけを 削る 作りだった ころ、型文どおりの 答え
 * 「ソピアです。よろしく おねがいします。」が「ソピアです。よろしく おねがいし」に なり、
 * 「◯◯さんですね。」へ 差し込まれて **「ソピアです。よろしく おねがいしさんですね。」**
 * と 表示されて いた（2回目の 通し検収で 実機再現）。
 */
describe("答えの 中身の 取り出し（answerCore）", () => {
  it("複数の 文は はじめの 1文だけ 見る（型文どおりの 答えが 壊れない）", () => {
    expect(answerCore("ソピアです。よろしく おねがいします。")).toBe("ソピア");
  });

  it("名詞＋です は コピュラだけ 落とす", () => {
    expect(answerCore("ホームページです。")).toBe("ホームページ");
    expect(answerCore("大阪と 東京です。")).toBe("大阪と 東京");
    expect(answerCore("ネクストメイクは、ホームページを 作る 会社です。")).toBe(
      "ネクストメイクは、ホームページを 作る 会社",
    );
  });

  it("文の あたまの「わたしは」は 中身では ない", () => {
    expect(answerCore("わたしは ソカです。")).toBe("ソカ");
  });

  it("動詞で 終わる 文は 述語を 文節ごと 落とす（語幹だけ 残さない）", () => {
    expect(answerCore("わたしは カンボジアから 来ました。")).toBe("カンボジア");
    expect(answerCore("わたしは プログラミングを 勉強して います。")).toBe("プログラミング");
  });

  it("あいづちだけの 文は 読みとばす（中身は そのつぎに ある）", () => {
    expect(answerCore("はい。ほうこくします。")).toBe("ほうこくします");
  });

  it("名詞の 並びは そのまま（述語が 無ければ 削らない）", () => {
    expect(answerCore("ホームページ")).toBe("ホームページ");
    expect(answerCore("ホームページを 作る 会社")).toBe("ホームページを 作る 会社");
  });

  it("空の 答えからは 中身が 取れない", () => {
    expect(answerCore("")).toBe("");
    expect(answerCore("   ")).toBe("");
    expect(answerCore("。")).toBe("");
  });
});

describe("答えの 差し込み（echo）", () => {
  it("◯◯ は **学習者の 答え**に なる（名前では ない）", () => {
    expect(
      fillAnswer("そうです、◯◯ですね。サービスの ページを 見たんですね。", "ホームページ"),
    ).toBe("そうです、ホームページですね。サービスの ページを 見たんですね。");
  });

  it("差し込む 前に 中身を 取り出す（生の 発話を そのまま 入れない）", () => {
    // 松井社長の 1問目。学習者は 画面の 型文どおりに 答える
    expect(
      fillAnswer(
        "◯◯さんですね。きょうは よく 来て くれました。",
        "ソピアです。よろしく おねがいします。",
      ),
    ).toBe("ソピアさんですね。きょうは よく 来て くれました。");
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

/*
 * 「もう いちど」で しつもんを 鳴らし直す 条件（2026-08-21 の 指定）。
 * 鍵の 無い 通し検証では ここを 通れない（「もう いちど」が 出ない）ので、
 * **画面で 確かめられない ぶんを ここで 固定する**。
 */
describe("もう いちどで しつもんを 鳴らし直すか", () => {
  it("作り置きの 音が あって、相手が 話して いなければ 鳴らす", () => {
    expect(shouldReplayAsk({ hasAudio: true, hostSpeaking: false })).toBe(true);
  });

  it("相手が 話して いる 間は 鳴らさない（声が 重なる）", () => {
    expect(shouldReplayAsk({ hasAudio: true, hostSpeaking: true })).toBe(false);
  });

  it("音が 無い しつもんでは 鳴らさない", () => {
    expect(shouldReplayAsk({ hasAudio: false, hostSpeaking: false })).toBe(false);
  });
});

describe("stripDirections（ト書きを 字に 残さない）", () => {
  it("説明として 長い かっこを 落とす", () => {
    expect(stripDirections("そうですか、よかったです。（学生の言葉を受け止めて、共感する）")).toBe(
      "そうですか、よかったです。",
    );
    expect(stripDirections("(the student should answer here) はい、そうです。")).toBe(
      "はい、そうです。",
    );
  });

  it("みじかい 言いかえは 残す（教材の ことばを 欠けさせない）", () => {
    expect(stripDirections("花見（はなみ）を します。")).toBe("花見（はなみ）を します。");
  });

  it("かっこが 無ければ そのまま", () => {
    expect(stripDirections("たこやき、おいしいですよね。")).toBe("たこやき、おいしいですよね。");
  });
});
