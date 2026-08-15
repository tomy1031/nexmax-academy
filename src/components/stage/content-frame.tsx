"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { ContentRefType } from "@/content/schema";
import { NexMax } from "@/components/nexmax";
import { CelebrationBurst } from "@/components/quiz/celebration";
import { contentKindMeta } from "@/lib/content-kinds";
import { getClearedStageIds, markStageCleared } from "@/lib/progress";
import { readContentProgress, subscribeProgress } from "@/lib/progress/store";
import { decodeStatuses, gateStage, statusCode, STATUS_BADGE } from "./stage-progress";

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

  /**
   * どこまで開けるか。**関門でない種別（スライド）は ここを素通りする**
   *（content-kinds.ts の `gates` / stage-progress.ts の gateStage）。
   * 先生の しりょうを 通行の条件にすると、資料1枚で ステージ全体が止まる。
   */
  const gating = gateStage(
    codes,
    items.map((item) => contentKindMeta(item.type).gates),
  );
  const locked = !gating.openable[currentIndex] && !forced;
  // 止めている当人（まだ通っていない最初の関門）。無ければ先頭を指す
  const blocker = items[gating.blockedAt < 0 ? 0 : gating.blockedAt];

  const current = items[currentIndex];
  const next = items[currentIndex + 1];
  /** つぎへ進んでよいか。スライドは 見ていなくても true。 */
  const currentDone = gating.passed[currentIndex] === true;

  /*
    ステージの中身を全部おえたら、ステージをクリア済みにする。
    ここで書くのは、教材の進捗（コンテンツ単位）とステージの進捗が別の保存先で、
    後者を書く場所がどこにも無かったため——書かないと地図の現在地が動かず、
    分身と飛行機が最初のステージに残り続ける。
  */
  const stageDone = gating.allPassed;
  useEffect(() => {
    if (stageDone) markStageCleared(stage.id);
  }, [stageDone, stage.id]);

  /*
    ステージ1本を おえたことは、1問の正解より ずっと 大きな 節目なので、
    演出も 大きくする（設計04 §5 — 演出は かならず 学習行為に ひもづける）。

    出すのは **その場で 完走した とき だけ**。クリア済みの ステージを 見返すたびに
    出すと、お祝いが「進んだ しるし」でなくなる。だから「この画面を ひらいた時点で
    もう クリア済みだったか」を 最初の1回だけ 読み、あとは そこからの 変化を見る
    （読むのは 上の markStageCleared より 前に 起きる — 初期化は 描画のとき）。
  */
  const [clearedOnArrival] = useState(() => getClearedStageIds([stage.id]).length > 0);
  const [celebrationClosed, setCelebrationClosed] = useState(false);
  const celebrating = stageDone && !clearedOnArrival && !celebrationClosed;

  return (
    <div className="mx-auto w-full max-w-[88rem] px-3 py-4 sm:px-5">
      <div className="flex flex-col gap-4 lg:flex-row">
        <StageRail
          stage={stage}
          items={items}
          codes={codes}
          currentIndex={currentIndex}
          openable={gating.openable}
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
                ) : currentDone ? (
                  <Link
                    href={`/${stage.id}`}
                    className="btn-game px-5 py-2 text-sm [--btn-face:#58c273] [--btn-shadow:#3aa458]"
                  >
                    ステージを おえる 🎉
                  </Link>
                ) : (
                  /*
                    最後の教材でも、終わる前は出さない。会話の途中で
                    「ステージを おえる」が光っていると、途中で押して終われる——
                    押した学習者は、やっていないことを やったことにされる。
                  */
                  <span className="bg-panel-tint text-ink-soft rounded-2xl px-5 py-2 text-sm font-black">
                    この {contentKindMeta(current?.type ?? "article").label}が おわると ステージを
                    おえられます
                  </span>
                )}
              </nav>
            </>
          )}
        </div>
      </div>

      {celebrating && (
        <StageClearCard stageId={stage.id} onStay={() => setCelebrationClosed(true)} />
      )}
    </div>
  );
}

/** 完走の お祝い。ここから ステージへ もどれる（行き止まりを 作らない）。 */
function StageClearCard({ stageId, onStay }: { stageId: string; onStay: () => void }) {
  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center px-4"
      style={{ background: "rgba(0,79,141,.35)" }}
    >
      <section
        role="dialog"
        aria-label="ステージ クリア"
        className="card-island w-full max-w-sm p-6 text-center"
      >
        <CelebrationBurst pieces={20} />
        <NexMax variant="cheer" size={96} bob className="mx-auto" />
        <h2 className="text-navy mt-2 text-2xl font-black">ステージ クリア！🎉</h2>
        <p className="text-ink mt-2 text-sm leading-relaxed font-bold">
          さいごまで やりきったね。よく がんばりました！
        </p>
        <Link
          href={`/${stageId}`}
          className="btn-game mt-5 inline-flex px-6 py-3 [--btn-face:#58c273] [--btn-shadow:#3aa458]"
        >
          ステージに もどる ▶
        </Link>
        <button
          type="button"
          onClick={onStay}
          className="text-ink-soft mt-3 block w-full text-xs font-extrabold"
        >
          ここに のこる
        </button>
      </section>
    </div>
  );
}

/** ステージの中の並び。広い画面では左に出しっぱなし、せまい画面はたたむ。 */
function StageRail({
  stage,
  items,
  codes,
  currentIndex,
  openable,
  open,
  onToggle,
}: {
  stage: FrameStage;
  items: readonly FrameItem[];
  codes: readonly string[];
  currentIndex: number;
  /** その教材を いま ひらけるか（関門でない種別は いつでも true）。 */
  openable: readonly boolean[];
  open: boolean;
  onToggle: () => void;
}) {
  const list = (
    <ol className="space-y-1">
      {items.map((item, index) => {
        const meta = contentKindMeta(item.type);
        const badge = STATUS_BADGE[(codes[index] ?? "0") as "0" | "1" | "2"];
        const here = index === currentIndex;
        const reachable = openable[index] === true;
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
