/**
 * PCM ↔ WAV（ブラウザで動く純粋な関数だけ）
 *
 * Gemini Live が返すのは 24kHz・16bit・モノラルの生PCM。<audio> はそのままでは
 * 再生できないので WAV のヘッダを付ける。
 *
 * 台本は行ごとに1つずつ作る（Live は1回の呼び出しで声を切り替えられない）。
 * つないだあと、行ごとの開始秒を返す。字幕を音に追従させる `script[].at` に
 * そのまま入るので、先生が秒数を手で測らずに済む。
 */

/** Gemini Live の出力仕様。ここを変えると音が半分の速さになったりする。 */
export const SAMPLE_RATE = 24_000;
const BITS_PER_SAMPLE = 16;
const CHANNELS = 1;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;

/** 行と行のあいだの無音（ミリ秒）。詰めると聞き取りの区切りが分からなくなる。 */
export const DEFAULT_GAP_MS = 400;

function silenceBytes(ms: number): Uint8Array {
  const samples = Math.round((SAMPLE_RATE * ms) / 1000);
  return new Uint8Array(samples * BYTES_PER_SAMPLE * CHANNELS);
}

/** つないだ結果と、行ごとの開始秒。 */
export interface JoinedPcm {
  readonly pcm: Uint8Array;
  /** 行ごとの開始秒（小数第2位まで）。script[].at に入れる。 */
  readonly startSeconds: number[];
}

/** 行ごとのPCMを、あいだに無音を挟んで1本につなぐ。 */
export function joinPcm(parts: readonly Uint8Array[], gapMs = DEFAULT_GAP_MS): JoinedPcm {
  const gap = silenceBytes(gapMs);
  const startSeconds: number[] = [];

  let total = 0;
  parts.forEach((part, index) => {
    if (index > 0) total += gap.length;
    startSeconds.push(bytesToSeconds(total));
    total += part.length;
  });

  const pcm = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part, index) => {
    if (index > 0) {
      pcm.set(gap, offset);
      offset += gap.length;
    }
    pcm.set(part, offset);
    offset += part.length;
  });

  return { pcm, startSeconds };
}

/** バイト数を秒に直す（小数第2位まで。字幕の追従はこの粗さで足りる）。 */
export function bytesToSeconds(bytes: number): number {
  return Math.round((bytes / (SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS)) * 100) / 100;
}

/** 生PCMに WAV のヘッダを付ける。 */
export function pcmToWav(pcm: Uint8Array): Blob {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const byteRate = SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE;

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt チャンクの長さ
  view.setUint16(20, 1, true); // 1 = 非圧縮PCM
  view.setUint16(22, CHANNELS, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, CHANNELS * BYTES_PER_SAMPLE, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);
  ascii(36, "data");
  view.setUint32(40, pcm.length, true);

  return new Blob([header, pcm as BlobPart], { type: "audio/wav" });
}

/** base64（Live の inlineData）を bytes に。 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
