"use client";

import { Fragment, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  PERSONALITY_QUESTIONS,
  PERSONALITY_RESULT_READINGS,
  PERSONALITY_TYPES,
  getPersonalityType,
  scorePersonality,
  type PersonalityLanguage,
  type PersonalityQuestion,
  type Reading,
} from "@/content/personality";
import { NekuMaxType } from "@/components/nekumax-types";
import { createClient } from "@/lib/supabase/client";
import { getGeminiKey, getProfile, saveGeminiKey, saveProfile, type Gender } from "@/lib/profile";

function subscribeToStorage(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

function savedGenderSnapshot(): Gender | "" {
  return getProfile()?.gender ?? "";
}

function savedGeminiKeySnapshot(): string {
  return getGeminiKey();
}

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden>
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

function MiniGameLogo() {
  return (
    <div className="relative -rotate-2 text-center leading-[0.78] drop-shadow-[0_3px_1px_rgba(0,60,107,.35)]">
      <span className="block bg-linear-to-b from-[#4fc7f5] via-[#0288d1] to-[#004f8d] bg-clip-text text-xl font-black tracking-tight text-transparent [-webkit-text-stroke:1.5px_white] [paint-order:stroke_fill] sm:text-2xl">
        Nexmax
      </span>
      <span className="mt-1 block bg-linear-to-b from-[#ffd94f] via-[#f5b70f] to-[#e08a00] bg-clip-text text-base font-black tracking-wide text-transparent [-webkit-text-stroke:1.5px_white] [paint-order:stroke_fill] sm:text-xl">
        Academy
      </span>
    </div>
  );
}

function FallbackImage({
  src,
  alt,
  fallback,
  className,
}: {
  src: string;
  alt: string;
  fallback: ReactNode;
  className: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} onError={() => setFailed(true)} className={className} />
  );
}

function RubyText({ text, readings }: { text: string; readings: readonly Reading[] }) {
  const parts: ReactNode[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    let nextReading: Reading | undefined;
    let nextIndex = text.length;

    for (const reading of readings) {
      const index = text.indexOf(reading.text, cursor);
      if (index >= 0 && index < nextIndex) {
        nextIndex = index;
        nextReading = reading;
      }
    }

    if (!nextReading) {
      parts.push(text.slice(cursor));
      break;
    }
    if (nextIndex > cursor) parts.push(text.slice(cursor, nextIndex));
    parts.push(
      <ruby key={`${nextReading.text}-${cursor}`}>
        {nextReading.text}
        <rt>{nextReading.reading}</rt>
      </ruby>,
    );
    cursor = nextIndex + nextReading.text.length;
  }

  return <>{parts}</>;
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const numberMarks = ["❶", "❷", "❸", "❹"];
  const items: { number: number; label: ReactNode }[] = [
    { number: 1, label: <>チュートリアル</> },
    {
      number: 2,
      label: (
        <ruby>
          性格診断<rt>せいかく しんだん</rt>
        </ruby>
      ),
    },
    {
      number: 3,
      label: (
        <ruby>
          結果<rt>けっか</rt>
        </ruby>
      ),
    },
    { number: 4, label: <>はじめる</> },
  ];

  return (
    <ol className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-1 px-1 pb-1 sm:gap-2">
      {items.map((item, index) => (
        <Fragment key={item.number}>
          <li
            className={`shrink-0 rounded-full border-2 px-3 py-1.5 text-[10px] font-extrabold shadow-[0_3px_0_rgba(0,79,141,.12)] sm:px-5 sm:py-2 sm:text-sm ${
              item.number === step
                ? "border-navy bg-navy text-white"
                : "border-navy text-navy bg-white"
            }`}
          >
            {numberMarks[item.number - 1]} {item.label}
          </li>
          {index < items.length - 1 && (
            <li aria-hidden className="text-navy shrink-0 text-sm font-black sm:text-lg">
              →
            </li>
          )}
        </Fragment>
      ))}
    </ol>
  );
}

