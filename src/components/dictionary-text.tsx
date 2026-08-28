"use client";

import { useId, useRef, useState } from "react";
import { RubyText } from "@/components/ruby-text";
import { WordPopover } from "@/components/word-popover";
import { findDictionaryTerm, type DictionaryEntry } from "@/lib/dictionary";
import { canHover } from "@/lib/pointer";
import type { FuriganaIndex } from "@/lib/text/furigana";

/**
 * 本文に 辞書の ことばを 埋める（教材の本文用）
 *
 * 職場語は平易語に置き換えない（設計01 R6-1）。かといって ひらがなに開いても、
 * 意味を知らない語は意味ゼロの かたまり になるだけで解決しない。
 * 本文は **漢字＋ふりがな** で出し、意味は **マウスを のせる**（指の きかいは タップ）で
 * やさしい日本語＋英語 を出す（2026-08-18 の指定）。読みながら 手を 止めずに 引けるようにする。
 *
 * 辞書は ことばの 正を 畳んだもの（src/lib/dictionary.ts）。新しい保存先は無い。
 *
 * ## **1文につき 1語**（設計07 §2.5）——「1かたまりにつき 1語」では ない
 * 決まりは ずっと「1文につき 下線は 1語だけ」だった。ところが 実装は
 * わたされた 文字列を まるごと 1つと 見て いた ので、3文 入った 段落でも
 * **下線は 1つ**しか 付かなかった（2026-08-28 の 指摘
 *「圧倒的に ポップアップ辞書が 足りません」）。
 *
 * ここで **文に 分けてから** 1文ずつ 引く。決まりは 変えて いない——
 * 決まりどおりに 動く ように しただけで、下線の 数は 文の 数だけ 増える。
 *
 * 性格診断まわりの `GlossaryText` と役割は似ているが、引く先が違う
 *（あちらは診断専用の固定台帳、こちらは ことばの 正）。引き当ての規則も違うので、
 * まとめると片方の当たり方が変わる。
 */

/** 文の 切れめ。句点・感嘆符・改行の **うしろ**で 切る（区切りは 前の 文に 残す）。 */
function splitSentences(text: string): string[] {
  return text.split(/(?<=[。！？!?\n])/).filter((part) => part !== "");
}

export function DictionaryText({
  text,
  index,
  show = true,
  dictionary,
  className,
}: {
  text: string;
  index?: FuriganaIndex;
  show?: boolean;
  dictionary?: readonly DictionaryEntry[];
  className?: string;
}) {
  if (!dictionary || dictionary.length === 0) {
    return <RubyText text={text} index={index} show={show} className={className} />;
  }
  return (
    <span className={className}>
      {splitSentences(text).map((sentence, at) => (
        <Sentence key={at} text={sentence} index={index} show={show} dictionary={dictionary} />
      ))}
    </span>
  );
}

/** 1文ぶん。当たった ことばが あれば、そこだけ 押せる ようにする。 */
function Sentence({
  text,
  index,
  show,
  dictionary,
}: {
  text: string;
  index?: FuriganaIndex;
  show: boolean;
  dictionary: readonly DictionaryEntry[];
}) {
  const found = findDictionaryTerm(text, dictionary);
  if (!found) return <RubyText text={text} index={index} show={show} />;

  const { entry, at, length } = found;
  const before = text.slice(0, at);
  const surface = text.slice(at, at + length);
  const after = text.slice(at + length);
  return (
    <>
      {before ? <RubyText text={before} index={index} show={show} /> : null}
      <DictionaryWord entry={entry} surface={surface} index={index} show={show} />
      {after ? <RubyText text={after} index={index} show={show} /> : null}
    </>
  );
}

function DictionaryWord({
  entry,
  surface,
  index,
  show,
}: {
  entry: DictionaryEntry;
  /** **本文に 出て いる 形**（活用した 形の ことも ある）。 */
  surface: string;
  index?: FuriganaIndex;
  show: boolean;
}) {
  const popoverId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  /*
   * 置き場所は `WordPopover` が 決める（画面の いちばん外に 出して 置く）。
   * ここで 決めて いた ころは、親の `overflow: hidden` に 切られて 字が 読めなかった。
   */
  const openPopover = () => setOpen(true);

  /**
   * 押したとき。
   *
   * マウスの ある きかいでは **押しても 閉じない**——のせた 時点で もう ひらいて
   * いるので、押すたびに 閉じると「押したのに 消えた」に なる。
   * 閉じるのは マウスが 離れたとき。指の きかいは これまでどおり タップで 開け閉め。
   */
  const toggle = () => {
    if (canHover()) {
      openPopover();
      return;
    }
    setOpen((current) => !current);
  };

  /** マウスの ある きかいだけ、のせただけで ひらく（指の きかいは タップのまま）。 */
  const hoverProps = {
    onMouseEnter: () => {
      if (canHover()) openPopover();
    },
    onMouseLeave: () => {
      if (canHover()) setOpen(false);
    },
  };

  return (
    <span className="relative inline-block" {...hoverProps}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        onFocus={openPopover}
        onBlur={() => setOpen(false)}
        aria-expanded={open}
        aria-controls={popoverId}
        className="decoration-sky cursor-pointer underline decoration-dotted decoration-2 underline-offset-4"
      >
        {/*
          下線を引く語こそ いちばん むずかしい。共通の読み辞書に載っていなくても
          ルビが出るように、**言い切りの 形で 当たった ときは** 辞書の 読みで ルビを 保証する。
          活用した 形（「見つけた」）は 教材の 読み辞書に まかせる——
          ここで 見出し語の 読みを のせると、字と 読みが ずれる。
        */}
        {show && surface === entry.term ? (
          <ruby>
            {entry.term}
            <rt>{entry.reading}</rt>
          </ruby>
        ) : (
          <RubyText text={surface} index={index} show={show} />
        )}
      </button>
      <WordPopover id={popoverId} anchorRef={buttonRef} open={open}>
        <span className="text-navy block">
          {entry.term}
          <span className="text-ink-soft ml-1 font-bold">{entry.reading}</span>
        </span>
        {/* 説明文にも漢字が入る。出典の ことばの 正の 読み辞書でルビを合成する。 */}
        <RubyText className="mt-1 block" text={entry.explanationJa} furigana={entry.furigana} />
        {/* 英語は最後の受け皿。日本語の意味より下に、控えめに置く（設計07 §2.5）。 */}
        <span className="border-hairline text-ink-soft mt-1.5 block border-t pt-1.5 text-[11px] font-semibold">
          {entry.meaningEn}
        </span>
      </WordPopover>
    </span>
  );
}
