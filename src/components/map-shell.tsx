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
import { signOut } from "@/app/auth/actions";
import { NekuMaxType } from "@/components/nekumax-types";
import { getPersonalityType, type PersonalityTypeId } from "@/content/personality";
import { STAGES, type StageColor } from "@/content/stages";
import { contentKindMeta } from "@/lib/content-kinds";
import { characterSlots, mapGeometry, routePath, SEGMENT_HEIGHT_VH } from "@/lib/map-layout";
// 型だけを借りる。map-segments.ts は node:fs を使うサーバ専用モジュールなので、
// 値を import するとクライアントバンドルに入って壊れる（ページが読んで props で渡す）。
import { type MapBand } from "@/lib/map-segments";
import { fetchOwnProfile, type ProfileRow } from "@/lib/profile-db";
import {
  getMapView,
  getProfile,
  saveMapView,
  saveProfile,
  type MapView,
  type NexmaxProfile,
} from "@/lib/profile";
import { createProgressStore, subscribeProgress } from "@/lib/progress/store";
import { type StagePin } from "@/lib/stage-pins";
import { createClient } from "@/lib/supabase/client";

const PROFILE_SERVER_SNAPSHOT = "__server__";
const LONG_WAIT_TOAST = "じゅんびちゅう です。もうすこし まってね！";
const SHORT_WAIT_TOAST = "じゅんびちゅう です。";

/**
 * 道ぞいに立つネクマックスの出る順。停留所がいくつになってもこの4体を順に回す。
 * 同じ子ばかり並ぶと道のりの長さが伝わらないので、種類を必ず入れかえる。
 */
const PERSONALITY_ORDER: readonly PersonalityTypeId[] = ["leader", "idea", "heart", "challenge"];

const STAGE_COLORS = {
  leaf: "#58c273",
  sky: "#4fa8e8",
  coral: "#f26fa7",
  "sky-soft": "#9bdcf7",
} satisfies Record<StageColor, string>;

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

/**
 * 定番ステージのルビ付き見出し。キーは src/content/stages.ts の id。
 * ルビHTMLはここに組んであるぶんだけを使い、新しく手書きしない（AGENTS.md 規律2）。
 */
const SEED_RUBY_TITLES: Record<string, ReactNode> = {
  "it-words": (
    <>
      IT
      <ruby>
        単語帳<rt>たんごちょう</rt>
      </ruby>
    </>
  ),
  "company-structure": (
    <>
      <ruby>
        企業<rt>きぎょう</rt>
      </ruby>
      の
      <ruby>
        仕組み<rt>しくみ</rt>
      </ruby>
    </>
  ),
  report: (
    <ruby>
      報告<rt>ほうこく</rt>
    </ruby>
  ),
  contact: (
    <ruby>
      連絡<rt>れんらく</rt>
    </ruby>
  ),
  consult: (
    <ruby>
      相談<rt>そうだん</rt>
    </ruby>
  ),
};

/** 定番ステージを id で引く。上のルビ見出しが今も同じ語かを照らし合わせるために使う。 */
const SEED_BY_ID = new Map(STAGES.map((seed) => [seed.id, seed]));

/**
 * 見出し。定番ステージのルビ見出しは、その語がデータ側で言いかえられていない
 * ときだけ使う。
 *
 * 同じ step にデータ化ステージがあると title / reading はデータ側が勝つが、
 * seedId は定番を指したまま残る。seedId だけでルビ見出しを選ぶと、見出しは定番の
 * 語・すぐ下の読みと読み上げ（aria-label）とステージ画面はデータ側の語、という
 * 食い違いになる。漢字と読みを覚えている最中の学習者には、同じステージが画面ごとに
 * ちがう名前と読みで届き、どちらが正しいのか分からなくなる。先生の側から見ても、
 * スタジオで見出しを直したのにマップだけ古い語のままになる。
 *
 * 語が合わないときは title をそのまま出す（ルビは読み辞書から合成する）。
 */
