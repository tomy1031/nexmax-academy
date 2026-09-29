import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  markStageCleared,
  rememberStudyingStage,
  studyingStageSnapshot,
} from "../src/lib/progress";

/**
 * 「いま 学習中の ステージ」の 控え。教材を 開いた ときに 書き、地図が 読む。
 */

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

describe("rememberStudyingStage", () => {
  it("まだ何も開いていなければ空", () => {
    expect(studyingStageSnapshot()).toBe("");
  });

  it("開いたステージを覚え、あとから開いたほうで上書きする", () => {
    rememberStudyingStage("houkoku");
    rememberStudyingStage("renraku");
    expect(studyingStageSnapshot()).toBe("renraku");
  });

  it("クリア済みのステージを見直しても、学習中のステージは動かない", () => {
    markStageCleared("hajimari");
    rememberStudyingStage("renraku");
    rememberStudyingStage("hajimari");
    expect(studyingStageSnapshot()).toBe("renraku");
  });

  it("保存できない端末でも投げない（教材の画面ごと落とさない）", () => {
    const broken = fakeStorage();
    broken.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    broken.getItem = () => {
      throw new Error("SecurityError");
    };
    (globalThis as { window?: unknown }).window = { localStorage: broken };
    expect(() => rememberStudyingStage("houkoku")).not.toThrow();
    expect(studyingStageSnapshot()).toBe("");
  });

  it("ブラウザの外では何もしない", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(() => rememberStudyingStage("houkoku")).not.toThrow();
    expect(studyingStageSnapshot()).toBe("");
  });
});
