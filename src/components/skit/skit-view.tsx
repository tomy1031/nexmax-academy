"use client";

import Image from "next/image";
import { ZoomableImage } from "@/components/media/zoomable-image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Skit, SkitRole } from "@/content/schema";
import { NexMax } from "@/components/nexmax";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex } from "@/lib/text/furigana";
import { recordContentProgress } from "@/lib/progress/store";

/**
 * **画面の ことばの 読みは 画面が 持つ**（教材の 読み辞書とは 混ぜない）。
 *
 * 教材の `furigana` で 出そうとすると、読みが 付くかどうかが **教材しだい**に なる
 *——たまたま「聞」を 使って いない スキットでは、ボタンだけ 裸の 漢字に なる。
 * docs/constraints.md「画面の 読みは 画面が 持つ」と 同じ 置きかた。
 */
const UI_FURIGANA = buildFuriganaIndex([["聞", "き"]]);

/**
 * スキット — お手本の 会話を 1行ずつ 聞いて、口に 出して まねる
 *
 * ## リスニングと 何が ちがうか
 * リスニングは **聞き取れたかを 測る**ので 台本を 伏せる。こちらは 逆で、
 * 台本を 見ながら 声に 出すのが 目的。だから ここには 伏せる 仕組みが 無い。
 *
 * ## 1行に 1つの スピーカー
 * まねる 練習は「その1行だけ」を 何度も 聞ける ことが すべてで、通しの 音では
 * 戻る 手間が 毎回 かかる。だから **行ごとに 鳴らす**。通しで 聞きたい ときの
 * ために「ぜんぶ 聞く」も 置くが、そちらは おまけである。
 *
 * ## 音が まだ 無い 行は ブラウザに 読ませる
 * `audioUrl` が 空でも スピーカーは 押せる（`speechSynthesis` で 鳴らす）。
 * 旧アプリの スキットも そう していた。先生が 音を 作る 前でも 教材として
 * 成り立たせる ため——**音の 用意が 遅れただけで 教材が 使えなく なる**のは、
 * 絵の 用意が 遅れただけで 人物が 消えるのと 同じ 種類の 事故である。
 */
