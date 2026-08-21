"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createLiveToken } from "@/lib/ai/live-token";
import { DEFAULT_LIVE_TALK_MODEL, LIVE_TALK_MODELS } from "@/lib/ai/models";
import { getGeminiKey, getLiveModel } from "@/lib/profile";
import { base64ToBytes, pcmToWav } from "@/lib/audio/wav";
import { startMicCapture, IN_RATE, type MicCapture } from "./mic-capture";

/**
 * Gemini Live と**声で**話すセッション。
 *
 * `use-live-session.ts` はテキストだけを送る作りで、マイクも再生も持っていない。
 * ミーティングは「話すのが主・書くのは補い」なので、音の出入りをここで足す。
 *
 * ## 音の決まり（Live API）
 * - 送る音声は **16kHz・16bit・モノラルの生PCM**（`audio/pcm;rate=16000`）
 * - 返る音声は **24kHz** の生PCM。`serverContent.modelTurn.parts[].inlineData` に base64 で来る
 * サンプリングレートが違うので、入力用と出力用の AudioContext を分ける。
 *
 * ## 口パクのための解析器
 * 再生の手前に `AnalyserNode` を挟んで返す。口の形はこの**音の大きさ**で決まるので、
 * 「鳴っているときだけ動く」が自然に成り立つ（`viseme-face.tsx`）。
 *
 * ## 何を返すか
 * 学習者が話した内容は `inputTranscription`、相手の返事は `outputTranscription` で
 * **文字でも**返る。判定と日本語の助言はその文字に対して行う（音のままでは検査できない）。
 *
 * ## こえは「おしている あいだ」だけ 送る（2026-08-18）
 * つないだ あいだ ずっと 送って いたので、教室の ざわめきや 息の 音を
 * Live が「学習者が 話しはじめた」と 受け取り、**相手の セリフを 途中で 止めて**
 * いた——「セリフが 再生されない ときが ある」の 正体が これ。
 * いまは `startTalking()` と `stopTalking()` の あいだだけ 音を 送る。
 * マイクの 口（getUserMedia）は つないだ ままで、**送るか どうか**だけを 切り替える
 *（押すたびに 開き直すと、最初の ひと言が 毎回 消える）。
 */

export type VoiceStatus = "idle" | "connecting" | "live" | "notReady" | "error";

export interface VoiceTurn {
  readonly from: "me" | "client";
  readonly text: string;
}

/*
 * 返る 音声は 24kHz（Live API の 決まり）。**その 数は `src/lib/audio/wav.ts` が 持つ**
 *（`pcmToWav` が WAV の ヘッダに 書き込む）。ここで もう一度 書くと、片方だけ 直して
 * 音が 3倍速に なる 事故が 起きる。送る 側の レートは `mic-capture.ts`。
 */

