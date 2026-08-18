import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { RESERVED_STAGE_IDS, type StageContentRef } from "@/content/schema";
import {
  StageDetail,
  type StageContentItem,
  type StageWordItem,
} from "@/components/stage/stage-detail";
import { mergeFuriganaEntries, type FuriganaEntry } from "@/lib/text/furigana";
import {
  getArticle,
  getLink,
  getListening,
  getManga,
  getQuizSet,
  getMeeting,
  getScenario,
  getSlides,
  getStage,
  listStages,
  getWordStage,
} from "@/lib/content";
import { stageStepNumber } from "@/lib/map-data";
import { stageContentPath } from "@/lib/stage-routes";

/**
 * ステージのトップ（`/asakai`）— コンテンツの入れ物と順序を見せる画面（設計07 §3）
 *
 * URLの1段目がそのままステージID。`/stage/<id>` という段を挟まないので、
 * 中の教材は `/asakai/listening` と、URLを見ただけで場所が分かる形になる。
 *
 * 1段目を占めるぶん、アプリのルート（`/map` など）と名前がぶつかりうる。
 * 静的なルートが必ず勝つので、ぶつかったステージには永久にたどり着けない。
 * だから `stageSchema` の `RESERVED_STAGE_IDS` が保存の時点で弾く。
 */

/**
 * 公開分のDBコンテンツを合流させるため ISR にする（設計07 §11.1
 * 「gitコンテンツは静的生成のまま。DBコンテンツはリクエスト時取得（ISR/短いキャッシュ）」）。
 * スタジオで「こうかい」した教材は、再デプロイを待たずこの間隔で届く。
 */
export const revalidate = 60;

/**
 * git 由来の教材はビルド時に切り出す（実行時のファイル読みを起こさない）。
 * DB由来（スタジオで公開したもの）はここに現れないが、dynamicParams の既定により
 * 初回アクセスで生成され、以後は revalidate の間隔でキャッシュされる。
 */
export async function generateStaticParams() {
  return (await listStages()).map((item) => ({ stage: item.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ stage: string }>;
}): Promise<Metadata> {
  const { stage: id } = await params;
  const stage = await getStage(id);
  return { title: stage ? `${stage.title} | ステージ` : "ステージ" };
}

/**
 * 参照先の見出しを引く。参照切れ（null）はここでは落とさず一覧から外す
 * — 参照整合は lint:content が先に落とす契約なので、画面は壊さないほうを選ぶ。
 *
 * 読み辞書も一緒に持ち帰る。ステージ詳細の一覧は学習者が最初に見る画面なので、
 * ここで裸の漢字を出さない（AGENTS.md 規律2 — 表示時にエンジンがルビを合成する）。
 */
interface LoadedRef {
  title: string;
  description: string;
  furigana?: readonly FuriganaEntry[];
}

export async function loadRef(ref: StageContentRef): Promise<LoadedRef | null> {
  switch (ref.type) {
    case "manga": {
      const manga = await getManga(ref.ref);
      return (
        manga && {
          title: manga.title,
          description: manga.description,
          furigana: manga.furigana,
        }
      );
    }
    case "article": {
      const article = await getArticle(ref.ref);
      return (
        article && {
          title: article.title,
          description: article.description,
          furigana: article.furigana,
        }
      );
    }
    case "slides": {
      const slides = await getSlides(ref.ref);
      return (
        slides && {
          title: slides.title,
          description: slides.description,
          furigana: slides.furigana,
        }
      );
    }
    case "listening": {
      const listening = await getListening(ref.ref);
      return (
        listening && {
          title: listening.title,
          description: listening.description,
          furigana: listening.furigana,
        }
      );
    }
    case "quizset": {
      const set = await getQuizSet(ref.ref);
      return set && { title: set.title, description: set.description, furigana: set.furigana };
    }
    case "scenario": {
      const scenario = await getScenario(ref.ref);
      return (
        scenario && {
          title: scenario.title,
          description: scenario.subtitle,
          furigana: scenario.furigana,
        }
      );
    }
    case "meeting": {
      const meeting = await getMeeting(ref.ref);
      return (
        meeting && {
          title: meeting.title,
          description: meeting.description,
          furigana: meeting.furigana,
        }
      );
    }
    case "wordstage": {
      const stage = await getWordStage(ref.ref);
      return (
        stage && {
          title: stage.title,
          description: stage.description,
          furigana: stage.furigana,
        }
      );
    }
    case "link": {
      const link = await getLink(ref.ref);
      return (
        link && {
          title: link.title,
          description: link.description,
          furigana: link.furigana,
        }
      );
    }
  }
}

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

export default async function StagePage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage: id } = await params;
  if (isReserved(id)) notFound();
  const stage = await getStage(id);
  if (!stage) notFound();

  /**
   * マップの上から数えた番号。ステージの `order` そのものではない
   *（`order` は並び替えの結果でしかなく飛び番になりうる）。
   * マップと同じ数え方をしないと、地図で「STEP 02」だったものが中に入ると
   * 「STEP 30」になる。地図に出ないステージ（`listed: false`）は null になり、
   * STEP の札そのものが出ない。
   */
  const number = stageStepNumber(await listStages(), stage.id);

  // contents[] の並びがそのまま学習順（順序の正はステージ側 — 設計07 §3）。
  const resolved = await Promise.all(
    stage.contents.map(async (ref, index): Promise<StageContentItem | null> => {
      const found = await loadRef(ref);
      const href = stageContentPath(stage.id, stage.contents, index);
      if (!found || !href) return null;
      return {
        id: ref.ref,
        type: ref.type,
        title: found.title,
        description: found.description,
        furigana: found.furigana,
        href,
      };
    }),
  );
  const items = resolved.filter((item): item is StageContentItem => item !== null);

  // 単語ステージは独立したアプリ（ことばアーケード）なので行き先も /arcade のまま。
  // ステージからすぐ開けることだけを保証する。参照切れは一覧から外す。
  const loadedWordStages = await Promise.all(
    stage.wordStageIds.map(async (wordStageId): Promise<StageWordItem | null> => {
      const wordStage = await getWordStage(wordStageId);
      return (
        wordStage && {
          id: wordStage.id,
          title: wordStage.title,
          description: wordStage.description,
          /*
           * ことばカードにも ルビを 合成する（規律2 — 裸の漢字を 出さない）。
           * 単語ステージは 語ごとに (表記, よみ) を 持っているので、それも 混ぜる
           *（読み辞書に 載っていない 語の 漢字が 見出しに 出るのを 防ぐ）。
           * 同じ表記が ぶつかったら 読み辞書側が 勝つ（複合語の 読みが 正）。
           */
          furigana: mergeFuriganaEntries(
            wordStage.words.map((word): FuriganaEntry => [word.term, word.reading]),
            wordStage.furigana,
          ),
        }
      );
    }),
  );
  const wordStages = loadedWordStages.filter((item): item is StageWordItem => item !== null);

  return (
    <StageDetail
      stage={{
        id: stage.id,
        number,
        title: stage.title,
        reading: stage.reading,
        description: stage.description,
        furigana: stage.furigana,
      }}
      items={items}
      wordStages={wordStages}
    />
  );
}
