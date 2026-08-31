"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { Quest } from "@/content/schema";
import { NexMax } from "@/components/nexmax";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex } from "@/lib/text/furigana";
import { recordContentProgress } from "@/lib/progress/store";
import {
  clearQuestLocal,
  loadQuestSave,
  readQuestLocal,
  saveQuestLocal,
  writeQuestSave,
} from "@/lib/quest/save";
import {
  createQuestState,
  furtherAlong,
  questReducer,
  type QuestAction,
  type QuestMember,
  type QuestState,
} from "@/lib/quest/state";
import { QuestPlay } from "./quest-play";
import { QuestResult } from "./quest-result";
import { QuestSetup } from "./quest-setup";
import { PlayerFace } from "./quest-art";

const UI_FURIGANA = buildFuriganaIndex([
  ["続", "つづ"],
  ["場面", "ばめん"],
  ["最初", "さいしょ"],
  ["遊", "あそ"],
  ["人", "にん"],
]);

/**
 * クエスト（旧 `waterfall_quest.html`）の 司令塔
 *
 * 画面は **ルーティングせず**、1つの クライアントコンポーネントの 中で
 * 判別可能ユニオンで 切り替える（`arcade-game.tsx` と 同じ 作り）。
 * ゲームの 途中で URL が 変わると、戻る ボタンで 状態が 割れる からである。
 *
 * ## 保存の 使い分け（負荷対策・願い #285）
 * - **1手ごと** … 端末（localStorage）。通信しない。閉じても 消えない
 * - **節目だけ** … Supabase の `quest_saves`。「場面クリア」「おしまい」「クリア」の 3つ
 *
 * 1回の 遊びで DB を 叩くのは 30回ほど（30場面 ＋ 終わりの 1回）。1手ごとに 書くと
 * 120回に なり、教室の 1つの IP から 一斉に 出る ことに なる。
 */
