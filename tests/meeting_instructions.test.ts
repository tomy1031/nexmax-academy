import { describe, expect, it } from "vitest";
import meeting from "../content/meetings/hajimari_meeting.json";
import {
  askInstruction,
  commonRules,
  listenInstruction,
  type InstructionSource,
} from "../src/lib/meeting/instructions";

/**
 * 相手に 渡す 指示文
 *
 * ここで 見張るのは **地の文が 消えて いない こと**。かっこ禁止・ト書き禁止・
 * 相手から しつもんしない——どれも 実際に 起きた 事故を 止める ために 入って いる
 *（ト書きの 読み上げ・自己紹介への 割り込み・聞いて いない のに 開く 札）。
 * 管理画面から 触れるのは 差しこみ（persona・discover・名前）だけ、という 線を
 * ここで 固定する。
 */

const source: InstructionSource = {
  persona: meeting.persona,
  hostName: meeting.host.name,
  discover: meeting.discover,
};

describe("両方の ばんに 置く もの", () => {
  it("人格が いちばん 上に 来る（先生が 直す ところ）", () => {
    expect(commonRules(source).startsWith(meeting.persona)).toBe(true);
  });

  it("出力の 衛生は 消せない ところに ある", () => {
    const text = commonRules(source);
    expect(text).toContain("かっこ（）は つかわないで ください。");
    expect(text).toContain("日本語の 直しは 言わないで ください");
    expect(text).toContain("あなたから 学生に しつもんを しては いけません。");
  });
});

describe("ラウンド1（答える ばん）", () => {
  const text = askInstruction(source);

  it("衛生の 上に 進み方が のる", () => {
    expect(text.startsWith(commonRules(source))).toBe(true);
  });

  it("しつもんは 画面が する。相手は 受け止めるだけ", () => {
    expect(text).toContain("しつもんは 画面が します。");
    expect(text).toContain("1回の 返事は 2文までです。");
  });

  /*
   * ここで 話を させると、自己紹介の 途中に ドローンの 話が 割り込む
   *（2026-08-21 の 実発生）。ラウンド2の 楽しみも 先に 使って しまう。
   */
  it("話せる ことを 渡さない", () => {
    for (const item of meeting.discover) expect(text).not.toContain(item.answer);
  });
});

describe("ラウンド2（聞く ばん）", () => {
  const text = listenInstruction(source, "ソク");

  it("話題と 話を 1行で 向かい合わせる", () => {
    for (const item of meeting.discover) {
      expect(text).toContain(`- 「${item.label}」を 聞かれたら: ${item.answer}`);
    }
  });

  it("できごとと 数は 変えさせない（事実は 教材が 持つ）", () => {
    expect(text).toContain("できごとと 数は 変えません");
  });

  it("名前は こちらで 渡す（張り直しで 相手の 記憶は 消えて いる）", () => {
    expect(text).toContain("ソクさんと 呼んで ください。");
  });

  it("名前が まだ 無い ときは その 行ごと 出さない", () => {
    expect(listenInstruction(source, "")).not.toContain("と 呼んで ください。");
  });

  /* 見つける ことが 0の 教材（かいしゃの ミーティング）でも 成り立つ */
  it("話せる ことが 無い 教材でも 組み上がる", () => {
    const bare = listenInstruction({ ...source, discover: [] }, "ソク");
    // 話す ことが 無いので 節ごと 出さない。かわりに 短く 答える 決まりだけ 残る
    expect(bare).not.toContain("聞かれたら 話す こと");
    expect(bare).toContain("知らない ことを 聞かれたら、2文までで みじかく 答えます。");
  });
});
