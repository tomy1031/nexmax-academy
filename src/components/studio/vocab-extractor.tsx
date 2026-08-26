"use client";

import { useMemo, useState } from "react";
import type { StoredWordStage, VocabBook, VocabWord, WordStage } from "@/content/schema";
import { wordSchema, type Stage } from "@/content/schema";
import { stageVocabPool } from "@/lib/vocab/stage-pool";
import { hasCodex } from "@/lib/codex-settings";
import { getGeminiKey } from "@/lib/profile";
import { generateFromBrowser } from "@/lib/ai/generate-browser";
import { TEXT_MODEL } from "@/lib/ai/models";
import {
  buildVocabPrompt,
  parseVocabCandidates,
  VOCAB_RESPONSE_SCHEMA,
  type VocabCandidate,
} from "@/lib/vocab/extract";
import { messageForReason } from "./issue-text";
import { saveContent } from "./studio-api";
import { generateStructured } from "./text-api";
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
 * AIに任せる（この端末から Gemini へ直接）。ただし**選ぶのは先生**にする。
 * AIが出した20語をそのまま教材にすると、その課で使わない語まで学習者に届く。
 *
 * キーは先生本人のもの（BYOK）で、**サーバには渡さない**（2026-08-17）。
 * うちの Worker は香港で動くことがあり、そこを通すと Google に断られるうえ、
 * キーが香港で復号される（audio-maker.tsx / use-live-session.ts と同じ流儀）。
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
  vocabBooks,
  wordStages,
  onCreated,
}: {
  stage: Stage;
  /**
   * 教材ID → 学習者が読む文（studio-shell が collectLearnerTexts で作る）。
   * ステージが持っているのは参照先のIDだけなので、本文は外から渡してもらう。
   */
  textsByRef: Readonly<Record<string, readonly string[]>>;
  /**
   * ことばの 正（`content/vocab/*.json`）。
   *
   * 語の 置き場は ここ 1つ しか 無い（2026-08-20）。だから 先生は
   * **抜き出した ことばだけでなく、辞書に ある ことばからも 選べる**——
   * 同じ ことばを もう一度 作らせない ための 形である。
   */
  vocabBooks: readonly VocabBook[];
  /** いまある 単語ステージ（git ∪ DB）。この ステージの セットと 出題中の 語を 引く。 */
  wordStages: readonly WordStage[];
  /** 作った単語ステージのIDを、編集中のステージの wordStageIds に足してもらう。 */
  onCreated: (wordStageId: string) => void;
}) {
  const [busy, setBusy] = useState<"extract" | "create" | null>(null);
  const [query, setQuery] = useState("");
  /** 辞書から えらんだ ことばの id。抜き出した ぶんとは 別に 持つ。 */
  const [fromVocab, setFromVocab] = useState<ReadonlySet<string>>(new Set());
  /**
   * 候補の 出しかた。**既定は この ステージの ことば**（2026-08-25・願い #203）。
   * 559語 ぜんぶを 並べると、この 課の 語を 思い出して 探す ことに なる。
   */
  const [scope, setScope] = useState<"stage" | "all">("stage");
  /** 入れ先の セット（`new` なら 新しく つくる）。 */
  const [target, setTarget] = useState<string>("new");
  /** 新しい セットの 名前（初級・中級…）。空なら 名前なし＝1つに まとまる。 */
  const [newLabel, setNewLabel] = useState("");

  /** ことばの 正（束を ならべた もの）と、表記からの 引き当て。 */
  const vocabWords = useMemo(() => vocabBooks.flatMap((book) => book.words), [vocabBooks]);
  const vocabTerms = useMemo(() => new Map(vocabWords.map((w) => [w.term, w])), [vocabWords]);
  const vocabIds = useMemo(() => new Set(vocabWords.map((w) => w.id)), [vocabWords]);
  /** 読み辞書が「ここで 切れる」と 決めて いる 表記（語の 見つけ方に 効く）。 */
  const readingUnits = useMemo(
    () => new Set(vocabBooks.flatMap((book) => book.furigana ?? []).map(([surface]) => surface)),
    [vocabBooks],
  );

  /** この ステージに ぶら下がって いる セット。 */
  const sets = useMemo(
    () =>
      stage.wordStageIds
        .map((id) => wordStages.find((item) => item.id === id))
        .filter((item): item is WordStage => item !== undefined),
    [stage.wordStageIds, wordStages],
  );

  /** セット → いま 出して いる 語の id（辞書に ある ものだけ）。 */
  const idsBySet = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const set of sets) {
      map.set(
        set.id,
        set.words.map((word) => word.id).filter((id) => vocabIds.has(id)),
      );
    }
    return map;
  }, [sets, vocabIds]);

  /** この ステージが いま 出題して いる 語 ぜんぶ。 */
  const playingIds = useMemo(() => new Set([...idsBySet.values()].flat()), [idsBySet]);

  /** 語 → その語を 出して いる ステージの 見出し（辞書ぜんたいを 見る ときの めじるし）。 */
  const ownerTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const set of wordStages) {
      for (const word of set.words) if (!map.has(word.id)) map.set(word.id, set.title);
    }
    return map;
  }, [wordStages]);
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
    // Codex の合言葉があれば キーは要らない（先に Codex を使うため）
    if (!apiKey && !hasCodex()) {
      setError(NO_KEY_MESSAGE);
      return;
    }
    setError(null);
    setNote(null);
    setBusy("extract");
    try {
      const words = await requestCandidates(apiKey, texts);
      setCandidates(words);
      // 出てきたものは最初から えらんだ状態にする。先生の仕事は
      // 「いる語を選ぶ」より「この課で使わない語を外す」ほうが速い。
      // ただし もう辞書に ある ことばは外しておく（説明を2つ育てないため）。
      setSelected(new Set(words.filter((word) => !vocabTerms.has(word.term)).map((w) => w.id)));
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

  /** 入れ先の セット（`new` なら null＝新しく つくる）。 */
  const targetSet = sets.find((set) => set.id === target) ?? null;
  /**
   * 入れ先の セットが 持って いる、**辞書に 無い** ことばの 数。
   * 足すと 参照（`wordIds`）の 形に なるので、辞書に 無い 語は 消える。
   * 消える なら 足させない——先に ことばの 正を 直して もらう。
   */
  const missingInTarget = targetSet
    ? targetSet.words.filter((word) => !vocabIds.has(word.id)).length
    : 0;

  /** 抜き出した ぶんで、まだ 正に 無い ことば。 */
  const freshWords = chosen.filter((word) => !vocabTerms.has(word.term));
  /** 保存に 使う 語ID（辞書から えらんだ ぶん ＋ 抜き出した ぶん）。 */
  const chosenIds = [
    ...fromVocab,
    ...chosen.map((word) => vocabTerms.get(word.term)?.id ?? vocabIdFor(word, vocabWords)),
  ];
  const totalChosen = new Set(chosenIds).size;

  const create = async () => {
    if (totalChosen < MIN_WORDS) return;
    setError(null);
    setNote(null);
    setBusy("create");

    /*
     * まず **ことばの 正**に 足す。ここを 先に するのは、あとで ステージが 指す
     * 参照が 切れないように するため（先に ステージを 保存すると、失敗した とき
     * 「指しているのに 無い 語」が 残る）。
     */
    const book = vocabBooks[0];
    if (freshWords.length > 0) {
      if (!book) {
        setBusy(null);
        setError("ことばの 正（content/vocab）が 見つかりません。");
        return;
      }
      const added = freshWords.map((word) => toVocabWord(word, vocabWords));
      const saved = await saveContent({ ...book, words: [...book.words, ...added] }, true);
      if (!saved.ok) {
        setBusy(null);
        setError(
          [
            "ことばを 辞書に 足せませんでした。",
            saved.message,
            ...saved.issues.map((i) => `${i.where}: ${i.message}`),
          ].join(" / "),
        );
        return;
      }
    }

    /**
     * したがきではなく**こうかい**で保存する。
     * したがきで置くと あとから公開する手段が乏しく、ステージの wordStageIds は
     * 参照切れのまま残る（学習者の画面では「ことばで あそぶ」が出てこない）。
     * 語は先生が1つずつ見てチェックしたものなので、ここで公開してよい。
     */
    const draft = targetSet
      ? appendToSet(targetSet, [...(idsBySet.get(targetSet.id) ?? []), ...chosenIds])
      : buildWordStage(stage, [...new Set(chosenIds)], newLabel.trim());
    const result = await saveContent(draft, true);
    setBusy(null);
    if (!result.ok) {
      setError(
        [result.message, ...result.issues.map((i) => `${i.where}: ${i.message}`)].join(" / "),
      );
      return;
    }

    const count = draft.wordIds?.length ?? 0;
    const added = freshWords.length > 0 ? `・うち ${freshWords.length}語を 辞書に 足しました` : "";
    if (targetSet) {
      setNote(`「${targetSet.label ?? targetSet.title}」を ${count}語に しました${added}。`);
    } else {
      onCreated(draft.id);
      setNote(
        `ことばの セット「${draft.label ?? draft.title}」を つくりました（${count}語${added}）。` +
          "上の「したがきを ほぞん」か「こうかい」を おすと、この ステージから 開けるように なります。",
      );
    }
    /*
     * えらんだ ものは 流す。3つの セットを 続けて 作る ときに、
     * 50個の チェックを 手で 外させない ためである。
     */
    setFromVocab(new Set());
    setSelected(new Set());
    setNewLabel("");
    setTarget("new");
  };

  /**
   * この ステージの ことば（いま 出題中／本文に 出て くる）。
   * 置き場は 増やさず、そのつど 本文と 突き合わせて 出す（`stageVocabPool`）。
   */
  const pool = useMemo(
    () =>
      stageVocabPool({
        vocab: vocabWords,
        texts,
        playingIds,
        refs: stage.contents.map((item) => item.ref),
        readingUnits,
      }),
    [vocabWords, texts, playingIds, stage.contents, readingUnits],
  );

  const match = (word: VocabWord, q: string) =>
    word.term.includes(q) ||
    word.reading.includes(q) ||
    (word.englishTerm ?? "").toLowerCase().includes(q.toLowerCase());

  /** 画面に 出す かたまり（さがす 欄で しぼる）。 */
  const groups = useMemo(() => {
    const q = query.trim();
    const sift = (words: readonly VocabWord[]) => (q ? words.filter((w) => match(w, q)) : words);
    if (scope === "all") {
      return [{ key: "all", title: "辞書ぜんたい", words: sift(vocabWords) }];
    }
    return [
      { key: "playing", title: "いま 出題中", words: sift(pool.playing) },
      { key: "appears", title: "本文に 出て くる", words: sift(pool.appears) },
    ];
  }, [query, scope, vocabWords, pool]);

  const shown = groups.reduce((n, group) => n + group.words.length, 0);

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
                    {vocabTerms.has(word.term) ? (
                      <span className="text-ink-soft ml-2 text-xs font-black">
                        すでに 辞書に あります（下から えらべます）
                      </span>
                    ) : null}
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

      {/*
        **辞書に ある ことばからも 選べる**（2026-08-20 の指定）。
        語の 置き場は 1つ しか 無いので、同じ ことばを もう一度 作らせない。

        既定で 出すのは **この ステージの 本文に 出て くる 語だけ**（2026-08-25・願い #203）。
        辞書ぜんたい（559語）を 並べると、先生は この 課の 語を 思い出して 探す ことに なり、
        抜き出した 語を 使う 手順が 事実上 使えなかった。
      */}
      <div className="border-hairline space-y-2 rounded-2xl border-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-navy text-sm font-black">📚 辞書から えらぶ</span>
          <span className="text-ink-soft text-xs font-black">
            {fromVocab.size}語 えらんでいます（この ステージの ことば{" "}
            {pool.playing.length + pool.appears.length}語）
          </span>
          <MiniButton onClick={() => setScope(scope === "stage" ? "all" : "stage")}>
            {scope === "stage"
              ? `ぜんぶの 辞書から さがす（${vocabWords.length}語）`
              : "この ステージの ことばに もどす"}
          </MiniButton>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ことば・よみ・英語で さがす"
            className="border-hairline min-w-40 flex-1 rounded-full border-2 px-3 py-1 text-xs font-bold"
          />
        </div>

        <div className="max-h-72 space-y-2 overflow-y-auto">
          {groups.map((group) =>
            group.words.length === 0 ? null : (
              <div key={group.key}>
                {scope === "stage" ? (
                  <p className="text-ink-faint text-[11px] font-black">
                    {group.title}（{group.words.length}語）
                  </p>
                ) : null}
                <ul className="space-y-1">
                  {group.words.map((word) => (
                    <li key={word.id}>
                      <label className="hover:bg-panel-tint flex items-start gap-2 rounded-lg p-1">
                        <input
                          type="checkbox"
                          checked={fromVocab.has(word.id)}
                          onChange={(event) =>
                            setFromVocab((prev) => {
                              const next = new Set(prev);
                              if (event.target.checked) next.add(word.id);
                              else next.delete(word.id);
                              return next;
                            })
                          }
                          className="accent-sky mt-1 h-4 w-4"
                        />
                        <span className="flex-1">
                          <span className="text-navy block text-xs font-black">
                            {word.term}（{word.reading}）
                            {word.englishTerm ? (
                              <span className="text-ink-soft ml-2 font-bold">
                                {word.englishTerm}
                              </span>
                            ) : null}
                            {/*
                              どの 課の ことばかを 出す（辞書ぜんたいを 見て いる ときだけ）。
                              中間テストの ような **課を またぐ セット**を 組む ときの めじるし。
                            */}
                            {scope === "all" && ownerTitles.has(word.id) ? (
                              <span className="text-ink-faint ml-2 font-bold">
                                {ownerTitles.get(word.id)}
                              </span>
                            ) : null}
                            {!word.wrongMeanings ? (
                              <span className="text-coral-deep ml-2 font-bold">
                                ゲームには 出せません（まよう こたえが ありません）
                              </span>
                            ) : null}
                          </span>
                          <span className="text-ink-soft block text-xs font-bold">
                            {word.meaningJa}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ),
          )}
        </div>
        {shown === 0 ? (
          <p className="text-ink-faint text-xs font-bold">
            {scope === "stage"
              ? "この ステージの 本文からは 見つかりませんでした。「ぜんぶの 辞書から さがす」で 足せます。"
              : "見つかりませんでした。"}
          </p>
        ) : null}
      </div>

      {/*
        入れ先を えらぶ（願い #203）。セットは **いくつ 作っても よい**——
        初級・中級 の ように 名前を 付けた ものは、学習者の 画面でも 分かれて 出る。
        名前を 付けなければ これまでどおり 1つに まとまる。
      */}
      <div className="bg-panel-tint space-y-2 rounded-2xl p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-navy text-xs font-black">どこに 入れる？</span>
          <select
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            className="border-hairline rounded-full border-2 bg-white px-3 py-1 text-xs font-bold"
          >
            <option value="new">あたらしい セットを つくる</option>
            {sets.map((set) => (
              <option key={set.id} value={set.id}>
                {set.label ? `${set.label}（${set.id}）` : set.title}に 足す（
                {idsBySet.get(set.id)?.length ?? 0}語）
              </option>
            ))}
          </select>
          {target === "new" ? (
            <input
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
              placeholder="セット名（初級・中級 など／からでも よい）"
              className="border-hairline min-w-40 flex-1 rounded-full border-2 px-3 py-1 text-xs font-bold"
            />
          ) : null}
        </div>
        {target === "new" && sets.length > 0 && newLabel.trim().length === 0 ? (
          <p className="text-ink-soft text-xs font-bold">
            名前が ないと、いまの セットと **1つに まとまって** 出ます。分けたい ときは 名前を
            書いてください。
          </p>
        ) : null}
        {targetSet && missingInTarget > 0 ? (
          <p className="text-coral-deep text-xs font-black">
            この セットには 辞書に 無い ことばが {missingInTarget}語 あります。足すと 消えるので、
            さきに /admin の ことばで 直してください。
          </p>
        ) : null}

        <MiniButton
          tone="accent"
          onClick={() => void create()}
          disabled={busy !== null || totalChosen < MIN_WORDS || missingInTarget > 0}
        >
          {busy === "create"
            ? targetSet
              ? "足しています…"
              : "つくっています…"
            : targetSet
              ? `🕹️ えらんだ ことばを この セットに 足す（${totalChosen}語）`
              : `🕹️ えらんだ ことばで セットを つくる（${totalChosen}語）`}
        </MiniButton>
        {/*
          6語に届かないと wordStageSchema で止まる。押せるボタンのまま出すと、
          先生は保存の画面まで行って初めて理由の分からない指摘を受けることになる。
        */}
        {totalChosen < MIN_WORDS ? (
          <p className="text-ink-soft text-xs font-bold">
            単語ステージは {MIN_WORDS}語から つくれます。あと {MIN_WORDS - totalChosen}語
            えらんでください。
          </p>
        ) : null}
        {freshWords.length > 0 ? (
          <p className="text-ink-soft text-xs font-bold">
            あたらしい {freshWords.length}語は、辞書にも 足します。
          </p>
        ) : null}
      </div>

      {note ? <p className="text-navy text-xs font-black">{note}</p> : null}
      {error ? <p className="text-coral-deep text-xs font-black">{error}</p> : null}
    </StudioSection>
  );
}

/** 画面に出す理由を持った失敗（上流の生メッセージは外に出さない）。 */
class VocabError extends Error {}

/**
 * 候補を作らせる。**Codex を先に使い、届かなければ Gemini。**
 *
 * ことばの抜き出しはステージ1本ぶんの本文を丸ごと渡すので、
 * 1回あたりの消費が大きい。Gemini の無料枠を守るため Codex を先にする。
 */
async function requestCandidates(apiKey: string, texts: string[]): Promise<VocabCandidate[]> {
  const made = await generateStructured<VocabCandidate[]>({
    prompt: buildVocabPrompt(texts),
    shape: JSON.stringify(VOCAB_RESPONSE_SCHEMA, null, 2),
    outputSchema: VOCAB_RESPONSE_SCHEMA,
    validate: (value) => {
      const words = toWordList(value);
      return words.length > 0
        ? { ok: true, value: words }
        : { ok: false, problem: "words が 空か、語の形が そろっていません" };
    },
    viaGemini: () => requestViaGemini(apiKey, texts),
  });
  if (!made.ok) throw new VocabError(made.message);
  return made.value;
}

/**
 * 返ってきたものを語の一覧にする。
 *
 * サーバも wordSchema を通しているが、ここでも通す。規格が変わった古い応答が
 * 混じったときに、壊れた候補を先生に選ばせないため（選んだあとの保存で落ちる）。
 * Codex 経由はサーバを通らないので、**こちらが唯一の関門**になる。
 */
function toWordList(value: unknown): VocabCandidate[] {
  const raw = Array.isArray(value) ? value : ((value as { words?: unknown } | null)?.words ?? null);
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  return raw.flatMap((item) => {
    const parsed = wordSchema.safeParse(item);
    if (!parsed.success) return [];
    // 同じIDが2つあると、チェックが連動して外れる（一覧のキーが重なる）
    if (seen.has(parsed.data.id)) return [];
    seen.add(parsed.data.id);
    return [parsed.data];
  });
}

/** いままでの経路（サーバのプロキシ → Gemini）。 */
async function requestViaGemini(
  apiKey: string,
  texts: string[],
): Promise<{ ok: true; value: VocabCandidate[] } | { ok: false; message: string }> {
  if (!apiKey) return { ok: false, message: messageForVocabReason("noKey") };
  return await vocabFromBrowser(apiKey, texts);
}

/**
 * この端末から Google に直接聞く（2026-08-17 から サーバは 通さない）。
 * うちの Worker は香港で動くことがあり、そこを通すと Google に断られるうえ、
 * キーが香港で復号される。BYOK のキーはこの端末にあるので、ここから聞けばよい。
 */
async function vocabFromBrowser(
  apiKey: string,
  texts: string[],
): Promise<{ ok: true; value: VocabCandidate[] } | { ok: false; message: string }> {
  const result = await generateFromBrowser({
    apiKey,
    model: TEXT_MODEL,
    prompt: buildVocabPrompt(texts),
    schema: VOCAB_RESPONSE_SCHEMA,
    // 教材づくりなので、思いつきよりも本文に忠実な方を採る（route と同じ）
    temperature: 0.2,
    timeoutMs: 30_000,
  });
  if (!result.ok) return { ok: false, message: messageForVocabReason(result.reason) };
  return { ok: true, value: toWordList({ words: parseVocabCandidates(result.text) }) };
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
    case "overloaded":
      return "AIが いま こんで います（Google 側の 混雑）。少し 待って もう一度 ためしてください。";
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
function buildWordStage(stage: Stage, wordIds: readonly string[], label: string): StoredWordStage {
  const title = stage.title.trim();
  /*
   * 見出しは **ステージの 名前 そのもの**（2026-08-20 の指定「のことばは 冗長」）。
   * 語は **持たずに 指す**（`wordIds`）。語の 正は content/vocab の 1つだけ。
   * セット名（`label`）を 付けると、学習者の 画面でも 分かれて 出る（願い #203）。
   */
  return {
    kind: "wordstage",
    id: nextWordStageId(stage),
    title: title.length > 0 ? title : "この ステージの ことば",
    description: "この ステージに 出てくる しごとの ことばと ITの ことばです。",
    ...(label.length > 0 ? { label } : {}),
    fieldSequence: [...FIELD_SEQUENCE],
    questionCount: Math.min(wordIds.length, 10),
    passRate: PASS_RATE,
    wordIds: [...wordIds],
  };
}

/**
 * いまある セットに 足す。**語は 参照で 持つ**（`wordIds`）ので、
 * 読み出しの かたち（`words`）は 落として 保存の かたちに 戻す。
 * 出題数は 語数を 超えられない（スキーマの superRefine）。
 */
function appendToSet(set: WordStage, wordIds: readonly string[]): StoredWordStage {
  const { words: _words, ...rest } = set;
  const ids = [...new Set(wordIds)];
  return {
    ...rest,
    kind: "wordstage",
    questionCount: Math.min(set.questionCount, ids.length),
    wordIds: ids,
  };
}

/** 抜き出した ことばを、正の かたちに 直す。 */
function toVocabWord(word: VocabCandidate, existing: readonly VocabWord[]): VocabWord {
  return {
    id: vocabIdFor(word, existing),
    term: word.term,
    reading: word.reading,
    romaji: word.romaji,
    meaningJa: word.explanationJa,
    englishTerm: word.meaningEn,
    example: word.example,
    wrongMeanings: word.wrongMeanings,
  };
}

/**
 * 正に 入れる ときの 語ID。**あとから 変えない**（`mastery` の 保存キー）。
 * すでに 同じ id が あれば 番号を 足す。
 */
function vocabIdFor(word: VocabCandidate, existing: readonly VocabWord[]): string {
  const base = slug(word.romaji ?? word.id) || "kotoba";
  let id = base;
  let n = 2;
  while (existing.some((w) => w.id === id)) {
    id = `${base}${n}`;
    n += 1;
  }
  return id;
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
