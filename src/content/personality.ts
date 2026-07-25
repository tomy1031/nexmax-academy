export type PersonalityTypeId = "leader" | "idea" | "heart" | "challenge";
export type PersonalityLanguage = "easy" | "japanese" | "english";
export type PersonalityAnswer = "yes" | "neutral" | "no";
export type PersonalityScores = Record<PersonalityTypeId, number>;

export interface Reading {
  text: string;
  reading: string;
}

export interface PersonalityType {
  id: PersonalityTypeId;
  name: string;
  heading: string;
  color: string;
  badge: string;
  strengths: readonly string[];
  resultStrengths: string;
  analysis: readonly string[];
}

export interface PersonalityQuestion {
  id: number;
  axis: PersonalityTypeId;
  easy: string;
  japanese: string;
  english: string;
  readings: readonly Reading[];
  image: string;
}

export const PERSONALITY_TYPES: readonly PersonalityType[] = [
  {
    id: "leader",
    name: "リーダーの ネクマックス",
    heading: "リーダータイプ",
    color: "#4fa8e8",
    badge: "🛡️",
    strengths: ["計画", "まとめる", "信頼"],
    resultStrengths: "リーダーシップ／計画力・信頼",
    analysis: [
      "まじめで、コツコツ がんばれます。",
      "チームを まとめるのが とくいです。",
      "けいかくを たてて すすめる タイプです。",
      "日本の IT の しごとでは、ほうこく・れんらく・そうだんを ひっぱる 人に なれます。",
    ],
  },
  {
    id: "idea",
    name: "ひらめきの ネクマックス",
    heading: "ひらめきタイプ",
    color: "#58c273",
    badge: "💡",
    strengths: ["アイデア", "なぜ？", "つくる"],
    resultStrengths: "アイデア／なぜ？・つくる",
    analysis: [
      "あたらしい アイデアが つぎつぎ 出てきます。",
      "「なぜ？」と かんがえる 力が あります。",
      "ものを つくるのが 大すきな タイプです。",
      "日本の IT の しごとでは、かいはつや くふうで かつやくできます。",
    ],
  },
  {
    id: "heart",
    name: "きづかいの ネクマックス",
    heading: "きづかいタイプ",
    color: "#f26fa7",
    badge: "💗",
    strengths: ["気もちに気づく", "きく"],
    resultStrengths: "気もちに気づく／きく",
    analysis: [
      "人の きもちに 気づくのが とくいです。",
      "はなしを きく 力が あります。",
      "チームを あたたかく する タイプです。",
      "日本の IT の しごとでは、お客さまや なかまとの コミュニケーションで かつやくできます。",
    ],
  },
  {
    id: "challenge",
    name: "チャレンジの ネクマックス",
    heading: "チャレンジタイプ",
    color: "#ffc93c",
    badge: "🚀",
    strengths: ["やってみる", "あきらめない"],
    resultStrengths: "やってみる／あきらめない",
    analysis: [
      "あたらしい ことに どんどん ちょうせんできます。",
      "うまく いかなくても、あきらめません。",
      "うごきながら まなぶ タイプです。",
      "日本の IT の しごとでは、あたらしい ぎじゅつを はやく おぼえて かつやくできます。",
    ],
  },
] as const;

