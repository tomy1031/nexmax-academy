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
 * ## 読み上げたか どうかを **その場で 確かめる**（2026-08-28）
 * Live は 会話の モデルなので、台本が しつもんの 形だと **答えて しまう**ことが ある。
 * 実際に ヘンディさんの 音声で 起きた（「…仕事を 1つ 教えて ください」に 18秒 かけて
 * 三好市の 話を 答えて いた）。長さも 中身も 台本と ちがうのに、
 * ファイルは できて いる ので **だれも 気づけなかった**——聞くまで 分からない。
 *
 * そこで `outputAudioTranscription`（モデル自身の 発話の 文字起こし）を 一緒に もらい、
 * 台本と 見くらべる。合わなければ 作り直し、それでも 合わなければ **書かない**
 *（書かなければ もう一度 走らせた ときに 作り直される）。
 *
 * 使い方: `GEMINI_API_KEY=… node --import tsx scripts/make_meeting_audio.ts <教材ID> [--force]`
 * `--force` は すでに ある ものも 作り直す。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI, Modality } from "@google/genai";
import { LIVE_TTS_MODELS } from "../src/lib/ai/models";
import { NARRATOR_INSTRUCTION } from "../src/lib/audio/narrator";

/** Live が 返す 音の サンプリングレート（Live API の 決まり）。 */
const OUT_RATE = 24_000;

const meetingId: string = process.argv[2] ?? "";
/** すでに ある ものも 作り直すか。 */
const force: boolean = process.argv.includes("--force");
if (!meetingId) {
  console.error("使い方: node --import tsx scripts/make_meeting_audio.ts <教材ID>");
  process.exit(1);
}
const apiKey: string = process.env.GEMINI_API_KEY ?? "";
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

/** 読み上げの 結果（音と、モデル自身が 何と 言ったかの 文字起こし）。 */
interface Spoken {
  readonly pcm: Uint8Array;
  /** `outputAudioTranscription`。空の ことも ある（モデルに よる）。 */
  readonly transcript: string;
}

/**
 * 1文を 読み上げて 音と 文字起こしを 返す。
 *
 * 返事が 来ないまま 開きっぱなしに しない（60秒で あきらめて つぎの モデルへ）。
 */
async function synthesize(text: string, model: string): Promise<Spoken> {
  const ai = new GoogleGenAI({ apiKey, apiVersion: "v1beta" });
  const chunks: Uint8Array[] = [];
  let transcript = "";

  return await new Promise<Spoken>((resolve, reject) => {
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
          // モデル自身の 発話の 文字起こし。台本と 見くらべる ために もらう
          outputAudioTranscription: {},
          systemInstruction: NARRATOR_INSTRUCTION,
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
            const said = (content?.outputTranscription as { text?: string } | undefined)?.text;
            if (said) transcript += said;
            if (content?.turnComplete === true) {
              /*
               * **すぐには 閉じない**。文字起こしの さいごの ひときれが
               * `turnComplete` の あとに 届く ことが ある——そこで 打ち切ると
               * 「その」だけの 文字起こしを 見て、ちゃんと 読めた 音を 捨てて しまう
               *（2026-08-28 に q5 で 実発生）。ひと呼吸 待ってから 閉じる。
               */
              setTimeout(() => {
                finish(() =>
                  chunks.length > 0
                    ? resolve({ pcm: Buffer.concat(chunks), transcript })
                    : reject(new Error(`${model}: 音が 空でした`)),
                );
              }, 700);
            }
          },
          onerror: (error: unknown) =>
            finish(() => reject(new Error(`${model}: ${String(error)}`))),
          onclose: () =>
            finish(() =>
              chunks.length > 0
                ? resolve({ pcm: Buffer.concat(chunks), transcript })
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

/**
 * 見くらべる ための ならし。
 *
 * 記号・空白・全角半角の ちがいで 落とさない。英語の 読みは カタカナに なる
 *（NEXT MAKE →「ネクストメイク」）ので、**そこは 合わなくて 当たり前**——
 * だから 一致率で 見て、ぴったり 一致は 求めない。
 */
function normalizeForCompare(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\s。、．，！？!?「」『』（）()・…ー~〜]/g, "")
    .toLowerCase();
}

/** いちばん 長い 共通部分列の 長さ（順は 保つ・とびとびは 許す）。 */
function commonLength(a: string, b: string): number {
  const row = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const keep = row[j] as number;
      row[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(row[j] as number, row[j - 1] as number);
      prev = keep;
    }
  }
  return row[b.length] as number;
}

/**
 * 台本どおりに 読んだか。
 *
 * ## 何を 落とすか
 * 落としたいのは **答えて しまった 読み上げ**。しつもんに 答えると 文が まるごと
 * 変わる ので、一致率が 大きく 下がり、たいてい 長さも のびる。
 * 一方 英語の カタカナ読みは 一致率を 少し 下げるだけ なので、通す。
 *
 * 文字起こしが 空の モデルも ある。そのときは **長さで 見る**——
 * 日本語の 読み上げは おおよそ 1文字 0.2秒 なので、2倍を 超えたら 別の ことを 話して いる。
 */
