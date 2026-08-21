"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import type { ListeningParticipant } from "@/content/schema";
import { getFamilyForCode } from "@/content/personality";
import { FeedbackMessage } from "@/components/feedback-message";
import { NexMax } from "@/components/nexmax";
import { NexMaxFamily } from "@/components/nexmax-types";
import { DictionaryText } from "@/components/dictionary-text";
import { RubyText } from "@/components/ruby-text";
import type { DictionaryEntry } from "@/lib/dictionary";
import { getProfile, type NexmaxProfile } from "@/lib/profile";
import { buildFuriganaIndex, type FuriganaEntry, type FuriganaIndex } from "@/lib/text/furigana";

/**
 * Zoom風の通話画面（モードに依存しない外枠）。
 *
 * リスニング（聞く教材）でも たいわ（Live対話）でも同じ枠を使うので、どちらの
 * 教材名も名乗らない。ここに片方の名前を付けると、もう片方の画面で言葉と中身が
 * ずれる（学習者は「リスニング」と書かれた画面でAIと話すことになる）。
 *
 * 演出:
 *   - 入室は **Zoom と同じ「さんかする 前の 画面」**から（いきなり始めない）。
 *     ここで 自分の 顔を 先に 見て、カメラを けすか どうかを 決め、マイクが
 *     きこえるかを ためせる。ドアを ノックする 絵は やめた——学習者が これから
 *     出るのは 会議室では なく **Zoom** で、練習すべき 操作も Zoom の 操作である
 *     （2026-08-18 の指定）。
 *   - 自分のタイルは Webカメラの実映像。アバター画像は使わない（設計01 §101）
 *   - 退出のとき「お礼を 言いましたか？」の一呼吸を置く
 *
 * ## 教材の 漢字は ルビ合成を 通す（規律2）
 * ここに出る 題・きょう やること・名札は **教材の文**なので、読み辞書（`furigana`）を
 * 受け取って `RubyText` で描く。以前は `{title}` `{focus}` `{person.name}` を そのまま
 * 出していたので、データに 読みが あるのに「ヘンディさんに **報告**する」「松井 **社長**」が
 * 裸で出ていた——入室の 直前、いちばん 緊張する ところで 読めない字が 出る。
 * 辞書は 任意。渡さない 呼び出し側（リスニング）は これまでどおり 地の文で描く。
 */

export type CallStage = "lobby" | "inRoom" | "leaving" | "left";

/**
 * 入る前の 見出しを どちらにするか。
 * 「きくまえに」は 聞く教材の 言い方で、自分が 話す 教材（ミーティング・たいわ）では
 * 中身と 合わない。既定は これまでどおり「きく」。
 */
export type CallPurpose = "listen" | "speak";

/**
 * 操作パネル（`controls`）を タイルの すぐ下に 置くか、いちばん 下に 置くか。
 *
 * ミーティングの `controls` は **答える ところ**（型文＋入力欄）なので、
 * 上に 置くと スマホでは「こう 言えます」と 入力欄が 先に 来て、**相手の しつもんが
 * その 下**に なる——毎回 スクロールして 何を 聞かれたかを 探す ことに なっていた。
 * 目線を「聞かれたこと → 言い方 → 打つ」の 順に 流すため、こちらは "bottom"。
 *
 * たいわ（Live）の `controls` は **つなぐ ボタン**で、会話が 始まる 前に 押す ものだから
 * 会話の 上に 要る。既定は これまでどおり "top"。
 */
export type CallControlsAt = "top" | "bottom";

const BEFORE_LABEL: Record<CallPurpose, string> = {
  listen: "きくまえに",
  speak: "はなす まえに",
};

/** 読み辞書を渡されなかったとき（ふりがな無しで地の文だけ描く）。 */
const EMPTY_INDEX: FuriganaIndex = buildFuriganaIndex([]);

const ACCENT: Record<ListeningParticipant["accent"], string> = {
  sky: "#4fa8e8",
  leaf: "#58c273",
  sun: "#ffc93c",
  coral: "#f26fa7",
  grape: "#a78bfa",
};

