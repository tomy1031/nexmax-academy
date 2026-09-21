"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { QuizQuestion } from "@/content/schema";
import { judgeFailNote, requestQuizReview, warmQuizReview } from "@/components/meeting/judge-api";
import { aiReplyFurigana } from "@/lib/ai-kanji";
import { reviewWithoutAi } from "@/lib/quiz/ai-review";
import type { QuizReviewContext, QuizReviewResult, ReviewItem } from "@/lib/quiz/ai-review";
import { buildFuriganaIndex, uncoveredKanji, type FuriganaIndex } from "@/lib/text/furigana";

/**
 * こたえの チェック — **もんだいの 開き閉めを 決める 1か所**
 *
 * ## なぜ 画面の 外に 置くか（2026-09-21 の 指定）
 * 「終わらない限り次の問題に進んではいけないとわかるようにUIを作ってください。
 *  全てAIがOKなら提出できます」。
 *
 * つまり **1問の けっかが、その 問いの 外（つぎの 問い・出すボタン）を 動かす**。
 * けっかを 問いの 中に しまうと、外からは 見えない——だから ここで 預かる。
 * もんだいの 画面（`quiz-runner`）が 持ち主で、初級・上級の 部品は
 * `useAnswerCheck` で 自分の ぶんだけ 読み書きする。
 *
 * ## 「チェック済み」は **文と セット**で 持つ
 * 打ち直したら ⭕は 消える（`of`）。古い ⭕の まま つぎへ 進めると、
 * 見て もらって いない 文で 関門が 開く。
 */

/** 1問の チェックの けっか。 */
export interface AnswerCheck {
  /** すべて ⭕か（つぎへ 進める か）。 */
  readonly ok: boolean;
  /** どの 文に ついての けっかか（打ち直しで 無効に する）。 */
  readonly of: string;
  readonly items: readonly { id: string; ok: boolean; note: string }[];
  /** 中身は 合って いるのに 言い方が よくない ときだけ 入る。 */
  readonly polished: string;
  /** AIに つながらなかった ときの 一言（空なら つながった）。 */
  readonly aiNote: string;
}

export type AnswerChecks = Readonly<Record<string, AnswerCheck>>;

interface Store {
  readonly setId: string;
  readonly checks: AnswerChecks;
  readonly mark: (questionId: string, check: AnswerCheck) => void;
  readonly clear: (questionId: string) => void;
}

/** 預かり所の 書きかえ（**いまの 値から** 作る——飛んで いる 別の 問いの 印を 消さない）。 */
export type AnswerChecksUpdate = (prev: AnswerChecks) => AnswerChecks;

const AnswerCheckContext = createContext<Store | null>(null);

export function AnswerCheckProvider({
  setId,
  checks,
  onChange,
  children,
}: {
  setId: string;
  checks: AnswerChecks;
  onChange: (update: AnswerChecksUpdate) => void;
  children: React.ReactNode;
}) {
  const value = useMemo<Store>(
    () => ({
      setId,
      checks,
      /*
       * **いまの 値から 作る**（`{...checks}` で 閉じ込めない）。
       * 1問の 往復が 飛んで いる あいだに 別の 問いが 印を 付ける ことが ある。
       * 古い `checks` に 上書きすると、あとから 付いた 印が 黙って 消える。
       */
      mark: (questionId, check) => onChange((prev) => ({ ...prev, [questionId]: check })),
      clear: (questionId) =>
        onChange((prev) => {
          if (!(questionId in prev)) return prev;
          const next = { ...prev };
          delete next[questionId];
          return next;
        }),
    }),
    [setId, checks, onChange],
  );
  return <AnswerCheckContext.Provider value={value}>{children}</AnswerCheckContext.Provider>;
}

/** いまの 画面に チェックの 預かり所が あるか（1問ずつの 画面には 無い）。 */
export function useAnswerCheckStore(): Store | null {
  return useContext(AnswerCheckContext);
}

type Reviewable = Extract<QuizQuestion, { type: "free" | "fillin" }>;

export type CheckPhase = "idle" | "asking";

/**
 * 1問ぶんの チェック（部品から 使う）。
 *
 * 返す もの:
 * - `check` … いまの けっか（打ち直した あとは `undefined`）
 * - `run` … チェックを 走らせる（欄の ⭕✗は 呼ぶ 側が 決めて 渡す）
 */
