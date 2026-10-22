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
  listLinks,
  listListenings,
  listMangas,
  listMeetings,
  listQuests,
  listQuizSets,
  listScenarios,
  listSkits,
  listSlides,
  listStages,
  listTypings,
  listVocabBooks,
  listWordStages,
} from "@/lib/content";

/**
 * スタジオに まだ エディタの 無い 種別は、**名札（id と 題名）だけ**を 渡す。
 *
 * ステージ編集で 要るのは「もう ある ものから えらぶ」と「ほぞんずみか」の 2つで、
 * どちらも id と 題名で 足りる。本文ごと 渡すと、クエスト・タイピング（ことばカード入り）
 * の ぶん 先生の 画面が 重く なる。エディタを 足す ときに 中身ごとへ 切りかえる。
 */
function nameTags(items: readonly { id: string; title: string }[]) {
  return items.map(({ id, title }) => ({ id, title }));
}

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
    links,
    skits,
    quests,
    typings,
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
    listLinks(),
    listSkits(),
    listQuests(),
    listTypings(),
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
    /*
     * ステージに 置ける のに スタジオで まだ 直せない 種別（名札だけ）。無いと ステージの
     * ながれで「まだ ほぞんして いません」と 誤って 出る（2026-09-30）。
     */
    links: nameTags(links),
    skits: nameTags(skits),
    quests: nameTags(quests),
    typings: nameTags(typings),
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
