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
    const {
      data: { user },
    } = await supabase.auth.getUser();
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
