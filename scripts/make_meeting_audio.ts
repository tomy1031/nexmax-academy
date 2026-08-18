/**
 * ミーティングの「決まっている ことば」を 音に する（CI から 走らせる）
 *
 * ## なぜ CI で 作るのか
 * 音づくりには Gemini の 鍵が 要る。この プロジェクトの 鍵は **BYOK**（学習者・先生が
 * 自分の キーを 画面から 登録する）方式で、サーバにも `.env` にも 置かない
 *（`docs/deploy.md` の 表・`scripts/check_build_env.mjs` の 検査）。
 * 唯一 置いて ある のは **GitHub の Environment Secrets（`Preview`）**なので、
 * 「鍵の 要る 作業は GitHub Actions の 中で やる」——ユーザーに コマンドを
 * 叩かせない ため（docs/constraints.md 運用の制約）。
 *
 * ## 何を するか
 * 教材の しつもんと おわりの ひとことを 1文ずつ 読み上げ、
 * `public/audio/meetings/<教材ID>/<キー>.wav` に 置いて、
 * 教材データ（`content/meetings/<教材ID>.json`）に `audioUrl` を 書き足す。
 *
 * 1文ずつ 別の ファイルに するのは、会話が 行ったり 来たり する ため
 *（言い直し）。1本に つなぐと、その 質問の ところから 鳴らすのに 秒数を
 * 測って 持たなければ ならない（studio の 音声づくりと 同じ 考え方）。
 *
 * ## 声は 人物カードの もの
 * まんが・たいわ・ミーティングで 同じ 人の 声に する ため、`content/characters/<id>.json`
 * の `voice` を 使う（ここで 別の 声を 当てない）。
 *
 * 使い方: `GEMINI_API_KEY=… node --import tsx scripts/make_meeting_audio.ts <教材ID>`
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI, Modality } from "@google/genai";
import { LIVE_TTS_MODELS } from "../src/lib/ai/models";

/** Live が 返す 音の サンプリングレート（Live API の 決まり）。 */
const OUT_RATE = 24_000;

/**
 * 「書いて ある とおりに 読む」ための 指示。
 * これが 無いと 相づちや 言い換えを 足して、台本と 音が ずれる
 *（`src/lib/audio/live-tts.ts` と 同じ 文）。
 */
const NARRATOR =
  "あなたはナレーターです。渡された文を、書いてあるとおりに、自然な速さで読み上げてください。" +
  "あいづち・言い換え・説明・感想を足さないでください。読み上げ以外は何もしないでください。";

const meetingId = process.argv[2];
if (!meetingId) {
  console.error("使い方: node --import tsx scripts/make_meeting_audio.ts <教材ID>");
  process.exit(1);
}
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY が ありません（GitHub の Environment「Preview」に あります）");
  process.exit(1);
}

const meetingPath = join("content", "meetings", `${meetingId}.json`);
const meeting = JSON.parse(readFileSync(meetingPath, "utf8"));
const hostPath = join("content", "characters", `${meeting.host.id}.json`);
const voice: string = existsSync(hostPath)
  ? (JSON.parse(readFileSync(hostPath, "utf8")).voice ?? "Puck")
  : "Puck";

/** 読み上げる 文（しつもん ぜんぶ ＋ おわりの ひとこと）。並びは 画面に 出る 順。 */
const lines: { key: string; text: string }[] = [
  ...meeting.questions.map((q: { id: string; ask: string }) => ({ key: q.id, text: q.ask })),
  { key: "closing", text: meeting.closing },
].filter((line) => line.text?.trim());

/** 生PCM（16bit・モノラル）に WAV の 頭を つける。 */
function toWav(pcm: Uint8Array): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.byteLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // fmt チャンクの 長さ
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // モノラル
  header.writeUInt32LE(OUT_RATE, 24);
  header.writeUInt32LE(OUT_RATE * 2, 28); // 1秒ぶんの バイト数
  header.writeUInt16LE(2, 32); // 1サンプルの バイト数
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.byteLength, 40);
  return Buffer.concat([header, Buffer.from(pcm)]);
}

/**
 * 1文を 読み上げて 生PCMを 返す。
 *
 * 返事が 来ないまま 開きっぱなしに しない（60秒で あきらめて つぎの モデルへ）。
 */
async function synthesize(text: string, model: string): Promise<Uint8Array> {
  const ai = new GoogleGenAI({ apiKey, apiVersion: "v1beta" });
  const chunks: Uint8Array[] = [];

  return await new Promise<Uint8Array>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(
      () => finish(() => reject(new Error(`${model}: 時間が かかりすぎました`))),
      60_000,
    );

    void ai.live
      .connect({
        model,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: NARRATOR,
          speechConfig: {
            languageCode: "ja-JP",
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
          },
        },
        callbacks: {
          onmessage: (message: unknown) => {
            const content = (message as { serverContent?: Record<string, unknown> }).serverContent;
            const parts = (
              content?.modelTurn as { parts?: { inlineData?: { data?: string } }[] } | undefined
            )?.parts;
            for (const part of parts ?? []) {
              if (part.inlineData?.data) chunks.push(Buffer.from(part.inlineData.data, "base64"));
            }
            if (content?.turnComplete === true) {
              finish(() =>
                chunks.length > 0
                  ? resolve(Buffer.concat(chunks))
                  : reject(new Error(`${model}: 音が 空でした`)),
              );
            }
          },
          onerror: (error: unknown) =>
            finish(() => reject(new Error(`${model}: ${String(error)}`))),
          onclose: () =>
            finish(() =>
              chunks.length > 0
                ? resolve(Buffer.concat(chunks))
                : reject(new Error(`${model}: 音が 来ないまま 切れました`)),
            ),
        },
      })
      .then((session) => {
        session.sendClientContent({ turns: text, turnComplete: true });
      })
      .catch((error: unknown) => finish(() => reject(new Error(`${model}: ${String(error)}`))));
  });
}

/** 新しい モデルから 順に ためす（preview は 名前ごと 入れ替わる ため）。 */
async function synthesizeWithFallback(text: string): Promise<Uint8Array> {
  const failures: string[] = [];
  for (const model of LIVE_TTS_MODELS) {
    try {
      return await synthesize(text, model);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(`音に できませんでした:\n  ${failures.join("\n  ")}`);
}

const outDir = join("public", "audio", "meetings", meetingId);
mkdirSync(outDir, { recursive: true });

const urls: Record<string, string> = {};
for (const [index, line] of lines.entries()) {
  process.stdout.write(`(${index + 1}/${lines.length}) ${line.key} … `);
  const pcm = await synthesizeWithFallback(line.text);
  const file = join(outDir, `${line.key}.wav`);
  writeFileSync(file, toWav(pcm));
  urls[line.key] = `/audio/meetings/${meetingId}/${line.key}.wav`;
  console.log(`${(pcm.byteLength / OUT_RATE / 2).toFixed(1)}秒`);
}

meeting.questions = meeting.questions.map((q: { id: string }) =>
  urls[q.id] ? { ...q, audioUrl: urls[q.id] } : q,
);
if (urls.closing) meeting.closingAudioUrl = urls.closing;
writeFileSync(meetingPath, `${JSON.stringify(meeting, null, 2)}\n`);
console.log(`${meetingPath} に audioUrl を 書きました（声: ${voice}）`);
