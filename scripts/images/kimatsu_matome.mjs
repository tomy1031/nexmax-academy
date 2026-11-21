/**
 * 期末テスト対策の まとめページ（public/tools/hourensou/kimatsu_matome.html）の 絵の 台帳を 作る。
 *
 *   node scripts/images/kimatsu_matome.mjs   → scripts/images/kimatsu_matome.json を 書く
 *
 * 2026-11-20 tomy さんの 依頼「絵のテイストは元のものを生かしてください」。
 * 旧アプリ（tomy1031/nextmake_onbording の summary/assets/img/memo/）の「まなびの島」の 絵柄
 *（窓の 外に 海と 小さな 島が 見える、木の 家具の あたたかい オフィス・頭の 大きい まるい 人物）に そろえる。
 * 旧アプリの 絵は 字に ふりがなが 無かった ので、新しく 描く 絵には ふりがなを 付ける（必ず守るルール2）。
 *
 * 出力は 横長 1536x1024。ページでは 切らずに 絵の 形（3:2）の まま 見せる（16:9 に 切ると 上下の 札と ふりがなが 欠けた）。
 * 変換は cwebp -q 74 -resize 1200 0（1200x800）。
 */
import fs from "node:fs";

const style = [
  "Cozy picture-book anime illustration in EXACTLY the same style as the attached reference pictures:",
  "soft warm hand-painted colouring with a gentle paper grain, honey and cream wood tones, fresh leaf greens and clear sky blues, soft morning sunlight,",
  "cute rounded characters with big heads and big round shining eyes (about three heads tall), simple friendly faces, clean dark-brown outlines.",
  "The place is the same warm wooden island office as in the references: light wooden desks and shelves, many potted green plants, mugs, laptops, notebooks,",
  "and big windows showing blue sea, white clouds and small green islands with palm trees.",
  "The office members keep the look of the references:",
  "THE NEW ENGINEER is a young man with messy dark-brown hair, a green zip hoodie over a white T-shirt, beige trousers and a blue ID lanyard;",
  "THE BOSS is a man with neat dark hair, black rectangular glasses and a navy blue cardigan over a light shirt;",
  "THE COLLEAGUE is a young woman with shoulder-length brown hair and a light blue sweater;",
  "THE SENIOR is a woman with her hair in a bun and a mustard-yellow cardigan.",
  "Only the people named in the scene appear.",
  "This is a TEACHING picture for students who can hardly read Japanese: the message must be clear from the picture alone.",
  "Expressions are clear and a little exaggerated, like a cute comedy manga: worried people sweat big drops under a question mark,",
  "happy people beam with sparkles, a good example carries a big green circle mark and a bad example a soft red cross mark.",
  "Manga symbols are welcome and carry the message: question marks, exclamation marks, sweat drops, lightbulbs, sparkles, check marks, arrows, motion lines.",
  "COMPOSITION: keep every label, face and important object inside the MIDDLE BAND of the picture.",
  "Leave a calm strip (ceiling, wall, floor or sky) about one tenth of the height at the very top and at the very bottom, because those strips will be cut off.",
].join(" ");

const noText = [
  "Lettering — read this part carefully. The picture contains ONLY the words listed above, and no other writing at all.",
  "Print each Japanese word LARGE and horizontally in a bold rounded gothic Japanese font, with generous space around it —",
  "either on a soft cream wooden label with a rounded border, or inside a white speech balloon whose tail clearly points at the person who says it.",
  "Directly above every kanji, print its reading in small hiragana (furigana), centred over that kanji, clearly separated from it,",
  "at about 45% of the kanji height, so that the kanji and the furigana both stay sharp.",
  "Words written only in hiragana or katakana take no furigana, and Latin letters, numbers and symbols take no furigana either.",
  "The readings in round brackets are for you only — never print the brackets or the reading in the brackets as text.",
  "Spell every character exactly as given. Screens, papers and whiteboards show only soft abstract lines apart from the listed words.",
  "No other letters, numbers, logos or watermarks anywhere in the picture.",
].join(" ");

const negative =
  "Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, horror or a scary dark mood, real grief, violence, watermarks, real company logos or brand marks of any kind (no fruit logo on laptops, no chat-app logos), national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.";

const D = "public/img/hourensou/kimatsu";

