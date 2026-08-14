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
  listMeetings,
  listQuizSets,
  listScenarios,
  listSlides,
  listStages,
  listWordStages,
} from "@/lib/content";

export async function loadStudioData() {
  const [
    stages,
    mangas,
    articles,
    slides,
    quizSets,
    listenings,
    scenarios,
    meetings,
    wordStages,
    characters,
  ] = await Promise.all([
    listStages(),
    listMangas(),
    listArticles(),
    listSlides(),
    listQuizSets(),
    listListenings(),
    listScenarios(),
    listMeetings(),
    listWordStages(),
    listCharacters(),
  ]);
  return {
    stages,
    mangas,
    articles,
    slides,
    quizSets,
    listenings,
    scenarios,
    meetings,
    wordStages,
    characters,
  };
}
