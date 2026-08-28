/**
 * ミーティングの 会話を 台帳に 残す（ブラウザ側）— **ためて、おわりに 1回**
 *
 * 会話の練習はその場で消えるので、先生には「できたのか」が一度も見えなかった。
 * 判定をAIに通すようになったので、1往復ずつ残して管理画面で見られるようにする。
 *
 * ## 1往復ごとに 送るのを やめた（2026-08-28 の 指定）
 * 「各シートの回答についてとヘンディさん、松井社長との対話については、
 *   終了後1度でまとめてデータを送るようにしてください」
 *
 * 前は 発話1回ごとに 1行 insert して いた。1回の ミーティングは 10〜12問で、
 * 言い直しも 入るので **1人 15〜30往復**。20人の 授業では 300〜600回の 書き込みが
 * 授業の 45分に 集中する。もんだい（quizset）の 側は はじめから
 * **出した ときに 1回**（`@/lib/quiz/results-db` の `saveQuizResults`）なので、
 * 会話の 側だけが 割れて いた。ここを そちらに そろえる。
 *
 * ## ためた ものは 端末にも 置く
 * 記憶（メモリ）だけに ためると、**流す 前に 画面を 出た ぶんが 丸ごと 消える**
 * ——授業の チャイム・回線の ゆらぎ・更新ボタンで、そのまま 起きる。
 * だから 1往復ごとに **端末（localStorage）にも 書く**（通信は しない）。
 * 次に その ミーティングを 開いた ときに 残って いれば、そこで 流す。
 * 「送るのは 1回」は 保ちつつ、「黙って 消える」は 作らない。
 *
 * ## 失敗しても会話を止めない
 * 保存は**あとから見るため**のもので、学習者のためのものではない。DBが未設定でも、
 * ログインしていなくても、通信が落ちても、会話はそのまま続く。だからここは
 * 何があっても投げない（静かに諦める — content-db.ts と同じ流儀）。
 */

import { createClient } from "@/lib/supabase/client";
import { defaultBackend, type ProgressBackend } from "@/lib/progress/store";
import type { JudgeGrade, JudgeResult } from "@/lib/meeting/judge";

/**
 * 台帳に 残す 見かた。
 *
 * **軸（language / relevance / form / glossary）を 持たない ものも ある**——
 * 松井社長との 会話（talk-game）の 見かたは 三段の 評価では なく「気づき」で 進むので、
 * ヘンディさんの `JudgeResult` とは 形が ちがう。無い ものを それらしい 既定で
 * 埋めて 残すと、先生の 画面は **無い ことを「ja」や 0 として 読む**——
 * 数えられない ものを 数えた ことに するのが いちばん 悪い。だから **持って いる ぶんだけ**残す。
 */
export type MeetingTurnJudge = Partial<JudgeResult>;

export interface MeetingTurnLog {
  meetingId: string;
  questionId: string;
  /** 同じ質問への何回目の発話か（1始まり）。言い直しの効果はこれで追う。 */
  attempt: number;
  mode: "text" | "voice";
  utterance: string;
  judge: MeetingTurnJudge | null;
  /** "none" = AIの判定を使えた。それ以外は落ちた理由（noKey・quota…）。 */
  fallback: string;
  model: string;
  latencyMs: number;
}

/** 進捗ストアと同じ名前空間（あちらの定数は非公開なので、鍵の形だけ合わせる）。 */
const NAMESPACE = "nexmax:v1";

/**
 * ためて おける 上限。ここを 超えたら **古い ものから 捨てる**。
 *
 * 1回の ミーティングは 10〜12問・言い直しを 入れても 30往復ほどなので、
 * 200 は 通常の 授業では 当たらない。当たるのは 流せない まま 何日も
 * 話し続けた ときで、その ときに 端末の 保存を 埋め尽くさない ための 蓋である。
 */
const MAX_BUFFERED = 200;

function keyOf(meetingId: string): string {
  return `${NAMESPACE}:meeting-turns:${meetingId}`;
}

