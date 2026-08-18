/**
 * ローマ字入力れんしゅう — 教材データ
 *
 * ## 持ち方（アプリ本体と同じ規律）
 * 文は**プレーンテキスト**で持ち、ルビは表示のときに `app.js` が読み辞書から
 * 合成する（AGENTS.md 規律2 / src/lib/text/furigana.ts と同じ考え方）。
 * ここに `<ruby>` を手で書かない——手で書くと「判定に使う文」と「画面に出す文」の
 * 二重管理になり、直したはずの読みが片方だけ古いまま残る。
 *
 * 覆えていない漢字が無いかは `tests/romaji_tool.test.ts` が機械で調べる。
 * 打ち方（romaji）が 読み（reading）と 合っているかも 同じテストが調べる。
 *
 * ## 学習者
 * カンボジアのITの学生（日本語 N5〜N4）。**キーボードに 日本語を 入れるのが
 * はじめて**の人を想定する。むずかしい語は ひらがなに開かず、漢字＋ふりがなの
 * ままにして、意味を 英語で 添える（docs/constraints.md）。
 */

/** 読み辞書（[表記, よみ]）。複合語を先に置く必要はない（app.js が長い順に並べる）。 */
export const FURIGANA = [
  ["日本語", "にほんご"],
  ["日本", "にほん"],
  ["入力", "にゅうりょく"],
  ["文字", "もじ"],
  ["漢字", "かんじ"],
  ["変換", "へんかん"],
  ["練習", "れんしゅう"],
  ["最初", "さいしょ"],
  ["母音", "ぼいん"],
  ["子音", "しいん"],
  ["濁音", "だくおん"],
  ["半濁音", "はんだくおん"],
  ["拗音", "ようおん"],
  ["促音", "そくおん"],
  ["長音", "ちょうおん"],
  ["小", "ちい"],
  ["音", "おと"],
  ["行", "ぎょう"],
  ["同", "おな"],
  ["二", "に"],
  ["二回", "にかい"],
  ["回", "かい"],
  ["次", "つぎ"],
  ["前", "まえ"],
  ["右下", "みぎした"],
  ["左上", "ひだりうえ"],
  ["画面", "がめん"],
  ["設定", "せってい"],
  ["選", "えら"],
  ["押", "お"],
  ["打", "う"],
  ["書", "か"],
  ["見", "み"],
  ["出", "で"],
  ["言葉", "ことば"],
  ["名前", "なまえ"],
  ["会社", "かいしゃ"],
  ["仕事", "しごと"],
  ["学生", "がくせい"],
  ["本", "ほん"],
  ["電車", "でんしゃ"],
  ["乗", "の"],
  ["買", "か"],
  ["物", "もの"],
  ["新", "あたら"],
  ["料理", "りょうり"],
  ["美味", "おい"],
  ["私", "わたし"],
  ["昨日", "きのう"],
  ["空白", "くうはく"],
  ["半角", "はんかく"],
  ["全角", "ぜんかく"],
  ["先生", "せんせい"],
  ["一回", "いっかい"],
  ["字", "じ"],
  ["言", "い"],
  ["少", "すこ"],
  ["方", "かた"],
  ["入", "い"],
  ["使", "つか"],
  ["外", "そと"],
  ["国", "くに"],
  ["上", "うえ"],
  ["文", "ぶん"],
  ["下", "した"],
  ["英語", "えいご"],
  ["英字", "えいじ"],
  ["大丈夫", "だいじょうぶ"],
  ["切", "き"],
  ["自分", "じぶん"],
  ["語", "ご"],
  ["右", "みぎ"],
  ["左", "ひだり"],
  ["何", "なに"],
  ["音", "おと"],
  ["会社", "かいしゃ"],
  ["話", "はなし"],
  ["書", "か"],
  ["手", "て"],
  ["毎日", "まいにち"],
  ["時々", "ときどき"],
  ["報告", "ほうこく"],
  ["合", "あ"],
  ["文字目", "もじめ"],
  ["入力方法", "にゅうりょくほうほう"],
  ["方法", "ほうほう"],
  ["無", "な"],
  ["図", "ず"],
  ["止", "と"],
  ["正", "ただ"],
  ["大切", "たいせつ"],
  ["手", "て"],
  ["修了証", "しゅうりょうしょう"],
  ["全部", "ぜんぶ"],
];

