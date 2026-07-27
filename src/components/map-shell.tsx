"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { signOut } from "@/app/auth/actions";
import { AreaTrail } from "@/components/map-trail";
import { NekuMaxType } from "@/components/nekumax-types";
import { CloudBand } from "@/components/cloud-band";
import { GOAL_AREA, ROUTE_AREAS, SKY_BLUE, type MapArea } from "@/content/areas";
import { getPersonalityType, type PersonalityTypeId } from "@/content/personality";
import { STAGES, type StageDefinition } from "@/content/stages";
import { fetchOwnProfile, type ProfileRow } from "@/lib/profile-db";
import {
  getMapView,
  getProfile,
  saveMapView,
  saveProfile,
  type MapView,
  type NexmaxProfile,
} from "@/lib/profile";
import {
  deriveProgress,
  getClearedStageIds,
  stageStatus,
  type StageProgress,
  type StageStatus,
} from "@/lib/progress";
import { createClient } from "@/lib/supabase/client";

const PROFILE_SERVER_SNAPSHOT = "__server__";
const PROGRESS_SERVER_SNAPSHOT = "[]";
const LONG_WAIT_TOAST = "じゅんびちゅう です。もうすこし まってね！";
const SHORT_WAIT_TOAST = "じゅんびちゅう です。";

/** 各エリアの中央に立つステージの x 位置（%）。左右に振って道をうねらせる */
const AREA_NODE_X = [58, 38, 62, 40, 60] as const;

/**
 * エリア内でステージを置く高さ（%）。上寄りに置いて、下に「現在のレッスン」パネルを
 * 開くぶんの余白を残す（狭い画面ではパネルが丸の真下に来るため）。
 */
const NODE_TOP = 30;

/** 進捗の色。歩いた道＝葉、いまここ＝珊瑚ピンク、まだ＝白 */
const CURRENT_COLOR = "#f26fa7";
const CLEARED_COLOR = "#3aa458";

const STAGE_COLORS = {
  leaf: "#58c273",
  sky: "#4fa8e8",
  coral: "#f26fa7",
  "sky-soft": "#9bdcf7",
} satisfies Record<StageDefinition["color"], string>;

/** 装飾のネクマックス。エリアごとに1体、ステージと反対側に立たせる */
const AREA_CHARACTERS: readonly PersonalityTypeId[] = [
  "leader",
  "idea",
  "heart",
  "challenge",
  "leader",
];

const STAGE_BY_ID = new Map(STAGES.map((stage) => [stage.id, stage]));

/**
 * エリアの境目における道の x 座標（%）。
 * 出発点とゴールは中央（看板の真下）、途中はとなり合うステージの中点にすると道が折れない。
 */
const AREA_BOUNDARY_X = [
  50,
  ...AREA_NODE_X.slice(1).map((x, index) => (AREA_NODE_X[index]! + x) / 2),
  50,
];

