"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Typing } from "@/content/schema";
import { soundsLikeOf } from "@/content/listening-sounds";
import { buildSoundsIndex } from "@/components/listening/listening-checks";
import { RubyText } from "@/components/ruby-text";
import { SpeakButton } from "@/components/speak-button";
import { recordContentProgress } from "@/lib/progress/store";
import { buildFuriganaIndex, type FuriganaIndex } from "@/lib/text/furigana";
import type { TypingWordCard } from "@/lib/vocabulary";
import { createTypingTarget, judgeTyping, type TypingResult } from "./typing-checks";
import { TYPING_UI_FURIGANA } from "./ui-furigana";

/** 読み出した あとの タイピング（ことばカードの 中身が 埋まって いる。`src/lib/content.ts`）。 */
export type TypingViewData = Typing & { words: Record<string, TypingWordCard> };

function subscribeNever(): () => void {
  return () => {};
}

/**
 * タイピング — お手本の 文を 見て、同じように 打つ（2026-09-30 の 指定・願い #550）
 *
 * 1画面 1文。**正解して はじめて** 英語訳と ことばの 意味（N4以上）が 出る——
 * 先に 訳が 見えると、文を 読まずに 英語で 意味を 取って しまう。
 * ぜんぶの 文を 正解すると 済みに なる（関門。`src/lib/content-kinds.ts`）。
 *
 * かなだけでも 漢字まじりでも 当たる（判定は `typing-checks.ts`）。
 */
export function TypingView({ typing, embedded }: { typing: TypingViewData; embedded?: boolean }) {
  const furigana = useMemo(() => buildFuriganaIndex(typing.furigana ?? []), [typing.furigana]);
  const sounds = useMemo(
    () => buildSoundsIndex(typing.listeningRef ? soundsLikeOf(typing.listeningRef) : []),
    [typing.listeningRef],
  );
  const targets = useMemo(
    () =>
      typing.sentences.map((sentence) =>
        createTypingTarget(sentence.text, { furigana, sounds, accept: sentence.accept }),
      ),
    [typing.sentences, furigana, sounds],
  );

  const [furiganaOn, setFuriganaOn] = useState(true);
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<TypingResult | null>(null);
  const [finished, setFinished] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const total = typing.sentences.length;
  const sentence = typing.sentences[index]!;
  const solved = result?.ok === true;
  const isLast = index === total - 1;

  const judge = useCallback(() => {
    if (!input.trim()) return;
    const next = judgeTyping(targets[index]!, input);
    setResult(next);
    recordContentProgress(typing.id, { status: "started", position: { sentence: index } });
    // 「つぎの 文へ」は 正解の あとしか 押せないので、最後の 文の 正解＝ぜんぶ 正解
    if (next.ok && isLast) {
      recordContentProgress(typing.id, { status: "completed" });
      setFinished(true);
    }
  }, [input, targets, index, typing.id, isLast]);

  const reset = useCallback(() => {
    setInput("");
    setResult(null);
    inputRef.current?.focus();
  }, []);

  const goNext = useCallback(() => {
    if (!solved || isLast) return;
    setIndex((i) => i + 1);
    setInput("");
    setResult(null);
    inputRef.current?.focus();
  }, [solved, isLast]);

  const words = (sentence.wordIds ?? [])
    .map((id) => typing.words[id])
    .filter((word): word is TypingWordCard => word !== undefined);

  return (
    <div className={embedded ? "space-y-4" : "mx-auto w-full max-w-4xl space-y-4 px-4 py-6"}>
      <section className="card-island border-hairline border p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-4">
          <span aria-hidden className="text-5xl">
            ⌨️
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-ink text-2xl font-extrabold break-words sm:text-3xl">
              <RubyText text={typing.title} index={furigana} show={furiganaOn} />
            </h1>
            <p className="text-ink-soft mt-1 font-bold break-words">
              <RubyText text={typing.description} index={furigana} show={furiganaOn} />
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFuriganaOn((on) => !on)}
            aria-pressed={furiganaOn}
            className={`rounded-full border-2 px-3 py-1 text-xs font-extrabold ${
              furiganaOn ? "bg-sky border-sky text-white" : "border-hairline text-ink-soft bg-panel"
            }`}
          >
            ふりがな {furiganaOn ? "ON" : "OFF"}
          </button>
        </div>
      </section>

      <section className="card-island border-hairline border p-5 sm:p-6" data-typing="model">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-navy font-extrabold">
            📖 <RubyText text="お手本の 文" index={TYPING_UI_FURIGANA} show={furiganaOn} />
          </h2>
          <span className="text-ink-soft text-sm font-extrabold" data-typing="progress">
            {index + 1} / {total}
          </span>
        </div>
        <p className="bg-panel-tint border-hairline text-ink mt-3 rounded-2xl border px-4 py-4 text-lg leading-loose font-extrabold break-words sm:text-xl">
          <RubyText text={sentence.text} index={furigana} show={furiganaOn} />
        </p>
      </section>

      <section className="card-island border-hairline border p-5 sm:p-6">
        <h2 className="text-navy font-extrabold">
          <label htmlFor="typing-input">
            ✏️ <RubyText text="入力する 文" index={TYPING_UI_FURIGANA} show={furiganaOn} />
          </label>
        </h2>
        <input
          id="typing-input"
          ref={inputRef}
          type="text"
          lang="ja"
          value={input}
          readOnly={solved}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="ここに 入力して ください。"
          aria-label="お手本と 同じ 文を 入力する"
          onChange={(event) => {
            setInput(event.target.value);
            // 外れの 札は 打ち直した 時点で 古く なる（正解の あとは 読むだけ）
            if (result && !result.ok) setResult(null);
          }}
          onKeyDown={(event) => {
            // IME の 確定の Enter で 判定しない（変換中は isComposing。古い 端末は keyCode 229）
            if (event.key !== "Enter" || event.nativeEvent.isComposing || event.keyCode === 229) {
              return;
            }
            event.preventDefault();
            if (solved) goNext();
            else judge();
          }}
          className="border-sky text-ink bg-panel mt-3 w-full rounded-2xl border-2 px-4 py-3 text-lg font-bold"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={reset}
            aria-label="リセット"
            className="btn-island btn-game px-5 py-2.5 text-sm"
          >
            ↺ リセット
          </button>
          <div className="ml-auto flex flex-wrap gap-3">
            <button
              type="button"
              onClick={judge}
              disabled={solved || !input.trim()}
              aria-label="判定"
              className="btn-game px-6 py-2.5 [--btn-face:#e8537a] [--btn-shadow:#c23d61] disabled:opacity-50"
            >
              <RubyText text="判定" index={TYPING_UI_FURIGANA} show={furiganaOn} />
            </button>
            {isLast ? null : (
              <button
                type="button"
                onClick={goNext}
                disabled={!solved}
                aria-label="つぎの 文へ"
                className="btn-game px-6 py-2.5 [--btn-face:#0288d1] [--btn-shadow:#0272ae] disabled:opacity-50"
              >
                <RubyText text="つぎの 文へ →" index={TYPING_UI_FURIGANA} show={furiganaOn} />
              </button>
            )}
          </div>
        </div>
        <Verdict result={result} show={furiganaOn} />
      </section>

      {solved ? (
        <>
          <Translation text={sentence.en} />
          {words.length > 0 ? (
            <WordCards words={words} show={furiganaOn} furigana={furigana} />
          ) : null}
        </>
      ) : null}

      {finished ? (
        <p
          className="card-island border-hairline text-navy border p-5 text-center text-lg font-extrabold"
          data-typing="finished"
        >
          🎉 ぜんぶの <RubyText text="文を 入力" index={TYPING_UI_FURIGANA} show={furiganaOn} />
          できました。
        </p>
      ) : null}
    </div>
  );
}

