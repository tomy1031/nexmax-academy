"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { assetUrl } from "@/lib/asset-url";

/**
 * 朝礼・夕礼の 作り置きの こえを **順に** 鳴らす
 *
 * ## なぜ `useClipPlayer` では 足りないのか
 * ミーティングは「いま 見て いる しつもん」1本を 鳴らすので、鳴らす ものは
 * つねに 1つに 決まる。朝礼は ちがう——報告の あとに **受け止め → 采配 →
 * ニャムさん → 奥田さん → 閉じ**が ひとかたまりで 来る（5〜8本）。
 * 1本ずつ 鳴らすと 前の 声を 上書きして、いちばん 最後だけが 聞こえる。
 * だから 待ち行列が 要る。
 *
 * ## 送り出しは **効果では なく 事件**で する
 * 「行が 増えたら 鳴らす」を 効果（`useEffect`）で 書くと、効果の 中で
 * 状態を 変える ことに なり 描画が 連鎖する（React Compiler が 禁じる）。
 * ここでは `<audio>` の `ended` で つぎへ 送る——事件の 中なら 状態を 変えてよい。
 * 呼ぶ側も 行を 積む その 場（押した とき・閉じた とき）で `push` する。
 *
 * ## だれが 話して いるかを 返す
 * 口パク（`VisemeFace`）は 解析器が あれば 音の 大きさで 口を 動かす。
 * ただし 解析器は **1つ**なので、そのまま 全員に 渡すと 全員の 口が 動く。
 * `speakingId` を 見て、いま 鳴って いる 人にだけ 渡す。
 *
 * ## 鳴らせない ときは 黙って あきらめる
 * ブラウザは 利用者が 触る 前の 音を 止める。作り置きの 音が 無い 教材
 *（`audio` が 空）も ふつうに ある。どちらも **字は 出て いる**ので、
 * 会話は そのまま 進む。
 */
export interface VoiceQueueItem {
  readonly speakerId: string;
  /** 作り置きの 音（`/audio/meetings/<ID>/<キー>.wav`）。無ければ 飛ばす。 */
  readonly audio?: string;
}

export interface VoiceQueue {
  /** 鳴って いる 音を 見る 解析器（口パク用）。 */
  readonly analyser: AnalyserNode | null;
  /** いま 鳴って いる 人の id。鳴って いなければ null。 */
  readonly speakingId: string | null;
  /** 行を 待ち行列の うしろに 足す（鳴って いなければ すぐ 始める）。 */
  readonly push: (items: readonly VoiceQueueItem[], rate: number) => void;
  /** 1本だけ 鳴らす（🔊 の 聞き返し）。待ち行列は 捨てる。 */
  readonly play: (url: string, rate: number) => void;
  /** 止める（画面を 離れる とき・時間カードへ 移る とき）。 */
  readonly stop: () => void;
}

export function useVoiceQueue(): VoiceQueue {
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const queueRef = useRef<VoiceQueueItem[]>([]);
  const rateRef = useRef(1);
  /** `ended` から つぎを 呼ぶ ための 置き場（作る 順の 循環を ほどく）。 */
  const nextRef = useRef<() => void>(() => undefined);

  /** `<audio>` と 解析器を 1つだけ 作る。曲ごとに 作ると つなぎ先が 増え続ける。 */
  const ensure = useCallback(() => {
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio();
      audio.crossOrigin = "anonymous";
      /* 終わっても・鳴らせなくても **必ず つぎへ 送る**。止まると 会話が 止まる。 */
      audio.onended = () => nextRef.current();
      audio.onerror = () => nextRef.current();
      audio.onstalled = () => nextRef.current();
      audioRef.current = audio;
    }
    if (!ctxRef.current) {
      const ctx = new AudioContext();
      const node = ctx.createAnalyser();
      node.fftSize = 512;
      node.connect(ctx.destination);
      ctx.createMediaElementSource(audio).connect(node);
      ctxRef.current = ctx;
      setAnalyser(node);
    }
    return audio;
  }, []);

  const startNext = useCallback(() => {
    const item = queueRef.current.shift();
    if (!item?.audio) {
      setSpeakingId(null);
      return;
    }
    const audio = ensure();
    setSpeakingId(item.speakerId);
    audio.src = assetUrl(item.audio) ?? item.audio;
    audio.currentTime = 0;
    /* 速さだけ 変えて 高さは 変えない（`useClipPlayer` と 同じ 考え方）。 */
    audio.preservesPitch = true;
    audio.playbackRate = rateRef.current;
    void ctxRef.current?.resume().catch(() => undefined);
    audio.play().catch(() => {
      /* 利用者が 触る 前は 鳴らせない。行列ごと あきらめる（字は 出て いる）。 */
      queueRef.current = [];
      setSpeakingId(null);
    });
  }, [ensure]);

  useEffect(() => {
    nextRef.current = startNext;
  }, [startNext]);

  const push = useCallback(
    (items: readonly VoiceQueueItem[], rate: number) => {
      rateRef.current = rate;
      const fresh = items.filter((item) => item.audio);
      if (fresh.length === 0) return;
      queueRef.current = [...queueRef.current, ...fresh];
      const audio = audioRef.current;
      if (!audio || audio.paused) startNext();
    },
    [startNext],
  );

  const play = useCallback(
    (url: string, rate: number) => {
      rateRef.current = rate;
      queueRef.current = [];
      const audio = ensure();
      audio.pause();
      audio.src = assetUrl(url) ?? url;
      audio.currentTime = 0;
      audio.preservesPitch = true;
      audio.playbackRate = rate;
      void ctxRef.current?.resume().catch(() => undefined);
      setSpeakingId(null);
      audio.play().catch(() => undefined);
    },
    [ensure],
  );

  const stop = useCallback(() => {
    queueRef.current = [];
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setSpeakingId(null);
  }, []);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      void ctxRef.current?.close();
    },
    [],
  );

  return { analyser, speakingId, push, play, stop };
}
