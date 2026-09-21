"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { BLANK_MARK, type QuizQuestion } from "@/content/schema";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex, type FuriganaIndex } from "@/lib/text/furigana";
import { wordbankDisplayOrder } from "@/lib/quiz/bank-order";
import type { QuizDraft } from "@/lib/quiz/draft";
import { fillinSlots, fillinText } from "@/lib/quiz/fillin";
import { AiReviewPanel } from "./ai-review-panel";
import type { QuizAction, QuizMode } from "./quiz-reducer";
import { RankListInput } from "./rank-list-input";

/** 部品じたいの文言の読み辞書（教材データの辞書はUIの文言まで覆わない・規律2）。 */
const UI_FURIGANA = buildFuriganaIndex([
  ["日本語", "にほんご"],
  ["文", "ぶん"],
  ["入", "はい"],
  ["直", "なお"],
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
  /**
   * どの 教材か。AIの つなぎ（Live）を **教材と 問いで 1本**に する ための 鍵。
   *
   * 問いの id は 教材の 中でしか 一意では ない（スタジオの 既定は `q1`）。
   * 教材を またいで 同じ 鍵に すると、**前の 教材の 話の つづき**として
   * 見かたが 返る（2026-08-21 に 会話の 判定で 実際に 起きた 形）。
   */
  setId?: string;
  question: QuizQuestion;
  furigana: FuriganaIndex;
  dispatch: (action: QuizAction) => void;
  /** emotion の2段階目に入っているか（1問ずつ のときは 状態機械が 決める）。 */
  emotionStep2?: boolean;
  disabled?: boolean;
  /**
   * やりかた。`"submit"`（まとめて 出す）のときは
   *  - 押した 瞬間に 採点しない（下書きに 置くだけ）ので、**選んだ ところを 出し続ける**
   *  - 「こたえる」ボタンを 置かない（進むのは 外の「つぎ →」）
   */
  mode?: QuizMode;
  /** いまの 下書き（まとめて 出す のとき、書いた ものを 画面に 出し直す ため）。 */
  draft?: QuizDraft;
}

export function QuestionBody({
  setId,
  question,
  furigana,
  dispatch,
  emotionStep2,
  disabled,
  mode = "one",
  draft,
}: Props) {
  const submitMode = mode !== "one";

  switch (question.type) {
    case "choose":
      return (
        <OptionList
          options={question.options}
          images={question.optionImages}
          furigana={furigana}
          disabled={disabled}
          selected={draft?.kind === "choice" ? draft.index : undefined}
          onPick={(index) => dispatch({ type: "answerChoice", index })}
        />
      );

    case "emotion":
      return (
        <EmotionPicker
          question={question}
          furigana={furigana}
          dispatch={dispatch}
          disabled={disabled}
          submitMode={submitMode}
          step2={emotionStep2}
          draft={draft?.kind === "emotion" ? draft : undefined}
        />
      );

    case "multi":
      return (
        <MultiPicker
          options={question.options}
          furigana={furigana}
          disabled={disabled}
          submitMode={submitMode}
          draft={draft?.kind === "multi" ? draft : undefined}
          onSubmit={(indexes) => dispatch({ type: "answerMulti", indexes })}
        />
      );

    case "keyword":
      return (
        <KeywordInput
          placeholder={question.placeholder}
          disabled={disabled}
          submitMode={submitMode}
          draft={draft?.kind === "keyword" ? draft : undefined}
          onSubmit={(input) => dispatch({ type: "answerKeyword", input })}
        />
      );

    case "free":
      return (
        <FreeInput
          setId={setId}
          question={question}
          furigana={furigana}
          placeholder={question.placeholder}
          starter={question.starter}
          disabled={disabled}
          submitMode={submitMode}
          draft={draft?.kind === "free" ? draft : undefined}
          onSubmit={(input) => dispatch({ type: "answerFree", input })}
        />
      );

    case "fillin":
      return (
        <FillinInput
          setId={setId}
          question={question}
          furigana={furigana}
          disabled={disabled}
          submitMode={submitMode}
          draft={draft?.kind === "fillin" ? draft : undefined}
          onSubmit={(inputs) => dispatch({ type: "answerFillin", inputs })}
        />
      );

    case "list":
      return (
        <ListInput
          groups={question.groups.length}
          placeholders={question.placeholders}
          disabled={disabled}
          submitMode={submitMode}
          draft={draft?.kind === "list" ? draft : undefined}
          onSubmit={(inputs) => dispatch({ type: "answerList", inputs })}
        />
      );

    case "ranklist":
      return (
        <RankListInput
          question={question}
          furigana={furigana}
          disabled={disabled}
          submitMode={submitMode}
          draft={draft?.kind === "ranklist" ? draft : undefined}
          onSubmit={(rows) => dispatch({ type: "answerRanklist", rows })}
        />
      );

    case "wordbank":
      return (
        <WordBank
          lines={question.lines}
          // データの 順は 答えの 順に なりがち。画面では まぜて 出す（bank-order.ts）
          bank={wordbankDisplayOrder(question)}
          blankCount={question.blanks.length}
          furigana={furigana}
          disabled={disabled}
          submitMode={submitMode}
          draft={draft?.kind === "wordbank" ? draft : undefined}
          onSubmit={(filled) => dispatch({ type: "answerWordbank", filled })}
        />
      );
  }
}

/* ---------------- 選択（4択 / 気持ち / 言い方） ---------------- */

function OptionList({
  options,
  images,
  furigana,
  onPick,
  disabled,
  selected,
}: {
  options: readonly string[];
  /** 選択肢ごとの絵（教材が指定したときだけ）。options と同じ並び。 */
  images?: readonly string[];
  furigana: FuriganaIndex;
  onPick: (index: number) => void;
  disabled?: boolean;
  /**
   * いま えらんで いる もの（まとめて 出す のとき）。
   * 押した 瞬間に 次へ 行かない やりかたでは、**自分が どれを 選んだか**が
   * 画面に 残って いないと、見直しの しようが ない。
   */
  selected?: number;
}) {
  return (
    <ul className="grid gap-3">
      {options.map((option, index) => {
        const on = selected === index;
        return (
          <motion.li
            key={option}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <button
              type="button"
              disabled={disabled}
              aria-pressed={selected === undefined ? undefined : on}
              onClick={() => onPick(index)}
              className="btn-island btn-game w-full justify-start px-4 py-3.5 text-left"
              style={
                {
                  "--btn-face": on ? "#e1f2fb" : "#ffffff",
                  "--btn-shadow": on ? "#0288d1" : "#cfe6f3",
                } as React.CSSProperties
              }
            >
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-extrabold"
                style={{
                  background: on ? "var(--color-sky)" : "var(--color-sky-soft)",
                  color: on ? "#fff" : "var(--color-navy)",
                }}
              >
                {/* 色だけに 頼らない。えらんだ ところは しるしでも 分かる（規律・色覚） */}
                {on ? "✓" : index + 1}
              </span>
              {images?.[index] && (
                /*
                 * 絵は 押せる 面の 中に 置く（絵だけ 押しても 選べる）。
                 * 次の 問題へ 進むと すぐ 消えるので `loading="eager"` のまま——
                 * lazy に すると 表示の 瞬間に 白い 枠が 出て、選択肢が 一瞬 ずれる。
                 * next/image を 使わないのは、教材が 外の URL も 指せるため。
                 */
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={images[index]}
                  alt=""
                  className="border-hairline h-16 w-24 shrink-0 rounded-[var(--radius-chip)] border-2 object-cover sm:h-20 sm:w-32"
                />
              )}
              <span className="text-ink font-bold">
                <RubyText text={option} index={furigana} />
              </span>
            </button>
          </motion.li>
        );
      })}
    </ul>
  );
}

/* ---------------- 気持ち → 言い方（2段階） ---------------- */

/**
 * 気もちを えらんでから、その ときの 言い方を えらぶ。
 *
 * **1問ずつ**では 段階を 状態機械が 持つ（気もちの 正誤を 見せてから 2段階目へ）。
 * **まとめて 出す**では 正誤を 見せないので、下書きの 気もちが 決まって いるかで
 * 段階を 決め、いつでも 気もちを えらび直せる ようにする
 * ——「出す 前なら 何度でも 書き直せる」が この やりかたの 約束だから。
 */
function EmotionPicker({
  question,
  furigana,
  dispatch,
  disabled,
  submitMode,
  step2,
  draft,
}: {
  question: Extract<QuizQuestion, { type: "emotion" }>;
  furigana: FuriganaIndex;
  dispatch: (action: QuizAction) => void;
  disabled?: boolean;
  submitMode: boolean;
  step2?: boolean;
  draft?: Extract<QuizDraft, { kind: "emotion" }>;
}) {
  /** まとめて 出す のとき、気もちを えらび直して いる 最中か。 */
  const [redoFeeling, setRedoFeeling] = useState(false);
  const onReplyStep = submitMode ? draft?.feeling != null && !redoFeeling : Boolean(step2);

  if (!onReplyStep) {
    return (
      <OptionList
        key="feeling"
        options={question.feelings}
        furigana={furigana}
        disabled={disabled}
        selected={submitMode && draft?.feeling != null ? draft.feeling : undefined}
        onPick={(index) => {
          setRedoFeeling(false);
          dispatch({ type: "answerFeeling", index });
        }}
      />
    );
  }

  return (
    <div>
      {/*
        まとめて 出す ときは「合って いるね」を 出さないので、**えらんだ ものを
        そのまま 残す**——1問ずつ なら 見守りの ひとことが 段が 進んだ ことを 伝えるが、
        こちらは 何も 出ないと「押したのに 何も 起きて いない」ように 見える。
      */}
      {submitMode && draft?.feeling != null && (
        <p className="border-hairline bg-panel-tint text-ink-soft mb-3 rounded-[var(--radius-card)] border-2 px-3 py-2 text-sm font-extrabold">
          <RubyText text="えらんだ きもち: " index={UI_FURIGANA} />
          <span className="text-ink">
            <RubyText text={question.feelings[draft.feeling] ?? ""} index={furigana} />
          </span>
        </p>
      )}
      <p className="text-ink mb-3 font-extrabold">
        <RubyText text={question.replyQ} index={furigana} />
      </p>
      <OptionList
        key="reply"
        options={question.replies}
        furigana={furigana}
        disabled={disabled}
        selected={submitMode && draft?.reply != null ? draft.reply : undefined}
        onPick={(index) => dispatch({ type: "answerReply", index })}
      />
      {submitMode && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setRedoFeeling(true)}
          className="text-ink-soft hover:text-navy mt-3 text-sm font-extrabold underline underline-offset-4"
        >
          ← <RubyText text="きもちを えらび直す" index={UI_FURIGANA} />
        </button>
      )}
    </div>
  );
}

