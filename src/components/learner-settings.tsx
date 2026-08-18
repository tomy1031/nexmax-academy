"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AcademyLogo } from "@/components/academy-logo";
import { GeminiKeyCard, GenderCard, NameCard, SchoolCard } from "@/components/learner-fields";
import { NexMaxFamily } from "@/components/nexmax-types";
import { updateOwnDetails } from "@/lib/profile-db";
import { areNamesValid, type LearnerNames } from "@/lib/name";
import { isSchoolChosen, type LearnerSchool } from "@/lib/school";
import { getGeminiKey, saveGeminiKey, saveProfile, type Gender } from "@/lib/profile";

/**
 * せっていの画面（`/map/settings`）— じぶんの じょうほうと APIキーを あとから 直す
 *
 * はじめの せってい（`/welcome`）と**同じ カード**を並べる（`learner-fields.tsx`）。
 * ちがうのは2つだけ:
 *  1. **20問の 性格診断は しない**。ここは「直して ほぞんする」ためだけの 画面である。
 *  2. 保存しても マップへ 飛ばさない。直したい ところを 続けて 直せるようにする。
 *
 * 診断の 結果（`answers` / `scores` / `personality_type`）には いっさい 触らない
 *（`updateOwnDetails` が なまえ・学校・せいべつ の列だけを 書き換える）。
 * 診断を やり直したい ときは タイトル画面の「せいかくしんだんを もういちど」から。
 */

