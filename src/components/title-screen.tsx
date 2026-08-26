"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AcademyLogo } from "@/components/academy-logo";
import { GoogleG } from "@/components/google-g";
import { NexMaxFamily } from "@/components/nexmax-types";
import { hasAuthCookieInBrowser, isReadyMarked, markReady } from "@/lib/auth-cookie";
import { hasLearnerNames } from "@/lib/name";
import { isDiagnosisComplete } from "@/lib/profile";
import { INTRO_STAGE_ID } from "@/lib/stage-routes";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_NEXT, readTitleParams } from "@/lib/title-entry";

/** タイトル画面が 出しわける ための 状態。決まるまでは `resolved: false`。 */
interface TitleEntry {
  /** ブラウザで 読み終わったか。読み終わるまでは どちらの ボタンも 出さない。 */
  readonly resolved: boolean;
  readonly loggedIn: boolean;
  /** 「つづきから」を 出してよいか（診断ずみ＋なまえあり）。 */
  readonly canContinue: boolean;
  readonly hadAuthError: boolean;
  /** ログインの あとに 開く 場所。 */
  readonly next: string;
}

const UNRESOLVED: TitleEntry = {
  resolved: false,
  loggedIn: false,
  canContinue: false,
  hadAuthError: false,
  next: DEFAULT_NEXT,
};

/**
 * ブラウザで 動き出したか（hydration が 済んだか）。
 *
 * サーバで 作りおいた HTML と、最初の ブラウザ描画は **同じ**でなければ ならない。
 * だから クッキーは 最初の 描画では 読めない——読んだ 瞬間 中身が ずれる。
 * `useSyncExternalStore` の 「サーバでは false・ブラウザでは true」だけを 使って、
 * **2回目の 描画から 読んでよい**ことを 知らせる（外部の 変化は 無いので
 * 購読は 何も しない）。
 */
const NEVER_CHANGES = () => () => {};

/**
 * 「だれが 開いたか」を **ブラウザで** 決める（2026-08-26）。
 *
 * ここは サーバから 受け取って いた。そのために タイトル画面は
 * リクエストごとの サーバ描画（dynamic）で、**全員が 最初に 通る 画面**が
 * 毎回 Next の サーバ本体を 起こしていた。冷えた Worker では それだけで
 * 無料枠の CPU（1リクエスト 10ms）を 超え、20人の 授業で 入れない 人が 出た
 *（docs/deploy.md §0.10）。
 *
 * 判定に 使う ものは 前と 同じ——**クッキーが あるか**と **「つづきから」の 印**。
 * 印が 無い ログイン者だけ 1回だけ DB を 見るのも 同じで、見に行く 先が
 * Worker から ブラウザに 変わっただけ である。
 */
function useTitleEntry(): TitleEntry {
  const hydrated = useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );

  // クッキーと URL は 開いた あと 変わらないので、描く ついでに 読めばよい。
  const base = useMemo<TitleEntry>(() => {
    if (!hydrated) return UNRESOLVED;
    const { next, hadAuthError } = readTitleParams(window.location.search);
    const loggedIn = hasAuthCookieInBrowser();
    return {
      resolved: true,
      loggedIn,
      canContinue: loggedIn && isReadyMarked(),
      hadAuthError,
      next,
    };
  }, [hydrated]);

  /** DB に 聞いた 結果。聞いて いない あいだは null（＝`base` のまま）。 */
  const [asked, setAsked] = useState<boolean | null>(null);

  useEffect(() => {
    // 印が ある人・ログインして いない人は、外へ 出ない。
    if (!base.resolved || !base.loggedIn || base.canContinue) return;

    // 印が 無い ログイン者だけ、1回だけ 調べる（別の 端末で 開いた 初回など）。
    let alive = true;
    void (async () => {
      const ready = await fetchCanContinue();
      if (!alive) return;
      // 次からは クッキーだけで 決まる（DB を 見るのは この 1回きり）。
      if (ready) markReady(true);
      setAsked(ready);
    })();
    return () => {
      alive = false;
    };
  }, [base.resolved, base.loggedIn, base.canContinue]);

  return asked === null ? base : { ...base, canContinue: asked };
}

