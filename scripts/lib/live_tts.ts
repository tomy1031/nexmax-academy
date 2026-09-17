/**
 * Live TTS の 読み上げ（作り置きの 音を 作る ところ）— ミーティングと リスニングで 共用。
 *
 * もとは `scripts/make_meeting_audio.ts` の 中に あった。2026-09-03 に
 * **リスニングの 音も 同じ 道で 作れる ように**、ここへ 出した。
 * 出しただけで 中身は 変えて いない——ちがうのは、鍵と 声を 引数で 受ける ことだけ
 *（前は モジュールの 変数を 直に 見て いた）。
 *
 * ここが 見て いる いちばん 大事な こと: **Live は 会話の モデルなので、台本が
 * しつもんの 形だと 答えて しまう**。だから 読み上げの 文字起こしを 一緒に もらい、
 * 台本と 見くらべて、合わない ものは 書かずに 捨てる（`readingLooksRight`）。
 */

import { GoogleGenAI, Modality } from "@google/genai";
import { LIVE_TTS_MODELS, TEXT_MODEL } from "../../src/lib/ai/models";
import { NARRATOR_INSTRUCTION } from "../../src/lib/audio/narrator";

/** Live が 返す 音の サンプリングレート（Live API の 決まり）。 */
export const OUT_RATE = 24_000;

/**
 * **読み上げ用の 言い換え**（画面の 字は 変えない）。
 *
 * ラテン文字の 商品名は、そのまま 渡すと **綴りから 読まれて 別の 音に なる**——
 * `NMClaw` が「エヌエムシーロー」に なった（2026-09-04 に 実発生。正しくは エヌエムクロー）。
 * 学習者に 見せる 字は `NMClaw` の ままに して、**Live へ 渡す 文だけ** カタカナに する。
 *
 * 頭字語（SES・DX・IT）は 綴りどおり 1字ずつ 読まれる ので 直さなくて よい。
 * ここに 足すのは **綴りから 読めない 名前**だけ。
 */
const SPEECH_ALIASES: readonly (readonly [string, string])[] = [["NMClaw", "エヌエムクロー"]];

/** 読み上げる 前に 言い換える（長い ものから 当てる）。 */
export function forSpeech(text: string): string {
  let out = text;
  for (const [from, to] of [...SPEECH_ALIASES].sort((a, b) => b[0].length - a[0].length)) {
    out = out.split(from).join(to);
  }
  return out;
}

/** だれの 声で 読むか。声は 人物カード（`content/characters/<id>.json`）の `voice`。 */
export interface Speaker {
  readonly apiKey: string;
  readonly voice: string;
  /** 読み上げの 指示（`NARRATOR_INSTRUCTION`）の あとに 足す 文。 */
  readonly instruction?: string;
  /**
   * 1周目で だめ だったら、2周目からは 文を「」で 囲んで 渡す。
   * 「わかりました。」の ような 短い 文を 話しかけと 取り違えて **返事を して しまう**
   * モデルが ある（2026-09-16。gemini-3.1-flash-live-preview で 4回 続けて 返事に なった）。
   */
  readonly quoteOnRetry?: boolean;
  /**
   * Live が 文字起こしを 返さなかった とき、音を **別の モデルで 文字に 起こして** 見くらべる。
   * gemini-3.8-live は 音は 返すのに 文字起こしが 空の ことが 続いた（2026-09-16。
   * 「これは とても 大切です。」など 4文が 4回ずつ 空）。確かめられない 音は 通せないので、
   * 読み上げとは 別の モデル（`TEXT_MODEL`）で 聞き直す——自分の 読み上げを 自分で
   * 書き起こすより、きびしい 確かめに なる。
   */
  readonly transcribeWhenEmpty?: boolean;
}

