"use client";

import { useEffect, useRef, type RefObject } from "react";
import { dropJudgeSession, requestLinkJudge, warmLinkJudge } from "@/components/meeting/judge-api";
import { useLiveVoice } from "@/components/meeting/use-live-voice";
import { VOICE_REPLY, readLinkVoiceMessage } from "@/lib/answers/link-message";

/**
 * 声と 判定の 橋 — 埋めた ツール（静的な ページ）の かわりに Live を 使う（2026-11-18）
 *
 * 相談の 練習問題（`public/tools/hourensou/soudan_renshu.html`）は マイクで 相談して
 * Gemini が 判定する。学習者の 画面では **Gemini は Live だけ**（注意事項 2026-08-20・08-27）
 * なので、ツールは 自分で Gemini を 呼ばず、ここに 頼む。ここは 相談の 練習（5日間）と
 * **同じ 部品**を 使う——聞き取りは `useLiveVoice`（聞くだけ・声は 鳴らさない）、判定は
 * `judge-api` の 判定の つなぎ。
 *
 * マイクを 使うのは この 親の 画面（iframe に マイクの 許可は 渡さない）。
 * 頼みを 受けるのは **自分が 埋めた iframe から 来た もの だけ**（`event.source` を 見る）。
 * 何も 頼まれなければ 何も しない（つなぎは 頼まれて から 張る）。
 */

/** 聞くだけの 相手への 決まり（5日間の 相談と 同じ 文）。 */
const LISTEN_ONLY = [
  "あなたは 相談の 練習の 聞き係です。",
  "学生が 話し終わったら、何も 言いません。声でも 文字でも 返事を しません。",
  "しつもんも しません。あいづちも 打ちません。ただ 聞くだけです。",
].join("\n");

export function LinkVoiceBridge({
  linkId,
  frameRef,
}: {
  linkId: string;
  frameRef: RefObject<HTMLIFrameElement | null>;
}) {
  const voice = useLiveVoice({ listenOnly: true, muted: true });
  /* 受け口は 1回だけ 付ける。いまの 声の しくみは ref で 読む */
  const voiceRef = useRef(voice);
  useEffect(() => {
    voiceRef.current = voice;
  });
  const used = useRef(false);

  const reply = useRef((message: Record<string, unknown>) => {
    try {
      frameRef.current?.contentWindow?.postMessage(
        { type: VOICE_REPLY, id: linkId, ...message },
        window.location.origin,
      );
    } catch {
      /* 返せなくても 親の 画面は 止めない */
    }
  });

  /* つなぎの ようすを 知らせる（頼まれた ことが ある とき だけ） */
  useEffect(() => {
    if (!used.current) return;
    reply.current({
      op: "status",
      status: voice.status,
      reason: voice.reason,
      talking: voice.talking,
    });
  }, [voice.status, voice.reason, voice.talking]);

  /* 言い終わった ひとまとまり（聞き取り）を 渡す */
  const seen = useRef(voice.lastUtterance?.id ?? 0);
  useEffect(() => {
    const said = voice.lastUtterance;
    if (!said || said.id === seen.current) return;
    seen.current = said.id;
    reply.current({ op: "heard", text: said.text });
  }, [voice.lastUtterance]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;
      const message = readLinkVoiceMessage(event.data, linkId);
      if (!message) return;
      used.current = true;
      const live = voiceRef.current;
      switch (message.op) {
        case "connect":
          if (live.status === "live" || live.status === "connecting") {
            reply.current({
              op: "status",
              status: live.status,
              reason: live.reason,
              talking: live.talking,
            });
          } else {
            void live.start(LISTEN_ONLY);
          }
          return;
        case "talk-start":
          live.startTalking();
          return;
        case "talk-stop":
          live.stopTalking();
          return;
        case "disconnect":
          live.stop();
          return;
        case "warm":
          void warmLinkJudge(`${linkId}:${message.key}`);
          return;
        case "judge":
          void requestLinkJudge(`${linkId}:${message.key}`, message.prompt).then((result) =>
            reply.current(
              result.ok
                ? { op: "judged", reqId: message.reqId, ok: true, args: result.args }
                : { op: "judged", reqId: message.reqId, ok: false, reason: result.reason },
            ),
          );
          return;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [linkId, frameRef]);

  /* 閉じる とき、マイクと 判定の つなぎを 閉じる */
  useEffect(
    () => () => {
      voiceRef.current.stop();
      dropJudgeSession();
    },
    [],
  );

  return null;
}
