"use client";

import { useMemo, useState } from "react";
import { wordSchema, type Stage, type WordStage } from "@/content/schema";
import { getGeminiKey } from "@/lib/profile";
import type { VocabCandidate } from "@/lib/vocab/extract";
import { messageForReason } from "./issue-text";
import { saveContent } from "./studio-api";
import { MiniButton, StudioSection } from "./studio-ui";

/**
 * ステージの本文から ことばを ぬき出して、単語ステージ（ことばアーケード）を作る
 *
 * ステージに出てくる「しごとの ことば」「ITの ことば」を先生が手で選んで
 * 単語ステージを1本書くのは、語ごとに 読み・英語の意味・まよう誤答3つ・解説・例文を
 * そろえる仕事で、1課ぶんで1時間仕事になる。作られなければ、ステージから
 * 「🕹️ ことばで あそぶ」へ行く道は開かないままになる。
 *
 * どの語が難しいか（N4を超えるか・仕事でくり返し使うか）は意味の判断なので
 * AIに任せる（/api/studio/vocab → Gemini）。ただし**選ぶのは先生**にする。
 * AIが出した20語をそのまま教材にすると、その課で使わない語まで学習者に届く。
 *
 * キーは先生本人のもの（BYOK）で、この画面から出るのはサーバのプロキシへだけ
 *（AGENTS.md 規律4。audio-maker.tsx / use-live-session.ts と同じ流儀）。
 */

/** 単語ステージの最低語数（wordStageSchema の words.min(6)）。 */
const MIN_WORDS = 6;

/**
 * 進行で変わる景色。既存の単語ステージ（content/wordstages/）と同じにしておく。
 * ここだけ違う並びにすると、同じゲームなのに課によって見た目が変わる。
 */
const FIELD_SEQUENCE = ["forest", "sky", "space"] as const;

/** 合格のライン。ことばアーケードは反復が目的なので、テストより低く置く。 */
const PASS_RATE = 70;

const NO_KEY_MESSAGE = "さきに はじめの せっていで Gemini の APIキーを 登録してください。";

