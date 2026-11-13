"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, useAnimate } from "motion/react";
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
import { useGameFrame } from "./game-frame";

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
 *（並びは `deskCycle`）。絵は ゲームの 画面 いっぱいに 出し、**真ん中の「◯◯さんに 話しかける」**
 * を 大丈夫そうな ときに 押せば、声かけ（相談の はじめ）へ 進む（2026-11-13 の 指定）。
 * ちがう ときに 押すと、**絵を 横に ゆらし、絵の 中に**「✖ 今は 電話中です。…」を 出す
 *（同日の 指定）。その 絵は もう 5秒 のびる（相手の じゃまを した ぶん、待つ 時間が のびる）。
 * 押しつづけても 通れない ので、見て 待つ ことに なる。
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
  const frame = useGameFrame();
  /* まちがえた ときに 絵を 横に ゆらす */
  const [scope, animate] = useAnimate<HTMLDivElement>();

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
    if (scope.current) {
      void animate(scope.current, { x: [0, -16, 16, -12, 12, -6, 6, 0] }, { duration: 0.5 });
    }
    onWrong();
  };
  const shownWrong = wrong && wrong.at === at ? wrong.state : null;

  /* 縦長（スマホ）は 絵を 切らずに 入れる（ほかの 人と 話して いる 絵の 右の 人が 切れない）。横長は いっぱいに */
  const fit = frame.layout === "wide" ? "object-cover" : "object-contain";

  return (
    <div
      className="relative h-full min-h-[320px] overflow-hidden rounded-2xl"
      style={{ background: "var(--color-ink)" }}
      data-testid="novel-approach"
    >
      {/* 絵（画面いっぱい）。まちがえたら 横に ゆれる */}
      <div ref={scope} className="absolute inset-0">
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
              sizes="100vw"
              onLoad={() => markLoaded(key)}
              onError={() => markLoaded(key)}
              className={`${fit} transition-opacity duration-300`}
              style={{ opacity: key === state ? 1 : 0 }}
              aria-hidden
            />
          ))}
        </motion.div>
      </div>

      {/* 上: 何を するかと 見分け方（ヒントを 開かなくても 決められる ように・規律10） */}
      <div
        className="absolute inset-x-2 top-2 space-y-1 rounded-xl px-2.5 py-1.5 shadow"
        style={{ background: "rgba(255,255,255,0.9)" }}
      >
        <p className="text-navy text-xs font-black sm:text-sm">
          👀{" "}
          <RubyText
            text={`今 ${name}に 話しかけて いいですか？ よく 見て、いいと 思ったら 下の ボタンで 声を かけます。`}
            index={index}
            show={show}
          />
        </p>
        <p
          className="text-navy flex flex-wrap gap-x-2 text-[11px] font-bold"
          data-testid="novel-approach-rule"
        >
          <span>
            ✋{" "}
            <RubyText
              text="待つ：電話中・とても 忙しそう・ほかの 人と 話して いる"
              index={index}
              show={show}
            />
          </span>
          <span>
            👆{" "}
            <RubyText
              text="押す：大丈夫そう（仕事は して いても いい）"
              index={index}
              show={show}
            />
          </span>
        </p>
        {translation ? (
          <p className="text-ink-soft text-[11px] font-medium">
            Is it OK to talk to {name} now? Wait if they are on the phone, very busy, or talking
            with someone. Tap the button when they look OK (even while working).
          </p>
        ) : null}
      </div>

      {/* 真ん中より 下: 判定（絵の 中）と「◯◯さんに 話しかける」 */}
      <div className="absolute inset-x-3 bottom-4 flex flex-col items-center gap-2">
        {shownWrong ? (
          <p
            role="status"
            className="w-full max-w-md rounded-xl px-3 py-2 text-center text-sm font-black shadow-lg"
            style={{ background: "rgba(255,255,255,0.95)", color: "var(--color-coral-deep)" }}
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
        <button
          type="button"
          onClick={tap}
          disabled={!ready}
          className="btn-island btn-game px-6 py-3 text-base disabled:opacity-60"
          aria-label={`${name}、今 お時間 よろしいでしょうか？`}
          data-testid="novel-desk"
          data-desk-state={ready ? state : "loading"}
        >
          {ready ? (
            <>
              🗣{" "}
              <RubyText
                text={`${name}、今 お時間 よろしいでしょうか？`}
                index={index}
                show={show}
              />
            </>
          ) : (
            <RubyText text="絵を 読みこんで います…" index={index} show={show} />
          )}
        </button>
      </div>
    </div>
  );
}
