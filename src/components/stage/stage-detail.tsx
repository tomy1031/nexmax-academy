"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import type { ContentRefType } from "@/content/schema";
import { RubyText } from "@/components/ruby-text";
import { readContentProgress, subscribeProgress } from "@/lib/progress/store";
import {
  CONTENT_KIND_META,
  STATUS_BADGE,
  decodeStatuses,
  statusCode,
  summarizeStageProgress,
} from "./stage-progress";

/**
 * ステージ詳細 — コンテンツの入れ物と順序を見せる画面（設計07 §3）
 *
 * 順序の正はステージ側。ここは items の並びをそのまま学習順として描き、
 * 進捗（localStorage）は外部ストアとして購読する（effect で setState しない）。
 */

export interface StageContentItem {
  /** 進捗キー＝コンテンツID。 */
  id: string;
  type: ContentRefType;
  title: string;
  description?: string;
  href: string;
}

export interface StageWordItem {
  id: string;
  title: string;
  description?: string;
}

export interface StageHeader {
  id: string;
  step: number;
  title: string;
  reading: string;
  description: string;
}

export function StageDetail({
  stage,
  items,
  wordStages,
}: {
  stage: StageHeader;
  items: readonly StageContentItem[];
  wordStages: readonly StageWordItem[];
}) {
  const titleFurigana = useMemo(
    () => [[stage.title, stage.reading] as const],
    [stage.title, stage.reading],
  );
  const serverKey = useMemo(() => items.map(() => "0").join(""), [items]);
  const progressKey = useSyncExternalStore(
    subscribeProgress,
    () => items.map((item) => statusCode(readContentProgress(item.id))).join(""),
    () => serverKey,
  );
  const codes = decodeStatuses(progressKey);
  const summary = summarizeStageProgress(codes);
  const next = summary.nextIndex >= 0 ? items[summary.nextIndex] : undefined;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-5 flex items-center justify-between gap-3">
        <Link href="/map" className="text-ink-soft hover:text-navy text-sm font-extrabold">
          ← マップ
        </Link>
        <span className="bg-sky-soft text-navy rounded-full px-3 py-1 text-xs font-extrabold">
          STEP {String(stage.step).padStart(2, "0")}
        </span>
      </header>

      <section className="card-island p-5 sm:p-6">
        <h1 className="text-navy text-2xl font-black">
          <RubyText text={stage.title} furigana={titleFurigana} />
        </h1>
        <p className="text-ink mt-2 text-sm font-bold">{stage.description}</p>

        <div className="text-ink-soft mt-4 flex items-center justify-between text-xs font-extrabold">
          <span>
            {summary.total}つ の うち {summary.done}つ おわりました
          </span>
          <span>{summary.percent}%</span>
        </div>
        <div className="mt-1 h-3 overflow-hidden rounded-full border border-white bg-[#e4eef3] shadow-inner">
          <div
            className="bg-leaf h-full rounded-full transition-[width] duration-500"
            style={{ width: `${summary.percent}%` }}
          />
        </div>

        {next && (
          <Link
            href={next.href}
            className="btn-game mt-4 w-full flex-col px-4 py-2 leading-tight [--btn-face:#f26fa7] [--btn-shadow:#d94d84]"
          >
            <span>{summary.allDone ? "🔁 もういちど 見る" : "▶ つづきから"}</span>
            <span className="text-xs">{next.title}</span>
          </Link>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-navy text-lg font-black">📚 この ステージで やること</h2>
        {items.length === 0 ? (
          <p className="text-ink-soft card-island mt-3 p-4 text-sm font-bold">
            きょうざいを じゅんび しています。もうすこし まってね。
          </p>
        ) : (
          <ol className="mt-3 space-y-3">
            {items.map((item, index) => {
              const code = codes[index] ?? "0";
              const badge = STATUS_BADGE[code];
              const meta = CONTENT_KIND_META[item.type];
              return (
                <li key={`${item.type}:${item.id}`}>
                  <Link
                    href={item.href}
                    className="card-island flex items-center gap-3 p-4 transition hover:-translate-y-0.5"
                  >
                    <span aria-hidden className="text-2xl leading-none">
                      {meta.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-sky block text-[10px] font-black tracking-widest">
                        {index + 1}. {meta.label}
                      </span>
                      <span className="text-navy block truncate text-base font-black">
                        {item.title}
                      </span>
                      {item.description && (
                        <span className="text-ink-soft block truncate text-xs font-bold">
                          {item.description}
                        </span>
                      )}
                    </span>
                    <span className="text-ink-soft flex shrink-0 flex-col items-center gap-0.5 text-[10px] font-extrabold">
                      <span aria-hidden className="text-lg leading-none">
                        {badge.mark}
                      </span>
                      {badge.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {wordStages.length > 0 && (
        <section className="mt-6">
          <h2 className="text-navy text-lg font-black">🕹️ ことばで あそぶ</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {wordStages.map((word) => (
              <Link
                key={word.id}
                href={`/arcade/${word.id}`}
                className="card-island flex flex-col p-4 transition hover:-translate-y-0.5"
              >
                <span className="text-sky text-[10px] font-black tracking-widest">🕹️ ことば</span>
                <span className="text-navy mt-1 text-base font-black">{word.title}</span>
                {word.description && (
                  <span className="text-ink-soft mt-1 flex-1 text-xs font-bold">
                    {word.description}
                  </span>
                )}
                <span className="btn-game mt-3 w-full px-3 py-1.5 text-sm [--btn-face:#ffc93c] [--btn-shadow:#f0a819]">
                  あそぶ
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
