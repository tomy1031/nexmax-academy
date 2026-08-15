"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { BLANK_MARK, type QuizQuestion } from "@/content/schema";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex, type FuriganaIndex } from "@/lib/text/furigana";
import type { QuizAction } from "./quiz-reducer";

/** 部品じたいの文言の読み辞書（教材データの辞書はUIの文言まで覆わない・規律2）。 */
const UI_FURIGANA = buildFuriganaIndex([
  ["文", "ぶん"],
  ["入", "はい"],
]);

/**
 * いま ことばが 入る あなの しるし。
 *
 * 以前は 枠の 色（`borderColor`）だけで 見分けていた。外の 明るい ところや
 * 色の 見え方が ちがう 目には 差が 消え、2つの あなに 入れ替えて 置いてから
 * 気づくことになる。**色に 頼らない しるし**を 足す。
 */
const ACTIVE_BLANK_MARK = "▶";

/**
 * 問題の型ごとの表示。
 *
 * まなびの島から引き継いだのは「問題の種類」だけで、見た目は
 * あおぞらパスウェイのトークンで作り直している（設計04 §1）。
 */

interface Props {
  question: QuizQuestion;
  furigana: FuriganaIndex;
  dispatch: (action: QuizAction) => void;
  /** emotion の2段階目に入っているか。 */
  emotionStep2?: boolean;
  disabled?: boolean;
}

export function QuestionBody({ question, furigana, dispatch, emotionStep2, disabled }: Props) {
  switch (question.type) {
    case "choose":
      return (
        <OptionList
          options={question.options}
          furigana={furigana}
          disabled={disabled}
          onPick={(index) => dispatch({ type: "answerChoice", index })}
        />
      );

    case "emotion":
      return emotionStep2 ? (
        <div>
          <p className="text-ink mb-3 font-extrabold">
            <RubyText text={question.replyQ} index={furigana} />
          </p>
          <OptionList
            key="reply"
            options={question.replies}
            furigana={furigana}
            disabled={disabled}
            onPick={(index) => dispatch({ type: "answerReply", index })}
          />
        </div>
      ) : (
        <OptionList
          key="feeling"
          options={question.feelings}
          furigana={furigana}
          disabled={disabled}
          onPick={(index) => dispatch({ type: "answerFeeling", index })}
        />
      );

    case "multi":
      return (
        <MultiPicker
          options={question.options}
          furigana={furigana}
          disabled={disabled}
          onSubmit={(indexes) => dispatch({ type: "answerMulti", indexes })}
        />
      );

    case "keyword":
      return (
        <KeywordInput
          disabled={disabled}
          onSubmit={(input) => dispatch({ type: "answerKeyword", input })}
          onSkip={() => dispatch({ type: "skipKeyword" })}
        />
      );

    case "wordbank":
      return (
        <WordBank
          lines={question.lines}
          bank={question.bank}
          blankCount={question.blanks.length}
          furigana={furigana}
          disabled={disabled}
          onSubmit={(filled) => dispatch({ type: "answerWordbank", filled })}
        />
      );
  }
}

/* ---------------- 選択（4択 / 気持ち / 言い方） ---------------- */

function OptionList({
  options,
  furigana,
  onPick,
  disabled,
}: {
  options: readonly string[];
  furigana: FuriganaIndex;
  onPick: (index: number) => void;
  disabled?: boolean;
}) {
  return (
    <ul className="grid gap-3">
      {options.map((option, index) => (
        <motion.li
          key={option}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
        >
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPick(index)}
            className="btn-island btn-game w-full justify-start px-4 py-3.5 text-left"
            style={{ "--btn-face": "#ffffff", "--btn-shadow": "#cfe6f3" } as React.CSSProperties}
          >
            <span className="bg-sky-soft text-navy grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-extrabold">
              {index + 1}
            </span>
            <span className="text-ink font-bold">
              <RubyText text={option} index={furigana} />
            </span>
          </button>
        </motion.li>
      ))}
    </ul>
  );
}

/* ---------------- 複数選択 ---------------- */

