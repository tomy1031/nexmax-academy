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
}

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
};
