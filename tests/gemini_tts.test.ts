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
  pcmFromAudio,
  SENTENCE_BREAK,
  speechLine,
  speechText,
  ttsRequestBody,
  TTS_MODEL,
} from "../scripts/lib/gemini_tts";
import { chooseCuts, findPauses, plausibleSplit, splitAt } from "../scripts/lib/split_dialogue";
import { LISTENING_AUDIO_PLANS } from "../scripts/lib/listening_audio_plans";
import { pairSpeakers, planCalls } from "../scripts/lib/tts_listening";
import { alignSentences, tidyTranscript } from "../scripts/lib/speech_reading";
import { buildSoundsIndex, spellSounds } from "../src/components/listening/listening-checks";

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

describe("文の 切れ目に 長い 間の 札を 置く", () => {
  it("文と 文の あいだ・行の おわりに <long pause>（行の 最後の 行には 置かない）", () => {
    expect(SENTENCE_BREAK).toBe("<long pause>");
    expect(speechLine(["はい。", "どこまで できましたか。"], true)).toBe(
      "はい。 <long pause> どこまでできましたか。 <long pause>",
    );
    expect(speechLine(["お願いします。"], false)).toBe("お願いします。");
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

describe("呼ぶ 回数を 減らす 組の 分けかた（声は 1回に 2人まで・無料枠は 1日 10回）", () => {
  it("3人の 教材は よく 話す 2人を 1組に、のこりを 別の 組に", () => {
    expect(
      pairSpeakers(
        new Map([
          ["yamada", 7],
          ["takahashi", 12],
          ["sato", 8],
        ]),
      ),
    ).toEqual([["takahashi", "sato"], ["yamada"]]);
  });

  it("同じ 2人（か その 一部）の 組は、教材を またいで 1回に まとめる", () => {
    const parts = [
      { name: "①", persons: ["佐藤", "高橋"], chars: 500 },
      { name: "②", persons: ["山田", "鈴木"], chars: 450 },
      { name: "③", persons: ["中村", "田中"], chars: 400 },
      { name: "④", persons: ["小林", "加藤"], chars: 500 },
      { name: "⑤a", persons: ["高橋", "佐藤"], chars: 350 },
      { name: "⑤b", persons: ["山田"], chars: 200 },
    ];
    const calls = planCalls(parts).map((call) => call.map((part) => part.name));
    expect(calls).toEqual([["①", "⑤a"], ["②", "⑤b"], ["③"], ["④"]]);
  });

  it("長すぎる ときは まとめない", () => {
    const calls = planCalls(
      [
        { persons: ["a", "b"], chars: 1000 },
        { persons: ["a", "b"], chars: 1000 },
      ],
      1800,
    );
    expect(calls).toHaveLength(2);
  });

  it("報告の リスニング 5場面は TTS・速さ 1.25 で 作る 台帳に なって いる", () => {
    for (const id of [
      "houkoku_kanryou_listening",
      "houkoku_okure_listening",
      "houkoku_shougai_listening",
      "houkoku_chousa_listening",
      "houkoku_chourei_listening",
    ]) {
      expect(LISTENING_AUDIO_PLANS[id]?.engine, id).toBe("tts");
      expect(LISTENING_AUDIO_PLANS[id]?.tempo, id).toBe(1.25);
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

  it("短い 間は 切れ目の 候補に しない（長い 間の 札の 切れ目だけで 切る）", () => {
    // 文1（読点 0.3秒を はさむ）| 0.9秒 | 文2「はい。」| 0.9秒 | 文3
    const pcm = pcmOf([
      [1.0, true],
      [0.3, false],
      [1.0, true],
      [0.9, false],
      [0.4, true],
      [0.9, false],
      [2.0, true],
    ]);
    const found = findPauses(pcm);
    expect(found.pauses).toHaveLength(3);
    // 見こみの 長さを わざと 読点の 位置に 寄せても、短い 間は えらばれない
    const cuts = chooseCuts(found.pauses, found.speechStart, found.speechEnd, [7, 9, 14], {
      minBoundarySeconds: 0.45,
    });
    const seconds = splitAt(pcm, cuts!).map((one) => one.byteLength / 2 / SAMPLE_RATE);
    expect(seconds[0]).toBeCloseTo(2.75, 1);
    expect(seconds[1]).toBeCloseTo(1.3, 1);
    // 長い 間が 足りなければ 切らない
    expect(
      chooseCuts(found.pauses, found.speechStart, found.speechEnd, [1, 1, 1, 1], {
        minBoundarySeconds: 0.45,
      }),
    ).toBeNull();
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

describe("まとめて 聞いた 読みを 文ごとに 分ける（ずれた 文だけ 読み直す ため）", () => {
  it("そろって いれば どの 文も ずれ 0", () => {
    const out = alignSentences(["はい", "どうしましたか"], "はいどうしましたか");
    expect(out.map((one) => one.distance)).toEqual([0, 0]);
    expect(out.map((one) => one.spoken)).toEqual(["はい", "どうしましたか"]);
  });

  it("文の 中の 読みちがいは その 文だけに 数える（Issue を いっしゅう）", () => {
    const out = alignSentences(
      ["わかりました", "いしゅーをかくにんしてから"],
      "わかりましたいっしゅうをかくにんしてから",
    );
    expect(out[0]!.distance).toBe(0);
    expect(out[1]!.distance).toBeGreaterThan(0);
  });

  it("同じ ことばを 2度 読んだ ときも ずれとして 出る", () => {
    const out = alignSentences(
      ["いまのところもんだいはありません", "ぱそこんと"],
      "いまのところもんだいはありませんもんだいはありませんぱそこんと",
    );
    // どちらの 写しを 本物と みるかは 決められない。どちらかの 文には 必ず 出る
    //（音の 側は 長さの 見張りで 見つける——make_listening_audio.ts の `outOfPace`）
    expect(out[0]!.distance + out[1]!.distance).toBeGreaterThan(0);
  });
});

describe("文字起こしの 空白・英字の 読ませかた", () => {
  it("語ごとの 空白を 詰める（英字どうしの あいだだけ 残す）", () => {
    expect(tidyTranscript("お 知らせ の タイトル 公開 日")).toBe("お知らせのタイトル公開日");
    expect(tidyTranscript("Git ハブ の イシュー")).toBe("Gitハブのイシュー");
    expect(tidyTranscript("Laravel Breeze を 使います")).toBe("Laravel Breezeを使います");
  });

  it("英字の 語だけ 台帳の 読みの カタカナに する（数字の 語は 変えない）", () => {
    const latin = buildSoundsIndex([
      ["GitHub", "ぎっとはぶ"],
      ["Issue", "いしゅー"],
      ["S3", "えすすりー"],
    ]);
    const katakana = (kana: string) =>
      kana.replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
    expect(spellSounds("GitHubの Issueを 作った。AWSの S3に 10時", latin, katakana)).toBe(
      "ギットハブの イシューを 作った。AWSの エススリーに 10時",
    );
  });
});
