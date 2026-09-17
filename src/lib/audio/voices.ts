/**
 * Gemini Live の作りおきの声（登場人物の声・リスニングの読み上げ・ミーティングの会話）
 *
 * ## Google の 30種 すべてを 持つ（2026-09-16 の 指定）
 * 以前は 10種だけ だった。「Live の古いモデルは 8つ（classic）しか受け付けない」ため
 * 絞って いたが、いま 使う モデル（`src/lib/ai/models.ts` の先頭 `gemini-3.1-flash-live-preview`）は
 * native audio で、**TTS の 声を すべて 使える**（Google の Live API の説明
 *「Native audio output models support any of the voices available for our TTS models」）。
 * 一覧の 出典: https://ai.google.dev/gemini-api/docs/speech-generation（30種・2026-09-16 確認）。
 *
 * **全部の 声で Live から 音が 返る ことは、見本を 作る ときに 確かめて いる**
 *（`scripts/make_voice_samples.ts`。台本どおりに 読めなかった 声は 見本が 書かれない ので、
 * `tests/voice_samples.test.ts` が「見本の 無い 声」として 落とす）。
 * 声を 足す ときも この 順番を 守る——1文字 ちがう だけで Live は 声を 見つけられず、
 * 画面には「音声が つくれません」としか 出ない（docs/constraints.md・松井社長の Schedar）。
 *
 * 並びの 下の ほうの モデル（`gemini-2.5-flash-live`）は **古い 8種しか 受け付けない**
 * ことが ある。先頭の モデルが 止まって そこまで 落ちた ときは、新しい 声だけ
 * 作れない ことが ある——そのときは 画面の 失敗の 理由（モデルごとに 出る）を 見る。
 *
 * 1回の呼び出しで使える声は1つだけなので、話者ごとに声を決めて行単位で作り、
 * あとでつなぐ（src/lib/audio/live-tts.ts）。
 */

/** Google の 一覧に ある 声の 性格（英語の 1語。そのまま 写す）。 */
type VoiceStyle =
  | "Bright"
  | "Upbeat"
  | "Informative"
  | "Firm"
  | "Excitable"
  | "Youthful"
  | "Breezy"
  | "Easy-going"
  | "Breathy"
  | "Clear"
  | "Smooth"
  | "Gravelly"
  | "Soft"
  | "Even"
  | "Mature"
  | "Forward"
  | "Friendly"
  | "Casual"
  | "Gentle"
  | "Lively"
  | "Knowledgeable"
  | "Warm";

/** 性格の 1語を、先生が 読んで 思いうかべられる 日本語に する。 */
const TONE_JA: Readonly<Record<VoiceStyle, string>> = {
  Bright: "明るい",
  Upbeat: "元気な",
  Informative: "説明むきの",
  Firm: "しっかりした",
  Excitable: "熱のある",
  Youthful: "わかわかしい",
  Breezy: "さわやかな",
  "Easy-going": "おっとりした",
  Breathy: "息まじりの",
  Clear: "はっきりした",
  Smooth: "なめらかな",
  Gravelly: "しゃがれた",
  Soft: "やわらかい",
  Even: "たんたんとした",
  Mature: "おとなっぽい",
  Forward: "ぐいぐい 話す",
  Friendly: "親しみやすい",
  Casual: "くだけた",
  Gentle: "おだやかな",
  Lively: "いきいきした",
  Knowledgeable: "知的な",
  Warm: "あたたかい",
};

/**
 * 声の 高さ（**同じ 性別の 中で** くらべた もの）。`null` は 見本が まだ 無く、測って いない。
 *
 * ## 測りかた（2026-09-16）
 * Google は 声の 高さを 出して いない（Gemini の 説明・Cloud TTS の 一覧・Google の
 * 見本ノートの どこにも 無い）ので、**見本の 音から 測った**。Praat で 1本ごとの
 * 基本周波数の 中央値を とり、同じ 文の 取り直し（`make_voice_samples.ts --takes`）を
 * 合わせて 最大 3本の 平均に した。性別ごとの 中央値（女 203Hz・男 159Hz）から
 * **半音 1.5 以上 高ければ 高め、低ければ 低め**、あいだは 中くらい。
 *
 * **Live は 同じ 声でも 毎回 ゆれる**（Orus は 同じ 文で 138Hz と 212Hz）。
 * 教材の 1文ごとの ゆれは もっと 大きい（Puck の 97文で 109〜252Hz）。
 * だから これは「傾向」で、最後は 見本を 聞いて 決める。
 */
