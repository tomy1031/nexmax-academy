"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Article,
  Character,
  Content,
  ContentRefType,
  Listening,
  Manga,
  QuizSet,
  Scenario,
  Stage,
  WordStage,
} from "@/content/schema";
import { AdminError, AdminHeader, AdminLoading, AdminPageFrame } from "@/components/admin/admin-ui";
import { collectLearnerTexts } from "@/lib/content-checks";
import { contentKindMeta } from "@/lib/content-kinds";
import { termOwners } from "@/lib/dictionary";
import { sortStages } from "@/lib/map-data";
import { fetchOwnProfile } from "@/lib/profile-db";
import { createClient } from "@/lib/supabase/client";
import { ArticleEditor } from "./article-editor";
import { CharacterEditor } from "./character-editor";
import {
  emptyArticle,
  emptyCharacter,
  emptyManga,
  emptyQuizSet,
  emptyStage,
  emptyWordStage,
  nextContentId,
} from "./drafts";
import { EditorFrame } from "./editor-frame";
import { DB_PREPARING_MESSAGE, type SaveIssue } from "./issue-text";
import { emptyListening } from "./listening-drafts";
import { ListeningEditor } from "./listening-editor";
import { MangaEditor } from "./manga-editor";
import { QuizEditor } from "./quiz-editor";
import { StageEditor, type RefOption } from "./stage-editor";
import { StageList } from "./stage-list";
import {
  deleteContent,
  fetchDbList,
  saveContent,
  type DbEntry,
  type DbListResult,
} from "./studio-api";
import { DictionaryView } from "./dictionary-view";
import { MiniButton, SourceBadge, Toast } from "./studio-ui";
import { WordStageEditor } from "./word-stage-editor";

/**
 * コンテンツスタジオの外枠（設計07 §10.1）
 *
 * 管理画面のサイドバーから3つの入口に分かれる:
 *  - **ステージ**（stages）… 学習の ながれ を作る。ふだんの作業はここ。
 *  - **きょうざい**（contents）… 教材そのものの一覧。どのステージにも入っていない
 *    ものを探すときに使う。
 *  - **ことば・辞書**（words）… 単語ステージと、それを畳んだ辞書。
 *
 * 教材は**ステージの中から作れる**（設計の要）。別画面で作ってから
 * ステージにIDを打ち込む作り方だと、打ちまちがいが必ず起き、しかも気づくのは
 * 学習者がタップして 404 を見たときになる。だから子のエディタは
 * 「どのステージから来たか」（parent）を持って開き、閉じるとそこへ戻る。
 *
 * 認可は /admin と同じ流儀でクライアント側でも確かめるが、実際の関所はAPIとRLS。
 * Supabase 未設定のローカル開発でも git 由来の教材を開いて確認できるようにしてある
 *（保存・公開だけが「じゅんびちゅう」になる — 設計07 §11.1）。
 */

export type StudioSection = "stages" | "contents" | "words" | "characters";

export interface StudioShellProps {
  section: StudioSection;
  stages: Stage[];
  mangas: Manga[];
  articles: Article[];
  quizSets: QuizSet[];
  listenings: Listening[];
  scenarios: Scenario[];
  wordStages: WordStage[];
  characters: Character[];
}

/** きょうざい一覧のタブ。 */
type ContentTab = "manga" | "article" | "quizset" | "listening" | "scenario";

const CONTENT_TABS: readonly ContentTab[] = [
  "manga",
  "article",
  "quizset",
  "listening",
  "scenario",
];

/**
 * 編集中の1件。`parent` は「このステージの中から作った／開いた」という記憶で、
 * 閉じるときの戻り先になる。
 */
type View =
  | { mode: "list" }
  | { mode: "stage"; draft: Stage }
  | { mode: "manga"; draft: Manga; parent?: Stage }
  | { mode: "article"; draft: Article; parent?: Stage }
  | { mode: "quizset"; draft: QuizSet; parent?: Stage }
  | { mode: "listening"; draft: Listening; parent?: Stage }
  | { mode: "wordstage"; draft: WordStage; parent?: Stage }
  | { mode: "character"; draft: Character };

