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

export interface VoiceMeta {
  /** Live API に渡す名前（Google の 一覧の 綴り）。 */
  readonly name: string;
  readonly gender: "male" | "female";
  /** Google の 一覧の 性格（英語の 1語）。 */
  readonly style: VoiceStyle;
  /** 先生に見せる説明（どんな声か）。例「熱のある 男の人」。 */
  readonly label: string;
  /** どんな役に合うか。 */
  readonly hint: string;
}

function voice(
  name: string,
  gender: VoiceMeta["gender"],
  style: VoiceStyle,
  hint: string,
): VoiceMeta {
  const who = gender === "male" ? "男の人" : "女の人";
  return { name, gender, style, label: `${TONE_JA[style]} ${who}`, hint };
}

export const LIVE_VOICES: readonly VoiceMeta[] = [
  voice("Zephyr", "female", "Bright", "元気で 聞きとりやすい。案内やく・ナレーション"),
  voice("Kore", "female", "Firm", "芯のある 声。先輩・リーダー"),
  voice("Leda", "female", "Youthful", "学生・後輩"),
  voice("Aoede", "female", "Breezy", "明るい 同僚・受付"),
  voice("Callirrhoe", "female", "Easy-going", "のんびり やさしい。やさしい 先輩"),
  voice("Autonoe", "female", "Bright", "明るく 聞きとりやすい。同僚・案内"),
  voice("Despina", "female", "Smooth", "上品で 落ちついた。受付・案内"),
  voice("Erinome", "female", "Clear", "聞きとりやすい。ニュース・説明"),
  voice("Laomedeia", "female", "Upbeat", "軽快。司会・もりあげ役"),
  voice("Achernar", "female", "Soft", "やさしい 語り"),
  voice("Gacrux", "female", "Mature", "年上の 人・上司"),
  voice("Pulcherrima", "female", "Forward", "前に 出る 声。営業・司会"),
  voice("Vindemiatrix", "female", "Gentle", "やさしい 先生・相談役"),
  voice("Sulafat", "female", "Warm", "包みこむ 声。ナレーション・やさしい 先輩"),
  voice("Charon", "male", "Informative", "低めで ゆっくり。上司・先生・ナレーション"),
  voice("Orus", "male", "Firm", "低く 安定した 声。社長・ベテラン"),
  /*
   * 2026-08-27 の 指定で 足した（松井社長の 声）。Google の 一覧に ある 声だが
   * うちの 8つには 入って いなかった ので、**Live に つないで 音が 返る ことを
   * 確かめて から** 足して いる（111KB の PCM が 返った）。
   */
  voice("Sadaltager", "male", "Knowledgeable", "ゆっくり 説明する 声。社長・経営者"),
  /*
   * 2026-08-31 の 指定で 足した（松井社長の 声を こちらへ）。
   *
   * ユーザーの ことばは「Shedar」だが、**Google の 一覧での 綴りは `Schedar`**
   *（カシオペヤ座 α の 綴り。同じ 星の 別表記）。API に 渡すのは 一覧の 綴りで、
   * `Shedar` では 声が 見つからず **接続が 切れて「音声が つくれません」だけが 出る**。
   * 綴りを 直して ある ことを ここに 残す——見た目が 1文字ちがうだけ なので、
   * 次に 見た 人が「打ちまちがい」と 思って 戻す おそれが ある。
   */
  voice("Schedar", "male", "Even", "たいらで 落ちついた 声。社長・司会"),
  voice("Puck", "male", "Upbeat", "軽快で わかい。司会・元気なキャラ"),
  voice("Fenrir", "male", "Excitable", "テンション高め。実況・もりあげ役"),
  voice("Enceladus", "male", "Breathy", "しずかな 声。まじめな 話・ナレーション"),
  voice("Iapetus", "male", "Clear", "聞きとりやすい。説明・アナウンス"),
  voice("Umbriel", "male", "Easy-going", "のんびり おだやか。やさしい 同僚"),
  voice("Algieba", "male", "Smooth", "落ちついた 司会・案内"),
  voice("Algenib", "male", "Gravelly", "ざらっとした 声。年配・職人"),
  voice("Rasalgethi", "male", "Informative", "説明が 聞きとりやすい。先生・エンジニア"),
  voice("Alnilam", "male", "Firm", "落ちついた 声。上司・リーダー"),
  voice("Achird", "male", "Friendly", "同僚・友だち"),
  voice("Zubenelgenubi", "male", "Casual", "友だち・後輩"),
  voice("Sadachbia", "male", "Lively", "元気。後輩・元気な キャラ"),
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
