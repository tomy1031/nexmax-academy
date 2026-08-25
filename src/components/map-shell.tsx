"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { signOut } from "@/app/auth/actions";
import { AcademyLogo } from "@/components/academy-logo";
import { AreaTrail } from "@/components/map-trail";
import { RubyText } from "@/components/ruby-text";
import { NexMaxFamily } from "@/components/nexmax-types";
import { CloudBand, CloudCorners } from "@/components/cloud-band";
import { SKY_BLUE, type MapArea } from "@/content/areas";
import {
  getFamilyForCode,
  getPersonalityType,
  type PersonalityFamilyId,
  type PersonalityTypeCode,
} from "@/content/personality";
import { contentKindMeta } from "@/lib/content-kinds";
import { hasLearnerNames } from "@/lib/name";
import { isSchoolChosen } from "@/lib/school";
import { readContentProgress, subscribeProgress } from "@/lib/progress/store";
import { statusCode as contentStatusCode } from "@/components/stage/stage-progress";
import { mapStageActions, type MapStage } from "@/lib/map-data";
import { fetchOwnProfile, type ProfileRow } from "@/lib/profile-db";
import {
  clearProfile,
  getMapView,
  getProfile,
  isDiagnosedRow,
  saveMapView,
  saveProfile,
  type Gender,
  type MapView,
  type NexmaxProfile,
} from "@/lib/profile";
import {
  clearedIdsSnapshot,
  deriveProgress,
  stageStatus,
  type StageProgress,
  type StageStatus,
} from "@/lib/progress";
import { createClient } from "@/lib/supabase/client";

/**
 * ボタンの中の ふりがな を白にする。
 *
 * ボタンの地は濃い色で、文字は白。ルビ（rt）だけ既定の暗い色のままだと、
 * ふりがなが読めない——ふりがなが読めないボタンは、ふりがなが無いのと同じ。
 *
 * **`!` が要る**（2026-08-18）。`globals.css` の `rt { color: … }` は どの
 * `@layer` にも 入っていない＝**レイヤー無しの規則**なので、詳細度に 関わらず
 * Tailwind の ユーティリティ（`@layer utilities`）より 強い。`!` を 付けるまで、
 * この 決まりは 1か所も 効いていなかった（色つきの ボタンの ふりがなが
 * 濃い灰色の ままで、赤い 札の 上では ほぼ 見えなかった）。
 * 大もとを 直すには `globals.css` の `rt` を `@layer base` に 入れる——
 * 共有のテーマなので 別タスクとして 出す（AGENTS.md 横断変更）。
 */
const BUTTON_RUBY = "[&_rt]:text-white!";

/** 漢字を含む見出しか。含むならタイトル全体に よみ をふる。 */
const HAS_KANJI = /[一-鿿]/;

const PROFILE_SERVER_SNAPSHOT = "__server__";
const PROGRESS_SERVER_SNAPSHOT = "[]";

/**
 * 航路は**地図ぜんたいで1本の正弦波**にする。
 *
 * `T` は「エリア番号 + エリア内の位置(0..1)」の通し目盛。1エリアで半周期進むので、
 * ステージの丸（T = 番号 + 0.5）が中央から左右へ交互に振れ、エリアの境目（T = 整数）は
 * ちょうど中央を通る。
 *
 * 大事なのは**境目で波を切らない**こと。区間ごとに「中央 → 左右 → 中央」と補間して
 * 両端の傾きを 0 にすると、境目で道がいったん縦になり、波が細切れの折れ線に見える。
 * 1本の sin で通すと、境目も傾きを持ったまま滑らかに通り抜ける。
 *
 * 出発とゴールの看板は中央にあり、T が整数のところで x = 50 になるので、
 * 看板の真下から道が出入りする。
 */
const NODE_SWING = 17;

/**
 * 波の振れを、道のりの入口と出口だけ 0 まで絞る係数。
 *
 * 看板の下の道はまっすぐ縦に降りる（傾き 0）。一方 sin は T=0 で傾きが最大なので、
 * そのままつなぐと看板を出た瞬間に真横へ折れて見える。端で振幅を 0 にすると
 * **傾きも 0 になり**、縦の線から波へなめらかに移れる。
 *
 * 絞るのは端から半エリアぶんだけ。最初と最後のステージ（T = 0.5, N-0.5）では
 * すでに 1 に戻っているので、振れ幅は他のステージと変わらない。
 */
function swingEnvelope(globalT: number, total: number): number {
  const edge = Math.min(globalT, total - globalT) / 0.5;
  const e = Math.max(0, Math.min(1, edge));
  return e * e * (3 - 2 * e);
}

function routeX(globalT: number, totalAreas: number): number {
  const swing = NODE_SWING * swingEnvelope(globalT, totalAreas);
  return 50 + swing * Math.sin(Math.PI * globalT);
}

/** エリア内でステージを置く高さ（%）。波の山＝エリアのまんなかに置く */
const NODE_TOP = 50;

/** 進捗の色。歩いた道＝葉、いまここ＝珊瑚ピンク、まだ＝白 */
const CURRENT_COLOR = "#f26fa7";
const CLEARED_COLOR = "#3aa458";

const STAGE_COLORS = {
  leaf: "#58c273",
  sky: "#4fa8e8",
  coral: "#f26fa7",
  "sky-soft": "#9bdcf7",
} satisfies Record<MapStage["color"], string>;

/**
 * 装飾のネクマックス。エリアごとに1体、ステージと反対側に立たせる。
 * エリアが増えても足りなくならないよう、番号で循環させる。
 */
const AREA_CHARACTERS: readonly PersonalityFamilyId[] = ["leader", "idea", "heart", "challenge"];

/**
 * 学習者じしんの分身（診断で決まったネクマックス）。
 * 地図に「いま自分がどこに立っているか」を出すために使う。装飾のネクマックス
 *（`AREA_CHARACTERS`）とは別もの——あちらは景色の住人で、こちらは学習者本人。
 */
export interface LearnerAvatar {
  family: PersonalityFamilyId;
  gender: Gender;
  name: string;
}

