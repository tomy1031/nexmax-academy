"use client";

import Image from "next/image";
import type { ArticleBlock } from "@/content/schema";
import { DictionaryText } from "@/components/dictionary-text";
import { RubyText } from "@/components/ruby-text";
import { SpeakButton } from "@/components/speak-button";
import type { DictionaryEntry } from "@/lib/dictionary";
import { buildFuriganaIndex, type FuriganaIndex } from "@/lib/text/furigana";
import { joinItemsForSpeech } from "./article-blocks";

/**
 * ページの 大きな 見た目部品（表紙・カード・調べる ことの 一覧・くらべ・帯）
 *
 * ## なぜ `article-view.tsx` と 分けたか
 * あちらは 760行あり、`BlockView` の switch が 1画面に 収まらなく なって いた。
 * ここに 置く 5つは **どれも 中で 完結する**（親の 状態を 読まない・進捗を 書かない）ので、
 * 切り出しても 動きは 変わらない。逆に 混ぜたままだと、表紙を 1行 直すのに
 * 目次と 進捗の コードを またぐ ことに なる。
 *
 * ## 共通の 決めごと
 * - **生HTMLは 受け取らない。** ふりがなは `RubyText` が その場で 合成する（規律2）。
 * - **絵が まだ 無い ところは 空けずに「ここに 絵が 入ります」を 出す**
 *   （`ImageSlotFrame`）。空だと 作り忘れが 画面から 見えない。
 * - 読み上げ（🔊）は **まとまりに 1つ**。カード 5枚に 5個 並べると、
 *   どれを 押すか 選ぶ 手間が「音に 逃げる」助けを 打ち消す（`SpeakableGroup` と同じ判断）。
 */

type HeroBlockData = Extract<ArticleBlock, { kind: "hero" }>;
type CardsBlockData = Extract<ArticleBlock, { kind: "cards" }>;
type MissionsBlockData = Extract<ArticleBlock, { kind: "missions" }>;
type CompareBlockData = Extract<ArticleBlock, { kind: "compare" }>;
type BannerBlockData = Extract<ArticleBlock, { kind: "banner" }>;

interface Common {
  furigana: FuriganaIndex;
  show: boolean;
}

/** 絵のスロット。`status` が done でなければ「ここに 絵が 入ります」の わくを 出す。 */
type Slot = { src?: string; status?: string; prompt?: string };

/**
 * 「ここに 絵が 入ります」の わくに 出す ことばの 読み。
 *
 * **画面の 読みは 画面が 持つ**（教材の 読み辞書とは 混ぜない — docs/constraints.md
 * 2026-08-21）。ここを 素の 字で 出して いた あいだ、`furigana.spec.ts` の
 * 「ルビの 外に 裸の 漢字が 無い」が わくの ぶんだけ 落ちた。
 */
const FRAME_FURIGANA = buildFuriganaIndex([
  ["絵", "え"],
  ["入", "はい"],
]);

/** 部品じたいの 文言の 読み（教材の 読み辞書とは 混ぜない — 画面の 読みは 画面が 持つ）。 */
const UI_FURIGANA = buildFuriganaIndex([["見", "み"]]);

/* ------------------------------------------------------------------ *
 * 絵のわく
 * ------------------------------------------------------------------ */

/**
 * 絵。**まだ 無い ときは 点線の わく**を 出す。
 *
 * ここを `null` に して いた 時期は、絵の 無い カードが ただの 短い カードに 見え、
 * **足りて いない ことが 誰にも 分からなかった**。作る 場所は 画面に 出す。
 * `alt` の ことばは そのまま わくの 中にも 出す——何の 絵を 入れる ところかが、
 * 先生にも 作る 人にも 読める（画像は あとから 差しかえる 建てつけ）。
 */
