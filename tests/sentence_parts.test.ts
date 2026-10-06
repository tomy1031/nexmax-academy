/**
 * 音の ひとまとまりから 一部の 文を 切り出す（scripts/lib/sentence_parts.ts）。
 *
 * - 読点の 間では なく、**文の 切れ目の 間**で 切る（読みの 長さの 割合で 見積もる）
 * - 見積もりから 離れた 間しか 無ければ 切らない（まちがった 所で 切った 音を 置かない）
 * - 間の 中に のりしろを 残す（出だしの 小さな 子音・おわりの 息を 削らない）
 */
import { describe, expect, it } from "vitest";
import { SAMPLE_RATE } from "../src/lib/audio/wav";
import { toWav } from "../scripts/lib/live_tts";
import { cutPart, innerPauses, pickBoundaries, wavToPcm } from "../scripts/lib/sentence_parts";

/** 声（大きい 音）と 間（無音）を 秒で 並べた 生PCM。 */
function pcmOf(spans: readonly { voice: boolean; sec: number }[]): Uint8Array {
  const total = spans.reduce((sum, span) => sum + Math.round(span.sec * SAMPLE_RATE), 0);
  const out = new Uint8Array(total * 2);
  const view = new DataView(out.buffer);
  let at = 0;
  for (const span of spans) {
    const n = Math.round(span.sec * SAMPLE_RATE);
    for (let i = 0; i < n; i += 1) {
      view.setInt16((at + i) * 2, span.voice ? (i % 2 ? 6000 : -6000) : 0, true);
    }
    at += n;
  }
  return out;
}

const sec = (samples: number) => samples / SAMPLE_RATE;

// 「はい。」0.3秒 → 間 0.4秒 → 「それでは、」1.0秒 → 読点の 間 0.3秒 → 「朝礼を 始めます。」1.2秒
const audio = pcmOf([
  { voice: true, sec: 0.3 },
  { voice: false, sec: 0.4 },
  { voice: true, sec: 1.0 },
  { voice: false, sec: 0.3 },
  { voice: true, sec: 1.2 },
]);

describe("innerPauses", () => {
  it("声の あいだの 間だけを 並べる", () => {
    const { pauses, voiceStart, voiceEnd } = innerPauses(audio);
    expect(pauses.map((p) => [sec(p.start), sec(p.end)])).toEqual([
      [0.3, 0.7],
      [1.7, 2.0],
    ]);
    expect(sec(voiceStart)).toBe(0);
    expect(sec(voiceEnd)).toBeCloseTo(3.2, 2);
  });
});

describe("pickBoundaries", () => {
  it("読点の 間では なく、文の 切れ目の 間を えらぶ", () => {
    const { pauses, voiceStart, voiceEnd } = innerPauses(audio);
    // 「はい。」2字 ／「それでは、ちょうれいを はじめます。」17字
    const picked = pickBoundaries(pauses, voiceStart, voiceEnd, [2, 17]);
    expect(picked?.map((one) => sec(one.pause.start))).toEqual([0.3]);
  });

  it("見積もりから 離れた 間しか 無ければ 切らない", () => {
    const { pauses, voiceStart, voiceEnd } = innerPauses(audio);
    // 声 2.5秒の 4/5（2.0秒）で 切れる はずの 割合なのに、間は 0.3秒・1.3秒の 所にしか 無い
    expect(pickBoundaries(pauses, voiceStart, voiceEnd, [4, 1], { maxDriftSec: 0.2 })).toBeNull();
  });
});

describe("cutPart", () => {
  it("2文目だけ 切ると「はい。」の 声が 入らず、間の のりしろを 少し 残す", () => {
    const { pauses, voiceStart, voiceEnd } = innerPauses(audio);
    const picked = pickBoundaries(pauses, voiceStart, voiceEnd, [2, 17])!;
    const cut = cutPart(
      audio,
      picked.map((one) => one.pause),
      2,
      2,
    );
    const inner = innerPauses(cut);
    // 残る 間は 読点の 1つだけ（「はい。」の あとの 間は 頭の のりしろに なる）
    expect(inner.pauses).toHaveLength(1);
    // 頭に 残す 無音は のりしろ（0.08秒）まで
    expect(sec(inner.voiceStart)).toBeLessThanOrEqual(0.09);
    expect(sec(cut.byteLength / 2)).toBeGreaterThan(2.5);
    expect(sec(cut.byteLength / 2)).toBeLessThan(2.7);
  });
});

describe("wavToPcm", () => {
  it("toWav で 包んだ PCM を そのまま 取り出す", () => {
    expect(wavToPcm(new Uint8Array(toWav(audio)))).toEqual(audio);
  });
});
