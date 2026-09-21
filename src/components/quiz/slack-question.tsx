"use client";

import { useMemo, useState } from "react";
import type { QuizQuestion } from "@/content/schema";
import { RubyText } from "@/components/ruby-text";
import type { QuizDraft } from "@/lib/quiz/draft";
import { aiReplyFurigana } from "@/lib/ai-kanji";
import { buildFuriganaIndex, type FuriganaIndex } from "@/lib/text/furigana";
import { useAnswerCheck, useWarmOnReady } from "./answer-check";
import { BrushUp, CheckBand, CheckButton, CheckMark, CheckNote } from "./check-parts";

/**
 * 上級：Slackの 連絡を 自分で 書く（`free` ＋ AIの 観点）— **観点ごとに ⭕✗を 返す**
 *
 * 2026-09-21 の 指定「初級と上級はコンポーネントを分けてください」。
 * 初級（メール）は 欄に 正解が ある ので アプリが ⭕✗を 決めるが、
 * こちらは **自由に 書く** ので 機械の 正解が 無い。だから 観点（教材が 持つ）ごとに
 * AIが 見て、⭕なら どこが よかったか、✗なら 何が 足りないかを 1文で 返す。
 *
 * ## 鍵（Gemini）が 無い 端末
 * 見て もらえない ので ⭕✗は 出ない。**それでも 止めない**——書いて あれば つぎへ 進める
 *（理由は 帯に 出す）。鍵の 有無で 教材が 使えなく なる ほうが 害が 大きい。
 *
 * ## お手本は ここでは 出さない
 * 「模範解答は答え合わせの時だけでいいです」（同日の 指定）。
 */

/** 画面じたいの 文言の 読み辞書（教材の 辞書は UIの 文言まで 覆わない・規律2）。 */
const UI_FURIGANA = buildFuriganaIndex([
  ["先", "さき"],
  ["書", "か"],
  ["押", "お"],
  ["見", "み"],
]);

type Slack = Extract<QuizQuestion, { type: "free" }>;

export function SlackQuestion({
  question,
  furigana,
  onSubmit,
  disabled,
  submitMode,
  draft,
}: {
  question: Slack;
  furigana: FuriganaIndex;
  onSubmit: (input: string) => void;
  disabled?: boolean;
  submitMode?: boolean;
  draft?: Extract<QuizDraft, { kind: "free" }>;
}) {
  // 画面の 文字は この部品が 持つ（親から 送り返すと 変換の 途中で 入れ替わる）
  const [value, setValue] = useState(draft?.input ?? "");
  const { check, phase, run, warm, waiting, ready } = useAnswerCheck(question, value);
  /*
   * **AIが 書いた 文だけ**は、教材の 辞書に `AI_KANJI_FURIGANA` を 重ねた 索引で 描く
   *（理由は `mail-question.tsx` と 同じ——検査と 画面で 索引が ちがうと 裸の 漢字が 出る）。
   */
  const aiFurigana = useMemo(
    () => buildFuriganaIndex(aiReplyFurigana(furigana.entries)),
    [furigana],
  );
  const written = value.trim();
  const enough = written.length >= question.minLength;
  /* 押せるように なった ところで つなぎを 先に 張る（メールと 同じ・遅さの 直し） */
  useWarmOnReady(warm, enough && !disabled);

  const change = (next: string) => {
    setValue(next);
    if (submitMode) onSubmit(next);
  };

  const ask = () => {
    const checks = question.ai?.checks ?? [];
    void run({
      items: checks.map((one) => ({ id: one.id, label: one.label })),
      itemKind: "point",
      model: question.ai?.model ?? "",
      scene: question.scene?.text ?? "",
      furigana,
      // 自由に 書く 問いに 機械の 正解は 無い。AIが 来なければ「書けて いれば 進む」
      okWithoutAi: true,
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!submitMode && !disabled && written !== "") onSubmit(value);
      }}
    >
      <textarea
        value={value}
        disabled={disabled}
        onChange={(e) => change(e.target.value)}
        rows={6}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder={question.placeholder ?? "ここに 書いて ください…"}
        aria-label="じゆうに 書く"
        className="border-hairline bg-panel text-ink w-full rounded-[var(--radius-button)] border-2 px-4 py-3 text-base font-bold"
        style={check ? { borderColor: check.ok ? "#58c273" : "#f26fa7" } : undefined}
      />
      {question.starter && (
        <p className="text-ink-soft mt-1 text-xs leading-relaxed font-bold">
          <RubyText text={question.starter} index={furigana} />
        </p>
      )}

      {!submitMode && (
        <button
          type="submit"
          disabled={disabled || written === ""}
          className="btn-island btn-game mt-3 px-8 py-3 disabled:opacity-50"
        >
          こたえる
        </button>
      )}

      {ready && question.ai && (
        <>
          <CheckButton
            onClick={ask}
            disabled={Boolean(disabled) || !enough}
            asking={phase === "asking"}
          />
          {!enough && (
            <p className="text-ink-faint mt-1.5 text-xs font-bold">
              <RubyText text="先に 書くと 押せます。" index={UI_FURIGANA} />
            </p>
          )}

          {/* 印を 付けずに 終わった 回（ほかの もんだいを 見て いる）は、理由だけ 出す */}
          {waiting !== "" && (
            <p className="text-ink-soft mt-1.5 text-xs leading-relaxed font-bold" role="status">
              <RubyText text={waiting} index={aiFurigana} />
            </p>
          )}

          {/*
            観点ごとの ⭕✗と ひとこと。**押す 前には 出さない**——
            「AIが 見る ところ」を 先に 並べると、書く 前から 答えの 形が 見えて しまう
            （2026-09-21 の 指定で 外した）。
          */}
          {check && (
            <>
              <ul className="mt-3 grid gap-2">
                {(question.ai.checks ?? []).map((one) => {
                  const hit = check.items.find((item) => item.id === one.id);
                  if (!hit) return null;
                  return (
                    <li key={one.id} className="border-hairline rounded-xl border-2 bg-white p-2">
                      <div className="flex items-start gap-2">
                        <CheckMark ok={hit.ok} />
                        <span className="text-ink min-w-0 flex-1 text-sm font-bold">
                          <RubyText text={one.label} index={furigana} />
                        </span>
                      </div>
                      <CheckNote ok={hit.ok} note={hit.note} furigana={aiFurigana} />
                    </li>
                  );
                })}
              </ul>
              <CheckBand
                ok={check.ok}
                left={check.items.filter((one) => !one.ok).length}
                aiNote={check.aiNote}
                furigana={aiFurigana}
              />
              <BrushUp text={check.polished} furigana={aiFurigana} />
            </>
          )}
        </>
      )}
    </form>
  );
}
