"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import type { Meeting, MeetingQuestion } from "@/content/schema";
import { CallShell } from "@/components/call-shell";
import { DictionaryText } from "@/components/dictionary-text";
import { RubyText } from "@/components/ruby-text";
import type { DictionaryEntry } from "@/lib/dictionary";
import { buildFuriganaIndex, kanaOf, type FuriganaIndex } from "@/lib/text/furigana";
import { HINT_BLANK, hintPatterns } from "@/lib/meeting/hint";
import { MAX_ATTEMPTS, type JudgeResult } from "@/lib/meeting/judge";
import {
  awardAnswer,
  awardCompletion,
  heartsOf,
  rewardOpen,
  type AffectionState,
} from "@/lib/meeting/affection";
import { recordMeetingTurn } from "@/lib/meeting/log";
import {
  readMeetingRecord,
  readMeetingRecordOnServer,
  saveMeetingRecord,
  shortAsk,
  subscribeMeetingRecord,
  type MeetingRecord,
} from "@/lib/meeting/record";
import { asksToSkip, needsJapaneseInput } from "@/lib/meeting/input";
import { clearMeetingResume, restoreMeeting, saveMeetingResume } from "@/lib/meeting/resume";
import { JUDGE_FURIGANA } from "@/components/meeting/ui-furigana";
import { fillName, shouldReplayAsk, stripDirections } from "@/lib/meeting/speech";
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
import { AffectionMeter } from "./affection-meter";
import { localJudge, type AdviceText } from "./japanese-check";
import {
  dropJudgeSession,
  judgeFailNote,
  requestCardHit,
  requestJudge,
  type JudgeApiResult,
} from "./judge-api";
import { JudgeCard } from "./judge-card";
import { DiscoverCards, QuestionCards } from "./question-board";
import { PreviousRecordCard, RewardCard } from "./result-card";
import { HintModal } from "./hint-modal";
import { CertificateModal } from "./certificate-modal";
import { JudgeModal } from "./judge-modal";
import { SpeakButton } from "./speak-button";
import { SpeechSpeedPicker } from "./speech-speed-picker";
import { VisemeFace, type Viseme } from "./viseme-face";
import { useClipPlayer } from "./use-clip-player";
import { useLiveVoice } from "./use-live-voice";

/**
 * ミーティング — Zoom風の画面で、相手の質問に自分の日本語で答える。
 *
 * ## ねらいは2つある
 * 1. **Zoomの操作に慣れる**。ノックして入り、カメラとマイクを見て、お礼を言って出る。
 * 2. **話が続く形を覚える**。相手は必ず受け取ってから次を聞く。
 *
 * ## 返事は AI が作る（テンプレートではない）
 * 以前は `echo` の `◯◯` を学習者の答えで置き換えていた。だから
 * 「どこから 来ましたか」に「うるさい」と答えると
 * 「うるさいですか。いい ところですね。」と返っていた——**噛み合っているかを
 * 誰も見ていなかった**。いまは 判定に通し、意味と形の2軸で見て、
 * すばらしい／つたわった／もう いちど を返す（src/lib/meeting/judge.ts）。
 *
 * ## 声でも 書いても、同じ会話になる
 * - Live につながっていれば、**書いて送っても相手は声で返す**（sendText）
 * - つながっていなければ、判定APIが返した `reply` を画面に出す
 * どちらの道でも、日本語の見かた（JudgeCard）は同じように出る。
 *
 * ## 詰まらせない
 * 言い直しは最大2回まで（`MAX_ATTEMPTS`）。そのあとは判定を残したまま必ず先へ進む。
 * ここが崩れると、いちばん助けが要る学習者だけが会話を終われなくなる。
 *
 * ## 型文（かたぶん）は はじめから 見えている
 * 答え方の足場（`question.hint`）を「ヒント」ボタンの向こうに隠していたが、
 * 声で日本語を話すのが いちばん こわい学習者は、**ボタンの存在に気づかないまま固まる**。
 * だから既定で入力欄のすぐ上に出し、隠すかどうかは学習者が握るつまみにする
 *（設計05 §5.5 の初級＝常時表示／設計01 P11 の「負荷の調整装置は学習者の手に」）。
 * 選んだ状態は端末に残るので、次の質問でも 次の教材でも 追いかけてくる
 *（判定と保存は `src/lib/meeting/hint.ts`）。
 *
 * ## 進み具合を「開く箱」で見せる（設計01 P2）
 * 画面の脇に **？？？ポイントボード**を置く。きょう聞かれることが伏せ札で並び、
 * 答えられた札だけがフリップして開く。何問めかを数字で言うより、
 * 「札が1枚 開いた」ほうが、次の一言を出す理由になる。
 *
 * ## 好感度は 教材が 決める（`meeting.affection` があるときだけ）
 * ハートは**上がるだけ**（P8）。点の配り方と閾値の判定は
 * `src/lib/meeting/affection.ts` の純粋な関数が持つ——ここに書くと、
 * 画面を直すたびに黙って基準が動き、テストで固定できない。
 *
 * ## おわりに 手が 空にならない（P13）
 * 話しきったら「きょう 話せた こと」を1枚のカードにして端末に残す。
 * 次に来たときは「まえの きろく」として読める。
 *
 * ## だまって つづきから（2026-08-21 の指定）
 * 一度は「いつも はじめから」に した（2026-08-18）。いまは **端末に 残った
 * ところから、確認を 出さずに 座り直す**——12問に なって から、途中で 閉じた
 * 学習者を 1問目に 戻すのは 一日ぶんの 授業を 消すのと 同じに なった。
 * 復元の 決まりは `src/lib/meeting/resume.ts` が 1か所で 持つ。
 *
 * ## 差し込みの 役（`@/lib/meeting/speech`）
 * `ask` は 呼び名、`echo` は **学習者の答え**、`hint` は どちらでもない。
 * 1つの関数で 順に 置換すると 先に 呼び名が 全部 食べてしまう（実際に 起きていた）。
 */

/**
 * 画面の飾り（ヒントの つまみ・見出し・見守りの ことば）に出る漢字の読み。
 *
 * 教材の読み辞書（`meeting.furigana`）は 教材の 本文の ための ものなので、
 * 画面が自分で出す語はここで覆う（規律2: 学習者が読む漢字を裸で出さない）。
 * 教材の索引と混ぜないのは、混ぜると教材側のルビの当たり方が変わるため。
 */
const CHROME_FURIGANA = buildFuriganaIndex([
  ["日本語", "にほんご"],
  ["入力", "にゅうりょく"],
  ["全部", "ぜんぶ"],
  ["答", "こた"],
  ["開", "ひら"],
  ["声", "こえ"],
  ["今度", "こんど"],
  ["番", "ばん"],
  ["質問", "しつもん"],
  ["言", "い"],
  ["見", "み"],
  ["書", "か"],
  ["文", "ぶん"],
  ["聞", "き"],
  ["話", "はな"],
  ["来", "き"],
]);

/*
 * ラウンド2の **足場**は 板の カード（`DiscoverCards`）に 一本化した
 *（2026-08-21 の 指定「聞いて みましょう は カードの 内容と 被るので 不要」）。
 *
 * 足場そのものを 消した わけでは ない。しつもんが 終わった とたんに ヒントが
 * 消えて 白い 入力欄だけが 残るのは、設計01 P6 の アンチパターン
 *「足場なしの『自由に 聞いて みましょう』」——ここは いまも 踏まない。
 * 変えたのは 置き場所で、**聞ける ことを 板に 出して、文は 消した**。
 * 板と 文の 2か所に 置くと、ちがう ことを 2回 案内する ことに なる。
 */

/**
 * 見守りの ことば（送る前に 気づいて ほしい こと）。
 *
 * 「不正解」ではなく **次の 一手**を書く。どちらも 画面から 消えるのは
 * 学習者が 次の 操作を した ときだけで、答えは 消さない（打ち直しに ならない）。
 */
/**
 * チャット欄の 1行。
 *
 * 相手の ことば（`ask`・`host`）／自分の ことば（`me`）／日本語の 見かた（`coach`）を
 * **同じ 流れ**に 積む。話し手が 混ざらない ように、色と 名札で 分ける
 *（見かたは 相手の ことばでは ない ——`judge-card.tsx` の 決まりを 守る）。
 */
type ChatBody =
  /** 教材の しつもん（作り置きの こえが あれば 聞き直せる）。 */
  | { kind: "ask"; questionId: string; text: string; audioUrl?: string }
  /** 相手の 受け止め（文字で 返った ぶん。声の ぶんは 字幕で 届く）。 */
  /** 相手の ことば。`audioUrl` が あれば 🔊 で 聞き返せる（作り置き・その場の こえ 両方）。 */
  | { kind: "host"; text: string; audioUrl?: string }
  /** 学習者が 言った こと。 */
  | { kind: "me"; text: string }
  /** 日本語の 見かた（相手の ことばでは ない）。 */
  | {
      kind: "coach";
      judge?: JudgeResult;
      fallback?: Fallback;
      note?: string | null;
      /**
       * AIに 通せなかった **理由の 名前**（学習者には 見せない）。
       * 画面に 出す ことばは 理由を まとめて しまうので、どこで つまずいたのかが
       * 通し検証の 写真から 読めなかった（2026-08-20）。印だけ 残す。
       */
      reason?: string | null;
    };

type ChatEntry = ChatBody & { id: string };

const NOTICE = {
  empty: "だいじょうぶです。ヒントの 文を そのまま 書いても いいですよ。",
  latin: "キーボードが 日本語入力に なって いないかも しれません。たしかめて みましょう。",
} as const;
type NoticeKey = keyof typeof NOTICE;