export const PERSONALITY_QUESTIONS: readonly PersonalityQuestion[] = [
  {
    id: 1,
    axis: "leader",
    easy: "はじめる まえに、けいかくを たてますか。",
    japanese: "始める前に、計画を立てますか。",
    english: "Do you make a plan before you start?",
    readings: [
      { text: "始める", reading: "はじめる" },
      { text: "前", reading: "まえ" },
      { text: "計画", reading: "けいかく" },
      { text: "立てます", reading: "たてます" },
    ],
    image: "/img/quiz/q01.png",
  },
  {
    id: 2,
    axis: "idea",
    easy: "あたらしい アイデアを かんがえるのが すきですか。",
    japanese: "新しいアイデアを考えるのが好きですか。",
    english: "Do you like thinking of new ideas?",
    readings: [
      { text: "新しい", reading: "あたらしい" },
      { text: "考える", reading: "かんがえる" },
      { text: "好き", reading: "すき" },
    ],
    image: "/img/quiz/q02.png",
  },
  {
    id: 3,
    axis: "heart",
    easy: "こまっている 人を みると、こえを かけますか。",
    japanese: "困っている人を見ると、声をかけますか。",
    english: "Do you talk to people who look troubled?",
    readings: [
      { text: "困って", reading: "こまって" },
      { text: "人", reading: "ひと" },
      { text: "見る", reading: "みる" },
      { text: "声", reading: "こえ" },
    ],
    image: "/img/quiz/q03.png",
  },
  {
    id: 4,
    axis: "challenge",
    easy: "あたらしい ことに すぐ ちょうせんしますか。",
    japanese: "新しいことにすぐ挑戦しますか。",
    english: "Do you try new things right away?",
    readings: [
      { text: "新しい", reading: "あたらしい" },
      { text: "挑戦", reading: "ちょうせん" },
    ],
    image: "/img/quiz/q04.png",
  },
  {
    id: 5,
    axis: "leader",
    easy: "チームを まとめるのが すきですか。",
    japanese: "チームをまとめるのが好きですか。",
    english: "Do you like organizing your team?",
    readings: [{ text: "好き", reading: "すき" }],
    image: "/img/quiz/q05.png",
  },
  {
    id: 6,
    axis: "idea",
    easy: "「なぜ？」「どうして？」と よく かんがえますか。",
    japanese: "「なぜ？」「どうして？」とよく考えますか。",
    english: 'Do you often ask "why?" and "how?"',
    readings: [{ text: "考えます", reading: "かんがえます" }],
    image: "/img/quiz/q06.png",
  },
  {
    id: 7,
    axis: "heart",
    easy: "人の はなしを きくのが すきですか。",
    japanese: "人の話を聞くのが好きですか。",
    english: "Do you like listening to people?",
    readings: [
      { text: "人", reading: "ひと" },
      { text: "話", reading: "はなし" },
      { text: "聞く", reading: "きく" },
      { text: "好き", reading: "すき" },
    ],
    image: "/img/quiz/q07.png",
  },
  {
    id: 8,
    axis: "challenge",
    easy: "うまく いかなくても、もういちど やりますか。",
    japanese: "うまくいかなくても、もう一度やりますか。",
    english: "When something does not work, do you try again?",
    readings: [{ text: "一度", reading: "いちど" }],
    image: "/img/quiz/q08.png",
  },
  {
    id: 9,
    axis: "leader",
    easy: "やくそくや 時間を きちんと まもりますか。",
    japanese: "約束や時間をきちんと守りますか。",
    english: "Do you keep promises and stay on time?",
    readings: [
      { text: "約束", reading: "やくそく" },
      { text: "時間", reading: "じかん" },
      { text: "守ります", reading: "まもります" },
    ],
    image: "/img/quiz/q09.png",
  },
  {
    id: 10,
    axis: "idea",
    easy: "じぶんで なにかを つくるのが すきですか。",
    japanese: "自分で何かを作るのが好きですか。",
    english: "Do you like making things yourself?",
    readings: [
      { text: "自分", reading: "じぶん" },
      { text: "何", reading: "なに" },
      { text: "作る", reading: "つくる" },
      { text: "好き", reading: "すき" },
    ],
    image: "/img/quiz/q10.png",
  },
  {
    id: 11,
    axis: "heart",
    easy: "人の きもちに すぐ 気づく ほうですか。",
    japanese: "人の気持ちにすぐ気づくほうですか。",
    english: "Do you notice how others feel?",
    readings: [
      { text: "人", reading: "ひと" },
      { text: "気持ち", reading: "きもち" },
      { text: "気づく", reading: "きづく" },
    ],
    image: "/img/quiz/q11.png",
  },
  {
    id: 12,
    axis: "challenge",
    easy: "まず やってみてから かんがえますか。",
    japanese: "まずやってみてから考えますか。",
    english: "Do you try first and think later?",
    readings: [{ text: "考えます", reading: "かんがえます" }],
    image: "/img/quiz/q12.png",
  },
  {
    id: 13,
    axis: "leader",
    easy: "みんなの いけんを まとめて、ひとつに きめられますか。",
    japanese: "みんなの意見をまとめて、一つに決められますか。",
    english: "Can you bring everyone's ideas together and decide?",
    readings: [
      { text: "意見", reading: "いけん" },
      { text: "一つ", reading: "ひとつ" },
      { text: "決められます", reading: "きめられます" },
    ],
    image: "/img/quiz/q13.png",
  },
  {
    id: 14,
    axis: "idea",
    easy: "ふつうと ちがう やりかたを ためすのが すきですか。",
    japanese: "ふつうと違うやり方を試すのが好きですか。",
    english: "Do you like trying a different way from others?",
    readings: [
      { text: "違う", reading: "ちがう" },
      { text: "方", reading: "かた" },
      { text: "試す", reading: "ためす" },
      { text: "好き", reading: "すき" },
    ],
    image: "/img/quiz/q14.png",
  },
  {
    id: 15,
    axis: "heart",
    easy: "チームの ふんいきを よくするのが とくいですか。",
    japanese: "チームのふんいきをよくするのが得意ですか。",
    english: "Are you good at making your team's mood better?",
    readings: [{ text: "得意", reading: "とくい" }],
    image: "/img/quiz/q15.png",
  },
  {
    id: 16,
    axis: "challenge",
    easy: "むずかしい もんだいが 出ると、わくわくしますか。",
    japanese: "難しい問題が出ると、わくわくしますか。",
    english: "Do hard problems make you excited?",
    readings: [
      { text: "難しい", reading: "むずかしい" },
      { text: "問題", reading: "もんだい" },
      { text: "出る", reading: "でる" },
    ],
    image: "/img/quiz/q16.png",
  },
  {
    id: 17,
    axis: "leader",
    easy: "さいごまで せきにんを もって やりますか。",
    japanese: "最後まで責任を持ってやりますか。",
    english: "Do you finish what you are responsible for?",
    readings: [
      { text: "最後", reading: "さいご" },
      { text: "責任", reading: "せきにん" },
      { text: "持って", reading: "もって" },
    ],
    image: "/img/quiz/q17.png",
  },
  {
    id: 18,
    axis: "idea",
    easy: "え や 図で せつめいするのが すきですか。",
    japanese: "絵や図で説明するのが好きですか。",
    english: "Do you like explaining with pictures and charts?",
    readings: [
      { text: "絵", reading: "え" },
      { text: "図", reading: "ず" },
      { text: "説明", reading: "せつめい" },
      { text: "好き", reading: "すき" },
    ],
    image: "/img/quiz/q18.png",
  },
  {
    id: 19,
    axis: "heart",
    easy: "なかまの いい ところを 見つけて、ほめますか。",
    japanese: "なかまのいいところを見つけて、ほめますか。",
    english: "Do you notice and praise your friends' good points?",
    readings: [{ text: "見つけて", reading: "みつけて" }],
    image: "/img/quiz/q19.png",
  },
  {
    id: 20,
    axis: "challenge",
    easy: "あたらしい 人と はなすのは へいきですか。",
    japanese: "新しい人と話すのはへいきですか。",
    english: "Are you comfortable talking with new people?",
    readings: [
      { text: "新しい", reading: "あたらしい" },
      { text: "人", reading: "ひと" },
      { text: "話す", reading: "はなす" },
    ],
    image: "/img/quiz/q20.png",
  },
] as const;

