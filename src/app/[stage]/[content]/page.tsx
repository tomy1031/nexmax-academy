import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { RESERVED_STAGE_IDS, type Stage, type StageContentRef } from "@/content/schema";
import { ArticleView } from "@/components/article/article-view";
import { MeetingSession } from "@/components/meeting/meeting-session";
import { TalkSession } from "@/components/listening/live-mode";
import { LinkView } from "@/components/link/link-view";
import { ListeningPlayer } from "@/components/listening/playback-mode";
import { MangaReader } from "@/components/manga/manga-reader";
import { QuizRunner } from "@/components/quiz/quiz-runner";
import { SlideDeck } from "@/components/slides/slide-deck";
import { TalkGameSession } from "@/components/talk-game/talk-game-session";
import { ContentFrame, type FrameItem } from "@/components/stage/content-frame";
import {
  getArticle,
  getArticleCharacters,
  getCharacter,
  getLink,
  getListening,
  getManga,
  getQuizSet,
  getMeeting,
  getScenario,
  getSlides,
  getStage,
  listStages,
  listWordStages,
} from "@/lib/content";
import { buildDictionary } from "@/lib/dictionary";
import { stageStepNumber } from "@/lib/map-data";
import { resolveStageContent, stageContentPath, stageContentSegments } from "@/lib/stage-routes";
import { loadRef } from "../page";

/**
 * ステージの中の教材（`/asakai/listening`）
 *
 * 教材の engine は種別ごとに別のコンポーネントだが、**ページは1つ**にする。
 * 種別ごとにルートを分けると、ステージの外側（見出し・戻り先・進捗）を
 * 5か所に写して回ることになり、必ずどこか1つが取り残される。
 *
 * 外側は `ContentFrame` が持つ（並び・戻り先・つぎへ・順番の制御）。
 * engine は `embedded` で自前のヘッダを出さない。
 *
 * URLの読み取り規則は src/lib/stage-routes.ts（同じ種別が1つなら ID を付けない）。
 */

/** DBで公開した教材を合流させるため ISR（設計07 §11.1）。 */
export const revalidate = 60;

export async function generateStaticParams() {
  const stages = await listStages();
  return stages.flatMap((stage) =>
    stageContentSegments(stage.contents).map((content) => ({ stage: stage.id, content })),
  );
}

/** URL から「どのステージの どの教材か」まで解く。無ければ null。 */
/**
 * アプリのルートと同じ1段目は、ここで先に落とす。
 *
 * ステージIDは `RESERVED_STAGE_IDS` が保存時に弾くので、ここに来る予約語は
 * 「存在しないステージ」でしかない。ただしこのページは ISR なので **404 の結果も
 * キャッシュされる**。新しく `/admin/xxx` のようなルートを足した直後、それ以前に
 * 誰かが踏んだ 404 がキャッシュに残っていると、しばらく 404 のままになる
 *（2026-08-06 に /admin/characters で実際に起きた。revalidate の間だけ揺れる）。
 */
function isReserved(id: string): boolean {
  return (RESERVED_STAGE_IDS as readonly string[]).includes(id);
}

async function resolve(
  stageId: string,
  segment: string,
): Promise<{ stage: Stage; ref: StageContentRef; index: number } | null> {
  if (isReserved(stageId)) return null;
  const stage = await getStage(stageId);
  if (!stage) return null;
  const ref = resolveStageContent(stage.contents, segment);
  if (!ref) return null;
  // 同じ ref が2回入っている壊れたステージでは最初の1つを現在地にする
  const index = stage.contents.findIndex(
    (content) => content.ref === ref.ref && content.type === ref.type,
  );
  return { stage, ref, index };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ stage: string; content: string }>;
}): Promise<Metadata> {
  const { stage, content } = await params;
  const found = await resolve(stage, content);
  if (!found) return { title: "きょうざい" };
  const { ref } = found;
  switch (ref.type) {
    case "manga":
      return { title: `${(await getManga(ref.ref))?.title ?? ""} | まんが` };
    case "article": {
      const article = await getArticle(ref.ref);
      return { title: `${article?.title ?? ""} | ページ`, description: article?.description };
    }
    case "slides": {
      const slides = await getSlides(ref.ref);
      return { title: `${slides?.title ?? ""} | スライド`, description: slides?.description };
    }
    case "listening":
      return { title: `${(await getListening(ref.ref))?.title ?? ""} | リスニング` };
    case "quizset":
      return { title: `${(await getQuizSet(ref.ref))?.title ?? ""} | もんだい` };
    case "scenario":
      return { title: `${(await getScenario(ref.ref))?.title ?? ""} | たいわ` };
    case "meeting":
      return { title: `${(await getMeeting(ref.ref))?.title ?? ""} | ミーティング` };
    case "wordstage":
      return { title: "ことば" };
    case "link": {
      const link = await getLink(ref.ref);
      return { title: `${link?.title ?? ""} | リンク`, description: link?.description };
    }
  }
}

/**
 * 枠に渡す並び。見出しは参照先から引く（IDのままだと、ナビが
 * 「m2-asakai-manga」の羅列になって、どれが何か分からない）。
 * 参照切れは一覧から外す——[stage] のトップと同じ扱いにそろえる。
 *
 * 読み辞書も一緒に持ち帰る。ステージのトップ（StageDetail）だけがルビを合成し、
 * 枠の中の並びは裸の漢字、という割れ方をさせない（規律2 — loadRef が
 * トップと同じ furigana を返すので、渡し方もそこに合わせる）。
 */
