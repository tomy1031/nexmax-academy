"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Article,
  Content,
  ContentRefType,
  Listening,
  Manga,
  QuizSet,
  Stage,
} from "@/content/schema";
import { contentHref } from "@/components/article/article-blocks";
import { AdminError, AdminLoading, AdminPageFrame } from "@/components/admin/admin-ui";
import { collectLearnerTexts } from "@/lib/content-checks";
import { fetchOwnProfile } from "@/lib/profile-db";
import { createClient } from "@/lib/supabase/client";
import { ArticleEditor } from "./article-editor";
import { emptyArticle, emptyManga, emptyQuizSet, emptyStage } from "./drafts";
import { EditorFrame } from "./editor-frame";
import { DB_PREPARING_MESSAGE, type SaveIssue } from "./issue-text";
import { emptyListening } from "./listening-drafts";
import { ListeningEditor } from "./listening-editor";
import { MangaEditor } from "./manga-editor";
import { QuizEditor } from "./quiz-editor";
import { StageEditor, type RefOption } from "./stage-editor";
import {
  deleteContent,
  fetchDbList,
  saveContent,
  type DbEntry,
  type DbListResult,
} from "./studio-api";
import { MiniButton, Toast } from "./studio-ui";

/**
 * コンテンツスタジオの外枠（設計07 §10.1）
 *
 * 一覧（git由来＋DB由来）とエディタ5種を1画面で行き来する。
 * 認可は /admin と同じ流儀でクライアント側でも確かめるが、実際の関所はAPIとRLS。
 * Supabase 未設定のローカル開発でも git 由来の教材を開いて確認できるようにしてある
 *（保存・公開だけが「じゅんびちゅう」になる — 設計07 §11.1）。
 */

export interface StudioShellProps {
  stages: Stage[];
  mangas: Manga[];
  articles: Article[];
  quizSets: QuizSet[];
  listenings: Listening[];
}

type TabKey = "stage" | "manga" | "article" | "quizset" | "listening";

const TABS: readonly { key: TabKey; label: string; emoji: string }[] = [
  { key: "stage", label: "ステージ", emoji: "🗺️" },
  { key: "manga", label: "まんが", emoji: "📖" },
  { key: "article", label: "よみもの", emoji: "📄" },
  { key: "quizset", label: "もんだい", emoji: "✏️" },
  { key: "listening", label: "リスニング", emoji: "🎧" },
];

type View =
  | { mode: "list" }
  | { mode: "stage"; draft: Stage }
  | { mode: "manga"; draft: Manga }
  | { mode: "article"; draft: Article }
  | { mode: "quizset"; draft: QuizSet }
  | { mode: "listening"; draft: Listening };

type Gate = "checking" | "ready" | "unconfigured" | "error";

interface Row {
  id: string;
  title: string;
  description: string;
  /** DBに同じIDがあるか（あればDB版が学習者に出る）。 */
  dbStatus: "draft" | "published" | null;
  href: string;
  open: () => void;
  /**
   * けす（DB版だけ）。git の JSON で作った教材はリポジトリのファイルなので、
   * スタジオからは消せない。押せるボタンを出すと「押しても消えない」になる。
   */
  remove: (() => void) | null;
}

