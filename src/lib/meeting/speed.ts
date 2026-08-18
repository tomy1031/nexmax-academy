/**
 * 相手の 話す 速さ — 学習者が 自分で 決めて、端末に 残す
 *
 * ## なぜ 学習者が 決めるのか
 * 同じ 教室でも、聞き取れる 速さは 人に よって ちがう。速いままだと
 * 「何を 言われたか 分からない → 答えられない」で 会話ごと 止まる。
 * 負荷の 調整装置は 学習者自身が 握る（設計01 P11。ヒントの 出し入れと 同じ考え）。
 *
 * ## 入る 前にも、話して いる 間にも 変えられる
 * 入る 前（さんかする 前の 画面）に 決めておけば、**いちばん はじめの ひとこと**から
 * ゆっくり 聞ける。会話の 途中で「速い」と 気づいた ときにも 変えられる
 *（2026-08-18 の指定「入室の時と話の時両方」）。
 *
 * ## 実現の しかた
 * Gemini Live の `speechConfig` に **速さの つまみは 無い**（声と 言語だけ）。
 * だから 鳴らす 側で 変える——届いた 音を 遅く／速く 再生する。声の 高さも
 * 少し 変わるが、**聞き取れない 速さで 正しい 高さ**より、聞き取れる ほうが よい。
 *
 * 保存は 進捗ストアと 同じ 名前空間に 鍵を1つ（`hint.ts` と 同じ流儀）。
 * 教材ごとに 分けないのは、**つぎの 教材でも 同じ 速さで いてほしい**から。
 */

import { defaultBackend, type ProgressBackend } from "@/lib/progress/store";

/** 選べる 速さ。3つだけに するのは、選ぶ こと自体を 学習の じゃまに しないため。 */
export const SPEECH_SPEEDS = [
  { id: "slow", label: "ゆっくり", rate: 0.8 },
  { id: "normal", label: "ふつう", rate: 1 },
  { id: "fast", label: "はやい", rate: 1.15 },
] as const;

export type SpeechSpeedId = (typeof SPEECH_SPEEDS)[number]["id"];

/** 既定は「ふつう」。ゆっくりを 既定に すると、聞ける 学習者にも 遅い 声を 押しつける。 */
export const DEFAULT_SPEED: SpeechSpeedId = "normal";

/** 速さの id → 再生の 倍率。知らない id は 既定に 倒す（保存値が 古くても 止まらない）。 */
export function rateOf(id: SpeechSpeedId): number {
  return SPEECH_SPEEDS.find((speed) => speed.id === id)?.rate ?? 1;
}

/** 進捗ストアと同じ名前空間（あちらの定数は非公開なので、鍵の形だけ合わせる）。 */
const NAMESPACE = "nexmax:v1";
const KEY = `${NAMESPACE}:meeting-speed`;

const listeners = new Set<() => void>();

/** 端末の保存値は「外の入れ物」なので、React からは購読して読む。 */
export function subscribeSpeechSpeed(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function readSpeechSpeed(backend: ProgressBackend = defaultBackend()): SpeechSpeedId {
  const saved = backend.get(KEY);
  return SPEECH_SPEEDS.some((speed) => speed.id === saved)
    ? (saved as SpeechSpeedId)
    : DEFAULT_SPEED;
}

/** サーバでは端末の保存値が読めない。既定で描いて、画面が出てから差し替える。 */
export function readSpeechSpeedOnServer(): SpeechSpeedId {
  return DEFAULT_SPEED;
}

export function saveSpeechSpeed(
  id: SpeechSpeedId,
  backend: ProgressBackend = defaultBackend(),
): void {
  backend.set(KEY, id);
  for (const listener of listeners) listener();
}
