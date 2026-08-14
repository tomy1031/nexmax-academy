"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Slides } from "@/content/schema";
import { NexMax } from "@/components/nexmax";
import { RubyText } from "@/components/ruby-text";
import { CelebrationBurst } from "@/components/quiz/celebration";
import { buildFuriganaIndex } from "@/lib/text/furigana";
import { readContentProgress, recordContentProgress } from "@/lib/progress/store";

/**
 * スライド — 先生の資料（PDF）を 1枚ずつ 全画面で 見る
 *
 * ## 1枚ずつにする（まんがと同じ考え方）
 * PDF をブラウザの標準ビューアに任せると、学習者は縦にスクロールして
 * 最後まで流し見できてしまう。1枚ずつ出して**次へ進むのに1回タップが要る**形にすると、
 * その1枚を見たことになる。進捗（しおり）も1枚単位で残せる。
 *
 * ## 「ひろげる」は2段構え
 * `requestFullscreen()` は iPhone の Safari では**要素に効かない**（動画だけ）。
 * それだけに頼ると、学習者の半分は全画面にできない。だから
 *   ① 自前で画面いっぱいに広げる（どの端末でも効く）
 *   ② そのうえで本物の全画面も頼む（効く端末では ブラウザの枠まで消える）
 * の順に重ねる。②が断られても①が残るので、体験は途切れない。
 *
 * ## 読めない字のこと（規律2）
 * PDF の中の文字にアプリは触れないので、**ふりがなを振れない**。
 * その受け皿が、先生が1枚ずつ書ける「ひとこと」（notes）である。ここだけは
 * アプリの文なので、ルビも語彙ポップアップも効く。全画面のときも隅に出し続ける。
 */

/**
 * 絵を描くところだけ ブラウザ限定にする（`ssr: false`）。
 *
 * canvas はサーバで描けないので、SSR しても空の枠を作って捨てるだけになる。
 * 見出し・送り・ひとことは このまま サーバでも描けるので、**画面の骨格は
 * すぐ出て、絵だけが あとから入る**（pdf.js の実体は public/ から取りに行く —
 * src/lib/pdfjs.ts）。
 */
const PdfCanvas = dynamic(() => import("./pdf-canvas").then((m) => m.PdfCanvas), {
  ssr: false,
});

type Phase = "loading" | "ready" | "failed";

