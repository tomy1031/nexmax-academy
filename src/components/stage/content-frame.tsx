"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { ContentRefType } from "@/content/schema";
import { contentKindMeta } from "@/lib/content-kinds";
import { readContentProgress, subscribeProgress } from "@/lib/progress/store";
import { decodeStatuses, statusCode, STATUS_BADGE } from "./stage-progress";

/**
 * 教材の外枠 — どのステージのどこにいるかを、教材の種類によらず同じ形で見せる
 *
 * これまでは教材ごとに自前のヘッダを持っていて、戻り先が「マップ」「リスニング一覧」
 * 「もんだい一覧」とばらばらだった。学習者はステージの中を進んでいるのに、
 * 1本おわるたびに地図まで放り出される。戻り先は**いつでも いま居るステージ**にする。
 *
 * 並びも常に見せる。いま何番目で、あと何本あるのかが見えないと、
 * 「まだ終わらないのか」という不安のほうが先に来る。
 *
 * ## 順番の制御
 * まだ終わっていない教材を飛ばして先へ行けないようにする。ただし**行き止まりは作らない**
 * ——直接URLで来た人には、どれを先に終えればよいかを出し、そこへ行くボタンを置く。
 * 小さく「それでも 見る」も残す。ここを完全に塞ぐと、進捗が消えた学習者と、
 * 教材を確認したい先生が、どちらも先に進めなくなる。
 */

export interface FrameItem {
  /** 進捗キー＝コンテンツID。 */
  id: string;
  type: ContentRefType;
  title: string;
  href: string;
}

export interface FrameStage {
  id: string;
  title: string;
  reading: string;
  /** マップの上から数えた番号（STEP 01…）。 */
  number: number;
}