/** [id, 何の 絵か, 場面, 焼く ことば] */
const scenes = [
  // ── 会社を 知る ──────────────────────────────────────────
  [
    "kaisha_shirabekata",
    "会社の 調べかた（3つの 手順）",
    "THE NEW ENGINEER sits at a wooden desk with a laptop that shows a simple company website (soft abstract blocks only) and holds a cream research sheet on a clipboard, a big magnifying glass beside him. Across the middle of the picture float three large numbered cream wooden labels from left to right, joined by thick soft arrows, so the order 1 → 2 → 3 is obvious. He looks focused and confident.",
    ["① 質問（しつもん）を 見（み）る", "② ページを 読（よ）む", "③ シートに 書（か）く"],
  ],
  [
    "kaisha_gaiyou",
    "会社の 基本の ことば（会社概要）",
    "A large wooden notice board stands in the office. On it hangs a big cream card titled with the first label, with four rows below it; each row has its label and a small picture: a building, a person in a dark suit, a calendar page, a map pin. THE NEW ENGINEER points at the card with a pen and THE COLLEAGUE takes notes beside him, both smiling.",
    [
      "会社概要（かいしゃがいよう）",
      "会社名（かいしゃめい）",
      "代表取締役社長（だいひょうとりしまりやくしゃちょう）",
      "設立（せつりつ）",
      "本社（ほんしゃ）",
    ],
  ],
  [
    "kaisha_jutaku",
    "受託開発と 自社開発",
    "One wide picture split into two halves by a soft wooden frame line. LEFT half: a friendly customer (a bakery owner in an apron) hands a request paper to THE BOSS and THE NEW ENGINEER, who show him a finished app on a tablet; the label above them. RIGHT half: THE NEW ENGINEER and THE COLLEAGUE stand at a whiteboard under a big glowing lightbulb, inventing their own app shown on a phone with sparkles; the label above them. Under each label a short cream caption.",
    [
      "受託開発（じゅたくかいはつ）",
      "お客（きゃく）さまに 頼（たの）まれて 作（つく）る",
      "自社開発（じしゃかいはつ）",
      "自分（じぶん）たちで 考（かんが）えて 作（つく）る",
    ],
  ],
  [
    "kaisha_mission",
    "MISSIONと VISION",
    "THE BOSS, THE NEW ENGINEER and THE COLLEAGUE stand together on a green grassy path outside the office. Far ahead at the end of the path rises a gentle hill with a bright flag and a rising sun: the label VISION with its caption floats near the flag. At the team's feet stands a wooden signpost with the label MISSION and its caption. THE BOSS points happily toward the flag; the others look up with sparkling eyes.",
    ["VISION", "めざす 未来（みらい）", "MISSION", "会社（かいしゃ）の 使命（しめい）"],
  ],
  [
    "kaisha_mensetsu",
    "社長と 話す ときは「調べた こと＋自分の 考え」",
    "THE NEW ENGINEER sits at a wooden table across from a kind company president (an older man with grey hair in a dark suit, a new person who is NOT the boss) and talks with a bright face. Above the engineer float two large cream labels joined by a big plus sign; the president leans in, delighted, with sparkles. In a small round inset at the left edge, a weaker example: the same engineer gives a one-word answer with a little grey cloud and a red cross mark, and the president looks bored.",
    ["調（しら）べた こと", "＋", "自分（じぶん）の 考（かんが）え", "なぜ？"],
  ],
  // ── 報連相：報告 ──────────────────────────────────────────
  [
    "houkoku_hourensou",
    "報連相の 3つ",
    "Like the first reference picture: THE NEW ENGINEER, THE COLLEAGUE and THE SENIOR sit at a round wooden table, each holding up one big cream card. Above them a large wooden sign with a little green sprout carries the title. Soft arrows link the title to the three cards. Under each card, a small Latin word.",
    [
      "報連相（ほうれんそう）",
      "報告（ほうこく）",
      "Report",
      "連絡（れんらく）",
      "Contact",
      "相談（そうだん）",
      "Consult",
    ],
  ],
  [
    "houkoku_kata",
    "報告の 型（用件 → 結論 → 事実 → お願い）",
    "THE NEW ENGINEER stands politely beside THE BOSS's desk. First, a speech balloon from the engineer asks the opening question. Then, across the middle of the picture, four numbered cream cards in a row joined by arrows show the order. THE BOSS looks up from his laptop with a calm smile, pen and notebook ready.",
    [
      "今（いま）、お時間（じかん） よろしいですか",
      "① 用件（ようけん）",
      "② 結論（けつろん）",
      "③ 事実（じじつ）",
      "④ お願（ねが）い",
    ],
  ],
  [
    "houkoku_pattern",
    "報告の 3つの パターンと「悪い ニュースほど 早く」",
    "One wide picture made of three equal panels separated by thin white gaps, THE NEW ENGINEER reporting to THE BOSS in each. LEFT panel: he shows a finished document with a big green check mark. MIDDLE panel: his laptop shows a red error screen with a little bug picture, he points at it while THE BOSS leans in. RIGHT panel: a calendar and a clock, he bows a little with a sweat drop. A long cream banner across the top of all three panels carries the slogan.",
    ["悪（わる）い ニュースほど 早（はや）く", "完了（かんりょう）", "トラブル", "遅（おく）れ"],
  ],
  [
    "houkoku_kaikyuu",
    "会社の 階級（ポジション）",
    "A gentle wooden staircase with EXACTLY SEVEN steps rises from the lower left to the upper right in the office. EXACTLY SEVEN small cute people stand on it, ONE PERSON ON EACH STEP and nobody else anywhere in the picture (no one on the floor). Each person has ONE cream speech-balloon label whose tail points clearly at that person's head, placed right above that person, so it is obvious which label belongs to whom. From the top step down: a president in a dark suit, a director in a brown suit, a general manager, a deputy general manager, a manager with glasses, a chief, and THE NEW ENGINEER on the lowest step waving happily. Each person bows slightly toward the one above.",
    [
      "社長（しゃちょう）",
      "取締役（とりしまりやく）",
      "部長（ぶちょう）",
      "次長（じちょう）",
      "課長（かちょう）",
      "係長（かかりちょう）",
      "社員（しゃいん）",
    ],
  ],
  [
    "houkoku_bug",
    "バグ報告の 4つ",
    "THE NEW ENGINEER works as a tester at his laptop; the screen shows a simple web form whose button is broken, with a cartoon bug and a red exclamation mark. Beside the laptop a large cream report card lists four questions with a check box each. A title label sits above the card. He writes on the card with a determined face.",
    [
      "バグ報告（ほうこく）",
      "どの 画面（がめん）？",
      "何（なに）を した？",
      "どう なった？",
      "本当（ほんとう）は？",
    ],
  ],
  [
    "houkoku_chourei",
    "朝礼の 報告（4つ）",
    "Morning light. THE BOSS, THE COLLEAGUE, THE SENIOR and THE NEW ENGINEER stand in a small circle by a whiteboard; a wall clock shows nine o'clock. THE NEW ENGINEER is speaking with a clear voice. On the whiteboard, four cream rows with small pictures (yesterday's finished screen, a progress bar at 70 percent, today's task card, a small warning triangle). A title label above the whiteboard.",
    [
      "朝礼（ちょうれい）",
      "きのう した こと",
      "進捗（しんちょく） 70%",
      "きょう する こと",
      "問題（もんだい）",
    ],
  ],
  [
    "houkoku_sugu",
    "すぐに 報告する 問題",
    "THE NEW ENGINEER hurries toward THE BOSS's desk with motion lines and a big sweat drop, not waiting for tomorrow's morning meeting. Around him float four round cream badges with a small picture each: a server with a red light, a coin with a double mark, a trash bin full of files, a broken padlock. A large label above him. THE BOSS stands up, serious but calm, ready to help.",
    [
      "すぐに 報告（ほうこく）！",
      "本番環境（ほんばんかんきょう）",
      "お金（かね）",
      "データ削除（さくじょ）",
      "セキュリティ",
    ],
  ],
  [
    "houkoku_kiku",
    "報告を 聞く（リスニングの 5つの 場面）",
    "THE NEW ENGINEER wears big headphones at his desk and listens carefully, writing notes in a notebook, with a small lightbulb of understanding. Around him, in a gentle arc, float five round cream badges, each with its label and one small clear picture: a finished screen with a green check mark, a clock and a calendar, a laptop with a red error, a magnifying glass over two small boxes being compared, and a small team standing in a circle in the morning. A title label above him.",
    [
      "報告（ほうこく）を 聞（き）く",
      "作業完了（さぎょうかんりょう）",
      "遅（おく）れ",
      "トラブル",
      "技術調査（ぎじゅつちょうさ）",
      "朝礼（ちょうれい）",
    ],
  ],
  // ── 報連相：連絡 ──────────────────────────────────────────
  [
    "renraku_jijitsu",
    "連絡は 気持ちでは なく 事実",
    "One wide picture split into two halves. LEFT half (red cross mark): THE NEW ENGINEER panics with swirling eyes and big sweat drops, a speech balloon of feelings; THE BOSS is confused under a big question mark. RIGHT half (green circle mark): THE NEW ENGINEER calmly shows his laptop with a red error window and says the fact; THE BOSS nods with a lightbulb and starts to act. A cream label at the top of each half.",
    [
      "気持（きも）ち",
      "すごく 焦（あせ）って います！",
      "事実（じじつ）",
      "エラーが 出（で）て います",
    ],
  ],
  [
    "renraku_case",
    "連絡する 4つの ケース",
    "A 2 by 2 grid of four equal panels separated by thin white gaps, each with a cream label at the top. Panel 1: a calendar where a meeting card moves to another day with an arrow. Panel 2: a server rack with a big round update arrow and sparkles. Panel 3: a laptop with a red error and a cartoon bug. Panel 4: THE COLLEAGUE on a station platform looking at a delayed train and a clock, sending a message from her phone.",
    [
      "スケジュールの 変更（へんこう）",
      "環境（かんきょう）の アップデート",
      "バグ発生（はっせい）",
      "遅刻（ちこく）・欠席（けっせき）・早退（そうたい）",
    ],
  ],
  [
    "renraku_bun",
    "連絡文の 4つと 数字",
    "A big laptop screen fills the centre and shows one short chat message as soft lines. Four cream labels sit around the screen with thin arrows pointing into the message. Below the laptop, a small comparison: a grey speech balloon with a red cross mark and a bright speech balloon with a green circle mark; THE COLLEAGUE reads the good one and smiles.",
    ["いつ", "何（なに）が", "どう なる", "お願（ねが）い", "もうすぐ", "あと 15分（ふん）"],
  ],
  [
    "renraku_mention",
    "メンションと スタンプ",
    "A large tablet screen shows a team chat. One message starts with a highlighted name tag; only THE COLLEAGUE's phone on the right lights up and rings, and she looks up. Two more tag chips float at the side. Under the message, a row of three round reaction stamps (eyes, thumbs up, folded hands), and a small label beside the stamps. THE NEW ENGINEER, at the left, types happily.",
    ["@田中（たなか）さん", "@here", "@channel", "見（み）ました"],
  ],
  [
    "renraku_kakko",
    "【 】と 箇条書き",
    "A big laptop screen shows one email: a bold subject line at the top and, below it, three short bracket headings each followed by two short bullet lines drawn as soft lines. THE COLLEAGUE reads it easily with sparkles and a relaxed smile, coffee in hand; beside her a tiny inset shows a long messy wall of grey lines with a sweat drop for contrast.",
    [
      "【重要（じゅうよう）】ログイン画面（がめん）の バグ",
      "【問題（もんだい）】",
      "【原因（げんいん）】",
      "【対策（たいさく）】",
    ],
  ],
  [
    "renraku_denwa",
    "電話と メール・チャット",
    "One wide picture split into two halves. LEFT half: THE NEW ENGINEER talks on a phone in a hurry while THE BOSS answers his phone at once with a big exclamation mark and a speech balloon; a server with a red light behind. RIGHT half: THE COLLEAGUE sends a chat message; later THE SENIOR reads it calmly at her desk, and a neat stack of saved message cards with a check mark shows that it stays. A cream label at the top of each half, and a caption under each.",
    [
      "電話（でんわ）",
      "すぐに 返事（へんじ）",
      "メール・チャット",
      "記録（きろく）が 残（のこ）る",
    ],
  ],
  // ── 報連相：相談 ──────────────────────────────────────────
  [
    "soudan_hitori",
    "一人で 悩まない",
    "One wide picture split into two halves. LEFT half (red cross mark): late evening, THE NEW ENGINEER sits alone clutching his head in front of an error screen, a small grey rain cloud above him, a clock showing many hours passed. RIGHT half (green circle mark): bright daylight, THE NEW ENGINEER and THE SENIOR look at the laptop together, a big glowing lightbulb above them, both smiling. A cream label at the top of each half.",
    ["一人（ひとり）で 悩（なや）む", "チームで 考（かんが）える"],
  ],
  [
    "soudan_bamen",
    "ITで 相談する 場面",
    "A 2 by 2 grid of four equal panels separated by thin white gaps, THE NEW ENGINEER puzzled in each with a question mark, each panel with a cream label at the top. Panel 1: a laptop showing a big red ERROR. Panel 2: two closed boxes marked A and B on the desk, he cannot choose. Panel 3: a laptop showing two crossing branch lines and the word CONFLICT. Panel 4: a laptop with stacked container blocks and a tangled cable.",
    [
      "エラーの 原因（げんいん）",
      "ライブラリ A？ B？",
      "コンフリクト",
      "環境構築（かんきょうこうちく）",
    ],
  ],
  [
    "soudan_30pun",
    "30分ルール",
    "Three steps from left to right joined by big soft arrows. Step 1: THE NEW ENGINEER searches on his laptop with a magnifying glass and a book. Step 2: a big friendly wall clock with a 30-minute arc highlighted. Step 3: THE NEW ENGINEER walks to THE SENIOR's desk and she turns to him with a warm smile. A large title label above the steps and a small label under each step.",
    [
      "30分（ぷん）ルール",
      "自分（じぶん）で 調（しら）べる",
      "時間（じかん）を 決（き）める",
      "相談（そうだん）する",
    ],
  ],
  [
    "soudan_idea",
    "したことと 自分の アイデアを 伝える",
    "THE NEW ENGINEER consults THE SENIOR at her desk, holding a memo with two short check lines. Two large cream labels float above him, the second one with a glowing lightbulb. THE SENIOR is impressed, with sparkles and a thumbs-up. In a small round inset at the left edge, a weaker example: the engineer only shrugs under a big question mark and THE SENIOR looks troubled.",
    ["何（なに）を したか", "自分（じぶん）の アイデア", "わかりません…"],
  ],
  [
    "soudan_kotoba",
    "相談で よく 使う 4つ",
    "A comic strip of four equal panels in one row separated by thin white gaps, THE NEW ENGINEER talking with THE SENIOR, each panel with a numbered cream label at the top. Panel 1: he bows slightly at her desk. Panel 2: he holds up a topic card. Panel 3: he shows his laptop and his search notes. Panel 4: he points at an idea with a lightbulb while she nods.",
    [
      "① 都合（つごう）を 伺（うかが）う",
      "② 用件（ようけん）を 伝（つた）える",
      "③ 状況（じょうきょう）と 依頼（いらい）",
      "④ 意見（いけん）の 提案（ていあん）",
    ],
  ],
];

const ledger = {
  _comment:
    "期末テスト対策の まとめページ（kimatsu_matome）の 絵 24枚（2026-11-20）。旧アプリ『まなびの島』の 絵柄に そろえる（tomy さん「絵のテイストは元のものを生かしてください」）。参照は 旧アプリの 絵 3枚（scripts/images/refs/manabi_island_*.jpg）。生成は scripts/slides/gen_images.mjs。PNG は 切らずに cwebp -q 74 -resize 1200 0（1200x800）。ページは 絵の 形の まま 見せる。",
  refs: [
    "scripts/images/refs/manabi_island_01_horenso_what.jpg",
    "scripts/images/refs/manabi_island_02_horenso_report_fast.jpg",
    "scripts/images/refs/manabi_island_05_horenso_soudan_person.jpg",
  ],
  style,
  noText,
  negative,
  output: "1536x1024",
  scenes: scenes.map(([out, title, scene, text]) => ({
    out,
    dest: `${D}/${out}.webp`,
    title,
    scene,
    text,
  })),
};

fs.writeFileSync(
  new URL("./kimatsu_matome.json", import.meta.url),
  JSON.stringify(ledger, null, 2) + "\n",
);
console.log(`${ledger.scenes.length} scenes`);
