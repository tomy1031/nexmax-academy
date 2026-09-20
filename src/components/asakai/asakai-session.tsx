"use client";

/**
 * 朝礼・夕礼（1週間を 5場面で 通す 報告の 練習・台帳 #366）
 *
 * ## なぜ ミーティングと 別の 画面か
 * `MeetingSession` は「アプリが 1問ずつ 聞き、学習者が 1問ずつ 答える」形で、
 * すでに **ばん・札・frontier** の 3つの 状態を 持って いる。
 * ここは **学習者が 1本の 報告を して、足りない ところだけ 聞き返される**形なので、
 * 同じ 部品に 相乗りさせると「どれが 進行を 決めて いるのか」が 読めなく なる。
 * 対話ゲーム（`TalkGameSession`）と 同じ 分かれ方で、入口で 分ける。
 *
 * ## 何を 既存から 借りるか
 * Zoom の 枠（`CallShell`）・ヒントの ポップアップ・進みぐあいの 記録。
 * 判定は `src/lib/meeting/panels.ts`（純関数）。**作り直さない**。
 *
 * ## 聞き返しは 相手に 考えさせない
 * 教材が 持つ 固定文を **アプリが 選ぶ**。Live に 質問させると、当たり判定は
 * 学習者の 発話だけを 見る ので **その 答えで カードが 開く**（2026-08-21 の 決まり）。
 *
 * ## 何枚 開くかは、鍵が あっても アプリが 数える
 * 鍵が あれば AIにも 報告を 見て もらう（2026-09-14 の 指定「合否ごと AIに 寄せる」）。
 * ただし AIが 返すのは **言えた 行の id**と **作業記録の 読み上げか どうか**だけで、
 * `openAt`・`fullAt`・合格ラインは 1つも 動かさない（設計 #366 の 6.1
 *「何行で 開くかは アプリが 数える」）。AIが 埋めるのは
 * **教材に 書いて ない 言い方の 取りこぼし**で、これは 足し算＝学習者に 有利。
 *
 * 鍵が 無ければ 待たずに ことばの 照合だけで 進む。開く 条件が 同じ なので、
 * **文字入力の 通し検証（E2E）は 鍵ゼロの まま 決定論で 走る**。
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { CallShell } from "@/components/call-shell";
import { DictionaryText } from "@/components/dictionary-text";
import { HintModal } from "@/components/meeting/hint-modal";
import { dropJudgeSession, requestAsakaiJudge } from "@/components/meeting/judge-api";
import { ModalShell } from "@/components/meeting/modal-shell";
import { AskPanel } from "@/components/meeting/ask-panel";
import { ChatPanel } from "@/components/meeting/chat-panel";
import { SpeechSpeedPicker } from "@/components/meeting/speech-speed-picker";
import { StepTabs } from "@/components/meeting/step-tabs";
import { useLiveVoice } from "@/components/meeting/use-live-voice";
import { VisemeFace } from "@/components/meeting/viseme-face";
import { RubyText } from "@/components/ruby-text";
import {
  rateOf,
  readSpeechSpeed,
  readSpeechSpeedOnServer,
  saveSpeechSpeed,
  subscribeSpeechSpeed,
} from "@/lib/meeting/speed";
import { useVoiceQueue } from "@/components/asakai/use-voice-queue";
import {
  CardBoard,
  CountBoxes,
  DayProgress,
  ProgressBoxes,
  SkyStrip,
} from "@/components/asakai/asakai-parts";
import type { CardState } from "@/components/asakai/asakai-parts";
import type { Meeting } from "@/content/schema";
import {
  annotateRuby,
  buildFuriganaIndex,
  mergeFuriganaEntries,
  type FuriganaIndex,
} from "@/lib/text/furigana";
import {
  applyUtterance,
  initialPanelStates,
  nextProbePanel,
  type PanelState,
  type ReportPanel,
} from "@/lib/meeting/panels";
import { hintOf } from "@/lib/meeting/asakai-hint";
import type { AsakaiItem, AsakaiJudgeResult } from "@/lib/meeting/asakai-judge";
import {
  contentScore,
  CONTENT_MAX,
  expectedPercentOf,
  markOf,
  saidWrongPercent,
  totalScore,
} from "@/lib/meeting/asakai-score";
import {
  DayScoreModal,
  ProbeScoreModal,
  ReportScoreModal,
  type RowView,
  type ScoreView,
} from "@/components/asakai/asakai-score-modal";
import { getGeminiKey, getProfile } from "@/lib/profile";
import { fillCallName } from "@/lib/meeting/speech";
import { recordContentProgress } from "@/lib/progress/store";
import {
  clearAsakaiDraft,
  clearAsakaiResume,
  readAsakaiDraft,
  saveAsakaiDraft,
  restoreAsakai,
  saveAsakaiResume,
  type DayResult,
} from "@/lib/meeting/asakai-resume";

type Asakai = NonNullable<Meeting["asakai"]>;
type Scene = Asakai["scenes"][number];
type Line = Scene["sample"];

/** 同じ カードを 聞き返すのは 2回まで。3回目は 会話が 止まる。 */
const MAX_PROBE = 2;

const DAY_NAME: Record<Scene["day"], string> = {
  mon: "月曜日",
  tue: "火曜日",
  wed: "水曜日",
  thu: "木曜日",
  fri: "金曜日",
};

const KIND_NAME: Record<Scene["kind"], string> = { asa: "朝礼", yuu: "夕礼" };

/**
 * 日付つきの 曜日（「9/21 月曜日」）。**題と 帯の 札**に 使う。
 *
 * 2026-09-17 の 指定「9/21(月)〜25(金)を 報告の 日として、日付を いれる ように して
 * ください」——「先週の 金曜日」「金曜日までに」だけでは、どの 日の ことか 読めなかった。
 *
 * 日付は **場面の 札（`title`）の 先頭**が 正（「9/21 月曜日 9:00 朝礼 ・ 司会 ヘンディさん」）。
 * 週は 教材ごとに ちがう（朝礼は 9/21の 週、夕礼は その つぎの 週）ので、ここに 表を 持つと
 * **エンジンが 物語の 日付を 持つ**ことに なり、教材を 足すたび ずれる。
 * 札に 日付が 無い 教材は、これまでどおり 曜日だけを 出す。
 *
 * **`DAY_NAME` の ほうは 触らない。** あちらは 週の けっかの 行の 名前（`DayResult.day`）で
 * 端末に 保存されて いる ので、字を 変えると **前に 報告した 日が 行方不明に なる**
 *（済んだ 日の ✅ が 消え、次の 日が 開かなく なる）。
 */
/**
 * **2回 聞いても 言えなかった ときの ことば**（2026-09-17 の 指定）。
 *
 * 前は「こう 言うと 開きます。＋ お手本」を 出して いた。0点で 終わらせない ための
 * 仕組みだったが、**答えを そのまま 読み上げて しまう**——進捗の 札なら
 *「今、決済フロントエンド機能 ぜんたいの 進捗は 20%です。」が 画面に 出るので、
 * 学習者は 考えずに 写せる（ユーザーの 指摘）。
 *
 * いまは **言えなかった ことを はっきり 言って 次へ 行く**（規律1）。
 * 答えは 見せない。材料は 報告メモに あるので、次の 日に 自分で 取りに いける。
 */
const missedLine = (chairId: string, label: string, last: boolean) => ({
  speakerId: chairId,
  text: `${label}は 聞けませんでした。${last ? "きょうの 報告は ここまでです。" : "つぎに いきましょう。"}`,
});

const dayStamp = (scene: Scene) => {
  const date = /^(\d{1,2}\/\d{1,2})\s/u.exec(scene.title)?.[1];
  return date ? `${date} ${DAY_NAME[scene.day]}` : DAY_NAME[scene.day];
};

/**
 * Live への 言い渡し — **聞くだけ**。
 *
 * 相手役に 質問させない（この ファイル 冒頭の 決まり）。当たり判定は 学習者の
 * 発話だけを 見るので、相手が 聞き返すと **その 答えで カードが 開く**。
 * 司会の ことばは 教材が 持ち、画面が 選ぶ。ここは **声を 文字に する** ためだけに 使う。
 */
/**
 * 口の 絵（母音5つ＋閉じ）が すでに ある 人。
 *
 * 無い 人に `VisemeFace` を 渡すと、静かな 丸に **裸の 漢字**が 出る。
 * 絵を 足したら ここに id を 足す（`docs/朝礼・夕礼_口パク画像_別スレッド指示.md`）。
 */
const HAS_MOUTH = new Set(["hendy", "nyam", "okuda", "fujiki"]);

const LISTEN_ONLY = [
  "あなたは 朝礼の 司会の となりで 聞いて いる 係です。",
  "学生が 話し終わったら、**何も 言いません**。声でも 文字でも 返事を しません。",
  "しつもんも しません。あいづちも 打ちません。ただ 聞くだけです。",
  "つぎに 何を 聞くかは 画面が 決めます。",
].join("\n");

/**
 * **画面が 自分で 出す 字**の 読み（`CallShell` の `SHELL_FURIGANA` と 同じ 流儀）。
 *
 * 教材の 読み辞書だけで 描いて いた ころ、週の けっかの「合格」が
 * かんたんの 辞書に ある ["合","あ"] を 拾って **「あ格」**に なって いた
 *（2026-09-11。教材の 辞書は 教材の 文の ために 作られて いる）。
 * 画面の ことばは 教材ごとに 変わらない ので、ここで 持つ。
 */
const UI_FURIGANA: readonly (readonly [string, string])[] = [
  ["合格", "ごうかく"],
  ["不合格", "ふごうかく"],
  ["以上", "いじょう"],
  ["曜日", "ようび"],
  /*
   * 曜日は **5つとも 書く**。`annotateRuby` は **漢字の 位置からしか 辞書を 引かない**
   * ので、「月曜日」は 頭の「月」から 引く——「曜日」だけ 持って いても 当たらず、
   * 帯に **裸の 漢字**が 出る（丸い タブの ころは 1字ずつ ルビを 手で 付けて いた）。
   */
  ["月曜日", "げつようび"],
  ["火曜日", "かようび"],
  ["水曜日", "すいようび"],
  ["木曜日", "もくようび"],
  ["金曜日", "きんようび"],
  /*
   * 採点の ポップアップの ことば（2026-09-17）。**画面が 自分で 出す 字**なので
   * 教材の 辞書では 覆えない——ここに 無い 漢字は 裸で 出る（e2e が 数える）。
   */
  ["最初", "さいしょ"],
  ["言えました", "いえました"],
  ["言えません", "いえません"],
  ["言えた", "いえた"],
  ["言い直す", "いいなおす"],
  ["言い直しました", "いいなおしました"],
  ["直した", "なおした"],
  ["直しました", "なおしました"],
  ["直す", "なおす"],
  ["直しましょう", "なおしましょう"],
  ["内容", "ないよう"],
  ["内容の", "ないようの"],
  /*
   * **1字の 登録に 割られない ように、ことばで 持つ。**
   * 教材の 辞書には ["回","かい"] と ["答","こた"] が あるので、
   * 「回答」は **「かいこた」**と 読まれて いた——裸の 漢字では ない ので
   * `lint:content` も e2e も すり抜ける（2026-09-18 の 通しプレイ検収）。
   * きょうの 評価は 毎日 自動で 開く ので、5日 ぜんぶで 出て いた。
   */
  ["ブラッシュアップ回答", "ブラッシュアップかいとう"],
  ["回答", "かいとう"],
  ["項目ごとに", "こうもくごとに"],
  ["項目ごとの", "こうもくごとの"],
  ["項目", "こうもく"],
  ["効くのは", "きくのは"],
  /*
   * 鍵が 無い／AIが 返さなかった ときの 説明文の 字。**鍵が ある 道は
   * e2e の 裸漢字検査を 通らない**（デモモードしか 走らない）ので、
   * ここで 持って いないと 気づけない（2026-09-17 の R5 再検収）。
   */
  ["点だけ", "てんだけ"],
  ["点", "てん"],
  ["届きませんでした", "とどきませんでした"],
  ["足して", "たして"],
  ["伝わりやすさ", "つたわりやすさ"],
  ["伝わりました", "つたわりました"],
  ["伝わりませんでした", "つたわりませんでした"],
  ["伝わって", "つたわって"],
  ["伝えられたか", "つたえられたか"],
  ["伝えられました", "つたえられました"],
  ["仕事", "しごと"],
  ["日本語", "にほんご"],
  ["総合", "そうごう"],
  ["鍵", "かぎ"],
  ["出ます", "でます"],
  ["出して", "だして"],
  ["言い方", "いいかた"],
  ["文", "ぶん"],
  ["声", "こえ"],
  ["言って", "いって"],
  ["言う", "いう"],
  ["聞く", "きく"],
  ["聞かれて", "きかれて"],
  ["聞いて", "きいて"],
  ["押すと", "おすと"],
  ["残りの", "のこりの"],
  ["確認", "かくにん"],
  ["評価", "ひょうか"],
  ["朝礼", "ちょうれい"],
  ["夕礼", "ゆうれい"],
  ["進む", "すすむ"],
  ["進捗", "しんちょく"],
  ["報告する", "ほうこくする"],
  ["報告して", "ほうこくして"],
  ["作業記録", "さぎょうきろく"],
  ["大きな", "おおきな"],
  ["作業", "さぎょう"],
  ["日目", "にちめ"],
  ["報告メモ", "ほうこくメモ"],
  ["聞き返し", "ききかえし"],
  ["開いた", "ひらいた"],
  ["開きます", "ひらきます"],
  ["開かなかった", "ひらかなかった"],
  ["言えた", "いえた"],
  ["報告", "ほうこく"],
  ["担当", "たんとう"],
  ["今週", "こんしゅう"],
  ["目標", "もくひょう"],
  ["番", "ばん"],
  ["書いて", "かいて"],
  ["見る", "みる"],
  ["増えます", "ふえます"],
  ["数", "かず"],
  ["回", "かい"],
  ["日", "にち"],
];