export interface LiveVoice {
  readonly status: VoiceStatus;
  readonly reason: string | null;
  /** 字幕。AIの聞き取り違いを学習者が目で確かめられるように残す。 */
  readonly turns: readonly VoiceTurn[];
  /**
   * 学習者が**言い終わった**ひとまとまり。判定はこれに対して行う。
   *
   * 聞き取りは細切れで届くので、届いたそばから判定すると「わたしは」だけで
   * 見られることになる。相手が話しはじめた合図（返事の文字起こし）で1つに束ねる。
   * `id` は同じ文をもう一度言ったときにも変わる（判定をやり直せるように）。
   */
  readonly lastUtterance: { id: number; text: string } | null;
  /** 口パクを動かすための解析器（再生の手前）。 */
  readonly analyser: AnalyserNode | null;
  /**
   * 相手の こえが **いま 鳴って いるか**。
   *
   * 画面は これを 見て「聞く ばん」と「話す ばん」を 分ける。相手が 話して いる
   * あいだに マイクを 開けると、スピーカーの 音が 回り込んで そのまま
   * 聞き取りに 混ざる（2026-08-20 に「いろんな 声が 混ざる」として 出た）。
   */
  readonly speaking: boolean;
  /** 予約ずみの こえを 捨てて 黙らせる（つぎの しつもんへ 進む ときに 使う）。 */
  readonly hush: () => void;
  /**
   * `voice` は人物カードで決めた声（characters の voice）。
   * `opening` は **つないだ 直後に 相手へ 渡す 合図**（画面には 出さない）。
   * これが 無いと、Live は 学習者が 何か 言うまで **黙って いる**——学習者からは
   * 「つないだのに 第一声が 無い」に なる（2026-08-18 の指摘）。
   */
  readonly start: (systemInstruction: string, voice?: string, opening?: string) => Promise<void>;
  /** 指示文を 入れ替えて 黙って つなぎ直す（ラウンドの 境目）。 */
  readonly swapInstruction: (systemInstruction: string, voice?: string) => Promise<void>;
  readonly stop: () => void;
  /** 声が使えないときの補い。テキストで送る（相手は声で返す）。 */
  readonly sendText: (text: string) => void;
  /**
   * 進行の 合図（画面には 出さない）。
   *
   * 相手（Live）は 自分の 人格で 自由に 話すので、放っておくと **教材の 質問の 順と
   * ずれる**——画面の 字幕は「お名前を おしえて ください」なのに、相手は
   * 別の 話を 続けて いた（2026-08-18 の指摘）。運転手を 1人に する ため、
   * つぎに 聞く ことは アプリが ここから 伝える。
   * 学習者の 発話では ないので、字幕（`turns`）には 足さない。
   */
  readonly control: (text: string) => void;
  /** いま こえを 送って いるか（ボタンを おしている あいだ）。 */
  readonly talking: boolean;
  /** 送りはじめる（相手が 話して いたら 止める＝割り込み）。 */
  readonly startTalking: () => void;
  /** 送りおわる。ここで「言い終わった」を 相手に 伝える。 */
  readonly stopTalking: () => void;
  /**
   * 相手の 声を 鳴らす 速さ（1 が そのまま）。
   *
   * Live の 設定に 速さの つまみは 無い ので、**鳴らす 側**で 変える。
   * 話して いる 途中でも 変えられる（つぎの ひとことから 効く）。
   */
  readonly setRate: (rate: number) => void;
}

