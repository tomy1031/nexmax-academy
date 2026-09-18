"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  authFromToken,
  connectLiveInOrder,
  createSetupGate,
  FIRST_AUTH_FRESH_MS,
  LIVE_SETUP_TIMEOUT_MS,
  LiveSetupError,
  reasonFromClose,
  startingWith,
} from "@/lib/ai/live-connect";
import {
  describeClose,
  describeError,
  describeStream,
  liveDebug,
  noteMicPermission,
  pcmPeak,
} from "@/lib/ai/live-debug";
import { createLiveToken } from "@/lib/ai/live-token";
import { DEFAULT_LIVE_TALK_MODEL, LIVE_TALK_MODELS } from "@/lib/ai/models";
import { getGeminiKey, getLiveModel } from "@/lib/profile";
import { base64ToBytes } from "@/lib/audio/wav";
import { startMicCapture, IN_RATE, type MicCapture } from "@/components/meeting/mic-capture";

/**
 * たいわ（scenario）の Live セッション — **声で話し、声で返る**。
 *
 * つなぎ方（設計03 §2 / AGENTS.md 規律4）:
 *   1. サーバの /api/live/token に短命トークンを取りに行く
 *   2. ブラウザが そのトークンだけで Live に直接つなぐ
 * APIキーはクライアントに渡らない。サーバは音声を中継しない。
 *
 * ## 以前は「話せない たいわ」だった
 * ここは長いあいだテキストだけを送る作りで、マイクも再生も持っていなかった。
 * 画面には「🎙️ 話しはじめる」と出るのに、話した声はどこにも送られず、
 * 相手の声も鳴らない。学習者から見ると**何をしても無反応**だった。
 * いまはマイクを開いて 16kHz PCM を送り、返る 24kHz を鳴らす
 *（音の決まりと理由は `src/components/meeting/mic-capture.ts` の冒頭）。
 *
 * ## ミーティング（use-live-voice）と分けてある理由
 * 唯一にして重要な違いは **マイクを断られても会話を続ける** こと。
 * たいわは書いて送る道が教材の正規ルートとして残っている（音が使えない教室・
 * 端末がある）ので、マイクが無いことを理由に接続そのものを止めない。
 * 低い層（PCM化・base64）は meeting のものをそのまま使い、再実装しない。
 * TODO: 2つの Live フックの共通部分を `src/lib/live/` に寄せる。
 *       meeting 側にも触る横断変更なので、専用タスクとして出す（AGENTS.md 多スレッド運用）。
 *
 * ## 判定にかける単位（lastUtterance）
 * 文字起こしは細切れで届く（「わたしは」「けんしょう」…）。届いたそばから
 * 判定すると「わたしは」だけで見られることになるので、**相手が話しはじめた合図で
 * 1つに束ねて**から渡す（use-live-voice と同じ約束）。
 *
 * キーが未登録のときは status="notReady" になり、画面は理由つきの案内に落ちる。
 *
 * ## つなぎ直しの 世代（epoch）— 2026-09-08
 * 3人の たいわ は 相手を かえる たびに `disconnect()` → `connect()` する。世代を 持たないと、
 * **閉じた 側の コールバックが 生きたまま 新しい つなぎの state を 書く**——古い close が
 * あとから 届いて「話しはじめる」に 戻る、前の 人の 声が 新しい 出力から 鳴る、つなぎ途中に
 * 切りかえると まだ null の session を 閉じられず 居座る（マイク・AudioContext も 漏れる）。
 * `connect` は 自分の 世代を 持ち、await の あとと コールバックの 中で 世代を 確かめる。
 * ちがえば **何も せず 片づけて 帰る**（call-shell の `cancelled` と 同じ 型）。
 *
 * ## 🎤 が オンの あいだだけ 送る — 2026-09-16
 * 前は つないで いる あいだ ずっと マイクの 音を 送り、区切りは 相手（自動の 検出）に
 * まかせて いた。教室の 声・となりの 学習者の 声まで 相手に 届き、ミーティングで 覚えた
 *「🎤を 押して 話す」とも ちがって いた（ユーザーの 指定「マイクを 押している 間だけの
 * 利用が 前提」）。いまは ミーティング（use-live-voice）と 同じ 約束:
 *   - 自動の 区切りを 切り、`startTalking` / `stopTalking` で activityStart / activityEnd を 送る
 *   - マイクは つないで いる あいだ 開いて いるが、**オフの あいだの 音は 端末で 捨てる**
 *   - オンに したとき 相手が 話して いたら、鳴って いる 音を そこで 止める
 */

