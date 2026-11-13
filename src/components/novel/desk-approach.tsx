"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion } from "motion/react";
import type { Novel } from "@/content/schema";
import { RubyText } from "@/components/ruby-text";
import { assetUrl } from "@/lib/asset-url";
import {
  DESK_FEEDBACK,
  DESK_FEEDBACK_EN,
  DESK_SWITCH_MS,
  deskCycle,
  type NovelDeskState,
} from "@/lib/novel/state";
import type { FuriganaIndex } from "@/lib/text/furigana";

type Desk = NonNullable<Novel["cast"][number]["desk"]>;

/**
 * 話しかける タイミング（要望 #723）— 相手の 席の 絵を 見て、今 話しかけて いいかを 決める。
 *
 * 絵は 5秒ごとに 電話中・忙しそう・ほかの 人と 話して いる・大丈夫そう を 切りかわる
 *（並びは `deskCycle`）。大丈夫そうな ときに 相手を 押せば、声かけ（相談の はじめ）へ 進む。
 * ちがう ときに 押すと、なぜ 待つのかを 出して、絵は そのまま 動きつづける。
 *
 * ここで まちがえても 相談の 星は 減らさない——星は「相談の 中身が 伝わったか」の 目印なので、
 * 別の ことを 混ぜない。
 *
 * 4枚は 重ねて 読みこんで おき、見せる 1枚を 切りかえる（切りかわる たびに 読みこむと、
 * 教室の 回線では 白い 間が 出る）。忙しそうな ときは 小きざみに ゆらして、あせりを 見せる
 *（tomy さんの 指定「忙しそうな時は焦っている表情と動作」）。
 */
export function DeskApproach({
  desk,
  seed,
  name,
  index,
  show,
  translation,
  onWrong,
  onReady,
}: {
  desk: Desk;
  /** 並びを 決める 種（相談の 場面の id）。 */
  seed: string;
  /** 相手の 名前（「ヘンディさん」）。 */
  name: string;
  index: FuriganaIndex;
  show: boolean;
  translation: boolean;
  onWrong: () => void;
  /** 大丈夫そうな ときに 押した。 */
  onReady: () => void;
}) {
  const cycle = deskCycle(seed);
  const [at, setAt] = useState(0);
  const [wrong, setWrong] = useState<NovelDeskState | null>(null);
  const state: NovelDeskState = cycle[at % cycle.length] ?? "ok";

  useEffect(() => {
    const timer = window.setInterval(() => setAt((now) => now + 1), DESK_SWITCH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const tap = () => {
    if (state === "ok") {
      onReady();
      return;
    }
    setWrong(state);
    onWrong();
  };

  return (
    <div className="space-y-2" data-testid="novel-approach">
      <p className="text-navy text-sm font-black">
        👀{" "}
        <RubyText
          text={`今 ${name}に 話しかけて いいですか？ よく 見て、いいと 思ったら ${name}を 押しましょう。`}
          index={index}
          show={show}
        />
        {translation ? (
          <span className="text-ink-soft block text-xs font-medium">
            Is it OK to talk to {name} now? Look carefully, and tap them when it is a good time.
          </span>
        ) : null}
      </p>

      <button
        type="button"
        onClick={tap}
        className="relative block aspect-[3/2] w-full overflow-hidden rounded-2xl border-2"
        style={{ borderColor: "var(--color-hairline)", background: "var(--color-ink)" }}
        aria-label={`${name}に 話しかける`}
        data-testid="novel-desk"
        data-desk-state={state}
      >
        <motion.div
          className="absolute inset-0"
          animate={
            state === "busy"
              ? { x: [0, -3, 3, -2, 2, 0] }
              : state === "ok"
                ? { x: 0, scale: [1, 1.01, 1] }
                : { x: 0, scale: 1 }
          }
          transition={
            state === "busy"
              ? { duration: 0.35, repeat: Infinity, ease: "linear" }
              : state === "ok"
                ? { duration: 3, repeat: Infinity, ease: "easeInOut" }
                : { duration: 0.2 }
          }
        >
          {(Object.keys(desk) as NovelDeskState[]).map((key) => (
            <Image
              key={key}
              src={assetUrl(desk[key]) ?? desk[key]}
              alt=""
              fill
              priority
              sizes="(min-width: 640px) 640px, 100vw"
              className="object-cover transition-opacity duration-300"
              style={{ opacity: key === state ? 1 : 0 }}
              aria-hidden
            />
          ))}
        </motion.div>
      </button>

      {wrong ? (
        <p
          role="status"
          className="rounded-xl px-3 py-2 text-sm font-black"
          style={{ background: "var(--color-cream)", color: "var(--color-navy)" }}
          data-testid="novel-approach-wrong"
        >
          ✖ <RubyText text={DESK_FEEDBACK[wrong]} index={index} show={show} />
          {translation ? (
            <span className="text-ink-soft block text-xs font-medium">
              {DESK_FEEDBACK_EN[wrong]}
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
