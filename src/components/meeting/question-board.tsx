"use client";

import { motion } from "motion/react";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex, type FuriganaIndex } from "@/lib/text/furigana";

/**
 * しつもんの カード列 — 相手の 顔の すぐ下に 出す「きょう やる こと」の 板
 *
 * ## 伏せ札を やめ、そして 戻って きた（2026-08-20）
 * もとは 伏せ札 →「はなせた こと（n/m）」の 小さな チップ → いまの カード列。
 * チップは 場所を 取らない かわりに、**きょう 何を するのかが 分からなかった**。
 * 添付の 画面（2026-08-20 の 指定）に そろえて、
 * **答えた ものは しつもんの ことばが 見え、まだの ものは ？ で 伏せる**形に する。
 *
 * これは P2 の「開く箱」——できなかった ことを 数えるのでは なく、
 * **ひらいた 数が そのまま ごほうびに なる**（P8: 罰を 見せない）。
 *
 * ## 板は **ばんの 数だけ** ある（2026-08-21）
 * ラウンド2に 入っても この 板が ラウンド1の まま だった ため、
 * 帯は 02 に なって いるのに **画面の いちばん 目立つ ところが 01**、という
 * ちぐはぐが 起きて いた（「02 からの はずなのに 01 が ひらかれて いた」）。
 * ばんが 変われば 板も 変わる。
 *
 * ## 2つの 板の ちがい
 * | | ラウンド1（`QuestionCards`） | ラウンド2（`DiscoverCards`） |
 * | --- | --- | --- |
 * | 中身 | 聞かれる しつもん | 聞くと 答えて くれる こと |
 * | はじめ | **？ で 伏せる**（答えると 出る） | **最初から 見せる**（聞く ことが 分からないと 動けない） |
 * | ✓ | 答えた とき | 聞けた とき |
 *
 * ラウンド2で 伏せない のは、**聞く 側が 学習者**だから。何が 聞けるのか
 * 分からない まま 白い 画面に 向かうのは、設計01 P6 の アンチパターン
 *「足場なしの『自由に 聞いて みましょう』」そのものだった。
 */

/** 板の 見出しに 出る 漢字の 読み（教材の 読み辞書とは 混ぜない・規律2）。 */
const BOARD_FURIGANA = buildFuriganaIndex([
  ["質問", "しつもん"],
  ["答", "こた"],
  ["開", "ひら"],
  ["聞", "き"],
]);

/** 1枚の カード（2つの 板で 同じ 形を つかう）。 */
function BoardCard({
  at,
  label,
  open,
  missed = false,
  now,
  pop,
  reveal,
  furigana,
  ariaLabel,
  onPick,
}: {
  /** 何ばんめか（0始まり）。 */
  at: number;
  label: string;
  /** ✓ が ついた か。 */
  open: boolean;
  /** できなかった か（赤い 印）。 */
  missed?: boolean;
  /** いま この カードの ところに いる か（枠を 出す）。 */
  now: boolean;
  /** いま 開いた ばかりか（1回だけ 光らせる）。 */
  pop: boolean;
  /** まだ ✓ が つく 前でも ことばを 見せる か。 */
  reveal: boolean;
  furigana: FuriganaIndex;
  ariaLabel: string;
  /** 押すと もう一度 やる（無い ときは 押せない）。 */
  onPick?: () => void;
}) {
  const shown = open || missed || reveal;
  const face = {
    background: missed
      ? "color-mix(in srgb, var(--color-coral) 16%, white)"
      : shown
        ? "#fff"
        : "color-mix(in srgb, var(--color-sky) 22%, white)",
    borderColor: missed ? "var(--color-coral-deep)" : now ? "var(--color-sky-deep)" : "transparent",
  };
  const body = (
    <>
      <span
        className="absolute -top-1.5 -left-1.5 grid h-5 w-5 place-items-center rounded-full text-[10px] font-black text-white"
        style={{
          background: missed
            ? "var(--color-coral-deep)"
            : open
              ? "var(--color-leaf)"
              : "var(--color-sky-deep)",
        }}
      >
        {missed ? "！" : open ? "✓" : at + 1}
      </span>
      {shown ? (
        <span
          className="block text-[11px] leading-snug font-black break-words"
          style={{ color: open || missed ? "var(--color-ink)" : "var(--color-ink-soft)" }}
        >
          <RubyText text={label} index={furigana} show />
        </span>
      ) : (
        <span className="text-sky-deep block text-lg font-black opacity-70">？</span>
      )}
      {/*
        **押せる ことを 字で 言う**。赤い 印だけ 見せて 押し方を 書かないと、
        できなかった ことを 突きつけるだけの 板に なる（設計01 P8）。
      */}
      {missed && onPick ? (
        <span
          className="mt-1 block text-[10px] font-black"
          style={{ color: "var(--color-coral-deep)" }}
        >
          <RubyText text="もう いちど" index={BOARD_FURIGANA} show />
        </span>
      ) : null}
    </>
  );

  return (
    /*
      **名前は `li` に つける**。押せる ように した とき 名前を ボタンへ 移した ら、
      札の 一覧を 名前で 探す 検査が 当たらなく なった（2026-08-23 の e2e）。
      並びの 意味（何ばんめが どうなったか）は `li` が 持つ ものなので、ここに 置く。
    */
    <motion.li
      aria-label={ariaLabel}
      animate={pop ? { scale: [1, 1.12, 1] } : { scale: 1 }}
      transition={{ duration: 0.5 }}
      className="relative"
    >
      {onPick ? (
        <button
          type="button"
          onClick={onPick}
          className="relative block min-h-[72px] w-full rounded-xl border-2 px-1.5 py-4 text-center"
          style={face}
        >
          {body}
        </button>
      ) : (
        <div
          className="relative min-h-[72px] rounded-xl border-2 px-1.5 py-4 text-center"
          style={face}
        >
          {body}
        </div>
      )}
    </motion.li>
  );
}

