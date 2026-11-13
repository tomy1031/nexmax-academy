"use client";

import { useEffect, useRef, useState } from "react";
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
 * 絵が 切りかわった 直後の 猶予。絵は 0.3秒 かけて 入れかわるので、「大丈夫そう」が まだ
 * 見えて いる あいだに 押した ぶんは 合格に する（判定は 学生に 有利に 倒す・P8）。
 */
const SWITCH_GRACE_MS = 600;

/**
 * 絵が 読みこめない ときに 待つ 上限。4枚が そろうまで 切りかえを 始めない（細い 回線で、
 * 見えない まま 時間が 進んで「待って 押せば 通る」に ならない ように）が、1枚が 落ちた
 * だけで 先へ 進めなく なるのも 困るので、ここで 打ち切る。
 */
const LOAD_TIMEOUT_MS = 15_000;

/**
 * 話しかける タイミング（要望 #723）— 相手の 席の 絵を 見て、今 話しかけて いいかを 決める。
 *
 * 絵は 5秒ごとに 電話中・忙しそう・ほかの 人と 話して いる・大丈夫そう を 切りかわる
 *（並びは `deskCycle`）。大丈夫そうな ときに 相手を 押せば、声かけ（相談の はじめ）へ 進む。
 * ちがう ときに 押すと、なぜ 待つのかを 出し、**その 絵を もう 5秒 のばす**（相手の じゃまを
 * した ぶん、待つ 時間が のびる）。押しつづけても 通れない ので、見て 待つ ことに なる。
 * 切りかえは 4枚が 読みこめて から 始める。
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
  /** まちがえて 押すたびに 1 ふえ、今の 絵の 5秒を 数え直す。 */
  const [round, setRound] = useState(0);
  const [loaded, setLoaded] = useState<readonly NovelDeskState[]>([]);
  const [timedOut, setTimedOut] = useState(false);
  const ready = timedOut || loaded.length >= Object.keys(desk).length;
  /**
   * まちがえて 押した ときの 状態と、その ときの 絵の 番号。**絵が 変わったら 出さない**——
   * 「今は 電話中です」が、絵が 大丈夫そうに 変わった あとも 残ると、押して よい ときに
   * 押さなく なる（2026-11-13 の 検収）。
   */
  const [wrong, setWrong] = useState<{ state: NovelDeskState; at: number } | null>(null);
  const state: NovelDeskState = cycle[at % cycle.length] ?? "ok";
  const changedAt = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setInterval(() => {
      changedAt.current = Date.now();
      setAt((now) => now + 1);
    }, DESK_SWITCH_MS);
    return () => window.clearInterval(timer);
  }, [ready, round]);

  const markLoaded = (key: NovelDeskState) =>
    setLoaded((now) => (now.includes(key) ? now : [...now, key]));

  const tap = () => {
    if (!ready) return;
    const before = at > 0 ? cycle[(at - 1) % cycle.length] : undefined;
    const justLeftOk = before === "ok" && Date.now() - changedAt.current < SWITCH_GRACE_MS;
    if (state === "ok" || justLeftOk) {
      onReady();
      return;
    }
    setWrong({ state, at });
    setRound((now) => now + 1);
    onWrong();
  };
  const shownWrong = wrong && wrong.at === at ? wrong.state : null;

  return (
    <div className="flex min-h-full flex-col justify-center space-y-2" data-testid="novel-approach">
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
      {/* 見分け方を 先に 言う（ヒントを 開かなくても 決められる ように・規律10） */}
      <ul
        className="text-navy grid gap-1 text-xs font-bold sm:grid-cols-2"
        data-testid="novel-approach-rule"
      >
        <li className="rounded-lg px-2 py-1" style={{ background: "var(--color-cream)" }}>
          ✋{" "}
          <RubyText
            text="待つ：電話中・とても 忙しそう・ほかの 人と 話して いる"
            index={index}
            show={show}
          />
        </li>
        <li className="rounded-lg px-2 py-1" style={{ background: "var(--color-sky-soft)" }}>
          👆{" "}
          <RubyText text="押す：大丈夫そう（仕事は して いても いい）" index={index} show={show} />
        </li>
      </ul>
      {translation ? (
        <p className="text-ink-soft text-xs font-medium">
          Wait: on the phone, very busy, talking with someone. Tap: they look OK (even while
          working).
        </p>
      ) : null}

      <button
        type="button"
        onClick={tap}
        className="relative mx-auto block aspect-[3/2] w-full max-w-[720px] cursor-pointer overflow-hidden rounded-2xl border-4 shadow-lg transition hover:scale-[1.01]"
        style={{ borderColor: "var(--color-sky)", background: "var(--color-ink)" }}
        aria-label={`${name}に 話しかける`}
        data-testid="novel-desk"
        data-desk-state={ready ? state : "loading"}
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
              loading="eager"
              sizes="(min-width: 640px) 640px, 100vw"
              onLoad={() => markLoaded(key)}
              onError={() => markLoaded(key)}
              className="object-cover transition-opacity duration-300"
              style={{ opacity: key === state ? 1 : 0 }}
              aria-hidden
            />
          ))}
        </motion.div>
        {ready ? (
          <span
            className="absolute top-2 left-2 rounded-full px-2.5 py-1 text-xs font-black text-white shadow"
            style={{ background: "rgba(15, 35, 70, 0.8)" }}
            aria-hidden
          >
            👆 <RubyText text={`${name}を 押す`} index={index} show={show} />
          </span>
        ) : null}
        {!ready ? (
          <span
            className="absolute inset-x-0 bottom-2 mx-auto w-fit rounded-full px-3 py-1 text-xs font-black text-white"
            style={{ background: "rgba(15, 35, 70, 0.75)" }}
          >
            <RubyText text="絵を 読みこんで います…" index={index} show={show} />
          </span>
        ) : null}
      </button>

      {shownWrong ? (
        <p
          role="status"
          className="rounded-xl px-3 py-2 text-sm font-black"
          style={{ background: "var(--color-cream)", color: "var(--color-navy)" }}
          data-testid="novel-approach-wrong"
        >
          ✖ <RubyText text={DESK_FEEDBACK[shownWrong]} index={index} show={show} />
          {translation ? (
            <span className="text-ink-soft block text-xs font-medium">
              {DESK_FEEDBACK_EN[shownWrong]}
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
