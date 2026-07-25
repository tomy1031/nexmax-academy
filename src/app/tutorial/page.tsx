"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { NekuMax, NEKUMAX_FAMILY, type NekuMaxVariant } from "@/components/nekumax";
import { DriftingClouds, PaperPlane, Sun } from "@/components/scenery";

/**
 * チュートリアル: 物語仕立ての6ステップ。
 * 4択で「テスト」しない。さわって・えらんで・すすむだけの、やさしい入口（01ガイド P1/P8）。
 */

const STEP_COUNT = 6;

/* ---- 各ステップ ---- */

function StepWelcome() {
  return (
    <div className="text-center">
      <motion.div
        initial={{ scale: 0.6, rotate: -8 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 14 }}
        className="bg-navy mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl shadow-[0_6px_0_#003c6b]"
      >
        <svg viewBox="0 0 24 24" width="38" height="38" aria-hidden>
          <path d="M2 12 L22 4 L14 21 L11 14 Z" fill="#fff" />
        </svg>
      </motion.div>
      <h1 className="text-navy text-3xl font-extrabold sm:text-4xl">ようこそ！</h1>
      <p className="text-ink mt-4 text-lg leading-relaxed font-bold">
        ここは <span className="text-sky">Japanese IT Pathway</span>。
        <br />
        <ruby>
          日本<rt>にほん</rt>
        </ruby>
        の IT の しごとを たいけんしながら、
        <br />
        <ruby>
          日本語<rt>にほんご</rt>
        </ruby>
        も いっしょに まなべる ばしょだよ。
      </p>
      <div className="mt-6 flex justify-center">
        <PaperPlane size={70} />
      </div>
    </div>
  );
}

function StepStory() {
  return (
    <div className="text-center">
      <h2 className="text-ink text-2xl font-extrabold sm:text-3xl">🌏 ものがたり</h2>
      <div className="mx-auto mt-5 max-w-md">
        {/* カンボジア → 日本 のみち */}
        <div className="card-pop relative overflow-hidden p-5">
          <div className="flex items-center justify-between px-2">
            <div className="text-center">
              <span className="text-4xl">🇰🇭</span>
              <p className="text-ink-soft mt-1 text-xs font-extrabold">カンボジア</p>
            </div>
            <svg viewBox="0 0 120 24" className="mx-2 h-6 flex-1" aria-hidden>
              <motion.path
                d="M4 16 C 30 4, 60 22, 116 8"
                fill="none"
                stroke="#0288d1"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray="6 6"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.4, ease: "easeInOut" }}
              />
            </svg>
            <div className="text-center">
              <span className="text-4xl">🗼</span>
              <p className="text-ink-soft mt-1 text-xs font-extrabold">
                <ruby>
                  日本<rt>にほん</rt>
                </ruby>
              </p>
            </div>
          </div>
          <p className="text-ink mt-4 text-base leading-relaxed font-bold">
            あなたは きょうから、IT
            <ruby>
              会社<rt>がいしゃ</rt>
            </ruby>
            「ネクストメイク」の あたらしい なかま。
            <br />
            しごとの ことば、チームの きもち、つくる たのしさ——
            <br />
            みちの とちゅうで、ぜんぶ 出会えるよ。
          </p>
        </div>
      </div>
    </div>
  );
}

