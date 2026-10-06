/**
 * 修了証の 中身（src/lib/certificate/model.ts）と 1回ぶんの 記録（run.ts）の 見張り
 *
 * 2026-10-06 の 指定（願い #562）と 同日の 決定:
 * - リスニングの パーフェクト = こたえあわせを 見る 前に 100%・あいことばを 使わない（ミスは 許す）
 * - タイピングの パーフェクト = ❌ が 1回も 無い（前の 回の 続きから 始めた 回は パーフェクトに しない）
 * - パーフェクトで ない ときは 理由を はっきり 書く（規律1）
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  certificateFileName,
  certificateLines,
  formatIssuedAt,
  listeningResult,
  notPerfectReasons,
  typingResult,
} from "../src/lib/certificate/model";
import { endRun, readRun, startRun, updateRun } from "../src/lib/certificate/run";
import {
  isFullyRevealed,
  createListening,
  submitListening,
  revealRate,
} from "../src/components/listening/listening-checks";

describe("リスニングの パーフェクト", () => {
  const base = { score: 120, misses: 0, usedRescue: false, reviewedEarly: false };

  it("こたえあわせの 前に 100%・あいことば なし なら パーフェクト（ミスが あっても）", () => {
    expect(listeningResult("l1", "題", base).perfect).toBe(true);
    expect(listeningResult("l1", "題", { ...base, misses: 5 }).perfect).toBe(true);
  });

  it("あいことばを 使った・100%の 前に こたえあわせを 見た なら パーフェクトで ない（理由を 書く）", () => {
    const rescued = listeningResult("l1", "題", { ...base, usedRescue: true });
    expect(rescued.perfect).toBe(false);
    expect(notPerfectReasons(rescued)).toEqual(["あいことばを 使いました。"]);
    const early = listeningResult("l1", "題", { ...base, reviewedEarly: true });
    expect(early.perfect).toBe(false);
    expect(notPerfectReasons(early)).toEqual(["100%に なる 前に こたえあわせを 見ました。"]);
  });

  it("成績の 行に 100%・スコア・ミス・あいことば・こたえあわせ が 並ぶ", () => {
    const lines = certificateLines(listeningResult("l1", "題", { ...base, misses: 2 }));
    expect(lines.map((line) => line.value)).toEqual([
      "100%",
      "120点",
      "2回",
      "使わなかった",
      "100%の あとに 見た",
    ]);
  });
});

describe("タイピングの パーフェクト", () => {
  it("❌ が 0回 なら パーフェクト。1回でも あれば パーフェクトで ない", () => {
    expect(
      typingResult("t1", "題", { total: 3, missesBySentence: [0, 0, 0], partial: false }).perfect,
    ).toBe(true);
    const missed = typingResult("t1", "題", {
      total: 3,
      missesBySentence: [0, 2, 0],
      partial: false,
    });
    expect(missed.perfect).toBe(false);
    expect(missed.score).toBe(2);
    expect(missed.misses).toBe(2);
    expect(notPerfectReasons(missed)).toEqual(["❌ が 2回 ありました。"]);
  });

  it("前の 回の 続きから 始めた 回は ❌0 でも パーフェクトで ない", () => {
    const partial = typingResult("t1", "題", {
      total: 3,
      missesBySentence: [0, 0, 0],
      partial: true,
    });
    expect(partial.perfect).toBe(false);
    expect(notPerfectReasons(partial)).toEqual(["前の 回の 続きから 始めました。"]);
  });
});

describe("時刻と ファイル名は カンボジアの 時刻（ICT）に 固定", () => {
  it("UTC の 時刻を ICT（+7時間）で 書く", () => {
    expect(formatIssuedAt("2026-10-06T07:05:00Z")).toBe("2026/10/06 14:05（ICT）");
    expect(certificateFileName("houkoku_kanryou_typing", "2026-10-06T17:30:00Z")).toBe(
      "nexmax-certificate_houkoku_kanryou_typing_20261007-0030.png",
    );
  });
});

describe("1回ぶんの 記録（端末）", () => {
  // node には localStorage が 無いので 最小の ものを 置く（admin_flag.test.ts と 同じ 流儀）
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => void data.set(key, value),
        removeItem: (key: string) => void data.delete(key),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("開き直しても 積んだ 数は 残り、回を 終えると 消える", () => {
    startRun("x", { misses: 0 });
    updateRun("x", (run) => ({ ...run, misses: (run.misses ?? 0) + 2 }));
    updateRun("x", (run) => ({ ...run, usedRescue: true }));
    expect(readRun("x")).toMatchObject({ misses: 2, usedRescue: true });
    endRun("x");
    expect(readRun("x")).toBeNull();
  });
});

describe("100% は 丸めずに 数える", () => {
  it("1字でも 残って いれば 100%と 言わない（表示の 割合は 丸めて 100 に なる ことが ある）", () => {
    const text =
      "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん".repeat(
        5,
      );
    let state = createListening(text, [], { minLength: 1, maxMiss: 99 });
    state = submitListening(state, text.slice(0, -1));
    // 225字中 224字 → 四捨五入では 100 に なるが、表示も 99 に とどめる（修了証の 100%では ない）
    expect(revealRate(state)).toBe(99);
    expect(isFullyRevealed(state)).toBe(false);
  });
});

describe("続きから・こたえあわせを 見た あとの やりなおし（code-critic の 指摘）", () => {
  it("タイピング: 打って いない 文（null）は「1回で 正解」に 数えず、パーフェクトに しない", () => {
    const result = typingResult("t1", "題", {
      total: 13,
      missesBySentence: [...Array.from({ length: 12 }, () => null), 0],
      partial: true,
    });
    expect(result.perfect).toBe(false);
    expect(result.score).toBe(1);
    expect(result.detail).toMatchObject({ judged: 1, partial: true });
    expect(certificateLines(result).map((line) => line.value)).toContain("1 / 13文");
  });

  it("タイピング: 1文目から 始めても、打って いない 文が 残れば パーフェクトに しない", () => {
    const result = typingResult("t1", "題", {
      total: 3,
      missesBySentence: [0, null, 0],
      partial: false,
    });
    expect(result.perfect).toBe(false);
  });

  it("リスニング: 続きから・こたえあわせを 見た あとの やりなおしは パーフェクトに しない（理由を 書く）", () => {
    const base = { score: 50, misses: 0, usedRescue: false, reviewedEarly: false };
    const partial = listeningResult("l1", "題", { ...base, partial: true });
    expect(partial.perfect).toBe(false);
    expect(notPerfectReasons(partial)).toEqual(["前の 回の 続きから 始めました。"]);
    const redo = listeningResult("l1", "題", { ...base, sawScriptBefore: true });
    expect(redo.perfect).toBe(false);
    expect(notPerfectReasons(redo)).toEqual(["前に こたえあわせを 見た あとの やりなおしです。"]);
  });
});
