"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Article, ArticleBlock } from "@/content/schema";
import { NexMax, type NexMaxVariant } from "@/components/nexmax";
import { DictionaryText } from "@/components/dictionary-text";
import { RubyText } from "@/components/ruby-text";
import { recordContentProgress } from "@/lib/progress/store";
import type { DictionaryEntry } from "@/lib/dictionary";
import { buildFuriganaIndex, type FuriganaIndex } from "@/lib/text/furigana";
import {
  collectHeadings,
  contentHref,
  contentKindLabel,
  headingId,
  shouldShowToc,
  type HeadingEntry,
} from "./article-blocks";

/**
 * 説明ページ（article）のビューア — ブログ風の読み物（設計07 §5）。
 *
 * データはブロックJSONで、生HTMLは1文字も受け取らない。ふりがなは辞書から
 * その場で合成する（AGENTS.md 規律2）。
 *
 * この部品は article オブジェクトだけを受け取る純粋な表示部品にしておく。
 * /studio のプレビューが同じものを描画するため、ここでデータを取りに行ったり
 * ルーティングの状態を読んだりしない。
 */
export function ArticleView({
  article,
  /**
   * スタジオのプレビュー用。true のあいだは進捗を書かない。
   * 書いてしまうと、先生が ID を1文字打つたびにゴミの進捗レコードが増える。
   */
  preview = false,
  /**
   * 辞書（単語ステージを畳んだもの）。本文の むずかしい ことばに タップで説明を出す。
   * 渡さなければ 下線は1つも出ない——辞書が無い環境（プレビューなど）でも本文は読める。
   */
  dictionary,
}: {
  article: Article;
  preview?: boolean;
  dictionary?: readonly DictionaryEntry[];
}) {
  const furigana = useMemo(() => buildFuriganaIndex(article.furigana ?? []), [article.furigana]);
  const [rubyOn, setRubyOn] = useState(true);
  const headings = useMemo(() => collectHeadings(article.blocks), [article.blocks]);
  const endRef = useRef<HTMLDivElement>(null);

  // 開いた時点で「よみかけ」。completed は上書きされない（store 側の規則）。
  useEffect(() => {
    if (!preview) recordContentProgress(article.id, { status: "started" });
  }, [article.id, preview]);

  // 末尾のしるしが見えたら「おわった」。スクロール位置の計算を自前でやらない。
  useEffect(() => {
    const sentinel = endRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        if (!preview) recordContentProgress(article.id, { status: "completed" });
        observer.disconnect();
      }
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [article.id, preview]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-5 flex items-center justify-between gap-3">
        <Link href="/map" className="text-ink-soft hover:text-navy text-sm font-extrabold">
          ← マップに もどる
        </Link>
        <button
          type="button"
          onClick={() => setRubyOn((on) => !on)}
          aria-pressed={rubyOn}
          className={`rounded-full border-2 px-3 py-1 text-xs font-extrabold ${
            rubyOn ? "bg-sky border-sky text-white" : "border-hairline text-ink-soft bg-panel"
          }`}
        >
          ふりがな {rubyOn ? "ON" : "OFF"}
        </button>
      </header>

      <article className="card-island p-5 sm:p-7">
        <p className="text-ink-faint text-xs font-extrabold">📄 よみもの</p>
        <h1 className="text-ink mt-1 text-2xl font-extrabold sm:text-3xl">
          <RubyText text={article.title} index={furigana} show={rubyOn} />
        </h1>
        <p className="text-ink-soft mt-2 leading-relaxed font-bold">
          <RubyText text={article.description} index={furigana} show={rubyOn} />
        </p>

        {shouldShowToc(headings) && (
          <TableOfContents
            articleId={article.id}
            headings={headings}
            furigana={furigana}
            show={rubyOn}
          />
        )}

        <div className="mt-6 space-y-5">
          {article.blocks.map((block, blockIndex) => (
            <BlockView
              key={blockIndex}
              block={block}
              blockIndex={blockIndex}
              articleId={article.id}
              furigana={furigana}
              show={rubyOn}
              dictionary={dictionary}
            />
          ))}
        </div>

        <p className="text-ink-faint mt-8 text-center text-xs font-extrabold">
          さいごまで よんだね。おつかれさま！
        </p>
        <div ref={endRef} aria-hidden className="h-px" />
      </article>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 目次
 * ------------------------------------------------------------------ */

function TableOfContents({
  articleId,
  headings,
  furigana,
  show,
}: {
  articleId: string;
  headings: readonly HeadingEntry[];
  furigana: FuriganaIndex;
  show: boolean;
}) {
  return (
    <nav
      aria-label="もくじ"
      className="border-hairline bg-panel-tint mt-5 rounded-[var(--radius-card)] border-2 p-4"
    >
      <p className="text-ink-soft text-xs font-extrabold">もくじ</p>
      <ol className="mt-2 space-y-1">
        {headings.map((heading) => (
          <li key={heading.index} className={heading.level === 3 ? "pl-5" : ""}>
            <a
              href={`#${headingId(articleId, heading.index)}`}
              className="text-navy text-sm font-extrabold hover:underline"
            >
              <RubyText text={heading.text} index={furigana} show={show} />
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* ------------------------------------------------------------------ *
 * ブロック
 * ------------------------------------------------------------------ */

interface BlockProps {
  block: ArticleBlock;
  blockIndex: number;
  articleId: string;
  furigana: FuriganaIndex;
  show: boolean;
  dictionary?: readonly DictionaryEntry[];
}

function BlockView({ block, blockIndex, articleId, furigana, show, dictionary }: BlockProps) {
  switch (block.kind) {
    case "heading":
      return block.level === 2 ? (
        <h2
          id={headingId(articleId, blockIndex)}
          className="text-navy mt-8 flex scroll-mt-6 items-center gap-2 text-xl font-extrabold sm:text-2xl"
        >
          <span
            aria-hidden
            className="inline-block h-6 w-2.5 shrink-0 rounded-full"
            style={{ background: "var(--color-sky)" }}
          />
          <RubyText text={block.text} index={furigana} show={show} />
        </h2>
      ) : (
        <h3
          id={headingId(articleId, blockIndex)}
          className="text-ink mt-5 scroll-mt-6 text-lg font-extrabold"
        >
          <span aria-hidden className="text-sky mr-1.5">
            ◆
          </span>
          <RubyText text={block.text} index={furigana} show={show} />
        </h3>
      );

    case "paragraph":
      /*
       * 下線つきの説明を出すのは本文だけ。見出し・かじょうがき・ポイント枠にも出すと、
       * 1画面に下線が何本も並び、「どれを見ればよいか」が伝わらなくなる
       *（1文につき1語という決まりは DictionaryText 側が守る — 設計07 §2.5）。
       */
      return (
        <p className="text-ink leading-loose font-bold">
          <DictionaryText text={block.text} index={furigana} show={show} dictionary={dictionary} />
        </p>
      );

    case "image":
      return <ImageBlock block={block} furigana={furigana} show={show} />;

    case "callout":
      return <CalloutBlock block={block} furigana={furigana} show={show} />;

    case "list":
      return (
        <ul className="space-y-2">
          {block.items.map((item, i) => (
            <li key={i} className="text-ink flex items-start gap-2 leading-relaxed font-bold">
              <span aria-hidden className="text-sky pt-0.5">
                ●
              </span>
              <span>
                <RubyText text={item} index={furigana} show={show} />
              </span>
            </li>
          ))}
        </ul>
      );

    case "steps":
      return (
        <ol className="space-y-3">
          {block.items.map((item, i) => (
            <li key={i} className="flex items-start gap-3">
              <span
                aria-hidden
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-extrabold text-white"
                style={{
                  background: "var(--color-sky)",
                  boxShadow: "0 3px 0 var(--color-sky-deep)",
                }}
              >
                {i + 1}
              </span>
              <span className="text-ink pt-1 leading-relaxed font-bold">
                <RubyText text={item} index={furigana} show={show} />
              </span>
            </li>
          ))}
        </ol>
      );

    case "vocab":
      return (
        <section className="border-hairline bg-panel-tint rounded-[var(--radius-card)] border-2 p-4">
          <p className="text-ink-soft text-xs font-extrabold">
            ことば — タップ すると いみが 出るよ
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {block.items.map((item, i) => (
              <VocabChip key={i} item={item} furigana={furigana} show={show} />
            ))}
          </div>
        </section>
      );

    case "link": {
      const label = contentKindLabel(block.type);
      return (
        <Link
          href={contentHref(block.type, block.ref)}
          className="card-island flex items-center gap-3 p-4"
        >
          <span aria-hidden className="text-2xl">
            {label.emoji}
          </span>
          <span className="min-w-0">
            <span className="text-ink-soft block text-xs font-extrabold">
              つぎは これ — {label.name}
            </span>
            <span className="text-navy block font-extrabold">
              <RubyText text={block.label} index={furigana} show={show} />
            </span>
          </span>
          <span aria-hidden className="text-sky ml-auto text-xl font-extrabold">
            →
          </span>
        </Link>
      );
    }
  }
}

/* ------------------------------------------------------------------ *
 * 画像スロット・ポイント枠・ことばチップ
 * ------------------------------------------------------------------ */

type ImageBlockData = Extract<ArticleBlock, { kind: "image" }>;
type CalloutBlockData = Extract<ArticleBlock, { kind: "callout" }>;
type VocabItem = Extract<ArticleBlock, { kind: "vocab" }>["items"][number];

/** 画像は「まだ無い」状態が普通にある（生成待ち）。空でも読み進められる形にする。 */
function ImageBlock({
  block,
  furigana,
  show,
}: {
  block: ImageBlockData;
  furigana: FuriganaIndex;
  show: boolean;
}) {
  const caption = block.caption ? (
    <figcaption className="text-ink-soft mt-2 text-center text-xs font-bold">
      <RubyText text={block.caption} index={furigana} show={show} />
    </figcaption>
  ) : null;

  if (block.status !== "done" || !block.src) {
    return (
      <figure>
        <div
          className="text-ink-faint grid h-40 place-items-center rounded-[20px] border-4 border-dashed text-sm font-extrabold"
          style={{ borderColor: "var(--color-hairline)", background: "var(--color-panel-tint)" }}
        >
          <span>
            <span aria-hidden className="mr-1.5">
              🖼️
            </span>
            え は じゅんびちゅう
          </span>
        </div>
        {caption}
      </figure>
    );
  }

  return (
    <figure>
      <Image
        src={block.src}
        alt={block.caption ?? ""}
        width={1200}
        height={675}
        unoptimized
        className="h-auto w-full rounded-[20px] border-4 border-white"
        style={{ boxShadow: "0 6px 0 #b8deed" }}
      />
      {caption}
    </figure>
  );
}

const CALLOUT_STYLE: Record<
  CalloutBlockData["tone"],
  { variant: NexMaxVariant; accent: string; label: string }
> = {
  point: { variant: "book", accent: "#8d6ae8", label: "ここが ポイント" },
  care: { variant: "cheer", accent: "#f2654a", label: "ここに きを つけて" },
};

function CalloutBlock({
  block,
  furigana,
  show,
}: {
  block: CalloutBlockData;
  furigana: FuriganaIndex;
  show: boolean;
}) {
  const tone = CALLOUT_STYLE[block.tone];
  return (
    <aside
      className="card-island flex items-start gap-3 p-4"
      style={{ borderColor: tone.accent, boxShadow: `0 6px 0 ${tone.accent}33` }}
    >
      <NexMax variant={tone.variant} size={56} />
      <div className="min-w-0">
        <p className="text-xs font-extrabold" style={{ color: tone.accent }}>
          {tone.label}
        </p>
        <p className="text-ink mt-1 leading-relaxed font-bold">
          <RubyText text={block.text} index={furigana} show={show} />
        </p>
      </div>
    </aside>
  );
}

/** ことばチップ。タップで 語・読み・意味 を出す小さな辞書。 */
function VocabChip({
  item,
  furigana,
  show,
}: {
  item: VocabItem;
  furigana: FuriganaIndex;
  show: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="bg-panel text-ink rounded-full border-2 px-3 py-1 text-sm font-extrabold"
        style={{ borderColor: "var(--color-grape)" }}
      >
        <RubyText text={item.term} index={furigana} show={show} />
      </button>

      {open && (
        <span className="card-island animate-pop-in absolute top-full left-0 z-20 mt-2 block w-60 p-3 text-left">
          <span className="text-ink block font-extrabold">
            <RubyText text={item.term} index={furigana} show={show} />
          </span>
          <span className="text-ink-soft block text-xs font-bold">{item.reading}</span>
          <span className="text-ink mt-1 block text-sm leading-relaxed font-bold">
            <RubyText text={item.meaning} index={furigana} show={show} />
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-sky mt-2 text-xs font-extrabold"
          >
            とじる
          </button>
        </span>
      )}
    </span>
  );
}