/**
 * ことばの意味（【日本語】English）。
 * N5を こえる語だけを 置く。読めても 意味が 分からない語で 止まらないため。
 */
export const GLOSSARY = [
  ["母音", "vowel (a i u e o)"],
  ["子音", "consonant (k s t n h m y r w)"],
  ["濁音", "voiced sound — two dots"],
  ["半濁音", "p-sound — small circle"],
  ["拗音", "small ya yu yo"],
  ["促音", "small tsu — double consonant"],
  ["長音", "long sound — the bar"],
  ["変換", "convert (kana to kanji)"],
  ["空白", "space (the space key)"],
  ["設定", "settings"],
  ["修了証", "certificate"],
];

/**
 * 画面の 文（タイトル画面・マニュアル）。
 *
 * ここに 置くのは、**読み辞書の 検査を 通すため**である。HTML に 直接 書くと、
 * その文だけ 覆いの 検査（tests/romaji_tool.test.ts）の 外に こぼれる。
 */
export const SCREEN_TEXT = {
  titleWhy:
    "日本の 会社では、しごとの 話を キーボードで 書きます。チャットも、報告も、メールも ぜんぶです。きょうから、日本語を 打てる 手に なりましょう。",
  goal: "ぜんぶ おわると、修了証が もらえます。",
  goalDone: "修了証が もらえます！ さいごの ページで 名前を 書いて ください。",
  // 数は 書かない（レッスンは あとから 増える。docs/constraints.md「数を宣言しない」）
  titleLead:
    "キーボードで 日本語を 打つ れんしゅうです。あいうえおから 漢字変換まで、じゅんばんに すすみます。",
  checkQuestion: "はじめに キーボードを ためします。下の ますに 「a」を 打って ください。",
  checkOk: "ひらがなが 出ました。じゅんび OK です！ はじめましょう。",
  checkLatin: "まだ 英語の ままです。「a」が 「あ」に なりません。じゅんびの しかたを 見ましょう。",
  checkWait: "「a」を 打つと、ここに こたえが 出ます。",
  manualTitle: "キーボードの じゅんび",
  manualLead:
    "みなさんの キーボードは 英字（US）です。キーは 英語の ままで 大丈夫です。パソコンに 日本語入力を 入れて、英語と 日本語を 切りかえる だけです。",
  manualNote: "自分の パソコンを えらんで ください。",
};

/**
 * 画面に 出る フィードバックの 文。
 *
 * ここに 集めるのは **禁止語の 検査を かけるため**である（絶対規律1）。
 * app.js に 直接 書くと、その文だけ 検査の 外に こぼれる——lint:content は
 * content/ の JSON しか 見ないし、app.js は 読み込むと DOM を さわるので
 * テストから import できない。`{...}` は app.js が 入れかえる。
 */
export const MESSAGES = {
  correct: "せいかい！ よく できました 🎉",
  /** ローマ字が そのまま 残っている（＝日本語入力に なっていない）。 */
  imeOff: "キーボードが 日本語に なって いますか？ 画面の はしの 「A」を 「あ」に します。",
  /** 日本語でも 英語でも ない 文字が 出ている（クメール語の キーボードなど）。 */
  otherScript: "いまは 日本語では ない 文字が 出て います。キーボードを 「あ」に して ください。",
  /** 漢字の 課で、読みだけ 合っている。 */
  kanaOnly: "かなは 合って います！ 空白の キーを 押して、漢字に します。",
  /** 漢字の 課で、べつの 漢字に なった。 */
  otherKanji:
    "よみは 合って います！ 漢字が ちがうみたい。もう一回 空白の キーを 押して、同じ 漢字を えらびましょう。",
  partial: "{n}文字目まで 合って います。つづきを もう一回。",
  retry: "おしい！ ヒントを 見て、もう一回 やって みましょう。",
  hintShown: "ヒントを 出しますね。見ながら ゆっくり 打って みましょう。",
  nextSound: "つぎは 「{kana}」です。{keys} と 打ちます。",
  lastItem: "これが さいごの もんだいです。ヒントを 見て、もう一回。",
  chapterClear: "{chapter}、ぜんぶ できました！",
};

