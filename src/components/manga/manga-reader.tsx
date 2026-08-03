"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import type { Manga, MangaLine, MangaPanel } from "@/content/schema";
import { NekuMax } from "@/components/nekumax";
import { RubyText } from "@/components/ruby-text";
import { CelebrationBurst } from "@/components/quiz/celebration";
import { buildFuriganaIndex, type FuriganaIndex } from "@/lib/text/furigana";
import {
  readContentProgress,
  recordContentProgress,
  type ContentProgress,
} from "@/lib/progress/store";

/**
 * 漫画リーダー（設計07 §4.1）
 *
 * 最重要の前提: 画像に日本語を焼き込まない。セリフはデータで持ち、HTML の吹き出しで
 * 画像の下に描く。だから ふりがな合成（RubyText）も ON/OFF も そのまま効くし、
 * 画像が1枚も無くても「読める」— 未生成のコマは プレースホルダーに置き換わる。
 *
 * 進捗はパネル単位。IntersectionObserver で見えたコマを しおりとして記録し、
 * 最後のコマに届いたら「よみおわり」にする（設計07 §4.1 しおり／読み終わり判定）。
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

/** ステージのidだけを受け取る（戻り先を作るときに、任意のURLを踏ませない）。 */
const STAGE_ID = /^[a-z0-9_-]+$/;
const STAGE_PATH = /^\/stage\/[a-z0-9_-]+$/;

/** 1コマの居場所。しおり（position）は 0 はじまりで持つ。 */
interface PanelSpot {
  readonly pageIndex: number;
  readonly panelIndex: number;
}

/** しおりの位置 → コマの通し番号。見つからなければ -1。 */
function indexOfPosition(
  panels: readonly PanelSpot[],
  position: Record<string, number> | undefined,
): number {
  const page = position?.page;
  const panel = position?.panel;
  if (page === undefined || panel === undefined) return -1;
  return panels.findIndex((spot) => spot.pageIndex === page && spot.panelIndex === panel);
}

/** 何も購読しない（ブラウザだけで分かる値を、サーバ側の既定値つきで読むため）。 */
const subscribeNothing = () => () => {};

/**
 * 前回のしおりを「開いたときの1回だけ」読む。
 *
 * effect の中で setState して同期する形は取らない（useSyncExternalStore を使う）。
 * また、読んでいる最中の記録で値が動くと「つづきから」ボタンが本文の上で
 * 出たり消えたりして画面が跳ねるので、スナップショットは最初の1回で固定する。
 */
function useSavedBookmark(contentId: string): ContentProgress | null {
  const cache = useRef<{ read: boolean; value: ContentProgress | null }>({
    read: false,
    value: null,
  });

  const getSnapshot = useCallback(() => {
    if (!cache.current.read) cache.current = { read: true, value: readContentProgress(contentId) };
    return cache.current.value;
  }, [contentId]);

  return useSyncExternalStore(subscribeNothing, getSnapshot, () => null);
}

/**
 * 戻り先。?stage=... があればそのステージへ、無ければ直前のステージ画面、
 * どちらも無ければ まなびマップ。外から渡されたURLは踏まない（idの形だけ受ける）。
 */
function readBackHref(): string {
  const stage = new URLSearchParams(window.location.search).get("stage");
  if (stage && STAGE_ID.test(stage)) return `/stage/${stage}`;

  if (document.referrer) {
    try {
      const from = new URL(document.referrer);
      if (from.origin === window.location.origin && STAGE_PATH.test(from.pathname)) {
        return from.pathname;
      }
    } catch {
      /* 参照元が読めないときは まなびマップへ戻す */
    }
  }
  return "/map";
}

/**
 * 画像の置き場所を解決する。未生成（status !== "done"）や src なしは null を返し、
 * 呼び出し側が プレースホルダーを出す。
 */
