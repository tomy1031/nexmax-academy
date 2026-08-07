"use client";

/**
 * 「まとめて つくる」の外側
 *
 * git 由来の教材とDB由来（下書きふくむ）を合流させてから `BatchMaker` に渡す。
 * ここを分けているのは、`BatchMaker` を **教材の並びだけ**受け取る形に保つため
 *（そうしておくと、あとでステージ編集の中に同じものを埋め込める）。
 */

import { useCallback, useEffect, useState } from "react";
import { AdminError, AdminHeader, AdminLoading, AdminPageFrame } from "@/components/admin/admin-ui";
import type {
  Article,
  Character,
  Content,
  Listening,
  Manga,
  QuizSet,
  Scenario,
  Stage,
  WordStage,
} from "@/content/schema";
import { BatchMaker } from "./batch-maker";
import { fetchDbList } from "./studio-api";

export interface BatchPanelProps {
  stages: Stage[];
  mangas: Manga[];
  articles: Article[];
  quizSets: QuizSet[];
  listenings: Listening[];
  scenarios: Scenario[];
  wordStages: WordStage[];
  characters: Character[];
}

export function BatchPanel(props: BatchPanelProps) {
  const gitContents: Content[] = [
    ...props.stages,
    ...props.mangas,
    ...props.articles,
    ...props.quizSets,
    ...props.listenings,
    ...props.scenarios,
    ...props.wordStages,
    ...props.characters,
  ];

  const [contents, setContents] = useState<Content[]>(gitContents);
  const [gate, setGate] = useState<"checking" | "ready" | "error">("checking");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const result = await fetchDbList();
      if (!active) return;
      if (!result.ok) {
        // DB未設定は「これから使える」状態。git の教材だけで数えれば足りる
        if (result.preparing) {
          setGate("ready");
          return;
        }
        setMessage(result.message);
        setGate("error");
        return;
      }
      /*
       * DB側が同じIDを持っていたら DB を採る（スタジオで直した方が新しい）。
       * `content-db.ts` の合流と同じ考え方にそろえる。
       */
      const byId = new Map(gitContents.map((c) => [c.id, c]));
      for (const entry of result.entries) byId.set(entry.content.id, entry.content);
      setContents([...byId.values()]);
      setGate("ready");
    })();
    return () => {
      active = false;
    };
    // 初回だけ。gitContents は props から毎回作られるので依存に入れない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 1件保存できたら手元の並びも入れ替える（同じものを2回作らせない）。 */
  const handleSaved = useCallback((saved: Content) => {
    setContents((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
  }, []);

  if (gate === "checking") return <AdminLoading />;
  if (gate === "error") return <AdminError message={message ?? "読みこめませんでした"} />;

  return (
    <AdminPageFrame>
      <AdminHeader title="まとめて つくる" note="足りない 絵と 音を 上から 1つずつ" />
      <BatchMaker contents={contents} onSaved={handleSaved} />
    </AdminPageFrame>
  );
}
