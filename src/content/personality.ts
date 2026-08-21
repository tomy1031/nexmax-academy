/**
 * 性格タイプ v3 — MBTI 4軸 / 16タイプ。
 * 仕様: docs/design/07_性格タイプ設計_MBTI16.md
 *
 * 各軸5問（奇数）の2択なので、軸の合計は必ず5点になり同点が構造的に起きない。
 * v2 のタイブレーク（heart > challenge > idea > leader）は不要になったため削除した。
 */

export type PersonalityAxis = "ei" | "sn" | "tf" | "jp";
export type PersonalityPole = "E" | "I" | "S" | "N" | "T" | "F" | "J" | "P";
export type PersonalityAnswer = "a" | "b";
export type PersonalityLanguage = "easy" | "japanese" | "english";

/** 家族ID。既存の立ち絵・色トークンをそのまま流用するため v2 の4値を維持する（07 §1.2）。 */
export type PersonalityFamilyId = "leader" | "idea" | "heart" | "challenge";

export type PersonalityTypeCode =
  | "ISTJ"
  | "ISFJ"
  | "ESTJ"
  | "ESFJ"
  | "INTJ"
  | "INTP"
  | "ENTJ"
  | "ENTP"
  | "INFJ"
  | "INFP"
  | "ENFJ"
  | "ENFP"
  | "ISTP"
  | "ISFP"
  | "ESTP"
  | "ESFP";

/** 軸ごとの「左の極」側の点数（0〜5）。右の極は 5 - 値。 */
export type PersonalityScores = Record<PersonalityAxis, number>;

/**
 * 台帳はすべて readonly。要素のプロパティまで固めるのは、スコアリングと家族判定の決定性を
 * 実行時に書き換えられないようにするため（`PERSONALITY_QUESTIONS[0].a.pole = "I"` を型で防ぐ）。
 */
export interface Reading {
  readonly text: string;
  readonly reading: string;
}

export interface PersonalityAxisMeta {
  readonly id: PersonalityAxis;
  /** [左の極, 右の極]。左＝スコアが数える側。 */
  readonly poles: readonly [PersonalityPole, PersonalityPole];
  /** 学習者に見せる軸の呼び名。 */
  readonly question: string;
  /** 極の呼び名。説明文と同じ語を使い、呼び名が自己解説される形にする（07 §1.1）。 */
  readonly poleLabels: readonly [string, string];
  readonly poleDescriptions: readonly [string, string];
}

export interface PersonalityFamily {
  readonly id: PersonalityFamilyId;
  /** 学習者向けの呼び名。読みは連濁で「ぐみ」。 */
  readonly name: string;
  readonly reading: string;
  readonly keirsey: "SJ" | "NT" | "NF" | "SP";
  readonly color: string;
  /** 家族の性格。 */
  readonly strengths: readonly string[];
  readonly codes: readonly PersonalityTypeCode[];
}

export interface PersonalityType {
  readonly code: PersonalityTypeCode;
  readonly familyId: PersonalityFamilyId;
  readonly name: string;
  /** 表の中やチップなど、狭いところで使う呼び名（「〜の ネクマックス」を外したもの）。 */
  readonly shortName: string;
  readonly emblem: string;
  /** ひとこと。必ず述語で終える（07 §2 文言のきまり）。 */
  readonly tagline: string;
  /** チーム役割の呼び名。 */
  readonly teamRole: string;
  /** 役割の説明1行（結果画面 §5.2）。 */
  readonly teamRoleDetail: string;
  /** 結果画面の ✓4行。 */
  readonly analysis: readonly string[];
}

export interface PersonalityQuestionOption {
  readonly pole: PersonalityPole;
  readonly easy: string;
  readonly japanese: string;
  readonly english: string;
}

export interface PersonalityQuestion {
  readonly id: number;
  readonly axis: PersonalityAxis;
  /** 柱書き。それ自体で完結した文にする（07 §3.1）。 */
  readonly easy: string;
  readonly japanese: string;
  readonly english: string;
  readonly a: PersonalityQuestionOption;
  readonly b: PersonalityQuestionOption;
  readonly readings: readonly Reading[];
  readonly image: string;
}

/**
 * 20問の前に出す導入（07 §3.0）。
 *
 * **抽象語から入らない。** 学習者が「せいかく」や「タイプ」を辞書で引いても
 * character / personality のような抽象語に着地して、何を聞かれているのか分からない。
 * だから **具体（人に よって 得意な ことが ちがう）を先に渡してから語を当てる**。
 *
 * 入口を「性格」ではなく **チーム**に置いてある（2026-08-21 の指定）。
 * 学習者がこれから入るのは「性格を知る場」ではなく「チームで する しごと」で、
 * 診断を受ける理由（自分と なかまの 得意を 知る）がそこにしか無いため。
 *
 * 文言をコンポーネントに直書きせず台帳に置くのは、**文言テストの対象にするため**。
 * 直書きすると禁止語検査・語彙メモの網羅検査から漏れる。
 */
export interface PersonalityIntroExample {
  /** いちばん 近い ネクマックス。絵を 出すためだけに 持つ（呼び名は 出さない）。 */
  readonly code: PersonalityTypeCode;
  /** 得意な ことの 例。述語で 終える（07 §2 文言のきまり）。 */
  readonly text: string;
}

export interface PersonalityIntro {
  readonly title: string;
  /** 本文。1行＝1つのことだけ言う。 */
  readonly lines: readonly string[];
  /**
   * 「得意な ことが ちがう」の 例。
   *
   * ここだけ 本文から 出して 持つのは、**近い ネクマックスの 絵を 添えて 見せる**ため。
   * 「よく 考える」「すぐに 動く」は 語だけだと どれも 同じ かたさに 見えるが、
   * 絵が 4人 並ぶと「ちがう 人が いる」が 読む 前に 伝わる。
   * 絵は 呼び名を 出さない（16の 呼び名は 結果画面で 初めて 会う）。
   */
  readonly examples: readonly PersonalityIntroExample[];
  /** 正誤の枠組みを持ち込まないための一文（07 §10）。 */
  readonly note: string;
  readonly startLabel: string;
}