function resolveImageSrc(panel: MangaPanel): string | null {
  const { src, status } = panel.image;
  if (status !== "done" || !src) return null;
  if (/^https?:\/\//.test(src) || src.startsWith("/")) return src;
  return `/${src}`;
}

export function MangaReader({ manga }: { manga: Manga }) {
  const furigana = useMemo(() => buildFuriganaIndex(manga.furigana ?? []), [manga.furigana]);
  const isStory = manga.format === "story";

  const characters = useMemo(() => manga.characters ?? [], [manga.characters]);
  const speakerOf = useMemo(() => {
    const map = new Map<string, { name: string; accent: string }>();
    characters.forEach((c, i) => {
      map.set(c.id, { name: c.name, accent: SPEAKER_ACCENTS[i % SPEAKER_ACCENTS.length]! });
    });
    map.set("narration", { name: "せつめい", accent: NARRATION_ACCENT });
    return map;
  }, [characters]);

  /** ページごとの通し番号の起点。コマの通し番号 = pageOffsets[page] + panel。 */
  const pageOffsets = useMemo(() => {
    const offsets: number[] = [];
    let count = 0;
    for (const page of manga.pages) {
      offsets.push(count);
      count += page.panels.length;
    }
    return offsets;
  }, [manga.pages]);

  const flatPanels = useMemo<PanelSpot[]>(
    () =>
      manga.pages.flatMap((page, pageIndex) =>
        page.panels.map((_, panelIndex) => ({ pageIndex, panelIndex })),
      ),
    [manga.pages],
  );
  const totalPanels = flatPanels.length;

  const [furiganaOn, setFuriganaOn] = useState(true);
  /** いま最後のコマに とどいた（このときだけ 紙ふぶきを出す）。 */
  const [justFinished, setJustFinished] = useState(false);

  const backHref = useSyncExternalStore(subscribeNothing, readBackHref, () => "/map");
  const bookmark = useSavedBookmark(manga.id);
  /** よみおわっている（前回の記録も、いま読み切った分もふくむ）。 */
  const read = justFinished || bookmark?.status === "completed";
  /** しおりの位置。最後のコマまで行っているなら「つづき」は出さない。 */
  const savedIndex = indexOfPosition(flatPanels, bookmark?.position);
  const resumeIndex = savedIndex > 0 && savedIndex < totalPanels - 1 ? savedIndex : null;

  const containerRef = useRef<HTMLDivElement>(null);
  /** ここまで読んだ、の通し番号。しおりを前に戻さないための番人。 */
  const furthestRef = useRef(-1);

  const jumpTo = useCallback((index: number) => {
    const target = containerRef.current?.querySelector<HTMLElement>(
      `[data-panel-index="${index}"]`,
    );
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // 見えたコマを しおりに記録する。下から 35% は「まだ読んでいない」とみなす。
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    // 読み直しでしおりが前に戻らないよう、監視の前に前回の到達点を入れておく。
    const saved = indexOfPosition(flatPanels, readContentProgress(manga.id)?.position);
    if (saved > furthestRef.current) furthestRef.current = saved;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number(entry.target.getAttribute("data-panel-index"));
          if (!Number.isInteger(index) || index <= furthestRef.current) continue;

          const spot = flatPanels[index];
          if (!spot) continue;
          furthestRef.current = index;

          const last = index === flatPanels.length - 1;
          recordContentProgress(manga.id, {
            status: last ? "completed" : "started",
            position: { page: spot.pageIndex, panel: spot.panelIndex },
          });
          if (last) setJustFinished(true);
        }
      },
      { rootMargin: "0px 0px -35% 0px", threshold: 0 },
    );

    for (const node of root.querySelectorAll<HTMLElement>("[data-panel-index]")) {
      observer.observe(node);
    }
    return () => observer.disconnect();
  }, [manga.id, flatPanels]);

  const backToStage = backHref.startsWith("/stage/");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-5 flex items-center justify-between gap-3">
        <Link href={backHref} className="text-ink-soft hover:text-navy text-sm font-extrabold">
          ← {backToStage ? "ステージに もどる" : "まなびマップ"}
        </Link>
        <span className="bg-sky-soft text-navy rounded-full px-3 py-1 text-xs font-extrabold">
          📖 {isStory ? "まんが" : "4コマ まんが"}
        </span>
      </header>

      <section className="card-island p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <NekuMax variant="book" size={84} bob />
          <div className="min-w-0">
            <h1 className="text-ink text-2xl font-extrabold sm:text-3xl">
              <RubyText text={manga.title} index={furigana} show={furiganaOn} />
            </h1>
            <p className="text-ink-soft mt-1 font-bold">
              <RubyText text={manga.description} index={furigana} show={furiganaOn} />
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="border-hairline bg-panel text-ink-soft rounded-full border-2 px-3 py-1 text-xs font-extrabold">
            ぜんぶで {totalPanels} コマ
          </span>
          {read && (
            <span
              className="rounded-full px-3 py-1 text-xs font-extrabold text-white"
              style={{ background: "var(--color-leaf)" }}
            >
              よみおわり
            </span>
          )}
          <button
            type="button"
            onClick={() => setFuriganaOn((on) => !on)}
            aria-pressed={furiganaOn}
            className={`ml-auto rounded-full border-2 px-3 py-1 text-xs font-extrabold ${
              furiganaOn ? "bg-sky border-sky text-white" : "border-hairline text-ink-soft bg-panel"
            }`}
          >
            ふりがな {furiganaOn ? "ON" : "OFF"}
          </button>
        </div>

        {isStory && resumeIndex !== null && (
          <button
            type="button"
            onClick={() => jumpTo(resumeIndex)}
            className="btn-island btn-game mt-4 w-full px-6 py-3"
            style={{ "--btn-face": "#4fa8e8", "--btn-shadow": "#0272ae" } as React.CSSProperties}
          >
            つづきから よむ（{resumeIndex + 1} コマめ）
          </button>
        )}
      </section>

      <div ref={containerRef} className={isStory ? "mt-6 space-y-10" : "mt-6 space-y-8"}>
        {manga.pages.map((page, pageIndex) => (
          <section key={pageIndex} aria-label={`${pageIndex + 1} ページめ`}>
            {isStory ? (
              <ScenePlate
                title={page.title}
                page={pageIndex + 1}
                total={manga.pages.length}
                furigana={furigana}
                furiganaOn={furiganaOn}
              />
            ) : (
              manga.pages.length > 1 && (
                <p className="text-ink-faint mb-3 text-center text-xs font-extrabold">
                  {pageIndex + 1} / {manga.pages.length}
                </p>
              )
            )}

            <div className={isStory ? "space-y-6" : "mx-auto max-w-md space-y-3"}>
              {page.panels.map((panel, panelIndex) => (
                <PanelBlock
                  key={panelIndex}
                  panel={panel}
                  index={pageOffsets[pageIndex]! + panelIndex}
                  story={isStory}
                  speakerOf={speakerOf}
                  furigana={furigana}
                  furiganaOn={furiganaOn}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="card-island mt-8 p-6 text-center">
        {justFinished && <CelebrationBurst />}
        <div className="flex justify-center">
          <NekuMax variant={read ? "cheer" : "book"} size={92} bob />
        </div>
        <p className="text-ink mt-3 text-2xl font-extrabold">
          {read ? "よみおわり！ おつかれさま" : "ここまで よんだね"}
        </p>
        <p className="text-ink-soft mt-1 font-bold">
          {read
            ? "まんがで 見た ことばを、つぎの がくしゅうで つかってみよう。"
            : "つづきは いつでも ここから よめるよ。"}
        </p>

        {manga.furigana && manga.furigana.length > 0 && (
          <div className="mt-5 text-left">
            <p className="text-ink-soft text-xs font-extrabold">この まんがに 出てきた ことば</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {manga.furigana.map(([surface, reading]) => (
                <li
                  key={surface}
                  className="border-hairline bg-panel text-ink rounded-full border-2 px-3 py-1 text-sm font-extrabold"
                >
                  <ruby>
                    {surface}
                    <rt>{reading}</rt>
                  </ruby>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Link
          href={backHref}
          className="btn-island btn-game mt-6 w-full px-6 py-3.5"
          style={{ "--btn-face": "#58c273", "--btn-shadow": "#3aa458" } as React.CSSProperties}
        >
          {backToStage ? "ステージに もどる" : "まなびマップに もどる"}
        </Link>
      </section>
    </div>
  );
}

/** 場面カード（story のみ）。「どこの いつ」を先に渡してから コマを見せる。 */
function ScenePlate({
  title,
  page,
  total,
  furigana,
  furiganaOn,
}: {
  title?: string;
  page: number;
  total: number;
  furigana: FuriganaIndex;
  furiganaOn: boolean;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      {title ? (
        <p
          className="text-ink rounded-full border-2 px-4 py-1.5 text-sm font-extrabold"
          style={{ background: "var(--color-cream)", borderColor: "var(--color-sun)" }}
        >
          🎬 <RubyText text={title} index={furigana} show={furiganaOn} />
        </p>
      ) : (
        <span aria-hidden />
      )}
      <p className="text-ink-faint text-xs font-extrabold">
        p.{page} / {total}
      </p>
    </div>
  );
}

/** 1コマ。画像（または プレースホルダー）＋ セリフ ＋ ナレーションの帯。 */
function PanelBlock({
  panel,
  index,
  story,
  speakerOf,
  furigana,
  furiganaOn,
}: {
  panel: MangaPanel;
  index: number;
  story: boolean;
  speakerOf: Map<string, { name: string; accent: string }>;
  furigana: FuriganaIndex;
  furiganaOn: boolean;
}) {
  const src = resolveImageSrc(panel);
  const size = story ? panel.size : "normal";
  const frame =
    size === "wide" ? "w-full" : size === "tall" ? "mx-auto max-w-sm" : "mx-auto max-w-xl";

  return (
    <motion.figure
      data-panel-index={index}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={frame}
    >
      {src ? (
        <Image
          src={src}
          alt=""
          width={1200}
          height={900}
          unoptimized
          className="border-hairline rounded-[24px] border-2 bg-white"
          style={{
            width: "100%",
            height: "auto",
            maxHeight: size === "tall" ? "78vh" : undefined,
            objectFit: "contain",
          }}
        />
      ) : (
        <div className="card-island grid place-items-center gap-2 px-4 py-8">
          <NekuMax variant="build" size={76} bob />
          <p className="text-ink-soft text-sm font-extrabold">え は じゅんびちゅう</p>
        </div>
      )}

      {(panel.lines.length > 0 || panel.caption) && (
        <figcaption className="mt-3 space-y-2">
          {panel.lines.map((line, i) => (
            <SpeechLine
              key={i}
              line={line}
              speaker={speakerOf.get(line.speaker)}
              furigana={furigana}
              furiganaOn={furiganaOn}
            />
          ))}
          {panel.caption && (
            <p
              className="text-ink-soft rounded-[16px] border-2 border-dashed px-4 py-2.5 leading-relaxed font-bold"
              style={{ background: "var(--color-cream)", borderColor: "var(--color-sun)" }}
            >
              <RubyText text={panel.caption} index={furigana} show={furiganaOn} />
            </p>
          )}
        </figcaption>
      )}
    </motion.figure>
  );
}

/** セリフ1行。吹き出しは HTML なので ふりがなも 禁止語検査も そのまま効く。 */
function SpeechLine({
  line,
  speaker,
  furigana,
  furiganaOn,
}: {
  line: MangaLine;
  speaker?: { name: string; accent: string };
  furigana: FuriganaIndex;
  furiganaOn: boolean;
}) {
  const name = speaker?.name ?? line.speaker;
  const accent = speaker?.accent ?? NARRATION_ACCENT;
  const narration = line.speaker === "narration";

  if (narration) {
    return (
      <p
        className="text-ink-soft rounded-[16px] border-2 px-4 py-2.5 leading-relaxed font-bold"
        style={{ background: "var(--color-panel-tint)", borderColor: "var(--color-hairline)" }}
      >
        <RubyText text={line.text} index={furigana} show={furiganaOn} />
      </p>
    );
  }

  return (
    <div>
      <span
        className="ml-3 inline-block rounded-full px-3 py-0.5 text-xs font-extrabold text-white"
        style={{ background: accent }}
      >
        {name}
      </span>
      <div
        className="relative mt-1 rounded-[20px] border-2 bg-white px-4 py-3"
        style={{ borderColor: accent }}
      >
        <span
          aria-hidden
          className="absolute -top-[7px] left-5 h-3 w-3 rotate-45 border-t-2 border-l-2 bg-white"
          style={{ borderColor: accent }}
        />
        <p className="text-ink leading-relaxed font-bold">
          <RubyText text={line.text} index={furigana} show={furiganaOn} />
        </p>
      </div>
    </div>
  );
}
