import { describe, expect, it } from "vitest";

import {
  clearAsakaiDraft,
  clearAsakaiResume,
  readAsakaiDraft,
  readAsakaiResume,
  restoreAsakai,
  saveAsakaiDraft,
  saveAsakaiResume,
  startAsakaiFrom,
  type AsakaiResume,
  type DayResult,
} from "@/lib/meeting/asakai-resume";
import type { ProgressBackend } from "@/lib/progress/store";

/** 端末の かわり（`localStorage` と 同じ 形だけ 持つ）。 */
function memory(): ProgressBackend & { raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return {
    raw,
    get: (key) => raw.get(key) ?? null,
    set: (key, value) => void raw.set(key, value),
    remove: (key) => void raw.delete(key),
    keys: () => [...raw.keys()],
  };
}

function day(name: string, cards = 4): DayResult {
  return {
    day: name,
    kind: "asa",
    cards,
    cardTotal: 4,
    units: cards,
    unitTotal: 4,
    komariOpen: true,
    komariBoxes: 1,
    komariTotal: 1,
    probes: 0,
    chips: [{ label: "きのう", open: true }],
  };
}

describe("startAsakaiFrom — 戻す 単位は 日", () => {
  it("保存が 無ければ 月曜から", () => {
    expect(startAsakaiFrom(null, 5)).toEqual({ sceneAt: 0, results: [], resumed: false });
  });

  it("空の 保存も 月曜から", () => {
    expect(startAsakaiFrom({ done: [] }, 5).sceneAt).toBe(0);
  });

  it("終わった日の 数が そのまま つぎの 曜日に なる", () => {
    const saved: Pick<AsakaiResume, "done"> = { done: [day("月曜日"), day("火曜日")] };
    const start = startAsakaiFrom(saved, 5);
    expect(start.sceneAt).toBe(2);
    expect(start.results).toHaveLength(2);
    expect(start.resumed).toBe(true);
  });

  it("5日 終わって いたら 月曜から（何度でも 話せる）", () => {
    const done = ["月", "火", "水", "木", "金"].map((name) => day(name));
    expect(startAsakaiFrom({ done }, 5)).toEqual({
      sceneAt: 0,
      results: [],
      resumed: false,
    });
  });

  it("教材が 短く なって はみ出す ときも 月曜から", () => {
    const done = [day("月"), day("火"), day("水")];
    expect(startAsakaiFrom({ done }, 3).sceneAt).toBe(0);
  });
});

describe("読み書き", () => {
  it("書いた ものが そのまま 戻る", () => {
    const backend = memory();
    saveAsakaiResume("asakai_kantan", [day("月曜日"), day("火曜日", 3)], backend);
    const start = restoreAsakai("asakai_kantan", 5, backend);
    expect(start.sceneAt).toBe(2);
    expect(start.results[1]?.cards).toBe(3);
  });

  it("教材ごとに 別の しおり", () => {
    const backend = memory();
    saveAsakaiResume("asakai_kantan", [day("月曜日")], backend);
    expect(restoreAsakai("asakai_muzukashii", 5, backend).sceneAt).toBe(0);
  });

  it("消したら 月曜から", () => {
    const backend = memory();
    saveAsakaiResume("asakai_kantan", [day("月曜日")], backend);
    clearAsakaiResume("asakai_kantan", backend);
    expect(readAsakaiResume("asakai_kantan", backend)).toBeNull();
    expect(restoreAsakai("asakai_kantan", 5, backend).sceneAt).toBe(0);
  });

  it("壊れた 保存値は 無かった ことに する（学習は つづけられる）", () => {
    const backend = memory();
    backend.set("nexmax:v1:asakai-resume:asakai_kantan", "{ こわれて いる");
    expect(readAsakaiResume("asakai_kantan", backend)).toBeNull();
    expect(restoreAsakai("asakai_kantan", 5, backend).sceneAt).toBe(0);
  });

  it("欄が 足りない 古い しおりも 落とさない（既定で うめる）", () => {
    const backend = memory();
    backend.set(
      "nexmax:v1:asakai-resume:asakai_kantan",
      JSON.stringify({
        meetingId: "asakai_kantan",
        done: [{ day: "月曜日", kind: "asa", cards: 4, cardTotal: 4, units: 4, unitTotal: 4 }],
      }),
    );
    const start = restoreAsakai("asakai_kantan", 5, backend);
    expect(start.sceneAt).toBe(1);
    expect(start.results[0]?.probes).toBe(0);
    expect(start.results[0]?.chips).toEqual([]);
  });
});

/**
 * **話しかけた 日は 途中から 戻る**（2026-09-17 の 指定）
 *
 * ここまでは 終わった 日しか 残して いなかった ので、火曜を 話しかけた まま
 * 月曜の タブを 見に 行くと、戻った ときには 板が 空に なって いた。
 */
describe("報告の 途中", () => {
  const draft = (said: string[]) => ({
    states: [{ id: "kinou", said, open: said.length > 0, full: said.length > 0, gaveUp: false }],
    attempts: { kinou: 1 },
    probes: 1,
    askedId: "shinchoku",
    lines: [{ who: "ヘンディ", speakerId: "hendy", text: "おはよう ございます。" }],
    /* 送った ことばも 控えに 入れる（開き直した ときに 札を 押せる ように）。 */
    log: [{ question: "", answer: "先週の 金曜日は…", heard: true, opened: 1 }],
  });

  it("書いた 途中が そのまま 戻る", () => {
    const backend = memory();
    saveAsakaiDraft("m", "tue", draft(["kinou1"]), backend);
    expect(readAsakaiDraft("m", "tue", backend)).toEqual(draft(["kinou1"]));
    expect(readAsakaiDraft("m", "wed", backend), "別の 日に 漏れて いる").toBeNull();
  });

  it("終わった日を 書いても 途中は 消えない", () => {
    const backend = memory();
    saveAsakaiDraft("m", "tue", draft(["kinou1"]), backend);
    saveAsakaiResume("m", [day("月曜日")], backend);
    expect(
      readAsakaiDraft("m", "tue", backend),
      "しおりの 書き込みで 途中が 消えた",
    ).not.toBeNull();
    expect(readAsakaiResume("m", backend)?.done).toHaveLength(1);
  });

  it("途中を 捨てても、ほかの 日と 終わった日は 残る", () => {
    const backend = memory();
    saveAsakaiDraft("m", "tue", draft(["kinou1"]), backend);
    saveAsakaiDraft("m", "wed", draft([]), backend);
    saveAsakaiResume("m", [day("月曜日")], backend);
    clearAsakaiDraft("m", "tue", backend);
    expect(readAsakaiDraft("m", "tue", backend)).toBeNull();
    expect(readAsakaiDraft("m", "wed", backend)).not.toBeNull();
    expect(readAsakaiResume("m", backend)?.done).toHaveLength(1);
  });
});