export const PERSONALITY_INTRO: Readonly<Record<PersonalityLanguage, PersonalityIntro>> = {
  easy: {
    title: "あなたは チームの 中で どんな タイプ?",
    lines: [
      "IT の 仕事は、1人で する 仕事では ありません。",
      "いろいろな 人と いっしょに、チームで します。",
      "人に よって、得意な ことが 違います。",
      "大切なのは、どの タイプが 一番 いいかでは ありません。",
      "自分の 得意な ことと、チームの 人の 得意な ことを 知る ことです。",
      "この 性格診断では、20の 質問に 答えます。",
      "そして、あなたの 仕事の タイプを 見つけます。",
      "最後に、あなたに 近い ネクマックスが 出て きます。",
      "これから チームで 動く ときの 参考に しましょう!",
    ],
    examples: [
      { code: "INTP", text: "よく 考えるのが 得意です" },
      { code: "ESTP", text: "すぐに 動くのが 得意です" },
      { code: "INFJ", text: "人の 話を 聞くのが 得意です" },
      { code: "ENTP", text: "新しい アイデアを 考えるのが 得意です" },
    ],
    note: "どちらが いい・わるいは ありません。あなたに 近い ほうを 選んで ください。",
    startLabel: "質問を 始める",
  },
  japanese: {
    title: "あなたはチームの中でどんなタイプ?",
    lines: [
      "ITの仕事は、1人でする仕事ではありません。",
      "いろいろな人といっしょに、チームでします。",
      "人によって、得意なことがちがいます。",
      "大切なのは、どのタイプが一番いいかではありません。",
      "自分の得意なことと、チームの人の得意なことを知ることです。",
      "この性格診断では、20の質問に答えます。",
      "そして、あなたの仕事のタイプを見つけます。",
      "最後に、あなたに近いネクマックスが出てきます。",
      "これからチームで動くときの参考にしましょう!",
    ],
    examples: [
      { code: "INTP", text: "よく考えるのが得意です" },
      { code: "ESTP", text: "すぐに動くのが得意です" },
      { code: "INFJ", text: "人の話を聞くのが得意です" },
      { code: "ENTP", text: "新しいアイデアを考えるのが得意です" },
    ],
    note: "どちらがいい・わるいはありません。あなたに近いほうを選んでください。",
    startLabel: "質問を始める",
  },
  english: {
    title: "What kind of teammate are you?",
    lines: [
      "IT work is not something you do alone.",
      "You work together with other people, as a team.",
      "Everyone is good at different things.",
      "What matters is not which type is the best.",
      "It is knowing what you are good at, and what your teammates are good at.",
      "In this personality check, you answer 20 questions.",
      "Then you find your own work type.",
      "At the end, one NexMax who is like you will appear.",
      "Use it when you work with your team from now on.",
    ],
    examples: [
      { code: "INTP", text: "Good at thinking carefully" },
      { code: "ESTP", text: "Good at moving right away" },
      { code: "INFJ", text: "Good at listening to people" },
      { code: "ENTP", text: "Good at coming up with new ideas" },
    ],
    note: "There is no better or worse choice. Just pick the one closer to you.",
    startLabel: "Start the questions",
  },
};

export const PERSONALITY_AXES: readonly PersonalityAxis[] = ["ei", "sn", "tf", "jp"] as const;

export const PERSONALITY_AXIS_META: Readonly<Record<PersonalityAxis, PersonalityAxisMeta>> = {
  ei: {
    id: "ei",
    poles: ["E", "I"],
    question: "どんな とき、元気に なる?",
    poleLabels: ["そとで 元気", "ひとりで 元気"],
    poleDescriptions: ["人と 話すと 元気に なる", "ひとりの 時間で 元気に なる"],
  },
  sn: {
    id: "sn",
    poles: ["S", "N"],
    question: "なにを 見て いる?",
    poleLabels: ["いま", "アイデア"],
    poleDescriptions: [
      "目の 前の こと・目で 見える こと",
      "これからの こと・ふと 出て くる かんがえ",
    ],
  },
  tf: {
    id: "tf",
    poles: ["T", "F"],
    question: "きめる とき、なにを 見る?",
    poleLabels: ["りゆう", "きもち"],
    poleDescriptions: ["りゆうが 合って いるか", "みんなが どう 思うか"],
  },
  jp: {
    id: "jp",
    poles: ["J", "P"],
    question: "どう すすめる?",
    poleLabels: ["けいかく", "そのとき"],
    poleDescriptions: ["先に きめて すすめる", "その ときに えらぶ"],
  },
};

export const PERSONALITY_FAMILIES: readonly PersonalityFamily[] = [
  {
    id: "leader",
    name: "しっかり組",
    reading: "しっかりぐみ",
    keirsey: "SJ",
    color: "#4fa8e8",
    strengths: ["丁寧", "順番を 決める", "任せて もらえる"],
    codes: ["ISTJ", "ISFJ", "ESTJ", "ESFJ"],
  },
  {
    id: "idea",
    name: "かんがえ組",
    reading: "かんがえぐみ",
    keirsey: "NT",
    color: "#58c273",
    strengths: ["なぜ?", "仕組み", "作る"],
    codes: ["INTJ", "INTP", "ENTJ", "ENTP"],
  },
  {
    id: "heart",
    name: "こころ組",
    reading: "こころぐみ",
    keirsey: "NF",
    color: "#f26fa7",
    strengths: ["気が つく", "人と 人を つなぐ", "元気に する"],
    codes: ["INFJ", "INFP", "ENFJ", "ENFP"],
  },
  {
    id: "challenge",
    name: "うごき組",
    reading: "うごきぐみ",
    keirsey: "SP",
    color: "#ffc93c",
    strengths: ["やって みる", "すぐに 動く"],
    codes: ["ISTP", "ISFP", "ESTP", "ESFP"],
  },
] as const;

