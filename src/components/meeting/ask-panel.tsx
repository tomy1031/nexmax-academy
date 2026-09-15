"use client";

import type { ReactNode } from "react";

import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex, type FuriganaIndex } from "@/lib/text/furigana";
import type { SpeechSpeedId } from "@/lib/meeting/speed";

import { SpeakButton } from "./speak-button";
import { SpeechSpeedPicker } from "./speech-speed-picker";
import type { VoiceStatus } from "./use-live-voice";

/**
 * 話す カード — **ミーティングと 朝礼・夕礼で 同じ ものを 使う**
 *
 * ## なぜ 1つに まとめたか
 * 2026-09-15 の 指定「オリジナルで 作らずに 元の ものを そのまま 使って 欲しい」
 *「極力 同じ 環境を そのまま **データのみ 差し替え**で 使えるように 工夫して」。
 *
 * 前は 朝礼・夕礼が 同じ 並び（見出し → 相手の ことば → 声で 答えましょう →
 * 速さ｜🎤｜💡）を **自前で 組み直して** いた。同じ つもりで 書いた だけなので、
 * 実際には 別の ものに なって いた——ミーティングは 速さが 縦・3列の 固定幅
 *（`grid-cols-[1fr_auto_1fr]`）、朝礼は 速さが 横・折り返す `flex`。
 * 直すたびに 片方だけ 直る 形だった。
 *
 * ここが 持つのは **並びと 見た目だけ**。何を 話すか・いつ 押せるかは 呼ぶ側が 決める。
 *
 * ## 3つの ところ
 * 1. 見出し（`heading`）… 💬 の 右。「ヘンディさんから しつもん」「月曜日の 朝礼」
 * 2. 吹き出し（`body`）… 白い 枠。`speaker` を 渡すと 上に 小さな 名札が つく
 *   （朝礼は 話す 人が 場面の 中で 変わる ので 要る。ミーティングは 見出しが 名のる）
 * 3. 速さ｜🎤｜💡 … `speak` を 渡した ときだけ 出す。渡さない ときは
 *   `children` に 置いた もの（「けっかを 見る」など）が その 場所に 立つ
 */

/** 画面の 飾りの 読み（教材の 読み辞書とは 混ぜない・規律2）。 */
const CHROME = buildFuriganaIndex([
  ["声", "こえ"],
  ["答", "こた"],
  ["見", "み"],
  ["聞", "き"],
]);

/** 🎤 ボタンへ そのまま 渡す もの。 */
export interface SpeakControl {
  readonly status: VoiceStatus;
  readonly reason?: string | null;
  readonly talking: boolean;
  readonly disabled?: boolean;
  readonly waitNote?: string | null;
  readonly onConnect: () => void;
  readonly onStartTalking: () => void;
  readonly onStopTalking: () => void;
}

export function AskPanel({
  heading,
  speaker,
  body,
  onReplay,
  replayDisabled = false,
  speed,
  onSpeed,
  speedDisabled = false,
  speak,
  onHint,
  hintDisabled = false,
  notice,
  index,
  children,
}: {
  /** 💬 の 右に 出る 字。 */
  readonly heading: string;
  /** 吹き出しの 上の 小さな 名札（話す 人が 変わる 画面だけ）。 */
  readonly speaker?: string;
  /** 吹き出しの 中身。呼ぶ側が `RubyText` か `DictionaryText` かを 決める。 */
  readonly body?: ReactNode;
  /** 🔊（作り置きの こえが ある ときだけ 渡す）。 */
  readonly onReplay?: () => void;
  readonly replayDisabled?: boolean;
  readonly speed: SpeechSpeedId;
  readonly onSpeed: (id: SpeechSpeedId) => void;
  readonly speedDisabled?: boolean;
  /** 渡すと 速さ｜🎤｜💡 の 行が 出る。渡さない ときは 出ない。 */
  readonly speak?: SpeakControl | null;
  readonly onHint?: () => void;
  readonly hintDisabled?: boolean;
  /** 見守りの ことば（送る 前に 気づいて ほしい こと）。 */
  readonly notice?: ReactNode;
  readonly index: FuriganaIndex;
  /** 速さ｜🎤｜💡 の 下に 足す もの。 */
  readonly children?: ReactNode;
}) {
  return (
    <div className="card-island space-y-3 p-4">
      <p className="text-sky-deep text-sm font-black">
        💬 <RubyText text={heading} index={index} show />
      </p>

      {/* しつもんの 吹き出し。答える 直前に もう一度 読める ように 大きく 出す */}
      {body ? (
        <div className="flex items-start gap-2">
          <div className="border-hairline text-navy min-w-0 flex-1 rounded-2xl border-2 bg-white px-4 py-3 text-lg font-black break-words">
            {speaker ? (
              <p className="text-ink-soft mb-1 text-[11px] font-black">
                <RubyText text={speaker} index={index} show />
              </p>
            ) : null}
            {body}
          </div>
          {onReplay ? (
            <button
              type="button"
              aria-label="もう いちど 聞く"
              disabled={replayDisabled}
              onClick={onReplay}
              className="text-sky shrink-0 self-center text-2xl disabled:opacity-40"
            >
              🔊
            </button>
          ) : null}
        </div>
      ) : null}

      {speak ? (
        <>
          <p className="text-ink-soft text-center text-xs font-extrabold">
            <RubyText text="声で 答えましょう！" index={CHROME} show />
          </p>

          {/* 速さ｜丸い マイク｜ヒント の 3つ（添付の 画面と 同じ 並び） */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <SpeechSpeedPicker
              value={speed}
              onChange={onSpeed}
              tone="light"
              vertical
              disabled={speedDisabled}
            />
            <SpeakButton {...speak} />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onHint}
                disabled={hintDisabled}
                aria-label="ヒントを 見る"
                className="border-sun-deep bg-cream text-navy rounded-full border-2 px-3 py-2 text-xs font-extrabold whitespace-nowrap disabled:opacity-40"
              >
                <RubyText text="💡 ヒント" index={CHROME} show />
              </button>
            </div>
          </div>
        </>
      ) : null}

      {notice}
      {children}
    </div>
  );
}
