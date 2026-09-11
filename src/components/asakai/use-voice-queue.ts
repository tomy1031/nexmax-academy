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
 * ## 「いま 鳴って いるか」を `paused` で 見ない
 * 再生が 自然に 終わった 瞬間、`paused` は **同期で** true に なり、`ended` は
 * その あとに 飛ぶ。この すきまに `push` が 入ると 1本 先に 進め、遅れて 届いた
 * `ended` が もう一度 進める——**受け止めが 鳴り始めた 直後に 消える**
 *（2026-09-11 の 検収）。いま 鳴らして いる ものを 自分で 覚えて、
 * `ended` が **その ものから 来たか**を 見る。
 *
 * ## `stalled` では 進めない
 * `stalled`（取りに 行って いるのに データが 来ない）は 教室の 細い 回線で
 * **再生中に 何度でも** 飛ぶ。ここで 進めると 受け止めから 閉じまでが
 * 数秒で 食い潰される。進めるのは `ended` と `error` だけに する。
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
  /** いま 鳴って いる 行の 音の URL。鳴って いなければ null。 */
  readonly speakingAudio: string | null;
  /** 行を 待ち行列の うしろに 足す（鳴って いなければ すぐ 始める）。 */
  readonly push: (items: readonly VoiceQueueItem[], rate: number) => void;
  /** 1本だけ 聞き返す（🔊）。**待ち行列は 捨てない**——聞き返した あと 続きが 鳴る。 */
  readonly replay: (url: string, rate: number) => void;
  /** 止める（画面を 離れる とき・時間カードへ 移る とき）。 */
  readonly stop: () => void;
}

export function useVoiceQueue(): VoiceQueue {
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [speaking, setSpeaking] = useState<VoiceQueueItem | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const queueRef = useRef<VoiceQueueItem[]>([]);
  const rateRef = useRef(1);
  /** いま 鳴らして いる もの。`ended` が これから 来たか 見わけるのに 使う。 */
  const playingRef = useRef<VoiceQueueItem | null>(null);
  /** 聞き返し（🔊）の あいだ。終わったら 待ち行列に 戻る。 */
  const replayingRef = useRef(false);
  /** `ended` から つぎを 呼ぶ ための 置き場（作る 順の 循環を ほどく）。 */
  const nextRef = useRef<() => void>(() => undefined);

  /** `<audio>` と 解析器を 1つだけ 作る。曲ごとに 作ると つなぎ先が 増え続ける。 */
  const ensure = useCallback(() => {
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio();
      audio.crossOrigin = "anonymous";
      /*
       * 終わっても・鳴らせなくても **つぎへ 送る**。止まると 会話が 止まる。
       * `stalled` は ここに 入れない（上の 説明）。
       */
      audio.onended = () => nextRef.current();
      audio.onerror = () => nextRef.current();
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

  /** 1本 鳴らす（待ち行列からでも 聞き返しからでも ここを 通る）。 */
  const playOne = useCallback((audio: HTMLAudioElement, url: string, rate: number) => {
    audio.src = assetUrl(url) ?? url;
    audio.currentTime = 0;
    /* 速さだけ 変えて 高さは 変えない（`useClipPlayer` と 同じ 考え方）。 */
    audio.preservesPitch = true;
    audio.playbackRate = rate;
    void ctxRef.current?.resume().catch(() => undefined);
    audio.play().catch(() => {
      /* 利用者が 触る 前は 鳴らせない。行列ごと あきらめる（字は 出て いる）。 */
      queueRef.current = [];
      playingRef.current = null;
      replayingRef.current = false;
      setSpeaking(null);
    });
  }, []);

  const startNext = useCallback(() => {
    replayingRef.current = false;
    /* 音の 無い 行は **飛ばす**（止めない）。フィルタを 1か所 忘れても 会話が 続く。 */
    let item = queueRef.current.shift();
    while (item && !item.audio) item = queueRef.current.shift();
    if (!item?.audio) {
      playingRef.current = null;
      setSpeaking(null);
      return;
    }
    const audio = ensure();
    playingRef.current = item;
    setSpeaking(item);
    playOne(audio, item.audio, rateRef.current);
  }, [ensure, playOne]);

  useEffect(() => {
    nextRef.current = startNext;
  }, [startNext]);

  const push = useCallback(
    (items: readonly VoiceQueueItem[], rate: number) => {
      rateRef.current = rate;
      const fresh = items.filter((item) => item.audio);
      if (fresh.length === 0) return;
      queueRef.current = [...queueRef.current, ...fresh];
      /* 鳴って いる 最中なら 足すだけ。`paused` では 見ない（上の 説明）。 */
      if (playingRef.current === null && !replayingRef.current) startNext();
    },
    [startNext],
  );

  const replay = useCallback(
    (url: string, rate: number) => {
      rateRef.current = rate;
      const audio = ensure();
      /*
       * 聞き返しの あいだは 待ち行列を **消さずに 止めて おく**。
       * 消すと、受け止めの 最中に 前の 行を 聞き直した 学習者から
       * 采配・メンバー・閉じが 黙って 消える（2026-09-11 の 検収）。
       */
      playingRef.current = null;
      replayingRef.current = true;
      setSpeaking(null);
      playOne(audio, url, rate);
    },
    [ensure, playOne],
  );

  const stop = useCallback(() => {
    queueRef.current = [];
    playingRef.current = null;
    replayingRef.current = false;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setSpeaking(null);
  }, []);

  useEffect(
    () => () => {
      const audio = audioRef.current;
      if (audio) {
        /* 事件の 受け口を 外してから 止める。外さないと 片づけた あとに 走る。 */
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
        /* 取りに 行って いる 途中を 打ち切る（離れても 落ちつづけない）。 */
        audio.removeAttribute("src");
        audio.load();
      }
      void ctxRef.current?.close();
    },
    [],
  );

  return {
    analyser,
    speakingId: speaking?.speakerId ?? null,
    speakingAudio: speaking?.audio ?? null,
    push,
    replay,
    stop,
  };
}
