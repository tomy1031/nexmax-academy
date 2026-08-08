import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getClearedStageIds, markStageCleared } from "../src/lib/progress";

/**
 * ステージのクリア記録。
 *
 * 教材の画面はステージの並びを知らないので、書くときは並びを渡さない。
 * 並びが要る整理（消したステージのIDを捨てる・順に並べる）は**読むとき**に行う。
 */

const KEY = "nexmax.progress.v1";
const STAGE_IDS = ["hajimari", "asakai", "houkoku"];

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

beforeEach(() => {
  (globalThis as { window?: unknown }).window = { localStorage: fakeStorage() };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("markStageCleared", () => {
  it("クリアしたステージを足す", () => {
    markStageCleared("hajimari");
    expect(getClearedStageIds(STAGE_IDS)).toEqual(["hajimari"]);
  });

  it("同じステージを何度おえても重複しない", () => {
    markStageCleared("hajimari");
    markStageCleared("hajimari");
    expect(getClearedStageIds(STAGE_IDS)).toEqual(["hajimari"]);
  });

  it("あとから おえたステージも足せる（読むときにマップの順に並ぶ）", () => {
    markStageCleared("asakai");
    markStageCleared("hajimari");
    expect(getClearedStageIds(STAGE_IDS)).toEqual(["hajimari", "asakai"]);
  });

  it("保存が壊れていても落ちない（作り直す）", () => {
    window.localStorage.setItem(KEY, "{壊れたJSON");
    markStageCleared("hajimari");
    expect(getClearedStageIds(STAGE_IDS)).toEqual(["hajimari"]);
  });

  it("いまマップに無いステージのクリアは読むときに捨てられる", () => {
    markStageCleared("mukashi-no-stage");
    markStageCleared("hajimari");
    expect(getClearedStageIds(STAGE_IDS)).toEqual(["hajimari"]);
  });
});
