"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import type { Scenario } from "@/content/schema";
import { assetUrl } from "@/lib/asset-url";
import { FeedbackMessage } from "@/components/feedback-message";
import type { FeedbackKey } from "@/lib/feedback";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex, type FuriganaEntry } from "@/lib/text/furigana";
import { recordContentProgress } from "@/lib/progress/store";
import { bufferTalkTurn, flushTalkTurns, newTalkSessionId } from "@/lib/records/talk-log";
import { CaptionBar, CallShell } from "@/components/call-shell";
import { LiveReason } from "./live-reason";
import { MemoStep } from "./memo-step";
import { MissionStep } from "./mission-step";
import { ResearchStep } from "./research-step";
import { TalkResult } from "./talk-result";
import {
  avatarSrc,
  CLIENT_ID,
  groupReqsByKind,
  judgeAddressed,
  ownerOf,
  PEOPLE_FURIGANA,
  personaWithContext,
  REQ_KIND_LABEL,
  talkPeople,
  type TalkLine,
} from "./people";
import { useLiveSession } from "./use-live-session";

/**
 * たいわ（Live対話）— 同じ Zoom風シェルの中で、お客さま役のAIと日本語で話す。
 *
 * リスニング（聞く教材）と枠を共有するが、学習者がすることは正反対（聞く／話す）。
 * 呼び名も行き先（/talk）も分けてある。混ぜると、学習者は聞くつもりで
 * マイクに向かうことになる。
 *
 * 要件ボードは最初「？？？」で伏せてあり、聞き出せた項目だけが開く。
 * 判定は3層（AI → ローカルのキーワード救済 → 手動）で、AIの誤判定で
 * 正しい質問が却下されないようにする（設計01 §3）。
 *
 * ## 教材が 事前調査を 持つと、5段の 道に なる
 * `scenario.research` が あるときだけ「ミッション → しらべる → しつもんメモ →
 * インタビュー → けっか」の 5段で 進む（旧アプリ youken_teigi/hearing の 5話が この形）。
 * 持たない 教材——山本社長に 質問する（youken_aoba）・朝会の 報告——は **これまでどおり**
 * 会話の 画面だけを 出す。段を すべての 教材に 付けると、調べる 材料が 無い 教材が
 * 空の 調査画面を 抱えることに なる（2026-09-06 に データごと 外した ばかりの ところ）。
 *
 * ## 相手が 3人 いる 教材（アプリの 要件定義・2026-09-08）
 * `scenario.interview.others` が あると、Zoom の タイルに 3人 並び、学習者は 🎤 で
 * **だれに 話しかけるか**を 選んで 聞く。Live は 1本の つなぎに 1人の 声しか 持てない ので、
 * 相手を かえる＝その人の persona と 声で つなぎ直す（これまでの 会話を 添える —
 * `personaWithContext`）。会話の 記録（`history`）は つなぎ直しても 消さない。
 * 札は **担当の 人に 聞いた ときだけ** 開く（`judgeAddressed`）。ちがう 人に 聞くと
 * 「◯◯が くわしいです」と 返って、話しかける 相手を かえる ことに なる——
 * 「それぞれの 役割を どう 考えるか」が この 教材の 学びそのもの。
 * 相手が 1人の 教材は、担当が 全部 その人なので これまでと 同じ 動きに なる。
 *
 * ## 声も 文字も、同じ judge() を通る
 * 以前は判定がテキスト送信のときにしか走らず、**声で話した学習者は何をしても
 * ボードが1つも開かなかった**。いまは聞き取り（相手が話しはじめた合図で1つに
 * 束ねた発話）も同じ入口へ流す。判定の道を2本持つと、必ず片方が腐る。
 */

/**
 * キーワードが1語だけ当たった（＝あと ひとこと）ときの文言。
 * 「番ちがい」ではなく「おしい」を返す——1語 当てた 学習者を 迷子に しない。
 */
const CLOSE_NOTE: FeedbackKey = "talk.close";

/**
 * 訪問の 第一声（お客さまインタビューの 5話）。
 *
 * 旧アプリ（hearing.js の `openPreInterviewModal`）が ドアを ノックする 前に
 * 「まずは あいさつ」として 出して いた 文を **逐語で** 移した もの。5話 共通で ある。
 *
 * 教材から 引く（`buildOpeningLine`）道を 使わないのは、この 5話には
 * **第一声に 使える 引用が 無い**ため。教訓の 中の かぎ括弧を 拾うと
 * 「しつれいします。ところで、〜は どうですか？。」（穴あきの 記号ごと）や
 * 「しつれいします。会社で 調べて、ご連絡します。」（帰りぎわの 文が 第一声に）に なる。
 * 白紙恐怖を 越えさせる ための 型文が、押した 学習者を 意味不明な 一言に
 * 着地させて いた（2026-09-07 の R4 検収）。
 */
const VISIT_OPENING =
  "はじめまして。ネクストメイクの エンジニアです。今日は よろしく おねがいします。";

/** 上の 文に 出る 漢字の 読み。画面が 自分で 出す 字なので、教材の 辞書には 載らない。 */
const VISIT_OPENING_FURIGANA: FuriganaEntry[] = [["今日", "きょう"]];

