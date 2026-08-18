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
 * ## なぜ「押している あいだ だけ」では ないのか（2026-08-18 に 変更）
 * はじめは 押しっぱなし（押している あいだだけ 送る）に した。指を はなす タイミングが
 * 分からない・長い 文の 途中で 指が すべる、と 使いにくかった ので、
 * **1回 押したら 会話モード、もう 1回 押したら おわり**の トグルに した。
 * 送るのを 止められる 仕組み自体は 同じなので、ざわめきで 相手の セリフが
 * 途中で 止まる ことも 起きない（話し終えたら もう いちど 押す）。
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
        onClick={talking ? onStopTalking : onStartTalking}
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
        {talking ? "🔴 いま きいて います（おすと おわり）" : "🎤 おして はなす"}
      </motion.button>
      <p className="mt-1.5 text-xs font-bold break-keep text-white/70">
        {talking
          ? "はなしおわったら、もう いちど おして ください"
          : "おすと、こえを おくります。はなしおわったら もう いちど おします"}
      </p>
    </div>
  );
}
