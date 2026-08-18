"use client";

import { motion } from "motion/react";
import type { VoiceStatus } from "./use-live-voice";

/**
 * 「おしながら はなす」— Zoom の 画面の 中に 置く、声の ボタン
 *
 * ## なぜ 大きく、Zoom の 中に 置くか
 * 以前は 入力欄の 横に 小さな「🎤 声で 話す」が あった。会話の 中心の 操作なのに
 * 送信ボタンと 同じ 大きさで 並んで いたので、**どれを 押せば 声で 話せるのか**が
 * 分からなかった（2026-08-18 の指定）。相手の 顔の すぐ下に、いちばん 大きく 置く。
 *
 * ## なぜ「おしている あいだ だけ」か
 * つないだ あいだ ずっと マイクを 送って いたので、教室の ざわめきが
 * 「学習者が 話しはじめた」と 受け取られ、**相手の セリフが 途中で 止まって** いた。
 * 押している あいだ だけ 送れば、言いたい ときに 言い、聞きたい ときに 聞ける。
 *
 * ## 指が すべっても 切れない
 * `setPointerCapture` で 指を この ボタンに 結びつける。押したまま 指が 外へ 出ても
 * 「はなした」合図は 必ず ここへ 返る——出た ところで 切れると、送りっぱなしに なる。
 */

/** 押している あいだの 色（赤）と、待って いる あいだの 色（緑）。 */
const TALKING_FACE = "#e64a5f";
const TALKING_SHADOW = "#b93547";
const READY_FACE = "#58c273";
const READY_SHADOW = "#3aa458";

export function SpeakButton({
  status,
  reason,
  talking,
  onConnect,
  onStartTalking,
  onStopTalking,
}: {
  status: VoiceStatus;
  /** つながらなかった 理由（`noMic` だけ 言い方を 変える）。 */
  reason?: string | null;
  talking: boolean;
  onConnect: () => void;
  onStartTalking: () => void;
  onStopTalking: () => void;
}) {
  if (status !== "live") {
    const connecting = status === "connecting";
    const blocked = status === "notReady";
    return (
      <div className="text-center">
        {/*
          つながらなかった ときも **押せる ままに する**。鍵を 入れた・マイクの きょかを
          あとから 出した 学習者が、画面を 読み込み直さずに もう いちど ためせる。
          押せない 灰色の ボタンだけが 残ると、そこで 終わりに 見える。
        */}
        <button
          type="button"
          onClick={onConnect}
          disabled={connecting}
          className="btn-island btn-game w-full px-6 py-4 text-lg disabled:opacity-50"
          style={{ "--btn-face": READY_FACE, "--btn-shadow": READY_SHADOW } as React.CSSProperties}
        >
          {connecting ? "つないで います…" : "🎤 こえを つかう"}
        </button>
        {/*
          折り返しは **ことばの 切れ目**で（`break-keep`）。既定では 390px の 実機で
          「だいじょ／うぶです」の ように 語の 途中で 切れて いた——読み慣れない 学習者は
          そこで 一度 つまずく。この アプリの 文は 分かち書きなので、空白で 折り返せば よい。
        */}
        <p className="mt-1.5 text-xs font-bold break-keep text-white/70">
          {/* 画面が 自分で 出す 字は かなで 書く（教材と ちがい 読み辞書を 持てない） */}
          {blocked
            ? reason === "noMic"
              ? "マイクが つかえません。いまは したの らんに かいて こたえて ください"
              : "いまは したの らんに かいて こたえて ください"
            : "おすと マイクが つながります。かいて こたえても だいじょうぶです"}
        </p>
      </div>
    );
  }

  return (
    <div className="text-center">
      <motion.button
        type="button"
        aria-pressed={talking}
        /* 長おしの メニューや 字の 選択が 出ると、押しっぱなしが 途切れる */
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          onStartTalking();
        }}
        onPointerUp={onStopTalking}
        onPointerCancel={onStopTalking}
        /* キーボードの 人も 同じ「おしている あいだ」で 話せる */
        onKeyDown={(event) => {
          if ((event.key === " " || event.key === "Enter") && !event.repeat) {
            event.preventDefault();
            onStartTalking();
          }
        }}
        onKeyUp={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            onStopTalking();
          }
        }}
        animate={talking ? { scale: [1, 1.03, 1] } : { scale: 1 }}
        transition={talking ? { duration: 1.1, repeat: Infinity } : { duration: 0.15 }}
        className="btn-island btn-game w-full touch-none px-6 py-5 text-xl select-none"
        style={
          {
            "--btn-face": talking ? TALKING_FACE : READY_FACE,
            "--btn-shadow": talking ? TALKING_SHADOW : READY_SHADOW,
          } as React.CSSProperties
        }
      >
        {talking ? "🔴 いま きいて います" : "🎤 おしながら はなす"}
      </motion.button>
      <p className="mt-1.5 text-xs font-bold break-keep text-white/70">
        {talking
          ? "はなしおわったら、ゆびを あげて ください"
          : "ボタンを おしている あいだだけ、こえを おくります"}
      </p>
    </div>
  );
}
