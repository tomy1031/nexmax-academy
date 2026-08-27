"use client";

import { useState } from "react";
import { RubyText } from "@/components/ruby-text";
import {
  notebookLines,
  readNotebook,
  spokenAnswer,
  type NotebookLine,
} from "@/lib/answers/notebook";
import { buildFuriganaIndex } from "@/lib/text/furigana";

/**
 * こたえノート — **話しながら 自分の こたえを 見る**ための ひきだし
 *
 * ## どこで 使うか
 * いまは ミーティング（`meeting.notes`）から。けれど **この部品は 教材の 種類を
 * 知らない**——受け取るのは「どの もんだいの こたえを 出すか」だけで、
 * 会話の 状態にも Live にも さわらない。だから これから 置く 別の 対話
 *（たいわ・対話ゲーム・面接の 練習）にも そのまま 付けられる
 *（2026-08-27 の 指定「今後もこのようなメモを表示する形の対話機能を実装するかも
 * しれないので、共通化を前提で考慮してください」）。
 *
 * ## 出しっぱなしに しない
 * ヒントを ポップアップに した のと 同じ 決めごと（docs/constraints.md 2026-08-20）。
 * 会話の 画面は もう 混んで いる——話す ボタンと 相手の 顔を 押し出すと、
 * 「メモを 見る」ために 会話が できなく なる。**押すと 開く ひきだし**にする。
 *
 * ## 端末の 中だけ
 * 引き先は `@/lib/answers/notebook`（localStorage）。読むのは **ひきだしを 開いた
 * とき**だけ——ボタンは サーバ側でも 描かれる ので、そこで 端末の 中を 読むと
 * 中身の ある/無いで 画面が ちらつく。
 */

const UI_FURIGANA = buildFuriganaIndex([
  ["自分", "じぶん"],
  ["閉", "と"],
  ["開", "ひら"],
  ["見", "み"],
  ["言", "い"],
  ["書", "か"],
  ["先", "さき"],
]);

/** どの もんだいの こたえを 出すか（`meeting.notes` と 同じ 形）。 */
export interface AnswerNotebookSource {
  readonly ref: string;
  readonly label: string;
  readonly reportOnly?: boolean;
}

interface LoadedSource {
  readonly label: string;
  readonly ref: string;
  readonly lines: readonly NotebookLine[];
}

/**
 * 開く ボタン ＋ ひきだし。**ボタンだけを 置き、中身は 開いた ときに 読む**。
 *
 * `sources` が 空なら **何も 描かない**（ボタンすら 出さない）。押しても 空の
 * ひきだしが 開く だけの ボタンは、画面の 場所を 取って 何も しない。
 */