export function StudioShell({ stages, mangas, articles, quizSets, listenings }: StudioShellProps) {
  const router = useRouter();
  const [gate, setGate] = useState<Gate>("checking");
  const [gateError, setGateError] = useState<string | null>(null);
  const [db, setDb] = useState<DbListResult | null>(null);
  const [tab, setTab] = useState<TabKey>("stage");
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

  const refOptions = useMemo<RefOption[]>(() => {
    const options: RefOption[] = [
      ...mangas.map((item) => ({
        id: item.id,
        type: "manga" as ContentRefType,
        title: item.title,
      })),
      ...articles.map((item) => ({
        id: item.id,
        type: "article" as ContentRefType,
        title: item.title,
      })),
      ...quizSets.map((item) => ({
        id: item.id,
        type: "quizset" as ContentRefType,
        title: item.title,
      })),
      ...listenings.map((item) => ({
        id: item.id,
        type: "listening" as ContentRefType,
        title: item.title,
      })),
    ];
    for (const entry of dbEntries) {
      const kind = entry.content.kind;
      if (kind === "manga" || kind === "article" || kind === "quizset" || kind === "listening") {
        if (!options.some((option) => option.id === entry.content.id && option.type === kind)) {
          options.push({ id: entry.content.id, type: kind, title: entry.content.title });
        }
      }
    }
    return options;
  }, [mangas, articles, quizSets, listenings, dbEntries]);

  /**
   * 教材ID → 学習者が読む文（ステージ編集の「ことばを ぬき出す」へ渡す）。
   *
   * ステージが持っているのは参照先のIDだけなので、本文はここで集める。
   * git ∪ DB の全教材を持っているのは shell だけ。集め方は検査・ふりがな編集と
   * 同じ collectLearnerTexts を使う——別の集め方をすると、同じステージなのに
   * 画面ごとに違う本文を見ることになる。
   *
   * DB版が git 版に勝つのは一覧と同じ（学習者に出るのは DB版のほう）。
   */
  const textsByRef = useMemo<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {};
    for (const item of [...mangas, ...articles, ...quizSets, ...listenings]) {
      map[item.id] = collectLearnerTexts(item);
    }
    for (const entry of dbEntries) {
      map[entry.content.id] = collectLearnerTexts(entry.content);
    }
    return map;
  }, [mangas, articles, quizSets, listenings, dbEntries]);

  const dbStatusOf = useCallback(
    (kind: string, id: string) =>
      dbEntries.find((entry) => entry.content.kind === kind && entry.content.id === id)?.status ??
      null,
    [dbEntries],
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
      // 一覧の元になる git ∪ DB（公開分）はサーバで組んで props で来る（studio/page.tsx）。
      // DB側だけ読み直しても、いま消した教材は props に残ったままなので、行が消えず
      // 「DB版（こうかい）」から「git版」に化ける。サーバも読み直して幽霊の行を消す。
      router.refresh();
    },
    [refreshDb, router],
  );

  const rows = useMemo<Row[]>(() => {
    // 別の教材を開いたら、前の教材の「なおすところ」と「気づき」は消す
    //（残ると、いま開いている教材の指摘だと思って直しに行くことになる）。
    const clearNotes = () => {
      setIssues([]);
      setWarnings([]);
    };
    const openStage = (draft: Stage) => () => {
      clearNotes();
      setView({ mode: "stage", draft });
    };
    const openManga = (draft: Manga) => () => {
      clearNotes();
      setView({ mode: "manga", draft });
    };
    const openArticle = (draft: Article) => () => {
      clearNotes();
      setView({ mode: "article", draft });
    };
    const openQuizSet = (draft: QuizSet) => () => {
      clearNotes();
      setView({ mode: "quizset", draft });
    };
    const openListening = (draft: Listening) => () => {
      clearNotes();
      setView({ mode: "listening", draft });
    };

    /** DB版のときだけ「けす」を渡す（git版は消せない）。 */
    const removeAction = (kind: Content["kind"], item: { id: string; title: string }) =>
      dbStatusOf(kind, item.id) ? () => void removeFromDb(item.id, item.title) : null;

    const fromDb = <K extends Content["kind"]>(kind: K): Extract<Content, { kind: K }>[] =>
      dbEntries
        .map((entry) => entry.content)
        .filter((content): content is Extract<Content, { kind: K }> => content.kind === kind);

    switch (tab) {
      case "stage": {
        const merged = mergeById(stages, fromDb("stage"));
        return merged.map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description,
          dbStatus: dbStatusOf("stage", item.id),
          href: `/stage/${item.id}`,
          open: openStage(item),
          remove: removeAction("stage", item),
        }));
      }
      case "manga": {
        const merged = mergeById(mangas, fromDb("manga"));
        return merged.map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description,
          dbStatus: dbStatusOf("manga", item.id),
          href: contentHref("manga", item.id),
          open: openManga(item),
          remove: removeAction("manga", item),
        }));
      }
      case "article": {
        const merged = mergeById(articles, fromDb("article"));
        return merged.map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description,
          dbStatus: dbStatusOf("article", item.id),
          href: contentHref("article", item.id),
          open: openArticle(item),
          remove: removeAction("article", item),
        }));
      }
      case "quizset": {
        const merged = mergeById(quizSets, fromDb("quizset"));
        return merged.map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description,
          dbStatus: dbStatusOf("quizset", item.id),
          href: contentHref("quizset", item.id),
          open: openQuizSet(item),
          remove: removeAction("quizset", item),
        }));
      }
      case "listening": {
        const merged = mergeById(listenings, fromDb("listening"));
        return merged.map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description,
          dbStatus: dbStatusOf("listening", item.id),
          href: contentHref("listening", item.id),
          open: openListening(item),
          remove: removeAction("listening", item),
        }));
      }
    }
  }, [tab, stages, mangas, articles, quizSets, listenings, dbEntries, dbStatusOf, removeFromDb]);

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
    },
    [view, refreshDb],
  );

  if (gate === "checking") return <AdminLoading />;
  if (gate === "error") return <AdminError message={gateError ?? "unknown"} />;

  const backToList = () => {
    setIssues([]);
    setWarnings([]);
    setView({ mode: "list" });
  };

  return (
    <AdminPageFrame>
      <div className="mx-auto max-w-[96rem] space-y-4">
        <header className="card-island flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-ink-soft text-xs font-black">Nexmax Academy</p>
            <h1 className="text-navy text-2xl font-black">コンテンツスタジオ</h1>
          </div>
          <nav className="flex flex-wrap items-center gap-3 text-sm font-black">
            <Link href="/admin" className="text-sky underline underline-offset-4">
              管理ダッシュボード
            </Link>
            <Link href="/map" className="text-sky underline underline-offset-4">
              マップへ
            </Link>
          </nav>
        </header>

        {preparingNote ? (
          <p
            role="status"
            className="rounded-2xl border-2 bg-white p-4 text-sm font-black"
            style={{ borderColor: "var(--color-sun)", color: "var(--color-ink)" }}
          >
            {preparingNote}
          </p>
        ) : null}

        {view.mode === "list" ? (
          <ListView
            tab={tab}
            onTab={setTab}
            rows={rows}
            onNew={{
              stage: () => setView({ mode: "stage", draft: emptyStage() }),
              manga: () => setView({ mode: "manga", draft: emptyManga() }),
              article: () => setView({ mode: "article", draft: emptyArticle() }),
              quizset: () => setView({ mode: "quizset", draft: emptyQuizSet() }),
              listening: () => setView({ mode: "listening", draft: emptyListening() }),
            }}
          />
        ) : null}

        {view.mode === "stage" ? (
          <EditorFrame
            title={view.draft.title.length > 0 ? view.draft.title : "あたらしい ステージ"}
            hint="ステージ＝コンテンツの入れ物と順序です。"
            onBack={backToList}
            onSave={(publish) => void handleSave(publish)}
            saving={saving}
            disabledNote={db && !db.ok ? db.message : null}
            issues={issues}
          >
            <SaveWarnings notices={warnings} />
            <StageEditor
              value={view.draft}
              refOptions={refOptions}
              textsByRef={textsByRef}
              onChange={(draft) => setView({ mode: "stage", draft })}
            />
          </EditorFrame>
        ) : null}

        {view.mode === "manga" ? (
          <EditorFrame
            title={view.draft.title.length > 0 ? view.draft.title : "あたらしい まんが"}
            hint="セリフは画像に焼き込まず、データで持ちます。"
            onBack={backToList}
            onSave={(publish) => void handleSave(publish)}
            saving={saving}
            disabledNote={db && !db.ok ? db.message : null}
            issues={issues}
          >
            <SaveWarnings notices={warnings} />
            <MangaEditor
              value={view.draft}
              onChange={(draft) => setView({ mode: "manga", draft })}
            />
          </EditorFrame>
        ) : null}

        {view.mode === "article" ? (
          <EditorFrame
            title={view.draft.title.length > 0 ? view.draft.title : "あたらしい よみもの"}
            hint="右のプレビューが 学習者に見える画面です。"
            onBack={backToList}
            onSave={(publish) => void handleSave(publish)}
            saving={saving}
            disabledNote={db && !db.ok ? db.message : null}
            issues={issues}
          >
            <SaveWarnings notices={warnings} />
            <ArticleEditor
              value={view.draft}
              onChange={(draft) => setView({ mode: "article", draft })}
            />
          </EditorFrame>
        ) : null}

        {view.mode === "quizset" ? (
          <EditorFrame
            title={view.draft.title.length > 0 ? view.draft.title : "あたらしい もんだい"}
            hint="「じぶんで 日本語を 出す」フェーズには えらぶ もんだいを 置けません。"
            onBack={backToList}
            onSave={(publish) => void handleSave(publish)}
            saving={saving}
            disabledNote={db && !db.ok ? db.message : null}
            issues={issues}
          >
            <SaveWarnings notices={warnings} />
            <QuizEditor
              value={view.draft}
              onChange={(draft) => setView({ mode: "quizset", draft })}
            />
          </EditorFrame>
        ) : null}

        {view.mode === "listening" ? (
          <EditorFrame
            title={view.draft.title.length > 0 ? view.draft.title : "あたらしい リスニング"}
            hint="さがす ことばは 台本に 出てくる ものだけに します。"
            onBack={backToList}
            onSave={(publish) => void handleSave(publish)}
            saving={saving}
            disabledNote={db && !db.ok ? db.message : null}
            issues={issues}
          >
            <SaveWarnings notices={warnings} />
            <ListeningEditor
              value={view.draft}
              onChange={(draft) => setView({ mode: "listening", draft })}
            />
          </EditorFrame>
        ) : null}
      </div>

      {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}
    </AdminPageFrame>
  );
}