export function useAnswerCheck(question: Reviewable, written: string) {
  const store = useAnswerCheckStore();
  const [phase, setPhase] = useState<CheckPhase>("idle");
  /** 何回目の お願いか。つなぎの 鍵に 混ぜて、押すたびに 張り直す。 */
  const [round, setRound] = useState(0);
  /** 印を 付けずに 終わった とき（ほかの もんだいを 見て いる）の ひとこと。 */
  const [waiting, setWaiting] = useState("");
  /** つぎに 使う 鍵（押す 前に 張って おく ぶんと、押した ときの ぶんを そろえる）。 */
  const nextKey = store ? `${store.setId}:${question.id}:${round + 1}` : "";

  /*
   * **くらべる 文は 1か所で そろえる**（前後の 空白を 落とす）。
   * メールは 欄ごとに `.trim()` して 組み立てる（`fillinText`）のに、Slackは 生の
   * 文字列の ままだった——**うしろに 空白を 1つ 足しただけで ⭕が 消え、
   * つぎの もんだいが また 閉じる**（2026-09-21 のコード検収）。
   */
  const text = written.trim();
  const saved = store?.checks[question.id];
  const check = saved && saved.of === text ? saved : undefined;

  const run = useCallback(
    async (input: {
      /** 見る 単位（メールの 欄／Slackの 観点）。 */
      items: readonly ReviewItem[];
      itemKind: QuizReviewContext["itemKind"];
      /** AIに 渡す お手本。 */
      model: string;
      /** 場面の メモ。 */
      scene: string;
      /** ルビの 索引（AIの 文に 読みを 足せるか 見る）。 */
      furigana: FuriganaIndex;
      /**
       * AIが 来なかった ときに ⭕に して よいか。
       * 欄に 正解の ある もんだい（メール）は アプリが 決められる ので true。
       */
      okWithoutAi: boolean;
    }) => {
      if (!store) return;
      setWaiting("");
      setPhase("asking");
      const turn = round + 1;
      setRound(turn);

      // 画面が AIの 文を 描く ときと **同じ 索引**（`aiReplyFurigana`）で 見る
      const index = buildFuriganaIndex(aiReplyFurigana(input.furigana.entries));
      const readable = (value: string) => value === "" || uncoveredKanji(value, index).length === 0;

      try {
        const result = await requestQuizReview(
          // 先に 張って おいた 鍵と 同じ もの（`nextKey`）——張り直しの 数秒を 払わない
          `${store.setId}:${question.id}:${turn}`,
          {
            question: question.q,
            scene: input.scene,
            model: input.model,
            note: question.ai?.note ?? "",
            itemKind: input.itemKind,
            items: input.items,
            written: text,
          },
          // 読めない 漢字が 1つでも あれば、1回だけ 言い直して もらう
          (review: QuizReviewResult) =>
            !(readable(review.polished) && review.items.every((one) => readable(one.note))),
        );

        if (!result.ok) {
          /*
           * **となりの もんだいを 見て いる あいだは 印を 付けない**（2026-09-21 のコード検収）。
           * 付けると、観点で 見る もんだい（Slack）は `okWithoutAi` が true なので
           * **中身を 1度も 見ずに ⭕**に なる——ボタンを 2つ 続けて 押すだけで 関門が 開く。
           */
          if (result.reason === "busy") {
            setWaiting(judgeFailNote(result.reason));
            return;
          }
          /*
           * AIが 来なくても **止めない**。欄に 正解の ある もんだいは アプリの ⭕✗で 進み、
           * 観点で 見る もんだいは「書けて いれば 進む」に する——鍵の 有無で
           * 学習が 止まる ほうが 害が 大きい（理由は 画面に 出す）。
           *
           * ただし **⭕✗を 出すのは アプリが 決められる もの（欄）だけ**。観点には
           * 機械の 正解が 無いので、見て もらえなかった 回に ✗を 並べると
           * 「✗が 3つ」と「⭕ OKです」が 同じ 画面に 出る（同検収の 重大1）。
           */
          const fallback = reviewWithoutAi(input.items, input.okWithoutAi);
          store.mark(question.id, {
            ...fallback,
            of: text,
            aiNote: input.okWithoutAi
              ? judgeFailNote(result.reason)
              : `${judgeFailNote(result.reason)} いまは アプリが 見た ⭕✗だけ 出して います。`,
          });
          return;
        }

        // 読めない 文だけ 落とす（⭕✗は 残す）
        store.mark(question.id, {
          ok: result.review.ok,
          of: text,
          items: result.review.items.map((one) => ({
            ...one,
            note: readable(one.note) ? one.note : "",
          })),
          polished: readable(result.review.polished) ? result.review.polished : "",
          aiNote: "",
        });
      } finally {
        /*
         * **何が あっても ボタンを 戻す**。関門の ある 教材で 押せなく なると、
         * 学習者は その もんだいから 一歩も 動けない（開き直すまで）。
         */
        setPhase("idle");
      }
    },
    [question, round, store, text],
  );

  /**
   * **押しそうな ときに つなぎを 先に 張る**（2026-09-21 の 指定「AI読み取りの反応が遅い」）。
   *
   * 呼ぶ 側（メール・Slackの 画面）が「ボタンが 押せるように なった」ところで 呼ぶ。
   * 同じ 鍵で 2度 張らない ように 覚えて おく——`warmQuizReview` の 側でも 見て いるが、
   * 画面が 1文字ごとに 描き直される ので、ここでも 止めないと 呼び出しが 積もる。
   */
  const warmed = useRef("");
  const warm = useCallback(() => {
    if (!store || nextKey === "" || warmed.current === nextKey) return;
    /*
     * **張れた ときだけ 覚える**。先に 覚えて しまうと、`busy`（別の 問いを 見て いる）で
     * 張れなかった 回も「張った」ことに なり、**2回目の チェックが いつも 遅い**
     *（＝直して もう いちど 押す、いちばん 待たされる 回）。
     */
    void warmQuizReview(nextKey).then((done) => {
      if (done) warmed.current = nextKey;
    });
  }, [store, nextKey]);

  return { check, phase, run, warm, waiting, ready: store !== null };
}

/**
 * ボタンが 押せるように なったら、つなぎを 先に 張る。
 *
 * `useEffect` に するのは **描き直しの たびに 呼ばない** ため。`enabled` が
 * false → true に なった 1回だけ 走る（中では 鍵でも 止めて いる）。
 */
export function useWarmOnReady(warm: () => void, enabled: boolean): void {
  useEffect(() => {
    if (enabled) warm();
  }, [enabled, warm]);
}