type Gate = "checking" | "ready" | "unconfigured" | "error";

const SECTION_META: Record<StudioSection, { title: string; note: string }> = {
  stages: {
    title: "🗺️ ステージ",
    note: "学習の ながれ を つくります。並びは そのまま マップの順です。",
  },
  contents: {
    title: "📚 きょうざい",
    note: "教材そのものの 一覧です。ふだんは ステージの中から 作れます。",
  },
  words: { title: "🕹️ ことば・辞書", note: "単語ステージと、それを 畳んだ 辞書です。" },
  characters: {
    title: "🧑 とうじょう人物",
    note: "まんがと リスニングで つかいまわす 人。設定画を 作ると 絵が ぶれません。",
  },
};

export function StudioShell({
  section,
  stages,
  mangas,
  articles,
  quizSets,
  listenings,
  scenarios,
  wordStages,
  characters,
}: StudioShellProps) {
  const router = useRouter();
  const [gate, setGate] = useState<Gate>("checking");
  const [gateError, setGateError] = useState<string | null>(null);
  const [db, setDb] = useState<DbListResult | null>(null);
  const [tab, setTab] = useState<ContentTab>("manga");
  const [view, setView] = useState<View>({ mode: "list" });
  const [issues, setIssues] = useState<SaveIssue[]>([]);
  /** 保存は通ったが 見てほしい こと（参照切れなど）。「なおすところ」とは 分けて出す。 */
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "ok" | "ng" } | null>(null);

  const refreshDb = useCallback(async () => {
    setDb(await fetchDbList());
  }, []);

  // 認可（/admin と同じ流儀）。Supabase 未設定のときだけ「じゅんびちゅう」で通す。
  useEffect(() => {
    let active = true;
    void (async () => {
      const supabase = createClient();
      if (!supabase) {
        if (active) {
          setGate("unconfigured");
          setDb({ ok: false, preparing: true, message: DB_PREPARING_MESSAGE });
        }
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/welcome");
        return;
      }
      try {
        const profile = await fetchOwnProfile();
        if (!active) return;
        if (!profile) {
          router.replace("/welcome");
          return;
        }
        if (!profile.is_admin) {
          router.replace("/map");
          return;
        }
        setGate("ready");
        await refreshDb();
      } catch (error) {
        if (!active) return;
        setGateError(error instanceof Error ? error.message : String(error));
        setGate("error");
      }
    })();
    return () => {
      active = false;
    };
  }, [router, refreshDb]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const dbEntries = useMemo<DbEntry[]>(() => (db?.ok ? db.entries : []), [db]);
  const preparingNote = db && !db.ok ? db.message : null;

  /** git ∪ DB。同じIDは1つにまとめる（DB版が学習者に出るので勝つ）。 */
  const merged = useMemo(() => {
    const fromDb = <K extends Content["kind"]>(kind: K): Extract<Content, { kind: K }>[] =>
      dbEntries
        .map((entry) => entry.content)
        .filter((content): content is Extract<Content, { kind: K }> => content.kind === kind);
    return {
      stage: mergeById(stages, fromDb("stage")),
      manga: mergeById(mangas, fromDb("manga")),
      article: mergeById(articles, fromDb("article")),
      quizset: mergeById(quizSets, fromDb("quizset")),
      listening: mergeById(listenings, fromDb("listening")),
      scenario: mergeById(scenarios, fromDb("scenario")),
      wordstage: mergeById(wordStages, fromDb("wordstage")),
      character: mergeById(characters, fromDb("character")),
    };
  }, [
    stages,
    mangas,
    articles,
    quizSets,
    listenings,
    scenarios,
    wordStages,
    characters,
    dbEntries,
  ]);

  /** 「もう ある ものから えらぶ」の候補（全種別）。 */
  const library = useMemo<RefOption[]>(
    () =>
      (
        [
          ["manga", merged.manga],
          ["article", merged.article],
          ["quizset", merged.quizset],
          ["listening", merged.listening],
          ["scenario", merged.scenario],
          ["wordstage", merged.wordstage],
        ] as const
      ).flatMap(([type, items]) =>
        items.map((item) => ({ id: item.id, type: type as ContentRefType, title: item.title })),
      ),
    [merged],
  );

  /** 保存ずみのID。ステージの ながれ で「まだ ほぞんして いません」を出すのに使う。 */
  const knownIds = useMemo(() => new Set(library.map((item) => item.id)), [library]);

  /** すでに どこかの単語ステージに ある ことば（重複を先生に知らせる）。 */
  const knownTerms = useMemo(() => termOwners(merged.wordstage), [merged.wordstage]);

  /**
   * 教材ID → 学習者が読む文（ステージ編集の「ことばを ぬき出す」へ渡す）。
   *
   * ステージが持っているのは参照先のIDだけなので、本文はここで集める。
   * git ∪ DB の全教材を持っているのは shell だけ。集め方は検査・ふりがな編集と
   * 同じ collectLearnerTexts を使う——別の集め方をすると、同じステージなのに
   * 画面ごとに違う本文を見ることになる。
   */
  const textsByRef = useMemo<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {};
    for (const item of [
      ...merged.manga,
      ...merged.article,
      ...merged.quizset,
      ...merged.listening,
    ]) {
      map[item.id] = collectLearnerTexts(item);
    }
    return map;
  }, [merged]);

  const dbStatusOf = useCallback(
    (kind: string, id: string) =>
      dbEntries.find((entry) => entry.content.kind === kind && entry.content.id === id)?.status ??
      null,
    [dbEntries],
  );

  const clearNotes = useCallback(() => {
    setIssues([]);
    setWarnings([]);
  }, []);

  /** どの種別でも「その1件を開く」入口を1つにする（開き方が種別ごとに散らない）。 */
  const openContent = useCallback(
    (id: string, type: ContentRefType, parent?: Stage) => {
      clearNotes();
      const find = <T extends { id: string }>(items: readonly T[]) =>
        items.find((item) => item.id === id);
      switch (type) {
        case "manga": {
          const draft = find(merged.manga);
          if (draft) setView({ mode: "manga", draft, parent });
          return;
        }
        case "article": {
          const draft = find(merged.article);
          if (draft) setView({ mode: "article", draft, parent });
          return;
        }
        case "quizset": {
          const draft = find(merged.quizset);
          if (draft) setView({ mode: "quizset", draft, parent });
          return;
        }
        case "listening": {
          const draft = find(merged.listening);
          if (draft) setView({ mode: "listening", draft, parent });
          return;
        }
        case "wordstage": {
          const draft = find(merged.wordstage);
          if (draft) setView({ mode: "wordstage", draft, parent });
          return;
        }
        case "scenario":
          // たいわ（scenario）はまだエディタが無い。押しても何も起きないより、理由を出す。
          setToast({
            message:
              "たいわは まだ スタジオで 直せません（content/scenarios の JSON で 作ります）。",
            tone: "ng",
          });
          return;
      }
    },
    [merged, clearNotes],
  );

  /**
   * ステージの中から 新しい教材を作る。
   *
   * ここでステージ側にも参照を足しておく——足さずに子だけ作ると、
   * 作った教材がどこからも開けない「浮いた教材」になる。IDは機械的に決めるので
   * 打ちまちがいで参照切れになることが無い（drafts.nextContentId）。
   */
  const createInStage = useCallback(
    (parent: Stage, type: ContentRefType) => {
      const id = nextContentId(parent.id, type, knownIds);
      const nextParent: Stage = { ...parent, contents: [...parent.contents, { ref: id, type }] };
      clearNotes();
      switch (type) {
        case "manga":
          setView({ mode: "manga", draft: { ...emptyManga(), id }, parent: nextParent });
          return;
        case "article":
          setView({ mode: "article", draft: { ...emptyArticle(), id }, parent: nextParent });
          return;
        case "quizset":
          setView({ mode: "quizset", draft: { ...emptyQuizSet(), id }, parent: nextParent });
          return;
        case "listening":
          setView({ mode: "listening", draft: { ...emptyListening(), id }, parent: nextParent });
          return;
        case "wordstage":
          setView({ mode: "wordstage", draft: { ...emptyWordStage(), id }, parent: nextParent });
          return;
        case "scenario":
          setToast({
            message:
              "たいわは まだ スタジオで 作れません（content/scenarios の JSON で 作ります）。",
            tone: "ng",
          });
          return;
      }
    },
    [knownIds, clearNotes],
  );

  /**
   * DB版を1件けす。
   *
   * 公開中のものを消すと、その場で学習者の画面から消える（ステージが指していれば
   * リンク先が無くなる）。取り消せないので、押した先で必ず1段はさんで確かめる。
   */
  const removeFromDb = useCallback(
    async (id: string, title: string) => {
      const name = title.length > 0 ? title : id;
      if (
        !window.confirm(
          `「${name}」を けしますか。こうかい中の ものは 学習者の 画面から すぐ 消えます。`,
        )
      ) {
        return;
      }
      const result = await deleteContent(id);
      if (!result.ok) {
        setToast({ message: result.message, tone: "ng" });
        return;
      }
      setToast({ message: "けしました。", tone: "ok" });
      await refreshDb();
      // 一覧の元になる git ∪ DB（公開分）はサーバで組んで props で来る。
      // DB側だけ読み直しても、いま消した教材は props に残ったままなので、行が消えず
      // 「DB版（こうかい）」から「git版」に化ける。サーバも読み直して幽霊の行を消す。
      router.refresh();
    },
    [refreshDb, router],
  );

  const handleSave = useCallback(
    async (publish: boolean) => {
      if (view.mode === "list") return;
      const draft: Content = view.draft;
      setSaving(true);
      const result = await saveContent(draft, publish);
      setSaving(false);
      if (!result.ok) {
        setIssues(result.issues);
        setWarnings([]);
        setToast({ message: result.message, tone: "ng" });
        return;
      }
      setIssues([]);
      // 参照切れなどは保存を止めない。ここで受け取って画面に出さないと、
      // 先生は「まだ無いIDを指しています」に一度も気づけない（設計07 §3）。
      setWarnings(result.warnings);
      setToast({
        message: publish ? "こうかいしました。" : "したがきを ほぞんしました。",
        tone: "ok",
      });
      await refreshDb();
      router.refresh();
    },
    [view, refreshDb, router],
  );

  /**
   * ステージの並び替え。となりと ばんごう を入れ替えて、2件とも保存する。
   *
   * 全体を1〜Nに詰め直さないのは、離れたステージまで巻き込んで保存することに
   * なるため（保存は1件ずつのAPIなので、10件並べ替えるたびに10回書くことになる）。
   */
  const reorderStages = useCallback(
    async (index: number, delta: number) => {
      const ordered = sortStages(merged.stage);
      const current = ordered[index];
      const other = ordered[index + delta];
      if (!current || !other) return;
      // 同じ ばんごう だと入れ替えても並びが動かない。位置から作り直す。
      const [a, b] =
        current.order === other.order
          ? [index + 1, index + delta + 1]
          : [other.order, current.order];
      setSaving(true);
      const results = await Promise.all([
        saveContent({ ...current, order: a }, current.status === "published"),
        saveContent({ ...other, order: b }, other.status === "published"),
      ]);
      setSaving(false);
      const failed = results.find((result) => !result.ok);
      if (failed && !failed.ok) {
        setToast({ message: failed.message, tone: "ng" });
        return;
      }
      await refreshDb();
      router.refresh();
    },
    [merged.stage, refreshDb, router],
  );

  if (gate === "checking") return <AdminLoading />;
  if (gate === "error") return <AdminError message={gateError ?? "unknown"} />;

  const meta = SECTION_META[section];
  const backToList = () => {
    clearNotes();
    setView({ mode: "list" });
  };
  /** 子の編集をやめる／おわる。ステージから来ていたら そのステージへ戻る。 */
  const closeChild = (parent: Stage | undefined) => {
    clearNotes();
    setView(parent ? { mode: "stage", draft: parent } : { mode: "list" });
  };

  const editorNote = db && !db.ok ? db.message : null;

  return (
    <AdminPageFrame>
      <AdminHeader title={meta.title} note={meta.note} />
      <div className="space-y-4">
        {preparingNote ? (
          <p
            role="status"
            className="rounded-2xl border-2 bg-white p-4 text-sm font-black"
            style={{ borderColor: "var(--color-sun)", color: "var(--color-ink)" }}
          >
            {preparingNote}
          </p>
        ) : null}

        {view.mode === "list" && section === "stages" ? (
          <StageList
            stages={sortStages(merged.stage)}
            dbStatusOf={dbStatusOf}
            busy={saving}
            onOpen={(stage) => {
              clearNotes();
              setView({ mode: "stage", draft: stage });
            }}
            onNew={() => {
              clearNotes();
              setView({
                mode: "stage",
                draft: { ...emptyStage(), order: merged.stage.length + 1 },
              });
            }}
            onMove={(index, delta) => void reorderStages(index, delta)}
            onRemove={(stage) => void removeFromDb(stage.id, stage.title)}
          />
        ) : null}

        {view.mode === "list" && section === "contents" ? (
          <ContentList
            tab={tab}
            onTab={setTab}
            items={merged[tab]}
            dbStatusOf={dbStatusOf}
            onOpen={(id) => openContent(id, tab)}
            onRemove={(id, title) => void removeFromDb(id, title)}
          />
        ) : null}

        {view.mode === "list" && section === "words" ? (
          <DictionaryView
            wordStages={merged.wordstage}
            dbStatusOf={dbStatusOf}
            onOpen={(id) => openContent(id, "wordstage")}
            onNew={() => {
              clearNotes();
              setView({ mode: "wordstage", draft: emptyWordStage() });
            }}
            onRemove={(id, title) => void removeFromDb(id, title)}
          />
        ) : null}

        {view.mode === "list" && section === "characters" ? (
          <CharacterList
            characters={merged.character}
            dbStatusOf={dbStatusOf}
            onOpen={(id) => {
              const draft = merged.character.find((item) => item.id === id);
              if (!draft) return;
              clearNotes();
              setView({ mode: "character", draft });
            }}
            onNew={() => {
              clearNotes();
              setView({ mode: "character", draft: emptyCharacter() });
            }}
            onRemove={(id, name) => void removeFromDb(id, name)}
          />
        ) : null}

        {view.mode === "character" ? (
          <EditorFrame
            title={view.draft.name.length > 0 ? view.draft.name : "あたらしい 人"}
            hint="設定画（キャラクターシート）を 作ると、まんがの コマで 顔や服が ぶれません。"
            onBack={backToList}
            onSave={(publish) => void handleSave(publish)}
            saving={saving}
            disabledNote={editorNote}
            issues={issues}
          >
            <SaveWarnings notices={warnings} />
            <CharacterEditor
              value={view.draft}
              onChange={(draft) => setView({ mode: "character", draft })}
            />
          </EditorFrame>
        ) : null}

        {view.mode === "stage" ? (
          <EditorFrame
            title={view.draft.title.length > 0 ? view.draft.title : "あたらしい ステージ"}
            hint="① きほん → ② エリアの絵 → ③ ながれ の じゅんに つくります。"
            onBack={backToList}
            onSave={(publish) => void handleSave(publish)}
            saving={saving}
            disabledNote={editorNote}
            issues={issues}
          >
            <SaveWarnings notices={warnings} />
            <StageEditor
              value={view.draft}
              library={library}
              knownIds={knownIds}
              knownTerms={knownTerms}
              textsByRef={textsByRef}
              onChange={(draft) => setView({ mode: "stage", draft })}
              onOpenContent={(ref, type) => openContent(ref, type, view.draft)}
              onCreateContent={(type) => createInStage(view.draft, type)}
            />
          </EditorFrame>
        ) : null}

        {view.mode === "manga" ? (
          <ChildFrame
            title={view.draft.title.length > 0 ? view.draft.title : "あたらしい まんが"}
            hint="セリフは画像に焼き込まず、データで持ちます。"
            parent={view.parent}
            onBack={closeChild}
            onSave={(publish) => void handleSave(publish)}
            saving={saving}
            disabledNote={editorNote}
            issues={issues}
            warnings={warnings}
          >
            <MangaEditor
              value={view.draft}
              cast={merged.character}
              /*
               * すでに作った教材を渡す。AIに「過去の内容を踏まえて」すじがきを
               * 作らせるため（習った語・前の話のおわり）。自分自身は除く——
               * これから作り直すものを「前の話」として渡すと、同じ話になる。
               */
              known={[...merged.wordstage, ...merged.manga].filter(
                (content) => content.id !== view.draft.id,
              )}
              onChange={(draft) => setView({ ...view, draft })}
            />
          </ChildFrame>
        ) : null}

        {view.mode === "article" ? (
          <ChildFrame
            title={view.draft.title.length > 0 ? view.draft.title : "あたらしい よみもの"}
            hint="右のプレビューが 学習者に見える画面です。"
            parent={view.parent}
            onBack={closeChild}
            onSave={(publish) => void handleSave(publish)}
            saving={saving}
            disabledNote={editorNote}
            issues={issues}
            warnings={warnings}
          >
            <ArticleEditor
              value={view.draft}
              /* 習った ことばを AIに ふまえさせる（自分自身は 除く） */
              known={merged.wordstage.filter((c) => c.id !== view.draft.id)}
              onChange={(draft) => setView({ ...view, draft })}
            />
          </ChildFrame>
        ) : null}

        {view.mode === "quizset" ? (
          <ChildFrame
            title={view.draft.title.length > 0 ? view.draft.title : "あたらしい もんだい"}
            hint="「じぶんで 日本語を 出す」フェーズには えらぶ もんだいを 置けません。"
            parent={view.parent}
            onBack={closeChild}
            onSave={(publish) => void handleSave(publish)}
            saving={saving}
            disabledNote={editorNote}
            issues={issues}
            warnings={warnings}
          >
            <QuizEditor
              value={view.draft}
              /* 習った ことばを AIに ふまえさせる（自分自身は 除く） */
              known={merged.wordstage.filter((c) => c.id !== view.draft.id)}
              onChange={(draft) => setView({ ...view, draft })}
            />
          </ChildFrame>
        ) : null}

        {view.mode === "listening" ? (
          <ChildFrame
            title={view.draft.title.length > 0 ? view.draft.title : "あたらしい リスニング"}
            hint="さがす ことばは 台本に 出てくる ものだけに します。"
            parent={view.parent}
            onBack={closeChild}
            onSave={(publish) => void handleSave(publish)}
            saving={saving}
            disabledNote={editorNote}
            issues={issues}
            warnings={warnings}
          >
            <ListeningEditor value={view.draft} onChange={(draft) => setView({ ...view, draft })} />
          </ChildFrame>
        ) : null}

        {view.mode === "wordstage" ? (
          <ChildFrame
            title={view.draft.title.length > 0 ? view.draft.title : "あたらしい 単語ステージ"}
            hint="ここで 直した せつめいが、そのまま 辞書に 出ます。"
            parent={view.parent}
            onBack={closeChild}
            onSave={(publish) => void handleSave(publish)}
            saving={saving}
            disabledNote={editorNote}
            issues={issues}
            warnings={warnings}
          >
            <WordStageEditor value={view.draft} onChange={(draft) => setView({ ...view, draft })} />
          </ChildFrame>
        ) : null}
      </div>

      {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}
    </AdminPageFrame>
  );
}

