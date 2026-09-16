/**
 * リスニングの 音を 1文ずつ 作る 道（scripts/make_listening_audio.ts の 台帳の 教材）の 土台。
 *
 * - 文の 割りかたが ずれると、1文の 音に 2文 入ったり、文の あいだの 秒が 狂う
 * - 無音を 切りすぎると 文の おわりの 息の 音（「す」）が 消える
 * - 読みの 照合が ゆるいと 原稿と ちがう 音が 通り、きびしすぎると 正しい 音まで 落ちる
 *（2026-09-16 の 指定「原稿と 音声が 完璧に 一致する ように」）
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Tokenizer } from "kuromoji";
import { SAMPLE_RATE } from "../src/lib/audio/wav";
import { buildFuriganaIndex } from "../src/lib/text/furigana";
import { LISTENING_AUDIO_PLANS } from "../scripts/lib/listening_audio_plans";
import {
  scriptSentences,
  sentenceFileName,
  splitSentences,
  trimSilence,
} from "../scripts/lib/listening_sentences";
import { editDistance, matchReading } from "../scripts/lib/speech_reading";
import { getTokenizer } from "../scripts/lib/yomi_check";

describe("splitSentences", () => {
  it("「。」「？」の あとで 割り、前後の 空白を 落とす", () => {
    expect(splitSentences("そうですか。直すのに、どのくらい かかりますか。 来週ですか？")).toEqual([
      "そうですか。",
      "直すのに、どのくらい かかりますか。",
      "来週ですか？",
    ]);
  });

  it("かっこの 中の「。」では 割らない", () => {
    expect(splitSentences("「きょうは 休みです。」と 言いました。はい。")).toEqual([
      "「きょうは 休みです。」と 言いました。",
      "はい。",
    ]);
  });

  it("おわりの 記号が 無い 文も 落とさない", () => {
    expect(splitSentences("はじめます。よろしく")).toEqual(["はじめます。", "よろしく"]);
  });
});

describe("報告の リスニング（台帳の 教材）", () => {
  const listening = JSON.parse(
    readFileSync(join("content", "listening", "houkoku_listening.json"), "utf8"),
  );
  const sentences = scriptSentences(listening.script);

  it("12行を 22文に 割る（文を 足しも 消しも しない）", () => {
    expect(sentences).toHaveLength(22);
    // つなぎ直すと 元の 行の 文字に 戻る（空白の 位置だけ 見ない）
    const squash = (text: string) => text.replace(/\s/g, "");
    expect(squash(sentences.map((one) => one.text).join(""))).toBe(
      squash(listening.script.map((line: { text: string }) => line.text).join("")),
    );
  });

  it("話す人は どれも 台帳で 声が 決まって いる（カードに 落ちない）", () => {
    const plan = LISTENING_AUDIO_PLANS.houkoku_listening!;
    for (const one of sentences) expect(plan.voices[one.speaker], one.speaker).toBeTruthy();
    expect(plan.voices).toMatchObject({ narration: "Puck", hendy: "Puck", fujiki: "Algieba" });
    expect(plan.gapSeconds).toBe(1.5);
    expect(plan.compareGapSeconds).toEqual([2]);
  });

  it("ファイル名は 並び順（01.wav から）", () => {
    expect(sentenceFileName(0)).toBe("01.wav");
    expect(sentenceFileName(21)).toBe("22.wav");
  });
});

/** 16bit モノラルの PCM を 作る（無音 → 声（振幅 5000） → 無音）。 */
function pcmWith(silenceBefore: number, voice: number, silenceAfter: number): Uint8Array {
  const total = Math.round(SAMPLE_RATE * (silenceBefore + voice + silenceAfter));
  const view = new DataView(new ArrayBuffer(total * 2));
  const from = Math.round(SAMPLE_RATE * silenceBefore);
  const to = from + Math.round(SAMPLE_RATE * voice);
  for (let i = from; i < to; i += 1) view.setInt16(i * 2, i % 2 === 0 ? 5000 : -5000, true);
  return new Uint8Array(view.buffer);
}

describe("trimSilence", () => {
  it("前後の 無音を 切り、のりしろ（前 60ms・後 120ms）を 残す", () => {
    const trimmed = trimSilence(pcmWith(0.5, 1, 0.8));
    const seconds = trimmed.byteLength / 2 / SAMPLE_RATE;
    expect(seconds).toBeGreaterThanOrEqual(1 + 0.06 + 0.12 - 0.011);
    expect(seconds).toBeLessThanOrEqual(1 + 0.06 + 0.12 + 0.011);
  });

  it("全部 無音なら 空に しない", () => {
    const silent = pcmWith(1, 0, 0);
    expect(trimSilence(silent).byteLength).toBe(silent.byteLength);
  });
});

describe("読みの 照合", () => {
  let tokenizer: Tokenizer;
  beforeAll(async () => {
    tokenizer = await getTokenizer();
  });
  const index = buildFuriganaIndex([
    ["何ですか", "なんですか"],
    ["今", "いま"],
    ["少", "すこ"],
    ["時間", "じかん"],
    ["日", "にち"],
    ["大切", "たいせつ"],
  ]);

  it("編集距離", () => {
    expect(editDistance("なんですか", "なにですか")).toBe(1);
    expect(editDistance("とてもたいせつ", "たいせつ")).toBe(3);
  });

  it("表記が ちがっても 読みが 同じ なら ぴったり（かな書き・漢数字）", () => {
    expect(matchReading("今 少し お時間", "いま すこし おじかん", index, tokenizer).distance).toBe(
      0,
    );
    expect(matchReading("1日くらい", "一日くらい", index, tokenizer).distance).toBe(0);
  });

  it("解析器の 読みの ゆれ 1字は 通す（何ですか）", () => {
    const match = matchReading("はい、何ですか。", "はい、何ですか。", index, tokenizer);
    expect(match.distance).toBe(1);
    expect(match.ok).toBe(true);
  });

  it("短い 語の 読み飛ばしは 落とす（とても）", () => {
    const match = matchReading("これは とても 大切です。", "これは 大切です。", index, tokenizer);
    expect(match.ok).toBe(false);
  });

  it("文字起こしが 空なら 落とす（確かめられない）", () => {
    expect(matchReading("はい。", "", index, tokenizer).ok).toBe(false);
  });
});
