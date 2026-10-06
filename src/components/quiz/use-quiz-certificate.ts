/**
 * もんだいの 修了証（願い #562 の 第2段・2026-10-06 の 回答「満点」）
 *
 * 出して 採点された 瞬間に DB へ 発行する（`@/lib/certificate/certificate-db`）。
 * パーフェクトは **全問 正解**で、しかも **こたえを 見る 前の 1回目**だけ。こたえを 見た
 * ことは 3つの 道で 確かめる（どれか 1つでも 見て いれば パーフェクトに しない）:
 *
 * 1. 回の 始めかた … 「もう一度 やる」「こたえを 見る・直す」「ぜんぶ 消して はじめから」は
 *    前に 出した あと（けっかの 画面で こたえと せつめいを 見た あと）
 * 2. 端末の 印 … どの 回で こたえを 見たか（`markSawAnswers`）。1問ずつの せつめい・
 *    バグ報告の こたえの 文・けっかの 画面で 付ける。**ほかの 回**（前の 回・別の タブ）の 印だけ 数える
 * 3. DB … この 人が ほかの 回で この もんだいを 出した ことが あるか（別の 端末・ログアウト後）
 *
 * 「つづきから」は この 端末で 始めた 回の 記録が あれば 同じ 回、無ければ 前の 回の 続き。
 * 回の 記録は リスニング・タイピングと 同じ 置き場（`@/lib/certificate/run`）。
 */
"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import type { CertificateState } from "@/components/certificate/certificate-panel";
import { currentOwner, issueCertificate } from "@/lib/certificate/certificate-db";
import { quizResult, type CertificateResult, type QuizRunFacts } from "@/lib/certificate/model";
import {
  endRun,
  markSawAnswers,
  readRun,
  saveIssued,
  sawAnswersOutside,
  sawAnyAnswers,
  startRun,
  updateRun,
  type CertificateRun,
} from "@/lib/certificate/run";
import { hasEarlierQuizAttempt } from "@/lib/quiz/results-db";

/** 回の 始めかた（ロビーの どの ボタンか・けっかの「もう一度」か）。 */
export type QuizRunStart = "fresh" | "continue" | "reopened" | "retry";

/** 出した 瞬間に 画面が 渡す 数（回の 記録から 決まる ものは ここに 入れない）。 */
export type QuizFinishFacts = Omit<QuizRunFacts, "partial" | "sawScriptBefore"> & {
  /** 教材の 問題 ぜんぶに 触れた 回か（`isWholeSetRun`）。 */
  readonly wholeRun: boolean;
  /** この 回の 鍵（`quiz_results.attempt_id`。DB で「ほかの 回」を 見分ける）。 */
  readonly attemptId: string;
};

type Pending = NonNullable<CertificateRun["pending"]>;

/** 端末の 記録は この 画面の あいだ 外から 変わらない（読むのは 最初の 描画の あとだけ）。 */
function subscribeNever(): () => void {
  return () => {};
}

/**
 * ほかの 回で 出した ことが あるか（DB）。ログインして いない（デモ）は false、
 * 確かめられない ときは null（パーフェクトと 取りちがえない）。
 */
async function earlierAttempt(setId: string, attemptId: string): Promise<boolean | null> {
  const owner = await currentOwner();
  if (owner === null) return false;
  if (owner === undefined) return null;
  return hasEarlierQuizAttempt(owner, setId, attemptId);
}

