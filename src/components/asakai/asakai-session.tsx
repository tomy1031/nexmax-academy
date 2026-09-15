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
import { SpeakButton } from "@/components/meeting/speak-button";
import { SpeechSpeedPicker } from "@/components/meeting/speech-speed-picker";
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
  DayTabs,
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
import type { AsakaiJudgeResult } from "@/lib/meeting/asakai-judge";
import { getGeminiKey, getProfile } from "@/lib/profile";
import { fillCallName } from "@/lib/meeting/speech";
import { recordContentProgress } from "@/lib/progress/store";
import {
  clearAsakaiResume,
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
  const [probes, setProbes] = useState(0);
  const [answer, setAnswer] = useState("");
  const [lines, setLines] = useState<readonly ChatLine[]>([]);
  const [hint, setHint] = useState(false);
  /**
   * じぶんの 担当（場面カード）を 開いて いるか。
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
    readonly opened: readonly string[];
    readonly shut: readonly string[];
    /** 作業記録を そのまま 読み上げて いた（数えて いない）。 */
    readonly readLog: boolean;
    readonly sceneOver: boolean;
    readonly after: (() => void) | null;
  } | null>(null);

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

  /** 場面の はじめ（司会の 開き → 見本 → あなたの 番）を チャットに 積む。 */
  const openScene = useCallback(
    (at: number) => {
      const next = asakai?.scenes[at];
      if (!next) return;
      const said = [...next.opening, next.sample, next.prompt];
      setLines(said.map((line) => toChatLine(line, nameOf, learnerName)));
      stopClips();
      pushClips(said, rateOf(speed));
    },
    [asakai, nameOf, learnerName, pushClips, stopClips, speed],
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
      setResults((prev) => {
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
         司会が **言い方を 見せてから** 自分で 段取りする（0点で 終わらせない）。 */
      const tail: Line[] = [ack];
      if (scene.arrange) tail.push(komari?.full ? scene.arrange.done : scene.arrange.missing);
      tail.push(...scene.members, ...scene.closing);
      setLines((prev) => [...prev, ...tail.map((line) => toChatLine(line, nameOf, learnerName))]);
      pushClips(tail, rateOf(speed));
      setAskedId(null);
    },
    [scene, sceneAt, asakai, panels, nameOf, learnerName, meeting.id, pushClips, speed],
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
      });
      const target = nextProbePanel(panels, step.states);

      /*
       * **作業記録を そのまま 読み上げた ぶんは 数えない**（2026-09-14）。
       *
       * 罰では なく 言い直し。司会は 教材の あたまと 同じ ことばで 言う
       *（`focus`:「作業記録を そのまま 読み上げません」）ので、学習者が
       * 知らない 決まりを ここで 新しく 作らない。聞き返しは そのまま 数えるので、
       * 2回 つづけば お手本が 出て 先へ 進む（0点で 終わらせない）。
       *
       * ## 言い直しは **聞き返しの 代わり**に 言う（2026-09-14 の R5 検収）
       * 「まとめて もう いちど」と「つぎは 進捗率を お願いします」を 並べると、
       * 1回の ターンに **次の 行動が 2つ**に なる（規律1 は 1つ）。
       * お手本を 見せる ばめん（打ち切り・その日の おわり）では、お手本 そのものが
       * いちばん 具体的な 次の 行動なので、こちらは 言わない。
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
      const opened = step.states
        .filter((one) => one.full && !wasFull.has(one.id))
        .map((one) => labelOf(one.id));

      if (!target) {
        setStates(step.states);
        setJudge({
          opened,
          shut: [],
          readLog,
          sceneOver: true,
          after: () => finishScene(step.states, probes),
        });
        return;
      }

      const shut = panels
        .filter((one) => !step.states.find((x) => x.id === one.id)?.full)
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
            opened,
            shut,
            readLog,
            sceneOver: true,
            after: () => {
              /*
               * **その日の さいごの カードでも れいを 見せる**。
               *
               * ここだけ `say(example)` を 呼んで いなかった ので、最後の 1枚で
               * 2回 つまずいた 学習者は **お手本を 一度も 見ないまま** その日が
               * 終わって いた（木曜の「お願い」、ほかの 日の「問題・確認」が
               * これに あたる。2026-09-13 の 通し検収）。
               * 0点で 終わらせない ための 仕組みが、いちばん つまずく ところで
               * 効いて いなかった。
               */
              say({ ...data.example, text: `こう 言うと 開きます。${data.example.text}` });
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
          opened,
          shut,
          readLog,
          sceneOver: false,
          after: () => {
            say({ ...data.example, text: `こう 言うと 開きます。${data.example.text}` });
            if (followup) say(followup);
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
        opened,
        shut,
        readLog,
        sceneOver: false,
        after: () => {
          /* 言い直しを たのむ ときは 聞き返さない（次の 行動は 1つ）。 */
          if (readLog) sayRedo();
          else if (followup) say(followup);
          setAskedId(target.id);
        },
      });
    },
    [scene, asakai, panels, states, attempts, probes, logLines, say, finishScene],
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
      setProbes(0);
      setAnswer("");
      setJudge(null);
      setPhase("talk");
      openScene(at);
    },
    [asakai, openScene, stopClips, voice],
  );

  const goNext = useCallback(() => goToScene(sceneAt + 1), [goToScene, sceneAt]);

  if (!asakai || !scene) return null;

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

  const dayHeading = `${DAY_NAME[scene.day]}の ${KIND_NAME[scene.kind]}`;
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
   * 帯（`MeetingSession` の「01 …」の 帯と 同じ 席）。
   * **月〜金の タブ**と **じぶんの 担当**の ボタンを ここに 集める
   *（2026-09-13 の 指定）。場面の 札と 進捗は 1行に 畳んで、
   * 会話と 話す ボタンの ための 高さを 空ける。
   */
  const steps = (
    <div className="card-island space-y-2 px-3 py-2">
      {/*
        空の 帯は **タブの 上に 敷く**。横に 並べて いた ころ、`flex-1` の 帯が
        のこりの 幅を ぜんぶ 取り、タブの となりに **空っぽの 水色の カプセル**が
        居座って いた（390px の 実機幅で 確認・2026-09-13）。
      */}
      <SkyStrip kind={scene.kind} />
      <DayTabs at={sceneAt} done={doneDays} disabled={waiting} onPick={goToScene} />
      <div className="flex items-center justify-between gap-2">
        <p className="text-navy min-w-0 flex-1 text-[12px] leading-snug font-black">
          <RubyText text={scene.title} index={index} show />
        </p>
        <button
          type="button"
          onClick={() => setDuty(true)}
          aria-label="じぶんの 担当を 見る"
          className="btn-island shrink-0 px-3 py-1.5 text-[12px] font-black"
        >
          📋 <RubyText text="じぶんの 担当" index={index} show />
        </button>
      </div>
    </div>
  );

  /*
   * 左の 報告パネル。**並びは 既存の ミーティングと そろえる**
   *（見出し → 相手の ことば → 「声で 答えましょう！」→ 速さ｜🎤｜💡）。
   * 2026-09-11 の 指定「UIをまるきり作り変えるな、既存のUIをできる限り使え」。
   */
  const reportPanel = between ? null : (
    <div className="card-island space-y-3 p-3">
      <p className="text-navy text-sm font-black">
        💬 <RubyText text={dayHeading} index={index} show />
      </p>

      {lastSaid ? (
        <div className="border-hairline bg-panel rounded-xl border px-3 py-2">
          <p className="text-ink-soft flex items-center gap-2 text-[11px] font-black">
            <RubyText text={`${lastSaid.who}さんの ことば`} index={index} show />
            {/* 作り置きの こえが ある ときだけ 出す。聞きとれなかった 人の 逃げ道。 */}
            {lastSaidAudio ? (
              <button
                type="button"
                aria-label="もう一度 聞く"
                onClick={() => clips.replay(lastSaidAudio, rateOf(speed))}
                className="btn-island px-2 py-0.5 text-xs"
              >
                🔊
              </button>
            ) : null}
          </p>
          <p className="text-ink mt-1 font-bold break-words">
            {/* 教材が 書いた 固定文なので **タップで 意味が 出る**（2026-09-11 の 指定）。 */}
            <DictionaryText text={lastSaid.text} index={index} />
          </p>
        </div>
      ) : null}

      {sceneOver ? (
        <button
          type="button"
          onClick={toGap}
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
      ) : (
        <>
          <p className="text-ink-soft text-center text-sm font-black">
            <RubyText text="声で 答えましょう！" index={index} show />
          </p>
          {/*
           * スピード｜🎤｜💡 の 並びは 既存の ミーティングと 同じ。
           * ただし 390px で 3列に すると **マイクの 字が 3行に 折れる** ので、
           * せまい ときは マイクが 1行 まるごと 使い、下に スピードと ヒントを 並べる。
           */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="order-1 w-full sm:order-2 sm:w-auto sm:flex-1">
              <SpeakButton
                status={voice.status}
                reason={voice.reason}
                talking={voice.talking}
                disabled={judge !== null || waiting}
                waitNote={
                  judge
                    ? "見かたを 読んでから 話します。"
                    : waiting
                      ? "AIが いま 見て います。"
                      : null
                }
                onConnect={() => void voice.start(LISTEN_ONLY)}
                onStartTalking={voice.startTalking}
                onStopTalking={voice.stopTalking}
              />
            </div>
            <div className="order-2 sm:order-1">
              <SpeechSpeedPicker
                value={speed}
                onChange={saveSpeechSpeed}
                tone="light"
                disabled={judge !== null}
              />
            </div>
            <button
              type="button"
              onClick={() => setHint(true)}
              className="btn-island order-3 px-3 py-2 text-sm font-black"
            >
              💡 <RubyText text="ヒント" index={index} show />
            </button>
          </div>

          {/*
           * 声が 使えない ときの 道（鍵が 無い・マイクが 無い）。**たたまない**。
           *
           * `<details>` に 閉じて いた ころ、鍵の 無い 学習者は
           * **開ける ものが ある ことに 気づかず 行き止まり**に なった。
           * 声が 本線なので マイクを 大きく 上に 置き、文字は 小さく 下に 残す。
           */}
          <div className="space-y-2">
            <label className="text-ink-soft block text-[11px] font-black" htmlFor="asakai-answer">
              <RubyText text="声が 使えない ときは、文字でも 答えられます。" index={index} show />
            </label>
            <textarea
              id="asakai-answer"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              rows={2}
              className="border-hairline w-full rounded-xl border p-2 text-sm font-bold"
            />
            {/*
              AIに 見て もらって いる あいだは **押せない ことを 字で 言う**。
              灰色に なるだけだと、押しても 何も 起きない 故障に 見える。
              鍵が 無い 端末では ここに 入らない（`waiting` は いつも false）。
            */}
            <button
              type="button"
              onClick={() => send()}
              disabled={!answer.trim() || judge !== null || waiting}
              aria-label={waiting ? "AIが 見て います" : "報告する"}
              className="btn-island w-full px-4 py-2 text-sm font-black disabled:opacity-45"
            >
              <RubyText text={waiting ? "AIが 見て います…" : "報告する"} index={index} show />
            </button>
          </div>
        </>
      )}
    </div>
  );

  /*
   * じぶんの 担当（担当・ゴール・進捗・その日の 行／メモ）。
   * **画面に 出しっぱなしに せず、ポップアップの 中身に する**（2026-09-13 の 指定）。
   */
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
        付せん（**その日の 進捗の 数字**）。メモ（夕礼）の 中にだけ 描いて いた ので、
        行（rows）で 作る 朝礼では **画面の どこにも 出て いなかった**——
        数字を 言う 設問なのに 数字が 無く、ヒントを 開かないと 答えられなかった
        （規律10「設問は ヒントを 閉じた まま 答えられる こと」・2026-09-13）。
      */}
      {scene.card.pin ? (
        <p className="rounded-md border border-[#d8c77a] bg-[#fdf6c8] px-3 py-2 text-sm font-bold">
          📌 <DictionaryText text={scene.card.pin} index={index} />
        </p>
      ) : null}

      <ProgressBoxes items={scene.card.progress} index={index} />

      {scene.card.rows?.length ? (
        <dl className="space-y-2 text-sm">
          {scene.card.rows.map((row) => (
            <div key={row.key}>
              <dt className="text-blue-deep font-black">
                <RubyText text={row.label} index={index} show />
              </dt>
              <dd className="m-0 font-bold">
                <DictionaryText text={row.text} index={index} />
                {row.count ? (
                  <CountBoxes total={row.count.total} done={row.count.done} now={row.count.now} />
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

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
        <Chat lines={lines} index={index} onReplay={(url) => clips.replay(url, rateOf(speed))} />
      }
      speak={between ? null : <CardBoard cards={cards} index={index} />}
      controls={
        phase === "done" ? (
          <WeekResult asakai={asakai} rows={results} index={index} onClose={closeResult} />
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
          label="じぶんの 担当"
          title={<RubyText text="📋 じぶんの 担当" index={index} show />}
          onClose={() => setDuty(false)}
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
        <ReportJudge
          opened={judge.opened}
          shut={judge.shut}
          readLog={judge.readLog}
          sceneOver={judge.sceneOver}
          index={index}
          onClose={closeJudge}
        />
      ) : null}
    </CallShell>
  );
}

/**
 * 報告の 見かた（モーダル）。
 *
 * **これを 閉じてから 司会と メンバーが 話す**（2026-09-11 の 指定）。
 * 前は 報告の 直後に 会話が 積まれ、しかも その 会話は 画面の 下に 流れて いた ので、
 * 学習者は **自分の 報告が どう 受け取られたかを 一度も 読まずに** 先へ 進めた。
 *
 * 中身は 数と 札だけ。ねぎらいの ことばは 置かない（規律1・2026-09-03 の 指定）。
 */
function ReportJudge({
  opened,
  shut,
  readLog,
  sceneOver,
  index,
  onClose,
}: {
  opened: readonly string[];
  shut: readonly string[];
  readLog: boolean;
  sceneOver: boolean;
  index: FuriganaIndex;
  onClose: () => void;
}) {
  return (
    <ModalShell
      label="報告の 見かた"
      title={<RubyText text="いまの 報告" index={index} show />}
      onClose={onClose}
      closeLabel={sceneOver ? "みんなの 報告を 聞く ▶" : "つづける ▶"}
    >
      {/*
        **何も 開かなかった 理由を はっきり 書く**（規律1）。
        黙って「開いた カード: ありません」だけを 出すと、学習者は
        ことばが 足りなかったのだと 思って、記録を もう一度 読み上げる。
      */}
      {readLog ? (
        <div className="border-hairline bg-panel text-coral-deep mt-3 rounded-xl border px-3 py-2 text-sm font-bold">
          <RubyText
            text={
              /*
                **次の 行動は、その場で できる ことに する**（規律1・2026-09-14 の R5 検収）。
                その日が もう 終わって いるのに「もう いちど まとめて ください」と 書くと、
                言われた ことを する 場所が どこにも 無い まま 画面が 閉じる。
              */
              sceneOver
                ? "作業記録を そのまま 読み上げて います。この ぶんは 数えて いません。つぎの 日は 大きな 作業を 2つか 3つに まとめて ください。"
                : "作業記録を そのまま 読み上げて います。この ぶんは 数えて いません。大きな 作業を 2つか 3つに まとめて、もう いちど 言って ください。"
            }
            index={index}
            show
          />
        </div>
      ) : null}

      <div className="border-hairline bg-panel mt-3 rounded-xl border px-3 py-2">
        <p className="text-leaf-deep text-[11px] font-black">
          ✓ <RubyText text="開いた カード" index={index} show />
        </p>
        <p className="mt-0.5 text-sm font-bold">
          {opened.length > 0 ? (
            <RubyText text={opened.join("・")} index={index} show />
          ) : (
            <RubyText text="ありません。" index={index} show />
          )}
        </p>
      </div>

      {shut.length > 0 ? (
        <div className="border-hairline bg-panel mt-2 rounded-xl border px-3 py-2">
          <p className="text-coral-deep text-[11px] font-black">
            ▢ <RubyText text="まだ 言って いない カード" index={index} show />
          </p>
          <p className="mt-0.5 text-sm font-bold">
            <RubyText text={shut.join("・")} index={index} show />
          </p>
        </div>
      ) : null}
    </ModalShell>
  );
}

function Tag({ text, index }: { text: string; index: FuriganaIndex }) {
  return (
    <span className="bg-navy mr-1 rounded-full px-2 py-0.5 text-[11px] font-black text-white [&_rt]:text-white">
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
  const [closed, setClosed] = useState(false);
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
    <div className="card-island space-y-3 p-4" role="status">
      <p className={`text-2xl font-black ${pass ? "text-leaf-deep" : "text-coral-deep"}`}>
        <RubyText text={pass ? "合格" : "不合格"} index={index} show />
      </p>

      <p className="text-sm font-bold">
        <RubyText text={unitName} index={index} show />{" "}
        <span className="tabular-nums">
          {units} / {unitTotal}
        </span>{" "}
        — <span className="tabular-nums">{needUnits}</span>{" "}
        <RubyText text="以上で 合格" index={index} show />
      </p>
      {needBoxes !== undefined ? (
        <p className="text-sm font-bold">
          <RubyText text={`${komariName}で 言えた こと`} index={index} show />{" "}
          <span className="tabular-nums">
            {komariBoxes} / {komariTotal}
          </span>{" "}
          — <span className="tabular-nums">{needBoxes}</span>{" "}
          <RubyText text="以上で 合格" index={index} show />
        </p>
      ) : needDays !== undefined ? (
        <p className="text-sm font-bold">
          <RubyText text={`${komariName}を 言えた 日`} index={index} show />{" "}
          <span className="tabular-nums">
            {komariDays} / {rows.length}
          </span>{" "}
          — <span className="tabular-nums">{needDays}</span>
          <RubyText text="日 以上で 合格" index={index} show />
        </p>
      ) : null}

      <table className="w-full text-left text-[13px] font-bold">
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
        <p className="text-sm font-bold">
          <RubyText text="もう いちど はじめから 話すと、数は 数え直します。" index={index} show />
        </p>
      )}

      {/* **これを 押すまで「おわった」を 書かない**（上のコメント）。 */}
      <button
        type="button"
        disabled={closed}
        onClick={() => {
          setClosed(true);
          onClose();
        }}
        aria-label="けっかを 読みました"
        className="btn-island btn-game w-full px-6 py-3 disabled:opacity-45"
      >
        <RubyText text={closed ? "読みました" : "けっかを 読みました ▶"} index={index} show />
      </button>
    </div>
  );
}

function Chat({
  lines,
  index,
  onReplay,
}: {
  lines: readonly ChatLine[];
  index: FuriganaIndex;
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
    <div className="card-island p-3">
      <p className="text-navy mb-2 text-sm font-black">💬 テキストチャット</p>
      <div ref={box} className="h-[42vh] overflow-y-auto pr-1 text-sm sm:h-[58vh]">
        {lines.map((line, at) => {
          const url = line.audio;
          return (
            <p key={at} className={`mb-2 font-bold ${line.self ? "text-blue-deep" : ""}`}>
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
      </div>
    </div>
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