/**
 * 子の教材のエディタ枠。ステージから来ていたら、戻り先を「そのステージ」にする。
 *
 * 戻り先を一覧に固定すると、ステージの中で3つ教材を作るあいだに3回ステージを
 * 開き直すことになる。しかもその往復で、まだ保存していないステージの下書きが消える。
 */
function ChildFrame({
  title,
  hint,
  parent,
  onBack,
  onSave,
  saving,
  disabledNote,
  issues,
  warnings,
  children,
}: {
  title: string;
  hint: string;
  parent: Stage | undefined;
  onBack: (parent: Stage | undefined) => void;
  onSave: (publish: boolean) => void;
  saving: boolean;
  disabledNote: string | null;
  issues: readonly SaveIssue[];
  warnings: readonly string[];
  children: React.ReactNode;
}) {
  return (
    <EditorFrame
      title={title}
      hint={hint}
      onBack={() => onBack(parent)}
      onSave={onSave}
      saving={saving}
      disabledNote={disabledNote}
      issues={issues}
    >
      {parent ? (
        <p className="bg-panel-tint text-ink rounded-2xl px-4 py-2 text-xs font-black">
          「{parent.title.length > 0 ? parent.title : parent.id}」ステージの 中です。
          <span className="text-ink-soft ml-1 font-bold">
            ほぞんしたら、上の「もどる」で ステージに もどれます。
          </span>
        </p>
      ) : null}
      <SaveWarnings notices={warnings} />
      {children}
    </EditorFrame>
  );
}