export function ContentFrame({
  stage,
  items,
  currentIndex,
  tools,
  children,
}: {
  stage: FrameStage;
  items: readonly FrameItem[];
  currentIndex: number;
  /** その教材だけの操作（ふりがな ON/OFF など）。無ければ省略。 */
  tools?: ReactNode;
  children: ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const [forced, setForced] = useState(false);

  const serverKey = useMemo(() => items.map(() => "0").join(""), [items]);
  const progressKey = useSyncExternalStore(
    subscribeProgress,
    () => items.map((item) => statusCode(readContentProgress(item.id))).join(""),
    () => serverKey,
  );
  const codes = decodeStatuses(progressKey);

  /** 最初の「まだ おわっていない」教材。ここより先へは進めない。 */
  const firstUnfinished = codes.findIndex((code) => code !== "2");
  const openUntil = firstUnfinished < 0 ? items.length - 1 : firstUnfinished;
  const locked = currentIndex > openUntil && !forced;
  const blocker = items[openUntil];

  const current = items[currentIndex];
  const next = items[currentIndex + 1];
  const currentDone = codes[currentIndex] === "2";

  return (
    <div className="mx-auto w-full max-w-[88rem] px-3 py-4 sm:px-5">
      <div className="flex flex-col gap-4 lg:flex-row">
        <StageRail
          stage={stage}
          items={items}
          codes={codes}
          currentIndex={currentIndex}
          openUntil={openUntil}
          open={navOpen}
          onToggle={() => setNavOpen((value) => !value)}
        />

        <div className="min-w-0 flex-1">
          {tools ? <div className="mb-3 flex flex-wrap justify-end gap-2">{tools}</div> : null}

          {locked ? (
            <LockedNotice stage={stage} blocker={blocker} onForce={() => setForced(true)} />
          ) : (
            <>
              {children}

              <nav
                aria-label="つぎへ"
                className="card-island mt-6 flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <Link
                  href={`/${stage.id}`}
                  className="text-ink-soft hover:text-navy text-sm font-extrabold"
                >
                  ← ステージに もどる
                </Link>
                {next ? (
                  currentDone ? (
                    <Link
                      href={next.href}
                      className="btn-game px-5 py-2 text-sm [--btn-face:#f26fa7] [--btn-shadow:#d94d84]"
                    >
                      つぎは {contentKindMeta(next.type).icon} {next.title} ▶
                    </Link>
                  ) : (
                    /*
                      おわる前は押せない。押せるボタンのまま出すと、学習者は
                      「押したのに 何も 起きない」を経験することになる。
                    */
                    <span className="bg-panel-tint text-ink-soft rounded-2xl px-5 py-2 text-sm font-black">
                      この {contentKindMeta(current?.type ?? "article").label}が おわると つぎへ
                      すすめます
                    </span>
                  )
                ) : (
                  <Link
                    href={`/${stage.id}`}
                    className="btn-game px-5 py-2 text-sm [--btn-face:#58c273] [--btn-shadow:#3aa458]"
                  >
                    ステージを おえる 🎉
                  </Link>
                )}
              </nav>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** ステージの中の並び。広い画面では左に出しっぱなし、せまい画面はたたむ。 */
function StageRail({
  stage,
  items,
  codes,
  currentIndex,
  openUntil,
  open,
  onToggle,
}: {
  stage: FrameStage;
  items: readonly FrameItem[];
  codes: readonly string[];
  currentIndex: number;
  openUntil: number;
  open: boolean;
  onToggle: () => void;
}) {
  const list = (
    <ol className="space-y-1">
      {items.map((item, index) => {
        const meta = contentKindMeta(item.type);
        const badge = STATUS_BADGE[(codes[index] ?? "0") as "0" | "1" | "2"];
        const here = index === currentIndex;
        const reachable = index <= openUntil;
        const inner = (
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-black ${
                here ? "bg-white text-[#004f8d]" : "bg-sky-soft text-navy"
              }`}
            >
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {meta.icon} {item.title}
            </span>
            <span aria-hidden className="shrink-0 text-xs">
              {reachable ? badge.mark : "🔒"}
            </span>
          </span>
        );
        const className = `block rounded-xl px-2 py-2 text-xs font-black ${
          here ? "bg-navy text-white" : reachable ? "text-ink hover:bg-sky-soft" : "text-ink-faint"
        }`;
        return (
          <li key={`${item.type}:${item.id}`}>
            {reachable && !here ? (
              <Link href={item.href} className={className} onClick={onToggle}>
                {inner}
              </Link>
            ) : (
              <span
                className={className}
                aria-current={here ? "page" : undefined}
                title={reachable ? undefined : "まえの きょうざいが おわると ひらきます"}
              >
                {inner}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );

  const heading = (
    <div>
      <Link href={`/${stage.id}`} className="text-sky text-[11px] font-black tracking-widest">
        STEP {String(stage.number).padStart(2, "0")}
      </Link>
      <p className="text-navy text-sm font-black">
        <ruby>
          {stage.title}
          <rt className="text-ink-soft">{stage.reading}</rt>
        </ruby>
      </p>
    </div>
  );

  return (
    <>
      <aside className="card-island sticky top-4 hidden h-fit w-60 shrink-0 space-y-3 p-4 lg:block">
        {heading}
        {list}
        <Link href="/map" className="text-ink-soft hover:text-navy block text-xs font-bold">
          ← まなびマップ
        </Link>
      </aside>

      <div className="lg:hidden">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="card-island flex w-full items-center justify-between gap-2 p-3 text-left"
        >
          {heading}
          <span aria-hidden className="text-sky text-lg font-black">
            {open ? "▲" : `${currentIndex + 1}/${items.length} ▼`}
          </span>
        </button>
        {open ? <div className="card-island mt-2 space-y-3 p-3">{list}</div> : null}
      </div>
    </>
  );
}

/** まだ順番が来ていない教材を直接ひらいたとき。 */
function LockedNotice({
  stage,
  blocker,
  onForce,
}: {
  stage: FrameStage;
  blocker: FrameItem | undefined;
  onForce: () => void;
}) {
  return (
    <section className="card-island p-6 text-center">
      <p className="text-4xl" aria-hidden>
        🔒
      </p>
      <h1 className="text-navy mt-2 text-xl font-black">
        まだ この きょうざいの じゅんばんでは ありません
      </h1>
      {blocker ? (
        <>
          <p className="text-ink mt-2 text-sm font-bold">
            さきに「{contentKindMeta(blocker.type).icon} {blocker.title}」を おわらせましょう。
          </p>
          <Link
            href={blocker.href}
            className="btn-game mt-5 inline-flex px-6 py-3 [--btn-face:#f26fa7] [--btn-shadow:#d94d84]"
          >
            ▶ {blocker.title}を ひらく
          </Link>
        </>
      ) : (
        <p className="text-ink mt-2 text-sm font-bold">
          ステージに もどって、はじめから すすめましょう。
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-4">
        <Link href={`/${stage.id}`} className="text-sky text-sm font-black underline">
          ステージに もどる
        </Link>
        {/*
          行き止まりを作らないための小さな逃げ道。進捗が消えた学習者と、
          中身を確かめたい先生が、ここで詰まらないようにする。
        */}
        <button
          type="button"
          onClick={onForce}
          className="text-ink-faint text-xs font-bold underline"
        >
          それでも 見る
        </button>
      </div>
    </section>
  );
}