function readBuffer(meetingId: string, backend: ProgressBackend): MeetingTurnLog[] {
  const raw = backend.get(keyOf(meetingId)) ?? "";
  if (raw === "") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    // 壊れた保存値は「まだ無い」として扱う（会話は続けられる）
    return Array.isArray(parsed) ? (parsed as MeetingTurnLog[]) : [];
  } catch {
    return [];
  }
}

/**
 * 1往復を **ためる**（通信しない）。送るのは `flushMeetingTurns`。
 *
 * 端末に 書けない 端末（プライベートモード等）でも 会話は 続く——その ときは
 * ためた ものが 残らないだけで、画面は 何も 変わらない。
 */
export function bufferMeetingTurn(
  log: MeetingTurnLog,
  backend: ProgressBackend = defaultBackend(),
): void {
  const next = [...readBuffer(log.meetingId, backend), log].slice(-MAX_BUFFERED);
  backend.set(keyOf(log.meetingId), JSON.stringify(next));
}

/** ためて ある 数（テストと 開発時の 目安に 使う）。 */
export function bufferedMeetingTurns(
  meetingId: string,
  backend: ProgressBackend = defaultBackend(),
): MeetingTurnLog[] {
  return readBuffer(meetingId, backend);
}

/**
 * ためた ものを **1回の insert で** 送る。
 *
 * 送れた ときだけ 端末から 消す。送れなかった ら 残す——次に その ミーティングを
 * 開いた ときに もう一度 流せる（記録が 黙って 消えるのを 作らない）。
 */
export async function flushMeetingTurns(
  meetingId: string,
  backend: ProgressBackend = defaultBackend(),
): Promise<void> {
  const buffered = readBuffer(meetingId, backend);
  if (buffered.length === 0) return;
  const supabase = createClient();
  if (!supabase) return;
  try {
    /*
     * `getUser()` ではなく `getSession()` を使う（2026-08-26）。
     *
     * `getUser()` は **呼ぶたびに Supabase の 認証サーバへ 1往復する**。`getSession()` は
     * 端末に ある ものを 読むだけで 往復しない。
     *
     * **詐称は できない**。`profile_id` は そのまま 通らず、DB 側の 決まりが
     * `auth.uid() = profile_id` を 確かめる
     *（supabase/migrations/20260813100000_meeting_turn_logs.sql の
     *  `meeting_turn_logs_insert_own`）。ここで 別人の id を 書いても 弾かれる。
     * この 関数は **あとから 見る ための 記録**で、これで 画面の 何かが
     * 開いたり 閉じたり する わけでは ない。
     *
     * ログインの 判定そのもの（画面を 見せるか）は middleware が
     * `getClaims()` で 署名を 確かめて いる（src/middleware.ts）。
     */
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    // ログインして いない（デモモード）ときは **消さずに 残す**。
    // 消すと、あとで ログインしても もう 送れない。
    if (!user) return;
    const { error } = await supabase.from("meeting_turn_logs").insert(
      buffered.map((log) => ({
        profile_id: user.id,
        meeting_id: log.meetingId,
        question_id: log.questionId,
        attempt: log.attempt,
        mode: log.mode,
        utterance: log.utterance,
        judge: log.judge,
        grade: (log.judge?.grade ?? null) as JudgeGrade | null,
        fallback: log.fallback,
        model: log.model,
        latency_ms: log.latencyMs,
      })),
    );
    /*
     * supabase-js は **投げずに 返す**ので、`{ error }` を 受け取らないと 永久に
     * 気づけない（try/catch で 囲んでも 入らない）。送れなかった ものは 残して、
     * 次に 開いた ときに もう一度 流す。
     */
    if (error) {
      console.warn("[meeting-turns] 記録できませんでした:", error.message);
      return;
    }
    backend.remove(keyOf(meetingId));
  } catch {
    // 残せなくても会話は続ける（保存はあとから見るためのもの）
  }
}