/** 結果文・強み表示で使う共通の読み辞書。 */
export const PERSONALITY_RESULT_READINGS: readonly Reading[] = [
  { text: "日本", reading: "にほん" },
  { text: "計画力", reading: "けいかくりょく" },
  { text: "計画", reading: "けいかく" },
  { text: "信頼", reading: "しんらい" },
  { text: "気もち", reading: "きもち" },
  { text: "気づく", reading: "きづく" },
  { text: "力", reading: "ちから" },
  { text: "大すき", reading: "だいすき" },
  { text: "お客さま", reading: "おきゃくさま" },
  { text: "人", reading: "ひと" },
] as const;

const ANSWER_POINTS: Record<PersonalityAnswer, number> = {
  yes: 2,
  neutral: 1,
  no: 0,
};

const TIE_BREAK_ORDER: readonly PersonalityTypeId[] = [
  "heart",
  "challenge",
  "idea",
  "leader",
];

function validateAnswers(answers: readonly PersonalityAnswer[]): void {
  if (
    answers.length !== PERSONALITY_QUESTIONS.length ||
    answers.some((answer) => !(answer in ANSWER_POINTS))
  ) {
    throw new Error("20もん すべてに こたえてください。");
  }
}

export function calculatePersonalityScores(
  answers: readonly PersonalityAnswer[],
): PersonalityScores {
  validateAnswers(answers);
  const scores: PersonalityScores = {
    leader: 0,
    idea: 0,
    heart: 0,
    challenge: 0,
  };

  PERSONALITY_QUESTIONS.forEach((question, index) => {
    scores[question.axis] += ANSWER_POINTS[answers[index]!];
  });
  return scores;
}

export function pickPersonalityType(scores: PersonalityScores): PersonalityTypeId {
  return TIE_BREAK_ORDER.reduce((best, candidate) =>
    scores[candidate] > scores[best] ? candidate : best,
  );
}

export function scorePersonality(answers: readonly PersonalityAnswer[]): PersonalityTypeId {
  return pickPersonalityType(calculatePersonalityScores(answers));
}

export function getPersonalityType(id: PersonalityTypeId): PersonalityType {
  const type = PERSONALITY_TYPES.find((item) => item.id === id);
  if (!type) throw new Error(`unknown personality type: ${id}`);
  return type;
}