export const PERSONALITY_TYPES: readonly PersonalityType[] = [
  {
    code: "ISTJ",
    familyId: "leader",
    name: "まじめの ネクマックス",
    shortName: "まじめ",
    emblem: "📋",
    tagline: "決めた ことを 最後まで します",
    teamRole: "記録役",
    teamRoleDetail: "会議で 決まった ことを 書いて、後で 見られるように する。",
    analysis: [
      "一度 やると 言った ことは、必ず 終わらせます。",
      "小さな 違いにも 気が つきます。",
      "ルールや 順番を 大切に します。",
      "日本の IT の 仕事では、テストや 手順づくりを 任せて もらえます。",
    ],
  },
  {
    code: "ISFJ",
    familyId: "leader",
    name: "みまもりの ネクマックス",
    shortName: "みまもり",
    emblem: "🍵",
    tagline: "静かに、みんなを 助けます",
    teamRole: "支え役",
    teamRoleDetail: "困って いる 人に 気が ついて、手を かす。",
    analysis: [
      "仲間が 元気か どうかを よく 見て います。",
      "頼まれた ことを 最後まで やります。",
      "だれも 見て いない ときも、丁寧に やります。",
      "日本の IT の 仕事では、毎日の 運用や サポートで チームを 支えます。",
    ],
  },
  {
    code: "ESTJ",
    familyId: "leader",
    name: "まとめの ネクマックス",
    shortName: "まとめ",
    emblem: "📣",
    tagline: "順番を 決めて、進めます",
    teamRole: "段取り役",
    teamRoleDetail: "最初に「だれが いつ やるか」を 決める。",
    analysis: [
      "やる ことを 一つずつ 書いて、順番を 決めます。",
      "「いつまでに 終わるか」を みんなに 言います。",
      "みんなに 声を かけて、仕事を 進めます。",
      "日本の IT の 仕事では、チームの 仕事が 前に 進むように する 人に なれます。",
    ],
  },
  {
    code: "ESFJ",
    familyId: "leader",
    name: "おせわの ネクマックス",
    shortName: "おせわ",
    emblem: "🤝",
    tagline: "人と 人を つなぎます",
    teamRole: "つなぎ役",
    teamRoleDetail: "チームの 中で、人と 人が 話せるように する。",
    analysis: [
      "困って いる 人に、すぐ 気が つきます。",
      "あいさつや、自分から 話しかける ことを 大切に します。",
      "チームを 楽しく します。",
      "日本の IT の 仕事では、お客さまや 仲間と 話す 仕事が よく できます。",
    ],
  },
  {
    code: "INTJ",
    familyId: "idea",
    name: "よそうの ネクマックス",
    shortName: "よそう",
    emblem: "♟️",
    tagline: "先を 見て、道を 作ります",
    teamRole: "設計役",
    teamRoleDetail: "むずかしく なりそうな ところを、先に 見つける。",
    analysis: [
      "先の ことを 考えて、準備 します。",
      "一番 早い やり方を 探します。",
      "一人で 時間を かけて 考えるのが 好きです。",
      "日本の IT の 仕事では、作る 前に 設計を 考える 仕事が よく できます。",
    ],
  },
  {
    code: "INTP",
    familyId: "idea",
    name: "なぜなぜの ネクマックス",
    shortName: "なぜなぜ",
    emblem: "🔍",
    tagline: "仕組みを 調べます",
    teamRole: "調べ役",
    teamRoleDetail: "わからない ことの 理由を 調べる。",
    analysis: [
      "「なぜ そう なるのか」が 気に なります。",
      "わかるまで 調べます。",
      "新しい 技術を 覚えるのが 好きです。",
      "日本の IT の 仕事では、なぜ 動かないのかを 見つける 人に なれます。",
    ],
  },
  {
    code: "ENTJ",
    familyId: "idea",
    name: "あんないの ネクマックス",
    shortName: "あんない",
    emblem: "🧭",
    tagline: "みんなと ゴールへ 進みます",
    teamRole: "リーダー役",
    teamRoleDetail: "ゴールを 決めて、みんなを 案内 する。",
    analysis: [
      "目標を 決めて、迷わないで 進みます。",
      "むずかしい ことでも、決めるのが 早いです。",
      "みんなで いっしょに がんばれます。",
      "日本の IT の 仕事では、チームの リーダーに なれます。",
    ],
  },
  {
    code: "ENTP",
    familyId: "idea",
    name: "アイデアの ネクマックス",
    shortName: "アイデア",
    emblem: "💡",
    tagline: "もっと いい やり方を 見つけます",
    teamRole: "提案役",
    teamRoleDetail: "「こう しませんか」と 新しい やり方を 出す。",
    analysis: [
      "アイデアが たくさん 出て きます。",
      "「こう しませんか」と 提案 します。",
      "話しながら 考えるのが 好きです。",
      "日本の IT の 仕事では、新しい ことを 考える 仕事が よく できます。",
    ],
  },
  {
    code: "INFJ",
    familyId: "heart",
    name: "おもいやりの ネクマックス",
    shortName: "おもいやり",
    emblem: "🌙",
    tagline: "人の 気持ちを 考えます",
    teamRole: "気づき役",
    teamRoleDetail: "言われて いない ことに 気が つく。",
    analysis: [
      "人の 気持ちが 変わる ことに 気が つきます。",
      "言われて いない ことも、自分で 考えます。",
      "静かですが、自分の 考えを もって います。",
      "日本の IT の 仕事では、使う 人の 気持ちを 考えた ものづくりが できます。",
    ],
  },
  {
    code: "INFP",
    familyId: "heart",
    name: "ゆめの ネクマックス",
    shortName: "ゆめ",
    emblem: "🌸",
    tagline: "好きな ことを 大事に します",
    teamRole: "丁寧役",
    teamRoleDetail: "一つ 一つを 丁寧に 作る。",
    analysis: [
      "「こう したい」と いつも 考えて います。",
      "大切に 思いながら、丁寧に 作ります。",
      "人の いい ところを 見つけるのが 得意です。",
      "日本の IT の 仕事では、自分の 好きな やり方で いい ものが 作れます。",
    ],
  },
  {
    code: "ENFJ",
    familyId: "heart",
    name: "おうえんの ネクマックス",
    shortName: "おうえん",
    emblem: "☀️",
    tagline: "みんなを 元気に します",
    teamRole: "応援役",
    teamRoleDetail: "新しく 入った 仲間に、最初に 話しかける。",
    analysis: [
      "仲間を ほめて、元気に します。",
      "人に 教えるのが 得意です。",
      "チームの みんなを つなぎます。",
      "日本の IT の 仕事では、後から 入る 人に 仕事を 教える 人に なれます。",
    ],
  },
  {
    code: "ENFP",
    familyId: "heart",
    name: "わくわくの ネクマックス",
    shortName: "わくわく",
    emblem: "🎈",
    tagline: "新しい ことに 人を 誘います",
    teamRole: "誘い役",
    teamRoleDetail: "「やって みない?」と 声を かける。",
    analysis: [
      "楽しい ことを 見つけるのが 早いです。",
      "いい 考えが 出たら、人を 誘って 始めます。",
      "初めて 会う 人とも すぐ 話せます。",
      "日本の IT の 仕事では、新しい ことを 一番 最初に 始めます。",
    ],
  },
  {
    code: "ISTP",
    familyId: "challenge",
    name: "どうぐの ネクマックス",
    shortName: "どうぐ",
    emblem: "🔧",
    tagline: "手を 動かして 直します",
    teamRole: "直し役",
    teamRoleDetail: "うまく 動かない ものを 直す。",
    analysis: [
      "壊れた ものを 見ると、直したく なります。",
      "自分で やって みて、覚えます。",
      "急がないで、落ち着いて 対応 します。",
      "日本の IT の 仕事では、トラブルで 止まった システムを 元に もどせます。",
    ],
  },
  {
    code: "ISFP",
    familyId: "challenge",
    name: "デザインの ネクマックス",
    shortName: "デザイン",
    emblem: "🎨",
    tagline: "きれいに 作ります",
    teamRole: "仕上げ役",
    teamRoleDetail: "最後に きれいに して、終わらせる。",
    analysis: [
      "形や 色に、自分の 好きが あります。",
      "自分の ペースで 丁寧に 進めます。",
      "みんなが なかよく 進める やり方を 選びます。",
      "日本の IT の 仕事では、画面の デザインや 仕上げが よく できます。",
    ],
  },
  {
    code: "ESTP",
    familyId: "challenge",
    name: "スタートの ネクマックス",
    shortName: "スタート",
    emblem: "⚡",
    tagline: "まず、やって みます",
    teamRole: "まず やる役",
    teamRoleDetail: "だれよりも 先に、やって みる。",
    analysis: [
      "考える より 先に、体が 動きます。",
      "すぐに 決められます。",
      "スピードが 速いです。",
      "日本の IT の 仕事では、早く 直さないと いけない とき、力に なれます。",
    ],
  },
  {
    code: "ESFP",
    familyId: "challenge",
    name: "もりあげの ネクマックス",
    shortName: "もりあげ",
    emblem: "🎉",
    tagline: "今、ここを 楽しく します",
    teamRole: "楽しく する役",
    teamRoleDetail: "みんなが 話しやすい 場を 作る。",
    analysis: [
      "まわりの 人を 楽しい 気持ちに します。",
      "人の 前で 話すのが 好きです。",
      "体を 動かしながら 覚えます。",
      "日本の IT の 仕事では、発表や、みんなを 楽しく する 仕事が よく できます。",
    ],
  },
] as const;

/**
 * 20問。出題順は EI → SN → TF → JP を5周。
 * Ⓐ／Ⓑ がどちらの極かは各問の a.pole / b.pole が持つ（表示順に意味はない）。
 */
