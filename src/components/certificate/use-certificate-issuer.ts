/**
 * 会話の 練習（ミーティング・たいわ・朝礼・ヒアリング）の 修了証を 出す 共通の 手順
 *（願い #562 の 第2段・2026-10-06 の 回答「取りこぼしなし」）
 *
 * - `begin()` … 練習を 始めた とき（入室・話し始め）。回の 記録を 作り、始めた 人を 覚える
 *   （共有 PC で 前の 人の 回を 引きついで 終えた ときに、パーフェクトに しない ため）。
 *   もう 回が あれば そのまま（開き直して つづきから 話す のは 同じ 回）
 * - `finish(result)` … **終えた 瞬間**に 1回だけ 呼ぶ。DB が 時刻・名前・番号を 押す
 * - 落ちたら「もう一度 ためす」（`retry`）。黙って 捨てない
 *
 * 会話の 練習は ヒントを 使って よい（同日の 回答）ので、こたえを 見たかは 数えない。
 */
"use client";

import { useCallback, useRef, useState } from "react";
import type { CertificateState } from "@/components/certificate/certificate-panel";
import { claimRun, issueCertificate } from "@/lib/certificate/certificate-db";
import type { CertificateResult, IssuedCertificate } from "@/lib/certificate/model";
import { endRun, readRun, saveIssued, startRun, type CertificateRun } from "@/lib/certificate/run";

export function useCertificateIssuer(contentId: string) {
  const [certificate, setCertificate] = useState<CertificateState | null>(null);
  /** 端末に 書けない ときの 回の 写し。 */
  const runRef = useRef<CertificateRun | null>(null);
  /** 発行を 始めた 回（同じ 回で 2度 出さない。StrictMode の 2度 呼びも ここで 止める）。 */
  const issuedForRef = useRef<string | null>(null);
  const resultRef = useRef<{ result: CertificateResult; owner?: string } | null>(null);

  const begin = useCallback(() => {
    const stored = readRun(contentId);
    if (stored) {
      runRef.current = stored;
      return;
    }
    runRef.current = startRun(contentId);
    claimRun(contentId);
  }, [contentId]);

  const deliver = useCallback(
    (result: CertificateResult, owner?: string) => {
      setCertificate({ status: "issuing" });
      issueCertificate(result, owner)
        .then((outcome) => {
          if (outcome.status === "error") {
            setCertificate({ status: "error" });
            return;
          }
          saveIssued(outcome.cert);
          endRun(contentId);
          runRef.current = null;
          setCertificate({ status: "ready", cert: outcome.cert });
        })
        .catch(() => setCertificate({ status: "error" }));
    },
    [contentId],
  );

  const finish = useCallback(
    (result: CertificateResult) => {
      // 回の 記録が 無い（この 機能より 前に 始めた 回）は 前の 回の 続き＝パーフェクトに しない
      const run = readRun(contentId) ?? runRef.current;
      const key = run?.startedAt ?? "no-run";
      if (issuedForRef.current === key) return;
      issuedForRef.current = key;
      const counted: CertificateResult = run
        ? result
        : { ...result, perfect: false, detail: { ...result.detail, partial: true } };
      resultRef.current = { result: counted, owner: run?.owner };
      deliver(counted, run?.owner);
    },
    [contentId, deliver],
  );

  const retry = useCallback(() => {
    const pending = resultRef.current;
    if (pending) deliver(pending.result, pending.owner);
  }, [deliver]);

  /** 前に 出した 修了証を 開く（端末の 控え）。 */
  const open = useCallback((cert: IssuedCertificate) => {
    setCertificate({ status: "ready", cert });
  }, []);

  /** つぎの 回を 始める（前の 回の 修了証を 画面から 下げる）。 */
  const reset = useCallback(() => {
    issuedForRef.current = null;
    resultRef.current = null;
    setCertificate(null);
  }, []);

  return { certificate, begin, finish, retry, open, reset };
}
