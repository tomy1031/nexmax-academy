/**
 * 修了証を **DB に 発行する**（終えた 瞬間に 1回だけ insert）
 *
 * 時刻・名前・照合番号・何回目かは DB の トリガーが 押す
 *（`supabase/migrations/20261006120000_completion_certificates.sql`）。端末が 送るのは
 * 点と 内訳だけ。`insert(...).select()` で、DB が 埋めた 値を 1往復で 受け取る。
 *
 * ## 発行は ボタンでは なく「終えた 瞬間」
 * 押した 時刻に すると「あとで こっそり やって、授業中に 押す」が できて しまう。
 *
 * ## ログインして いない（デモ）・落ちた とき
 * - デモ: **見本**を 返す（番号なし・端末の 時刻・「見本」と はっきり 出す）。正式では ない
 * - 落ちた: `error` を 返す。画面は「もう一度 ためす」を 出す（黙って 捨てない）
 * supabase-js は 投げずに `{ error }` を 返すので、必ず 受ける（word-test-db.ts と 同じ）。
 */
"use client";

import { createClient } from "@/lib/supabase/client";
import { readOwnId } from "@/lib/supabase/claims";
import { getProfile } from "@/lib/profile";
import type { CertificateResult, IssuedCertificate } from "./model";

export type IssueOutcome =
  | { readonly status: "issued"; readonly cert: IssuedCertificate }
  | { readonly status: "sample"; readonly cert: IssuedCertificate }
  | { readonly status: "error"; readonly message: string };

/** ログインして いない ときの 見本（正式では ない）。 */
function sampleOf(result: CertificateResult): IssuedCertificate {
  return {
    ...result,
    code: "",
    issuedAt: new Date().toISOString(),
    learnerName: getProfile()?.displayName ?? "",
    attempt: 0,
    official: false,
  };
}

export async function issueCertificate(result: CertificateResult): Promise<IssueOutcome> {
  const client = createClient();
  if (!client) return { status: "sample", cert: sampleOf(result) };
  const profileId = await readOwnId(client).catch(() => null);
  if (!profileId) return { status: "sample", cert: sampleOf(result) };

  const { data, error } = await client
    .from("completion_certificates")
    .insert({
      profile_id: profileId,
      content_id: result.contentId,
      kind: result.kind,
      perfect: result.perfect,
      score: result.score,
      max_score: result.maxScore,
      misses: result.misses,
      detail: result.detail,
    })
    .select("code, issued_at, learner_name, attempt")
    .single();
  if (error || !data) {
    // 表が まだ 無い（移行SQLの 前）・つながらない。黙って 捨てず、画面に「もう一度」を 出す
    console.warn("[certificate] 修了証を 出せませんでした:", error?.message);
    return { status: "error", message: error?.message ?? "no data" };
  }
  const row = data as { code: string; issued_at: string; learner_name: string; attempt: number };
  return {
    status: "issued",
    cert: {
      ...result,
      code: row.code,
      issuedAt: row.issued_at,
      learnerName: row.learner_name,
      attempt: row.attempt,
      official: true,
    },
  };
}