interface ChatLine {
  readonly who: string;
  readonly speakerId: string;
  readonly text: string;
  readonly self?: boolean;
  /** 作り置きの こえ（教材の `audio`）。あれば 🔊 で 聞き返せる。 */
  readonly audio?: string;
}

/**
 * チャットの 行を 1つ 作る（`audio` を 落とさない ため 1か所に する）。
 *
 * ここで **呼びかけの 名前**を 差し込む（`では 次に ◯◯さん、お願いします。`）。
 * 司会が 名指しで 呼ぶ 場面なのに、画面には ずっと `◯◯さん` と 出て いた
 *（2026-09-15 の 指定）。ミーティングと 対話ゲームは 前から 名前を 入れて いる。
 *
 * 埋めるのは **`◯◯さん` と 書いて ある ところだけ**。同じ 教材の
 *「きのうは ◯◯を しました」の `◯◯` は 学習者が 埋める 空欄なので 触らない
 *（`fillCallName` の 覚え書き）。
 */
function toChatLine(
  line: Line,
  nameOf: ReadonlyMap<string, string>,
  learnerName: string,
): ChatLine {
  return {
    who: nameOf.get(line.speakerId) ?? "",
    speakerId: line.speakerId,
    text: fillCallName(line.text, learnerName),
    audio: line.audio,
  };
}

