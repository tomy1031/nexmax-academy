/**
 * リスニングの 音を **1文ずつ** 作る 教材の 台帳（声と 文の あいだの 秒）。
 *
 * ## ここに ある 教材だけ 作りかたが 変わる
 * 台帳に 無い 教材は これまでどおり **行ごとに 読んで 0.6秒で つなぐ**（声は 人物カード）。
 * ここに 書いた 教材は `scripts/make_listening_audio.ts` が
 *
 *  1. 原稿を **1文ずつ** に 割って 読み上げ、
 *  2. 文ごとの wav を `public/audio/listening/<教材ID>/` に **残し**、
 *  3. 文と 文の あいだに `gapSeconds` の 無音を はさんで 1本に つなぐ。
 *
 * 文ごとの wav を 残すのは、**あとで 秒だけ 変える** ため（2026-09-16 の 指定
 *「あとで この 秒は 変わる 可能性が あるため、音声データは 念の為 1文ずつ 残して」）。
 * 秒を 変えたら `--join` で つなぎ直すだけで よい——鍵も 読み上げも 要らない。
 *
 * ## 声を 人物カードから 引かない
 * ユーザーが **この 教材の 声を 名指し**した とき だけ ここに 書く。人物カード
 *（`content/characters/<id>.json`）と ちがう ことが ある——カードは スタジオ（DB）で
 * 直されて いて、git の カードが 後追いに なって いる ことが ある（2026-09-16 に
 * 藤木さんで 実際に そう だった）。名指しの 声を ここに 固定すれば、カードの ずれに
 * 引きずられない。
 */

export interface ListeningAudioPlan {
  /** 話す人の ID → Gemini Live の 声の 名前（`src/lib/audio/voices.ts` の 綴り）。 */
  readonly voices: Readonly<Record<string, string>>;
  /**
   * 話す人の ID → 読み上げる Live の モデル（`src/lib/ai/models.ts` の 名前）。
   * **固定した モデル以外には 切り替えない**（同じ 声でも モデルで 声の 質が 変わる）。
   * モデルが ちがう 人どうしは **同時に** 作る——無料枠は モデルごとに 数えられる ので、
   * 1本の 列で 作るより 早く、上限にも 当たりにくい。
   */
  readonly models: Readonly<Record<string, string>>;
  /** 文と 文の あいだの 無音（秒）。教材の `audioUrl` が 指す 1本は この 秒で つなぐ。 */
  readonly gapSeconds: number;
  /**
   * **聞きくらべ用に 別の 秒でも つないで おく**（教材からは 指さない）。
   * `public/audio/listening/<教材ID>.gap<秒>s.wav`（例 `houkoku_listening.gap2s.wav`）。
   */
  readonly compareGapSeconds?: readonly number[];
  /**
   * 読み上げの 道。`live`（既定）= Live で 1文ずつ。`tts` = Gemini の TTS で 会話を
   * まとめて 読み、間で 1文ずつに 切る（`scripts/make_listening_audio.ts` の `makeSentencesByTts`）。
   * `tts` の ときは `models` を 使わない。
   */
  readonly engine?: "live" | "tts";
  /** TTS に 渡す 話しかたの 指示（全部の 行に 付ける）。`engine: "tts"` の ときだけ 効く。 */
  readonly style?: string;
  /**
   * できた 音の 速さ（1 = そのまま。音程は 保つ・`scripts/lib/tempo.ts`）。`engine: "tts"` の ときだけ 効く。
   * 画面の「はやさ」ボタン（既定 0.85）は この 上に かかる。
   */
  readonly tempo?: number;
}

/** 報告の リスニング 5場面の 人（性別は 声と 表紙の 絵で そろえる）。 */
const REPORT_PEOPLE = {
  takahashi: { voice: "Alnilam", model: "gemini-3.8-live" }, // 男・チームの リーダー
  sato: { voice: "Autonoe", model: "gemini-3.8-live" }, // 女・プログラマー
  yamada: { voice: "Achird", model: "gemini-3.8-live" }, // 男・プログラマー
  suzuki: { voice: "Kore", model: "gemini-3.8-live" }, // 女・チームの リーダー
  nakamura: { voice: "Erinome", model: "gemini-3.8-live" }, // 女・エンジニア
  tanaka: { voice: "Charon", model: "gemini-3.8-live" }, // 男・チームの リーダー
  kobayashi: { voice: "Rasalgethi", model: "gemini-3.8-live" }, // 男・エンジニア
  kato: { voice: "Gacrux", model: "gemini-3.8-live" }, // 女・チームの リーダー
} as const;