/* ---------------- 複数選択 ---------------- */

function MultiPicker({
  options,
  furigana,
  onSubmit,
  disabled,
  submitMode,
  draft,
}: {
  options: readonly string[];
  furigana: FuriganaIndex;
  onSubmit: (indexes: number[]) => void;
  disabled?: boolean;
  submitMode?: boolean;
  draft?: Extract<QuizDraft, { kind: "multi" }>;
}) {
  /*
   * 下書きから 始める（まとめて 出す のとき）。設問が 変わると この部品ごと
   * 作り直される（親が `key` に 問題IDを 入れて いる）ので、ここで 読むだけで
   * 行ったり 来たり しても 選んだ ものが 残る。
   */
  const [picked, setPicked] = useState<number[]>(() => [...(draft?.indexes ?? [])]);

  const toggle = (index: number) =>
    setPicked((prev) => {
      const next = prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index];
      // まとめて 出す ときは「こたえる」を 押さないので、押すたびに 下書きへ 送る
      if (submitMode) onSubmit(next);
      return next;
    });

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
      {!submitMode && (
        <button
          type="button"
          disabled={disabled || picked.length === 0}
          onClick={() => onSubmit(picked)}
          className="btn-island btn-game mt-4 w-full px-6 py-3 text-base disabled:opacity-50"
        >
          こたえる
        </button>
      )}
    </div>
  );
}

