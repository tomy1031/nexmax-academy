/**
 * ミーティングの1往復を台帳に残す（ブラウザ側）
 *
 * 会話の練習はその場で消えるので、先生には「できたのか」が一度も見えなかった。
 * 判定をAIに通すようになったので、1往復ずつ残して管理画面で見られるようにする。
 *
 * ## 失敗しても会話を止めない
 * 保存は**あとから見るため**のもので、学習者のためのものではない。DBが未設定でも、
 * ログインしていなくても、通信が落ちても、会話はそのまま続く。だからここは
 * 何があっても投げない（静かに諦める — content-db.ts と同じ流儀）。
 */

import { createClient } from "@/lib/supabase/client";
import type { JudgeGrade, JudgeResult } from "@/lib/meeting/judge";

export interface MeetingTurnLog {
  meetingId: string;
  questionId: string;
  /** 同じ質問への何回目の発話か（1始まり）。言い直しの効果はこれで追う。 */
  attempt: number;
  mode: "text" | "voice";
  utterance: string;
  judge: JudgeResult | null;
  /** "none" = AIの判定を使えた。それ以外は落ちた理由（noKey・quota…）。 */
  fallback: string;
  model: string;
  latencyMs: number;
}

export async function recordMeetingTurn(log: MeetingTurnLog): Promise<void> {
  const supabase = createClient();
  if (!supabase) return;
  try {
    /*
     * `getUser()` ではなく `getSession()` を使う（2026-08-26）。
     *
     * `getUser()` は **呼ぶたびに Supabase の 認証サーバへ 1往復する**。ここは
     * **発話1回ごと**に呼ばれるので、20人が 同時に 話す 授業では 240〜720往復に なる
     *（1回の ミーティングは 12問・言い直しの 上限は 無い）。`getSession()` は
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
    if (!user) return;
    await supabase.from("meeting_turn_logs").insert({
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
    });
  } catch {
    // 残せなくても会話は続ける（保存はあとから見るためのもの）
  }
}
