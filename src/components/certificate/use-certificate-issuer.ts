/**
 * 会話の 練習（ミーティング・たいわ・朝礼・ヒアリング）の 修了証を 出す 共通の 手順
 *（願い #562 の 第2段・2026-10-06 の 回答「取りこぼしなし」）
 *
 * - `begin({ resumed })` … 練習を 始めた とき（入室・話し始め）。
 *   - はじめから … **新しい 回**を 作る（前の 回の 記録は 捨てる）
 *   - つづきから … この 端末で 始めた 回の 記録が あれば 同じ 回。**無ければ「前の 回の 続き」**
 *     （ログアウトで 回の 記録は 消えるが、会話の しおりは 残る——共有 PC で 前の 人の 続きを
 *     終えた 人を パーフェクトに しない。code-critic の 指摘）
 * - `finish(result)` … **終えた 瞬間**に 呼ぶ。1つの 回で 1回だけ（2度目からは 何も しない）。
 *   出した 回は 記録に 印を 付ける——同じ 回を 開き直して 終えても 2枚目を 出さない
 * - 落ちた・閉じた ときは 成績を 回の 記録に 残し、次に 開いた 画面で「もう一度 ためす」（黙って 捨てない）
 *
 * 会話の 練習は ヒントを 使って よい（同日の 回答）ので、こたえを 見たかは 数えない。
 */
"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import type { CertificateState } from "@/components/certificate/certificate-panel";
import { claimRun, issueCertificate } from "@/lib/certificate/certificate-db";
import type { CertificateResult, IssuedCertificate } from "@/lib/certificate/model";
import {
  readRun,
  saveIssued,
  startRun,
  updateRun,
  type CertificateRun,
} from "@/lib/certificate/run";

/** 端末の 記録は この 画面の あいだ 外から 変わらない（読むのは 最初の 描画の あとだけ）。 */
function subscribeNever(): () => void {
  return () => {};
}

export function useCertificateIssuer(contentId: string) {
  const [certificate, setCertificate] = useState<CertificateState | null>(null);
  /** 端末に 書けない ときの 回の 写し。 */
  const runRef = useRef<CertificateRun | null>(null);
  /** この 回の finish を もう 受けた（`begin`／`reset` まで 2度目を 受けない）。 */
  const acceptedRef = useRef(false);
  /**
   * 先生の 下見（スタジオ・`preview-…`）では 出さない。先生の 名前で 正式な 行が 入る。
   */
  const previewing = contentId.startsWith("preview-");

  /*
   * 発行の 途中で 閉じた・落ちた 回は、次に 開いた 画面で「もう一度 ためす」を 出す
   *（端末の 記録は 描画の あとで 読む——サーバの 描画と ずらさない）。
   */
  const pendingStored = useSyncExternalStore(
    subscribeNever,
    () => (readRun(contentId)?.pending ? "yes" : "no"),
    () => "no",
  );
  const [restoredClosed, setRestoredClosed] = useState(false);
  const shown: CertificateState | null =
    certificate ?? (pendingStored === "yes" && !restoredClosed ? { status: "error" } : null);

  /** 同じ 回の 記録だけを 書きかえる。 */
  const patch = useCallback(
    (startedAt: string, change: (run: CertificateRun) => CertificateRun) => {
      if (runRef.current?.startedAt === startedAt) runRef.current = change(runRef.current);
      if (readRun(contentId)?.startedAt === startedAt) updateRun(contentId, change);
    },
    [contentId],
  );

  const begin = useCallback(
    ({ resumed }: { readonly resumed: boolean }) => {
      acceptedRef.current = false;
      setCertificate(null);
      setRestoredClosed(true);
      const stored = readRun(contentId);
      if (resumed && stored) {
        runRef.current = stored;
        if (!stored.owner) claimRun(contentId);
        return;
      }
      runRef.current = startRun(contentId, { partial: resumed });
      claimRun(contentId);
    },
    [contentId],
  );

  const deliver = useCallback(
    (run: CertificateRun, result: CertificateResult) => {
      setCertificate({ status: "issuing" });
      issueCertificate(result, run.owner)
        .then((outcome) => {
          if (outcome.status === "error") {
            setCertificate({ status: "error" });
            return;
          }
          saveIssued(outcome.cert);
          patch(run.startedAt, (r) => ({ ...r, pending: undefined, issued: true }));
          setCertificate({ status: "ready", cert: outcome.cert });
        })
        .catch(() => setCertificate({ status: "error" }));
    },
    [patch],
  );

  const finish = useCallback(
    (result: CertificateResult) => {
      if (acceptedRef.current || previewing) return;
      acceptedRef.current = true;
      const stored = readRun(contentId);
      const run =
        stored && (!runRef.current || stored.startedAt === runRef.current.startedAt)
          ? stored
          : (runRef.current ?? startRun(contentId, { partial: true }));
      runRef.current = run;
      // 同じ 回は もう 出した（開き直して 同じ 回を 終えた）。2枚目は 出さない
      if (run.issued) return;
      const counted: CertificateResult = run.partial
        ? { ...result, perfect: false, detail: { ...result.detail, partial: true } }
        : result;
      patch(run.startedAt, (r) => ({ ...r, pending: { result: counted, attemptId: "" } }));
      deliver(run, counted);
    },
    [contentId, previewing, patch, deliver],
  );

  /** 発行に 落ちた ときの「もう一度 ためす」（前に 閉じた 回の ぶんも）。 */
  const retry = useCallback(() => {
    const run = runRef.current ?? readRun(contentId);
    if (!run?.pending) return;
    runRef.current = run;
    deliver(run, run.pending.result);
  }, [contentId, deliver]);

  /** 前に 出した 修了証を 開く（端末の 控え）。 */
  const open = useCallback((cert: IssuedCertificate) => {
    setCertificate({ status: "ready", cert });
  }, []);

  /** 画面から 下げる（つぎの 回の 前）。 */
  const reset = useCallback(() => {
    acceptedRef.current = false;
    setCertificate(null);
    setRestoredClosed(true);
  }, []);

  return { certificate: shown, begin, finish, retry, open, reset };
}
