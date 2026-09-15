"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { RubyText } from "@/components/ruby-text";
import type { FuriganaIndex } from "@/lib/text/furigana";

/**
 * **いま どこに いるか**の 帯 — ミーティングと 朝礼・夕礼で 同じ ものを 使う
 *
 * ## なぜ 1つに まとめたか
 * 2026-09-15 の 指定「共通化を 図りたいので、極力 同じで 済む ところは デザインを
 * そのまま 適用するように して。作り直さず、元の ものを そのまま 使うように して」。
 *
 * もとは ミーティングの「ばん」の 帯（`01 ヘンディさんから しつもん` /
 * `02 ヘンディさんに しつもん 🔒`）。朝礼・夕礼は 別に 丸い 曜日タブを
 * 持って いた ので、**同じ 役目の ものが 2つの 見た目**で 並んで いた。
 *
 * ## 3つの 顔
 * - **いま**（`current`）… 濃い 空色の 地に 白。押されて いる ことが 一目で 分かる
 * - **済んだ**（`cleared`）… うすい 地に ✅。戻れる ことを 見せる
 * - **まだ**（`locked`）… 灰色で 押せない。**消さずに 残す**——消えると
 *   「さっき あった ものが 無い」と 探しはじめる
 *
 * ## はみ出した ぶんは 横に すべる（両方の 画面で 同じ）
 * 390px では どちらの 画面も 帯が 1行に 収まらない。**収まらない こと 自体**が
 * 問題では なく、**切れて いる ことが 見えない**のが 問題だった——2026-09-15 の
 * 通しプレイ検収で、朝礼の 帯が「04 木曜日 で きれいに 終わって 見える」＝
 * **5日 あるのに 4日しか 無い**と 読める ことが 分かった。
 *
 * 見た目は 変えずに 2つ 足して ある。**どちらの 画面にも 同じように 効く**。
 * 1. 右（左）に まだ 続きが ある あいだだけ **ふちを ぼかす**
 * 2. `current` が 変わったら **その 帯を 枠の 中へ すべらせる**
 */
export interface StepTab {
  /** 押された ときに 返す 値。 */
  readonly key: string;
  /** 帯に 出る 字（ふりがなを 合成する）。 */
  readonly label: string;
  /** まだ 開いて いない（灰色・押せない）。 */
  readonly locked?: boolean;
  /** もう 済んだ（✅）。 */
  readonly cleared?: boolean;
}

/** ふちを ぼかす 色（`card-island` の 地の 色）。 */
const ISLAND = "#fffaf0";

export function StepTabs({
  steps,
  current,
  note,
  disabled = false,
  index,
  onPick,
  children,
}: {
  readonly steps: readonly StepTab[];
  /** いま 見て いる 帯の `key`。 */
  readonly current: string;
  /** 帯の 右に 添える ひとこと（「全部 答えると 開きます」）。 */
  readonly note?: string;
  /** ぜんぶ 押せなく する（返事を 待って いる あいだ など）。いまの 帯は 押せる。 */
  readonly disabled?: boolean;
  readonly index: FuriganaIndex;
  readonly onPick: (key: string) => void;
  /** 帯の 右はしに 置く もの（`AnswerNotebook` など）。 */
  readonly children?: React.ReactNode;
}) {
  const strip = useRef<HTMLDivElement>(null);
  /** 左／右に まだ 続きが あるか（ぼかしを 出すか）。 */
  const [more, setMore] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = strip.current;
    if (!el) return;
    const rest = el.scrollWidth - el.clientWidth - el.scrollLeft;
    setMore({ left: el.scrollLeft > 1, right: rest > 1 });
  }, []);

  /*
   * 幅は 中身でも 端末の 向きでも 変わるので、`ResizeObserver` で 見張る。
   * `steps` が 増減した ときにも 測り直す。
   */
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    for (const child of Array.from(el.children)) watch.observe(child);
    return () => watch.disconnect();
  }, [measure, steps]);

  /*
   * いまの 帯を 枠の まん中へ。**`scrollIntoView` は 使わない**——`inline` を
   * 合わせても ページごと 縦に 動く ことが あり、会話の 途中で 画面が 飛ぶ。
   * 横の `scrollLeft` だけを 触れば、動くのは この 帯の 中だけ。
   */
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const now = el.querySelector<HTMLElement>(`[data-step-now="true"]`);
    if (!now) return;
    const box = el.getBoundingClientRect();
    const mark = now.getBoundingClientRect();
    el.scrollLeft += mark.left + mark.width / 2 - (box.left + box.width / 2);
    measure();
  }, [current, measure]);

  return (
    /*
      **右はしの もの（`children`）は すべらせない**。帯の 中に 置いて いた ころ、
      朝礼の ように 札が 5つ ある 画面では [報告メモ] が 枠の 外へ 押し出されて
      **一度も 見えなかった**（2026-09-15 の 390px / 1280px の 実機確認）。
      添付の 画面と 同じく、帯の 右上に いつも 見えて いる のが 正しい。
    */
    <div className="card-island flex items-center gap-1.5 p-2">
      <div className="relative min-w-0 flex-1">
        <div ref={strip} onScroll={measure} className="flex items-center gap-1.5 overflow-x-auto">
          {steps.map((step, at) => {
            const now = current === step.key;
            return (
              <button
                key={step.key}
                type="button"
                data-step-now={now ? "true" : undefined}
                onClick={() => onPick(step.key)}
                disabled={step.locked || (disabled && !now)}
                aria-current={now ? "step" : undefined}
                aria-label={`${step.label}${
                  step.locked ? "（まだ ひらきません）" : step.cleared ? "・報告 ずみ" : ""
                }`}
                className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold disabled:opacity-45"
                style={{
                  background: now
                    ? "var(--color-sky-deep)"
                    : step.cleared
                      ? "var(--color-panel-tint)"
                      : "transparent",
                  color: now
                    ? "#fff"
                    : step.cleared
                      ? "var(--color-ink-soft)"
                      : "var(--color-ink-faint)",
                }}
              >
                <span className="opacity-70">{`0${at + 1}`}</span>
                <RubyText text={step.label} index={index} show />
                {step.locked ? <span>🔒</span> : step.cleared ? <span>✅</span> : null}
              </button>
            );
          })}
          {note ? (
            <span className="text-ink-faint ml-1 shrink-0 text-[11px] font-bold">
              <RubyText text={note} index={index} show />
            </span>
          ) : null}
        </div>
        {/* 切れた 先が ある ことを、字を 読まなくても 分かる ように する。 */}
        {more.left ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-8"
            style={{ background: `linear-gradient(90deg, ${ISLAND}, transparent)` }}
          />
        ) : null}
        {more.right ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-8"
            style={{ background: `linear-gradient(270deg, ${ISLAND}, transparent)` }}
          />
        ) : null}
      </div>
      {children}
    </div>
  );
}