export type LiveStatus = "idle" | "connecting" | "live" | "notReady" | "error";

export interface LiveTurn {
  readonly from: "client" | "me";
  readonly text: string;
  /**
   * 学習者が **どうやって** 出したか（`from: "me"` のときだけ 意味が ある）。
   *
   * 画面には 出さない。台帳（`talk_turn_logs`）が 分けて 数える ため——
   * 声で 話した 回数が 0 の 学習者は、マイクが 使えて いない 合図である
   *（`meeting_turn_logs.mode` と 同じ 分けかた）。ここで 持たずに あとから
   * 文字列を 見比べて 当てようとすると、同じ 文を 打っても 話しても 見分けが つかない。
   */
  readonly mode: "text" | "voice";
}

/** 返る音声のサンプリングレート（Live API の決まり）。送る側は mic-capture.ts が持つ。 */
const OUT_RATE = 24_000;

/** Live の つなぎの うち、ここで 使う ぶんだけ（SDK の 形が 変わっても 追いやすい）。 */
interface LiveSocket {
  sendRealtimeInput: (input: unknown) => void;
  sendClientContent: (input: unknown) => void;
  close: () => void;
}

export interface LiveSession {
  readonly status: LiveStatus;
  /**
   * うまくいかなかった理由の名前（badKey / noPermission / modelNotFound /
   * rateLimited / upstream / noKey / connect）。画面に出す言い方は呼ぶ側が決める。
   *
   * ここを持たずに status だけ返していたころは、キーを入れた先生に
   * 「じゅんびちゅう」としか出せず、何を直せばよいか分からなかった。
   */
  readonly reason: string | null;
  /** 字幕（Q&A表示）。AIの誤判定を学習者が目で確認できるように残す。 */
  readonly transcript: readonly LiveTurn[];
  /**
   * 学習者が**言い終わった**ひとまとまり。要件ボードの判定はこれに対して行う。
   * `id` は同じ文をもう一度言ったときにも増える（判定をやり直せるように）。
   */
  readonly lastUtterance: { id: number; text: string } | null;
  /**
   * マイクが使えているか。false でも会話は続く（書いて送る道が残る）ので、
   * 画面は「声は使えないが、書けば進める」と伝えるために使う。
   */
  readonly voiceOn: boolean;
  /** 🎤 が オンか。**オンの あいだだけ** マイクの 音を 送る。 */
  readonly talking: boolean;
  /** 🎤 を オンに する（相手が 話して いたら 止める）。 */
  readonly startTalking: () => void;
  /** 🎤 を オフに する（ここで 相手が 返事を 作りはじめる）。 */
  readonly stopTalking: () => void;
  /** `voice` は人物カードで決めた声（scenario の client.voice）。 */
  readonly connect: (systemInstruction: string, voice?: string) => Promise<void>;
  readonly disconnect: () => void;
  readonly send: (text: string) => void;
}