/**
 * 事前調査を 持って いても **5段に 乗せない** 教材。
 *
 * 朝会の 報告（`talk-asakai-report`）が それ。`research` を 持って いるが、
 * 5段の 画面は お客さま訪問の ことばで できて いる:
 *   - けっかの 見出しが「要件定義書」——この 教材の `doc` は「相談メモ」
 *   - しつもんメモの ボタンが「〜さんに 会いに 行く」——朝会は 同席して いる 相手
 *   - 模擬ページに ふりがなの 無い 漢字が 20字 残って いる（規律2）。
 *     いままで 描かれて いなかったので 誰も 気づかなかった
 * この3つを 直すのは お客さまインタビューの 移植の 外なので、直るまでは
 * これまでどおり 会話の 画面 1枚で 出す（2026-09-07 のコード検収）。
 */
const NOT_FIVE_STEP: ReadonlySet<string> = new Set(["talk-asakai-report"]);

/** 5段の どこに いるか。事前調査を 持たない 教材は ずっと "interview"。 */
type Phase = "mission" | "research" | "memo" | "interview" | "result";

/** 帯に 出す 段の 名前（旧アプリ hearing.js の STEPS と 同じ 並び・同じ 呼び名）。 */
const STEPS: readonly { readonly id: Phase; readonly label: string }[] = [
  { id: "mission", label: "ミッション" },
  { id: "research", label: "しらべる" },
  { id: "memo", label: "しつもんメモ" },
  { id: "interview", label: "インタビュー" },
  { id: "result", label: "けっか" },
];

/**
 * いま どこに いるかの 帯。
 *
 * 5段は 長い。**あと 何回 押せば 相手に 会えるのか**が 見えないと、途中で
 * 「この 教材は 終わらない」と 感じる（設計01 P8: 先を 見せる）。
 */
function StepBar({ current }: { current: Phase }) {
  const at = STEPS.findIndex((step) => step.id === current);
  return (
    <ol className="mb-4 flex flex-wrap items-center gap-1.5" aria-label="いまの ところ">
      {STEPS.map((step, i) => {
        const done = i < at;
        const now = i === at;
        return (
          <li
            key={step.id}
            aria-current={now ? "step" : undefined}
            className={`rounded-full px-3 py-1 text-xs font-extrabold ${
              now
                ? "bg-navy text-white"
                : done
                  ? "bg-sky-soft text-navy"
                  : "bg-panel text-ink-faint border-hairline border-2"
            }`}
          >
            {done ? "✓" : i + 1} {step.label}
          </li>
        );
      })}
    </ol>
  );
}

