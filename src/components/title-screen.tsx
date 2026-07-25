"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { NekuMaxType } from "@/components/nekumax-types";
import { getProfile } from "@/lib/profile";

export function TitleScreen() {
  const hasProfile = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("storage", onStoreChange);
      return () => window.removeEventListener("storage", onStoreChange);
    },
    () => getProfile() !== null,
    () => false,
  );
  const [showKeyart, setShowKeyart] = useState(true);

  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center overflow-hidden bg-[linear-gradient(180deg,#69c7f1_0%,#bdeaff_48%,#78d4da_70%,#f5d68b_100%)] px-4 py-5 text-center sm:py-8">
      {showKeyart && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/img/scenes/title_keyart.png"
          alt=""
          aria-hidden
          onError={() => setShowKeyart(false)}
          className="absolute inset-0 -z-10 h-full w-full object-cover"
        />
      )}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(255,255,255,.1),rgba(0,79,141,.03)_55%,rgba(0,60,107,.18))]"
      />

      <section className="flex w-full max-w-5xl flex-1 flex-col items-center justify-between">
        <div className="animate-pop-in">
          <svg
            aria-hidden
            viewBox="0 0 120 58"
            className="mx-auto -mb-3 h-12 w-28 drop-shadow-[0_5px_0_white] sm:h-16 sm:w-36"
          >
            <path
              d="M10 48V18L37 42L60 8L83 42L110 18V48L83 54L60 25L37 54Z"
              fill="#004f8d"
              stroke="#ffffff"
              strokeWidth="8"
              strokeLinejoin="round"
              paintOrder="stroke"
            />
            <path
              d="M14 45V24L38 47L60 14L82 47L106 24V45"
              fill="none"
              stroke="#29b6f6"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <h1 className="leading-[0.86]">
            <span className="block bg-gradient-to-b from-[#71ddff] via-[#078ed6] to-[#003c79] bg-clip-text text-5xl font-black tracking-tight text-transparent [filter:drop-shadow(0_8px_0_#003c6b)_drop-shadow(0_10px_18px_rgba(31,58,86,.3))] [-webkit-text-stroke:5px_white] [paint-order:stroke_fill] sm:text-7xl">
              Nexmax
            </span>
            <span className="mt-3 block bg-gradient-to-b from-[#fffbd0] via-[#ffdb35] to-[#f3980b] bg-clip-text text-4xl font-black tracking-wide text-transparent [filter:drop-shadow(0_7px_0_#b9680d)_drop-shadow(0_9px_16px_rgba(31,58,86,.28))] [-webkit-text-stroke:5px_white] [paint-order:stroke_fill] sm:text-6xl">
              Academy
            </span>
          </h1>
          <p className="bg-navy/90 mt-7 -rotate-1 rounded-full border-4 border-white px-5 py-2 text-sm font-extrabold text-white shadow-lg sm:text-lg">
            <ruby>
              日本<rt className="text-white">にほん</rt>
            </ruby>
            の IT ワークを{" "}
            <ruby>
              楽<rt className="text-white">たの</rt>
            </ruby>
            しく{" "}
            <ruby>
              学<rt className="text-white">まな</rt>
            </ruby>
            ぼう
          </p>
        </div>

        <div className="relative mt-6 flex w-full flex-1 items-end justify-between sm:mt-3">
          <NekuMaxType
            id="leader"
            size={180}
            bob
            className="-ml-14 max-w-[36vw] drop-shadow-[0_12px_8px_rgba(31,58,86,.25)] sm:ml-0"
          />

          <div className="absolute bottom-10 left-1/2 z-10 flex w-[min(92%,430px)] -translate-x-1/2 flex-col items-center">
            <Link
              href={hasProfile ? "/map" : "/welcome"}
              className="btn-game w-full border-4 border-white px-6 py-5 text-xl font-black sm:text-2xl"
              style={
                {
                  "--btn-face": "#ffc93c",
                  "--btn-shadow": "#f0a819",
                  color: "#1f3a56",
                } as React.CSSProperties
              }
            >
              {hasProfile ? (
                <span className="whitespace-nowrap">⭐ つづきから ⭐</span>
              ) : (
                <span className="whitespace-nowrap">
                  ⭐ ゲームを
                  <ruby>
                    始<rt>はじ</rt>
                  </ruby>
                  める ⭐
                </span>
              )}
            </Link>
            {hasProfile && (
              <Link
                href="/welcome"
                className="text-navy mt-5 rounded-full bg-white/90 px-5 py-1.5 text-sm font-extrabold underline underline-offset-4 shadow-sm"
              >
                もういちど せっていする
              </Link>
            )}
          </div>

          <NekuMaxType
            id="heart"
            gender="female"
            size={180}
            bob
            className="-mr-14 max-w-[36vw] drop-shadow-[0_12px_8px_rgba(31,58,86,.25)] sm:mr-0"
          />
        </div>

        <p className="relative z-20 mt-4 text-xs font-extrabold tracking-[0.18em] text-white [text-shadow:0_2px_4px_#003c6b]">
          produced by NEXT MAKE
        </p>
      </section>
    </main>
  );
}