function readingLooksRight(
  script: string,
  transcript: string,
  seconds: number,
): { ok: boolean; why: string } {
  /** 日本語の 読み上げは おおよそ 1文字 0.2秒。 */
  const expected = script.length * 0.2;
  const lengthOk = seconds >= expected * 0.55 && seconds <= expected * 1.6;

  if (transcript.trim() === "") {
    return lengthOk
      ? { ok: true, why: "文字起こしが 無いので 長さだけで 見ました" }
      : {
          ok: false,
          why: `長さが 合いません（${seconds.toFixed(1)}秒／目やす ${expected.toFixed(1)}秒）`,
        };
  }
  const a = normalizeForCompare(script);
  const b = normalizeForCompare(transcript);
  const shared = commonLength(a, b);
  const ratio = shared / Math.max(a.length, b.length, 1);
  if (b.length > a.length * 1.6) {
    return { ok: false, why: `台本より ずっと 長い（${b.length}字／台本 ${a.length}字）` };
  }
  if (ratio >= 0.55) return { ok: true, why: `一致 ${(ratio * 100).toFixed(0)}%` };
  /*
   * **文字起こしが 途中で 切れた だけ**の ときを 助ける。
   * 文字起こしの ほとんどが 台本の 中に ある（＝よけいな ことを 言って いない）のに
   * 短い ときは、言い足りないのでは なく 書き起こしが 足りない。
   * 音の 長さが 台本に 合って いれば 通す。
   */
  const inScript = shared / Math.max(b.length, 1);
  if (inScript >= 0.8 && lengthOk) {
    return { ok: true, why: `文字起こしは 途中まで（${transcript.trim()}）だが 長さは 合う` };
  }
  return { ok: false, why: `一致 ${(ratio * 100).toFixed(0)}%: 「${transcript.trim()}」` };
}

/**
 * 新しい モデルから 順に ためし、**台本どおりに 読めた ものだけ**を 返す。
 *
 * 同じ モデルでも 2回目で 読み上げに なる ことが ある（会話の モデルなので
 * ゆらぐ）。だから モデルの 一覧を 2周する。
 */
async function synthesizeWithFallback(text: string): Promise<Spoken> {
  const failures: string[] = [];
  for (let round = 0; round < 2; round += 1) {
    for (const model of LIVE_TTS_MODELS) {
      try {
        const spoken = await synthesize(text, model);
        const seconds = spoken.pcm.byteLength / OUT_RATE / 2;
        const verdict = readingLooksRight(text, spoken.transcript, seconds);
        if (verdict.ok) return spoken;
        failures.push(`${model}: 読み上げに なって いません — ${verdict.why}`);
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
      /*
       * つづけて つなぐと 断られる。**無料枠の Live は 1分あたりの つなぎ数が 少ない**——
       * 2026-08-28 に 4本 作った ところで「音が 来ないまま 切れました」が 続いた
       *（鍵の まちがいでは なく 数の 上限。1分 待つと また つながった）。
       * だから 1回ごとに ゆっくり 置き、ひと巡り したら もっと 長く 待つ。
       */
      await new Promise((wait) => setTimeout(wait, 6_000));
    }
    if (round === 0) await new Promise((wait) => setTimeout(wait, 30_000));
  }
  throw new Error(`音に できませんでした:\n  ${failures.join("\n  ")}`);
}

/**
 * 本体。**トップレベルの await を 使わない**——このリポジトリの `.ts` は
 * CJS として 読まれる ので（package.json に type: module が 無い）、
 * トップレベルで await すると 変換の 時点で 落ちる（2026-08-18 に 実発生）。
 */
async function main(): Promise<void> {
  const outDir = join("public", "audio", "meetings", meetingId);
  mkdirSync(outDir, { recursive: true });

  const urls: Record<string, string> = {};
  const failed: string[] = [];

  for (const [index, line] of lines.entries()) {
    const file = join(outDir, `${line.key}.wav`);
    const url = `/audio/meetings/${meetingId}/${line.key}.wav`;
    /*
     * すでに ある ものは 作り直さない。
     * 1回目で 6つ 作れて 7つ目で 落ちた ことが ある（2026-08-18）。
     * 作り直しに すると、もう一度 走らせる たびに 全部 作る ことに なり、
     * 上限に ぶつかる 回数も 増える。
     */
    if (existsSync(file) && !force) {
      console.log(`(${index + 1}/${lines.length}) ${line.key} … すでに あります`);
      urls[line.key] = url;
      continue;
    }

    process.stdout.write(`(${index + 1}/${lines.length}) ${line.key} … `);
    try {
      const spoken = await synthesizeWithFallback(line.text);
      writeFileSync(file, toWav(spoken.pcm));
      urls[line.key] = url;
      const seconds = (spoken.pcm.byteLength / OUT_RATE / 2).toFixed(1);
      // **読み上げた 中身を 残す**。あとから ログだけで 台本と 見くらべられる
      console.log(`${seconds}秒 「${spoken.transcript.trim()}」`);
    } catch (error) {
      /*
       * 1つ 作れなくても **そこで 全部を 捨てない**。
       * 前は ここで 投げて いた ので、6つ 作れて いたのに 何も 残らなかった。
       * 作れた ぶんは 教材に 書き、作れなかった ものだけを 報告する
       *（もう一度 走らせれば、足りない ものだけを 作る）。
       */
      console.log("できませんでした");
      console.error(`  ${error instanceof Error ? error.message : String(error)}`);
      failed.push(line.key);
    }
  }

  meeting.questions = meeting.questions.map((q: { id: string }) =>
    urls[q.id] ? { ...q, audioUrl: urls[q.id] } : q,
  );
  if (urls.closing) meeting.closingAudioUrl = urls.closing;
  writeFileSync(meetingPath, `${JSON.stringify(meeting, null, 2)}\n`);
  console.log(
    `${meetingPath} に audioUrl を 書きました（声: ${voice}・${Object.keys(urls).length}/${lines.length}）`,
  );

  if (failed.length > 0) {
    console.warn(
      `⚠ 作れなかった もの: ${failed.join(" ")}（もう一度 走らせると 足りない ぶんだけ 作ります）`,
    );
  }
  if (Object.keys(urls).length === 0) {
    console.error("1つも 作れませんでした");
    process.exit(1);
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
