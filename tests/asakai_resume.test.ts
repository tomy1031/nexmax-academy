import { describe, expect, it } from "vitest";

import {
  clearAsakaiDraft,
  clearAsakaiResume,
  readAsakaiDraft,
  readAsakaiResume,
  refreshSavedLines,
  restoreAsakai,
  saveAsakaiDraft,
  saveAsakaiResume,
  startAsakaiFrom,
  voicedLinesBySlot,
  voicedSlotOf,
  type AsakaiResume,
  type DayResult,
} from "@/lib/meeting/asakai-resume";
import type { ProgressBackend } from "@/lib/progress/store";
import kantan from "../content/meetings/asakai_kantan.json";
import muzukashii from "../content/meetings/asakai_muzukashii.json";

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

/**
 * 開き直した ときは **今の 教材の 文と 音**で 鳴らす（2026-09-29 に 実発生）。
 * 途中の しおりは 行を 保存した ときの 形で 持つので、そのまま 鳴らすと
 * `ABA` を 直す 前の 古い「アバペイ」の 声が 鳴りつづけた。
 */
describe("保存した 会話を 今の 教材に 合わせ直す", () => {
  const monday = kantan.asakai.scenes.at(0);
  const now = voicedLinesBySlot(monday);

  it("音の 場所から 行の 鍵を 取り出す（文の 指紋は 捨てる）", () => {
    expect(voicedSlotOf("/audio/meetings/asakai_kantan/s0-sample-da68de59.wav")).toBe(
      "asakai_kantan/s0-sample",
    );
    expect(voicedSlotOf("/audio/meetings/asakai_kantan/s3-arrange-done-9054f169.wav")).toBe(
      "asakai_kantan/s3-arrange-done",
    );
    expect(
      voicedSlotOf("/audio/meetings/kaisha_matsui/closing.wav"),
      "指紋の 無い 名前",
    ).toBeNull();
    expect(voicedSlotOf(undefined)).toBeNull();
  });

  it("古い 音の 行は、今の 文と 音に 差し替わる", () => {
    const sample = monday?.sample;
    expect(sample?.audio, "月曜の 見本に 音が 無い").toBeTruthy();
    const [line] = refreshSavedLines(
      [
        {
          who: "ヘンディ",
          speakerId: "hendy",
          text: "（直す 前の 文）",
          audio: "/audio/meetings/asakai_kantan/s0-sample-da68de59.wav",
        },
      ],
      now,
      "asakai_kantan",
    );
    expect(line?.audio).toBe(sample?.audio);
    expect(line?.text).toBe(sample?.text);
    expect(line?.who, "話し手は そのまま").toBe("ヘンディ");
  });

  it("話し手が ちがえば 差し替えない（並びが 変わって 鍵が 別の 人の 行に なった とき）", () => {
    const member = monday?.members.at(0);
    expect(member?.audio, "月曜の メンバーに 音が 無い").toBeTruthy();
    const slot = voicedSlotOf(member?.audio);
    const saved = {
      who: "だれか",
      speakerId: `not-${member?.speakerId ?? ""}`,
      text: "（前の 並びの 文）",
      audio: `/audio/meetings/${slot ?? ""}-0badbeef.wav`,
    };
    const [line] = refreshSavedLines([saved], now, "asakai_kantan");
    expect(line?.text, "別の 人の 文が 入った").toBe("（前の 並びの 文）");
    expect(line?.audio, "古い 声が 残って いる").toBeUndefined();
  });

  it("この 教材の 行なのに 今は 無い ときは、字だけ 残して 古い 声は 鳴らさない", () => {
    const gone = {
      who: "ヘンディ",
      speakerId: "hendy",
      text: "もう 無い セリフ",
      audio: "/audio/meetings/asakai_kantan/s0-nothing-0-12345678.wav",
    };
    const [line] = refreshSavedLines([gone], now, "asakai_kantan");
    expect(line?.text).toBe("もう 無い セリフ");
    expect(line?.audio).toBeUndefined();
  });

  it("学習者の 発話・音の 無い 行・ほかの 教材の 行は そのまま 残す", () => {
    const mine = {
      who: "",
      speakerId: "me",
      text: "きのうは 決済の 画面を 作りました。",
      self: true,
    };
    const called = {
      who: "ヘンディ",
      speakerId: "hendy",
      text: "では 次に トミーさん、お願いします。",
    };
    const other = {
      who: "松井",
      speakerId: "matsui",
      text: "ほかの 教材",
      audio: "/audio/meetings/kaisha_matsui/s0-sample-12345678.wav",
    };
    expect(refreshSavedLines([mine, called, other], now, "asakai_kantan")).toEqual([
      mine,
      called,
      other,
    ]);
  });

  it("朝礼・夕礼とも、1つの 場面の 中で 音の 行の 鍵が 重ならない", () => {
    for (const [name, meeting] of [
      ["朝礼", kantan],
      ["夕礼", muzukashii],
    ] as const) {
      meeting.asakai.scenes.forEach((scene, at) => {
        const audios = new Set<string>();
        const walk = (value: unknown): void => {
          if (Array.isArray(value)) return value.forEach(walk);
          if (!value || typeof value !== "object") return;
          const audio = (value as { audio?: unknown }).audio;
          if (typeof audio === "string") audios.add(audio);
          Object.values(value).forEach(walk);
        };
        walk(scene);
        expect(
          voicedLinesBySlot(scene).size,
          `${name} ${at + 1}日目: 同じ 鍵の 行が 2つ ある`,
        ).toBe(audios.size);
      });
    }
  });
});