/** 章（もくじの まとまり）。 */
export const CHAPTERS = [
  { id: "start", title: "はじめかた", icon: "🚪" },
  { id: "basic", title: "きほんの 音", icon: "🌱" },
  { id: "change", title: "かわる 音", icon: "✨" },
  { id: "words", title: "ことばで れんしゅう", icon: "🏁" },
];

/**
 * レッスン。
 *
 * - `blocks` … 説明（種類つき。app.js が組み立てる）
 * - `items`  … 打つ問題。`show` を 見て 打ち、`reading` の かなに なれば せいかい。
 *              `romaji` は ヒント（キーの 並び）で、テストが 読みと 照合する。
 *              `en` は その ことばの 意味（英語）。
 */
export const LESSONS = [
  {
    id: "start",
    chapter: "start",
    title: "はじめかた",
    lead: "キーボードで 日本語を 書く じゅんびを します。",
    blocks: [
      {
        kind: "text",
        text: "日本語の ひらがなは、アルファベットで 打ちます。これを ローマ字入力と 言います。キーは 英語の ままで 大丈夫です。",
      },
      {
        kind: "keys",
        items: [
          { kana: "あ", keys: ["a"] },
          { kana: "か", keys: ["k", "a"] },
        ],
      },
      {
        kind: "note",
        text: "はじめに、キーボードを 日本語に します。画面の はしに 「A」か 「あ」が 出ます。「あ」に なれば じゅんび OK です。",
      },
      {
        kind: "steps",
        title: "キーボードを 日本語に する",
        items: [
          "Windows: 画面の 右下の 「A」を クリックして 「あ」に します。（Alt キーと ` キーでも かわります）",
          "Mac: 画面の 右上の 「A」を クリックして 「あ」を 選びます。（Control キーと space キーでも かわります）",
          "スマホ: 設定の キーボードで 日本語（ローマ字）を たします。",
        ],
      },
      {
        kind: "note",
        tone: "care",
        text: "画面に 「A」も 「あ」も 無い ときは、パソコンに 日本語入力が 入って いません。下の ボタンから じゅんびの しかたを 見て ください。図で 見られます。",
        action: "manual",
      },
      {
        kind: "text",
        text: "じゅんびが できたか、ここで たしかめましょう。a を 1回 押すだけです。",
      },
    ],
    items: [{ show: "あ", reading: "あ", romaji: "a" }],
  },

  {
    id: "aiueo",
    chapter: "basic",
    title: "あいうえお",
    lead: "すべての 音の もとに なる 5つです。",
    blocks: [
      { kind: "text", text: "この 5つを 母音と 言います。ここから すべての 音が できます。" },
      {
        kind: "keys",
        items: [
          { kana: "あ", keys: ["a"] },
          { kana: "い", keys: ["i"] },
          { kana: "う", keys: ["u"] },
          { kana: "え", keys: ["e"] },
          { kana: "お", keys: ["o"] },
        ],
      },
    ],
    items: [
      { show: "あいうえお", reading: "あいうえお", romaji: "aiueo" },
      { show: "あい", reading: "あい", romaji: "ai", en: "love" },
      { show: "うえ", reading: "うえ", romaji: "ue", en: "up, above" },
    ],
  },

  {
    id: "ka",
    chapter: "basic",
    title: "かきくけこ",
    lead: "子音 k と 母音を あわせます。",
    blocks: [
      { kind: "text", text: "k の あとに a i u e o を 打ちます。" },
      {
        kind: "keys",
        items: [
          { kana: "か", keys: ["k", "a"] },
          { kana: "き", keys: ["k", "i"] },
          { kana: "く", keys: ["k", "u"] },
          { kana: "け", keys: ["k", "e"] },
          { kana: "こ", keys: ["k", "o"] },
        ],
      },
    ],
    items: [
      { show: "かきくけこ", reading: "かきくけこ", romaji: "kakikukeko" },
      { show: "かお", reading: "かお", romaji: "kao", en: "face" },
      { show: "いけ", reading: "いけ", romaji: "ike", en: "pond" },
    ],
  },

  {
    id: "sa",
    chapter: "basic",
    title: "さしすせそ",
    lead: "「し」だけ 少し ちがいます。",
    blocks: [
      { kind: "text", text: "s と 母音を あわせます。「し」は si でも shi でも 打てます。" },
      {
        kind: "keys",
        items: [
          { kana: "さ", keys: ["s", "a"] },
          { kana: "し", keys: ["s", "i"], also: "shi" },
          { kana: "す", keys: ["s", "u"] },
          { kana: "せ", keys: ["s", "e"] },
          { kana: "そ", keys: ["s", "o"] },
        ],
      },
    ],
    items: [
      { show: "さしすせそ", reading: "さしすせそ", romaji: "sasisuseso" },
      { show: "すし", reading: "すし", romaji: "susi", en: "sushi" },
      { show: "あさ", reading: "あさ", romaji: "asa", en: "morning" },
    ],
  },

  {
    id: "ta",
    chapter: "basic",
    title: "たちつてと",
    lead: "「ち」と 「つ」も 2つの 打ち方が あります。",
    blocks: [
      {
        kind: "text",
        text: "t と 母音を あわせます。「ち」は ti でも chi でも、「つ」は tu でも tsu でも 打てます。",
      },
      {
        kind: "keys",
        items: [
          { kana: "た", keys: ["t", "a"] },
          { kana: "ち", keys: ["t", "i"], also: "chi" },
          { kana: "つ", keys: ["t", "u"], also: "tsu" },
          { kana: "て", keys: ["t", "e"] },
          { kana: "と", keys: ["t", "o"] },
        ],
      },
    ],
    items: [
      { show: "たちつてと", reading: "たちつてと", romaji: "tatituteto" },
      { show: "くつ", reading: "くつ", romaji: "kutu", en: "shoes" },
      { show: "とけい", reading: "とけい", romaji: "tokei", en: "clock, watch" },
    ],
  },

  {
    id: "na",
    chapter: "basic",
    title: "なにぬねの",
    lead: "n と 母音です。",
    blocks: [
      {
        kind: "keys",
        items: [
          { kana: "な", keys: ["n", "a"] },
          { kana: "に", keys: ["n", "i"] },
          { kana: "ぬ", keys: ["n", "u"] },
          { kana: "ね", keys: ["n", "e"] },
          { kana: "の", keys: ["n", "o"] },
        ],
      },
    ],
    items: [
      { show: "なにぬねの", reading: "なにぬねの", romaji: "naninuneno" },
      { show: "なつ", reading: "なつ", romaji: "natu", en: "summer" },
      { show: "いぬ", reading: "いぬ", romaji: "inu", en: "dog" },
    ],
  },

  {
    id: "ha",
    chapter: "basic",
    title: "はひふへほ",
    lead: "「ふ」は hu でも fu でも 打てます。",
    blocks: [
      {
        kind: "keys",
        items: [
          { kana: "は", keys: ["h", "a"] },
          { kana: "ひ", keys: ["h", "i"] },
          { kana: "ふ", keys: ["h", "u"], also: "fu" },
          { kana: "へ", keys: ["h", "e"] },
          { kana: "ほ", keys: ["h", "o"] },
        ],
      },
    ],
    items: [
      { show: "はひふへほ", reading: "はひふへほ", romaji: "hahihuheho" },
      { show: "はな", reading: "はな", romaji: "hana", en: "flower" },
      { show: "ふね", reading: "ふね", romaji: "hune", en: "ship" },
    ],
  },

  {
    id: "ma",
    chapter: "basic",
    title: "まみむめも",
    lead: "m と 母音です。",
    blocks: [
      {
        kind: "keys",
        items: [
          { kana: "ま", keys: ["m", "a"] },
          { kana: "み", keys: ["m", "i"] },
          { kana: "む", keys: ["m", "u"] },
          { kana: "め", keys: ["m", "e"] },
          { kana: "も", keys: ["m", "o"] },
        ],
      },
    ],
    items: [
      { show: "まみむめも", reading: "まみむめも", romaji: "mamimumemo" },
      { show: "あめ", reading: "あめ", romaji: "ame", en: "rain" },
      { show: "みみ", reading: "みみ", romaji: "mimi", en: "ear" },
    ],
  },

  {
    id: "ya",
    chapter: "basic",
    title: "やゆよ",
    lead: "この 行は 3つだけです。",
    blocks: [
      {
        kind: "keys",
        items: [
          { kana: "や", keys: ["y", "a"] },
          { kana: "ゆ", keys: ["y", "u"] },
          { kana: "よ", keys: ["y", "o"] },
        ],
      },
    ],
    items: [
      { show: "やゆよ", reading: "やゆよ", romaji: "yayuyo" },
      { show: "やま", reading: "やま", romaji: "yama", en: "mountain" },
      { show: "ゆき", reading: "ゆき", romaji: "yuki", en: "snow" },
    ],
  },

  {
    id: "ra",
    chapter: "basic",
    title: "らりるれろ",
    lead: "r と 母音です。",
    blocks: [
      {
        kind: "keys",
        items: [
          { kana: "ら", keys: ["r", "a"] },
          { kana: "り", keys: ["r", "i"] },
          { kana: "る", keys: ["r", "u"] },
          { kana: "れ", keys: ["r", "e"] },
          { kana: "ろ", keys: ["r", "o"] },
        ],
      },
    ],
    items: [
      { show: "らりるれろ", reading: "らりるれろ", romaji: "rarirurero" },
      { show: "とり", reading: "とり", romaji: "tori", en: "bird" },
      { show: "さくら", reading: "さくら", romaji: "sakura", en: "cherry blossom" },
    ],
  },

  {
    id: "wan",
    chapter: "basic",
    title: "わ・を・ん",
    lead: "「ん」は n を 二回 打つと たしかです。",
    blocks: [
      {
        kind: "keys",
        items: [
          { kana: "わ", keys: ["w", "a"] },
          { kana: "を", keys: ["w", "o"] },
          { kana: "ん", keys: ["n", "n"] },
        ],
      },
      {
        kind: "note",
        text: "「ん」は n 1つでも 出ますが、次の 文字と くっついて かわる ことが あります。いつも nn と 打つと、まちがいが ありません。",
      },
    ],
    items: [
      { show: "わをん", reading: "わをん", romaji: "wawonn" },
      { show: "ほん", reading: "ほん", romaji: "honn", en: "book" },
      { show: "にほん", reading: "にほん", romaji: "nihonn", en: "Japan" },
      { show: "わたし", reading: "わたし", romaji: "watasi", en: "I, me" },
    ],
  },

  {
    id: "fukushu1",
    chapter: "basic",
    title: "ここまでの ことば",
    lead: "ならった 音だけで 書ける ことばです。",
    blocks: [
      {
        kind: "text",
        text: "50の 音を ぜんぶ ならいました。ここで 一回 止まって、ことばで 打って みましょう。",
      },
    ],
    items: [
      { show: "ねこ", reading: "ねこ", romaji: "neko", en: "cat" },
      { show: "ふゆ", reading: "ふゆ", romaji: "huyu", en: "winter" },
      { show: "やすみ", reading: "やすみ", romaji: "yasumi", en: "day off, rest" },
      { show: "なまえ", reading: "なまえ", romaji: "namae", en: "name" },
      { show: "てんき", reading: "てんき", romaji: "tennki", en: "weather" },
    ],
  },

  {
    id: "dakuon",
    chapter: "change",
    title: "てんてんの 音",
    lead: "が ざ だ ば — 濁音です。",
    blocks: [
      {
        kind: "text",
        text: "か行に てんてんが つくと g、さ行は z、た行は d、は行は b に かわります。",
      },
      {
        kind: "keys",
        items: [
          { kana: "が", keys: ["g", "a"] },
          { kana: "ざ", keys: ["z", "a"] },
          { kana: "じ", keys: ["z", "i"], also: "ji" },
          { kana: "だ", keys: ["d", "a"] },
          { kana: "ば", keys: ["b", "a"] },
        ],
      },
    ],
    items: [
      { show: "がぎぐげご", reading: "がぎぐげご", romaji: "gagigugego" },
      { show: "ざじずぜぞ", reading: "ざじずぜぞ", romaji: "zazizuzezo" },
      { show: "だぢづでど", reading: "だぢづでど", romaji: "dadidudedo" },
      { show: "ばびぶべぼ", reading: "ばびぶべぼ", romaji: "babibubebo" },
      { show: "かぞく", reading: "かぞく", romaji: "kazoku", en: "family" },
    ],
  },

  {
    id: "handakuon",
    chapter: "change",
    title: "まるの 音",
    lead: "ぱ ぴ ぷ ぺ ぽ — 半濁音です。",
    blocks: [
      { kind: "text", text: "は行に まるが つくと p に かわります。" },
      {
        kind: "keys",
        items: [
          { kana: "ぱ", keys: ["p", "a"] },
          { kana: "ぴ", keys: ["p", "i"] },
          { kana: "ぷ", keys: ["p", "u"] },
          { kana: "ぺ", keys: ["p", "e"] },
          { kana: "ぽ", keys: ["p", "o"] },
        ],
      },
    ],
    items: [
      { show: "ぱぴぷぺぽ", reading: "ぱぴぷぺぽ", romaji: "papipupepo" },
      { show: "えんぴつ", reading: "えんぴつ", romaji: "ennpitu", en: "pencil" },
    ],
  },

  {
    id: "youon",
    chapter: "change",
    title: "小さい ゃ ゅ ょ",
    lead: "きゃ・しゅ・ちょ — 拗音です。",
    blocks: [
      {
        kind: "text",
        text: "2つの 音が 1つに なります。あいだに y を 入れるのが きほんです。",
      },
      {
        kind: "keys",
        items: [
          { kana: "きゃ", keys: ["k", "y", "a"] },
          { kana: "しゅ", keys: ["s", "y", "u"], also: "shu" },
          { kana: "ちょ", keys: ["t", "y", "o"], also: "cho" },
          { kana: "じゃ", keys: ["z", "y", "a"], also: "ja" },
        ],
      },
    ],
    items: [
      { show: "きゃきゅきょ", reading: "きゃきゅきょ", romaji: "kyakyukyo" },
      { show: "しゃしゅしょ", reading: "しゃしゅしょ", romaji: "syasyusyo" },
      { show: "ちゃちゅちょ", reading: "ちゃちゅちょ", romaji: "tyatyutyo" },
      { show: "じゃじゅじょ", reading: "じゃじゅじょ", romaji: "zyazyuzyo" },
      { show: "りょこう", reading: "りょこう", romaji: "ryokou", en: "trip, travel" },
    ],
  },

  {
    id: "sokuon",
    chapter: "change",
    title: "小さい っ",
    lead: "つまる 音（促音）です。",
    blocks: [
      {
        kind: "text",
        text: "小さい 「っ」は、次の 子音を 二回 打ちます。「がっこう」なら g a k k o u です。",
      },
      {
        kind: "keys",
        items: [
          { kana: "きって", keys: ["k", "i", "t", "t", "e"] },
          { kana: "きっぷ", keys: ["k", "i", "p", "p", "u"] },
        ],
      },
    ],
    items: [
      { show: "きって", reading: "きって", romaji: "kitte", en: "stamp" },
      { show: "がっこう", reading: "がっこう", romaji: "gakkou", en: "school" },
      { show: "ざっし", reading: "ざっし", romaji: "zassi", en: "magazine" },
      { show: "きっぷ", reading: "きっぷ", romaji: "kippu", en: "ticket" },
      { show: "いっしょ", reading: "いっしょ", romaji: "issyo", en: "together" },
    ],
  },

  {
    id: "chouon",
    chapter: "change",
    title: "のばす 音 ー",
    lead: "カタカナで よく 出る 長音です。",
    blocks: [
      {
        kind: "text",
        text: "音を のばす 「ー」は、0 の 右に ある - の キーを 押します。英字キーボードにも あります。",
      },
      {
        kind: "keys",
        items: [
          { kana: "らーめん", keys: ["r", "a", "-", "m", "e", "n", "n"] },
          { kana: "こーひー", keys: ["k", "o", "-", "h", "i", "-"] },
        ],
      },
      {
        kind: "note",
        text: "ひらがなの ときは 「ー」を 使いません。「とうきょう」は o と u で のばします。",
      },
    ],
    items: [
      { show: "ラーメン", reading: "らーめん", romaji: "ra-menn", en: "ramen" },
      { show: "ノート", reading: "のーと", romaji: "no-to", en: "notebook" },
      { show: "タクシー", reading: "たくしー", romaji: "takusi-", en: "taxi" },
      { show: "とうきょう", reading: "とうきょう", romaji: "toukyou", en: "Tokyo" },
    ],
  },

  {
    id: "small",
    chapter: "change",
    title: "小さい 字・カタカナの 音",
    lead: "ふぁ・てぃ など、外の 国の ことばの 音です。",
    blocks: [
      {
        kind: "text",
        text: "小さい 字は 前に l か x を つけます。ふぁ は f、てぃ は thi で 打てます。",
      },
      {
        kind: "keys",
        items: [
          { kana: "ぁ", keys: ["l", "a"], also: "xa" },
          { kana: "ふぁ", keys: ["f", "a"] },
          { kana: "てぃ", keys: ["t", "h", "i"] },
          { kana: "でぃ", keys: ["d", "h", "i"] },
        ],
      },
    ],
    items: [
      { show: "ウェブ", reading: "うぇぶ", romaji: "webu", en: "web" },
      { show: "ファイル", reading: "ふぁいる", romaji: "fairu", en: "file" },
      { show: "パーティー", reading: "ぱーてぃー", romaji: "pa-thi-", en: "party" },
      { show: "ディスク", reading: "でぃすく", romaji: "dhisuku", en: "disk" },
    ],
  },

  {
    id: "tango",
    chapter: "words",
    title: "ことばで れんしゅう",
    lead: "しごとで よく 使う ことばです。",
    blocks: [
      {
        kind: "text",
        text: "ここまでの 打ち方を 全部 使います。ゆっくりで だいじょうぶです。",
      },
    ],
    items: [
      {
        show: "おはようございます",
        reading: "おはようございます",
        romaji: "ohayougozaimasu",
        en: "good morning",
      },
      {
        show: "ありがとうございます",
        reading: "ありがとうございます",
        romaji: "arigatougozaimasu",
        en: "thank you",
      },
      {
        show: "しつれいします",
        reading: "しつれいします",
        romaji: "situreisimasu",
        en: "excuse me",
      },
      { show: "かいしゃ", reading: "かいしゃ", romaji: "kaisya", en: "company" },
      { show: "コンピューター", reading: "こんぴゅーたー", romaji: "konnpyu-ta-", en: "computer" },
    ],
  },

  {
    id: "kanji",
    chapter: "words",
    title: "漢字に する",
    lead: "空白の キーで 変換します。",
    blocks: [
      {
        kind: "text",
        text: "ひらがなを 打ってから 空白の キー（スペース）を 押すと、漢字に かわります。出したい 漢字を 選んで、Enter で きめます。",
      },
      {
        kind: "steps",
        title: "変換の じゅんばん",
        items: [
          "ローマ字で 打つ（watasi → わたし）",
          "空白の キーを 押す（わたし → 私）",
          "Enter で きめる",
        ],
      },
      {
        kind: "note",
        text: "上に 出て いる 文と 同じに なれば OK です。ちがう 漢字が 出たら、もう一回 空白の キーを 押して 選びます。",
      },
    ],
    items: [
      {
        show: "私は学生です",
        reading: "わたしはがくせいです",
        romaji: "watasihagakuseidesu",
        en: "I am a student.",
      },
      {
        show: "これは本です",
        reading: "これはほんです",
        romaji: "korehahonndesu",
        en: "This is a book.",
      },
      {
        show: "電車に乗ります",
        reading: "でんしゃにのります",
        romaji: "densyaninorimasu",
        en: "I take the train.",
      },
      {
        show: "会社の仕事",
        reading: "かいしゃのしごと",
        romaji: "kaisyanosigoto",
        en: "the work of the company",
      },
      {
        show: "新しい名前",
        reading: "あたらしいなまえ",
        romaji: "atarasiinamae",
        en: "a new name",
      },
    ],
  },

  {
    id: "owari",
    chapter: "words",
    title: "おわりに",
    lead: "ぜんぶ おわりました。よく がんばりました。",
    blocks: [
      {
        kind: "text",
        text: "これで キーボードで 日本語を 書けます。仕事の 言葉も、同じ 打ち方で 書けます。",
      },
      {
        kind: "note",
        text: "はやく 打つ より、正しく 打つ ほうが 大切です。まいにち 少しずつ 打つと、手が おぼえます。",
      },
    ],
    items: [],
  },
];
