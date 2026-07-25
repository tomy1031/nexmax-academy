"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { motion } from "motion/react";
import { NekuMax } from "@/components/nekumax";
import { DriftingClouds, PaperPlane, Sun } from "@/components/scenery";
import { createClient } from "@/lib/supabase/client";

/** Google の「G」ロゴ。 */
function GoogleG({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export function LoginCard({ authReady }: { authReady: boolean }) {
  const searchParams = useSearchParams();
  const hadAuthError = searchParams.get("error") === "auth";
  const [busy, setBusy] = useState(false);

  async function signInWithGoogle() {
    const supabase = createClient();
    if (!supabase) return;
    setBusy(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/welcome`,
      },
    });
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      <DriftingClouds />
      <div className="pointer-events-none absolute top-8 right-8 sm:top-12 sm:right-16">
        <Sun size={110} />
      </div>
      <div className="pointer-events-none absolute top-24 left-8 sm:left-20">
        <PaperPlane size={62} />
      </div>

      {/* 下からのぞく なかまたち */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-7 left-1/2 flex -translate-x-1/2 items-end gap-2 opacity-95 sm:gap-8"
      >
        <div className="animate-bob" style={{ animationDelay: "0s" }}>
          <NekuMax variant="hello" size={92} />
        </div>
        <div className="animate-bob" style={{ animationDelay: "0.4s" }}>
          <NekuMax variant="guide" size={112} />
        </div>
        <div className="animate-bob hidden sm:block" style={{ animationDelay: "0.8s" }}>
          <NekuMax variant="cheer" size={92} />
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 20 }}
        className="card-pop relative z-10 w-full max-w-md p-7 sm:p-9"
      >
        <div className="mb-6 text-center">
          <span className="bg-navy mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl shadow-[0_5px_0_#003c6b]">
            <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
              <path d="M2 12 L22 4 L14 21 L11 14 Z" fill="#fff" />
            </svg>
          </span>
          <h1 className="text-navy text-2xl font-extrabold">Japanese IT Pathway</h1>
          <p className="text-ink-soft mt-1 text-sm font-bold">
            <ruby>
              日本<rt>にほん</rt>
            </ruby>
            の IT の しごとへ、ようこそ！
          </p>
        </div>

        {hadAuthError && (
          <div className="bg-coral/15 border-coral text-ink mb-4 rounded-2xl border-2 px-4 py-3 text-sm font-bold">
            🙏 ログインが うまく いきませんでした。もう一度 ためして みてね。
          </div>
        )}

        {authReady ? (
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            disabled={busy}
            className="btn-game w-full px-6 py-4 text-base disabled:opacity-60"
            style={
              {
                "--btn-face": "#ffffff",
                "--btn-shadow": "#c9d8e4",
                color: "#1f3a56",
                border: "2px solid #dcebf5",
              } as React.CSSProperties
            }
          >
            <GoogleG />
            {busy ? "ひらいて います…" : "Google で ログイン"}
          </button>
        ) : (
          <div className="bg-panel-tint border-hairline rounded-2xl border-2 px-4 py-4 text-center">
            <p className="text-ink text-sm font-bold">
              🔧 ログインは いま じゅんびちゅう です。
              <br />
              もうすこし まってね！
            </p>
          </div>
        )}

        <p className="text-ink-soft mt-5 text-center text-xs leading-relaxed font-bold">
          ログインすると、がんばった きろく（
          <ruby>
            進<rt>しん</rt>
          </ruby>
          ちょくや ⭐）が のこるよ。
        </p>
      </motion.div>
    </div>
  );
}