type VoicePitch = "high" | "middle" | "low";

const PITCH_JA: Readonly<Record<VoicePitch, string>> = {
  high: "高め",
  middle: "中くらい",
  low: "低め",
};

export interface VoiceMeta {
  /** Live API に渡す名前（Google の 一覧の 綴り）。 */
  readonly name: string;
  readonly gender: "male" | "female";
  /** Google の 一覧の 性格（英語の 1語）。 */
  readonly style: VoiceStyle;
  /** 声の 高さ（上の 測りかた）。`null` は 見本が まだ 無い。 */
  readonly pitch: VoicePitch | null;
  /** 先生に見せる説明（どんな声か）。例「熱のある 男の人・声は 高め」。 */
  readonly label: string;
  /** どんな役に合うか。 */
  readonly hint: string;
}

function voice(
  name: string,
  gender: VoiceMeta["gender"],
  style: VoiceStyle,
  pitch: VoicePitch | null,
  hint: string,
): VoiceMeta {
  const who = gender === "male" ? "男の人" : "女の人";
  const height = pitch ? `声は ${PITCH_JA[pitch]}` : "見本 まだ";
  return { name, gender, style, pitch, label: `${TONE_JA[style]} ${who}・${height}`, hint };
}

/** 並びは 女の人 → 男の人、それぞれ 高い 順（「明るい 高い 男の人」を 探しやすく する）。 */
export const LIVE_VOICES: readonly VoiceMeta[] = [
  voice("Achernar", "female", "Soft", "high", "やさしい 語り"),
  voice("Erinome", "female", "Clear", "high", "聞きとりやすい。ニュース・説明"),
  voice("Zephyr", "female", "Bright", "middle", "元気で 聞きとりやすい。案内やく・ナレーション"),
  voice("Autonoe", "female", "Bright", "middle", "明るく 聞きとりやすい。同僚・案内"),
  voice("Sulafat", "female", "Warm", "middle", "包みこむ 声。ナレーション・やさしい 先輩"),
  voice("Aoede", "female", "Breezy", "middle", "明るい 同僚・受付"),
  voice("Despina", "female", "Smooth", "middle", "上品で 落ちついた。受付・案内"),
  voice("Laomedeia", "female", "Upbeat", "middle", "軽快。司会・もりあげ役"),
  voice("Leda", "female", "Youthful", "middle", "学生・後輩"),
  voice("Kore", "female", "Firm", "middle", "芯のある 声。先輩・リーダー"),
  voice("Gacrux", "female", "Mature", "low", "年上の 人・上司"),
  voice("Callirrhoe", "female", "Easy-going", "low", "のんびり やさしい。やさしい 先輩"),
  voice("Vindemiatrix", "female", "Gentle", "low", "やさしい 先生・相談役"),
  voice("Pulcherrima", "female", "Forward", "low", "前に 出る 声。営業・司会"),
  voice("Fenrir", "male", "Excitable", "high", "テンション高め。実況・もりあげ役"),
  voice("Achird", "male", "Friendly", "high", "同僚・友だち"),
  voice("Enceladus", "male", "Breathy", "high", "しずかな 声。まじめな 話・ナレーション"),
  voice("Algenib", "male", "Gravelly", "middle", "ざらっとした 声。年配・職人"),
  // もとの 説明は「低めで ゆっくり」だったが、測ると 中くらい（142〜191Hz）。高さは label に 任せる
  voice("Charon", "male", "Informative", "middle", "ゆっくり。上司・先生・ナレーション"),
  // もとの 説明は「低く 安定した」だったが、測ると 138Hz と 212Hz に ゆれた。高さは label に 任せる
  voice("Orus", "male", "Firm", "middle", "安定した 声。社長・ベテラン"),
  voice("Puck", "male", "Upbeat", "middle", "軽快で わかい。司会・元気なキャラ"),
  /*
   * 2026-08-31 の 指定で 足した（松井社長の 声を こちらへ）。
   *
   * ユーザーの ことばは「Shedar」だが、**Google の 一覧での 綴りは `Schedar`**
   *（カシオペヤ座 α の 綴り。同じ 星の 別表記）。API に 渡すのは 一覧の 綴りで、
   * `Shedar` では 声が 見つからず **接続が 切れて「音声が つくれません」だけが 出る**。
   * 綴りを 直して ある ことを ここに 残す——見た目が 1文字ちがうだけ なので、
   * 次に 見た 人が「打ちまちがい」と 思って 戻す おそれが ある。
   */
  voice("Schedar", "male", "Even", "middle", "たいらで 落ちついた 声。社長・司会"),
  voice("Umbriel", "male", "Easy-going", "middle", "のんびり おだやか。やさしい 同僚"),
  voice("Rasalgethi", "male", "Informative", "middle", "説明が 聞きとりやすい。先生・エンジニア"),
  voice("Zubenelgenubi", "male", "Casual", "middle", "友だち・後輩"),
  /*
   * 2026-08-27 の 指定で 足した（松井社長の 声）。Google の 一覧に ある 声だが
   * うちの 8つには 入って いなかった ので、**Live に つないで 音が 返る ことを
   * 確かめて から** 足して いる（111KB の PCM が 返った）。
   */
  voice("Sadaltager", "male", "Knowledgeable", "low", "ゆっくり 説明する 声。社長・経営者"),
  voice("Iapetus", "male", "Clear", "low", "聞きとりやすい。説明・アナウンス"),
  voice("Alnilam", "male", "Firm", "low", "落ちついた 声。上司・リーダー"),
  voice("Algieba", "male", "Smooth", "low", "落ちついた 司会・案内"),
  /*
   * **見本が まだ 無い**（2026-09-16）。2回 作って 2回とも「音が 来ないまま 切れました」（run 35072968831・35074909351）。
   * ほかの 声は 同じ 回で 作れて いる ので、数の 上限だけ では 説明が つかない——
   * **Live の モデルが この 声を 受け付けて いない** おそれが ある。
   * 作れたら `pitch` を 測って 入れ、`tests/voice_samples.test.ts` の「見本 まだ」から 外す。
   */
  voice("Sadachbia", "male", "Lively", null, "元気。後輩・元気な キャラ"),
];

