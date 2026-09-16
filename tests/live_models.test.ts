import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LIVE_TALK_MODEL,
  isSupersededLiveDefault,
  LIVE_TALK_MODELS,
  LIVE_TEXT_MODELS,
  LIVE_TTS_MODELS,
  preferredLiveModel,
} from "../src/lib/ai/models";
import { getLiveModel, saveLiveModel } from "../src/lib/profile";

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

/**
 * 3.8 Live を 先頭に する（2026-09-16）
 *
 * Live の つなぎは 3つ（たいわ・音声づくり・見かた）あり、一覧も 3つ ある。
 * 1つだけ 古い 先頭が 残ると「たいわは 3.8 なのに 見かたは 3.1」と なり、追いにくい。
 */
describe("Live の 先頭は 3.8", () => {
  it("3つの 一覧が どれも gemini-3.8-live から ためす", () => {
    expect(LIVE_TALK_MODELS[0]).toBe("gemini-3.8-live");
    expect(LIVE_TTS_MODELS[0]).toBe("gemini-3.8-live");
    expect(LIVE_TEXT_MODELS[0]).toBe("gemini-3.8-live");
    expect(DEFAULT_LIVE_TALK_MODEL).toBe("gemini-3.8-live");
  });

  it("3.8 に つながらない 鍵の ために、3.1 を 控えとして 残す", () => {
    for (const list of [LIVE_TALK_MODELS, LIVE_TTS_MODELS, LIVE_TEXT_MODELS]) {
      expect(list).toContain("gemini-3.1-flash-live-preview");
    }
  });

  it("たいわと 音声づくりは 同じ 並び（片方だけ 古い 名前が 残らない）", () => {
    expect([...LIVE_TTS_MODELS]).toEqual([...LIVE_TALK_MODELS]);
  });

  it("使える 一覧に 3.8 と 3.1 が あれば 3.8 を 選ぶ", () => {
    expect(preferredLiveModel(["gemini-3.1-flash-live-preview", "gemini-3.8-live"])).toBe(
      "gemini-3.8-live",
    );
  });
});

/** localStorage の 代わり（node には 無い）。 */
function stubStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
      removeItem: (key: string) => void map.delete(key),
    },
  });
}

describe("端末に 残った 前の 既定は、3.8 より 先に 使わない", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("「保存」で 残った 3.1 は 選んで いないのと 同じ（一覧の 先頭＝3.8 に なる）", () => {
    expect(isSupersededLiveDefault("gemini-3.1-flash-live-preview")).toBe(true);
    stubStorage({ "nexmax.liveModel": "gemini-3.1-flash-live-preview" });
    expect(getLiveModel()).toBe("");
  });

  it("先生が 選んだ ほかの 名前は そのまま 使う（締め出さない）", () => {
    for (const chosen of ["gemini-3.8-live", "gemini-2.5-flash-native-audio-preview-12-2025"]) {
      expect(isSupersededLiveDefault(chosen)).toBe(false);
      stubStorage();
      saveLiveModel(chosen);
      expect(getLiveModel()).toBe(chosen);
    }
  });

  it("何も 残って いなければ 空（呼ぶ側が 一覧の 先頭を 使う）", () => {
    stubStorage();
    expect(getLiveModel()).toBe("");
    expect(isSupersededLiveDefault("")).toBe(false);
  });
});
