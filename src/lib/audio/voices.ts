/**
 * Gemini Live の作りおきの声（リスニング教材のナレーション用）
 *
 * Live の古いモデルは下の8つ（classic）しか受け付けない。新しい声を足すと
 * モデルによっては接続が切れて、先生には「音声が つくれません」としか見えない。
 * 増やすときは、使うモデル全部で通ることを確かめてからにする。
 *
 * 1回の呼び出しで使える声は1つだけなので、話者ごとに声を決めて行単位で作り、
 * あとでつなぐ（src/lib/audio/live-tts.ts）。
 */

export interface VoiceMeta {
  /** Live API に渡す名前。 */
  readonly name: string;
  /** 先生に見せる説明（どんな声か）。 */
  readonly label: string;
  /** どんな役に合うか。 */
  readonly hint: string;
  readonly gender: "male" | "female";
}

export const LIVE_VOICES: readonly VoiceMeta[] = [
  {
    name: "Zephyr",
    label: "明るい 女の人",
    hint: "元気で 聞きとりやすい。案内やく・ナレーション",
    gender: "female",
  },
  {
    name: "Kore",
    label: "しっかりした 女の人",
    hint: "芯のある 声。先輩・リーダー",
    gender: "female",
  },
  { name: "Leda", label: "わかい 女の人", hint: "学生・後輩", gender: "female" },
  { name: "Aoede", label: "さわやかな 女の人", hint: "明るい 同僚・受付", gender: "female" },
  {
    name: "Charon",
    label: "おちついた 男の人",
    hint: "低めで ゆっくり。上司・先生・ナレーション",
    gender: "male",
  },
  { name: "Orus", label: "低い 男の人", hint: "低く 安定した 声。社長・ベテラン", gender: "male" },
  {
    name: "Puck",
    label: "元気な 男の人",
    hint: "軽快で わかい。司会・元気なキャラ",
    gender: "male",
  },
  {
    name: "Fenrir",
    label: "熱のある 男の人",
    hint: "テンション高め。実況・もりあげ役",
    gender: "male",
  },
];

/** 台本に出てくる話者の既定の声。迷ったときの出発点にする。 */
export const DEFAULT_VOICE = "Charon";

export function findVoice(name: string): VoiceMeta | undefined {
  return LIVE_VOICES.find((voice) => voice.name === name);
}