export function CallShell({
  title,
  focus,
  participants,
  /** いま話している人の id（タイルを光らせる）。 */
  activeSpeaker,
  /**
   * いま祝っている人の id（タイルを短く発光させる）。
   * 話している合図（activeSpeaker）と分けるのは、**発光が学習行為に紐づく**ため
   * ——ハートが増えた・札が開いた瞬間にだけ光らせる（設計01 P2）。
   */
  celebrate,
  /**
   * タイルの中に出す顔（参加者id → 中身）。
   * 渡さなければ従来どおり頭文字の丸を出す。Live対話のように**顔が要る教材**だけが渡す
   *（リスニングは声だけなので、顔を作る手間をかけない）。
   */
  faces,
  /** 操作パネル（再生／Live／答える ところ で中身が変わる）。置き場は `controlsAt`。 */
  controls,
  /** タイルの下に置く学習パネル（字幕・単語チェックなど）。 */
  children,
  /** 操作パネルの置き場（既定は タイルの すぐ下）。 */
  controlsAt = "top",
  /** 教材の読み辞書。渡すと 題・きょう やること・名札に ふりがなが つく。 */
  furigana,
  /**
   * ことばの 辞書（単語ステージを 畳んだもの）。渡すと「きょう やること」の
   * ことばに 下線が つき、タップで 意味が 出る。
   *
   * 保存先を 増やさない——先生が スタジオ（DB）で 直した 単語ステージが
   * そのまま ここに 出る（`src/lib/dictionary.ts`）。
   */
  dictionary,
  /** 入る前の見出し。話す教材は "speak"（既定は "listen"）。 */
  purpose = "listen",
  /**
   * 枠の 地の色。既定は Zoom に 寄せた 濃い 紺。
   * ミーティングだけ 添付の 画面に 合わせて **明るい 白の カード**に する
   *（2026-08-20 の 指定）。ほかの 教材は 触らない。
   */
  tone = "dark",
  /** 右の 列に 置く もの（チャット欄など）。渡すと 2列に なる。 */
  side,
  /**
   * 「話す」ところ（Zoom の 画面の **中**に 置く）。
   *
   * 小さな ボタンを 入力欄の 横に 置いて いた ころは、**どれを 押せば 声で 話せるのか**が
   * 分からなかった（2026-08-18 の指定）。話すのは 会話の 中心の 操作なので、
   * 相手の 顔の すぐ下——Zoom の 画面の 中——に 大きく 置く。
   * 渡さない 画面（リスニングの 再生）では 何も 出ない。
   */
  speak,
  /**
   * 入る 前の 画面に 置く つまみ（話す 速さ など）。
   * **入る 前に 決められる** ことが 大事な もの だけを ここに 置く
   *（はじめの ひとことから 効かせたい つまみは、入って からでは 遅い）。
   */
  settings,
  /**
   * 部屋に 入った 瞬間（さんかする を 押した とき）。
   *
   * 音を 鳴らす 教材は これを 待つ。ロビーに いる あいだに 鳴らすと、
   * ブラウザに 止められる（人が さわる 前の 音は 鳴らせない 決まり）か、
   * 入る 前に 鳴り終わって しまう——どちらでも「セリフが 流れない」に なる。
   */
  onJoined,
  onLeft,
}: {
  title: string;
  focus: string;
  participants: readonly ListeningParticipant[];
  activeSpeaker?: string | null;
  celebrate?: string | null;
  faces?: Readonly<Record<string, React.ReactNode>>;
  controls?: React.ReactNode;
  children?: React.ReactNode;
  controlsAt?: CallControlsAt;
  furigana?: FuriganaIndex | readonly FuriganaEntry[];
  dictionary?: readonly DictionaryEntry[];
  purpose?: CallPurpose;
  tone?: "dark" | "light";
  side?: React.ReactNode;
  speak?: React.ReactNode;
  settings?: React.ReactNode;
  onJoined?: () => void;
  onLeft?: () => void;
}) {
  const [stage, setStage] = useState<CallStage>("lobby");
  /*
   * カメラは **ONから 始める**（2026-08-18 の指定）。Zoom は 既定で 映るので、
   * 練習も 同じに する——ここで 学習者が やる ことは「うつる 画面で、けす／つける を
   * 自分で 選ぶ」であって、はじめから 消えて いると その 練習に ならない。
   *
   * こわさは「順番」で ほどく。**さんかする 前の 画面**で 自分の 顔が 出るので、
   * 相手に 見られる 前に 見て、けしてから 入れる。
   * （以前は OFF 始まりだった。理由は「入った 瞬間に 顔が 出ると こわい」で、
   *   その 心配は さんかの 前に 見せる ことで 消える。）
   */
  const [cameraOn, setCameraOn] = useState(true);
  /*
   * カメラの 映像は **この 階で 1つだけ** 持つ。ロビーと 部屋で 別々に 取ると、
   * 入室の たびに 取り直し（端末に よっては きょかを 聞き直す）になる。
   */
  const camera = useCameraStream(cameraOn);
  const index = useFuriganaIndex(furigana);

  if (stage === "lobby") {
    return (
      <Lobby
        title={title}
        focus={focus}
        furigana={index}
        dictionary={dictionary}
        purpose={purpose}
        settings={settings}
        camera={camera}
        cameraOn={cameraOn}
        onToggleCamera={() => setCameraOn((v) => !v)}
        onEnter={() => {
          setStage("inRoom");
          onJoined?.();
        }}
      />
    );
  }

  if (stage === "leaving") {
    return (
      <div className="card-island mx-auto max-w-md p-6 text-center sm:p-8">
        <NexMax variant="listen" size={92} className="mx-auto" bob />
        <h2 className="text-ink mt-4 text-2xl font-extrabold">お礼を 言いましたか？</h2>
        <p className="text-ink-soft mt-2 font-bold">
          「ありがとうございました」と ひとこと 言ってから 出ましょう。
        </p>
        <div className="mt-5 grid gap-3">
          <button
            type="button"
            onClick={() => {
              setStage("left");
              onLeft?.();
            }}
            className="btn-island btn-game px-6 py-3"
          >
            言いました。おわる
          </button>
          <button
            type="button"
            onClick={() => setStage("inRoom")}
            className="btn-island btn-game px-6 py-3"
            style={{ "--btn-face": "#ffffff", "--btn-shadow": "#cfe6f3" } as React.CSSProperties}
          >
            <span className="text-ink">もどる</span>
          </button>
        </div>
      </div>
    );
  }

  if (stage === "left") {
    return (
      <div className="card-island mx-auto max-w-md p-8 text-center">
        <NexMax variant="cheer" size={92} className="mx-auto" bob />
        <h2 className="text-ink mt-4 text-2xl font-extrabold">おつかれさま！</h2>
        <p className="text-ink-soft mt-2 font-bold">かいぎが おわりました。</p>
      </div>
    );
  }

  /*
   * 明るい 枠（`tone="light"`）は 添付の 画面に 合わせた もの。
   * 濃い 紺の Zoom 風の 枠は、そのままだと 中の 白い カードが 浮いて 見えた。
   */
  const light = tone === "light";
  return (
    <div className="flex flex-col gap-4">
      <div
        className="overflow-hidden rounded-[var(--radius-card)] border-2"
        style={{
          borderColor: light ? "var(--color-hairline)" : "var(--color-hairline)",
          background: light ? "#fff" : "#0f2233",
        }}
      >
        <div className="flex items-center justify-between px-4 py-2.5">
          <span
            className={`text-sm font-black ${light ? "text-navy" : "text-xs font-extrabold text-white/80"}`}
          >
            {light ? "🎥 " : "🔴 "}
            <RubyText text={title} index={index} show />
          </span>
          <span
            className={
              light
                ? "bg-panel-tint text-ink-soft rounded-full px-3 py-1 text-xs font-extrabold"
                : "text-xs font-bold text-white/60"
            }
          >
            👥{" "}
            <ruby>
              {participants.length + 1}人<rt>にん</rt>
            </ruby>
            が さんかちゅう
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 px-3 pb-3 sm:grid-cols-3">
          {participants.map((person) => (
            <ParticipantTile
              key={person.id}
              person={person}
              speaking={activeSpeaker === person.id}
              celebrating={celebrate === person.id}
              face={faces?.[person.id]}
              furigana={index}
            />
          ))}
          <SelfTile stream={camera.stream} error={camera.error} />
        </div>

        {/* 話す ところは 相手の 顔の すぐ下（Zoom の 画面の 中）。渡されたときだけ 出す */}
        {speak ? <div className="px-3 pb-3">{speak}</div> : null}

        {/*
          390px の 実機では、ボタンが 1行に 入りきらず「カメラを け」で
          切れて いた。折り返して 全部の 字を 見せる（押せても 読めなければ 押せない）。
        */}
        <div
          className={`flex flex-wrap items-center justify-center gap-2 border-t px-3 py-2 ${light ? "border-hairline" : "border-white/10"}`}
        >
          {/*
           * ボタンの文字は「いまの じょうたい」ではなく「押すと どうなるか」にする。
           * OFFのときに「カメラ OFF」と出ていると、押して よいのか 分からず、
           * 案内文（「うつしたい ときは…」）とも 食いちがう（390px の実機で確認）。
           */}
          <ToolButton light={light} on={cameraOn} onClick={() => setCameraOn((v) => !v)}>
            {cameraOn ? "📷 カメラを けす" : "📷 カメラを つける"}
          </ToolButton>
          <button
            type="button"
            onClick={() => setStage("leaving")}
            className="rounded-full bg-[#e64a5f] px-4 py-1.5 text-xs font-extrabold text-white"
          >
            たいしつ
          </button>
        </div>
      </div>

      {/*
        右の 列が あれば **2列**（左＝話す ところ／右＝会話の 記録）。
        画面が せまい ときは 縦に 積む——横に 押し込むと どちらも 読めなくなる。
      */}
      {side ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="flex min-w-0 flex-col gap-4">
            {controlsAt === "top" ? controls : null}
            {children}
            {controlsAt === "bottom" ? controls : null}
          </div>
          <div className="min-w-0">{side}</div>
        </div>
      ) : (
        <>
          {controlsAt === "top" ? controls : null}
          {children}
          {controlsAt === "bottom" ? controls : null}
        </>
      )}
    </div>
  );
}

