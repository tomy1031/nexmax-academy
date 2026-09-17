import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { LIVE_VOICES, voiceOptionLabel, voiceSampleUrl } from "@/lib/audio/voices";

/**
 * 声の 一覧と 見本（スタジオ「登場人物」の 声えらび・2026-09-16 の 指定）
 *
 * - えらべる 声は **Google の 30種 すべて**（前は 10種で「実際の 数より 少ない」と 言われた）
 * - 1行の **先頭は Google の 名前**、そのあとに トーン（明るい・高め の 男の人 など）
 * - 「▶ 声を ためす」は **作り置きの 見本**を 鳴らす。見本は 台本どおりに 読めた ときだけ
 *   書かれる（`scripts/make_voice_samples.ts`）ので、**見本が ある ＝ その 声で Live から
 *   音が 返った**。見本の 無い 声を 一覧に 足すと ここで 落ちる。
 */

/** https://ai.google.dev/gemini-api/docs/speech-generation の 声（2026-09-16 確認・30種）。 */
const GOOGLE_VOICES = [
  "Zephyr",
  "Puck",
  "Charon",
  "Kore",
  "Fenrir",
  "Leda",
  "Orus",
  "Aoede",
  "Callirrhoe",
  "Autonoe",
  "Enceladus",
  "Iapetus",
  "Umbriel",
  "Algieba",
  "Despina",
  "Erinome",
  "Algenib",
  "Rasalgethi",
  "Laomedeia",
  "Achernar",
  "Alnilam",
  "Schedar",
  "Gacrux",
  "Pulcherrima",
  "Achird",
  "Zubenelgenubi",
  "Vindemiatrix",
  "Sadachbia",
  "Sadaltager",
  "Sulafat",
];

/**
 * 見本が **まだ 無い** 声（2026-09-16・Live で 2回 作って 2回とも 切れた）。
 * 一覧には 残す（Google の 30種に ある）が、画面は「見本 まだ」と 出す。
 * 作れたら ここから 外し、`voices.ts` に 高さを 入れる（下の テストが 外し忘れを 落とす）。
 */
const PENDING_SAMPLES = ["Sadachbia"];

const ROOT = join(__dirname, "..");
const SAMPLE_DIR = join(ROOT, "public", "audio", "voices");

describe("声の 一覧", () => {
  it("Google の 30種を すべて 持つ", () => {
    expect(LIVE_VOICES.map((voice) => voice.name).sort()).toEqual([...GOOGLE_VOICES].sort());
  });

  it("えらぶ 欄の 1行は Google の 名前で はじまり、性別と 声の 高さが 入る", () => {
    for (const voice of LIVE_VOICES) {
      const label = voiceOptionLabel(voice);
      expect(label.startsWith(`${voice.name} — `)).toBe(true);
      expect(label).toMatch(voice.gender === "male" ? /男の人/ : /女の人/);
      expect(label).toMatch(
        PENDING_SAMPLES.includes(voice.name) ? /見本 まだ/ : /声は (高め|中くらい|低め)/,
      );
    }
  });
});

describe("声の 見本（作り置き）", () => {
  /** WAV の 頭を 読む（44バイトの 決まった 形・scripts/lib/live_tts.ts の toWav）。 */
  const readHeader = (name: string) => {
    const buf = readFileSync(join(ROOT, "public", voiceSampleUrl(name)));
    return {
      riff: buf.toString("ascii", 0, 4),
      wave: buf.toString("ascii", 8, 12),
      channels: buf.readUInt16LE(22),
      rate: buf.readUInt32LE(24),
      bits: buf.readUInt16LE(34),
      seconds: buf.readUInt32LE(40) / buf.readUInt32LE(28),
    };
  };

  it("「見本 まだ」の 声を のぞき、すべての 声に 見本が ある", () => {
    const files = new Set(readdirSync(SAMPLE_DIR));
    const missing = LIVE_VOICES.filter((voice) => !files.has(`${voice.name}.wav`));
    expect(missing.map((voice) => voice.name)).toEqual(PENDING_SAMPLES);
  });

  it("見本の 無い 声だけが 高さを 持たない", () => {
    const unmeasured = LIVE_VOICES.filter((voice) => voice.pitch === null);
    expect(unmeasured.map((voice) => voice.name)).toEqual(PENDING_SAMPLES);
  });

  it("一覧に 無い 見本を 置いて いない", () => {
    const names = new Set(LIVE_VOICES.map((voice) => `${voice.name}.wav`));
    expect(readdirSync(SAMPLE_DIR).filter((file) => !names.has(file))).toEqual([]);
  });

  it("見本は 24kHz・16bit・モノラルの WAV で、文を 読みきった 長さが ある", () => {
    for (const voice of LIVE_VOICES.filter((one) => !PENDING_SAMPLES.includes(one.name))) {
      const head = readHeader(voice.name);
      expect({ name: voice.name, riff: head.riff, wave: head.wave }).toEqual({
        name: voice.name,
        riff: "RIFF",
        wave: "WAVE",
      });
      expect([head.channels, head.rate, head.bits]).toEqual([1, 24_000, 16]);
      // 「おはようございます。…よろしく お願いします。」は 3〜10秒に おさまる
      expect(head.seconds, voice.name).toBeGreaterThan(3);
      expect(head.seconds, voice.name).toBeLessThan(10);
    }
  });
});
