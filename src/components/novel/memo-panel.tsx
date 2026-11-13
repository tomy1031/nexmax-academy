"use client";

import { useState } from "react";
import type { NovelScene } from "@/content/schema";
import { DictionaryText } from "@/components/dictionary-text";
import { RubyText } from "@/components/ruby-text";
import type { FuriganaIndex } from "@/lib/text/furigana";

type ConsultScene = Extract<NovelScene, { type: "consult" }>;
type MemoSpec = NonNullable<ConsultScene["memo"]>;

/** 学生が 作った 相談メモ。 */
export interface NovelMemo {
  readonly seen: readonly string[];
  readonly diff: readonly string[];
  /** 自分の 考え（選んだ ことば）。問いが 無い 日は null。 */
  readonly stance: string | null;
  /** ③ 自分で 書いた お願い。 */
  readonly ask: string;
}

/** ①②で 押せる ことばの 数の 上限。 */
const PICK_MAX = 3;

/**
 * 相談メモを 作る（要望 #746）— 話す 前に、①②は 資料から ことばを 拾い、③は 自分で 考える。
 *
 * ## ①②は 押すだけ、③は 自分の 案
 * ①②は 資料に 書いて ある 事実なので、大事な ことばを 押して 拾う（3つまで）。
 * どれを 拾っても まちがいでは ない（正解・不正解を 付けない）。
 * ③は 正解が 1つで ない——**答えの 形を 先に 見せない**。先に「あなたは、どう したら
 * いいと 思いますか」と 自分の 考えを 選ばせ、「決めるのは 相手」と 伝えてから 短く 書かせる。
 * 書けない ときは「考える ヒント」で **問いを 1つずつ** 出す（答えは 出さない）。
 * 問いを ぜんぶ 見ても 書けない ときだけ、文の 終わりの 形（`askForm`）を 出す。
 *
 * 星には 入れない（星は 話して 通じたか だけ）。2026-11-13 の Fable の 設計と tomy さんの 指定
 *「何をしてほしいか？は自分なりのアイデアだと思うので、アイデアを促す工夫をしたい」。
 */