export function useLiveVoice(): LiveVoice {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [reason, setReason] = useState<string | null>(null);
  const [turns, setTurns] = useState<readonly VoiceTurn[]>([]);
  const [lastUtterance, setLastUtterance] = useState<{ id: number; text: string } | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [speaking, setSpeaking] = useState(false);

  /** 聞き取りの途中。相手が話しはじめたら1つに束ねて流す。 */
  const heardRef = useRef("");
  const saidRef = useRef("");
  const utteranceIdRef = useRef(0);

  const sessionRef = useRef<{
    sendRealtimeInput: (input: unknown) => void;
    sendClientContent: (input: unknown) => void;
    close: () => void;
  } | null>(null);
  const micRef = useRef<{ capture: MicCapture; stream: MediaStream } | null>(null);
  const outRef = useRef<Output | null>(null);
  /**
   * いま こえを 送って いるか。
   *
   * state と 別に ref を 持つのは、音を 送る のが **音声スレッドからの コールバック**
   * だから——state を 読むと 前の 値の ままの 関数が 残り、指を はなした あとも
   * しばらく 送りつづける。
   */
  const talkingRef = useRef(false);
  const [talking, setTalking] = useState(false);
  /**
   * 押して いる あいだに ためた 音（まだ 送って いない）。
   *
   * つなぎっぱなしで 流すのを やめ、**止めた ときに まとめて 送る**
   *（2026-08-18 の 指定「もう一度 ストップさせた ときに 音声を 飛ばす」）。
   * 流しながら 送ると、言い直しの 途中の ことばや 息の 音まで 相手に 届き、
   * 言い終わる 前に 返事が 始まる。ためて から 送れば、**言い切ってから 渡せる**。
   */
  const pendingRef = useRef<string[]>([]);
  /** 鳴らす 速さ。つなぐ 前に 決めた ぶんも 覚えて おく（入る 前の 画面で 選べる）。 */
  const rateRef = useRef(1);

  /* ---- 切れた ときに 黙って 張り直す ための 覚え書き（2026-08-21） ---- */
  /** 人が 出た（＝張り直しては いけない）。 */
  const closingRef = useRef(false);
  /** 前に つないだ ときの 引数。張り直しは これで やる。 */
  const argsRef = useRef<{ systemInstruction: string; voice?: string; opening?: string } | null>(
    null,
  );
  /** 続けて 失敗した 回数（3回で あきらめる）。 */
  const retriesRef = useRef(0);
  const retryTimerRef = useRef(0);
  /** `connect` 自身を 呼ぶ ための 参照（自分の 中からは 名前で 呼べない）。 */
  const connectRef = useRef<(s: string, v?: string, o?: string, silent?: boolean) => Promise<void>>(
    async () => {},
  );

  /**
   * つなぎの 後始末。
   *
   * **切れた ときも 同じ 後始末を する**のが 肝（2026-08-21）。前は `onclose` が
   * `status` を idle に するだけで、マイクも AudioContext も 開いた まま、
   * `sessionRef` は 死んだ セッションを 指した ままだった——押して いる 途中で
   * 切れると、**死んだ つなぎに 音を 送りつづけて** いた。
   */
  const teardown = useCallback(() => {
    talkingRef.current = false;
    setTalking(false);
    setSpeaking(false);
    pendingRef.current = [];
    sessionRef.current?.close();
    sessionRef.current = null;
    micRef.current?.capture.stop();
    micRef.current?.stream.getTracks().forEach((t) => t.stop());
    micRef.current = null;
    if (outRef.current) {
      releaseUrl(outRef.current);
      void outRef.current.ctx.close();
    }
    outRef.current = null;
  }, []);

  /**
   * 少し 待ってから 張り直す。
   *
   * 待つのは 0.5秒 → 1秒 → 2秒。すぐ 何度も つなぎに 行くと、上流に 断られて
   * かえって 戻れなく なる。3回 続けて だめなら **その ときだけ** 画面に 出す
   *（黙って いても 直らない ので、学習者に 押して もらう）。
   */
  const retryLater = useCallback(() => {
    if (closingRef.current) return;
    const args = argsRef.current;
    if (!args) return;
    window.clearTimeout(retryTimerRef.current);
    if (retriesRef.current >= 3) {
      teardown();
      setAnalyser(null);
      setStatus("idle");
      return;
    }
    const wait = 500 * 2 ** retriesRef.current;
    retriesRef.current += 1;
    retryTimerRef.current = window.setTimeout(() => {
      void connectRef.current(args.systemInstruction, args.voice, args.opening, true);
    }, wait);
  }, [teardown]);

  /** 予約ずみの こえを 捨てて 黙らせる。つぎの しつもんへ 移る ときに 使う。 */
  const hush = useCallback(() => {
    clearScheduled(outRef.current);
  }, []);

  const stop = useCallback(() => {
    // 人が 出た。切れた ときの 張り直しと 区別する
    closingRef.current = true;
    window.clearTimeout(retryTimerRef.current);
    teardown();
    setAnalyser(null);
    setStatus("idle");
  }, [teardown]);

  const connect = useCallback(
    async (
      systemInstruction: string,
      voice?: string,
      opening?: string,
      /** 切れて 張り直して いる ところか（学習者には 見せない）。 */
      silent = false,
    ) => {
      /*
       * **つなぐ前に、前の つなぎを 閉じる**。閉じずに もう一度 押せた ため、
       * ヘンディさんが 2人ぶん 同時に 話して 声が 混ざった（2026-08-18 の 実発生）。
       */
      teardown();
      closingRef.current = false;
      argsRef.current = { systemInstruction, voice, opening };

      /*
       * 黙って 張り直す ときは **画面を 動かさない**。
       * `status` を connecting に すると 丸い マイクが「スタート」に 戻り、
       * 字幕を 消すと 会話の 記録も 消える——どちらも 学習者から 見れば「切れた」。
       */
      if (!silent) {
        setStatus("connecting");
        setReason(null);
        setTurns([]);
        setLastUtterance(null);
      }
      heardRef.current = "";
      saidRef.current = "";
      talkingRef.current = false;
      setTalking(false);

      const apiKey = getGeminiKey();
      if (!apiKey) {
        setStatus("notReady");
        setReason("noKey");
        return;
      }

      /*
       * 設定してあるモデル → 既定（新しいほう）の順にためす。
       * Live の preview モデルは**名前ごと入れ替わる**ので、前に選んだ名前が
       * 消えていることがある。1つで諦めると、画面には「声は まだ つかえません」
       * としか出ず、キーを疑い続けることになる（2026-08-06 に実際に起きた）。
       */
      const wanted = [getLiveModel(), ...LIVE_TALK_MODELS].filter(
        (name, index, all): name is string => Boolean(name) && all.indexOf(name) === index,
      );
      /*
       * **キーはサーバへ渡さない**（2026-08-17）。短命トークンもこの端末で作る——
       * うちの Worker は香港で動くことがあり、そこを通すと (1) Google に断られ、
       * (2) キーが香港のデータセンターで復号される。通さなければどちらも起きない。
       *
       * 作れないキー（新形式 AQ. で報告あり）のときだけ、本人のキーで直接つなぐ。
       */
      const models = wanted.length > 0 ? wanted : [DEFAULT_LIVE_TALK_MODEL];
      const minted = await createLiveToken({ apiKey });
      const lastReason = minted.ok ? "upstream" : minted.reason;
      const canUseKeyDirectly = lastReason === "tokenRejected" || lastReason === "invalidRequest";
      const auth = minted.ok ? minted.token : canUseKeyDirectly ? apiKey : null;
      const liveModel = models[0] ?? DEFAULT_LIVE_TALK_MODEL;
      if (!auth) {
        setStatus("notReady");
        setReason(lastReason);
        return;
      }

      // マイクは**つなぐ前**に許可を取る。つないでから断られると、
      // 相手だけが話して学習者が答えられない状態で残る
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            // 相手の声がスピーカーから回り込むと、そのまま聞き取りに混ざる
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch {
        setStatus("notReady");
        setReason("noMic");
        return;
      }

      try {
        const { GoogleGenAI, Modality } = await import("@google/genai");
        /*
         * **v1beta で つなぐ**（短命トークンでも）。
         *
         * SDK の 古い 警告（「ephemeral token support is in v1alpha only」）に
         * 従って v1alpha に して みたが、判定の つなぎが **どの モデル名でも
         * つながらなかった**（通し検証・鍵あり・2026-08-20 / reason=modelNotFound）。
         * v1beta の ままの 声の つなぎは 動いて いるので、いまの SDK（v2.16）には
         * この 警告は 当てはまらない と 判断する。
         */
        const ai = new GoogleGenAI({ apiKey: auth, apiVersion: "v1beta" });

        /*
         * 再生側。解析器を挟んでから出す（口の形は ここの 音の 大きさで 決まる）。
         *
         * 鳴らす 口は `<audio>` 1つ。**要素ごとに つなぎ先を 作れるのは 1回だけ**なので、
         * ここで 1度だけ `createMediaElementSource` する（`use-clip-player.ts` と 同じ 形）。
         */
        const outCtx = new AudioContext();
        // 自動再生の制限で止まったまま始まることがある。動かさないと1音も出ない
        if (outCtx.state === "suspended") await outCtx.resume();
        const node = outCtx.createAnalyser();
        node.fftSize = 512;
        node.connect(outCtx.destination);
        const audio = new Audio();
        outCtx.createMediaElementSource(audio).connect(node);
        const out: Output = {
          ctx: outCtx,
          node,
          chunks: [],
          audio,
          url: null,
          rate: rateRef.current,
          setBusy: setSpeaking,
        };
        /*
         * 鳴り終わり・鳴らせなかった ときは **かならず**「話す ばん」へ 戻す。
         * ここが 落ちないと、画面の 触れる ものが 全部 灰色の まま 止まる
         *（`use-clip-player.ts` が 同じ 保険を 持って いる）。
         */
        audio.onended = () => {
          releaseUrl(out);
          out.setBusy(false);
        };
        audio.onerror = () => out.setBusy(false);
        audio.onstalled = () => out.setBusy(false);
        outRef.current = out;
        setAnalyser(node);

        const session = await ai.live.connect({
          model: liveModel,
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction,
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            /*
             * **区切りは こちらが 決める**（自動の 声の 検出を 切る）。
             *
             * 既定では 相手の サーバが 音を 聞いて「話しはじめた・話しおわった」を
             * 自分で 決める。押して 話す 画面と 組み合わせると、押して いる あいだの
             * 息つぎ・教室の ざわめきの たびに 区切りが 立ち、**1回 押しただけで
             * 返事が 2つ 3つ 返って きた**（2026-08-20 の 実発生。前の 話題が
             * 蘇る・声が 重なるのは これが 元）。
             * `activityStart` / `activityEnd` を こちらから 送る 形に すると、
             * **1回 押す ＝ 1つの ターン**が 機械的に 保証される。
             */
            realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
            /*
             * 声は**人物カードで決めたもの**を使う（characters の voice）。
             * 決めていないときは Live の既定に任せる——ここで別の声を勝手に
             * 当てると、まんがのヘンディさんと声が違う人になる。
             * 言語を伝えるのは、日本語として聞き取らせるため。
             */
            speechConfig: {
              languageCode: "ja-JP",
              ...(voice ? { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } : {}),
            },
          },
          callbacks: {
            /*
             * **「したくが できました」まで 話せる ことに しない**（2026-08-20）。
             *
             * つなぎが 開いた 瞬間に ボタンを 生かして いた ため、いちばん 早い
             * 学習者の **1回目の ひとことだけ 拾われなかった**（2回目からは 通る）。
             * したくの 前に 送った 音と 合図は 受け取られない。
             * 合図（`setupComplete`）は SDK が 内側で 受け取る ことも あるので、
             * 開いた あと 少し 待つ 保険も 置く。
             */
            onopen: () => {
              window.setTimeout(() => setStatus("live"), 800);
            },
            onmessage: (message: unknown) => {
              if (isSetupComplete(message)) {
                // つながった。つぎに 切れた ときは また 3回 ためせる
                retriesRef.current = 0;
                setStatus("live");
              }
              /*
               * 文字起こしは**細切れで**届く（「わたしは」「プノンペン」…）。
               * 1つずつ字幕にすると読めないし、途中で判定すると言い終える前に
               * 見られることになる。だから:
               *   聞き取り（学習者）… 相手が話しはじめた合図で 1つに束ねて流す
               *   返事（相手）      … turnComplete で 1つに束ねる
               */
              const piece = readTranscript(message);
              if (piece?.from === "me") heardRef.current += piece.text;
              if (piece?.from === "client") {
                const heard = heardRef.current.trim();
                if (heard) {
                  heardRef.current = "";
                  utteranceIdRef.current += 1;
                  const id = utteranceIdRef.current;
                  setTurns((prev) => [...prev, { from: "me", text: heard }]);
                  setLastUtterance({ id, text: heard });
                }
                saidRef.current += piece.text;
              }
              /*
               * 相手の セリフを 途中で 止められた とき（割り込み）。
               * **鳴って いる 音と ためた かけらを 捨てる**。捨てないと、止めた はずの
               * セリフが あとから まとめて 鳴る。
               */
              /*
               * 途中で 止められた ぶんの **字幕も 捨てる**。捨てないと、言いかけの
               * ことばが `saidRef` に 残り、つぎの 返事と つながって チャット欄に
               * 出る——「話した ことばと 画面の 字が ちがう」の 正体の ひとつ
               *（2026-08-20 の 指摘）。
               */
              if (isInterrupted(message)) {
                clearScheduled(outRef.current);
                saidRef.current = "";
              }
              if (isTurnComplete(message)) {
                if (saidRef.current.trim()) {
                  const said = saidRef.current.trim();
                  saidRef.current = "";
                  setTurns((prev) => [...prev, { from: "client", text: said }]);
                }
                // ためた かけらを 1つの WAV に して 鳴らす（速さは 高さを 保った まま）
                flushTurn(outRef.current);
              }
              for (const pcm of readAudio(message)) keepAudio(outRef.current, pcm);
              /*
               * 「そろそろ 切ります」の 予告。切れる 前に こちらから 張り直す
               *（切れて からだと、その ひとことが 途中で 消える）。
               */
              if (isGoAway(message)) retryLater();
            },
            /*
             * **切れたら 黙って 張り直す**（2026-08-21 の 指定）。
             *
             * 前は `setStatus("idle")` だけで、丸い マイクが「スタート」に 戻って
             * いた。切れる 元は いくつも ある（短命トークンの 30分・セッションの
             * 上限・回線）が、学習者から すれば どれも 同じ「急に 話せなく なった」。
             * 出るのは やめて、こちらで 張り直す。
             */
            onerror: () => retryLater(),
            onclose: () => retryLater(),
          },
        });
        sessionRef.current = session as unknown as NonNullable<typeof sessionRef.current>;

        /*
         * マイク → 16kHz PCM → 送信。落とす処理は mic-capture.ts が持つ
         *（音声スレッドで動かすため。メインスレッドで作っていたころは、画面が
         * 忙しいと語の途中が丸ごと落ちて、何を言っても書き起こしが崩れていた）。
         */
        const capture = await startMicCapture(stream, (pcm) => {
          // 押して いない あいだは 捨てる（口は 開いた まま・音だけ ためない）
          if (!talkingRef.current) return;
          /*
           * **ためずに その場で 送る**。ためて 最後に まとめて 送って いた ころは、
           * 1回目の 返事が 来ない／あとで 2つ まとめて 来る ことが あった
           *（2026-08-18 の 指摘）——相手は 音が 流れて いる あいだに 区切りを
           * 見て いるので、まとめ送りは その 見かたと 合わない。
           */
          sessionRef.current?.sendRealtimeInput({
            audio: {
              data: bytesToBase64(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)),
              mimeType: `audio/pcm;rate=${IN_RATE}`,
            },
          });
        });
        micRef.current = { capture, stream };

        /*
         * つないだ ら、こちらから **1回だけ** 合図を 送る。
         * Live は 話しかけられるまで 黙って いる ので、これが 無いと
         * 学習者は「つないだのに 何も 起きない」画面を 見る ことに なる。
         * 合図そのものは 字幕に 足さない（学習者が 言った ことでは ない）。
         */
        if (opening) {
          session.sendClientContent({
            turns: [{ role: "user", parts: [{ text: opening }] }],
            turnComplete: true,
          });
        }
      } catch {
        stream.getTracks().forEach((t) => t.stop());
        if (silent) {
          retryLater();
          return;
        }
        setStatus("error");
        setReason("connect");
      }
    },
    [teardown, retryLater],
  );

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  /** 学習者が「スタート」を 押した とき（画面を 動かす ふつうの つなぎ）。 */
  const start = useCallback(
    async (systemInstruction: string, voice?: string, opening?: string) => {
      retriesRef.current = 0;
      await connect(systemInstruction, voice, opening, false);
    },
    [connect],
  );

  /**
   * 指示文を 入れ替えて **黙って** つなぎ直す（ラウンドの 境目で 使う）。
   *
   * Live の systemInstruction は **つなぐ ときにしか 渡せない**。会話の 途中で
   * 差し替える 道は 無い ので、入れ替えるには 張り直すしか ない。
   *
   * 合図（`control`）で「ここから ラウンド2」と 送る 道は **採らない**。
   * このやり方は 3回 燃えて いる——「（しんこう）」の 読み上げ・
   * `call:nihongo_no_mikata{…}` の 字幕流出・裏の やりとりが 字に 出る 事故
   *（docs/constraints.md 2026-08-20）。
   *
   * 学習者には 見せない（`silent`）。ラウンドの 境目は **しゅうりょうしょうが
   * 開いて いる 間**で、そこは どのみち マイクに 触れない ので 気づかれない。
   */
  const swapInstruction = useCallback(
    async (systemInstruction: string, voice?: string) => {
      // つないで いない ときは 何も しない（つぎに 押した ときの 指示文が 新しい）
      if (!sessionRef.current) return;
      retriesRef.current = 0;
      await connect(systemInstruction, voice, undefined, true);
    },
    [connect],
  );

  /**
   * 書いて送る。**相手は声で返す**（Live は入力が文字でも音声で答える）。
   * マイクが無い・使いたくない学習者にも、同じ会話の体験を残すため。
   */
  const sendText = useCallback((text: string) => {
    if (!text.trim()) return;
    setTurns((prev) => [...prev, { from: "me", text }]);
    sessionRef.current?.sendClientContent({ turns: text, turnComplete: true });
  }, []);

  /**
   * 話しはじめる。**相手が 話して いたら そこで 止める**（Zoom で 割り込むのと同じ）。
   * 止めないと、自分の こえと 相手の こえが 重なった まま 聞き取りに 入る。
   */
  const startTalking = useCallback(() => {
    pendingRef.current = [];
    clearScheduled(outRef.current);
    /*
     * 前の ターンの **言いかけの 字**を 捨てる。
     * 文字起こしは ターンの 区切りとは **別の 順で** 届く（SDK の 型注記:
     * 「The transcription is independent to the model turn」）ので、残して おくと
     * 遅れて 届いた 断片が つぎの 吹き出しに つながる——「話した ことばと
     * 画面の 字が ちがう」の もう ひとつの 元（2026-08-20 の 指摘）。
     */
    saidRef.current = "";
    heardRef.current = "";
    /*
     * 鳴らす 側が 止まって いる ことが ある（別の タブを 見て 戻って きた あとなど）。
     * 止まった ままだと **予約は 通るのに 音は 1つも 出ない**——画面は 何も 言わない
     * ので、学習者には「返事が 来ない」と しか 見えない。話しはじめる ここで 起こす。
     */
    void outRef.current?.ctx.resume();
    talkingRef.current = true;
    setTalking(true);
    // 「ここから 話す」を こちらから 伝える（自動の 検出は 切って ある）
    sessionRef.current?.sendRealtimeInput({ activityStart: {} });
  }, []);

  /**
   * 話しおわる。**音の 流れの おわり**を 相手に 伝える。
   * 伝えないと、Live は 息つぎの 途中だと 思って 待ちつづける
   *（指を はなしても 何も 返って こない）。
   */
  const stopTalking = useCallback(() => {
    if (!talkingRef.current) return;
    talkingRef.current = false;
    setTalking(false);
    /*
     * 「言い終わった」を 伝える（ここで 相手が 返事を 作りはじめる）。
     * `audioStreamEnd` は **自動の 検出が 生きて いる ときだけ**の 合図なので、
     * 区切りを こちらで 決める いまは `activityEnd` を 送る（SDK の 型注記どおり）。
     */
    sessionRef.current?.sendRealtimeInput({ activityEnd: {} });
  }, []);

  /** 進行の 合図。学習者の ことばでは ないので 字幕に 残さない。 */
  const control = useCallback((text: string) => {
    if (!text.trim()) return;
    sessionRef.current?.sendClientContent({
      turns: [{ role: "user", parts: [{ text }] }],
      turnComplete: true,
    });
  }, []);

  const setRate = useCallback((rate: number) => {
    rateRef.current = rate;
    if (!outRef.current) return;
    outRef.current.rate = rate;
    // 鳴って いる 途中でも すぐ 効く（高さは `preservesPitch` が 守る）
    outRef.current.audio.playbackRate = rate;
  }, []);

  return {
    status,
    reason,
    turns,
    lastUtterance,
    speaking,
    hush,
    analyser,
    start,
    swapInstruction,
    stop,
    sendText,
    control,
    talking,
    startTalking,
    stopTalking,
    setRate,
  };
}

