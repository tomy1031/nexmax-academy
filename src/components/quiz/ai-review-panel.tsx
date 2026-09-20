"use client";

import { useMemo, useState } from "react";
import type { QuizQuestion } from "@/content/schema";
import { RubyText } from "@/components/ruby-text";
import { judgeFailNote, requestQuizReview } from "@/components/meeting/judge-api";
import { AI_KANJI_FURIGANA } from "@/lib/ai-kanji";
import type { QuizReviewResult } from "@/lib/quiz/ai-review";
import { fillinModelText } from "@/lib/quiz/fillin";
import {
  buildFuriganaIndex,
  mergeFuriganaEntries,
  uncoveredKanji,
  type FuriganaIndex,
} from "@/lib/text/furigana";

/**
 * 「🤖 AIに 見て もらう」— 書いた 文を その場で 見て もらう 箱
 *
 * ## なぜ もんだいの 中に 置くか（2026-09-20 の 指定）
 * 連絡文の 練習は 元は **別ページ**（全画面の リンク教材）だった。書いても
 * 合って いるか どうかが どこにも 出ず、先生が PDFを 読むまで 学習者は
 * 何も 分からない。指定は「別ページで 開くのでは なく、問題コンポーネントとして
 * AI問題を チェックできるように」「AIが 評価する ボタンは 各問題に 設置」。
 *
 * ## 3つを この 順で 出す
 * 1. **はっきりした 判定**（つたわる／もう すこし）と つぎの 一手（規律1）
 * 2. **観点ごとの ○△**（ものさしは 答える 前から 見えて いる）
 * 3. **✨ ブラッシュアップ回答**（学習者の 文を 直した もの）と **📘 お手本**
 *
 * お手本を 先に 出さない のは、写すだけの 問いに しない ため。だから ボタンは
 * **1文字も 書いて いない あいだ 押せない**。
 *
 * ## 点は 動かさない
 * ここで 何が 出ても、もんだいの 合否は `gradeDraft` が 決める。AIは 見かたを
 * 足すだけで、合格ラインには さわらない（朝礼の 判定と 同じ 決めごと）。
 *
 * ## 鍵（BYOK）が 無い 端末
 * ボタンは 出すが、押すと「せっていが まだです」と 言い、**お手本だけ** 見せる。
 * AIが 無い ことで 教材が 使えなく なる ことは ない。
 */

/** 画面じたいの 文言の 読み辞書（教材の 辞書は UIの 文言まで 覆わない・規律2）。 */
const UI_FURIGANA = buildFuriganaIndex([
  ["見", "み"],
  ["手本", "てほん"],
  ["文", "ぶん"],
  ["直", "なお"],
  ["書", "か"],
  ["回答", "かいとう"],
  ["先", "さき"],
  ["押", "お"],
]);

type Reviewable = Extract<QuizQuestion, { type: "free" | "fillin" }>;

/**
 * 見立ては **どの 文に ついての もの**かを 持つ（`of`）。
 *
 * 打ち直した あとも 前の 見立てが 下に 残ると、学習者は **いまの 文が ⭕に なった**と
 * 読む。効果（useEffect）で 消すのでは なく、出すときに 見くらべて 決める——
 * 消す 処理を 1つ 増やすより、**古い ものは そもそも 出さない**ほうが 取りこぼさない。
 */
type Phase =
  | { kind: "idle" }
  | { kind: "asking" }
  | { kind: "done"; of: string; review: QuizReviewResult }
  | { kind: "failed"; of: string; reason: string };

