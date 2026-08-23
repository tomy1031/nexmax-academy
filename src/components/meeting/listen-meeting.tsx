"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Meeting } from "@/content/schema";
import { CallShell } from "@/components/call-shell";
import { RubyText } from "@/components/ruby-text";
import type { DictionaryEntry } from "@/lib/dictionary";
import { buildFuriganaIndex } from "@/lib/text/furigana";
import {
  readMeetingRecord,
  readMeetingRecordOnServer,
  saveMeetingRecord,
  subscribeMeetingRecord,
  type MeetingRecord,
} from "@/lib/meeting/record";
import {
  clearMeetingResume,
  migrateSplitRounds,
  restoreMeeting,
  saveMeetingResume,
} from "@/lib/meeting/resume";
import { fillName, stripDirections } from "@/lib/meeting/speech";
import { normalizeReading } from "@/lib/text/normalize";
import {
  rateOf,
  readSpeechSpeed,
  readSpeechSpeedOnServer,
  saveSpeechSpeed,
  subscribeSpeechSpeed,
} from "@/lib/meeting/speed";
import { getProfile } from "@/lib/profile";
import { recordContentProgress } from "@/lib/progress/store";
import { listenInstruction } from "@/lib/meeting/instructions";
import { ChatLine, type ChatBody, type ChatEntry } from "./chat-line";
import { requestCardHit } from "./judge-api";
import { DiscoverCards } from "./question-board";
import { PreviousRecordCard } from "./result-card";
import { SpeakButton } from "./speak-button";
import { SpeechSpeedPicker } from "./speech-speed-picker";
import { VisemeFace } from "./viseme-face";
import { useClipPlayer } from "./use-clip-player";
import { useLiveVoice } from "./use-live-voice";
import { CertificateModal } from "./certificate-modal";

/**
 * **聞く ばん** — 学習者が しつもんし、相手が 答える 教材（`mode: "listen"`）
 *
 * ## なぜ 別の 部品なのか
 * もとは 1つの 部品が 2つの ばんを 兼ねて いた。**ばんを ステージの 並びへ 出した**
 *（2026-08-23「ヘンディさんからの 質問と ヘンディさんへの 質問を 分ける」）ので、
 * 教材が 分かれた。分けると、答える ばんの 道具——判定・ヒント・言い直しの 回数・
 * 赤い 札・進みぐあい——が **まるごと 要らなく なる**。兼ねて いた ころの
 * ややこしさは、ほとんどが「どちらの ばんか」を 見分ける ための ものだった。
 *
 * ## ここに ある もの
 * 聞き出す 札（`discover`）・マイク・チャット・しゅうりょうしょう だけ。
 * 判定は しない——**自由に 聞く 時間なので 点を つけない**（2026-08-18 の 指定）。
 *
 * ## 当たり判定は 2段（`noteDiscovered`）
 * ①ことばの 照合（すぐ・鍵が 無くても 動く）②外れた ときだけ AIに 聞く。
 * 「開くべきが 開かない」だけを AIが 救い、「開くべきで ないのに 開く」は
 * 決定的な 側が 抑える——失敗の 向きを そろえて ある（設計01 P8）。
 */

/** 画面が 自分で 出す 字の 読み（教材の 読み辞書とは 混ぜない・規律2）。 */
const CHROME_FURIGANA = buildFuriganaIndex([
  ["聞", "き"],
  ["話", "はな"],
  ["前", "まえ"],
  ["声", "こえ"],
  ["答", "こた"],
]);