function Lobby({
  title,
  focus,
  furigana,
  dictionary,
  purpose,
  settings,
  camera,
  cameraOn,
  onToggleCamera,
  onEnter,
}: {
  title: string;
  focus: string;
  furigana: FuriganaIndex;
  dictionary?: readonly DictionaryEntry[];
  purpose: CallPurpose;
  settings?: React.ReactNode;
  camera: CameraStream;
  cameraOn: boolean;
  onToggleCamera: () => void;
  onEnter: () => void;
}) {
  /*
   * マイクは **おした ときだけ** ためす。カメラと 同時に 取りに いくと、
   * きょかを 聞く 窓が 2つ 重なって、どちらに 答えたのか 分からなくなる。
   */
  const [micTrying, setMicTrying] = useState(false);
  const mic = useMicLevel(micTrying);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-island mx-auto max-w-xl p-6 text-center sm:p-8"
    >
      <h1 className="text-ink text-2xl font-extrabold">
        <RubyText text={title} index={furigana} show />
      </h1>

      <div className="mt-4 text-left">
        <p className="text-ink-soft text-sm font-extrabold">{BEFORE_LABEL[purpose]}</p>
        <p className="text-ink mt-1 leading-relaxed font-bold">
          {/* 「きょう やること」は 教材の 文。ことばの 意味は タップで 出す（規律2・辞書） */}
          <DictionaryText text={focus} index={furigana} show dictionary={dictionary} />
        </p>
      </div>

      {/*
        さんかする 前の 自分の 画面（Zoom の 待機の 画面と 同じ役）。
        相手に 見られる 前に 自分の うつり方を 見て、けすか どうかを 決める。
      */}
      <div className="mt-4 overflow-hidden rounded-2xl" style={{ background: "#0f2233" }}>
        <div className="relative mx-auto grid aspect-video place-items-center">
          {cameraOn && camera.stream && !camera.error ? (
            <CameraVideo stream={camera.stream} />
          ) : (
            <SelfAvatar note={cameraOn ? camera.error : null} />
          )}
          <span className="absolute bottom-1.5 left-2 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-bold text-white">
            あなた
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 px-3 py-2">
          {/* ボタンの 字は「いまの じょうたい」ではなく「おすと どうなるか」 */}
          <ToolButton on={cameraOn} onClick={onToggleCamera}>
            {cameraOn ? "📷 カメラを けす" : "📷 カメラを つける"}
          </ToolButton>
          {/*
            マイクの ためしは **じぶんが 話す 教材だけ**（`purpose: "speak"`）。
            聞くだけの 教材に 置くと、どこにも つながらない ボタンに なる。
          */}
          {purpose === "speak" ? (
            <ToolButton on={micTrying} onClick={() => setMicTrying((v) => !v)}>
              {micTrying ? "🎤 マイクを とめる" : "🎤 マイクを ためす"}
            </ToolButton>
          ) : null}
        </div>
      </div>

      {micTrying ? <MicMeter level={mic.level} error={mic.error} /> : null}

      {/* 入る 前に 決めて おける つまみ（話す 速さ など） */}
      {settings ? <div className="mt-3">{settings}</div> : null}

      <button
        type="button"
        onClick={onEnter}
        className="btn-island btn-game mt-5 w-full px-6 py-4 text-lg"
      >
        ミーティングに さんかする
      </button>
      {/* カメラは ONで 始まる。けす 場所を ここで 先に 伝える（探させない） */}
      <p className="text-ink-faint mt-2 text-xs font-bold">
        カメラは ONで はじまります。うつしたくない ときは「📷 カメラを けす」を おしてね
      </p>
    </motion.div>
  );
}

