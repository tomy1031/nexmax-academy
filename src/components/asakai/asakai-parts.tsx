"use client";

/**
 * 朝礼・夕礼の 画面部品（台帳 #366）
 *
 * fable の UI 設計から、**数を 絵で 見せる** ところと **カードの 4つの 状態**を
 * ここに 切り出す。どれも 受け取った ものを 描くだけの 部品（状態を 持たない）。
 *
 * ## 画面に 出す ことば
 * 「パネル」は 学習者が 初めて 見る 語なので、画面では **カード**と 呼ぶ。
 * 「何が」は 単独だと 問いに 読めるので **こまって いる こと**。
 * 「進みぐあい」は ページに 無い 語なので **どこまで できたか**。
 */

import { RubyText } from "@/components/ruby-text";
import type { FuriganaIndex } from "@/lib/text/furigana";

/**
 * カードの 顔。
 *
 * `asked` は **いま 聞かれて いる**か、**箱が まだ 残って いる**（開いたが ⭕ で ない）。
 * 2つを 同じ 顔に して あるのは、どちらも 学習者が やる ことが 同じ
 *「まだ 言う ことが ある」だから（2026-09-11）。
 */
export type CardState = "closed" | "asked" | "open" | "missed";

const CARD_FACE: Record<CardState, { mark: string; cls: string; badge: string }> = {
  closed: { mark: "▢", cls: "border-hairline bg-white text-ink-soft", badge: "bg-ink-faint" },
  asked: { mark: "❓", cls: "border-sky-deep bg-sky-soft text-navy", badge: "bg-sky-deep" },
  open: { mark: "✓", cls: "border-leaf bg-leaf-soft text-navy", badge: "bg-leaf" },
  missed: { mark: "❌", cls: "border-coral bg-coral-soft text-navy", badge: "bg-coral" },
};

/**
 * 数を 四角と ✓ で 見せる。
 *
 * **数を 絵に 焼かない**（生成した 絵は 16/20 を 数えまちがえる）。
 * 字（「20この うち 16こ」）は 必ず 添える——記号だけでは 読めない 人が いる。
 */
export function CountBoxes({ total, done, now }: { total: number; done: number; now: number }) {
  const boxes = Array.from({ length: Math.min(total, 60) }, (_, i) => i);
  return (
    <span className="mt-1 flex flex-wrap items-center gap-0.5">
      {boxes.map((i) => (
        <span
          key={i}
          aria-hidden
          className={
            i < done
              ? "bg-leaf border-leaf h-3 w-3 rounded-[3px] border"
              : i < done + now
                ? "border-sun bg-cream h-3 w-3 rounded-[3px] border-2"
                : "border-hairline h-3 w-3 rounded-[3px] border bg-white"
          }
        />
      ))}
      <span className="text-ink ml-2 text-xs font-black tabular-nums">
        {total}この うち {done}こ
      </span>
    </span>
  );
}

