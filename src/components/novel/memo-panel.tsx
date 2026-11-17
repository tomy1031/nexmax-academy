"use client";

import { useEffect, useState } from "react";
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

/** くらべる 画面で 見つけた 2行（メモの 上に 出す。資料を 見に 戻らなくて いい ように）。 */
export interface MemoFacts {
  readonly left: { readonly title: string; readonly text: string };
  readonly right: { readonly title: string; readonly text: string };
}

/** ①②で 押せる ことばの 数の 上限（正解の 無い 段だけ）。 */
const PICK_MAX = 3;

/**
 * 読みこみ直しても メモを 消さない（2026-11-17 の 通しプレイ「作った メモが 消える」）。
 * 端末の 中だけに 置く（記録の 台帳には 送らない）。読めない 端末では 何も しない。
 *
 * 鍵は「教材の id ＋ 場面の id ＋ 版」（`nexmax.novel-memo.<教材>.<場面>.v1.draft|done`）——
 * 場面の id は 教材を またぐと 重なりうる（2026-11-17 の code-critic）。ログアウトで
 * `nexmax.` ごと 消える（書きかけの 診断 `DiagnosisDraft` と 同じ 扱い）。
 * 読み戻す ときは **形を ぜんぶ 確かめ**、今の 教材に 無い ことば・選択肢は 捨てる
 *（先生が DB で ことばを 直した あとに、古い ことばが 残らない ように）。
 */
const MEMO_PREFIX = "nexmax.novel-memo.";
const MEMO_VERSION = "v1";

function readStored(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(`${MEMO_PREFIX}${key}.${MEMO_VERSION}`);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: unknown): void {
  try {
    const full = `${MEMO_PREFIX}${key}.${MEMO_VERSION}`;
    if (value === null) window.localStorage.removeItem(full);
    else window.localStorage.setItem(full, JSON.stringify(value));
  } catch {
    // 保存できない 端末でも 遊べる
  }
}

const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((one) => typeof one === "string");

/**
 * 端末に 残った メモを 確かめる。形が ちがえば null。今の 教材に 無い ことば・選択肢は 捨てる。
 * `spec` が 無ければ ことばの 絞りこみは しない。
 */
export function parseStoredMemo(value: unknown, spec?: MemoSpec): NovelMemo | null {
  if (typeof value !== "object" || value === null) return null;
  const memo = value as Record<string, unknown>;
  if (!isStrings(memo.seen) || !isStrings(memo.diff) || typeof memo.ask !== "string") return null;
  if (memo.stance !== null && typeof memo.stance !== "string") return null;
  const stance =
    typeof memo.stance === "string" && (!spec?.stance || spec.stance.options.includes(memo.stance))
      ? memo.stance
      : null;
  return {
    seen: spec ? memo.seen.filter((word) => spec.seenWords.includes(word)) : memo.seen,
    diff: spec ? memo.diff.filter((word) => spec.diffWords.includes(word)) : memo.diff,
    stance,
    ask: memo.ask,
  };
}

/** できあがった メモ（その 相談の）。無ければ null。 */
export function readSavedMemo(key: string, spec?: MemoSpec): NovelMemo | null {
  return parseStoredMemo(readStored(`${key}.done`), spec);
}

export function saveMemo(key: string, memo: NovelMemo | null): void {
  writeStored(`${key}.done`, memo);
  if (memo) writeStored(`${key}.draft`, null);
}

/** ③が 聞く 文か（「〜か。」で 終わる。講義の「いただけませんか」「いかがでしょうか」「〜ますか」）。 */
export function asksSomething(text: string): boolean {
  return /か[。．.？?！!\s]*$/u.test(text.trim());
}

type Section = 1 | 2 | 3;