/* ---------------- 順不同の 入力（list） ---------------- */

/**
 * いくつかを **順不同で** 打つ（「5つの サービスを 書いて ください」）。
 *
 * 語群（`wordbank`）と ちがい **ふだを 出さない**。並んだ ふだから えらべると、
 * サイトを 見なくても 消去法で 当たって しまう——配布資料の 調査シートが
 * 5つの 空欄に 自分で 打たせて いたのは、名前を 思い出す ところまでが
 * ねらいだから（2026-08-27 の 指定）。
 *
 * **どの 欄に 書いても よい**（採点は `gradeDraft` が 順を 見ない）ので、
 * 欄の 番号は ただの 目印に する。
 */
function ListInput({
  groups,
  placeholders,
  onSubmit,
  disabled,
  submitMode,
  draft,
}: {
  /** 欄の 数。 */
  groups: number;
  placeholders?: readonly string[];
  onSubmit: (inputs: readonly string[]) => void;
  disabled?: boolean;
  submitMode?: boolean;
  draft?: Extract<QuizDraft, { kind: "list" }>;
}) {
  const [values, setValues] = useState<string[]>(() =>
    Array.from({ length: groups }, (_, i) => draft?.inputs[i] ?? ""),
  );
  const empty = values.every((v) => v.trim() === "");

  const change = (at: number, next: string) => {
    const after = values.map((v, i) => (i === at ? next : v));
    setValues(after);
    if (submitMode) onSubmit(after);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!submitMode && !disabled && !empty) onSubmit(values);
      }}
    >
      <ul className="grid gap-2">
        {values.map((value, index) => (
          <li key={index} className="flex items-center gap-2">
            <span className="border-hairline bg-panel-tint text-ink-soft grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 text-sm font-extrabold">
              {index + 1}
            </span>
            <input
              type="text"
              value={value}
              disabled={disabled}
              onChange={(e) => change(index, e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={placeholders?.[index] ?? String(index + 1)}
              aria-label={`${index + 1}つめを 入力する`}
              className="border-hairline bg-panel text-ink w-full rounded-[var(--radius-button)] border-2 px-4 py-2.5 text-base font-extrabold"
            />
          </li>
        ))}
      </ul>
      {!submitMode && (
        <button
          type="submit"
          disabled={disabled || empty}
          className="btn-island btn-game mt-3 px-8 py-3 disabled:opacity-50"
        >
          こたえる
        </button>
      )}
    </form>
  );
}