function MultiPicker({
  options,
  furigana,
  onSubmit,
  disabled,
}: {
  options: readonly string[];
  furigana: FuriganaIndex;
  onSubmit: (indexes: number[]) => void;
  disabled?: boolean;
}) {
  const [picked, setPicked] = useState<number[]>([]);

  const toggle = (index: number) =>
    setPicked((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
    );

  return (
    <div>
      <ul className="grid gap-3">
        {options.map((option, index) => {
          const on = picked.includes(index);
          return (
            <li key={option}>
              <button
                type="button"
                disabled={disabled}
                aria-pressed={on}
                onClick={() => toggle(index)}
                className="btn-island btn-game w-full justify-start px-4 py-3.5 text-left"
                style={
                  {
                    "--btn-face": on ? "#e1f2fb" : "#ffffff",
                    "--btn-shadow": on ? "#0288d1" : "#cfe6f3",
                  } as React.CSSProperties
                }
              >
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-sm font-extrabold"
                  style={{
                    background: on ? "var(--color-sky)" : "var(--color-panel-tint)",
                    color: on ? "#fff" : "var(--color-ink-faint)",
                  }}
                >
                  {on ? "✓" : ""}
                </span>
                <span className="text-ink font-bold">
                  <RubyText text={option} index={furigana} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        disabled={disabled || picked.length === 0}
        onClick={() => onSubmit(picked)}
        className="btn-island btn-game mt-4 w-full px-6 py-3 text-base disabled:opacity-50"
      >
        こたえる
      </button>
    </div>
  );
}

/* ---------------- 自由入力 ---------------- */

/**
 * 自由入力。「間違えたら恥ずかしい」を軽くするため、書き始める前に
 * **どこまで書けばいいか**（ひらがなでも・全文でなくても）を常に見せておく。
 * 判定側（normalize.ts の answerMatches）もそのとおりに緩めてある。
 */
function KeywordInput({
  onSubmit,
  onSkip,
  disabled,
}: {
  onSubmit: (input: string) => void;
  onSkip: () => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const empty = value.trim().length === 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled && !empty) onSubmit(value);
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="こたえを 書いてね"
          aria-label="こたえを 入力する"
          className="border-hairline bg-panel text-ink w-full rounded-[var(--radius-button)] border-2 px-4 py-3 text-center text-xl font-extrabold"
        />
        <button
          type="submit"
          disabled={disabled || empty}
          className="btn-island btn-game shrink-0 px-8 py-3 disabled:opacity-50"
        >
          こたえる
        </button>
      </div>

      <p className="text-ink-faint mt-2 text-xs font-bold">
        <RubyText text="ひらがなでも OK。ぜんぶの 文で なくて OK" index={UI_FURIGANA} />
      </p>

      <div className="mt-3">
        <button
          type="button"
          disabled={disabled}
          onClick={onSkip}
          className="text-ink-soft hover:text-navy text-sm font-extrabold underline underline-offset-4"
        >
          こたえを 見る
        </button>
      </div>
    </form>
  );
}

/* ---------------- 語群の穴埋め ---------------- */

/**
 * 語群からえらんで空欄を埋める。空欄を押すと選び直せる。
 * 旧アプリはドラッグと入力の切替だったが、ドラッグはスマホで扱いにくいので
 * 「空欄を選ぶ → 語を押す」のタップ操作に統一した。
 */
function WordBank({
  lines,
  bank,
  blankCount,
  furigana,
  onSubmit,
  disabled,
}: {
  lines: readonly string[];
  bank: readonly string[];
  blankCount: number;
  furigana: FuriganaIndex;
  onSubmit: (filled: (string | null)[]) => void;
  disabled?: boolean;
}) {
  const [filled, setFilled] = useState<(string | null)[]>(() => Array(blankCount).fill(null));
  const [active, setActive] = useState(0);

  // 空欄の通し番号を先に割り当てておく（描画中に数えない）
  const rows = useMemo(() => {
    let counter = 0;
    return lines.map((line) => {
      const chunks = line.split(BLANK_MARK);
      return chunks.map((text, i) => ({
        text,
        blank: i < chunks.length - 1 ? counter++ : null,
      }));
    });
  }, [lines]);

  const place = (word: string) => {
    setFilled((prev) => {
      const next = [...prev];
      // 同じ語を2か所に置かない
      const already = next.indexOf(word);
      if (already >= 0) next[already] = null;
      next[active] = word;
      return next;
    });
    setActive((i) => Math.min(blankCount - 1, i + 1));
  };

  return (
    <div>
      <div className="border-hairline bg-panel-tint rounded-[var(--radius-card)] border-2 p-4">
        {rows.map((parts, lineIndex) => (
          <p key={lineIndex} className="text-ink py-1 font-bold">
            {parts.map((part, partIndex) => (
              <span key={partIndex}>
                <RubyText text={part.text} index={furigana} />
                {part.blank !== null && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setActive(part.blank!)}
                    aria-current={active === part.blank ? "true" : undefined}
                    aria-label={
                      active === part.blank
                        ? `${part.blank + 1}ばんめの あな — いま ここに 入ります`
                        : `${part.blank + 1}ばんめの あな`
                    }
                    className="mx-1 min-w-28 rounded-full border-2 px-3 py-1 text-sm font-extrabold"
                    style={{
                      borderColor:
                        active === part.blank ? "var(--color-sky)" : "var(--color-hairline)",
                      background: filled[part.blank]
                        ? "var(--color-sky-soft)"
                        : "var(--color-panel)",
                      color: filled[part.blank] ? "var(--color-navy)" : "var(--color-ink-faint)",
                    }}
                  >
                    {/* いま入る あなの しるし。色が 見分けられなくても 分かる */}
                    {active === part.blank && (
                      <span aria-hidden className="mr-0.5">
                        {ACTIVE_BLANK_MARK}
                      </span>
                    )}
                    {/*
                      番号は 入れたあとも 消さない。消すと、2つの あなに 入れ替えて
                      置いたことに 気づけない（どちらが 何ばんめか 分からなくなる）。
                    */}
                    <span className="text-ink-faint mr-0.5 text-xs">（{part.blank + 1}）</span>
                    {filled[part.blank] ?? "＿＿"}
                  </button>
                )}
              </span>
            ))}
          </p>
        ))}
      </div>

      {/* しるしの 意味を 先に 言う。記号だけ 置いても、何の しるしか 伝わらない */}
      <p className="text-ink-soft mt-4 text-sm font-extrabold">
        <RubyText
          text={`ことばを えらんでね。${ACTIVE_BLANK_MARK} の あなに 入ります`}
          index={UI_FURIGANA}
        />
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {bank.map((word) => (
          <button
            key={word}
            type="button"
            disabled={disabled}
            onClick={() => place(word)}
            className="btn-island btn-game px-4 py-2 text-sm"
            style={
              {
                "--btn-face": filled.includes(word) ? "#e1f2fb" : "#ffffff",
                "--btn-shadow": "#cfe6f3",
              } as React.CSSProperties
            }
          >
            <span className="text-ink">
              <RubyText text={word} index={furigana} />
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={disabled || filled.some((f) => f === null)}
        onClick={() => onSubmit(filled)}
        className="btn-island btn-game mt-4 w-full px-6 py-3 disabled:opacity-50"
      >
        こたえる
      </button>
    </div>
  );
}
