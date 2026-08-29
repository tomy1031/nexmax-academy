/**
 * 動画の 行き先を そろえる（ファイル と YouTube）
 *
 * 2026-08-29 の 指定「ファイルの場合と youtube の場合と」。教材が 持つのは
 * **どちらか 1つ**で、画面は ここが 返す 形だけを 見る。
 *
 * ## なぜ 純関数に 出すのか
 * 単体テストは DOM を 持たない（`vitest.config.ts` の environment は node）。
 * URL の 読み取りを JSX の 中に 書くと、**貼り方の ちがい**——`youtu.be` の 短い形、
 * `?t=30` が 付いた 形、Shorts——を 誰も 確かめられなく なる。先生は 見て いる
 * ページの URL を そのまま 貼る ので、ここが いちばん 崩れやすい。
 */

/** YouTube の 動画IDの 形（11文字）。 */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** ID を そのまま 持って いる 道（`youtu.be/<ID>` など、1段目が ID）。 */
const PATH_FIRST = new Set(["youtu.be"]);

/** ID が 2段目に ある 道（`/embed/<ID>`・`/shorts/<ID>`・`/live/<ID>`）。 */
const PATH_SECOND = new Set(["embed", "shorts", "live", "v"]);

/**
 * 先生が 貼った ものから 動画IDを 取り出す。取れなければ null。
 *
 * 受けつける のは、YouTube の 画面から そのまま 貼れる 形 ぜんぶ:
 *   - `https://www.youtube.com/watch?v=<ID>`（`&t=30` などが 付いて いても よい）
 *   - `https://youtu.be/<ID>`
 *   - `https://www.youtube.com/embed/<ID>` / `/shorts/<ID>` / `/live/<ID>`
 *   - `<ID>` そのもの
 */
export function parseYouTubeId(input: string): string | null {
  const text = input.trim();
  if (text.length === 0) return null;
  if (YOUTUBE_ID.test(text)) return text;

  let url: URL;
  try {
    // 「www.youtube.com/watch?v=…」のように 頭が 無い 貼り方も 受ける
    url = new URL(text.startsWith("http") ? text : `https://${text}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^(www|m)\./, "");
  if (host !== "youtube.com" && host !== "youtube-nocookie.com" && !PATH_FIRST.has(host)) {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const candidate = PATH_FIRST.has(host)
    ? segments[0]
    : PATH_SECOND.has(segments[0] ?? "")
      ? segments[1]
      : (url.searchParams.get("v") ?? undefined);

  return candidate && YOUTUBE_ID.test(candidate) ? candidate : null;
}

/**
 * 埋め込みの 行き先。
 *
 * ## `youtube-nocookie.com` を 使う
 * 学習者は 学校の 子どもたち で、こちらが 選んだ 動画を 見るだけ である。
 * ふつうの `youtube.com` は **押す 前から** 見た 記録を 残す ので、
 * Google が 出して いる「プライバシー強化モード」の ほうを 使う。
 *
 * ## 字幕を 出す
 * `cc_load_policy=1` ＋ `cc_lang_pref=ja`。日本語の 字幕が 付いて いる 動画なら
 * 最初から 出る——**聞き取れない 学習者の いちばんの 助け**である
 *（付いて いない 動画では 何も 起きない）。
 */
export function youTubeEmbedUrl(id: string, { autoplay = false } = {}): string {
  const params = new URLSearchParams({
    // 関連動画を 同じ チャンネルに 寄せる（教材の 途中で 別の 話へ 飛ばない）
    rel: "0",
    playsinline: "1",
    cc_load_policy: "1",
    cc_lang_pref: "ja",
    hl: "ja",
  });
  if (autoplay) params.set("autoplay", "1");
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}

/** 学習者に 見せる 元の ページ（別のタブで 開く とき）。 */
export function youTubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/**
 * 読みこむ 前に 出す 絵。**先生が 決めた ものが 先**で、無ければ YouTube の もの。
 *
 * `hqdefault` を 選ぶのは、どの 動画にも **必ず ある** から。`maxresdefault` は
 * 古い 動画や 画質の 低い 動画に 無く、404 の 割れた 絵が 出る。
 */
export function youTubeThumbnail(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}
