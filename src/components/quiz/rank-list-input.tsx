"use client";

import { useRef, useState } from "react";
import type { QuizQuestion } from "@/content/schema";
import { RubyText } from "@/components/ruby-text";
import { moveItem, removeAt, replaceAt } from "@/components/studio/list-ops";
import { buildFuriganaIndex, type FuriganaIndex } from "@/lib/text/furigana";
import type { QuizDraft } from "@/lib/quiz/draft";

/**
 * じゅんばんに ならべて 書く（`ranklist`）— 行を ふやして・消して・↑↓で ならべかえる
 *
 * ## なぜ 要るか（2026-09-18 の 指定）
 * 「自分でいくらでも追加できる回答コンポーネント。人によって 20でも 30でも 階級が
 * 作れるように」。日本の 会社の 階級は、調べた サイトに よって 5つの 人も 30の 人も
 * いる。欄の 数を 教材が 決める `list` では 書ききれない。
 *
 * 動きは 元の 別ページ（`public/tools/hourensou/houkoku_search.html` の
 * `renderRows`・`move`・`removeRow`）を そのまま 写す——学習者が もう 触った 形を 変えない。
 *   - 行の 上に「↑ いちばん えらい」、下に「↓ いちばん 下」（教材の `topLabel`/`bottomLabel`）
 *   - 1行ごとに 番号・入力欄・↑・↓・✕
 *   - 「＋ 行を ふやす」で 上限（`max`）まで ふやせる
 *
 * ## 元と 変えた ところ（規律10: 変えた 理由を その場で 書く）
 * - ↑↓の あと **入力欄に 目を もどさない**。元は 動かした 行の 欄に フォーカスを
 *   移して いたが、スマホでは 押す たびに キーボードが 開いて 画面が 半分に なる。
 *   行を 動かしても 押した ボタンが 付いて くる（行に 変わらない 鍵を 付けた）ので、
 *   続けて 押せる。
 *
 * ## 書いて いる 字を 上から 押し戻さない
 * 状態は **開いた ときに 1回だけ** 下書きから 読む（`FreeInput` と 同じ 決まり。
 * 日本語入力の 変換中に 親から 値を 戻すと、打った 字が 消える）。
 */

/** 部品じたいの 文言の 読み辞書（教材の 辞書は UI の 文言まで 覆わない・規律2）。 */
const UI_FURIGANA = buildFuriganaIndex([["行", "ぎょう"]]);

/** 1つの 入力の 長さの 上限（先生の 表で 1行に 並ぶ。階級の 名前は 短い）。 */
const MAX_ROW = 60;

interface Row {
  /** 並べかえても 変わらない 鍵（押した ボタンの フォーカスが 行と いっしょに 動く）。 */
  readonly key: number;
  readonly value: string;
}