export function TalkSession({
  scenario,
  /**
   * ステージの枠（ContentFrame）の中に置くとき。自前の外枠と戻りリンクを出さない
   * ——戻り先は枠が持つ（教材ごとに戻り先が違うと、学習者は1本おわるたびに
   * 別の一覧へ放り出される）。
   */
  embedded = false,
}: {
  scenario: Scenario;
  embedded?: boolean;
}) {
  const furigana = useMemo(() => buildFuriganaIndex(scenario.furigana ?? []), [scenario.furigana]);
  const live = useLiveSession();
  /** 事前調査を 持つ 教材だけ 5段で 進む（無ければ 会話の 画面 1枚のまま）。 */
  const research = NOT_FIVE_STEP.has(scenario.id) ? undefined : scenario.research;
  const [phase, setPhase] = useState<Phase>(research ? "mission" : "interview");
  /**
   * しつもんメモ（3つ）。会話の 画面まで 持って いく——手元に 何も 無い まま
   * 相手の 前に 立たせない。端末の 中だけに 置く（台帳へは 送らない）。
   */
  const [memo, setMemo] = useState<readonly string[]>(["", "", ""]);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  // 画面に出す文言は型付きキーだけ（自由文字列を書けなくする — 設計03 §1.3-1）
  const [note, setNote] = useState<FeedbackKey | null>(null);
  const [draft, setDraft] = useState("");
  /**
   * いま出しているヒントの項目。
   *
   * 以前は「まだ聞けていない項目の**先頭**」を開きっぱなしで出していた。
   * それだと、上から順に読み上げるだけで全部そろってしまい、
   * 「自分で聞き出す」練習にならない。押したときに、まだ聞けていない中から
   * ひとつだけ出す。
   */
  const [hintId, setHintId] = useState<string | null>(null);
  /** 担当ちがいで 札が 開かなかった とき、だれが くわしいか（feedback は 名前を 持てない）。 */
  const [wrongOwner, setWrongOwner] = useState<string | null>(null);
  /** 「はじめの 一言」カードを閉じたか。 */
  const [openerClosed, setOpenerClosed] = useState(false);
  /**
   * この回、自分から 一度でも 話したか（声・文字の どちらでも）。
   *
   * 字幕（`live.transcript`）を 数えない。`disconnect` は 字幕を 消さない ので
   *——止めた あとも 読み返せる ように、わざと そう して ある——「もう一度」で
   * 戻った 学習者は **前の回の 発話を 持ったまま** 会話の 画面に 立つ。
   * それを「話した」と 数えると、けっかへの 出口が 最初から 開き、
   * いちばん 助けが 要る 2回目に「はじめの 一言」が 出なく なる（2026-09-07 のコード検収）。
   */
  const [spoke, setSpoke] = useState(false);
  /**
   * すでに開いた項目。判定はAIを待つあいだに進むので、**待つ前の写しではなく
   * ここを見る**（待っているあいだに開いた項目を、もう一度開けにいかないため）。
   */
  const openRef = useRef<ReadonlySet<string>>(new Set());
  /** 判定ずみの発話ID（同じ発話を二度見ない）。 */
  const judgedRef = useRef(0);
  /**
   * 台帳（`talk_turn_logs`）へ ためる ための 3つ。
   *
   * 2026-09-04 まで、この 教材だけ 会話が **1行も 残って いなかった**。ミーティングも
   * 松井社長も 残るのに、お客さまと 話す たいわ だけ その場で 消えて いた。
   *
   * - `sessionIdRef`  … 1回の たいわ を まとめる 鍵（つないだ ときに 1つ）
   * - `bufferedRef`   … どこまで ためたか（字幕は 増える たびに 全部 通るので、印が 要る）
   * - `openedHintRef` … その 発話で **開いた 項目**。判定（`judge`）しか 知らないので、
   *                     ためる 側へ 手渡しする
   */
  const sessionIdRef = useRef("");
  const bufferedRef = useRef(0);
  const openedHintRef = useRef<{ text: string; reqId: string } | null>(null);

  /** 会議に いる 相手（先頭は 主催者）。1人の 教材でも 同じ 形で 持つ。 */
  const people = useMemo(() => talkPeople(scenario), [scenario]);
  const multi = people.length > 1;
  /** いま 🎤 を 向けて いる 人。 */
  const [targetId, setTargetId] = useState<string>(CLIENT_ID);
  const target = people.find((p) => p.id === targetId) ?? people[0]!;
  /**
   * 会話の 記録（字幕）。`live.transcript` は つなぐ たびに 空に 戻る ので、
   * 相手を 切りかえても 残る ものを ここで 持つ。だれの 発言かは id で 持つ
   *（`from`）——3人 いると「相手」だけでは 読み返せない。
   *
   * 2つに 分けて 持つ:
   *   - `past`    … 確定した 行（前の つなぎの 字幕・台本の 返事）。state
   *   - いまの つなぎの 字幕 … `live.transcript` から **描くときに 作る**（`folded` より 後ろ）
   * effect の 中で setState を しないため（描画が 連鎖する）。つなぎ直す・台本を 出す
   * 直前に、いまの 字幕を `past` へ たたむ（`foldCurrent`）。
   */
  const [past, setPast] = useState<readonly TalkLine[]>([]);
  /** `live.transcript` の うち、もう `past` へ たたんだ 行数。 */
  const [folded, setFolded] = useState(0);
  /** いま つないで いる 相手（返事の 名乗り）。 */
  const [connectedId, setConnectedId] = useState<string>(CLIENT_ID);
  const connectedRef = useRef<string>(CLIENT_ID);
  const current = useMemo<readonly TalkLine[]>(
    () =>
      live.transcript.slice(folded).map((turn) => ({
        from: turn.from === "me" ? "me" : connectedId,
        text: turn.text,
        mode: turn.mode,
      })),
    [live.transcript, folded, connectedId],
  );
  const history = useMemo<readonly TalkLine[]>(() => [...past, ...current], [past, current]);
  /** 画面の ことばの 読み（教材の 辞書と 混ぜない）。 */
  const uiFurigana = useMemo(() => buildFuriganaIndex(PEOPLE_FURIGANA), []);

  const participants = useMemo(
    () =>
      people.map((person) => ({
        id: person.id,
        name: person.name,
        role: person.role,
        accent: person.accent,
      })),
    [people],
  );

  /**
   * 発話を1つ判定し、開いた項目があればボードをめくる。
   * **声でも 文字でも ここを通る**（判定の道を分けない）。
   */
  const judge = useCallback(
    (utterance: string) => {
      const reqs = scenario.interview.reqs;
      if (utterance.trim()) setSpoke(true);
      setWrongOwner(null);
      const closed = reqs.filter((req) => !openRef.current.has(req.id));
      if (closed.length === 0 || !utterance.trim()) return;

      /*
       * 判定は **端末の 中だけ**で 済ませる（2026-08-20・絶対ルール）。
       *
       * ここは `gemini-2.5-flash` の `generateContent` に 聞いて いた。
       * それは Live とは **別勘定の 無料枠**で、学習者が 何度か 話しただけで
       * 使い切る（「すぐ limit に なる」——同日 クライアント指定）。
       * 落ちても 会話が 続く ように 元から 二層に して あった ので、
       * 層2（ことばの 照合）だけで 動かす。
       * 意味の 見かたを 戻す ときは、**Live の つなぎの 中**で もらう
       *（ミーティングの `judge-api.ts` と 同じ やり方）。
       */
      const outcome = judgeAddressed({
        utterance,
        reqs,
        openIds: openRef.current,
        targetId: target.id,
      });
      /*
       * Live が つながって いない とき（鍵ゼロの 教室・デモ）は、相手の 返事を
       * **教材の 台本**で 出す。開いた 札の 中身（secret）は 相手が 答える 文そのものなので、
       * それを その人の 字幕として 置く。以前は 何を 聞いても 相手が 一言も 返さず、
       * 「聞き出せたね！」だけが 出て いた——会議に 見えない。
       */
      const scripted = live.status !== "live" && live.status !== "connecting";
      if (scripted && outcome.kind !== "opened") {
        // 相手の 返事が 無くても、自分が 聞いた ことは 記録に 残す（送ったのに 消えると 不安になる）
        setPast((prev) => [...prev, ...current, { from: "me", text: utterance, mode: "text" }]);
        setFolded(live.transcript.length);
      }
      if (outcome.kind === "opened") {
        const opened = new Set([...openRef.current, outcome.reqId]);
        openRef.current = opened;
        setOpen(opened);
        // どの 発話が どの 項目を 開いたかは ここでしか 分からない。ためる 側へ 渡す。
        openedHintRef.current = { text: utterance, reqId: outcome.reqId };
        setNote("talk.itemFound");
        if (scripted) {
          const req = reqs.find((r) => r.id === outcome.reqId);
          if (req) {
            // いまの 字幕を たたんでから 足す（順番が 前後しない ように）
            setPast((prev) => [
              ...prev,
              ...current,
              { from: "me", text: utterance, mode: "text" },
              { from: ownerOf(req), text: req.secret, mode: "text", scripted: true },
            ]);
            setFolded(live.transcript.length);
          }
        }
        return;
      }
      if (outcome.kind === "wrongPerson") {
        // 話題は 合って いる。でも 聞いた 相手は 担当では ない——札は 開かず、担当を 教える
        setWrongOwner(outcome.ownerId);
        setNote("talk.askOwner");
        return;
      }
      // 1語だけ当たった＝話題は合っている。「ずれている」ではなく「あと ひとこと」へ
      setNote(outcome.kind === "close" ? CLOSE_NOTE : "talk.offTopic");
    },
    [scenario, target.id, live.status, live.transcript.length, current],
  );

  /*
   * 声で話したぶんを見る。相手が話しはじめた合図で1つに束ねてから届くので、
   * 「わたしは」の途中で判定されることはない（use-live-session の lastUtterance）。
   */
  useEffect(() => {
    const heard = live.lastUtterance;
    if (!heard || heard.id === judgedRef.current) return;
    judgedRef.current = heard.id;
    judge(heard.text);
  }, [live.lastUtterance, judge]);

  /*
   * 字幕を **端末に ためる**（通信しない）。送るのは 退出の ときに 1回
   *（`@/lib/records/talk-log` — `flushMeetingTurns` と 同じ 「ためて、おわりに 1回」）。
   *
   * 声の 判定より **あと**に 置く。同じ 描画では 上から 順に 走るので、
   * `judge` が `openedHintRef` を 置いた あとで ここが 拾える。
   */
  useEffect(() => {
    const turns = live.transcript;
    if (turns.length === 0) {
      /*
       * つなぎ直すと 字幕は 空に 戻る（`connect`）。数え直す 印だけ 戻す。
       * 回の 鍵（sessionId）は **戻さない**——相手を 切りかえる たびに つなぎ直す ので、
       * ここで 切ると 1回の 会議が 3回ぶんに 割れて 台帳に 残る。切るのは「もう一度」のとき。
       */
      bufferedRef.current = 0;
      return;
    }
    if (sessionIdRef.current === "") sessionIdRef.current = newTalkSessionId();
    for (let index = bufferedRef.current; index < turns.length; index += 1) {
      const turn = turns[index];
      if (!turn) continue;
      const learner = turn.from === "me";
      let openedReqId = "";
      if (learner && openedHintRef.current?.text === turn.text) {
        openedReqId = openedHintRef.current.reqId;
        openedHintRef.current = null;
      }
      bufferTalkTurn({
        talkId: scenario.id,
        sessionId: sessionIdRef.current,
        turnIndex: index,
        speaker: learner ? "learner" : "partner",
        mode: turn.mode,
        body: turn.text,
        openedReqId,
        // その 時点で 何個 開いて いたか。あとから 項目を 増やしても
        // 「その日 何個中 何個 だったか」が 読める ように 一緒に 凍らせる。
        openedCount: openRef.current.size,
        reqTotal: scenario.interview.reqs.length,
      });
    }
    bufferedRef.current = turns.length;
  }, [live.transcript, scenario.id, scenario.interview.reqs.length]);

  // ステージの進み具合に反映する（設計07 §3）。退出まで行ったら「おわった」。
  useEffect(() => {
    recordContentProgress(scenario.id, { status: "started" });
  }, [scenario.id]);

  /*
   * 画面を 出る ときにも 流す。**退出ボタンを 押さずに 戻る 人が いる**ので、
   * ここが 無いと その 回の 会話が 次に 開くまで 台帳に 出ない
   *（消えはしない——端末に 残って いて、次に 開いた ときに 流れる）。
   */
  useEffect(() => {
    return () => {
      void flushTalkTurns(scenario.id);
    };
  }, [scenario.id]);

  const handleLeft = useCallback(() => {
    live.disconnect();
    /*
     * 5段の 教材は、**1つも 聞き出せて いない 回を「おわった」に しない**。
     * 入室して すぐ 退室する だけで 次の話が 開くと、5話の 階段を 一言も 話さずに
     * 上がりきれる（2026-09-07 の R4・コード検収）。「とちゅう」で 残して おけば
     * 学習者は もう一度 同じ話に 戻れるし、けっかの 画面は そのまま 見られる。
     * 事前調査を 持たない 教材（山本社長・朝会の 報告）は これまでどおり。
     */
    const earned = !research || openRef.current.size > 0;
    recordContentProgress(scenario.id, { status: earned ? "completed" : "started" });
    void flushTalkTurns(scenario.id);
    // 5段の 教材は、退出したら そのまま けっか（要件定義書）へ。会話を おえた 学習者を
    // 何も 出さずに 一覧へ 返すと、聞き出した ことが どこにも 残らない。
    if (research) setPhase("result");
  }, [live, scenario.id, research]);

  /** もう一度 やる。開いた 項目・字幕・メモを 元に 戻して ミッションから。 */
  const handleRetry = useCallback(() => {
    live.disconnect();
    openRef.current = new Set();
    judgedRef.current = 0;
    bufferedRef.current = 0;
    sessionIdRef.current = "";
    openedHintRef.current = null;
    setOpen(new Set());
    setNote(null);
    setHintId(null);
    setOpenerClosed(false);
    setSpoke(false);
    setWrongOwner(null);
    setPast([]);
    setFolded(0);
    setTargetId(CLIENT_ID);
    setConnectedId(CLIENT_ID);
    connectedRef.current = CLIENT_ID;
    setMemo(["", "", ""]);
    setPhase("mission");
  }, [live]);

  /**
   * つなぐ（いま 🎤 を 向けて いる 人の persona と 声で）。
   * 相手を かえて つなぎ直す ときは、これまでの 会話を 添える（`personaWithContext`）。
   */
  const connectTo = useCallback(
    (personId: string) => {
      const person = people.find((p) => p.id === personId) ?? people[0]!;
      // いまの 字幕を たたむ（`connect` が transcript を 空に 戻す ので、その 前に）
      setPast((prev) => [...prev, ...current]);
      setFolded(0);
      connectedRef.current = person.id;
      setConnectedId(person.id);
      void live.connect(personaWithContext(person, history, people), person.voice);
    },
    [live, people, history, current],
  );

  /**
   * 🎤 を 別の 人へ 向ける。つないで いる 最中なら、その人で つなぎ直す
   *（Live は 1本に 1人の 声。切りかえは つなぎ直しでしか できない）。
   */
  const switchTo = useCallback(
    (personId: string) => {
      if (personId === targetId) return;
      setTargetId(personId);
      setWrongOwner(null);
      setHintId(null);
      if (live.status === "live" || live.status === "connecting") {
        live.disconnect();
        connectTo(personId);
      }
    },
    [targetId, live, connectTo],
  );

  /**
   * 絵が 読めなかった 人（まだ 描いて いない 顔）。壊れた 画像の 印を 出さず、
   * 頭文字の 丸に 落とす——絵の 用意が 遅れただけで 会議に 穴が 空いた ように 見せない。
   */
  const [brokenFaces, setBrokenFaces] = useState<ReadonlySet<string>>(new Set());
  /** 顔の 絵（`/img/...` の ときだけ）。タイルを 押すと その人に 🎤 が 向く。 */
  const faces = useMemo(() => {
    const map: Record<string, React.ReactNode> = {};
    for (const person of people) {
      const src = brokenFaces.has(person.id) ? null : avatarSrc(person);
      const chosen = multi && person.id === targetId;
      if (!src && !multi) continue;
      map[person.id] = (
        <button
          type="button"
          onClick={() => switchTo(person.id)}
          aria-pressed={chosen}
          aria-label={`${person.name}に 話しかける`}
          className="absolute inset-0 h-full w-full text-left"
          style={{ outline: chosen ? "3px solid #ffc93c" : "none", outlineOffset: "-3px" }}
        >
          {src ? (
            <Image
              src={assetUrl(src) ?? src}
              alt=""
              fill
              unoptimized
              sizes="(max-width: 640px) 50vw, 33vw"
              className="object-cover"
              onError={() => setBrokenFaces((prev) => new Set([...prev, person.id]))}
            />
          ) : (
            <span
              className="absolute inset-0 grid place-items-center text-white"
              style={{ background: "#16324a" }}
            >
              {/* 絵が まだ 無い 人は 名前を ルビつきで（頭文字 1字だと 読めない 漢字が 裸で 出る — 規律2） */}
              <span
                className="rounded-full px-4 py-2 text-base font-extrabold"
                style={{ background: "var(--color-sky)" }}
              >
                <RubyText text={person.name} index={furigana} show />
              </span>
            </span>
          )}
          {chosen ? (
            <span className="absolute top-1.5 right-2 rounded-full bg-[#ffc93c] px-2 py-0.5 text-[11px] font-black text-[#3b2a00]">
              🎤 いま この
              <ruby>
                人<rt>ひと</rt>
              </ruby>
            </span>
          ) : null}
        </button>
      );
    }
    return map;
  }, [people, multi, targetId, switchTo, brokenFaces, furigana]);

  const askable = scenario.interview.reqs.filter((r) => !open.has(r.id));
  // 聞き出せた項目のヒントは引っこめる（もう要らないものが残っていると、
  // 「まだ聞けていない」と勘違いする）
  const hint = askable.find((req) => req.id === hintId) ?? null;

  /**
   * あいさつの型文。5話（事前調査を 持つ 教材）は 旧アプリと 同じ 固定の 第一声、
   * それ以外は これまでどおり 教材の 言い回しから 借りる。無ければカードは goal と tip だけ。
   */
  const openingLine = useMemo(
    () => (research && !multi ? VISIT_OPENING : buildOpeningLine(scenario)),
    [research, multi, scenario],
  );
  /** 第一声の 読み。教材の 辞書に 画面の ことばの 読みを 混ぜない（先生が 消せて しまう）。 */
  const openingFurigana = useMemo(
    () => buildFuriganaIndex([...VISIT_OPENING_FURIGANA, ...(scenario.furigana ?? [])]),
    [scenario.furigana],
  );
  /**
   * 「はじめの 一言」を出すか。つながった直後で、まだ一度も話していないとき。
   * 何を言えばよいか分からないまま画面と向き合う時間を作らないため。
   */
  const showOpener = live.status === "live" && !openerClosed && !spoke;

  const callView = (
    <CallShell
      title={scenario.title}
      focus={scenario.mission.goal}
      participants={participants}
      activeSpeaker={live.status === "live" ? target.id : null}
      faces={faces}
      furigana={scenario.furigana}
      purpose="speak"
      onLeft={handleLeft}
      speak={
        multi ? (
          <div
            role="radiogroup"
            aria-label="だれに 話しかけるか"
            className="flex flex-wrap items-center gap-2"
          >
            <span className="text-xs font-extrabold text-white/70">
              🎤 <RubyText text="だれに 話しかける？" index={uiFurigana} show />
            </span>
            {people.map((person) => {
              const chosen = person.id === target.id;
              return (
                <button
                  key={person.id}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  onClick={() => switchTo(person.id)}
                  className="rounded-full px-3 py-1.5 text-xs font-extrabold"
                  style={{
                    background: chosen ? "#ffc93c" : "rgba(255,255,255,0.12)",
                    color: chosen ? "#3b2a00" : "#fff",
                  }}
                >
                  {chosen ? "🎤 " : ""}
                  <RubyText text={person.name} index={furigana} show />
                  <span className="ml-1 opacity-70">
                    <RubyText text={person.role} index={furigana} show />
                  </span>
                </button>
              );
            })}
          </div>
        ) : undefined
      }
      controls={
        <div className="card-island flex flex-wrap items-center gap-2 p-3">
          {live.status === "idle" && (
            <button
              type="button"
              // 声は人物カードで決めたもの（まんが・ミーティングと同じ人の声にする）
              onClick={() => connectTo(target.id)}
              className="btn-island btn-game px-6 py-2.5 text-sm"
            >
              🎙️{" "}
              <ruby>
                話<rt>はな</rt>
              </ruby>
              しはじめる
            </button>
          )}
          {live.status === "connecting" && (
            <span className="text-ink-soft text-sm font-extrabold">つないでいます…</span>
          )}
          {live.status === "live" && (
            <>
              <span className="bg-leaf/15 text-leaf-deep rounded-full px-3 py-1 text-xs font-extrabold">
                ● つながっています
              </span>
              {/*
                  マイクを 断られても つないだまま 続ける（劣化運転）。
                  ここで 何も 言わないと、声が 届いていない ことに 気づけない。
                */}
              {!live.voiceOn && (
                <span className="text-ink-soft text-xs font-extrabold">
                  マイクは つかえません。下に 書いて 送れば、そのまま すすめます
                </span>
              )}
              <button
                type="button"
                onClick={live.disconnect}
                className="btn-island btn-game px-4 py-2 text-xs"
                style={
                  { "--btn-face": "#ffffff", "--btn-shadow": "#cfe6f3" } as React.CSSProperties
                }
              >
                <span className="text-ink">いったん とめる</span>
              </button>
            </>
          )}
          {live.status === "error" && (
            <span className="text-coral-deep text-sm font-extrabold">
              つながりませんでした。下に りゆうが 出ています
            </span>
          )}
        </div>
      }
    >
      {/*
        つながらなかった りゆう。以前は これを 出す ときに **会話の 中身ごと
        差し替えて** いた——つまり 鍵が 無い 環境で「話しはじめる」を 押すと、
        文字で 送る 欄まで 画面から 消えて、退室 以外に 道が 無くなった
        （2026-09-07 の 通しプレイ検収）。判定は もともと 端末の 中だけで 動くので、
        **声が つながらなくても 文字で 最後まで 進める**。りゆうは 上に 添えるだけに する。
      */}
      {(live.status === "notReady" || live.status === "error") && (
        <LiveReason reason={live.reason} />
      )}
      <>
        {/*
              はじめの 一言。つながった直後の「何を 言えば いいか わからない」を
              いちばん 短い 道で 越えさせる（設計01 P8: 次の行動を 見せる）。
              文は 教材データから 借りる——ここで 新しい 日本語を 書くと、その漢字の
              読みが 読み辞書に 無く、学習者が そこで 止まる（規律2）。
            */}
        {showOpener && (
          <section className="card-island p-4" aria-label="はじめの 一言">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-ink font-extrabold">🌱 はじめの 一言</h3>
              <button
                type="button"
                onClick={() => setOpenerClosed(true)}
                aria-label="はじめの 一言を とじる"
                className="text-ink-soft hover:text-ink shrink-0 px-2 text-sm font-black"
              >
                ✕
              </button>
            </div>
            <p className="text-ink-soft mt-1 text-sm font-bold">
              🎯 <RubyText text={scenario.mission.goal} index={furigana} />
            </p>
            <p className="text-ink-soft mt-1 text-sm font-bold">
              💡 <RubyText text={target.tip} index={furigana} />
            </p>
            {openingLine && (
              <button
                type="button"
                /*
                 * あいさつは「聞き出す こと」では ないので、ボードは 動かさない
                 *（判定に かけると、あいさつした だけで ヒントが 出て とまどう）。
                 */
                onClick={() => {
                  live.send(openingLine);
                  setOpenerClosed(true);
                }}
                className="border-hairline bg-panel-tint text-ink mt-3 rounded-full border-2 px-4 py-2 text-sm font-extrabold"
              >
                <RubyText text={openingLine} index={openingFurigana} />
                <span className="text-sky ml-2">▶ これを 送る</span>
              </button>
            )}
          </section>
        )}

        {/*
            文字起こしは必ず見せる（AIの誤判定を目で確かめられるように）。
            ただし つないで いない あいだは 出さない——「もう一度」で 戻った 直後に
            前の回の 4行が 残って いると、まだ 話して いないのに 話した ように 見える。
          */}
        <section className="flex flex-col gap-2" aria-label="会話の 記録">
          {(live.status === "idle" && !spoke ? [] : history.slice(-4)).map((turn, i) => {
            const who = people.find((p) => p.id === turn.from);
            return (
              <CaptionBar
                key={`${history.length}-${i}`}
                speaker={turn.from === "me" ? "あなた" : (who?.name ?? scenario.client.name)}
                text={
                  // 台本の 返事は 教材の 文なので、読み辞書で ふりがなを 付ける（規律2）
                  turn.scripted ? <RubyText text={turn.text} index={furigana} /> : turn.text
                }
              />
            );
          })}
        </section>

        {/* 文字でも聞ける（音声が使えない環境でも学習を止めない） */}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            live.send(draft);
            void judge(draft);
            setDraft("");
          }}
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="しつもんを 書いて 送る"
            aria-label="しつもんを 入力する"
            className="border-hairline bg-panel text-ink w-full rounded-[var(--radius-button)] border-2 px-4 py-2.5 font-bold"
          />
          <button type="submit" className="btn-island btn-game shrink-0 px-6 py-2.5 text-sm">
            きく
          </button>
        </form>

        {note && <FeedbackMessage messageKey={note} />}
        {note === "talk.askOwner" && wrongOwner && (
          <p className="bg-panel-tint text-ink rounded-2xl px-4 py-2 text-sm font-bold">
            👉{" "}
            <RubyText text={people.find((p) => p.id === wrongOwner)?.name ?? ""} index={furigana} />
            が くわしいよ。
          </p>
        )}
      </>

      {/* 要件ボード（？？？フリップ） */}
      <section className="card-island p-5">
        <h3 className="text-ink font-extrabold">
          📋{" "}
          <ruby>
            聞<rt>き</rt>
          </ruby>
          き
          <ruby>
            出<rt>だ</rt>
          </ruby>
          すこと（{open.size} / {scenario.interview.reqs.length}）
        </h3>
        {/*
          札は **要件の 種類ごとの 段**に 分けて 出す（こまって いる こと → 機能要件 →
          非機能要件 → 予算・納期）。聞き出した ことを どの 箱に 入れるかが 要件定義の
          整理そのもの。種類の 無い 教材（1人の お客さま）は 1つの 段に 並ぶ。
        */}
        {groupReqsByKind(scenario.interview.reqs).map((group) => (
          <div key={group.kind ?? "all"} className="mt-3">
            {group.kind && (
              <h4 className="text-navy text-xs font-extrabold">
                <RubyText text={REQ_KIND_LABEL[group.kind]} index={uiFurigana} />
              </h4>
            )}
            <ul className="mt-1.5 grid gap-2 sm:grid-cols-2">
              {group.reqs.map((req) => {
                const isOpen = open.has(req.id);
                const owner = people.find((p) => p.id === ownerOf(req));
                return (
                  <motion.li
                    key={req.id}
                    layout
                    className="border-hairline rounded-[var(--radius-card)] border-2 px-3 py-2"
                    style={{
                      background: isOpen ? "var(--color-sky-soft)" : "var(--color-panel)",
                    }}
                  >
                    <p className="text-ink text-sm font-extrabold">
                      <span className="mr-1">{req.icon}</span>
                      <RubyText text={req.label} index={furigana} />
                    </p>
                    <p className="text-ink-soft mt-0.5 text-sm font-bold">
                      {isOpen ? <RubyText text={req.secret} index={furigana} /> : "？？？"}
                    </p>
                    {/* だれから 聞き出したか。開いて はじめて 見える（開く 前は だれに 聞くかを 考える） */}
                    {multi && isOpen && owner && (
                      <p className="text-navy mt-1 text-xs font-extrabold">
                        👤 <RubyText text={owner.name} index={furigana} />
                      </p>
                    )}
                  </motion.li>
                );
              })}
            </ul>
          </div>
        ))}

        {askable.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => {
                // まだ聞けていないものから ひとつ。同じものが続かないよう、
                // いま出しているものは候補から外す。
                const pool = askable.filter((req) => req.id !== hintId);
                const from = pool.length > 0 ? pool : askable;
                setHintId(from[Math.floor(Math.random() * from.length)]!.id);
              }}
              className="btn-game px-4 py-2 text-sm [--btn-face:#ffc93c] [--btn-shadow:#f0a819]"
            >
              💡 ヒントを 1つ もらう（のこり {askable.length}）
            </button>
            {hint && (
              <p className="bg-panel-tint text-ink mt-2 rounded-2xl px-4 py-2 text-sm font-bold">
                <span className="mr-1">{hint.icon}</span>
                <RubyText text={hint.hint} index={furigana} />
              </p>
            )}
          </div>
        )}
      </section>

      {/*
        自分で 書いた しつもんメモ。**会話の 最中に 見える ところ**に 置く——
        旧アプリは メモの 画面を 出た 時点で 捨てて いて、いちばん 要る ところで
        手元に 何も 残らなかった。
      */}
      {research && memo.some((line) => line.trim()) && (
        <section className="card-island p-4">
          <h3 className="text-ink text-sm font-extrabold">📝 じぶんの しつもんメモ</h3>
          <ul className="mt-2 grid gap-1.5">
            {memo
              .filter((line) => line.trim())
              .map((line) => (
                <li key={line} className="text-ink-soft text-sm font-bold">
                  ・<RubyText text={line} index={furigana} />
                </li>
              ))}
          </ul>
        </section>
      )}

      {/*
        けっかへ。退出ボタン（Zoom枠の 中）でも 行けるが、**話しはじめる 前に
        押してしまう ボタン**の 近くにしか 出口が 無いと、聞きおえた 学習者が
        要件定義書に たどりつけない。

        ただし **一言も 話さないうちは 出さない**。けっかの 画面は 聞けなかった 項目の
        答え（`secret`）を ぜんぶ 並べるので、そこへ 1押しで 行ける 出口が あると、
        「？？？」で 伏せた 意味が なくなる（2026-09-07 の R3・R4 検収が そろって 指摘）。
        話さずに 出たい 人の 道は 残って いる——Zoom枠の「退室」が それで、
        こちらは 会話の 画面の 中に あるので まちがえて 押しにくい。
      */}
      {research && (spoke || open.size > 0) && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleLeft}
            className="btn-island btn-game px-6 py-3 text-sm"
          >
            📄 けっかを{" "}
            <ruby>
              見<rt>み</rt>
            </ruby>
            る →
          </button>
        </div>
      )}
    </CallShell>
  );

  return (
    <div className={embedded ? "" : "mx-auto w-full max-w-3xl px-4 py-6"}>
      {embedded ? null : (
        <header className="mb-5 flex items-center justify-between gap-3">
          {/*
            戻り先は **たいわの 一覧**。/listening を 指していた——たいわ 専用の
            一覧が まだ 無かった ころの 名残りで、いまは /talk が ある。
            話す 教材を おえた 学習者を 聞く 教材の 一覧へ 出すと、さっき やった
            ものが どこにも 無い 画面に 立たされる（一覧どうしの 行き来は
            それぞれの 一覧の 下に ある）。
          */}
          <Link
            prefetch={false}
            href="/talk"
            className="text-ink-soft hover:text-navy text-sm font-extrabold"
          >
            ← たいわ{" "}
            <ruby>
              一覧<rt>いちらん</rt>
            </ruby>
          </Link>
          <span className="bg-sky-soft text-navy rounded-full px-3 py-1 text-xs font-extrabold">
            {scenario.emoji} {scenario.title}
          </span>
        </header>
      )}

      {/* 5段の 教材だけ、いま どこに いるかを 帯で 見せる */}
      {research && <StepBar current={phase} />}

      {research && phase === "mission" ? (
        <MissionStep scenario={scenario} furigana={furigana} onDone={() => setPhase("research")} />
      ) : research && phase === "research" ? (
        <ResearchStep
          research={research}
          furigana={furigana}
          onBack={() => setPhase("mission")}
          onDone={() => setPhase("memo")}
        />
      ) : research && phase === "memo" ? (
        <MemoStep
          findings={research.findings}
          clientName={scenario.client.name}
          people={multi ? people : undefined}
          memo={memo}
          onChange={setMemo}
          furigana={furigana}
          onBack={() => setPhase("research")}
          onDone={() => setPhase("interview")}
        />
      ) : phase === "result" ? (
        <TalkResult
          scenario={scenario}
          opened={open}
          furigana={furigana}
          people={multi ? people : undefined}
          onRetry={handleRetry}
        />
      ) : (
        callView
      )}
    </div>
  );
}

