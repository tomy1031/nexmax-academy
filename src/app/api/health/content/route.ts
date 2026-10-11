import { NextResponse } from "next/server";
import { contentSchema, type Stage } from "@/content/schema";
import { GIT_CONTENTS } from "@/content/git-contents.generated";
import {
  listArticles,
  listLinks,
  listSkits,
  listQuests,
  listTypings,
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
import {
  buildContentHealth,
  HEALTH_CONTENT_KINDS,
  type HealthContentKind,
} from "@/lib/content-health";
import { buildInfo } from "@/lib/env";

/*
 * 種別ごとの 読み出し。**種別と 読み出しを 対で 持つ**——名前の 並びと 読み出しの 並びを
 * 別々に 持つと、片方だけ 足して 順が ずれる。読み出しの 無い 種別は 型で 止まる。
 */
const LIST_BY_KIND = {
  article: listArticles,
  manga: listMangas,
  slides: listSlides,
  listening: listListenings,
  quizset: listQuizSets,
  scenario: listScenarios,
  meeting: listMeetings,
  wordstage: listWordStages,
  link: listLinks,
  skit: listSkits,
  quest: listQuests,
  typing: listTypings,
} satisfies Record<HealthContentKind, () => Promise<readonly { id: string }[]>>;

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
    ...HEALTH_CONTENT_KINDS.map((kind) => LIST_BY_KIND[kind]()),
  ]);

  const liveContentIds = new Set(
    lists.flatMap((items, at) => items.map((item) => `${HEALTH_CONTENT_KINDS[at]}:${item.id}`)),
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
