"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 作り置きの音声を鳴らす（口パクの解析器つき）
 *
 * 質問とおわりの ひとことは毎回おなじ文なので、先に音にしてある
 *（`meetingQuestion.audioUrl`）。ここで鳴らすと、開いた瞬間に声が出る——
 * Live につないでから読ませると、毎回2〜3秒の沈黙が入る。キーを持たない
 * 学習者にも 声が届く。
 *
 * ## なぜ解析器を通すか
 * 口の形は「いま鳴っている音の大きさ」で決まる（viseme-face.tsx）。
 * Live の音と同じ道を通しておけば、作り置きでも生成でも口は同じように動く。
 *
 * ## 状態の更新は必ず Promise のあと
 * 効果の中から呼ばれるので、同期に setState すると描画が連鎖する
 *（React Compiler が禁じる）。だから中は非同期にして、更新は await のあとで行う。
 *
 * ## 自動再生に断られたら黙って諦める
 * ブラウザは「利用者が触る前の音」を止める。ここで投げると画面が落ちるので、
 * 鳴らないだけにする（字幕は出ているので、会話は続けられる）。
 */
export interface ClipPlayer {
  /** 鳴っている音を見る解析器（無ければ null）。 */
  readonly analyser: AnalyserNode | null;
  /** いま鳴っているか。 */
  readonly playing: boolean;
  readonly play: (url: string, rate?: number) => void;
  readonly stop: () => void;
}

export function useClipPlayer(): ClipPlayer {
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setPlaying(false);
  }, []);

  const play = useCallback((url: string, rate = 1) => {
    void (async () => {
      // 1つの <audio> を使い回す。曲ごとに作ると、Web Audio のつなぎ先が増え続ける
      let audio = audioRef.current;
      if (!audio) {
        audio = new Audio();
        audio.crossOrigin = "anonymous";
        audio.onended = () => setPlaying(false);
        /*
         * **鳴らせなかった ときも 必ず 終わりに する**。
         * 画面は「鳴って いる あいだは 触れない」で 動いて いるので、ここで
         * 止まったままに なると **学習者が 何も 押せなく なる**。
         */
        audio.onerror = () => setPlaying(false);
        audio.onstalled = () => setPlaying(false);
        audioRef.current = audio;
      }
      let node: AnalyserNode | null = null;
      if (!ctxRef.current) {
        const ctx = new AudioContext();
        node = ctx.createAnalyser();
        node.fftSize = 512;
        node.connect(ctx.destination);
        ctx.createMediaElementSource(audio).connect(node);
        ctxRef.current = ctx;
      }
      await ctxRef.current.resume().catch(() => undefined);
      if (node) setAnalyser(node);
      audio.src = url;
      audio.currentTime = 0;
      /*
       * 速さだけを 変えて、**声の 高さは 変えない**。
       * Web Audio の `playbackRate` は 音を そのまま 引きのばす ので、
       * ゆっくりに すると 声まで 低くなる（2026-08-18 の 指摘）。
       * `<audio>` の 側は `preservesPitch` が 既定で 効くので、高さが 保たれる。
       */
      audio.preservesPitch = true;
      audio.playbackRate = rate;
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        // 利用者が触る前は鳴らせない。字幕は出ているので、会話はそのまま続ける
        setPlaying(false);
      }
    })();
  }, []);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      void ctxRef.current?.close();
    },
    [],
  );

  return { analyser, playing, play, stop };
}