/**
 * 鳴らす側の 入れ物。
 *
 * ## かけらを ためて、ターンの おわりに 1つの 音に する（2026-08-21）
 * 前は 届いた かけらを Web Audio で 順に 予約して いた。それだと **速さを 変えると
 * 声の 高さまで 変わる**（`playbackRate` は 音を そのまま 引きのばす）ので、
 * 「ゆっくり」は プロンプトで 頼むしか なく、効いたり 効かなかったり して いた。
 *
 * いまは **ターンぶんを ためて WAV に し、`<audio>` で 鳴らす**。
 * `<audio>` は `preservesPitch` が 効くので、**高さを 保った まま 速さだけ** 変わる
 *（作り置きの 音＝`use-clip-player.ts` と 同じ やり方）。
 * 先に 同じ ことを した 実装（質問ゲーム）も この 形で 本番運用して いた。
 */
interface Output {
  ctx: AudioContext;
  node: AnalyserNode;
  /** ターンぶんの かけら（`turnComplete` で 1つに して 鳴らす）。 */
  chunks: Uint8Array[];
  /** 鳴らす 口。**1つを 使い回す**（要素ごとに つなぎ先を 作れるのは 1回だけ）。 */
  audio: HTMLAudioElement;
  /** いま 鳴らして いる Blob の URL（鳴り終わったら 捨てる）。 */
  url: string | null;
  /** 鳴らす 速さ（学習者が 選ぶ）。 */
  rate: number;
  /** 鳴って いる／いないを 画面へ 伝える（「聞く ばん」の 判定に 使う）。 */
  setBusy: (busy: boolean) => void;
}

