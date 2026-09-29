import { describe, expect, it } from "vitest";

import {
  clearAsakaiDraft,
  clearAsakaiResume,
  isOneShotDay,
  readAsakaiResume,
  restoreAsakai,
  saveAsakaiDraft,
  saveAsakaiResume,
  startAsakaiFrom,
  type DayResult,
} from "@/lib/meeting/asakai-resume";
import type { ProgressBackend } from "@/lib/progress/store";

/*
 * **5日 そろって 週の けっかを まだ 閉じて いない**（2026-09-28 の 点検 B4）
 *
 * 前は 5日 そろった しおりを「完走ずみ」と して 月曜から 始めた ので、
 * 金曜の 評価を 読んで いる 最中に 更新・退室すると 5日ぶんが 消えて いた。
 */
function memory(): ProgressBackend {
  const raw = new Map<string, string>();
  return {
    get: (key) => raw.get(key) ?? null,
    set: (key, value) => void raw.set(key, value),
    remove: (key) => void raw.delete(key),
    keys: () => [...raw.keys()],
  };
}

function day(name: string): DayResult {
  return {
    day: name,
    kind: "asa",
    cards: 4,
    cardTotal: 4,
    units: 4,
    unitTotal: 4,
    komariOpen: true,
    komariBoxes: 1,
    komariTotal: 1,
    probes: 0,
    chips: [{ label: "きのう", open: true }],
  };
}

const WEEK = ["月曜日", "火曜日", "水曜日", "木曜日", "金曜日"].map(day);
const DRAFT = { states: [], attempts: {}, probes: 0, askedId: null, lines: [], log: [] };

describe("週の けっか待ち", () => {
  it("5日 そろって 印が あれば、週の けっかから 始める", () => {
    const start = startAsakaiFrom({ done: WEEK, weekPending: true }, 5);
    expect(start).toEqual({ sceneAt: 4, results: WEEK, resumed: true, weekPending: true });
  });

  it("印が 無い 古い しおりは これまでどおり 月曜から", () => {
    expect(startAsakaiFrom({ done: WEEK }, 5).sceneAt).toBe(0);
  });

  it("5日目を 保存すると 印が 立つ（場面の 数を 渡した とき）", () => {
    const backend = memory();
    saveAsakaiResume("m", WEEK.slice(0, 4), backend, 5);
    expect(readAsakaiResume("m", backend)?.weekPending).toBe(false);
    saveAsakaiResume("m", WEEK, backend, 5);
    expect(readAsakaiResume("m", backend)?.weekPending).toBe(true);
    expect(restoreAsakai("m", 5, backend).weekPending).toBe(true);
  });

  /* 3つの 書き手は どれも しおりを 組み直す ので、印を 落とさない ことを 見る。 */
  it("途中の 保存・途中の 削除・場面の 数を 渡さない 保存で 印を 落とさない", () => {
    const backend = memory();
    saveAsakaiResume("m", WEEK, backend, 5);
    saveAsakaiDraft("m", "fri", DRAFT, backend);
    expect(readAsakaiResume("m", backend)?.weekPending).toBe(true);
    clearAsakaiDraft("m", "fri", backend);
    expect(readAsakaiResume("m", backend)?.weekPending).toBe(true);
    saveAsakaiResume("m", WEEK, backend);
    expect(readAsakaiResume("m", backend)?.weekPending).toBe(true);
  });

  /* 開き直した あとも 聞き返しの 問いを AIに 渡せる ように（code-critic 検収・A3）。 */
  it("途中に 聞き返しの 字を 残し、読み戻せる", () => {
    const backend = memory();
    saveAsakaiDraft(
      "m",
      "tue",
      { ...DRAFT, askedId: "shinchoku", askedText: "進捗を、パーセントで お願いします。" },
      backend,
    );
    expect(readAsakaiResume("m", backend)?.drafts.tue?.askedText).toBe(
      "進捗を、パーセントで お願いします。",
    );
  });

  it("週の けっかを 閉じたら（しおりを 消す）月曜から", () => {
    const backend = memory();
    saveAsakaiResume("m", WEEK, backend, 5);
    clearAsakaiResume("m", backend);
    expect(restoreAsakai("m", 5, backend).sceneAt).toBe(0);
  });
});

/*
 * **★ 1回で ぜんぶ 言えた 曜日**（2026-09-29 の 指定）。欄は 足さず、
 * 聞き返しの 回数と 開いた 札の 数から 決める（古い しおりにも そのまま 付く）。
 */
describe("isOneShotDay", () => {
  it("聞き返し 0回で 札が ぜんぶ ⭕ なら ★", () => {
    expect(isOneShotDay(day("月曜日"))).toBe(true);
  });

  it("聞き返しが 1回でも あれば ★では ない（あとで ぜんぶ 開いても）", () => {
    expect(isOneShotDay({ ...day("水曜日"), probes: 1 })).toBe(false);
  });

  it("開かなかった 札が あれば ★では ない", () => {
    expect(isOneShotDay({ ...day("木曜日"), cards: 3 })).toBe(false);
  });

  it("札の ない 日（壊れた 記録）には 付けない", () => {
    expect(isOneShotDay({ ...day("金曜日"), cards: 0, cardTotal: 0 })).toBe(false);
  });
});
