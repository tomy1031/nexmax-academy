"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import type { Listening } from "@/content/schema";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex, type FuriganaIndex } from "@/lib/text/furigana";
import { getProfile } from "@/lib/profile";
import { recordContentProgress } from "@/lib/progress/store";
import { CallShell } from "@/components/call-shell";
import { ListeningPanel } from "./listening-panel";
import { revealRate, type ListeningState } from "./listening-checks";

/**
 * リスニング — 「聞く」教材
 *
 * 画面は3つに分かれる。**勝手に始めない**のが要点で、
 * 開いた瞬間に音が鳴ると、学習者は身構える前に聞き逃す。
 *
 *  1. まえおき … 何に注目して聞くかを渡し、「はじめる」を押してもらう（設計01 P6）
 *  2. きく    … 音を流し、聞こえた ことばを 入れて 原稿を ひらいていく
 *  3. たしかめ … 原稿を1行ずつ ひらいて 答え合わせし、つぎの教材へ送る
 *
 * ## 台本は既定で見せない
 * 見えていると「読む練習」になり、聞く練習にならない。出したい先生・行き詰まった
 * 学習者のために ON/OFF は残す（教材ごとの既定は `check.showScript`）。
 *
 * ## 画面の型
 * `mode: "player"` はふつうの再生プレイヤー。`mode: "call"` は Zoom風。
 * 聞くだけの教材に人の顔を並べる必要はないので、既定は player。
 */
export function ListeningPlayer({
  listening,
  /**
   * ステージの枠（ContentFrame）の中に置くとき。自前の外枠と戻りリンクを出さない
   * ——戻り先は枠が持つ。
   */
  embedded = false,
}: {
  listening: Listening;
  embedded?: boolean;
}) {
  const furigana = useMemo(
    () => buildFuriganaIndex(listening.furigana ?? []),
    [listening.furigana],
  );

  /**
   * 話者の名前。「あなた」ではなく、その学習者の名前を出す。
   * 「あなた」だと、誰の台詞なのか分からないまま流れていく。
   */
  const nameOf = useMemo(() => {
    const map = new Map(listening.participants.map((p) => [p.id, p.name]));
    map.set("me", getProfile()?.displayName ?? "じぶん");
    map.set("narration", "せつめい");
    return map;
  }, [listening.participants]);

  const [phase, setPhase] = useState<"intro" | "listen" | "review">("intro");
  const [line, setLine] = useState(0);
  const [captionsOn, setCaptionsOn] = useState(listening.check.showScript);
  const [typingOn, setTypingOn] = useState(listening.check.showTyping);
  const [rate, setRate] = useState(0);
  const [touched, setTouched] = useState(false);
  const [rescued, setRescued] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const goal = listening.revealGoal;

  const onCheckChange = useCallback((state: ListeningState) => {
    setRate(revealRate(state));
    setTouched(true);
  }, []);

  const start = () => {
    setPhase("listen");
    recordContentProgress(listening.id, { status: "started" });
    // 押してから鳴らす。開いた瞬間に鳴ると、身構える前に聞き逃す
    void audioRef.current?.play().catch(() => {
      /* 自動再生を止めるブラウザもある。学習者は再生ボタンを押せる */
    });
  };

  const finish = () => {
    setPhase("review");
    setCaptionsOn(true);
    setLine(0);
    recordContentProgress(listening.id, { status: "completed" });
  };

  const body = (
    <>
      {phase === "listen" ? (
        <>
          <Player
            listening={listening}
            audioRef={audioRef}
            captionsOn={captionsOn}
            onCaptions={() => setCaptionsOn((on) => !on)}
            typingOn={typingOn}
            onTyping={() => setTypingOn((on) => !on)}
          />

          {typingOn ? (
            <ListeningPanel
              contentId={listening.id}
              transcript={listening.script.map((item) => item.text).join("\n")}
              keywords={listening.keywords}
              rules={{ minLength: listening.check.minLength, maxMiss: listening.check.maxMiss }}
              goal={goal}
              showTranscript={captionsOn}
              furigana={furigana}
              onChange={onCheckChange}
            />
          ) : null}

          <NextGate
            rate={rate}
            goal={goal}
            touched={touched || !typingOn}
            rescued={rescued}
            onRescue={() => setRescued(true)}
            onNext={finish}
          />
        </>
      ) : null}

      {phase === "review" ? (
        <Review
          listening={listening}
          nameOf={nameOf}
          furigana={furigana}
          line={line}
          onLine={setLine}
          onAgain={() => {
            setPhase("listen");
            setCaptionsOn(listening.check.showScript);
          }}
        />
      ) : null}
    </>
  );

  // Zoom風にするときだけ、相手の顔を並べる枠に入れる
  const inner =
    phase === "intro" ? (
      <Intro listening={listening} furigana={furigana} onStart={start} />
    ) : listening.mode === "call" ? (
      <CallShell
        title={listening.title}
        focus={listening.focus}
        participants={listening.participants}
        activeSpeaker={listening.script[line]?.speaker ?? null}
        controls={null}
      >
        {body}
      </CallShell>
    ) : (
      <div className="space-y-4">{body}</div>
    );

  return (
    <div className={embedded ? "" : "mx-auto w-full max-w-3xl px-4 py-6"}>
      {embedded ? null : (
        <header className="mb-5 flex items-center justify-between gap-3">
          <Link href="/listening" className="text-ink-soft hover:text-navy text-sm font-extrabold">
            ← リスニング 一覧
          </Link>
          <span className="bg-sky-soft text-navy rounded-full px-3 py-1 text-xs font-extrabold">
            🎧 {listening.title}
          </span>
        </header>
      )}
      {inner}
    </div>
  );
}