export const PERSONALITY_QUESTIONS: readonly PersonalityQuestion[] = [
  {
    id: 1,
    axis: "ei",
    easy: "部屋に 入りました。初めて 会う 人が たくさん います。",
    japanese: "部屋に入りました。初めて会う人がたくさんいます。",
    english: "You walk into a room full of people you have never met.",
    a: {
      pole: "E",
      easy: "自分から 「はじめまして」と 声を かける",
      japanese: "自分から「はじめまして」と声をかける",
      english: "You greet someone first",
    },
    b: {
      pole: "I",
      // 「話しかけられるのを まつ」は受身とも可能とも読めるため使わない（07 §3.2）。
      easy: "だれかが 話しかけて くれるまで まつ",
      japanese: "だれかが話しかけてくれるまで待つ",
      english: "You wait until someone speaks to you",
    },
    readings: [
      { text: "入りました", reading: "はいりました" },
      { text: "会う", reading: "あう" },
      { text: "人", reading: "ひと" },
      { text: "自分", reading: "じぶん" },
      { text: "声", reading: "こえ" },
    ],
    image: "/img/quiz/q01.webp",
  },
  {
    id: 2,
    axis: "sn",
    easy: "「新しい アプリを 作ろう」と 言われました。",
    japanese: "「新しいアプリを作ろう」と言われました。",
    english: "You are told to build a new app.",
    a: {
      pole: "N",
      easy: "「こんな ことも できそう」と アイデアを たくさん 出す",
      japanese: "「こんなこともできそう」とアイデアをたくさん出す",
      english: "You put out lots of ideas about what it could be",
    },
    b: {
      pole: "S",
      easy: "最初に 作る ものを 一つずつ 決める",
      japanese: "最初に作るものを一つずつ決める",
      english: "You decide what to build first, one at a time",
    },
    readings: [
      { text: "作ろう", reading: "つくろう" },
      { text: "言われました", reading: "いわれました" },
      { text: "出す", reading: "だす" },
      { text: "一つずつ", reading: "ひとつずつ" },
    ],
    image: "/img/quiz/q02.webp",
  },
  {
    id: 3,
    axis: "tf",
    easy: "友だちの プログラムに、直す ところを 見つけました。",
    japanese: "友だちのプログラムに、直すところを見つけました。",
    english: "You find something to fix in a friend's program.",
    a: {
      pole: "T",
      easy: "直す ところを 先に 伝える",
      japanese: "直すところを先に伝える",
      english: "You mention the fix first",
    },
    b: {
      pole: "F",
      easy: "いい ところを 先に 言ってから、伝える",
      japanese: "いいところを先に言ってから、伝える",
      english: "You say what is good first, then mention it",
    },
    readings: [
      { text: "友", reading: "とも" },
      { text: "直す", reading: "なおす" },
      { text: "見つけました", reading: "みつけました" },
      { text: "先", reading: "さき" },
      { text: "言って", reading: "いって" },
    ],
    image: "/img/quiz/q03.webp",
  },
  {
    id: 4,
    axis: "jp",
    easy: "仕事は、どう 進めますか。",
    japanese: "仕事は、どう進めますか。",
    english: "How do you get work done?",
    a: {
      pole: "P",
      easy: "やりながら、一番 いい やり方を 決める",
      japanese: "やりながら、いちばんいいやり方を決める",
      english: "You decide the best way as you go",
    },
    b: {
      pole: "J",
      easy: "最初に 予定を 決めて、同じように 進める",
      japanese: "最初に予定を決めて、そのとおりに進める",
      english: "You set a plan first and follow it",
    },
    readings: [{ text: "仕事", reading: "しごと" }],
    image: "/img/quiz/q04.webp",
  },
  {
    id: 5,
    axis: "ei",
    easy: "一日 勉強して、つかれました。",
    japanese: "一日勉強して、つかれました。",
    english: "You are tired after a full day of study.",
    a: {
      pole: "I",
      easy: "一人で ゆっくり 休むと 元気に なる",
      japanese: "ひとりでゆっくり休むと元気になる",
      english: "Resting alone gives you energy",
    },
    b: {
      pole: "E",
      easy: "友だちと 話すと 元気に なる",
      japanese: "友だちと話すと元気になる",
      english: "Talking with friends gives you energy",
    },
    readings: [
      { text: "一日", reading: "いちにち" },
      { text: "元気", reading: "げんき" },
      { text: "話す", reading: "はなす" },
    ],
    image: "/img/quiz/q05.webp",
  },
  {
    id: 6,
    axis: "sn",
    easy: "説明を 聞く とき、どちらが うれしいですか。",
    japanese: "説明を聞くとき、どちらがうれしいですか。",
    english: "In an explanation, which do you prefer?",
    a: {
      pole: "S",
      easy: "本当に あった 例を 見せて もらう",
      japanese: "本当にあった例を見せてもらう",
      english: "Being shown a real example",
    },
    b: {
      pole: "N",
      easy: "「なぜ そう するのか」を 教えて もらう",
      japanese: "「なぜそうするのか」を教えてもらう",
      english: "Being told why it is done that way",
    },
    readings: [
      { text: "例", reading: "れい" },
      { text: "聞く", reading: "きく" },
      { text: "本当", reading: "ほんとう" },
      { text: "見せて", reading: "みせて" },
      { text: "教えて", reading: "おしえて" },
    ],
    image: "/img/quiz/q06.webp",
  },
  {
    id: 7,
    axis: "tf",
    easy: "チームの 意見が 二つに なりました。どちらが 気に なりますか。",
    japanese: "チームの意見が二つになりました。どちらが気になりますか。",
    english: "The team is split in two. Which concerns you?",
    a: {
      pole: "F",
      easy: "みんなの 気持ちが どう なるか",
      japanese: "みんなの気持ちがどうなるか",
      english: "How everyone will feel",
    },
    b: {
      pole: "T",
      easy: "どちらが いい 結果に なるか",
      japanese: "どちらがいい結果になるか",
      english: "Which one gives a better result",
    },
    readings: [
      { text: "意見", reading: "いけん" },
      { text: "結果", reading: "けっか" },
      { text: "二つ", reading: "ふたつ" },
      // 「気持ち」は「気」より先に置く。うしろだと「気」だけにルビが付いて「持ち」が裸で残る。
      { text: "気持ち", reading: "きもち" },
      { text: "気", reading: "き" },
    ],
    image: "/img/quiz/q07.webp",
  },
  {
    id: 8,
    axis: "jp",
    easy: "締め切りの ある 仕事です。「この 日までに 終わらせて ください」と 言われました。",
    japanese: "締め切りのある仕事です。「この日までに終わらせてください」と言われました。",
    english: "This job has a deadline. You are told to finish it by a certain day.",
    a: {
      pole: "J",
      easy: "早めに 終わらせて、安心したい",
      japanese: "早めに終わらせて、安心したい",
      english: "You want to finish early and feel safe",
    },
    b: {
      pole: "P",
      // 「いきおいを つけて やる」はN1慣用句。Ⓐだけ平易だとJ極へ系統的に偏る（07 §3.2）。
      easy: "最後の 日に、一生懸命 やる",
      japanese: "最後の日に、いっしょうけんめいやる",
      english: "You give it everything on the last day",
    },
    readings: [
      { text: "一生懸命", reading: "いっしょうけんめい" },
      { text: "安心", reading: "あんしん" },
      { text: "締め切り", reading: "しめきり" },
      { text: "日", reading: "ひ" },
      { text: "早め", reading: "はやめ" },
    ],
    image: "/img/quiz/q08.webp",
  },
  {
    id: 9,
    axis: "ei",
    easy: "チームで 話しあいます。",
    japanese: "チームで話し合います。",
    english: "You are in a team discussion.",
    a: {
      pole: "E",
      easy: "話しながら、自分の 考えが 決まる",
      japanese: "話しながら、自分の考えが決まる",
      english: "Your ideas take shape while you talk",
    },
    b: {
      pole: "I",
      easy: "自分の 考えが 決まってから、話す",
      japanese: "自分の考えが決まってから、話す",
      english: "You talk after your ideas take shape",
    },
    readings: [{ text: "話し", reading: "はなし" }],
    image: "/img/quiz/q09.webp",
  },
  {
    id: 10,
    axis: "sn",
    easy: "話を して いる とき、どちらを よく 言いますか。",
    japanese: "話をしているとき、どちらをよく言いますか。",
    english: "Which do you say more often?",
    a: {
      pole: "N",
      easy: "「もし 違う やり方だったら、どう なるかな?」",
      japanese: "「もしちがうやり方だったら、どうなるかな?」",
      english: '"What if we did it another way?"',
    },
    b: {
      pole: "S",
      easy: "「今、どう なって いますか?」",
      japanese: "「今、どうなっていますか?」",
      english: '"How is it right now?"',
    },
    readings: [
      { text: "話", reading: "はなし" },
      { text: "言います", reading: "いいます" },
      { text: "今", reading: "いま" },
    ],
    image: "/img/quiz/q10.webp",
  },
  {
    id: 11,
    axis: "tf",
    easy: "何かを 決める とき、どちらが 大切ですか。",
    japanese: "何かを決めるとき、どちらが大切ですか。",
    english: "When you decide, which matters more?",
    a: {
      pole: "T",
      easy: "理由を 説明 できる こと",
      japanese: "理由を説明できること",
      english: "Being able to explain the reason",
    },
    b: {
      pole: "F",
      easy: "みんなが 「そうだね」と 言える こと",
      japanese: "みんなが「そうだね」と言えること",
      english: "Everyone being able to agree",
    },
    readings: [
      { text: "何", reading: "なに" },
      { text: "言える", reading: "いえる" },
    ],
    image: "/img/quiz/q11.webp",
  },
  {
    id: 12,
    axis: "jp",
    easy: "休みの 日、どう しますか。",
    japanese: "休みの日、どうしますか。",
    english: "What do you do on a day off?",
    a: {
      pole: "P",
      easy: "その 日の 気持ちで 決めたい",
      japanese: "その日の気持ちで決めたい",
      english: "You decide by how you feel that day",
    },
    b: {
      pole: "J",
      easy: "前の 日に 予定を 作りたい",
      japanese: "前の日に予定を作りたい",
      english: "You make a plan the day before",
    },
    readings: [
      { text: "日", reading: "ひ" },
      { text: "前", reading: "まえ" },
      { text: "作りたい", reading: "つくりたい" },
    ],
    image: "/img/quiz/q12.webp",
  },
  {
    id: 13,
    axis: "ei",
    easy: "先生が 「質問は ありますか」と 聞きました。",
    japanese: "先生が「質問はありますか」と聞きました。",
    english: "The teacher asks if anyone has a question.",
    a: {
      pole: "I",
      easy: "手を あげる 前に、頭の 中で 一回 考えて みる",
      japanese: "手をあげる前に、頭の中で一回考えてみる",
      english: "You think it through in your head first",
    },
    b: {
      pole: "E",
      easy: "いい 考えが 出たら、すぐ 手を あげる",
      japanese: "いい考えが出たら、すぐ手をあげる",
      english: "You raise your hand as soon as you have an idea",
    },
    readings: [
      { text: "先生", reading: "せんせい" },
      { text: "聞きました", reading: "ききました" },
      { text: "手", reading: "て" },
      { text: "頭", reading: "あたま" },
      { text: "中", reading: "なか" },
      { text: "一回", reading: "いっかい" },
    ],
    image: "/img/quiz/q13.webp",
  },
  {
    id: 14,
    axis: "sn",
    easy: "新しい 仕事の やり方を 覚えます。",
    japanese: "新しい仕事のやり方をおぼえます。",
    english: "You are learning a new way of working.",
    a: {
      pole: "S",
      easy: "やり方を 見ながら、同じように やる",
      japanese: "やり方を見ながら、同じようにやる",
      english: "You follow the instructions exactly",
    },
    b: {
      pole: "N",
      // 「だいたいの かんじを つかんで」は「漢字」と誤読され選択肢が崩れる（07 §3.2）。
      easy: "だいたい わかったら、後は 自分で 試す",
      japanese: "だいたい分かったら、あとは自分で試す",
      english: "Once you get the gist, you try it yourself",
    },
    readings: [
      { text: "試す", reading: "ためす" },
      { text: "見ながら", reading: "みながら" },
      { text: "自分", reading: "じぶん" },
    ],
    image: "/img/quiz/q14.webp",
  },
  {
    id: 15,
    axis: "tf",
    easy: "友だちが 失敗して、元気が ありません。",
    japanese: "友だちが失敗して、元気がありません。",
    english: "A friend is down after a mistake.",
    a: {
      pole: "F",
      easy: "まず 気持ちを 聞いて、そばに いる",
      japanese: "まず気持ちを聞いて、そばにいる",
      english: "You listen to their feelings and stay near",
    },
    b: {
      pole: "T",
      easy: "次に どう すれば いいかを いっしょに 考える",
      japanese: "次にどうすればいいかをいっしょに考える",
      english: "You think together about what to do next",
    },
    readings: [
      { text: "友", reading: "とも" },
      { text: "元気", reading: "げんき" },
      { text: "聞いて", reading: "きいて" },
    ],
    image: "/img/quiz/q15.webp",
  },
  {
    id: 16,
    axis: "jp",
    easy: "机の 上や スマホの 中は、どちらが いいですか。",
    japanese: "机の上やスマホの中は、どちらがいいですか。",
    english: "Your desk and your phone: which do you prefer?",
    a: {
      pole: "J",
      easy: "いつも きれいに して おきたい",
      japanese: "いつもきれいにしておきたい",
      english: "Always kept tidy",
    },
    b: {
      pole: "P",
      easy: "きれいで なくても、すぐ 見つかれば いい",
      japanese: "きれいでなくても、すぐ見つかればいい",
      english: "Not tidy is fine, as long as you can find things",
    },
    readings: [
      { text: "上", reading: "うえ" },
      { text: "中", reading: "なか" },
      { text: "見つかれば", reading: "みつかれば" },
    ],
    image: "/img/quiz/q16.webp",
  },
  {
    id: 17,
    axis: "ei",
    easy: "休みの 日、どちらが したいですか。",
    japanese: "休みの日、どちらがしたいですか。",
    english: "On a day off, which do you want?",
    a: {
      pole: "E",
      easy: "みんなと 出かけたい",
      japanese: "みんなと出かけたい",
      english: "To go out with everyone",
    },
    b: {
      pole: "I",
      easy: "家で 自分の したい ことを する",
      japanese: "家で自分のしたいことをする",
      english: "To stay home and do your own things",
    },
    readings: [
      { text: "日", reading: "ひ" },
      { text: "出かけたい", reading: "でかけたい" },
      { text: "家", reading: "いえ" },
    ],
    image: "/img/quiz/q17.webp",
  },
  {
    id: 18,
    axis: "sn",
    easy: "新しい 道具を もらいました。",
    japanese: "新しい道具をもらいました。",
    english: "You are given a new tool.",
    a: {
      pole: "N",
      easy: "「これで 何が できるかな」と 考える",
      japanese: "「これで何ができるかな」と考える",
      english: "You think about what it could do",
    },
    b: {
      pole: "S",
      easy: "使い方の 紙を 見て、同じように 使う",
      japanese: "使い方の紙を見て、同じように使う",
      english: "You read the instructions and follow them",
    },
    readings: [
      { text: "何", reading: "なに" },
      { text: "見て", reading: "みて" },
      { text: "使う", reading: "つかう" },
    ],
    image: "/img/quiz/q18.webp",
  },
  {
    id: 19,
    axis: "tf",
    easy: "先生に こう 言われたら、どちらが うれしいですか。",
    japanese: "先生にこう言われたら、どちらがうれしいですか。",
    english: "Which would you rather hear from your teacher?",
    a: {
      pole: "T",
      easy: "「考え方が いいね」",
      japanese: "「考え方がいいね」",
      english: '"You think well"',
    },
    b: {
      pole: "F",
      // 「やさしいね」単独では「易しい（かんたん）」と誤読されT極が過大になる（07 §3.2）。
      easy: "「人に やさしいね」",
      japanese: "「人にやさしいね」",
      english: '"You are kind to people"',
    },
    readings: [
      { text: "先生", reading: "せんせい" },
      { text: "言われたら", reading: "いわれたら" },
      { text: "人", reading: "ひと" },
    ],
    image: "/img/quiz/q19.webp",
  },
  {
    id: 20,
    axis: "jp",
    easy: "途中で 「やり方を 変えよう」と 言われました。",
    japanese: "途中で「やり方を変えよう」と言われました。",
    english: "Mid-way, you are told to change the approach.",
    a: {
      pole: "P",
      easy: "「新しい やり方を やって みたい」と 思う",
      japanese: "「新しいやり方をやってみたい」と思う",
      english: "You think it sounds interesting",
    },
    b: {
      pole: "J",
      easy: "「先に 予定を 作りなおしたい」と 思う",
      japanese: "「先に予定を作りなおしたい」と思う",
      english: "You want to redo the plan first",
    },
    readings: [
      { text: "途中", reading: "とちゅう" },
      { text: "変えよう", reading: "かえよう" },
      { text: "言われました", reading: "いわれました" },
      { text: "作りなおしたい", reading: "つくりなおしたい" },
    ],
    image: "/img/quiz/q20.webp",
  },
] as const;