export function SkitView({ skit, embedded }: { skit: Skit; embedded?: boolean }) {
  const furigana = useMemo(() => buildFuriganaIndex(skit.furigana ?? []), [skit.furigana]);
  const [furiganaOn, setFuriganaOn] = useState(true);

  /** いま 鳴っている 行（光らせる）。鳴っていなければ null。 */
  const [playing, setPlaying] = useState<number | null>(null);
  /** 「ぜんぶ 聞く」の 最中か。 */
  const [runningAll, setRunningAll] = useState(false);
  const [done, setDone] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  /**
   * 「ぜんぶ 聞く」を 止めたい ときの 合図。
   *
   * state を 見に 行くと **鳴らし始めた ときの 値**を 見つづける（クロージャ）ので、
   * 止めても 次の行が 鳴りだす。ref なら いつ 読んでも いまの値。
   */
  const stoppedRef = useRef(false);

  const roleOf = useMemo(() => {
    const map = new Map<string, SkitRole>(skit.roles.map((role) => [role.id, role]));
    return map;
  }, [skit.roles]);

  /** 鳴っている ものを 全部 止める（音声ファイルも 読み上げも）。 */
  const stopAll = useCallback(() => {
    stoppedRef.current = true;
    setRunningAll(false);
    setPlaying(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  // 画面を 離れるときに 音を 残さない（別の教材へ 進んだのに 声だけ 追いかけてくる）
  useEffect(() => stopAll, [stopAll]);

  /**
   * 1行を 鳴らし、鳴り終わるまで 待つ。
   *
   * 「ぜんぶ 聞く」が 順に 待てるように Promise を 返す。どちらの 鳴らし方でも
   * **必ず解決する**——途中で 失敗したまま 止まると、通し再生が そこで 固まる。
   */
  const playLine = useCallback(
    (index: number): Promise<void> => {
      const line = skit.lines[index];
      if (!line) return Promise.resolve();
      setPlaying(index);

      return new Promise<void>((resolve) => {
        const finish = () => {
          setPlaying((current) => (current === index ? null : current));
          resolve();
        };

        if (line.audioUrl) {
          const audio = new Audio(line.audioUrl);
          audioRef.current = audio;
          audio.onended = finish;
          // 取れなかった ときも 先へ 進める（1行の 欠けで 通しが 止まらない）
          audio.onerror = finish;
          void audio.play().catch(finish);
          return;
        }

        if (typeof window === "undefined" || !("speechSynthesis" in window)) {
          finish();
          return;
        }
        const utterance = new SpeechSynthesisUtterance(line.text);
        utterance.lang = "ja-JP";
        // お手本なので 少し ゆっくり（まねる 相手が 速いと 口が 追いつかない）
        utterance.rate = 0.9;
        utterance.onend = finish;
        utterance.onerror = finish;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      });
    },
    [skit.lines],
  );

  /** スピーカーの ボタン。押すたび 頭から 鳴らし直す。 */
  const onSpeaker = useCallback(
    (index: number) => {
      const wasPlaying = playing === index && !runningAll;
      stopAll();
      if (wasPlaying) return; // もう一度 押したら 止める
      stoppedRef.current = false;
      recordContentProgress(skit.id, { status: "started" });
      void playLine(index);
    },
    [playLine, playing, runningAll, skit.id, stopAll],
  );

  const playAll = useCallback(async () => {
    stopAll();
    stoppedRef.current = false;
    setRunningAll(true);
    recordContentProgress(skit.id, { status: "started" });
    for (let i = 0; i < skit.lines.length; i += 1) {
      if (stoppedRef.current) break;
      await playLine(i);
    }
    setRunningAll(false);
    setPlaying(null);
  }, [playLine, skit.id, skit.lines.length, stopAll]);

  const markDone = useCallback(() => {
    setDone(true);
    recordContentProgress(skit.id, { status: "completed" });
  }, [skit.id]);

  return (
    <div className={embedded ? "" : "mx-auto w-full max-w-4xl px-4 py-6"}>
      <section className="card-island p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-4">
          <NexMax variant="hello" size={72} bob />
          <div className="min-w-0 flex-1">
            <h1 className="text-ink text-2xl font-extrabold break-words sm:text-3xl">
              <RubyText text={skit.title} index={furigana} show={furiganaOn} />
            </h1>
            <p className="text-ink-soft mt-1 font-bold break-words">
              <RubyText text={skit.description} index={furigana} show={furiganaOn} />
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFuriganaOn((on) => !on)}
            aria-pressed={furiganaOn}
            className={`rounded-full border-2 px-3 py-1 text-xs font-extrabold ${
              furiganaOn ? "bg-sky border-sky text-white" : "border-hairline text-ink-soft bg-panel"
            }`}
          >
            ふりがな {furiganaOn ? "ON" : "OFF"}
          </button>
        </div>

        <p className="bg-panel-tint text-ink mt-4 rounded-2xl px-4 py-3 leading-relaxed font-bold">
          🎯 <RubyText text={skit.focus} index={furigana} show={furiganaOn} />
        </p>

        {skit.cover?.src ? (
          <div className="mt-4 overflow-hidden rounded-2xl">
            <Image
              src={skit.cover.src}
              alt=""
              width={1200}
              height={675}
              className="h-auto w-full"
              unoptimized
            />
          </div>
        ) : null}

        {/* だれが 話すか。立場が 読めないと 敬語の 宛先が 分からない */}
        <ul className="mt-4 flex flex-wrap gap-2">
          {skit.roles.map((role) => (
            <li
              key={role.id}
              className="border-hairline bg-panel flex items-center gap-2 rounded-full border-2 px-3 py-1 text-sm font-black"
              style={{ borderColor: ACCENT[role.accent] }}
            >
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: ACCENT[role.accent] }}
                aria-hidden
              />
              <span className="text-ink">
                <RubyText text={role.name} index={furigana} show={furiganaOn} />
              </span>
              <span className="text-ink-soft text-xs">
                <RubyText text={role.role} index={furigana} show={furiganaOn} />
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={runningAll ? stopAll : () => void playAll()}
            className="btn-game px-6 py-3 [--btn-face:#0288d1] [--btn-shadow:#0272ae]"
          >
            <RubyText text={runningAll ? "■ とめる" : "▶ ぜんぶ 聞く"} index={UI_FURIGANA} />
          </button>
          <button
            type="button"
            onClick={markDone}
            className={
              done
                ? "bg-sky-soft text-navy rounded-full px-4 py-2 text-sm font-black"
                : "btn-game px-5 py-2 text-sm [--btn-face:#58c273] [--btn-shadow:#3aa458]"
            }
          >
            {done ? "✅ おわりました" : "おわりました"}
          </button>
        </div>
      </section>

      <ol data-skit="lines" className="mt-4 flex flex-col gap-3">
        {skit.lines.map((line, index) => {
          const role = roleOf.get(line.speaker);
          const isNarration = line.speaker === "narration";
          const right = role?.side === "right";
          const active = playing === index;
          const accent = role ? ACCENT[role.accent] : "#8aa0b4";

          if (isNarration) {
            return (
              <li key={index} className="flex justify-center">
                <p className="text-ink-soft bg-panel-tint rounded-2xl px-4 py-2 text-center text-sm font-bold">
                  <RubyText text={line.text} index={furigana} show={furiganaOn} />
                </p>
              </li>
            );
          }

          return (
            <li key={index} className={`flex ${right ? "justify-end" : "justify-start"}`}>
              <div className={`flex max-w-[46rem] min-w-0 flex-col ${right ? "items-end" : ""}`}>
                <span className="text-ink-soft px-1 text-xs font-black">
                  <RubyText text={role?.name ?? line.speaker} index={furigana} show={furiganaOn} />
                  {role?.role ? (
                    <span className="ml-1 font-bold">
                      （<RubyText text={role.role} index={furigana} show={furiganaOn} />）
                    </span>
                  ) : null}
                </span>

                <div
                  className={`mt-1 flex items-start gap-3 rounded-2xl border-2 bg-white p-3 transition-shadow ${
                    active ? "shadow-[0_0_0_4px_rgba(79,168,232,0.35)]" : ""
                  }`}
                  style={{ borderColor: accent }}
                >
                  {/*
                    スピーカーは **セリフの 左**に 固定する。行ごとに 位置が 変わると、
                    押す たびに 目で さがす ことに なる（何度も 押す ボタンなので効く）。
                  */}
                  <button
                    type="button"
                    onClick={() => onSpeaker(index)}
                    aria-label={active ? "とめる" : "聞く"}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg text-white"
                    style={{ backgroundColor: accent }}
                  >
                    {active ? "■" : "🔊"}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="text-ink leading-relaxed font-bold">
                      <RubyText text={line.text} index={furigana} show={furiganaOn} />
                    </p>
                    {line.note ? (
                      <p className="text-ink-soft mt-2 text-sm font-bold">
                        💡 <RubyText text={line.note} index={furigana} show={furiganaOn} />
                      </p>
                    ) : null}
                  </div>

                  {line.image?.src ? (
                    /*
                      **切らずに 全体を 見せる**（`object-cover` → `object-contain`）。
                      3:2 の 絵を 正方形に 切って いた ので、横の 1/3 が 画面から
                      消えて いた。大きさは そのまま——押すと 全画面に なる。
                    */
                    <ZoomableImage label={line.note} size="small" className="shrink-0">
                      <Image
                        src={line.image.src}
                        alt=""
                        width={320}
                        height={320}
                        className="bg-panel h-20 w-20 rounded-xl object-contain sm:h-28 sm:w-28"
                        unoptimized
                      />
                    </ZoomableImage>
                  ) : line.image ? (
                    /*
                      まだ 無い 絵は **空けずに 点線わく**を 出す（2026-08-27 の指定）。
                      空けたままだと 作り忘れが 誰にも 見えない。
                    */
                    <span
                      data-slot="empty"
                      className="border-hairline text-ink-soft grid h-20 w-20 shrink-0 place-items-center rounded-xl border-2 border-dashed text-center text-[10px] font-bold sm:h-28 sm:w-28"
                    >
                      ここに 絵が 入ります
                    </span>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** ふきだしの 色。リスニングの タイル（call-shell.tsx）と 同じ 5色にそろえる。 */
const ACCENT: Record<SkitRole["accent"], string> = {
  sky: "#4fa8e8",
  leaf: "#58c273",
  sun: "#ffc93c",
  coral: "#f26fa7",
  grape: "#a78bfa",
};