/** 聞く前に「何に注目するか」を渡す（設計01 P6）。ここで はじめる を押してもらう。 */
function Intro({
  listening,
  furigana,
  onStart,
}: {
  listening: Listening;
  furigana: FuriganaIndex;
  onStart: () => void;
}) {
  return (
    <section className="card-island p-5 sm:p-7">
      <p className="text-ink-faint text-xs font-extrabold">🎧 リスニング</p>
      <h1 className="text-ink mt-1 text-2xl font-extrabold break-words sm:text-3xl">
        <RubyText text={listening.title} index={furigana} />
      </h1>
      <p className="text-ink-soft mt-2 leading-relaxed font-bold break-words">
        <RubyText text={listening.description} index={furigana} />
      </p>

      <div className="bg-panel-tint mt-5 rounded-2xl p-4">
        <p className="text-navy text-sm font-black">👂 ここに 注目して 聞きます</p>
        <p className="text-ink mt-1 leading-relaxed font-bold break-words">
          <RubyText text={listening.focus} index={furigana} />
        </p>
      </div>

      <p className="text-ink-soft mt-4 text-sm leading-relaxed font-bold">
        音を 聞いて、聞こえた ことばを 入れます。
        <br />
        ぜんぶ 分からなくて だいじょうぶです。分かった ところから 入れてください。
      </p>

      <button
        type="button"
        onClick={onStart}
        className="btn-game mt-5 w-full px-6 py-3.5 text-lg [--btn-face:#f26fa7] [--btn-shadow:#d94d84] [&_rt]:text-white!"
      >
        ▶ はじめる
      </button>
    </section>
  );
}