export function QuestView({ quest, embedded }: { quest: Quest; embedded?: boolean }) {
  const furigana = useMemo(() => buildFuriganaIndex(quest.furigana ?? []), [quest.furigana]);
  const [furiganaOn, setFuriganaOn] = useState(true);

  const [state, setState] = useState<QuestState | null>(null);
  /** セーブを 探して いる あいだ（えらぶ 画面の ボタンを 止める）。 */
  const [busy, setBusy] = useState(false);
  /** つづきが 見つかった ときの 分かれ道。 */
  const [resume, setResume] = useState<{
    members: readonly QuestMember[];
    saved: QuestState;
  } | null>(null);

  /*
   * 進行は ref にも 持つ。**保存は 状態更新関数の 中で しない**——React は
   * 更新関数を 2度 呼ぶ ことが あり、そこに 通信を 置くと 書き込みが 倍に なる。
   */
  const stateRef = useRef<QuestState | null>(null);
  const membersRef = useRef<readonly string[]>([]);
  const rowIdRef = useRef<string | null>(null);

  const begin = useCallback(
    (next: QuestState, memberIds: readonly string[], rowId: string | null) => {
      stateRef.current = next;
      membersRef.current = memberIds;
      rowIdRef.current = rowId;
      setState(next);
      setResume(null);
      recordContentProgress(quest.id, { status: "started" });
      saveQuestLocal(next, memberIds);
    },
    [quest.id],
  );

  /** えらび終わった。つづきが あれば 分かれ道を 出し、無ければ そのまま 始める。 */
  const onStart = useCallback(
    (members: readonly QuestMember[]) => {
      const memberIds = members.map((member) => member.id);
      setBusy(true);
      void (async () => {
        const remote = await loadQuestSave(quest, memberIds);
        // 端末は 1手ごと・DB は 節目だけ なので、**進んで いる ほう**を 取る
        const saved = furtherAlong(remote?.state ?? null, readQuestLocal(quest, memberIds));
        rowIdRef.current = remote?.rowId ?? null;
        setBusy(false);
        if (saved && saved.status.kind === "playing") {
          membersRef.current = memberIds;
          setResume({ members, saved });
          return;
        }
        begin(createQuestState(quest, members), memberIds, remote?.rowId ?? null);
      })();
    },
    [begin, quest],
  );

  /** 節目だけ DB へ 送る。学習者の 画面は 待たない（送りっぱなし）。 */
  const persist = useCallback((next: QuestState) => {
    void (async () => {
      const rowId = await writeQuestSave({
        state: next,
        memberIds: membersRef.current,
        rowId: rowIdRef.current,
      });
      if (rowId) rowIdRef.current = rowId;
    })();
  }, []);

  const dispatch = useCallback(
    (action: QuestAction) => {
      const current = stateRef.current;
      if (!current) return;
      const next = questReducer(quest, current, action);
      if (next === current) return;

      stateRef.current = next;
      setState(next);

      // 1手ごとに 端末へ（通信しない）
      saveQuestLocal(next, membersRef.current);

      /*
       * 節目＝**場面が 1つ 進んだ**か、**遊びが 終わった**か。
       * `clearedPhases` は `advance` の ときにしか 増えない ので、
       * 1つの 場面で 何回 外しても DB への 書き込みは 増えない。
       */
      const milestone =
        next.clearedPhases > current.clearedPhases ||
        (current.status.kind === "playing" && next.status.kind !== "playing");
      if (!milestone) return;

      if (next.status.kind === "cleared") {
        recordContentProgress(quest.id, { status: "completed" });
      }
      persist(next);
    },
    [persist, quest],
  );

  const restart = useCallback(() => {
    clearQuestLocal(quest.id, membersRef.current);
    stateRef.current = null;
    setState(null);
    setResume(null);
  }, [quest.id]);

  const body = (() => {
    if (resume) {
      return (
        <ResumeChoice
          resume={resume}
          onResume={() => begin(resume.saved, membersRef.current, rowIdRef.current)}
          onFresh={() => {
            clearQuestLocal(quest.id, membersRef.current);
            begin(createQuestState(quest, resume.members), membersRef.current, rowIdRef.current);
          }}
        />
      );
    }
    if (!state) return <QuestSetup onStart={onStart} busy={busy} />;
    if (state.status.kind !== "playing" && state.event === null) {
      return <QuestResult quest={quest} state={state} onRestart={restart} />;
    }
    return (
      <QuestPlay
        quest={quest}
        state={state}
        dispatch={dispatch}
        furigana={furigana}
        furiganaOn={furiganaOn}
        onToggleFurigana={() => setFuriganaOn((on) => !on)}
      />
    );
  })();

  return (
    <div className={embedded ? "" : "mx-auto w-full max-w-3xl px-4 py-6"}>
      {state === null ? (
        <section className="card-island mb-3 p-5 sm:p-6">
          <div className="flex flex-wrap items-start gap-4">
            <NexMax variant="hello" size={64} bob />
            <div className="min-w-0 flex-1">
              <h1 className="text-ink text-2xl font-extrabold break-words sm:text-3xl">
                <RubyText text={quest.title} index={furigana} show={furiganaOn} />
              </h1>
              <p className="text-ink-soft mt-1 font-bold break-words">
                <RubyText text={quest.description} index={furigana} show={furiganaOn} />
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFuriganaOn((on) => !on)}
              aria-pressed={furiganaOn}
              className={`rounded-full border-2 px-3 py-1 text-xs font-extrabold ${
                furiganaOn
                  ? "bg-sky border-sky text-white"
                  : "border-hairline text-ink-soft bg-panel"
              }`}
            >
              ふりがな {furiganaOn ? "ON" : "OFF"}
            </button>
          </div>
          <p className="bg-panel-tint text-ink mt-4 rounded-2xl px-4 py-3 leading-relaxed font-bold">
            🎯 <RubyText text={quest.focus} index={furigana} show={furiganaOn} />
          </p>
        </section>
      ) : null}
      {body}
    </div>
  );
}

/**
 * つづきが 見つかった ときの 分かれ道。
 * **同じ 組なら 同じ セーブに 戻る**（`quest_saves` は 組で 1行）。
 */
function ResumeChoice({
  resume,
  onResume,
  onFresh,
}: {
  resume: { members: readonly QuestMember[]; saved: QuestState };
  onResume: () => void;
  onFresh: () => void;
}) {
  return (
    <section className="card-island p-5 sm:p-6">
      <h2 className="text-navy text-xl font-black">
        <RubyText text="つづきが ありました" index={UI_FURIGANA} />
      </h2>
      <p className="text-ink mt-2 font-bold">
        <RubyText
          text={`場面 ${resume.saved.clearedPhases + 1} から つづけられます。`}
          index={UI_FURIGANA}
        />
      </p>

      <ul className="mt-4 flex flex-wrap gap-2">
        {resume.saved.players.map((player) => (
          <li
            key={player.id}
            className="border-hairline bg-panel flex items-center gap-2 rounded-full border-2 px-2 py-1"
          >
            <PlayerFace player={player} size={28} />
            <span className="text-ink text-xs font-black">{player.name}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          data-quest="resume"
          onClick={onResume}
          className="btn-game px-6 py-3 [--btn-face:#58c273] [--btn-shadow:#3aa458]"
        >
          <RubyText text="つづきから" index={UI_FURIGANA} />
        </button>
        <button
          type="button"
          data-quest="fresh"
          onClick={onFresh}
          className="btn-game px-5 py-3 text-[#1f3a56] [--btn-face:#ffffff] [--btn-shadow:#cfe6f3]"
        >
          <RubyText text="最初から" index={UI_FURIGANA} />
        </button>
      </div>
    </section>
  );
}