function subscribeToStorage(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

function savedGeminiKeySnapshot(): string {
  return getGeminiKey();
}

export function LearnerSettings({
  loggedIn,
  email,
  saved,
  diagnosed,
}: {
  /** ログインずみか。ここへ来られる時点で ふつうは true（未ログインは最初の画面へ返る）。 */
  loggedIn: boolean;
  email: string | null;
  /** いま保存されている なまえ・学校・せいべつ。欄の初期値になる。 */
  saved: { names: LearnerNames; school: LearnerSchool; gender: Gender | null } | null;
  /**
   * 20問が そろっているか。そろっているときだけ 表示用キャッシュを 書き直す
   * （`saveProfile` は 診断の スコアが そろっている ことを 前提にしている）。
   */
  diagnosed: boolean;
}) {
  const savedGeminiKey = useSyncExternalStore(subscribeToStorage, savedGeminiKeySnapshot, () => "");
  const [names, setNames] = useState<LearnerNames>(() => ({
    familyName: saved?.names.familyName ?? "",
    givenName: saved?.names.givenName ?? "",
    nickname: saved?.names.nickname ?? "",
  }));
  const [school, setSchool] = useState<LearnerSchool>(() => ({
    university: saved?.school.university ?? "",
    cohort: saved?.school.cohort ?? 0,
  }));
  const [gender, setGender] = useState<Gender | null>(saved?.gender ?? null);
  // 「まだ触っていない = null」。触られるまでは 保存ずみの キーを 映す（別のタブで直しても追いつく）。
  const [geminiValue, setGeminiValue] = useState<string | null>(null);
  const geminiKey = geminiValue ?? savedGeminiKey;
  const geminiInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [saveError, setSaveError] = useState(false);
  // はじめの せっていと同じ 下じき（うすい 背景の 絵）。出せなければ 白のままにする。
  const [showBg, setShowBg] = useState(true);

  const namesReady = areNamesValid(names);
  const schoolReady = isSchoolChosen(school);
  const ready = loggedIn && namesReady && schoolReady && gender !== null;
  const missingItems = [
    !loggedIn ? "ログイン" : null,
    !namesReady ? "なまえ" : null,
    !schoolReady ? "がっこう" : null,
    !gender ? "せいべつ" : null,
  ].filter((item): item is string => item !== null);

  async function save() {
    if (!ready || !gender) return;
    setBusy(true);
    setDone(false);
    setSaveError(false);
    // 打ちかけの キー（まだ onChange が 走っていない 場合）も そのまま 拾う。
    saveGeminiKey(geminiInput.current?.value ?? geminiKey);
    try {
      const stored = await updateOwnDetails(names, school, gender);
      // マップの HUD と 分身が すぐ 新しい 呼び名・せいべつに なるように、
      // 表示用キャッシュも 書き直す（正データは DB。07 §8.1）。
      if (diagnosed) {
        saveProfile({
          displayName: stored.display_name,
          gender: stored.gender,
          type: stored.personality_type,
          scores: stored.scores,
          createdAt: stored.created_at,
        });
      }
      setDone(true);
    } catch {
      setSaveError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#cceeff] p-2 sm:p-4">
      <section className="relative mx-auto min-h-[calc(100dvh-1rem)] max-w-7xl overflow-hidden rounded-[28px] border-[14px] border-[#7bcaf0] bg-white p-4 shadow-[inset_0_0_0_4px_rgba(255,255,255,.92),0_14px_40px_rgba(0,79,141,.22)] sm:min-h-[calc(100dvh-2rem)] sm:border-[17px] sm:p-7">
        {showBg && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/img/scenes/welcome_bg.webp"
            alt=""
            aria-hidden
            onError={() => setShowBg(false)}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.13]"
          />
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_12%,rgba(255,255,255,.95),transparent_22%),radial-gradient(circle_at_90%_20%,rgba(216,240,252,.8),transparent_28%),linear-gradient(180deg,rgba(255,255,255,.35),rgba(255,255,255,.74))]"
        />

        <header className="relative z-10 mb-4 flex items-start justify-between gap-3">
          <AcademyLogo className="h-auto w-28 drop-shadow-[0_3px_1px_rgba(0,60,107,.2)] sm:w-36" />
          <Link
            href="/map"
            className="border-hairline text-navy rounded-2xl border-2 bg-white px-4 py-2 text-sm font-extrabold shadow-[0_4px_0_#d7eaf5]"
          >
            ← マップに もどる
          </Link>
        </header>

        <div className="animate-pop-in relative z-10">
          <h1 className="text-navy mt-4 text-center text-2xl font-black sm:text-3xl">
            ⭐ せってい ⭐
          </h1>
          <p className="text-ink-soft mt-3 text-center font-bold">
            なまえ・がっこう・せいべつ・APIキーを、いつでも{" "}
            <ruby>
              直<rt>なお</rt>
            </ruby>
            せます。
            <br />
            しんだんは しません。「ほぞんする」を おすだけです。
          </p>

          {/* いまどのアカウントで入っているか。せっていを 直す 前に たしかめられるようにする。 */}
          <p className="border-hairline bg-panel-tint text-ink-soft mt-5 rounded-2xl border-2 px-4 py-2 text-center text-xs font-bold">
            {loggedIn ? (
              <>✅ ログインずみ{email && <span className="ml-1 break-all">（{email}）</span>}</>
            ) : (
              <>🔧 ログインしてから、せっていを ほぞんできます。</>
            )}
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <NameCard names={names} onChange={setNames} className="md:col-span-2" />
            <SchoolCard school={school} onChange={setSchool} />
            <GeminiKeyCard
              value={geminiKey}
              onChange={setGeminiValue}
              inputRef={geminiInput}
              note={
                <>
                  ？ APIキーは この きかいの{" "}
                  <ruby>
                    中<rt>なか</rt>
                  </ruby>
                  にだけ のこります。サーバには おくりません。
                </>
              }
            />
            <GenderCard gender={gender} onChange={setGender} />

            {/* 診断の やり直しは タイトル画面にしか 入口が 無かった（2026-08-18 の指定で ここにも 足した）。
                ここは 保存だけの 画面なので、**やり直しは この画面では 始めない**——
                20問は はじめの せっていの 画面が 受け持つ（`/welcome?retake=1`）。 */}
            <article className="card-pop border-white p-5 shadow-[0_6px_0_#d7eaf5]">
              <h2 className="text-navy font-extrabold">
                ⭐ せいかくしんだん{" "}
                <span className="text-ink-soft text-xs">
                  （
                  <ruby>
                    任意<rt>にんい</rt>
                  </ruby>
                  ）
                </span>
              </h2>
              <p className="text-ink-soft mt-2 text-sm font-bold">
                もういちど 20もんに こたえると、あなたの ネクマックスが かわることが あります。
              </p>
              <p className="bg-sun/25 text-ink mt-3 rounded-2xl px-3 py-2 text-xs font-bold">
                💡 いま かいた ことは、さきに「ほぞんする」を おしてね。
              </p>
              <Link
                href="/welcome?retake=1"
                className="border-sky text-navy mt-4 flex min-h-12 items-center justify-center gap-2 rounded-2xl border-3 bg-white px-3 text-sm font-extrabold shadow-[0_4px_0_#9dd8f2]"
              >
                🔄 せいかくしんだんを もういちど
              </Link>
            </article>
          </div>

          <p className="text-ink-soft mt-5 text-center text-xs font-bold">
            🛡️ あんぜんに ほごされます
          </p>
          <div className="mt-4 text-center">
            <button
              type="button"
              disabled={busy || !ready}
              onClick={() => void save()}
              className="btn-game text-ink min-w-64 px-10 py-4 text-xl disabled:cursor-not-allowed disabled:opacity-45"
              style={
                {
                  "--btn-face": "#ffc93c",
                  "--btn-shadow": "#f0a819",
                } as React.CSSProperties
              }
            >
              ⭐ ほぞんする ⭐
            </button>
            {missingItems.length > 0 && (
              <p className="text-coral-deep mt-3 text-sm font-extrabold">
                {missingItems.join("と ")}を おねがいね
              </p>
            )}
            {done && (
              <p role="status" className="text-leaf-deep mt-4 font-extrabold">
                ✅ ほぞんしました。
              </p>
            )}
            {saveError && (
              <p role="status" className="text-coral-deep mt-4 font-extrabold">
                ほぞんに しっぱいしました。インターネットを かくにんして、もういちど おしてね。
              </p>
            )}
          </div>
        </div>

        <div className="relative z-10 mt-5 flex items-end justify-between gap-4">
          <div className="-mb-3 -ml-2 flex items-end gap-2">
            <NexMaxFamily
              family="leader"
              gender={gender ?? "male"}
              size={108}
              className="shrink-0 drop-shadow-[0_10px_8px_rgba(0,79,141,.2)]"
            />
            <p className="text-navy relative mb-5 max-w-xs rounded-3xl rounded-bl-md border-2 border-white bg-white px-4 py-3 text-sm font-extrabold shadow-[0_5px_0_#bfe4f5]">
              いつでも{" "}
              <ruby>
                直<rt>なお</rt>
              </ruby>
              せるよ！
            </p>
          </div>
          <p className="border-hairline bg-panel-tint text-ink-soft mb-3 hidden rounded-2xl border-2 px-4 py-3 text-xs font-bold md:block">
            🔒 「ほぞんする」では、せいかくしんだんの けっかは かわりません。
          </p>
        </div>
      </section>
    </main>
  );
}
