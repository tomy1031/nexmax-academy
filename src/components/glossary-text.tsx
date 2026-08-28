"use client";

import {
  useCallback,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { WordPopover } from "@/components/word-popover";
import { findGlossaryTerm, type GlossaryEntry } from "@/content/glossary";
import { PERSONALITY_RESULT_READINGS, type Reading } from "@/content/personality";

/** 漢字を含む語かどうか。含むなら、台帳の読みでルビを保証する。 */
const HAS_KANJI = /[一-鿿]/;

/** 見出し語に 振る ふりがな。かな・カタカナだけの 語には 振らない（同じ文字が2段になる）。 */
function headwordReadings(entry: GlossaryEntry): readonly Reading[] {
  return HAS_KANJI.test(entry.term) ? [{ text: entry.term, reading: entry.reading }] : [];
}

/** 4段（日本語・英語・日本語の意味・英語の意味）ぶんの高さ。上に出せるかの判定に使う。 */
const POPOVER_HEIGHT = 170;

/**
 * マウスを持つ端末か。
 *
 * ホバーで開く／離すと閉じる、はマウスの話。タッチ端末で同じことをすると、
 * タップで mouseenter → click の順に発火して**開いた直後に閉じる**。
 * だから端末を見て、ホバーとタップのどちらか一方だけを使う。
 */
function canHover() {
  return typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches;
}

/** 吹き出しの開閉と置き場所。本文の下線とチップで同じものを使う。 */
function usePopover() {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  /*
   * 置き場所は `WordPopover` が 決める（ページの いちばん外に 出して 置く）。
   * ここで 親の 中に 置いて いた ころは、親の `overflow: hidden` に 切られて
   * 字が 読めない ことが あった（2026-08-28 の 指摘）。
   */
  const show = useCallback(() => setOpen(true), []);

  const hide = useCallback(() => setOpen(false), []);

  /**
   * マウスならホバーで開閉、タッチならタップで開閉、キーボードならフォーカスで開閉。
   * どれか一方しか動かないので、開いた直後に閉じる事故が起きない。
   */
  const handlers = {
    onMouseEnter: () => canHover() && show(),
    onMouseLeave: () => canHover() && hide(),
    onClick: () => {
      if (canHover()) return; // ホバーが担当しているので二重に効かせない
      if (open) hide();
      else show();
    },
    /*
     * フォーカスで開くのは**キーボードのときだけ**（`:focus-visible`）。
     *
     * ただの focus にすると、**タッチ端末の1回目のタップが効かない**。
     * 指でさわると focus → click の順に起きるので、focus が開けたものを
     * 直後の click が「開いているから閉じる」と判断してしまう。
     * 学習者には「1回目は無反応、2回目で出る」と見える
     *（2026-08-23 に学習用サイトへ移植したとき実機幅の検証で再現。願い #180）。
     */
    onFocus: (event: FocusEvent<HTMLButtonElement>) => {
      if (event.currentTarget.matches(":focus-visible")) show();
    },
    onBlur: () => hide(),
  };

  return { anchorRef, open, handlers };
}

/**
 * 吹き出しの中身。**日本語 → 英語 → 日本語の意味 → 英語の意味** の4段（§2.5）。
 *
 * 英語の1語を説明より先に置くのは、まだN4を勉強中の学習者への配慮。
 * やさしい日本語の説明でも読み切れないことがあるので、
 * **対訳で足りる人はそこで設問へ戻れる**ようにする。説明が要る人だけ下の2段を読む。
 */
function PopoverBody({
  entry,
  renderText,
}: {
  entry: GlossaryEntry;
  /** ふりがな合成。**意味の1文にもふりがなを振る**ため、吹き出しの中まで持ってくる。 */
  renderText: (text: string, readings: readonly Reading[]) => ReactNode;
}) {
  return (
    <>
      {/* 1段目: 日本語（読みつき）。読みは**ルビで**出す——見出しだけ読みを横に並べると、
          そこだけ裸の漢字になって規律2の検査に引っかかる（画面でも語形が二重に見える）。 */}
      <span className="text-navy block text-sm">
        {renderText(entry.term, headwordReadings(entry))}
        {entry.kanji && entry.kanji !== entry.term && `（${entry.kanji}）`}
      </span>
      {/* 2段目: 英語（対訳の1語） */}
      <span className="text-sky mt-0.5 block text-[13px]">{entry.englishTerm}</span>
      {/* 3段目: 日本語の意味。**ここにもふりがなを振る**——むずかしい語から逃げてきた先が
          裸の漢字だと、いちばん助けが要る学習者がそこで行き止まりになる（docs/constraints.md）。 */}
      <span className="border-hairline mt-1.5 block border-t pt-1.5">
        {renderText(entry.meaning, PERSONALITY_RESULT_READINGS)}
      </span>
      {/* 4段目: 英語の意味。最後の受け皿なので控えめに置く。 */}
      <span className="text-ink-soft mt-1 block text-[11px] font-semibold">
        {entry.englishMeaning}
      </span>
    </>
  );
}

/** 吹き出しの枠。置き場所は `WordPopover`（ページの いちばん外）が 決める。 */
function Popover({
  id,
  anchorRef,
  open,
  entry,
  renderText,
}: {
  id: string;
  anchorRef: RefObject<HTMLButtonElement | null>;
  open: boolean;
  entry: GlossaryEntry;
  renderText: (text: string, readings: readonly Reading[]) => ReactNode;
}) {
  return (
    <WordPopover id={id} anchorRef={anchorRef} open={open} height={POPOVER_HEIGHT}>
      <PopoverBody entry={entry} renderText={renderText} />
    </WordPopover>
  );
}

/**
 * 語彙メモつきの本文（07 §2.5）。
 *
 * 職場語は平易語に置き換えない（01ガイド R6-1）。かといって ひらがなに開いても、
 * 意味を知らない語は意味ゼロの かたまり になるだけで解決しない。
 * そこで本文は **漢字＋ふりがな** で出し、意味は ホバー／タップで 対訳＋説明 を出す。
 *
 * 英語は本文には出さない。日本語の説明で届かなかったときの非常口として、
 * 吹き出しの中にだけ置く。
 *
 * **1文につき下線は1語だけ**。同じ文で2回タップさせない（§2.5）。
 */
export function GlossaryText({
  text,
  readings,
  renderText,
}: {
  text: string;
  readings: readonly Reading[];
  /** ふりがな合成。呼び出し側の RubyText をそのまま渡す。 */
  renderText: (text: string, readings: readonly Reading[]) => ReactNode;
}) {
  const entry = findGlossaryTerm(text);
  const popoverId = useId();
  const { anchorRef, open, handlers } = usePopover();

  if (!entry) return <>{renderText(text, readings)}</>;

  const at = text.indexOf(entry.term);
  const before = text.slice(0, at);
  const after = text.slice(at + entry.term.length);

  // 下線を引く語こそ一番むずかしい。共通の読み辞書に載っていなくてもルビが出るように、
  // 台帳の読みを先頭に足して渡す（先頭に置くのは RubyText が同位置なら先勝ちのため）。
  const termReadings = HAS_KANJI.test(entry.term)
    ? [{ text: entry.term, reading: entry.reading }, ...readings]
    : readings;

  return (
    <>
      {before && renderText(before, readings)}
      <span className="relative inline-block">
        <button
          ref={anchorRef}
          type="button"
          {...handlers}
          aria-expanded={open}
          aria-controls={popoverId}
          className="decoration-sky cursor-pointer underline decoration-dotted decoration-2 underline-offset-4"
        >
          {renderText(entry.term, termReadings)}
        </button>
        <Popover
          id={popoverId}
          anchorRef={anchorRef}
          open={open}
          entry={entry}
          renderText={renderText}
        />
      </span>
      {after && renderText(after, readings)}
    </>
  );
}

/**
 * 設問カードの下に並べる「ことばメモ」のチップ（07 §2.5）。
 *
 * **なぜ本文の下線と別に要るか**: Ⓐ/Ⓑ の選択肢は `<button>` の中にあり、
 * ボタンを入れ子にできないので下線＋タップが使えない。選択肢に出るむずかしい語は
 * ここでしか支えられない。柱書きの語も一緒に並べて、1か所で引けるようにする。
 *
 * チップには **日本語 / english** を並べて出す。まだN4を勉強中の学習者が、
 * 開かずに見渡して「この語は知っている・知らない」を判断できるようにするため。
 */
export function GlossaryChip({
  entry,
  renderText,
}: {
  entry: GlossaryEntry;
  /** ふりがな合成。手書きの `<ruby>` は使わない（AGENTS.md 規律2）。 */
  renderText: (text: string, readings: readonly Reading[]) => ReactNode;
}) {
  const popoverId = useId();
  const { anchorRef, open, handlers } = usePopover();

  return (
    <span className="relative inline-block">
      <button
        ref={anchorRef}
        type="button"
        {...handlers}
        aria-expanded={open}
        aria-controls={popoverId}
        className="border-hairline text-ink hover:bg-sky-soft cursor-pointer rounded-full border-2 bg-white px-3.5 py-1.5 text-xs leading-snug font-bold"
      >
        {renderText(entry.term, headwordReadings(entry))}
        <span className="text-ink-soft ml-1.5 font-semibold">/ {entry.englishTerm}</span>
      </button>
      <Popover
        id={popoverId}
        anchorRef={anchorRef}
        open={open}
        entry={entry}
        renderText={renderText}
      />
    </span>
  );
}
