import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { RESERVED_STAGE_IDS, type Stage, type StageContentRef } from "@/content/schema";
import { ArticleView } from "@/components/article/article-view";
import { MeetingSession } from "@/components/meeting/meeting-session";
import { TalkSession } from "@/components/listening/live-mode";
import { LinkView } from "@/components/link/link-view";
import { SkitView } from "@/components/skit/skit-view";
import { QuestView } from "@/components/quest/quest-view";
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
  getQuest,
  getMeeting,
  getScenario,
  getSkit,
  getSlides,
  getStage,
  listStages,
} from "@/lib/content";
import { learnerDictionary } from "@/lib/dictionary-server";
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

/** DBで公開した教材は初回アクセスのとき合流する（設計07 §11.1）。 */
/*
 * **作りおきを 作り直さない**（`force-static`）。理由は 無料枠の CPU 上限 10ms である。
 *
 * `revalidate` を 置くと、その 時間が すぎた 作りおきは「古い」に なる。OpenNext の
 * 横取りは 古いものを 見つけると **リクエストの 中で** `await queue.send()` し、
 * 自分自身へ HEAD を 投げて **まるごと フルSSR** する。フルSSR 1回は 実測 280〜570ms
 * —— 上限の 30〜60倍で、落ちる。落ちると 鮮度が 更新されないので **次の リクエストも
 * また 作り直そうとする**。輪が 閉じない。
 *
 * 2026-09-02、授業中の 本番で これが 起きた（`wrangler tail --format json`）:
 *
 *     outcome=exceededCpu cpu=10ms  Error: Worker exceeded CPU time limit.
 *     log: ['Revalidation failed for /kaisha/link with status 503']
 *
 * 567ms が ok で 通った 直後に 10ms で 連続して 落ちている——**無料枠は バーストを
 * 見逃すが、使い切ると そこから 全部 10ms で 切られる**。「成功した リクエストが
 * 10ms を 超えている」は 上限を 否定する 証拠に ならない。
 *
 * はじめは 7日（604800）に 逃がしたが、それは「7日 以内に かならず デプロイが ある」
 * ときしか 効かない —— 自動デプロイは 中身が 同じなら 出さない（should_deploy.mjs）ので、
 * 連休で 1週間 止まれば **7日目に 全ページが いっせいに 古く なって 輪が 再開する**。
 * 時間で 逃げるのを やめて、**作り直しの 経路に そもそも 入らない**ようにする。
 *
 * **教材は デプロイのたびに 作り直される**ので、学習者が 見るのは 常に その日の
 * 授業前に 出した 中身である。代償は、先生が スタジオで 直した 内容（DB）が 出るのが
 * 「次の デプロイ」に なること。ここを 実行時に 追いつかせる 直しは、ブラウザ側で
 * 読む かたち（Codex 設計書 Phase 1・3）で 別に 進める。
 *
 * `dynamicParams` は 既定（true）の まま。DB だけに ある 教材は 初回だけ その場で
 * 作られ、以後は 作りおきに なる（作り直しの 輪には 入らない）。
 */
export const dynamic = "force-static";

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
 * 「存在しないステージ」でしかない。ただしこのページは作りおきなので **404 の結果も
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
    case "skit": {
      const skit = await getSkit(ref.ref);
      return { title: `${skit?.title ?? ""} | スキット`, description: skit?.description };
    }
    case "quest": {
      const quest = await getQuest(ref.ref);
      return { title: `${quest?.title ?? ""} | クエスト`, description: quest?.description };
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
      /* ことばの意味は 正ぜんぶから 引く（`learnerDictionary`）。 */
      return (
        <ArticleView
          article={article}
          dictionary={await learnerDictionary()}
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
      /* もんだいの 設問文・ヒントにも 辞書を 出す（読みものと 同じ 引き先）。 */
      return <QuizRunner set={set} dictionary={await learnerDictionary()} embedded />;
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
            dictionary={await learnerDictionary()}
          />
        );
      }
      return (
        <MeetingSession
          meeting={meeting}
          hostVoice={host?.voice}
          hostMouth={host?.mouth}
          /* ことばの 意味は 読みものと 同じ 辞書から 出す（`learnerDictionary`）。 */
          dictionary={await learnerDictionary()}
          embedded
        />
      );
    }
    case "link": {
      const link = await getLink(ref.ref);
      if (!link) notFound();
      return <LinkView link={link} embedded />;
    }
    case "skit": {
      const skit = await getSkit(ref.ref);
      if (!skit) notFound();
      return <SkitView skit={skit} embedded />;
    }
    case "quest": {
      const quest = await getQuest(ref.ref);
      if (!quest) notFound();
      return <QuestView quest={quest} embedded />;
    }
    // 単語ステージは contents[] に入らない（wordStageIds 側・行き先は /wordtest）。
    // ここに来るのは壊れたデータなので 404 にする。
    case "wordstage":
      notFound();
  }
}