/**
 * 保存できたあとの 気づき（参照切れなど）。
 *
 * 保存は通っているので、赤い「なおすところ」とは 分けて 出す。直さなくても
 * 保存はできる——ただし まだ無いIDを指したまま 公開すると、そのカードは
 * 学習者の画面に 出てこない（stage/[id] が 参照切れを 一覧から 外すため）。
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

function ListView({
  tab,
  onTab,
  rows,
  onNew,
}: {
  tab: TabKey;
  onTab: (tab: TabKey) => void;
  rows: readonly Row[];
  onNew: {
    stage: () => void;
    manga: () => void;
    article: () => void;
    quizset: () => void;
    listening: () => void;
  };
}) {
  return (
    <div className="space-y-4">
      <div className="card-island flex flex-wrap items-center justify-between gap-3 p-4">
        <nav aria-label="コンテンツの種類" className="flex flex-wrap gap-2">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onTab(item.key)}
              aria-pressed={tab === item.key}
              className={`rounded-full border-2 px-4 py-2 text-sm font-black ${
                tab === item.key
                  ? "bg-navy border-navy text-white"
                  : "border-hairline text-ink bg-white"
              }`}
            >
              <span aria-hidden className="mr-1">
                {item.emoji}
              </span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onNew.stage}
            className="btn-game px-4 py-2 text-sm [--btn-face:#004f8d] [--btn-shadow:#003c6b]"
          >
            ＋ ステージ
          </button>
          <button
            type="button"
            onClick={onNew.manga}
            className="btn-island btn-game px-4 py-2 text-sm"
          >
            ＋ 漫画
          </button>
          <button
            type="button"
            onClick={onNew.article}
            className="btn-game px-4 py-2 text-sm [--btn-face:#0288d1] [--btn-shadow:#0272ae]"
          >
            ＋ 記事
          </button>
          <button
            type="button"
            onClick={onNew.quizset}
            className="btn-game px-4 py-2 text-sm [--btn-face:#58c273] [--btn-shadow:#3aa458]"
          >
            ＋ もんだい
          </button>
          <button
            type="button"
            onClick={onNew.listening}
            className="btn-game px-4 py-2 text-sm [--btn-face:#a78bfa] [--btn-shadow:#8d6ae8]"
          >
            ＋ リスニング
          </button>
        </div>
      </div>

      <section className="card-island p-4 sm:p-5">
        {rows.length === 0 ? (
          <p className="text-ink-soft font-bold">まだ ありません。右上の「＋」から 作れます。</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li
                key={row.id}
                className="border-hairline flex flex-wrap items-center gap-3 rounded-2xl border-2 bg-white p-3"
              >
                <div className="min-w-[12rem] flex-1">
                  <p className="text-navy font-black">{row.title}</p>
                  <p className="text-ink-soft line-clamp-1 text-xs font-bold">{row.description}</p>
                  <p className="text-ink-faint text-xs font-bold">{row.id}</p>
                </div>
                {row.dbStatus ? (
                  <span
                    className="rounded-full px-3 py-1 text-xs font-black text-white"
                    style={{
                      background:
                        row.dbStatus === "published"
                          ? "var(--color-leaf-deep)"
                          : "var(--color-sun-deep)",
                    }}
                  >
                    {row.dbStatus === "published" ? "DB版（こうかい）" : "DB版（したがき）"}
                  </span>
                ) : (
                  <span className="border-hairline text-ink-soft rounded-full border-2 px-3 py-1 text-xs font-black">
                    git版
                  </span>
                )}
                <Link
                  href={row.href}
                  className="border-hairline text-navy rounded-full border-2 bg-white px-4 py-1.5 text-xs font-black"
                >
                  見る
                </Link>
                <button
                  type="button"
                  onClick={row.open}
                  className="btn-game px-4 py-1.5 text-xs [--btn-face:#004f8d] [--btn-shadow:#003c6b]"
                >
                  編集
                </button>
                {row.remove ? (
                  <MiniButton tone="danger" onClick={row.remove} title={`${row.title}をけす`}>
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
