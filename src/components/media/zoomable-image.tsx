"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";

/**
 * 絵を「ひろげて」見る — 教材の 絵は どれも これで 包む
 *
 * ## なぜ 要るか
 * 説明の 図は 元が 1134〜1600px あるのに、本文の 中では 400〜640px で 出て いる。
 * ふりがなの ような 小さい 字は そこで 潰れる。かと いって **一律に 大きく はできない**
 *——てじゅんの サムネイル（80px）は「7つ ある」という 並びを 目で 追う ための 大きさで、
 * 大きく すると 順番の 形が 画面から 消える（2026-08-25 の 指定）。
 *
 * だから **並びは そのまま、見たい ときだけ 全画面**に する。
 *
 * ## ⛶ を いつも 見せる
 * 「押すと 大きく なる」を 文章で 説明しても、N4に 満たない 学習者には 届かない
 *（2026-08-30 の 指定）。だから hover でも 長押しでもなく、**しるしを 出しっぱなし**に する。
 * 絵そのものが ボタンなので、どこを 押しても 開く。
 *
 * ## 全画面は 2段構え
 * スライド（`slide-deck.tsx`）と 同じ。iPhone の Safari では `requestFullscreen()` が
 * 要素に 効かないので、
 *   ① 自前で `fixed inset-0` に 広げる（どの 端末でも 効く）
 *   ② そのうえで 本物の 全画面も 頼む（効く 端末では ブラウザの 枠まで 消える）
 * の順に 重ねる。②が 断られても ①が 残る。
 */
export function ZoomableImage({
  children,
  /** 読み上げと、ひろげた ときの 見出しに 使う。 */
  label,
  /** ⛶ の 大きさ。小さな サムネイルでは `"small"`。 */
  size = "normal",
  className = "",
  closeOnBackdrop = false,
}: {
  children: React.ReactNode;
  label?: string;
  size?: "normal" | "small";
  className?: string;
  /**
   * ひろげた 絵の **外側を 押しても もどす**（「✕ もどす」と 同じ `collapse`）。
   *
   * 2026-10-09 の 指定「写真を 拡大した 場合に、右上の「もどす」ボタンだけでなく、
   * 写真の 外側の 領域クリックでも 戻すと 同じ 挙動に なるように」。朝礼の 報告メモの
   * しごとの 絵（`TaskPicture`）だけが 渡す。**既定は false**——記事・スキット・
   * リッチブロックの 絵は これまでどおり 「✕ もどす」か Esc で だけ もどる。
   * 絵そのものを 押しても もどらない（拡大した 絵の 文字を 指で 探す ときに 閉じて しまう）。
   */
  closeOnBackdrop?: boolean;
}) {
  const [wide, setWide] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);

  const expand = useCallback(() => {
    setWide(true);
    void shellRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  const collapse = useCallback(() => {
    setWide(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, []);

  // ブラウザの 全画面を Esc で 抜けた ときに、自前の 広げ表示だけ 残さない
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setWide(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // 広げて いる あいだは 後ろのページを 動かさない
  useEffect(() => {
    if (!wide) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [wide]);

  // 全画面APIが 効かない 端末のため、Esc でも もどす
  useEffect(() => {
    if (!wide) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") collapse();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [wide, collapse]);

  const badge =
    size === "small"
      ? "absolute right-0.5 bottom-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/45 text-[10px] text-white"
      : "absolute right-2 bottom-2 rounded-full bg-black/45 px-2.5 py-1 text-xs font-black text-white";

  return (
    <>
      <button
        type="button"
        onClick={expand}
        aria-label={label ? `${label}（ひろげて 見る）` : "絵を ひろげて 見る"}
        /*
          **`w-full` が 要る。** button は `display:block` に しても 中身に 合わせて
          縮む（shrink-to-fit）ので、中の 絵が `w-full` だと 幅が 決まらず 潰れる——
          実際に 1048px の 欄で 8px に なった。小さな サムネイルは 縮んで よいので、
          そちらは 幅を 指定しない。
        */
        className={`relative cursor-zoom-in ${size === "small" ? "inline-block" : "block w-full"} ${className}`}
      >
        {children}
        <span aria-hidden className={badge}>
          {size === "small" ? "⛶" : "⛶ ひろげる"}
        </span>
      </button>

      {wide ? (
        <ZoomedView shellRef={shellRef} onClose={collapse} closeOnBackdrop={closeOnBackdrop}>
          {children}
        </ZoomedView>
      ) : null}
    </>
  );
}

/**
 * ひろげた 全画面の 中身。**フックを 持たない**（ふるまいは 呼ぶ側の `collapse` に 任せる）。
 *
 * `closeOnBackdrop` の ときだけ、**絵の 外側**（暗い 幕と、絵を 真ん中に 置く 枠）を
 * 押すと `onClose` を 呼ぶ。見分けは `event.target === event.currentTarget`——
 * 絵（子）を 押した click は `target` が 絵に なる ので、ここでは 閉じない。
 *
 * 閉じる click は **ここで 止める**（`stopPropagation`）。親の ポップアップ
 *（`ModalShell` の 幕）まで 届くと、絵だけ 閉じるつもりが 報告メモごと 閉じて しまう。
 * 「✕ もどす」は これまでどおり 自分の `onClick` だけで 動く。
 */
export function ZoomedView({
  shellRef,
  onClose,
  closeOnBackdrop = false,
  children,
}: {
  shellRef?: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  closeOnBackdrop?: boolean;
  children: React.ReactNode;
}) {
  const closeFromBackdrop = closeOnBackdrop
    ? (event: MouseEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) return;
        event.stopPropagation();
        onClose();
      }
    : undefined;
  return (
    <div
      ref={shellRef}
      onClick={closeFromBackdrop}
      className="fixed inset-0 z-50 flex flex-col gap-2 bg-[#0b2138] p-2 sm:p-3"
    >
      {/*
        中身は そのまま 入れ子に する。`[&_img]:…` で 中の 絵だけを
        画面いっぱいに 伸ばす——包んで いる 側（記事・クイズ・スキット）が
        それぞれ 別の 大きさの class を 付けて いる ので、ここで 上書きする。
      */}
      <div
        onClick={closeFromBackdrop}
        className="grid min-h-0 flex-1 place-items-center [&_img]:!h-auto [&_img]:!max-h-[92vh] [&_img]:!w-auto [&_img]:!max-w-full [&_img]:!object-contain"
      >
        {children}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="absolute top-3 right-3 rounded-full bg-black/45 px-3 py-1.5 text-xs font-black text-white"
      >
        ✕ もどす
      </button>
    </div>
  );
}