/** 型文を引くための引用（『』「」）。教材が見せている言い回しをそのまま借りる。 */
const QUOTED = /[『「]([^』」]{2,40})[』」]/u;

/**
 * 「はじめの 一言」の型文を教材データから作る。見つからなければ null。
 *
 * ここで新しい文を書かない。教材が『相談が あります』のように**かぎ括弧で
 * 見せている言い方**を1つ借り、あいさつに継ぐだけにする——書き下ろすと、
 * その漢字の読みが読み辞書に無く、学習者がそこで止まる（規律2）。
 * あいさつは相手の場面に合わせる（朝会なら「おはようございます。」）。
 */
export function buildOpeningLine(scenario: Scenario): string | null {
  const sources = [
    // 教訓（lesson）→ 先輩の助言（mission.chat）→ 攻略ひとこと（tip）の順に探す
    ...scenario.lesson.points,
    ...scenario.mission.chat.filter((line) => line.from === "hendy").map((line) => line.text),
    scenario.client.tip,
  ];
  const greeting = scenario.interview.persona.includes("おはよう")
    ? "おはようございます。"
    : "しつれいします。";

  for (const source of sources) {
    const phrase = QUOTED.exec(source)?.[1]?.trim();
    /*
     * 穴あき（〜）や 問い切りの 記号（？！）を 含む 引用は 第一声に ならない——
     * うしろに 「。」を 継ぐので「〜は どうですか？。」に なる。拾える 文が
     * 無ければ null を 返し、カードは goal と tip だけに する（黙って 変な 文を
     * 送らせない）。2026-09-07 の R4 検収で 実際に そう なって いた。
     */
    if (phrase && !/[〜～？?！!]/u.test(phrase)) {
      return `${greeting}${phrase.replace(/[。、]+$/u, "")}。`;
    }
  }
  return null;
}
