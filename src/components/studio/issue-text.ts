/**
 * 保存の結果を先生のことばに言い換える（コンテンツスタジオ）
 *
 * zod のパス（"pages.0.panels.1.lines.0.text"）や API の reason をそのまま出すと、
 * 先生には何をどう直せばよいか分からない。ここで日本語の場所名に言い換える。
 * 保存が通ったときにサーバが返す「気づき」（参照切れなど）も、ここで文だけにする。
 * 表示部品から切り離してあるのは、この言い換えをテストできるようにするため。
 */

/** DB未設定のときに一覧の上に出す一言。 */
export const DB_PREPARING_MESSAGE = "ほぞん・こうかいは じゅんびちゅう（DB設定後に使えます）";

/** 直すべき1か所。where は日本語の場所名、message は理由。 */
export interface SaveIssue {
  where: string;
  message: string;
}

/** データのキー → 先生に見せる名前。ここにない語はそのまま出す。 */
const FIELD_LABELS: Record<string, string> = {
  id: "ID",
  kind: "種類",
  step: "ステップ",
  title: "タイトル",
  reading: "よみ（ひらがな）",
  description: "せつめい",
  color: "ピンの色",
  status: "状態",
  contents: "コンテンツ",
  ref: "参照先のID",
  type: "種別",
  wordStageIds: "単語ステージ",
  format: "形式",
  characters: "登場人物",
  name: "名前",
  role: "やくわり",
  pages: "ページ",
  panels: "コマ",
  lines: "セリフ",
  speaker: "話す人",
  text: "本文",
  caption: "ひとこと",
  size: "コマの大きさ",
  image: "画像",
  src: "画像のURL",
  prompt: "画像のプロンプト",
  refs: "参照画像",
  blocks: "ブロック",
  items: "こうもく",
  level: "見出しのレベル",
  tone: "枠の種類",
  label: "リンクの文字",
  term: "ことば",
  meaning: "いみ",
  furigana: "よみ辞書",

  // もんだい（quizset）。名前はエディタの入力欄の見出しに合わせる。
  // ここに無いと「questions 2番目 › q」のように出てしまい、
  // 先生は画面のどの欄のことか結びつけられない。
  questions: "もんだい",
  q: "とい",
  explain: "かいせつ",
  points: "てん",
  options: "えらぶもの",
  answer: "こたえ",
  answers: "こたえ",
  accept: "べつの 言い方",
  blanks: "空欄の こたえ",
  bank: "語群",
  feelings: "気もち",
  answerFeeling: "気もちの こたえ",
  replyQ: "2つめの とい",
  replies: "言い方",
  answerReply: "言い方の こたえ",
  phase: "フェーズ",
  passRate: "ごうかくの ライン",
  nekumax: "たんとうの ネクマックス",

  // スライド（slides）
  fileUrl: "PDFの ばしょ",
  pageCount: "まいすう",
  notes: "ひとこと",
  page: "何まい目",

  // リスニング（listening）
  participants: "参加者",
  accent: "タイルの色",
  script: "台本",
  at: "はじまる 秒",
  keywords: "さがす ことば",
  revealGoal: "原稿を ひらく 目標",
  focus: "聞く まえに 配る 見かた",
  audioUrl: "音声の ばしょ",
};

/**
 * 親のキーで意味が変わる名前。
 *
 * 同じ `lines` でも、漫画では コマの「セリフ」、語群の穴埋めでは 空欄の入った「文」。
 * 一律の名前にすると、先生は画面に出ていないことばを探すことになる。
 */
const LABELS_BY_PARENT: Record<string, Record<string, string>> = {
  questions: { lines: "文" },
};

/**
 * 教材の種類で呼び名が変わるもの。
 *
 * `questions` は もんだい では「もんだい」だが、ミーティングでは「しつもん」。
 * `focus` も リスニングの「聞く まえに 配る 見かた」と ミーティングの
 * 「きょう やること」で別物である。同じ名前で出すと、先生は指摘された欄を
 * 画面で探せない（見出しがその言葉になっていないため）。
 */
const LABELS_BY_KIND: Record<string, Record<string, string>> = {
  meeting: {
    focus: "きょう やること",
    host: "あいての 人",
    persona: "あいての 話し方",
    judgePrompt: "日本語の 見かた",
    questions: "しつもん",
    ask: "しつもん（あいてが 言う ことば）",
    hint: "ヒント",
    echo: "うけこたえ",
    keywords: "言えたら うれしい ことば",
    closing: "おわりの ひとこと",
  },
};

/**
 * zod のパスを「ページ 1 › コマ 2 › セリフ 1 › 本文」の形にする。
 *
 * `kind` を渡すと、その教材の画面に出ている見出しの言葉で返す。
 */
export function describePath(path: string, kind?: string): string {
  if (!path) return "ぜんたい";
  const byKind = kind ? (LABELS_BY_KIND[kind] ?? {}) : {};
  // 直前のキー（数字は飛ばす）。lines のように親で呼び名が変わる語のために持ち回る。
  let parent = "";
  const parts = path
    .split(".")
    .filter((part) => part.length > 0)
    .map((part) => {
      if (/^\d+$/.test(part)) return `${Number(part) + 1}番目`;
      const label = byKind[part] ?? LABELS_BY_PARENT[parent]?.[part] ?? FIELD_LABELS[part] ?? part;
      parent = part;
      return label;
    });
  // 「コンテンツ」「2番目」のように続く要素はひとまとめにして読みやすくする
  const merged: string[] = [];
  for (const part of parts) {
    const last = merged.at(-1);
    if (last !== undefined && part.endsWith("番目") && !last.endsWith("番目")) {
      merged[merged.length - 1] = `${last} ${part}`;
    } else {
      merged.push(part);
    }
  }
  return merged.join(" › ");
}

/**
 * 保存が通ったときにサーバが返す「気づき」（warnings）から、見せる文だけを取り出す。
 *
 * 参照切れは保存を止めない代わりにここへ載って返ってくる（api/studio/content の POST）。
 * 読み捨てると、まだ無いIDを指したステージを公開しても先生は最後まで気づけず、
 * 学習者の画面ではそのカードだけが黙って出てこない（stage/[id] が参照切れを一覧から外す）。
 * 形の違う行は落とす——一覧が壊れて「気づき」ごと出なくなるほうが困るため。
 */
export function toWarningMessages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { message } = item as { message?: unknown };
    return typeof message === "string" && message.length > 0 ? [message] : [];
  });
}

/** API の reason → 先生に見せる説明。 */
export function messageForReason(reason: string): string {
  switch (reason) {
    case "notConfigured":
      return "まだ ほぞんできません。データベースの設定が おわると 使えるようになります。";
    case "unauthorized":
      return "ログインの有効期限が切れています。もう一度 ログインしてください。";
    case "forbidden":
      return "この画面は 先生（管理者）だけが 使えます。";
    case "invalidContent":
      return "入力に なおすところが あります。下の一覧を 直してから もう一度どうぞ。";
    case "checksFailed":
      return "学習者に見せる言葉づかいの検査で 止まりました。下の一覧を 直してください。";
    case "saveFailed":
      return "ほぞんに 失敗しました。少し待って もう一度 ためしてください。";
    case "invalidJson":
      return "送信データを 読み取れませんでした。もう一度 ためしてください。";
    default:
      return "うまくいきませんでした。もう一度 ためしてください。";
  }
}