async function frameItems(stage: Stage): Promise<FrameItem[]> {
  const loaded = await Promise.all(
    stage.contents.map(async (ref, index): Promise<FrameItem | null> => {
      const found = await loadRef(ref);
      const href = stageContentPath(stage.id, stage.contents, index);
      if (!found || !href) return null;
      return {
        id: ref.ref,
        type: ref.type,
        title: found.title,
        furigana: found.furigana,
        // 教材ごとの 関門指定は **ステージが 持つ**（参照側 = ref）。
        // 同じ教材を べつの ステージで 関門に する／しないが 分かれるため、
        // 教材本体（found）ではなく ここから 運ぶ。
        gates: ref.gates,
        href,
      };
    }),
  );
  return loaded.filter((item): item is FrameItem => item !== null);
}

export default async function StageContentPage({
  params,
}: {
  params: Promise<{ stage: string; content: string }>;
}) {
  const { stage: stageId, content } = await params;
  const found = await resolve(stageId, content);
  if (!found) notFound();
  const { stage, ref } = found;

  const [items, allStages] = await Promise.all([frameItems(stage), listStages()]);
  // 地図に出ないステージ（`listed: false`）は null。STEP の札を出さない
  const number = stageStepNumber(allStages, stage.id);
  // 参照切れを外したぶん位置がずれるので、枠の並びの中で数え直す
  const currentIndex = items.findIndex((item) => item.id === ref.ref && item.type === ref.type);

  return (
    <ContentFrame
      stage={{
        id: stage.id,
        title: stage.title,
        reading: stage.reading,
        number,
      }}
      items={items}
      currentIndex={currentIndex >= 0 ? currentIndex : 0}
    >
      {await renderContent(ref)}
    </ContentFrame>
  );
}

async function renderContent(ref: StageContentRef) {
  switch (ref.type) {
    case "manga": {
      const manga = await getManga(ref.ref);
      if (!manga) notFound();
      return <MangaReader manga={manga} embedded />;
    }
    case "article": {
      const article = await getArticle(ref.ref);
      if (!article) notFound();
      /*
       * 辞書は単語ステージを畳んだもの（src/lib/dictionary.ts）。ステージのぶんだけに
       * 絞らないのは、本文に出てくる ことばは前の課で習ったものが多いため——
       * このステージの単語だけに絞ると、いちばん助けが要る「前に習ったが忘れた語」に
       * 説明が出なくなる。
       */
      return (
        <ArticleView
          article={article}
          dictionary={buildDictionary(await listWordStages())}
          characters={await getArticleCharacters(article)}
          embedded
        />
      );
    }
    case "slides": {
      const slides = await getSlides(ref.ref);
      if (!slides) notFound();
      return <SlideDeck slides={slides} embedded />;
    }
    case "listening": {
      const listening = await getListening(ref.ref);
      if (!listening) notFound();
      return <ListeningPlayer listening={listening} embedded />;
    }
    case "quizset": {
      const set = await getQuizSet(ref.ref);
      if (!set) notFound();
      return <QuizRunner set={set} embedded />;
    }
    case "scenario": {
      const scenario = await getScenario(ref.ref);
      if (!scenario) notFound();
      return <TalkSession scenario={scenario} embedded />;
    }
    case "meeting": {
      const meeting = await getMeeting(ref.ref);
      if (!meeting) notFound();
      /*
       * 声は**人物カード**が持つ（characters の voice）。ミーティング側に
       * 別に書かせると、まんがのヘンディさんと声が食い違ったときに
       * どちらが正しいのか誰にも分からなくなる。人物カードを1つの正にする。
       */
      const host = await getCharacter(meeting.host.id);
      /*
       * **対話ゲームは 別の 画面**（願い #177・2026-08-23 の 指定）。
       *
       * 同じ `meeting` の データだが、進み方が ちがう（しつもんを その場で 作り、
       * 好感度が 満タンに なったら 終わる）。`MeetingSession` に 分岐を 足すと、
       * ヘンディさんの 会話を 直すたびに 松井社長が 黙って 動く ので、入口で 分ける。
       */
      if (meeting.talkGame) {
        return (
          <TalkGameSession
            meeting={meeting}
            hostVoice={host?.voice}
            dictionary={buildDictionary(await listWordStages())}
          />
        );
      }
      return (
        <MeetingSession
          meeting={meeting}
          hostVoice={host?.voice}
          hostMouth={host?.mouth}
          /*
           * ことばの 意味は 読みものと 同じ 辞書から 出す（単語ステージを 畳んだもの）。
           * このステージの ぶんだけに 絞らないのは、しつもんに 出る ことばは
           * 前の 課で 習った ものが 多いため——絞ると、いちばん 助けが 要る
           * 「前に 習ったが 忘れた語」に 説明が 出なくなる。
           */
          dictionary={buildDictionary(await listWordStages())}
          embedded
        />
      );
    }
    case "link": {
      const link = await getLink(ref.ref);
      if (!link) notFound();
      return <LinkView link={link} embedded />;
    }
    // 単語ステージは contents[] に入らない（wordStageIds 側・行き先は /arcade）。
    // ここに来るのは壊れたデータなので 404 にする。
    case "wordstage":
      notFound();
  }
}