/** 生PCM（16bit・モノラル）に WAV の 頭を つける。 */
export function toWav(pcm: Uint8Array): Buffer {
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
export interface Spoken {
  readonly pcm: Uint8Array;
  /** `outputAudioTranscription`。空の ことも ある（モデルに よる）。 */
  readonly transcript: string;
  /** 読み上げた モデル（同じ 声でも モデルで 声の 質が 変わる ので 残す）。 */
  readonly model: string;
  /** 文字起こしを 返した モデル（Live 自身で なければ `TEXT_MODEL`）。 */
  readonly transcriptBy?: string;
}

/** 音を 文字に 起こす（Live の 文字起こしが 空だった ときの 控え）。 */
export async function transcribePcm(pcm: Uint8Array, apiKey: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "audio/wav", data: toWav(pcm).toString("base64") } },
          {
            text:
              "この日本語の音声を、聞こえたとおりに一字一句そのまま文字起こししてください。" +
              "言い直しや足りない言葉も直さずに書いてください。文字起こしの文だけを返してください。",
          },
        ],
      },
    ],
  });
  return response.text?.trim() ?? "";
}

/**
 * 1文を 読み上げて 音と 文字起こしを 返す。
 *
 * 返事が 来ないまま 開きっぱなしに しない（60秒で あきらめて つぎの モデルへ）。
 *
 * ## 読み終えたら **つなぎを 閉じる**
 * 2026-09-16 まで 閉じて いなかった（ここの 覚書は「ひと呼吸 待ってから 閉じる」と
 * 書いて いたのに、実際は 結果を 返すだけ だった）。開いた ままの つなぎは
 * 向こうが 切るまで 残り、**無料枠の 同時に 開ける 数**を 食う。報告の リスニングを
 * 1文ずつ 作ったら **3文 作った ところで 4文目から 全部の モデルが「使いすぎ」
 *（code 1011 You exceeded your current quota）**に なった。
 * 「1分あたりの つなぎ数が 少ない」（下の 覚書）と 見えて いた ものの 一部も これだった おそれが ある。
 */
async function synthesize(text: string, model: string, speaker: Speaker): Promise<Spoken> {
  const ai = new GoogleGenAI({ apiKey: speaker.apiKey, apiVersion: "v1beta" });
  const chunks: Uint8Array[] = [];
  let transcript = "";

  return await new Promise<Spoken>((resolve, reject) => {
    let settled = false;
    let session: { close: () => void } | null = null;
    const closeSession = () => {
      try {
        session?.close();
      } catch {
        // もう 閉じて いる ものは 閉じられない（それで よい）
      }
    };
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // 閉じると onclose が 呼ばれるが、settled なので 二重には 返らない
      closeSession();
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
          systemInstruction: speaker.instruction
            ? `${NARRATOR_INSTRUCTION}${speaker.instruction}`
            : NARRATOR_INSTRUCTION,
          speechConfig: {
            languageCode: "ja-JP",
            voiceConfig: { prebuiltVoiceConfig: { voiceName: speaker.voice } },
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
              const done = () =>
                finish(() =>
                  chunks.length > 0
                    ? resolve({ pcm: Buffer.concat(chunks), transcript, model })
                    : reject(new Error(`${model}: 音が 空でした`)),
                );
              /*
               * 700ミリ秒 待っても 文字起こしが 1字も 無い ときは、もう 2秒 待つ
               *（2026-09-16。gemini-3.8-live で 音は あるのに「文字起こしが 空」で 落ちた。
               * 閉じる ように した ので、待たないと 遅れて 来る 文字起こしを 自分で 切る）。
               */
              setTimeout(() => (transcript.trim() ? done() : setTimeout(done, 2_000)), 700);
            }
          },
          onerror: (error: unknown) =>
            finish(() => reject(new Error(`${model}: ${String(error)}`))),
          onclose: (event: unknown) =>
            finish(() =>
              chunks.length > 0
                ? resolve({ pcm: Buffer.concat(chunks), transcript, model })
                : reject(new Error(`${model}: 音が 来ないまま 切れました${closeReason(event)}`)),
            ),
        },
      })
      .then((opened) => {
        session = opened;
        // つながる 前に 時間切れ などで 終わって いたら、すぐ 閉じる
        if (settled) {
          closeSession();
          return;
        }
        opened.sendClientContent({ turns: text, turnComplete: true });
      })
      .catch((error: unknown) => finish(() => reject(new Error(`${model}: ${String(error)}`))));
  });
}