/** 音のプレイヤーと、表示の切り替え。 */
function Player({
  listening,
  audioRef,
  captionsOn,
  onCaptions,
  typingOn,
  onTyping,
}: {
  listening: Listening;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  captionsOn: boolean;
  onCaptions: () => void;
  typingOn: boolean;
  onTyping: () => void;
}) {
  const [speed, setSpeedValue] = useState(0.85); // 既定は遅め（設計01 P10）

  const setSpeed = (value: number) => {
    setSpeedValue(value);
    // 速度を変えてもピッチは保つ（低い声にしない — 設計01 P10）
    if (audioRef.current) {
      audioRef.current.playbackRate = value;
      audioRef.current.preservesPitch = true;
    }
  };

  return (
    <section className="card-island space-y-3 p-4">
      {listening.audioUrl ? (
        <audio ref={audioRef} src={listening.audioUrl} controls className="w-full" />
      ) : (
        <p className="text-ink-soft text-sm font-bold">
          この きょうざいには まだ 音が ありません。げんこうを 見ながら すすめてください。
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink-soft text-xs font-extrabold">はやさ</span>
        {[0.7, 0.85, 1].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setSpeed(value)}
            aria-pressed={speed === value}
            className={`rounded-full border-2 px-3 py-1 text-xs font-extrabold ${
              speed === value
                ? "bg-sky border-sky text-white"
                : "border-hairline text-ink-soft bg-panel"
            }`}
          >
            {value === 1 ? "ふつう" : value === 0.85 ? "すこし ゆっくり" : "ゆっくり"}
          </button>
        ))}

        <span className="ml-auto flex flex-wrap gap-2">
          <Toggle on={captionsOn} onClick={onCaptions} label="げんこう" />
          <Toggle on={typingOn} onClick={onTyping} label="タイピング" />
        </span>
      </div>
    </section>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border-2 px-3 py-1 text-xs font-extrabold ${
        on ? "bg-sky border-sky text-white" : "border-hairline text-ink-soft bg-panel"
      }`}
    >
      {label} {on ? "ON" : "OFF"}
    </button>
  );
}

/** 先生から聞く あいことば（どうしても表示率が届かない学習者の逃げ道）。 */
const RESCUE_WORD = "きいた";

/**
 * つぎ（こたえあわせ）へ進む関所。
 *
 * 表示率が目標に届くまでは進めない——聞かずに答えだけ見るのを防ぐため。
 * ただし**行き止まりは作らない**。どうしても届かない学習者のために、
 * 先生から聞いた あいことば で開けるようにしておく。
 */
function NextGate({
  rate,
  goal,
  touched,
  rescued,
  onRescue,
  onNext,
}: {
  rate: number;
  goal: number;
  touched: boolean;
  rescued: boolean;
  onRescue: () => void;
  onNext: () => void;
}) {
  const [word, setWord] = useState("");
  const [wrong, setWrong] = useState(false);
  const open = rate >= goal || rescued;

  return (
    <section className="card-island p-4">
      {open ? (
        <>
          <p className="text-leaf-deep text-center text-sm font-black">
            🎉 げんこうが {rate}% ひらきました
          </p>
          <button
            type="button"
            onClick={onNext}
            className="btn-game mt-3 w-full px-6 py-3 [--btn-face:#58c273] [--btn-shadow:#3aa458] [&_rt]:text-white!"
          >
            ✅ こたえあわせに すすむ
          </button>
        </>
      ) : (
        <>
          <p className="text-ink-soft text-sm font-bold">
            げんこうが {goal}% ひらくと、こたえあわせに すすめます（いま {rate}%）。
          </p>
          {touched ? (
            <details className="mt-3">
              <summary className="text-ink-faint cursor-pointer text-xs font-bold">
                どうしても すすめない ときは
              </summary>
              <p className="text-ink-soft mt-2 text-xs font-bold">
                先生に あいことばを 聞いて 入れてください。
              </p>
              <form
                className="mt-2 flex flex-wrap gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (word.trim() === RESCUE_WORD) onRescue();
                  else setWrong(true);
                }}
              >
                <input
                  type="text"
                  value={word}
                  onChange={(event) => {
                    setWord(event.target.value);
                    setWrong(false);
                  }}
                  aria-label="あいことば"
                  className="border-hairline text-ink w-40 rounded-xl border-2 bg-white px-3 py-1.5 text-sm font-bold"
                />
                <button
                  type="submit"
                  className="border-hairline text-navy rounded-full border-2 bg-white px-4 py-1.5 text-xs font-black"
                >
                  ひらく
                </button>
              </form>
              {wrong ? (
                <p className="text-ink-soft mt-1 text-xs font-bold">
                  ちがう ようです。先生に もう一度 聞いてみてください。
                </p>
              ) : null}
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * こたえあわせ。原稿を1行ずつ ひらいて、聞いたことと つき合わせる。
 *
 * 「きく」のあいだは伏せていたページ送りを、ここで出す。
 * 1行ずつ進めるのは、全部いっぺんに出すと どこを聞き逃したかが分からないため。
 */
function Review({
  listening,
  nameOf,
  furigana,
  line,
  onLine,
  onAgain,
}: {
  listening: Listening;
  nameOf: ReadonlyMap<string, string>;
  furigana: FuriganaIndex;
  line: number;
  onLine: (line: number) => void;
  onAgain: () => void;
}) {
  const total = listening.script.length;
  const shown = listening.script.slice(0, line + 1);

  return (
    <section className="card-island p-5">
      <h2 className="text-navy text-lg font-black">✅ こたえあわせ</h2>
      <p className="text-ink-soft mt-1 text-sm font-bold">
        1つずつ ひらいて、聞こえた ことばと くらべてみましょう。
      </p>

      <ol className="mt-4 space-y-2">
        {shown.map((item, index) => (
          <li
            key={index}
            className={`border-hairline rounded-2xl border-2 p-3 ${
              index === line ? "bg-sky-soft" : "bg-white"
            }`}
          >
            <p className="text-sky text-[11px] font-black tracking-widest">
              {nameOf.get(item.speaker) ?? item.speaker}
            </p>
            {/* 長い行でも枠からはみ出さない（横スクロールを出さない） */}
            <p className="text-ink leading-relaxed font-bold break-words">
              <RubyText text={item.text} index={furigana} />
            </p>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onLine(Math.max(0, line - 1))}
          disabled={line === 0}
          className="border-hairline text-navy rounded-full border-2 bg-white px-4 py-1.5 text-xs font-black disabled:opacity-40"
        >
          ← まえ
        </button>
        <span className="text-ink-soft text-xs font-black">
          {line + 1} / {total}
        </span>
        <button
          type="button"
          onClick={() => onLine(Math.min(total - 1, line + 1))}
          disabled={line >= total - 1}
          className="btn-game px-5 py-1.5 text-xs [--btn-face:#4fa8e8] [--btn-shadow:#0272ae] disabled:opacity-40"
        >
          つぎ →
        </button>
      </div>

      <button
        type="button"
        onClick={onAgain}
        className="text-sky mt-4 text-xs font-black underline underline-offset-4"
      >
        もういちど 聞く
      </button>

      {line >= total - 1 ? (
        <p className="text-leaf-deep mt-4 text-center text-sm font-black">
          さいごまで たしかめました。下の「つぎは…」から すすめます。
        </p>
      ) : null}
    </section>
  );
}
