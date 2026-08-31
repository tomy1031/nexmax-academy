/**
 * つづきから 話す — 画面を 更新しても 好感度を 0 に 戻さない
 *
 * ## なぜ 要るか
 * 「画面更新などした 場合でも 途中から プレイできる ように して ほしい」
 *（2026-08-21 の 指定・docs/constraints.md）。ミーティングで 一度 実際に 起きた
 * 事故と 同じ 形が、この 教材にも ある——**60% まで 来た 人が、
 * 回線の ゆらぎで 開き直した 瞬間に 0% に 戻る**。教室の 回線を 考えると、
 * これは「たまに 起きる」では なく「よく 起きる」。
 *
 * ## 残すのは 好感度と ばんと 回数だけ
 * セリフの 途中（`queue`）までは 残さない。**その場で AIが 作った 深掘りの しつもんは、
 * 保存しても 同じ 会話には 戻らない**（相手の つなぎは 切れて いる）。だから
 * 開き直した ときは「いまの ばんの 出だしの ことば」から 話し直す——
 * 好感度が 残って いれば、学習者から 見て「消えた」感じは しない。
 *
 * 置き場は 進捗ストアと 同じ 入れ物・同じ 名前空間で、鍵だけ 分ける
 *（`src/lib/meeting/resume.ts` と 同じ 流儀）。DBには 送らない。
 *
 * ## 満タンに なったら 消す
 * 話しきった 人が もう一度 開いたら、**はじめから 話せる**のが 正しい。
 */

import { z } from "zod";
import { EMPTY_TALK, type TalkState } from "@/lib/talkgame/affinity";
import { defaultBackend, type ProgressBackend } from "@/lib/progress/store";

/** 進捗ストアと同じ名前空間（あちらの定数は非公開なので、鍵の形だけ合わせる）。 */
const NAMESPACE = "nexmax:v1";

function keyOf(meetingId: string): string {
  return `${NAMESPACE}:talkgame-resume:${meetingId}`;
}

const resumeSchema = z.object({
  round: z.enum(["talk", "listen", "clear"]).default("talk"),
  percent: z.number().int().min(0).default(0),
  turns: z.number().int().min(0).default(0),
  asked: z.number().int().min(0).default(0),
});

/**
 * 端末に 残って いる ところ（無ければ null）。
 *
 * 満タンまで 行った 保存値は **「無い」と 同じに 扱う**。クリアの 画面に 座らせ直しても
 * できる ことが 無い——もう一度 話せる ほうが 学習者の ためになる。
 * 壊れた 保存値も「まだ 無い」として 扱う（学習は 続けられる）。
 */
export function readTalkResume(
  meetingId: string,
  backend: ProgressBackend = defaultBackend(),
): TalkState | null {
  return parseTalkResume(readTalkResumeRaw(meetingId, backend));
}

export function saveTalkResume(
  meetingId: string,
  state: TalkState,
  backend: ProgressBackend = defaultBackend(),
): void {
  backend.set(keyOf(meetingId), JSON.stringify(state));
}

export function clearTalkResume(
  meetingId: string,
  backend: ProgressBackend = defaultBackend(),
): void {
  backend.remove(keyOf(meetingId));
}

/**
 * 画面から 読む ための 入口（`useSyncExternalStore`）。
 *
 * **生の 文字列**を 返すのは、同じ 中身なら 同じ 値で ないと React が 描き直しを
 * 止められない ため（毎回 新しい オブジェクトを 返すと 無限に 描き直す）。
 * 中身に ほどくのは 画面側の `useMemo`。
 */
export function subscribeTalkResume(listener: () => void): () => void {
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}

export function readTalkResumeRaw(
  meetingId: string,
  backend: ProgressBackend = defaultBackend(),
): string {
  return backend.get(keyOf(meetingId)) ?? "";
}

/** サーバでは 端末の 保存値が 読めない。無い ものとして 描く。 */
export function readTalkResumeRawOnServer(): string {
  return "";
}

/** 生の 文字列を 状態に ほどく（読めなければ null）。 */
export function parseTalkResume(raw: string): TalkState | null {
  if (raw === "") return null;
  try {
    const parsed = resumeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    if (parsed.data.round === "clear") return null;
    return parsed.data;
  } catch {
    return null;
  }
}

/** 端末に 残って いる ところから 始める（無ければ まっさらから）。 */
export function restoreTalk(
  meetingId: string,
  backend: ProgressBackend = defaultBackend(),
): TalkState {
  return readTalkResume(meetingId, backend) ?? EMPTY_TALK;
}