export function RankListInput({
  question,
  furigana,
  onSubmit,
  disabled,
  submitMode,
  draft,
}: {
  question: Extract<QuizQuestion, { type: "ranklist" }>;
  furigana: FuriganaIndex;
  onSubmit: (rows: readonly string[]) => void;
  disabled?: boolean;
  submitMode?: boolean;
  draft?: Extract<QuizDraft, { kind: "ranklist" }>;
}) {
  const [rows, setRows] = useState<Row[]>(() => {
    const saved = draft?.rows.slice(0, question.max) ?? [];
    const values = saved.length > 0 ? saved : Array.from({ length: question.start }, () => "");
    return values.map((value, key) => ({ key, value }));
  });
  const listRef = useRef<HTMLOListElement | null>(null);

  const empty = rows.every((row) => row.value.trim() === "");

  /** 変えた あとの 行を 画面と 下書きの 両方へ（まとめて 出す やりかたでは 打つ たびに 残す）。 */
  const commit = (after: Row[]) => {
    setRows(after);
    if (submitMode) onSubmit(after.map((row) => row.value));
  };

  /** n 番目の 入力欄に 目を 移す（描き直しの あと）。 */
  const focusInput = (at: number) => {
    requestAnimationFrame(() => {
      listRef.current?.querySelectorAll<HTMLInputElement>("input")[at]?.focus();
    });
  };

  const add = () => {
    if (rows.length >= question.max) return;
    // 鍵は いま ある どの 行とも かぶらない 数（消した 行の 鍵は 使い回さない）
    const key = rows.reduce((most, row) => Math.max(most, row.key), -1) + 1;
    commit([...rows, { key, value: "" }]);
    focusInput(rows.length);
  };

  const remove = (at: number) => {
    if (rows.length <= 2) return;
    commit(removeAt(rows, at));
    focusInput(Math.max(0, at - 1));
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!submitMode && !disabled && !empty) onSubmit(rows.map((row) => row.value));
      }}
    >
      {question.topLabel ? (
        <p className="text-ink-soft mb-2 text-sm font-extrabold">
          <RubyText text={question.topLabel} index={furigana} />
        </p>
      ) : null}

      <ol ref={listRef} className="grid gap-2">
        {rows.map((row, index) => {
          const n = index + 1;
          return (
            <li key={row.key} className="flex flex-wrap items-center gap-2">
              <span className="border-hairline bg-panel-tint text-ink-soft grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 text-sm font-extrabold">
                {n}
              </span>
              <input
                type="text"
                value={row.value}
                disabled={disabled}
                maxLength={MAX_ROW}
                onChange={(e) => commit(replaceAt(rows, index, { ...row, value: e.target.value }))}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder={question.placeholder}
                aria-label={`${n}ばんめを 入力する`}
                className="border-hairline bg-panel text-ink min-w-0 flex-1 basis-40 rounded-[var(--radius-button)] border-2 px-4 py-2.5 text-base font-extrabold"
              />
              <span className="ml-auto flex shrink-0 gap-1.5">
                <RowButton
                  mark="↑"
                  label={`${n}ばんめを 上へ`}
                  disabled={disabled || index === 0}
                  onClick={() => commit(moveItem(rows, index, -1))}
                />
                <RowButton
                  mark="↓"
                  label={`${n}ばんめを 下へ`}
                  disabled={disabled || index === rows.length - 1}
                  onClick={() => commit(moveItem(rows, index, 1))}
                />
                <RowButton
                  mark="✕"
                  label={`${n}ばんめを 消す`}
                  disabled={disabled || rows.length <= 2}
                  onClick={() => remove(index)}
                />
              </span>
            </li>
          );
        })}
      </ol>

      {question.bottomLabel ? (
        <p className="text-ink-soft mt-2 text-sm font-extrabold">
          <RubyText text={question.bottomLabel} index={furigana} />
        </p>
      ) : null}

      <button
        type="button"
        onClick={add}
        disabled={disabled || rows.length >= question.max}
        // ルビが 名前に 混ざると「行ぎょうを」に なり、名前で 引けない
        aria-label="行を ふやす"
        className="border-hairline text-sky mt-3 rounded-full border-2 border-dashed px-5 py-2 text-sm font-black disabled:opacity-50"
      >
        <RubyText text="＋ 行を ふやす" index={UI_FURIGANA} />
      </button>

      {!submitMode && (
        <div>
          <button
            type="submit"
            disabled={disabled || empty}
            className="btn-island btn-game mt-3 px-8 py-3 disabled:opacity-50"
          >
            こたえる
          </button>
        </div>
      )}
    </form>
  );
}

/** ↑・↓・✕ の まるい ボタン。スマホでも 押せる 大きさ（44px）に する。 */
function RowButton({
  mark,
  label,
  disabled,
  onClick,
}: {
  mark: string;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="border-hairline bg-panel text-navy grid h-11 w-11 place-items-center rounded-full border-2 text-lg font-black disabled:opacity-30 sm:h-9 sm:w-9"
    >
      {mark}
    </button>
  );
}
