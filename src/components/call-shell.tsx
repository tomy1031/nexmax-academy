"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import type { ListeningParticipant } from "@/content/schema";
import { getFamilyForCode } from "@/content/personality";
import { FeedbackMessage } from "@/components/feedback-message";
import { NexMax } from "@/components/nexmax";
import { NexMaxFamily } from "@/components/nexmax-types";
import { RubyText } from "@/components/ruby-text";
import { getProfile, type NexmaxProfile } from "@/lib/profile";
import { buildFuriganaIndex, type FuriganaEntry, type FuriganaIndex } from "@/lib/text/furigana";

/**
 * Zoom風の通話画面（モードに依存しない外枠）。
 *
 * リスニング（聞く教材）でも たいわ（Live対話）でも同じ枠を使うので、どちらの
 * 教材名も名乗らない。ここに片方の名前を付けると、もう片方の画面で言葉と中身が
 * ずれる（学習者は「リスニング」と書かれた画面でAIと話すことになる）。
 *
 * 旧アプリの演出を引き継ぐ:
 *   - 入室は「🔔 ドアを ノックする」から（いきなり始めない）
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

/**
 * マイクの ボタン（親が 声の 出し入れを 持って いるときだけ 出す）。
 *
 * 以前は `micOn` という state が この中に あったが、**どこにも 繋がって いなかった**
 * ——押すと ラベルだけ「🎤 マイク ON」に 変わり、音は 何も 変わらない。
 * 押しても 何も 起きない ボタンは、学習者に「自分の 操作が 間違って いる」と
 * 思わせる。繋げられる 画面（ミーティング）は ここに Live の 開始／終了を 渡し、
 * 渡さない 画面（リスニングの 再生）では ボタン自体を 出さない。
 */
export interface CallMic {
  /** いま 声が つながって いるか。 */
  readonly on: boolean;
  /** 押されたとき（つなぐ／切る）。 */
  readonly onToggle: () => void;
  /** つないで いる 最中（押せない）。 */
  readonly busy?: boolean;
}

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
  /** 入る前の見出し。話す教材は "speak"（既定は "listen"）。 */
  purpose = "listen",
  /** マイクのボタン。渡さないと **ボタン自体を出さない**（繋がっていない飾りを置かない）。 */
  mic,
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
  purpose?: CallPurpose;
  mic?: CallMic;
  onLeft?: () => void;
}) {
  const [stage, setStage] = useState<CallStage>("lobby");
  /*
   * カメラは **OFFから 始める**。入った 瞬間に 自分の 顔が 出ると、声を 出すのも
   * こわい 学習者には それだけで 障壁になる（教室では 隣の 画面も 見える）。
   * 見せるか どうかは 学習者が 自分で 決める——下の「📷 カメラ OFF」を 押せば ONになる。
   */
  const [cameraOn, setCameraOn] = useState(false);
  const index = useFuriganaIndex(furigana);

  if (stage === "lobby") {
    return (
      <Lobby
        title={title}
        focus={focus}
        furigana={index}
        purpose={purpose}
        onEnter={() => setStage("inRoom")}
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

  return (
    <div className="flex flex-col gap-4">
      <div
        className="overflow-hidden rounded-[var(--radius-card)] border-2"
        style={{ borderColor: "var(--color-hairline)", background: "#0f2233" }}
      >
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-xs font-extrabold text-white/80">
            🔴 <RubyText text={title} index={index} show />
          </span>
          <span className="text-xs font-bold text-white/60">
            {participants.length + 1}人が さんかちゅう
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
          <SelfTile cameraOn={cameraOn} />
        </div>

        <div className="flex items-center justify-center gap-2 border-t border-white/10 px-3 py-2">
          {/* マイクは 繋がって いる 画面だけ（親が mic を 渡した ときだけ）出す */}
          {mic ? (
            <ToolButton on={mic.on} onClick={mic.onToggle} disabled={mic.busy}>
              {mic.on ? "🎤 マイク ON" : "🔇 マイク OFF"}
            </ToolButton>
          ) : null}
          <ToolButton on={cameraOn} onClick={() => setCameraOn((v) => !v)}>
            {cameraOn ? "📷 カメラ ON" : "📷 カメラ OFF"}
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

      {controlsAt === "top" ? controls : null}
      {children}
      {controlsAt === "bottom" ? controls : null}
    </div>
  );
}

function Lobby({
  title,
  focus,
  furigana,
  purpose,
  onEnter,
}: {
  title: string;
  focus: string;
  furigana: FuriganaIndex;
  purpose: CallPurpose;
  onEnter: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-island mx-auto max-w-xl p-6 text-center sm:p-8"
    >
      <NexMax variant="listen" size={100} className="mx-auto" bob />
      <h1 className="text-ink mt-4 text-2xl font-extrabold">
        <RubyText text={title} index={furigana} show />
      </h1>

      <div className="mt-4 text-left">
        <p className="text-ink-soft text-sm font-extrabold">{BEFORE_LABEL[purpose]}</p>
        <p className="text-ink mt-1 leading-relaxed font-bold">
          <RubyText text={focus} index={furigana} show />
        </p>
      </div>

      <button
        type="button"
        onClick={onEnter}
        className="btn-island btn-game mt-6 w-full px-6 py-4 text-lg"
      >
        🔔 ドアを ノックする
      </button>
      {/* カメラは OFFから 始まる。ONに する 場所を ここで 先に 伝える（探させない） */}
      <p className="text-ink-faint mt-2 text-xs font-bold">
        カメラは OFFで はじまります。うつしたい ときは「📷 カメラ OFF」を おしてね
      </p>
    </motion.div>
  );
}

function ToolButton({
  on,
  onClick,
  disabled = false,
  children,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
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
        background: on ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)",
        color: on ? "#fff" : "rgba(255,255,255,0.6)",
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
function SelfTile({ cameraOn }: { cameraOn: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cameraOn) return;
    let live: MediaStream | null = null;
    let cancelled = false;

    // 状態の更新はすべて Promise の後（エフェクト本体では setState しない）
    const request = async (): Promise<{ stream: MediaStream | null; error: string | null }> => {
      if (!navigator.mediaDevices?.getUserMedia) {
        return { stream: null, error: "この ブラウザでは カメラが つかえません。" };
      }
      try {
        return { stream: await navigator.mediaDevices.getUserMedia({ video: true }), error: null };
      } catch {
        return { stream: null, error: "カメラを つかう きょかが ありません。" };
      }
    };

    void request().then(({ stream, error: reason }) => {
      if (cancelled) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      live = stream;
      setError(reason);
      if (stream && videoRef.current) videoRef.current.srcObject = stream;
    });

    return () => {
      cancelled = true;
      live?.getTracks().forEach((t) => t.stop());
    };
  }, [cameraOn]);

  return (
    <div
      className="relative grid aspect-video place-items-center overflow-hidden rounded-2xl"
      style={{ background: "#16324a", outline: "1px solid rgba(255,255,255,0.08)" }}
    >
      {cameraOn && !error ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
          style={{ transform: "scaleX(-1)" }}
        />
      ) : (
        /*
          カメラを切っているあいだは「カメラ OFF」の字だけが残っていた。
          相手の顔は出ているのに自分の枠だけ真っ暗だと、会話の場に居る感じが消える。
          診断で決まった**自分のネクマックス**を置く（Zoomのプロフィール画像と同じ役）。
        */
        <SelfAvatar note={error} />
      )}
      <span className="absolute bottom-1.5 left-2 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-bold text-white">
        あなた
      </span>
    </div>
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
