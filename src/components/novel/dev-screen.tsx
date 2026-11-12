"use client";

import type { NovelScreen } from "@/content/schema";
import { RubyText } from "@/components/ruby-text";
import { assetUrl } from "@/lib/asset-url";
import type { FuriganaIndex } from "@/lib/text/furigana";

/**
 * 開発中の 画面（小さい 窓・結果の「前 → 後」）。
 *
 * 学生が 作って いる ネットショップを、**ブラウザの 窓の 形**で 見せる。
 * 相談した 結果、画面が どう 変わったかを 目で 見られる ように する（仕様書 v4 §1「結果 —
 * 相手の 返事と、開発中の 画面の 変化で 見せる」）。
 *
 * 字は 教材の データの まま（ふりがなは 教材の 辞書で 付ける）。
 */
const STATE_MARK: Record<string, { mark: string; color: string; label: string }> = {
  ok: { mark: "○", color: "var(--color-leaf-deep)", label: "できた" },
  broken: { mark: "×", color: "var(--color-coral-deep)", label: "出ない" },
  new: { mark: "＋新しい", color: "var(--color-coral-deep)", label: "新しい" },
  bad: { mark: "×", color: "var(--color-coral-deep)", label: "まちがい" },
};

export function DevScreen({
  screen,
  index,
  show,
  size = "small",
  testId,
}: {
  screen: NovelScreen;
  index: FuriganaIndex;
  show: boolean;
  size?: "small" | "large";
  testId?: string;
}) {
  const large = size === "large";
  return (
    <div
      data-testid={testId}
      className={`overflow-hidden rounded-xl border-2 bg-white shadow ${large ? "text-sm" : "text-[11px]"}`}
      style={{ borderColor: "var(--color-hairline)" }}
    >
      <div
        className="flex items-center gap-1 px-2 py-1"
        style={{ background: "var(--color-sky-soft)" }}
      >
        <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-coral)" }} />
        <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-sun)" }} />
        <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-leaf)" }} />
        <span className="text-navy ml-1 truncate font-black">
          <RubyText text={screen.title} index={index} show={show} />
        </span>
      </div>
      <div className={large ? "space-y-1.5 p-3" : "space-y-1 p-2"}>
        {screen.rows.map((row, i) => {
          const state = row.state ? STATE_MARK[row.state] : null;
          return (
            <div
              key={`${row.label}-${i}`}
              className="flex items-center gap-2 rounded-lg px-1.5 py-1"
              style={
                row.state === "new"
                  ? {
                      background: "var(--color-panel-tint)",
                      outline: "2px solid var(--color-coral)",
                    }
                  : undefined
              }
            >
              {row.image ? (
                row.state === "broken" ? (
                  <span
                    aria-label="画像が 出ない"
                    className={`grid shrink-0 place-items-center rounded border-2 border-dashed font-black ${large ? "h-12 w-12 text-lg" : "h-7 w-7 text-xs"}`}
                    style={{ borderColor: "var(--color-coral)", color: "var(--color-coral-deep)" }}
                  >
                    ✕
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- 小さな 商品の 絵（最適化は 使わない設定）
                  <img
                    src={assetUrl(row.image)}
                    alt=""
                    className={`shrink-0 rounded object-contain ${large ? "h-12 w-12" : "h-7 w-7"}`}
                  />
                )
              ) : null}
              <span className="text-navy shrink-0 font-bold whitespace-nowrap">
                <RubyText text={row.label} index={index} show={show} />
              </span>
              {row.value ? (
                <span className="text-ink-soft min-w-0 font-bold">
                  <RubyText text={row.value} index={index} show={show} />
                </span>
              ) : row.image ? null : (
                <span
                  className={`flex-1 rounded border ${large ? "h-6" : "h-4"}`}
                  style={{ borderColor: "var(--color-hairline)" }}
                  aria-hidden
                />
              )}
              {state ? (
                <span
                  className="ml-auto shrink-0 font-black"
                  style={{ color: state.color }}
                  title={state.label}
                >
                  <RubyText text={state.mark} index={index} show={show} />
                </span>
              ) : null}
            </div>
          );
        })}
        {screen.button ? (
          <div className="pt-1 text-right">
            <span
              className="text-on-accent inline-block rounded-lg px-3 py-1 font-black"
              style={{ background: "var(--color-sky-deep)" }}
            >
              <RubyText text={screen.button} index={index} show={show} />
            </span>
          </div>
        ) : null}
        {screen.note ? (
          <p className="text-ink-soft font-bold">
            <RubyText text={screen.note} index={index} show={show} />
          </p>
        ) : null}
      </div>
    </div>
  );
}