function subscribeToStorage(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

function profileSnapshot() {
  return JSON.stringify(getProfile());
}

function progressSnapshot() {
  return JSON.stringify(getClearedStageIds());
}

function profileFromRow(profile: ProfileRow): NexmaxProfile {
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
function flownUntil(progress: StageProgress): number {
  // すべてクリアなら日本まで飛び切っている（ゴールのエリアの航路も塗る）
  if (!progress.currentStageId) return ROUTE_AREAS.length + 1;
  const index = ROUTE_AREAS.findIndex((area) => area.stageId === progress.currentStageId);
  if (index < 0) return ROUTE_AREAS.length;
  return index + NODE_TOP / 100;
}

function Logo() {
  return (
    <Link
      href="/"
      aria-label="Nexmax Academy"
      className="fixed top-3 left-3 z-50 rounded-2xl bg-white/90 px-3 py-2 text-center leading-none shadow-lg backdrop-blur-sm"
    >
      <span className="block bg-linear-to-b from-[#55c7ff] to-[#005fa8] bg-clip-text text-sm font-black text-transparent [-webkit-text-stroke:1px_white]">
        Nexmax
      </span>
      <span className="block bg-linear-to-b from-[#ffe477] to-[#f0a819] bg-clip-text text-xs font-black text-transparent [-webkit-text-stroke:1px_white]">
        Academy
      </span>
    </Link>
  );
}

function StageTitle({ stage }: { stage: StageDefinition }) {
  switch (stage.id) {
    case "it-words":
      return (
        <>
          IT
          <ruby>
            単語帳<rt>たんごちょう</rt>
          </ruby>
        </>
      );
    case "company-structure":
      return (
        <>
          <ruby>
            企業<rt>きぎょう</rt>
          </ruby>
          の
          <ruby>
            仕組み<rt>しくみ</rt>
          </ruby>
        </>
      );
    case "report":
      return (
        <ruby>
          報告<rt>ほうこく</rt>
        </ruby>
      );
    case "contact":
      return (
        <ruby>
          連絡<rt>れんらく</rt>
        </ruby>
      );
    case "consult":
      return (
        <ruby>
          相談<rt>そうだん</rt>
        </ruby>
      );
    default:
      return stage.title;
  }
}

function KindLabel({ stage }: { stage: StageDefinition }) {
  if (stage.kind === "word") {
    return (
      <>
        🌐
        <ruby>
          単語<rt>たんご</rt>
        </ruby>
      </>
    );
  }
  if (stage.kind === "pair") return <>👥 ペアワーク</>;
  if (stage.kind === "video-reading") {
    return (
      <>
        ▶
        <ruby>
          動画<rt>どうが</rt>
        </ruby>
        /
        <ruby>
          読解<rt>どっかい</rt>
        </ruby>
      </>
    );
  }
  return (
    <>
      ▶
      <ruby>
        動画<rt>どうが</rt>
      </ruby>
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
 * 地図の「中身」を置く層。背景画像は画面いっぱいのまま、看板・足跡・ステージだけを
 * 左のサイドメニューのぶんだけ内側に寄せる（メニューに隠れないようにするため）。
 * 足跡もこの層の中で位置を測るので、ステージの丸と道がずれない。
 */
function MapLayer({ children }: { children: ReactNode }) {
  return <div className="absolute inset-0 md:left-44">{children}</div>;
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

function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-navy fixed bottom-6 left-1/2 z-[80] w-[min(90vw,34rem)] -translate-x-1/2 rounded-2xl border-2 border-white px-5 py-3 text-center font-extrabold text-white shadow-2xl"
    >
      {message}
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

function Hud({ profile, progress }: { profile: ProfileRow | null; progress: StageProgress }) {
  return (
    <div className="fixed top-3 right-3 z-50 flex max-w-[calc(100vw-6rem)] flex-wrap justify-end gap-2">
      <div className="flex gap-1.5">
        {[
          {
            key: "stage",
            node: (
              <>
                🚩 {progress.clearedCount}/{progress.totalCount}
              </>
            ),
          },
          {
            key: "coin",
            node: (
              <>
                <span
                  aria-hidden
                  className="inline-block h-3.5 w-3.5 rounded-full border-2 border-[#d9a839] bg-[linear-gradient(180deg,#ffe37a,#f5b70f)] align-[-2px]"
                />{" "}
                0
              </>
            ),
          },
          { key: "gem", node: <>💎 0</> },
        ].map((item) => (
          <span
            key={item.key}
            className="text-navy rounded-full border-2 border-[#e9bd55] bg-[#fffaf0]/95 px-3 py-1 text-xs font-black shadow-[0_3px_0_#d9a839,0_7px_15px_rgba(0,79,141,.14)] backdrop-blur-sm sm:text-sm"
          >
            {item.node}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-2xl border-2 border-[#e9bd55] bg-[#fffaf0]/95 p-1.5 pr-3 shadow-[0_4px_0_#d9a839,0_8px_18px_rgba(0,79,141,.16)]">
        {profile ? (
          <>
            <NekuMaxType id={profile.personality_type} gender={profile.gender} size={42} />
            <span className="hidden leading-tight sm:block">
              <span className="text-ink block text-sm font-black">{profile.display_name}</span>
              <span className="text-ink-soft block text-[10px] font-extrabold">
                {getPersonalityType(profile.personality_type).name}
              </span>
            </span>
            <span aria-label="オンライン" className="bg-leaf h-2.5 w-2.5 rounded-full" />
          </>
        ) : (
          <>
            <span aria-hidden className="bg-hairline block h-10 w-10 animate-pulse rounded-full" />
            <span className="hidden min-w-20 leading-tight sm:block">
              <span className="text-ink block text-sm font-black">…</span>
              <span className="text-ink-soft block text-[10px] font-extrabold">…</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function ViewToggle({ view, onChange }: { view: MapView; onChange: (view: MapView) => void }) {
  return (
    <div className="fixed top-[4.75rem] right-3 z-50 flex rounded-full border-2 border-[#e9bd55] bg-[#fffaf0]/95 p-1 text-xs font-black shadow-[0_3px_0_#d9a839] sm:top-[4.25rem] sm:text-sm">
      <button
        type="button"
        aria-pressed={view === "map"}
        onClick={() => onChange("map")}
        className={`rounded-full px-3 py-1.5 ${view === "map" ? "bg-navy text-white" : "text-ink-soft"}`}
      >
        🗺️ マップ
      </button>
      <span aria-hidden className="text-ink-faint self-center">
        ⇄
      </span>
      <button
        type="button"
        aria-pressed={view === "cards"}
        onClick={() => onChange("cards")}
        className={`rounded-full px-3 py-1.5 ${view === "cards" ? "bg-navy text-white" : "text-ink-soft"}`}
      >
        🃏 カード
      </button>
    </div>
  );
}

const NAV_ITEMS = [
  { icon: "👤", label: "マイページ" },
  { icon: "📖", label: "単語", reading: "たんご" },
  { icon: "👥", label: "チーム・ペア" },
  { icon: "🛍️", label: "ショップ" },
] as const;

function NavigationLabel({ item }: { item: (typeof NAV_ITEMS)[number] }) {
  if ("reading" in item) {
    return (
      <ruby>
        {item.label}
        <rt>{item.reading}</rt>
      </ruby>
    );
  }
  return item.label;
}

function Navigation({
  collapsed,
  drawerOpen,
  isAdmin,
  onCollapsedChange,
  onDrawerClose,
  onUnavailable,
  onLogout,
}: {
  collapsed: boolean;
  drawerOpen: boolean;
  isAdmin: boolean;
  onCollapsedChange: (value: boolean) => void;
  onDrawerClose: () => void;
  onUnavailable: () => void;
  onLogout: () => void;
}) {
  const navButtons = NAV_ITEMS.map((item) => (
    <button
      key={item.label}
      type="button"
      onClick={() => {
        onUnavailable();
        onDrawerClose();
      }}
      className="text-ink hover:bg-sky-soft flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-3 text-sm font-extrabold transition"
    >
      <span aria-hidden className="text-xl">
        {item.icon}
      </span>
      {!collapsed && <span className="whitespace-nowrap">{<NavigationLabel item={item} />}</span>}
    </button>
  ));
  const adminLink = isAdmin ? (
    <Link
      href="/admin"
      onClick={onDrawerClose}
      className="text-ink hover:bg-sky-soft flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-3 text-sm font-extrabold transition"
    >
      <span aria-hidden className="text-xl">
        🛡️
      </span>
      {!collapsed && <span className="whitespace-nowrap">かんり</span>}
    </Link>
  ) : null;
  const logoutButton = (
    <button
      type="button"
      onClick={() => {
        onDrawerClose();
        onLogout();
      }}
      className="text-ink hover:bg-sky-soft flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-3 text-sm font-extrabold transition"
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
        {navButtons}
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
            <p className="text-navy mb-4 text-lg font-black">Nexmax Academy</p>
            <div className="space-y-2">
              {navButtons}
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
  stage: StageDefinition;
  status: StageStatus;
  open: boolean;
  onToggle: () => void;
}) {
  const step = String(stage.step).padStart(2, "0");
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
  onUnavailable,
}: {
  stage: StageDefinition;
  status: StageStatus;
  progress: StageProgress;
  open: boolean;
  onToggle: () => void;
  onUnavailable: () => void;
}) {
  const current = status === "current";
  const step = String(stage.step).padStart(2, "0");

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
            <span className="mb-1.5 inline-flex rounded-full border-2 border-white bg-[#e64a5f] px-3 py-0.5 text-[11px] font-black text-white shadow-[0_3px_0_#bd3148]">
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
            （{stage.reading}）・ <KindLabel stage={stage} />
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
          <p className="text-ink text-xs font-bold sm:text-sm">{stage.description}</p>

          {current ? (
            <>
              <ProgressBar progress={progress} />
              <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-1">
                <button
                  type="button"
                  onClick={onUnavailable}
                  className="btn-game flex-col px-4 py-2 leading-tight [--btn-face:#f26fa7] [--btn-shadow:#d94d84]"
                >
                  <span>
                    ▶{" "}
                    <ruby>
                      続き<rt>つづき</rt>
                    </ruby>
                    から
                  </span>
                  <span className="text-[11px]">ステージを つづける</span>
                </button>
                <button
                  type="button"
                  onClick={onUnavailable}
                  className="btn-game flex-col px-4 py-2 leading-tight [--btn-face:#ffc93c] [--btn-shadow:#f0a819]"
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
                  <span className="text-[11px]">たんごを ふやして レベルアップ！</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onUnavailable}
                className="btn-game mt-2 w-full px-3 py-1.5 text-sm [--btn-face:#ffc93c] [--btn-shadow:#f0a819]"
              >
                {status === "cleared" ? "もういちど" : "すすむ"}
              </button>
              {status === "locked" && (
                <p className="text-ink-soft mt-2 text-center text-[10px] font-bold">
                  まえの ステージを クリアすると ひらきます。
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

/** 道のりのエリア1枚（背景＋足跡＋ステージ）。上下10%が同じ海色なので継ぎ目が見えない */
function RouteArea({
  area,
  index,
  progress,
  expandedStage,
  onExpandedStageChange,
  onUnavailable,
}: {
  area: MapArea;
  index: number;
  progress: StageProgress;
  expandedStage: string | null;
  onExpandedStageChange: (id: string | null) => void;
  onUnavailable: () => void;
}) {
  const stage = area.stageId ? STAGE_BY_ID.get(area.stageId) : undefined;
  const status = stage ? stageStatus(stage.id, progress) : null;
  const nodeX = AREA_NODE_X[index]!;
  const nodeTop = NODE_TOP;
  const chipOnRight = nodeX <= 50;
  const open = stage ? expandedStage === stage.id : false;
  const areaCleared = status === "cleared" || (!stage && index < flownUntil(progress));

  return (
    <section
      aria-label={area.name}
      className="relative h-[clamp(600px,58vh,660px)] w-full"
      style={{ backgroundColor: SKY_BLUE }}
    >
      <AreaImage src={area.image} fade="both" />

      <MapLayer>
        <AreaLabel area={area} onRight={!chipOnRight} cleared={areaCleared} />

        <AreaTrail
          xIn={AREA_BOUNDARY_X[index]!}
          xNode={nodeX}
          xOut={AREA_BOUNDARY_X[index + 1]!}
          nodeT={NODE_TOP / 100}
          areaIndex={index}
          flownUntil={flownUntil(progress)}
        />

        {/* 道中だけのエリアには、一言だけ添えて「なにも無い」感じにしない */}
        {!stage && (
          <p className="text-navy absolute bottom-10 left-1/2 z-20 -translate-x-1/2 rounded-full border-2 border-white bg-white/85 px-4 py-1.5 text-xs font-black shadow-md backdrop-blur-sm">
            ☁ {area.note}
          </p>
        )}

        <div
          aria-hidden
          className="pointer-events-none absolute z-20 hidden -translate-x-1/2 -translate-y-1/2 lg:block"
          style={{ left: `${chipOnRight ? nodeX + 26 : nodeX - 26}%`, top: `${nodeTop + 22}%` }}
        >
          <NekuMaxType id={AREA_CHARACTERS[index]!} size={104} bob />
        </div>

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
              className={`absolute top-[var(--panel-top-narrow)] left-1/2 z-30 w-[min(92vw,22rem)] -translate-x-1/2 md:top-[var(--panel-top)] md:w-[21rem] md:translate-x-0 md:-translate-y-1/2 ${
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
                onUnavailable={onUnavailable}
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
function GoalArea({ progress }: { progress: StageProgress }) {
  const complete = progress.currentStageId === null;
  return (
    <section
      aria-label={GOAL_AREA.name}
      className="relative h-[clamp(320px,40vh,460px)] w-full overflow-hidden"
      style={{ backgroundColor: SKY_BLUE }}
    >
      <AreaImage src={GOAL_AREA.image} fade="top" />

      <MapLayer>
        <AreaTrail
          xIn={AREA_BOUNDARY_X[AREA_BOUNDARY_X.length - 1]!}
          xNode={50}
          xOut={50}
          nodeT={0.5}
          areaIndex={ROUTE_AREAS.length}
          flownUntil={flownUntil(progress)}
        />

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
                {GOAL_AREA.name}
                <rt className="text-white">{GOAL_AREA.reading}</rt>
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
  progress,
  expandedStage,
  onExpandedStageChange,
  onUnavailable,
}: {
  progress: StageProgress;
  expandedStage: string | null;
  onExpandedStageChange: (id: string | null) => void;
  onUnavailable: () => void;
}) {
  const firstArea = ROUTE_AREAS[0]!;
  return (
    <main className="relative w-full overflow-x-hidden">
      {/* 出発の帯。1枚目のエリア画像の上端は平らな空色なので、同じ色で continuous に見える */}
      <div className="relative h-44 w-full" style={{ backgroundColor: SKY_BLUE }}>
        <MapLayer>
          <WoodenBanner label="START!" className="top-20 left-1/2">
            {firstArea.name}
          </WoodenBanner>
          <AreaTrail
            xIn={50}
            xNode={50}
            xOut={AREA_BOUNDARY_X[0]!}
            nodeT={0.5}
            areaIndex={-1}
            flownUntil={flownUntil(progress)}
          />
        </MapLayer>
      </div>

      {ROUTE_AREAS.map((area, index) => (
        <RouteArea
          key={area.id}
          area={area}
          index={index}
          progress={progress}
          expandedStage={expandedStage}
          onExpandedStageChange={onExpandedStageChange}
          onUnavailable={onUnavailable}
        />
      ))}
      <GoalArea progress={progress} />
    </main>
  );
}

function CardsView({
  progress,
  onUnavailable,
}: {
  progress: StageProgress;
  onUnavailable: () => void;
}) {
  return (
    <main className="bg-bg-sky relative min-h-dvh px-4 pt-36 pb-16 sm:px-8 md:pl-48">
      <section className="relative z-10 mx-auto max-w-6xl">
        <div className="rounded-[2rem] border-2 border-white bg-white/80 p-5 shadow-2xl backdrop-blur-md sm:p-8">
          <h1 className="text-navy text-2xl font-black">🃏 カード</h1>
          <div className="mx-auto mt-3 max-w-sm">
            <ProgressBar progress={progress} />
          </div>
          <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {STAGES.map((stage) => {
              const status = stageStatus(stage.id, progress);
              return (
                <article key={stage.id} className="card-pop flex flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sky text-xs font-black tracking-widest">
                        STEP {String(stage.step).padStart(2, "0")}
                      </p>
                      <h2 className="text-navy mt-1 text-xl font-black">
                        <StageTitle stage={stage} />
                      </h2>
                      <p className="text-ink-soft text-xs font-bold">（{stage.reading}）</p>
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
                  <p className="text-ink mt-2 flex-1 text-sm font-bold">{stage.description}</p>
                  <p className="text-ink-soft mt-3 text-xs font-extrabold">
                    {status === "cleared"
                      ? "クリア"
                      : status === "current"
                        ? "いまの ステージ"
                        : "じゅんびちゅう"}
                  </p>
                  <button
                    type="button"
                    onClick={onUnavailable}
                    className="btn-game mt-4 w-full px-4 py-2 [--btn-face:#ffc93c] [--btn-shadow:#f0a819]"
                  >
                    {status === "cleared" ? "もういちど" : "すすむ"}
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}

export function MapShell() {
  const router = useRouter();
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
  const progress = useMemo(() => {
    const parsed: unknown = JSON.parse(rawProgress);
    return deriveProgress(Array.isArray(parsed) ? (parsed as string[]) : []);
  }, [rawProgress]);
  const [databaseProfile, setDatabaseProfile] = useState<ProfileRow | null>(null);
  const profile = databaseProfile ? profileFromRow(databaseProfile) : cachedProfile;
  const [viewOverride, setViewOverride] = useState<MapView | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // undefined = 学習者がまだ触っていない。そのあいだは「いま取り組むステージ」を開いておく
  const [expandedOverride, setExpandedOverride] = useState<string | null | undefined>(undefined);
  const view = viewOverride ?? storedView;

  const expandedStage = expandedOverride === undefined ? progress.currentStageId : expandedOverride;

  useEffect(() => {
    let active = true;
    void (async () => {
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
      try {
        const stored = await fetchOwnProfile();
        if (!stored) {
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

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const changeView = useCallback((nextView: MapView) => {
    saveMapView(nextView);
    setViewOverride(nextView);
  }, []);

  if (!profile) {
    return (
      <main className="from-bg-sky to-bg-warm grid min-h-dvh place-items-center bg-linear-to-b">
        <p className="text-navy rounded-full bg-white px-6 py-3 font-extrabold shadow-lg">
          マップを じゅんびしています。
        </p>
      </main>
    );
  }

  return (
    <div className="bg-bg-sky relative min-h-dvh">
      <Logo />
      <Hud profile={databaseProfile} progress={progress} />
      <ViewToggle view={view} onChange={changeView} />
      <Navigation
        collapsed={collapsed}
        drawerOpen={drawerOpen}
        isAdmin={databaseProfile?.is_admin ?? false}
        onCollapsedChange={(value) => {
          setCollapsed(value);
          if (!value && window.innerWidth < 768) setDrawerOpen(true);
        }}
        onDrawerClose={() => setDrawerOpen(false)}
        onUnavailable={() => showToast(SHORT_WAIT_TOAST)}
        onLogout={() => void signOut()}
      />

      {view === "map" ? (
        <MapViewPane
          progress={progress}
          expandedStage={expandedStage}
          onExpandedStageChange={setExpandedOverride}
          onUnavailable={() => showToast(LONG_WAIT_TOAST)}
        />
      ) : (
        <CardsView progress={progress} onUnavailable={() => showToast(LONG_WAIT_TOAST)} />
      )}

      <Toast message={toast} />
    </div>
  );
}
