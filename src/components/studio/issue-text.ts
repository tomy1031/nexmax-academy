/**
 * 保存に失敗したときの言い換え（コンテンツスタジオ）
 *
 * zod のパス（"pages.0.panels.1.lines.0.text"）や API の reason をそのまま出すと、
 * 先生には何をどう直せばよいか分からない。ここで日本語の場所名に言い換える。
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
};

/** zod のパスを「ページ 1 › コマ 2 › セリフ 1 › 本文」の形にする。 */
export function describePath(path: string): string {
  if (!path) return "ぜんたい";
  const parts = path
    .split(".")
    .filter((part) => part.length > 0)
    .map((part) => {
      if (/^\d+$/.test(part)) return `${Number(part) + 1}番目`;
      return FIELD_LABELS[part] ?? part;
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