export function AnswerNotebook({
  sources,
  className,
}: {
  sources: readonly AnswerNotebookSource[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (sources.length === 0) return null;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-hairline bg-panel text-navy rounded-full border-2 px-3 py-1.5 text-xs font-extrabold"
      >
        <span aria-hidden className="mr-1">
          📋
        </span>
        <RubyText text="自分の こたえを 見る" index={UI_FURIGANA} />
      </button>
      {open && <NotebookPanel sources={sources} onClose={() => setOpen(false)} />}
    </div>
  );
}

/**
 * ひきだしの 中身。
 *
 * 右から 出す 板に する（会話の 画面を 覆いきらない）。せまい 画面では 下から
 * 全面に なる——390px で 横に 並べると、こたえの 文が 2〜3文字ずつ 折り返して
 * 読めなく なる（実機幅で 撮って 見つかった 崩れ）。
 */
function NotebookPanel({
  sources,
  onClose,
}: {
  sources: readonly AnswerNotebookSource[];
  onClose: () => void;
}) {
  /*
   * 端末の 中は **開いた ときに 1回だけ** 読む（`useState` の 初期化）。
   *
   * この 板は 押されて はじめて 描かれる ので、サーバ側で 走る ことは 無い。
   * effect で 読んで setState すると、描いた あと もう一度 描き直す ことに なる
   *（`react-hooks/set-state-in-effect`）。開いて いる 間に 別の 端末で こたえが
   * 変わる ことも 無いので、読み直しも 要らない。
   */
  const [loaded] = useState<readonly LoadedSource[]>(() =>
    sources.map((source) => {
      const notebook = readNotebook(source.ref);
      return {
        label: source.label,
        ref: source.ref,
        lines: notebook ? notebookLines(notebook, { reportOnly: source.reportOnly }) : [],
      };
    }),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: "rgba(31,58,86,.35)" }}
      role="dialog"
      aria-modal="true"
      aria-label="自分の こたえ"
    >
      {/* 外を 押すと 閉じる。会話に すぐ 戻れる ように する */}
      <button
        type="button"
        aria-label="とじる"
        onClick={onClose}
        className="flex-1 cursor-default"
      />
      <div className="bg-panel flex h-full w-full max-w-md flex-col shadow-2xl sm:max-w-lg">
        <div className="border-hairline flex items-center gap-2 border-b-2 px-4 py-3">
          <h2 className="text-navy min-w-0 flex-1 text-lg font-black">
            <span aria-hidden className="mr-1">
              📋
            </span>
            <RubyText text="自分の こたえ" index={UI_FURIGANA} />
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="border-hairline text-ink-soft bg-panel rounded-full border-2 px-3 py-1 text-xs font-extrabold"
          >
            <RubyText text="閉じる" index={UI_FURIGANA} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loaded.map((source) => (
            <section key={source.ref} className="mb-5">
              <h3 className="text-ink-soft mb-2 text-xs font-extrabold">
                <RubyText text={source.label} index={UI_FURIGANA} />
              </h3>
              {source.lines.length === 0 ? (
                /*
                 * まだ その もんだいを 出して いない 人。**理由と 次の 一手**を 書く。
                 * 空の 板だけ 出すと、こわれて いるのか まだなのかが 分からない。
                 */
                <p className="bg-cream border-hairline text-ink rounded-[var(--radius-card)] border-2 px-3 py-2 text-sm font-bold">
                  <RubyText
                    text="まだ こたえが ありません。先に もんだいを 出すと、ここに 出ます。"
                    index={UI_FURIGANA}
                  />
                </p>
              ) : (
                <ol className="grid gap-2">
                  {source.lines.map((line, i) => (
                    <NotebookRow key={line.questionId} line={line} number={i + 1} />
                  ))}
                </ol>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * メモの 1行。
 *
 * **いちばん 大きい 字は「口に 出す ことば」**（`spokenAnswer`）。けっかの 一覧
 *（`ReviewRow`）と 同じ 決め方で、合って いた 問いは 自分の こたえ、外した 問いは 正解。
 * 設問文は 小さく 上に 置く——どの 話かが 分かれば よく、読み上げる ものでは ない。
 */
function NotebookRow({ line, number }: { line: NotebookLine; number: number }) {
  const spoken = spokenAnswer(line).trim();
  return (
    <li className="border-hairline bg-panel-tint rounded-[var(--radius-card)] border-2 px-3 py-2">
      <p className="text-ink-soft text-xs font-bold">
        {number}. {line.section && <span className="mr-1">［{line.section}］</span>}
        {line.q.split("\n")[0]}
      </p>
      <p className="text-ink mt-1 leading-relaxed font-extrabold">
        {spoken === "" ? (
          <span className="text-ink-faint">
            <RubyText text="書いて いません" index={UI_FURIGANA} />
          </span>
        ) : (
          spoken
        )}
      </p>
      {/*
        自分が 書いた ものと 言う ことばが ちがう ときだけ、書いた ものも 小さく 出す。
        「自分は こう 書いたが 正しくは こう」が 見えないと、次に 直しようが ない。
      */}
      {!line.correct && line.answer.trim() !== "" && line.answer.trim() !== spoken && (
        <p className="text-ink-faint mt-1 text-xs font-bold">
          <RubyText text="書いた もの" index={UI_FURIGANA} />: {line.answer}
        </p>
      )}
    </li>
  );
}
