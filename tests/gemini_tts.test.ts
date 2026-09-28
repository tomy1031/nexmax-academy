/**
 * Gemini の TTS で 会話を まとめて 読み、間で 1文ずつに 切る 道（2026-09-28）の 純関数。
 * 鍵が 要る ところ（読み上げ・文字起こし）は CI の 音声づくりで しか 走らない ので、
 * **送る 形・返事の 読みかた・かたまりの 分けかた・切る 位置**を ここで 見張る。
 */
import { describe, expect, it } from "vitest";
import { SAMPLE_RATE } from "../src/lib/audio/wav";
import { toWav } from "../scripts/lib/live_tts";
import {
  audioFromInteraction,
  dialogueChunks,
  pcmFromAudio,
  speechText,
  ttsRequestBody,
  TTS_MODEL,
} from "../scripts/lib/gemini_tts";
import { chooseCuts, findPauses, plausibleSplit, splitAt } from "../scripts/lib/split_dialogue";
import { LISTENING_AUDIO_PLANS } from "../scripts/lib/listening_audio_plans";

describe("TTS に 送る 形（Interactions API）", () => {
  it("2人の 会話は conversational で、行ごとに 話す人と 話しかたを 付ける", () => {
    const body = ttsRequestBody({
      lines: [
        { speaker: "佐藤", text: "高橋さん、今、お時間よろしいでしょうか。" },
        { speaker: "高橋", text: "はい、大丈夫ですよ。" },
      ],
      voices: { 佐藤: "Autonoe", 高橋: "Alnilam" },
      style: "はっきり",
    });
    expect(body).toMatchObject({
      model: TTS_MODEL,
      response_format: { type: "audio" },
      generation_config: {
        speech_config: {
          mode: "conversational",
          speakers: [
            { speaker: "佐藤", voice: "Autonoe" },
            { speaker: "高橋", voice: "Alnilam" },
          ],
        },
      },
    });
    const content = (body.input as { content: unknown[] }[])[0]!.content;
    expect(content[1]).toEqual({
      type: "text",
      text: "はい、大丈夫ですよ。",
      annotations: [{ type: "speech_metadata", speaker: "高橋", style: "はっきり" }],
    });
  });

  it("1人だけの かたまりは 声 1つの 形（speaker は 付けない）", () => {
    const body = ttsRequestBody({
      lines: [{ speaker: "高橋", text: "では、今日もよろしくお願いします。" }],
      voices: { 高橋: "Alnilam" },
    });
    expect((body.generation_config as { speech_config: unknown }).speech_config).toEqual([
      { voice: "Alnilam" },
    ]);
  });

  it("3人は 1回に 入れない・声の 無い 人は 止める", () => {
    const voices = { a: "Kore", b: "Puck", c: "Charon" };
    expect(() =>
      ttsRequestBody({
        lines: [
          { speaker: "a", text: "1" },
          { speaker: "b", text: "2" },
          { speaker: "c", text: "3" },
        ],
        voices,
      }),
    ).toThrow(/2人まで/);
    expect(() => ttsRequestBody({ lines: [{ speaker: "x", text: "1" }], voices })).toThrow(
      /声が 決まって いません/,
    );
  });

  it("分かち書きの 空白は 詰め、英字の 前後は 残す", () => {
    expect(speechText("次は どの タスクを すれば いいですか。")).toBe(
      "次はどのタスクをすればいいですか。",
    );
    expect(speechText("二つ目は、AWSの S3に 画像を 保存する 方法です。")).toBe(
      "二つ目は、AWSの S3に画像を保存する方法です。",
    );
  });
});

describe("返事の 読みかた", () => {
  it("最後の model_output の audio を 拾う（SDK の output_audio と 同じ）", () => {
    const json = {
      steps: [
        { type: "user_input", content: [{ type: "text", text: "x" }] },
        {
          type: "model_output",
          content: [{ type: "audio", data: "QUJD", mime_type: "audio/wav", sample_rate: 24000 }],
        },
      ],
    };
    expect(audioFromInteraction(json)).toEqual({
      data: "QUJD",
      mimeType: "audio/wav",
      sampleRate: 24000,
    });
    expect(audioFromInteraction({ steps: [] })).toBeNull();
  });

  it("WAV は 頭を 外して 生PCM に、生PCM は そのまま", () => {
    const pcm = new Uint8Array([1, 0, 2, 0, 3, 0]);
    expect([...pcmFromAudio(new Uint8Array(toWav(pcm)))]).toEqual([...pcm]);
    expect([...pcmFromAudio(pcm)]).toEqual([...pcm]);
  });

  it("24kHz 以外は 止める（つなぐ 相手と 速さが ずれる）", () => {
    expect(() => pcmFromAudio(new Uint8Array([0, 0]), 16000)).toThrow(/速さ/);
  });
});

