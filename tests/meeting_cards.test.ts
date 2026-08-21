import { describe, expect, it } from "vitest";
import meeting from "../content/meetings/hajimari_meeting.json";
import { buildCardPrompt, parseCardHit, type CardTopic } from "../src/lib/meeting/judge";
import { normalizeReading } from "../src/lib/text/normalize";

/**
 * ラウンド2の 札の 当たり判定
 *
 * 2段で 見る。①ことばの 照合（決定的・鍵が 無くても 動く）→ ②外れた ときだけ AI。
 * ここで 固定するのは **①が 開けすぎない こと**と、②の 受け取り方。
 * 「開くべきで ないのに 開く」は ①で 抑え、「開くべき なのに 開かない」を ②が 救う。
 */

/** 画面と 同じ 当て方（`noteDiscovered` の ことばの 照合の ぶん）。 */
function keywordHit(text: string): string | null {
  const asked = normalizeReading(text);
  const hit = meeting.discover.find((item) =>
    item.keywords.some((word) => asked.includes(normalizeReading(word))),
  );
  return hit?.id ?? null;
}

describe("ことばの 照合", () => {
  it("その 話題を 聞いた ときは 開く", () => {
    expect(keywordHit("はじめて 日本に 来た ときは、どうでしたか。")).toBe("eki");
    expect(keywordHit("しごとで いちばん うれしかった ことは 何ですか。")).toBe("ureshii");
    expect(keywordHit("日本で びっくりした ことは ありますか。")).toBe("otoshimono");
    expect(keywordHit("日本の 春は、どんな かんじですか。")).toBe("sakura");
    expect(keywordHit("日本語で むずかしい ところは ありますか。")).toBe("sumimasen");
  });

  /*
   * 札の 表は **聞く ための 話題**で、中身（エピソード）は 出さない
   *（2026-08-21 の 指定「カードの 内容が 具体的すぎます」）。
   * だから 表の ことばを そのまま 読んで 聞いても 当たる、という ことを 固定する。
   */
  it("札に 書いて ある とおりに 聞いても 当たる", () => {
    for (const item of meeting.discover) {
      expect(keywordHit(`${item.label}を 教えて ください。`)).toBe(item.id);
    }
  });

  it("カタカナで 書いても 開く（表記ゆれは 正規化が 吸収する）", () => {
    expect(keywordHit("サイフを ナクシタ ことは ありますか。")).toBe("otoshimono");
  });

  /*
   * ここが 本題。短い ことばを 札に 置くと、**関係の 無い しつもんで 開く**。
   * 「はな」は「はなし」に、「音」は「音楽」に 当たって いた（2026-08-21 に fable が 指摘）。
   */
  it("関係の 無い しつもんでは 開かない", () => {
    expect(keywordHit("日本の はなしを して ください。")).toBeNull();
    expect(keywordHit("すきな 音楽は 何ですか。")).toBeNull();
    expect(keywordHit("きょうは あついですね。")).toBeNull();
  });
});

describe("AIの 二の手", () => {
  const topics: readonly CardTopic[] = [
    { id: "eki", label: "日本に 来た ばかりの ころ" },
    { id: "yuki", label: "日本の 冬の こと" },
  ];

  it("たのむ 文に 話題の id と 見出しが 並ぶ", () => {
    const prompt = buildCardPrompt(topics, "日本に 来て、こまった ことは ありますか。");
    expect(prompt).toContain("- eki: 日本に 来た ばかりの ころ");
    expect(prompt).toContain("日本に 来て、こまった ことは ありますか。");
    // 迷ったら 開かない 側に 寄せる（1つ しつもんして 何枚も 開かない）
    expect(prompt).toContain("none");
  });

  it("知って いる id だけ 受け取る", () => {
    expect(parseCardHit({ cardId: "eki" }, topics)).toBe("eki");
    expect(parseCardHit({ cardId: " yuki " }, topics)).toBe("yuki");
  });

  it("none・知らない id・形が 崩れた ものは 当たり無し", () => {
    expect(parseCardHit({ cardId: "none" }, topics)).toBeNull();
    expect(parseCardHit({ cardId: "sakura" }, topics)).toBeNull();
    expect(parseCardHit({ cardId: 3 }, topics)).toBeNull();
    expect(parseCardHit(null, topics)).toBeNull();
    expect(parseCardHit({}, topics)).toBeNull();
  });
});
