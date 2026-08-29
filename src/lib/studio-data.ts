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
  gitContentIds,
  listArticles,
  listCharacters,
  listListenings,
  listMangas,
  listMeetings,
  listQuizSets,
  listScenarios,
  listSlides,
  listStages,
  listVocabBooks,
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
    vocabBooks,
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
    listVocabBooks(),
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
    /**
     * ことばの 正。抜き出した 語だけでなく **辞書ぜんたいから 選べる**ように するため
     *（2026-08-20 の指定）。語の 置き場は ここ 1つ しか 無い。
     */
    vocabBooks,
    /**
     * git に 実体が ある `種別:id`。**「けす」を 押す 前に** 本当に 消えるのかを
     * 画面が 言えるように するため（2026-08-29）。一覧に 来る のは git ∪ DB を
     * 合流した あとの すがた なので、どちらから 来たかは ここでしか 分からない。
     */
    gitIds: [...gitContentIds()],
  };
}
