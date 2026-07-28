"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { signOut } from "@/app/auth/actions";
import { NekuMax, NEKUMAX_FAMILY } from "@/components/nekumax";
import { DriftingClouds, PaperPlane, Sun } from "@/components/scenery";

/* ---- パスウェイ（まなびマップ）の停留所 ---- */

interface Stop {
  emoji: string;
  label: React.ReactNode;
  plainLabel: string;
  /** マップ内の位置（%） */
  x: number;
  y: number;
  color: string; // トークン名に対応する実色（SVG/スタイル用）
  href?: string;
}

const STOPS: Stop[] = [
  {
    emoji: "🚩",
    label: <>チュートリアル</>,
    plainLabel: "チュートリアル",
    x: 10,
    y: 12,
    color: "#f0a819",
    href: "/tutorial",
  },
  {
    emoji: "🏢",
    label: (
      <>
        かいしゃを
        <ruby>
          知<rt>し</rt>
        </ruby>
        る
      </>
    ),
    plainLabel: "かいしゃを知る",
    x: 40,
    y: 6,
    color: "#0288d1",
  },
  {
    emoji: "💬",
    label: <>ほうれんそう</>,
    plainLabel: "ほうれんそう",
    x: 72,
    y: 14,
    color: "#f2654a",
  },
  {
    emoji: "❓",
    label: (
      <>
        しつもん
        <ruby>
          力<rt>りょく</rt>
        </ruby>
      </>
    ),
    plainLabel: "しつもん力",
    x: 88,
    y: 34,
    color: "#8d6ae8",
  },
  {
    emoji: "🎧",
    label: <>お客さまインタビュー</>,
    plainLabel: "お客さまインタビュー",
    x: 60,
    y: 46,
    color: "#3aa458",
  },
  {
    emoji: "🛠️",
    label: <>かいはつの ながれ</>,
    plainLabel: "かいはつのながれ",
    x: 26,
    y: 52,
    color: "#0272ae",
  },
  {
    emoji: "🕹️",
    label: <>ことばアーケード</>,
    plainLabel: "ことばアーケード",
    x: 18,
    y: 74,
    color: "#f2654a",
    href: "/arcade",
  },
  {
    emoji: "🗼",
    label: <>ゴール: とうきょう！</>,
    plainLabel: "ゴール とうきょう",
    x: 58,
    y: 86,
    color: "#004f8d",
  },
];

const PATH_D =
  "M10,12 C 20,4 30,3 40,6 C 54,10 62,9 72,14 C 84,20 90,26 88,34 " +
  "C 86,43 72,44 60,46 C 46,48 32,46 26,52 C 18,58 14,64 18,74 C 21,82 40,86 58,86";

function greeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return "おはよう！ ☀️";
  if (h >= 11 && h < 18) return "こんにちは！ 🌤️";
  return "こんばんは！ 🌙";
}

/* ---- 画面 ---- */