export const LISTENING_AUDIO_PLANS: Readonly<Record<string, ListeningAudioPlan>> = {
  /*
   * 報告「悪い ニュースの 報告」（2026-09-16 の 指定）。
   * 旧アプリから 移した 音が 原稿と 合って いなかったので 作り直した。
   * ナレーションは ヘンディさんと 同じ Puck（同日 ユーザーが 選んだ）。
   * 2秒版も 同時に 作る（同日の 指定「2秒に した バージョンも 同時に」）。
   * モデルは ヘンディさん＝3.8・藤木さん＝3.1（同日の 指定）。ナレーションは
   * ヘンディさんと 同じ 声なので 同じ 3.8 に そろえる。
   */
  houkoku_listening: {
    voices: { narration: "Puck", hendy: "Puck", fujiki: "Algieba" },
    models: {
      narration: "gemini-3.8-live",
      hendy: "gemini-3.8-live",
      fujiki: "gemini-3.1-flash-live-preview",
    },
    gapSeconds: 1.5,
    compareGapSeconds: [2],
  },

  /*
   * 報告の リスニング 5場面（2026-09-28。`リスニング問題.md` から 作った）。
   * 声は **人ごとに 固定**して 5本で そろえる——高橋さん・佐藤さん・山田さんは 2本に 出る。
   * 同じ 場面の 2人は 男女を 分けて、だれが 話して いるか 耳で 分かる ように する
   *（朝礼の 3人は 高橋さん＝低めの 男・佐藤さん＝女・山田さん＝高めの 男）。
   * 表紙の 絵の 性別も これに そろえる（`scripts/images/houkoku_report_covers.json`）。
   * 秒は 報告の リスニングと 同じ 1.5秒。
   */
  houkoku_kanryou_listening: reportPlan(["sato", "takahashi"]),
  houkoku_okure_listening: reportPlan(["yamada", "suzuki"]),
  houkoku_shougai_listening: reportPlan(["nakamura", "tanaka"]),
  houkoku_chousa_listening: reportPlan(["kobayashi", "kato"]),
  houkoku_chourei_listening: reportPlan(["takahashi", "sato", "yamada"]),
};

/**
 * 報告の リスニング 5場面の 人と 声（Gemini の 声・`src/lib/audio/voices.ts`）。
 *
 * **Gemini の TTS で 会話を まとめて 読む**（2026-09-28 の 指定「ためしに Google の 新しい
 * TTS で 一括で 作成」）。Live で 1文ずつ 作って いた ときは、3.1 も 3.8 も 短い 返事
 *（「はい、大丈夫ですよ。」「どうしましたか。」）を 途中で 切り、確かめの 文字起こしも
 * 無料枠を 使い切って 1本も できなかった（run 36405843836・36406776276・36406785324）。
 * `models` は Live に 戻す ときの ために 残す（TTS では 使わない）。
 */
function reportPlan(speakers: readonly (keyof typeof REPORT_PEOPLE)[]): ListeningAudioPlan {
  return {
    voices: Object.fromEntries(speakers.map((id) => [id, REPORT_PEOPLE[id].voice])),
    models: Object.fromEntries(speakers.map((id) => [id, REPORT_PEOPLE[id].model])),
    // 2026-09-29 の 指定「間の 時間を 1.25秒に する。速度を 変える 必要は ない」
    //（はじめ「スピードは 1.25」を 速さと 取りちがえて tempo: 1.25 に して いた）
    gapSeconds: 1.25,
    engine: "tts",
    style:
      "日本のIT企業の職場での、ていねいな会話。日本語を勉強中の人にも聞き取りやすいように、" +
      "はっきり、少しゆっくり、落ちついて話す。",
  };
}
