import { describe, expect, it } from "vitest";
import type { Word } from "../src/content/schema";
import type { MasteryMap } from "../src/lib/progress/store";
import { fieldForIndex, selectWords, shuffle, weightOf } from "../src/components/arcade/scheduler";

function word(id: string): Word {
  return {
    id,
    term: id,
    reading: "あ",
    meaningEn: `Meaning ${id}`,
    wrongMeanings: ["A", "B", "C"],
    explanationJa: "せつめい",
    example: "れいぶん",
  };
}

const WORDS = ["a", "b", "c", "d", "e"].map(word);

describe("出題スケジューラ（苦手な語を先に出す）", () => {
  it("まちがえた語ほど重みが大きい", () => {
    const mastery: MasteryMap = {
      a: { seen: 3, missed: 3 },
      b: { seen: 3, missed: 0 },
    };
    const now = Date.now();
    expect(weightOf("a", mastery, now)).toBeGreaterThan(weightOf("b", mastery, now));
  });

  it("直近にまちがえた語はさらに前に出る", () => {
    const now = Date.now();
    const recent: MasteryMap = {
      a: { seen: 1, missed: 1, lastMissedAt: new Date(now - 60_000).toISOString() },
    };
    const old: MasteryMap = {
      a: { seen: 1, missed: 1, lastMissedAt: new Date(now - 5 * 86_400_000).toISOString() },
    };
    expect(weightOf("a", recent, now)).toBeGreaterThan(weightOf("a", old, now));
  });

  it("得意な語も出なくならない（重みに下限がある）", () => {
    const mastery: MasteryMap = { a: { seen: 100, missed: 0 } };
    expect(weightOf("a", mastery, Date.now())).toBeGreaterThan(0);
  });

  it("まだ出ていない語は埋もれない", () => {
    const mastery: MasteryMap = { a: { seen: 5, missed: 0 } };
    const now = Date.now();
    expect(weightOf("new", mastery, now)).toBeGreaterThan(weightOf("a", mastery, now));
  });

  it("苦手な語は多数回の抽出で明らかに多く選ばれる", () => {
    const mastery: MasteryMap = { e: { seen: 4, missed: 4 } };
    let hits = 0;
    for (let seed = 0; seed < 200; seed += 1) {
      let v = seed * 2654435761;
      const rng = () => {
        v = (v * 1664525 + 1013904223) % 0x100000000;
        return v / 0x100000000;
      };
      if (selectWords({ words: WORDS, count: 2, mastery, rng }).some((w) => w.id === "e"))
        hits += 1;
    }
    // 一様抽選なら 2/5 = 40% 前後。重み付けで明確に上回ること。
    expect(hits / 200).toBeGreaterThan(0.55);
  });

  it("同じ語を二度選ばない（非復元抽出）", () => {
    const picked = selectWords({ words: WORDS, count: 5, rng: () => 0.5 });
    expect(new Set(picked.map((w) => w.id)).size).toBe(5);
  });

  it("要求数が語数を超えても壊れない", () => {
    expect(selectWords({ words: WORDS, count: 99, rng: () => 0.1 })).toHaveLength(5);
    expect(selectWords({ words: [], count: 3, rng: () => 0.1 })).toHaveLength(0);
  });

  it("シャッフルは元の配列を壊さず、要素を落とさない", () => {
    const source = [1, 2, 3, 4];
    const result = shuffle(source, () => 0.42);
    expect(source).toEqual([1, 2, 3, 4]);
    expect([...result].sort()).toEqual([1, 2, 3, 4]);
  });
});

describe("景色の切り替わり", () => {
  it("出題が進むと順に次のフィールドへ移る", () => {
    const seq = ["forest", "sky", "space"];
    expect(fieldForIndex(seq, 0, 9)).toBe("forest");
    expect(fieldForIndex(seq, 3, 9)).toBe("sky");
    expect(fieldForIndex(seq, 8, 9)).toBe("space");
  });

  it("最後の問題を超えても範囲外にならない", () => {
    expect(fieldForIndex(["forest", "sky"], 99, 4)).toBe("sky");
    expect(fieldForIndex([], 0, 4)).toBe("forest");
  });
});
