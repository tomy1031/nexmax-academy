"use client";

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
  return (
    <div className="card-island flex items-center gap-1.5 overflow-x-auto p-2">
      {steps.map((step, at) => {
        const now = current === step.key;
        return (
          <button
            key={step.key}
            type="button"
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
      {children}
    </div>
  );
}