/**
 * マイクの ものさし。
 *
 * 「マイクが つかえます」と 字で 書くだけでは、**自分の こえが 届いて いるか**は
 * 分からない（きょかが おりても、端末の 音量が 0 の ことが ある）。
 * こえを 出すと 棒が のびる——耳の 代わりに 目で たしかめられる ように する。
 */
function MicMeter({ level, error }: { level: number; error: string | null }) {
  if (error) {
    return (
      <p className="bg-cream text-ink mt-3 rounded-[var(--radius-card)] px-4 py-2 text-sm font-bold">
        {error}
      </p>
    );
  }
  const heard = level >= HEARD_LEVEL;
  return (
    <div className="bg-panel-tint mt-3 rounded-[var(--radius-card)] px-4 py-3">
      <p className="text-ink-soft text-xs font-extrabold">
        {heard ? "🎤 きこえて います！" : "🎤 こえを だして みて ください"}
      </p>
      <div
        className="mt-2 h-3 w-full overflow-hidden rounded-full"
        style={{ background: "rgba(15,34,51,0.12)" }}
        role="meter"
        aria-label="マイクの おおきさ"
        aria-valuenow={Math.round(level * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-[width] duration-100"
          style={{
            width: `${Math.round(level * 100)}%`,
            background: heard ? "var(--color-leaf)" : "#8fc6ea",
          }}
        />
      </div>
    </div>
  );
}

function ToolButton({
  on,
  onClick,
  disabled = false,
  /** 明るい 枠の 中では 白い 字が 消える（2026-08-21 の 実機写真で 判明）。 */
  light = false,
  children,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  light?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      disabled={disabled}
      className="rounded-full px-4 py-1.5 text-xs font-extrabold disabled:opacity-40"
      style={{
        background: light
          ? on
            ? "var(--color-panel-tint)"
            : "var(--color-panel)"
          : on
            ? "rgba(255,255,255,0.18)"
            : "rgba(255,255,255,0.06)",
        color: light
          ? on
            ? "var(--color-navy)"
            : "var(--color-ink-soft)"
          : on
            ? "#fff"
            : "rgba(255,255,255,0.6)",
      }}
    >
      {children}
    </button>
  );
}

/**
 * 読み辞書を 索引に そろえる。
 * 呼び出し側は 索引（組み立てずみ）でも 配列（教材の `furigana` そのまま）でも
 * 渡せる——どちらか 一方だけに すると、片方の 呼び出し側が 毎回 組み直す ことになる。
 */
function useFuriganaIndex(source: FuriganaIndex | readonly FuriganaEntry[] | undefined) {
  return useMemo(() => {
    if (source === undefined) return EMPTY_INDEX;
    return Array.isArray(source) ? buildFuriganaIndex(source) : (source as FuriganaIndex);
  }, [source]);
}

/** こえが 届いて いると 見なす 大きさ（ものさしの 色が 変わる）。 */
const HEARD_LEVEL = 0.12;

/** カメラの 映像と、取れなかった ときの 言いわけ。 */
export interface CameraStream {
  readonly stream: MediaStream | null;
  readonly error: string | null;
}

/** マイクの 大きさ（0〜1）と、取れなかった ときの 言いわけ。 */
interface MicLevel {
  readonly level: number;
  readonly error: string | null;
}

/** 消して いる あいだの 値。同じ 参照を 使い回す（毎回 作ると 描き直しが 連鎖する）。 */
const CAMERA_OFF: CameraStream = { stream: null, error: null };
const MIC_OFF: MicLevel = { level: 0, error: null };

/**
 * カメラを 1つだけ 開く（ロビー → 部屋 で 使い回す）。
 *
 * 状態の 更新は すべて Promise の あと（効果の 本体では setState しない）。
 * 消した ときは 必ず track を 止める——止め忘れると、教材を 出た あとも
 * 端末の カメラの ランプが ついたままに なる。
 */
function useCameraStream(on: boolean): CameraStream {
  const [state, setState] = useState<CameraStream>(CAMERA_OFF);

  useEffect(() => {
    if (!on) return;
    let live: MediaStream | null = null;
    let cancelled = false;

    const request = async (): Promise<CameraStream> => {
      if (!navigator.mediaDevices?.getUserMedia) {
        return { stream: null, error: "この ブラウザでは カメラが つかえません。" };
      }
      try {
        return { stream: await navigator.mediaDevices.getUserMedia({ video: true }), error: null };
      } catch {
        return { stream: null, error: "カメラを つかう きょかが ありません。" };
      }
    };

    void request().then((next) => {
      if (cancelled) {
        next.stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      live = next.stream;
      setState(next);
    });

    return () => {
      cancelled = true;
      live?.getTracks().forEach((t) => t.stop());
    };
  }, [on]);

  /*
   * 消して いる あいだは 中身を 返さない（保存値を 消しに いかない）。
   * つけ直した 直後の ひと呼吸は 前の 映像の 最後の 1枚が 残る——
   * ここで 真っ黒に 落とすより、絵が 続いて いる ほうが 落ち着く。
   */
  return on ? state : CAMERA_OFF;
}

/**
 * マイクの 大きさ（0〜1）。ロビーの ものさしだけが 使う。
 *
 * 部屋の 中の 声（Live）は 別の 道（`mic-capture.ts`）で 取る。ここで 開いた
 * マイクは **ロビーを 出る ときに 必ず 閉じる**——開いたままだと、Live が
 * つなぐ ときに 同じ 端末を 二重に つかむ ことに なる。
 */
function useMicLevel(on: boolean): MicLevel {
  const [state, setState] = useState<MicLevel>(MIC_OFF);

  useEffect(() => {
    if (!on) return;
    let cancelled = false;
    let live: MediaStream | null = null;
    let context: AudioContext | null = null;
    let frame = 0;

    const request = async (): Promise<{ stream: MediaStream | null; error: string | null }> => {
      if (!navigator.mediaDevices?.getUserMedia) {
        return { stream: null, error: "この ブラウザでは マイクが つかえません。" };
      }
      try {
        return { stream: await navigator.mediaDevices.getUserMedia({ audio: true }), error: null };
      } catch {
        return { stream: null, error: "マイクを つかう きょかが ありません。" };
      }
    };

    void request().then(({ stream, error: reason }) => {
      if (cancelled) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      live = stream;
      setState({ level: 0, error: reason });
      if (!stream) return;

      context = new AudioContext();
      // 自動再生の 制限で 止まった まま 始まる ことが ある（1つも 数えられない）
      void context.resume();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);

      const tick = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          // 128 が むおん。そこからの ずれの 二乗を ならす（RMS）
          const shift = (sample - 128) / 128;
          sum += shift * shift;
        }
        const loudness = Math.min(1, Math.sqrt(sum / samples.length) * 3);
        /*
         * 0.05 きざみに 丸めてから 入れる。毎フレーム そのまま 入れると
         * 1秒に 60回 描き直す ことに なり、ロビーだけで 端末が 熱くなる。
         */
        const stepped = Math.round(loudness * 20) / 20;
        setState((prev) => (prev.level === stepped ? prev : { ...prev, level: stepped }));
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      live?.getTracks().forEach((t) => t.stop());
      void context?.close();
    };
  }, [on]);

  return on ? state : MIC_OFF;
}

function ParticipantTile({
  person,
  speaking,
  celebrating = false,
  face,
  furigana,
}: {
  person: ListeningParticipant;
  speaking: boolean;
  celebrating?: boolean;
  face?: React.ReactNode;
  furigana: FuriganaIndex;
}) {
  const accent = ACCENT[person.accent];
  return (
    <div
      className="relative grid aspect-video place-items-center rounded-2xl transition"
      style={{
        background: "#16324a",
        outline: speaking ? `3px solid ${accent}` : "1px solid rgba(255,255,255,0.08)",
        outlineOffset: speaking ? "-3px" : "-1px",
      }}
    >
      {/* 祝いの発光。2回ふくらんで止まる（鳴りっぱなしにすると 会話より 目立つ） */}
      {celebrating ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{ border: `2px solid ${accent}` }}
          initial={{ opacity: 0.85, boxShadow: `0 0 0 0 ${accent}` }}
          animate={{ opacity: 0, boxShadow: `0 0 18px 6px ${accent}` }}
          transition={{ duration: 1.1, repeat: 1, ease: "easeOut" }}
        />
      ) : null}
      {face ? (
        // 顔はタイルいっぱいに置く（Zoomの映像と同じ見え方にする）
        <div className="absolute inset-0 overflow-hidden rounded-2xl">{face}</div>
      ) : (
        <span
          className="grid h-14 w-14 place-items-center rounded-full text-xl font-extrabold text-white"
          style={{ background: accent }}
        >
          {person.name.slice(0, 1)}
        </span>
      )}
      {/* 名札も 教材の 文（「松井」「社長」）。読み辞書が あれば ふりがなを つける */}
      <span className="absolute bottom-1.5 left-2 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-bold text-white">
        <RubyText text={person.name} index={furigana} show />
        <span className="ml-1 opacity-70">
          <RubyText text={person.role} index={furigana} show />
        </span>
      </span>
    </div>
  );
}