/**
 * 「つづきから」を 出してよいかを DB に 聞く。**ブラウザから 直に 聞く**ので
 * Worker は 通らない（自分の 行しか 見えないのは RLS が 守っている）。
 *
 * `getClaims()` は 手元の トークンを 公開鍵で 確かめるだけで 往復しない
 *（願い #17・2026-08-26 の #213 と 同じ 考えかた）。
 */
async function fetchCanContinue(): Promise<boolean> {
  const supabase = createClient();
  if (!supabase) return false;
  const { data: verified } = await supabase.auth.getClaims();
  const id = verified?.claims.sub;
  if (!id) return false;
  const { data: profile } = await supabase
    .from("profiles")
    .select("answers, family_name, given_name")
    .eq("id", id)
    .maybeSingle();
  return Boolean(
    profile &&
    isDiagnosisComplete(profile.answers) &&
    hasLearnerNames({
      familyName: profile.family_name ?? "",
      givenName: profile.given_name ?? "",
    }),
  );
}

/**
 * タイトル画面。**ここが ログインの画面でもある**（願い #13）。
 *
 * ログインしていない人には「Google で ログインして はじめる」だけを出す。
 * ログインの画面を別に置かないのは、最初に見える画面を1枚に決めるため
 *（2026-08-11 の指定。旧 `/login` は消してここへ送っている）。
 */
export function TitleScreen({
  authReady,
}: {
  /** Supabase の設定がそろっているか。未設定なら「じゅんびちゅう」を出す。 */
  authReady: boolean;
}) {
  const [showKeyart, setShowKeyart] = useState(true);
  const [busy, setBusy] = useState(false);
  const { resolved, loggedIn, canContinue, hadAuthError, next } = useTitleEntry();

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
              日本<rt className="text-white!">にほん</rt>
            </ruby>
            の IT ワークを{" "}
            <ruby>
              楽<rt className="text-white!">たの</rt>
            </ruby>
            しく{" "}
            <ruby>
              学<rt className="text-white!">まな</rt>
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

            {!resolved ? (
              /*
                だれが 開いたかは ブラウザで 決まる（`useTitleEntry`）。決まるまでの
                ひと呼吸だけ、押せない 場所取りを 出す。**空にしない**——回線の 細い
                端末では この 間が のびるので、何も 無いと 壊れて 見える。
              */
              <div
                aria-hidden
                className="btn-game w-full border-4 border-white px-6 py-5 text-lg font-black opacity-70"
                style={
                  {
                    "--btn-face": "#ffffff",
                    "--btn-shadow": "#c9d8e4",
                    color: "#1f3a56",
                  } as React.CSSProperties
                }
              >
                <span className="whitespace-nowrap">よみこんで います…</span>
              </div>
            ) : loggedIn ? (
              <>
                <Link
                  prefetch={false}
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
                {/* 下線の文字リンクだと、色とりどりの 絵の 上では 沈んで 気づかれない
                    （2026-08-19「目立たない」）。**押せる 面**を 持つ ボタンに して、
                    ①白い ふち ②下の 影 ③2段の 文字 で 見つけやすくする。
                    面の 色は 上の CTA（黄色）と 変えて、どちらが 先かを 保つ。 */}
                <Link
                  prefetch={false}
                  href={`/${INTRO_STAGE_ID}`}
                  className="btn-game mt-4 w-full flex-col gap-0.5 border-4 border-white px-5 py-3 text-base font-black sm:text-lg"
                  style={
                    {
                      "--btn-face": "#ffffff",
                      "--btn-shadow": "#c9d8e4",
                      color: "#1f3a56",
                    } as React.CSSProperties
                  }
                >
                  <span className="whitespace-nowrap">📖 はじめに を よむ</span>
                  <span className="text-ink-soft text-[11px] font-extrabold sm:text-xs">
                    この プログラムに ついて
                  </span>
                </Link>
                {canContinue && (
                  // `retake=1` が要る。付けないと /welcome が診断済みの人をマップへ送り返す。
                  <Link
                    prefetch={false}
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