function subscribeToStorage(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

function profileSnapshot() {
  return JSON.stringify(getProfile());
}

function progressSnapshot() {
  return clearedIdsSnapshot();
}

/**
 * 診断が終わっている profiles の行。ログインした時点で作られる「登録だけの行」は
 * 型も性別も空なので、画面へ渡す前に `isDiagnosedRow` で落とす（2026-08-24）。
 */
type DiagnosedProfileRow = ProfileRow & {
  personality_type: PersonalityTypeCode;
  gender: Gender;
};

function profileFromRow(profile: DiagnosedProfileRow): NexmaxProfile {
  return {
    displayName: profile.display_name,
    gender: profile.gender,
    type: profile.personality_type,
    scores: profile.scores,
    createdAt: profile.created_at,
  };
}

/**
 * 学習者の現在地を「エリア番号＋エリア内の位置」で表す。空路の塗り分けの境目になり、
 * ここに飛行機が立つ。例: 2.3 = 3番目のエリアのステージのところ。
 */
function flownUntil(progress: StageProgress, routeAreas: readonly MapArea[]): number {
  // すべてクリアなら日本まで飛び切っている（ゴールのエリアの航路も塗る）
  if (!progress.currentStageId) return routeAreas.length + 1;
  const index = routeAreas.findIndex((area) => area.stageId === progress.currentStageId);
  if (index < 0) return routeAreas.length;
  return index + NODE_TOP / 100;
}

/**
 * 左上のロゴ。押すと最初の画面へもどる。
 *
 * せまい画面の一番上の段は**メニューの ☰ と きろくの おび（Hud）で ふさがっている**ので、
 * ロゴは**一段下げる**。同じ段に置くと、どちらかの下に隠れて「見えないのに押せる場所」になる
 *（幅 390px で実際に隠れていた）。広い画面はメニューが横に出るので、一番上に置ける。
 */
function Logo() {
  return (
    <Link
      prefetch={false}
      href="/"
      aria-label="Nexmax Academy"
      className="fixed top-[4.5rem] left-3 z-50 rounded-2xl bg-white/85 px-2 py-1.5 shadow-lg backdrop-blur-sm md:top-3"
    >
      <AcademyLogo alt="" priority className="h-auto w-20 md:w-32" />
    </Link>
  );
}

/**
 * ステージの見出し。タイトル全体に よみ をふる。
 *
 * 以前はステージIDごとの switch で、語ごとに細かくルビを振り分けていた。
 * それは既定の5ステージにしか効かず、先生が作ったステージは**漢字が裸のまま**出ていた。
 * 学習者はそこで止まる（AGENTS.md 規律2）。タイトル全体に よみ を出せば、
 * ステージがいくつ増えても読めない見出しは出ない。
 */
function StageTitle({ stage }: { stage: MapStage }) {
  if (!HAS_KANJI.test(stage.title)) return <>{stage.title}</>;
  return (
    <ruby>
      {stage.title}
      <rt>{stage.reading}</rt>
    </ruby>
  );
}

/**
 * 中に入っている教材のしるし。ステージの `contents` から導く。
 * コードに書いたラベル（「ペアワーク」など）は中身と一致しなくなるので持たない。
 */
function KindLabel({ stage }: { stage: MapStage }) {
  if (stage.kinds.length === 0) return <>じゅんびちゅう</>;
  return (
    <>
      {stage.kinds.map((kind, index) => {
        const meta = contentKindMeta(kind);
        return (
          <span key={kind}>
            {index > 0 ? "・" : ""}
            {meta.icon} {meta.label}
          </span>
        );
      })}
    </>
  );
}

/**
 * エリア背景。
 *
 * 画像は `object-cover` なので、画面が横に広いほど上下が切り落とされる。切り口がそのまま
 * 継ぎ目になると土地が途中で切れて見えるため、上下の端を透明にぼかして下地の空色
 * （`SKY_BLUE`）に溶かし、その上を `CloudBand` の雲海が覆う。こうすると
 * 「土地 → 雲 → 土地」に見え、どの画面幅でも継ぎ目が出ない。
 * 読み込めなかったときも同じ空色が残るので、地図が破れない。
 */
function AreaImage({ src, fade }: { src: string; fade: "both" | "top" }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  const mask =
    fade === "both"
      ? "linear-gradient(to bottom, transparent 0%, #000 14%, #000 86%, transparent 100%)"
      : // 日本だけは俯瞰の海ではなく水平線の絵なので、海からの入りを長めにぼかす
        "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,.5) 14%, #000 30%, #000 100%)";

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden
      onError={() => setFailed(true)}
      className="absolute inset-0 h-full w-full object-cover"
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    />
  );
}

/**
 * 地図の「中身」を置く層。背景画像は画面いっぱいのまま、看板・航路・ステージだけを
 * 内側に寄せる（左のサイドメニューに隠れないようにするため）。
 *
 * **左右を同じだけ空ける**のが要点。左だけ空けるとこの層の中央が画面中央からずれ、
 * 中央に置いたはずの START / GOAL の看板が右に寄って見える。
 * 航路もこの層の中で位置を測るので、看板・丸・道の中心がすべて画面中央でそろう。
 */
function MapLayer({ children }: { children: ReactNode }) {
  return <div className="absolute inset-0 md:right-44 md:left-44">{children}</div>;
}

/**
 * エリア名の札。ステージと反対側の肩に置く。
 * 出すのは景色の名前だけで、国名は出さない（`MAP_AREAS` の方針。areas.ts を参照）。
 */
function AreaLabel({
  area,
  onRight,
  cleared,
}: {
  area: MapArea;
  onRight: boolean;
  cleared: boolean;
}) {
  return (
    <div
      className={`absolute top-6 z-30 flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-xs font-black shadow-[0_3px_0_rgba(0,79,141,.25)] backdrop-blur-sm sm:text-sm ${
        onRight ? "right-3 sm:right-6" : "left-3 sm:left-6"
      } ${
        cleared
          ? "border-[#3aa458] bg-[#eafaef]/95 text-[#26714a]"
          : "text-navy border-white bg-white/90"
      }`}
    >
      <span aria-hidden>{cleared ? "✓" : "📍"}</span>
      {area.name}
    </div>
  );
}

/**
 * 「いま ここ」に立つ学習者の分身。立札の下や、進んだ先の地点に置く。
 * 名前を添えるのは、分身が自分だと分かるようにするため（診断の結果と同じ絵）。
 */
function LearnerHere({
  learner,
  className = "",
  style,
}: {
  learner: LearnerAvatar;
  className?: string;
  /** 位置を数字で決めるとき（エリアの中は % で置くので、クラス名では書けない）。 */
  style?: CSSProperties;
}) {
  return (
    <div className={`absolute z-30 -translate-x-1/2 text-center ${className}`} style={style}>
      {/* 足元の白い地面。背景が濃い緑のエリアだと、緑や青の分身が景色に溶けて見えない
          （実測でそうなっていた）。丸い地面を敷くと、どのエリアでも輪郭が立つ。 */}
      <span
        aria-hidden
        className="absolute bottom-6 left-1/2 h-5 w-20 -translate-x-1/2 rounded-[50%] bg-white/70 blur-[2px]"
      />
      <NexMaxFamily
        family={learner.family}
        gender={learner.gender}
        size={84}
        bob
        className="relative drop-shadow-[0_6px_5px_rgba(0,60,107,.45)]"
      />
      <p className="text-navy relative mx-auto -mt-1 w-max rounded-full border-2 border-white bg-white/95 px-3 py-0.5 text-xs font-black shadow-md">
        {learner.name}
      </p>
    </div>
  );
}

