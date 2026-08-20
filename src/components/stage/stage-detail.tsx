"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import type { ContentRefType } from "@/content/schema";
import { RubyText } from "@/components/ruby-text";
import { readContentProgress, subscribeProgress } from "@/lib/progress/store";
import { buildFuriganaIndex, mergeFuriganaEntries, type FuriganaEntry } from "@/lib/text/furigana";
import {
  contentKindMeta,
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
  /** 参照先の読み辞書。一覧の見出し・説明にルビを合成するのに使う。 */
  furigana?: readonly FuriganaEntry[];
  href: string;
}

export interface StageWordItem {
  id: string;
  title: string;
  /** ことばの 数。カードに「44この ことば」と 出す。 */
  wordCount: number;
  /**
   * 単語ステージの読み辞書。ことばカードの見出し・説明にルビを合成する。
   * 語ごとの (表記, よみ) も混ぜて渡す（組み立ては app/[stage]/page.tsx）。
   */
  furigana?: readonly FuriganaEntry[];
}

/** 漢字を含む見出しか。含むならタイトル全体に よみ をふる（map-shell と同じ判定）。 */
const HAS_KANJI = /[一-鿿]/;

export interface StageHeader {
  id: string;
  /**
   * マップの上から数えた番号（STEP 01…）。
   * **地図に出ないステージは null**——札そのものを出さない。1 に倒すと、
   * 案内のページが本物の STEP 01 と同じ顔で並ぶ（`stageStepNumber`）。
   */
  number: number | null;
  title: string;
  reading: string;
  description: string;
  /** 見出しと説明の読み辞書（ステージ自身が持つ。schema.ts stageSchema）。 */
  furigana?: readonly FuriganaEntry[];
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
  /**
   * 一覧に出る教材の読み辞書を1つの索引にまとめる。
   * ステージ見出しは reading（タイトル全体の読み）しか持たないため、
   * ルビではなく map と同じ「（よみ）」の行で見せる（かな部分にルビが乗るのを避ける）。
   */
  const itemFurigana = useMemo(
    () => buildFuriganaIndex(mergeFuriganaEntries(...items.map((item) => item.furigana))),
    [items],
  );
  /*
   * ことばカードの辞書は別に組む。教材の辞書と混ぜないのは、単語ステージが
   * 語ごとの読みを大量に持つためで、混ぜると本文側の最長一致の当たり方が変わる。
   */
  const wordFurigana = useMemo(
    () => buildFuriganaIndex(mergeFuriganaEntries(...wordStages.map((word) => word.furigana))),
    [wordStages],
  );
  const [furiganaOn, setFuriganaOn] = useState(true);
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
        {stage.number !== null && (
          <span className="bg-sky-soft text-navy rounded-full px-3 py-1 text-xs font-extrabold">
            STEP {String(stage.number).padStart(2, "0")}
          </span>
        )}
      </header>

      <section className="card-island p-5 sm:p-6">
        {/*
          見出しは **タイトル全体に よみ** をふる（2026-08-18）。ステージの 名前も
          漢字＋ふりがなで 書けるようにしたので、読みは ルビで 出す。
          漢字が 無い ときだけ、これまでどおり「（よみ）」の行で 見せる——
          かなの 上に かなを 重ねても 読みやすくは ならない。
        */}
        <h1 className="text-navy text-2xl font-black">
          {HAS_KANJI.test(stage.title) ? (
            <ruby>
              {stage.title}
              <rt className="text-ink-soft">{stage.reading}</rt>
            </ruby>
          ) : (
            stage.title
          )}
        </h1>
        {!HAS_KANJI.test(stage.title) && (
          <p className="text-ink-soft text-xs font-bold">（{stage.reading}）</p>
        )}
        <p className="text-ink mt-2 text-sm font-bold">
          <RubyText text={stage.description} furigana={stage.furigana} show={furiganaOn} />
        </p>

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
            <RubyText
              className="text-xs"
              text={next.title}
              index={itemFurigana}
              show={furiganaOn}
            />
          </Link>
        )}
      </section>

      {/*
        ことばは **教材より 先**に置く（2026-08-20 の指定「コンテンツの前に単語を学習したい」）。
        カードは ステージに 1枚しか 出ないので、見出しと 語数だけの 1行に する
        ——選ぶものが 1つしか 無い画面に、大きな カードを 2列で 並べる 意味は 無い。
      */}
      {wordStages.map((word) => (
        <section key={word.id} className="mt-6">
          <h2 className="text-navy text-lg font-black">🕹️ さいしょに ことばを おぼえる</h2>
          <Link
            href={`/arcade/${word.id}`}
            className="card-island mt-3 flex items-center gap-3 p-4 transition hover:-translate-y-0.5"
          >
            <span aria-hidden className="text-2xl leading-none">
              🕹️
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-sky block text-[10px] font-black tracking-widest">
                ことば {word.wordCount}こ
              </span>
              <RubyText
                className="text-navy block text-base leading-relaxed font-black"
                text={word.title}
                index={wordFurigana}
                show={furiganaOn}
              />
            </span>
            <span className="btn-game shrink-0 px-4 py-1.5 text-sm [--btn-face:#ffc93c] [--btn-shadow:#f0a819]">
              あそぶ
            </span>
          </Link>
        </section>
      ))}

      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-navy text-lg font-black">📚 この ステージで やること</h2>
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
        {items.length === 0 ? (
          <p className="text-ink-soft card-island mt-3 p-4 text-sm font-bold">
            きょうざいを じゅんび しています。もうすこし まってね。
          </p>
        ) : (
          <ol className="mt-3 space-y-3">
            {items.map((item, index) => {
              const code = codes[index] ?? "0";
              const badge = STATUS_BADGE[code];
              const meta = contentKindMeta(item.type);
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
                      <RubyText
                        className="text-navy line-clamp-1 text-base leading-relaxed font-black"
                        text={item.title}
                        index={itemFurigana}
                        show={furiganaOn}
                      />
                      {item.description && (
                        <RubyText
                          className="text-ink-soft line-clamp-2 text-xs leading-relaxed font-bold"
                          text={item.description}
                          index={itemFurigana}
                          show={furiganaOn}
                        />
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
    </div>
  );
}
