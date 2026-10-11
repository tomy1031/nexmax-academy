"use client";

import type { ReactNode, RefObject } from "react";

/**
 * テキストチャット — **ミーティングと 朝礼・夕礼で 同じ ものを 使う**
 *
 * ## なぜ 1つに まとめたか
 * 2026-09-15 の 指定「もちろん チャット欄の 入力も 添付の 写真の とおりです」
 *「極力 同じ 環境を そのまま データのみ 差し替えで 使えるように 工夫して」。
 *
 * 見出し・記録・書いて 送る 欄を 1つの カードに まとめる。前は 記録だけが
 * 会話の 下に あり、書く 欄は さらに その 下に あった ので、**話す ところと
 * 書く ところが 画面の 端と 端**に 離れて いた（2026-08-27 に ミーティングで 直した）。
 *
 * 行の 描き方は 画面ごとに ちがう（ミーティングは `ChatLine`、朝礼は 名前＋字）ので
 * **`children` に 任せる**。ここが 持つのは 殻と 入力欄だけ。
 * 行に 添える 時刻だけは 両方で 同じ 形に したいので、下の `ChatTime` を 使う。
 */
export function ChatPanel({
  logRef,
  children,
  draft,
  onDraft,
  placeholder,
  inputLabel = "こたえを 入力する",
  sendLabel = "おくる",
  inputId,
  canType,
  canSend,
  onSubmit,
}: {
  /** 記録の 箱（いちばん下へ すべらせる ため）。 */
  readonly logRef?: RefObject<HTMLDivElement | null>;
  /** 記録の 中身（行と「聞いて います…」）。 */
  readonly children: ReactNode;
  readonly draft: string;
  readonly onDraft: (value: string) => void;
  /** 書けない ばんは **なぜ 書けないか**を ここに 出す。 */
  readonly placeholder: string;
  readonly inputLabel?: string;
  readonly sendLabel?: string;
  readonly inputId?: string;
  /** 字を 打てるか。 */
  readonly canType: boolean;
  /** ➤ を 押せるか。 */
  readonly canSend: boolean;
  readonly onSubmit: () => void;
}) {
  return (
    <div className="card-island flex h-[46vh] min-h-64 flex-col p-0 sm:h-[62vh]">
      <p className="text-navy border-hairline border-b px-3 py-2 text-sm font-black">
        💬 テキストチャット
      </p>
      <div
        ref={logRef}
        role="log"
        aria-label="かいわ"
        className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3"
      >
        {children}
      </div>

      {/* 書いて 送る 欄は チャットの 足もと（添付の 画面と 同じ） */}
      <form
        className="border-hairline flex items-center gap-2 border-t p-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <input
          id={inputId}
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          placeholder={placeholder}
          aria-label={inputLabel}
          disabled={!canType}
          className="border-hairline text-ink min-w-0 flex-1 rounded-full border-2 bg-white px-3 py-1.5 text-sm font-bold disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label={sendLabel}
          className="btn-game shrink-0 rounded-full px-3 py-1.5 text-sm disabled:opacity-40"
        >
          ➤
        </button>
      </form>
    </div>
  );
}

/**
 * チャットの行に添える時刻（Zoom のチャットと同じ「9:02」の形）。
 *
 * 2026-08-20 の見本の画面は「右にテキストチャット（時刻つき）」だった。作り直しのときに
 * 時刻だけが抜けていたので、2026-10-11 の回答（#142「付ける」）で足した。
 * 行を積んだ瞬間の端末の時計で押す。会話は端末の中で進むので、サーバの時計は使わない。
 */
export function chatTimeLabel(at: number): string {
  const date = new Date(at);
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function ChatTime({ at }: { readonly at: number }) {
  return (
    <time
      dateTime={new Date(at).toISOString()}
      className="text-ink-soft ml-1.5 text-[10px] font-bold tabular-nums"
    >
      {chatTimeLabel(at)}
    </time>
  );
}