export function ListenMeeting({
  meeting,
  hostVoice,
  hostMouth,
  dictionary,
  embedded,
  /**
   * ひとつ 前の「答える ばん」の 教材ID。
   *
   * 分ける 前は 同じ 画面の 中に あった ので、学習者は 自分が 話した ことを
   * 見ながら 聞けた。**分けた とたんに 消える**のは 手ぶらに するのと 同じ なので、
   * あちらの きろくを 読んで「まえに 話した こと」として 出す。
   */
  priorId,
}: {
  meeting: Meeting;
  hostVoice?: string;
  hostMouth?: Record<string, string>;
  dictionary?: readonly DictionaryEntry[];
  embedded?: boolean;
  priorId?: string;
}) {
  const furigana = buildFuriganaIndex(meeting.furigana ?? []);
  /*
   * **ばんを 分けた ときの 引っ越し**（2026-08-23）。しおりを 読む 前に 1回だけ。
   * これを 忘れると、聞く ばんに いた 学習者が 1問目へ 落ち、話しきった 学習者の
   * ステージが 未クリアに 巻き戻る。
   */
  useState(() => {
    migrateSplitRounds();
    return null;
  });
  const [resume] = useState(() => restoreMeeting(meeting.id, []));
  const [joined, setJoined] = useState(false);
  const [found, setFound] = useState<ReadonlySet<string>>(() => new Set(resume.found));
  const [justFoundId, setJustFoundId] = useState<string | null>(null);
  const [chat, setChat] = useState<readonly ChatEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [certificate, setCertificate] = useState(false);
  const [record, setRecord] = useState<MeetingRecord | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);
  const spokenSeenRef = useRef(0);

  const speed = useSyncExternalStore(
    subscribeSpeechSpeed,
    readSpeechSpeed,
    readSpeechSpeedOnServer,
  );
  const clip = useClipPlayer();
  const voice = useLiveVoice();
  const live = voice.status === "live";
  const learnerName = getProfile()?.displayName ?? "";

  /** まえの ばんで 話した こと（別の 教材に なった ので 読みに 行く）。 */
  const prior = useSyncExternalStore(
    subscribeMeetingRecord,
    () => (priorId ? readMeetingRecord(priorId) : null),
    readMeetingRecordOnServer,
  );

  const pushChat = useCallback((entry: ChatBody) => {
    setChat((prev) => [...prev, { ...entry, id: `${prev.length}-${entry.kind}` }]);
  }, []);

  const instruction = listenInstruction(
    {
      persona: meeting.persona,
      hostName: meeting.host.name,
      discover: meeting.discover ?? [],
    },
    learnerName,
  );

  const openCard = useCallback((id: string) => {
    setFound((prev) => (prev.has(id) ? prev : new Set([...prev, id])));
    setJustFoundId(id);
  }, []);

  /**
   * 聞き出せたか を 見て、当たった 札を 開く。**文字でも こえでも ここを 通す**。
   *
   * 表記ゆれは `normalizeReading` が 吸収する（アプリで 唯一の 実装・再実装しない）。
   * 外れた ときだけ AIに 聞き、返事は **待たない**——その あいだも 相手は 声で
   * 答えて いる ので、遅れて 開くのが ちょうど 話し終える ころに なる。
   */
  const noteDiscovered = useCallback(
    (text: string) => {
      const asked = normalizeReading(text);
      const hit = (meeting.discover ?? []).find(
        (item) =>
          !found.has(item.id) &&
          item.keywords.some((word) => asked.includes(normalizeReading(word))),
      );
      if (hit) {
        openCard(hit.id);
        return hit;
      }
      const left = (meeting.discover ?? [])
        .filter((item) => !found.has(item.id))
        .map((item) => ({ id: item.id, label: item.label }));
      void requestCardHit(meeting.id, left, text).then((id) => {
        if (id) openCard(id);
      });
      return null;
    },
    [meeting, found, openCard],
  );

  /* こえで 聞いた ぶんを チャットに 残し、札を 見る */
  const judgedRef = useRef<number | null>(null);
  useEffect(() => {
    const heard = voice.lastUtterance;
    if (!heard || heard.id === judgedRef.current) return;
    judgedRef.current = heard.id;
    // 効果の 中で そのまま 状態を 変えない（描き直しが 連なる）。1つ 後ろへ ずらす
    void Promise.resolve().then(() => {
      pushChat({ kind: "me", text: heard.text });
      noteDiscovered(heard.text);
    });
  }, [voice.lastUtterance, noteDiscovered, pushChat]);

  /* 相手が 声で 言った ことも 残す（字幕は 流れて いく） */
  useEffect(() => {
    const fresh = voice.turns.slice(spokenSeenRef.current);
    if (fresh.length === 0) return;
    spokenSeenRef.current = voice.turns.length;
    const said = fresh.filter((turn) => turn.from === "client");
    if (said.length === 0) return;
    const url = voice.lastAudio?.url;
    void Promise.resolve().then(() => {
      said.forEach((turn, at) => {
        const text = stripDirections(turn.text);
        if (text === "") return;
        pushChat({ kind: "host", text, audioUrl: at === said.length - 1 ? url : undefined });
      });
    });
  }, [voice.turns, voice.lastAudio, pushChat]);

  /* チャットは いつも いちばん下を 見せる */
  useEffect(() => {
    const box = chatRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [chat]);

  /* しおり（開いた 札）を 端末に 残す */
  useEffect(() => {
    if (!joined) return;
    saveMeetingResume({
      meetingId: meeting.id,
      index: 0,
      openIds: [],
      answers: {},
      affection: { perQuestion: {}, finished: false },
      round: "listen",
      found: [...found],
      missedIds: [],
    });
  }, [joined, meeting.id, found]);

  /** はじめの ひとこと（この 教材の 入口の ことば）。 */
  const opening = fillName(meeting.closing, learnerName);
  const openedRef = useRef(false);
  useEffect(() => {
    if (!joined || openedRef.current) return;
    openedRef.current = true;
    pushChat({ kind: "host", text: opening, audioUrl: meeting.closingAudioUrl });
    if (meeting.closingAudioUrl) clip.play(meeting.closingAudioUrl, rateOf(speed));
  }, [joined, opening, meeting.closingAudioUrl, clip, speed, pushChat]);

  const stopClip = clip.stop;
  const submit = useCallback(() => {
    const text = draft.trim();
    if (text === "") return;
    stopClip();
    setDraft("");
    pushChat({ kind: "me", text });
    const hit = noteDiscovered(text);
    if (live) {
      voice.sendText(text);
      return;
    }
    /*
     * 声で つないで いない 学習者を **誰も いない 部屋**に しない。
     * 当たれば 教材に 書いた 答えを 出し、外れたら 責めずに 次の 一手を 書く。
     */
    if (hit) pushChat({ kind: "host", text: hit.answer });
    else
      pushChat({
        kind: "coach",
        fallback: {
          advice: {
            praise: "しつもんが 言えましたね。",
            fix: "こえで つなぐと、ヘンディさんが 答えて くれます。",
            example: "",
          },
          note: "かいた ことばは のこります。",
        },
      });
  }, [draft, live, noteDiscovered, pushChat, stopClip, voice]);

  /**
   * おわる（たいしつ から）。話しきったと 本人が 思った ところが おわり（P13）。
   * 見つける ことが 0の 教材も ある ので、「ぜんぶ 見つけた」を おわりに しない。
   */
  const finish = useCallback(() => {
    const today: MeetingRecord = {
      meetingId: meeting.id,
      at: new Date().toISOString(),
      lines: (meeting.discover ?? [])
        .filter((item) => found.has(item.id))
        .map((item) => ({ questionId: item.id, ask: item.label, answer: item.answer })),
    };
    setRecord(today);
    saveMeetingRecord(today);
    setCertificate(true);
  }, [meeting, found]);

  const closeCertificate = useCallback(() => {
    setCertificate(false);
    recordContentProgress(meeting.id, { status: "completed" });
    // 話しきった。つぎに 開いた ときは はじめから 聞ける
    clearMeetingResume(meeting.id);
  }, [meeting.id]);

  const chatPanel = (
    <div className="card-island flex h-[46vh] min-h-64 flex-col p-0 sm:h-[62vh]">
      <p className="text-navy border-hairline border-b px-3 py-2 text-sm font-black">
        💬 テキストチャット
      </p>
      <div
        ref={chatRef}
        role="log"
        aria-label="かいわ"
        className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3"
      >
        {chat.map((entry) => (
          <ChatLine
            key={entry.id}
            entry={entry}
            hostName={meeting.host.name}
            furigana={furigana}
            dictionary={dictionary}
            onReplay={
              entry.kind === "host" && entry.audioUrl && !voice.speaking
                ? () => clip.play(entry.audioUrl as string, rateOf(speed))
                : undefined
            }
          />
        ))}
      </div>
      <form
        className="border-hairline flex items-center gap-2 border-t p-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`${meeting.host.name}さんに 聞いて みましょう`}
          aria-label="こたえを 入力する"
          className="border-hairline text-ink min-w-0 flex-1 rounded-full border-2 bg-white px-3 py-1.5 text-sm font-bold"
        />
        <button
          type="submit"
          aria-label="おくる"
          className="btn-game shrink-0 rounded-full px-3 py-1.5 text-sm"
        >
          ➤
        </button>
      </form>
    </div>
  );

  return (
    <div className={embedded ? "" : "mx-auto w-full max-w-4xl px-4 py-6"}>
      <CallShell
        title={meeting.title}
        focus={meeting.focus}
        furigana={furigana}
        dictionary={dictionary}
        purpose="speak"
        tone="light"
        side={chatPanel}
        speak={
          (meeting.discover ?? []).length > 0 ? (
            <DiscoverCards
              order={(meeting.discover ?? []).map((d) => d.id)}
              labels={Object.fromEntries((meeting.discover ?? []).map((d) => [d.id, d.label]))}
              foundIds={found}
              justFoundId={justFoundId}
              hostName={meeting.host.name}
              furigana={furigana}
            />
          ) : null
        }
        settings={<SpeechSpeedPicker value={speed} onChange={saveSpeechSpeed} tone="light" />}
        activeSpeaker={voice.speaking ? meeting.host.id : null}
        /* 光るのは 札が 開いた 瞬間だけ（学習の 行為に ひもづける） */
        celebrate={justFoundId !== null ? meeting.host.id : null}
        faces={{
          [meeting.host.id]: (
            <VisemeFace
              dir={`/img/characters/${meeting.host.id}/mouth`}
              sources={hostMouth}
              utterance=""
              /* 作り置きを 鳴らして いる あいだは そちらの 音で 口を 動かす */
              analyser={clip.playing ? clip.analyser : voice.analyser}
              alt={meeting.host.name}
            />
          ),
        }}
        onJoined={() => setJoined(true)}
        /*
         * たいしつ が おわりの 道（2026-08-21 に「ミーティングを おわる」を 消した）。
         * 押すと しゅうりょうしょうが 出て、閉じた ときに おわりが 書かれる。
         */
        onLeft={() => {
          voice.stop();
          finish();
        }}
        participants={[
          {
            id: meeting.host.id,
            name: meeting.host.name,
            role: meeting.host.role,
            accent: meeting.host.accent,
          },
        ]}
      >
        <div className="space-y-3">
          <p className="text-navy text-base font-black">
            <RubyText
              text={`${meeting.host.name}さんに 聞いて みましょう。`}
              index={CHROME_FURIGANA}
              show
            />
          </p>

          <div className="card-island space-y-2 p-4">
            <SpeakButton
              status={voice.status}
              reason={voice.reason}
              talking={voice.talking}
              disabled={voice.speaking}
              onConnect={() => void voice.start(instruction, hostVoice)}
              onStartTalking={() => {
                stopClip();
                voice.startTalking();
              }}
              onStopTalking={voice.stopTalking}
            />
          </div>

          {/* まえの ばんで 話した こと。分けた ぶんを ここで 手わたす */}
          {prior && prior.lines.length > 0 ? (
            <PreviousRecordCard record={prior} furigana={furigana} />
          ) : null}
        </div>
      </CallShell>

      {certificate && record ? (
        <CertificateModal
          record={record}
          discovered={(meeting.discover ?? [])
            .filter((item) => found.has(item.id))
            .map((item) => item.label)}
          learnerName={learnerName}
          hostName={meeting.host.name}
          furigana={furigana}
          nextLabel="ステージに もどる →"
          onNext={closeCertificate}
        />
      ) : null}
    </div>
  );
}
