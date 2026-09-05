/**
 * 教材の 台帳（サーバ専用）— 記録の id を **人が 読める 名前**に 戻す
 *
 * 台帳（`content_progress` / `quiz_results` / …）が 持って いるのは id だけである。
 * ステージも 種別も **わざと 焼き込んで いない**——教材は ステージを 移れるので、
 * 記録に 書き込むと 移した 日に 過去の 記録が 迷子に なる。
 *
 * その代わり、先生の 画面を 開く ときに ここで 引き直す。教材ローダーは サーバ専用
 *（`@/lib/content` は fs では なく 焼き込みを 読むが、DB とも 合流する）なので、
 * ページ側で 読んで **画面へ 渡す**（`loadStudioData` と 同じ 形）。
 *
 * 中身は **名前と 問いの 文だけ**にする。スタジオ（`loadStudioData`）は 教材の 本文ごと
 * 渡すが、ここは 一覧に 出すだけ なので 本文は 要らない——学期ぶんの 記録と 一緒に
 * 本文まで 積むと、先生の 画面が 開かなく なる。
 *
 * ## 問いの 文も 引く（2026-09-05 の 指定）
 * 台帳が 持って いるのは `q1-1` の ような **id だけ**で、それでは
 * 「どのような 質問か 見えづらい」。id を 記録に 焼き込まない のは わざと——
 * 教材を 直しても 去年の 記録が 読める ように する ためで、そこは 変えない。
 * 代わりに **先生の 画面を 開く ときに 教材から 引き直す**。
 *
 * その ぶん、**問いを 書き直すと 過去の 記録も 新しい 文で 出る**。それで よい——
 * 先生が 見たいのは「いま その 問いが どう 読めるか」であり、去年の 文面では ない。
 * 教材から 消した 問いは 引けないので、そのときは id が そのまま 出る（迷子に しない）。
 */

import type { ContentRefType } from "@/content/schema";
import {
  listArticles,
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
  listWordStages,
} from "@/lib/content";
import { sortStages } from "@/lib/map-data";

/** 1つの 教材（＝記録の id が 指す もの）。 */
export interface UnitRef {
  /** 記録に 入って いる id。 */
  readonly id: string;
  readonly type: ContentRefType;
  readonly title: string;
  /** 入って いる ステージ（どれにも 入って いなければ 空）。 */
  readonly stageId: string;
  readonly stageTitle: string;
  /** ステージの 中の 並び（学習順）。どこにも 入って いなければ -1。 */
  readonly order: number;
}

export interface UnitIndex {
  readonly stages: readonly { readonly id: string; readonly title: string }[];
  readonly units: readonly UnitRef[];
  /**
   * 問いの 文。鍵は `<教材id>:<問いid>`。
   *
   * 問いの id は **教材の 中でしか 一意では ない**ので、教材idと 組で 引く。
   * 素の id で 引くと、別の 教材の 同じ 番号の 問いが 出る。
   */
  readonly prompts: Readonly<Record<string, string>>;
}

/**
 * 教材の 台帳を 組み立てる。
 *
 * ことばの セット（wordstage）は ステージの `contents` では なく `wordStageIds` に
 * 入って いる ので、別に 拾う——ここを 忘れると **ことばの テストの 記録だけが
 * 「どこにも 入って いない 教材」に 見える**。
 */
export async function loadUnitIndex(): Promise<UnitIndex> {
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
    links,
    skits,
    quests,
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
    listLinks(),
    listSkits(),
    listQuests(),
  ]);

  /*
   * 問いの 文。3つの 教材が 別の 名前で 持って いる:
   *   もんだい（quizset） … `questions[].q`   … 設問文
   *   ミーティング        … `questions[].ask` … 相手（ヘンディさん）の しつもん
   *   たいわ（scenario）  … `interview.reqs[].label` … 要件ボードの 見出し
   * どれも「先生が 読んで 中身が 分かる 一文」なので、同じ 引き出しに 入れる。
   */
  const prompts: Record<string, string> = {};
  for (const set of quizSets) {
    for (const question of set.questions) prompts[`${set.id}:${question.id}`] = question.q;
  }
  for (const meeting of meetings) {
    for (const question of meeting.questions)
      prompts[`${meeting.id}:${question.id}`] = question.ask;
  }
  for (const scenario of scenarios) {
    for (const req of scenario.interview.reqs) prompts[`${scenario.id}:${req.id}`] = req.label;
  }

  const titles = new Map<string, string>();
  const put = (items: readonly { id: string; title: string }[], type: ContentRefType) => {
    for (const item of items) titles.set(`${type}:${item.id}`, item.title);
  };
  put(mangas, "manga");
  put(articles, "article");
  put(slides, "slides");
  put(quizSets, "quizset");
  put(listenings, "listening");
  put(scenarios, "scenario");
  put(meetings, "meeting");
  put(wordStages, "wordstage");
  put(links, "link");
  put(skits, "skit");
  put(quests, "quest");

  const ordered = sortStages(stages);
  const units: UnitRef[] = [];
  const seen = new Set<string>();

  for (const stage of ordered) {
    const inStage = [
      ...stage.contents.map((content) => ({ id: content.ref, type: content.type })),
      ...stage.wordStageIds.map((id) => ({ id, type: "wordstage" as ContentRefType })),
    ];
    inStage.forEach((content, order) => {
      // 同じ 教材が 2つの ステージに 入って いる ことは ありうる。地図の 順で
      // 先に 出る ほうを 正とする（`canonicalContentPath` と 同じ 決め方）。
      if (seen.has(content.id)) return;
      seen.add(content.id);
      units.push({
        id: content.id,
        type: content.type,
        title: titles.get(`${content.type}:${content.id}`) ?? content.id,
        stageId: stage.id,
        stageTitle: stage.title,
        order,
      });
    });
  }

  // どの ステージにも 入って いない 教材（スタジオで 作りかけ・ステージから 外した もの）。
  // **記録は 残って いる**ので、一覧から 落とさない——落とすと、先生から見て
  // 学生の こたえが 理由なく 消える。
  for (const [key, title] of titles) {
    const [type, ...rest] = key.split(":");
    const id = rest.join(":");
    if (seen.has(id)) continue;
    seen.add(id);
    units.push({
      id,
      type: type as ContentRefType,
      title,
      stageId: "",
      stageTitle: "",
      order: -1,
    });
  }

  return {
    stages: ordered.map((stage) => ({ id: stage.id, title: stage.title })),
    units,
    prompts,
  };
}