/** 台本に出てくる話者の既定の声。迷ったときの出発点にする。 */
export const DEFAULT_VOICE = "Charon";

export function findVoice(name: string): VoiceMeta | undefined {
  return LIVE_VOICES.find((one) => one.name === name);
}

/**
 * 声の 見本の 台本（`scripts/make_voice_samples.ts` が 全部の 声で 読ませる）。
 *
 * 全部の 声で **同じ 文**に する——文が ちがうと、声の ちがいか 文の ちがいか 聞き分けられない。
 * 授業で よく 出る 朝礼の 言いかたに して、教材で 話した ときの 感じが 分かる ように する。
 * **変えたら 見本を 全部 作り直す**（`--force`）。
 */
export const VOICE_SAMPLE_TEXT =
  "おはようございます。きょうの よていを つたえます。よろしく お願いします。";

/** 声の 見本の 置き場（`public/` から 見た URL）。 */
export function voiceSampleUrl(name: string): string {
  return `/audio/voices/${name}.wav`;
}

/** えらぶ 欄に 出す 1行。**Google の 名前を 先頭**に する（AI Studio などと 突き合わせられる ように）。 */
export function voiceOptionLabel(voice: VoiceMeta): string {
  return `${voice.name} — ${voice.label}（${voice.hint}）`;
}