export function QuestionCards({
  order,
  labels,
  openIds,
  currentId,
  justOpenedId,
  missedIds,
  furigana,
  onPick,
}: {
  /** しつもんの 並び（id）。 */
  order: readonly string[];
  /** id → カードに 出す みじかい ことば。 */
  labels: Readonly<Record<string, string>>;
  /** 話せた しつもんの id。 */
  openIds: ReadonlySet<string>;
  /** いま 聞かれて いる しつもんの id。 */
  currentId: string | null;
  /** いま 開いた ばかりの id（1回だけ 光らせる）。 */
  justOpenedId: string | null;
  /** できなかった しつもんの id（赤い 印を つけ、押すと やり直せる）。 */
  missedIds: ReadonlySet<string>;
  /** 教材の 読み辞書（カードの 漢字に ふりがなを 合成する）。 */
  furigana: FuriganaIndex;
  /** 押した ときに もう一度 やる（無い ときは 押せない）。 */
  onPick?: (id: string) => void;
}) {
  return (
    <div className="rounded-[var(--radius-card)] bg-[color-mix(in_srgb,var(--color-sky)_14%,white)] p-3">
      <p className="text-navy mb-2 text-sm font-black">
        🎁 {order.length}つの <RubyText text="質問" index={BOARD_FURIGANA} show />
        <span
          className="text-ink-soft ml-2 text-xs font-bold"
          aria-label={`ひらいた カード ${openIds.size} / ${order.length}`}
        >
          <RubyText text="答えると、カードが 開きます" index={BOARD_FURIGANA} show />（
          {openIds.size} / {order.length}）
        </span>
      </p>
      <ol className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {order.map((id, at) => {
          const missed = missedIds.has(id);
          const done = openIds.has(id);
          return (
            <BoardCard
              key={id}
              at={at}
              label={labels[id] ?? ""}
              open={done}
              missed={missed}
              now={currentId === id}
              pop={justOpenedId === id}
              reveal={false}
              furigana={furigana}
              /*
               * 押せるのは **答えた ものと、いま 聞かれて いる もの**まで
               *（2026-08-25 の 指定「今までに回答した問題＋次の問題までクリックOK」）。
               * さきの しつもんへは 飛ばさない——順に 聞かれる ことが 会話の 形なので、
               * 先回りできると「もう 聞かれた ことに 答えた」が 崩れる。
               */
              onPick={onPick && (done || missed || currentId === id) ? () => onPick(id) : undefined}
              ariaLabel={
                missed
                  ? `${at + 1}ばんめ もう いちど`
                  : done
                    ? `${at + 1}ばんめ こたえました`
                    : `${at + 1}ばんめ まだです`
              }
            />
          );
        })}
      </ol>
    </div>
  );
}

/**
 * ラウンド2の 板 — **聞くと 答えて くれる こと**を 先に 見せる。
 *
 * 当たり判定は 画面の 外（`noteDiscovered`）が 持つ。ここは 見せるだけ。
 */
export function DiscoverCards({
  order,
  labels,
  foundIds,
  justFoundId,
  hostName,
  furigana,
}: {
  /** 見つける ことの 並び（id）。 */
  order: readonly string[];
  /** id → カードに 出す ことば（`discover.label`）。 */
  labels: Readonly<Record<string, string>>;
  /** 聞き出せた id。 */
  foundIds: ReadonlySet<string>;
  /** いま 聞けた ばかりの id（1回だけ 光らせる）。 */
  justFoundId: string | null;
  hostName: string;
  furigana: FuriganaIndex;
}) {
  return (
    <div className="rounded-[var(--radius-card)] bg-[color-mix(in_srgb,var(--color-sun)_16%,white)] p-3">
      <p className="text-navy mb-2 text-sm font-black">
        🔎 {hostName}さんに <RubyText text="聞いて みよう" index={BOARD_FURIGANA} show />
        <span
          className="text-ink-soft ml-2 text-xs font-bold"
          aria-label={`きけた カード ${foundIds.size} / ${order.length}`}
        >
          <RubyText text="聞けると、カードが 開きます" index={BOARD_FURIGANA} show />（
          {foundIds.size} / {order.length}）
        </span>
      </p>
      <ol className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {order.map((id, at) => (
          <BoardCard
            key={id}
            at={at}
            label={labels[id] ?? ""}
            open={foundIds.has(id)}
            now={false}
            pop={justFoundId === id}
            reveal
            furigana={furigana}
            ariaLabel={foundIds.has(id) ? `${at + 1}ばんめ きけました` : `${at + 1}ばんめ まだです`}
          />
        ))}
      </ol>
    </div>
  );
}