export function HomeShell({
  userName,
  authReady,
}: {
  userName: string | null;
  authReady: boolean;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip">
      <DriftingClouds />

      {/* ヘッダー */}
      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-4">
        <Link href="/" className="flex items-center gap-3">
          <span className="bg-navy grid h-11 w-11 place-items-center rounded-2xl shadow-[0_4px_0_#003c6b]">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
              <path d="M2 12 L22 4 L14 21 L11 14 Z" fill="#fff" />
            </svg>
          </span>
          <span className="leading-tight">
            <span className="text-navy block text-lg font-extrabold tracking-wide">
              Japanese IT Pathway
            </span>
            <span className="text-ink-soft block text-[11px] font-bold">produced by NEXT MAKE</span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          {userName ? (
            <>
              <span className="border-hairline bg-panel text-ink rounded-full border-2 px-4 py-1.5 text-sm font-bold">
                🙂 {userName} さん
              </span>
              <form action={signOut}>
                <button
                  type="submit"
                  className="text-ink-soft hover:text-navy rounded-full px-3 py-1.5 text-sm font-bold underline-offset-4 hover:underline"
                >
                  ログアウト
                </button>
              </form>
            </>
          ) : (
            <>
              {!authReady && (
                <span className="bg-sun/60 text-ink rounded-full px-3 py-1.5 text-xs font-bold">
                  たいけんモード
                </span>
              )}
              <Link
                href="/login"
                className="btn-game px-5 py-2.5 text-sm"
                style={
                  { "--btn-face": "#0288d1", "--btn-shadow": "#0272ae" } as React.CSSProperties
                }
              >
                ログイン
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-5xl flex-1 px-4 pb-20">
        {/* ヒーロー */}
        <section className="relative mt-4 mb-14 sm:mt-10">
          <div className="pointer-events-none absolute -top-4 right-2 sm:right-10">
            <Sun size={92} />
          </div>
          <div className="pointer-events-none absolute top-36 right-44 hidden sm:block">
            <PaperPlane size={56} />
          </div>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-ink-soft text-lg font-bold"
          >
            {greeting()}
            {userName ? ` ${userName} さん` : ""}
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="text-ink mt-1 text-3xl leading-snug font-extrabold text-balance sm:text-5xl"
          >
            <ruby>
              日本<rt>にほん</rt>
            </ruby>
            の IT の しごとへ、
            <br className="sm:hidden" />
            <span className="text-navy whitespace-nowrap underline decoration-[#ffc93c] decoration-8 underline-offset-4">
              まなびの みち
            </span>
            を すすもう
          </motion.h1>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16 }}
            className="card-pop mt-8 flex flex-col items-center gap-5 p-5 sm:flex-row sm:p-6"
          >
            <NekuMax variant="guide" size={110} bob />
            <div className="flex-1">
              <p className="text-ink text-base leading-relaxed font-bold sm:text-lg">
                「ここは、カンボジアから
                <ruby>
                  日本<rt>にほん</rt>
                </ruby>
                へ つづく まなびの みち。
                <br />
                いっしょに 一歩ずつ すすもう！」
              </p>
              <p className="text-ink-soft mt-1 text-sm font-bold">— ガイドの ネクマックス</p>
            </div>
            <div className="flex flex-col gap-3 sm:min-w-44">
              <Link href="/tutorial" className="btn-game px-6 py-3.5 text-base">
                🚀 はじめての 人は こちら
              </Link>
              <a
                href="#map"
                className="btn-game px-6 py-3 text-sm"
                style={
                  { "--btn-face": "#0288d1", "--btn-shadow": "#0272ae" } as React.CSSProperties
                }
              >
                🗺️ マップを 見る
              </a>
            </div>
          </motion.div>
        </section>

        {/* まなびマップ */}
        <section id="map" className="mb-16 scroll-mt-24">
          <h2 className="text-ink mb-2 text-2xl font-extrabold">
            🗺️ まなびマップ
            <span className="bg-sky ml-3 inline-block h-2 w-16 rounded-full align-middle" />
          </h2>
          <p className="text-ink-soft mb-6 font-bold">
            みちの とちゅうに、まなびの ばしょが あるよ。すこしずつ ひらいていくよ！
          </p>

          <div className="card-pop relative aspect-[5/6] w-full overflow-hidden p-0 sm:aspect-[16/11]">
            {/* うっすら地面のグラデ */}
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, #eef8fe 0%, #f7fcff 45%, #eefaf0 78%, #e3f6e7 100%)",
              }}
            />
            {/* みち */}
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full"
              aria-hidden
            >
              <motion.path
                d={PATH_D}
                fill="none"
                stroke="#ffffff"
                strokeWidth="6"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 1.6, ease: "easeInOut" }}
              />
              <motion.path
                d={PATH_D}
                fill="none"
                stroke="#0288d1"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeDasharray="3.5 3.5"
                initial={{ pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 1.6, ease: "easeInOut" }}
              />
            </svg>

            {/* 停留所 */}
            {STOPS.map((stop, i) => {
              const unlocked = Boolean(stop.href);
              const inner = (
                <>
                  <span
                    className="grid h-14 w-14 place-items-center rounded-full text-2xl shadow-[0_4px_0_rgba(31,58,86,0.18)] sm:h-16 sm:w-16 sm:text-3xl"
                    style={{
                      background: "#fff",
                      border: `3px solid ${stop.color}`,
                      filter: unlocked ? "none" : "saturate(0.35) opacity(0.75)",
                    }}
                  >
                    {stop.emoji}
                  </span>
                  <span
                    className="mt-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold whitespace-nowrap text-white sm:text-xs"
                    style={{ background: unlocked ? stop.color : "#9db0c2" }}
                  >
                    {stop.label}
                    {!unlocked && " 🔒"}
                  </span>
                </>
              );
              return (
                <motion.div
                  key={stop.plainLabel}
                  className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                  style={{ left: `${stop.x}%`, top: `${stop.y}%` }}
                  initial={{ scale: 0, opacity: 0 }}
                  whileInView={{ scale: 1, opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{
                    delay: 0.4 + i * 0.16,
                    type: "spring",
                    stiffness: 320,
                    damping: 18,
                  }}
                >
                  {unlocked ? (
                    <Link
                      href={stop.href ?? "/"}
                      className="flex flex-col items-center transition-transform hover:scale-110"
                      aria-label={stop.plainLabel}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div
                      className="flex cursor-not-allowed flex-col items-center"
                      role="img"
                      aria-label={`${stop.plainLabel}（じゅんびちゅう）`}
                      title="じゅんびちゅう"
                    >
                      {inner}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* ネクマックスのなかまたち */}
        <section className="mb-10">
          <h2 className="text-ink mb-2 text-2xl font-extrabold">
            🤖 ネクマックスの なかまたち
            <span className="bg-coral ml-3 inline-block h-2 w-16 rounded-full align-middle" />
          </h2>
          <p className="text-ink-soft mb-6 font-bold">
            みちの あちこちで、いろんな やくわりの ネクマックスが 手つだって くれるよ！
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {NEKUMAX_FAMILY.map((v, i) => (
              <motion.div
                key={v.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                whileHover={{ rotate: [-1.5, 1.5, 0], scale: 1.04 }}
                className="card-pop flex flex-col items-center p-4 text-center"
                style={{ borderColor: `${v.accent}55` }}
              >
                <NekuMax variant={v.id} size={92} />
                <p className="text-ink mt-2 text-sm font-extrabold sm:text-base">{v.label}</p>
              </motion.div>
            ))}
          </div>
        </section>
      </main>

      <footer className="text-ink-soft relative z-10 py-6 text-center text-xs font-bold">
        Japanese IT Pathway — NEXT MAKE ×{" "}
        <ruby>
          学<rt>まな</rt>
        </ruby>
        ぶみんな
      </footer>
    </div>
  );
}