/** 自分のタイル。Webカメラの実映像を映す（アバター画像は使わない）。 */
function SelfTile({ stream, error }: { stream: MediaStream | null; error: string | null }) {
  return (
    <div
      className="relative grid aspect-video place-items-center overflow-hidden rounded-2xl"
      style={{ background: "#16324a", outline: "1px solid rgba(255,255,255,0.08)" }}
    >
      {stream && !error ? <CameraVideo stream={stream} /> : <SelfAvatar note={error} />}
      <span className="absolute bottom-1.5 left-2 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-bold text-white">
        あなた
      </span>
    </div>
  );
}

/** 受け取った 映像を 流すだけの 箱（鏡なので 左右を 反す）。 */
function CameraVideo({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="h-full w-full object-cover"
      style={{ transform: "scaleX(-1)" }}
    />
  );
}

/**
 * カメラを切っているときの自分のタイル。
 *
 * 端末に保存された診断の結果から自分のネクマックスを出す。まだ診断していない人には
 * 出しようがないので、そのときだけ字を残す（別のネクマックスで代用しない——
 * 自分の分身は診断で決まるもので、他人の絵を自分として見せない）。
 */
function SelfAvatar({ note }: { note: string | null }) {
  const profile = useSyncExternalStore(subscribeToProfile, readProfile, readProfileOnServer);
  if (!profile) {
    return (
      <span className="px-3 text-center text-[11px] font-bold text-white/70">
        {note ?? "カメラ OFF"}
      </span>
    );
  }
  return (
    <div className="grid place-items-center">
      <NexMaxFamily
        family={getFamilyForCode(profile.type).id}
        gender={profile.gender}
        size={72}
        bob
      />
      {note ? (
        <span className="px-3 text-center text-[10px] font-bold text-white/60">{note}</span>
      ) : null}
    </div>
  );
}