describe("かたまりの 分けかた（声は 1回に 2人まで）", () => {
  it("3人目が 出た ところで 分ける（朝礼の 形）", () => {
    const speakers = ["t", "s", "s", "t", "y", "y", "t", "s", "y", "t"];
    const chunks = dialogueChunks(
      speakers,
      speakers.map(() => 10),
    );
    expect(chunks).toEqual([[0, 1, 2, 3], [4, 5, 6], [7, 8], [9]]);
    for (const chunk of chunks) {
      expect(new Set(chunk.map((i) => speakers[i])).size).toBeLessThanOrEqual(2);
    }
  });

  it("2人の 会話は 1回で 読む（長すぎる ときだけ 切る）", () => {
    expect(dialogueChunks(["a", "b", "a", "b"], [10, 10, 10, 10])).toEqual([[0, 1, 2, 3]]);
    expect(dialogueChunks(["a", "b", "a"], [10, 10, 10], { maxChars: 20 })).toEqual([[0, 1], [2]]);
  });

  it("報告の リスニング 5場面は TTS で 作る 台帳に なって いる", () => {
    for (const id of [
      "houkoku_kanryou_listening",
      "houkoku_okure_listening",
      "houkoku_shougai_listening",
      "houkoku_chousa_listening",
      "houkoku_chourei_listening",
    ]) {
      expect(LISTENING_AUDIO_PLANS[id]?.engine, id).toBe("tts");
    }
    // 報告（悪い ニュース）は これまでどおり Live
    expect(LISTENING_AUDIO_PLANS.houkoku_listening?.engine).toBeUndefined();
  });
});

/** 声（振幅 5000）と 無音を 並べた PCM。[秒, 声か] の 並び。 */
function pcmOf(parts: readonly (readonly [number, boolean])[]): Uint8Array {
  const total = parts.reduce((sum, [s]) => sum + Math.round(SAMPLE_RATE * s), 0);
  const view = new DataView(new ArrayBuffer(total * 2));
  let at = 0;
  for (const [s, loud] of parts) {
    const n = Math.round(SAMPLE_RATE * s);
    for (let k = 0; k < n; k += 1) {
      if (loud) view.setInt16((at + k) * 2, (at + k) % 2 === 0 ? 5000 : -5000, true);
    }
    at += n;
  }
  return new Uint8Array(view.buffer);
}

describe("間で 1文ずつに 切る", () => {
  it("文の おわりの 長い 間で 切り、読点の 短い 間では 切らない", () => {
    // 文1（1.0秒・読点 0.15秒・1.0秒） | 0.6秒 | 文2（0.4秒「はい。」） | 0.7秒 | 文3（2.0秒）
    const pcm = pcmOf([
      [0.2, false],
      [1.0, true],
      [0.15, false],
      [1.0, true],
      [0.6, false],
      [0.4, true],
      [0.7, false],
      [2.0, true],
      [0.2, false],
    ]);
    const weights = [14, 2, 14];
    const found = findPauses(pcm);
    expect(found.pauses).toHaveLength(3);
    const cuts = chooseCuts(found.pauses, found.speechStart, found.speechEnd, weights);
    expect(cuts).not.toBeNull();
    const seconds = splitAt(pcm, cuts!).map((one) => one.byteLength / 2 / SAMPLE_RATE);
    // 文1 は 0.2 + 1.0 + 0.15 + 1.0 + 0.3 ≈ 2.65秒、文2 は 0.3 + 0.4 + 0.35 ≈ 1.05秒
    expect(seconds[0]).toBeCloseTo(2.65, 1);
    expect(seconds[1]).toBeCloseTo(1.05, 1);
    expect(plausibleSplit(seconds, weights).ok).toBe(true);
  });

  it("間が 足りなければ 切らない（null）", () => {
    const pcm = pcmOf([
      [1.0, true],
      [0.5, false],
      [1.0, true],
    ]);
    const found = findPauses(pcm);
    expect(chooseCuts(found.pauses, found.speechStart, found.speechEnd, [1, 1, 1])).toBeNull();
  });

  it("見こみから 大きく 外れた 切りかたは 落とす", () => {
    expect(plausibleSplit([0.3, 9.0], [20, 2]).ok).toBe(false);
    expect(plausibleSplit([3.0, 0.6], [20, 2]).ok).toBe(true);
  });
});
