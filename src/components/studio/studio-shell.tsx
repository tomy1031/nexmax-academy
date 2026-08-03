"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Article, Content, ContentRefType, Manga, Stage } from "@/content/schema";
import { contentHref } from "@/components/article/article-blocks";
import { AdminError, AdminLoading, AdminPageFrame } from "@/components/admin/admin-ui";
import { fetchOwnProfile } from "@/lib/profile-db";
import { createClient } from "@/lib/supabase/client";
import { ArticleEditor } from "./article-editor";
import { emptyArticle, emptyManga, emptyStage } from "./drafts";
import { EditorFrame } from "./editor-frame";
import { DB_PREPARING_MESSAGE, type SaveIssue } from "./issue-text";
import { MangaEditor } from "./manga-editor";
import { StageEditor, type RefOption } from "./stage-editor";
import { fetchDbList, saveContent, type DbEntry, type DbListResult } from "./studio-api";
import { Toast } from "./studio-ui";

/**
 * コンテンツスタジオの外枠（設計07 §10.1）
 *
 * 一覧（git由来＋DB由来）とエディタ3種を1画面で行き来する。
 * 認可は /admin と同じ流儀でクライアント側でも確かめるが、実際の関所はAPIとRLS。
 * Supabase 未設定のローカル開発でも git 由来の教材を開いて確認できるようにしてある
 *（保存・公開だけが「じゅんびちゅう」になる — 設計07 §11.1）。
 */

export interface ContentSummary {
  id: string;
  title: string;
  description: string;
}

export interface StudioShellProps {
  stages: Stage[];
  mangas: Manga[];
  articles: Article[];
  quizSets: ContentSummary[];
  meetings: ContentSummary[];
}

type TabKey = "stage" | "manga" | "article" | "quizset" | "meeting";

const TABS: readonly { key: TabKey; label: string; emoji: string }[] = [
  { key: "stage", label: "ステージ", emoji: "🗺️" },
  { key: "manga", label: "まんが", emoji: "📖" },
  { key: "article", label: "よみもの", emoji: "📄" },
  { key: "quizset", label: "もんだい", emoji: "✏️" },
  { key: "meeting", label: "ミーティング", emoji: "🎧" },
];

type View =
  | { mode: "list" }
  | { mode: "stage"; draft: Stage }
  | { mode: "manga"; draft: Manga }
  | { mode: "article"; draft: Article };

type Gate = "checking" | "ready" | "unconfigured" | "error";

interface Row {
  id: string;
  title: string;
  description: string;
  /** DBに同じIDがあるか（あればDB版が学習者に出る）。 */
  dbStatus: "draft" | "published" | null;
  href: string;
  /** エディタで開けるか（stage / manga / article だけ）。 */
  open: (() => void) | null;
}

export function StudioShell({ stages, mangas, articles, quizSets, meetings }: StudioShellProps) {
  const router = useRouter();
  const [gate, setGate] = useState<Gate>("checking");
  const [gateError, setGateError] = useState<string | null>(null);
  const [db, setDb] = useState<DbListResult | null>(null);
  const [tab, setTab] = useState<TabKey>("stage");
  const [view, setView] = useState<View>({ mode: "list" });
  const [issues, setIssues] = useState<SaveIssue[]>([]);
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
      ...meetings.map((item) => ({
        id: item.id,
        type: "meeting" as ContentRefType,
        title: item.title,
      })),
    ];
    for (const entry of dbEntries) {
      const kind = entry.content.kind;
      if (kind === "manga" || kind === "article" || kind === "quizset" || kind === "meeting") {
        if (!options.some((option) => option.id === entry.content.id && option.type === kind)) {
          options.push({ id: entry.content.id, type: kind, title: entry.content.title });
        }
      }
    }
    return options;
  }, [mangas, articles, quizSets, meetings, dbEntries]);

  const dbStatusOf = useCallback(
    (kind: string, id: string) =>
      dbEntries.find((entry) => entry.content.kind === kind && entry.content.id === id)?.status ??
      null,
    [dbEntries],
  );

  const rows = useMemo<Row[]>(() => {
    const openStage = (draft: Stage) => () => {
      setIssues([]);
      setView({ mode: "stage", draft });
    };
    const openManga = (draft: Manga) => () => {
      setIssues([]);
      setView({ mode: "manga", draft });
    };
    const openArticle = (draft: Article) => () => {
      setIssues([]);
      setView({ mode: "article", draft });
    };

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
          open: null,
        }));
      }
      case "meeting": {
        const merged = mergeById(meetings, fromDb("meeting"));
        return merged.map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description,
          dbStatus: dbStatusOf("meeting", item.id),
          href: contentHref("meeting", item.id),
          open: null,
        }));
      }
    }
  }, [tab, stages, mangas, articles, quizSets, meetings, dbEntries, dbStatusOf]);

  const handleSave = useCallback(
    async (publish: boolean) => {
      if (view.mode === "list") return;
      const draft: Content = view.draft;
      setSaving(true);
      const result = await saveContent(draft, publish);
      setSaving(false);
      if (!result.ok) {
        setIssues(result.issues);
        setToast({ message: result.message, tone: "ng" });
        return;
      }
      setIssues([]);
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
            <StageEditor
              value={view.draft}
              refOptions={refOptions}
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
            <ArticleEditor
              value={view.draft}
              onChange={(draft) => setView({ mode: "article", draft })}
            />
          </EditorFrame>
        ) : null}
      </div>

      {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}
    </AdminPageFrame>
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
  onNew: { stage: () => void; manga: () => void; article: () => void };
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
                {row.open ? (
                  <button
                    type="button"
                    onClick={row.open}
                    className="btn-game px-4 py-1.5 text-xs [--btn-face:#004f8d] [--btn-shadow:#003c6b]"
                  >
                    編集
                  </button>
                ) : (
                  <span className="text-ink-faint text-xs font-bold">
                    このエディタは まだ ありません
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
