import { NextResponse } from "next/server";
import { contentSchema, type Stage } from "@/content/schema";
import { GIT_CONTENTS } from "@/content/git-contents.generated";
import {
  listArticles,
  listLinks,
  listSkits,
  listListenings,
  listMangas,
  listMeetings,
  listQuizSets,
  listScenarios,
  listSlides,
  listStages,
  listWordStages,
} from "@/lib/content";
import { fetchDbContents } from "@/lib/content-db";
import { buildContentHealth } from "@/lib/content-health";
import { buildInfo } from "@/lib/env";

/**
 * 教材の 健康しらべ（ログイン不要）。
 *
 * 2026-08-26、git に 足した ことばの セット2本が **DBの 古い ステージ行に
 * 隠されて**、学習者の 画面から 消えて いた。git も DBも 壊れて おらず、
 * 機械の 検査は ぜんぶ 緑——**どこにも 印が 出ない**種類の 事故だった。
 * ここが その印を 出す。`warnings` が 空なら 健康。
 *
 * 返すのは **idと 数だけ**。教材の 本文も 学習者の データも 出さない
 *（id は public リポジトリに 元から ある 事実）。だから ログインの 内側に 置かない——
 * 内側に 置くと、いちばん 見たい とき（本番で 何かが 消えた とき）に 見られない。
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const [liveStages, liveWordStages, db, ...lists] = await Promise.all([
    listStages(),
    listWordStages(),
    fetchDbContents(),
    /*
     * ステージが 指して いる 教材が いま 出て いるか を 見る ため、種別ごとに 集める
     *（`contents[].type` と 同じ 名前で 鍵に する）。**種別を 混ぜない**——
     * 同じ id の ページと もんだいが 別物として 並ぶ ことが ある。
     */
    listArticles(),
    listMangas(),
    listSlides(),
    listListenings(),
    listQuizSets(),
    listScenarios(),
    listMeetings(),
    listLinks(),
    listSkits(),
  ]);

  const KINDS = [
    "article",
    "manga",
    "slides",
    "listening",
    "quizset",
    "scenario",
    "meeting",
    "link",
    "skit",
  ] as const;
  const liveContentIds = new Set(
    lists.flatMap((items, at) => items.map((item) => `${KINDS[at]}:${item.id}`)),
  );

  const gitStages = GIT_CONTENTS.flatMap((raw) => {
    const parsed = contentSchema.safeParse(raw);
    return parsed.success && parsed.data.kind === "stage" ? [parsed.data as Stage] : [];
  });

  const dbPublishedIds = new Set(
    db.filter((e) => e.status === "published").map((e) => `${e.content.kind}:${e.content.id}`),
  );

  const health = buildContentHealth({
    gitStages,
    liveStages,
    liveWordStages,
    dbPublishedIds,
    liveContentIds,
  });

  return NextResponse.json(
    { sha: buildInfo.sha, ...health },
    { headers: { "cache-control": "no-store" } },
  );
}
