/**
 * もんだいの 修了証（願い #562 の 第2段・2026-10-06 の 回答「満点」）
 *
 * 出して 採点された 瞬間に DB へ 発行する（`@/lib/certificate/certificate-db`）。
 * パーフェクトは **全問 正解**で、しかも **こたえを 見る 前の 1回目**だけ:
 *
 * - 「もう一度 やる」… けっかの 画面で こたえと せつめいを 見た あと → やりなおし
 * - 「こたえを 見る・直す」… 前に 出した こたえが 入って いる → やりなおし
 * - 「つづきから」… この 端末で 始めた 回の 記録が 無い 書きかけ → 前の 回の 続き
 * - 別の 端末で 出した ことが ある（DB の `quiz_results`）→ やりなおし
 *
 * 回の 記録は リスニング・タイピングと 同じ 置き場（`@/lib/certificate/run`）。
 * 「はじめる」と 書きかけの まま 閉じて、あとで「つづきから」出しても 同じ 回に 数える。
 */
"use client";

import { useCallback, useRef, useState } from "react";
import type { CertificateState } from "@/components/certificate/certificate-panel";
import { currentOwner, issueCertificate } from "@/lib/certificate/certificate-db";
import { quizResult, type QuizRunFacts } from "@/lib/certificate/model";
import {
  endRun,
  markSawScript,
  readRun,
  saveIssued,
  sawScript,
  startRun,
  updateRun,
  type CertificateRun,
} from "@/lib/certificate/run";
import { fetchLatestQuizAnswers } from "@/lib/quiz/results-db";

/** 回の 始めかた（ロビーの どの ボタンか・けっかの「もう一度」か）。 */
export type QuizRunStart = "fresh" | "continue" | "reopened" | "retry";

/** 出した 瞬間に 画面が 渡す 数（回の 記録から 決まる ものは ここに 入れない）。 */
export type QuizFinishFacts = Omit<QuizRunFacts, "partial" | "sawScriptBefore"> & {
  /** 教材の 問題 ぜんぶに 触れた 回か（`isWholeSetRun`）。 */
  readonly wholeRun: boolean;
};

/** この 人が 前に この もんだいを 出した ことが あるか（別の 端末も 含む）。 */
async function submittedBefore(setId: string): Promise<boolean> {
  const owner = await currentOwner();
  if (!owner) return false;
  return (await fetchLatestQuizAnswers(owner, setId)) !== null;
}

export function useQuizCertificate(setId: string, title: string) {
  const [certificate, setCertificate] = useState<CertificateState | null>(null);
  /**
   * いまの 回（端末の 記録の 写し）。端末に 書けない（プライベートモード・容量切れ）ときも
   * 回が 途中で 切れない ように、ここにも 持つ。
   */
  const runRef = useRef<CertificateRun | null>(null);
  const factsRef = useRef<QuizFinishFacts | null>(null);

  /** 同じ 回の 記録だけを 書きかえる（あとから 届く 結果が 新しい 回を 汚さない）。 */
  const patch = useCallback(
    (startedAt: string, change: (run: CertificateRun) => CertificateRun) => {
      if (runRef.current?.startedAt === startedAt) runRef.current = change(runRef.current);
      if (readRun(setId)?.startedAt === startedAt) updateRun(setId, change);
    },
    [setId],
  );

  const begin = useCallback(
    (how: QuizRunStart) => {
      setCertificate(null);
      const stored = readRun(setId);
      if (how === "continue" && stored) {
        runRef.current = stored;
        return;
      }
      const run = startRun(setId, {
        partial: how === "continue",
        sawScriptBefore: how === "reopened" || how === "retry" || sawScript(setId),
      });
      runRef.current = run;
      // 回を 始めた 人（共有 PC で 前の 人の 回を 引きつがない。`claimRun` と 同じ 役目）
      void currentOwner().then((owner) => {
        if (owner) patch(run.startedAt, (r) => (r.owner ? r : { ...r, owner }));
      });
      if (!run.sawScriptBefore) {
        void submittedBefore(setId)
          .then((yes) => {
            if (yes) patch(run.startedAt, (r) => ({ ...r, sawScriptBefore: true }));
          })
          .catch(() => {
            /* 確かめられなくても 学習は 止めない */
          });
      }
    },
    [setId, patch],
  );

  const issue = useCallback(
    (run: CertificateRun, facts: QuizFinishFacts) => {
      const result = quizResult(setId, title, {
        total: facts.total,
        correct: facts.correct,
        percent: facts.percent,
        passed: facts.passed,
        freeOnly: facts.freeOnly,
        sawModelAnswer: facts.sawModelAnswer,
        partial: Boolean(run.partial) || !facts.wholeRun,
        sawScriptBefore: Boolean(run.sawScriptBefore),
      });
      setCertificate({ status: "issuing" });
      issueCertificate(result, run.owner)
        .then((outcome) => {
          // 届く 前に「もう一度」で 次の 回が 始まって いたら、画面には 出さない
          if (runRef.current?.startedAt !== run.startedAt) return;
          if (outcome.status === "error") {
            setCertificate({ status: "error" });
            return;
          }
          saveIssued(outcome.cert);
          endRun(setId);
          setCertificate({ status: "ready", cert: outcome.cert });
        })
        .catch(() => setCertificate({ status: "error" }));
    },
    [setId, title],
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
        run = startRun(setId, { partial: true, sawScriptBefore: sawScript(setId) });
      }
      runRef.current = run;
      factsRef.current = facts;
      // けっかの 画面は ぜんぶの こたえと せつめいを 見せる。この あとは やりなおし
      markSawScript(setId);
      issue(run, facts);
    },
    [setId, issue],
  );

  /** 発行に 落ちた ときの「もう一度 ためす」。 */
  const retry = useCallback(() => {
    const run = runRef.current;
    const facts = factsRef.current;
    if (run && facts) issue(run, facts);
  }, [issue]);

  return { certificate, setCertificate, begin, finish, retry };
}