/** 判定の 札。⭕ か ❌ を **はっきり 言う**（規律1）。外れたら、どこまで 合って いたかも。 */
function Verdict({ result, show }: { result: TypingResult | null; show: boolean }) {
  if (!result) return null;
  if (result.ok) {
    return (
      <p
        role="status"
        className="border-leaf bg-leaf-soft text-leaf-deep mt-3 rounded-2xl border px-4 py-3 font-extrabold"
        data-typing="verdict"
        data-ok="true"
      >
        ⭕ <RubyText text="正解です！" index={TYPING_UI_FURIGANA} show={show} />
      </p>
    );
  }
  return (
    <div
      role="status"
      className="border-coral bg-coral-soft text-coral-deep mt-3 rounded-2xl border px-4 py-3 font-bold"
      data-typing="verdict"
      data-ok="false"
    >
      <p className="font-extrabold">❌ まだ ちがう ところが あります。</p>
      {result.matched ? (
        <p className="mt-1">
          「{result.matched}」
          <RubyText text="までは 合って います。" index={TYPING_UI_FURIGANA} show={show} />
        </p>
      ) : null}
      <p className="mt-1">
        <RubyText
          text="お手本と くらべて、もう一度 入力しましょう。"
          index={TYPING_UI_FURIGANA}
          show={show}
        />
      </p>
    </div>
  );
}

/** 英語訳。コピーの ボタンは クリップボードが 使える 端末だけに 出す。 */
function Translation({ text }: { text: string }) {
  const canCopy = useSyncExternalStore(
    subscribeNever,
    () => typeof navigator !== "undefined" && Boolean(navigator.clipboard?.writeText),
    () => false,
  );
  const [copied, setCopied] = useState(false);
  return (
    <section className="card-island border-hairline border p-5 sm:p-6" data-typing="translation">
      <h2 className="text-navy font-extrabold">
        🌐 <RubyText text="英語訳" index={TYPING_UI_FURIGANA} />
      </h2>
      <div className="border-leaf bg-leaf-soft mt-3 flex items-start gap-3 rounded-2xl border px-4 py-3">
        <p lang="en" className="text-ink flex-1 text-lg font-bold break-words">
          {text}
        </p>
        {canCopy ? (
          <button
            type="button"
            aria-label="英語訳を コピーする"
            onClick={() => {
              void navigator.clipboard.writeText(text).then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
            className="border-hairline bg-panel shrink-0 rounded-xl border px-3 py-1.5 text-sm font-extrabold"
          >
            {copied ? "✓" : "📋"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

/** ことばの 意味（N4以上）。語（ルビつき）・英語・🔊（読みを 読み上げる）。 */
function WordCards({
  words,
  show,
  furigana,
}: {
  words: readonly TypingWordCard[];
  show: boolean;
  furigana: FuriganaIndex;
}) {
  return (
    <section className="card-island border-hairline border p-5 sm:p-6" data-typing="words">
      <h2 className="text-navy font-extrabold">
        📕 <RubyText text="ことばの 意味（N4以上）" index={TYPING_UI_FURIGANA} show={show} />
      </h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {words.map((word) => (
          <li key={word.term} className="border-hairline bg-panel rounded-2xl border p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-ink text-xl font-black">
                <RubyText text={word.term} furigana={[[word.term, word.reading]]} show={show} />
              </p>
              <SpeakButton text={word.reading} label={`${word.reading} を 聞く`} />
            </div>
            <p className="border-hairline text-ink mt-2 border-t pt-2 text-sm font-bold">
              {word.en ? (
                <span lang="en">{word.en}</span>
              ) : (
                <RubyText text={word.meaning} index={furigana} show={show} />
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
