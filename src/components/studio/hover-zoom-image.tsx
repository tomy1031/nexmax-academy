"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * マウスを のせている あいだだけ 大きく 出す 絵。
 *
 * とうじょう人物の 絵は、一覧でも 詳細でも 小さい（80px・160px）。
 * ところが 中身は 設定画（正面・よこ・うしろ ＋ 表情6つ）や 口の 形ちがいで、
 * **小さいままでは 見分けが つかない**。先生は「どの人か」「どの口か」を
 * 確かめるためだけに 1件ずつ 開くことになる。のせた あいだ 大きく 出せば、
 * 開かずに その場で 確かめられる。
 *
 * ## 置き方
 * `position: fixed` で 画面に 直に 置く。カードの 中に 重ねると、親の 角丸や
 * はみ出し切りで 端が 欠ける。出す 場所は 絵の となり——右に 入らなければ 左へ、
 * 縦は 画面の中へ 押しこむ。大きさは 画面より 大きくしない。
 *
 * ## マウス以外
 * hover だけだと、キーボードや タッチの人には 一生 出ない。だから 絵じたいを
 * tabIndex で 止まれるようにして、focus でも 出す。
 *
 * ## 差しかえの 都合
 * 引き金は `<img>` そのものにする。外側を `<span>` で 包むと、呼ぶ側が 付けている
 * `shrink-0` や `h-20 w-20` が 効く相手が ずれて、並びが 崩れる。
 */

/** 出す絵の 一辺（px）。画面が 小さい ときは 画面に あわせて 縮める。 */
const MAX_SIZE = 480;
/** 小さい絵と ポップアップの すきま（px）。画面のふちからも これだけ 空ける。 */
const GAP = 12;
/** わく・すきま・見出しの ぶん。絵の 高さは この ぶん 引いて 収める。 */
const CHROME = 48;

interface Spot {
  left: number;
  top: number;
  size: number;
}

export function HoverZoomImage({
  src,
  alt = "",
  className,
  label,
}: {
  src: string;
  alt?: string;
  /** 小さいほうの 絵の 見た目。一覧と 詳細で ちがうので 呼ぶ側が 決める。 */
  className: string;
  /** 大きい絵の 下に 出す 一言（だれの 絵か・どの 口か）。 */
  label?: string;
}) {
  const [spot, setSpot] = useState<Spot | null>(null);

  const show = useCallback((target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const size = Math.min(MAX_SIZE, window.innerWidth - GAP * 2, window.innerHeight - GAP * 2);
    const right = rect.right + GAP;
    const left = right + size <= window.innerWidth ? right : Math.max(GAP, rect.left - GAP - size);
    const wanted = rect.top + rect.height / 2 - size / 2;
    const top = Math.max(GAP, Math.min(wanted, window.innerHeight - size - GAP));
    setSpot({ left, top, size });
  }, []);

  const hide = useCallback(() => setSpot(null), []);

  // 出したまま 画面が 動くと、絵から 離れた ところに 取り残される。動いたら 引っこめる。
  useEffect(() => {
    if (!spot) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [spot, hide]);

  return (
    <>
      {/* next/image は外部URLの許可設定が要るため、ここは素の img で出す */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        tabIndex={0}
        className={`${className} cursor-zoom-in`}
        onMouseEnter={(event) => show(event.currentTarget)}
        onMouseLeave={hide}
        onFocus={(event) => show(event.currentTarget)}
        onBlur={hide}
      />
      {spot ? (
        <div
          // 下の 絵の hover を 奪わない。奪うと 出た とたんに 消える／ちらつく
          className="border-navy pointer-events-none fixed z-50 rounded-2xl border-4 bg-white p-2 shadow-2xl"
          style={{ left: spot.left, top: spot.top, width: spot.size }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            className="w-full rounded-xl object-contain"
            style={{ maxHeight: spot.size - CHROME }}
          />
          {label ? <p className="text-navy mt-1 text-center text-xs font-black">{label}</p> : null}
        </div>
      ) : null}
    </>
  );
}
