"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { NekuMaxType } from "@/components/nekumax-types";
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
import { createClient } from "@/lib/supabase/client";

const PROFILE_SERVER_SNAPSHOT = "__server__";
const LONG_WAIT_TOAST = "じゅんびちゅう です。もうすこし まってね！";
const SHORT_WAIT_TOAST = "じゅんびちゅう です。";

const STAGE_POSITIONS = [
  { x: 58, y: 20 },
  { x: 41, y: 34 },
  { x: 62, y: 49 },
  { x: 39, y: 65 },
  { x: 58, y: 80 },
] as const;

const CHARACTER_POSITIONS: readonly {
  id: PersonalityTypeId;
  x: number;
  y: number;
  size: number;
}[] = [
  { id: "leader", x: 76, y: 27, size: 112 },
  { id: "idea", x: 17, y: 42, size: 104 },
  { id: "heart", x: 75, y: 59, size: 108 },
  { id: "challenge", x: 18, y: 75, size: 112 },
];

const STAGE_COLORS = {
  leaf: "#58c273",
  sky: "#4fa8e8",
  coral: "#f26fa7",
  "sky-soft": "#9bdcf7",
} satisfies Record<StageDefinition["color"], string>;

function subscribeToStorage(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

function profileSnapshot() {
  return JSON.stringify(getProfile());
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

function MapSegment({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div className="h-full w-full bg-linear-to-b from-[#45b7df] to-[#2e9fd6]" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  );
}

function ScenicBackground() {
  const segments = [
    "/img/scenes/map_seg1_cambodia.png",
    "/img/scenes/map_seg2_ocean.png",
    "/img/scenes/map_seg3_coast.png",
  ];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[#2e9fd6]">
      {segments.map((src, index) => (
        <div
          key={src}
          className="absolute inset-x-0 h-[calc(33.3334%+1px)]"
          style={{ top: `calc(${index * 33.3333}% - ${index}px)` }}
        >
          <MapSegment src={src} />
        </div>
      ))}
      <div className="absolute inset-0 bg-[#003c6b]/5" />
    </div>
  );
}

function GoalBand() {
  const [showImage, setShowImage] = useState(true);
  return (
    <div className="fixed inset-x-0 bottom-0 z-25 h-[clamp(130px,21vh,230px)] overflow-hidden bg-linear-to-b from-[#d8f0fc] via-[#ffd8d0] to-[#f5b56c] shadow-[0_-8px_30px_rgba(0,79,141,.2)]">
      {showImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/img/scenes/japan_goal.png"
          alt=""
          aria-hidden
          onError={() => setShowImage(false)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div className="absolute inset-x-0 top-0 h-12 bg-linear-to-b from-[#8fdcf5] to-transparent" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
        <div className="mx-auto h-6 w-4 bg-linear-to-r from-[#6f3518] via-[#a7622e] to-[#5a2b15]" />
        <div className="min-w-44 rounded-lg border-4 border-[#fff3cf] bg-linear-to-b from-[#b96a32] to-[#713516] px-6 py-2 text-white shadow-[0_6px_0_#4e250f,0_10px_20px_rgba(0,0,0,.25)]">
          <p className="text-xl font-black">GOAL!</p>
          <p className="text-sm font-extrabold">
            <ruby>
              日本<rt className="text-white">にほん</rt>
            </ruby>
          </p>
        </div>
      </div>
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

function Hud({ profile }: { profile: NexmaxProfile }) {
  const personality = getPersonalityType(profile.type);

  return (
    <div className="fixed top-3 right-3 z-50 flex max-w-[calc(100vw-6rem)] flex-wrap justify-end gap-2">
      <div className="flex gap-1.5">
        {[
          { key: "level", node: <>⭐ Lv.1</> },
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
        <NekuMaxType id={profile.type} gender={profile.gender} size={42} />
        <span className="hidden leading-tight sm:block">
          <span className="text-ink block text-sm font-black">{profile.displayName}</span>
          <span className="text-ink-soft block text-[10px] font-extrabold">{personality.name}</span>
        </span>
        <span aria-label="オンライン" className="bg-leaf h-2.5 w-2.5 rounded-full" />
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
}: {
  collapsed: boolean;
  drawerOpen: boolean;
  isAdmin: boolean;
  onCollapsedChange: (value: boolean) => void;
  onDrawerClose: () => void;
  onUnavailable: () => void;
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
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function LessonCard({ onUnavailable }: { onUnavailable: () => void }) {
  const stage = STAGES[0]!;

  return (
    <section className="w-full max-w-sm rounded-[28px] border-4 border-white bg-[#fffaf0]/97 p-4 shadow-[0_7px_0_#b8deed,0_18px_32px_rgba(0,79,141,.25)] backdrop-blur-sm">
      <p className="inline-flex rounded-full border-2 border-white bg-[#e64a5f] px-4 py-1 text-sm font-black text-white shadow-[0_3px_0_#bd3148]">
        ✦{" "}
        <ruby>
          現在<rt>げんざい</rt>
        </ruby>
        のレッスン ✦
      </p>
      <p className="text-sky mt-3 text-xs font-black tracking-widest">STEP 01</p>
      <h2 className="text-navy text-xl font-black">
        <StageTitle stage={stage} />
      </h2>
      <p className="text-ink-soft mt-1 text-xs font-extrabold">
        <KindLabel stage={stage} />
      </p>
      <p className="text-ink mt-2 text-sm font-bold">{stage.description}</p>
      <div className="text-ink-soft mt-3 flex items-center justify-between text-xs font-extrabold">
        <span>0 / 5 ステージ</span>
        <span>0%</span>
      </div>
      <div className="mt-1 h-3 overflow-hidden rounded-full border border-white bg-[#e4eef3] shadow-inner">
        <div className="bg-leaf h-full w-0 rounded-full" />
      </div>
      <div className="mt-4 grid gap-3">
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
          <span className="text-xs">ステージを つづける</span>
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
          <span className="text-xs">たんごを ふやして レベルアップ！</span>
        </button>
      </div>
    </section>
  );
}

function StageChip({
  stage,
  current,
  open,
  onToggle,
  onUnavailable,
}: {
  stage: StageDefinition;
  current: boolean;
  open: boolean;
  onToggle: () => void;
  onUnavailable: () => void;
}) {
  return (
    <div className="card-pop w-[min(39vw,20rem)] overflow-hidden border-white/90 shadow-xl">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center gap-2 p-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="text-sky block text-[10px] font-black tracking-widest sm:text-xs">
            STEP {String(stage.step).padStart(2, "0")}
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
          <button
            type="button"
            onClick={onUnavailable}
            className="btn-game mt-2 w-full px-3 py-1.5 text-sm [--btn-face:#ffc93c] [--btn-shadow:#f0a819]"
          >
            すすむ
          </button>
          {!current && (
            <p className="text-ink-soft mt-2 text-center text-[10px] font-bold">じゅんびちゅう</p>
          )}
        </div>
      )}
    </div>
  );
}

function MapView({
  expandedStage,
  onExpandedStageChange,
  onUnavailable,
}: {
  expandedStage: string | null;
  onExpandedStageChange: (id: string | null) => void;
  onUnavailable: () => void;
}) {
  return (
    <main className="relative min-h-[260vh] overflow-hidden pb-[clamp(130px,21vh,230px)]">
      <ScenicBackground />

      <WoodenBanner label="START!" className="top-[2.5%] left-1/2">
        アンコールワット／カンボジア
      </WoodenBanner>
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-x-0 top-[8%] z-10 h-[84%] w-full drop-shadow-[0_2px_2px_rgba(0,79,141,.45)]"
      >
        <path
          d="M50 0 C82 7 76 14 58 15 C22 20 23 27 41 31 C78 37 78 43 62 49 C20 55 20 62 39 68 C76 74 77 81 58 86 C38 91 44 96 50 100"
          fill="none"
          stroke="white"
          strokeWidth="1.15"
          strokeLinecap="round"
          strokeDasharray="0.4 2.1"
        />
      </svg>

      {CHARACTER_POSITIONS.map((character) => (
        <div
          key={character.id}
          className="pointer-events-none absolute z-20 hidden -translate-x-1/2 -translate-y-1/2 sm:block"
          style={{ left: `${character.x}%`, top: `${character.y}%` }}
        >
          <NekuMaxType id={character.id} size={character.size} bob />
        </div>
      ))}

      {STAGES.map((stage, index) => {
        const position = STAGE_POSITIONS[index]!;
        const current = index === 0;
        const chipOnRight = index % 2 === 1;
        const color = current ? "#f26fa7" : STAGE_COLORS[stage.color];

        return (
          <div
            key={stage.id}
            className="absolute z-30 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${position.x}%`, top: `${position.y}%` }}
          >
            <button
              type="button"
              aria-label={`STEP ${String(stage.step).padStart(2, "0")} ${stage.title}`}
              aria-current={current ? "step" : undefined}
              onClick={() => onExpandedStageChange(expandedStage === stage.id ? null : stage.id)}
              className={`relative grid h-14 w-20 place-items-center rounded-[50%] border-4 border-white text-xl font-black shadow-[0_8px_0_rgba(0,79,141,.35),0_13px_24px_rgba(0,0,0,.22)] sm:h-17 sm:w-24 ${
                current ? "animate-pulse text-white" : "text-navy bg-white"
              }`}
              style={current ? { backgroundColor: color } : { borderColor: color }}
            >
              {String(stage.step).padStart(2, "0")}
              {current && (
                <span className="absolute -top-3 rounded-full bg-[#e64a5f] px-2 py-0.5 text-[9px] text-white">
                  START
                </span>
              )}
            </button>
            <div
              className={`absolute top-1/2 -translate-y-1/2 ${
                chipOnRight ? "left-[calc(100%+0.6rem)]" : "right-[calc(100%+0.6rem)]"
              }`}
            >
              <StageChip
                stage={stage}
                current={current}
                open={expandedStage === stage.id}
                onToggle={() => onExpandedStageChange(expandedStage === stage.id ? null : stage.id)}
                onUnavailable={onUnavailable}
              />
            </div>
          </div>
        );
      })}
    </main>
  );
}

function CardsView({ onUnavailable }: { onUnavailable: () => void }) {
  return (
    <main className="relative min-h-dvh overflow-hidden px-4 pt-36 pb-[clamp(150px,23vh,250px)] sm:px-8 md:pl-48">
      <ScenicBackground />
      <section className="relative z-10 mx-auto max-w-6xl">
        <div className="rounded-[2rem] border-2 border-white bg-white/80 p-5 shadow-2xl backdrop-blur-md sm:p-8">
          <h1 className="text-navy text-2xl font-black">🃏 カード</h1>
          <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {STAGES.map((stage, index) => (
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
                      backgroundColor: index === 0 ? "#f26fa7" : "#ffffff",
                      color: index === 0 ? "#ffffff" : STAGE_COLORS[stage.color],
                    }}
                  >
                    {index === 0 ? "▶" : "○"}
                  </span>
                </div>
                <p className="text-ink-soft mt-3 text-sm font-extrabold">
                  <KindLabel stage={stage} />
                </p>
                <p className="text-ink mt-2 flex-1 text-sm font-bold">{stage.description}</p>
                <p className="text-ink-soft mt-3 text-xs font-extrabold">
                  {index === 0 ? "いまの ステージ" : "じゅんびちゅう"}
                </p>
                <button
                  type="button"
                  onClick={onUnavailable}
                  className="btn-game mt-4 w-full px-4 py-2 [--btn-face:#ffc93c] [--btn-shadow:#f0a819]"
                >
                  すすむ
                </button>
              </article>
            ))}
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
  const storedView = useSyncExternalStore<MapView>(subscribeToStorage, getMapView, () => "map");
  const cachedProfile = useMemo(
    () => (rawProfile === PROFILE_SERVER_SNAPSHOT ? null : getProfile()),
    [rawProfile],
  );
  const [databaseProfile, setDatabaseProfile] = useState<ProfileRow | null>(null);
  const profile = databaseProfile ? profileFromRow(databaseProfile) : cachedProfile;
  const [viewOverride, setViewOverride] = useState<MapView | null>(null);
  const [expandedStage, setExpandedStage] = useState<string | null>("it-words");
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const view = viewOverride ?? storedView;

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
      <Hud profile={profile} />
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
      />

      <div className="fixed top-28 left-44 z-40 hidden w-sm md:block">
        <LessonCard onUnavailable={() => showToast(LONG_WAIT_TOAST)} />
      </div>

      <div className="relative z-30 px-3 pt-36 pb-2 md:hidden">
        <LessonCard onUnavailable={() => showToast(LONG_WAIT_TOAST)} />
      </div>

      {view === "map" ? (
        <MapView
          expandedStage={expandedStage}
          onExpandedStageChange={setExpandedStage}
          onUnavailable={() => showToast(LONG_WAIT_TOAST)}
        />
      ) : (
        <CardsView onUnavailable={() => showToast(LONG_WAIT_TOAST)} />
      )}

      <GoalBand />
      <Toast message={toast} />
    </div>
  );
}
