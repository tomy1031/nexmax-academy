import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIVE_TALK_MODEL,
  LIVE_TALK_MODELS,
  preferredLiveModel,
} from "../src/lib/ai/models";

/**
 * どのモデルで話すかは、**こちらの並び順**で決める。
 *
 * 「せつぞくを ためす」で拾った一覧の先頭を採っていたため、Google が返す順しだいで
 * 古いモデルが既定になっていた（新しい 3.1 が使えるのに 2.5 で話していた）。
 */
describe("たいわに使うモデルの選び方", () => {
  it("使えるなら、こちらの一覧の いちばん上（＝新しいほう）を選ぶ", () => {
    const available = ["gemini-2.5-flash-live", DEFAULT_LIVE_TALK_MODEL];
    expect(preferredLiveModel(available)).toBe(DEFAULT_LIVE_TALK_MODEL);
    // 相手の一覧の並びが逆でも結果は変わらない
    expect(preferredLiveModel([...available].reverse())).toBe(DEFAULT_LIVE_TALK_MODEL);
  });

  it("既定が使えないときは、こちらの一覧の つぎに新しいものへ落ちる", () => {
    const second = LIVE_TALK_MODELS[1]!;
    expect(preferredLiveModel(["gemini-2.5-flash-live", second])).toBe(second);
  });

  it("こちらの一覧に1つも無いときは、相手の先頭に従う（知らない新型を締め出さない）", () => {
    expect(preferredLiveModel(["gemini-9-future-live"])).toBe("gemini-9-future-live");
  });

  it("使えるものが1つも無ければ 既定を返す（呼ぶ側が空文字を扱わずに済む）", () => {
    expect(preferredLiveModel([])).toBe(DEFAULT_LIVE_TALK_MODEL);
  });
});