/* ---------------- 自由入力 ---------------- */

/**
 * 自由入力。
 *
 * ## 「〜でなくても OK」と 書かない（2026-08-27 の 指定）
 * 前は 入力欄の 下に「ひらがなでも OK。ぜんぶの 文で なくて OK」と 出して いた。
 * **学習者に「やらなくてよい」と 先に 言う 文言は 一切 出さない**——
 * できない ことを 先に 数えあげる 言い方に なる。
 * 判定側（`normalize.ts` の `answerMatches`）は これまでどおり ゆるいので、
 * ひらがなで 書いても 一部だけ 書いても 通る。**ゆるさは 動きで 示す**。
 */
function KeywordInput({
  onSubmit,
  disabled,
  submitMode,
  draft,
  placeholder,
}: {
  onSubmit: (input: string) => void;
  disabled?: boolean;
  submitMode?: boolean;
  draft?: Extract<QuizDraft, { kind: "keyword" }>;
  /** 教材が 決めた うすい 字（「例：株式会社○○」）。先生が 管理画面で 直せる。 */
  placeholder?: string;
}) {
  const [value, setValue] = useState(draft?.input ?? "");
  const empty = value.trim().length === 0;

  /*
   * まとめて 出す ときは 打つたびに 下書きへ 送る（「こたえる」を 押さないため）。
   * 画面の 文字は この部品が 持ったままに する——親から 送り返すと、日本語入力の
   * 変換の 途中で 文字が 入れ替わる ことが ある。
   */
  const change = (next: string) => {
    setValue(next);
    if (submitMode) onSubmit(next);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!submitMode && !disabled && !empty) onSubmit(value);
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={value}
          disabled={disabled}
          onChange={(e) => change(e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={placeholder ?? "こたえを 書いてね"}
          aria-label="こたえを 入力する"
          className="border-hairline bg-panel text-ink w-full rounded-[var(--radius-button)] border-2 px-4 py-3 text-center text-xl font-extrabold"
        />
        {!submitMode && (
          <button
            type="submit"
            disabled={disabled || empty}
            className="btn-island btn-game shrink-0 px-8 py-3 disabled:opacity-50"
          >
            こたえる
          </button>
        )}
      </div>
    </form>
  );
}

/* ---------------- 自由記述（正解なし） ---------------- */

/**
 * 正解の 無い 問いの 入力欄。
 *
 * `KeywordInput` と 分けたのは 見た目の ためでは ない。**1行では 足りない**から。
 * 「なぜ そう 思いましたか」に 1行の 欄を 出すと、学習者は 1行ぶんしか 書かない
 *（欄の 大きさが「これくらい 書けば いい」の 合図に なる）。
 * 「ちがいます」が 出ない 問いなので、思った ことを そのまま 書ける 広さを 出す。
 */
function FreeInput({
  setId,
  question,
  furigana,
  onSubmit,
  disabled,
  submitMode,
  draft,
  placeholder,
  starter,
}: {
  setId?: string;
  question: Extract<QuizQuestion, { type: "free" }>;
  furigana: FuriganaIndex;
  onSubmit: (input: string, en?: string) => void;
  disabled?: boolean;
  submitMode?: boolean;
  draft?: Extract<QuizDraft, { kind: "free" }>;
  placeholder?: string;
  /** 日本語の 型文（打ちながら 見られる 足場）。 */
  starter?: string;
}) {
  // 画面の 文字は この部品が 持つ（親から 送り返すと 変換の 途中で 入れ替わる）
  const [value, setValue] = useState(draft?.input ?? "");
  const empty = value.trim().length === 0;

  const change = (next: string) => {
    setValue(next);
    if (submitMode) onSubmit(next);
  };
  const boxClass =
    "border-hairline bg-panel text-ink w-full rounded-[var(--radius-button)] border-2 px-4 py-3 text-base font-bold";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!submitMode && !disabled && !empty) onSubmit(value);
      }}
    >
      <textarea
        value={value}
        disabled={disabled}
        onChange={(e) => change(e.target.value)}
        rows={4}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder={placeholder ?? "思った ことを 書いてね"}
        aria-label="じゆうに 書く"
        className={boxClass}
      />
      {/*
        型文は **打ちながら 見られる**ところに 置く。`placeholder` は 1文字 打つと
        消えるので、いちばん 助けが 要る「書き始めた あと」に 手がかりが 無くなる。
      */}
      {starter && (
        <p className="text-ink-soft mt-1 text-xs leading-relaxed font-bold">
          <RubyText text={starter} index={UI_FURIGANA} />
        </p>
      )}
      {!submitMode && (
        <button
          type="submit"
          disabled={disabled || empty}
          className="btn-island btn-game mt-3 px-8 py-3 disabled:opacity-50"
        >
          こたえる
        </button>
      )}
      {/*
        ここに あった「ただしい こたえは ありません。思った ことを 書けば OK」は
        **消した**（2026-08-30 の 指定「これは講師側が頭に入れる情報で生徒には不要」）。
        自由入力に 正解が 無い ことは、下の 型文（`starter`）と ヒントが すでに 見せて いる。
        ことばで 先回りせず、ゆるさは **動き**で 出す（AGENTS.md 規律1）。
      */}
      {/*
        AIの 見かたは **いま 打って いる 文**を 見る（下書きでは なく この 部品の 文字）。
        1問ずつの やりかたでは 下書きが 更新されないので、下書きから 読むと
        「まだ 書いて いません」の まま 見て もらう ことに なる。
      */}
      <AiReviewPanel
        setId={setId}
        question={question}
        written={value}
        hasInput={!empty}
        scene={question.scene?.text}
        furigana={furigana}
      />
    </form>
  );
}

