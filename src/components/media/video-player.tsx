"use client";

import { useState } from "react";
import { parseYouTubeId, youTubeEmbedUrl, youTubeThumbnail, youTubeWatchUrl } from "@/lib/video";

/**
 * 動画（ファイル と YouTube）— よみものと リスニングで 同じ ものを 使う
 *
 * 2026-08-29 の 指定「ファイルの場合と youtube の場合と」。
 *
 * ## どちらでも「押すまで 落とさない」
 * ファイルは `preload="none"`。YouTube は **押すまで iframe を 作らない**——
 * 埋め込みを 置いた だけで プレイヤー一式（数百KB）と 見た 記録が 流れるので、
 * 絵と 再生ボタンだけを 出して おき、押した ときに 初めて 差しこむ。
 * カンボジアの 教室で 30人が 同じ ページを 開く（docs/constraints.md）ので、
 * ここが ゆるむと 1ページで 回線が 埋まる。
 *
 * ## 高さで 抑える
 * たての 動画（9:16）が 混ざる。幅いっぱいに 出すと 1本で 画面 2つぶんの 高さに
 * なる（旧アプリの 30分ルールは 704x1280 だった）。
 */
export function VideoPlayer({
  src,
  youtube,
  poster,
  label,
  className = "",
  mediaRef,
}: {
  /** ファイルの ばしょ（`/video/...`）。 */
  src?: string;
  /** YouTube の URL か ID。 */
  youtube?: string;
  /** 読みこむ 前に 出す 絵。 */
  poster?: string;
  /** 読み上げ用の せつめい。 */
  label?: string;
  className?: string;
  /**
   * ファイルの ときだけ 使う（速さを 変える ため）。
   * YouTube は 別の 会社の 枠なので こちらから 触れない。
   */
  mediaRef?: React.RefObject<HTMLMediaElement | null>;
}) {
  const [playing, setPlaying] = useState(false);
  const videoId = youtube ? parseYouTubeId(youtube) : null;

  const shell = `mx-auto max-h-[70vh] max-w-full rounded-[20px] bg-black ${className}`;

  if (videoId) {
    if (!playing) {
      return (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={label ? `${label}（動画を さいせいする）` : "動画を さいせいする"}
          className={`relative block aspect-video w-full overflow-hidden ${shell}`}
        >
          {/*
            YouTube の 絵は 外から 来る ので `next/image` に 通さない（`unoptimized` でも
            置き場の 決まりを 通る 必要が ある）。ふつうの img で 十分——1枚 15KB ほど。
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={poster ?? youTubeThumbnail(videoId)}
            alt=""
            className="h-full w-full object-cover opacity-80"
          />
          <span
            aria-hidden
            className="absolute inset-0 grid place-items-center text-5xl text-white drop-shadow-lg"
          >
            ▶
          </span>
        </button>
      );
    }
    return (
      <div className="mx-auto max-w-full">
        <div className={`aspect-video w-full overflow-hidden ${shell}`}>
          <iframe
            src={youTubeEmbedUrl(videoId, { autoplay: true })}
            title={label ?? "動画"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="h-full w-full border-0"
          />
        </div>
        {/*
          学校の 回線が 埋め込みを 断る ことが ある（そのときは 白い 枠しか 見えない）。
          逃げ道を 最初から 見せて おく——リンク教材で 同じ 手を 打って ある。
        */}
        <a
          href={youTubeWatchUrl(videoId)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky mt-1 block text-right text-xs font-black underline underline-offset-4"
        >
          YouTube で ひらく ↗
        </a>
      </div>
    );
  }

  if (!src) {
    /*
     * YouTube の 貼り方が 読めなかった とき（`youtube` は あるのに ID が 取れない）。
     * **黙って 消さない**——先生には 保存できた ように 見えて、学習者の 画面からだけ
     * 動画が 無くなる のが いちばん 見えない 壊れ方 なので、その場で 言う。
     */
    return (
      <p
        data-slot="empty"
        className="border-hairline text-ink-soft rounded-[20px] border-2 border-dashed p-4 text-center text-sm font-bold"
      >
        {youtube
          ? "YouTube の ばしょを 読み取れませんでした。動画の ページの URL を そのまま 入れてください。"
          : "動画の ばしょが 入って いません。"}
      </p>
    );
  }

  return (
    <video
      ref={mediaRef as React.RefObject<HTMLVideoElement | null>}
      src={src}
      poster={poster}
      controls
      preload="none"
      playsInline
      aria-label={label}
      className={shell}
    />
  );
}
