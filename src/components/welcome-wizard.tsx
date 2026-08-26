"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Link from "next/link";
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
  questionReadings,
  scorePersonality,
  type PersonalityAnswer,
  type PersonalityLanguage,
  type PersonalityQuestion,
  type PersonalityQuestionOption,
  type PersonalityTypeCode,
} from "@/content/personality";
import { AcademyLogo } from "@/components/academy-logo";
import {
  FallbackImage,
  GeminiKeyCard,
  GenderCard,
  NameCard,
  SchoolCard,
} from "@/components/learner-fields";
import { NexMaxFamily, NexMaxType, TypeEmblem } from "@/components/nexmax-types";
import { GlossaryChip, GlossaryText } from "@/components/glossary-text";
import {
  LearnerText,
  RUBY_CHIP,
  RUBY_ON_COLOR,
  RubyText,
  renderRuby,
} from "@/components/ruby-text";
import { CARD_EDGE, CARD_EDGE_SM, CHIP_EDGE } from "@/components/card-edge";
import { findAllGlossaryTerms } from "@/content/glossary";
import { insertPersonalityResultOnce, updateOwnDetails, upsertOwnProfile } from "@/lib/profile-db";
import { areNamesValid, type LearnerNames } from "@/lib/name";
import { isSchoolChosen, type LearnerSchool } from "@/lib/school";
import {
  canResumeQuestions,
  clearDiagnosisDraft,
  getDiagnosisDraft,
  getGeminiKey,
  isDiagnosedRow,
  saveDiagnosisDraft,
  saveGeminiKey,
  saveProfile,
  type DiagnosisDraft,
  type Gender,
} from "@/lib/profile";

function subscribeToStorage(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

function savedGeminiKeySnapshot(): string {
  return getGeminiKey();
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
                ? `border-navy bg-navy text-white ${RUBY_ON_COLOR}`
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
  // 読み辞書は設問固有＋共通を合わせたもの。やさしい日本語と日本語で同じものを使う。
  const readings = questionReadings(question);
  if (language === "japanese") {
    return <GlossaryText text={question.japanese} readings={readings} renderText={renderRuby} />;
  }
  if (language === "easy") {
    return <GlossaryText text={question.easy} readings={readings} renderText={renderRuby} />;
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
  const readings = questionReadings(question);
  if (language === "japanese") {
    return <RubyText text={option.japanese} readings={readings} />;
  }
  if (language === "easy") {
    return <RubyText text={option.easy} readings={readings} />;
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
        <GlossaryChip key={entry.term} entry={entry} renderText={renderRuby} />
      ))}
    </div>
  );
}

/**
 * 「得意な ことが ちがう」の 例を 何行目の あとに 出すか。
 *
 * 例は 3行目（「人に よって、得意な ことが ちがいます」）の 絵解きなので、
 * その 直後に 置かないと 何の 例か 分からなくなる。台帳の 並びが 変わったら
 * ここも 直す（`tests/personality.test.ts` が 3行目に「得意」が あることを 見張る）。
 */
const INTRO_EXAMPLES_AFTER = 3;

/**
 * 20問の前に出す導入（07 §3.0）。
 *
 * **抽象語から入らない。** 辞書を引いても「せいかく」「タイプ」は抽象語に着地して
 * 意味が取れないので、先に「人に よって 得意な ことが ちがう」という具体を渡してから
 * 語を当てる。入口を チームに 置くのは 2026-08-21 の指定（台帳の コメント参照）。
 *
 * 得意の 例には **近い ネクマックスの 絵**を 添える。呼び名は 出さない——
 * 16の 呼び名に 会うのは 結果画面が 最初、という 順番を くずさないため。
 * 文言は台帳（`PERSONALITY_INTRO`）にあり、文言テストの対象になっている。
 */
