"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import type { Manga, MangaLine, MangaPanel } from "@/content/schema";
import { NexMax } from "@/components/nexmax";
import { RubyText } from "@/components/ruby-text";
import { CelebrationBurst } from "@/components/quiz/celebration";
import { buildFuriganaIndex, type FuriganaIndex } from "@/lib/text/furigana";
import { readContentProgress, recordContentProgress } from "@/lib/progress/store";

/**
 * まんが — 横スライドで1コマずつ読む
 *
 * 縦にぜんぶ並べる作りをやめた。並べると、学習者は絵を流し見して
 * セリフを読まないまま下まで行ける。1コマずつ出せば、
 * **次へ進むのに1回タップが要る**ので、そのコマを読んだことになる。
 *
 * ## セリフは「絵の中」と「絵の下」の両方に出す
 * `speechInImage: true` の教材は、絵の吹き出しにも文字が焼いてある（まんがとして
 * 読めるように）。それでも**下のセリフは消さない**。焼いた字はふりがなを持てず
 *（画像生成のルビは崩れる）、語彙ポップアップも読み上げも効かないので、
 * 規律2（読めない漢字で学習者を止めない）を守るのは下のテキストの役目である。
 * つまり `speechInImage` は「絵に焼くかどうか」だけを意味する。
 *
 * 進捗はコマ単位。見たいちばん先のコマを しおり に残し、最後まで行ったら「よみおわり」。
 */

/** 話者チップの色。characters の並び順で配る（テーマのアクセント）。 */
const SPEAKER_ACCENTS = [
  "var(--color-sky)",
  "var(--color-leaf)",
  "var(--color-sun-deep)",
  "var(--color-coral-deep)",
  "var(--color-grape-deep)",
] as const;

const NARRATION_ACCENT = "var(--color-ink-soft)";

interface Speaker {
  name: string;
  role?: string;
  accent: string;
}

/** コマ1つぶん（どのページの何コマ目かも持つ）。 */
interface Slide {
  panel: MangaPanel;
  pageIndex: number;
  panelIndex: number;
  /** そのページの最初のコマか（場面カードと補足をここで出す）。 */
  firstOfPage: boolean;
}