/**
 * 切れた 理由（閉じ番号と 理由の 文）。**数の 上限か、声が 無いのか**を 分ける ために 残す
 *（2026-09-16。Sadachbia だけ 2回 続けて 切れ、どちらか 分からなかった）。
 * 鍵は URL と ヘッダにしか 無いので ここには 入らない。
 */
function closeReason(event: unknown): string {
  if (typeof event !== "object" || event === null) return "";
  const { code, reason } = event as { code?: unknown; reason?: unknown };
  const parts: string[] = [];
  if (typeof code === "number") parts.push(`code ${code}`);
  if (typeof reason === "string" && reason.length > 0) parts.push(reason);
  return parts.length > 0 ? `（${parts.join(" / ")}）` : "";
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

/** 読み上げを 受け取るか（`readingLooksRight` より きびしく 見たい ときに 渡す）。 */
export type AcceptSpoken = (spoken: Spoken) => { ok: boolean; why: string };

/**
 * 新しい モデルから 順に ためし、**台本どおりに 読めた ものだけ**を 返す。
 *
 * 同じ モデルでも 2回目で 読み上げに なる ことが ある（会話の モデルなので
 * ゆらぐ）。だから モデルの 一覧を 2周する。
 *
 * `accept` を 渡すと、`readingLooksRight` を 通った あとに もう一段 見る
 *（リスニングの 1文ずつの 音は 読みの ずれ 1字までしか 許さない — `speech_reading.ts`）。
 * 通らなければ 同じく つぎの モデルへ 進む。
 *
 * `models` を 渡すと その モデルだけを 順に ためす。**1つだけ 渡せば 別の モデルに
 * 切り替えない**——同じ 声でも モデルが 変わると 声の 質が 変わるので、1人の 声を
 * そろえたい とき（報告の リスニング。2026-09-16 の 指定）に 使う。1つの ときは
 * ためす 回数が 減らない ように 4周 する。
 */
export async function synthesizeWithFallback(
  raw: string,
  speaker: Speaker,
  accept?: AcceptSpoken,
  models: readonly string[] = LIVE_TTS_MODELS,
): Promise<Spoken> {
  const text = forSpeech(raw);
  const failures: string[] = [];
  const rounds = Math.max(2, Math.ceil(4 / models.length));
  for (let round = 0; round < rounds; round += 1) {
    for (const model of models) {
      try {
        const turn = speaker.quoteOnRetry && round > 0 ? `「${text}」` : text;
        let spoken = await synthesize(turn, model, speaker);
        if (speaker.transcribeWhenEmpty && spoken.transcript.trim() === "") {
          try {
            const heard = await transcribePcm(spoken.pcm, speaker.apiKey);
            if (heard) spoken = { ...spoken, transcript: heard, transcriptBy: TEXT_MODEL };
          } catch (error) {
            failures.push(`${TEXT_MODEL}: 文字起こし できません — ${String(error)}`);
          }
        }
        const seconds = spoken.pcm.byteLength / OUT_RATE / 2;
        const verdict = readingLooksRight(text, spoken.transcript, seconds);
        if (!verdict.ok) {
          failures.push(`${model}: 読み上げに なって いません — ${verdict.why}`);
        } else {
          const strict = accept?.(spoken) ?? verdict;
          if (strict.ok) return spoken;
          failures.push(`${model}: 原稿と ずれて います — ${strict.why}`);
        }
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
