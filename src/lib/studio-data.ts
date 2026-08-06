/**
 * スタジオが必要とする教材ぜんぶ（サーバ側）
 *
 * 一覧に出すだけでなく、そのままエディタで開くので中身ごと渡す
 *（要約だけ渡すと「見る」しかできず、git 由来の教材を直せない）。
 *
 * 3つの入口（ステージ／きょうざい／ことば）で同じものを読む。読み方が分かれると、
 * 「ステージの中では選べるのに、きょうざい一覧には出ない」がいつか起きる。
 */

import {
  listArticles,
  listCharacters,
  listListenings,
  listMangas,
  listQuizSets,
  listScenarios,
  listStages,
  listWordStages,
} from "@/lib/content";

export async function loadStudioData() {
  const [stages, mangas, articles, quizSets, listenings, scenarios, wordStages, characters] =
    await Promise.all([
      listStages(),
      listMangas(),
      listArticles(),
      listQuizSets(),
      listListenings(),
      listScenarios(),
      listWordStages(),
      listCharacters(),
    ]);
  return { stages, mangas, articles, quizSets, listenings, scenarios, wordStages, characters };
}
