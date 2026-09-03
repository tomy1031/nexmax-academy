"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { RubyText } from "@/components/ruby-text";
import { WordPopover } from "@/components/word-popover";
import { findDictionaryTerms, type DictionaryEntry } from "@/lib/dictionary";
import { useLearnerDictionary } from "@/lib/dictionary-store";
import { canHover } from "@/lib/pointer";
import { rubyInnerPositions, type FuriganaIndex } from "@/lib/text/furigana";

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
 * ## **当たった ことば ぜんぶ**に つける（2026-08-31 に 決まりを 書きかえた）
 * もとの 決まりは「1文につき 下線は 1語だけ」だった（設計07 §2.5）。
 * まず 実装が 段落を まるごと 1つと 見て いた ので、3文 入った 段落でも
 * **下線は 1つ**しか 付かなかった（2026-08-28 の 指摘）。そこで 文に 分けた。
 *
 * それでも 足りなかった。むずかしい 語は **1文の 中に かたまって** 出る——
 *「観光DXで、カンボジアの 町の 物語を 動画に したいです。」で 引けるのは 1語だけ。
 * 辞書に 載って いるのに 引けない 語が 残る（2026-08-31 の 指摘
 *「辞書が 足りて いません。DX・物語・動画・チャットボット」）。
 *
 * いまは **当たった ところ ぜんぶ**に つける。文に 分ける 必要も 無く なった。
 *
 * ## 診断の `GlossaryText` は 1文1語の まま
 * 役割は 似て いるが 引く先が ちがう（あちらは 診断専用の 固定台帳、こちらは ことばの 正）。
 * それに あちらは 選択肢が `<button>` で 下線を 置けず、代わりに「ことばメモ」の 帯が
 * 語を ぜんぶ 並べる（設計07 §3.0.1）ので、下線を 増やす 必要が ない。
 * 引き当ての 規則が ちがうので、まとめると 片方の 当たり方が 変わる。
 */

export function DictionaryText({
  text,
  index,
  show = true,
  className,
}: {
  text: string;
  index?: FuriganaIndex;
  show?: boolean;
  className?: string;
}) {
  /*
   * 辞書は **ブラウザが 取りに 行く**（`src/lib/dictionary-store.ts`）。
   * ページの props で 受け取って いた ころは、辞書 701語が 画面ごとに 積み荷へ
   * 入り、作りおき 1件が 1.5MB に なって いた（同じ 読みもので 渡さない 経路は 32KB）。
   * 取れるまでは 空なので、下線は 出ないが **本文は そのまま 読める**。
   */
  const dictionary = useLearnerDictionary();
  /* ルビの ついた ことばの 途中では 切らない（切ると 片側が 裸の 漢字に なる）。 */
  const noCut = index ? rubyInnerPositions(text, index) : undefined;
  const matches = dictionary.length ? findDictionaryTerms(text, dictionary, noCut) : [];
  if (matches.length === 0) {
    return <RubyText text={text} index={index} show={show} className={className} />;
  }

  /* 当たった ところを 押せる ことばに し、あいだの 地の文は ルビだけ 付ける。 */
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const { entry, at, length } of matches) {
    if (at > cursor) {
      parts.push(
        <RubyText
          key={`plain-${cursor}`}
          text={text.slice(cursor, at)}
          index={index}
          show={show}
        />,
      );
    }
    parts.push(
      <DictionaryWord
        key={`word-${at}`}
        entry={entry}
        surface={text.slice(at, at + length)}
        index={index}
        show={show}
      />,
    );
    cursor = at + length;
  }
  if (cursor < text.length) {
    parts.push(
      <RubyText key={`plain-${cursor}`} text={text.slice(cursor)} index={index} show={show} />,
    );
  }

  return <span className={className}>{parts}</span>;
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
