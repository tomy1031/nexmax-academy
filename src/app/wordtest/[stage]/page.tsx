import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArcadeGame } from "@/components/arcade/arcade-game";
import { listStages, listWordStages } from "@/lib/content";
import { findLearnerWordSets, learnerWordGroups, wordStageOwner } from "@/lib/wordstage-merge";

/**
 * 公開分のDBコンテンツを合流させるため ISR にする（設計07 §11.1
 * 「gitコンテンツは静的生成のまま。DBコンテンツはリクエスト時取得（ISR/短いキャッシュ）」）。
 * スタジオで「こうかい」した単語ステージは、再デプロイを待たずこの間隔で届く。
 */
export const revalidate = 300;

/**
 * git 由来の ことばはビルド時に切り出す（実行時のファイル読みを起こさない）。
 * ステージIDと 単語ステージID の どちらでも 開けるように、両方を 並べる
 *（古いリンク `/wordtest/<単語ステージID>` を 切らない）。
 * DB由来（スタジオで公開したもの）はここに現れないが、dynamicParams の既定により
 * 初回アクセスで生成され、以後は revalidate の間隔でキャッシュされる。
 */
export async function generateStaticParams() {
  const [stages, words] = await Promise.all([listStages(), listWordStages()]);
  const ids = new Set<string>();
  for (const head of learnerWordGroups(stages, words).heads) ids.add(head.id);
  for (const stage of words) ids.add(stage.id);
  // ステージIDでも 開ける（セットが 2つ以上 ある ステージは、ここが えらぶ 画面に なる）
  for (const stage of stages) if (stage.wordStageIds.length > 0) ids.add(stage.id);
  return [...ids].map((id) => ({ stage: id }));
}

/**
 * タブに 出す 名前。
 *
 * セットが 2つ以上 なら この URLは **えらぶ 画面**なので、名乗るのは
 * ステージの 名前（「会社を 知る」）。1つなら その セットの 見出し。
 */
async function resolveTitle(id: string): Promise<string | null> {
  const [stages, words] = await Promise.all([listStages(), listWordStages()]);
  const sets = findLearnerWordSets(id, stages, words);
  if (sets.length === 0) return null;
  if (sets.length === 1) return sets[0]!.title;
  return wordStageOwner(id, stages)?.title ?? sets[0]!.title;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ stage: string }>;
}): Promise<Metadata> {
  const { stage: id } = await params;
  const title = await resolveTitle(id);
  return { title: title ? `${title} | 単語テスト` : "単語テスト" };
}

export default async function ArcadeStagePage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage: id } = await params;
  const [stages, words] = await Promise.all([listStages(), listWordStages()]);
  const sets = findLearnerWordSets(id, stages, words);
  if (sets.length === 0) notFound();

  /*
   * 出るときの 行き先は **その ことばを 持って いる ステージ**。
   *
   * ここは ステージの「さいしょに ことばを おぼえる」から 直行して 来る 画面なのに、
   * 出口が マップしか 無く、つづきの 教材が ある ステージを 地図の 上から
   * 探し直させて いた。URL（`/wordtest/<id>`）だけ 覚えて 開いた 人にも 同じ 道が
   * 出るよう、出どころは クエリでなく データから 引く。
   *
   * どの ステージにも 付いて いない ことば（先生が 作りかけの もの・横断の セット）は
   * null なので、これまでどおり マップへ 出る。
   */
  const owner = wordStageOwner(sets[0]!.id, stages) ?? wordStageOwner(id, stages);

  /*
   * 手わたすのは **その ステージの セットだけ**。ステージから 来た 人に
   * よその 課の ことばを 並べても 選べない（ぜんぶ 見たい 人の 入口は /wordtest）。
   * どの ステージにも 付いて いない ことばの ときだけ、これまでどおり 全部を わたす。
   *
   * セットが 2つ以上 なら `initialStageId` を 渡さない＝**えらぶ 画面から** 始まる
   *（願い #280「会社を知るを選ぶと、初級・中級・上級が選択できるように」）。
   *
   * 全部を わたす ときだけ `groups` も 付ける——その ならびは 1ステージ 1行の
   * 一覧なので、行の 中の セットが 分からないと えらぶ 画面を 出せない。
   */
  const all = learnerWordGroups(stages, words);

  return (
    <ArcadeGame
      stages={owner ? sets : all.sets}
      groups={owner ? undefined : all.heads}
      initialStageId={sets.length === 1 ? sets[0]!.id : undefined}
      backTo={owner ? `/${owner.id}` : undefined}
      backTitle={
        owner
          ? {
              title: owner.title,
              furigana: [...(owner.furigana ?? []), [owner.title, owner.reading]],
            }
          : undefined
      }
    />
  );
}