export function useLiveSession(): LiveSession {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [reason, setReason] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<readonly LiveTurn[]>([]);
  const [lastUtterance, setLastUtterance] = useState<{ id: number; text: string } | null>(null);
  const [voiceOn, setVoiceOn] = useState(false);
  const [talking, setTalking] = useState(false);
  /** マイクの 音を 送って よいか（音声スレッドの 呼び戻しから 読むので ref でも 持つ）。 */
  const talkingRef = useRef(false);

  /** 聞き取りの途中。相手が話しはじめたら1つに束ねて流す。 */
  const heardRef = useRef("");
  const saidRef = useRef("");
  const utteranceIdRef = useRef(0);

  const sessionRef = useRef<LiveSocket | null>(null);
  const micRef = useRef<{ capture: MicCapture; stream: MediaStream } | null>(null);
  const outRef = useRef<Output | null>(null);
  /** いまの つなぎの 世代。`connect` と `disconnect` の たびに 進む。 */
  const epochRef = useRef(0);
  /** マイクの 音の 数（`?debug=1` の 記録用。use-live-voice と 同じ）。 */
  const micStatsRef = useRef({ frames: 0, sent: 0, peak: 0 });

  /** 持って いる ものを 全部 止める（状態は 触らない）。 */
  const release = useCallback(() => {
    // 閉じた つなぎに 音を 送らない（つぎの つなぎも オフから 始める）
    talkingRef.current = false;
    sessionRef.current?.close();
    sessionRef.current = null;
    micRef.current?.capture.stop();
    micRef.current?.stream.getTracks().forEach((track) => track.stop());
    micRef.current = null;
    void outRef.current?.ctx.close();
    outRef.current = null;
  }, []);

  /**
   * 聞き取りの かけらを 1つの 発話に 束ねて 流す（判定・字幕へ）。相手が 話しはじめた ときに 呼ぶ。
   */
  const flushHeard = useCallback(() => {
    const heard = heardRef.current.trim();
    heardRef.current = "";
    if (!heard) return;
    liveDebug("taiwa.utterance", heard);
    utteranceIdRef.current += 1;
    const id = utteranceIdRef.current;
    setTranscript((prev) => [...prev, { from: "me", text: heard, mode: "voice" }]);
    setLastUtterance({ id, text: heard });
  }, []);

  const disconnect = useCallback(() => {
    epochRef.current += 1;
    release();
    setTalking(false);
    setVoiceOn(false);
    setStatus("idle");
    setReason(null);
  }, [release]);

  /*
   * **画面から 消える ときは 必ず 閉じる**（2026-09-16・use-live-voice と 同じ）。
   * 🎤 が オンの まま「ステージに もどる」を 押すと、画面は 消えても つなぎと マイクが
   * 残り、**教室の 音を 送りつづけて いた**（止める ボタンは もう 画面に 無い）。
   */
  useEffect(() => {
    return () => {
      epochRef.current += 1;
      release();
    };
  }, [release]);

  const connect = useCallback(
    async (systemInstruction: string, voice?: string) => {
      // 前の つなぎが 残って いても、ここで 必ず 片づけてから 始める（二重接続を 作らない）
      epochRef.current += 1;
      const epoch = epochRef.current;
      const stale = () => epoch !== epochRef.current;
      release();
      setStatus("connecting");
      setReason(null);
      setTranscript([]);
      setLastUtterance(null);
      setVoiceOn(false);
      setTalking(false);
      heardRef.current = "";
      saidRef.current = "";

      const apiKey = getGeminiKey();
      if (!apiKey) {
        // 鍵は 画面の 源（本番・STG・ブランチの URL）ごとに 別
        liveDebug("taiwa.key", "none on this origin", true);
        setStatus("notReady");
        setReason("noKey");
        return;
      }

      /*
       * 本人のキーはこの端末に保存されている（はじめの設定ウィザードで登録）。
       * **キーはサーバへ渡さない**（2026-08-17）。短命トークンもこの端末で作る——
       * うちの Worker は香港で動くことがあり、そこを通すと(1) Google に断られ、
       * (2) キーが香港で復号される。両方とも、通さなければ起きない。
       *
       * 設定してあるモデル → 既定（新しいほう）の順にためす。Live の preview モデルは
       * **名前ごと入れ替わる**ので、前に選んだ名前が消えていることがある。1つで諦めると
       * 画面には「じゅんびちゅう」としか出ず、キーを疑い続けることになる（2026-08-06 実発生）。
       */
      const wanted = [getLiveModel(), ...LIVE_TALK_MODELS].filter(
        (name, index, all): name is string => Boolean(name) && all.indexOf(name) === index,
      );
      const models = wanted.length > 0 ? wanted : [DEFAULT_LIVE_TALK_MODEL];
      /*
       * 短命トークンが作れないキーでも、たいわを止めない（2026-08-17）
       *
       * Google は APIキーを 新形式（`AQ.` で はじまる auth key）へ 移していて、
       * 新形式は **authTokens.create だけ 通らない**という 報告がある。旧形式は
       * 2026年9月に 廃止される。ここで 諦めると、その日に たいわが 全滅する。
       *
       * 最後の手段として、本人のキーで 直接つなぐ。キーは もともと この端末に
       * ある（BYOK）ので 新しく 配るわけでは ないが、「漏れても30分で 切れる」
       * 効き目は 失う。だから **トークンが 作れなかったときだけ**に 限る。
       * 権限・使いすぎの ときは 直接つないでも 同じなので 落ちるに まかせる
       *（`authFromToken`）。
       *
       * 1枚目は マイクの 許可を 聞く 前に 作って 鍵を 確かめ、先頭の モデルで 使う。
       * トークンは 1回 使い切りなので、2つ目の モデルからは 作り直す（`connectLiveInOrder`）。
       * 許可ダイアログで 時間が たったら 1枚目も 作り直す（`FIRST_AUTH_FRESH_MS`）。
       */
      liveDebug("taiwa.start", `models=${models.join(",")}`);
      const mint = async () => {
        const minted = await createLiveToken({ apiKey });
        const auth = authFromToken(minted, apiKey);
        liveDebug(
          "taiwa.token",
          minted.ok ? "ok" : auth.ok ? `${minted.reason} -> key direct` : minted.reason,
          !auth.ok,
        );
        return auth;
      };
      const first = await mint();
      const firstFreshUntil = Date.now() + FIRST_AUTH_FRESH_MS;
      if (stale()) return;
      if (!first.ok) {
        setStatus("notReady");
        setReason(first.reason);
        return;
      }

      /*
       * マイクは**つなぐ前**に許可を取る。つないでから断られると、相手だけが話して
       * 学習者が答えられない状態で残る。
       * ただし**断られても止めない**——書いて送れば会話は成り立つ（劣化運転）。
       */
      let stream: MediaStream | null = null;
      noteMicPermission("taiwa");
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
        liveDebug("taiwa.mic", describeStream(stream));
      } catch (error) {
        // 書いて 送る 道は 残る（劣化運転）。原因は ブラウザの エラー名で 分かる
        liveDebug("taiwa.mic", describeError(error), true);
        stream = null;
      }
      if (stale()) {
        stream?.getTracks().forEach((track) => track.stop());
        return;
      }

      /*
       * **マイクの 流れは `micRef` に 渡し終える まで この 関数の もの**（2026-09-16）。
       * 渡す 前に 抜けたら（どの モデルにも つながらない・世代が かわった）`finally` で 止める。
       */
      let handedOff = false;
      try {
        // SDK は接続時にだけ要る。初期表示のバンドルに載せない。
        const { GoogleGenAI, Modality } = await import("@google/genai");
        if (stale()) return;

        // 再生側。24kHz で受けて、切れ目なく順に鳴らす（モデルを 何度 ためしても 1つを 使う）
        const outCtx = new AudioContext({ sampleRate: OUT_RATE });
        // 自動再生の制限で止まったまま始まることがある。動かさないと1音も出ない
        if (outCtx.state === "suspended") await outCtx.resume();
        liveDebug(
          "taiwa.out",
          `${outCtx.state} ${outCtx.sampleRate}Hz`,
          outCtx.state !== "running",
        );
        if (stale()) {
          void outCtx.close();
          return;
        }
        const node = outCtx.createGain();
        node.connect(outCtx.destination);
        const out: Output = { ctx: outCtx, node, playAt: 0, sources: [] };
        outRef.current = out;

        /** 1つの モデルで つなぐ。したくの 合図まで 待ち、断られたら 投げる。 */
        const open = async (
          auth: string,
          model: string,
          claim: (session: LiveSocket) => boolean,
        ): Promise<LiveSocket> => {
          const ai = new GoogleGenAI({ apiKey: auth, apiVersion: "v1beta" });
          // 期限の あとに 遅れて つながった ものも、まだ どれも 決まって いなければ 使う
          const gate = createSetupGate<LiveSocket>(undefined, claim);
          /**
           * この つなぎからの 届きものを 受け取って よいか。古い 世代・断られた つなぎ・
           * 期限を 過ぎて まだ 使うか 決まって いない つなぎ（`late`）は 捨てる。
           */
          const mine = () => {
            const phase = gate.phase();
            return !stale() && (phase === "waiting" || phase === "ready");
          };

          const connecting = ai.live.connect({
            model,
            config: {
              responseModalities: [Modality.AUDIO],
              systemInstruction,
              // 文字起こしを必ず出す。学習者が「何を言ったか」を目で確かめられるようにする。
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              /*
               * **区切りは こちらが 決める**（自動の 声の 検出を 切る・2026-09-16）。
               * 🎤 を オンに した ときに activityStart、オフに した ときに activityEnd を 送る。
               * 自動の まま だと、オフの あいだは 音が 来ない ので 区切りが 立たず、
               * オンの あいだの 息つぎでも 区切りが 立って 返事が 割り込む（ミーティングで 実発生）。
               */
              realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
              /*
               * 声は**人物カードで決めたもの**を使う（scenario の client.voice）。
               * 決めていないときは Live の既定に任せる——ここで別の声を勝手に当てると、
               * まんがや ミーティングと 声が 違う人になる。
               */
              speechConfig: {
                languageCode: "ja-JP",
                ...(voice ? { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } : {}),
              },
            },
            callbacks: {
              onmessage: (message: unknown) => {
                // 閉じた 世代・断られた つなぎからの 届きもの（声・字幕）は 捨てる。新しい 相手の 名で 出て しまう
                if (!mine()) return;
                /*
                 * 文字起こしは**細切れで**届く。1つずつ字幕にすると読めないし、
                 * 途中で判定すると言い終える前に見られることになる。だから:
                 *   聞き取り（学習者）… 相手が話しはじめた合図で 1つに束ねて流す
                 *   返事（相手）      … turnComplete で 1つに束ねる
                 */
                const piece = readTranscript(message);
                if (piece)
                  liveDebug(piece.from === "me" ? "taiwa.heard" : "taiwa.said", piece.text);
                if (piece?.from === "me") heardRef.current += piece.text;
                if (piece?.from === "client") {
                  flushHeard();
                  saidRef.current += piece.text;
                }
                /*
                 * 相手の セリフを 途中で 止められた とき（割り込み）。3.8 は 書いて 送ると
                 * 話して いる 最中でも 止める。**鳴らす 予約と 言いかけの 字を 捨てる**——
                 * 捨てないと 止めた はずの 声が 鳴りつづけ、言いかけが つぎの 返事と
                 * 1つの 吹き出しに つながる（use-live-voice と 同じ 扱い）。
                 */
                if (isInterrupted(message)) {
                  liveDebug("taiwa.interrupted");
                  clearScheduled(out);
                  saidRef.current = "";
                }
                if (isTurnComplete(message) && saidRef.current.trim()) {
                  const said = saidRef.current.trim();
                  saidRef.current = "";
                  setTranscript((prev) => [...prev, { from: "client", text: said, mode: "voice" }]);
                }
                for (const pcm of readAudio(message)) play(out, pcm);
              },
              /*
               * したくの 前の 切断は「この モデルに 断られた」——門を 落として つぎの
               * モデルへ 進む（SDK の connect は 断られても 返らない）。
               * つないだ あとの 切断だけを 画面の 状態に する。
               */
              onerror: (error: unknown) => {
                const phase = gate.phase();
                liveDebug(
                  "taiwa.error",
                  `${model} ${phase} ${describeError(error)}`,
                  phase !== "abandoned",
                );
                if (phase === "waiting" || phase === "late") gate.fail("upstream");
                else if (mine()) {
                  talkingRef.current = false;
                  setTalking(false);
                  setStatus("error");
                }
              },
              onclose: (event: unknown) => {
                const phase = gate.phase();
                liveDebug(
                  "taiwa.closed",
                  `${model} ${phase} ${describeClose(event)}`,
                  phase !== "abandoned" && !stale(),
                );
                if (phase === "waiting" || phase === "late") gate.fail(reasonFromClose(event));
                else if (mine()) {
                  talkingRef.current = false;
                  setTalking(false);
                  setStatus("idle");
                }
              },
            },
          });
          liveDebug("taiwa.model", `${model} try`);
          const triedAt = Date.now();
          try {
            const session = await gate.wait(connecting as unknown as Promise<LiveSocket>);
            liveDebug("taiwa.model", `${model} ready ${Date.now() - triedAt}ms`);
            return session;
          } catch (error) {
            const why = error instanceof LiveSetupError ? error.reason : describeError(error);
            liveDebug(
              "taiwa.model",
              `${model} ${why} ${Date.now() - triedAt}ms`,
              why !== "superseded",
            );
            throw error;
          }
        };

        const connected = await connectLiveInOrder({
          models,
          mint: startingWith(first, mint, firstFreshUntil),
          open,
          stop: stale,
          // 期限切れで 待って いる つなぎが あれば、決める 前に 少し 待つ（遅い 回線）
          lateGraceMs: LIVE_SETUP_TIMEOUT_MS,
        });
        liveDebug(
          "taiwa.connect",
          connected.ok ? `ok ${connected.model}` : `${connected.stage} ${connected.reason}`,
          !connected.ok,
        );
        if (stale()) {
          // つなぎ途中に 相手が かわった。届いた セッションは 使わずに 閉じる（居座らせない）
          // 再生は 次の つなぎ（か 切断）の 片づけが もう 閉じた（二度 閉じると 投げる）
          if (connected.ok) connected.session.close();
          return;
        }
        if (!connected.ok) {
          /*
           * 理由の 名前は これまでの 体系の まま——鍵の 問題なら その 名前、使いすぎで
           * 閉じられたら rateLimited（「きょうは つかいすぎた」）、ほかで つながらなければ connect。
           */
          release();
          if (connected.stage === "auth") {
            setStatus("notReady");
            setReason(connected.reason);
          } else {
            setStatus("error");
            setReason(connected.reason === "rateLimited" ? "rateLimited" : "connect");
          }
          return;
        }
        const session = connected.session;
        sessionRef.current = session;

        /*
         * マイク → 16kHz PCM → 送信。落とす処理は mic-capture.ts が持つ
         *（音声スレッドで動かすため。メインスレッドで作ると、画面が忙しいときに
         * 語の途中が丸ごと落ちて、何を言っても書き起こしが崩れる）。
         */
        if (stream) {
          micStatsRef.current = { frames: 0, sent: 0, peak: 0 };
          const capture = await startMicCapture(stream, (pcm) => {
            micStatsRef.current.frames += 1;
            // 🎤 が オフの あいだの 音は **送らずに 捨てる**（教室の 声を 相手に 届けない）
            if (stale() || !talkingRef.current) return;
            micStatsRef.current.sent += 1;
            micStatsRef.current.peak = Math.max(micStatsRef.current.peak, pcmPeak(pcm));
            sessionRef.current?.sendRealtimeInput({
              audio: {
                data: bytesToBase64(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)),
                mimeType: `audio/pcm;rate=${IN_RATE}`,
              },
            });
          });
          if (stale()) {
            capture.stop();
            return;
          }
          micRef.current = { capture, stream };
          handedOff = true;
          setVoiceOn(true);
        }
        /*
         * SDK の connect は したくの 合図を 受け取ってから 返る。ここで はじめて「つながった」。
         * 前は つなぎが 開いた 瞬間に live に して いたので、**断られる モデルでも**
         * 一瞬 つながった 画面に なった（2026-09-16）。
         * **マイクの 用意が 済んでから** live に する——先に live に すると、用意の あいだ
         * 画面が「マイクは つかえません」に 切りかわって 🎤 が 一瞬 消える。
         */
        setStatus("live");
      } catch (error) {
        // 画面には 出さない（下の 注記）。`?debug=1` の 記録には 伏せた 形で 残す
        liveDebug("taiwa.crash", describeError(error), true);
        if (stale()) return;
        // 例外の中身は出さない。短命トークンが混ざりうるうえ、SDK の生メッセージは
        // 学習者にも先生にも読めない。理由の名前だけ渡す。
        release();
        setStatus("error");
        setReason("connect");
      } finally {
        if (!handedOff) stream?.getTracks().forEach((track) => track.stop());
      }
    },
    [release, flushHeard],
  );

  /**
   * 書いて送る。**相手は声で返す**（Live は入力が文字でも音声で答える）。
   * マイクが無い・使いたくない学習者にも、同じ会話の体験を残すため。
   */
  const send = useCallback((text: string) => {
    const session = sessionRef.current;
    if (!session || !text.trim()) return;
    // 🎤 が オンの まま 書いて 送ったら、声の ターンを 先に 閉じる（開いた まま 文字を 重ねない）
    if (talkingRef.current) {
      talkingRef.current = false;
      setTalking(false);
      session.sendRealtimeInput({ activityEnd: {} });
    }
    setTranscript((prev) => [...prev, { from: "me", text, mode: "text" }]);
    session.sendClientContent({ turns: text, turnComplete: true });
  }, []);

  /**
   * 🎤 を オンに する。**相手が 話して いたら そこで 止める**（Zoom で 割り込むのと 同じ）。
   * 止めないと、自分の 声と 相手の 声が 重なった まま 聞き取りに 入る。
   */
  const startTalking = useCallback(() => {
    const session = sessionRef.current;
    if (!session || talkingRef.current) return;
    clearScheduled(outRef.current);
    /*
     * 前の ターンの **言いかけの 字を 捨てる**（use-live-voice と 同じ）。
     * 聞き取りの 字は 🎤 を オフに した あとも 遅れて 届く。ここで 判定へ 流すと、
     * 届いた ぶんだけの 切れた 発話（「よさんは」）が 判定に 回り、直前の 案内を 上書きする。
     */
    heardRef.current = "";
    saidRef.current = "";
    // 別の タブを 見て 戻った あとなど、鳴らす 側が 止まって いる ことが ある
    void outRef.current?.ctx.resume();
    liveDebug("taiwa.talk", `start (mic frames so far=${micStatsRef.current.frames})`);
    micStatsRef.current.sent = 0;
    micStatsRef.current.peak = 0;
    talkingRef.current = true;
    setTalking(true);
    session.sendRealtimeInput({ activityStart: {} });
  }, []);

  /** 🎤 を オフに する。「言い終わった」を 伝えないと、相手は 息つぎだと 思って 待ちつづける。 */
  const stopTalking = useCallback(() => {
    if (!talkingRef.current) return;
    talkingRef.current = false;
    setTalking(false);
    const { sent, peak } = micStatsRef.current;
    liveDebug("taiwa.talk", `end sent=${sent} peak=${peak.toFixed(2)}`, sent === 0 || peak < 0.01);
    sessionRef.current?.sendRealtimeInput({ activityEnd: {} });
  }, []);

  return {
    status,
    reason,
    transcript,
    lastUtterance,
    voiceOn,
    talking,
    startTalking,
    stopTalking,
    connect,
    disconnect,
    send,
  };
}