/**
 * 相談メモを 作る（要望 #746）— 話す 前に、①②は 資料から ことばを 拾い、③は 自分で 考える。
 *
 * ## ①②は 問いに 答えて 押す、③は 自分の 案
 * ①②は 資料に 書いて ある 事実。**問い**（「仕様書に 書いて ある 商品は どれですか。」）に
 * 答えて ことばを 押す。正解が 決まって いる 段は、まちがえたら その 場で ✖ と 次に する ことを
 * 出す（規律1）。正解を ぜんぶ 押すと その 段が できあがる（2026-11-17 tomy さん「BCodex」）。
 * ③は 正解が 1つで ない——**答えの 形を 先に 見せない**。先に「あなたは、どう したら
 * いいと 思いますか」と 自分の 考えを 選ばせ、「決めるのは 相手」と 伝えてから 短く 書かせる。
 * 文の 終わりの 形（`askForm`）は **はじめから 見せる**——ヒントを 開かなくても 書ける ように
 *（規律10）。「考える ヒント」は 問いを 1つずつ 出す（答えは 出さない）。
 *
 * 上に くらべる 画面で 見つけた 2行を 出す（資料を 見に 戻らなくて いい）。
 * 「メモが できた」は いつも 押せる。足りない ときは、どこが 足りないかを 言って その 段を 光らせる
 *（押しても 何も 起きない ボタンに しない・2026-11-17 の 通しプレイ）。
 *
 * 星には 入れない（星は 話して 通じたか だけ）。2026-11-13 の Fable の 設計と tomy さんの 指定
 *「何をしてほしいか？は自分なりのアイデアだと思うので、アイデアを促す工夫をしたい」。
 */
