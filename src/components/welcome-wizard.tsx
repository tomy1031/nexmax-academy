"use client";

import { Fragment, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  PERSONALITY_AXIS_META,
  PERSONALITY_INTRO,
  PERSONALITY_FAMILIES,
  PERSONALITY_QUESTIONS,
  PERSONALITY_RESULT_READINGS,
  calculatePersonalityScores,
  getCloseAxis,
  getCompatibility,
  getFamilyForCode,
  getPersonalityType,
  scorePersonality,
  type PersonalityAnswer,
  type PersonalityLanguage,
  type PersonalityQuestion,
  type PersonalityQuestionOption,
  type PersonalityTypeCode,
} from "@/content/personality";
import { NexMaxFamily, NexMaxType, TypeEmblem } from "@/components/nexmax-types";
import { GlossaryChip, GlossaryText } from "@/components/glossary-text";
import { LearnerText, RubyText, renderRuby } from "@/components/ruby-text";
import { findAllGlossaryTerms } from "@/content/glossary";
import { insertPersonalityResult, upsertOwnProfile } from "@/lib/profile-db";
import { createClient } from "@/lib/supabase/client";
import { getGeminiKey, saveGeminiKey, saveProfile, type Gender } from "@/lib/profile";

function subscribeToStorage(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
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

function QuizIllustration({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden
      onError={() => setFailed(true)}
      className="mx-auto h-56 w-full rounded-3xl object-cover sm:h-72"
    />
  );
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const numberMarks = ["❶", "❷", "❸", "❹"];
  const items: { number: number; label: ReactNode }[] = [
    { number: 1, label: <>チュートリアル</> },
    {
      number: 2,
      label: <RubyText text="性格診断" readings={PERSONALITY_RESULT_READINGS} />,
    },
    {
      number: 3,
      label: <RubyText text="結果" readings={PERSONALITY_RESULT_READINGS} />,
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
  // 柱書きは <p> の中なので語彙メモ（ボタン）を入れられる。
  // 選択肢は <button> の中なのでボタンを入れ子にできず、OptionText はルビだけ（§2.5）。
  if (language === "japanese") {
    return (
      <GlossaryText text={question.japanese} readings={question.readings} renderText={renderRuby} />
    );
  }
  if (language === "easy") {
    return (
      <GlossaryText text={question.easy} readings={question.readings} renderText={renderRuby} />
    );
  }
  return <>{question.english}</>;
}

function OptionText({
  option,
  question,
  language,
}: {
  option: PersonalityQuestionOption;
  question: PersonalityQuestion;
  language: PersonalityLanguage;
}) {
  if (language === "japanese") {
    return <RubyText text={option.japanese} readings={question.readings} />;
  }
  if (language === "easy") {
    return <RubyText text={option.easy} readings={question.readings} />;
  }
  return <>{option.english}</>;
}

/**
 * 設問1つぶんの「ことばメモ」。柱書きと Ⓐ/Ⓑ に出るN4超えの語を集めて並べる。
 * 英語モードでは出さない（本文がすでに英語なので二重になる）。
 */
function QuestionGlossary({
  question,
  language,
}: {
  question: PersonalityQuestion;
  language: PersonalityLanguage;
}) {
  if (language === "english") return null;
  const entries =
    language === "japanese"
      ? findAllGlossaryTerms(question.japanese, question.a.japanese, question.b.japanese)
      : findAllGlossaryTerms(question.easy, question.a.easy, question.b.easy);
  if (entries.length === 0) return null;

  return (
    <div className="border-hairline mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
      <span className="text-ink-soft text-xs font-black">ことばメモ</span>
      {entries.map((entry) => (
        <GlossaryChip key={entry.term} entry={entry} />
      ))}
    </div>
  );
}

/**
 * 20問の前に出す導入（07 §3.0）。
 *
 * **「性格」を知らない前提**で書く。辞書を引いても抽象語に着地して意味が取れないので、
 * 先に「人には すきな やりかたが ある」という具体を渡してから語を当てる。
 * 文言は台帳（`PERSONALITY_INTRO`）にあり、文言テストの対象になっている。
 */
function QuestionIntro({
  language,
  onStart,
}: {
  language: PersonalityLanguage;
  onStart: () => void;
}) {
  const intro = PERSONALITY_INTRO[language];
  const render = (text: string) =>
    language === "english" ? (
      text
    ) : (
      <GlossaryText text={text} readings={PERSONALITY_RESULT_READINGS} renderText={renderRuby} />
    );

  return (
    <div className="animate-pop-in mx-auto mt-6 max-w-3xl">
      <div className="card-pop border-4 border-white p-5 shadow-[0_8px_0_#c7e6f5,0_20px_36px_rgba(0,79,141,.16)] sm:p-7">
        <h2 className="text-navy text-xl font-black sm:text-2xl">{intro.title}</h2>
        <ul className="mt-4 space-y-3">
          {intro.lines.map((line) => (
            <li key={line} className="text-ink flex gap-2 leading-loose font-bold">
              <span className="text-sky shrink-0">●</span>
              <span className="flex-1">{render(line)}</span>
            </li>
          ))}
        </ul>
        <p className="bg-sun/25 text-ink mt-5 rounded-2xl px-4 py-3 font-bold">
          {render(intro.note)}
        </p>
        {/* 本文の下線は1文に1語だけなので、「性格診断」のような複合語の後半（診断）が
            引けない。設問と同じ「ことばメモ」を置いて、導入の語も1か所で引けるようにする。 */}
        {language !== "english" && (
          <div className="border-hairline mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
            <span className="text-ink-soft text-xs font-black">ことばメモ</span>
            {findAllGlossaryTerms(...intro.lines, intro.note).map((entry) => (
              <GlossaryChip key={entry.term} entry={entry} />
            ))}
          </div>
        )}
        <div className="mt-6 text-center">
          <button type="button" onClick={onStart} className="btn-game px-10 py-4 text-lg">
            {intro.startLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 全問共通の問いかけ（07 §3.1）。 */
const ASK_LABEL: Readonly<Record<PersonalityLanguage, string>> = {
  easy: "あなたに ちかいのは、どっちですか?",
  japanese: "あなたに近いのは、どっちですか?",
  english: "Which one is closer to you?",
};

function CompatibilityCard({ code, reason }: { code: PersonalityTypeCode; reason: string }) {
  const type = getPersonalityType(code);
  const family = getFamilyForCode(code);
  return (
    <article
      className="card-pop flex items-center gap-2 border-3 p-2 text-left shadow-[0_4px_0_rgba(0,79,141,.12)]"
      style={{ borderColor: family.color }}
    >
      <TypeEmblem code={code} size={40} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="text-ink block truncate text-xs font-extrabold">{type.name}</span>
        <span className="text-ink-soft block text-[10px] leading-snug font-bold">
          <RubyText text={reason} readings={PERSONALITY_RESULT_READINGS} />
        </span>
      </span>
    </article>
  );
}

export function WelcomeWizard({
  authReady,
  loggedIn,
  email,
  saved = null,
  retake = false,
}: {
  authReady: boolean;
  loggedIn: boolean;
  email: string | null;
  /** 保存済みの名前と性別。やり直しのときに入れ直させないため。 */
  saved?: { displayName: string; gender: Gender } | null;
  /** 診断のやり直しとして開かれたか。文言の出し分けにだけ使う。 */
  retake?: boolean;
}) {
  const router = useRouter();
  const savedGeminiKey = useSyncExternalStore(subscribeToStorage, savedGeminiKeySnapshot, () => "");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [displayName, setDisplayName] = useState(saved?.displayName ?? "");
  const [genderChoice, setGenderChoice] = useState<Gender | null>(saved?.gender ?? null);
  const gender = genderChoice;
  const [geminiValue, setGeminiValue] = useState<string | null>(null);
  const geminiKey = geminiValue ?? savedGeminiKey;
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [language, setLanguage] = useState<PersonalityLanguage>("easy");
  // 診断の途中で言語を切り替えたか（08 §5.2）。回答言語と一緒に保存する。
  const languageSwitchedRef = useRef(false);
  const [answers, setAnswers] = useState<(PersonalityAnswer | null)[]>(() =>
    Array.from({ length: PERSONALITY_QUESTIONS.length }, () => null),
  );
  const [questionIndex, setQuestionIndex] = useState(0);
  // 20問の前に出す導入（07 §3.0）。「性格」という語自体を知らない前提なので、
  // いきなり Q1 を出さずに、何をする時間なのかを先に渡す。
  const [introRead, setIntroRead] = useState(false);
  const [questionDirection, setQuestionDirection] = useState(1);
  const [saveError, setSaveError] = useState(false);
  const [showWelcomeBg, setShowWelcomeBg] = useState(true);
  const geminiInput = useRef<HTMLInputElement>(null);

  const completedAnswers = useMemo(
    () => (answers.every((answer) => answer !== null) ? (answers as PersonalityAnswer[]) : null),
    [answers],
  );
  // 20問そろうまでは結果を出さない。既定値は型合わせのためだけのもので画面には出ない。
  const resultCode: PersonalityTypeCode = completedAnswers
    ? scorePersonality(completedAnswers)
    : "ISTJ";
  const result = getPersonalityType(resultCode);
  const resultFamily = getFamilyForCode(resultCode);
  const resultScores = useMemo(
    () => (completedAnswers ? calculatePersonalityScores(completedAnswers) : null),
    [completedAnswers],
  );
  const closeAxis = resultScores ? getCloseAxis(resultScores) : null;
  const compatibility = getCompatibility(resultCode);
  const currentQuestion = PERSONALITY_QUESTIONS[questionIndex]!;
  const missingSetupItems = [
    !loggedIn ? "ログイン" : null,
    !displayName.trim() ? "なまえ" : null,
    !gender ? "せいべつ" : null,
  ].filter((item): item is string => item !== null);

  async function signInWithGoogle() {
    const supabase = createClient();
    if (!supabase) return;
    setBusy(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  function goToQuestions() {
    if (!loggedIn || !displayName.trim() || !gender) return;
    saveGeminiKey(geminiInput.current?.value ?? geminiKey);
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setAnswer(index: number, value: PersonalityAnswer) {
    setAnswers((current) =>
      current.map((answer, answerIndex) => (answerIndex === index ? value : answer)),
    );
    if (index < PERSONALITY_QUESTIONS.length - 1) {
      setQuestionDirection(1);
      setQuestionIndex(index + 1);
    }
  }

  function previousQuestion() {
    if (questionIndex === 0) return;
    setQuestionDirection(-1);
    setQuestionIndex((current) => current - 1);
  }

  function nextQuestion() {
    if (answers[questionIndex] === null || questionIndex >= PERSONALITY_QUESTIONS.length - 1) {
      return;
    }
    setQuestionDirection(1);
    setQuestionIndex((current) => current + 1);
  }

  function jumpToAnsweredQuestion(index: number) {
    if (answers[index] === null || index === questionIndex) return;
    setQuestionDirection(index > questionIndex ? 1 : -1);
    setQuestionIndex(index);
  }

  function showResult() {
    if (!completedAnswers) return;
    setStep(3);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function finish() {
    if (!gender || !completedAnswers) return;
    setBusy(true);
    setSaveError(false);
    const scores = calculatePersonalityScores(completedAnswers);
    try {
      const stored = await upsertOwnProfile({
        displayName: displayName.trim(),
        gender,
        personalityType: resultCode,
        answers: completedAnswers,
        scores,
        answerLanguage: language,
        languageSwitched: languageSwitchedRef.current,
      });
      try {
        await insertPersonalityResult({
          personalityType: resultCode,
          answers: completedAnswers,
          scores,
          answerLanguage: language,
          languageSwitched: languageSwitchedRef.current,
        });
      } catch {
        // 最新プロフィールが保存できていれば学習を止めず、記録台帳の失敗だけを許容する。
      }
      saveProfile({
        displayName: stored.display_name,
        gender: stored.gender,
        type: stored.personality_type,
        scores: stored.scores,
        createdAt: stored.created_at,
      });
      router.push("/map");
    } catch {
      setSaveError(true);
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#cceeff] p-2 sm:p-4">
      <section className="relative mx-auto min-h-[calc(100dvh-1rem)] max-w-7xl overflow-hidden rounded-[28px] border-[14px] border-[#7bcaf0] bg-white p-4 shadow-[inset_0_0_0_4px_rgba(255,255,255,.92),0_14px_40px_rgba(0,79,141,.22)] sm:min-h-[calc(100dvh-2rem)] sm:border-[17px] sm:p-7">
        {showWelcomeBg && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/img/scenes/welcome_bg.webp"
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
              {retake ? "⭐ せいかくしんだんを もういちど ⭐" : "⭐ はじめての チュートリアル ⭐"}
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
                          src="/img/ui/feature_learn.webp"
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
                          <NexMaxFamily
                            family="heart"
                            gender="female"
                            size={102}
                            className="translate-x-2 -rotate-3"
                          />
                          <NexMaxFamily
                            family="idea"
                            size={96}
                            className="-translate-x-2 rotate-3"
                          />
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
                          src="/img/ui/feature_pathway.webp"
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

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <article className="card-pop border-white p-5 shadow-[0_6px_0_#d7eaf5]">
                <h2 className="text-navy font-extrabold">
                  ⭐ Googleでログイン{" "}
                  <span className="text-coral-deep text-xs">
                    （
                    <ruby>
                      必須<rt>ひっす</rt>
                    </ruby>
                    ）
                  </span>
                </h2>
                <p className="text-ink-soft mt-2 text-sm font-bold">
                  アカウントで ログインして、データを あんぜんに のこそう！
                </p>
                {loggedIn ? (
                  <div className="bg-leaf/15 text-leaf-deep mt-4 rounded-2xl px-4 py-3 text-center font-extrabold">
                    <p>✅ ログインできました！</p>
                    {email && <p className="text-ink-soft mt-1 text-xs break-all">{email}</p>}
                  </div>
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
                  ⭐ なまえ{" "}
                  <span className="text-coral-deep text-xs">
                    （
                    <ruby>
                      必須<rt>ひっす</rt>
                    </ruby>
                    ）
                  </span>
                </h2>
                <p className="text-ink-soft mt-2 text-sm font-bold">
                  マップで つかう なまえだよ。ニックネームでも OK！
                </p>
                <input
                  type="text"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="れい：ソピア"
                  maxLength={20}
                  className="border-hairline mt-4 w-full rounded-2xl border-2 bg-white px-4 py-2 font-bold"
                />
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
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {[
                    {
                      id: "male" as const,
                      icon: "👨",
                      image: "/img/ui/gender_male.webp",
                      label: "男性",
                      color: "#0288d1",
                    },
                    {
                      id: "female" as const,
                      icon: "👩",
                      image: "/img/ui/gender_female.webp",
                      label: "女性",
                      color: "#f26fa7",
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
                        <rt>{choice.id === "male" ? "だんせい" : "じょせい"}</rt>
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
                disabled={!loggedIn || !displayName.trim() || !gender}
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
              {missingSetupItems.length > 0 && (
                <p className="text-coral-deep mt-3 text-sm font-extrabold">
                  {missingSetupItems.join("と ")}を おねがいね
                </p>
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
                    onClick={() => {
                      if (option.id !== language) languageSwitchedRef.current = true;
                      setLanguage(option.id);
                    }}
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

            {!introRead ? (
              <QuestionIntro
                language={language}
                onStart={() => {
                  setIntroRead(true);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            ) : (
              <>
                <div className="mx-auto mt-6 max-w-3xl overflow-hidden">
                  <AnimatePresence mode="wait" custom={questionDirection}>
                    <motion.fieldset
                      key={currentQuestion.id}
                      custom={questionDirection}
                      initial={{ opacity: 0, x: 90 * questionDirection }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -90 * questionDirection }}
                      transition={{ duration: 0.24, ease: "easeOut" }}
                      className="card-pop border-4 border-white p-4 shadow-[0_8px_0_#c7e6f5,0_20px_36px_rgba(0,79,141,.16)] sm:p-6"
                    >
                      <legend className="sr-only">{currentQuestion.id}</legend>
                      <QuizIllustration src={currentQuestion.image} />
                      <div className="mt-5 flex items-start gap-3">
                        <span className="bg-sky grid h-10 w-10 shrink-0 place-items-center rounded-full font-black text-white shadow-[0_4px_0_#0272ae]">
                          {currentQuestion.id}
                        </span>
                        <p className="text-ink flex-1 text-lg font-extrabold sm:text-xl">
                          <QuestionText question={currentQuestion} language={language} />
                        </p>
                      </div>
                      <p className="text-ink-soft mt-3 text-center text-sm font-extrabold">
                        {ASK_LABEL[language]}
                      </p>
                      {/* Ⓐ/Ⓑ の2択。どちらが正しいという場面ではないので、優劣を感じさせる色は使わない。 */}
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {(
                          [
                            { value: "a" as const, mark: "Ⓐ", option: currentQuestion.a },
                            { value: "b" as const, mark: "Ⓑ", option: currentQuestion.b },
                          ] as const
                        ).map((choice) => (
                          <button
                            key={choice.value}
                            type="button"
                            onClick={() => setAnswer(questionIndex, choice.value)}
                            aria-pressed={answers[questionIndex] === choice.value}
                            className={`flex min-h-28 items-start gap-3 rounded-3xl border-3 px-4 py-4 text-left text-base font-extrabold ${
                              answers[questionIndex] === choice.value
                                ? "border-sky bg-sky-soft text-navy shadow-[0_5px_0_#9dd8f2]"
                                : "border-hairline text-ink bg-white shadow-[0_4px_0_#dcebf5]"
                            }`}
                          >
                            <span
                              aria-hidden
                              className="text-sky grid h-9 w-9 shrink-0 place-items-center text-2xl leading-none"
                            >
                              {choice.mark}
                            </span>
                            <span className="flex-1 leading-relaxed">
                              <OptionText
                                option={choice.option}
                                question={currentQuestion}
                                language={language}
                              />
                            </span>
                          </button>
                        ))}
                      </div>
                      {/* Ⓐ/Ⓑ は <button> なので中に語彙メモを置けない。
                      柱書きと選択肢のむずかしい語を、ここに1か所で集める（07 §2.5）。 */}
                      <QuestionGlossary question={currentQuestion} language={language} />
                    </motion.fieldset>
                  </AnimatePresence>
                </div>

                <div className="mt-6 flex flex-col items-center gap-4">
                  <div className="flex flex-wrap items-center justify-center gap-3 rounded-full border-2 border-white bg-white/95 px-5 py-2 shadow-[0_4px_0_#c7e6f5]">
                    <p className="text-navy font-extrabold">
                      20もんの うち {questionIndex + 1} もんめ
                    </p>
                    <div className="flex flex-wrap justify-center gap-1.5">
                      {answers.map((answer, index) => (
                        <button
                          type="button"
                          key={index}
                          disabled={answer === null}
                          aria-label={`${index + 1}もんめへ`}
                          aria-current={index === questionIndex ? "step" : undefined}
                          onClick={() => jumpToAnsweredQuestion(index)}
                          className={`h-3 w-3 rounded-full border border-white shadow-sm ${
                            answer === null
                              ? "bg-hairline"
                              : index === questionIndex
                                ? "bg-navy ring-2 ring-white"
                                : "bg-sky cursor-pointer hover:scale-125"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex w-full max-w-3xl items-center justify-between gap-4">
                    <button
                      type="button"
                      disabled={questionIndex === 0}
                      onClick={previousQuestion}
                      className="text-navy rounded-full bg-white px-5 py-2 font-extrabold shadow-md disabled:opacity-0"
                    >
                      ← もどる
                    </button>
                    {questionIndex < PERSONALITY_QUESTIONS.length - 1 ? (
                      <button
                        type="button"
                        disabled={answers[questionIndex] === null}
                        onClick={nextQuestion}
                        className="btn-game px-8 py-3 text-lg [--btn-face:#ffc93c] [--btn-shadow:#f0a819] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        つぎへ →
                      </button>
                    ) : (
                      answers[questionIndex] !== null && (
                        <button
                          type="button"
                          disabled={!completedAnswers}
                          onClick={showResult}
                          className="btn-game px-8 py-3 text-lg [--btn-face:#ffc93c] [--btn-shadow:#f0a819] disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          けっかを{" "}
                          <ruby>
                            見る<rt>みる</rt>
                          </ruby>
                        </button>
                      )
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="animate-pop-in relative z-10">
            <h1 className="text-navy mt-7 text-center text-2xl font-black sm:text-3xl">
              ⭐ あなたの ネクマックス ⭐
            </h1>
            <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.2fr]">
              <div className="relative flex min-h-96 flex-col items-center justify-center rounded-[36px] border-2 border-white bg-[radial-gradient(circle,#fff_0%,#e1f2fb_62%,#d8f0fc_100%)] p-5 shadow-[inset_0_0_35px_rgba(2,136,209,.12)]">
                <p className="bg-sky absolute top-4 z-20 px-8 py-1.5 font-extrabold text-white shadow-[0_5px_0_#0272ae] [clip-path:polygon(0_18%,10%_18%,10%_0,90%_0,90%_18%,100%_18%,93%_100%,7%_100%)]">
                  あなたの タイプ
                </p>
                <div className="relative z-10 mt-8">
                  <NexMaxType code={result.code} gender={gender ?? "male"} size={285} bob />
                </div>
                <div className="absolute top-16 right-4 z-20">
                  <TypeEmblem code={result.code} size={72} />
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
                      text={resultFamily.strengths.join("・")}
                      readings={PERSONALITY_RESULT_READINGS}
                    />
                  </p>
                </div>
              </div>

              <div>
                <p className="text-ink text-lg font-extrabold">
                  あなたは
                  <RubyText
                    text={`「${resultFamily.name}」`}
                    readings={[{ text: resultFamily.name, reading: resultFamily.reading }]}
                  />
                  の <span className="text-navy">{result.name}</span> です。
                </p>
                {/* 家族 → タイプ の2段。16通りでも学習者が迷子にならないための構え（07 §1.3）。 */}
                <p
                  className="mt-3 inline-block rounded-full px-4 py-1 text-sm font-black text-white"
                  style={{ backgroundColor: resultFamily.color }}
                >
                  <RubyText
                    text={resultFamily.name}
                    readings={[{ text: resultFamily.name, reading: resultFamily.reading }]}
                  />
                </p>
                {/* 4文字コードは出さない。ネクマックス診断として完結させる（07 §1.3）。 */}
                <h2 className="bg-navy mt-2 flex items-center gap-3 rounded-2xl px-5 py-3 text-xl font-black text-white shadow-[0_5px_0_#003c6b] sm:text-2xl">
                  <span aria-hidden className="shrink-0 text-2xl">
                    {result.emblem}
                  </span>
                  <span className="flex-1 text-center">{result.name}</span>
                </h2>
                <p className="text-ink-soft mt-2 text-sm font-extrabold">
                  <LearnerText text={result.tagline} />
                </p>
                <h3 className="text-navy mt-5 text-lg font-black">あなたは こんな 人</h3>
                <ul className="mt-3 space-y-2">
                  {result.analysis.map((line) => (
                    <li key={line} className="text-ink flex gap-2 font-bold">
                      <span className="text-leaf-deep">✓</span>
                      <LearnerText text={line} />
                    </li>
                  ))}
                </ul>

                {/* 3-2 の僅差だけ「どちらも いい ところ」と出す。決めつけない（07 §4.3）。 */}
                {closeAxis && (
                  <p className="bg-sun/25 text-ink mt-4 rounded-2xl px-4 py-3 text-sm font-bold">
                    「{PERSONALITY_AXIS_META[closeAxis].poleLabels[0]}」と「
                    {PERSONALITY_AXIS_META[closeAxis].poleLabels[1]}」は、どちらも あなたの いい
                    ところです。ときに よって、りょうほう つかって いますね。
                  </p>
                )}

                <h3 className="text-navy mt-6 font-black">チームで あなたが とくいな しごと</h3>
                <p className="text-ink mt-2 font-bold">
                  <span className="bg-navy mr-2 rounded-lg px-2 py-1 text-sm text-white">
                    <RubyText text={result.teamRole} readings={PERSONALITY_RESULT_READINGS} />
                  </span>
                  <LearnerText text={result.teamRoleDetail} />
                </p>

                {/* 相性。「合わない相手」という枠組みはUIに一切登場させない（07 §5.1）。 */}
                <h3 className="text-navy mt-6 font-black">
                  すぐに <LearnerText text="話が できる 仲間" />
                </h3>
                <p className="text-ink-soft mt-1 text-xs font-bold">
                  すこしの ことばでも、わかって もらえます。
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {compatibility.similar.map((card) => (
                    <CompatibilityCard key={card.code} code={card.code} reason={card.reason} />
                  ))}
                </div>

                <h3 className="text-navy mt-5 font-black">
                  じぶんに ない ものを もって いる <LearnerText text="仲間" />
                </h3>
                <p className="text-ink-soft mt-1 text-xs font-bold">
                  見て いる ところが ちがうので、二人が いると チームが もっと よく なります。
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {compatibility.complementary.map((card) => (
                    <CompatibilityCard key={card.code} code={card.code} reason={card.reason} />
                  ))}
                </div>
                {/* 載らない11タイプが「合わない」と読まれないようにする受け皿（07 §5）。 */}
                <p className="text-ink-soft mt-3 text-xs font-bold">
                  ここに ない タイプとも、いい チームに なれます。
                </p>
              </div>
            </div>

            {/* N3の学習者の回遊先。自分の1つを見たあと、16通りを眺められるようにする（07 §7）。 */}
            <details className="card-pop mt-6 p-4">
              <summary className="text-navy cursor-pointer font-black">
                ほかの 15タイプも 見て みよう
              </summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {PERSONALITY_FAMILIES.map((family) => (
                  <section key={family.id}>
                    <h4
                      className="inline-block rounded-full px-3 py-1 text-xs font-black text-white"
                      style={{ backgroundColor: family.color }}
                    >
                      <RubyText
                        text={family.name}
                        readings={[{ text: family.name, reading: family.reading }]}
                      />
                    </h4>
                    <ul className="mt-2 space-y-1.5">
                      {family.codes.map((code) => {
                        const type = getPersonalityType(code);
                        return (
                          <li key={code} className="flex items-center gap-2">
                            <TypeEmblem code={code} size={28} className="shrink-0" />
                            <span className="min-w-0">
                              <span
                                className={`text-ink block truncate text-xs ${
                                  code === result.code ? "font-black" : "font-bold"
                                }`}
                              >
                                {type.name}
                                {code === result.code && "（あなた）"}
                              </span>
                              <span className="text-ink-soft block text-[10px] font-bold">
                                <RubyText
                                  text={type.tagline}
                                  readings={PERSONALITY_RESULT_READINGS}
                                />
                              </span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            </details>

            <div className="mt-7 text-center">
              <p className="text-ink-soft mb-3 text-sm font-bold">
                このけっかは あなたの こたえから つくられました。
              </p>
              <button
                type="button"
                onClick={() => void finish()}
                disabled={busy}
                className="btn-game text-ink min-w-64 px-10 py-4 text-xl disabled:opacity-55"
                style={
                  {
                    "--btn-face": "#ffc93c",
                    "--btn-shadow": "#f0a819",
                  } as React.CSSProperties
                }
              >
                ⭐ はじめる ⭐
              </button>
              {saveError && (
                <p className="text-coral-deep mt-4 font-extrabold">
                  ほぞんに しっぱいしました。インターネットを かくにんして、もういちど おしてね。
                </p>
              )}
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
            <NexMaxFamily
              family={step === 2 ? "idea" : step === 3 ? result.familyId : "leader"}
              gender={step === 3 ? (gender ?? "male") : "male"}
              size={step === 1 ? 170 : step === 2 ? 142 : 108}
              className="shrink-0 drop-shadow-[0_10px_8px_rgba(0,79,141,.2)]"
            />
            <p
              className={`text-navy relative mb-5 max-w-xs rounded-3xl border-2 border-white bg-white px-4 py-3 text-sm font-extrabold shadow-[0_5px_0_#bfe4f5] ${
                step === 2 ? "rounded-br-md" : "rounded-bl-md"
              }`}
            >
              {step === 1 &&
                (retake ? "せっていを かくにんしましょう！" : "はじめに せっていを しましょう！")}
              {step === 2 && "しつもんに こたえると、あなたの タイプが わかるよ！"}
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