function StepFriends() {
  const [active, setActive] = useState<NekuMaxVariant>("guide");
  const meta = NEKUMAX_FAMILY.find((v) => v.id === active) ?? NEKUMAX_FAMILY[0]!;
  const accent = { face: meta.accent, deep: meta.accentDeep };
  return (
    <div className="text-center">
      <h2 className="text-ink text-2xl font-extrabold sm:text-3xl">🤖 ネクマックスの なかまたち</h2>
      <p className="text-ink-soft mt-1 text-sm font-bold">タップすると、あいさつ してくれるよ！</p>

      {/* ふきだし */}
      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98 }}
          transition={{ duration: 0.18 }}
          className="relative mx-auto mt-5 max-w-md rounded-3xl border-2 bg-white px-5 py-4"
          style={{ borderColor: accent.face }}
        >
          <p className="text-ink text-base leading-relaxed font-bold">「{meta.intro}」</p>
          <p className="mt-1 text-xs font-extrabold" style={{ color: accent.deep }}>
            — {meta.plainLabel}
          </p>
          <span
            aria-hidden
            className="absolute -bottom-2.5 left-1/2 h-5 w-5 -translate-x-1/2 rotate-45 border-r-2 border-b-2 bg-white"
            style={{ borderColor: accent.face }}
          />
        </motion.div>
      </AnimatePresence>

      <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
        {NEKUMAX_FAMILY.map((v) => {
          const selected = v.id === active;
          return (
            <motion.button
              key={v.id}
              type="button"
              onClick={() => setActive(v.id)}
              whileTap={{ scale: 0.92 }}
              whileHover={{ y: -4 }}
              aria-pressed={selected}
              className="flex flex-col items-center rounded-3xl border-2 bg-white p-2 pb-3 sm:p-3"
              style={{
                borderColor: selected ? v.accent : "#dcebf5",
                boxShadow: selected ? `0 5px 0 ${v.accentDeep}` : "0 4px 0 #e7f1f8",
              }}
            >
              <span className={selected ? "animate-wiggle" : undefined}>
                <NekuMax variant={v.id} size={64} />
              </span>
              <span className="text-ink mt-1 text-[11px] font-extrabold sm:text-xs">{v.label}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function StepHowToLearn() {
  const steps = [
    { emoji: "🔍", label: "しらべる", color: "#0288d1" },
    { emoji: "🎧", label: "きく", color: "#58c273" },
    { emoji: "🎤", label: "はなす", color: "#ff8a70" },
    { emoji: "🛠️", label: "つくる", color: "#8d6ae8" },
  ];
  return (
    <div className="text-center">
      <h2 className="text-ink text-2xl font-extrabold sm:text-3xl">📚 まなびかた</h2>
      <p className="text-ink mt-3 text-base font-bold">
        よんで おわり、じゃない。
        <ruby>
          本物<rt>ほんもの</rt>
        </ruby>
        の しごとみたいに——
      </p>
      <div className="mx-auto mt-6 flex max-w-md items-center justify-center gap-1 sm:gap-2">
        {steps.map((s, i) => (
          <div key={s.label} className="flex items-center">
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15 + i * 0.18, type: "spring", stiffness: 300, damping: 15 }}
              className="flex flex-col items-center"
            >
              <span
                className="grid h-14 w-14 place-items-center rounded-2xl text-2xl sm:h-16 sm:w-16 sm:text-3xl"
                style={{ background: `${s.color}22`, border: `3px solid ${s.color}` }}
              >
                {s.emoji}
              </span>
              <span className="text-ink mt-1.5 text-xs font-extrabold sm:text-sm">{s.label}</span>
            </motion.div>
            {i < steps.length - 1 && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 + i * 0.18 }}
                className="text-ink-faint mx-0.5 mb-5 text-lg font-extrabold sm:mx-1.5"
                aria-hidden
              >
                →
              </motion.span>
            )}
          </div>
        ))}
      </div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.0 }}
        className="bg-sun/25 mx-auto mt-6 max-w-md rounded-2xl px-5 py-3"
      >
        <p className="text-ink text-sm leading-relaxed font-bold">
          🌱 まちがえても だいじょうぶ。
          <br />
          しっぱいも たいせつな べんきょう。なんども ちょうせん できるよ。
        </p>
      </motion.div>
    </div>
  );
}

function StepRewards() {
  return (
    <div className="text-center">
      <h2 className="text-ink text-2xl font-extrabold sm:text-3xl">🏅 がんばりの しるし</h2>
      <div className="mx-auto mt-6 grid max-w-md grid-cols-3 gap-3">
        {[
          { emoji: "⭐", title: "スター", desc: "クリアで もらえる" },
          { emoji: "📮", title: "スタンプ", desc: "みちが すすむと たまる" },
          { emoji: "🎒", title: "さくひん", desc: "つくった ものが のこる" },
        ].map((r, i) => (
          <motion.div
            key={r.title}
            initial={{ opacity: 0, y: 16, rotate: -3 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ delay: 0.15 + i * 0.15, type: "spring", stiffness: 260, damping: 16 }}
            className="card-pop p-4"
          >
            <span className="text-3xl">{r.emoji}</span>
            <p className="text-ink mt-1 text-sm font-extrabold">{r.title}</p>
            <p className="text-ink-soft mt-0.5 text-[11px] leading-snug font-bold">{r.desc}</p>
          </motion.div>
        ))}
      </div>
      <p className="text-ink mt-6 text-base leading-relaxed font-bold">
        あつめた きろくは、いつか
        <ruby>
          面接<rt>めんせつ</rt>
        </ruby>
        で「わたしの がんばり」として
        <ruby>
          話<rt>はな</rt>
        </ruby>
        せる たからものに なるよ。
      </p>
    </div>
  );
}

