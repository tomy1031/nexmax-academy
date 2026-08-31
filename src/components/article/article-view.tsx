"use client";

import Image from "next/image";
import { ZoomableImage } from "@/components/media/zoomable-image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Article, ArticleBlock } from "@/content/schema";
import { NexMax, type NexMaxVariant } from "@/components/nexmax";
import { DictionaryText } from "@/components/dictionary-text";
import { RubyText } from "@/components/ruby-text";
import { VideoPlayer } from "@/components/media/video-player";
import { SpeakButton } from "@/components/speak-button";
import { recordContentProgress } from "@/lib/progress/store";
import type { DictionaryEntry } from "@/lib/dictionary";
import { canHover } from "@/lib/pointer";
import {
  buildFuriganaIndex,
  mergeFuriganaEntries,
  type FuriganaEntry,
  type FuriganaIndex,
} from "@/lib/text/furigana";
import { BannerBlock, CardsBlock, CompareBlock, HeroBlock, MissionsBlock } from "./rich-blocks";
import {
  collectHeadings,
  contentHref,
  contentKindLabel,
  headingId,
  joinItemsForSpeech,
  shouldShowToc,
  type ArticleCharacter,
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
   * 辞書（単語ステージを畳んだもの）。本文の むずかしい ことばに、マウスを のせる
   *（指の きかいは タップ）と説明を出す。
   * 渡さなければ 下線は1つも出ない——辞書が無い環境（プレビューなど）でも本文は読める。
   */
  dictionary,
  /**
   * ステージの枠（ContentFrame）の中に置くとき。自前の外枠と「マップに もどる」を
   * 出さない——戻り先は枠が持つ（教材ごとに戻り先が違うと、学習者は
   * 1本おわるたびに地図まで放り出される）。
   */
  embedded = false,
  /**
   * `characters` ブロックが呼んでいる人物カード（絵と名前）。
   * 渡さなければ しょうかいカードは 名前だけになる——記事が読めなくなるより良い。
   * 取りに行くのはページ側（この部品はデータを取りに行かない）。
   */
  characters,
}: {
  article: Article;
  preview?: boolean;
  dictionary?: readonly DictionaryEntry[];
  embedded?: boolean;
  characters?: readonly ArticleCharacter[];
}) {
  /*
   * 人物の名前の よみも 索引に混ぜる（「藤木」に ふりがなを 出すため）。記事の
   * 読み辞書のほうを あとに置いて 勝たせる——記事が「藤木さん」の読みを 上書きしたい
   * ときに 書けるようにする（単語ステージのカードと同じ組み立て — StageDetail）。
   *
   * **ことばチップの 語も 混ぜる。** チップは 記事が 書いた 文では なく
   * `wordIds` で 借りて きた 語なので、記事の 読み辞書に 無くて 当たり前で ある。
   * 混ぜないと、記事に「会社」だけ あって「会社概要」が 無い とき、チップが
   * 「会社かいしゃ概要」と 割れて **概要が 裸の 漢字で 残る**（2026-08-27 実発生）。
   * ふりがなの 機械検査は「借りた ぶんは 持ち主の 側で 見る」ので、ここは
   * すり抜ける——**画面でしか 出ない 抜け**だった。語の 読みは 語が 持って いる
   * のだから、引くのが 正しい。
   */
  const furigana = useMemo(
    () =>
      buildFuriganaIndex(
        mergeFuriganaEntries(
          (characters ?? []).map((person): FuriganaEntry => [person.name, person.reading]),
          article.blocks.flatMap((block): FuriganaEntry[] =>
            block.kind === "vocab"
              ? (block.items ?? []).map((item): FuriganaEntry => [item.term, item.reading])
              : [],
          ),
          article.furigana ?? [],
        ),
      ),
    [article.blocks, article.furigana, characters],
  );
  const [rubyOn, setRubyOn] = useState(true);
  const headings = useMemo(() => collectHeadings(article.blocks), [article.blocks]);
  /**
   * **表紙（`hero`）が ページの タイトル**（2026-08-28 の 指定
   *「これを目次の前に持ってきて。タイトルにします。その後に目次を入れて」）。
   *
   * ページの `title` と `description` は 表紙に 同じ ことばで 入って いる。
   * 両方 出すと、**同じ タイトルが 続けて 2回**、説明も 2行 出る——
   * 学習者は 1画面 ぶんを 読み直してから 本文に 入る ことに なる。
   * 表紙が ある ページでは、**表紙だけを タイトルに して h1/説明は 出さない**
   *（`title`・`description` は 一覧の 札や 検索の ために データには 残す）。
   */
  const cover = article.blocks[0]?.kind === "hero" ? article.blocks[0] : null;
  /** 本文（表紙は 上に 出したので 除く）。見出しの id を ずらさない ため 位置は 数える。 */
  const bodyBlocks = cover ? article.blocks.slice(1) : article.blocks;
  const bodyOffset = cover ? 1 : 0;
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

  const rubyToggle = (
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
  );

  return (
    <div className={embedded ? "" : "mx-auto w-full max-w-3xl px-4 py-6"}>
      {embedded ? (
        <div className="mb-3 flex justify-end">{rubyToggle}</div>
      ) : (
        <header className="mb-5 flex items-center justify-between gap-3">
          <Link
            prefetch={false}
            href="/map"
            className="text-ink-soft hover:text-navy text-sm font-extrabold"
          >
            ← マップに もどる
          </Link>
          {rubyToggle}
        </header>
      )}

      <article className="card-island p-5 sm:p-7">
        <p className="text-ink-faint text-xs font-extrabold">📄 ページ</p>

        {/*
          **タイトル（表紙）→ 目次 → 本文**（2026-08-28 の 指定）。
          表紙の 無い ページは これまでどおり **目次が 先、h1 が あと**
          （2026-08-27 の 指定「タイトルと目次の順番を 逆にして」）。
        */}
        {cover && (
          <div className="mt-4">
            <HeroBlock
              block={cover}
              furigana={furigana}
              show={rubyOn}
              dictionary={dictionary}
              asTitle
            />
          </div>
        )}

        {shouldShowToc(headings) && (
          <TableOfContents
            articleId={article.id}
            headings={headings}
            furigana={furigana}
            show={rubyOn}
          />
        )}

        {!cover && (
          <>
            <h1 className="text-ink mt-4 text-2xl font-extrabold sm:text-3xl">
              <RubyText text={article.title} index={furigana} show={rubyOn} />
            </h1>
            <p className="text-ink-soft mt-2 leading-relaxed font-bold">
              <RubyText text={article.description} index={furigana} show={rubyOn} />
            </p>
          </>
        )}

        <div className="mt-6 space-y-5">
          {bodyBlocks.map((block, at) => (
            <BlockView
              key={at + bodyOffset}
              block={block}
              blockIndex={at + bodyOffset}
              articleId={article.id}
              furigana={furigana}
              show={rubyOn}
              dictionary={dictionary}
              characters={characters}
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

/**
 * 見出しの ことば。**「もくじ」と ひらがなに 開かない**（2026-08-27 の 指定）。
 * 漢字＋ふりがなの ままに して、N5を こえる 語は 読みで 支える（規律2）。
 */
const TOC_FURIGANA = buildFuriganaIndex([["目次", "もくじ"]]);

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
      aria-label="目次"
      className="border-hairline bg-panel-tint mt-5 rounded-[var(--radius-card)] border-2 p-4"
    >
      <p className="text-ink-soft text-xs font-extrabold">
        <RubyText text="目次" index={TOC_FURIGANA} />
      </p>
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
  characters?: readonly ArticleCharacter[];
}

function BlockView({
  block,
  blockIndex,
  articleId,
  furigana,
  show,
  dictionary,
  characters,
}: BlockProps) {
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
          <DictionaryText text={block.text} index={furigana} show={show} dictionary={dictionary} />
        </h2>
      ) : (
        <h3
          id={headingId(articleId, blockIndex)}
          className="text-ink mt-5 scroll-mt-6 text-lg font-extrabold"
        >
          <span aria-hidden className="text-sky mr-1.5">
            ◆
          </span>
          <DictionaryText text={block.text} index={furigana} show={show} dictionary={dictionary} />
        </h3>
      );

    case "paragraph":
      /*
       * 下線つきの説明を出すのは本文だけ。見出し・かじょうがき・ポイント枠にも出すと、
       * 1画面に下線が何本も並び、「どれを見ればよいか」が伝わらなくなる
       *（1文につき1語という決まりは DictionaryText 側が守る — 設計07 §2.5）。
       */
      return (
        <div className="flex items-start gap-2">
          <p className="text-ink min-w-0 flex-1 leading-loose font-bold">
            <DictionaryText
              text={block.text}
              index={furigana}
              show={show}
              dictionary={dictionary}
            />
          </p>
          {/* 読み上げるのは データのまま（ルビ合成前）の本文。 */}
          <SpeakButton text={block.text} label="この ぶんを よみあげる" />
        </div>
      );

    case "image":
      return <ImageBlock block={block} furigana={furigana} show={show} />;

    case "video":
      return <VideoBlock block={block} furigana={furigana} show={show} dictionary={dictionary} />;

    case "callout":
      return <CalloutBlock block={block} furigana={furigana} show={show} dictionary={dictionary} />;

    case "list":
      return (
        <SpeakableGroup items={block.items ?? []} label="この かじょうがきを ぜんぶ よみあげる">
          <ul className="space-y-2">
            {(block.items ?? []).map((item, i) => (
              <li key={i} className="text-ink flex items-start gap-2 leading-relaxed font-bold">
                <span aria-hidden className="text-sky pt-0.5">
                  ●
                </span>
                <span>
                  <DictionaryText
                    text={item}
                    index={furigana}
                    show={show}
                    dictionary={dictionary}
                  />
                </span>
              </li>
            ))}
          </ul>
        </SpeakableGroup>
      );

    case "steps":
      return (
        <SpeakableGroup items={block.items ?? []} label="この てじゅんを ぜんぶ よみあげる">
          <ol className="space-y-3">
            {(block.items ?? []).map((item, i) => (
              <li key={i} className="flex items-center gap-3">
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
                <StepThumb image={block.images?.[i]} />
                <span className="text-ink leading-relaxed font-bold">
                  <DictionaryText
                    text={item}
                    index={furigana}
                    show={show}
                    dictionary={dictionary}
                  />
                </span>
              </li>
            ))}
          </ol>
        </SpeakableGroup>
      );

    /*
     * **使い方の 説明は 置かない**（2026-08-28 の 指定で「ことば — マウスを のせる…」を 削除）。
     * 押せば 分かる ことを 先に 字で 言う ぶん、読む ものが 増えて いた。
     * ふちどりの ある ふだが すでに「押せる」と 見せて いる。
     */
    case "vocab":
      return (
        <section className="border-hairline bg-panel-tint rounded-[var(--radius-card)] border-2 p-4">
          <div className="flex flex-wrap gap-2">
            {(block.items ?? []).map((item, i) => (
              <VocabChip key={i} item={item} furigana={furigana} show={show} />
            ))}
          </div>
        </section>
      );

    case "link": {
      const label = contentKindLabel(block.type);
      return (
        <Link
          prefetch={false}
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

    case "extlink":
      /*
       * 外のサイトへは **必ず この カード**で行く。本文に URL の文字を 書いても
       * タップできず、「先生が リンクを 出します」が 自宅で 成立しない（改善#24）。
       * 別タブで ひらくのは、読みかけの 教材を 見失わせないため。
       */
      return (
        <a
          href={block.url}
          target="_blank"
          rel="noopener noreferrer"
          className="card-island flex items-center gap-3 p-4"
        >
          <span aria-hidden className="text-2xl">
            🌐
          </span>
          <span className="min-w-0">
            {/* ひとこと（note）で「あたらしい タブで ひらきます」を 言う教材が
                多いので、ここは 見出しだけ 短く出して 同じ文を くり返さない。 */}
            <span className="text-ink-soft block text-xs font-extrabold">そとの サイト</span>
            <span className="text-navy block font-extrabold">
              <RubyText text={block.label} index={furigana} show={show} />
            </span>
            {block.note && (
              <span className="text-ink-soft mt-1 block text-xs font-bold">
                <RubyText text={block.note} index={furigana} show={show} />
              </span>
            )}
          </span>
          <span aria-hidden className="text-sky ml-auto text-xl font-extrabold">
            ↗
          </span>
        </a>
      );

    case "characters":
      return <CharactersBlock block={block} furigana={furigana} show={show} people={characters} />;

    /*
     * 配布資料（会社研究の HTML 4枚）から 移した 大きな 見た目部品。
     * 中身は `./rich-blocks` にある——ここに 置くと この switch が
     * 1画面に 収まらなく なり、目次や 進捗の コードを またいで 直す ことになる。
     */
    case "hero":
      return <HeroBlock block={block} furigana={furigana} show={show} dictionary={dictionary} />;

    case "cards":
      return <CardsBlock block={block} furigana={furigana} show={show} dictionary={dictionary} />;

    case "missions":
      return (
        <MissionsBlock block={block} furigana={furigana} show={show} dictionary={dictionary} />
      );

    case "compare":
      return <CompareBlock block={block} furigana={furigana} show={show} dictionary={dictionary} />;

    case "banner":
      return <BannerBlock block={block} furigana={furigana} show={show} dictionary={dictionary} />;
  }
}

/* ------------------------------------------------------------------ *
 * まとまりの読み上げ・画像スロット・ポイント枠・ことばチップ
 * ------------------------------------------------------------------ */

/**
 * かじょうがき・てじゅんの まとまりに 読み上げを 1つ 付ける。
 *
 * 読めない学習者ほど 音に 逃げたいのに、以前は 本文（paragraph）にしか
 * 🔊 が 無く、**いちばん むずかしい 行に かぎって 音が 無かった**。
 * 項目ごとに ボタンを 置かないのは、5項目で 🔊 が 5個 並ぶと、
 * どれを 押すか 選ぶ手間が 「音に 逃げる」 助けを 打ち消すため。
 * 置き場所は 右下に そろえる（読む列を またがない）。
 */
function SpeakableGroup({
  items,
  label,
  children,
}: {
  items: readonly string[];
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      {children}
      <div className="mt-1 flex justify-end">
        {/* 読み上げるのは データのまま（ルビ合成前）の項目をつないだ文。 */}
        <SpeakButton text={joinItemsForSpeech(items)} label={label} />
      </div>
    </div>
  );
}

/** 絵が まだ 無い わくの ことばの 読み（画面の 読みは 画面が 持つ）。 */
const PLACEHOLDER_FURIGANA = buildFuriganaIndex([
  ["絵", "え"],
  ["入", "はい"],
]);

type ImageBlockData = Extract<ArticleBlock, { kind: "image" }>;
type CalloutBlockData = Extract<ArticleBlock, { kind: "callout" }>;
/* 読み出し後は かならず items が ある（参照は src/lib/content.ts が 埋める）。 */
type VocabItem = NonNullable<Extract<ArticleBlock, { kind: "vocab" }>["items"]>[number];
type CharactersBlockData = Extract<ArticleBlock, { kind: "characters" }>;

/**
 * 登場人物の しょうかいカード。
 *
 * 絵と 名前は 人物カード（`people`）から、立場と ひとことは 記事から引く。
 * 人物カードが 見つからない ときも カードは 出す——**名前が 記事側の `ref` しか
 * 無い**ので id を そのまま 出すが、紹介文は 読める。1人 読み込めなかっただけで
 * 「キャラクター紹介」が 空の ページに なるほうが 困る。
 *
 * 1列（せまい画面）→2列。3列にしないのは、顔が 小さくなりすぎて
 * 「だれの 絵か」が 分からなくなるため。
 */
function CharactersBlock({
  block,
  furigana,
  show,
  people,
}: {
  block: CharactersBlockData;
  furigana: FuriganaIndex;
  show: boolean;
  people?: readonly ArticleCharacter[];
}) {
  const byId = new Map((people ?? []).map((person) => [person.id, person]));
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(block.items ?? []).map((item, i) => {
        const person = byId.get(item.ref);
        return (
          <section
            key={i}
            className="border-hairline bg-panel-tint flex gap-3 rounded-[var(--radius-card)] border-2 p-3"
          >
            <div
              className="relative h-24 w-20 shrink-0 overflow-hidden rounded-[var(--radius-card)]"
              style={{ background: "var(--color-sky-soft)" }}
            >
              {person?.portrait ? (
                <Image
                  src={person.portrait}
                  alt=""
                  fill
                  sizes="80px"
                  className="object-cover object-top"
                />
              ) : (
                /* 絵が まだ 無い人。顔の場所を 空けたまま しるしだけ 置く。 */
                <span
                  aria-hidden
                  className="text-navy grid h-full w-full place-items-center text-2xl"
                >
                  🙂
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-ink-soft text-xs font-extrabold">
                <RubyText text={item.role} index={furigana} show={show} />
              </p>
              <p className="text-navy text-lg font-black">
                <RubyText text={person?.name ?? item.ref} index={furigana} show={show} />
              </p>
              <p className="text-ink mt-1 text-sm leading-relaxed font-bold">
                <RubyText text={item.note} index={furigana} show={show} />
              </p>
            </div>
          </section>
        );
      })}
    </div>
  );
}

/**
 * さし絵。
 *
 * **絵の 下に 文字を 出さない**（2026-08-25 の 指定）。同じ ことを 本文と
 * キャプションで 2回 読ませると、読む 量が 増えるだけで 分かりやすく ならない。
 * `caption` は 消さずに `alt` として 残す——目で 見ない 人には ここしか 手がかりが 無い。
 *
 * 幅も 少し しぼる。画面いっぱいの 絵は「見出し」に 見えてしまい、
 * すぐ 下の 説明と つながらない。
 */
/**
 * 動画（2026-08-29 の 指定）。
 *
 * ## 先に 落とさない
 * `preload="none"`。1本 5〜7MB あるので、ページを 開いた だけで 流れると
 * カンボジアの 教室で 30人ぶんが そのまま 回線に 効く（docs/constraints.md
 *「30人同時アクセスに耐える」）。押した ときに 初めて 落ち始める。
 *
 * ## ことばは 動画の 外に 置く
 * 中の 音と 字には ふりがなを 振れない。だから `note` を **動画の 下に 出す**
 *（絵の `caption` は 出さない 決まりだが、あれは 絵を 見れば 分かる から。
 * 動画は 押すまで 中身が 見えないので、何の 動画かは 字で 言う 必要が ある）。
 */
function VideoBlock({
  block,
  furigana,
  show,
  dictionary,
}: {
  block: Extract<ArticleBlock, { kind: "video" }>;
  furigana: FuriganaIndex;
  show: boolean;
  dictionary?: readonly DictionaryEntry[];
}) {
  return (
    <figure className="mx-auto w-full max-w-[720px]">
      <VideoPlayer
        src={block.src}
        youtube={block.youtube}
        poster={block.poster}
        label={block.caption}
      />
      {block.note ? (
        <figcaption className="text-ink-soft mt-2 text-sm leading-relaxed font-bold">
          <DictionaryText text={block.note} index={furigana} show={show} dictionary={dictionary} />
        </figcaption>
      ) : null}
    </figure>
  );
}

function ImageBlock({
  block,
  furigana,
  show,
}: {
  block: ImageBlockData;
  furigana: FuriganaIndex;
  show: boolean;
}) {
  if (block.status !== "done" || !block.src) {
    /*
     * **何の 絵が 入る ところかを わくの 中に 書く**（2026-08-27 の 指定
     * 「画像が必要な領域を明確に示してください」）。
     *
     * 前は「え は じゅんびちゅう」だけで、**どんな 絵を 作れば よいかが
     * 画面から 読めなかった**。`caption` は もともと「絵の 中身を ことばで
     * 言った もの」なので、そのまま 出せば 作る 人の 指示書に なる。
     */
    return (
      <figure className="mx-auto w-full max-w-[420px]">
        <div
          /* 数えられる しるし（`rich-blocks.tsx` の わくと そろえる）。 */
          data-slot="empty"
          className="text-ink-faint grid h-32 place-items-center rounded-[20px] border-4 border-dashed p-3 text-center text-sm font-extrabold"
          style={{ borderColor: "var(--color-hairline)", background: "var(--color-panel-tint)" }}
        >
          <span>
            <span aria-hidden className="mr-1.5">
              🖼️
            </span>
            {/* ことばは カードの わく（`ImageSlotFrame`）と そろえる。
                同じ「まだ 無い」を 2つの 言い方で 出すと、学習者には
                ちがう ことが 起きて いるように 見える。 */}
            <RubyText text="ここに 絵が 入ります" index={PLACEHOLDER_FURIGANA} />
            {block.caption && (
              <span className="text-ink-soft mt-1 block text-xs leading-snug">
                <RubyText text={block.caption} index={furigana} show={show} />
              </span>
            )}
          </span>
        </div>
      </figure>
    );
  }

  /*
   * 大きさは **絵に よって 変える**（2026-08-30 の 指定「他の要素では小さくないと
   * いけない場合もあるので、この時は大きくするような設定にしてください」）。
   * 既定は これまでどおり 少し しぼる。中に 字の ある 説明の 図だけ `size: "wide"` に して
   * 本文の 幅いっぱいで 出す——1134px の 図を 412px で 出すと、ふりがなが 潰れて 読めない。
   */
  const width = block.size === "wide" ? "max-w-full" : "max-w-[420px]";
  return (
    <figure className={`mx-auto w-full ${width}`}>
      <ZoomableImage label={block.caption}>
        <Image
          src={block.src}
          alt={block.caption ?? ""}
          width={1600}
          height={900}
          unoptimized
          className="h-auto w-full rounded-[20px] border-4 border-white"
          style={{ boxShadow: "0 6px 0 #b8deed" }}
        />
      </ZoomableImage>
    </figure>
  );
}

/**
 * てじゅんの 1歩に そえる 小さな 絵。
 *
 * 番号の 丸と 文の あいだに 置く。**小さく する**のが 肝心で、大きいと
 * 1歩ごとに 画面が 1つ 分 流れ、「順番」という 形が 目で 追えなくなる。
 */
function StepThumb({ image }: { image?: { src?: string; status?: string; caption?: string } }) {
  if (!image || image.status !== "done" || !image.src) return null;
  /*
   * **大きさは 変えない**（並びを 目で 追う ための 80px）。
   * かわりに 押せば 全画面に なる ので、中の 字が 読める。
   */
  return (
    <ZoomableImage label={image.caption} size="small" className="shrink-0">
      <Image
        src={image.src}
        alt=""
        width={480}
        height={480}
        unoptimized
        className="h-20 w-20 rounded-[14px] border-2 border-white object-cover sm:h-24 sm:w-24"
        style={{ boxShadow: "0 3px 0 #b8deed" }}
      />
    </ZoomableImage>
  );
}

const CALLOUT_STYLE: Record<
  CalloutBlockData["tone"],
  { variant: NexMaxVariant; accent: string; label?: string }
> = {
  point: { variant: "book", accent: "#8d6ae8", label: "ここが ポイント" },
  /*
   * `care` は **見出しを 出さない**（2026-08-28 の 指定で「ここに きを つけて」を 削除）。
   * 色と ネクマックスの 顔で もう 伝わって いる ところに ことばを 重ねて いた。
   */
  care: { variant: "cheer", accent: "#f2654a" },
};

function CalloutBlock({
  block,
  furigana,
  show,
  dictionary,
}: {
  block: CalloutBlockData;
  furigana: FuriganaIndex;
  show: boolean;
  dictionary?: readonly DictionaryEntry[];
}) {
  const tone = CALLOUT_STYLE[block.tone];
  return (
    <aside
      className="card-island flex items-start gap-3 p-4"
      style={{ borderColor: tone.accent, boxShadow: `0 6px 0 ${tone.accent}33` }}
    >
      <NexMax variant={tone.variant} size={56} />
      <div className="min-w-0 flex-1">
        {tone.label && (
          <p className="text-xs font-extrabold" style={{ color: tone.accent }}>
            {tone.label}
          </p>
        )}
        <p className="text-ink leading-relaxed font-bold">
          <DictionaryText text={block.text} index={furigana} show={show} dictionary={dictionary} />
        </p>
      </div>
      {/*
        ポイント枠は 1本の文に 教材の 山場が 入る（「他の 会社と 違う…」）。
        本文と 同じく ルビ合成前の 文字列を そのまま 読ませる。
      */}
      <SpeakButton text={block.text} label="この ぶんを よみあげる" />
    </aside>
  );
}

/** 吹き出しの実寸。はみ出し判定に使う（Tailwind の w-60 と合わせる）。 */
const VOCAB_POPOVER_WIDTH = 240;
/** 画面のふちに触れさせない余白。 */
const EDGE_MARGIN = 12;

/**
 * ことばチップ。**マウスを のせる**（指の きかいは タップ）で
 * 語・読み・英語・意味 を出す小さな辞書（2026-08-18 の指定）。
 */
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  /*
   * 左そろえのままだと、行の 右はしの ことばで 吹き出しが 画面の外に 出て
   * 読めない（スマホ375px では 240px の 吹き出しが すぐ はみ出す）。
   * ひらくたびに 置き場所を 決め直す（dictionary-text.tsx と 同じ考え方）。
   */
  const [alignRight, setAlignRight] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  /** ひらく前に 置き場所を 決める（行の 右はしで はみ出さないように）。 */
  const place = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setAlignRight(rect.left + VOCAB_POPOVER_WIDTH > window.innerWidth - EDGE_MARGIN);
  };

  const openChip = () => {
    place();
    setOpen(true);
  };

  /** 押したとき。マウスの ある きかいでは 押しても 閉じない（dictionary-text.tsx と同じ）。 */
  const toggle = () => {
    if (canHover()) {
      openChip();
      return;
    }
    if (!open) place();
    setOpen((v) => !v);
  };

  /** マウスの ある きかいだけ、のせただけで ひらく（指の きかいは タップのまま）。 */
  const hoverProps = {
    onMouseEnter: () => {
      if (canHover()) openChip();
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
        onFocus={openChip}
        onBlur={() => setOpen(false)}
        aria-expanded={open}
        className="bg-panel text-ink rounded-full border-2 px-3 py-1 text-sm font-extrabold"
        style={{ borderColor: "var(--color-grape)" }}
      >
        <RubyText text={item.term} index={furigana} show={show} />
      </button>

      {open && (
        <span
          className={`card-island animate-pop-in absolute top-full z-20 mt-2 block w-60 p-3 text-left ${
            alignRight ? "right-0" : "left-0"
          }`}
        >
          <span className="flex items-start gap-2">
            <span className="min-w-0 flex-1">
              <span className="text-ink block font-extrabold">
                <RubyText text={item.term} index={furigana} show={show} />
              </span>
              {/*
                読みの となりに 英語を 置く。むずかしい語を ひらがなに 開いても
                意味は 伝わらない——漢字＋ふりがな＋英語で 支える（規律2）。
              */}
              <span className="text-ink-soft block text-xs font-bold">
                {item.reading}
                {item.en ? ` — ${item.en}` : ""}
              </span>
            </span>
            <SpeakButton text={item.reading} label="この ことばを よみあげる" />
          </span>
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