/** 結果画面（tagline / analysis / teamRoleDetail）の読み辞書。 */
export const PERSONALITY_RESULT_READINGS: readonly Reading[] = [
  { text: "一生懸命", reading: "いっしょうけんめい" },
  { text: "性格", reading: "せいかく" },
  { text: "診断", reading: "しんだん" },
  { text: "意見", reading: "いけん" },
  { text: "安心", reading: "あんしん" },
  { text: "途中", reading: "とちゅう" },
  { text: "試す", reading: "ためす" },
  { text: "例", reading: "れい" },
  // 語彙メモ（glossary.ts）の見出し語は必ずここに置く。本文は漢字で書き、読みはここから合成する。
  // **配列の先頭に置くこと。** RubyText は同じ位置で一致した語のうち配列で先に出たほうを採るので、
  // 「手順」を「手」より後ろに置くと「手」だけにルビが付いて「順」が裸で残る。
  { text: "得意", reading: "とくい" },
  { text: "参考", reading: "さんこう" },
  { text: "仕組み", reading: "しくみ" },
  { text: "手順", reading: "てじゅん" },
  { text: "仲間", reading: "なかま" },
  { text: "運用", reading: "うんよう" },
  { text: "対応", reading: "たいおう" },
  { text: "設計", reading: "せっけい" },
  { text: "技術", reading: "ぎじゅつ" },
  { text: "提案", reading: "ていあん" },
  { text: "目標", reading: "もくひょう" },
  { text: "締め切り", reading: "しめきり" },
  { text: "段取り", reading: "だんどり" },
  { text: "仕上げ", reading: "しあげ" },
  { text: "結果", reading: "けっか" },
  // 熟語・複合語は **1字の読みより先**に置く（同位置なら配列で先に出たほうが勝つ）。
  // 「気持ち」を「気」より後ろに置くと、「気」だけにルビが付いて「持ち」が裸で残る。
  // ---- ひらがなを 漢字＋ふりがなに 戻した ぶん（2026-08-21「ひらがなが 多すぎる」）----
  // 熟語は **1字の読みより前**（同じ位置なら 配列で 先に 出たほうが 勝つ）。
  { text: "順番", reading: "じゅんばん" },
  { text: "丁寧", reading: "ていねい" },
  { text: "記録", reading: "きろく" },
  { text: "準備", reading: "じゅんび" },
  { text: "案内", reading: "あんない" },
  { text: "応援", reading: "おうえん" },
  { text: "大事", reading: "だいじ" },
  { text: "画面", reading: "がめん" },
  { text: "発表", reading: "はっぴょう" },
  // 「毎日」は「日」より前。うしろに置くと「毎」が裸で残る。
  { text: "毎日", reading: "まいにち" },
  // 「一人」は「一つ」などと同じ 2字の語。どれも 別の 語なので 並びは 問わない。
  { text: "一人", reading: "ひとり" },
  // 送りがなを またぐ 語は かたまりで 持つ（「落」「着」の 1字では 読めない）。
  { text: "落ち着いて", reading: "おちついて" },
  // 語彙メモの **説明文**に 出る 語（吹き出しの 中も 覆う。tests/personality_furigana.test.ts）。
  { text: "大きい", reading: "おおきい" },
  { text: "小さい", reading: "ちいさい" },
  { text: "行き方", reading: "いきかた" },
  // 語彙メモ（glossary）の 見出し語は、読みが 台帳と 一致して いないと 検査で 落ちる。
  { text: "違い", reading: "ちがい" },
  { text: "必ず", reading: "かならず" },
  { text: "静か", reading: "しずか" },
  { text: "速い", reading: "はやい" },
  { text: "変わる", reading: "かわる" },
  { text: "助けます", reading: "たすけます" },
  { text: "支えます", reading: "ささえます" },
  { text: "任せて", reading: "まかせて" },
  { text: "頼まれた", reading: "たのまれた" },
  { text: "困って", reading: "こまって" },
  { text: "覚えます", reading: "おぼえます" },
  { text: "探します", reading: "さがします" },
  { text: "誘います", reading: "さそいます" },
  { text: "直します", reading: "なおします" },
  { text: "壊れた", reading: "こわれた" },
  { text: "止まった", reading: "とまった" },
  { text: "始めます", reading: "はじめます" },
  { text: "気持ち", reading: "きもち" },
  { text: "伝える", reading: "つたえる" },
  { text: "質問", reading: "しつもん" },
  { text: "説明", reading: "せつめい" },
  { text: "理由", reading: "りゆう" },
  { text: "大切", reading: "たいせつ" },
  { text: "本当", reading: "ほんとう" },
  { text: "仕事", reading: "しごと" },
  { text: "予定", reading: "よてい" },
  { text: "勉強", reading: "べんきょう" },
  { text: "部屋", reading: "へや" },
  { text: "道具", reading: "どうぐ" },
  { text: "最初", reading: "さいしょ" },
  { text: "最後", reading: "さいご" },
  { text: "失敗", reading: "しっぱい" },
  { text: "一回", reading: "いっかい" },
  { text: "一番", reading: "いちばん" },
  { text: "一日", reading: "いちにち" },
  // 「1人」「二人」は「人」より先。うしろに置くと「1人（ひと）」と読ませてしまう。
  { text: "1人", reading: "ひとり" },
  { text: "二人", reading: "ふたり" },
  // 「〜方」は語のまとまりで読む（「方」1字だと やりかた/ほう の どちらか決まらない）。
  { text: "やり方", reading: "やりかた" },
  { text: "使い方", reading: "つかいかた" },
  { text: "考え方", reading: "かんがえかた" },
  { text: "考え", reading: "かんがえ" },
  { text: "日本", reading: "にほん" },
  { text: "役", reading: "やく" },
  { text: "会議", reading: "かいぎ" },
  { text: "一度", reading: "いちど" },
  { text: "人", reading: "ひと" },
  { text: "小さな", reading: "ちいさな" },
  { text: "時間", reading: "じかん" },
  { text: "元気", reading: "げんき" },
  { text: "気", reading: "き" },
  { text: "見て", reading: "みて" },
  { text: "見る", reading: "みる" },
  { text: "見つける", reading: "みつける" },
  { text: "声", reading: "こえ" },
  { text: "話す", reading: "はなす" },
  { text: "話しかける", reading: "はなしかける" },
  { text: "教える", reading: "おしえる" },
  { text: "聞く", reading: "きく" },
  { text: "知る", reading: "しる" },
  { text: "作れます", reading: "つくれます" },
  { text: "作る", reading: "つくる" },
  { text: "書いて", reading: "かいて" },
  { text: "言います", reading: "いいます" },
  { text: "言われて", reading: "いわれて" },
  { text: "思いながら", reading: "おもいながら" },
  { text: "思う", reading: "おもう" },
  { text: "一つずつ", reading: "ひとつずつ" },
  { text: "一つ", reading: "ひとつ" },
  { text: "自分", reading: "じぶん" },
  { text: "先", reading: "さき" },
  { text: "早い", reading: "はやい" },
  { text: "早め", reading: "はやめ" },
  { text: "楽しい", reading: "たのしい" },
  { text: "楽しく", reading: "たのしく" },
  { text: "体", reading: "からだ" },
  { text: "頭", reading: "あたま" },
  { text: "家", reading: "いえ" },
  { text: "机", reading: "つくえ" },
  { text: "色", reading: "いろ" },
  { text: "前", reading: "まえ" },
  { text: "中", reading: "なか" },
  { text: "入る", reading: "はいる" },
  { text: "来ます", reading: "きます" },
  { text: "出て", reading: "でて" },
  { text: "出たら", reading: "でたら" },
  { text: "出す", reading: "だす" },
  { text: "出た", reading: "でた" },
  { text: "出し", reading: "だし" },
  { text: "会う", reading: "あう" },
  { text: "力", reading: "ちから" },
  { text: "動く", reading: "うごく" },
  { text: "手", reading: "て" },
  { text: "お客さま", reading: "おきゃくさま" },
  // ---- 1字の読み（活用でかたちが変わる語）----
  // 「見る／見て」のように活用形を並べても、「見られる」「見えて」で また 裸に なる。
  // 送りがなの前で切って **漢字1字＋読み** を置けば、どの活用でも ルビが 付く。
  // **必ず最後に置く**（上の熟語・活用形が先に一致するように）。
  { text: "見", reading: "み" },
  { text: "話", reading: "はな" },
  { text: "作", reading: "つく" },
  { text: "書", reading: "か" },
  { text: "言", reading: "い" },
  { text: "思", reading: "おも" },
  { text: "早", reading: "はや" },
  { text: "入", reading: "はい" },
  { text: "答", reading: "こた" },
  { text: "決", reading: "き" },
  { text: "考", reading: "かんが" },
  { text: "調", reading: "しら" },
  { text: "終", reading: "お" },
  { text: "似", reading: "に" },
  { text: "近", reading: "ちか" },
  { text: "選", reading: "えら" },
  { text: "好", reading: "す" },
  { text: "目", reading: "め" },
  { text: "合", reading: "あ" },
  { text: "初", reading: "はじ" },
  { text: "待", reading: "ま" },
  { text: "新", reading: "あたら" },
  { text: "伝", reading: "つた" },
  { text: "進", reading: "すす" },
  { text: "休", reading: "やす" },
  { text: "友", reading: "とも" },
  { text: "同", reading: "おな" },
  { text: "分", reading: "わ" },
  { text: "次", reading: "つぎ" },
  { text: "使", reading: "つか" },
  { text: "紙", reading: "かみ" },
  { text: "何", reading: "なに" },
  { text: "日", reading: "ひ" },
  { text: "楽", reading: "らく" },
  { text: "方", reading: "かた" },
  { text: "聞", reading: "き" },
  { text: "知", reading: "し" },
  // 2026-08-21 の 漢字化で 増えた ぶん。ここも **いちばん 後ろ**に 置く。
  { text: "任", reading: "まか" },
  { text: "後", reading: "あと" },
  { text: "必", reading: "かなら" },
  { text: "違", reading: "ちが" },
  { text: "静", reading: "しず" },
  { text: "助", reading: "たす" },
  { text: "支", reading: "ささ" },
  { text: "困", reading: "こま" },
  { text: "頼", reading: "たの" },
  { text: "道", reading: "みち" },
  { text: "探", reading: "さが" },
  { text: "覚", reading: "おぼ" },
  { text: "動", reading: "うご" },
  { text: "迷", reading: "まよ" },
  { text: "変", reading: "か" },
  { text: "誘", reading: "さそ" },
  { text: "始", reading: "はじ" },
  { text: "直", reading: "なお" },
  { text: "壊", reading: "こわ" },
  { text: "急", reading: "いそ" },
  { text: "止", reading: "と" },
  { text: "元", reading: "もと" },
  { text: "形", reading: "かたち" },
  { text: "速", reading: "はや" },
  { text: "今", reading: "いま" },
  { text: "場", reading: "ば" },
  { text: "残", reading: "のこ" },
  { text: "字", reading: "じ" },
  { text: "絵", reading: "え" },
  { text: "音", reading: "おと" },
  { text: "下", reading: "した" },
] as const;