/* ---------------- 型の ある 文の うめこみ（メール・連絡文） ---------------- */

/**
 * 決まった 型（宛先・件名・【問題】【原因】…）を 自分で 打って うめる。
 *
 * 元の 別ページ（`public/tools/hourensou/renraku_contact.html`）の メール画面を
 * そのまま 持ち込む: 上に 宛先と 件名、下に 本文、本文の 中に 【ラベル】＋入力欄。
 * **型が 目に 見えて いる ことが この 問いの 足場**なので、欄だけを 縦に 並べた
 * 形には しない（それでは 何を 書いて いるのか 分からなく なる）。
 */
function FillinInput({
  setId,
  question,
  furigana,
  onSubmit,
  disabled,
  submitMode,
  draft,
}: {
  setId?: string;
  question: Extract<QuizQuestion, { type: "fillin" }>;
  furigana: FuriganaIndex;
  onSubmit: (inputs: readonly string[]) => void;
  disabled?: boolean;
  submitMode?: boolean;
  draft?: Extract<QuizDraft, { kind: "fillin" }>;
}) {
  const slots = useMemo(() => fillinSlots(question), [question]);
  // 画面の 文字は この部品が 持つ（親から 送り返すと 変換の 途中で 入れ替わる）
  const [inputs, setInputs] = useState<string[]>(() => slots.map((_, i) => draft?.inputs[i] ?? ""));
  const empty = inputs.every((v) => v.trim() === "");

  const change = (index: number, next: string) => {
    const updated = inputs.map((value, i) => (i === index ? next : value));
    setInputs(updated);
    if (submitMode) onSubmit(updated);
  };

  /*
   * 入力欄の 字は **16px（`text-base`）**。iPhone の Safari は 16px 未満の 欄に
   * さわると **画面を 勝手に 拡大する**ので、390px に 収めた 並びが その場で 崩れる
   *（2026-09-20 の コード検収）。ほかの 問いの 欄（`KeywordInput`・`ListInput`）も 同じ。
   */
  const box =
    "border-hairline bg-panel text-ink min-w-0 flex-1 rounded-[var(--radius-button)] border-2 px-3 py-2 text-base font-bold";
  /*
   * **`size={1}` を 付ける**（2026-09-20 の 390px 検証）。
   *
   * `input` は 既定で 20文字ぶんの 幅を「いちばん 縮んだ 幅」として 主張する。
   * もんだいの 一覧は grid なので、行の いちばん 縮んだ 幅が **ページの 幅**に なり、
   * 390px の 端末で 横スクロールが 出て いた（実測 489px）。`min-w-0` だけでは
   * 縮まない（Chromium は この 主張を 残す）ので、主張の もとを 1文字に する。
   * 実際の 幅は `flex-1` が 決めるので 見た目は 変わらない。
   */
  /** 本文の 上の 行（宛先）の 欄は 先頭から、本文の 欄は その あと（`fillinSlots` の 並び）。 */
  let slot = 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!submitMode && !disabled && !empty) onSubmit(inputs);
      }}
    >
      <div className="border-hairline overflow-hidden rounded-[var(--radius-card)] border-2 bg-white">
        {question.formTitle && (
          <p className="bg-panel-tint border-hairline text-ink border-b-2 px-3 py-2 text-sm font-extrabold">
            <RubyText text={question.formTitle} index={furigana} />
          </p>
        )}
        {question.head.map((row, i) => {
          const index = row.kind === "write" ? slot++ : -1;
          return (
            <div
              key={`${row.label}-${i}`}
              className="border-hairline flex items-center gap-2 border-b px-3 py-2"
            >
              <span className="text-ink-soft w-16 shrink-0 text-xs font-extrabold">
                <RubyText text={row.label} index={furigana} />
              </span>
              {row.kind === "fixed" ? (
                <span className="text-ink min-w-0 flex-1 text-sm font-bold">
                  <RubyText text={row.text} index={furigana} />
                </span>
              ) : (
                <input
                  type="text"
                  size={1}
                  value={inputs[index] ?? ""}
                  disabled={disabled}
                  onChange={(e) => change(index, e.target.value)}
                  autoComplete="off"
                  aria-label={`${row.label}を 入力する`}
                  placeholder={row.placeholder}
                  className={box}
                />
              )}
            </div>
          );
        })}
        <div className="grid gap-2 px-3 py-3">
          {question.intro && (
            <p className="text-ink text-sm leading-relaxed font-bold">
              <RubyText text={question.intro} index={furigana} />
            </p>
          )}
          {question.blanks.map((blank, i) => {
            const index = slot + i;
            return (
              <div key={`${blank.label}-${i}`} className="flex items-center gap-2">
                <span className="text-ink w-24 shrink-0 text-xs font-extrabold">
                  <RubyText text={`【${blank.label}】`} index={furigana} />
                </span>
                <input
                  type="text"
                  size={1}
                  value={inputs[index] ?? ""}
                  disabled={disabled}
                  onChange={(e) => change(index, e.target.value)}
                  autoComplete="off"
                  aria-label={`${blank.label}を 入力する`}
                  placeholder={blank.placeholder}
                  className={box}
                />
              </div>
            );
          })}
          {question.outro && (
            <p className="text-ink text-sm leading-relaxed font-bold">
              <RubyText text={question.outro} index={furigana} />
            </p>
          )}
        </div>
      </div>

      {!submitMode && (
        <button
          type="submit"
          disabled={disabled || empty}
          className="btn-island btn-game mt-3 px-8 py-3 disabled:opacity-50"
        >
          こたえる
        </button>
      )}

      {/* AIには **1本の メール**として 渡す（欄ごとでは 文として 見て もらえない） */}
      <AiReviewPanel
        setId={setId}
        question={question}
        written={fillinText(question, inputs)}
        hasInput={!empty}
        scene={question.scene?.text}
        furigana={furigana}
      />
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
  submitMode,
  draft,
}: {
  lines: readonly string[];
  bank: readonly string[];
  blankCount: number;
  furigana: FuriganaIndex;
  onSubmit: (filled: (string | null)[]) => void;
  disabled?: boolean;
  submitMode?: boolean;
  draft?: Extract<QuizDraft, { kind: "wordbank" }>;
}) {
  const [filled, setFilled] = useState<(string | null)[]>(() =>
    Array.from({ length: blankCount }, (_, i) => draft?.filled[i] ?? null),
  );
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
      // まとめて 出す ときは「こたえる」を 押さないので、置くたびに 下書きへ 送る
      // （途中まででも 残す——出す 前に 全部 埋まって いなくても よい）
      if (submitMode) onSubmit(next);
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
                    {/*
                      入れた 語にも ルビを 合成する（規律2）。語群の ボタンは 覆えて
                      いるのに、あなに 置いた 瞬間だけ 裸の 漢字に 戻って いた
                      （「大阪」が ふりがな なしで 文の 中に 残る）。
                    */}
                    {filled[part.blank] ? (
                      <RubyText text={filled[part.blank]!} index={furigana} />
                    ) : (
                      "＿＿"
                    )}
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
            /*
             * 読み上げに 渡す 名前は **ルビを 合成する 前の ことば**。
             *
             * 中身は `RubyText` なので、名前を そのままに すると
             *「観光かんこうDX」「2023年ねん10月がつ」のように 読みが 割りこんだ 名前に なる。
             * 画面で 読む ぶんには ふりがなが 要るが、**耳で 聞く 人には 邪魔**で、
             * 名前で 引く 検証も 当たらなく なる（tests/e2e/toshi.spec.ts 冒頭の 覚書と 同じ 罠）。
             */
            aria-label={word}
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

      {!submitMode && (
        <button
          type="button"
          disabled={disabled || filled.some((f) => f === null)}
          onClick={() => onSubmit(filled)}
          className="btn-island btn-game mt-4 w-full px-6 py-3 disabled:opacity-50"
        >
          こたえる
        </button>
      )}
    </div>
  );
}
