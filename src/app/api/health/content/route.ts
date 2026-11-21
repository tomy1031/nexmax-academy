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
import { fetchDbContents, withDbContentScope } from "@/lib/content-db";
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
 *
 * ## DB を 引くのは 1回（2026-11-21）
 * 見張り（workers/watch）が 定期的に 叩く。一覧を 種類ぶん 呼ぶが、API ルートでは React の
 * `cache()` が 効かず、**1回で studio_contents を 約21回 丸ごと 引いて いた**（1日 約560MB）。
 * Supabase の 無料枠（月5GB）を 超えて、全員が ログインできなく なった。
 * いまは `withDbContentScope` で 1回に 畳み、引いた 回数・行数・大きさを 答えの `db` に 出す
 * （本番で 1回に なって いるかを 外から 確かめられる。見張りは この 大きさで 通信量を 見積もる）。
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return withDbContentScope(async (stats) => {
    const body = await checkContentHealth();
    return NextResponse.json(
      {
        ...body,
        db: { fetches: stats.fetches, rows: stats.rows, bytes: stats.bytes },
      },
      { headers: { "cache-control": "no-store" } },
    );
  });
}

async function checkContentHealth() {
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

  return { sha: buildInfo.sha, ...health };
}