/** 鳴らす 側。予約した 音を 持って おき、割り込まれたら 止める。 */
interface Output {
  readonly ctx: AudioContext;
  readonly node: GainNode;
  playAt: number;
  sources: AudioBufferSourceNode[];
}

/** 相手の セリフが 途中で 止められたか。 */
function isInterrupted(message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  const content = (message as { serverContent?: { interrupted?: unknown } }).serverContent;
  return content?.interrupted === true;
}

/** 鳴らす 予約を 全部 止める（割り込み・🎤 を オンに した とき）。 */
function clearScheduled(out: Output | null): void {
  if (!out) return;
  for (const source of out.sources) {
    try {
      source.stop();
    } catch {
      // もう 鳴り終わって いる ものは 止められない（それで よい）
    }
  }
  out.sources = [];
  out.playAt = 0;
}

/** 相手が話し終わったか（返事を1つに束ねる合図）。 */
function isTurnComplete(message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  const content = (message as { serverContent?: { turnComplete?: unknown } }).serverContent;
  return content?.turnComplete === true;
}

/** 返ってきた24kHzのPCMを、切れ目なく順に鳴らす。 */
function play(out: Output | null, pcm: Uint8Array) {
  if (!out) return;
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
  const buffer = out.ctx.createBuffer(1, samples.length, OUT_RATE);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i += 1) channel[i] = samples[i]! / 0x8000;

  const source = out.ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(out.node);
  // 前の音の終わりに継ぐ。now を毎回使うと、細かい塊が重なって濁る
  const at = Math.max(out.ctx.currentTime, out.playAt);
  source.start(at);
  out.playAt = at + buffer.duration;
  // 割り込まれたら 止められる ように 持つ。鳴り終えた ものは 手放す（ためこまない）
  out.sources.push(source);
  source.onended = () => {
    out.sources = out.sources.filter((s) => s !== source);
  };
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

/** Live のメッセージから字幕にする1行を取り出す（形が変わっても落ちないようにする）。 */
function readTranscript(message: unknown): LiveTurn | null {
  if (!message || typeof message !== "object") return null;
  const content = (message as { serverContent?: Record<string, unknown> }).serverContent;
  if (!content) return null;

  // どちらも 音声の 文字起こしなので mode は "voice"（書いて 送った ぶんは `send` が 作る）。
  const output = content.outputTranscription as { text?: string } | undefined;
  if (output?.text) return { from: "client", text: output.text, mode: "voice" };

  const input = content.inputTranscription as { text?: string } | undefined;
  if (input?.text) return { from: "me", text: input.text, mode: "voice" };

  return null;
}