const BURST = ["🎉", "⭐", "🎈", "✨", "🌸", "🎊", "💙", "🌟", "🍀", "🧡"];

function StepDepart() {
  return (
    <div className="relative text-center">
      {/* おいわいの紙ふぶき（位置は固定シード） */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {BURST.map((e, i) => (
          <motion.span
            key={i}
            className="absolute text-2xl"
            style={{ left: `${8 + i * 9}%`, top: "55%" }}
            initial={{ opacity: 0, y: 0, scale: 0.5 }}
            animate={{ opacity: [0, 1, 0], y: -120 - (i % 3) * 40, scale: 1.2, rotate: i * 36 }}
            transition={{ duration: 1.8, delay: 0.2 + (i % 5) * 0.12, ease: "easeOut" }}
          >
            {e}
          </motion.span>
        ))}
      </div>

      <h2 className="text-navy text-3xl font-extrabold sm:text-4xl">🚀 しゅっぱつ！</h2>
      <div className="mt-4 flex justify-center gap-3">
        <NekuMax variant="guide" size={96} bob />
        <NekuMax variant="cheer" size={96} bob />
      </div>
      <p className="text-ink mt-4 text-lg leading-relaxed font-bold">
        じゅんびは OK！
        <br />
        マップの さいしょの ばしょから、まなびを はじめよう。
      </p>
      <div className="mt-6 flex justify-center">
        <Link href="/map" className="btn-game px-10 py-4 text-lg">
          🗺️ マップへ しゅっぱつ！
        </Link>
      </div>
    </div>
  );
}

/* ---- 本体 ---- */

export default function TutorialPage() {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);

  const go = useCallback(
    (next: number) => {
      if (next < 0 || next >= STEP_COUNT) return;
      setDirection(next > step ? 1 : -1);
      setStep(next);
    },
    [step],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") go(step + 1);
      if (e.key === "ArrowLeft") go(step - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, step]);

  const screens = [
    <StepWelcome key="w" />,
    <StepStory key="s" />,
    <StepFriends key="f" />,
    <StepHowToLearn key="h" />,
    <StepRewards key="r" />,
    <StepDepart key="d" />,
  ];

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <DriftingClouds />
      <div className="pointer-events-none absolute top-6 right-6">
        <Sun size={84} />
      </div>

      {/* 上部バー */}
      <header className="relative z-10 mx-auto flex w-full max-w-2xl items-center justify-between px-4 pt-5">
        <span className="text-navy text-sm font-extrabold">チュートリアル</span>
        <Link
          href="/"
          className="text-ink-soft hover:text-navy text-sm font-bold underline-offset-4 hover:underline"
        >
          スキップ →
        </Link>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-6">
        <div className="card-pop overflow-hidden p-6 sm:p-10">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              initial={{ opacity: 0, x: 60 * direction }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -60 * direction }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              {screens[step]}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ナビ */}
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => go(step - 1)}
            disabled={step === 0}
            className="btn-game px-5 py-2.5 text-sm disabled:opacity-40"
            style={{ "--btn-face": "#9db0c2", "--btn-shadow": "#7e93a8" } as React.CSSProperties}
          >
            ← もどる
          </button>

          {/* ドット */}
          <div className="flex items-center gap-2" role="tablist" aria-label="チュートリアルの進み">
            {Array.from({ length: STEP_COUNT }, (_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === step}
                aria-label={`ステップ ${i + 1}`}
                onClick={() => go(i)}
                className="rounded-full transition-all"
                style={{
                  width: i === step ? 26 : 10,
                  height: 10,
                  background: i === step ? "#0288d1" : i < step ? "#8fd0ee" : "#d5e6f2",
                }}
              />
            ))}
          </div>

          {step < STEP_COUNT - 1 ? (
            <button
              type="button"
              onClick={() => go(step + 1)}
              className="btn-game px-6 py-2.5 text-sm"
              style={{ "--btn-face": "#0288d1", "--btn-shadow": "#0272ae" } as React.CSSProperties}
            >
              つぎへ →
            </button>
          ) : (
            <span className="w-24" aria-hidden />
          )}
        </div>
      </main>
    </div>
  );
}
