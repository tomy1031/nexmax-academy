"use client";

/**
 * マイク → 16kHz・16bit・モノラルの生PCM（Live に送れる形）
 *
 * ## なぜ書き直したか（聞き取りが ひどかった原因）
 * 1. `new AudioContext({ sampleRate: 16000 })` を**あてにしていた**。この指定を
 *    守らないブラウザがあり、そこでは 48kHz の音を「16kHz です」と言って送っていた。
 *    受け取る側は3倍の速さで再生したのと同じ音を聞くので、**何を言っても
 *    正しく書き起こされない**。いまは実際のサンプリングレートを読み、こちらで
 *    16kHz へ落とす。
 * 2. `ScriptProcessorNode` は**メインスレッドで動く**。React の再描画や画像の
 *    読み込みで詰まると、その間の音が丸ごと落ちる（語の途中が消える）。
 *    AudioWorklet は音声スレッドで動くので、画面が忙しくても途切れない。
 * 3. 自動再生の制限で AudioContext が `suspended` のまま始まることがある。
 *    そのときは1フレームも届かないので、必ず `resume()` する。
 *
 * ScriptProcessor は**古いブラウザ向けの控え**として残す（AudioWorklet が
 * 無い環境で、音が1つも送れないよりはよい）。
 */

/** Live API が受け取る入力のサンプリングレート。 */
export const IN_RATE = 16_000;

/** 1回に送る長さ（16kHzで約128ms）。短いと通信が増え、長いと返事が遅れる。 */
const FRAME = 2048;

/**
 * 音声スレッドで動く処理。**ここで 16kHz に落として**から本体へ渡す。
 *
 * 線形補間で間を作る（単純な間引きだと、高い音が折り返して雑音になる）。
 * Blob から読み込むので、ここは文字列で持つ（別ファイルにすると
 * デプロイ先ごとに置き場所の面倒を見ることになる）。
 */
const WORKLET_SOURCE = `
class PcmPump extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.ratio = options.processorOptions.inRate / options.processorOptions.outRate;
    this.frame = options.processorOptions.frame;
    this.buffer = new Float32Array(0);
    this.out = new Int16Array(this.frame);
    this.filled = 0;
    this.position = 0;
  }
  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;
    // 前回の余りと今回ぶんをつなぐ（境目で音が飛ばないように）
    const merged = new Float32Array(this.buffer.length + input.length);
    merged.set(this.buffer, 0);
    merged.set(input, this.buffer.length);

    let at = this.position;
    while (at < merged.length - 1) {
      const index = Math.floor(at);
      const fraction = at - index;
      const sample = merged[index] * (1 - fraction) + merged[index + 1] * fraction;
      const clamped = Math.max(-1, Math.min(1, sample));
      this.out[this.filled] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      this.filled += 1;
      if (this.filled === this.frame) {
        const copy = this.out.slice(0);
        this.port.postMessage(copy.buffer, [copy.buffer]);
        this.filled = 0;
      }
      at += this.ratio;
    }
    const keep = Math.floor(at);
    this.buffer = merged.slice(keep);
    this.position = at - keep;
    return true;
  }
}
registerProcessor("pcm-pump", PcmPump);
`;

export interface MicCapture {
  readonly stop: () => void;
}

/**
 * マイクを開いて、16kHzのPCMを `onChunk` に流し続ける。
 * 返ってきた `stop` を呼ぶまで動く。
 */
export async function startMicCapture(
  stream: MediaStream,
  onChunk: (pcm: Int16Array) => void,
): Promise<MicCapture> {
  // レートは**指定しない**。ブラウザが実際に使う値を読んで、こちらで落とす
  const ctx = new AudioContext();
  if (ctx.state === "suspended") await ctx.resume();
  const source = ctx.createMediaStreamSource(stream);

  if (ctx.audioWorklet) {
    const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "text/javascript" }));
    try {
      await ctx.audioWorklet.addModule(url);
      const node = new AudioWorkletNode(ctx, "pcm-pump", {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        processorOptions: { inRate: ctx.sampleRate, outRate: IN_RATE, frame: FRAME },
      });
      node.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        onChunk(new Int16Array(event.data));
      };
      source.connect(node);
      return {
        stop: () => {
          node.port.onmessage = null;
          node.disconnect();
          source.disconnect();
          void ctx.close();
        },
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // ---- 控え（AudioWorklet が無い環境） -------------------------------------
  const pump = ctx.createScriptProcessor(4096, 1, 1);
  const ratio = ctx.sampleRate / IN_RATE;
  pump.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    const length = Math.floor(input.length / ratio);
    const pcm = new Int16Array(length);
    for (let i = 0; i < length; i += 1) {
      const at = i * ratio;
      const index = Math.floor(at);
      const fraction = at - index;
      const sample = (input[index] ?? 0) * (1 - fraction) + (input[index + 1] ?? 0) * fraction;
      const clamped = Math.max(-1, Math.min(1, sample));
      pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }
    onChunk(pcm);
  };
  // ScriptProcessor は出力へつながないと動かない。音は出さないので無音へ落とす
  const mute = ctx.createGain();
  mute.gain.value = 0;
  source.connect(pump);
  pump.connect(mute);
  mute.connect(ctx.destination);
  return {
    stop: () => {
      pump.onaudioprocess = null;
      pump.disconnect();
      mute.disconnect();
      source.disconnect();
      void ctx.close();
    },
  };
}