export function MangaSlides({ manga, embedded }: { manga: Manga; embedded: boolean }) {
  const furigana = useMemo(() => buildFuriganaIndex(manga.furigana ?? []), [manga.furigana]);
  const [furiganaOn, setFuriganaOn] = useState(true);

  const speakerOf = useMemo(() => {
    const map = new Map<string, Speaker>();
    (manga.characters ?? []).forEach((c, i) => {
      map.set(c.id, {
        name: c.name,
        role: c.role,
        accent: SPEAKER_ACCENTS[i % SPEAKER_ACCENTS.length]!,
      });
    });
    map.set("narration", { name: "せつめい", accent: NARRATION_ACCENT });
    return map;
  }, [manga.characters]);

  const slides = useMemo<Slide[]>(
    () =>
      manga.pages.flatMap((page, pageIndex) =>
        page.panels.map((panel, panelIndex) => ({
          panel,
          pageIndex,
          panelIndex,
          firstOfPage: panelIndex === 0,
        })),
      ),
    [manga.pages],
  );

  /** しおり。前に見た いちばん先のコマから始める。 */
  const [index, setIndex] = useState(() => {
    const saved = readContentProgress(manga.id)?.position?.panel;
    return typeof saved === "number" && saved >= 0 && saved < slides.length ? saved : 0;
  });
  const [finished, setFinished] = useState(false);
  /**
   * いちばん先まで見たコマ。描画（点の色）にも使うので ref ではなく state で持つ
   *（ref を描画で読むと、更新しても色が変わらないことがある）。
   */
  const [furthest, setFurthest] = useState(index);

  const last = slides.length - 1;
  const slide = slides[index];
  const page = slide ? manga.pages[slide.pageIndex] : undefined;

  const go = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(last, next));
      setIndex(clamped);
      const reached = Math.max(furthest, clamped);
      setFurthest(reached);
      const done = reached >= last;
      if (done && !finished) setFinished(true);
      recordContentProgress(manga.id, {
        status: done ? "completed" : "started",
        position: { panel: reached },
      });
    },
    [last, manga.id, finished, furthest],
  );

  // 開いた時点で「よみかけ」。最後のコマから始まったなら、その場で読み終わり
  useEffect(() => {
    recordContentProgress(manga.id, {
      status: last === 0 ? "completed" : "started",
      position: { panel: index },
    });
    // 初回だけ。以降は go() が記録する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manga.id]);

  // ←→ キーでも進める（マウスしか無い端末でも読める）
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") go(index + 1);
      if (event.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index]);

  return (
    <div className={embedded ? "" : "mx-auto w-full max-w-4xl px-4 py-6"}>
      <section className="card-island p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-4">
          <NexMax variant="book" size={72} bob />
          <div className="min-w-0 flex-1">
            <h1 className="text-ink text-2xl font-extrabold break-words sm:text-3xl">
              <RubyText text={manga.title} index={furigana} show={furiganaOn} />
            </h1>
            <p className="text-ink-soft mt-1 font-bold break-words">
              <RubyText text={manga.description} index={furigana} show={furiganaOn} />
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFuriganaOn((on) => !on)}
            aria-pressed={furiganaOn}
            className={`rounded-full border-2 px-3 py-1 text-xs font-extrabold ${
              furiganaOn ? "bg-sky border-sky text-white" : "border-hairline text-ink-soft bg-panel"
            }`}
          >
            ふりがな {furiganaOn ? "ON" : "OFF"}
          </button>
        </div>
      </section>

      {/* 場面カード（ページの最初のコマだけ）。「どこの いつ」を先に渡す */}
      {slide?.firstOfPage && page?.title ? (
        <p
          className="text-ink mt-4 inline-flex rounded-full border-2 px-4 py-1.5 text-sm font-extrabold"
          style={{ background: "var(--color-cream)", borderColor: "var(--color-sun)" }}
        >
          🎬 <RubyText text={page.title} index={furigana} show={furiganaOn} />
        </p>
      ) : null}

      <div className="mt-3">
        {slide ? (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.18 }}
          >
            <PanelView
              panel={slide.panel}
              speakerOf={speakerOf}
              furigana={furigana}
              furiganaOn={furiganaOn}
            />
          </motion.div>
        ) : null}
      </div>

      {/*
        ページの補足。絵とセリフだけでは伝わらないこと（「ここでは まだ 名前を
        言っていません」など）を、そのページの最初のコマにそえる。
      */}
      {slide?.firstOfPage && page?.note ? (
        <p className="bg-panel-tint text-ink mt-3 rounded-2xl px-4 py-2 text-sm font-bold break-words">
          💡 <RubyText text={page.note} index={furigana} show={furiganaOn} />
        </p>
      ) : null}

      {/* 送り。よこに すすむ */}
      <nav
        aria-label="コマを おくる"
        className="card-island mt-4 flex flex-wrap items-center justify-between gap-3 p-3"
      >
        <button
          type="button"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          className="border-hairline text-navy rounded-full border-2 bg-white px-5 py-2 text-sm font-black disabled:opacity-40"
        >
          ← まえ
        </button>

        <span className="text-ink-soft text-xs font-black">
          {index + 1} / {slides.length} コマ
        </span>

        <button
          type="button"
          onClick={() => go(index + 1)}
          disabled={index >= last}
          className="btn-game px-6 py-2 text-sm [--btn-face:#f26fa7] [--btn-shadow:#d94d84] disabled:opacity-40"
        >
          つぎ →
        </button>
      </nav>

      {/* コマの点。いま何コマ目かと、どこまで読んだかが一目で分かる */}
      <div className="mt-2 flex flex-wrap justify-center gap-1">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => go(i)}
            aria-label={`${i + 1} コマめ`}
            aria-current={i === index ? "true" : undefined}
            className={`h-2 w-6 rounded-full ${
              i === index ? "bg-navy" : i <= furthest ? "bg-sky-soft" : "bg-[#e4eef3]"
            }`}
          />
        ))}
      </div>

      {index >= last ? (
        <section className="card-island mt-6 p-6 text-center">
          {finished && <CelebrationBurst />}
          <div className="flex justify-center">
            <NexMax variant="cheer" size={84} bob />
          </div>
          <p className="text-ink mt-3 text-xl font-extrabold">よみおわり！ おつかれさま</p>

          {/*
            復習は vocab（作者が選んだ語＋意味）だけで作る。furigana はルビ合成のための
            最長一致辞書で、「分」「終」のような送りがな幹も入るため、
            そのまま語彙リストにすると誤った語を覚えさせてしまう。
          */}
          {manga.vocab && manga.vocab.length > 0 && (
            <div className="mt-5 text-left">
              <p className="text-ink-soft text-xs font-extrabold">この まんがに 出てきた ことば</p>
              <ul className="mt-2 space-y-2">
                {manga.vocab.map((item) => (
                  <li
                    key={item.term}
                    className="border-hairline bg-panel rounded-2xl border-2 px-3 py-2"
                  >
                    <span className="text-ink text-sm font-extrabold">
                      <ruby>
                        {item.term}
                        <rt>{item.reading}</rt>
                      </ruby>
                    </span>
                    <span className="text-ink-soft ml-2 text-sm font-bold">{item.meaning}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

/**
 * 1コマ。絵と、その下のセリフ。
 *
 * セリフは**絵に焼いてあっても下に出す**。焼いた字はふりがなを持てないので
 *（画像生成でルビは崩れる）、ルビ・語彙ポップアップ・読み上げは下のテキストが担う。
 * `speechInImage` は「絵に焼くかどうか」だけを意味し、下に出すかは左右しない。
 */
function PanelView({
  panel,
  speakerOf,
  furigana,
  furiganaOn,
}: {
  panel: MangaPanel;
  speakerOf: ReadonlyMap<string, Speaker>;
  furigana: FuriganaIndex;
  furiganaOn: boolean;
}) {
  return (
    <figure className="card-island overflow-hidden p-0">
      {/*
        高さの上限を付ける理由: 埋め込み時の枠は横に広い（88rem）ので、4:3 のままだと
        1コマが画面の高さを超え、絵とセリフを同時に見られない。
        「1コマずつ見る」形の意味が無くなるので、画面の高さで頭打ちにする。
        object-contain なので、はみ出しは切らずに左右が余るだけ。
      */}
      <div className="bg-panel-tint relative aspect-[4/3] max-h-[58vh] w-full">
        {panel.image.src ? (
          <Image
            src={panel.image.src}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-contain"
            unoptimized
          />
        ) : (
          <span className="text-ink-faint absolute inset-0 grid place-items-center text-sm font-bold">
            🖼️ え は じゅんびちゅう
          </span>
        )}
      </div>

      {panel.caption ? (
        <figcaption className="text-ink-soft border-hairline border-t px-4 py-2 text-xs font-bold break-words">
          <RubyText text={panel.caption} index={furigana} show={furiganaOn} />
        </figcaption>
      ) : null}

      {panel.lines.length > 0 ? (
        <div className="space-y-2 p-4">
          {panel.lines.map((line, i) => (
            <LineBubble
              key={i}
              line={line}
              speaker={speakerOf.get(line.speaker)}
              furigana={furigana}
              furiganaOn={furiganaOn}
            />
          ))}
        </div>
      ) : null}
    </figure>
  );
}

function LineBubble({
  line,
  speaker,
  furigana,
  furiganaOn,
}: {
  line: MangaLine;
  speaker: Speaker | undefined;
  furigana: FuriganaIndex;
  furiganaOn: boolean;
}) {
  const accent = speaker?.accent ?? NARRATION_ACCENT;
  return (
    <p className="flex flex-wrap items-start gap-2">
      <span
        className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-black text-white"
        style={{ background: accent }}
      >
        {speaker?.name ?? line.speaker}
        {speaker?.role ? <span className="ml-1 font-bold opacity-80">{speaker.role}</span> : null}
      </span>
      <span className="text-ink min-w-0 flex-1 leading-relaxed font-bold break-words">
        <RubyText text={line.text} index={furigana} show={furiganaOn} />
      </span>
    </p>
  );
}