export function MemoMaker({
  spec,
  askForm,
  facts,
  storageKey,
  index,
  show,
  translation,
  onDone,
}: {
  spec: MemoSpec;
  askForm?: string;
  facts?: MemoFacts | null;
  /** 書きかけを 端末に 残す ための 名前（教材の id ＋ 相談の 場面の id）。 */
  storageKey: string;
  index: FuriganaIndex;
  show: boolean;
  translation: boolean;
  onDone: (memo: NovelMemo) => void;
}) {
  const [draft] = useState(() => parseStoredMemo(readStored(`${storageKey}.draft`), spec));
  const [seen, setSeen] = useState<readonly string[]>(draft?.seen ?? []);
  const [diff, setDiff] = useState<readonly string[]>(draft?.diff ?? []);
  const [stance, setStance] = useState<string | null>(draft?.stance ?? null);
  const [ask, setAsk] = useState(draft?.ask ?? "");
  const [hints, setHints] = useState(0);
  /** 「メモが できた」を 押した ときに 足りなかった 段。 */
  const [missing, setMissing] = useState<readonly Section[]>([]);
  const needStance = Boolean(spec.stance);

  useEffect(() => {
    writeStored(`${storageKey}.draft`, { seen, diff, stance, ask });
  }, [storageKey, seen, diff, stance, ask]);

  const seenDone = sectionDone(seen, spec.seenAnswer);
  const diffDone = sectionDone(diff, spec.diffAnswer);
  /*
   * ③は 聞く 文（「〜か。」で 終わる）に なって いれば できあがり。1語だけ（「キーボード」）
   * では 話す ときに 言う 文が 無い（2026-11-17 の 通しプレイ）。中身の 正しさは 見ない。
   */
  const askDone = (!needStance || stance !== null) && asksSomething(ask);

  const finish = () => {
    const lack: Section[] = [];
    if (!seenDone) lack.push(1);
    if (!diffDone) lack.push(2);
    if (!askDone) lack.push(3);
    setMissing(lack);
    if (lack.length > 0) return;
    onDone({ seen, diff, stance, ask: ask.trim() });
  };
  const lit = (n: Section) =>
    missing.includes(n) && !(n === 1 ? seenDone : n === 2 ? diffDone : askDone);

  return (
    <div className="space-y-3" data-testid="novel-memo">
      <p className="text-navy text-base font-black">
        📝 <RubyText text="相談メモを 作ります" index={index} show={show} />
        <span className="text-ink-soft block text-xs font-bold">
          <RubyText
            text="①と ②は 質問に 答えて、ことばを 押します。③は 自分で 考えて 書きます。"
            index={index}
            show={show}
          />
        </span>
      </p>

      {facts ? (
        <section
          className="space-y-1 rounded-xl px-3 py-2"
          style={{ background: "var(--color-sky-soft)" }}
          data-testid="novel-memo-facts"
        >
          <p className="text-ink-soft text-xs font-black">
            🔍 <RubyText text="くらべて 見つけた 2行" index={index} show={show} />
          </p>
          {[facts.left, facts.right].map((fact) => (
            <p key={fact.title} className="text-navy text-sm font-bold">
              <span className="text-ink-soft text-xs">
                <RubyText text={fact.title} index={index} show={show} />：
              </span>{" "}
              <RubyText text={fact.text} index={index} show={show} />
            </p>
          ))}
        </section>
      ) : null}

      <MemoPick
        n={1}
        label="調べた こと"
        ask={spec.seenAsk}
        words={spec.seenWords}
        answer={spec.seenAnswer}
        picked={seen}
        lit={lit(1)}
        onPick={setSeen}
        index={index}
        show={show}
      />
      <MemoPick
        n={2}
        label="わからない こと"
        ask={spec.diffAsk}
        words={spec.diffWords}
        answer={spec.diffAnswer}
        picked={diff}
        lit={lit(2)}
        onPick={setDiff}
        index={index}
        show={show}
      />

      {/* ③ 自分の 案（答えを 見せない） */}
      <section
        className="space-y-2 rounded-2xl border-2 p-2.5"
        style={{
          borderColor: "var(--color-coral)",
          background: "white",
          boxShadow: lit(3) ? "0 0 0 3px var(--color-coral)" : undefined,
        }}
        data-testid="novel-memo-ask"
        data-lit={lit(3) ? "1" : undefined}
      >
        <p className="text-navy text-sm font-black">
          ③ <RubyText text="お願い" index={index} show={show} />
          {askDone ? " ✔" : ""}
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
        <div className="space-y-1.5">
          <p className="text-navy text-sm font-bold">
            <DictionaryText text={spec.ask} index={index} show={show} />
          </p>
          {askForm ? (
            <p
              className="rounded-lg px-2 py-1 text-xs font-bold"
              style={{ background: "var(--color-sky-soft)", color: "var(--color-navy)" }}
              data-testid="novel-memo-form"
            >
              ✏️ <RubyText text={`文の 形：${askForm}`} index={index} show={show} />
            </p>
          ) : null}
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
              {hints < spec.hints.length ? (
                <button
                  type="button"
                  onClick={() => setHints((n) => n + 1)}
                  className="text-navy rounded-full px-2 py-1 text-xs font-black underline"
                  data-testid="novel-memo-hint"
                >
                  💡 <RubyText text="考える ヒント" index={index} show={show} />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        {translation ? (
          <p className="text-ink-soft text-xs font-medium">
            ③ is your own idea. First choose what you think, then write briefly what you will say to
            them. They decide, not you.
          </p>
        ) : null}
      </section>

      {/*
       * 「メモが できた」と 足りない 所の 文は、パネルの 下に はりつける——メモが 長く、
       * スマホでは 枠の 外に 隠れて いた（2026-11-17 の 通しプレイ）。
       */}
      <div
        className="sticky -bottom-3 z-10 -mx-2.5 space-y-2 border-t px-2.5 pt-2 pb-3 sm:-mx-3 sm:px-3"
        style={{ borderColor: "var(--color-hairline)", background: "var(--color-panel)" }}
      >
        {missing.length > 0 && !(seenDone && diffDone && askDone) ? (
          <p
            role="status"
            className="rounded-xl px-3 py-2 text-sm font-black"
            style={{ background: "var(--color-cream)", color: "var(--color-coral-deep)" }}
            data-testid="novel-memo-missing"
          >
            <RubyText
              text={`まだです。${missingText(missing, { seenDone, diffDone, needStance, stance, ask })}`}
              index={index}
              show={show}
            />
          </p>
        ) : null}

        <button
          type="button"
          onClick={finish}
          className="btn-island btn-game w-full px-6 py-3"
          data-testid="novel-memo-done"
          data-ready={seenDone && diffDone && askDone ? "1" : undefined}
        >
          <RubyText text="メモが できた" index={index} show={show} />
        </button>
      </div>
    </div>
  );
}

/** 段が できあがったか（正解が あれば 正解を ぜんぶ、無ければ 1つ 以上）。 */
function sectionDone(picked: readonly string[], answer: readonly string[] | undefined): boolean {
  if (!answer) return picked.length > 0;
  return answer.every((word) => picked.includes(word));
}

function missingText(
  missing: readonly Section[],
  state: {
    seenDone: boolean;
    diffDone: boolean;
    needStance: boolean;
    stance: string | null;
    ask: string;
  },
): string {
  const parts: string[] = [];
  if (missing.includes(1) && !state.seenDone) parts.push("①の ことばを 押します。");
  if (missing.includes(2) && !state.diffDone) parts.push("②の ことばを 押します。");
  if (missing.includes(3)) {
    if (state.needStance && state.stance === null) parts.push("③で 自分の 考えを 選びます。");
    if (state.ask.trim() === "") parts.push("③に お願いを 書きます。");
    else if (!asksSomething(state.ask))
      parts.push("③は 聞く 文に します。「〜か。」で 終わります。");
  }
  return parts.join("");
}

function MemoPick({
  n,
  label,
  ask,
  words,
  answer,
  picked,
  lit,
  onPick,
  index,
  show,
}: {
  n: 1 | 2;
  label: string;
  ask?: string;
  words: readonly string[];
  answer?: readonly string[];
  picked: readonly string[];
  lit: boolean;
  onPick: (next: readonly string[]) => void;
  index: FuriganaIndex;
  show: boolean;
}) {
  /** まちがえて 押した ことば（その 場で ✖ を 出す）。 */
  const [wrong, setWrong] = useState<string | null>(null);
  const done = sectionDone(picked, answer);

  const tap = (word: string) => {
    if (picked.includes(word)) {
      onPick(picked.filter((one) => one !== word));
      setWrong(null);
      return;
    }
    if (answer && !answer.includes(word)) {
      setWrong(word);
      return;
    }
    setWrong(null);
    if (!answer && picked.length >= PICK_MAX) return;
    onPick([...picked, word]);
  };

  return (
    <section
      className="space-y-1.5 rounded-xl p-1"
      style={lit ? { boxShadow: "0 0 0 3px var(--color-coral)" } : undefined}
      data-testid={`novel-memo-pick-${n}`}
      data-done={done ? "1" : undefined}
      data-lit={lit ? "1" : undefined}
    >
      <p className="text-navy text-sm font-black">
        {n === 1 ? "①" : "②"} <RubyText text={label} index={index} show={show} />
        {done ? " ✔" : ""}
      </p>
      {ask ? (
        <p className="text-navy text-sm font-bold">
          <DictionaryText text={ask} index={index} show={show} />
          {answer ? (
            <span className="text-ink-soft ml-1 text-xs">
              <RubyText
                text={`（${["1つ", "2つ", "3つ"][answer.length - 1] ?? "ぜんぶ"} 押します）`}
                index={index}
                show={show}
              />
            </span>
          ) : null}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {words.map((word) => {
          const on = picked.includes(word);
          const bad = wrong === word;
          return (
            <button
              key={word}
              type="button"
              aria-pressed={on}
              onClick={() => tap(word)}
              className={`rounded-full border-2 px-3 py-1.5 text-sm font-bold ${bad ? "animate-pulse" : ""}`}
              style={{
                borderColor: bad
                  ? "var(--color-coral-deep)"
                  : on
                    ? "var(--color-navy)"
                    : "var(--color-hairline)",
                background: on ? "var(--color-sky-soft)" : "white",
              }}
              data-word={word}
              data-wrong={bad ? "1" : undefined}
            >
              {on ? "✔ " : bad ? "✖ " : ""}
              <RubyText text={word} index={index} show={show} />
            </button>
          );
        })}
      </div>
      {wrong ? (
        <p
          role="status"
          className="text-coral-deep text-xs font-black"
          data-testid={`novel-memo-wrong-${n}`}
        >
          ✖{" "}
          <RubyText
            text={`不正解です。「${wrong}」は ${n === 1 ? "①" : "②"}の 答えでは ありません。上の 2行を 見て、もう 一度 押します。`}
            index={index}
            show={show}
          />
        </p>
      ) : null}
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
          <RubyText text="見ながら、文に して 話します。" index={index} show={show} />
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
    </section>
  );
}