export function AiReviewPanel({
  setId,
  question,
  /** 学習者が いま 書いて いる もの（`fillin` は 組み立てた メール全文）。 */
  written,
  /**
   * 学習者が **1文字でも 書いたか**。
   *
   * `written` からは 判らない——`fillin` の 文には 型（宛先：・件名：…）が いつも
   * 入って いるので、何も 打って いなくても 空には ならない。打った かどうかは
   * 入力の 部品だけが 知って いる ので、そこから 渡して もらう。
   */
  hasInput,
  /** 場面の メモ（AIに 材料として 渡す）。 */
  scene,
  furigana,
}: {
  /** どの 教材か（つなぎを 教材と 問いで 1本に する 鍵）。 */
  setId?: string;
  question: Reviewable;
  written: string;
  hasInput: boolean;
  scene?: string;
  furigana: FuriganaIndex;
}) {
  const ai = question.ai;
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [showModel, setShowModel] = useState(false);
  /**
   * 何回目の お願いか。**つなぎの 鍵に 混ぜて、押すたびに 張り直す**。
   *
   * 同じ つなぎを 使い回すと 相手は 前の 返事を くり返す（たいわ・朝礼で 確かめた 形）。
   * 学習者は **直して から もう一度 押す** ので、そこで 前の 見立てが 返るのは
   * いちばん こまる（直した ところが 見て もらえない）。
   */
  const [round, setRound] = useState(0);

  /*
   * AIの 文には 読み辞書が 無い。教材の 辞書に `AI_KANJI_FURIGANA` を 重ねた ものを
   * **画面にも 検査にも 同じ 索引**として 使う——別々に すると「検査は 通るのに
   * 画面では ルビが 付かない」が 起きる（`uncoveredKanji` の 注記と 同じ 理由）。
   * 教材の 読みを 後に 置いて 勝たせる（同じ 表記で 読みが ちがう ことが ある）。
   */
  const index = useMemo(
    () => buildFuriganaIndex(mergeFuriganaEntries(AI_KANJI_FURIGANA, furigana.entries)),
    [furigana],
  );

  if (!ai) return null;

  const model = ai.model ?? (question.type === "fillin" ? fillinModelText(question) : "");
  const empty = !hasInput;
  const readable = (text: string) => text === "" || uncoveredKanji(text, index).length === 0;

  const ask = async () => {
    setPhase({ kind: "asking" });
    const turn = round + 1;
    setRound(turn);
    const result = await requestQuizReview(
      `${setId ?? "quiz"}:${question.id}:${turn}`,
      {
        question: question.q,
        scene: scene ?? "",
        model,
        note: ai.note ?? "",
        checks: ai.checks,
        written,
      },
      // 読めない 漢字が 1つでも あれば、1回だけ 言い直して もらう
      (review) =>
        !(
          readable(review.polished) &&
          readable(review.good) &&
          readable(review.advice) &&
          review.checks.every((check) => readable(check.note))
        ),
    );
    if (!result.ok) {
      setPhase({ kind: "failed", of: written, reason: result.reason });
      /*
       * **お手本を 出すのは「鍵が 無い」ときだけ**（2026-09-20 の コード検収）。
       *
       * 鍵が 無い 端末では AIは いつまでも 来ない ので、お手本まで 閉じると
       * 学習者は 手ぶらで 帰る。けれど 混んで いる・となりの もんだいを 見て いる・
       * 返事が 遅い は **押し直せば 通る** 一時の 失敗で、そこで 答えを 出すと
       * 1文字 書いて 連打するだけで お手本が 見られる（写すだけの 問いに なる）。
       */
      if (result.reason === "noKey") setShowModel(true);
      return;
    }
    /*
     * **読めない 文だけ 落とす**（観点の ○△は 残す）。言い直しても 漢字が 残る
     * ことが ある——そこで 見立てを まるごと 捨てると、AIは 正しく 見て いたのに
     * 学習者には 何も 出ない（たいわの `dropUnreadableText` と 同じ 判断）。
     */
    const review = result.review;
    setPhase({
      kind: "done",
      of: written,
      review: {
        ...review,
        good: readable(review.good) ? review.good : "",
        advice: readable(review.advice) ? review.advice : "",
        polished: readable(review.polished) ? review.polished : "",
        checks: review.checks.map((check) => ({
          ...check,
          note: readable(check.note) ? check.note : "",
        })),
      },
    });
    setShowModel(true);
  };

  /** 打ち直した あとの 見立ては 出さない（古い ⭕を 新しい 文の 下に 残さない）。 */
  const settled = phase.kind === "done" || phase.kind === "failed";
  const fresh = settled && phase.of === written;
  /**
   * 見て もらって いる あいだに 打ち直した。
   *
   * 古い 見立ては 出せない（いまの 文の ことでは ない）が、**黙って 消すと
   * 押したのに 何も 起きなかった**ように 見える。次の 一手を 1行で 言う。
   */
  const stale = settled && !fresh;
  const done = phase.kind === "done" && fresh ? phase.review : null;

  return (
    <section className="border-hairline bg-panel-tint mt-4 rounded-[var(--radius-card)] border-2 p-4">
      {/*
        ものさしは **答える 前から** 見えて いる（2026-08-31 の 指定）。
        押した あとは 同じ 行の 横に ○△が つく ので、見る ところは 動かない。
      */}
      <p className="text-ink-soft text-xs font-extrabold">
        <RubyText text="🤖 AIが 見る ところ" index={UI_FURIGANA} />
      </p>
      <ul className="mt-1.5 grid gap-1.5">
        {ai.checks.map((check) => {
          const hit = done?.checks.find((one) => one.id === check.id);
          return (
            <li key={check.id} className="flex items-start gap-2">
              <span
                className="mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-extrabold"
                style={
                  hit
                    ? hit.ok
                      ? { background: "#58c273", color: "#fff" }
                      : { background: "#f4b73f", color: "#3a2a00" }
                    : { background: "var(--color-panel)", color: "var(--color-ink-faint)" }
                }
              >
                {hit ? (hit.ok ? "⭕" : "△") : "・"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-ink text-sm font-bold">
                  <RubyText text={check.label} index={index} />
                </span>
                {hit && hit.note !== "" && (
                  <span className="text-ink-soft block text-xs font-bold">
                    <RubyText text={hit.note} index={index} />
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => void ask()}
        disabled={empty || phase.kind === "asking"}
        className="btn-island btn-game mt-3 w-full px-6 py-2.5 text-sm disabled:opacity-50"
        style={{ "--btn-face": "#7c6cf0", "--btn-shadow": "#5f4fd6" } as React.CSSProperties}
      >
        <RubyText
          text={phase.kind === "asking" ? "AIが 見て います…" : "🤖 AIに 見て もらう"}
          index={UI_FURIGANA}
        />
      </button>
      {empty && (
        <p className="text-ink-faint mt-1.5 text-xs font-bold">
          <RubyText text="先に 書くと 押せます。" index={UI_FURIGANA} />
        </p>
      )}

      {stale && (
        <p className="text-ink-soft mt-2 text-xs font-bold">
          <RubyText text="文を 直したので、もう いちど 押して ください。" index={UI_FURIGANA} />
        </p>
      )}

      {phase.kind === "failed" && fresh && (
        <p className="border-hairline text-ink mt-3 rounded-2xl border-2 bg-white px-3 py-2 text-sm font-bold">
          {judgeFailNote(phase.reason)}
        </p>
      )}

      {done && (
        <div
          className="mt-3 rounded-2xl border-2 bg-white px-3 py-2.5"
          style={{ borderColor: done.ok ? "#58c273" : "#f4b73f" }}
          role="status"
        >
          {/* 判定は ぼかさない（規律1）。そのあとに つぎの 一手を 1つ */}
          <p className="text-ink text-sm font-black">
            <RubyText
              text={done.ok ? "⭕ つたわります" : "△ もう すこし です"}
              index={UI_FURIGANA}
            />
          </p>
          {done.good !== "" && (
            <p className="text-ink-soft mt-1 text-sm leading-relaxed font-bold">
              <RubyText text={done.good} index={index} />
            </p>
          )}
          {done.advice !== "" && (
            <p className="text-ink mt-1 text-sm leading-relaxed font-bold">
              👉 <RubyText text={done.advice} index={index} />
            </p>
          )}
        </div>
      )}

      {done && done.polished !== "" && (
        <div className="mt-3 rounded-2xl border-2 border-[#7c6cf0] bg-white px-3 py-2.5">
          <p className="text-[11px] font-black text-[#5f4fd6]">
            <RubyText
              text="✨ ブラッシュアップ回答（あなたの 文を 直した もの）"
              index={UI_FURIGANA}
            />
          </p>
          <p className="text-ink mt-1 text-sm leading-relaxed font-bold whitespace-pre-line">
            <RubyText text={done.polished} index={index} />
          </p>
        </div>
      )}

      {/*
        お手本は **書いた あと**に 出す。見かたが 届かなかった ときも 出す——
        AIの 都合で 学習者が 手ぶらに ならない ように する。
      */}
      {model !== "" &&
        (showModel ? (
          <div className="border-hairline mt-3 rounded-2xl border-2 bg-white px-3 py-2.5">
            <p className="text-ink-soft text-[11px] font-black">
              <RubyText text="📘 お手本（模範解答）" index={MODEL_FURIGANA} />
            </p>
            <p className="text-ink mt-1 text-sm leading-relaxed font-bold whitespace-pre-line">
              <RubyText text={model} index={index} />
            </p>
          </div>
        ) : (
          !empty && (
            <button
              type="button"
              onClick={() => setShowModel(true)}
              className="text-sky mt-3 text-xs font-black underline underline-offset-4"
            >
              <RubyText text="📘 お手本（模範解答）を 見る" index={MODEL_FURIGANA} />
            </button>
          )
        ))}
    </section>
  );
}

/** 「模範解答」は この 箱でしか 使わない ことば（UI_FURIGANA を 太らせない）。 */
const MODEL_FURIGANA = buildFuriganaIndex([
  ["模範解答", "もはんかいとう"],
  ["手本", "てほん"],
  ["見", "み"],
]);
