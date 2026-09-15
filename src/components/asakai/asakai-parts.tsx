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

/**
 * カードの 顔。**ミーティングの 板（`QuestionCards`）と 同じ 作り**に そろえて ある
 *（2026-09-15 の 指定「元の ものを そのまま 使って 欲しい」「枠で 囲んで 見やすく」）。
 *
 * 地の 色と ふちで 状態を 言い、左上の 丸で もう一度 言う——**色だけに 頼らない**。
 */
const CARD_FACE: Record<CardState, { mark: string; face: string; edge: string; badge: string }> = {
  closed: {
    mark: "▢",
    face: "color-mix(in srgb, var(--color-sky) 22%, white)",
    edge: "transparent",
    badge: "var(--color-sky-deep)",
  },
  asked: {
    mark: "❓",
    face: "color-mix(in srgb, var(--color-sky) 22%, white)",
    edge: "var(--color-sky-deep)",
    badge: "var(--color-sky-deep)",
  },
  open: { mark: "✓", face: "#fff", edge: "var(--color-leaf)", badge: "var(--color-leaf)" },
  missed: {
    mark: "❌",
    face: "color-mix(in srgb, var(--color-coral) 16%, white)",
    edge: "var(--color-coral-deep)",
    badge: "var(--color-coral-deep)",
  },
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

/**
 * どこまで できたか — **金曜日までの しごとを ぜんぶ 表に 並べる**
 *
 * 2026-09-15 の 指定「金曜日までに する タスクを 5つだけでは なく **全て** 表形式で 並べ、
 * 終わった ものは 終わった ことが 分かる ように チェックを 入れて 欲しい」。
 *
 * 前は 5つの 箱を 横に 並べて いた。担当表（原本）の しごとは 10ある ので、
 * **5つに まとめた 時点で どれが 終わったのかが 言えなく なって** いた
 *（報告で「きのう したこと」を 言う ときに 見る ものなのに）。
 *
 * 状態は **印と ことばの 両方**で 言う（色だけに 頼らない）。
 *
 * ## 「n / 10」は 出さない
 * 最初は 見出しに「（2 / 10）」を 添えて いたが、すぐ 上の 付せんが
 *「◯◯機能 ぜんたいの 進捗: 20%」と 言って いる ので、**同じ 機能の 進み具合を
 * 名のる 数字が 2つ、ちがう 値で 並ぶ**（2026-09-15 の 通しプレイ検収。木曜は
 * 60% と 7 / 10 が 3行 ちがいで 同時に 見えて いた）。
 *
 * 2つは もともと 別の ものを 数えて いる——付せんは **手間の 割合**（報告で 言う 数字）、
 * この 表は **しごとの 状態**。学習者に その 区別は 求められないので、
 * 数字を 名のるのは 付せんに 一本化し、表は ✅ で どれが 終わったかだけを 見せる。
 */
const PROGRESS_FACE: Record<"done" | "now" | "later", { mark: string; word: string; cls: string }> =
  {
    done: { mark: "✅", word: "おわり", cls: "bg-leaf text-white" },
    now: { mark: "▶", word: "いま", cls: "bg-sun text-[#3b2a00]" },
    later: { mark: "▢", word: "これから", cls: "border-hairline text-ink-faint border bg-white" },
  };

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
      <table className="border-hairline mt-1 w-full border-collapse overflow-hidden rounded-lg border bg-white text-left">
        <thead>
          <tr className="bg-panel-tint text-ink-soft text-[10px] font-black">
            <th scope="col" className="px-2 py-1">
              <RubyText text="しごと" index={index} show />
            </th>
            <th scope="col" className="w-20 px-2 py-1 text-right">
              <RubyText text="じょうたい" index={index} show />
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const face = PROGRESS_FACE[item.state];
            return (
              <tr key={item.label} className="border-hairline border-t">
                <td className="text-ink px-2 py-1 text-[11px] leading-tight font-bold break-words">
                  <RubyText text={item.label} index={index} show />
                </td>
                <td className="px-2 py-1 text-right">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-black whitespace-nowrap ${face.cls}`}
                  >
                    <span aria-hidden>{face.mark}</span>
                    <RubyText text={face.word} index={index} show />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
    /*
      枠は **ミーティングの 板と 同じ**（色の ついた 面の 中に カードを 並べる）。
      前は 白い 帯に 細い ふちの カードを 置いて いた ので、4つが 地に 溶けて
      「きのう したこと」「きょう すること」が 読み取りにくかった（2026-09-15 の 指定）。
    */
    <div
      role="group"
      aria-label="カードの 板"
      className="sticky top-0 z-10 rounded-[var(--radius-card)] bg-[color-mix(in_srgb,var(--color-sky)_14%,white)] p-3 backdrop-blur"
    >
      <p className="text-navy mb-2 text-sm font-black">
        📋 <RubyText text="報告すると 開きます" index={index} show />
        <span className="text-ink-soft ml-2 text-xs font-bold tabular-nums">
          （{open} / {cards.length}）
        </span>
        <span className="text-ink-soft ml-2 text-xs font-bold">
          ❓ <RubyText text="まだ 言う ことが あります" index={index} show />
        </span>
      </p>
      <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {cards.map((card) => {
          const face = CARD_FACE[card.state];
          return (
            <li
              key={card.id}
              className="text-navy relative min-h-[72px] rounded-xl border-2 px-1.5 py-4 text-center"
              style={{ background: face.face, borderColor: face.edge }}
            >
              <span
                aria-hidden
                className="absolute -top-1.5 -left-1.5 grid h-5 w-5 place-items-center rounded-full text-[10px] font-black text-white"
                style={{ background: face.badge }}
              >
                {face.mark}
              </span>
              <span className="block text-[11px] leading-snug font-black break-words">
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

/** 「◯日目」の 読み（1日目＝いちにちめ）。 */
const NTH_DAY = ["", "いちにちめ", "ふつかめ", "みっかめ", "よっかめ", "いつかめ"];

/** 「◯日」の 読み（5日＝いつか）。 */
const DAYS = ["", "いちにち", "ふつか", "みっか", "よっか", "いつか"];

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