/** 相手の したくが 済んだか（ここから 送ってよい）。 */
function isSetupComplete(message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  return (message as { setupComplete?: unknown }).setupComplete !== undefined;
}

/** 「そろそろ 切ります」の 予告が 来たか。 */
function isGoAway(message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  return (message as { goAway?: unknown }).goAway !== undefined;
}

/** 相手の セリフが 割り込まれたか。 */
function isInterrupted(message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  const content = (message as { serverContent?: { interrupted?: unknown } }).serverContent;
  return content?.interrupted === true;
}

/** 鳴って いる 音と、ためて いる かけらを 捨てる（割り込み・つぎの しつもんへ 進む とき）。 */
function clearScheduled(out: Output | null): void {
  if (!out) return;
  out.chunks = [];
  try {
    out.audio.pause();
  } catch {
    // もう 止まって いる ものは 止められない（それで よい）
  }
  releaseUrl(out);
  out.setBusy(false);
}

/** 鳴らし終わった Blob の URL を 返す（ターンの たびに 増やさない）。 */
function releaseUrl(out: Output): void {
  if (!out.url) return;
  URL.revokeObjectURL(out.url);
  out.url = null;
}

/** 相手が話し終わったか（返事を1つに束ねる合図）。 */
function isTurnComplete(message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  const content = (message as { serverContent?: { turnComplete?: unknown } }).serverContent;
  return content?.turnComplete === true;
}