/** どこまで できたか（5つの 箱）。名前は 字で、状態は 色と 形で。 */
export function ProgressBoxes({
  items,
  index,
}: {
  items: readonly { label: string; state: "done" | "now" | "later" }[];
  index: FuriganaIndex;
}) {
  return (
    <div>
      <p className="text-ink-soft text-[11px] font-black">
        <RubyText text="どこまで できたか" index={index} show />
      </p>
      <ul className="mt-1 grid grid-cols-5 gap-1">
        {items.map((item) => (
          <li key={item.label} className="min-w-0">
            <span
              aria-hidden
              className={
                item.state === "done"
                  ? "bg-leaf grid h-7 place-items-center rounded-lg text-sm text-white"
                  : item.state === "now"
                    ? "bg-sun grid h-7 place-items-center rounded-lg text-sm text-[#3b2a00]"
                    : "border-hairline text-ink-faint grid h-7 place-items-center rounded-lg border bg-white text-sm"
              }
            >
              {item.state === "done" ? "✓" : item.state === "now" ? "▶" : "▢"}
            </span>
            <span className="text-ink-soft mt-0.5 block text-center text-[10px] leading-tight break-keep">
              <RubyText text={item.label} index={index} show />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * カードの 板。**押せない**（`div` で 出す）。
 *
 * 上に 1行「報告すると 開きます（n / m）」を 置くのは、
 * **この 4枚が 何かを 言わないと ？が 残る**から（fable の 棚卸し）。
 */
export function CardBoard({
  cards,
  index,
}: {
  cards: readonly {
    id: string;
    label: string;
    state: CardState;
    boxes?: readonly { label: string; state: CardState }[];
  }[];
  index: FuriganaIndex;
}) {
  /*
   * **⭕ の 数だけを 数える**（2026-09-11）。
   *
   * 前は `open`（＝1つでも 言えた）で 数えて いた ので、こまりごとが
   * 3つの 箱の うち 1つしか 言えて いなくても「4 / 4」と 出て、
   * それでも 司会は 聞き返しつづけ、「おわり」の ボタンも 出なかった。
   * 数と 会話が ちがう ことを 言って いた。
   */
  const open = cards.filter((c) => c.state === "open").length;
  return (
    <div
      role="group"
      aria-label="カードの 板"
      className="border-hairline sticky top-0 z-10 border-b bg-white/95 px-2 py-2 backdrop-blur"
    >
      <p className="text-ink-soft mb-1 text-[11px] font-black">
        <RubyText text="報告すると 開きます" index={index} show />{" "}
        <span className="tabular-nums">
          （{open} / {cards.length}）
        </span>
        <span className="text-ink-faint ml-1 font-bold">
          ❓ <RubyText text="まだ 言う ことが あります" index={index} show />
        </span>
      </p>
      <ul className="grid grid-cols-4 gap-1.5">
        {cards.map((card) => {
          const face = CARD_FACE[card.state];
          return (
            <li
              key={card.id}
              className={`relative min-h-[64px] rounded-xl border-2 px-1.5 py-2 text-center ${face.cls}`}
            >
              <span
                aria-hidden
                className={`absolute -top-1.5 -left-1.5 grid h-5 w-5 place-items-center rounded-full text-[10px] font-black text-white ${face.badge}`}
              >
                {face.mark}
              </span>
              <span className="block text-[11px] leading-snug font-black break-keep">
                <RubyText text={card.label} index={index} show />
              </span>
              {card.boxes?.length ? (
                <span className="mt-1 block space-y-0.5">
                  {card.boxes.map((box) => (
                    <span
                      key={box.label}
                      className="text-ink-soft flex items-center gap-1 text-[10px] font-bold"
                    >
                      <span aria-hidden>{CARD_FACE[box.state].mark}</span>
                      <span className="min-w-0 text-left leading-tight break-keep">
                        <RubyText text={box.label} index={index} show />
                      </span>
                    </span>
                  ))}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** 朝／夕を 空の 色で 見せる 帯。字を 読まなくても どちらか 分かる。 */
export function SkyStrip({ kind }: { kind: "asa" | "yuu" }) {
  return (
    <span
      aria-hidden
      className="block h-6 flex-1 rounded-full"
      style={{
        background:
          kind === "asa"
            ? "linear-gradient(90deg,#bfe3ff,#fff6e0)"
            : "linear-gradient(90deg,#ffd9a8,#c9a7e8)",
      }}
    />
  );
}

/**
 * 月〜金の どこに いるか。押せない。
 *
 * **曜日の 1字にも ルビを 付ける**（規律2）。丸の 中は 1字なので 読み辞書に
 * 当てず 直に 書いて いた ころ、390px の 通しで 裸の「月 火 水 木 金」と
 * 「日目」が 出て いた（2026-09-11、e2e の 裸の漢字チェックが 先に 見つけた）。
 * 教材の 読み辞書に 曜日が あるとは かぎらないので、**読みは ここが 持つ**。
 */
const DAY_DOTS: readonly (readonly [string, string])[] = [
  ["月", "げつ"],
  ["火", "か"],
  ["水", "すい"],
  ["木", "もく"],
  ["金", "きん"],
];

/** 「◯日目」の 読み（1日目＝いちにちめ）。 */
const NTH_DAY = ["", "いちにちめ", "ふつかめ", "みっかめ", "よっかめ", "いつかめ"];

/** 「◯日」の 読み（5日＝いつか）。 */
const DAYS = ["", "いちにち", "ふつか", "みっか", "よっか", "いつか"];

export function DayDots({ at }: { at: number }) {
  return (
    <span className="flex items-center gap-1" aria-label={`5日の うち ${at + 1}日目`}>
      {DAY_DOTS.map(([day, reading], i) => (
        <span
          key={day}
          className={
            i < at
              ? "bg-leaf grid h-6 w-6 place-items-center rounded-full text-[11px] font-black text-white"
              : i === at
                ? "bg-navy ring-sky-soft grid h-6 w-6 place-items-center rounded-full text-[11px] font-black text-white ring-2"
                : "border-hairline text-ink-faint grid h-6 w-6 place-items-center rounded-full border bg-white text-[11px] font-black"
          }
        >
          <ruby>
            {day}
            <rt className="text-[7px] leading-none">{reading}</rt>
          </ruby>
        </span>
      ))}
      <span className="text-ink-soft ml-1 text-[11px] font-black">
        <ruby>
          {at + 1}日目
          <rt className="text-[7px] leading-none">{NTH_DAY[at + 1] ?? ""}</rt>
        </ruby>
      </span>
    </span>
  );
}

/**
 * 「◯日目 / ◯日」（時間カードの 進みぐあい）。**読みは ここが 持つ**——DayDots と 同じ 理由に
 * もう 1つ ある。`annotateRuby` は **漢字の 位置からしか 辞書を 引かない**ので、
 * 数字で 始まる「2日目」「5日」は 教材の 読み辞書に **永久に 当たらない**。
 * 当たるのは うしろの 1字だけで、画面は **ふたにちめ・ごにち** と 読ませて いた
 *（2026-09-11 の 数字＋助数詞の 読み監査で 見つけた）。
 */
export function DayProgress({ at, total }: { at: number; total: number }) {
  return (
    <>
      <ruby>
        {at}日目
        <rt>{NTH_DAY[at] ?? ""}</rt>
      </ruby>
      {" / "}
      <ruby>
        {total}日<rt>{DAYS[total] ?? ""}</rt>
      </ruby>
    </>
  );
}