function WoodenBanner({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className: string;
}) {
  return (
    <div className={`absolute z-20 -translate-x-1/2 text-center ${className}`}>
      <div className="mx-auto h-7 w-4 bg-linear-to-r from-[#6f3518] via-[#a7622e] to-[#5a2b15] shadow-md" />
      <div className="min-w-48 rounded-lg border-4 border-[#fff3cf] bg-linear-to-b from-[#b96a32] to-[#713516] px-6 py-2 text-white shadow-[0_7px_0_#4e250f,0_12px_24px_rgba(0,0,0,.28)]">
        <p className="text-xl font-black tracking-wider">{label}</p>
        <p className="text-sm font-extrabold">{children}</p>
      </div>
    </div>
  );
}

function ProgressBar({ progress }: { progress: StageProgress }) {
  return (
    <>
      <div className="text-ink-soft mt-3 flex items-center justify-between text-xs font-extrabold">
        <span>
          {progress.clearedCount} / {progress.totalCount} ステージ
        </span>
        <span>{progress.percent}%</span>
      </div>
      <div className="mt-1 h-3 overflow-hidden rounded-full border border-white bg-[#e4eef3] shadow-inner">
        <div
          className="bg-leaf h-full rounded-full transition-[width] duration-500"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
    </>
  );
}

/**
 * 右上の持ち物と分身の札（HUD）。
 *
 * 高さを1つに決めて全部そろえる。以前は数値のピルとアバターの札で高さも角丸も別々で、
 * 同じ列に並んでいるのに揃って見えなかった。切り替えも別の `fixed` で位置を直接
 * 指定していたので、上の札の高さが変わるたびに隙間がずれる。**縦に積むひと組**にして、
 * 隙間は指定でなく積み方から出す。
 */
const HUD_PILL =
  "text-navy flex h-11 items-center gap-1.5 rounded-2xl border-2 border-[#e9bd55] bg-[#fffaf0]/95 px-3 text-sm font-black shadow-[0_3px_0_#d9a839,0_7px_15px_rgba(0,79,141,.14)] backdrop-blur-sm";

function Hud({
  profile,
  progress,
  stages,
  view,
  onViewChange,
}: {
  profile: DiagnosedProfileRow | null;
  progress: StageProgress;
  /** 💎を数えるもと（マップに出ている全ステージの教材）。 */
  stages: readonly MapStage[];
  view: MapView;
  onViewChange: (view: MapView) => void;
}) {
  /*
   * 💎は **おえた教材の数**。ずっと "0" の 焼き付けだったが、教材は
   *「見つけた 💎は あなたの もの」と 約束している。増えない たからを 出し続けると、
   * つぎの ステージで さがす 気持ちが つづかない。
   *
   * 数える もとは すでに ある 進捗（`content:<id>` の completed）にする。
   * 🚩の 札が ステージの 数を 出しているので、💎は そのうちの 1本ずつ——
   * 1本 おえるたびに 増え、同じ 数を 2か所で 言わない。
   */
  const contentIds = useMemo(
    () => stages.flatMap((stage) => stage.contents.map((content) => content.id)),
    [stages],
  );
  const serverKey = useMemo(() => contentIds.map(() => "0").join(""), [contentIds]);
  const gemKey = useSyncExternalStore(
    subscribeProgress,
    () => contentIds.map((id) => contentStatusCode(readContentProgress(id))).join(""),
    () => serverKey,
  );
  const gems = [...gemKey].filter((code) => code === "2").length;

  return (
    <div className="fixed top-3 right-3 z-50 flex max-w-[calc(100vw-6rem)] flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <div className="flex gap-1.5">
          {[
            {
              key: "stage",
              icon: <span aria-hidden>🚩</span>,
              // 数字は等幅にする。桁が変わるたびに札の幅が動くと、目が落ち着かない。
              value: `${progress.clearedCount}/${progress.totalCount}`,
              title: "おえた ステージ",
            },
            {
              key: "coin",
              icon: (
                <span
                  aria-hidden
                  className="inline-block h-4 w-4 shrink-0 rounded-full border-2 border-[#d9a839] bg-[linear-gradient(180deg,#ffe37a,#f5b70f)]"
                />
              ),
              value: "0",
              title: "コイン",
            },
            {
              key: "gem",
              icon: <span aria-hidden>💎</span>,
              value: `${gems}`,
              title: "みつけた たから",
            },
          ].map((item) => (
            <span key={item.key} className={HUD_PILL} title={item.title}>
              {item.icon}
              <span className="tabular-nums">{item.value}</span>
            </span>
          ))}
        </div>

        <div className={`${HUD_PILL} max-w-56 gap-2 py-0 pr-3 pl-1.5`}>
          {profile ? (
            <>
              <NexMaxFamily
                family={getFamilyForCode(profile.personality_type).id}
                gender={profile.gender}
                size={34}
                className="shrink-0"
              />
              <span className="hidden min-w-0 leading-tight sm:block">
                <span className="text-ink block truncate text-sm font-black">
                  {profile.display_name}
                </span>
                <span className="text-ink-soft block truncate text-[10px] font-extrabold">
                  {getPersonalityType(profile.personality_type).name}
                </span>
              </span>
              <span aria-label="オンライン" className="bg-leaf h-2.5 w-2.5 shrink-0 rounded-full" />
            </>
          ) : (
            <>
              <span
                aria-hidden
                className="bg-hairline h-8 w-8 shrink-0 animate-pulse rounded-full"
              />
              <span className="hidden min-w-20 leading-tight sm:block">
                <span className="text-ink block text-sm font-black">…</span>
                <span className="text-ink-soft block text-[10px] font-extrabold">…</span>
              </span>
            </>
          )}
        </div>
      </div>

      <ViewToggle view={view} onChange={onViewChange} />
    </div>
  );
}

function ViewToggle({ view, onChange }: { view: MapView; onChange: (view: MapView) => void }) {
  return (
    <div className="flex rounded-2xl border-2 border-[#e9bd55] bg-[#fffaf0]/95 p-1 text-xs font-black shadow-[0_3px_0_#d9a839] sm:text-sm">
      <button
        type="button"
        aria-pressed={view === "map"}
        onClick={() => onChange("map")}
        className={`rounded-xl px-3 py-1.5 ${view === "map" ? "bg-navy text-white" : "text-ink-soft"}`}
      >
        🗺️ マップ
      </button>
      <span aria-hidden className="text-ink-faint self-center px-0.5">
        ⇄
      </span>
      <button
        type="button"
        aria-pressed={view === "cards"}
        onClick={() => onChange("cards")}
        className={`rounded-xl px-3 py-1.5 ${view === "cards" ? "bg-navy text-white" : "text-ink-soft"}`}
      >
        🃏 カード
      </button>
    </div>
  );
}

