export type PersonalityTypeId = "leader" | "idea" | "heart" | "challenge";
export type PersonalityLanguage = "easy" | "japanese" | "english";

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
  },
  {
    id: 3,
    axis: "heart",
    easy: "こまっている 人を みると、こえを かけますか。",
    japanese: "困っている人を見ると、声をかけますか。",
    english: "Do you talk to people who look troubled?",
    readings: [
      { text: "困っている", reading: "こまっている" },
      { text: "人", reading: "ひと" },
      { text: "見る", reading: "みる" },
      { text: "声", reading: "こえ" },
    ],
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
  },
  {
    id: 5,
    axis: "leader",
    easy: "チームを まとめるのが すきですか。",
    japanese: "チームをまとめるのが好きですか。",
    english: "Do you like organizing your team?",
    readings: [{ text: "好き", reading: "すき" }],
  },
  {
    id: 6,
    axis: "idea",
    easy: "「なぜ？」「どうして？」と よく かんがえますか。",
    japanese: "「なぜ？」「どうして？」とよく考えますか。",
    english: 'Do you often ask "why?" and "how?"',
    readings: [{ text: "考えます", reading: "かんがえます" }],
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
  },
  {
    id: 8,
    axis: "challenge",
    easy: "うまく いかなくても、もういちど やりますか。",
    japanese: "うまくいかなくても、もう一度やりますか。",
    english: "When something does not work, do you try again?",
    readings: [{ text: "一度", reading: "いちど" }],
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
  },
  {
    id: 12,
    axis: "challenge",
    easy: "まず やってみてから かんがえますか。",
    japanese: "まずやってみてから考えますか。",
    english: "Do you try first and think later?",
    readings: [{ text: "考えます", reading: "かんがえます" }],
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

const TIE_BREAK_ORDER: readonly PersonalityTypeId[] = [
  "heart",
  "challenge",
  "idea",
  "leader",
];

export function scorePersonality(answers: readonly boolean[]): PersonalityTypeId {
  if (answers.length !== PERSONALITY_QUESTIONS.length) {
    throw new Error("12もん すべてに こたえてください。");
  }

  const scores: Record<PersonalityTypeId, number> = {
    leader: 0,
    idea: 0,
    heart: 0,
    challenge: 0,
  };

  PERSONALITY_QUESTIONS.forEach((question, index) => {
    if (answers[index]) scores[question.axis] += 1;
  });

  return TIE_BREAK_ORDER.reduce((best, candidate) =>
    scores[candidate] > scores[best] ? candidate : best,
  );
}

export function getPersonalityType(id: PersonalityTypeId): PersonalityType {
  const type = PERSONALITY_TYPES.find((item) => item.id === id);
  if (!type) throw new Error(`unknown personality type: ${id}`);
  return type;
}