export function VocabExtractor({
  stage,
  textsByRef,
  onCreated,
}: {
  stage: Stage;
  /**
   * 教材ID → 学習者が読む文（studio-shell が collectLearnerTexts で作る）。
   * ステージが持っているのは参照先のIDだけなので、本文は外から渡してもらう。
   */
  textsByRef: Readonly<Record<string, readonly string[]>>;
  /** 作った単語ステージのIDを、編集中のステージの wordStageIds に足してもらう。 */
  onCreated: (wordStageId: string) => void;
}) {
  const [busy, setBusy] = useState<"extract" | "create" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<VocabCandidate[]>([]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  /** このステージが指している教材のうち、本文を集められたもの。 */
  const sources = useMemo(() => {
    const withText: string[] = [];
    const withoutText: string[] = [];
    for (const item of stage.contents) {
      const texts = textsByRef[item.ref] ?? [];
      (texts.length > 0 ? withText : withoutText).push(item.ref);
    }
    return { withText, withoutText };
  }, [stage.contents, textsByRef]);

  const texts = useMemo(
    () => sources.withText.flatMap((ref) => [...(textsByRef[ref] ?? [])]),
    [sources.withText, textsByRef],
  );

  const chosen = candidates.filter((word) => selected.has(word.id));

  const toggle = (id: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const extract = async () => {
    const apiKey = getGeminiKey();
    if (!apiKey) {
      setError(NO_KEY_MESSAGE);
      return;
    }
    setError(null);
    setNote(null);
    setBusy("extract");
    try {
      const words = await requestCandidates(apiKey, texts);
      setCandidates(words);
      // 出てきたものは最初から全部えらんだ状態にする。先生の仕事は
      // 「いる語を選ぶ」より「この課で使わない語を外す」ほうが速い。
      setSelected(new Set(words.map((word) => word.id)));
      if (words.length === 0) {
        setNote("ことばが 見つかりませんでした。本文を ふやすと 見つかりやすく なります。");
      }
    } catch (e) {
      setError(e instanceof VocabError ? e.message : "うまくいきませんでした。");
      setCandidates([]);
      setSelected(new Set());
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    if (chosen.length < MIN_WORDS) return;
    const draft = buildWordStage(stage, chosen);
    setError(null);
    setNote(null);
    setBusy("create");
    /**
     * したがきではなく**こうかい**で保存する。
     * いまのスタジオには単語ステージの編集画面が無いので、したがきで置くと
     * あとから公開する手段が無く、ステージの wordStageIds は参照切れのまま残る
     *（学習者の画面では「ことばで あそぶ」が出てこない）。
     * 語は先生が1つずつ見てチェックしたものなので、ここで公開してよい。
     */
    const result = await saveContent(draft, true);
    setBusy(null);
    if (!result.ok) {
      setError(
        [result.message, ...result.issues.map((i) => `${i.where}: ${i.message}`)].join(" / "),
      );
      return;
    }
    onCreated(draft.id);
    setNote(
      `単語ステージ「${draft.title}」を つくりました（${draft.words.length}語）。` +
        "上の「したがきを ほぞん」か「こうかい」を おすと、この ステージから 開けるように なります。",
    );
  };

  return (
    <StudioSection
      title="このステージの ことばを ぬき出す"
      hint="ステージの 本文から、しごとの ことば・ITの ことばを AIが えらびます。えらぶのは 先生です。"
    >
      {texts.length === 0 ? (
        <p className="text-ink-faint text-xs font-bold">
          このステージの 教材に、まだ 本文が ありません。さきに コンテンツを 足して、その 教材の
          本文を 書いてください。
        </p>
      ) : (
        <p className="text-ink-soft text-xs font-bold">
          {sources.withText.length}この 教材から 本文を あつめます。
          {sources.withoutText.length > 0 ? (
            <>
              <br />
              まだ 作っていない 教材と、たいわ・ことばのゲームの 本文は 入りません（
              {sources.withoutText.join("・")}）。
            </>
          ) : null}
        </p>
      )}

      <div className="bg-panel-tint flex flex-wrap items-center gap-3 rounded-2xl p-3">
        <MiniButton
          tone="accent"
          onClick={() => void extract()}
          disabled={busy !== null || texts.length === 0}
        >
          {busy === "extract" ? "さがしています…" : "🔎 ことばを ぬき出す"}
        </MiniButton>
        {candidates.length > 0 ? (
          <>
            <span className="text-ink-soft text-xs font-black">
              {chosen.length} / {candidates.length}語 えらんでいます
            </span>
            <MiniButton
              onClick={() => setSelected(new Set(candidates.map((word) => word.id)))}
              disabled={busy !== null}
            >
              ぜんぶ えらぶ
            </MiniButton>
            <MiniButton onClick={() => setSelected(new Set())} disabled={busy !== null}>
              ぜんぶ はずす
            </MiniButton>
          </>
        ) : null}
      </div>

      {candidates.length > 0 ? (
        <ul className="space-y-2">
          {candidates.map((word) => (
            <li key={word.id} className="border-hairline rounded-xl border-2 bg-white p-3">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={selected.has(word.id)}
                  onChange={(event) => toggle(word.id, event.target.checked)}
                  className="accent-sky mt-1 h-4 w-4"
                />
                <span className="flex-1">
                  <span className="text-navy block text-sm font-black">
                    {word.term}（{word.reading}）
                  </span>
                  <span className="text-ink block text-xs font-bold">こたえ: {word.meaningEn}</span>
                  <span className="text-ink-soft block text-xs font-bold">
                    まよう こたえ: {word.wrongMeanings.join(" / ")}
                  </span>
                  <span className="text-ink mt-1 block text-xs font-bold">
                    {word.explanationJa}
                  </span>
                  <span className="text-ink-soft block text-xs font-bold">
                    れい: {word.example}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : null}

      {candidates.length > 0 ? (
        <div className="bg-panel-tint space-y-2 rounded-2xl p-3">
          <MiniButton
            tone="accent"
            onClick={() => void create()}
            disabled={busy !== null || chosen.length < MIN_WORDS}
          >
            {busy === "create"
              ? "つくっています…"
              : `🕹️ えらんだ ことばで 単語ステージを つくる（${chosen.length}語）`}
          </MiniButton>
          {/*
            6語に届かないと wordStageSchema で止まる。押せるボタンのまま出すと、
            先生は保存の画面まで行って初めて理由の分からない指摘を受けることになる。
          */}
          {chosen.length < MIN_WORDS ? (
            <p className="text-ink-soft text-xs font-bold">
              単語ステージは {MIN_WORDS}語から つくれます。あと {MIN_WORDS - chosen.length}語
              えらんでください。
            </p>
          ) : null}
        </div>
      ) : null}

      {note ? <p className="text-navy text-xs font-black">{note}</p> : null}
      {error ? <p className="text-coral-deep text-xs font-black">{error}</p> : null}
    </StudioSection>
  );
}

/** 画面に出す理由を持った失敗（上流の生メッセージは外に出さない）。 */
class VocabError extends Error {}

/** サーバのプロキシへ頼んで、そのまま見せてよい候補だけ受け取る。 */
async function requestCandidates(apiKey: string, texts: string[]): Promise<VocabCandidate[]> {
  let response: Response;
  try {
    response = await fetch("/api/studio/vocab", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey, texts }),
    });
  } catch {
    throw new VocabError("つうしんに 失敗しました。ネットワークを たしかめてください。");
  }

  const body = (await readJson(response)) as { words?: unknown; reason?: unknown };
  if (!response.ok) {
    throw new VocabError(messageForVocabReason(typeof body.reason === "string" ? body.reason : ""));
  }

  // サーバも wordSchema を通しているが、ここでも通す。規格が変わった古い応答が
  // 混じったときに、壊れた候補を先生に選ばせないため（選んだあとの保存で落ちる）。
  const seen = new Set<string>();
  return Array.isArray(body.words)
    ? body.words.flatMap((raw) => {
        const parsed = wordSchema.safeParse(raw);
        if (!parsed.success) return [];
        // 同じIDが2つあると、チェックが連動して外れる（一覧のキーが重なる）
        if (seen.has(parsed.data.id)) return [];
        seen.add(parsed.data.id);
        return [parsed.data];
      })
    : [];
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** 抜き出し固有の理由だけ言い換え、共通の理由は保存と同じ言い方にそろえる。 */
function messageForVocabReason(reason: string): string {
  switch (reason) {
    case "noKey":
      return NO_KEY_MESSAGE;
    case "noText":
      return "この ステージの 教材に、まだ 本文が ありません。さきに 本文を 書いてください。";
    case "upstream":
      return "AIの 返事を 受け取れませんでした。少し 待って もう一度 ためしてください。";
    default:
      return messageForReason(reason);
  }
}

/**
 * えらんだ語から単語ステージの下書きを組み立てる。
 *
 * questionCount は語数そのもの（出題は語彙の部分集合という制約を必ず満たす）。
 * password は付けない——先生が開放パスワードを配る運用は、いまのスタジオには
 * 単語ステージの編集画面が無く、あとから変えられないため。
 * furigana（読み辞書）も付けない。語カードは term と reading を並べて見せるので
 * 語そのものは読める。解説と例文の読みは機械で決められないので、
 * ここで思いつきの読みを入れない（AGENTS.md 規律2）。
 */
function buildWordStage(stage: Stage, words: VocabCandidate[]): WordStage {
  const title = stage.title.trim();
  return {
    kind: "wordstage",
    id: nextWordStageId(stage),
    title: title.length > 0 ? `${title} の ことば` : "この ステージの ことば",
    description: "この ステージに 出てくる しごとの ことばと ITの ことばです。",
    fieldSequence: [...FIELD_SEQUENCE],
    questionCount: words.length,
    passRate: PASS_RATE,
    words,
  };
}

/**
 * 新しい単語ステージのID。
 *
 * 同じIDで保存すると前に作ったものを黙って上書きするので、そのステージが
 * すでに持っているIDは避ける。IDはあとから変えられない（進捗の保存キー）ので、
 * 2本目からは末尾に番号を足す。
 */
function nextWordStageId(stage: Stage): string {
  const base = `${slug(stage.id) || "stage"}-words`;
  let id = base;
  let n = 2;
  while (stage.wordStageIds.includes(id)) {
    id = `${base}${n}`;
    n += 1;
  }
  return id;
}

/** wordStageSchema の id（半角英小文字・数字・- _）に収める。 */
function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