/**
 * サイドメニュー。**開ける行き先だけを並べる**（2026-08-18 の指定）。
 *
 * 中身の無い項目（マイページ・ショップ・チーム・ペア）と 辞書は 一覧から外した。
 * 押しても「じゅんびちゅう」としか返らない項目は、学習者に 何度も 空振りを させる。
 * 辞書の 画面（`/dictionary`）は 消していない——URLでは これまでどおり 開ける。
 *
 * 「単語」は ことばアーケード（/arcade）。ステージの中からも開けるが、
 * ここからも入れないと、単語だけ練習したい学習者が入口を見つけられない。
 */
const NAV_CLASS =
  "text-ink hover:bg-sky-soft flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-3 text-sm font-extrabold transition";

function Navigation({
  collapsed,
  drawerOpen,
  isAdmin,
  onCollapsedChange,
  onDrawerClose,
  onLogout,
}: {
  collapsed: boolean;
  drawerOpen: boolean;
  isAdmin: boolean;
  onCollapsedChange: (value: boolean) => void;
  onDrawerClose: () => void;
  onLogout: () => void;
}) {
  /** メニューの1行。たたんでいるときは 絵だけ、ひらいているときは 絵と ことば。 */
  /*
   * 学習者画面の Link は すべて prefetch={false}（2026-08-25）。
   *
   * 既定の prefetch は「画面に見えた Link」を全部先読みする。まなびマップや
   * 一覧には数十の Link が並ぶので、授業で20人が同時に開くと、それだけで
   * Worker の無料枠（10万リクエスト/日）を数百〜数千ずつ削る雪崩になる。
   * クリック時に1回取りに行く形なら、遅れは一呼吸（キャッシュ済みページ）で済む。
   * 新しく Link を足すときも prefetch={false} を付ける。
   */
  function navLink(href: string, icon: string, label: ReactNode) {
    return (
      <Link prefetch={false} href={href} onClick={onDrawerClose} className={NAV_CLASS}>
        <span aria-hidden className="text-xl">
          {icon}
        </span>
        {!collapsed && <span className="whitespace-nowrap">{label}</span>}
      </Link>
    );
  }

  const arcadeLink = navLink(
    "/arcade",
    "📖",
    <ruby>
      単語<rt>たんご</rt>
    </ruby>,
  );
  // ネクマックス図鑑への回遊先。診断のあとに16人を見に行けるようにする（07 §7）。
  // 絵文字は 🤖（2026-08-18 の指定）。単語の 📖 と 同じ 絵だと 見分けが つかない。
  const catalogLink = navLink("/nexmax", "🤖", "ネクマックス");
  // せっていの入口。なまえ・がっこう・せいべつ・APIキーを あとから 直す（`/map/settings`）。
  const settingsLink = navLink("/map/settings", "⚙️", "せってい");
  const adminLink = isAdmin ? navLink("/admin", "🛡️", "かんり") : null;
  const logoutButton = (
    <button
      type="button"
      onClick={() => {
        onDrawerClose();
        onLogout();
      }}
      className={NAV_CLASS}
    >
      <span aria-hidden className="text-xl">
        ↪
      </span>
      {!collapsed && <span className="whitespace-nowrap">ログアウト</span>}
    </button>
  );

  return (
    <>
      <button
        type="button"
        aria-label="メニューを ひらく"
        aria-expanded={drawerOpen}
        onClick={() => (drawerOpen ? onDrawerClose() : onCollapsedChange(false))}
        className="bg-navy fixed top-4 left-3 z-[61] grid h-12 w-12 place-items-center rounded-full border-2 border-white text-xl text-white shadow-lg md:hidden"
      >
        ☰
      </button>

      <aside
        aria-label="サイドメニュー"
        className={`fixed top-1/2 left-3 z-50 hidden -translate-y-1/2 flex-col items-center gap-1 rounded-[2rem] border-4 border-white bg-[#fffaf0]/95 p-2 shadow-[0_6px_0_#b9ddec,0_18px_30px_rgba(0,79,141,.22)] backdrop-blur-sm md:flex ${
          collapsed ? "w-16" : "w-40"
        }`}
      >
        <button
          type="button"
          aria-label="メニューを おりたたむ"
          onClick={() => onCollapsedChange(!collapsed)}
          className="bg-navy grid h-11 w-full place-items-center rounded-2xl text-xl text-white"
        >
          ☰
        </button>
        {arcadeLink}
        {catalogLink}
        {settingsLink}
        {adminLink}
        {logoutButton}
        <button
          type="button"
          onClick={() => onCollapsedChange(!collapsed)}
          className="text-ink-soft hover:bg-sky-soft mt-1 grid h-10 w-full place-items-center rounded-2xl text-xl font-black"
          aria-label={collapsed ? "メニューを ひらく" : "メニューを おりたたむ"}
        >
          {collapsed ? "»" : "«"}
        </button>
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button
            type="button"
            aria-label="メニューを とじる"
            onClick={onDrawerClose}
            className="bg-navy/45 absolute inset-0"
          />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white p-5 pt-20 shadow-2xl">
            <AcademyLogo className="mb-4 h-auto w-36" />
            <div className="space-y-2">
              {arcadeLink}
              {catalogLink}
              {settingsLink}
              {adminLink}
              {logoutButton}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

/** ステージの丸。クリア済み・いまここ・じゅんびちゅうで見た目を変える */
function StageNode({
  stage,
  status,
  open,
  onToggle,
}: {
  stage: MapStage;
  status: StageStatus;
  open: boolean;
  onToggle: () => void;
}) {
  const step = String(stage.number).padStart(2, "0");
  const face =
    status === "current"
      ? { backgroundColor: CURRENT_COLOR, borderColor: "#ffffff" }
      : status === "cleared"
        ? { backgroundColor: CLEARED_COLOR, borderColor: "#ffffff" }
        : { backgroundColor: "#ffffff", borderColor: STAGE_COLORS[stage.color] };

  return (
    <button
      type="button"
      aria-expanded={open}
      aria-current={status === "current" ? "step" : undefined}
      aria-label={`STEP ${step} ${stage.title}（${
        status === "cleared" ? "クリア" : status === "current" ? "いま ここ" : "じゅんびちゅう"
      }）`}
      onClick={onToggle}
      className={`relative grid h-14 w-20 place-items-center rounded-[50%] border-4 text-xl font-black shadow-[0_8px_0_rgba(0,79,141,.35),0_13px_24px_rgba(0,0,0,.22)] transition sm:h-17 sm:w-24 ${
        status === "locked" ? "text-navy opacity-85" : "text-white"
      } ${status === "current" ? "ring-4 ring-white/70" : ""}`}
      style={face}
    >
      {status === "cleared" ? <span aria-hidden>✓</span> : step}
      {status === "current" && (
        <span className="absolute -top-3 rounded-full border-2 border-white bg-[#e64a5f] px-2 py-0.5 text-[9px] font-black whitespace-nowrap text-white shadow-md">
          いま ここ
        </span>
      )}
      {status === "locked" && (
        <span
          aria-hidden
          className="absolute -top-2 -right-1 grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-[#9db0c2] text-[11px] text-white shadow"
        >
          🔒
        </span>
      )}
    </button>
  );
}

/**
 * ステージの説明パネル。
 * いま取り組むステージのときは、これがそのまま「現在のレッスン」カードになる
 * （別枠の固定カードを置くとマップが隠れてしまうため、地図の上で一体にしている）。
 */
function StagePanel({
  stage,
  status,
  progress,
  open,
  onToggle,
}: {
  stage: MapStage;
  status: StageStatus;
  progress: StageProgress;
  open: boolean;
  onToggle: () => void;
}) {
  const current = status === "current";
  const step = String(stage.number).padStart(2, "0");

  return (
    <section
      className={`card-pop overflow-hidden shadow-xl ${
        current ? "border-[3px] border-[#f9c3da]" : "border-white/90"
      }`}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center gap-2 p-3 text-left"
      >
        <span className="min-w-0 flex-1">
          {current && (
            <span
              className={`mb-1.5 inline-flex rounded-full border-2 border-white bg-[#e64a5f] px-3 py-0.5 text-[11px] font-black text-white shadow-[0_3px_0_#bd3148] ${BUTTON_RUBY}`}
            >
              ✦{" "}
              <ruby>
                現在<rt>げんざい</rt>
              </ruby>
              のレッスン ✦
            </span>
          )}
          {status === "cleared" && (
            <span className="mb-1.5 inline-flex rounded-full border-2 border-white bg-[#3aa458] px-3 py-0.5 text-[11px] font-black text-white shadow-[0_3px_0_#26714a]">
              ✓ クリア
            </span>
          )}
          <span className="text-sky block text-[10px] font-black tracking-widest sm:text-xs">
            STEP {step}
          </span>
          <span className="text-navy block truncate text-sm font-black sm:text-base">
            <StageTitle stage={stage} />
          </span>
          <span className="text-ink-soft block text-[10px] font-bold sm:text-xs">
            {/* 漢字が 無い 名前に よみは 要らない（StageTitle と 同じ判断）。 */}
            {HAS_KANJI.test(stage.title) ? <>（{stage.reading}）・ </> : null}
            <KindLabel stage={stage} />
          </span>
        </span>
        <span
          aria-hidden
          className={`text-sky text-xl font-black transition-transform ${open ? "rotate-90" : ""}`}
        >
          ›
        </span>
      </button>

      {open && (
        <div className="border-hairline border-t px-3 pt-2 pb-3">
          <p className="text-ink text-xs font-bold sm:text-sm">
            <RubyText text={stage.description} furigana={stage.furigana} />
          </p>

          {current ? (
            <>
              <ProgressBar progress={progress} />
              <StageActions stage={stage} />
            </>
          ) : (
            /*
             * さきのステージも開ける。鍵は「まだ ここまで 来ていない」というしるしで、
             * 通せんぼではない——先に見たい学習者を止める理由がない（設計01 P4）。
             */
            <Link
              prefetch={false}
              href={`/${stage.id}`}
              className={`btn-game mt-2 w-full px-3 py-1.5 text-sm ${BUTTON_RUBY} [--btn-face:#ffc93c] [--btn-shadow:#f0a819]`}
            >
              {status === "cleared" ? "もういちど" : "すすむ"}
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * いまのステージで押せるボタン（さいしょから／つづきから／単語）。
 *
 * 「つづきから」は**どこから始まるのか**を出し、その画面へ直接行く。
 * ステージのトップに戻すだけだと、学習者はもう一度どれを開くか選ぶことになり、
 * 「つづき」と書いてある意味がなくなる。
 *
 * どの札をどこへ向けるかは `mapStageActions`（純関数）が決める。マップは
 * ログインの内側なので通しの検証から見えず、見張れるのは単体テストだけである。
 */
function StageActions({ stage }: { stage: MapStage }) {
  const items = stage.contents;
  const serverKey = useMemo(() => items.map(() => "0").join(""), [items]);
  const progressKey = useSyncExternalStore(
    subscribeProgress,
    () => items.map((item) => contentStatusCode(readContentProgress(item.id))).join(""),
    () => serverKey,
  );
  const { resume, resumeIndex, allDone, restartHref, wordsHref } = mapStageActions(
    stage,
    progressKey,
  );

  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-1">
      {resume ? (
        <Link
          prefetch={false}
          href={resume.href}
          className={`btn-game flex-col px-4 py-2 leading-tight ${BUTTON_RUBY} [--btn-face:#f26fa7] [--btn-shadow:#d94d84]`}
        >
          <span>
            ▶{" "}
            {allDone ? (
              "もういちど 見る"
            ) : (
              <>
                <ruby>
                  続き<rt>つづき</rt>
                </ruby>
                から
              </>
            )}
          </span>
          <span className="text-[11px]">
            {contentKindMeta(resume.type).icon} {contentKindMeta(resume.type).label}
            {items.length > 1 ? `（${resumeIndex + 1}／${items.length}）` : ""}
          </span>
        </Link>
      ) : (
        <Link
          prefetch={false}
          href={`/${stage.id}`}
          className={`btn-game px-4 py-2 ${BUTTON_RUBY} [--btn-face:#f26fa7] [--btn-shadow:#d94d84]`}
        >
          ステージを ひらく
        </Link>
      )}

      {/*
        やり直したい学習者に「進捗を消す」以外の手を用意する。行き先は**ステージのトップ**
        （2026-08-25 の指定）。1本目をいきなり開くと、何が何本あってどこまで進んだかを
        見ないまま教材の中に入ることになる。
      */}
      {restartHref ? (
        <Link
          prefetch={false}
          href={restartHref}
          className={`btn-game flex-col px-4 py-2 leading-tight ${BUTTON_RUBY} [--btn-face:#4fa8e8] [--btn-shadow:#0272ae]`}
        >
          <span>
            ↩{" "}
            <ruby>
              最初<rt>さいしょ</rt>
            </ruby>
            から
          </span>
          <span className="text-[11px]">ステージを ひらく</span>
        </Link>
      ) : null}

      {/* ことばが ひもづいて いない ステージには 出さない（2026-08-25 の指定） */}
      {wordsHref ? (
        <Link
          prefetch={false}
          href={wordsHref}
          className={`btn-game flex-col px-4 py-2 leading-tight ${BUTTON_RUBY} [--btn-face:#ffc93c] [--btn-shadow:#f0a819]`}
        >
          <span>
            📖{" "}
            <ruby>
              単語<rt>たんご</rt>
            </ruby>
            を
            <ruby>
              勉強<rt>べんきょう</rt>
            </ruby>
          </span>
          <span className="text-[11px]">この ステージの ことば</span>
        </Link>
      ) : null}
    </div>
  );
}

/** 道のりのエリア1枚（背景＋足跡＋ステージ）。上下10%が同じ海色なので継ぎ目が見えない */
function RouteArea({
  area,
  index,
  stage,
  totalAreas,
  flown,
  progress,
  learner,
  expandedStage,
  onExpandedStageChange,
}: {
  area: MapArea;
  index: number;
  /** このエリアに立つステージ。通過するだけのエリアは undefined */
  stage: MapStage | undefined;
  /** 道のりのエリアの総数。航路の波はこれで決まる */
  totalAreas: number;
  /** 学習者の現在地（エリア番号 + エリア内の位置） */
  flown: number;
  progress: StageProgress;
  /** 学習者じしんの分身。いま取り組むステージのエリアにだけ立つ */
  learner: LearnerAvatar | null;
  expandedStage: string | null;
  onExpandedStageChange: (id: string | null) => void;
}) {
  const status = stage ? stageStatus(stage.id, progress) : null;
  const nodeX = routeX(index + NODE_TOP / 100, totalAreas);
  const nodeTop = NODE_TOP;
  const chipOnRight = nodeX <= 50;
  const open = stage ? expandedStage === stage.id : false;
  const areaCleared = status === "cleared" || (!stage && index < flown);

  return (
    <section
      aria-label={area.name}
      /* 狭い画面ではレッスンパネルが丸の真下に縦長で開くので、そのぶん背を高くする。
         詰めるとパネルが次のエリアまではみ出し、エリア名の札に重なる */
      className="relative h-[940px] w-full md:h-[clamp(680px,64vh,780px)]"
      style={{ backgroundColor: SKY_BLUE }}
    >
      <AreaImage src={area.image} fade="both" />
      {/* 四隅を雲でぼかして、画像の角が四角く出ないようにする */}
      <CloudCorners />

      <MapLayer>
        <AreaLabel area={area} onRight={!chipOnRight} cleared={areaCleared} />

        <AreaTrail
          xAt={(t) => routeX(index + t, totalAreas)}
          areaIndex={index}
          flownUntil={flown}
        />

        {/* 道中だけのエリアには、一言だけ添えて「なにも無い」感じにしない */}
        {!stage && (
          <p className="text-navy absolute bottom-10 left-1/2 z-20 -translate-x-1/2 rounded-full border-2 border-white bg-white/85 px-4 py-1.5 text-xs font-black shadow-md backdrop-blur-sm">
            ☁ {area.note}
          </p>
        )}

        {/* いま取り組むステージのエリアには学習者の分身を立たせ、それ以外は景色の住人を置く。
            両方いると「どれが自分か」が分からなくなるので、同じ場所で入れ替える。
            分身はせまい画面でも出す（自分がどこに居るかは、いつでも見えるべきもの）。

            置き場所は**ステージの丸のとなり・レッスンパネルの反対側**。以前は
            パネルと同じ側の少し下に置いていて、実測でパネルの裏に完全に隠れていた
            （分身 x701-793 に対しパネル x605-900）。丸より少し上に出すのは、
            せまい画面でパネルが丸の真下に開くため。 */}
        {learner && status === "current" ? (
          <LearnerHere
            learner={learner}
            className="z-40"
            style={{ left: `${chipOnRight ? nodeX - 9 : nodeX + 9}%`, top: `${nodeTop - 5}%` }}
          />
        ) : (
          <div
            aria-hidden
            className="pointer-events-none absolute z-20 hidden -translate-x-1/2 -translate-y-1/2 lg:block"
            style={{ left: `${chipOnRight ? nodeX + 26 : nodeX - 26}%`, top: `${nodeTop + 22}%` }}
          >
            <NexMaxFamily
              family={AREA_CHARACTERS[index % AREA_CHARACTERS.length]!}
              size={104}
              bob
            />
          </div>
        )}

        {stage && status && (
          <>
            <div
              className="absolute z-30 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${nodeX}%`, top: `${nodeTop}%` }}
            >
              <StageNode
                stage={stage}
                status={status}
                open={open}
                onToggle={() => onExpandedStageChange(open ? null : stage.id)}
              />
            </div>

            <div
              /* モバイルはステージの丸の「下」、md 以上は丸の「横」に置く */
              style={
                {
                  "--panel-top-narrow": `calc(${nodeTop}% + 3.25rem)`,
                  "--panel-top": `${nodeTop}%`,
                  "--panel-left": `calc(${nodeX}% + 3.75rem)`,
                  "--panel-right": `calc(${100 - nodeX}% + 3.75rem)`,
                } as CSSProperties
              }
              /* md 以上では丸の横に置く。上へ 35% しか出さないのは、1枚目のエリアで
                 パネルが上に伸びると START の看板に重なってしまうため（中央合わせだと重なる） */
              className={`absolute top-[var(--panel-top-narrow)] left-1/2 z-30 w-[min(92vw,22rem)] -translate-x-1/2 md:top-[var(--panel-top)] md:w-[21rem] md:translate-x-0 md:-translate-y-[35%] ${
                chipOnRight
                  ? "md:left-[var(--panel-left)]"
                  : "md:right-[var(--panel-right)] md:left-auto"
              }`}
            >
              <StagePanel
                stage={stage}
                status={status}
                progress={progress}
                open={open}
                onToggle={() => onExpandedStageChange(open ? null : stage.id)}
              />
            </div>
          </>
        )}
      </MapLayer>

      {/* 土地の境目の雲海。エリアの下端にまたがるので、背景画像の切り口が雲に隠れる */}
      <CloudBand className="bottom-0 translate-y-1/2" />
    </section>
  );
}

/** 最後のエリア＝日本。道のりの終点として、地図の一番下に置く（他の情報を上に重ねない） */
function GoalArea({
  goalArea,
  totalAreas,
  flown,
  progress,
}: {
  goalArea: MapArea;
  totalAreas: number;
  flown: number;
  progress: StageProgress;
}) {
  const complete = progress.currentStageId === null;
  return (
    <section
      aria-label={goalArea.name}
      className="relative h-[clamp(320px,40vh,460px)] w-full overflow-hidden"
      style={{ backgroundColor: SKY_BLUE }}
    >
      <AreaImage src={goalArea.image} fade="top" />

      <MapLayer>
        {/* 航路は看板に触れる手前で終える。看板は中央から上下に約 5.5rem あるので、
            そのぶん＋余白を空ける。突き抜けると着地して見えない */}
        <div className="absolute inset-x-0 top-0 bottom-[calc(50%+3.5rem)]">
          <AreaTrail xAt={() => 50} areaIndex={totalAreas} flownUntil={flown} />
        </div>

        <div className="absolute top-1/2 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="mx-auto h-7 w-4 bg-linear-to-r from-[#6f3518] via-[#a7622e] to-[#5a2b15] shadow-md" />
          <div
            className={`min-w-48 rounded-lg border-4 px-6 py-2 text-white shadow-[0_7px_0_#4e250f,0_12px_24px_rgba(0,0,0,.28)] ${
              complete
                ? "animate-pulse border-[#ffe477] bg-linear-to-b from-[#e8a33c] to-[#b96a32]"
                : "border-[#fff3cf] bg-linear-to-b from-[#b96a32] to-[#713516]"
            }`}
          >
            <p className="text-xl font-black tracking-wider">GOAL!</p>
            <p className="text-sm font-extrabold">
              <ruby>
                {goalArea.name}
                <rt className="text-white!">{goalArea.reading}</rt>
              </ruby>
            </p>
          </div>
          <p className="text-navy mt-2 inline-block rounded-full border-2 border-white bg-white/90 px-3 py-1 text-[11px] font-black shadow-md">
            {complete
              ? "ぜんぶ クリア！ おつかれさま。"
              : `のこり ${progress.totalCount - progress.clearedCount} ステージ`}
          </p>
        </div>
      </MapLayer>
    </section>
  );
}

function MapViewPane({
  routeAreas,
  goalArea,
  stageById,
  progress,
  learner,
  expandedStage,
  onExpandedStageChange,
}: {
  routeAreas: readonly MapArea[];
  goalArea: MapArea;
  stageById: ReadonlyMap<string, MapStage>;
  progress: StageProgress;
  /** 学習者じしん（診断で決まった分身のネクマックス）。未診断なら null */
  learner: LearnerAvatar | null;
  expandedStage: string | null;
  onExpandedStageChange: (id: string | null) => void;
}) {
  const firstArea = routeAreas[0];
  const flown = flownUntil(progress, routeAreas);
  // 分身が立つ場所。まだ1つも終えていなければ「スタートの立札」のところに立つ
  const atStart = flown <= 0;
  return (
    <main className="relative w-full overflow-x-hidden">
      {/* 出発の帯。1枚目のエリア画像の上端は平らな空色なので、同じ色で continuous に見える。
          高さは「看板の下端」と「1枚目のエリアで開く現在のレッスンパネルの上端」が
          ぶつからない分だけ取る（詰めると看板がパネルに隠れる） */}
      <div className="relative h-64 w-full" style={{ backgroundColor: SKY_BLUE }}>
        {/* 1枚目のエリアの上端にも雲をかける。看板より先に置いて、看板を隠さないようにする */}
        <CloudBand className="bottom-0 translate-y-1/2" />
        <MapLayer>
          {/* 看板より上には航路を引かない（出発点なので、道は看板の真下から始まる）。
              看板の下端から下だけに引いて、1枚目のエリアへ切れ目なくつなぐ */}
          <WoodenBanner label="START!" className="top-20 left-1/2">
            {firstArea?.name ?? "スタート"}
          </WoodenBanner>
          {learner && atStart && <LearnerHere learner={learner} className="top-40 left-1/2" />}
          <div className="absolute inset-x-0 top-[13rem] bottom-0">
            <AreaTrail xAt={() => 50} areaIndex={-1} flownUntil={flown} />
          </div>
        </MapLayer>
      </div>

      {routeAreas.map((area, index) => (
        <RouteArea
          key={area.id}
          area={area}
          index={index}
          stage={area.stageId ? stageById.get(area.stageId) : undefined}
          totalAreas={routeAreas.length}
          flown={flown}
          progress={progress}
          learner={learner}
          expandedStage={expandedStage}
          onExpandedStageChange={onExpandedStageChange}
        />
      ))}
      <GoalArea
        goalArea={goalArea}
        totalAreas={routeAreas.length}
        flown={flown}
        progress={progress}
      />
    </main>
  );
}

function CardsView({ stages, progress }: { stages: readonly MapStage[]; progress: StageProgress }) {
  return (
    <main className="bg-bg-sky relative min-h-dvh px-4 pt-36 pb-16 sm:px-8 md:pl-48">
      <section className="relative z-10 mx-auto max-w-6xl">
        <div className="rounded-[2rem] border-2 border-white bg-white/80 p-5 shadow-2xl backdrop-blur-md sm:p-8">
          <h1 className="text-navy text-2xl font-black">🃏 カード</h1>
          <div className="mx-auto mt-3 max-w-sm">
            <ProgressBar progress={progress} />
          </div>
          <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {stages.map((stage) => {
              const status = stageStatus(stage.id, progress);
              return (
                <article key={stage.id} className="card-pop flex flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sky text-xs font-black tracking-widest">
                        STEP {String(stage.number).padStart(2, "0")}
                      </p>
                      <h2 className="text-navy mt-1 text-xl font-black">
                        <StageTitle stage={stage} />
                      </h2>
                      {HAS_KANJI.test(stage.title) && (
                        <p className="text-ink-soft text-xs font-bold">（{stage.reading}）</p>
                      )}
                    </div>
                    <span
                      className="grid h-11 w-11 place-items-center rounded-full border-4 border-white text-lg shadow-md"
                      style={{
                        backgroundColor:
                          status === "current"
                            ? CURRENT_COLOR
                            : status === "cleared"
                              ? CLEARED_COLOR
                              : "#ffffff",
                        color: status === "locked" ? STAGE_COLORS[stage.color] : "#ffffff",
                      }}
                    >
                      {status === "cleared" ? "✓" : status === "current" ? "▶" : "○"}
                    </span>
                  </div>
                  <p className="text-ink-soft mt-3 text-sm font-extrabold">
                    <KindLabel stage={stage} />
                  </p>
                  <p className="text-ink mt-2 flex-1 text-sm font-bold">
                    <RubyText text={stage.description} furigana={stage.furigana} />
                  </p>
                  <p className="text-ink-soft mt-3 text-xs font-extrabold">
                    {status === "cleared"
                      ? "クリア"
                      : status === "current"
                        ? "いまの ステージ"
                        : "じゅんびちゅう"}
                  </p>
                  <Link
                    prefetch={false}
                    href={`/${stage.id}`}
                    className="btn-game mt-4 w-full px-4 py-2 [--btn-face:#ffc93c] [--btn-shadow:#f0a819]"
                  >
                    {status === "cleared" ? "もういちど" : "すすむ"}
                  </Link>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}

export function MapShell({
  routeAreas,
  goalArea,
  stages,
}: {
  /** 道のりのエリア（ゴールを除く）。既定 ∪ スタジオで作ったステージ。 */
  routeAreas: readonly MapArea[];
  /** 最後のエリア＝日本。 */
  goalArea: MapArea;
  /** マップとカードに出すステージ（step 昇順）。 */
  stages: readonly MapStage[];
}) {
  const router = useRouter();
  const stageById = useMemo(() => new Map(stages.map((stage) => [stage.id, stage])), [stages]);
  const rawProfile = useSyncExternalStore(
    subscribeToStorage,
    profileSnapshot,
    () => PROFILE_SERVER_SNAPSHOT,
  );
  const rawProgress = useSyncExternalStore(
    subscribeToStorage,
    progressSnapshot,
    () => PROGRESS_SERVER_SNAPSHOT,
  );
  const storedView = useSyncExternalStore<MapView>(subscribeToStorage, getMapView, () => "map");
  const cachedProfile = useMemo(
    () => (rawProfile === PROFILE_SERVER_SNAPSHOT ? null : getProfile()),
    [rawProfile],
  );
  const stageIds = useMemo(() => stages.map((stage) => stage.id), [stages]);
  const progress = useMemo(() => {
    let parsed: unknown = [];
    try {
      parsed = JSON.parse(rawProgress);
    } catch {
      // 壊れた保存値。読めないだけなので、進捗0として続ける（画面は落とさない）
    }
    return deriveProgress(Array.isArray(parsed) ? (parsed as string[]) : [], stageIds);
  }, [rawProgress, stageIds]);
  const [databaseProfile, setDatabaseProfile] = useState<DiagnosedProfileRow | null>(null);
  const profile = databaseProfile ? profileFromRow(databaseProfile) : cachedProfile;
  // 地図に立たせる分身。診断が終わっていない人には出さない（絵が決まらない）
  const learnerAvatar: LearnerAvatar | null = profile
    ? {
        family: getFamilyForCode(profile.type).id,
        gender: profile.gender,
        name: profile.displayName,
      }
    : null;
  const [viewOverride, setViewOverride] = useState<MapView | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loadingIsSlow, setLoadingIsSlow] = useState(false);
  // undefined = 学習者がまだ触っていない。そのあいだは「いま取り組むステージ」を開いておく
  const [expandedOverride, setExpandedOverride] = useState<string | null | undefined>(undefined);
  const view = viewOverride ?? storedView;

  const expandedStage = expandedOverride === undefined ? progress.currentStageId : expandedOverride;

  useEffect(() => {
    let active = true;
    void (async () => {
      // 例外は必ずここで拾う。取りこぼすと `void` に握りつぶされ、リダイレクトも
      // setState も走らないまま「マップを じゅんびしています」から抜けられなくなる。
      // getUser() は通信断・セッション切れ・トークン不正のいずれでも throw しうる。
      try {
        const supabase = createClient();
        if (!supabase) {
          router.replace("/welcome");
          return;
        }
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.replace("/welcome");
          return;
        }
        const stored = await fetchOwnProfile();
        if (!stored) {
          router.replace("/welcome");
          return;
        }
        // 管理者が診断をリセットすると answers/scores が空で戻る。ログインしただけの
        // 行（型も性別も空）もここへ来る。profileFromRow が投げるのに任せず、明示的に診断へ送る。
        if (!isDiagnosedRow(stored)) {
          clearProfile();
          router.replace("/welcome");
          return;
        }
        // なまえを「苗字・名前」に分ける前に作られた行。カタカナで入れ直してもらう（願い #14）。
        // 診断はもう終わっているので、/welcome はなまえの欄だけを出す（20問はやり直さない）。
        if (
          !hasLearnerNames({ familyName: stored.family_name, givenName: stored.given_name }) ||
          !isSchoolChosen({ university: stored.university, cohort: stored.cohort })
        ) {
          router.replace("/welcome");
          return;
        }
        saveProfile(profileFromRow(stored));
        if (active) setDatabaseProfile(stored);
      } catch {
        router.replace("/welcome");
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  // 通信が返ってこないときは例外も起きないので、待ち続けるしかなくなる。
  // 一定時間で「やりなおす道」を出して、黙って固まったままにしない。
  useEffect(() => {
    if (profile) return;
    const timer = setTimeout(() => setLoadingIsSlow(true), 8000);
    return () => clearTimeout(timer);
  }, [profile]);

  const changeView = useCallback((nextView: MapView) => {
    saveMapView(nextView);
    setViewOverride(nextView);
  }, []);

  if (!profile) {
    return (
      <main className="from-bg-sky to-bg-warm grid min-h-dvh place-items-center bg-linear-to-b p-6">
        <div className="text-center">
          <p className="text-navy inline-block rounded-full bg-white px-6 py-3 font-extrabold shadow-lg">
            マップを じゅんびしています。
          </p>
          {loadingIsSlow && (
            <div className="mx-auto mt-5 max-w-sm rounded-2xl border-2 border-white bg-white/90 p-5 shadow-lg">
              <p className="text-ink text-sm font-bold">
                じかんが かかっています。つうしんの ちょうしを みて、もういちど ためしてください。
              </p>
              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="btn-game w-full px-4 py-2 [--btn-face:#ffc93c] [--btn-shadow:#f0a819]"
                >
                  もういちど よみこむ
                </button>
                <Link
                  prefetch={false}
                  href="/welcome"
                  className="text-sky text-sm font-extrabold underline underline-offset-4"
                >
                  ログインを やりなおす
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <div className="bg-bg-sky relative min-h-dvh">
      <Logo />
      <Hud
        profile={databaseProfile}
        progress={progress}
        stages={stages}
        view={view}
        onViewChange={changeView}
      />
      <Navigation
        collapsed={collapsed}
        drawerOpen={drawerOpen}
        isAdmin={databaseProfile?.is_admin ?? false}
        onCollapsedChange={(value) => {
          setCollapsed(value);
          if (!value && window.innerWidth < 768) setDrawerOpen(true);
        }}
        onDrawerClose={() => setDrawerOpen(false)}
        onLogout={() => void signOut()}
      />

      {view === "map" ? (
        <MapViewPane
          routeAreas={routeAreas}
          goalArea={goalArea}
          stageById={stageById}
          progress={progress}
          learner={learnerAvatar}
          expandedStage={expandedStage}
          onExpandedStageChange={setExpandedOverride}
        />
      ) : (
        <CardsView stages={stages} progress={progress} />
      )}
    </div>
  );
}