/**
 * 設問1問ぶんの読み辞書。**設問ごとの読みを先に、共通の読み辞書をうしろに**置く。
 *
 * `RubyText` は同じ位置で一致した語のうち配列で先に出たほうを採るので、この並びなら
 * 設問固有の読み（「一回」など）が勝ち、そこに無い語は共通辞書が拾う。
 *
 * 設問には**やさしい日本語と日本語の2つの本文**があり、画面はどちらでも同じ読み辞書を
 * 使う。20問×2言語ぶんの語をすべて設問側に書くと台帳が二重になるので、共通の語は
 * `PERSONALITY_RESULT_READINGS` に1回だけ置いて、ここで足す。
 * 覆えているかは `tests/personality_furigana.test.ts` が総当たりで見張る。
 */
export function questionReadings(question: PersonalityQuestion): readonly Reading[] {
  // 同じ表記が両方に載っていたら**設問側の読みを採る**（文脈に合わせた読みを上書きさせない）。
  const merged = new Map<string, Reading>();
  for (const reading of [...question.readings, ...PERSONALITY_RESULT_READINGS]) {
    if (!merged.has(reading.text)) merged.set(reading.text, reading);
  }
  // **長い語を先に並べる。** `RubyText` は同じ位置で一致したら配列で先に出たほうを採るので、
  // 2つの辞書をつないだだけだと、設問側の「日」が共通側の「日本」を食べてしまう。
  // 同じ位置なら長い語が正しいので、長さの降順に直してから渡す（同じ長さは元の並びのまま）。
  return [...merged.values()].sort((a, b) => b.text.length - a.text.length);
}