/** 端末に保存された呼び名を読む（別のタブで変わったら追いつく）。 */
function subscribeToProfile(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
function readName(): string {
  return getProfile()?.displayName ?? "";
}
/** サーバでは端末の保存値が読めない。名前なしで描いて、画面が出てから差し替える。 */
function readNameOnServer(): string {
  return "";
}

/** 判定が使えなかったときの、規則ベースの助言（会話は止めない）。 */
interface Fallback {
  advice: AdviceText;
  note: string;
}

interface Reply {
  /** 相手の返事（画面に出す文）。Live が声で返しているときは空。 */
  echo: string;
  judge: JudgeResult | null;
  fallback: Fallback | null;
}

/** 画面の ばん（上の コメントの 5つ）。 */
type Phase = "きく" | "こたえる" | "はなす" | "みている" | "みかた";

export function MeetingSession({
  meeting,
  /** 相手の声（人物カードの voice）。Live に渡して、まんがと同じ声で話させる。 */
  hostVoice,
  /** 相手の口パクの絵（人物カードの mouth）。無ければ置き場の決まりに従う。 */
  hostMouth,
  /**
   * ことばの 辞書（単語ステージを 畳んだもの）。相手の しつもんと
   * 「きょう やること」の ことばに 下線が つき、タップで 意味が 出る。
   *
   * 読みもの（`article-view`）と 同じ 引き先を 使う——ミーティング専用の
   * 用語集を 別に 持つと、同じ「先輩」の 説明が 2つに 割れて 育つ。
   * 中身は 先生が スタジオ（DB）で 直せる（`src/lib/dictionary.ts`）。
   */
  dictionary,
  /** ステージの枠の中に置くとき。戻り先は枠が持つ。 */
  embedded = false,
}: {
  meeting: Meeting;
  hostVoice?: string;
  hostMouth?: Partial<Record<Viseme, string>>;
  dictionary?: readonly DictionaryEntry[];
  embedded?: boolean;
}) {
  const furigana = useMemo(() => buildFuriganaIndex(meeting.furigana ?? []), [meeting.furigana]);
  /**
   * 端末に 残って いた ところ。**開いた ときに 1回だけ 読む**。
   *
   * 購読（`useSyncExternalStore`）に しないのは、別の タブで 保存された ときに
   * 会話の 途中で 位置が 飛ぶ ため。しおりは 初期値の ための もの。
   */
  const questionIds = useMemo(() => meeting.questions.map((q) => q.id), [meeting.questions]);
  const [resume] = useState(() => restoreMeeting(meeting.id, questionIds));
  const [index, setIndex] = useState(resume.index);
  /**
   * 部屋に 入ったか。**音は 入ってから 鳴らす**。
   *
   * ロビーに いる あいだも この 部品は 動いて いるので、入る 前に 1問目の 声を
   * 鳴らして いた——ブラウザは 人が さわる 前の 音を 止めるので **鳴らないまま
   * 鳴った ことに なり**、入った ときには もう 二度と 鳴らなかった
   *（「セリフが 再生されない ときが ある」の 正体の ひとつ）。
   */
  const [joined, setJoined] = useState(false);
  /** 相手の 話す 速さ（端末に 残る。ヒントの 出し入れと 同じ 流儀）。 */
  const speed = useSyncExternalStore(
    subscribeSpeechSpeed,
    readSpeechSpeed,
    readSpeechSpeedOnServer,
  );
  /**
   * **話しはじめた ときの しつもん**。声の 答えは 言い終わってから 届くので、
   * 届いた ころには 画面が つぎへ 進んで いる ことが ある。判定は これで 見る。
   */
  const answeringRef = useRef<MeetingQuestion | null>(null);
  /** チャット欄に 積む 記録（相手の しつもん・自分の 答え・見かた）。 */
  const [chat, setChat] = useState<readonly ChatEntry[]>([]);
  /**
   * 聞き出せた こと（願い #94）。
   *
   * ぜんぶ 答えた あとの おしゃべりを「相手の ことを 見つける」練習に する。
   * 開くのは **学習者の しつもんが 当たった とき**だけ——自分で 引き出した から
   * 開く 価値が ある（設計01 P2）。判定は この 端末の 中で 済ませる。
   */
  const [found, setFound] = useState<ReadonlySet<string>>(() => new Set(resume.found));
  /** いま 聞けた ばかりの 札（板の カードを 1回だけ 光らせる）。 */
  const [justFoundId, setJustFoundId] = useState<string | null>(null);
  /** 日本語の 見かたを ポップアップで 出して いるか。 */
  const [judgeOpen, setJudgeOpen] = useState(false);
  /** ポップアップに そのまま 見せる「あなたの ことば」。 */
  const [lastSaid, setLastSaid] = useState("");
  /** ポップアップに 見せる「その とき 聞かれて いた しつもん」。 */
  const [judgedAsk, setJudgedAsk] = useState("");
  /** ヒントの ポップアップを 出して いるか。 */
  const [hintOpen, setHintOpen] = useState(false);
  /** しゅうりょうしょうを 出して いるか（どちらの ばんの ぶんか）。 */
  const [certificate, setCertificate] = useState<"round1" | "round2" | "review" | null>(null);
  /** チャットに 積んだ 相手の ことばの 数（字幕の どこまでを 出したか）。 */
  const spokenSeenRef = useRef(0);
  /** AIに 通せなかった 理由（ポップアップの 下に 小さく 出す）。 */
  const [judgeNote, setJudgeNote] = useState<string | null>(null);
  const pushChat = useCallback((entry: ChatBody) => {
    setChat((prev) => [...prev, { ...entry, id: `${prev.length}-${entry.kind}` }]);
  }, []);
  const [draft, setDraft] = useState("");
  const [reply, setReply] = useState<Reply | null>(null);
  const [thinking, setThinking] = useState(false);
  /** 同じ質問への何回目の発話か（1始まり）。言い直しの上限に使う。 */
  const [attempt, setAttempt] = useState(1);
  /**
   * 質問ID → 学習者が さいごに 言った ことば。
   *
   * 以前は配列に押し込んでいたが、言い直しや判定の落ちかたによって
   * 質問の並びと一致しなくなる（同じ質問で2つ入る・入らない質問がある）。
   * きろくカードは「どの質問に 何と 答えたか」を見せるものなので、質問IDで持つ。
   */
  const [answers, setAnswers] = useState<Readonly<Record<string, string>>>(resume.answers);
  /** 開いた札（＝言い直しを求められずに 答えられた質問）。 */
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set(resume.openIds));
  /** いちばん最近ひらいた札。祝いの ✨ と 相手タイルの発光の的。 */
  const [justOpenedId, setJustOpenedId] = useState<string | null>(null);
  /** 好感度。教材に affection が無いときは触られないまま残る。 */
  const [affection, setAffection] = useState<AffectionState>(resume.affection);
  /** 送る前の 見守り（からっぽ・日本語入力で ない）。答えは 消さない。 */
  const [notice, setNotice] = useState<NoticeKey | null>(null);
  /**
   * 見守りを 出した ことば。**同じ ことばで もう一度 押したら そのまま 送る**。
   * ここを 止め続けると、ローマ字で しか 打てない 端末の 学習者が 進めなくなる
   *（見守りは 関所では なく 気づきの ひとこと）。
   */
  const [noticedText, setNoticedText] = useState<string | null>(null);
  /** いま増えたハート（メーターのポップ用）。つぎの質問へ行くと 0 に戻る。 */
  const [gained, setGained] = useState(0);
  /**
   * きょうの きろく。**話しきった ときに 1度だけ 組み立てる**。
   * 描画のたびに作ると日付が動き続けるし、保存したものと画面のものがずれる。
   */
  const [record, setRecord] = useState<MeetingRecord | null>(null);
  /**
   * 学習者の呼び名。診断のときに決めた名前を、相手が呼べるようにする。
   *
   * 効果の中で読んで state に入れると、描画のたびに書き込みが連鎖する
   *（React Compiler が禁じる）。端末の保存値は「外の入れ物」なので、
   * 購読して読む形にする（マップの分身と同じやり方）。
   */
  const learnerName = useSyncExternalStore(subscribeToProfile, readName, readNameOnServer);
  /**
   * 前に来たときの きろく。端末の保存値は「外の入れ物」なので購読して読む。
   * 出すのは会話の途中だけ——おわりの画面では、いま作ったカードのほうを見せる。
   */
  const previous = useSyncExternalStore(
    subscribeMeetingRecord,
    () => readMeetingRecord(meeting.id),
    readMeetingRecordOnServer,
  );
  /*
   * 型文を 見せるかの 保存は やめた（2026-08-20）。ヒントは **ポップアップ**に なり、
   * 「出しっぱなしに するか」という つまみ自体が 無くなった ので、
   * 端末に 残す ものも 無い（`src/lib/meeting/hint.ts` の 保存は 他で 使う）。
   */
  const voice = useLiveVoice();
  /** 作り置きの音声（質問・おわりの ひとこと）。 */
  const clip = useClipPlayer();
  /** 判定ずみの発話ID（同じ発話を二度見ない）。 */
  const judgedRef = useRef(0);

  const question = meeting.questions[index];
  /**
   * **進みぐあい**——ヘンディさんからの しつもんを ぜんぶ 答えたか。後戻りしない。
   *
   * ここと 下の `round` は **別の もの**（2026-08-21）。
   * 前は 1つの `done` に 畳んで いた ため、「ぜんぶ 答えた」と「いま 聞く ばんを
   * 見て いる」が 同じ 値に なって いて、**ばんを 選べる ように できなかった**。
   * 畳み直したく なったら、この 2行を 読んでから に する。
   */
  const round1Done = index >= meeting.questions.length;
  /** **いま 見て いる ばん**——学習者が 帯を 押して 選ぶ。 */
  const [round, setRound] = useState<"ask" | "listen">(resume.round);
  /** 聞く ばん（ラウンド2）を 見て いるか。画面の 出し分けは これで 決める。 */
  const done = round === "listen";
  const live = voice.status === "live";

  /*
   * **いまは 誰の ばんか**（2026-08-20 の 指定「1個ずつ 確実に フローが 進むように」）。
   *
   * これまでは 触れる ものが いつでも 全部 押せた。相手が 話して いる 途中で
   * マイクを 開けたり、見かたを 待って いる 間に もう一度 送れたり する ので、
   * 対話の 回数が 増えるほど 状態が 食い違って いった。
   * 5つの ばんに 分け、**そのばんに 意味の ある ものだけ**を 触れる ようにする。
   *
   *   きく    … 相手が **こえで** 話して いる（機械の ばん）
   *   こたえる … 話しても 書いても よい（学習者の ばん）
   *   はなす  … マイクが 開いて いる（止める 操作だけ）
   *   みている … 見かたを 待って いる（機械の ばん）
   *   みかた  … ポップアップが 出て いる（読んで 押す だけ）
   *
   * 状態は **持たずに 導く**。別に 持つと、更新の 抜けで 画面と 中身が ずれる。
   *
   * ## 作り置きの しつもんの 音は「ばん」に 数えない
   * はじめは これも「きく」ばんに して いたが、**答えが 分かって いる 学習者を
   * 音が 鳴り終わるまで 待たせる**ことに なる（自動検証でも 6問 続けて 答えられなく
   * なった）。作り置きの 音は こちらの 都合なので、**答えはじめたら 止める**——
   * 待たせるのは、相手が 生の こえで 話して いる あいだ だけに する。
   */
  const phase: Phase = judgeOpen
    ? "みかた"
    : thinking
      ? "みている"
      : voice.talking
        ? "はなす"
        : voice.speaking
          ? "きく"
          : "こたえる";
  /** 学習者が 答えを **出せる** ばんか（送る・話しはじめる）。 */
  const canAnswer = phase === "こたえる";
  /**
   * 書く こと自体は、相手が 話して いる あいだも 許す。
   *
   * 送るのは 1つずつでも、**考えを 書きとめる のを 止める 理由は 無い**——
   * 聞きながら 打ちはじめる 学習者は 多い。止めるのは マイクが 開いて いる 間と、
   * 見かたを 待って いる 間だけ。
   */
  const canType = phase === "こたえる" || phase === "きく";

  /**
   * 呼び名を差し込む（`ask` / `closing` / `reward` 用）。
   * **`echo` には 通さない**——あちらの `◯◯` は 学習者の 答えの 場所（`fillAnswer`）。
   */
  const withName = useCallback((text: string) => fillName(text, learnerName), [learnerName]);

  /**
   * 聞き出せたか を 見て、当たった 札を 開く。
   *
   * **文字でも こえでも ここを 通す**。前は 書いて 送った ときだけ 見て いたので、
   * こえで 聞いた 学習者は 札が 1枚も 開かなかった（2026-08-21 に fable が 指摘）。
   *
   * 表記ゆれを 吸収してから 見る（`normalizeReading` は アプリで 唯一の 実装）。
   * 素の 文字くらべに して いた ころは、「サイフを おとしました」と カタカナで
   * 書いた 学習者の 札が 開かなかった——聞けて いるのに 開かないのは、
   * いちばん がっかりする 外れ方（規約: 正規化を 再実装しない）。
   */
  const openCard = useCallback((id: string) => {
    setFound((prev) => (prev.has(id) ? prev : new Set([...prev, id])));
    setJustFoundId(id);
  }, []);

  const noteDiscovered = useCallback(
    (text: string) => {
      const asked = normalizeReading(text);
      const hit = meeting.discover.find(
        (item) =>
          !found.has(item.id) &&
          item.keywords.some((word) => asked.includes(normalizeReading(word))),
      );
      if (hit) {
        openCard(hit.id);
        return hit;
      }
      /*
       * ことばが 当たらなかった ときだけ **AIに 聞く**（2026-08-21 の 指定
       *「カードの 内容の 質問が できたかの 判定は しっかり 行って」）。
       *
       * 言いかえは ことばの 照合では 拾えない——「日本の 人は しんせつですか」は
       * どの ことばにも 当たらないが、学習者は たしかに 財布の 話を 引き出して いる。
       * 返事を **待たない**のは、その あいだも 相手が 声で 答えて いる ため。
       * 遅れて 札が 開くのは、ちょうど 相手が 話し終える ころに なる。
       * 鍵の 無い 学習者は ここを 通らない（`requestCardHit` が すぐ null を 返す）。
       */
      const left = meeting.discover
        .filter((item) => !found.has(item.id))
        .map((item) => ({ id: item.id, label: item.label }));
      void requestCardHit(meeting.id, left, text).then((id) => {
        if (id) openCard(id);
      });
      return null;
    },
    [meeting, found, openCard],
  );

  const askText = question ? withName(question.ask) : "";

  /*
   * カードに 出す **みじかい ことば**。しつもんの 文を そのまま 入れると
   * 6枚の カードが 文字で うまる ので、`shortAsk` で 切る（きろくカードと 同じ 切り方）。
   */
  const cardLabels = useMemo(
    () =>
      Object.fromEntries(meeting.questions.map((q) => [q.id, shortAsk(withName(q.ask))])) as Record<
        string,
        string
      >,
    [meeting.questions, withName],
  );

  /** 聞き出せた ことの 見出し（しゅうりょうしょうに 並べる）。 */
  const foundLabels = useMemo(
    () => meeting.discover.filter((d) => found.has(d.id)).map((d) => d.label),
    [meeting.discover, found],
  );

  /** ラウンド2の 板に 出す ことば（`discover.label` を そのまま つかう）。 */
  const discoverLabels = useMemo(
    () =>
      Object.fromEntries(meeting.discover.map((d) => [d.id, d.label])) as Record<string, string>,
    [meeting.discover],
  );

  /** いま読み上げている文（かな）。口の形はここから取る。 */
  const spokenKana = useMemo(() => {
    const text = reply?.echo || askText;
    return kanaOf(text, furigana) ?? text;
  }, [reply, askText, furigana]);

  /**
   * 相手（Live）に渡す指示。人格・きょう聞くこと・呼び名だけを渡す。
   *
   * **`judgePrompt` はここに入れない。** 入れると、相手が声で直しはじめ、
   * 画面の見かた（JudgeCard）と2人で別々のことを言う。相手は会話を続ける役、
   * 教えるのは画面の役、と分けておく（判定は `judge-api.ts` の 別の つなぎが 持つ）。
   */
  /**
   * **両方の ばんに 同じ 文で 置く もの**（人格＋出力の 衛生）。
   *
   * ここに 置いて よいのは「誰か」と「どう 話すか」だけ。**進み方の 決まりは
   * 置かない**——ばんが 変われば 仕事が 変わる ので、混ぜた 瞬間に どちらかが
   * 嘘に なる（ラウンド1の「自分の 話を 足さない」と ラウンド2の「聞かれたら
   * 話す」は 正面から ぶつかる）。
   */
  const commonRules = useMemo(
    () =>
      [
        meeting.persona,
        "",
        "日本語の 直しは 言わないで ください（直しは 画面が 出します）。",
        /*
         * **ト書きを 読み上げさせない**（2026-08-20 の 指摘）。
         * 人格に「学生が だまったら、答え方の れいを 見せて」と 書いて あった ため、
         * 相手は それを **そのまま 声に 出した**。条件の 書き方は 台本の ト書きと
         * 見分けが つかないので、**かっこ そのものを 禁じる**（2026-08-21）。
         * 出して よい ものと だめな ものを 見分けさせるより、こちらの ほうが 守れる。
         */
        "学生に 向けて 話す ことばだけを 言って ください。せつめいや やり方は 言いません。",
        "かっこ（）は つかわないで ください。",
        /*
         * **道具（function calling）は 持たせない**（2026-08-20）。
         * 「かならず 1回 nihongo_no_mikata を 呼んで」と 毎ターン 縛って いた ため、
         * 相手は それを **声の 本文として** 出しはじめ、チャット欄に
         * `call:nihongo_no_mikata{…}` が そのまま 出た（実発生）。
         * 見かたは **別の つなぎ**（judge-api.ts の 文字だけの セッション）で もらう。
         */
        "あなたから 学生に しつもんを しては いけません。",
      ].join("\n"),
    [meeting],
  );

  /**
   * **ラウンド1**（ヘンディさんの しつもんに 答える ばん）の 指示文。
   *
   * 相手の 仕事は **受け止めて 返す ことだけ**。自分の 話・つぎの 話を 足させない
   *（2026-08-21 の 指摘「ドローンいいですよね と 外国から来ました は 何の 関係も ない」）。
   * 学習者の 名前は **渡さない**——1問目が「お名前を おしえて ください」なので、
   * もう 知って いる 人が 聞く 形に なる（2026-08-18 の 実発生）。
   */
  const askInstruction = useMemo(
    () =>
      [
        commonRules,
        "",
        "いまは「" + meeting.host.name + "さんから しつもん」の 時間です。",
        /*
         * **しつもんの 一覧も 渡さない**。渡して いた ころは 相手が 自分の 判断で
         * 先へ 進み、同じ ことを くり返したり 飛ばしたり した。聞く ことは 画面が 出す。
         */
        "しつもんは 画面が します。あなたは しつもんを しないで ください。",
        "あなたの しごとは 1つだけです。学生の ことばを 受け止めて、みじかく 返します。",
        "返しは「くりかえし ＋ 共感の ひとこと」の 形に します。れい:「◯◯ですか。いいですね。」",
        "1回の 返事は 2文までです。",
        "返したら そこで 止めます。自分の 話（しごと・国・けいけん）や、つづきの 話を 足しません。",
        /*
         * ラウンド1の 途中で 学生が 逆に 聞いて きた ときの **逃げ道を ことばで 用意する**。
         * 無いと、そこから 自分語りが 始まる（ラウンド2の 楽しみも 先に 使って しまう）。
         */
        "学生から 何かを 聞かれたら、「ありがとう ございます。その 話は、あとの しつもんの 時間で しましょう。」と 返します。",
        "学生が 自分で 名乗るまで、名前や あだ名で 呼ばないで ください。",
      ].join("\n"),
    [commonRules, meeting],
  );

  /**
   * **ラウンド2**（学習者が ヘンディさんに 聞く ばん）の 指示文。
   *
   * ## 台本を 読ませるのを やめた（2026-08-21）
   * 前は 8つの 話を 渡して「書いて ある 中身の とおりに 話して ください」と 縛って
   * いた。この 2つが 合わさると、相手は **どんな しつもんにも 8つの 中から
   * いちばん 近い ものを 選んで 読み上げる**——休みの 日の ことを 聞いたのに
   * 電車の 話が 返る（2026-08-21 の 指摘「質問に 対する 答えとして ブレる」）。
   *
   * 直したのは **渡し方では なく 縛り方**。話は そのまま 渡し、
   *「合う ものが ある ときだけ 使う・自分の ことばで 話して よい・
   * できごとと 数は 変えない」に する。事実は 教材が 固定し、言い回しと
   * 使いどころは 相手に 返す。
   *
   * ## 話を 見出しだけに しない
   * 見出しだけ 渡して 中身を 作らせると、**鍵の 無い 学習者に 見える 教材の 文**
   *（`discover.answer`）と 相手の こえが ちがう ことを 言う。先生が 書いた ものが
   * 使われなく なる。
   *
   * ## 相手から しつもんは させない（緩めない）
   * 札の 当たり判定は **学習者が 言った ことだけ**を 見る。相手が 聞き返すと、
   * それに 答えた ことばで 札が 開く——聞き出して いないのに 開く。
   * 誘いは 疑問形で ない 固定句（「ほかにも 聞いて ください。」）で 回す。
   *
   * 名前は **こちらでは 渡す**。もう 名乗って いるし、張り直しで 相手の 記憶は
   * 消えて いる（呼べないと「さっき 言ったのに」に なる）。
   */
  const listenInstruction = useMemo(
    () =>
      [
        commonRules,
        "",
        "いまは「" +
          meeting.host.name +
          "さんに しつもん」の 時間です。こんどは 学生が あなたに しつもんを します。",
        learnerName
          ? `学生の 名前は ${learnerName}さんです。${learnerName}さんと 呼んで ください。`
          : "",
        "いちばん 大事な 決まりです。聞かれた ことに、まっすぐ 答えます。聞かれて いない 話は しません。",
        "れい。休みの 日の ことを 聞かれたら、休みの 日の 話だけを します。しごとの 話は しません。",
        "まず、しつもんに 合う 答えを 1文で 言います。その あとに、くわしい 話を つづけます。",
        (meeting.discover ?? []).length > 0
          ? [
              "下の「おもいで」は、あなたが ほんとうに けいけんした ことです。",
              "学生の しつもんに 合う おもいでが ある ときだけ、その おもいでを 話します。",
              "おもいでは 自分の ことばで 話して いいです。ただし、できごとと 数は 変えません。足しません。",
              "学生が おもいでの つづきを 聞いたら、おなじ おもいでの つづきを 話します。",
              "合う おもいでが ない ときは、おもいでを つかいません。あなたの ままで、2文までで みじかく 答えます。",
              "聞かれる 前に、自分から おもいでを 話しはじめません。",
            ].join("\n")
          : "知らない ことを 聞かれたら、2文までで みじかく 答えます。",
        "知らない ことは「わかりません」、決まって いない ことは「まだ 決めて いません」と 答えます。",
        "1回の 返事で 話すのは 1つの 話だけです。長さは 4文までです。",
        "話しおわったら、「ほかにも 聞いて ください。」と さそって ください。",
        "学生の しつもんが 聞きとれなかったら、「すみません、もう いちど おねがいします。」と 言って ください。",
        (meeting.discover ?? []).length > 0
          ? [
              "",
              "# おもいで",
              ...(meeting.discover ?? []).map((d) => `- ${d.label}: ${d.answer}`),
            ].join("\n")
          : "",
      ]
        .filter((line) => line !== "")
        .join("\n"),
    [commonRules, meeting, learnerName],
  );

  /**
   * いま つなぐ ときに 渡す 指示文。
   *
   * 選ぶ 基準は **表示中の 帯（`round`）ではなく `round1Done`**。帯は 行き来できるので、
   * 帯で 決めると 見るたびに 張り直しが 起きる。`round1Done` は 後戻りしないので
   * 張り直しは 一生に 1回で 済む。
   */
  const instruction = round1Done ? listenInstruction : askInstruction;

  /*
   * **ばんが 変わったら 黙って つなぎ直す**（指示文は つなぐ ときにしか 渡せない）。
   *
   * しゅうりょうしょうが 開いて いる 間なので、学習者は マイクに 触れない
   *（docs/constraints.md 2026-08-20）。相手が 話しおわるのを 待ってから 張り直す——
   * 途中で 切ると さいごの 受け止めの こえが 尻切れに なる。
   */
  const swapInstruction = voice.swapInstruction;
  const swappedRef = useRef(false);
  useEffect(() => {
    if (!round1Done || swappedRef.current || voice.speaking) return;
    swappedRef.current = true;
    void swapInstruction(listenInstruction, hostVoice);
  }, [round1Done, voice.speaking, swapInstruction, listenInstruction, hostVoice]);

  /**
   * 1つの発話ぶんの「ごほうび」をまとめて更新する。
   *
   * 札を開くのは**言い直しを求められなかったとき**だけ（まだ直している最中に
   * 開くと、開いた札の意味が薄まる）。ハートは判定に関わらず足す——miss でも
   * 会話が前に進んだことは変わらないので（P8: 罰を見せない）。
   */
  const rewardTurn = useCallback(
    (
      questionId: string,
      utterance: string,
      grade: JudgeResult["grade"] | null,
      opened: boolean,
    ) => {
      setAnswers((prev) => ({ ...prev, [questionId]: utterance }));
      if (opened) {
        setOpenIds((prev) => new Set([...prev, questionId]));
        setJustOpenedId(questionId);
      }
      const next = awardAnswer(affection, questionId, grade);
      setAffection(next);
      setGained(heartsOf(next) - heartsOf(affection));
    },
    [affection],
  );

  /*
   * **しおりを 書く**（2026-08-21 の 指定「画面更新などした 場合でも 途中から
   * プレイできる ように」）。
   *
   * 1か所（効果）で まとめて 書く。答えた ところ・進んだ ところ・ばんを 変えた ところ、と
   * 別々に 書いて いた ら、**どれか 1つ 書き忘れた 瞬間に ずれる**——ずれた しおりは
   * 学習者を 変な ところに 座らせる ので、消えて いる より たちが 悪い。
   */
  useEffect(() => {
    if (!joined) return;
    saveMeetingResume({
      meetingId: meeting.id,
      index,
      openIds: [...openIds],
      answers,
      affection,
      round,
      found: [...found],
    });
  }, [joined, meeting.id, index, openIds, answers, affection, round, found]);

  /**
   * 1つの発話を見る。声でも文字でも、ここを通る。
   *
   * `spoken` が true のときは Live が声で返しているので、画面には返事を出さない
   *（同じキャラが2つの違うことを言うのを防ぐ）。
   */
  const judgeUtterance = useCallback(
    async (
      utterance: string,
      spoken: boolean,
      target?: MeetingQuestion,
      /** すでに チャットに 出して ある（二重に 積まない）。 */
      logged = false,
    ) => {
      /*
       * **どの しつもんへの 答えか**を 呼ぶ側から 受け取る。
       *
       * いまの しつもん（`question`）で 見て いた ころは、こんな ことが 起きて いた:
       * 声で 答える → 相手が 話しはじめた 合図で 判定に 出す → その 少し 前に
       * 画面は つぎの しつもんへ 進んで いる ——「どこから 来ましたか」の 画面で
       *「わたしは トミー です。」と 直され（＝1問目の 基準で 見られ）て いた
       *（2026-08-18 の 指摘）。答えは **話しはじめた ときの しつもん**で 見る。
       */
      const asked = target ?? question;
      if (!asked) return;
      const at = Date.now();
      if (!logged) pushChat({ kind: "me", text: utterance });
      setLastSaid(utterance);
      setJudgedAsk(withName(asked.ask));
      setThinking(true);
      /*
       * 見かたは **声とは 別の つなぎ**で もらう（judge-api.ts）。
       * 声で 答えても 書いて 答えても、通る 道は 1本——道が 2本 あった ころは、
       * 声の 人だけ ポップアップが 出ない ことが あった（2026-08-18 の 実発生）。
       */
      /*
       * ここで 投げられると `thinking` が 立った ままに なり、**画面が 二度と
       * 動かなく なる**（触れる ものを ばんで 絞って いる ぶん、止まると 全部 止まる）。
       * 見かたは 出なくても いいが、止まるのは だめ——必ず 受け止める。
       */
      const result = await requestJudge({
        meetingId: meeting.id,
        questionId: asked.id,
        ask: withName(asked.ask),
        hint: asked.hint,
        keywords: asked.keywords,
        judgePrompt: meeting.judgePrompt,
        hostName: meeting.host.name,
        learnerName,
        utterance,
        attempt,
      }).catch((): JudgeApiResult => ({ ok: false, reason: "network" }));
      setThinking(false);

      /*
       * AIに 通せた ときも 通せなかった ときも、**同じ 形**で ポップアップを 出す。
       * 通せなかった ときだけ 黙って 進めて いた ころは、学習者から 見て
       *「言った のに 何も 出ない ときが ある」に なって いた（2026-08-20 の 指定）。
       */
      const judge = result.ok ? result.judge : localJudge(utterance);
      const note = result.ok ? null : judgeFailNote(result.reason);
      setJudgeNote(note);
      setReply({ echo: spoken ? "" : judge.reply, judge, fallback: null });
      // 声で 返して いる ときは、相手の ことばは 字幕（voice.turns）で 届く
      if (!spoken && judge.reply) pushChat({ kind: "host", text: judge.reply });
      pushChat({ kind: "coach", judge, note, reason: result.ok ? null : result.reason });
      setJudgeOpen(true);
      rewardTurn(asked.id, utterance, result.ok ? judge.grade : null, !judge.retry);
      void recordMeetingTurn({
        meetingId: meeting.id,
        questionId: asked.id,
        attempt,
        mode: spoken ? "voice" : "text",
        utterance,
        judge: result.ok ? judge : null,
        fallback: result.ok ? "none" : result.reason,
        model: result.ok ? result.model : "",
        latencyMs: Date.now() - at,
      });
    },
    [question, meeting, attempt, learnerName, withName, rewardTurn, pushChat],
  );

  /**
   * 質問が変わったら、作り置きの音声を鳴らす。
   *
   * Live につながっているときは鳴らさない——相手が自分で質問を読むので、
   * 2つの声が重なる。つながっていない学習者（キーが無い・マイクが無い）にとっては、
   * ここが**唯一 声を聞ける場所**になる。
   */
  /*
   * 相手が **声で** 言った ことを チャットにも 残す（2026-08-18 の 指定）。
   * 字幕（`voice.turns`）は 流れて いく ので、あとから 読み返せない。
   * 自分の ことばは 判定の ところで 積んで いる ので、ここは 相手のぶんだけ。
   */
  useEffect(() => {
    const fresh = voice.turns.slice(spokenSeenRef.current);
    if (fresh.length === 0) return;
    spokenSeenRef.current = voice.turns.length;
    const said = fresh.filter((turn) => turn.from === "client");
    if (said.length === 0) return;
    /*
     * その ターンの こえを **🔊 で 聞き返せる ように する**（2026-08-21 の 指定）。
     * 生の こえは そのままの 速さで 流れて いく ので、聞きとれなかった 学習者の
     * 逃げ道が ここに なる——押すと 選んだ 速さで、高さは 変えずに 鳴る。
     * 音は 1ターンに 1つ なので、さいごの ひとことに つける。
     */
    const url = voice.lastAudio?.url;
    void Promise.resolve().then(() => {
      said.forEach((turn, at) => {
        // ト書きを 字に 残さない（`stripDirections` の 説明を 参照）
        const text = stripDirections(turn.text);
        if (text === "") return;
        pushChat({ kind: "host", text, audioUrl: at === said.length - 1 ? url : undefined });
      });
    });
  }, [voice.turns, voice.lastAudio, pushChat]);

  /*
   * 判定の つなぎは **画面を 離れる ときに 閉じる**。
   * 張りっぱなしに して 学習者を 待たせない かわりに、置き去りにも しない。
   */
  useEffect(() => dropJudgeSession, []);

  /*
   * 選んだ 速さは **聞き返す ときに 効く**（2026-08-21 の 指定）。
   * 生の こえは 届いた そばから そのままの 速さで 鳴らす——ここで 速さを
   * 合わせようと すると、ターンぶん ためる ことに なり、返事までの 間が 空く。
   */

  const clipUrl = round1Done ? meeting.closingAudioUrl : question?.audioUrl;
  const playClip = clip.play;
  const stopClip = clip.stop;
  /*
   * 選んだ 速さは **ref で 持つ**。効果の 引き金に すると、速さを 変えた だけで
   * いまの しつもんが 鳴り直す——「触って いない ものが 動く」の 実物だった
   *（fable の 指摘・2026-08-20）。速さは つぎに 鳴る ものから 効く。
   */
  const clipRateRef = useRef(rateOf(speed));
  useEffect(() => {
    clipRateRef.current = rateOf(speed);
  }, [speed]);
  /** すでに 鳴らした しつもん（同じ ものを 二度 鳴らさない）。 */
  const playedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!joined || !clipUrl || playedRef.current === clipUrl) return;
    /*
     * **相手が 話し終わるまで 待つ**（2026-08-20 の 指定）。
     *
     * 前は 相手の こえを 途中で 黙らせて から つぎの しつもんを 鳴らして いた。
     * 声は 重ならなく なった が、こんどは **ヘンディさんの ことばが 途中で
     * 切れる**——学習者が ポップアップを 早く 閉じるほど 切れる。
     * 鳴らすのは「相手が 話しおわって から」に して、順番で 重なりを 防ぐ。
     */
    if (voice.speaking) return;
    playedRef.current = clipUrl;
    playClip(clipUrl, clipRateRef.current);
  }, [joined, clipUrl, playClip, voice.speaking]);

  // 声で話したぶんを見る。相手が話しはじめた合図で1つに束ねてから届く
  useEffect(() => {
    const heard = voice.lastUtterance;
    if (!heard || heard.id === judgedRef.current) return;
    judgedRef.current = heard.id;
    /*
     * 聞く ばんは **判定を しない**（自由に 聞く 時間なので 点を つけない）。
     * かわりに 聞き出せたかを 見て 札を 開く。答えは 相手が こえで 返す。
     */
    if (round1Done) {
      /*
       * **自分が 言った ことも チャットに 残す**（2026-08-21 の 指摘
       *「ヘンディさんに 質問で 自分が 話した 内容が テキストチャットに 表示されない」）。
       * ラウンド1は 判定の ところで 積んで いるが、ここは 判定を 通らない ので
       * どこでも 積まれず、学習者の ことばだけが 記録から 抜けて いた。
       * 効果の 中で そのまま 状態を 変えない（描き直しが 連なる）。1つ 後ろへ ずらす。
       */
      void Promise.resolve().then(() => {
        pushChat({ kind: "me", text: heard.text });
        noteDiscovered(heard.text);
      });
      return;
    }
    void judgeUtterance(heard.text, true, answeringRef.current ?? undefined);
  }, [voice.lastUtterance, judgeUtterance, round1Done, noteDiscovered, pushChat]);

  const next = useCallback(() => {
    const at = index + 1;
    const finishing = at >= meeting.questions.length;
    /*
     * **通りすぎる しつもんの 札を 開く**（2026-08-21 の 指摘
     *「途中から 始めたら 4つ目しか 開かれて いませんでした」）。
     *
     * 札は これまで **1回で 言えた とき だけ** 開いて いた（`rewardTurn` の `opened`）。
     * 言い直しを して から 答えた しつもんは、先へ 進んだ あとも ？ の まま 残る。
     * 「こたえると、カードが ひらきます」と 書いて ある 板が、実際には
     * **1回で 言えた 数**を 数えて いた——できなかった ことを 数える 板は P8 に 反する。
     *
     * 直しの 最中に 開かない ことは 変えない（`rewardTurn` は そのまま）。
     * 開くのは **その しつもんを 離れる とき**で、ひとことでも 言って いれば 開く。
     */
    const leaving = meeting.questions[index];
    if (leaving && (answers[leaving.id] ?? "") !== "") {
      setOpenIds((prev) => (prev.has(leaving.id) ? prev : new Set([...prev, leaving.id])));
    }
    /*
     * 相手に つぎを 言わせる。**画面の 質問と 相手の ことばを 1つに 保つ**ため、
     * 進むのと 同じ ところで 合図を 出す（別の 効果に すると、進み方に よって
     * 出したり 出さなかったり する）。
     */
    const ask = meeting.questions[at];
    // つぎの しつもんは チャットにも 積む（あとから 読み返せる）
    if (ask) {
      pushChat({
        kind: "ask",
        questionId: ask.id,
        text: withName(ask.ask),
        audioUrl: ask.audioUrl,
      });
    }
    setIndex(at);
    setDraft("");
    // 型文は ここで 隠さない。学習者が 決めた 見せ方は 質問を またいで 続く
    setReply(null);
    setAttempt(1);
    setJustOpenedId(null);
    setNotice(null);
    setNoticedText(null);

    if (finishing) {
      /*
       * ぜんぶ 答えた。**進むのと ばんの 切りかえを 1か所で やる**——
       * 別の 効果に すると、進み方に よって 切りかわったり しなかったり する。
       */
      setRound("listen");
      /*
       * **ばんの 変わり目の ことばを チャットに 残す**（2026-08-21 の 指定）。
       * 画面の 上には 同じ 文が 大きく 出て いるが、あれは 先へ 進むと 流れて しまう。
       * 会話の 記録の 側にも 置いて おくと、あとから 読み返せる。
       */
      pushChat({ kind: "host", text: withName(meeting.closing) });
      // さいごまで話しきったぶんのハートと、手に残るきろくは ここで一度だけ作る
      const finished = awardCompletion(affection);
      setAffection(finished);
      setGained(heartsOf(finished) - heartsOf(affection));
      const today: MeetingRecord = {
        meetingId: meeting.id,
        at: new Date().toISOString(),
        lines: meeting.questions
          .filter((q) => (answers[q.id] ?? "") !== "")
          .map((q) => ({
            questionId: q.id,
            ask: shortAsk(withName(q.ask)),
            answer: answers[q.id] ?? "",
          })),
        hearts: meeting.affection ? heartsOf(finished) : undefined,
        maxHearts: meeting.affection?.maxHearts,
      };
      setRecord(today);
      // 保存が できない 端末（プライベートモード等）でも、画面の カードは 出る
      saveMeetingRecord(today);
      // ぜんぶ 答えた ことを 1枚に して 見せる（つぎは 聞く ばん）
      setCertificate("round1");
    } else {
      setGained(0);
    }

    /*
     * **`completed` は ここでは 書かない**（2026-08-21）。
     *
     * ヘンディさんからの しつもんが 終わった 瞬間に「ステージ クリア」の しらせが
     * 出て、**聞く ばんの 上に かぶさって** いた。順番の 問題なので、重ねる 順番では
     * なく **書く ところ**で 直す——おわりは ラウンド2の しゅうりょうしょうを
     * 閉じた とき（`finishMeeting`）。
     * ついでに 意味の ずれも 直る（前は 聞く ばんを 1度も やらない 人も 完走扱いだった）。
     */
    recordContentProgress(meeting.id, {
      status: "started",
      position: { panel: at },
    });
  }, [index, meeting, answers, affection, withName, pushChat]);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (thinking) return;
    /*
     * 作り置きの しつもんが まだ 鳴って いたら **止める**。
     * 答えはじめた 学習者を 待たせない かわりに、返事と 重ならない ように する。
     */
    stopClip();
    /*
     * 決まった しつもんが ぜんぶ 終わった あとは **自由な おしゃべり**。
     * 判定も 進行も しない——相手に そのまま 渡して、返事を 待つ（2026-08-18 の 指定）。
     */
    if (done) {
      if (text.length === 0) return;
      setDraft("");
      pushChat({ kind: "me", text });
      /*
       * 聞き出せたか を 見る。当たった ら 札を 開く。
       * 声が つながって いない ときは、教材に 書いた 答えを そのまま 出す
       *（**聞けば 答えが 返る**という 会話の 形を、声の あるなしで 変えない）。
       */
      const hit = noteDiscovered(text);

      if (live) {
        voice.sendText(text);
      } else if (hit) {
        pushChat({ kind: "host", text: hit.answer });
      } else {
        /*
         * 声で つないで いない 学習者は、**誰も いない 部屋に 話しかけて いた**
         *（2026-08-18 fable の 指摘）。返事の ふりを する のでは なく、
         * どうすれば 答えて もらえるか と、書いた ことが むだに ならない ことを
         * その場で 言う（責めない・次の 一手を 書く）。
         */
        pushChat({
          kind: "coach",
          fallback: {
            advice: {
              praise: "しつもんが 言えましたね。",
              fix: "こえで つなぐと、ヘンディさんが 答えて くれます。",
              example: "",
            },
            note: "かいた ことばは「話せた こと」に のこります。",
          },
        });
      }
      return;
    }
    if (!question) return;
    /*
     * 何も書いていないときは、AIを呼ばずに 見守りの ひとことを 出す（待たせない）。
     * ここで `reply` を 作って いた ころは、送りボタンが 「つぎへ →」に 変わり、
     * **書いて みましょうと 言った 直後に 書いた 答えが 捨てられて いた**。
     * 見守りは `reply` と 別の 入れ物で 持ち、ボタンは「はなす」の ままにする。
     */
    if (text.length === 0) {
      setNotice("empty");
      return;
    }
    /*
     * 日本語入力に なって いない ときだけ 声を かける（クイズの inspectReadingInput と
     * 同じ 配慮）。ミーティングの 答えは 漢字・カタカナ混じりが 正常なので、
     * 弾くのは「日本語の 文字が 1つも 無い」ときに 限る。
     * 同じ ことばで もう一度 押されたら そのまま 送る——止め続けない。
     */
    if (needsJapaneseInput(text) && noticedText !== text) {
      setNotice("latin");
      setNoticedText(text);
      return;
    }
    setNotice(null);
    setNoticedText(null);
    setDraft("");
    /*
     * 「すみません、つぎを おねがいします」——**ことばで 逃げられる**（P6・P10）。
     * 判定に かけないのは、逃げの ひとことを 答えとして 見て
     *「もう いちど」と 返すと、いちばん 詰まって いる 学習者を そこに 縛る ため。
     */
    if (asksToSkip(text)) {
      pushChat({ kind: "me", text });
      next();
      return;
    }
    // Live につながっていれば、書いた文でも相手は**声で**返す
    answeringRef.current = question;
    if (live) voice.sendText(text);
    void judgeUtterance(text, live, question);
  }, [
    draft,
    question,
    thinking,
    live,
    voice,
    judgeUtterance,
    noticedText,
    next,
    pushChat,
    done,
    noteDiscovered,
    stopClip,
  ]);

  /** 同じ質問をもう一度。回数だけ増やして、質問は変えない。 */
  const retry = useCallback(() => {
    setAttempt((n) => Math.min(n + 1, MAX_ATTEMPTS));
    setReply(null);
    setDraft("");
    setNotice(null);
    setGained(0);
    /*
     * **しつもんを もう一度 鳴らす**（2026-08-21 の 指定）。
     * 言い直しを 頼まれた 人が いちばん 知りたいのは「何を 聞かれて いたか」。
     * 相手が 受け止めの こえを 話して いる 間は 鳴らさない（声が 重なる）。
     */
    const url = question?.audioUrl;
    if (url && shouldReplayAsk({ hasAudio: true, hostSpeaking: voice.speaking })) {
      clip.play(url, rateOf(speed));
    }
  }, [question, voice.speaking, clip, speed]);

  /**
   * 答えられない ときの 逃げ道。**札は 開かない**まま つぎの 質問へ。
   *
   * 空のまま「はなす」を押すと 実際には 進めたのに、画面には 助言しか 出ず
   * 「進める」とは どこにも 書いて いなかった。答えられない 学習者は そこで
   * 座り込む——90分の 授業では それが いちばん 起きる（P8: 詰まらせない）。
   */
  /**
   * いまの質問の型文。「そのまま 口に 出せる 文」の並びにして持つ。
   * **呼び名を差し込まない**（`withName` を通さない）——`hint` の `◯◯` は
   * 学習者が自分のことばを入れる穴で、名前の目印ではない。
   */
  const hintLines = useMemo(() => hintPatterns(question?.hint ?? ""), [question]);

  /**
   * 型文に 穴が あるか。
   * 「はい。ほうこくします。」の ように そのまま 言える 型文でも
   * 「◯◯ は あなたの ことばです。」を 出して いたので、指す 先の 無い
   * 注意書きだけが 残って いた。穴が ある ときだけ 添える。
   */
  const hintHasBlank = useMemo(
    () => hintLines.some((line) => line.includes(HINT_BLANK)),
    [hintLines],
  );

  /*
   * 会話の 記録（チャット欄に 上から 順に 積む）。
   *
   * これまでは「いまの ひとこと」だけを 画面に 出して いたので、少し 前に
   * 何を 言われたか・どう 直せば よいかは **消えて いた**。学習者は 読み返せない。
   * Zoom の チャットと 同じで、**下に 伸びて 上へ さかのぼれる** 形に する。
   */
  const chatRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // いつも いちばん 下（＝いまの しつもん）を 見せる
    const box = chatRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [chat.length, thinking]);

  /**
   * 判定は **ポップアップ**で 見せ、つぎに 進むのは 学習者が 押して 決める。
   *
   * 時間で 自動に 進めて いた ころは、つたわったのか もう いちどなのかが
   * 流れて しまい、**正しく 言っても 進まない**ように 見える ことが あった
   *（2026-08-18 の 指摘）。押した ぶんだけ 進む 形なら、迷いも 取りこぼしも 無い。
   */
  /**
   * 聞く ばんを おえる。
   *
   * 「ぜんぶ 見つけた」を おわりに できない 教材が ある（見つける ことが 0の
   * ミーティングも ある）ので、**学習者が 押して 決める**。
   * 話しきったと 本人が 思った ところが おわり（設計01 P13）。
   */
  const finishMeeting = useCallback(() => {
    const today: MeetingRecord = {
      meetingId: meeting.id,
      at: new Date().toISOString(),
      lines: meeting.questions
        .filter((q) => (answers[q.id] ?? "") !== "")
        .map((q) => ({
          questionId: q.id,
          ask: shortAsk(withName(q.ask)),
          answer: answers[q.id] ?? "",
        })),
      hearts: meeting.affection ? heartsOf(affection) : undefined,
      maxHearts: meeting.affection?.maxHearts,
    };
    setRecord(today);
    saveMeetingRecord(today);
    setCertificate("round2");
  }, [meeting, answers, affection, withName]);

  /**
   * しゅうりょうしょうを 閉じた とき。
   *
   * **ここで はじめて `completed` を 書く**。ステージ クリアの しらせは
   * `completed` で 出る ので、閉じた あとに 出る 順番が これで 決まる
   *（重ねる 順番では なく、書く 順番で 直す）。
   */
  const closeCertificate = useCallback(() => {
    const which = certificate;
    setCertificate(null);
    // 見返して いただけの ときは 何も 起こさない（まだ おわって いない）
    if (which !== "round2") return;
    recordContentProgress(meeting.id, { status: "completed" });
    // 話しきった。つぎに 開いた ときは はじめから 話せる
    clearMeetingResume(meeting.id);
  }, [certificate, meeting.id]);

  const closeJudge = useCallback(() => {
    const again = reply?.judge?.retry === true;
    setJudgeOpen(false);
    setJudgeNote(null);
    /*
     * おわった あとは 進めない。さいごの しつもんの あとに もう一度 進めて
     * しまい、同じ ところを ぐるぐる 回って いた（2026-08-18 の 実発生）。
     */
    if (round1Done) return;
    if (again) retry();
    else next();
  }, [reply, retry, next, round1Done]);

  /** いま持っているハート。教材に affection が無いときは画面のどこにも出ない。 */
  const hearts = heartsOf(affection);

  /*
   * チャット欄。**ここだけが スクロールする**。おわった あとも 出しつづける——
   * 決まった しつもんが 終わったら **自由な おしゃべり**に なるので、
   * ここが 閉じると 話す ところが 無くなる（2026-08-18 の 指定）。
   */
  /*
   * **テキストチャット**（添付の 画面の 右の 列）。
   *
   * 見出し・記録・書いて 送る 欄を 1つの カードに まとめる。前は 記録だけが
   * 会話の 下に あり、書く 欄は さらに その 下に あった ので、**話す ところと
   * 書く ところが 画面の 端と 端**に 離れて いた。
   */
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
            /*
             * もう いちど 聞く。**相手が 話して いる あいだは 押せない**（音が 重なる）。
             * しつもん（作り置き）は「こたえる」ばんだけ、その場の こえは
             * 相手が 黙って いれば いつでも——聞きとれなかった ときに 押す ものなので、
             * 判定を 待って いる あいだも 使える ほうが よい。
             */
            onReplay={
              (entry.kind === "ask" || entry.kind === "host") &&
              entry.audioUrl &&
              !voice.speaking &&
              (entry.kind !== "ask" || canAnswer)
                ? () => clip.play(entry.audioUrl as string, rateOf(speed))
                : undefined
            }
          />
        ))}
        {thinking ? (
          <p className="bg-panel-tint text-ink-soft rounded-[var(--radius-card)] px-4 py-2 text-sm font-black">
            {meeting.host.name}さんが{" "}
            <ruby>
              聞<rt>き</rt>
            </ruby>
            いて います…
          </p>
        ) : null}
      </div>

      {/* 書いて 送る 欄は チャットの 足もと（添付の 画面と 同じ） */}
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
          placeholder={done ? "ヘンディさんに 聞いて みましょう" : "メッセージを 入力…"}
          aria-label="こたえを 入力する"
          disabled={!canType}
          className="border-hairline text-ink min-w-0 flex-1 rounded-full border-2 bg-white px-3 py-1.5 text-sm font-bold disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!canAnswer}
          aria-label="おくる"
          className="btn-game shrink-0 rounded-full px-3 py-1.5 text-sm disabled:opacity-40"
        >
          ➤
        </button>
      </form>
    </div>
  );

  const main = done ? (
    <div className="space-y-3">
      <div className="card-island p-5">
        <p className="text-navy text-lg font-black">
          <DictionaryText
            text={withName(meeting.closing)}
            index={furigana}
            show
            dictionary={dictionary}
          />
        </p>
      </div>

      {/*
        話せた ことは **ポップアップで 見る**（2026-08-21 の 指定）。
        画面に 出しっぱなしに すると、ラウンド2の しつもんの 場所が その ぶん
        下へ 追いやられる——いま やる ことは 聞く ことで、見返すのは ときどきで よい。
      */}
      {record ? (
        <button
          type="button"
          onClick={() => setCertificate("review")}
          aria-label="話せた ことを 見る"
          className="card-island text-navy w-full px-4 py-3 text-left text-sm font-black"
        >
          🗒️ <RubyText text="話せた ことを 見る" index={CHROME_FURIGANA} show />
          <span className="text-ink-soft ml-2 text-xs font-bold">
            （{record.lines.length} ／ {found.size}）
          </span>
        </button>
      ) : null}

      {/*
        とっておきの話は closing の あと。届かなかったときは 何も出さない
        ——「開かなかった箱」を見せるのは、この教材では 罰にしかならない（P8）。
      */}
      {meeting.affection && rewardOpen(affection, meeting.affection.threshold) ? (
        <RewardCard
          text={withName(meeting.affection.reward)}
          hostName={meeting.host.name}
          furigana={furigana}
        />
      ) : null}

      {/*
        ここからは **役が 入れかわる**。「じゆうに どうぞ」だけでは 白紙の 前で
        止まるので、何を する 時間なのかを 先に 言う（設計01 P1: 役割の 付与）。
      */}
      <p className="text-sky text-xs font-extrabold">ラウンド 2</p>
      <p className="text-navy text-base font-black">
        <RubyText
          text={`今度は、あなたが 聞く 番です。${meeting.host.name}さんに 質問して みましょう。`}
          index={CHROME_FURIGANA}
          show
        />
      </p>
      {/*
        見つける ことの 一覧は **相手の 顔の すぐ下の 板**（`DiscoverCards`）へ 移した
        （2026-08-21 の 指定「02の 場合は 02の カードを 表示して」）。
        ここに もう一度 出すと、同じ ものが 画面に 2つ 並ぶ。
      */}
    </div>
  ) : null;

  /*
   * **いま どの ばんか**の 帯（2つ）。
   *
   * 「はじまり」は 消した（2026-08-21 の 指定）——この 画面まで 来て いる 時点で
   * 済んで いる ことなので、いつも ✅ が 1つ 並ぶだけ だった。
   *
   * 押して **切り替えられる**。ただし 聞く ばんは、ヘンディさんの しつもんを
   * ぜんぶ 答えるまで **押せない**（消さずに 灰色で 残す——消えると
   * 「さっき あった ものが 無い」と 探しはじめる）。
   */
  const roundSteps = (
    <div className="card-island flex items-center gap-1.5 overflow-x-auto p-2">
      {(
        [
          { key: "ask", label: `${meeting.host.name}さんから しつもん`, locked: false },
          { key: "listen", label: `${meeting.host.name}さんに しつもん`, locked: !round1Done },
        ] as const
      ).map((step, at) => {
        const now = round === step.key;
        const cleared = step.key === "ask" && round1Done;
        return (
          <button
            key={step.key}
            type="button"
            onClick={() => setRound(step.key)}
            disabled={step.locked}
            aria-current={now ? "step" : undefined}
            aria-label={`${step.label}${step.locked ? "（まだ ひらきません）" : ""}`}
            className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold disabled:opacity-45"
            style={{
              background: now
                ? "var(--color-sky-deep)"
                : cleared
                  ? "var(--color-panel-tint)"
                  : "transparent",
              color: now ? "#fff" : cleared ? "var(--color-ink-soft)" : "var(--color-ink-faint)",
            }}
          >
            <span className="opacity-70">{`0${at + 1}`}</span>
            <RubyText text={step.label} index={furigana} show />
            {step.locked ? <span>🔒</span> : cleared ? <span>✅</span> : null}
          </button>
        );
      })}
      {!round1Done ? (
        <span className="text-ink-faint ml-1 shrink-0 text-[11px] font-bold">
          <RubyText text="全部 答えると 開きます" index={CHROME_FURIGANA} show />
        </span>
      ) : null}
    </div>
  );

  const body = (
    <div className="space-y-3">
      {meeting.affection ? (
        <AffectionMeter
          hearts={hearts}
          maxHearts={meeting.affection.maxHearts}
          gained={gained}
          threshold={meeting.affection.threshold}
          hostName={meeting.host.name}
        />
      ) : null}
      {main}
      {/* まえの きろくは おわりの 画面では 出さない（きょうの カードを 見せる） */}
      {!round1Done && previous && previous.lines.length > 0 ? (
        <PreviousRecordCard record={previous} furigana={furigana} />
      ) : null}
    </div>
  );

  const controls = done ? (
    /*
     * 聞く ばんの 操作は **マイクだけ**（2026-08-21 の 指定）。
     *
     * 消した ものが 2つ ある。
     * ①「ヘンディさんに 聞いて みましょう」＋ 聞き方の 4つ … 板（`DiscoverCards`）が
     *   同じ ことを もっと 具体的に 出す ように なった ので、二重に なって いた。
     * ②「ミーティングを おわる」 … Zoom と 同じ「たいしつ」が 上に ある。
     *   おわる 道が 2つ ある 画面は、どちらを 押せば よいのか 分からない。
     *   おわりの しゅうりょうしょうは たいしつ から 出す（`onLeft`）。
     */
    <div className="card-island space-y-2 p-4">
      <SpeakButton
        status={voice.status}
        reason={voice.reason}
        talking={voice.talking}
        disabled={!canAnswer && phase !== "はなす"}
        onConnect={() => void voice.start(instruction, hostVoice)}
        onStartTalking={() => {
          stopClip();
          voice.startTalking();
        }}
        onStopTalking={voice.stopTalking}
      />
    </div>
  ) : (
    <div className="card-island space-y-3 p-4">
      <p className="text-sky-deep text-sm font-black">💬 {meeting.host.name}さんから しつもん</p>

      {/* しつもんの 吹き出し。答える 直前に もう一度 読める ように 大きく 出す */}
      {askText ? (
        <div className="flex items-start gap-2">
          <p className="border-hairline text-navy min-w-0 flex-1 rounded-2xl border-2 bg-white px-4 py-3 text-lg font-black break-words">
            <RubyText text={askText} index={furigana} show />
          </p>
          {question?.audioUrl ? (
            <button
              type="button"
              aria-label="もう いちど 聞く"
              disabled={!canAnswer}
              onClick={() => clip.play(question.audioUrl as string, rateOf(speed))}
              className="text-sky shrink-0 self-center text-2xl disabled:opacity-40"
            >
              🔊
            </button>
          ) : null}
        </div>
      ) : null}

      <p className="text-ink-soft text-center text-xs font-extrabold">
        <RubyText text="声で 答えましょう！" index={CHROME_FURIGANA} show />
      </p>

      {/* 速さ｜丸い マイク｜ヒント の 3つ（添付の 画面と 同じ 並び） */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <SpeechSpeedPicker
          value={speed}
          onChange={saveSpeechSpeed}
          tone="light"
          vertical
          disabled={phase === "はなす" || phase === "みている" || phase === "みかた"}
        />
        <SpeakButton
          status={voice.status}
          reason={voice.reason}
          talking={voice.talking}
          disabled={!canAnswer && phase !== "はなす"}
          waitNote={
            phase === "きく"
              ? "いまは きく ばんです"
              : phase === "みている"
                ? "いま みて います"
                : "ポップアップを よんで ください"
          }
          onConnect={() => void voice.start(instruction, hostVoice)}
          onStartTalking={() => {
            answeringRef.current = question ?? null;
            stopClip();
            voice.startTalking();
          }}
          onStopTalking={voice.stopTalking}
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setHintOpen(true)}
            disabled={phase === "みている" || phase === "みかた" || hintLines.length === 0}
            aria-label="ヒントを 見る"
            className="border-sun-deep bg-cream text-navy rounded-full border-2 px-3 py-2 text-xs font-extrabold whitespace-nowrap disabled:opacity-40"
          >
            <RubyText text="💡 ヒント" index={CHROME_FURIGANA} show />
          </button>
        </div>
      </div>

      {notice ? (
        <p className="bg-cream border-hairline text-ink rounded-[var(--radius-card)] border-2 px-4 py-2 text-sm font-bold">
          <RubyText text={NOTICE[notice]} index={CHROME_FURIGANA} show />
        </p>
      ) : null}

      {/*
        「こまったら →「すみません、つぎを おねがいします」」の 一行は 消した
        （2026-08-21 の 指定「その 文字自体が いらない。言って みたけど 何の 役にも
        立たなかった」）。**逃げ道の 仕組みは 残す**——言えば 通れる ことは 変わらない。
      */}
    </div>
  );

  return (
    <div className={embedded ? "" : "mx-auto w-full max-w-4xl px-4 py-6"}>
      <CallShell
        title={meeting.title}
        focus={meeting.focus}
        /* 題・きょう やること・名札の 漢字に ふりがなを つける（教材の 読み辞書） */
        furigana={furigana}
        /* 「きょう やること」の ことばに 意味の 吹き出しを つける */
        dictionary={dictionary}
        /* 話す 教材なので 見出しは「はなす まえに」 */
        purpose="speak"
        /*
         * 話す ところは **Zoom の 画面の 中**（相手の 顔の すぐ下）。
         * 押して いる あいだ だけ こえを 送る——押しっぱなしで 話し、はなすと
         * 相手が 答える。ずっと 送って いた ころは、まわりの 音で 相手の セリフが
         * 途中で 止まって いた。
         */
        speak={
          /*
           * しつもんの カードは 相手の 顔の すぐ下（会話から 目を 離さずに 見える）。
           * **見ている ばんの 板**を 出す（`round1Done` では なく `round`）——
           * 帯は 行き来できるので、押した ばんの 板が 出ないと 押した 意味が 無い。
           */
          round === "listen" && meeting.discover.length > 0 ? (
            <DiscoverCards
              order={meeting.discover.map((d) => d.id)}
              labels={discoverLabels}
              foundIds={found}
              justFoundId={justFoundId}
              hostName={meeting.host.name}
              furigana={furigana}
            />
          ) : (
            <QuestionCards
              order={meeting.questions.map((q) => q.id)}
              labels={cardLabels}
              openIds={openIds}
              currentId={question?.id ?? null}
              justOpenedId={justOpenedId}
              furigana={furigana}
            />
          )
        }
        /* 入る 前にも 速さを 決められる（はじめの ひとことから 効く） */
        settings={<SpeechSpeedPicker value={speed} onChange={saveSpeechSpeed} tone="light" />}
        /*
         * 音は 入ってから 鳴らす（人が さわる 前の 音は ブラウザに 止められる）。
         * 入った ら 1問目を チャットに 出す——**相手の 第一声**が ここに 並ぶ。
         */
        onJoined={() => {
          setJoined(true);
          const first = meeting.questions[index];
          if (first) {
            pushChat({
              kind: "ask",
              questionId: first.id,
              text: withName(first.ask),
              audioUrl: first.audioUrl,
            });
          }
        }}
        /* 出たら つないだ ものを 閉じる（マイクを 開いた ままに しない） */
        /*
         * たいしつ が **おわりの 道**（2026-08-21 の 指定で「ミーティングを おわる」を
         * 消した）。ラウンド2まで 来て いる ときだけ しゅうりょうしょうを 出す——
         * 途中で 出た 人に「よく 話せました」を 見せるのは 嘘に なる。
         */
        onLeft={() => {
          voice.stop();
          if (round1Done) finishMeeting();
        }}
        participants={[meeting.host]}
        activeSpeaker={reply ? meeting.host.id : null}
        /* 発光は学習行為に紐づける（札が開いた・ハートが増えた瞬間だけ光る） */
        celebrate={
          justOpenedId !== null || (meeting.affection && gained > 0) ? meeting.host.id : null
        }
        faces={{
          /*
           * 口の絵は**相手のIDから引く**（人物の id と同じ場所に置く決まり）。
           * ここを1人ぶん決め打ちにすると、先生がスタジオで別の相手の
           * ミーティングを作ったとき、顔だけヘンディさんのままになる。
           */
          [meeting.host.id]: (
            <VisemeFace
              dir={`/img/characters/${meeting.host.id}/mouth`}
              sources={hostMouth}
              utterance={spokenKana}
              /* 作り置きを鳴らしているあいだは そちらの音で 口を動かす */
              analyser={clip.playing ? clip.analyser : voice.analyser}
              alt={meeting.host.name}
            />
          ),
        }}
        /* 添付の 画面に 合わせて **明るい 白の カード**にし、右に チャットを 置く */
        tone="light"
        side={chatPanel}
        controls={
          <div className="space-y-3">
            {roundSteps}
            {controls}
          </div>
        }
        /*
         * 答える ところは **会話の 下**。上に 置いて いた ころは、スマホで
         * 「こう 言えます」と 入力欄が 先に 来て、相手の しつもんが その 下に あった
         * ——何を 聞かれたかを 見るのに、毎回 スクロールで 探す ことに なる。
         */
        /* 話す ところは 会話の 上（添付の 画面と 同じ 並び） */
        controlsAt="top"
      >
        {body}
      </CallShell>

      {/* ヒントは 要る ときに 呼ぶ（出しっぱなしに しない） */}
      {hintOpen && hintLines.length > 0 ? (
        <HintModal
          lines={hintLines}
          hasBlank={hintHasBlank}
          furigana={furigana}
          onClose={() => setHintOpen(false)}
        />
      ) : null}

      {/* しゅうりょうしょう。ひとまとまり 話しきった ことを 1枚に して 見せる */}
      {certificate && record ? (
        <CertificateModal
          record={record}
          discovered={foundLabels}
          mode={certificate === "review" ? "review" : "certificate"}
          learnerName={learnerName}
          hostName={meeting.host.name}
          furigana={furigana}
          nextLabel={
            certificate === "round1"
              ? `${meeting.host.name}さんに 聞いて みる →`
              : certificate === "review"
                ? "とじる"
                : "ステージに もどる →"
          }
          onNext={closeCertificate}
        />
      ) : null}

      {/* 日本語の 見かた。いちばん 前に 出して、つぎに 何を するかを 押して 決める */}
      {judgeOpen && reply?.judge ? (
        <JudgeModal
          judge={reply.judge}
          /* 何に 答えた のかが ポップアップだけで 分かる ように する */
          ask={judgedAsk}
          askFurigana={furigana}
          utterance={lastSaid}
          hostName={meeting.host.name}
          /*
           * **画面が 出した ことば だけ**を 渡す（`echo` は 声の ときは 空）。
           * 判定の `reply` を そのまま 出して いた ため、相手の こえと
           * ポップアップの 字が 食いちがって いた（2026-08-21 の 指摘）。
           */
          reply={reply.echo}
          /* 相手が 話しおわるまで つぎへ 行かせない（2026-08-21 の 指定） */
          waiting={voice.speaking}
          note={judgeNote}
          onNext={closeJudge}
        />
      ) : null}
    </div>
  );
}

