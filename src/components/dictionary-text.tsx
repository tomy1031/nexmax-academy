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
 * 辞書は単語ステージを畳んだもの（src/lib/dictionary.ts）。新しい保存先は無い。
 *
 * **1文につき下線は1語だけ**（設計07 §2.5）。同じ文で2回タップさせない。
 * この決まりは `findDictionaryTerm` が「最初の1つしか返さない」ことで守られている。
 *
 * 性格診断まわりの `GlossaryText` と役割は似ているが、引く先が違う
 *（あちらは診断専用の固定台帳、こちらは教材の単語ステージ）。引き当ての規則も
 * 「配列順に先勝ち」と「最長一致」で違うので、まとめると片方の当たり方が変わる。
 */

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
  const found = dictionary && dictionary.length > 0 ? findDictionaryTerm(text, dictionary) : null;
  const popoverId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  if (!found) {
    return <RubyText text={text} index={index} show={show} className={className} />;
  }

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

  const { entry, at } = found;
  const before = text.slice(0, at);
  const after = text.slice(at + entry.term.length);

  return (
    <span className={className}>
      {before ? <RubyText text={before} index={index} show={show} /> : null}
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
            ルビが出るように、辞書の読みでこの語だけルビを保証する。
          */}
          {show ? (
            <ruby>
              {entry.term}
              <rt>{entry.reading}</rt>
            </ruby>
          ) : (
            entry.term
          )}
        </button>
        <WordPopover id={popoverId} anchorRef={buttonRef} open={open}>
          <span className="text-navy block">
            {entry.term}
            <span className="text-ink-soft ml-1 font-bold">{entry.reading}</span>
          </span>
          {/* 説明文にも漢字が入る。出典の単語ステージの読み辞書でルビを合成する。 */}
          <RubyText className="mt-1 block" text={entry.explanationJa} furigana={entry.furigana} />
          {/* 英語は最後の受け皿。日本語の意味より下に、控えめに置く（設計07 §2.5）。 */}
          <span className="border-hairline text-ink-soft mt-1.5 block border-t pt-1.5 text-[11px] font-semibold">
            {entry.meaningEn}
          </span>
        </WordPopover>
      </span>
      {after ? <RubyText text={after} index={index} show={show} /> : null}
    </span>
  );
}