function QuestionText({
  question,
  language,
}: {
  question: PersonalityQuestion;
  language: PersonalityLanguage;
}) {
  if (language === "japanese") {
    return <RubyText text={question.japanese} readings={question.readings} />;
  }
  if (language === "easy") {
    return <RubyText text={question.easy} readings={question.readings} />;
  }
  return <>{question.english}</>;
}

export function WelcomeWizard({ authReady, loggedIn }: { authReady: boolean; loggedIn: boolean }) {
  const router = useRouter();
  const savedGender = useSyncExternalStore<Gender | "">(
    subscribeToStorage,
    savedGenderSnapshot,
    () => "",
  );
  const savedGeminiKey = useSyncExternalStore(subscribeToStorage, savedGeminiKeySnapshot, () => "");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [genderChoice, setGenderChoice] = useState<Gender | null>(null);
  const storedGender: Gender | null =
    savedGender === "male" || savedGender === "female" || savedGender === "other"
      ? savedGender
      : null;
  const gender: Gender | null = genderChoice ?? storedGender;
  const [geminiValue, setGeminiValue] = useState<string | null>(null);
  const geminiKey = geminiValue ?? savedGeminiKey;
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [language, setLanguage] = useState<PersonalityLanguage>("easy");
  const [answers, setAnswers] = useState<(boolean | null)[]>(() =>
    Array.from({ length: PERSONALITY_QUESTIONS.length }, () => null),
  );
  const [showWelcomeBg, setShowWelcomeBg] = useState(true);
  const geminiInput = useRef<HTMLInputElement>(null);

  const answeredCount = answers.filter((answer) => answer !== null).length;
  const completedAnswers = useMemo(
    () => (answers.every((answer) => answer !== null) ? (answers as boolean[]) : null),
    [answers],
  );
  const resultId = completedAnswers ? scorePersonality(completedAnswers) : "heart";
  const result = getPersonalityType(resultId);

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

  function goToQuestions() {
    if (!gender) return;
    saveGeminiKey(geminiInput.current?.value ?? geminiKey);
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setAnswer(index: number, value: boolean) {
    setAnswers((current) =>
      current.map((answer, answerIndex) => (answerIndex === index ? value : answer)),
    );
  }

  function showResult() {
    if (!completedAnswers) return;
    setStep(3);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function finish() {
    if (!gender || !completedAnswers) return;
    saveProfile({
      gender,
      type: resultId,
      answers: completedAnswers,
      createdAt: new Date().toISOString(),
    });
    router.push("/map");
  }

  return (
    <main className="min-h-dvh bg-[#cceeff] p-2 sm:p-4">
      <section className="relative mx-auto min-h-[calc(100dvh-1rem)] max-w-7xl overflow-hidden rounded-[28px] border-[14px] border-[#7bcaf0] bg-white p-4 shadow-[inset_0_0_0_4px_rgba(255,255,255,.92),0_14px_40px_rgba(0,79,141,.22)] sm:min-h-[calc(100dvh-2rem)] sm:border-[17px] sm:p-7">
        {showWelcomeBg && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/img/scenes/welcome_bg.png"
            alt=""
            aria-hidden
            onError={() => setShowWelcomeBg(false)}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.13]"
          />
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_12%,rgba(255,255,255,.95),transparent_22%),radial-gradient(circle_at_90%_20%,rgba(216,240,252,.8),transparent_28%),linear-gradient(180deg,rgba(255,255,255,.35),rgba(255,255,255,.74))]"
        />

        <header className="relative z-10 mb-4 flex items-start">
          <MiniGameLogo />
        </header>

        <div className="relative z-10">
          <Stepper step={step} />
        </div>

        {step === 1 && (
          <div className="animate-pop-in relative z-10">
            <h1 className="text-navy mt-7 text-center text-2xl font-black sm:text-3xl">
              ⭐ はじめての チュートリアル ⭐
            </h1>
            <div className="mt-5 rounded-3xl border-2 border-white bg-[#e9f7ff]/90 p-4 shadow-[inset_0_0_24px_rgba(2,136,209,.1)] sm:p-6">
              <h2 className="text-ink text-center text-xl font-extrabold sm:text-2xl">
                ネクマックスアカデミーで、
                <ruby>
                  楽<rt>たの</rt>
                </ruby>
                しく{" "}
                <ruby>
                  学<rt>まな</rt>
                </ruby>
                ぼう！
              </h2>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {[
                  {
                    icon: "💻",
                    title: (
                      <>
                        <ruby>
                          日本<rt>にほん</rt>
                        </ruby>
                        の IT の おしごとを{" "}
                        <ruby>
                          学<rt>まな</rt>
                        </ruby>
                        べる！
                      </>
                    ),
                    body: "プログラミングや IT の しごとを たのしく まなべるよ！",
                  },
                  {
                    icon: "🤝",
                    title: <>チームで コミュニケーション！</>,
                    body: (
                      <>
                        なかまと はなして、アイデアを{" "}
                        <ruby>
                          出<rt>だ</rt>
                        </ruby>
                        しあって せいちょうしよう！
                      </>
                    ),
                  },
                  {
                    icon: "🗾",
                    title: (
                      <>
                        <ruby>
                          日本<rt>にほん</rt>
                        </ruby>
                        の IT パスウェイを すすもう！
                      </>
                    ),
                    body: "いろいろな ステージを クリアして、ゴールを めざそう！",
                  },
                ].map((card, index) => (
                  <article
                    key={index}
                    className="card-pop relative overflow-hidden border-white p-4 pt-3 text-center shadow-[0_6px_0_#c5e8f8,0_14px_24px_rgba(0,79,141,.12)]"
                  >
                    <span aria-hidden className="text-sun absolute top-2 left-2">
                      ⭐
                    </span>
                    <div className="mx-auto flex h-28 items-center justify-center">
                      {index === 0 && (
                        <FallbackImage
                          src="/img/ui/feature_learn.png"
                          alt=""
                          fallback={
                            <span className="text-6xl" aria-hidden>
                              {card.icon}
                            </span>
                          }
                          className="h-28 w-full object-contain"
                        />
                      )}
                      {index === 1 && (
                        <div className="relative flex items-end justify-center">
                          <NekuMaxType
                            id="heart"
                            gender="female"
                            size={102}
                            className="translate-x-2 -rotate-3"
                          />
                          <NekuMaxType id="idea" size={96} className="-translate-x-2 rotate-3" />
                          <span
                            aria-hidden
                            className="absolute top-0 left-1/2 rounded-full bg-white px-2 py-0.5 text-sm shadow-md"
                          >
                            💬
                          </span>
                        </div>
                      )}
                      {index === 2 && (
                        <FallbackImage
                          src="/img/ui/feature_pathway.png"
                          alt=""
                          fallback={
                            <span className="text-6xl" aria-hidden>
                              {card.icon}
                            </span>
                          }
                          className="h-28 w-full object-contain"
                        />
                      )}
                    </div>
                    <h3 className="text-navy mt-1 font-black">{card.title}</h3>
                    <p className="text-ink-soft mt-2 text-sm font-bold">{card.body}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <article className="card-pop border-white p-5 shadow-[0_6px_0_#d7eaf5]">
                <h2 className="text-navy font-extrabold">
                  ⭐ Googleでログイン{" "}
                  <span className="text-ink-soft text-xs">
                    （
                    <ruby>
                      任意<rt>にんい</rt>
                    </ruby>
                    ）
                  </span>
                </h2>
                <p className="text-ink-soft mt-2 text-sm font-bold">
                  アカウントで ログインして、データを あんぜんに のこそう！
                </p>
                {loggedIn ? (
                  <p className="bg-leaf/15 text-leaf-deep mt-4 rounded-2xl px-4 py-3 text-center font-extrabold">
                    ✅ ログインずみ
                  </p>
                ) : authReady ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void signInWithGoogle()}
                    className="btn-game border-hairline mt-4 w-full border-2 px-4 py-3 disabled:opacity-60"
                    style={
                      {
                        "--btn-face": "#ffffff",
                        "--btn-shadow": "#c9d8e4",
                        color: "#1f3a56",
                      } as React.CSSProperties
                    }
                  >
                    <GoogleG /> {busy ? "ひらいて います…" : "Google で ログイン"}
                  </button>
                ) : (
                  <p className="bg-sky-soft text-navy mt-4 rounded-2xl px-4 py-3 text-center font-extrabold">
                    じゅんびちゅう
                  </p>
                )}
              </article>

              <article className="card-pop border-white p-5 shadow-[0_6px_0_#d7eaf5]">
                <h2 className="text-navy font-extrabold">
                  ⭐ Google Gemini APIキー{" "}
                  <span className="text-ink-soft text-xs">
                    （
                    <ruby>
                      任意<rt>にんい</rt>
                    </ruby>
                    ）
                  </span>
                </h2>
                <p className="text-ink-soft mt-2 text-sm font-bold">
                  Gemini と つなぐと、AI が まなびを サポートします！
                </p>
                <div className="mt-3 flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <span
                      aria-hidden
                      className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
                    >
                      🔑
                    </span>
                    <input
                      ref={geminiInput}
                      type={showKey ? "text" : "password"}
                      value={geminiKey}
                      onChange={(event) => setGeminiValue(event.target.value)}
                      className="border-hairline w-full rounded-2xl border-2 bg-white py-2 pr-3 pl-10 font-mono text-sm"
                      aria-label="Google Gemini APIキー"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowKey((current) => !current)}
                    className="border-hairline rounded-2xl border-2 bg-white px-3"
                    aria-label={showKey ? "APIキーを かくす" : "APIキーを 見る"}
                  >
                    {showKey ? "🙈" : "👁️"}
                  </button>
                </div>
                <p className="text-ink-soft mt-2 text-xs font-bold">
                  ？ Gemini APIキーは、あとから せっていすることも できます。
                </p>
              </article>

              <article className="card-pop border-white p-5 shadow-[0_6px_0_#d7eaf5]">
                <h2 className="text-navy font-extrabold">
                  ⭐{" "}
                  <ruby>
                    性別<rt>せいべつ</rt>
                  </ruby>{" "}
                  <span className="text-coral-deep text-xs">
                    （
                    <ruby>
                      必須<rt>ひっす</rt>
                    </ruby>
                    ）
                  </span>
                </h2>
                <p className="text-ink-soft mt-2 text-sm font-bold">
                  あなたの せいべつを えらんでね。
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    {
                      id: "male" as const,
                      icon: "👨",
                      image: "/img/ui/gender_male.png",
                      label: "男性",
                      color: "#0288d1",
                    },
                    {
                      id: "female" as const,
                      icon: "👩",
                      image: "/img/ui/gender_female.png",
                      label: "女性",
                      color: "#f26fa7",
                    },
                    {
                      id: "other" as const,
                      icon: "🙂",
                      image: "/img/ui/gender_other.png",
                      label: "その他",
                      color: "#8d6ae8",
                    },
                  ].map((choice) => (
                    <button
                      key={choice.id}
                      type="button"
                      onClick={() => setGenderChoice(choice.id)}
                      className="rounded-2xl border-3 bg-white px-1 py-2 text-sm font-extrabold shadow-sm transition-transform hover:-translate-y-1"
                      style={{
                        borderColor: gender === choice.id ? choice.color : "#dcebf5",
                        backgroundColor: gender === choice.id ? `${choice.color}18` : "#ffffff",
                        color: choice.color,
                      }}
                    >
                      <span className="mx-auto flex h-14 items-center justify-center">
                        <FallbackImage
                          src={choice.image}
                          alt=""
                          fallback={<span className="text-3xl">{choice.icon}</span>}
                          className="h-14 w-14 object-contain"
                        />
                      </span>
                      <ruby>
                        {choice.label}
                        <rt>
                          {choice.id === "male"
                            ? "だんせい"
                            : choice.id === "female"
                              ? "じょせい"
                              : "そのた"}
                        </rt>
                      </ruby>
                    </button>
                  ))}
                </div>
              </article>
            </div>

            <p className="text-ink-soft mt-5 text-center text-xs font-bold">
              🛡️ あんぜんに ほごされます
            </p>
            <div className="mt-4 text-center">
              <button
                type="button"
                disabled={!gender}
                onClick={goToQuestions}
                className="btn-game text-ink min-w-64 px-10 py-4 text-xl disabled:cursor-not-allowed disabled:opacity-45"
                style={
                  {
                    "--btn-face": "#ffc93c",
                    "--btn-shadow": "#f0a819",
                  } as React.CSSProperties
                }
              >
                ⭐ つぎへ ⭐
              </button>
              {!gender && (
                <p className="text-coral-deep mt-3 text-sm font-extrabold">せいべつを えらんでね</p>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-pop-in relative z-10">
            <div className="mt-7 flex flex-col items-center justify-between gap-4 lg:flex-row">
              <div>
                <h1 className="text-navy text-center text-2xl font-black sm:text-3xl lg:text-left">
                  ⭐ ネクマックス
                  <ruby>
                    性格診断<rt>せいかく しんだん</rt>
                  </ruby>{" "}
                  ⭐
                </h1>
                <p className="text-ink-soft mt-2 font-bold">
                  しつもんに こたえて、あなたの せいかくを しろう！
                </p>
              </div>
              <div className="bg-panel-tint flex flex-wrap justify-center rounded-full p-1">
                {[
                  { id: "easy" as const, label: "やさしい日本語" },
                  { id: "japanese" as const, label: "日本語" },
                  { id: "english" as const, label: "English" },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setLanguage(option.id)}
                    className={`rounded-full px-3 py-2 text-xs font-extrabold sm:px-4 ${
                      language === option.id ? "bg-navy text-white" : "text-ink-soft"
                    }`}
                  >
                    {option.id === "english" ? (
                      option.label
                    ) : (
                      <ruby>
                        {option.label}
                        <rt>{option.id === "easy" ? "やさしい にほんご" : "にほんご"}</rt>
                      </ruby>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {PERSONALITY_QUESTIONS.map((question, index) => (
                <fieldset
                  key={question.id}
                  className="card-pop border-white p-4 shadow-[0_4px_0_#d8edf8]"
                >
                  <legend className="sr-only">{question.id}</legend>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <span className="bg-sky grid h-9 w-9 shrink-0 place-items-center rounded-full font-black text-white">
                      {question.id}
                    </span>
                    <p className="text-ink flex-1 font-extrabold">
                      <QuestionText question={question} language={language} />
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:w-48">
                      {[
                        { value: true, label: "はい" },
                        { value: false, label: "いいえ" },
                      ].map((option) => (
                        <button
                          key={String(option.value)}
                          type="button"
                          onClick={() => setAnswer(index, option.value)}
                          className={`flex items-center justify-center gap-2 rounded-2xl border-2 px-3 py-2 text-sm font-extrabold whitespace-nowrap ${
                            answers[index] === option.value
                              ? "border-sky bg-sky-soft text-navy"
                              : "border-hairline text-ink-soft bg-white"
                          }`}
                        >
                          <span
                            aria-hidden
                            className={`grid h-4 w-4 place-items-center rounded-full border-2 ${
                              answers[index] === option.value
                                ? "border-sky bg-sky"
                                : "border-ink-faint bg-white"
                            }`}
                          >
                            {answers[index] === option.value && (
                              <span className="h-1.5 w-1.5 rounded-full bg-white" />
                            )}
                          </span>
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </fieldset>
              ))}
            </div>

            <div className="mt-6 flex flex-col items-center gap-3">
              <div className="flex flex-wrap items-center justify-center gap-3 rounded-full border-2 border-white bg-white/95 px-5 py-2 shadow-[0_4px_0_#c7e6f5]">
                <p className="text-navy font-extrabold">{answeredCount} / 12 もんちゅう</p>
                <div className="flex gap-1.5" aria-hidden>
                  {answers.map((answer, index) => (
                    <span
                      key={index}
                      className={`h-3 w-3 rounded-full border border-white shadow-sm ${
                        answer === null ? "bg-hairline" : "bg-sky"
                      }`}
                    />
                  ))}
                </div>
              </div>
              <button
                type="button"
                disabled={!completedAnswers}
                onClick={showResult}
                className="btn-game text-ink mt-2 min-w-64 px-10 py-4 text-xl disabled:cursor-not-allowed disabled:opacity-45"
                style={
                  {
                    "--btn-face": "#ffc93c",
                    "--btn-shadow": "#f0a819",
                  } as React.CSSProperties
                }
              >
                ⭐ つぎへ ⭐
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="animate-pop-in relative z-10">
            <h1 className="text-navy mt-7 text-center text-2xl font-black sm:text-3xl">
              ⭐ あなたに あう ネクマックス ⭐
            </h1>
            <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.2fr]">
              <div className="relative flex min-h-96 flex-col items-center justify-center rounded-[36px] border-2 border-white bg-[radial-gradient(circle,#fff_0%,#e1f2fb_62%,#d8f0fc_100%)] p-5 shadow-[inset_0_0_35px_rgba(2,136,209,.12)]">
                <p className="bg-sky absolute top-4 z-20 px-8 py-1.5 font-extrabold text-white shadow-[0_5px_0_#0272ae] [clip-path:polygon(0_18%,10%_18%,10%_0,90%_0,90%_18%,100%_18%,93%_100%,7%_100%)]">
                  おすすめタイプ
                </p>
                <div className="relative z-10 mt-8">
                  <NekuMaxType id={result.id} gender={gender ?? "other"} size={285} bob />
                </div>
                <div
                  aria-hidden
                  className="absolute bottom-10 left-1/2 h-12 w-64 -translate-x-1/2 rounded-[50%] border-4 border-white bg-white/90 shadow-[0_12px_18px_rgba(0,79,141,.28)]"
                />
                <div className="absolute bottom-3 left-3 z-20 flex w-32 flex-col items-center text-center">
                  <div className="grid h-16 w-16 place-items-center rounded-[42%_42%_50%_50%] border-4 border-white bg-linear-to-b from-[#078ed6] to-[#004f8d] text-2xl text-white shadow-[0_5px_0_#003c6b]">
                    ⭐
                  </div>
                  <p className="bg-navy mt-1 rounded-xl px-2 py-1 text-[10px] leading-tight font-extrabold text-white">
                    <RubyText
                      text={result.resultStrengths}
                      readings={PERSONALITY_RESULT_READINGS}
                    />
                  </p>
                </div>
              </div>

              <div>
                <p className="text-ink font-extrabold">
                  あなたに ぴったりの ネクマックスは こちらです！
                </p>
                <h2 className="bg-navy mt-3 flex items-center gap-3 rounded-2xl px-5 py-3 text-xl font-black text-white shadow-[0_5px_0_#003c6b] sm:text-2xl">
                  <span
                    aria-hidden
                    className="text-navy grid h-10 w-10 shrink-0 place-items-center bg-white font-black [clip-path:polygon(25%_7%,75%_7%,100%_50%,75%_93%,25%_93%,0_50%)]"
                  >
                    N
                  </span>
                  <span className="flex-1 text-center">{result.name}</span>
                </h2>
                <h3 className="text-navy mt-5 text-lg font-black">
                  あなたの
                  <ruby>
                    性格分析<rt>せいかく ぶんせき</rt>
                  </ruby>
                </h3>
                <ul className="mt-3 space-y-2">
                  {result.analysis.map((line) => (
                    <li key={line} className="text-ink flex gap-2 font-bold">
                      <span className="text-leaf-deep">✓</span>
                      <RubyText text={line} readings={PERSONALITY_RESULT_READINGS} />
                    </li>
                  ))}
                </ul>

                <h3 className="text-navy mt-6 font-black">ほかのタイプも チェック！</h3>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {PERSONALITY_TYPES.filter((type) => type.id !== result.id).map((type) => (
                    <article
                      key={type.id}
                      className="card-pop border-3 p-2 text-center shadow-[0_4px_0_rgba(0,79,141,.12)]"
                      style={{ borderColor: type.color }}
                    >
                      <NekuMaxType
                        id={type.id}
                        gender={gender ?? "other"}
                        size={78}
                        className="mx-auto"
                      />
                      <p className="text-ink text-xs font-extrabold">{type.name}</p>
                      <p className="text-ink-soft mt-1 text-[10px] font-bold">
                        <RubyText
                          text={type.strengths[0] ?? ""}
                          readings={PERSONALITY_RESULT_READINGS}
                        />
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-7 text-center">
              <p className="text-ink-soft mb-3 text-sm font-bold">
                このけっかは あなたの こたえから つくられました。
              </p>
              <button
                type="button"
                onClick={finish}
                className="btn-game text-ink min-w-64 px-10 py-4 text-xl"
                style={
                  {
                    "--btn-face": "#ffc93c",
                    "--btn-shadow": "#f0a819",
                  } as React.CSSProperties
                }
              >
                ⭐ はじめる ⭐
              </button>
            </div>
          </div>
        )}

        <div
          className={`relative z-10 mt-5 flex items-end gap-4 ${
            step === 2 ? "justify-end sm:flex-row-reverse" : "justify-between"
          }`}
        >
          <div
            className={`flex items-end gap-2 ${
              step === 1 ? "-mb-7 -ml-6" : step === 3 ? "-mb-3 -ml-2" : "-mr-3"
            }`}
          >
            <NekuMaxType
              id={step === 2 ? "idea" : step === 3 ? result.id : "leader"}
              gender={step === 3 ? (gender ?? "other") : "other"}
              size={step === 1 ? 170 : step === 2 ? 142 : 108}
              className="shrink-0 drop-shadow-[0_10px_8px_rgba(0,79,141,.2)]"
            />
            <p
              className={`text-navy relative mb-5 max-w-xs rounded-3xl border-2 border-white bg-white px-4 py-3 text-sm font-extrabold shadow-[0_5px_0_#bfe4f5] ${
                step === 2 ? "rounded-br-md" : "rounded-bl-md"
              }`}
            >
              {step === 1 && "はじめに せっていを しましょう！"}
              {step === 2 && "しつもんに こたえると、あなたに あう ネクマックスが わかるよ！"}
              {step === 3 && "いっしょに がんばろう！"}
            </p>
          </div>
          <p className="border-hairline bg-panel-tint text-ink-soft mb-3 hidden rounded-2xl border-2 px-4 py-3 text-xs font-bold md:block">
            🔒 いつでも せっていを{" "}
            <ruby>
              見<rt>み</rt>
            </ruby>
            なおせます。あとから「せってい」で{" "}
            <ruby>
              変<rt>か</rt>
            </ruby>
            えられるよ。
          </p>
        </div>
      </section>
    </main>
  );
}
