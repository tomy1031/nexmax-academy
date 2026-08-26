import { NextResponse } from "next/server";
import { contentSchema, type Stage } from "@/content/schema";
import { GIT_CONTENTS } from "@/content/git-contents.generated";
import { listStages, listWordStages } from "@/lib/content";
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
  const [liveStages, liveWordStages, db] = await Promise.all([
    listStages(),
    listWordStages(),
    fetchDbContents(),
  ]);

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
  });

  return NextResponse.json(
    { sha: buildInfo.sha, ...health },
    { headers: { "cache-control": "no-store" } },
  );
}
