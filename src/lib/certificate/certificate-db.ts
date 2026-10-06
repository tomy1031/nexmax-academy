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
import { updateRun } from "./run";

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

/**
 * いま ログインして いる 人の id。ログインして いない（デモ）は null。
 * **確かめられなかった（通信断など）は undefined**——見本と 取りちがえない。
 */
export async function currentOwner(): Promise<string | null | undefined> {
  const client = createClient();
  if (!client) return null;
  try {
    return await readOwnId(client);
  } catch {
    return undefined;
  }
}

/** 回を 始めた 人を 記録する（あとから 届く。発行の ときに 突き合わせる）。 */
export function claimRun(contentId: string): void {
  void currentOwner().then((owner) => {
    if (!owner) return;
    updateRun(contentId, (run) => (run.owner ? run : { ...run, owner }));
  });
}

/**
 * この 人が この 教材の 修了証を もう 持って いるか（DB）。ログインして いない（デモ）は false、
 * 確かめられない ときは null（「無い」と 取りちがえて 2枚目を 出さない）。
 */
export async function hasIssuedCertificate(contentId: string): Promise<boolean | null> {
  const client = createClient();
  if (!client) return false;
  let profileId: string | null;
  try {
    profileId = await readOwnId(client);
  } catch {
    return null;
  }
  if (!profileId) return false;
  const { data, error } = await client
    .from("completion_certificates")
    .select("id")
    .eq("profile_id", profileId)
    .eq("content_id", contentId)
    .limit(1);
  if (error) return null;
  return (data ?? []).length > 0;
}

export async function issueCertificate(
  result: CertificateResult,
  /** 回を 始めた 人（`claimRun`）。いまの 人と ちがえば、前の 人の 続きと して 扱う。 */
  runOwner?: string,
): Promise<IssueOutcome> {
  const client = createClient();
  if (!client) return { status: "sample", cert: sampleOf(result) };
  let profileId: string | null;
  try {
    profileId = await readOwnId(client);
  } catch (error) {
    /*
     * ログインして いるのに 確かめられなかった（トークンの 更新・通信断）。**見本に しない**——
     * 見本に すると 回が 終わり、正式な 修了証が 二度と 出ない。もう一度 ためせる ように する。
     */
    console.warn("[certificate] だれか 確かめられませんでした:", String(error));
    return { status: "error", message: "claims" };
  }
  if (!profileId) return { status: "sample", cert: sampleOf(result) };
  // 共有 PC: 前の 人が 始めた 回を 引きついだ ときは、パーフェクトに しない
  if (runOwner && runOwner !== profileId) {
    result = { ...result, perfect: false, detail: { ...result.detail, partial: true } };
  }

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
      owner: profileId,
    },
  };
}