export function ImageSlotFrame({
  slot,
  alt,
  className,
  ratio = "h-40",
  furigana,
  show,
}: {
  slot?: Slot;
  /** 何の 絵かを ことばで。わくの 中にも 出す。 */
  alt?: string;
  className?: string;
  /** わくの 高さ（Tailwind の class）。 */
  ratio?: string;
  /** わくの 中に 出す `alt` の 読み（教材の 読み辞書）。 */
  furigana?: FuriganaIndex;
  show?: boolean;
}) {
  if (slot?.status === "done" && slot.src) {
    return (
      <Image
        src={slot.src}
        alt={alt ?? ""}
        width={1200}
        height={675}
        unoptimized
        className={className ?? `w-full ${ratio} rounded-[18px] object-cover`}
      />
    );
  }
  return (
    <div
      /*
       * **まだ 無い 絵の 数を 機械で 数えられる ように する。**
       * 画面の ことばで 数えると、ルビが 語の 中に 入って いる ので
       * 数え方が 見た目に 引きずられる（`toshi.spec.ts` で 実際に つまずいた）。
       */
      data-slot="empty"
      className={`text-ink-faint grid ${ratio} place-items-center rounded-[18px] border-4 border-dashed p-3 text-center`}
      style={{ borderColor: "var(--color-hairline)", background: "var(--color-panel-tint)" }}
    >
      <span className="text-xs font-extrabold">
        <span aria-hidden className="mr-1 text-lg">
          🖼️
        </span>
        <span className="block">
          <RubyText text="ここに 絵が 入ります" index={FRAME_FURIGANA} />
        </span>
        {alt && (
          <span className="text-ink-soft mt-1 block leading-snug">
            <RubyText text={alt} index={furigana} show={show} />
          </span>
        )}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 表紙
 * ------------------------------------------------------------------ */

/**
 * 表紙。ページの いちばん 上に 1つ。
 *
 * 左に ことば・右に 絵。せまい 画面では 縦に 積む——横に 並べたままだと
 * 390px で 題が 2文字ずつ 折り返す（実機幅で 撮って 見つかった 崩れ）。
 */
export function HeroBlock({
  block,
  furigana,
  show,
  dictionary,
  asTitle = false,
}: {
  block: HeroBlockData;
  dictionary?: readonly DictionaryEntry[];
  /**
   * この 表紙が **ページの タイトル**か（2026-08-28）。
   * ページの いちばん上に 出す ときだけ true——見出しの 段は 1ページに 1つの h1 から
   * 始まる 決まりで、ここを h2 の ままに すると **h1 の 無い ページ**に なる
   *（読み上げソフトは 見出しの 段を たどって 目次を 作る）。
   */
  asTitle?: boolean;
} & Common) {
  const Title = asTitle ? "h1" : "h2";
  return (
    <section
      className="border-hairline overflow-hidden rounded-[26px] border-2 p-5 sm:p-7"
      style={{
        background:
          "linear-gradient(135deg, var(--color-panel) 0%, var(--color-panel-tint) 56%, var(--color-cream) 100%)",
        boxShadow: "0 8px 0 #dcebf5",
      }}
    >
      <div className="grid items-center gap-5 sm:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0">
          {block.eyebrow && (
            <span className="bg-sky-soft text-navy inline-flex rounded-full px-3 py-1 text-xs font-extrabold">
              <RubyText text={block.eyebrow} index={furigana} show={show} />
            </span>
          )}
          <Title className="text-navy mt-2 text-2xl leading-tight font-black sm:text-4xl">
            <RubyText text={block.title} index={furigana} show={show} />
          </Title>
          {block.lead && (
            <p className="text-ink mt-3 leading-relaxed font-extrabold sm:text-lg">
              <DictionaryText
                text={block.lead}
                index={furigana}
                show={show}
                dictionary={dictionary}
              />
            </p>
          )}
          {block.note && (
            <p className="text-ink-soft mt-2 text-sm leading-relaxed font-bold">
              <DictionaryText
                text={block.note}
                index={furigana}
                show={show}
                dictionary={dictionary}
              />
            </p>
          )}
          <div className="mt-3 flex">
            {/* 読み上げは 表紙まるごと 1回（題→リード→ひとこと）。 */}
            <SpeakButton
              text={joinItemsForSpeech([block.title, block.lead ?? "", block.note ?? ""])}
              label="この ページの はじめを よみあげる"
            />
          </div>
        </div>
        <ImageSlotFrame
          slot={block.image}
          alt={block.title}
          ratio="h-40 sm:h-48"
          furigana={furigana}
          show={show}
        />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * カードの ならび
 * ------------------------------------------------------------------ */

const CARD_COLUMNS: Record<number, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
  5: "sm:grid-cols-2 lg:grid-cols-5",
};

/** `tone: "step"` の 番号の 札の 色。5枚めまでは 別の 色に して、目で 追えるように する。 */
const STEP_COLORS = [
  "var(--color-sky)",
  "var(--color-leaf)",
  "var(--color-sun-deep)",
  "var(--color-grape)",
  "var(--color-navy)",
] as const;

export function CardsBlock({
  block,
  furigana,
  show,
  dictionary,
}: { block: CardsBlockData; dictionary?: readonly DictionaryEntry[] } & Common) {
  const columns =
    CARD_COLUMNS[block.columns ?? Math.min(block.items.length, 3)] ?? "sm:grid-cols-3";
  const dark = block.tone === "dark";
  const speech = joinItemsForSpeech(
    block.items.flatMap((item) => [item.title, item.text ?? "", ...(item.items ?? [])]),
  );

  const grid = (
    <div className={`grid gap-3 ${columns}`}>
      {block.items.map((item, i) => (
        <article
          key={i}
          className={
            dark
              ? "rounded-[18px] border-2 p-4"
              : "border-hairline bg-panel flex flex-col overflow-hidden rounded-[18px] border-2"
          }
          style={
            dark
              ? { background: "rgba(255,255,255,.08)", borderColor: "rgba(255,255,255,.18)" }
              : { boxShadow: "0 5px 0 #e6f2f9" }
          }
        >
          {/* 絵は カードの 上。`dark` の 中には 絵を 置かない（帯が 割れて 読めなくなる） */}
          {!dark && (item.image || block.tone === "step") && (
            <ImageSlotFrame
              slot={item.image}
              alt={item.title}
              /*
                絵の 高さ。h-28（112px）では **人の 顔が 切れて** 何の 場面かが
                分からなかった（2026-08-28 の 指定「イラストの縦幅が短すぎる」）。
                横は カードの はば いっぱいなので、`object-cover` で 上下が 削られる——
                その 削れる ぶんを 減らす。
              */
              ratio="h-44 sm:h-48"
              className="h-44 w-full object-cover sm:h-48"
              furigana={furigana}
              show={show}
            />
          )}
          <div className={dark ? "text-center" : "flex flex-col gap-1.5 p-4"}>
            {(item.label || block.tone === "step") && (
              <span
                className="inline-flex w-max rounded-full px-2.5 py-0.5 text-xs font-black tracking-wider text-white"
                style={{ background: STEP_COLORS[i % STEP_COLORS.length] }}
              >
                <RubyText text={item.label ?? `STEP ${i + 1}`} index={furigana} show={show} />
              </span>
            )}
            {item.icon && (
              <span aria-hidden className={dark ? "block text-3xl" : "text-3xl"}>
                {item.icon}
              </span>
            )}
            <h3
              className={
                dark ? "mt-1 font-extrabold text-white" : "text-navy leading-snug font-extrabold"
              }
            >
              <RubyText text={item.title} index={furigana} show={show} />
            </h3>
            {item.text && (
              <p
                className={
                  dark
                    ? "mt-1 text-sm leading-relaxed font-bold"
                    : "text-ink-soft text-sm leading-relaxed font-bold"
                }
                style={dark ? { color: "#dfeaf4" } : undefined}
              >
                {dark ? (
                  <RubyText text={item.text} index={furigana} show={show} />
                ) : (
                  <DictionaryText
                    text={item.text}
                    index={furigana}
                    show={show}
                    dictionary={dictionary}
                  />
                )}
              </p>
            )}
            {item.items && item.items.length > 0 && (
              <ul className="mt-1 space-y-1">
                {item.items.map((line, j) => (
                  <li
                    key={j}
                    className={
                      dark
                        ? "flex items-start gap-1.5 text-sm font-bold text-white"
                        : "text-ink flex items-start gap-1.5 text-sm leading-relaxed font-bold"
                    }
                  >
                    <span aria-hidden className="text-sky pt-0.5">
                      ●
                    </span>
                    <span>
                      <RubyText text={line} index={furigana} show={show} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>
      ))}
    </div>
  );

  return (
    <div>
      {dark ? (
        <div
          className="rounded-[24px] p-4 sm:p-6"
          style={{ background: "var(--color-ink)", boxShadow: "0 8px 0 #16293c" }}
        >
          {grid}
        </div>
      ) : (
        grid
      )}
      <div className="mt-1 flex justify-end">
        <SpeakButton text={speech} label="この カードを ぜんぶ よみあげる" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 調べる ことの 一覧
 * ------------------------------------------------------------------ */

/**
 * 調べる ことの 一覧。
 *
 * ヒントは `<details>` で **押すと 開く**。開きっぱなしに しないのは、
 * 答えに 近い 文を いつも 見せると 調べる 練習に ならない ため——
 * けれど 閉じて いる ことが 分かる 見た目に する（三角と「ヒントを 見る」の 文字）。
 * 詰まった 学習者が 助けを 見つけられない ほうが、ずっと まずい。
 */
export function MissionsBlock({
  block,
  furigana,
  show,
  dictionary,
}: { block: MissionsBlockData; dictionary?: readonly DictionaryEntry[] } & Common) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {block.items.map((item, i) => (
        <article
          key={i}
          className="border-hairline bg-panel flex flex-col rounded-[18px] border-2 p-4"
          style={
            item.focus
              ? { borderColor: "var(--color-sun-deep)", boxShadow: "0 5px 0 #ffe6ac" }
              : { boxShadow: "0 5px 0 #e6f2f9" }
          }
        >
          <div className="flex items-start gap-2.5">
            <span
              aria-hidden
              className="grid h-8 w-8 shrink-0 place-items-center rounded-[12px] text-sm font-black text-white"
              style={{
                background: item.focus ? "var(--color-sun-deep)" : "var(--color-sky)",
              }}
            >
              {item.badge ?? i + 1}
            </span>
            <h3 className="text-navy leading-snug font-extrabold">
              <RubyText text={item.title} index={furigana} show={show} />
            </h3>
            {/* 絵は 右上に 小さく。大きいと 1枚ごとに 画面が 1つ 分 流れ、
                「7つ ある」という 形が 目で 追えなくなる（StepThumb と同じ判断）。 */}
            {item.image && (
              <ImageSlotFrame
                slot={item.image}
                alt={item.title}
                ratio="h-16"
                className="h-16 w-20 shrink-0 rounded-[12px] border-2 border-white object-cover"
                furigana={furigana}
                show={show}
              />
            )}
          </div>

          {item.where && (
            <p className="bg-sky-soft text-navy mt-3 inline-flex w-max rounded-full px-2.5 py-1 text-xs font-extrabold">
              <span aria-hidden className="mr-1">
                🔎
              </span>
              <RubyText text={item.where} index={furigana} show={show} />
            </p>
          )}

          <ul className="mt-2 space-y-1">
            {item.points.map((point, j) => (
              <li
                key={j}
                className="text-ink flex items-start gap-1.5 text-sm leading-relaxed font-bold"
              >
                <span aria-hidden className="text-leaf pt-0.5">
                  ✓
                </span>
                <span>
                  <RubyText text={point} index={furigana} show={show} />
                </span>
              </li>
            ))}
          </ul>

          {/* ひとことと ヒントは 地の文＝**辞書の 下線を 出す ところ**。
              題や 見つける ことの 一覧には 出さない（下線が 何本も 並ぶと
              どれを 見れば よいか 伝わらない — article-view の 決めごと）。 */}
          {item.note && (
            <p className="text-ink-soft mt-2 text-xs leading-relaxed font-bold">
              <DictionaryText
                text={item.note}
                index={furigana}
                show={show}
                dictionary={dictionary}
              />
            </p>
          )}

          {item.hint && (
            <details className="border-hairline bg-panel-tint mt-3 rounded-[14px] border-2 px-3 py-2">
              <summary className="text-navy cursor-pointer text-xs font-extrabold">
                💡 <RubyText text="ヒントを 見る" index={UI_FURIGANA} />
              </summary>
              <p className="text-ink mt-2 text-sm leading-relaxed font-bold">
                <DictionaryText
                  text={item.hint}
                  index={furigana}
                  show={show}
                  dictionary={dictionary}
                />
              </p>
            </details>
          )}

          <div className="mt-2 flex justify-end">
            <SpeakButton
              text={joinItemsForSpeech([item.title, ...item.points])}
              label="この しらべる ことを よみあげる"
            />
          </div>
        </article>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * まえと あとの くらべ
 * ------------------------------------------------------------------ */

export function CompareBlock({
  block,
  furigana,
  show,
  dictionary,
}: { block: CompareBlockData; dictionary?: readonly DictionaryEntry[] } & Common) {
  const side = (
    data: CompareBlockData["before"],
    tone: { border: string; shadow: string; chip: string; mark: string },
  ) => (
    <article
      className="bg-panel flex-1 rounded-[18px] border-2 p-4"
      style={{ borderColor: tone.border, boxShadow: `0 5px 0 ${tone.shadow}` }}
    >
      <p
        className="inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold text-white"
        style={{ background: tone.chip }}
      >
        <span aria-hidden className="mr-1">
          {tone.mark}
        </span>
        <RubyText text={data.title} index={furigana} show={show} />
      </p>
      <div className="mt-2 space-y-1.5">
        {data.lines.map((line, i) => (
          <p key={i} className="text-ink text-sm leading-relaxed font-bold">
            <DictionaryText text={line} index={furigana} show={show} dictionary={dictionary} />
          </p>
        ))}
      </div>
    </article>
  );

  return (
    <div>
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        {side(block.before, {
          border: "var(--color-hairline)",
          shadow: "#e6f2f9",
          chip: "var(--color-ink-faint)",
          mark: "✓",
        })}
        <span aria-hidden className="text-sky self-center text-2xl font-black sm:px-1">
          <span className="sm:hidden">↓</span>
          <span className="hidden sm:inline">→</span>
        </span>
        {side(block.after, {
          border: "var(--color-sky)",
          shadow: "#bfe4f5",
          chip: "var(--color-sky)",
          mark: "➡",
        })}
      </div>
      <div className="mt-1 flex justify-end">
        <SpeakButton
          text={joinItemsForSpeech([
            block.before.title,
            ...block.before.lines,
            block.after.title,
            ...block.after.lines,
          ])}
          label="この くらべを よみあげる"
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 帯
 * ------------------------------------------------------------------ */

const BANNER_STYLE: Record<
  BannerBlockData["tone"],
  { background: string; border: string; shadow: string; title: string; body: string }
> = {
  /** 目あて。あたたかい 色で「ここを 目ざす」と 分かるように する。 */
  goal: {
    background: "linear-gradient(135deg, #fffaf0 0%, #fff2d8 100%)",
    border: "var(--color-sun-deep)",
    shadow: "#ffe6ac",
    title: "var(--color-navy)",
    body: "var(--color-ink)",
  },
  /** 大切な こと。読みものの 山場。 */
  message: {
    background: "linear-gradient(135deg, #f2ecff 0%, #e6f2fb 100%)",
    border: "var(--color-grape)",
    shadow: "#ddd2fb",
    title: "var(--color-navy)",
    body: "var(--color-ink)",
  },
  /** 引用のように 見せる（だれかの ことば）。 */
  quote: {
    background: "var(--color-panel)",
    border: "var(--color-hairline)",
    shadow: "#e6f2f9",
    title: "var(--color-ink-soft)",
    body: "var(--color-ink)",
  },
};

export function BannerBlock({
  block,
  furigana,
  show,
  dictionary,
}: { block: BannerBlockData; dictionary?: readonly DictionaryEntry[] } & Common) {
  const tone = BANNER_STYLE[block.tone];
  return (
    <aside
      className="rounded-[22px] border-2 p-5"
      style={{
        background: tone.background,
        borderColor: tone.border,
        boxShadow: `0 6px 0 ${tone.shadow}`,
      }}
    >
      <div className="flex items-start gap-3">
        {block.icon && (
          <span aria-hidden className="text-3xl">
            {block.icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          {block.title && (
            <h3 className="text-lg font-black" style={{ color: tone.title }}>
              <RubyText text={block.title} index={furigana} show={show} />
            </h3>
          )}
          <p className="mt-1 leading-relaxed font-bold" style={{ color: tone.body }}>
            <DictionaryText
              text={block.text}
              index={furigana}
              show={show}
              dictionary={dictionary}
            />
          </p>
          {block.badges && block.badges.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {block.badges.map((badge, i) => (
                <span
                  key={i}
                  className="bg-panel border-hairline text-ink rounded-full border-2 px-3 py-1 text-xs font-extrabold"
                >
                  <RubyText text={badge} index={furigana} show={show} />
                </span>
              ))}
            </div>
          )}
        </div>
        <SpeakButton text={block.text} label="この ぶんを よみあげる" />
      </div>
    </aside>
  );
}
