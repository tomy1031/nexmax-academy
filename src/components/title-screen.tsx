"use client";

import Link from "next/link";
import { useState } from "react";
import { AcademyLogo } from "@/components/academy-logo";
import { GoogleG } from "@/components/google-g";
import { NexMaxFamily } from "@/components/nexmax-types";
import { INTRO_STAGE_ID } from "@/lib/stage-routes";
import { createClient } from "@/lib/supabase/client";

/**
 * タイトル画面。**ここが ログインの画面でもある**（願い #13）。
 *
 * ログインしていない人には「Google で ログインして はじめる」だけを出す。
 * ログインの画面を別に置かないのは、最初に見える画面を1枚に決めるため
 *（2026-08-11 の指定。旧 `/login` は消してここへ送っている）。
 */
export function TitleScreen({
  authReady,
  loggedIn,
  canContinue = false,
  hadAuthError = false,
  next = "/welcome",
}: {
  /** Supabase の設定がそろっているか。未設定なら「じゅんびちゅう」を出す。 */
  authReady: boolean;
  loggedIn: boolean;
  /**
   * 「つづきから」を出してよいか（診断ずみ＋なまえあり）。
   * この端末の記憶ではなくDBで決める（page.tsx）。別の端末で開いても同じ答えになる。
   */
  canContinue?: boolean;
  /** ログインの戻りが失敗したか（`/?error=auth`）。 */
  hadAuthError?: boolean;
  /** ログインしたあとに開く場所。ミドルウェアが弾いた行き先を持ってくる。 */
  next?: string;
}) {
  const [showKeyart, setShowKeyart] = useState(true);
  const [busy, setBusy] = useState(false);

  async function signInWithGoogle() {
    const supabase = createClient();
    if (!supabase) return;
    setBusy(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
  }

  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center overflow-hidden bg-[linear-gradient(180deg,#69c7f1_0%,#bdeaff_48%,#78d4da_70%,#f5d68b_100%)] px-4 py-5 text-center sm:py-8">
      {showKeyart && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/img/scenes/title_keyart.webp"
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
          <h1>
            <AcademyLogo
              variant="title"
              priority
              className="mx-auto h-auto w-56 drop-shadow-[0_10px_16px_rgba(31,58,86,.3)] sm:w-[22rem]"
            />
          </h1>
          <p className="bg-navy/90 mt-4 -rotate-1 rounded-full border-4 border-white px-5 py-2 text-sm font-extrabold text-white shadow-lg sm:text-lg">
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
          <NexMaxFamily
            family="leader"
            size={180}
            bob
            className="-ml-14 max-w-[36vw] drop-shadow-[0_12px_8px_rgba(31,58,86,.25)] sm:ml-0"
          />

          <div className="absolute bottom-10 left-1/2 z-10 flex w-[min(92%,430px)] -translate-x-1/2 flex-col items-center">
            {hadAuthError && (
              <p className="bg-coral/95 mb-3 rounded-2xl border-2 border-white px-4 py-2 text-sm font-extrabold text-white shadow-lg">
                🙏 ログインが うまく いきませんでした。もう一度 ためして みてね。
              </p>
            )}

            {loggedIn ? (
              <>
                <Link
                  href={canContinue ? "/map" : "/welcome"}
                  className="btn-game w-full border-4 border-white px-6 py-5 text-xl font-black sm:text-2xl"
                  style={
                    {
                      "--btn-face": "#ffc93c",
                      "--btn-shadow": "#f0a819",
                      color: "#1f3a56",
                    } as React.CSSProperties
                  }
                >
                  {canContinue ? (
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
                {/*
                  案内ステージ「はじめに」への道。まなびマップには出さないので、
                  ここに置かないと**先生がリンクを配るまで誰もたどり着けない**。
                  はじめての人にも、もう一度読みたい人にも要るので、
                  「つづきから」が出るかに関わらず出す。
                */}
                <Link
                  href={`/${INTRO_STAGE_ID}`}
                  className="text-navy mt-5 rounded-full bg-white/90 px-5 py-1.5 text-sm font-extrabold underline underline-offset-4 shadow-sm"
                >
                  はじめに（この プログラムに ついて）
                </Link>
                {canContinue && (
                  // `retake=1` が要る。付けないと /welcome が診断済みの人をマップへ送り返す。
                  <Link
                    href="/welcome?retake=1"
                    className="text-navy mt-3 rounded-full bg-white/90 px-5 py-1.5 text-sm font-extrabold underline underline-offset-4 shadow-sm"
                  >
                    せいかくしんだんを もういちど
                  </Link>
                )}
              </>
            ) : authReady ? (
              <>
                <button
                  type="button"
                  onClick={() => void signInWithGoogle()}
                  disabled={busy}
                  className="btn-game w-full border-4 border-white px-6 py-5 text-lg font-black disabled:opacity-60 sm:text-xl"
                  style={
                    {
                      "--btn-face": "#ffffff",
                      "--btn-shadow": "#c9d8e4",
                      color: "#1f3a56",
                    } as React.CSSProperties
                  }
                >
                  <GoogleG size={24} />
                  <span className="whitespace-nowrap">
                    {busy ? "ひらいて います…" : "Google で ログインして はじめる"}
                  </span>
                </button>
                <p className="text-navy mt-4 rounded-2xl bg-white/90 px-4 py-2 text-center text-xs font-extrabold shadow-sm">
                  ログインすると、がんばった きろく（
                  <ruby>
                    進<rt>しん</rt>
                  </ruby>
                  ちょくや ⭐）が のこるよ。
                </p>
              </>
            ) : (
              <p className="text-navy rounded-2xl border-2 border-white bg-white/90 px-5 py-4 text-center text-sm font-extrabold shadow-lg">
                🔧 ログインは いま じゅんびちゅう です。
                <br />
                もうすこし まってね！
              </p>
            )}
          </div>

          <NexMaxFamily
            family="heart"
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