/**
 * チャット欄の 1行を 描く。
 *
 * 相手の ことばは 左・自分の ことばは 右——SNS と 同じ 並び方に する
 *（設計01 §1.1「ゲーム・SNS の UI の 文法は 母語の ように 読める」）。
 * 日本語の 見かた（コーチ）は どちらでも ない 色に して、相手の ことばと 混ぜない。
 */
function ChatLine({
  entry,
  hostName,
  furigana,
  dictionary,
  onReplay,
}: {
  entry: ChatEntry;
  hostName: string;
  furigana: FuriganaIndex;
  dictionary?: readonly DictionaryEntry[];
  onReplay?: () => void;
}) {
  if (entry.kind === "coach") {
    return (
      <motion.div
        data-kind="coach"
        data-fallback={entry.reason ?? undefined}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {entry.judge ? <JudgeCard judge={entry.judge} hostName={hostName} /> : null}
        {/* AIに 通せなかった 理由。あとから 読み返せる ように チャットにも 残す */}
        {entry.note ? (
          <p className="text-ink-faint mt-1 text-xs font-bold break-words">{entry.note}</p>
        ) : null}
        {entry.fallback ? (
          <div className="bg-panel-tint space-y-1 rounded-[var(--radius-card)] p-3">
            <p className="text-leaf text-sm font-extrabold">
              🌸 <RubyText text={entry.fallback.advice.praise} index={JUDGE_FURIGANA} show />
            </p>
            {entry.fallback.advice.fix ? (
              <p className="text-ink-soft text-sm font-bold break-words">
                💡 {entry.fallback.advice.fix}
              </p>
            ) : null}
            {entry.fallback.advice.example ? (
              <p className="text-ink rounded-xl bg-white px-3 py-2 text-sm font-bold break-words">
                こう 言うと もっと いいです →「{entry.fallback.advice.example}」
              </p>
            ) : null}
            {entry.fallback.note ? (
              <p className="text-ink-faint text-xs font-bold">{entry.fallback.note}</p>
            ) : null}
          </div>
        ) : null}
      </motion.div>
    );
  }

  const mine = entry.kind === "me";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      data-kind={entry.kind}
      className={mine ? "flex justify-end" : "flex justify-start"}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 ${
          mine ? "bg-sky-soft text-ink" : "bg-panel-tint text-ink"
        }`}
      >
        <p className={`text-[11px] font-extrabold ${mine ? "text-navy" : "text-sky"}`}>
          {mine ? "あなた" : hostName}
          {/* 作り置きの こえが ある ときだけ、その 行を 聞き直せる */}
          {onReplay ? (
            <button
              type="button"
              onClick={onReplay}
              aria-label="もう いちど 聞く"
              className="border-hairline text-navy ml-2 rounded-full border bg-white px-1.5 py-0.5 text-[11px] font-extrabold"
            >
              🔊
            </button>
          ) : null}
        </p>
        <p className="text-ink mt-0.5 leading-relaxed font-bold break-words">
          {entry.kind === "ask" ? (
            <DictionaryText text={entry.text} index={furigana} show dictionary={dictionary} />
          ) : (
            entry.text
          )}
        </p>
      </div>
    </motion.div>
  );
}