function StageTitle({ pin }: { pin: StagePin }) {
  const seed = pin.seedId === null ? undefined : SEED_BY_ID.get(pin.seedId);
  if (seed && seed.title === pin.title && seed.reading === pin.reading) {
    const ruby = SEED_RUBY_TITLES[seed.id];
    if (ruby !== undefined) return ruby;
  }
  return pin.title;
}

/** 呼び名を出せるか。出せないのに「・」だけ残ると、読みの行が壊れて見える。 */
function hasKindLabel(pin: StagePin): boolean {
  return pin.kinds.length > 0 || pin.seedKind !== null;
}

/**
 * 何をするステージかの呼び名。
 *
 * データ化されていれば、そこに入っている教材の種別をそのまま出す。呼び名は
 * content-kinds.ts が唯一の対応表で、ここで言い換えると同じ教材がマップと
 * ステージ画面で違う名前になり、学習者は別のものだと思ってしまう。
 */
function KindLabel({ pin }: { pin: StagePin }) {
  if (pin.kinds.length > 0) {
    return pin.kinds
      .map((kind) => {
        const meta = contentKindMeta(kind);
        return `${meta.icon}${meta.label}`;
      })
      .join("・");
  }
  // まだデータ化されていない定番ステージは、予定の種別だけを見せる。
  if (pin.seedKind === null) return null;
  if (pin.seedKind === "word") {
    return (
      <>
        🌐
        <ruby>
          単語<rt>たんご</rt>
        </ruby>
      </>
    );
  }
  if (pin.seedKind === "pair") return <>👥 ペアワーク</>;
  if (pin.seedKind === "video-reading") {
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

function SegmentImage({ src }: { src: string }) {
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

/**
 * 背景の地形。帯（絵1枚ぶん）の数で等分して縦に並べる。
 * 帯の数を数え打ちにすると、先生がステージの絵を1枚たしても地図は伸びず、
 * 増えたはずの停留所だけが空の上に浮くことになる。
 *
 * 絵がまだ無い帯（src: null）は海のグラデーションで表示する。絵の遅れで
 * ステージごと消すと、学習者は昨日あった教材を探しまわることになる。
 */
function ScenicBackground({ bands }: { bands: readonly MapBand[] }) {
  const count = bands.length;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[#2e9fd6]">
      {bands.map((band, index) => (
        <div
          key={band.id}
          className="absolute inset-x-0"
          // 段は 1px ぶん重ねる。端数の切り捨てで継ぎ目に線が出ると、
          // 一枚の地図ではなく「割れた絵」に見えてしまう。
          style={{
            height: `calc(${100 / count}% + 1px)`,
            top: `calc(${(index * 100) / count}% - ${index}px)`,
          }}
        >
          {band.src ? (
            <SegmentImage src={band.src} />
          ) : (
            <div className="h-full w-full bg-linear-to-b from-[#45b7df] to-[#2e9fd6]" />
          )}
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
          src="/img/scenes/japan_goal.webp"
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

function Hud({ profile }: { profile: ProfileRow | null }) {
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
  // 単語は単体で開ける。その場合はステージ選択から始まる。
  { icon: "📖", label: "単語", reading: "たんご", href: "/arcade" },
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
  const navClass =
    "text-ink hover:bg-sky-soft flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-3 text-sm font-extrabold transition";

  const navButtons = NAV_ITEMS.map((item) => {
    const body = (
      <>
        <span aria-hidden className="text-xl">
          {item.icon}
        </span>
        {!collapsed && <span className="whitespace-nowrap">{<NavigationLabel item={item} />}</span>}
      </>
    );

    return "href" in item ? (
      <Link key={item.label} href={item.href} onClick={onDrawerClose} className={navClass}>
        {body}
      </Link>
    ) : (
      <button
        key={item.label}
        type="button"
        onClick={() => {
          onUnavailable();
          onDrawerClose();
        }}
        className={navClass}
      >
        {body}
      </button>
    );
  });
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

/** マップから渡される単語ステージ（進捗と行き先に使う最小限の情報）。 */
export interface WordStageRef {
  id: string;
  title: string;
}

function LessonCard({
  onUnavailable,
  wordStages,
  pin,
}: {
  onUnavailable: () => void;
  wordStages: readonly WordStageRef[];
  /** いま取りかかるステージ（マップの1つめ）。ピンが1つも無ければ null。 */
  pin: StagePin | null;
}) {
  // 合格したステージ数を進捗に出す。localStorage は外部の状態として購読する。
  const store = useMemo(() => createProgressStore(), []);
  const clearedKey = useSyncExternalStore(
    subscribeProgress,
    () => wordStages.map((w) => (store.readTestResult(w.id)?.passed ? "1" : "0")).join(""),
    () => wordStages.map(() => "0").join(""),
  );

  const total = wordStages.length;
  const cleared = clearedKey.split("").filter((c) => c === "1").length;
  const percent = total === 0 ? 0 : Math.round((cleared / total) * 100);
  // 「続きから」は、まだ合格していない最初のステージへ直行する
  const nextIndex = clearedKey.indexOf("0");
  const next = wordStages[nextIndex === -1 ? 0 : nextIndex];

  return (
    <section className="w-full max-w-sm rounded-[28px] border-4 border-white bg-[#fffaf0]/97 p-4 shadow-[0_7px_0_#b8deed,0_18px_32px_rgba(0,79,141,.25)] backdrop-blur-sm">
      <p className="inline-flex rounded-full border-2 border-white bg-[#e64a5f] px-4 py-1 text-sm font-black text-white shadow-[0_3px_0_#bd3148]">
        ✦{" "}
        <ruby>
          現在<rt>げんざい</rt>
        </ruby>
        のレッスン ✦
      </p>
      {pin && (
        <>
          <p className="text-sky mt-3 text-xs font-black tracking-widest">
            STEP {String(pin.step).padStart(2, "0")}
          </p>
          <h2 className="text-navy text-xl font-black">
            <StageTitle pin={pin} />
          </h2>
          <p className="text-ink-soft mt-1 text-xs font-extrabold">
            <KindLabel pin={pin} />
          </p>
          <p className="text-ink mt-2 text-sm font-bold">{pin.description}</p>
        </>
      )}
      <div className="text-ink-soft mt-3 flex items-center justify-between text-xs font-extrabold">
        <span>
          {cleared} / {total} ステージ
        </span>
        <span>{percent}%</span>
      </div>
      <div className="mt-1 h-3 overflow-hidden rounded-full border border-white bg-[#e4eef3] shadow-inner">
        <div
          className="bg-leaf h-full rounded-full transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-4 grid gap-3">
        {next ? (
          <Link
            href={`/arcade/${next.id}`}
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
          </Link>
        ) : (
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
        )}
        <Link
          href="/arcade"
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
          <span className="text-xs">ステージを えらんで れんしゅう</span>
        </Link>
      </div>
    </section>
  );
}

function StageChip({
  pin,
  current,
  open,
  onToggle,
  onUnavailable,
}: {
  pin: StagePin;
  current: boolean;
  open: boolean;
  onToggle: () => void;
  onUnavailable: () => void;
}) {
  // データ化されたステージだけ詳細ページへ行ける。まだなら「じゅんびちゅう」。
  const stageHref = pin.href;
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
            STEP {String(pin.step).padStart(2, "0")}
          </span>
          <span className="text-navy block truncate text-sm font-black sm:text-base">
            <StageTitle pin={pin} />
          </span>
          <span className="text-ink-soft block text-[10px] font-bold sm:text-xs">
            （{pin.reading}）
            {hasKindLabel(pin) && (
              <>
                ・ <KindLabel pin={pin} />
              </>
            )}
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
          <p className="text-ink text-xs font-bold sm:text-sm">{pin.description}</p>
          {stageHref ? (
            <Link
              href={stageHref}
              className="btn-game mt-2 w-full px-3 py-1.5 text-sm [--btn-face:#ffc93c] [--btn-shadow:#f0a819]"
            >
              ステージへ すすむ
            </Link>
          ) : (
            <button
              type="button"
              onClick={onUnavailable}
              className="btn-game mt-2 w-full px-3 py-1.5 text-sm [--btn-face:#ffc93c] [--btn-shadow:#f0a819]"
            >
              すすむ
            </button>
          )}
          {!current && !stageHref && (
            <p className="text-ink-soft mt-2 text-center text-[10px] font-bold">じゅんびちゅう</p>
          )}
        </div>
      )}
    </div>
  );
}

function MapView({
  pins,
  bands,
  baseBandCount,
  expandedStage,
  onExpandedStageChange,
  onUnavailable,
}: {
  pins: readonly StagePin[];
  bands: readonly MapBand[];
  baseBandCount: number;
  expandedStage: string | null;
  onExpandedStageChange: (id: string | null) => void;
  onUnavailable: () => void;
}) {
  // 停留所・道・キャラは同じ座標のもとから作る。別々に持つと、ステージが増えた
  // ときに道だけ古い形のまま残り、学習者はどこへ進むのか分からなくなる。
  // STEP 6 以降の停留所は、自分の絵の帯のまんなかに立つ。
  const geometry = useMemo(
    () =>
      mapGeometry(
        pins.map((pin) => pin.step),
        baseBandCount,
      ),
    [pins, baseBandCount],
  );
  const stops = geometry.stops;
  const route = useMemo(() => routePath(stops), [stops]);
  const characters = useMemo(() => characterSlots(stops), [stops]);

  return (
    <main
      className="relative overflow-hidden pb-[clamp(130px,21vh,230px)]"
      // 帯（絵1枚ぶん）＝1画面ぶんの高さ。帯の数は停留所の割り付けと同じ
      // geometry から取る。別々に数えると、絵と停留所の対応がずれる。
      style={{ minHeight: `${geometry.bandCount * SEGMENT_HEIGHT_VH}vh` }}
    >
      <ScenicBackground bands={bands} />

      <WoodenBanner label="START!" className="top-[2.5%] left-1/2">
        アンコールワット／カンボジア
      </WoodenBanner>
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        // 停留所と同じ 0..100 の座標系で全面に敷く。道と停留所の位置あわせを
        // 目分量でやめたので、停留所が何個になっても道はピンの上を通る。
        className="pointer-events-none absolute inset-0 z-10 h-full w-full drop-shadow-[0_2px_2px_rgba(0,79,141,.45)]"
      >
        <path
          d={route}
          fill="none"
          stroke="white"
          strokeWidth="1.15"
          strokeLinecap="round"
          strokeDasharray="0.4 2.1"
        />
      </svg>

      {characters.map((character, index) => {
        const personality = PERSONALITY_ORDER[index % PERSONALITY_ORDER.length]!;
        return (
          <div
            key={`${personality}-${index}`}
            className="pointer-events-none absolute z-20 hidden -translate-x-1/2 -translate-y-1/2 sm:block"
            style={{ left: `${character.x}%`, top: `${character.y}%` }}
          >
            <NekuMaxType id={personality} size={index % 2 === 0 ? 112 : 104} bob />
          </div>
        );
      })}

      {pins.map((pin, index) => {
        // stops は pins.length ぶん作るので、ピンと停留所は必ず1対1で対応する。
        const position = stops[index]!;
        const current = index === 0;
        const chipOnRight = index % 2 === 1;
        const color = current ? "#f26fa7" : STAGE_COLORS[pin.color];

        return (
          <div
            key={pin.id}
            className="absolute z-30 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${position.x}%`, top: `${position.y}%` }}
          >
            <button
              type="button"
              aria-label={`STEP ${String(pin.step).padStart(2, "0")} ${pin.title}`}
              aria-current={current ? "step" : undefined}
              onClick={() => onExpandedStageChange(expandedStage === pin.id ? null : pin.id)}
              className={`relative grid h-14 w-20 place-items-center rounded-[50%] border-4 border-white text-xl font-black shadow-[0_8px_0_rgba(0,79,141,.35),0_13px_24px_rgba(0,0,0,.22)] sm:h-17 sm:w-24 ${
                current ? "animate-pulse text-white" : "text-navy bg-white"
              }`}
              style={current ? { backgroundColor: color } : { borderColor: color }}
            >
              {String(pin.step).padStart(2, "0")}
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
                pin={pin}
                current={current}
                open={expandedStage === pin.id}
                onToggle={() => onExpandedStageChange(expandedStage === pin.id ? null : pin.id)}
                onUnavailable={onUnavailable}
              />
            </div>
          </div>
        );
      })}
    </main>
  );
}

function CardsView({
  pins,
  bands,
  onUnavailable,
}: {
  pins: readonly StagePin[];
  bands: readonly MapBand[];
  onUnavailable: () => void;
}) {
  return (
    <main className="relative min-h-dvh overflow-hidden px-4 pt-36 pb-[clamp(150px,23vh,250px)] sm:px-8 md:pl-48">
      <ScenicBackground bands={bands} />
      <section className="relative z-10 mx-auto max-w-6xl">
        <div className="rounded-[2rem] border-2 border-white bg-white/80 p-5 shadow-2xl backdrop-blur-md sm:p-8">
          <h1 className="text-navy text-2xl font-black">🃏 カード</h1>
          <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {pins.map((pin, index) => (
              <article key={pin.id} className="card-pop flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sky text-xs font-black tracking-widest">
                      STEP {String(pin.step).padStart(2, "0")}
                    </p>
                    <h2 className="text-navy mt-1 text-xl font-black">
                      <StageTitle pin={pin} />
                    </h2>
                    <p className="text-ink-soft text-xs font-bold">（{pin.reading}）</p>
                  </div>
                  <span
                    className="grid h-11 w-11 place-items-center rounded-full border-4 border-white text-lg shadow-md"
                    style={{
                      backgroundColor: index === 0 ? "#f26fa7" : "#ffffff",
                      color: index === 0 ? "#ffffff" : STAGE_COLORS[pin.color],
                    }}
                  >
                    {index === 0 ? "▶" : "○"}
                  </span>
                </div>
                <p className="text-ink-soft mt-3 text-sm font-extrabold">
                  <KindLabel pin={pin} />
                </p>
                <p className="text-ink mt-2 flex-1 text-sm font-bold">{pin.description}</p>
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

export function MapShell({
  wordStages,
  pins,
  bands,
  baseBandCount,
}: {
  wordStages: readonly WordStageRef[];
  /** マップに出す停留所。定番ステージとデータ化ステージを合流ずみ（step 昇順）。 */
  pins: readonly StagePin[];
  /** 背景の帯。元の絵＋STEP 6以降のステージの絵（無ければ色だけ）で、長さ＝マップの長さ。 */
  bands: readonly MapBand[];
  /** 帯のうち元の絵（STEP 1〜5 を受け持つ）の数。停留所の割り付けに使う。 */
  baseBandCount: number;
}) {
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
  // 最初は1つめの停留所を開いておく。IDを決め打ちにすると、step 1 のステージを
  // 入れかえた先生の画面でどこも開かなくなる。
  const [expandedStage, setExpandedStage] = useState<string | null>(() => pins[0]?.id ?? null);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const view = viewOverride ?? storedView;
  const currentPin = pins[0] ?? null;

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
      <Hud profile={databaseProfile} />
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

      <div className="fixed top-28 left-44 z-40 hidden w-sm md:block">
        <LessonCard
          onUnavailable={() => showToast(LONG_WAIT_TOAST)}
          wordStages={wordStages}
          pin={currentPin}
        />
      </div>

      <div className="relative z-30 px-3 pt-36 pb-2 md:hidden">
        <LessonCard
          onUnavailable={() => showToast(LONG_WAIT_TOAST)}
          wordStages={wordStages}
          pin={currentPin}
        />
      </div>

      {view === "map" ? (
        <MapView
          pins={pins}
          bands={bands}
          baseBandCount={baseBandCount}
          expandedStage={expandedStage}
          onExpandedStageChange={setExpandedStage}
          onUnavailable={() => showToast(LONG_WAIT_TOAST)}
        />
      ) : (
        <CardsView pins={pins} bands={bands} onUnavailable={() => showToast(LONG_WAIT_TOAST)} />
      )}

      <GoalBand />
      <Toast message={toast} />
    </div>
  );
}