/**
 * 保存できたあとの 気づき（参照切れなど）。
 *
 * 保存は通っているので、赤い「なおすところ」とは 分けて 出す。直さなくても
 * 保存はできる——ただし まだ無いIDを指したまま 公開すると、そのカードは
 * 学習者の画面に 出てこない（[stage] のページが 参照切れを 一覧から 外すため）。
 * 「止めないが、必ず気づかせる」ための 置き場（content-checks.ts の checkDanglingRefs）。
 */
function SaveWarnings({ notices }: { notices: readonly string[] }) {
  if (notices.length === 0) return null;
  return (
    <section
      aria-label="見てほしいこと"
      className="rounded-[20px] border-2 bg-white p-4"
      style={{ borderColor: "var(--color-sun)" }}
    >
      <p className="text-navy text-sm font-black">
        ほぞんは できました。{notices.length}件 見てほしい ことが あります
      </p>
      <ul className="mt-2 space-y-2">
        {notices.map((notice, index) => (
          <li key={index} className="bg-panel-tint text-ink rounded-xl px-3 py-2 text-sm font-bold">
            {notice}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** git 由来とDB由来を1つの一覧にする。同じIDは1行にまとめる（表示はDB版が勝つ）。 */
function mergeById<T extends { id: string }>(gitItems: readonly T[], dbItems: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of gitItems) byId.set(item.id, item);
  for (const item of dbItems) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * 教材そのものの一覧。
 *
 * ふだんの作りかたは「ステージの中から作る」なので、ここには「＋」を置かない。
 * 置くと、どのステージにも入らない教材が増え、学習者からは見えないまま溜まる。
 */
function ContentList({
  tab,
  onTab,
  items,
  dbStatusOf,
  onOpen,
  onRemove,
}: {
  tab: ContentTab;
  onTab: (tab: ContentTab) => void;
  items: readonly { id: string; title: string; description?: string }[];
  dbStatusOf: (kind: string, id: string) => "draft" | "published" | null;
  onOpen: (id: string) => void;
  onRemove: (id: string, title: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="card-island flex flex-wrap items-center gap-2 p-4">
        {CONTENT_TABS.map((key) => {
          const meta = contentKindMeta(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onTab(key)}
              aria-pressed={tab === key}
              className={`rounded-full border-2 px-4 py-2 text-sm font-black ${
                tab === key ? "bg-navy border-navy text-white" : "border-hairline text-ink bg-white"
              }`}
            >
              <span aria-hidden className="mr-1">
                {meta.icon}
              </span>
              {meta.label}
            </button>
          );
        })}
      </div>

      <section className="card-island p-4 sm:p-5">
        <p className="text-ink-soft mb-3 text-xs font-bold">
          新しく つくるときは、ステージを ひらいて その中の「＋ ふやす」から つくります （どの
          ステージにも 入っていない 教材は、学習者から 見えません）。
        </p>
        {items.length === 0 ? (
          <p className="text-ink-soft font-bold">まだ ありません。</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="border-hairline flex flex-wrap items-center gap-3 rounded-2xl border-2 bg-white p-3"
              >
                <div className="min-w-[12rem] flex-1">
                  <p className="text-navy font-black">{item.title}</p>
                  <p className="text-ink-soft line-clamp-1 text-xs font-bold">{item.description}</p>
                  <p className="text-ink-faint text-xs font-bold">{item.id}</p>
                </div>
                <SourceBadge status={dbStatusOf(tab, item.id)} />
                <MiniButton tone="accent" onClick={() => onOpen(item.id)}>
                  ✎ ひらく
                </MiniButton>
                {dbStatusOf(tab, item.id) ? (
                  <MiniButton tone="danger" onClick={() => onRemove(item.id, item.title)}>
                    けす
                  </MiniButton>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** とうじょう人物の一覧。 */
function CharacterList({
  characters,
  dbStatusOf,
  onOpen,
  onNew,
  onRemove,
}: {
  characters: readonly Character[];
  dbStatusOf: (kind: string, id: string) => "draft" | "published" | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRemove: (id: string, name: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="card-island flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-ink-soft text-sm font-bold">
          まんがと リスニングで つかいまわす 人です（{characters.length}人）。
        </p>
        <button
          type="button"
          onClick={onNew}
          className="btn-game px-4 py-2 text-sm [--btn-face:#004f8d] [--btn-shadow:#003c6b]"
        >
          ＋ あたらしい 人
        </button>
      </div>

      {characters.length === 0 ? (
        <section className="card-island p-5">
          <p className="text-ink-soft font-bold">
            まだ いません。まんがの コマを 何枚も 作ると、コマごとに 顔や服が 変わって
            しまいます。さきに ここで 人を 作り、設定画を 1枚 用意してください。
          </p>
        </section>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {characters.map((character) => (
            <li
              key={character.id}
              className="border-hairline flex items-start gap-3 rounded-2xl border-2 bg-white p-3"
            >
              {character.sheet.src ? (
                // next/image は外部URLの許可設定が要るため、ここは素の img で出す
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={character.sheet.src}
                  alt=""
                  className="border-hairline h-20 w-20 shrink-0 rounded-lg border-2 object-cover"
                />
              ) : (
                <span className="border-hairline text-ink-faint grid h-20 w-20 shrink-0 place-items-center rounded-lg border-2 border-dashed text-[10px] font-bold">
                  設定画なし
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-navy font-black">
                  <ruby>
                    {character.name}
                    <rt className="text-ink-soft">{character.reading}</rt>
                  </ruby>
                </p>
                <p className="text-ink-soft text-xs font-bold">{character.role}</p>
                <p className="text-ink-faint line-clamp-2 text-xs font-bold">{character.looks}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <SourceBadge status={dbStatusOf("character", character.id)} />
                  <MiniButton tone="accent" onClick={() => onOpen(character.id)}>
                    ✎ ひらく
                  </MiniButton>
                  {dbStatusOf("character", character.id) ? (
                    <MiniButton
                      tone="danger"
                      onClick={() => onRemove(character.id, character.name)}
                    >
                      けす
                    </MiniButton>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
