/**
 * 単語テストの 修了証（願い #562 の 第2段・2026-10-06 の 回答「何回目でも満点なら金」）
 *
 * **テストの やりかたを 最後まで 終えた 瞬間**（けっかの 画面が 開く 時）に DB へ 発行する。
 * れんしゅう・もんだいだけ・途中で やめた 回には 出さない（テストでは ない・終えて いない）。
 *
 * もんだいと ちがい、回の 記録を 端末に 置かない。テストは 1つの 画面の 中で 始まって
 * 終わり（つづきが 無い）、何回目でも 満点なら 金なので「前に こたえを 見たか」も 数えない。
 */
"use client";

import { useCallback, useRef, useState } from "react";
import type { CertificateState } from "@/components/certificate/certificate-panel";
import { issueCertificate } from "@/lib/certificate/certificate-db";
import {
  wordTestResult,
  type CertificateResult,
  type IssuedCertificate,
  type WordTestRunFacts,
} from "@/lib/certificate/model";
import { saveIssued } from "@/lib/certificate/run";

export function useWordTestCertificate() {
  /**
   * 画面に 出す 修了証と、**どの セットの ものか**。フックは セットを またいで 生きるので、
   * 別の セットの やりかた選びに 前の セットの 修了証を 出さない（code-critic の 指摘）。
   */
  const [shown, setShown] = useState<{
    readonly contentId: string;
    readonly state: CertificateState;
  } | null>(null);
  const resultRef = useRef<CertificateResult | null>(null);
  /** いま 出して いる 回（「もう一度」で 次の 回が 始まったら、前の 回の 結果は 画面に 出さない）。 */
  const keyRef = useRef<string | null>(null);

  const deliver = useCallback((key: string, result: CertificateResult) => {
    const same = () => keyRef.current === key;
    const show = (state: CertificateState) => {
      if (same()) setShown({ contentId: result.contentId, state });
    };
    show({ status: "issuing" });
    issueCertificate(result)
      .then((outcome) => {
        if (outcome.status === "error") {
          show({ status: "error" });
          return;
        }
        // 次の 回が 始まって いても 控えは 残す（「前に 出した 修了証を ひらく」で 開ける）
        saveIssued(outcome.cert);
        show({ status: "ready", cert: outcome.cert });
      })
      .catch(() => show({ status: "error" }));
  }, []);

  /** けっかの 画面が 開いた 時に 呼ぶ（`key` は この 回の attemptId。同じ 回では 1回だけ 出す）。 */
  const finish = useCallback(
    (key: string, stageId: string, title: string, facts: WordTestRunFacts) => {
      if (keyRef.current === key) return;
      keyRef.current = key;
      const result = wordTestResult(stageId, title, facts);
      resultRef.current = result;
      deliver(key, result);
    },
    [deliver],
  );

  /** 発行に 落ちた ときの「もう一度 ためす」。 */
  const retry = useCallback(() => {
    const key = keyRef.current;
    const result = resultRef.current;
    if (key && result) deliver(key, result);
  }, [deliver]);

  /** 次の 回を 始める（前の 回の 修了証を 画面から 下げる）。 */
  const reset = useCallback(() => {
    keyRef.current = null;
    resultRef.current = null;
    setShown(null);
  }, []);

  /** 前に 出した 修了証を 開く（端末の 控え）。 */
  const open = useCallback((cert: IssuedCertificate) => {
    setShown({ contentId: cert.contentId, state: { status: "ready", cert } });
  }, []);

  /** この セットの 修了証（ほかの セットの ものは 出さない）。 */
  const certificateFor = useCallback(
    (contentId: string): CertificateState | null =>
      shown?.contentId === contentId ? shown.state : null,
    [shown],
  );

  return { certificateFor, open, finish, retry, reset };
}