export function useQuizCertificate(setId: string, title: string) {
  const [certificate, setCertificate] = useState<CertificateState | null>(null);
  /**
   * いまの 回（端末の 記録の 写し）。端末に 書けない（プライベートモード・容量切れ）ときも
   * 回が 途中で 切れない ように、ここにも 持つ。
   */
  const runRef = useRef<CertificateRun | null>(null);

  /** 同じ 回の 記録だけを 書きかえる（あとから 届く 結果が 新しい 回を 汚さない）。 */
  const patch = useCallback(
    (startedAt: string, change: (run: CertificateRun) => CertificateRun) => {
      if (runRef.current?.startedAt === startedAt) runRef.current = change(runRef.current);
      if (readRun(setId)?.startedAt === startedAt) updateRun(setId, change);
    },
    [setId],
  );

  /** 回を 始めた 人（共有 PC で 前の 人の 回を 引きつがない。`claimRun` と 同じ 役目）。 */
  const claimOwner = useCallback(
    (run: CertificateRun) => {
      if (run.owner) return;
      void currentOwner().then((owner) => {
        if (owner) patch(run.startedAt, (r) => (r.owner ? r : { ...r, owner }));
      });
    },
    [patch],
  );

  /*
   * 発行の 途中で 閉じた・落ちた 回は、次に 開いた ときに「もう一度 ためす」を 出す
   *（端末の 記録は 描画の あとで 読む——サーバの 描画と ずらさない）。
   */
  const pendingStored = useSyncExternalStore(
    subscribeNever,
    () => (readRun(setId)?.pending ? "yes" : "no"),
    () => "no",
  );
  const [restoredClosed, setRestoredClosed] = useState(false);
  const shown: CertificateState | null =
    certificate ?? (pendingStored === "yes" && !restoredClosed ? { status: "error" } : null);

  const begin = useCallback(
    (how: QuizRunStart) => {
      setCertificate(null);
      setRestoredClosed(true);
      const stored = readRun(setId);
      if (how === "continue" && stored && !stored.pending) {
        runRef.current = stored;
        claimOwner(stored);
        return;
      }
      const run = startRun(setId, {
        partial: how === "continue",
        sawScriptBefore: how === "reopened" || how === "retry" || sawAnyAnswers(setId),
      });
      runRef.current = run;
      claimOwner(run);
    },
    [setId, claimOwner],
  );

  /** この 回で こたえを 見た（1問ずつの せつめい・バグ報告の こたえの 文）。 */
  const sawAnswers = useCallback(() => {
    const run = runRef.current;
    if (run) markSawAnswers(setId, run.startedAt);
  }, [setId]);

  const deliver = useCallback(
    async (run: CertificateRun, pending: Pending) => {
      const same = () => runRef.current?.startedAt === run.startedAt;
      setCertificate({ status: "issuing" });
      try {
        let result: CertificateResult = pending.result;
        if (result.perfect) {
          const earlier = await earlierAttempt(setId, pending.attemptId);
          if (earlier === null) {
            if (same()) setCertificate({ status: "error" });
            return;
          }
          if (earlier) {
            result = {
              ...result,
              perfect: false,
              detail: { ...result.detail, sawScriptBefore: true },
            };
          }
        }
        const outcome = await issueCertificate(result, run.owner);
        if (outcome.status === "error") {
          if (same()) setCertificate({ status: "error" });
          return;
        }
        // 届く 前に「もう一度」で 次の 回が 始まって いても、控えは 残す（あとで 開ける）
        saveIssued(outcome.cert);
        if (readRun(setId)?.startedAt === run.startedAt) endRun(setId);
        if (same()) {
          runRef.current = null;
          setCertificate({ status: "ready", cert: outcome.cert });
        }
      } catch {
        if (same()) setCertificate({ status: "error" });
      }
    },
    [setId],
  );

  /** 出して 採点された 瞬間（けっかの 画面が 開く 時）に 1回だけ 呼ぶ。 */
  const finish = useCallback(
    (facts: QuizFinishFacts) => {
      const stored = readRun(setId);
      let run =
        stored && (!runRef.current || stored.startedAt === runRef.current.startedAt)
          ? stored
          : runRef.current;
      if (!run) {
        // 回の 記録が 無い（この 機能より 前に 書き始めた 書きかけ）＝ 前の 回の 続き
        run = startRun(setId, { partial: true, sawScriptBefore: sawAnyAnswers(setId) });
      }
      // ほかの 回（別の タブなど）で こたえを 見て いないか。見る のは 自分の 印を 付ける 前
      const seenElsewhere = sawAnswersOutside(setId, run.startedAt);
      // けっかの 画面は ぜんぶの こたえと せつめいを 見せる。この あとは やりなおし
      markSawAnswers(setId, run.startedAt);
      const result = quizResult(setId, title, {
        total: facts.total,
        correct: facts.correct,
        percent: facts.percent,
        passed: facts.passed,
        freeOnly: facts.freeOnly,
        sawModelAnswer: facts.sawModelAnswer,
        partial: Boolean(run.partial) || !facts.wholeRun,
        sawScriptBefore: Boolean(run.sawScriptBefore) || seenElsewhere,
      });
      const pending: Pending = { result, attemptId: facts.attemptId };
      run = { ...run, pending };
      runRef.current = run;
      patch(run.startedAt, (r) => ({ ...r, pending }));
      void deliver(run, pending);
    },
    [setId, title, patch, deliver],
  );

  /** 発行に 落ちた ときの「もう一度 ためす」。 */
  const retry = useCallback(() => {
    const run = runRef.current ?? readRun(setId);
    if (!run?.pending) return;
    runRef.current = run;
    void deliver(run, run.pending);
  }, [setId, deliver]);

  return { certificate: shown, setCertificate, begin, finish, retry, sawAnswers };
}
