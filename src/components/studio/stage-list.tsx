"use client";

import Link from "next/link";
import type { Stage } from "@/content/schema";
import { contentKindMeta } from "@/lib/content-kinds";
import { MiniButton, SourceBadge } from "./studio-ui";

/**
 * ステージの一覧＝マップの並び
 *
 * 上から順に、そのままマップの停留所になる。**並び替えはここでしかしない**——
 * ステージ編集の中に ばんごう の入力欄を置くと、2つのステージが同じ番号になり、
 * 先生から見ると「並び替えたのに順番が変わらない」という直しようのない状態になる。
 * ↑↓ で となりと入れ替えるだけなら、そうはならない。
 */
export function StageList({
  stages,
  dbStatusOf,
  busy,
  onOpen,
  onNew,
  onMove,
  onRemove,
}: {
  /** ならび順（order 昇順）に並べたもの。 */
  stages: readonly Stage[];
  dbStatusOf: (kind: string, id: string) => "draft" | "published" | null;
  busy: boolean;
  onOpen: (stage: Stage) => void;
  onNew: () => void;
  onMove: (index: number, delta: number) => void;
  onRemove: (stage: Stage) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="card-island flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-ink-soft text-sm font-bold">
          上から じゅんに マップの 停留所に なります（{stages.length}こ）。
        </p>
        <button
          type="button"
          onClick={onNew}
          className="btn-game px-4 py-2 text-sm [--btn-face:#004f8d] [--btn-shadow:#003c6b]"
        >
          ＋ あたらしい ステージ
        </button>
      </div>

      {stages.length === 0 ? (
        <section className="card-island p-5">
          <p className="text-ink-soft font-bold">
            まだ ステージが ありません。「＋ あたらしい ステージ」から はじめてください。ステージを
            1つ 作ると、マップに 停留所が 1つ 出ます。
          </p>
        </section>
      ) : (
        <ol className="space-y-2">
          {stages.map((stage, index) => {
            const status = dbStatusOf("stage", stage.id);
            const kinds = [...new Set(stage.contents.map((content) => content.type))];
            return (
              <li
                key={stage.id}
                className="border-hairline flex flex-wrap items-center gap-3 rounded-2xl border-2 bg-white p-3"
              >
                <span className="bg-navy grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black text-white">
                  {index + 1}
                </span>
                {stage.area?.image ? (
                  // next/image は外部URLの許可設定が要るため、ここは素の img で出す
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={stage.area.image}
                    alt=""
                    className="border-hairline h-14 w-11 shrink-0 rounded-lg border-2 object-cover"
                  />
                ) : (
                  <span className="border-hairline text-ink-faint grid h-14 w-11 shrink-0 place-items-center rounded-lg border-2 border-dashed text-[10px] font-bold">
                    絵なし
                  </span>
                )}

                <div className="min-w-[12rem] flex-1">
                  <p className="text-navy font-black">
                    {stage.title.length > 0 ? stage.title : "（見出しが まだ）"}
                    {stage.status === "draft" ? (
                      <span className="text-ink-soft ml-2 text-xs font-black">したがき</span>
                    ) : null}
                    {/* 地図に出ないステージ。「消えている」のか「そういう設定」なのかが
                        一覧で分からないと、先生は毎回 中を開いて確かめることになる。 */}
                    {!stage.listed ? (
                      <span className="text-ink-soft ml-2 text-xs font-black">地図に 出さない</span>
                    ) : null}
                  </p>
                  <p className="text-ink-faint text-xs font-bold">/{stage.id}</p>
                  <p className="text-ink-soft text-xs font-bold">
                    {kinds.length === 0
                      ? "まだ 中身が ありません"
                      : kinds
                          .map(
                            (kind) =>
                              `${contentKindMeta(kind).icon} ${contentKindMeta(kind).label}`,
                          )
                          .join("・")}
                  </p>
                </div>

                <SourceBadge status={status} />

                <div className="flex flex-wrap gap-1">
                  <MiniButton
                    onClick={() => onMove(index, -1)}
                    disabled={busy || index === 0}
                    title="上へ"
                  >
                    ↑
                  </MiniButton>
                  <MiniButton
                    onClick={() => onMove(index, 1)}
                    disabled={busy || index === stages.length - 1}
                    title="下へ"
                  >
                    ↓
                  </MiniButton>
                  {/*
                    新しいタブで開く。同じタブで飛ぶと、書きかけのステージの下書きが消える
                    （下書きはブラウザの中にしか無い）。
                  */}
                  <Link
                    href={`/${stage.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="border-hairline text-navy rounded-full border-2 bg-white px-4 py-1 text-xs font-black"
                  >
                    見る ↗
                  </Link>
                  <MiniButton tone="accent" onClick={() => onOpen(stage)}>
                    ✎ ひらく
                  </MiniButton>
                  {status ? (
                    <MiniButton tone="danger" onClick={() => onRemove(stage)}>
                      けす
                    </MiniButton>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