export function SlideDeck({ slides, embedded }: { slides: Slides; embedded?: boolean }) {
  const furigana = useMemo(() => buildFuriganaIndex(slides.furigana ?? []), [slides.furigana]);
  const [furiganaOn, setFuriganaOn] = useState(true);

  const [phase, setPhase] = useState<Phase>("loading");
  /** 実際に開けた枚数。データの pageCount より**開いたPDFのほうが正しい**（差し替えられていることがある）。 */
  const [pageCount, setPageCount] = useState(slides.pageCount);

  /** しおり。前に見た いちばん先の1枚から始める。 */
  const [index, setIndex] = useState(() => {
    const saved = readContentProgress(slides.id)?.position?.slide;
    return typeof saved === "number" && saved >= 0 && saved < slides.pageCount ? saved : 0;
  });
  const [furthest, setFurthest] = useState(index);
  const [finished, setFinished] = useState(false);
  const [wide, setWide] = useState(false);

  const shellRef = useRef<HTMLDivElement | null>(null);

  const last = pageCount - 1;
  const note = slides.notes.find((item) => item.page === index + 1);

  const handleReady = useCallback((count: number) => {
    setPageCount(count);
    setPhase("ready");
  }, []);
  const handleFailed = useCallback(() => setPhase("failed"), []);

  /* ---------------------------------------------------------------- *
   * 送り・しおり
   * ---------------------------------------------------------------- */
  const go = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(last, next));
      setIndex(clamped);
      const reached = Math.max(furthest, clamped);
      setFurthest(reached);
      const done = reached >= last;
      if (done && !finished) setFinished(true);
      recordContentProgress(slides.id, {
        status: done ? "completed" : "started",
        position: { slide: reached },
      });
    },
    [last, furthest, finished, slides.id],
  );

  // 開いた時点で「みかけ」。1枚しか無いなら その場で見おわり
  useEffect(() => {
    recordContentProgress(slides.id, {
      status: pageCount <= 1 ? "completed" : "started",
      position: { slide: index },
    });
    // 初回だけ。以降は go() が記録する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.id]);

  // ←→ キーでも送る（教室のパソコンはマウスとキーボード）
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") go(index + 1);
      if (event.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index]);

  /* ---------------------------------------------------------------- *
   * ひろげる／もどす
   * ---------------------------------------------------------------- */
  const expand = useCallback(() => {
    setWide(true);
    // 本物の全画面も頼む。断られても（iPhone など）自前の広げ表示が残る
    void shellRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  const collapse = useCallback(() => {
    setWide(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, []);

  // ブラウザの全画面を Esc で抜けたときに、自前の広げ表示だけ残さない
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setWide(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // 広げているあいだは 後ろのページを動かさない（指で送るときに 裏がずれる）
  useEffect(() => {
    if (!wide) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [wide]);

  // 広げているときは Esc で もどす（全画面APIが効かない端末のため）
  useEffect(() => {
    if (!wide) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") collapse();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [wide, collapse]);

  /** 指で送る。よこに 40px 以上 動いたときだけ（たてスクロールと 取り違えない）。 */
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (event: React.TouchEvent) => {
    const touch = event.changedTouches[0];
    touchRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touchRef.current;
    const touch = event.changedTouches[0];
    touchRef.current = null;
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy)) return;
    go(dx < 0 ? index + 1 : index - 1);
  };

  const stage = (
    <div
      ref={shellRef}
      className={
        wide
          ? "fixed inset-0 z-50 flex flex-col gap-2 bg-[#0b2138] p-2 sm:p-3"
          : "mt-3 flex flex-col gap-2"
      }
    >
      <div
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className={`relative w-full overflow-hidden rounded-2xl bg-[#0b2138] ${
          wide ? "min-h-0 flex-1" : "aspect-[16/9] max-h-[70vh]"
        }`}
      >
        <PdfCanvas
          url={slides.fileUrl}
          page={index + 1}
          onReady={handleReady}
          onFailed={handleFailed}
        />

        {phase === "loading" ? (
          <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm font-black text-white/80">
            スライドを ひらいて います…
          </p>
        ) : null}

        {phase === "failed" ? (
          <div className="absolute inset-0 grid place-items-center px-6 text-center">
            <div>
              <p className="text-sm font-black text-white">スライドを ひらけませんでした。</p>
              <a
                href={slides.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex rounded-full bg-white px-5 py-2 text-sm font-black text-[#0b2138]"
              >
                PDFを ひらく
              </a>
            </div>
          </div>
        ) : null}

        {/* 左右の送り。絵の上に重ねる（全画面のときも 指の届く場所に置く） */}
        {phase === "ready" ? (
          <>
            <EdgeButton side="left" disabled={index === 0} onClick={() => go(index - 1)} />
            <EdgeButton side="right" disabled={index >= last} onClick={() => go(index + 1)} />
            <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-xs font-black text-white">
              {index + 1} / {pageCount} まい
            </span>
            <button
              type="button"
              onClick={wide ? collapse : expand}
              className="absolute top-2 right-2 rounded-full bg-black/55 px-3 py-1.5 text-xs font-black text-white"
            >
              {wide ? "✕ もどす" : "⛶ ひろげる"}
            </button>
          </>
        ) : null}
      </div>

      {/*
        その1枚の ひとこと。全画面のときも 消さない——資料の日本語が読めない学習者に
        とっては、ここだけが「読める文」だから（規律2）。
      */}
      {note ? (
        <p
          className={`rounded-2xl px-4 py-2 text-sm leading-loose font-bold break-words sm:text-base ${
            wide ? "shrink-0 bg-white/95 text-[#0b2138]" : "bg-panel-tint text-ink"
          }`}
        >
          💡 <RubyText text={note.text} index={furigana} show={furiganaOn} />
        </p>
      ) : null}
    </div>
  );

  return (
    <div className={embedded ? "" : "mx-auto w-full max-w-4xl px-4 py-6"}>
      <section className="card-island p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-4">
          <NexMax variant="book" size={72} bob />
          <div className="min-w-0 flex-1">
            <h1 className="text-ink text-2xl font-extrabold break-words sm:text-3xl">
              <RubyText text={slides.title} index={furigana} show={furiganaOn} />
            </h1>
            <p className="text-ink-soft mt-1 font-bold break-words">
              <RubyText text={slides.description} index={furigana} show={furiganaOn} />
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

      {stage}

      {/* 送り（下のボタン）。絵に重なる矢印だけだと、押せることに気づかない人がいる */}
      {!wide ? (
        <nav
          aria-label="スライドを おくる"
          className="card-island mt-3 flex flex-wrap items-center justify-between gap-3 p-3"
        >
          <button
            type="button"
            onClick={() => go(index - 1)}
            disabled={index === 0}
            className="border-hairline text-navy rounded-full border-2 bg-white px-5 py-2 text-sm font-black disabled:opacity-40"
          >
            ← まえ
          </button>
          <button
            type="button"
            onClick={expand}
            className="border-hairline text-navy rounded-full border-2 bg-white px-4 py-2 text-xs font-black"
          >
            ⛶ ひろげて 見る
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            disabled={index >= last}
            className="btn-game px-6 py-2 text-sm [--btn-face:#f26fa7] [--btn-shadow:#d94d84] disabled:opacity-40"
          >
            つぎ →
          </button>
        </nav>
      ) : null}

      {/* どこまで 見たかの 点（まんがと 同じ形にそろえる） */}
      {!wide && pageCount > 1 ? (
        <div className="mt-2 flex flex-wrap justify-center gap-1">
          {Array.from({ length: pageCount }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => go(i)}
              aria-label={`${i + 1} まいめ`}
              aria-current={i === index ? "true" : undefined}
              className={`h-2 w-6 rounded-full ${
                i === index ? "bg-navy" : i <= furthest ? "bg-sky-soft" : "bg-[#e4eef3]"
              }`}
            />
          ))}
        </div>
      ) : null}

      {!wide && index >= last && phase === "ready" ? (
        <section className="card-island mt-6 p-6 text-center">
          {finished && <CelebrationBurst />}
          <div className="flex justify-center">
            <NexMax variant="cheer" size={84} bob />
          </div>
          <p className="text-ink mt-3 text-xl font-extrabold">さいごまで 見ました！</p>
          <a
            href={slides.fileUrl}
            target="_blank"
            rel="noreferrer"
            className="text-ink-soft mt-3 inline-flex text-xs font-black underline"
          >
            PDFを ひらく（あとで 見なおす とき）
          </a>
        </section>
      ) : null}
    </div>
  );
}

/** 絵の左右に重ねる 送りボタン。押せる面を大きく取る（指で押すため）。 */
function EdgeButton({
  side,
  disabled,
  onClick,
}: {
  side: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === "left" ? "まえの スライド" : "つぎの スライド"}
      className={`absolute inset-y-0 z-10 grid w-14 place-items-center text-2xl font-black text-white disabled:opacity-0 ${
        side === "left" ? "left-0" : "right-0"
      }`}
    >
      <span className="grid h-10 w-10 place-items-center rounded-full bg-black/45">
        {side === "left" ? "←" : "→"}
      </span>
    </button>
  );
}