const CODES: readonly PersonalityTypeCode[] = PERSONALITY_TYPES.map((type) => type.code);

/** コードの何文字目がどの軸か。 */
const AXIS_INDEX: Readonly<Record<PersonalityAxis, number>> = { ei: 0, sn: 1, tf: 2, jp: 3 };

function isAnswer(value: unknown): value is PersonalityAnswer {
  return value === "a" || value === "b";
}

function validateAnswers(answers: readonly PersonalityAnswer[]): void {
  if (answers.length !== PERSONALITY_QUESTIONS.length || !answers.every(isAnswer)) {
    throw new Error("20もん すべてに こたえてください。");
  }
}

/** 選ばれた側の極に1点。値は「左の極（E/S/T/J）」側の点数（0〜5）。 */
export function calculatePersonalityScores(
  answers: readonly PersonalityAnswer[],
): PersonalityScores {
  validateAnswers(answers);
  const scores: PersonalityScores = { ei: 0, sn: 0, tf: 0, jp: 0 };

  PERSONALITY_QUESTIONS.forEach((question, index) => {
    const chosen = answers[index] === "a" ? question.a : question.b;
    if (chosen.pole === PERSONALITY_AXIS_META[question.axis].poles[0]) {
      scores[question.axis] += 1;
    }
  });
  return scores;
}

