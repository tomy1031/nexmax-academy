/**
 * 使う AI モデルの名前 — アプリ内で唯一の一覧
 *
 * ## なぜ1か所に集めるか
 * Gemini の preview モデルは**名前ごと入れ替わる**。2026-08-06 に実際に起きた:
 * たいわは `gemini-2.5-flash-native-audio-preview-09-2025`、音声生成は
 * `gemini-live-2.5-flash-preview` を指したままで、どちらも消えていた。
 * キーは正しいのに動かず、画面には「じゅんびちゅう」としか出ないので、
 * 先生は自分のキーを疑い続けることになった。
 *
 * 名前が3ファイルに散っていたのが原因なので、ここ1つにする。
 *
 * ## 候補を複数持つ
 * 1つだけ書くと、また消えたときに同じことが起きる。**上から順にためす**。
 * どれも通らなければ、画面は「つかえる モデルが ありません」と言えるようになる
 *（/api/studio/gemini-check がキーで実際に使えるものを調べる）。
 *
 * 出典: https://ai.google.dev/gemini-api/docs/models（2026-08-06 確認）
 *
 * ## 3.8 Live を 先頭に する（2026-09-16）
 * `gemini-3.8-live` が 2026-09-15 に **Stable（GA）**で 出た。Google は 3.1 を
 *「Legacy Live API preview model. We recommend updating to Gemini 3.8 Live」と
 * 書いて いる——preview は いずれ 消える ので、消える 前に 先頭を 移す。
 * 無料枠でも 使える（料金表の Free Tier が「Free of charge」）。
 *
 * **3.8 には 送ると 断られる 設定が ある**（移行の 注記・2026-09-16 確認）。
 * 足す ときは 先に 読む:
 * - `thinkingConfig`（`thinking_level`）を 送らない
 * - `enableAffectiveDialog` を 送らない（API から 消えた）
 * - `proactivity: { proactiveAudio: false }` を 送らない（先回りの 声は **常に 有効**で、
 *   false は エラー）
 * - `sendClientContent` の `turnComplete: true` は、相手が 話して いても **その場で 止める**
 * 出典: https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live
 *
 * 3.8 には「Extended Thinking」版も ある。考える ぶん 返事が 遅れる ので、
 * 学習者と 話す ここには 入れない。
 */

/**
 * たいわ（Live対話・音声で話す）。
 * 3.8 を 先頭に、つながらない ときの 控えとして 3.1 以前を 残す。
 */
export const LIVE_TALK_MODELS = [
  "gemini-3.8-live",
  "gemini-3.1-flash-live-preview",
  "gemini-2.5-flash-native-audio-preview-12-2025",
  "gemini-2.5-flash-live",
] as const;

/**
 * リスニングの音声づくり（Live TTS）。
 * たいわと同じ並びにしておく——片方だけ古い名前が残ると、
 * 「たいわは動くのに 音声づくりは動かない」という追いにくい状態になる。
 */
export const LIVE_TTS_MODELS = [
  "gemini-3.8-live",
  "gemini-3.1-flash-live-preview",
  "gemini-2.5-flash-native-audio-preview-12-2025",
  "gemini-2.5-flash-live",
] as const;

/**
 * 見かたの JSON を もらう Live（判定専用の 使い捨ての つなぎ）。
 *
 * ## Live は **文字だけの 返し（TEXT）に 対応して いない**
 * `responseModalities: [TEXT]` で つなごうと して、どの 名前でも 開けなかった
 *（鍵ありの 通し検証で reason=modelNotFound が 続いた・2026-08-20）。
 * 先に 同じ ことを した 実装（相槌の 練習）にも そう 書いて ある——
 *「Live系モデルは TEXT出力 非対応のため、AUDIO で答えさせ
 *  outputAudioTranscription（自分の発話の文字起こし）から 読み取る」。
 *
 * だから **AUDIO で 答えさせて、その 文字起こしから JSON を 読む**。
 * 音は 鳴らさない（判定の つなぎは 再生先を 持たない）。
 *
 * 並びは 実績の ある ものを 先頭に する（3.1 は 文字起こしが 話した 文と
 * そのまま 一致する ことが 先の 実装で 確かめられて いる）。
 * 3.8 は 道具の 呼び出し（見かたを 返す 形）が 通る ことを 鍵ありの 検証で
 * 見てから 先頭に 置いた（`tests/e2e/live-models.ai.spec.ts`）。
 * 3.8 は TEXT でも 返せるが、ここは AUDIO の まま——控えの 3.1 が TEXT を 受けない。
 */
export const LIVE_TEXT_MODELS = [
  "gemini-3.8-live",
  "gemini-3.1-flash-live-preview",
  "gemini-2.5-flash-live",
  "gemini-2.5-flash-native-audio-preview-12-2025",
] as const;

/** エリアの絵・まんがのコマ。 */
export const IMAGE_MODELS = ["gemini-3.1-flash-image", "gemini-2.5-flash-image"] as const;

/** ことばの抜き出しなど、文字だけの判断。 */
export const TEXT_MODEL = "gemini-2.5-flash";

/** 既定（設定していないときに使うもの）。 */
export const DEFAULT_LIVE_TALK_MODEL = LIVE_TALK_MODELS[0];
export const DEFAULT_IMAGE_MODEL = IMAGE_MODELS[0];

/**
 * 先生が選んだモデル名として受け取ってよい形か。
 *
 * サーバは受け取った名前をそのまま Google へ渡すので、URL を壊す文字を弾く。
 * 一覧に無い名前も通す——モデルは増えるので、こちらの一覧が古いことを理由に
 * 新しいモデルを使えなくしない。
 */
export function isModelName(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9.-]{2,63}$/.test(value);
}

/** Live に使えそうなモデルか（ListModels の結果を絞るのに使う）。 */
export function looksLiveCapable(name: string): boolean {
  return name.includes("live") || name.includes("native-audio");
}

/**
 * 使えるモデルの中から、**こちらの並び順で**選ぶ。
 *
 * 「せつぞくを ためす」で拾った一覧の先頭をそのまま採っていたため、
 * Google が返す順しだいで古いモデルが既定になっていた（新しい 3.1 が
 * 使えるのに 2.5 で話していた、という状態が起きる）。
 * 順番を決めるのはこちら側の一覧（`LIVE_TALK_MODELS`）で、
 * そこに1つも無いときだけ、相手の一覧の先頭に従う（知らない新型を締め出さない）。
 */
export function preferredLiveModel(available: readonly string[]): string {
  const wanted = LIVE_TALK_MODELS.find((name) => available.includes(name));
  return wanted ?? available[0] ?? DEFAULT_LIVE_TALK_MODEL;
}

/**
 * 前に 既定だった 名前（新しい ものほど 後ろに 足す）。
 *
 * 先生の 画面（AI指示出し）の「保存」は、選んで いなくても **その時の 既定**を
 * 端末に 書く。たいわは 端末の 名前を 一覧より 先に 使う ので、既定を 3.8 に
 * 上げても、一度 保存した 端末だけ 3.1 で 話し続ける。
 * 残って いる 名前が 先生の 選んだ ものか ただの 既定かは 区別できない ——
 * **前の 既定は「選んで いない」と 同じに 扱う**（2026-09-16）。
 */
const SUPERSEDED_LIVE_DEFAULTS: readonly string[] = ["gemini-3.1-flash-live-preview"];

/** 端末に 残って いた 名前が、前の 既定か（そうなら 一覧の 並びに 任せる）。 */
export function isSupersededLiveDefault(name: string): boolean {
  return SUPERSEDED_LIVE_DEFAULTS.includes(name);
}