function QuestionIntro({
  language,
  gender,
  onStart,
  onBack,
}: {
  language: PersonalityLanguage;
  gender: Gender;
  onStart: () => void;
  /** なまえ・がっこうの 画面へ 戻る（願い #153-3）。 */
  onBack: () => void;
}) {
  const intro = PERSONALITY_INTRO[language];
  const render = (text: string) =>
    language === "english" ? (
      text
    ) : (
      <GlossaryText text={text} readings={PERSONALITY_RESULT_READINGS} renderText={renderRuby} />
    );
  const renderLines = (lines: readonly string[]) =>
    lines.map((line) => (
      <li key={line} className="text-ink flex gap-2 leading-loose font-bold">
        <span className="text-sky shrink-0">●</span>
        <span className="flex-1">{render(line)}</span>
      </li>
    ));

  return (
    <div className="animate-pop-in mx-auto mt-6 max-w-3xl">
      <div className={`card-pop p-5 sm:p-7 ${CARD_EDGE}`}>
        <h2 className="text-navy text-xl font-black sm:text-2xl">{render(intro.title)}</h2>
        <ul className="mt-4 space-y-3">
          {renderLines(intro.lines.slice(0, INTRO_EXAMPLES_AFTER))}
        </ul>
        {/* 得意の 例。絵が 4人 並ぶと、読む 前に「ちがう 人が いる」が 伝わる。 */}
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {intro.examples.map((example) => {
            const family = getFamilyForCode(example.code);
            return (
              <li
                key={example.code}
                className={`card-pop flex items-center gap-3 border-3 p-3 ${CARD_EDGE_SM}`}
                style={{ borderColor: family.color }}
              >
                <NexMaxType code={example.code} gender={gender} size={56} className="shrink-0" />
                <span className="text-ink flex-1 text-sm leading-loose font-bold">
                  {render(example.text)}
                </span>
              </li>
            );
          })}
        </ul>
        <ul className="mt-4 space-y-3">{renderLines(intro.lines.slice(INTRO_EXAMPLES_AFTER))}</ul>
        <p className="bg-sun/25 text-ink mt-5 rounded-2xl px-4 py-3 font-bold">
          {render(intro.note)}
        </p>
        {/* 本文の下線は1文に1語だけなので、「性格診断」のような複合語の後半（診断）が
            引けない。設問と同じ「ことばメモ」を置いて、導入の語も1か所で引けるようにする。 */}
        {language !== "english" && (
          <div className="border-hairline mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
            <span className="text-ink-soft text-xs font-black">ことばメモ</span>
            {findAllGlossaryTerms(
              intro.title,
              ...intro.lines,
              ...intro.examples.map((example) => example.text),
              intro.note,
            ).map((entry) => (
              <GlossaryChip key={entry.term} entry={entry} renderText={renderRuby} />
            ))}
          </div>
        )}
        <div className="mt-6 flex flex-col items-center gap-3">
          {/* ボタンの文言も 台帳の文。**色の面なので ふりがなは 白**（docs/constraints.md）。 */}
          <button
            type="button"
            onClick={onStart}
            className={`btn-game px-10 py-4 text-lg ${RUBY_ON_COLOR}`}
          >
            <RubyText text={intro.startLabel} readings={PERSONALITY_RESULT_READINGS} />
          </button>
          {/* 戻る道（願い #153-3）。**進む ボタンより 弱い 見た目**にして、
              始める 前に「もう 一度 なまえを 直したい」だけを 拾う。 */}
          <button
            type="button"
            onClick={onBack}
            className="text-ink-soft text-sm font-extrabold underline underline-offset-4"
          >
            ← なまえの がめんに もどる
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

/**
 * よみかたの きりかえに 出す ふだ。
 *
 * **English は 画面に 出さない**（2026-08-19 の指定）。ただし 切り替えの型
 * （`PersonalityLanguage`）・台帳の 英文・保存ずみの `answer_language: "english"` は
 * 消さない——過去の 回答が 読めなくなるのを 避けるため、また 出すことに なったら
 * ここへ 1行 戻すだけで 済むようにするため。
 */
const LANGUAGE_CHOICES = [
  { id: "easy", label: "やさしい日本語", reading: "やさしい にほんご" },
  { id: "japanese", label: "日本語", reading: "にほんご" },
] as const satisfies readonly {
  id: PersonalityLanguage;
  label: string;
  reading: string;
}[];

function CompatibilityCard({ code, reason }: { code: PersonalityTypeCode; reason: string }) {
  const type = getPersonalityType(code);
  const family = getFamilyForCode(code);
  return (
    <article
      className="card-pop flex items-center gap-2 border-3 p-2 text-left shadow-[0_5px_0_rgba(0,79,141,.14),0_12px_18px_-12px_rgba(0,79,141,.4)]"
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
  loggedIn,
  email,
  saved = null,
  retake = false,
  namesOnly = false,
  googleNames,
}: {
  /** ログインずみか。ここへ来られる時点で ふつうは true（未ログインは最初の画面へ返る）。 */
  loggedIn: boolean;
  email: string | null;
  /**
   * 保存済みの名前と性別。やり直しのときに入れ直させないため。
   * `gender` が null なのは「ログインして行はできたが、まだ診断していない人」（2026-08-24）。
   */
  saved?: { names: LearnerNames; school: LearnerSchool; gender: Gender | null } | null;
  /** 診断のやり直しとして開かれたか。文言の出し分けにだけ使う。 */
  retake?: boolean;
  /**
   * なまえだけを入れ直してもらう場面か（診断は終わっている）。
   * なまえを「苗字・名前」に分ける前に作られた行のための道。20問はやり直させない。
   */
  namesOnly?: boolean;
  /** Google に登録された名前。カタカナの欄だけ初期値に入る（page.tsx で判定ずみ）。 */
  googleNames: { familyName: string; givenName: string; fullName: string };
}) {
  const router = useRouter();
  const savedGeminiKey = useSyncExternalStore(subscribeToStorage, savedGeminiKeySnapshot, () => "");
  /*
   * 端末に残っている書きかけの20問。**1度だけ読む**（`quiz-runner.tsx` と同じ
   * useState 初期化の流儀）。なまえだけ入れ直す場面では読まない——診断はもう
   * 終わっていて、下書きは関係ないため。
   */
  const [draft] = useState<DiagnosisDraft | null>(() => (namesOnly ? null : getDiagnosisDraft()));
  // 入れてもらう欄の初期値。**DBにある値が正**で、無いときだけ下書き、
  // それも無ければ Google の名前（カタカナのときだけ page.tsx が入れている）。
  const initialNames: LearnerNames = {
    familyName: saved?.names.familyName || draft?.names.familyName || googleNames.familyName,
    givenName: saved?.names.givenName || draft?.names.givenName || googleNames.givenName,
    nickname: saved?.names.nickname || draft?.names.nickname || "",
  };
  const initialSchool: LearnerSchool = {
    university: saved?.school.university || draft?.school.university || "",
    cohort: saved?.school.cohort || draft?.school.cohort || 0,
  };
  const initialGender: Gender | null = saved?.gender ?? draft?.gender ?? null;
  // 書きかけがあれば しつもんの続きから。1問目に戻すと20問を打ち直させることになる。
  const [step, setStep] = useState<1 | 2 | 3>(() =>
    canResumeQuestions({ names: initialNames, school: initialSchool, gender: initialGender }, draft)
      ? 2
      : 1,
  );
  const [names, setNames] = useState<LearnerNames>(initialNames);
  const namesReady = areNamesValid(names);
  // 学校と期生。先生がクラスを見分けるために使う（願い #27）。
  const [school, setSchool] = useState<LearnerSchool>(initialSchool);
  const schoolReady = isSchoolChosen(school);
  const [genderChoice, setGenderChoice] = useState<Gender | null>(initialGender);
  const gender = genderChoice;
  const [geminiValue, setGeminiValue] = useState<string | null>(null);
  const geminiKey = geminiValue ?? savedGeminiKey;
  const [busy, setBusy] = useState(false);
  const [language, setLanguage] = useState<PersonalityLanguage>(draft?.language ?? "easy");
  // 診断の途中で言語を切り替えたか（08 §5.2）。回答言語と一緒に保存する。
  const languageSwitchedRef = useRef(draft?.languageSwitched ?? false);
  const [answers, setAnswers] = useState<(PersonalityAnswer | null)[]>(
    () => draft?.answers ?? Array.from({ length: PERSONALITY_QUESTIONS.length }, () => null),
  );
  const [questionIndex, setQuestionIndex] = useState(draft?.questionIndex ?? 0);
  // 20問の前に出す導入（07 §3.0）。「性格」という語自体を知らない前提なので、
  // いきなり Q1 を出さずに、何をする時間なのかを先に渡す。
  const [introRead, setIntroRead] = useState(draft?.introRead ?? false);
  const [questionDirection, setQuestionDirection] = useState(1);
  const [saveError, setSaveError] = useState(false);
  const [showWelcomeBg, setShowWelcomeBg] = useState(true);
  const geminiInput = useRef<HTMLInputElement>(null);
  /**
   * すでに保存できた答えの印。同じ20問で二重に台帳へ積まないため
   * （結果 → しつもんへ戻る → もう一度 結果、を往復されても記録は1本）。
   */
  const savedSignature = useRef<string | null>(null);

  /**
   * 答えるたびに下書きを書く。**保存が済むまでの控え**なので、保存できたら消す。
   * 1問も答えていないうちは書かない（`saveDiagnosisDraft` 側で弾く）。
   */
  useEffect(() => {
    if (namesOnly) return;
    saveDiagnosisDraft({
      answers,
      questionIndex,
      introRead,
      language,
      languageSwitched: languageSwitchedRef.current,
      names,
      school,
      gender: genderChoice,
      savedAt: new Date().toISOString(),
    });
  }, [answers, questionIndex, introRead, language, names, school, genderChoice, namesOnly]);

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
    !namesReady ? "なまえ" : null,
    !schoolReady ? "がっこう" : null,
    !namesOnly && !gender ? "せいべつ" : null,
  ].filter((item): item is string => item !== null);

  function goToQuestions() {
    if (!loggedIn || !namesReady || !schoolReady || !gender) return;
    saveGeminiKey(geminiInput.current?.value ?? geminiKey);
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /**
   * なまえだけ保存してマップへ戻る（`namesOnly` の場面）。
   * 診断の結果には触らない——20問はもう終わっているので、消してはいけない。
   */
  async function saveNames() {
    if (!namesReady || !schoolReady) return;
    setBusy(true);
    setSaveError(false);
    saveGeminiKey(geminiInput.current?.value ?? geminiKey);
    try {
      const stored = await updateOwnDetails(names, school);
      // 表示用キャッシュも新しい呼び名にしておく。放っておくと、マップが返事を待つあいだ
      // 古い名前が出る。ここは診断が終わっている場面だが、DBの列は未診断のために
      // null を許すようになったので、型と性別が入っていることを確かめてから書く。
      if (isDiagnosedRow(stored)) {
        saveProfile({
          displayName: stored.display_name,
          gender: stored.gender,
          type: stored.personality_type,
          scores: stored.scores,
          createdAt: stored.created_at,
        });
      }
      router.push("/map");
    } catch {
      setSaveError(true);
      setBusy(false);
    }
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

  /**
   * 20問ぶんの答えを保存する（2026-08-24 の指定）。
   *
   * **結果を見せる前にここを通す。** 8/21 の授業では、結果画面まで進んだのに
   * 最後のボタンを押さずに閉じた人の20問が丸ごと消えていた（本番のログでは、
   * その時間帯の保存リクエストは全部成功していて、失敗は1件も無かった＝
   * 送られてすらいなかった）。答えがそろった時点で送るのが、いちばん確実な直し。
   *
   * @returns 保存できたか。
   */
  async function saveDiagnosis(): Promise<boolean> {
    if (!gender || !completedAnswers) return false;
    const signature = completedAnswers.join("");
    // 同じ答えで二度書かない（結果 ⇄ しつもん を往復されても台帳は1本）。
    if (savedSignature.current === signature) return true;

    setBusy(true);
    setSaveError(false);
    const scores = calculatePersonalityScores(completedAnswers);
    try {
      const stored = await upsertOwnProfile({
        names,
        school,
        gender,
        personalityType: resultCode,
        answers: completedAnswers,
        scores,
        answerLanguage: language,
        languageSwitched: languageSwitchedRef.current,
      });
      try {
        // 「同じ20問が直前に入っていれば積まない」の関門つき。ログインした時点の登録
        // （src/lib/register-on-login.ts）が同じ答えを先に送っていることがあるため。
        await insertPersonalityResultOnce({
          personalityType: resultCode,
          answers: completedAnswers,
          scores,
          answerLanguage: language,
          languageSwitched: languageSwitchedRef.current,
        });
      } catch {
        // 最新プロフィールが保存できていれば学習を止めず、記録台帳の失敗だけを許容する。
      }
      savedSignature.current = signature;
      // 保存できたので控えは要らない。残すと、次に開いたとき「続きがある」と誤解させる。
      clearDiagnosisDraft();
      // 表示用キャッシュは**いま送った値**で作る。DBの列は未診断のために null を
      // 許すようになったので、返ってきた行の型に頼らない。
      saveProfile({
        displayName: stored.display_name,
        gender,
        type: resultCode,
        scores,
        createdAt: stored.created_at,
      });
      setBusy(false);
      return true;
    } catch {
      setSaveError(true);
      setBusy(false);
      return false;
    }
  }

  /**
   * 20問目まで答えたら、**保存してから**結果を見せる。
   * 保存に失敗しても結果は見せる（せっかく答えたのに何も見えないほうが つらい）。
   * 答えは端末の下書きに残っているので、あとからでも送り直せる。
   */
  async function saveAndShowResult() {
    if (!completedAnswers) return;
    await saveDiagnosis();
    setStep(3);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /**
   * 前の 段へ 戻る（願い #153-3）。**答えは 消さない**——state に 持ったままなので、
   * 戻って 進み直しても 20問を 打ち直す ことには ならない。
   * 段は 3つとも 一本道なので、戻り先も 1つに 決まる:
   *   結果 → しつもん（最後の1問）／1問目 → 導入／導入 → なまえの 画面
   */
  function goBackAStep() {
    if (step === 3) {
      setStep(2);
    } else if (!introRead) {
      setStep(1);
    } else if (questionIndex === 0) {
      setIntroRead(false);
    } else {
      previousQuestion();
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** 結果画面の ⭐はじめる⭐。保存が済んでいることを確かめてからマップへ送る。 */
  async function finish() {
    // ふつうは結果を見せる前に保存ずみなので、ここは即座に true が返る。
    // 保存に失敗していた場合だけ、もう一度だけ送り直す。
    if (!(await saveDiagnosis())) return;
    router.push("/map");
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
          <AcademyLogo className="h-auto w-28 drop-shadow-[0_3px_1px_rgba(0,60,107,.2)] sm:w-36" />
        </header>

        {!namesOnly && (
          <div className="relative z-10">
            <Stepper step={step} />
          </div>
        )}

        {step === 1 && (
          <div className="animate-pop-in relative z-10">
            <h1 className="text-navy mt-7 text-center text-2xl font-black sm:text-3xl">
              {namesOnly
                ? "⭐ なまえと がっこうを おしえてね ⭐"
                : retake
                  ? "⭐ せいかくしんだんを もういちど ⭐"
                  : "⭐ はじめての チュートリアル ⭐"}
            </h1>
            {namesOnly && (
              <p className="text-ink-soft mt-3 text-center font-bold">
                なまえの かきかたが かわりました。カタカナで もういちど おしえてください。
                がっこうも えらんでね。
                <br />
                しんだんは おわって いるので、しつもんは ありません。
              </p>
            )}
            <div
              className={`mt-5 rounded-3xl border-2 border-white bg-[#e9f7ff]/90 p-4 shadow-[inset_0_0_24px_rgba(2,136,209,.1)] sm:p-6 ${
                namesOnly ? "hidden" : ""
              }`}
            >
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
                    className={`card-pop relative overflow-hidden p-4 pt-3 text-center ${CARD_EDGE_SM}`}
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

            {/* ログインはもう最初の画面で済んでいる（願い #13）。ここにログインの入口は置かない。
                いまどのアカウントで入っているかだけを、小さく見せる。 */}
            <p className="border-hairline bg-panel-tint text-ink-soft mt-5 rounded-2xl border-2 px-4 py-2 text-center text-xs font-bold">
              {loggedIn ? (
                <>✅ ログインずみ{email && <span className="ml-1 break-all">（{email}）</span>}</>
              ) : (
                <>🔧 ログインは いま じゅんびちゅう です。</>
              )}
            </p>

            <div
              className={`mt-4 grid gap-4 ${
                namesOnly ? "mx-auto max-w-2xl" : "md:grid-cols-2 xl:grid-cols-3"
              }`}
            >
              <NameCard
                names={names}
                onChange={setNames}
                googleFullName={
                  googleNames.fullName && !googleNames.givenName ? googleNames.fullName : ""
                }
                className={namesOnly ? "" : "md:col-span-2"}
              />

              {/* 学校と期生（願い #27）。先生がクラスを見分けるのに使う。
                  なまえと同じく、この列を足す前に作られた行にも入れてもらう必要があるので、
                  「なまえだけ」の場面（namesOnly）でも隠さない。 */}
              <SchoolCard school={school} onChange={setSchool} />

              <GeminiKeyCard
                value={geminiKey}
                onChange={setGeminiValue}
                inputRef={geminiInput}
                className={namesOnly ? "hidden" : ""}
              />

              <GenderCard
                gender={gender}
                onChange={setGenderChoice}
                className={namesOnly ? "hidden" : ""}
              />
            </div>

            <p className="text-ink-soft mt-5 text-center text-xs font-bold">
              🛡️ あんぜんに ほごされます
            </p>
            <div className="mt-4 text-center">
              <button
                type="button"
                disabled={
                  busy || !loggedIn || !namesReady || !schoolReady || (!namesOnly && !gender)
                }
                onClick={namesOnly ? () => void saveNames() : goToQuestions}
                className="btn-game text-ink min-w-64 px-10 py-4 text-xl disabled:cursor-not-allowed disabled:opacity-45"
                style={
                  {
                    "--btn-face": "#ffc93c",
                    "--btn-shadow": "#f0a819",
                  } as React.CSSProperties
                }
              >
                {namesOnly ? "⭐ ほぞんして すすむ ⭐" : "⭐ つぎへ ⭐"}
              </button>
              {missingSetupItems.length > 0 && (
                <p className="text-coral-deep mt-3 text-sm font-extrabold">
                  {missingSetupItems.join("と ")}を おねがいね
                </p>
              )}
              {namesOnly && saveError && (
                <p className="text-coral-deep mt-4 font-extrabold">
                  ほぞんに しっぱいしました。インターネットを かくにんして、もういちど おしてね。
                </p>
              )}
              {/*
                やり直しの ときだけ 出す 逃げ道。

                「せいかくしんだんを もういちど」は タイトル画面と せっていの 両方に
                あるが、押した あと **やめる 道が どこにも 無かった**——気が 変わった
                学習者は、20問を 通すか ブラウザの 戻るを 知って いるかしか なかった。

                はじめての とき（`retake` なし）と なまえの 入れ直し（`namesOnly`）には
                出さない。そこは まだ 中に 入れて いない／足りない ものが ある 場面で、
                通り抜けて もらわないと 先へ 行けない（設定は 願い #13・#14）。
              */}
              {retake && !namesOnly && (
                <Link
                  prefetch={false}
                  href="/map"
                  className="text-ink-soft hover:text-navy mt-5 inline-block text-sm font-extrabold underline underline-offset-4"
                >
                  やめて まなびマップへ もどる
                </Link>
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
              {/* 2つに なったので、幅の そろった 2択の スイッチに する（文字数の ちがう
                  札を 並べると 片側だけ 太って、どちらが 選ばれているかが 読みにくい）。
                  押す面は 44px 角を 確保して、指でも 外さないようにする。 */}
              <div className="bg-panel-tint grid grid-cols-2 gap-1 rounded-full p-1 shadow-[0_3px_0_rgba(0,79,141,.10)]">
                {LANGUAGE_CHOICES.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={language === option.id}
                    onClick={() => {
                      if (option.id !== language) languageSwitchedRef.current = true;
                      setLanguage(option.id);
                    }}
                    className={`grid min-h-11 place-items-center rounded-full px-4 text-sm font-extrabold sm:px-6 ${
                      language === option.id
                        ? `bg-navy text-white shadow-[0_3px_0_var(--color-navy-deep)] ${RUBY_ON_COLOR}`
                        : "text-ink-soft"
                    }`}
                  >
                    <ruby>
                      {option.label}
                      <rt>{option.reading}</rt>
                    </ruby>
                  </button>
                ))}
              </div>
            </div>

            {!introRead ? (
              <QuestionIntro
                language={language}
                gender={gender ?? "male"}
                onStart={() => {
                  setIntroRead(true);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                onBack={goBackAStep}
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
                      className={`card-pop p-4 sm:p-6 ${CARD_EDGE}`}
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
                        {language === "english" ? (
                          ASK_LABEL[language]
                        ) : (
                          <RubyText
                            text={ASK_LABEL[language]}
                            readings={PERSONALITY_RESULT_READINGS}
                          />
                        )}
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
                                ? "border-sky bg-sky-soft text-navy shadow-[0_5px_0_#7cc6ea]"
                                : "text-ink border-[#a9d9f0] bg-white shadow-[0_5px_0_#d7eaf5]"
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
                  <div
                    className={`flex flex-wrap items-center justify-center gap-3 rounded-full bg-white/95 px-5 py-2 ${CHIP_EDGE}`}
                  >
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
                    {/* 1問目でも 消さない（願い #153-3）。ここが 消えていたので、
                        20問に 入ったら なまえ・がっこうの 画面へ 戻る道が 無かった。 */}
                    <button
                      type="button"
                      onClick={goBackAStep}
                      className="text-navy rounded-full bg-white px-5 py-2 font-extrabold shadow-md"
                    >
                      {questionIndex === 0 ? "← まえに もどる" : "← もどる"}
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
                          disabled={!completedAnswers || busy}
                          onClick={() => void saveAndShowResult()}
                          className={`btn-game px-8 py-3 text-lg [--btn-face:#ffc93c] [--btn-shadow:#f0a819] disabled:cursor-not-allowed disabled:opacity-45 ${RUBY_ON_COLOR}`}
                        >
                          {/* ここで**保存してから**結果を出す。押したあと少し待つので、
                              待っていることを 文字でも 見せる。 */}
                          {busy ? (
                            <>
                              <ruby>
                                保存<rt>ほぞん</rt>
                              </ruby>
                              して います…
                            </>
                          ) : (
                            <>
                              <ruby>
                                結果<rt>けっか</rt>
                              </ruby>
                              を{" "}
                              <ruby>
                                見る<rt>みる</rt>
                              </ruby>
                            </>
                          )}
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
                  <p
                    className={`bg-navy mt-1 rounded-xl px-2 py-1 text-[10px] font-extrabold text-white ${RUBY_ON_COLOR} [&_ruby]:leading-[2.4]`}
                  >
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
                  className={`mt-3 rounded-full px-4 text-sm font-black text-white ${RUBY_ON_COLOR} ${RUBY_CHIP}`}
                  style={{ backgroundColor: resultFamily.color }}
                >
                  <RubyText
                    text={resultFamily.name}
                    readings={[{ text: resultFamily.name, reading: resultFamily.reading }]}
                  />
                </p>
                {/* 4文字コードは出さない。ネクマックス診断として完結させる（07 §1.3）。 */}
                <h2
                  className={`bg-navy mt-2 flex items-center gap-3 rounded-2xl px-5 py-3 text-xl font-black text-white shadow-[0_5px_0_#003c6b] sm:text-2xl ${RUBY_ON_COLOR}`}
                >
                  <span aria-hidden className="shrink-0 text-2xl">
                    {result.emblem}
                  </span>
                  <span className="flex-1 text-center">{result.name}</span>
                </h2>
                <p className="text-ink-soft mt-2 text-sm font-extrabold">
                  <LearnerText text={result.tagline} />
                </p>
                <h3 className="text-navy mt-5 text-lg font-black">
                  あなたは こんな <LearnerText text="人" />
                </h3>
                <ul className="mt-3 space-y-2">
                  {result.analysis.map((line) => (
                    <li key={line} className="text-ink flex gap-2 leading-loose font-bold">
                      <span className="text-leaf-deep shrink-0">✓</span>
                      {/* 図鑑（nexmax-catalog）と 同じ 4行。本文を 箱に 入れずに flex の
                          直下へ 置くと、ルビや 語彙メモが 1つずつ 横に 並んで 段に 割れる。 */}
                      <span className="min-w-0 flex-1">
                        <LearnerText text={line} />
                      </span>
                    </li>
                  ))}
                </ul>

                {/* 3-2 の僅差だけ「どちらも いい ところ」と出す。決めつけない（07 §4.3）。 */}
                {closeAxis && (
                  <p className="bg-sun/25 text-ink mt-4 rounded-2xl px-4 py-3 text-sm font-bold">
                    「<LearnerText text={PERSONALITY_AXIS_META[closeAxis].poleLabels[0]} />
                    」と「
                    <LearnerText text={PERSONALITY_AXIS_META[closeAxis].poleLabels[1]} />
                    」は、どちらも あなたの いい ところです。ときに よって、りょうほう つかって
                    いますね。
                  </p>
                )}

                <h3 className="text-navy mt-6 font-black">
                  <RubyText
                    text="チームで あなたが 得意な 仕事"
                    readings={PERSONALITY_RESULT_READINGS}
                  />
                </h3>
                <p className="text-ink mt-2 font-bold">
                  <span
                    className={`bg-navy mr-2 rounded-lg px-2.5 text-sm text-white ${RUBY_ON_COLOR} ${RUBY_CHIP}`}
                  >
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
                  <LearnerText text="見て いる ところが ちがうので、二人が いると チームが もっと よく なります。" />
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
            <details className={`card-pop mt-6 p-4 ${CARD_EDGE}`}>
              <summary className="text-navy cursor-pointer font-black">
                ほかの 15タイプも <LearnerText text="見て みよう" />
              </summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {PERSONALITY_FAMILIES.map((family) => (
                  <section key={family.id}>
                    <h4
                      className={`inline-block rounded-full px-3 py-1 text-xs font-black text-white ${RUBY_ON_COLOR}`}
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
                <RubyText
                  text="この 結果は あなたの 答えから 作られました。"
                  readings={PERSONALITY_RESULT_READINGS}
                />
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
                  ほぞんが まだです。インターネットを かくにんして、
                  <br />
                  うえの ボタンを もういちど おしてね。
                  <br />
                  <span className="text-ink-soft text-sm">
                    あなたの こたえは のこして あります。
                  </span>
                </p>
              )}
              {/* しつもんへ 戻って 答え直せる（願い #153-3）。答えを 変えて もう一度
                  「結果を 見る」を 押すと、その 新しい 答えで 保存し直す。 */}
              <div className="mt-4">
                <button
                  type="button"
                  onClick={goBackAStep}
                  className="text-ink-soft text-sm font-extrabold underline underline-offset-4"
                >
                  ← しつもんに もどる
                </button>
              </div>
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
              className={`text-navy relative mb-5 max-w-xs rounded-3xl bg-white px-4 py-3 text-sm font-extrabold ${CHIP_EDGE} ${
                step === 2 ? "rounded-br-md" : "rounded-bl-md"
              }`}
            >
              {step === 1 &&
                (namesOnly
                  ? "なまえと がっこうを おしえてね！"
                  : retake
                    ? "せっていを かくにんしましょう！"
                    : "はじめに せっていを しましょう！")}
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