/**
 * DB（jsonb）から読んだ値の検証にも使う型ガード。
 * ちょうど4キー・各値が0〜5の整数であることまで見る。v2 の `{leader,idea,heart,challenge}` や
 * 範囲外・小数・欠損はここで落ちる。
 */
export function isPersonalityScores(value: unknown): value is PersonalityScores {
  if (typeof value !== "object" || value === null) return false;
  const keys = Object.keys(value);
  if (keys.length !== PERSONALITY_AXES.length) return false;
  return PERSONALITY_AXES.every((axis) => {
    const score = (value as Record<string, unknown>)[axis];
    return typeof score === "number" && Number.isInteger(score) && score >= 0 && score <= 5;
  });
}

function assertScores(scores: PersonalityScores): void {
  if (!isPersonalityScores(scores)) {
    throw new Error("スコアは ei/sn/tf/jp の 4じくで、0〜5の せいすうで ある ひつようが あります。");
  }
}

/** 各軸5問（奇数）なので 3 以上か否かで必ず一方に決まる。同点は起きない。 */
export function pickPersonalityCode(scores: PersonalityScores): PersonalityTypeCode {
  assertScores(scores);
  const code = PERSONALITY_AXES.map((axis) => {
    const [first, second] = PERSONALITY_AXIS_META[axis].poles;
    return scores[axis] >= 3 ? first : second;
  }).join("");
  if (!isPersonalityTypeCode(code)) {
    throw new Error(`unknown personality type: ${code}`);
  }
  return code;
}

export function scorePersonality(answers: readonly PersonalityAnswer[]): PersonalityTypeCode {
  return pickPersonalityCode(calculatePersonalityScores(answers));
}

export function getPersonalityType(code: PersonalityTypeCode): PersonalityType {
  const type = PERSONALITY_TYPES.find((item) => item.code === code);
  if (!type) throw new Error(`unknown personality type: ${code}`);
  return type;
}

export function getPersonalityFamily(id: PersonalityFamilyId): PersonalityFamily {
  const family = PERSONALITY_FAMILIES.find((item) => item.id === id);
  if (!family) throw new Error(`unknown personality family: ${id}`);
  return family;
}

export function getFamilyForCode(code: PersonalityTypeCode): PersonalityFamily {
  return getPersonalityFamily(getPersonalityType(code).familyId);
}

export function isPersonalityTypeCode(value: unknown): value is PersonalityTypeCode {
  return typeof value === "string" && CODES.includes(value as PersonalityTypeCode);
}

/** その軸の極が何かをスコアから返す。しきい値は3（各軸5問なので3以上で確定）。 */
export function getPole(scores: PersonalityScores, axis: PersonalityAxis): PersonalityPole {
  const [first, second] = PERSONALITY_AXIS_META[axis].poles;
  return scores[axis] >= 3 ? first : second;
}

/**
 * その軸の極をコードの該当文字から返す。
 *
 * scores を経由しないので、管理者が `personality_type` だけを手で書き換えた行でも、
 * 画面に出ているコードと判定が食い違わない。チーム編成の J/F/E 判定はこちらを使う
 * （scores は表示専用）。
 */
export function getPoleFromCode(
  code: PersonalityTypeCode,
  axis: PersonalityAxis,
): PersonalityPole {
  // DBやadmin経由で壊れた値が来たとき、undefined を極として返さない。
  if (!isPersonalityTypeCode(code)) {
    throw new Error(`unknown personality type: ${String(code)}`);
  }
  const letter = code[AXIS_INDEX[axis]];
  const [first, second] = PERSONALITY_AXIS_META[axis].poles;
  if (letter !== first && letter !== second) {
    throw new Error(`unknown pole for axis ${axis}: ${String(letter)}`);
  }
  return letter;
}

/**
 * その軸が 3-2 の僅差か。「僅差」の定義はここ1か所に持つ（08 §3.1）。
 * 定義が2か所に散ると片方だけ直されて壊れるため、getCloseAxis / getCloseAxes も
 * この述語の上に載せる。
 */
export function isCloseAxis(scores: PersonalityScores, axis: PersonalityAxis): boolean {
  assertScores(scores);
  return scores[axis] === 3 || scores[axis] === 2;
}

/** 僅差の軸すべて（EI→SN→TF→JP の順）。教師向けの授業サポート表示が使う（08 §3.2）。 */
export function getCloseAxes(scores: PersonalityScores): readonly PersonalityAxis[] {
  assertScores(scores);
  return PERSONALITY_AXES.filter((axis) => isCloseAxis(scores, axis));
}

/**
 * 3-2 の僅差になっている軸。EI→SN→TF→JP の順で最初の1つだけ返す（07 §4.3）。
 * 「どちらも あなたの いい ところ」の表示に使う。
 */
export function getCloseAxis(scores: PersonalityScores): PersonalityAxis | null {
  return getCloseAxes(scores)[0] ?? null;
}

/** 指定した軸だけ極を反転したコードを返す。 */
function flipAxes(code: PersonalityTypeCode, axes: readonly PersonalityAxis[]): PersonalityTypeCode {
  const letters = code.split("");
  for (const axis of axes) {
    const [first, second] = PERSONALITY_AXIS_META[axis].poles;
    const index = AXIS_INDEX[axis];
    letters[index] = letters[index] === first ? second : first;
  }
  const flipped = letters.join("");
  if (!isPersonalityTypeCode(flipped)) {
    throw new Error(`unknown personality type: ${flipped}`);
  }
  return flipped;
}

export interface CompatibilityCard {
  readonly code: PersonalityTypeCode;
  /** カードに添える理由の1行。 */
  readonly reason: string;
}

export interface PersonalityCompatibility {
  /** すぐに 話が できる なかま。 */
  similar: readonly [CompatibilityCard, CompatibilityCard];
  /** じぶんに ない ものを もって いる なかま。 */
  complementary: readonly [CompatibilityCard, CompatibilityCard];
}

/**
 * 相性カード4枚。規則で一意に決まり、乱数・表順に依存しない（07 §5.1）。
 * 「合わない相手」という枠組みは作らない。どの組み合わせにも前向きな意味を与える。
 */
export function getCompatibility(code: PersonalityTypeCode): PersonalityCompatibility {
  if (!isPersonalityTypeCode(code)) {
    throw new Error(`unknown personality type: ${String(code)}`);
  }
  return {
    similar: [
      { code: flipAxes(code, ["ei"]), reason: "元気に なる ときだけ ちがう" },
      { code: flipAxes(code, ["jp"]), reason: "すすめかただけ ちがう" },
    ],
    complementary: [
      {
        code: flipAxes(code, ["ei", "sn", "tf", "jp"]),
        reason: "4つ とも ちがう",
      },
      {
        code: flipAxes(code, ["sn", "tf"]),
        reason: "見て いる ところと、きめる ときに 見る ものが ちがう",
      },
    ],
  };
}