/**
 * 届いた かけらを ためる。
 *
 * **ためて いる あいだも「相手の ばん」に する**（`setBusy(true)`）。
 * 鳴って いない＝話す ばん、に して しまうと、返事が 始まる 前に 学習者が
 * マイクを 開けて しまう（ためる 作りに した ことで 生まれた 穴）。
 */
function keepAudio(out: Output | null, pcm: Uint8Array) {
  if (!out) return;
  out.chunks.push(pcm);
  out.setBusy(true);
}

/**
 * ためた かけらを 1つの WAV に して 鳴らす（ターンの おわり）。
 *
 * 速さは `<audio>` の `playbackRate`。`preservesPitch` が 効くので
 * **声の 高さは 変わらない**（2026-08-18 に「トーンまで 下がる」と 指摘された ところ）。
 */
function flushTurn(out: Output | null) {
  if (!out || out.chunks.length === 0) return;
  const total = out.chunks.reduce((sum, part) => sum + part.byteLength, 0);
  const pcm = new Uint8Array(total);
  let at = 0;
  for (const part of out.chunks) {
    pcm.set(part, at);
    at += part.byteLength;
  }
  out.chunks = [];

  // 止まって いたら 起こす（別の タブから 戻った あとは 止まって いる ことが ある）
  if (out.ctx.state === "suspended") void out.ctx.resume();
  releaseUrl(out);
  out.url = URL.createObjectURL(pcmToWav(pcm));
  out.audio.src = out.url;
  out.audio.currentTime = 0;
  out.audio.preservesPitch = true;
  out.audio.playbackRate = out.rate;
  out.setBusy(true);
  void out.audio.play().catch(() => {
    // 鳴らせなかった ときも「相手の ばん」で 止めない（字幕は 出て いる）
    out.setBusy(false);
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** 音声の塊を取り出す（形が変わっても落ちないようにする）。 */
function readAudio(message: unknown): Uint8Array[] {
  if (!message || typeof message !== "object") return [];
  const content = (message as { serverContent?: Record<string, unknown> }).serverContent;
  const parts = (content?.modelTurn as { parts?: { inlineData?: { data?: string } }[] } | undefined)
    ?.parts;
  if (!parts) return [];
  return parts.flatMap((p) => (p.inlineData?.data ? [base64ToBytes(p.inlineData.data)] : []));
}

/** 字幕にする1行を取り出す。 */
function readTranscript(message: unknown): VoiceTurn | null {
  if (!message || typeof message !== "object") return null;
  const content = (message as { serverContent?: Record<string, unknown> }).serverContent;
  if (!content) return null;
  const output = content.outputTranscription as { text?: string } | undefined;
  if (output?.text) return { from: "client", text: output.text };
  const input = content.inputTranscription as { text?: string } | undefined;
  if (input?.text) return { from: "me", text: input.text };
  return null;
}