/** 端末に 保存された 呼び名を 読む（別の タブで 変わったら 追いつく）。 */
function subscribeToProfile(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
function readLearnerName(): string {
  return getProfile()?.displayName ?? "";
}
/** サーバでは 端末の 保存値が 読めない。名前なしで 描いて、画面が 出てから 差し替える。 */
function readLearnerNameOnServer(): string {
  return "";
}

export function AsakaiSession({ meeting }: { meeting: Meeting }) {
  const asakai = meeting.asakai;
  /* 教材の 読みが 先（後勝ち）。画面の ことばは そこに 無い ものだけ 拾う。 */
  const index = useMemo(
    () => buildFuriganaIndex(mergeFuriganaEntries(UI_FURIGANA, meeting.furigana)),
    [meeting.furigana],
  );
  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const person of asakai?.people ?? []) map.set(person.id, person.name);
    return map;
  }, [asakai]);

  /**
   * しおり。**日の はじめに 戻す**（場面の 途中には 戻さない）。
   *
   * 5日で 30分を 超える ので、1回の 授業で 終わらない ことが ふつうに ある。
   * ここを 読まないと、水曜まで 進んだ 人が 開き直すたびに 月曜へ 落ちる
   *（`MeetingSession` で 2026-08-28 に 実発生した のと 同じ 形）。
   * `useState` の 初期化関数で 1回だけ 読む——描くたびに 端末を 触らない。
   */
  const start = useState(() => restoreAsakai(meeting.id, asakai?.scenes.length ?? 0))[0];

  const [sceneAt, setSceneAt] = useState(start.sceneAt);
  const [states, setStates] = useState<readonly PanelState[]>(() =>
    initialPanelStates(toPanels(asakai?.scenes[start.sceneAt])),
  );
  /** カードごとに 何回 聞き返したか（2回で 打ち切る）。 */
  const [attempts, setAttempts] = useState<Record<string, number>>({});
  const [askedId, setAskedId] = useState<string | null>(null);
  /**
   * **その日の 数を まちがえた 札**（進捗だけ）。
   *
   * 報告の 直後は その 1本を 見れば 分かるが、日の おわりの ふりかえりは
   * その 場を 離れて いる ので、言われた ことを 覚えて おかないと
   *「🔁 しつもんの あとで 直しました」が **一度も 出ない**
   *（2026-09-17 の R5 再検収）。
   */
  const [wrongNums, setWrongNums] = useState<readonly string[]>([]);
  const [probes, setProbes] = useState(0);
  const [answer, setAnswer] = useState("");
  const [lines, setLines] = useState<readonly ChatLine[]>([]);
  const [hint, setHint] = useState(false);
  /**
   * 報告メモ（場面カード）を 開いて いるか。
   *
   * **出しっぱなしに しない**（2026-09-13 の 指定「タスクの 消化状況や 今日の
   * タスクなどは 直接 表示せず、モーダル表示に して ください」）。板の 横に
   * 置いて いた ころ、担当・ゴール・進捗・きょう やる ことで 画面の 半分が うまり、
   * **会話と 話す ボタンが 下へ 押し出されて いた**（ヒントを ポップアップに した
   * 2026-08-20 と 同じ 形の 事故）。要る ときに 呼び、読んだら 閉じる。
   */
  const [duty, setDuty] = useState(false);
  /** `"talk"` 報告中 ／ `"gap"` 時間カード ／ `"done"` 週の けっか。 */
  const [phase, setPhase] = useState<"talk" | "gap" | "done">("talk");
  const [results, setResults] = useState<readonly DayResult[]>(start.results);

  /*
   * **声が 本線**（2026-09-11 の 指定「マイクで話すのがメインです」）。
   * Live は **聞くだけ**に 使う——相手役に 質問させると、当たり判定は 学習者の
   * 発話だけを 見るので その 答えで カードが 開く（この ファイル 冒頭の 決まり）。
   * 司会の ことばは 教材が 持ち、画面が 選ぶ。
   */
  /*
   * **聞くだけ**で つなぐ（`LISTEN_ONLY`）。相手が 返事を しない ので、
   * 学習者の ことばは「相手が 話しはじめた 合図」では 流れて こない——
   * `listenOnly` を 渡して、かけらが 止まった ところで 束ねて もらう
   *（2026-09-11 の 検収。これが 無いと **声で 報告しても 何も 起きない**）。
   */
  const voice = useLiveVoice({ listenOnly: true });
  /* 司会が 名指しで 呼ぶ ための 呼び名（ミーティングと 同じ 読みかた）。 */
  const learnerName = useSyncExternalStore(
    subscribeToProfile,
    readLearnerName,
    readLearnerNameOnServer,
  );
  /* 速さは 端末の 覚え書き（`MeetingSession` と 同じ 読みかた）。 */
  const speed = useSyncExternalStore(
    subscribeSpeechSpeed,
    readSpeechSpeed,
    readSpeechSpeedOnServer,
  );
  /*
   * 作り置きの こえ。**鍵を 持たない 学習者にも 声が 届く**——朝礼は
   * 司会と メンバーの ことばを 教材が 先に 持って いるので、Live に つながずに
   * そのまま 鳴らせる（`scripts/make_meeting_audio.ts` が 作る）。
   */
  const clips = useVoiceQueue();
  /*
   * 依存に 置くのは **関数だけ**。`clips` そのものは `speakingId` が 1行ごとに
   * 変わる ので、まるごと 依存に すると 下の `useCallback` が 毎描画 作り直され、
   * 依存配列が 意味を 失う（2026-09-11 の 検収）。
   */
  const pushClips = clips.push;
  const stopClips = clips.stop;

  /**
   * 報告の 見かた（モーダル）。**モーダルを 閉じてから 司会と メンバーが 話す**
   *（2026-09-11 の 指定「評価はモーダルで出してください。モーダルの後に、
   * 各担当者が報告をします」）。閉じるまで 会話を 積まないので、
   * 学習者は 自分の 報告の けっかを 読んでから つぎへ 進める。
   */
  const [judge, setJudge] = useState<{
    /** 報告の あと（`report`）か、聞き返しへの こたえの あと（`probe`）か。 */
    readonly kind: "report" | "probe";
    readonly opened: readonly string[];
    readonly shut: readonly string[];
    /** 作業記録を そのまま 読み上げて いた（数えて いない）。 */
    readonly readLog: boolean;
    readonly sceneOver: boolean;
    /** この 1本で 札が 進んだか（聞き返しの こたえの 印。ふりかえりと 同じ ものさし）。 */
    readonly heard: boolean;
    /** AIが 見たか（鍵が あって、返事が 届いた ときだけ true）。 */
    readonly judged: boolean;
    /** 学習者が いま 言った こと（そのまま 出す）。 */
    readonly utterance: string;
    /** 直前の しつもん（聞き返しの ときだけ）。 */
    readonly question: string;
    readonly score: ScoreView;
    readonly rows: readonly RowView[];
    readonly good: string;
    readonly advice: string;
    readonly after: (() => void) | null;
  } | null>(null);

  /**
   * **その日の 分の AIの 見かた**（聞き返しの たびに 上書き）。
   *
   * その日の おわりの 評価は 1本の 報告では なく **1日ぶん**を 見せる ので、
   * 最後に 届いた 点と ことばを 持って おく。鍵が 無い 端末では ずっと null。
   */
  const [dayAi, setDayAi] = useState<{
    readonly clarity: number | null;
    readonly japanese: number | null;
    readonly good: string;
    readonly advice: string;
  }>({ clarity: null, japanese: null, good: "", advice: "" });

  /**
   * **その日の 項目ごとの ブラッシュアップ**（札の id → いちばん 新しい 直し）。
   *
   * 2026-09-19 の 指定「ブラッシュアップは 項目ごとに まとめて」。前は 1日ぶんを
   * 1本の 文（`polished`）で 持って いた ので、どの 項目の 直しかが 読めなかった。
   * 1本で ぜんぶ 言えた 日は その日の 評価しか 出ない ので、ここから 引く。
   */
  const [dayItems, setDayItems] = useState<Readonly<Record<string, AsakaiItem>>>({});

  /**
   * **その日 学習者が 送った ことば ぜんぶ**（その日の 評価に「あなたの 回答」として 並べる）。
   *
   * 聞き返しへの こたえだけを 残して いた ころ、**うまく 言えた 1本目が
   * ふりかえりに 出て こなかった**——できた ことが 画面から 消える
   *（2026-09-18 の 指定「ちゃんと 言えた ことも ふりかえりに 入れて ください」）。
   * 1本目は しつもんが 無いので `question` は 空。
   */
  const [probeLog, setProbeLog] = useState<
    readonly {
      readonly question: string;
      readonly answer: string;
      readonly heard: boolean;
      readonly opened?: number;
      /**
       * この 1本で **進んだ 札の id**。
       *
       * 「あなたの 答え」を 項目ごとに 並べる ための 手がかり
       *（2026-09-18 の 指定「あなたの答えと正しい回答を並べて表示できますか？」）。
       * 照合は 報告 まるごとに かかるが、**どの 札が 進んだか**は 分かる ので、
       * そこから 逆に「その 札を 開けた ことば」を 引ける。
       */
      readonly panels?: readonly string[];
    }[]
  >([]);

  /** 直前の しつもんの 字（聞き返しの こたえの 見かたに 出す）。 */
  const [askedText, setAskedText] = useState("");

  /** その日の 評価（モーダル）を 出して いる。 */
  const [dayOpen, setDayOpen] = useState(false);
  /**
   * 週の けっかの ポップアップを 開いて いるか。
   *
   * 2026-09-17 の 指定「全て モーダルが 良いです」。ここだけ 画面に 直に 置いて
   * あって、**最後の 1枚だけ 別の 見た目**に なって いた。
   */
  const [weekOpen, setWeekOpen] = useState(false);
  /**
   * きょうの 評価を 閉じた あとに 流す ことば（受け止め → 采配 → 指名 → メンバー → 締め）。
   *
   * 評価の あいだは **司会の 受け止めだけ**を 鳴らし、字は 閉じてから 出す。
   */
  const [pendingTail, setPendingTail] = useState<readonly Line[]>([]);
  /**
   * 報告メモを 閉じた ときに 鳴らす 場面の はじめ（司会の 開き → 見本 → あなたの 番）。
   *
   * 2026-09-18 の 指定「最初の モーダルを 閉じた タイミングで ヘンディさんが
   * 話す ように して ください」。開いた 瞬間に 鳴らすと、**モーダルの うしろで**
   * 声が 流れて しまう。
   */
  const [dutyIntro, setDutyIntro] = useState<readonly Line[]>([]);
  /**
   * **正しい 回答を 見せた 日**（曜日の 字）。
   *
   * きょうの 評価には お手本が 並び、その 同じ 画面に「もう いちど 報告する」が ある。
   * そのまま だと「適当に 答える → 打ち切り → お手本を 読む → 写して やり直す」で
   * 満点が 記録できて しまう——2026-09-17 に **お手本を 出すのを やめた**のと
   * 同じ 穴（2026-09-18 の R5 検収）。**お手本を 見た あとの やり直しは、
   * 練習は できるが けっかを 上書きしない。**
   */
  const [shownAnswers, setShownAnswers] = useState<readonly string[]>([]);
  /** けっかを 読んだ 印。**読んだ ときに 1回だけ**「おわった」を 書く。 */
  const weekRead = useRef(false);

  /** AIに 見て もらって いる あいだ（鍵が 無い ときは いつも false）。 */
  const [waiting, setWaiting] = useState(false);

  /**
   * いま 何場面目を 見て いるかの 通し番号。
   *
   * AIの 返事を 待って いる あいだに タブで **別の 日へ 飛べる**ので、
   * 遅れて 届いた 見立てを そのまま 当てると **月曜の 報告で 火曜の 板が 開く**。
   * 場面を 離れる ときに 番号を 進め、届いた ときに 食いちがったら 捨てる。
   */
  const runId = useRef(0);

  const scene = asakai?.scenes[sceneAt];
  const panels = useMemo(() => toPanels(scene), [scene]);

  /*
   * **話した ぶんを その場で 端末に 残す**（2026-09-17 の 指定）。
   *
   * 残すのは **話しかけて いる 日**だけ。終わった 日は しおりの `done` が 持つ。
   * 板・聞き返しの 回数・チャットを そのまま 置くので、曜日を 行き来しても
   * 画面を 閉じても、戻れば 同じ ところから つづけられる。
   */
  useEffect(() => {
    if (!scene || phase !== "talk" || lines.length === 0) return;
    /*
     * **報告が 終わった 日は もう 残さない。**
     *
     * 札が ぜんぶ 開いた あとも 司会の 受け止め・采配・メンバーの 報告が
     * チャットに 積まれる ので、この 効果は そのたびに もう いちど 走る。
     * `finishScene` が 消した はずの 控えが **4/4 の 板ごと 書き戻されて いて**、
     *「もう いちど 報告する」を 押しても `openScene` が それを 読み直し、
     * 板は （4/4）の まま・ボタンも「きょうの けっかを 見る」の ままだった
     *（2026-09-17 の 通しプレイ検収）。終わった 日を 持つのは しおりの `done`。
     */
    if (nextProbePanel(panels, states) === null) return;
    saveAsakaiDraft(meeting.id, scene.day, {
      states: states.map((one) => ({ ...one, said: [...one.said] })),
      attempts,
      probes,
      askedId,
      lines: [...lines],
      log: probeLog.map((one) => ({ ...one, panels: one.panels ? [...one.panels] : undefined })),
    });
  }, [scene, panels, phase, states, attempts, probes, askedId, lines, probeLog, meeting.id]);

  /**
   * 作業記録の 行。**夕礼だけ 中身が ある**——朝礼の カードは
   * まとめ済みの 行（`rows`）なので、読み上げても それが 報告に なる。
   */
  const logLines = useMemo(
    () => (scene?.card.memo ?? []).map((row) => ({ head: row.head, text: row.text })),
    [scene],
  );

  /*
   * 1行 積んで、作り置きの こえも 順に 鳴らす。
   * **積む その場で 鳴らす**——効果に すると 状態の 更新が 連鎖する
   *（`use-voice-queue.ts` の「送り出しは 効果では なく 事件で する」）。
   */
  const say = useCallback(
    (line: Line) => {
      setLines((prev) => [...prev, toChatLine(line, nameOf, learnerName)]);
      pushClips([line], rateOf(speed));
    },
    [nameOf, learnerName, pushClips, speed],
  );

  /**
   * 場面の はじめ（司会の 開き → 見本 → あなたの 番）を チャットに 積む。
   *
   * あわせて **報告メモを 開く**（2026-09-16 の 指定「曜日を クリックした ときや
   * 画面を 開いた ときに、モーダルが 出る ように して ください」）。
   * 報告に 要る 材料（きのう・きょう・問題・進捗・しごとの 表）は ぜんぶ この 中に ある。
   * 押されるのを 待って いた ころは、**開かない まま 話しはじめる**人が いた。
   */
  const openScene = useCallback(
    (at: number) => {
      const next = asakai?.scenes[at];
      if (!next) return;
      stopClips();

      /*
       * **途中まで 話した 日は、そこから 戻す**（2026-09-17 の 指定
       *「回答結果が リセットされて しまう。曜日を 切り替えた 場合や 画面を
       * 切り替えた 場合。ストレージ保管して 再現できるように」）。
       *
       * こえは 鳴らし直さない——戻って きた 人は もう 聞いて いる。
       * 報告メモは 開く（どの 日の 話だったかを 先に 見せる）。
       */
      const draft = readAsakaiDraft(meeting.id, next.day);
      if (draft && draft.lines.length > 0) {
        setLines(draft.lines);
        setStates(draft.states);
        setAttempts(draft.attempts);
        setProbes(draft.probes);
        setAskedId(draft.askedId);
        setProbeLog(draft.log);
        setDuty(true);
        return;
      }

      /*
       * **こえは 報告メモを 閉じてから 鳴らす**（2026-09-18 の 指定）。
       *
       * 開いた 瞬間に 鳴らして いた ころ、司会の 声は **モーダルの うしろ**で
       * 流れて いた——学習者は メモ（きのう・きょう・問題・しごとの 表）を
       * 読んで いる さいちゅうで、聞き逃した ぶんを 聞き直す 手だても 無い。
       * 字は 先に 積む（閉じた ときに もう 並んで いる）。
       */
      const said = [...next.opening, next.sample, next.prompt];
      setLines(said.map((line) => toChatLine(line, nameOf, learnerName)));
      setDutyIntro(said);
      setDuty(true);
    },
    [asakai, meeting.id, nameOf, learnerName, stopClips],
  );

  /** 報告が 終わった ときの ひとかたまり（受け止め → 采配 → メンバー → 閉じ）。 */
  const finishScene = useCallback(
    (final: readonly PanelState[], usedProbes: number) => {
      if (!scene || !asakai) return;
      const komari = final.find((s) => s.id === "komari");
      const komariPanel = panels.find((p) => p.id === "komari");
      const isHard = asakai.level === "hard";
      const scored = final.filter((s) => s.id !== "komari");
      const scoredPanels = panels.filter((p) => p.id !== "komari");

      const row: DayResult = {
        day: DAY_NAME[scene.day],
        kind: scene.kind,
        cards: final.filter((s) => s.full).length,
        cardTotal: panels.length,
        units: isHard
          ? scored.reduce((sum, s) => sum + s.said.length, 0)
          : final.filter((s) => s.full).length,
        unitTotal: isHard
          ? scoredPanels.reduce((sum, p) => sum + p.facts.length, 0)
          : panels.length,
        komariOpen: komari?.open ?? false,
        komariBoxes: komari?.said.length ?? 0,
        komariTotal: komariPanel?.facts.length ?? 0,
        probes: usedProbes,
        chips: panels.map((panel) => ({
          label: panel.label,
          open: final.find((s) => s.id === panel.id)?.full ?? false,
        })),
      };
      /* お手本を 見た あとの やり直しは 上書きしない（上の `shownAnswers` の 覚え書き）。 */
      const keepScore = shownAnswers.includes(row.day);
      setResults((prev) => {
        if (keepScore) return prev;
        /*
         * **同じ 日は 1つだけ**。タブで 行き来できる ように なった ので
         *（2026-09-13）、同じ 日を 2回 報告すると 積み足しでは 2行に なり、
         * 週の けっかが「6日ぶん」に なって しまう。日で 置きかえて、
         * **月曜から 金曜の 並び**に そろえ直す（報告した 順では 読めない）。
         */
        /* `day` は "月曜日"（`DAY_NAME`）。`scene.day` は "mon" なので 変換して 比べる。 */
        const order = (day: string) =>
          asakai?.scenes.findIndex((s) => DAY_NAME[s.day] === day) ?? 0;
        const done = [...prev.filter((r) => r.day !== row.day), row].sort(
          (a, b) => order(a.day) - order(b.day),
        );
        saveAsakaiResume(meeting.id, done);
        return done;
      });
      /* 途中の 控えは もう 要らない（「もう いちど 報告する」は はじめから 話す）。 */
      clearAsakaiDraft(meeting.id, scene.day);

      /*
       * **開かなかった カードが ある 日に「ぜんぶ 聞けました」と 言わない**（規律1）。
       *
       * 教材の `ack` は「4枚 そろった とき」の 受け止めで、司会が れいを 見せて
       * 先へ 進めた 日にも そのまま 出て いた——**言えて いないのに 分かった ことに
       * なる**。そろわなかった 日は、開いた 札と 開かなかった 札を そのまま 読み上げる。
       * 名指しの 材料は カードの 札（教材の ことば）だけで、新しい 呼び名を 作らない。
       */
      const openLabels = panels
        .filter((panel) => final.find((s) => s.id === panel.id)?.full)
        .map((panel) => panel.label);
      const shutLabels = panels
        .filter((panel) => !final.find((s) => s.id === panel.id)?.full)
        .map((panel) => panel.label);
      const ack: Line =
        shutLabels.length === 0
          ? scene.ack
          : {
              speakerId: asakai.chairId,
              text:
                (openLabels.length > 0
                  ? `はい。${openLabels.join("・")}は 聞けました。`
                  : "はい。") +
                `${shutLabels.join("・")}は 言えて いません。` +
                /*
                  **金曜に「あした」と 言わない**（2026-09-14 の R5 検収）。
                  週の さいごの 場面なので、次に 報告するのは 来週。
                  夕礼の 金曜は 札も「次に 行うこと（来週）」に なって いる。
                */
                (sceneAt + 1 >= asakai.scenes.length
                  ? "来週は そこも お願いします。"
                  : "あしたは そこも お願いします。"),
            };

      /* 采配は「お願いまで 言えたか」で 分ける。言えて いない ときは
         司会が **言い方を 見せてから** 自分で 段取りする（0点で 終わらせない）。

         **見るのは「お願い」の 札**（ある 日だけ）。前は「問題・確認」を 見て いた ので、
         お願いを 一度も 言わなかった 人にも「スケジュールは のばしません」と 返って いた
         ——**頼んで いない ことへの 返事**に なる（2026-09-17 の R10 検収）。 */
      const decided = final.find((s) => s.id === "onegai") ?? komari;
      const tail: Line[] = [ack];
      if (scene.arrange) tail.push(decided?.full ? scene.arrange.done : scene.arrange.missing);
      /*
       * **司会が つぎの 人を 指してから、メンバーが 話す**（2026-09-18 の 指定）。
       *
       * 受け止めの あと いきなり 奥田さんが しゃべりはじめて いた——朝礼は
       * 司会が 順に 回す 場なので、**指名の 1行**が 無いと 誰の 番かが 分からない。
       * 名前は 教材の `people` から 引く（画面に 新しい 呼び名を 作らない）。
       */
      const first = scene.members[0];
      const firstName = first ? nameOf.get(first.speakerId) : undefined;
      if (firstName) {
        tail.push({
          speakerId: asakai.chairId,
          text: `では 次は ${firstName}さん、お願いします。`,
        });
      }
      tail.push(...scene.members, ...scene.closing);
      /*
       * **きょうの 評価を 自動で 出し、その あいだは 司会の 受け止めだけ 鳴らす**
       *（2026-09-18 の 指定）。
       *
       * 前は 受け止め→采配→メンバー→締めを ぜんぶ 先に 流してから、
       * 学習者が「きょうの けっかを 見る ▶」を 押して いた——**自分の 点を 見る まえに
       * 4人ぶんの 報告が 流れる**ので、何を 直すのかが 遠ざかって いた。
       * いまは 評価が 先。閉じた ときに 受け止めの 字と、つづきの 話が 出る。
       */
      setAskedId(null);
      setPendingTail(tail);
      pushClips([ack], rateOf(speed));
      setDayOpen(true);
      setShownAnswers((prev) => (prev.includes(row.day) ? prev : [...prev, row.day]));
    },
    [scene, sceneAt, asakai, panels, nameOf, meeting.id, pushClips, speed, shownAnswers],
  );

  /**
   * 1本の 報告を **数えて**、司会の つぎの ことばを 決める。
   *
   * 司会と メンバーの ことばは **すぐには 積まない**——先に 見かたの モーダルを 出し、
   * 閉じた ときに まとめて 積む（2026-09-11 の 指定
   *「評価はモーダルで出してください。モーダルの後に、各担当者が報告をします」）。
   * 声を 入れると 一人ずつ 順に 話す ことに なるので、**話し始める 合図**が 要る。
   *
   * `seen` は AIの 見立て（鍵が 無ければ `null`）。**足し算の 材料**でしか なく、
   * 開く 条件も 合格ラインも ここでは 変えない（`panels.ts` が 数える）。
   */
  const apply = useCallback(
    (text: string, seen: AsakaiJudgeResult | null) => {
      if (!scene) return;
      const step = applyUtterance({
        utterance: text,
        panels,
        states,
        aiSaidIds: seen?.saidIds ?? [],
        logLines,
        aiReadsLog: seen?.readsLog ?? false,
        /* 鍵が ある ときは AIが 正（2026-09-17 の 指定「開閉の 判断は AIを メインに」）。 */
        aiOnly: seen !== null,
      });
      const target = nextProbePanel(panels, step.states);

      /*
       * **作業記録を そのまま 読み上げた ぶんは 数えない**（2026-09-14）。
       *
       * 罰では なく 言い直し。司会は 教材の あたまと 同じ ことばで 言う
       *（`focus`:「作業記録を そのまま 読み上げません」）ので、学習者が
       * 知らない 決まりを ここで 新しく 作らない。聞き返しは そのまま 数えるので、
       * 2回 つづけば **その 札は 聞けなかった ことに して** 先へ 進む
       *（2026-09-17 の 指定で お手本は 出さなく なった——答えを 写せて しまう ため）。
       *
       * ## 言い直しは **聞き返しの 代わり**に 言う（2026-09-14 の R5 検収）
       * 「まとめて もう いちど」と「つぎは 進捗率を お願いします」を 並べると、
       * 1回の ターンに **次の 行動が 2つ**に なる（規律1 は 1つ）。
       * 打ち切りの ばめんでは 司会が「◯◯は 聞けませんでした。つぎに いきましょう」と
       * 言う ので、こちらは 言わない（次の 行動を 2つに しない）。
       */
      const readLog = step.readLog;
      const sayRedo = () => {
        if (!asakai) return;
        say({
          speakerId: asakai.chairId,
          text: "作業記録を そのまま 読み上げて います。大きな 作業を 2つか 3つに まとめて、もう いちど お願いします。",
        });
      };

      /* この 1本で **新しく ⭕ に なった 札**と、まだ 残って いる 札。 */
      const wasFull = new Set(states.filter((one) => one.full).map((one) => one.id));
      const labelOf = (id: string) => panels.find((one) => one.id === id)?.label ?? id;

      /*
       * **採点の 材料**（2026-09-17 の 指定）。
       *
       * 内容の 点は アプリが 数える（開いた 札の 割合）。伝わりやすさと
       * 仕事の 日本語は AIが 見た ぶんを そのまま 持つ——鍵が 無い ときは null で、
       * 画面は「—」と 出す（見て いない ものに 0点を つけない）。
       */
      /*
       * **聞き返しへの こたえ**か どうかは、しつもんの 字が あるかで 見る。
       * 作業記録の 読み上げを 差し戻した ときは `askedId` が 立つが、
       * 聞かれて いるのは 1枚の 札では なく **報告 まるごと**なので、
       * そこは これまでどおり「報告の 見かた」を 出す。
       */
      const wasProbe = askedId !== null && askedText !== "";
      /*
       * **点は 積み上げ**（2026-09-20 の 指定「点数も 増える ごとに 積み上げ（最高100点）」）。
       *
       * 内容の 点は 開いた 札の 数なので もともと 増える。AIの 2つ（伝わりやすさ・
       * 仕事の 日本語）は **1本ごとの 見立て**なので、聞き返しの 1行に こたえた だけで
       * 下がる ことが あった——同じ 日の 中で 点が 行ったり 来たり すると、
       * 何を すれば 上がるのかが 読めない。**その日の いちばん よい 点**を 持つ。
       */
      const best = (now: number | null, kept: number | null): number | null =>
        now === null ? kept : kept === null ? now : Math.max(now, kept);
      const clarity = best(seen?.clarity ?? null, dayAi.clarity);
      const japanese = best(seen?.japanese ?? null, dayAi.japanese);
      const good = seen?.good ?? "";
      const adviceText = seen?.advice ?? "";
      if (seen) {
        setDayAi((prev) => ({
          clarity: best(clarity, prev.clarity),
          japanese: best(japanese, prev.japanese),
          good: good !== "" ? good : prev.good,
          advice: adviceText !== "" ? adviceText : prev.advice,
        }));
        if (seen.items.length > 0) {
          setDayItems((prev) => {
            const next = { ...prev };
            for (const item of seen.items) next[item.id] = item;
            return next;
          });
        }
      }
      /** この 1本の、項目ごとの ブラッシュアップ（AIが 見た ときだけ）。 */
      const itemOf = (id: string): AsakaiItem | undefined =>
        seen?.items.find((item) => item.id === id);

      /* 進捗の 札だけ、**その日の 数と ちがう 数**を 言って いたかを 見る。 */
      const wrongNow = panels
        .filter((panel) =>
          saidWrongPercent(text, expectedPercentOf(panel.facts.flatMap((f) => f.keywords))),
        )
        .map((panel) => panel.id);
      const wrongAll = [...new Set([...wrongNums, ...wrongNow])];
      if (wrongNow.length > 0) setWrongNums(wrongAll);

      /** 足りない ところを 名前で 言う（箱が 分かれて いる 札だけ）。 */
      const adviceFor = (
        panel: ReportPanel,
        state: PanelState | undefined,
        followup: string,
      ): string => {
        if (state?.full || state?.gaveUp) return "";
        const said = new Set(state?.said ?? []);
        if (said.size === 0) return followup;
        const missing = [
          ...new Set(
            panel.facts.filter((fact) => !said.has(fact.id) && fact.box).map((fact) => fact.box),
          ),
        ];
        if (missing.length === 0) return followup;
        return `「${missing.join("」と「")}」が まだです。そこを 足して ください。`;
      };

      /** その日の 札を 1枚ずつ「どう 伝わったか」に する。 */
      const viewRows = (final: readonly PanelState[]): RowView[] =>
        panels.map((panel) => {
          const state = final.find((one) => one.id === panel.id);
          const asked = attempts[panel.id] ?? 0;
          const data = scene.panels.find((one) => one.id === panel.id);
          const mark = markOf({
            full: state?.full ?? false,
            attempts: asked,
            wrongNumber: wrongAll.includes(panel.id),
          });
          const item = itemOf(panel.id);
          return {
            id: panel.id,
            label: panel.label,
            mark,
            /*
             * 直しの ことばは **教材の 聞き返し**を そのまま 使う（新しい 呼び名を 作らない）。
             * ただし **打ち切った 札には 出さない**——司会は もう「聞けませんでした。
             * つぎに いきましょう」と 言って いるので、同じ ターンに
             * **もう できない 行動**が 並ぶ（規律1: 次の 行動は 1つ）。
             *
             * **箱が 2つ ある 札で 片方だけ 言えた ときは、足りない 箱を 名前で 言う。**
             * 教材の 聞き返しは 札 まるごとに 向けた 文（木曜の お願いなら
             *「何を お願いしたいですか。いつまでに したいかも お願いします。」）なので、
             * お願いを 言えて おわびが 抜けた 人に そのまま 出すと
             * **すでに 言った ほうを もう いちど 聞く**（2026-09-17 の R5 再検収）。
             * 箱の 名前は 教材の ことば（`fact.box`）を そのまま 使う（規律10）。
             */
            advice: adviceFor(panel, state, data?.followups[0]?.text ?? ""),
            /* 練習の 途中では **見本を 出さない**（写して 終わりに なる）。 */
            example: "",
            /* その 項目の ところ（AIが 分けた ときだけ。鍵が 無ければ 空）。 */
            said: item?.said ?? "",
            /*
             * **中身が 合った 札にだけ** ブラッシュアップを 出す（2026-09-19 の 指定）。
             * AIは 学生の 数の まま 直すので、まちがった 数を 直した 文に すると
             * 正しい 数に 見える——まだの 札は 下の ヒント（型文）に する。
             */
            polished: mark !== "missing" ? (item?.polished ?? "") : "",
            /* 答えを 出さない 型文（教材の 聞き返しから。`asakai-hint.ts`）。 */
            hint: hintOf((data?.followups ?? []).map((one) => one.text)),
          };
        });

      const viewScore = (final: readonly PanelState[]): ScoreView => {
        const content = contentScore(final.filter((one) => one.full).length, panels.length);
        return { content, clarity, japanese, total: totalScore(content, clarity, japanese) };
      };

      /*
       * **聞き返しに こたえられたかは、聞かれた 札が 進んだかで 見る。**
       *
       * 「どれか 1つでも 新しく 言えた」で 見て いた ころ、司会が
       *「進捗を、パーセントで お願いします。」と 聞いたのに 学習者が
       *「今の ところ 問題は ありません。」と 答えると、問題の 札が 開いて
       * **✅「こたえが 伝わりました」**が 出て いた——直後に 司会は 同じ 進捗を
       * もう いちど 聞くので、画面と 会話が 食いちがう。ぼかすより 悪い
       *「まちがった 合格」（規律1・2026-09-17 の R5 再検収）。
       */
      const asked = panels.find((one) => one.id === askedId);
      const heardNow =
        wasProbe && asked
          ? step.newFacts.some((id) => asked.facts.some((fact) => fact.id === id))
          : step.newFacts.length > 0;

      /** 4つの setJudge に 同じ ものを 渡す（写しを 作らない）。 */
      const view = (final: readonly PanelState[]) => ({
        kind: (wasProbe ? "probe" : "report") as "probe" | "report",
        heard: heardNow,
        /*
         * **AIが 日本語を 見たか**。道具が 返って きただけでは 足りない——
         * `japanese` は 道具の required に 入って いない ので、返って こない ことが
         * ある。見て いないのに「そのままで いいです」と 言わない（規律1）。
         */
        judged: seen !== null && seen.japanese !== null,
        utterance: text,
        question: askedText,
        score: viewScore(final),
        rows: viewRows(final),
        good,
        advice: adviceText,
      });

      const opened = step.states
        .filter((one) => one.full && !wasFull.has(one.id))
        .map((one) => labelOf(one.id));

      /* この 1本で 進んだ 札（「あなたの 答え」を 項目ごとに 引くため）。 */
      const movedPanels = panels
        .filter((one) => step.newFacts.some((id) => one.facts.some((fact) => fact.id === id)))
        .map((one) => one.id);
      setProbeLog((prev) => [
        ...prev,
        wasProbe
          ? { question: askedText, answer: text, heard: heardNow, panels: movedPanels }
          : /* 1本目は 枚数で 残す（「どれか 1つ 当たれば ✅」に しない）。 */
            {
              question: "",
              answer: text,
              heard: heardNow,
              opened: opened.length,
              panels: movedPanels,
            },
      ]);

      if (!target) {
        setStates(step.states);
        /*
         * **1本で ぜんぶ 言えた 日は、まとめの 1枚だけ 出す**（2026-09-18 の 指定
         *「一回で 全部 言えた 時の モーダルは 最後の まとめの ものに できますか？」）。
         *
         * 報告の 見かた →（閉じる）→ きょうの 評価 と、**同じ ことを 2枚**
         * つづけて 読ませて いた。聞き返しが あった 日は 最後の 1枚が
         *「その しつもんへの こたえ」を 持って いる ので、そのまま 出す。
         */
        if (probeLog.length === 0 && !wasProbe) {
          finishScene(step.states, probes);
          return;
        }
        setJudge({
          ...view(step.states),
          opened,
          shut: [],
          readLog,
          sceneOver: true,
          after: () => finishScene(step.states, probes),
        });
        return;
      }

      /*
       * **もう 聞かれない 札を「まだ 言えて いない ところ」に 並べない。**
       *
       * 2回 聞いても 開かなかった 札は 打ち切って（`gaveUp`）先へ 進む——
       * 指定どおり（2026-09-17「質問を 2ど しても 間違い…の 場合は、不正解として
       * 次の 質問に 移ります」）。ところが その 札を 一覧に 残して いた ので、
       * 学習者は **もう 開かない ものに 何度も 答えつづけた**。しかも 打ち切った 札は
       * 照合から 外れる ので、あとから 正しい 数を 言っても 何も 起きない
       *（2026-09-17 の 通しプレイ検収。木曜の 進捗で 実発生）。
       * その日の おわりの ふりかえりでは ❗ として ちゃんと 残る。
       */
      const shut = panels
        .filter((one) => {
          const state = step.states.find((x) => x.id === one.id);
          return !state?.full && !state?.gaveUp;
        })
        .map((one) => one.label);
      /*
       * **進んだ ターンは 聞き返しに 数えない**（2026-09-14 の 通し検収）。
       *
       * こまりごとは 箱が 3つ ある（水曜）。1つずつ ていねいに 言う 学習者は、
       * **2つ 言えた ところで 打ち切られて** 3つ目を 言う 場所が 無かった——
       * 箱が 1つ 開いた ターンまで「答えられなかった 回」に 数えて いたため。
       * 数えるのは **その 札が 1つも 進まなかった とき**だけに する。
       */
      const moved = step.newFacts.some((id) => target.facts.some((fact) => fact.id === id));
      const count = moved ? (attempts[target.id] ?? 0) : (attempts[target.id] ?? 0) + 1;
      const data = scene.panels.find((one) => one.id === target.id);
      if (!data) {
        setStates(step.states);
        return;
      }

      /* 2回 聞いても 開かない カードは、司会が れいを 見せて 先へ 進める。 */
      if (count > MAX_PROBE) {
        const passed = step.states.map((one) =>
          one.id === target.id ? { ...one, gaveUp: true } : one,
        );
        setStates(passed);
        const next = nextProbePanel(panels, passed);
        if (!next) {
          setAttempts({ ...attempts, [target.id]: count });
          setJudge({
            ...view(passed),
            opened,
            shut,
            readLog,
            sceneOver: true,
            after: () => {
              /*
               * **その日の さいごの 札でも、聞けなかった ことを 言ってから 閉じる**。
               * 黙って 終わると、その 札が どう なったのかが 画面に 残らない。
               */
              say(missedLine(asakai.chairId, data.label, true));
              finishScene(passed, probes);
            },
          });
          return;
        }
        const nextCount = (attempts[next.id] ?? 0) + 1;
        const nextData = scene.panels.find((one) => one.id === next.id);
        const followup = nextData?.followups[Math.min(nextCount, 2) - 1];
        setAttempts({ ...attempts, [target.id]: count, [next.id]: nextCount });
        setProbes((n) => n + 1);
        setJudge({
          ...view(passed),
          opened,
          shut,
          readLog,
          sceneOver: false,
          after: () => {
            say(missedLine(asakai.chairId, data.label, false));
            if (followup) say(followup);
            setAskedText(followup?.text ?? "");
            setAskedId(next.id);
          },
        });
        return;
      }

      const followup = data.followups[Math.min(count, data.followups.length) - 1];
      setStates(step.states);
      setAttempts({ ...attempts, [target.id]: count });
      setProbes((n) => n + 1);
      setJudge({
        ...view(step.states),
        opened,
        shut,
        readLog,
        sceneOver: false,
        after: () => {
          /* 言い直しを たのむ ときは 聞き返さない（次の 行動は 1つ）。 */
          if (readLog) sayRedo();
          else if (followup) say(followup);
          setAskedText(readLog ? "" : (followup?.text ?? ""));
          setAskedId(target.id);
        },
      });
    },
    [
      scene,
      asakai,
      panels,
      states,
      attempts,
      askedId,
      askedText,
      wrongNums,
      probes,
      probeLog,
      logLines,
      dayAi,
      say,
      finishScene,
    ],
  );

  /**
   * 1本の 報告を 受ける。**声でも 文字でも ここに 来る**。
   *
   * ## 鍵が あれば AIにも 見て もらう（2026-09-14 の 指定「合否ごと AIに 寄せる」）
   * ことばの 照合は **書いて ある 語**しか 見られない ので、正しく 報告して いても
   * 教材に 無い 言い方だと 開かない。AIは そこを 埋める——返って くるのは
   * **言えた 行の id**と **記録の 読み上げか どうか**だけで、
   * 何枚 開くかは `panels.ts` が 数える（AIの さじ加減で 難しさを 変えない）。
   *
   * 鍵が 無ければ 待たずに そのまま 数える。**開く 条件も 合格ラインも 同じ**なので、
   * 文字入力の 通し検証（E2E）は 鍵ゼロの まま 決定論で 走る。
   */
  const send = useCallback(
    (spoken?: string) => {
      const text = (spoken ?? answer).trim();
      if (!text || !scene || !asakai) return;
      if (spoken === undefined) setAnswer("");
      setLines((prev) => [...prev, { who: "あなた", speakerId: "self", text, self: true }]);

      if (!getGeminiKey()) {
        apply(text, null);
        return;
      }
      /* 待って いる あいだも 画面は 生きて いる（上限を 過ぎたら 照合だけで 進む）。 */
      setWaiting(true);
      const at = runId.current;
      void requestAsakaiJudge(
        `${meeting.id}:${scene.day}`,
        {
          judgePrompt: meeting.judgePrompt ?? "",
          /* 曜日ごとの ひとこと。**継ぎ足し**なので、無い 日は 教材ぜんたいの 指示だけ。 */
          dayNote: scene.judgeNote,
          sceneTitle: scene.title,
          panels: scene.panels
            .filter((panel) => panel.facts.length > 0)
            .map((panel) => ({ id: panel.id, label: panel.label, facts: panel.facts })),
          /* 項目ごとの ブラッシュアップの ために、行を 持たない 札（進捗率）も 渡す。 */
          items: scene.panels.map((panel) => ({ id: panel.id, label: panel.label })),
          hasLog: logLines.length > 0,
          utterance: text,
        },
        scene.panels.flatMap((panel) => panel.facts),
      )
        .catch(() => null)
        .then((seen) => {
          if (runId.current !== at) return; // 別の 日へ 移った ぶんは 捨てる
          setWaiting(false);
          apply(text, seen);
        });
    },
    [answer, scene, asakai, meeting.id, meeting.judgePrompt, logLines, apply],
  );

  /** 見かたの モーダルを 閉じる。**ここで はじめて 司会と メンバーが 話す**。 */
  const closeJudge = useCallback(() => {
    const after = judge?.after;
    setJudge(null);
    after?.();
  }, [judge]);

  /*
   * 声で 答えた ぶんを 受ける。`lastUtterance` は **学習者の ことば**で、
   * 相手の 返事では ない（`useLiveVoice` の 覚え書き）。
   */
  /**
   * 画面を 離れる ときの 後始末（`MeetingSession`・`TalkGameSession` と 同じ）。
   *
   * - 判定の つなぎを 閉じる。**モジュールに 1本 張りっぱなし**なので、
   *   閉じないと Live の つなぎが 開いた まま 残り、同じ 日へ 戻った ときに
   *   前の 往復の 履歴を 抱えた つなぎを 使い回す
   * - 番号を 1つ 進める。遅れて 届いた 見立てが **もう 居ない 画面**で 走らない ように
   */
  useEffect(
    () => () => {
      runId.current += 1;
      dropJudgeSession();
    },
    [],
  );

  const spokenAt = useRef(0);
  useEffect(() => {
    const heard = voice.lastUtterance;
    if (!heard || heard.id === spokenAt.current) return;
    /*
     * **遅れて 届いた ぶんは 捨てる**（番号だけ 進める）。
     *
     * 文字起こしは 指を はなした あとに 届く ので、その あいだに 見かたの
     * モーダルが 出て いたり、時間カード／週の けっかへ 移って いたり する。
     * そのまま `send` に 流すと `setJudge` が 前の 判定を 差しかえ、閉じた ときに
     * 走る はずの 聞き返しが 消える——**カードだけ 進んで 司会が 何も 言わない**
     *（2026-09-11 の 検収）。
     */
    spokenAt.current = heard.id;
    if (!heard.text.trim()) return;
    /* AIに 見て もらって いる 最中の ぶんも 捨てる（2本 重なると 見かたが 入れ替わる）。 */
    if (judge !== null || waiting || phase !== "talk") return;
    /* 効果の 中で そのまま 状態を 変えない（描き直しが 連なる）。1つ 後ろへ ずらす。 */
    void Promise.resolve().then(() => send(heard.text));
  }, [voice.lastUtterance, send, judge, waiting, phase]);

  /** 時間カードへ。金曜だけは そのまま 週の けっかへ。 */
  /**
   * **札を 押して、その 1枚を もう いちど 聞いて もらう**（2026-09-18 の 指定
   *「報告の カードは、初回回答後は クリック可能に して、不正解の ものを やり直しできる」）。
   *
   * 司会の 聞き返しを 待つ しか なかった ころ、2回 まちがえて 打ち切られた 札は
   * その日 二度と 開けなかった——正しい ことばを 思い出しても 行き場が 無い。
   * 押された 札は **打ち切りを 解き**、聞き返しの 1本目から やり直す。
   * その日が もう 終わって いた ときは、評価を 閉じて 会話に 戻す
   *（`finishScene` は 同じ 日を 置きかえる ので、けっかは あとから 上書きされる）。
   */
  const retryPanel = useCallback(
    (id: string) => {
      if (!scene) return;
      const data = scene.panels.find((one) => one.id === id);
      if (!data) return;
      setStates((prev) => prev.map((one) => (one.id === id ? { ...one, gaveUp: false } : one)));
      setAttempts((prev) => ({ ...prev, [id]: 1 }));
      setJudge(null);
      setDayOpen(false);
      setPendingTail([]);
      setAskedId(id);
      const followup = data.followups[0];
      setAskedText(followup?.text ?? "");
      if (followup) say(followup);
    },
    [scene, say],
  );

  const toGap = useCallback(() => {
    if (!asakai) return;
    /*
     * 場面を 離れる ときは 鳴って いる こえも、つないだ ままの Live も 止める。
     * 止めないと 遅れて 届いた 1本で けっかの 画面に モーダルが 出る。
     */
    runId.current += 1;
    setWaiting(false);
    stopClips();
    voice.stop();
    if (sceneAt + 1 >= asakai.scenes.length) {
      setPhase("done");
      setWeekOpen(true);
      return;
    }
    setPhase("gap");
  }, [asakai, sceneAt, stopClips, voice]);

  /**
   * 週の けっかを 読み終えた とき。
   *
   * **「おわった」を ここで 書く**（`toGap` では 書かない）。先に 書くと
   * ステージの「クリア」の 板が けっかの 上に かぶさり、合格か 不合格かが
   * 読めなく なる（規律1。2026-09-11 に 390px の 通しで 実発生）。
   * `MeetingSession` が 修了証を 閉じた ときに 書くのと 同じ 順番。
   */
  const closeResult = useCallback(() => {
    recordContentProgress(meeting.id, { status: "completed" });
    /* 話しきった 人が もう一度 開いたら 月曜から。しおりは ここで 消す。 */
    clearAsakaiResume(meeting.id);
  }, [meeting.id]);

  /**
   * 週の けっかを 閉じる。**「おわった」は 1回だけ 書く。**
   *
   * ポップアップは 閉じた あとも もう いちど 開ける ので、開け閉めの たびに
   * しおりを 消しに いかない。
   */
  const closeWeek = useCallback(() => {
    setWeekOpen(false);
    if (weekRead.current) return;
    weekRead.current = true;
    closeResult();
  }, [closeResult]);

  /**
   * その 日へ 移る。**つぎへ 進む ときも、タブで 飛ぶ ときも ここを 通る**。
   *
   * 順番に 進む 道しか 無かった ころ（`goNext`）、水曜を もう一度 見るには
   * 月曜から やり直すしか なかった。授業では「木曜の 遅れの 報告を みんなで 見る」
   * ように 使う ので、その 日に 直接 行けないと 使えない（2026-09-13 の 指定）。
   *
   * 鳴って いる こえと Live を **先に 止める**。止めないと、飛んだ あとに
   * 前の 日の 司会の 声が 追いかけて きて、板の 中身と 食い違う。
   */
  const goToScene = useCallback(
    (at: number) => {
      if (!asakai || at < 0 || at >= asakai.scenes.length) return;
      runId.current += 1;
      setWaiting(false);
      stopClips();
      voice.stop();
      setSceneAt(at);
      setStates(initialPanelStates(toPanels(asakai.scenes[at])));
      setAttempts({});
      setAskedId(null);
      setWrongNums([]);
      setProbes(0);
      setAnswer("");
      setJudge(null);
      setProbeLog([]);
      setDayAi({ clarity: null, japanese: null, good: "", advice: "" });
      setDayItems({});
      setAskedText("");
      setDayOpen(false);
      setPendingTail([]);
      setDutyIntro([]);
      setPhase("talk");
      openScene(at);
    },
    [asakai, openScene, stopClips, voice],
  );

  const goNext = useCallback(() => goToScene(sceneAt + 1), [goToScene, sceneAt]);

  if (!asakai || !scene) return null;

  /* 点が 出ない 理由を 分ける ため、鍵の 有無を 見て おく（値は 使わない）。 */
  const hasKey = getGeminiKey() !== "";
  const last = lines[lines.length - 1];
  /** 相手の さいごの ことば（自分の 発話は とばす）。 */
  const lastSaid = [...lines].reverse().find((line) => !line.self);
  const lastSaidAudio = lastSaid?.audio;
  const sceneOver = nextProbePanel(panels, states) === null;
  const cards = panels.map((panel) => {
    const state = states.find((s) => s.id === panel.id);
    return {
      id: panel.id,
      label: panel.label,
      state: faceOf(state, askedId === panel.id),
      /* 1本 送った あと、⭕ で ない 札は 押して やり直せる（2026-09-18 の 指定）。 */
      retry: probeLog.length > 0 && !state?.full,
      boxes: panel.facts.some((fact) => fact.box)
        ? panel.facts
            .filter((fact) => fact.box)
            .map((fact) => ({
              label: fact.box ?? "",
              state: (state?.said.includes(fact.id) ? "open" : "closed") as CardState,
            }))
        : undefined,
    };
  });

  const dayHeading = `${dayStamp(scene)}の ${KIND_NAME[scene.kind]}`;
  /** 場面の あいだ（時間カード・週の けっか）は 報告の 道具を ぜんぶ 消す。 */
  const between = phase !== "talk";

  /*
   * 口パクの 顔。
   *
   * **口の 絵が ある 人にだけ 渡す。** `VisemeFace` は 絵が 無い とき
   * 静かな 丸に 名前の 1文字を 出すが、それは **裸の 漢字**に なる（奥・富・藤）。
   * `CallShell` は 渡さなければ かなの 頭文字を 出す ので、そちらに まかせる。
   * 絵が そろったら ここに id を 足す
   *（`docs/朝礼・夕礼_口パク画像_別スレッド指示.md`）。
   */
  /**
   * 口の 形を 取るための 読み。**読める ところだけ かなに する**。
   * `kanaOf` は 読みの 無い 漢字が 1字でも あると 行ごと null を 返すので、
   * そのまま 使うと 読める 漢字まで 口の 形に 数えられなく なる。
   */
  const readAloud = (text: string) =>
    annotateRuby(text, index)
      .map((segment) => segment.reading ?? segment.text)
      .join("");

  const faces = Object.fromEntries(
    asakai.people
      .filter((person) => HAS_MOUTH.has(person.id))
      .map((person) => [
        person.id,
        <VisemeFace
          key={person.id}
          dir={`/img/characters/${person.id}/mouth`}
          /*
           * 口を 動かすのは **いま 鳴って いる 行**の 人。
           *
           * `finishScene` は 受け止め〜閉じの 5行を 一度に 積む ので、さいごの 行
           *（司会）で 見ると **鳴って いるのは ニャムさんなのに 司会の 口が 動く**
           *（2026-09-11 の 検収）。音が ある あいだは 音を 正に し、音が 無い
           * 教材だけ さいごの 行の 字で 動かす。
           *
           * 渡すのは **セリフの かな**（漢字の ままだと 口の 形が 取れない）。
           * 字が 無い 行だけ 音の URL で「行が 変わった」を 伝える。
           */
          utterance={
            clips.speakingId
              ? clips.speakingId === person.id
                ? clips.speakingText !== null
                  ? readAloud(clips.speakingText)
                  : (clips.speakingAudio ?? "")
                : ""
              : last && last.speakerId === person.id
                ? readAloud(last.text)
                : ""
          }
          /*
           * 解析器は **鳴って いる 人にだけ** 渡す。1つしか 無いので、
           * 全員に 渡すと 全員の 口が いっしょに 動く。
           */
          analyser={clips.speakingId === person.id ? clips.analyser : null}
          /* 声の 進みで、セリフの その 位置の 音の 口に する */
          progress={clips.speakingId === person.id ? clips.progress : undefined}
        />,
      ]),
  );

  /** その 日の 報告が 済んで いるか（タブの 顔に 使う）。 */
  /*
   * `DayResult.day` は **人が 読む 字**（"月曜日"）で 持って いる（`finishScene` の
   * `day: DAY_NAME[scene.day]`）。`scene.day` は "mon"。そのまま 比べて いた ので
   * **タブの 緑が 永久に 付かなかった**——タブで 飛べる のに、どこが 済んだか
   * 画面から 読めなかった（2026-09-14 の 通し検収）。同じ 字に 直してから 比べる。
   */
  const doneDays = asakai.scenes.map((s) => results.some((r) => r.day === DAY_NAME[s.day]));

  /*
   * **終わった 日の つぎまでしか 開かない**（2026-09-15 の 指定
   *「曜日の クリックは 終わらないと 解放しない もともとの UIの ロジックを 踏襲して」）。
   *
   * ミーティングの 帯と 同じ 決まり——`02 ヘンディさんに しつもん` は
   * ラウンド1を 終えるまで 🔒 で、押せない ことが 鍵の 絵で 分かる。
   * 前は 5日 ぜんぶ 押せた ので、月曜の 報告を せずに 金曜へ 飛べた。
   *
   * いま 見て いる 日（`sceneAt`）は 必ず 開ける——途中から 再開した ときに
   * 自分の いる 日が 🔒 に なると、そこから 動けなく なる。
   */
  const openUpTo = Math.max(doneDays.lastIndexOf(true) + 1, sceneAt);

  /*
   * 曜日の 帯。**ミーティングの「ばん」の 帯を そのまま 使う**（`StepTabs`）——
   * 2026-09-15 の 指定「共通化を 図りたいので、極力 同じで 済む ところは
   * デザインを そのまま 適用する ように して。作り直さず、元の ものを そのまま」。
   * 丸い 曜日タブを 別に 持って いた ころは、**同じ 役目の ものが 2つの 見た目**で
   * 画面に 並んで いた。
   *
   * 場面の 札（「木曜日 9:00 朝礼 ・ 司会 ヘンディさん」）は 消した（同日の 指定）。
   * **札が 担って いた 4つの 引き継ぎ先**（規律10。2026-09-15 の R9 検収で 実在を 確かめた）:
   * - 曜日 … この 帯（`DAY_NAME`）と、下の 報告パネルの 見出し（`dayHeading`）
   * - 朝礼／夕礼 … 同じ `dayHeading`（`KIND_NAME`）と、毎日の opening「…の 朝礼を 始めます」
   * - 9:00 / 17:50 … **直前の 記事**（`asakai_team` の「朝礼は 毎朝 9時」／
   *   `yuurei_nexttalent` の「夕礼 17:50〜18:00」）。どちらも `gates:true` で 素通りできない
   * - 司会 ヘンディさん … **参加者タイルの `duty`**（「司会・決済」）と、
   *   `asakai_team`「ヘンディさんから『では 次に、◯◯さん、お願いします』と 言われたら…」
   *   （ヘンディさんが 司会だと いう ことは、同じ ページの 担当カードが 言う）
   *
   * ここに 「時間と 司会は 会話の 中で 名のる」と 書いて いたが **それは 誤り**だった。
   * 「司会」は 発話に 1度も 出ず（persona と duty にしか 無い）、時刻も 月曜の 第一声だけ。
   * 引き継ぎ先を まちがえて 書くと、次に 読む 人が 逆向きに 直す（「会話に 無いから 足そう」
   * 「タイルの duty は 要らない」）ので、実在する 行き先に 直して ある。
   */
  const steps = (
    <div className="space-y-2">
      {/*
        空の 帯は **タブの 上に 敷く**。横に 並べて いた ころ、`flex-1` の 帯が
        のこりの 幅を ぜんぶ 取り、タブの となりに **空っぽの 水色の カプセル**が
        居座って いた（390px の 実機幅で 確認・2026-09-13）。
      */}
      <SkyStrip kind={scene.kind} />
      <StepTabs
        steps={asakai.scenes.map((one, at) => ({
          key: String(at),
          label: DAY_NAME[one.day],
          cleared: doneDays[at],
          locked: at > openUpTo,
        }))}
        current={String(sceneAt)}
        note={openUpTo + 1 < asakai.scenes.length ? "ぜんぶ 報告すると 開きます" : undefined}
        disabled={waiting}
        index={index}
        onPick={(key) => goToScene(Number(key))}
      >
        {/*
          **報告メモは 帯の 右はし**（2026-09-15 の 指定「添付の『自分の こたえを 見る』の
          部分に 変えて 欲しい」）。ミーティングの `AnswerNotebook` と 同じ 席・同じ 見た目に する。
          話す ボタンの 下に 大きく 置いて いた ころは、**その 画面にしか 無い ボタン**だった。
        */}
        <button
          type="button"
          onClick={() => setDuty(true)}
          aria-label="報告メモを 見る"
          className="border-hairline bg-panel text-navy ml-auto shrink-0 rounded-full border-2 px-3 py-1.5 text-xs font-extrabold"
        >
          📋 <RubyText text="報告メモ" index={index} show />
        </button>
      </StepTabs>
      <WeekBoard
        scenes={asakai.scenes.map((one) => DAY_NAME[one.day])}
        rows={results}
        unitName={asakai.level === "hard" ? "言えた こと" : "開いた カード"}
        index={index}
      />
    </div>
  );

  /*
   * 左の 報告パネル。**並びは 既存の ミーティングと そろえる**
   *（見出し → 相手の ことば → 「声で 答えましょう！」→ 速さ｜🎤｜💡）。
   * 2026-09-11 の 指定「UIをまるきり作り変えるな、既存のUIをできる限り使え」。
   */
  /*
   * 左の 話す カード。**ミーティングと 同じ 部品**（`AskPanel`）を 使う
   *（2026-09-15 の 指定「オリジナルで 作らずに 元の ものを そのまま 使って 欲しい」
   *「極力 同じ 環境を そのまま データのみ 差し替えで 使えるように」）。
   *
   * 前は 同じ 並びの つもりで **自前に 組み直して** いた ので、速さが 横に なり、
   * 3列の 固定幅も 崩れて いた。ここが 渡すのは **その日の データだけ**。
   */
  const reportPanel = between ? null : (
    <AskPanel
      heading={dayHeading}
      speaker={lastSaid ? `${lastSaid.who}さんの ことば` : undefined}
      /* 教材が 書いた 固定文なので **タップで 意味が 出る**（2026-09-11 の 指定）。 */
      body={lastSaid ? <DictionaryText text={lastSaid.text} index={index} /> : null}
      /* 作り置きの こえが ある ときだけ 出す。聞きとれなかった 人の 逃げ道。 */
      onReplay={lastSaidAudio ? () => clips.replay(lastSaidAudio, rateOf(speed)) : undefined}
      speed={speed}
      onSpeed={saveSpeechSpeed}
      speedDisabled={judge !== null}
      /* その日が 終わったら 話す ところは 出さず、下の「けっかを 見る」に 渡す。 */
      speak={
        sceneOver
          ? null
          : {
              status: voice.status,
              reason: voice.reason,
              talking: voice.talking,
              disabled: judge !== null || waiting,
              waitNote: judge
                ? "見かたを 読んでから 話します。"
                : waiting
                  ? "AIが いま 見て います。"
                  : null,
              onConnect: () => void voice.start(LISTEN_ONLY),
              onStartTalking: voice.startTalking,
              onStopTalking: voice.stopTalking,
            }
      }
      onHint={() => setHint(true)}
      hintDisabled={judge !== null}
      index={index}
    >
      {sceneOver ? (
        <button
          type="button"
          onClick={() => setDayOpen(true)}
          aria-label={
            sceneAt + 1 >= asakai.scenes.length ? "今週の けっかを 見る" : "きょうの けっかを 見る"
          }
          className="btn-island btn-game w-full px-6 py-3"
        >
          <RubyText
            text={
              sceneAt + 1 >= asakai.scenes.length
                ? "今週の けっかを 見る ▶"
                : "きょうの けっかを 見る ▶"
            }
            index={index}
            show
          />
        </button>
      ) : null}
    </AskPanel>
  );

  /*
   * 報告メモ（担当・ゴール・進捗・その日の 行／メモ）。**報告の もとに なる もの**。
   * **画面に 出しっぱなしに せず、ポップアップの 中身に する**（2026-09-13 の 指定）。
   */
  /*
   * 報告メモに 並べる 箱。**きのう → 進捗 → きょう → 問題（→ お願い）**
   *（2026-09-16 の 指定「進捗を 昨日したことの 次に 入れて ください」）。
   *
   * この 並びは **報告の 4つの 型と 同じ**——① きのう したこと ② 担当の 機能 ぜんたいの 進捗
   * ③ きょう すること ④ 問題・確認。板の 4枚の カードとも 同じ 順に なる ので、
   * メモを 上から 読めば その まま 報告の 順に なる。
   *
   * 進捗（`card.pin`）は もとは 黄色い 付せんで、ほかの 行と **別の 作り**だった。
   * 同じ 形の 箱に 入れて、位置も 並びの 中に きちんと 置く。
   * `kinou` の 無い 教材では いちばん 後ろに 付く。
   */
  const memoRows: { key: string; label: string; text: string; count?: RowCount }[] = [];
  for (const row of scene.card.rows ?? []) {
    memoRows.push({ key: row.key, label: row.label, text: row.text, count: row.count });
    if (row.key === "kinou" && scene.card.pin) {
      memoRows.push({ key: "shinchoku", label: "進捗", text: scene.card.pin });
    }
  }
  if (scene.card.pin && !memoRows.some((row) => row.key === "shinchoku")) {
    memoRows.push({ key: "shinchoku", label: "進捗", text: scene.card.pin });
  }

  const dutyBody = (
    <div className="mt-3 space-y-3">
      <div className="border-hairline rounded-xl border bg-white/70 p-2 text-sm">
        <Tag text="担当" index={index} />
        <DictionaryText text={scene.card.duty} index={index} />
        <p className="mt-1 font-bold">
          <Tag text="今週の ゴール" index={index} />
          <DictionaryText text={scene.card.goal} index={index} />
        </p>
        {scene.card.deadline ? (
          <p className="mt-1 font-bold">
            <Tag text="いつまでに" index={index} />
            <DictionaryText text={scene.card.deadline} index={index} />
          </p>
        ) : null}
      </div>

      {/*
        **報告の 4つを そのまま 上から 並べる**（2026-09-16 の 指定
        「昨日 したこと、今日 すること、問題点も 色付きの 枠で 囲ったり ラベル付けする などして
        目立つように。かつ 進捗の 前に 持ってきて」＋「進捗を 昨日したことの 次に 入れて」）。

        並びは **きのう → 進捗 → きょう → 問題（→ お願い）**＝**報告の 4つの 型と 同じ 順**。
        進捗は もともと 黄色い 付せん 1枚で、**ほかと 別の 作り**で 浮いて いた ので、
        同じ 枠・同じ ラベルの 形に そろえた（色だけ ちがう）。

        前は 進捗の 付せんと 表の **下**に 字だけで 並んで いた。報告で まっさきに
        言う ものが いちばん 下に あり、見出しも 青い 字だけ だった ので、
        どこからが「きのう」で どこからが「きょう」か 目で 追えなかった。
      */}
      {memoRows.length > 0 ? (
        <dl className="m-0 space-y-2">
          {memoRows.map((row) => {
            const face = ROW_FACE[row.key] ?? ROW_FACE.kinou;
            return (
              <div
                key={row.key}
                className="rounded-xl border-2 px-3 py-2"
                style={{ background: face.face, borderColor: face.edge }}
              >
                <dt>
                  {/*
                    ふりがなは 字の **上**に 出るので、札の 行の 高さが 足りないと
                    上が 切れて 消える（2026-09-16 の 指定「ふりがなを 含む 要素の
                    縦幅が 足りないため、ふりがなが きえて います」）。
                    `inline-block` ＋ ゆるい `leading` で ルビの ぶんの 高さを 確保する。
                  */}
                  <span
                    className="mr-1 inline-block rounded-full px-2 py-1 text-[11px] leading-[1.9] font-black text-white [&_rt]:text-white"
                    style={{ background: face.edge }}
                  >
                    {face.mark} <RubyText text={row.label} index={index} show />
                  </span>
                </dt>
                <dd className="text-ink m-0 mt-1 text-sm font-bold">
                  <DictionaryText text={row.text} index={index} />
                  {row.count ? (
                    <CountBoxes total={row.count.total} done={row.count.done} now={row.count.now} />
                  ) : null}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : null}

      <ProgressBoxes items={scene.card.progress} index={index} />

      {scene.card.memo?.length ? (
        <div>
          <p className="text-ink-soft text-[11px] font-black">
            <RubyText text="きょうの メモ" index={index} show />
          </p>
          <ul className="mt-1 list-none space-y-1 border-l-[3px] border-[#8a5a3e] pl-2">
            {scene.card.memo.map((row, at) => (
              <li
                key={`${row.head}-${at}`}
                /*
                 * `aside`（報告に 要らない 行）でも **見た目を 変えない**。
                 * 灰色に して いた ころ、どれを 落とすかを 画面が 先に
                 * 答えて いた——えらぶ 練習に ならない（2026-09-11）。
                 */
                className="grid grid-cols-[3.6rem_minmax(0,1fr)] gap-2 text-[13px] leading-snug font-bold"
              >
                <span className="text-[#8a5a3e] tabular-nums">
                  <RubyText text={row.head} index={index} show />
                </span>
                <span>
                  <DictionaryText text={row.text} index={index} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {scene.card.todo?.length ? (
        <div className="bg-panel-tint rounded-xl px-3 py-2 text-sm">
          <p className="text-ink-soft text-[11px] font-black">
            <RubyText text="やること" index={index} show />
          </p>
          {scene.card.todo.map((row, at) => (
            <p key={at} className="font-bold">
              <DictionaryText text={row} index={index} />
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <CallShell
      title={meeting.title}
      focus={meeting.focus}
      furigana={meeting.furigana ?? []}
      purpose="speak"
      tone="light"
      activeSpeaker={last && !last.self ? last.speakerId : undefined}
      participants={asakai.people
        /*
         * **その日に 話す 人は 出す**。
         *
         * `fridayOnly` だけで 見て いた ころ、藤木さんに 火曜と 木曜の 台詞を
         * 足したのに **顔が 出ない まま 声だけ 流れて いた**（2026-09-13）。
         * だれが しゃべって いるのか 画面から 追えない。旗では なく
         * **その場面に 台詞が あるか**で 決める。
         */
        .filter((person) => !person.fridayOnly || speakersOf(scene).has(person.id))
        .map((person) => ({
          id: person.id,
          name: person.name,
          role: person.duty,
          accent: person.accent,
        }))}
      faces={faces}
      settings={<SpeechSpeedPicker value={speed} onChange={saveSpeechSpeed} />}
      onJoined={() => openScene(start.sceneAt)}
      onLeft={() => {
        voice.stop();
        clips.stop();
      }}
      side={
        <Chat
          lines={lines}
          index={index}
          draft={answer}
          /* 見かたを 読んで いる あいだ・AIが 見て いる あいだ・その日が 終わった あとは 送れない。 */
          canSend={!between && !sceneOver && judge === null && !waiting}
          sendNote={
            judge
              ? "見かたを 読んでから 送れます"
              : waiting
                ? "AIが いま 見て います…"
                : "いまは 送れません"
          }
          onDraft={setAnswer}
          onSend={() => send()}
          onReplay={(url) => clips.replay(url, rateOf(speed))}
        />
      }
      speak={between ? null : <CardBoard cards={cards} index={index} onPick={retryPanel} />}
      controls={
        phase === "done" ? (
          /*
            けっかは **ポップアップ**で 出す（2026-09-17 の 指定「全て モーダルが 良いです」）。
            ここに 残すのは **開け直す 道**だけ——閉じた あと 画面に 何も 無いと、
            もう いちど 数を 見たい 人が 行き場を なくす。
          */
          <div className="card-island space-y-2 p-4">
            <p className="text-navy text-sm leading-[1.9] font-bold">
              <RubyText text={`${asakai.scenes.length}日 ぜんぶ 話しました。`} index={index} show />
            </p>
            <button
              type="button"
              onClick={() => setWeekOpen(true)}
              aria-label="今週の けっかを 見る"
              className="btn-island btn-game w-full px-6 py-3"
            >
              <RubyText text="今週の けっかを 見る ▶" index={index} show />
            </button>
          </div>
        ) : phase === "gap" ? (
          <TimeCard
            result={results[results.length - 1]}
            lead={scene.lead}
            nextDay={DAY_NAME[asakai.scenes[sceneAt + 1]?.day ?? "fri"]}
            at={sceneAt + 1}
            total={asakai.scenes.length}
            index={index}
            onNext={goNext}
          />
        ) : (
          <div className="space-y-2">
            {steps}
            {reportPanel}
          </div>
        )
      }
      controlsAt="top"
    >
      {duty ? (
        <ModalShell
          label="報告メモ"
          /*
            **題の 横に 曜日**（2026-09-16 の 指定「報告メモの タイトルの 横に
            目立つ ように 曜日を 記載して ください」）。中身は 曜日ごとに ぜんぶ 変わる のに、
            開いた ポップアップだけを 見て いると **いつの メモか**が 分からなかった。
          */
          title={
            <span className="inline-flex flex-wrap items-center justify-center gap-2">
              <RubyText text="📋 報告メモ" index={index} show />
              <span className="bg-sky-deep inline-block rounded-full px-3 py-1 text-sm leading-[1.9] font-black text-white [&_rt]:text-white">
                <RubyText text={dayStamp(scene)} index={index} show />
              </span>
            </span>
          }
          onClose={() => {
            setDuty(false);
            /* 閉じて から 司会が 話しはじめる（上の `dutyIntro` の 覚え書き）。 */
            if (dutyIntro.length > 0) {
              pushClips(dutyIntro, rateOf(speed));
              setDutyIntro([]);
            }
          }}
          /* 中身は 3つの 箱＋付せん＋10行の 表。細い ままだと PCで 短冊に なる。 */
          wide
          index={index}
        >
          {dutyBody}
        </ModalShell>
      ) : null}
      {hint ? (
        <HintModal
          lines={scene.hintLines}
          hasBlank={scene.hintLines.some((line) => line.includes("◯"))}
          furigana={index}
          onClose={() => setHint(false)}
        />
      ) : null}
      {judge ? (
        judge.kind === "probe" ? (
          <ProbeScoreModal
            heard={judge.heard}
            judged={judge.judged}
            question={judge.question}
            answer={judge.utterance}
            good={judge.good}
            advice={judge.advice}
            score={judge.score}
            rows={judge.rows}
            hasKey={hasKey}
            nextLabel={judge.sceneOver ? "みんなの 報告を 聞く ▶" : "つぎの しつもんを 聞く ▶"}
            rest={judge.shut.join("／")}
            index={index}
            /*
              言い直す … 同じ しつもんの まま、もう いちど 書く（司会は 何も 言わない）。
              **その日が 終わって いる ときは 出さない**——閉じる ことでしか
              司会の 受け止めと メンバーの 報告に 進めない（上の `onRetry` の 覚え書き）。
            */
            onRetry={judge.sceneOver ? undefined : () => setJudge(null)}
            onClose={closeJudge}
          />
        ) : (
          <ReportScoreModal
            score={judge.score}
            rows={judge.rows}
            good={judge.good}
            advice={judge.advice}
            readLog={judge.readLog}
            nextLabel={judge.sceneOver ? "みんなの 報告を 聞く ▶" : "報告を つづける ▶"}
            utterance={judge.utterance}
            hasKey={hasKey}
            index={index}
            onClose={closeJudge}
          />
        )
      ) : null}
      {dayOpen ? (
        <DayScoreModal
          dayName={DAY_NAME[scene.day]}
          kindName={KIND_NAME[scene.kind]}
          at={sceneAt + 1}
          total={asakai.scenes.length}
          score={{
            content: contentScore(states.filter((one) => one.full).length, panels.length),
            clarity: dayAi.clarity,
            japanese: dayAi.japanese,
            total: totalScore(
              contentScore(states.filter((one) => one.full).length, panels.length),
              dayAi.clarity,
              dayAi.japanese,
            ),
          }}
          rows={panels.map((panel) => {
            const mark = markOf({
              full: states.find((one) => one.id === panel.id)?.full ?? false,
              attempts: attempts[panel.id] ?? 0,
              wrongNumber: wrongNums.includes(panel.id),
            });
            return {
              id: panel.id,
              label: panel.label,
              mark,
              advice: "",
              /* その 札を 開けた ことば（控えから 逆に 引く）。 */
              said: probeLog
                .filter((one) => one.panels?.includes(panel.id))
                .map((one) => one.answer)
                .join(" "),
              /*
               * **その日の ふりかえりにだけ 正しい 回答を 出す**（2026-09-18 の 指定）。
               * 教材の 見本は 「…」で 囲って ある ので、外して 本文だけ 並べる
               *（つないで「ブラッシュアップ回答」を 作るため）。
               */
              example: (
                scene.panels.find((one) => one.id === panel.id)?.example?.text ?? ""
              ).replace(/^「|」$/gu, ""),
              /*
               * 項目ごとの ブラッシュアップ（その日 いちばん 新しい 直し）。**言えた 札だけ**——
               * まだの 札は 横の「正しい 回答」で 見くらべる（日の おわりは 答えを 見せて よい）。
               */
              polished: mark !== "missing" ? (dayItems[panel.id]?.polished ?? "") : "",
              /* 日の おわりは 正しい 回答を 出す ので、ヒントは 要らない。 */
              hint: "",
            };
          })}
          probes={probeLog}
          good={dayAi.good}
          advice={dayAi.advice}
          nextLabel={
            sceneAt + 1 >= asakai.scenes.length
              ? "今週の けっかを 見る ▶"
              : `${DAY_NAME[asakai.scenes[sceneAt + 1]?.day ?? "fri"]}へ 進む ▶`
          }
          hasKey={hasKey}
          index={index}
          /* もう いちど 報告する … その日を はじめから（けっかは 上書きされる）。 */
          onRetry={() => {
            setDayOpen(false);
            setPendingTail([]);
            goToScene(sceneAt);
          }}
          onClose={() => {
            setDayOpen(false);
            /* 受け止めの 字と、そのあとの 話を ここで 出す（上の `finishScene` の 覚え書き）。 */
            if (pendingTail.length > 0) {
              const rest = pendingTail.slice(1);
              setLines((prev) => [
                ...prev,
                ...pendingTail.map((line) => toChatLine(line, nameOf, learnerName)),
              ]);
              if (rest.length > 0) pushClips(rest, rateOf(speed));
              setPendingTail([]);
            }
            toGap();
          }}
        />
      ) : null}
      {weekOpen ? (
        <WeekResult asakai={asakai} rows={results} index={index} onClose={closeWeek} />
      ) : null}
    </CallShell>
  );
}

/**
 * 報告の 行（きのう・きょう・問題・お願い）の 顔。
 *
 * **4つの 型カードと 同じ 色**に そろえる——板の カードと メモの 箱が 同じ ものを
 * 指して いる ことが、色で つながる（2026-09-16 の 指定「色付きの 枠で 囲ったり
 * ラベル付けするなど して 目立つように」）。
 */
/** 「20この うち 16こ」の 絵（行が 持つ ことが ある）。 */
interface RowCount {
  readonly total: number;
  readonly done: number;
  readonly now: number;
}

interface RowFace {
  readonly mark: string;
  readonly face: string;
  readonly edge: string;
}

const ROW_FACE: Record<string, RowFace | undefined> & { kinou: RowFace } = {
  kinou: {
    mark: "📅",
    face: "color-mix(in srgb, var(--color-sky) 14%, white)",
    edge: "var(--color-sky-deep)",
  },
  kyou: {
    mark: "▶",
    face: "color-mix(in srgb, var(--color-sun) 18%, white)",
    edge: "#b98b16",
  },
  ashita: {
    mark: "⏭",
    face: "color-mix(in srgb, var(--color-sun) 18%, white)",
    edge: "#b98b16",
  },
  /*
   * 進捗（付せんだった もの）。2026-09-16 の 指定「UIが せっかく 整ったので、
   * 他の 表示に 合わせた **色ちがいの 枠**に して ください」。
   * 黄色い 付せん 1枚だけ 別の 作りで 浮いて いた。
   */
  shinchoku: {
    mark: "📊",
    face: "color-mix(in srgb, var(--color-leaf) 16%, white)",
    edge: "var(--color-leaf-deep)",
  },
  komari: {
    mark: "❗",
    face: "color-mix(in srgb, var(--color-coral) 14%, white)",
    edge: "var(--color-coral-deep)",
  },
  onegai: {
    mark: "🙏",
    face: "color-mix(in srgb, var(--color-grape, #c9a7e8) 18%, white)",
    edge: "#7a4fa8",
  },
};

/**
 * 濃い 地の 小さな 札（担当・今週の ゴール など）。
 *
 * **`inline-block` ＋ ゆるい `leading`** を 付けるのは、ふりがなが 字の 上に 出るから
 *（2026-09-16 の 指定「ふりがなを 含む 要素の 縦幅が 足りない ため、ふりがなが
 * きえて います」）。`py-0.5` の まま 行の 高さを 詰めると、上の かなが 札の 外へ
 * はみ出して 切れる。
 */
function Tag({ text, index }: { text: string; index: FuriganaIndex }) {
  return (
    <span className="bg-navy mr-1 inline-block rounded-full px-2 py-1 text-[11px] leading-[1.9] font-black text-white [&_rt]:text-white">
      <RubyText text={text} index={index} show />
    </span>
  );
}

/**
 * 時間カード（1日の 終わり）。
 *
 * **⭕❌ の 並びだけを 出さない**——何の ⭕ なのかが 読めない ので、
 * カードの 札を そのまま 添える（fable の 棚卸し §5）。
 * 聞き返しの 数は ここには 出さない（週の けっかの 表に まとめる）。
 */
function TimeCard({
  result,
  lead,
  nextDay,
  at,
  total,
  index,
  onNext,
}: {
  result: DayResult | undefined;
  lead?: string;
  nextDay: string;
  at: number;
  total: number;
  index: FuriganaIndex;
  onNext: () => void;
}) {
  return (
    <div className="card-island space-y-3 p-4" role="status">
      {result ? (
        <>
          <p className="text-navy text-base font-black">
            <RubyText
              text={`${result.day}の ${KIND_NAME[result.kind]} おわり`}
              index={index}
              show
            />
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {result.chips.map((chip) => (
              <li
                key={chip.label}
                className={`rounded-full border px-2 py-1 text-[11px] font-black ${
                  chip.open ? "border-leaf bg-leaf-soft text-navy" : "border-coral bg-coral-soft"
                }`}
              >
                <RubyText text={chip.label} index={index} show /> {chip.open ? "⭕" : "❌"}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {lead ? (
        <div className="bg-panel-tint rounded-xl px-3 py-2">
          <p className="text-ink-soft text-[11px] font-black">
            <RubyText text="この あと あった こと" index={index} show />
          </p>
          <p className="mt-0.5 text-sm font-bold">
            <RubyText text={lead} index={index} show />
          </p>
        </div>
      ) : null}
      <button
        type="button"
        onClick={onNext}
        aria-label={`${nextDay}から つづけます`}
        className="btn-island btn-game w-full px-6 py-3"
      >
        <span className="block break-keep">
          <RubyText text={`${nextDay}から つづけます`} index={index} show />
        </span>
        <span className="block text-xs tabular-nums">
          <DayProgress at={at + 1} total={total} />
        </span>
      </button>
    </div>
  );
}

/**
 * **曜日ごとの 点を、ポップアップを 開かずに 見る 帯**（2026-09-18 の 指定
 *「モーダルでは ない 画面で 曜日ごとの 点数や 評価を 表示する 箇所を 作れますか？」）。
 *
 * これまで 点は **きょうの 評価**と **今週の けっか**の 中にしか 無く、
 * どちらも 閉じると 消えた——いま 何日目で、前の 日が 何点だったかを
 * 見に 行く 道が 無い。タブの すぐ 下に 置いて、報告の あいだ ずっと 見える ように する。
 *
 * 出すのは **端末に 残って いる もの**だけ（`DayResult`）。伝わりやすさと
 * 仕事の 日本語は 日ごとに 残して いない ので ここには 出さない——
 * 見て いない ものを 数に しない（規律1）。
 */
function WeekBoard({
  scenes,
  rows,
  unitName,
  index,
}: {
  /** 月〜金の 字（`DAY_NAME`）。まだ 報告して いない 日も 席を 出す。 */
  scenes: readonly string[];
  rows: readonly DayResult[];
  unitName: string;
  index: FuriganaIndex;
}) {
  if (rows.length === 0) return null;
  const byDay = new Map(rows.map((row) => [row.day, row]));
  return (
    <div
      role="group"
      aria-label="曜日ごとの けっか"
      className="border-hairline bg-panel rounded-xl border px-3 py-2"
    >
      <p className="text-ink-soft text-[11px] leading-[1.9] font-black">
        📊 <RubyText text={`曜日ごとの けっか（${unitName}／内容の 点）`} index={index} show />
      </p>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {scenes.map((day) => {
          const row = byDay.get(day);
          /* 内容の 点は 残って いる 数から 出す（`asakai-score.ts` と 同じ 出しかた）。 */
          const point = row ? contentScore(row.cards, row.cardTotal) : null;
          return (
            <li
              key={day}
              className={`rounded-xl border-2 px-2 py-1 text-[11px] leading-[1.9] font-black ${
                row === undefined
                  ? "border-hairline bg-panel-tint text-ink-soft"
                  : row.cards >= row.cardTotal
                    ? "border-leaf bg-sky-soft text-leaf-deep"
                    : "border-sun-deep bg-cream text-sun-deep"
              }`}
            >
              <RubyText text={day} index={index} show />{" "}
              {row === undefined ? (
                <RubyText text="まだ" index={index} show />
              ) : (
                <span className="tabular-nums">
                  {row.units} / {row.unitTotal} ・ {point} / {CONTENT_MAX}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * 週の けっか。**合否を 字で はっきり 出す**（規律1）。ねぎらいの ことばは 置かない。
 *
 * 数える 単位は レベルで ちがう——かんたんは **開いた カード**（20枚）、
 * むずかしいは **言えた こと**（30こ）と **こまりごとで 言えた こと**（15こ）。
 * どちらも「数字と きょうで 稼いで こまりごとを 5日 落とす」を 合格に しない ため、
 * 2本の 線を 両方 越えた ときだけ 合格に する。
 *
 * ## 表の 列は **合否と 同じ ものさし**に する
 * 上の 行が「言えた こと 23 / 30」で、下の 表が「開いた カード 3 / 4」だと、
 * **どちらが 合格に 効くのかが 画面から 読めない**（数の 単位が 2つ 並ぶ）。
 * だから 表の 列見出しも `unitName` と そろえ、中身も その日の `units` を 出す。
 */
function WeekResult({
  asakai,
  rows,
  index,
  onClose,
}: {
  asakai: Asakai;
  rows: readonly DayResult[];
  index: FuriganaIndex;
  onClose: () => void;
}) {
  /*
   * 問題の 札は **教材の ことばを 使う**。「こまりごと」と 書き込んで いた ころ、
   * 5日 ずっと「問題点」と 教えて おいて、最後の 合否だけ 別の 名前で 言って いた
   *（2026-09-14 の 通し検収。決済編は「問題・確認」、Next Talent 編は「問題点」）。
   */
  const komariName =
    asakai.scenes[0]?.panels.find((panel) => panel.id === "komari")?.label ?? "問題";
  const units = rows.reduce((sum, row) => sum + row.units, 0);
  const unitTotal = rows.reduce((sum, row) => sum + row.unitTotal, 0);
  const komariDays = rows.filter((row) => row.komariOpen).length;
  const komariBoxes = rows.reduce((sum, row) => sum + row.komariBoxes, 0);
  const komariTotal = rows.reduce((sum, row) => sum + row.komariTotal, 0);

  const needUnits = asakai.pass.units;
  const needDays = asakai.pass.komariDays;
  const needBoxes = asakai.pass.komariBoxes;
  const unitName = asakai.level === "hard" ? "言えた こと" : "開いた カード";
  const secondOk =
    needBoxes !== undefined
      ? komariBoxes >= needBoxes
      : needDays !== undefined
        ? komariDays >= needDays
        : true;
  const pass = units >= needUnits && secondOk;

  return (
    <ModalShell
      label="今週の けっか"
      title={
        <span className={`text-2xl font-black ${pass ? "text-leaf-deep" : "text-coral-deep"}`}>
          <RubyText text={pass ? "合格" : "不合格"} index={index} show />
        </span>
      }
      onClose={onClose}
      closeLabel="けっかを 読みました ▶"
      index={index}
      /* 中身は 5行の 表。細い ままだと PCで 短冊に なる。 */
      wide
    >
      <p className="mt-3 text-sm font-bold">
        <RubyText text={unitName} index={index} show />{" "}
        <span className="tabular-nums">
          {units} / {unitTotal}
        </span>{" "}
        — <span className="tabular-nums">{needUnits}</span>{" "}
        <RubyText text="以上で 合格" index={index} show />
      </p>
      {needBoxes !== undefined ? (
        <p className="mt-1 text-sm font-bold">
          <RubyText text={`${komariName}で 言えた こと`} index={index} show />{" "}
          <span className="tabular-nums">
            {komariBoxes} / {komariTotal}
          </span>{" "}
          — <span className="tabular-nums">{needBoxes}</span>{" "}
          <RubyText text="以上で 合格" index={index} show />
        </p>
      ) : needDays !== undefined ? (
        <p className="mt-1 text-sm font-bold">
          <RubyText text={`${komariName}を 言えた 日`} index={index} show />{" "}
          <span className="tabular-nums">
            {komariDays} / {rows.length}
          </span>{" "}
          — <span className="tabular-nums">{needDays}</span>
          <RubyText text="日 以上で 合格" index={index} show />
        </p>
      ) : null}

      <table className="mt-3 w-full text-left text-[13px] font-bold">
        <thead>
          <tr className="text-ink-soft text-[11px]">
            <th scope="col" className="py-1">
              <RubyText text="曜日" index={index} show />
            </th>
            <th scope="col" className="py-1">
              <RubyText text={unitName} index={index} show />
            </th>
            <th scope="col" className="py-1">
              <RubyText text="聞き返し" index={index} show />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.day} className="border-hairline border-t">
              <td className="py-1">
                <RubyText text={row.day} index={index} show />
              </td>
              <td className="py-1 tabular-nums">
                {row.units} / {row.unitTotal}
              </td>
              <td className="py-1 tabular-nums">
                <RubyText text={`${row.probes}回`} index={index} show />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {pass ? null : (
        <p className="mt-3 text-sm font-bold">
          <RubyText text="もう いちど はじめから 話すと、数は 数え直します。" index={index} show />
        </p>
      )}
    </ModalShell>
  );
}

/**
 * テキストチャット。**書いて 送る 欄は チャットの 足もと**
 *（`MeetingSession` の `chatPanel` と 同じ 作り・2026-09-15 の 指定
 *「文字入力の 場合は テキストチャットで 入れる ように して。元の UIを そのまま 使って」）。
 *
 * 前は 話す ボタンの 下に 大きな 入力欄が あり、**話す ところと 書く ところが
 * 画面の 端と 端**に 離れて いた（ミーティングが 2026-08-27 に 直したのと 同じ 形）。
 */
function Chat({
  lines,
  index,
  draft,
  canSend,
  sendNote,
  onDraft,
  onSend,
  onReplay,
}: {
  lines: readonly ChatLine[];
  index: FuriganaIndex;
  /** 書きかけの 字。 */
  draft: string;
  /** いま 送れるか（見かたを 読んで いる あいだ・AIを 待って いる あいだは 送れない）。 */
  canSend: boolean;
  /** 送れない 理由（placeholder に 出す）。 */
  sendNote: string;
  onDraft: (value: string) => void;
  onSend: () => void;
  /** 🔊 を 押した とき（作り置きの こえが ある 行だけ 出る）。 */
  onReplay: (url: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  /* 行が 増えたら いちばん下へ。受け止め・采配・閉じの ことばが 箱の 中に 隠れる。 */
  useEffect(() => {
    const node = box.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [lines]);
  return (
    /* 殻も 入力欄も **ミーティングと 同じ 部品**（`ChatPanel`）。 */
    <ChatPanel
      logRef={box}
      draft={draft}
      onDraft={onDraft}
      /* 送れない ばんは **なぜ 送れないか**を 入力欄の 字で 言う。 */
      placeholder={canSend ? "メッセージを 入力…" : sendNote}
      canType={canSend}
      canSend={canSend && draft.trim() !== ""}
      onSubmit={onSend}
    >
      {lines.map((line, at) => {
        const url = line.audio;
        return (
          <p key={at} className={`text-sm font-bold ${line.self ? "text-blue-deep" : ""}`}>
            {/* 名前も 教材の 字（富田・奥田）。ルビを 通さないと 裸の 漢字に なる。 */}
            <span className="text-ink-soft mr-1 text-[11px] font-black">
              <RubyText text={line.who} index={index} show />
            </span>
            <RubyText text={line.text} index={index} show />
            {/* 流れて いった ことばを 聞き直せる（`MeetingSession` と 同じ 逃げ道）。 */}
            {url ? (
              <button
                type="button"
                aria-label={`${line.who}さんの ことばを もう一度 聞く`}
                onClick={() => onReplay(url)}
                className="btn-island ml-1 px-1.5 py-0.5 align-middle text-[11px]"
              >
                🔊
              </button>
            ) : null}
          </p>
        );
      })}
    </ChatPanel>
  );
}

/**
 * その 場面で **声を 出す 人**の id。
 *
 * 参加者の 列を「旗（`fridayOnly`）」だけで 決めて いた ころ、台詞を 足した 人の
 * 顔が 出ない まま 声だけ 流れた。台詞の ある ところを ぜんぶ 見て 決める。
 */
function speakersOf(scene: Scene): ReadonlySet<string> {
  const ids = new Set<string>();
  const add = (line?: { readonly speakerId: string }) => {
    if (line) ids.add(line.speakerId);
  };
  scene.opening.forEach(add);
  add(scene.sample);
  add(scene.prompt);
  add(scene.ack);
  scene.members.forEach(add);
  add(scene.arrange?.done);
  add(scene.arrange?.missing);
  scene.closing.forEach(add);
  for (const panel of scene.panels) {
    panel.followups.forEach(add);
    add(panel.example);
  }
  return ids;
}

/** 教材の パネルを 判定の 形へ。`fact` は 画面に 出さない（AIに 渡す 材料）。 */
function toPanels(scene: Scene | undefined): ReportPanel[] {
  if (!scene) return [];
  return scene.panels.map((panel) => ({
    id: panel.id,
    label: panel.label,
    openAt: panel.openAt,
    rule: panel.rule,
    facts: panel.facts.map((fact) => ({
      id: fact.id,
      box: fact.box,
      keywords: fact.keywords,
      minHits: fact.minHits,
      allOf: fact.allOf,
    })),
  }));
}

/**
 * カードの 顔。**⭕ は「ぜんぶ 言えた」（`full`）とき だけ**（2026-09-11）。
 *
 * `open`（1つでも 言えた）を ⭕ に して いた ころ、こまりごとの 3つの 箱の
 * うち 1つしか 言えて いない のに 板は「4 / 4」で、司会は 聞き返しつづけて
 * いた——**画面の 数と 会話が 別の ことを 言って いた**。
 */
function faceOf(state: PanelState | undefined, asked: boolean): CardState {
  if (!state) return "closed";
  if (state.gaveUp) return "missed";
  if (state.full) return "open";
  if (state.open || asked) return "asked";
  return "closed";
}
