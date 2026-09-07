/**
 * たいわ（Gemini Live）の 会話を 台帳に 残す — **ためて、退出の ときに 1回**
 *
 * ## なぜ 要るか
 * 対話の 教材は 3つ ある。ヘンディさんの ミーティングと 松井社長の たいわは
 * `meeting_turn_logs` に 残って いたのに、**お客さまと 話す「たいわ」だけが
 * 1行も 残って いなかった**（`live-mode.tsx` は 会話を 画面に 出すだけだった）。
 * その場で 消えるので、先生には「聞き出せたのか」が 一度も 見えない。
 *
 * ## なぜ meeting_turn_logs に 相乗りしないか
 * あちらは **学習者の 発話 1つ**が 1行で、相手の 返事は 残さない。ミーティングは
 * 「しつもんに 答える」形なので それで 足りる。たいわは 逆で、**学習者が 聞き出す**
 * ——相手が 何を 答えたかを 見ないと、その 質問が 効いたのかが 読めない。
 * 形の ちがう ものを 同じ 表に 押し込むと、無い ものを 既定で 埋める ことに なり、
 * 先生の 画面が それを 数えて しまう（`@/lib/meeting/log` の `MeetingTurnJudge` と 同じ 判断）。
 *
 * ## 名乗りかた
 * `readOwnId`（`getClaims`）を 使う。`meeting/log.ts` は `getSession()` だが、
 * こちらは このリポジトリが 2026-08-26 に **新しく 選んだ ほう**——署名を その場で
 * 確かめ、公開鍵は 10分 ためるので 外へ 出るのは 10分に 1回だけ
 *（`src/lib/supabase/claims.ts`。`quest/save.ts` も これ）。送るのは 退出の ときの
 * 1回だけ なので、どちらでも 往復は 増えない。
 *
 * ## ためた ものは 端末にも 置く
 * 記憶（メモリ）だけに ためると、**流す 前に 画面を 出た ぶんが 丸ごと 消える**。
 * 授業の チャイム・回線の ゆらぎ・更新ボタンで そのまま 起きる。だから 1発言ごとに
 * **端末（localStorage）にも 書く**（通信は しない）。次に その たいわを 開いた ときに
 * 残って いれば、そこで 流す。「送るのは 1回」を 保ちつつ「黙って 消える」を 作らない
 *（`flushMeetingTurns` と まったく 同じ 作り）。
 *
 * ## 落ちない
 * 会話は そのまま 続く。鍵が 無くても、ログインして いなくても、通信が 落ちても。
 */
"use client";

import { defaultBackend, type ProgressBackend } from "@/lib/progress/store";
import { createClient } from "@/lib/supabase/client";
import { readOwnId } from "@/lib/supabase/claims";

/** 進捗ストアと同じ名前空間（あちらの定数は非公開なので、鍵の形だけ合わせる）。 */
const NAMESPACE = "nexmax:v1";

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

/**
 * ためて おける 上限。超えたら **古い ものから 捨てる**。
 *
 * 1回の たいわ は 20〜40発言（両方ぶん）なので、200 は ふだん 当たらない。
 * 当たるのは 流せない まま 何日も 話し続けた ときで、そのときに 端末の 保存を
 * 埋め尽くさない ための 蓋である（`meeting/log.ts` と 同じ 数）。
 */
const MAX_BUFFERED = 200;

export interface TalkTurnLog {
  readonly talkId: string;
  /** 1回の たいわ を まとめる 鍵（つないだ ときに 1つ 作る）。 */
  readonly sessionId: string;
  readonly turnIndex: number;
  readonly speaker: "learner" | "partner";
  readonly mode: "text" | "voice";
  readonly body: string;
  /** その 発言で 開いた 要件ボードの 項目（learner のときだけ）。空 = 何も 開かなかった。 */
  readonly openedReqId: string;
  readonly openedCount: number;
  readonly reqTotal: number;
}

function keyOf(talkId: string): string {
  return `${NAMESPACE}:talk-turns:${talkId}`;
}

function readBuffer(talkId: string, backend: ProgressBackend): TalkTurnLog[] {
  const raw = backend.get(keyOf(talkId)) ?? "";
  if (raw === "") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    // 壊れた 保存値は「まだ 無い」として 扱う（会話は 続けられる）。
    return Array.isArray(parsed) ? (parsed as TalkTurnLog[]) : [];
  } catch {
    return [];
  }
}