export function MemoMaker({
  spec,
  askForm,
  index,
  show,
  translation,
  onDone,
}: {
  spec: MemoSpec;
  askForm?: string;
  index: FuriganaIndex;
  show: boolean;
  translation: boolean;
  onDone: (memo: NovelMemo) => void;
}) {
  const [seen, setSeen] = useState<readonly string[]>([]);
  const [diff, setDiff] = useState<readonly string[]>([]);
  const [stance, setStance] = useState<string | null>(null);
  const [ask, setAsk] = useState("");
  const [hints, setHints] = useState(0);
  const needStance = Boolean(spec.stance);
  const ready = seen.length > 0 && diff.length > 0 && (!needStance || stance) && ask.trim() !== "";
  const allHints = hints >= spec.hints.length;

  const toggle = (now: readonly string[], word: string) =>
    now.includes(word)
      ? now.filter((one) => one !== word)
      : now.length >= PICK_MAX
        ? now
        : [...now, word];

  return (
    <div className="space-y-3" data-testid="novel-memo">
      <p className="text-navy text-base font-black">
        📝 <RubyText text="相談メモを 作ります" index={index} show={show} />
        <span className="text-ink-soft block text-xs font-bold">
          <RubyText
            text="①と ②は ことばを 押して 選びます（3つまで）。③は 自分で 考えて 書きます。"
            index={index}
            show={show}
          />
        </span>
      </p>

      <MemoPick
        n={1}
        label="調べた こと"
        words={spec.seenWords}
        picked={seen}
        onPick={(word) => setSeen((now) => toggle(now, word))}
        index={index}
        show={show}
      />
      <MemoPick
        n={2}
        label="わからない こと"
        words={spec.diffWords}
        picked={diff}
        onPick={(word) => setDiff((now) => toggle(now, word))}
        index={index}
        show={show}
      />

      {/* ③ 自分の 案（答えを 見せない） */}
      <section
        className="space-y-2 rounded-2xl border-2 p-2.5"
        style={{ borderColor: "var(--color-coral)", background: "white" }}
        data-testid="novel-memo-ask"
      >
        <p className="text-navy text-sm font-black">
          ③ <RubyText text="お願い" index={index} show={show} />
        </p>
        {spec.stance ? (
          <div className="space-y-1.5">
            <p className="text-navy text-sm font-bold">
              <DictionaryText text={spec.stance.question} index={index} show={show} />
            </p>
            <div className="flex flex-wrap gap-1.5">
              {spec.stance.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={stance === option}
                  onClick={() => setStance(option)}
                  className="rounded-full border-2 px-3 py-1.5 text-sm font-bold"
                  style={{
                    borderColor: stance === option ? "var(--color-navy)" : "var(--color-hairline)",
                    background: stance === option ? "var(--color-sky-soft)" : "white",
                  }}
                  data-stance={option}
                >
                  <RubyText text={option} index={index} show={show} />
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {!needStance || stance ? (
          <div className="space-y-1.5">
            <p className="text-navy text-sm font-bold">
              <DictionaryText text={spec.ask} index={index} show={show} />
            </p>
            <input
              value={ask}
              onChange={(event) => setAsk(event.target.value)}
              className="border-hairline w-full rounded-xl border-2 bg-white px-3 py-2 text-sm"
              aria-label="お願い（短く）"
              placeholder="ここに かいて ください（ひらがなでも いい）"
              data-testid="novel-memo-input"
            />
            {spec.hints.length > 0 ? (
              <div className="space-y-1">
                {spec.hints.slice(0, hints).map((hint) => (
                  <p
                    key={hint}
                    className="rounded-lg px-2 py-1 text-xs font-bold"
                    style={{ background: "var(--color-cream)", color: "var(--color-navy)" }}
                  >
                    🤔 <RubyText text={hint} index={index} show={show} />
                  </p>
                ))}
                {allHints && askForm ? (
                  <p
                    className="rounded-lg px-2 py-1 text-xs font-bold"
                    style={{ background: "var(--color-sky-soft)", color: "var(--color-navy)" }}
                  >
                    ✏️ <RubyText text={`文の 終わり：${askForm}`} index={index} show={show} />
                  </p>
                ) : null}
                {!allHints ? (
                  <button
                    type="button"
                    onClick={() => setHints((n) => n + 1)}
                    className="text-navy text-xs font-black underline"
                    data-testid="novel-memo-hint"
                  >
                    💡 <RubyText text="考える ヒント" index={index} show={show} />
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {translation ? (
          <p className="text-ink-soft text-xs font-medium">
            ③ is your own idea. First choose what you think, then write briefly what you will say to
            them. They decide, not you.
          </p>
        ) : null}
      </section>

      <button
        type="button"
        disabled={!ready}
        onClick={() => onDone({ seen, diff, stance, ask: ask.trim() })}
        className="btn-island btn-game w-full px-6 py-3 disabled:opacity-40"
        data-testid="novel-memo-done"
      >
        <RubyText text="メモが できた" index={index} show={show} />
      </button>
    </div>
  );
}

function MemoPick({
  n,
  label,
  words,
  picked,
  onPick,
  index,
  show,
}: {
  n: 1 | 2;
  label: string;
  words: readonly string[];
  picked: readonly string[];
  onPick: (word: string) => void;
  index: FuriganaIndex;
  show: boolean;
}) {
  return (
    <section className="space-y-1.5" data-testid={`novel-memo-pick-${n}`}>
      <p className="text-navy text-sm font-black">
        {n === 1 ? "①" : "②"} <RubyText text={label} index={index} show={show} />
      </p>
      <div className="flex flex-wrap gap-1.5">
        {words.map((word) => {
          const on = picked.includes(word);
          return (
            <button
              key={word}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(word)}
              className="rounded-full border-2 px-3 py-1.5 text-sm font-bold"
              style={{
                borderColor: on ? "var(--color-navy)" : "var(--color-hairline)",
                background: on ? "var(--color-sky-soft)" : "white",
              }}
              data-word={word}
            >
              {on ? "✔ " : ""}
              <RubyText text={word} index={index} show={show} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * 話す ときの 相談メモ — **完成した 文は 出さない**。ことばと 文の 枠だけを 見て、
 * 自分で 文に して 話す（棒読みを 防ぐ）。
 */
export function MemoCard({
  memo,
  frame,
  glow,
  index,
  show,
}: {
  memo: NovelMemo;
  frame?: string;
  /** 足りない 番号（やり直しの 1回目に 光らせる）。 */
  glow: readonly number[];
  index: FuriganaIndex;
  show: boolean;
}) {
  const rows: [1 | 2 | 3, string, string][] = [
    [1, "調べた こと", memo.seen.join("・")],
    [2, "わからない こと", memo.diff.join("・")],
    [3, "お願い", memo.ask],
  ];
  return (
    <section
      className="rounded-2xl border-2 p-3"
      style={{ borderColor: "var(--color-sun)", background: "var(--color-cream)" }}
      data-testid="novel-memo-card"
    >
      <p className="text-navy text-sm font-black">
        📝 <RubyText text="相談メモ" index={index} show={show} />
        <span className="text-ink-soft ml-1 text-xs font-bold">
          <RubyText text="メモを 見て、文に して 話します。" index={index} show={show} />
        </span>
      </p>
      <ol className="text-navy mt-1 space-y-0.5 text-sm font-bold">
        {rows.map(([n, label, text]) => (
          <li
            key={n}
            className="rounded-lg px-1.5 py-0.5"
            style={
              glow.includes(n)
                ? { boxShadow: "0 0 0 3px var(--color-coral)", background: "white" }
                : undefined
            }
            data-glow={glow.includes(n) ? "1" : undefined}
          >
            {["①", "②", "③"][n - 1]}{" "}
            <span className="text-ink-soft text-xs">
              <RubyText text={label} index={index} show={show} />：
            </span>{" "}
            <RubyText text={text} index={index} show={show} />
          </li>
        ))}
      </ol>
      {frame ? (
        <p className="text-ink-soft mt-1.5 text-xs font-bold">
          <RubyText text={`文の 形：${frame}`} index={index} show={show} />
        </p>
      ) : null}
    </section>
  );
}

/** 合格の あと —「ほかの 聞き方」を 見せて、自分の 案と 比べる（点は 付けない）。 */
export function MemoOthers({
  others,
  mine,
  index,
  show,
  translation,
}: {
  others: MemoSpec["others"];
  mine: string | null;
  index: FuriganaIndex;
  show: boolean;
  translation: boolean;
}) {
  if (others.length === 0) return null;
  return (
    <section
      className="space-y-1 rounded-xl px-3 py-2 text-left"
      style={{ background: "var(--color-sky-soft)" }}
      data-testid="novel-memo-others"
    >
      {mine ? (
        <p className="text-navy text-xs font-black">
          <RubyText text={`あなたの お願い：${mine}`} index={index} show={show} />
        </p>
      ) : null}
      <p className="text-navy text-xs font-black">
        💬 <RubyText text="ほかの 聞き方も あります" index={index} show={show} />
      </p>
      <ul className="text-navy space-y-0.5 text-sm font-bold">
        {others.map((other) => (
          <li key={other.text}>
            ・<RubyText text={other.text} index={index} show={show} />
            {translation && other.en ? (
              <span className="text-ink-soft block text-xs font-medium">{other.en}</span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-ink-soft text-xs font-bold">
        <RubyText text="あなたの 聞き方と、どこが ちがいますか。" index={index} show={show} />
      </p>
    </section>
  );
}