/**
 * 端末の保存値は「外の入れ物」なので購読して読む。
 * 効果の中で読んで state に入れると、描画のたびに書き込みが連鎖する。
 */
function subscribeToProfile(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
/** 同じ中身なら同じ参照を返す（毎回作ると購読が回り続ける）。 */
let profileCache: { raw: string; value: NexmaxProfile | null } = { raw: "", value: null };
function readProfile(): NexmaxProfile | null {
  const value = getProfile();
  const raw = JSON.stringify(value);
  if (raw !== profileCache.raw) profileCache = { raw, value };
  return profileCache.value;
}
function readProfileOnServer(): NexmaxProfile | null {
  return null;
}

/** 相手の発話を出す字幕バー。速度や表示の切り替えは呼び出し側が持つ。 */
export function CaptionBar({
  speaker,
  text,
  hidden,
}: {
  speaker: string;
  text: React.ReactNode;
  hidden?: boolean;
}) {
  if (hidden) {
    return (
      <div className="border-hairline text-ink-faint rounded-[var(--radius-card)] border-2 border-dashed px-4 py-3 text-center text-sm font-bold">
        字幕は かくしています（耳で ためしてみよう）
      </div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-island px-4 py-3"
    >
      <p className="text-sky text-xs font-extrabold">{speaker}</p>
      <p className="text-ink mt-0.5 leading-relaxed font-bold">{text}</p>
    </motion.div>
  );
}

/** Live対話などが未設定のときに出す「じゅんびちゅう」表示。 */
export function CallNotReady() {
  return <FeedbackMessage messageKey="talk.notReady" />;
}