/**
 * 1発言を **ためる**（通信しない）。送るのは `flushTalkTurns`。
 *
 * 同じ 番（`sessionId` + `turnIndex`）を もう一度 ためても 1つに する——
 * 画面は 字幕が 増えるたびに 全部を 見直す ので、同じ 発言が 何度も 通る。
 */
export function bufferTalkTurn(
  log: TalkTurnLog,
  backend: ProgressBackend = defaultBackend(),
): void {
  const buffered = readBuffer(log.talkId, backend);
  const at = buffered.findIndex(
    (one) => one.sessionId === log.sessionId && one.turnIndex === log.turnIndex,
  );
  const next = at >= 0 ? buffered.map((one, i) => (i === at ? log : one)) : [...buffered, log];
  backend.set(keyOf(log.talkId), JSON.stringify(next.slice(-MAX_BUFFERED)));
}

/** ためて ある ぶん（テストと 開発時の 目安に 使う）。 */
export function bufferedTalkTurns(
  talkId: string,
  backend: ProgressBackend = defaultBackend(),
): TalkTurnLog[] {
  return readBuffer(talkId, backend);
}

/** 1回の たいわ を まとめる 鍵（`newWordTestAttemptId` と 同じ 作り）。 */
export function newTalkSessionId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}

/** 同じ たいわ で 2つ 流れない ようにする（退出ボタンと 画面を 出る ときが 重なる）。 */
const flushing = new Set<string>();

/**
 * ためた ものを **1回の insert で** 送る。
 *
 * 送れた ときだけ 端末から 消す。送れなかった ら 残す——次に その たいわ を
 * 開いた ときに もう一度 流せる（記録が 黙って 消えるのを 作らない）。
 *
 * ## 消すのは **送れた ぶんだけ**
 * 鍵ごと 消すと、送って いる あいだに 増えた 発言が 一緒に 消える——声の 文字起こしは
 * つなぎを 切った あとにも 届く ので、これは 実際に 起きる。だから 送った
 * `sessionId + turnIndex` を 差し引いて 書き戻す（`flushRecords` の
 * 「送れた 行だけに 印を つける」と 同じ 流儀）。
 */
export async function flushTalkTurns(
  talkId: string,
  backend: ProgressBackend = defaultBackend(),
  /** 試験で 差し替える ため（`{ error }` を 返す 偽物を 渡す）。ふだんは 省く。 */
  supabase: NonNullable<ReturnType<typeof createClient>> | null = createClient(),
): Promise<void> {
  // 退出ボタンと 画面を 出る ときは 続けて 起きる。2本 走らせると 往復が むだに 増える。
  if (flushing.has(talkId)) return;
  const buffered = readBuffer(talkId, backend);
  if (buffered.length === 0) return;
  if (!supabase) return;
  flushing.add(talkId);
  try {
    const profileId = await readOwnId(supabase).catch(() => null);
    // ログインして いない（デモモード）ときは **消さずに 残す**。
    // 消すと、あとで ログインしても もう 送れない。
    if (!profileId) return;
    const { error } = await supabase.from("talk_turn_logs").upsert(
      buffered.map((log) => ({
        profile_id: profileId,
        talk_id: log.talkId,
        session_id: log.sessionId,
        turn_index: log.turnIndex,
        speaker: log.speaker,
        mode: log.mode,
        body: log.body,
        opened_req_id: log.openedReqId,
        opened_count: log.openedCount,
        req_total: log.reqTotal,
      })),
      // 送り直しで 会話が 二重に ならない（DB 側の unique と 同じ 2つ組）。
      { onConflict: "session_id,turn_index", ignoreDuplicates: true },
    );
    /*
     * supabase-js は **投げずに 返す**ので、`{ error }` を 受け取らないと 永久に
     * 気づけない（try/catch で 囲んでも 入らない）。
     */
    if (error) {
      if (!(error.code && MISSING_TABLE_CODES.has(error.code))) {
        console.warn("[talk-turns] 記録できませんでした:", error.message);
      }
      return;
    }
    // 送れた ぶんだけを 差し引く。送って いる あいだに 増えた 発言は 残す。
    const sent = new Set(buffered.map((log) => `${log.sessionId}:${log.turnIndex}`));
    const left = readBuffer(talkId, backend).filter(
      (log) => !sent.has(`${log.sessionId}:${log.turnIndex}`),
    );
    if (left.length === 0) backend.remove(keyOf(talkId));
    else backend.set(keyOf(talkId), JSON.stringify(left));
  } catch {
    // 残せなくても 会話は 続く（記録は あとから 見る ための もの）
  } finally {
    flushing.delete(talkId);
  }
}
