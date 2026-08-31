"use client";

import { useEffect, useMemo, useState } from "react";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex } from "@/lib/text/furigana";
import { fetchClassmates, type Classmate } from "@/lib/classmates";
import { getProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/client";
import { readOwnId } from "@/lib/supabase/claims";
import { MAX_MEMBERS, type QuestMember } from "@/lib/quest/state";
import { PlayerFace } from "./quest-art";

/** 画面の ことばの 読みは 画面が 持つ（教材の 読み辞書とは 混ぜない）。 */
const UI_FURIGANA = buildFuriganaIndex([
  ["人目", "にんめ"],
  ["人", "にん"],
  ["台", "だい"],
  ["囲", "かこ"],
  ["遊", "あそ"],
  ["名前", "なまえ"],
  ["同", "おな"],
  ["学校", "がっこう"],
  ["期", "き"],
  ["読", "よ"],
]);

/** えらぶ 順が そのまま 手番の 順に なる（1人目＝ログインして いる 本人）。 */
type Slots = readonly (string | null)[];

/**
 * だれと 遊ぶかを えらぶ 画面
 *
 * ## 名前を 打たせない
 * 原典は 4人ぶんの 名前を **キーボードで 打たせて** いた。日本語入力に 慣れて
 * いない 学習者には、それだけで 3分 かかる。ここでは **名簿から えらぶ**
 *（2026-08-30 の 指定）。名簿は `public.classmates()` が 返す
 * **同じ 学校・同じ 期**の 学生で、**1人目は 本人に 固定**する。
 *
 * ## 4人ちょうどを 求めない
 * 名簿に 自分しか 居ない 期が 実在する（AUPP 1期・4期）。**1人でも 始められる**
 * ようにして あるので、人数の 欄に 赤い 印は 出さない——ゆるさは ことばでは なく
 * **動き**で 出す（AGENTS.md 絶対規律1）。
 */
export function QuestSetup({
  onStart,
  busy,
}: {
  onStart: (members: readonly QuestMember[]) => void;
  /** セーブを 探して いる あいだは 押せない ように する。 */
  busy?: boolean;
}) {
  const [roster, setRoster] = useState<readonly Classmate[]>([]);
  const [own, setOwn] = useState<QuestMember | null>(null);
  const [slots, setSlots] = useState<Slots>([null, null, null]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    void (async () => {
      const supabase = createClient();
      const ownId = supabase ? await readOwnId(supabase).catch(() => null) : null;
      const list = await fetchClassmates();
      if (!alive) return;

      /*
       * 本人の 1行は 名簿の 中に ある（`classmates()` は 自分を 含む）。
       * デモモード・ログイン前は 名簿が 空なので、**端末の プロフィール**から 作る
       * ——鍵ゼロでも 通しで 遊べる ことが、機械が 検証できる 条件である。
       */
      const mine = ownId ? list.find((row) => row.id === ownId) : undefined;
      const profile = getProfile();
      setOwn(
        mine ?? {
          id: ownId ?? "own",
          name: profile?.displayName?.trim() || "あなた",
          type: profile?.type ?? null,
          gender: profile?.gender ?? "male",
        },
      );
      setRoster(list.filter((row) => row.id !== (mine?.id ?? ownId)));
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const byId = useMemo(() => new Map(roster.map((row) => [row.id, row])), [roster]);

  const members = useMemo<QuestMember[]>(() => {
    if (!own) return [];
    const picked = slots
      .flatMap((id) => (id ? [byId.get(id)] : []))
      .flatMap((row) => (row ? [row] : []));
    return [own, ...picked];
  }, [own, slots, byId]);

  function choose(index: number, value: string) {
    setSlots((current) =>
      current.map((id, i) => (i === index ? (value === "" ? null : value) : id)),
    );
  }

  return (
    <section className="card-island p-5 sm:p-6">
      <h2 className="text-navy text-xl font-black sm:text-2xl">
        <RubyText text="だれと 遊びますか？" index={UI_FURIGANA} />
      </h2>
      <p className="text-ink-soft mt-1 text-sm font-bold">
        <RubyText text="1台を 囲んで、1人から 4人まで。" index={UI_FURIGANA} />
      </p>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        <li className="border-hairline bg-panel-tint flex items-center gap-3 rounded-2xl border-2 p-3">
          <span className="bg-sky grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-black text-white">
            1
          </span>
          {own ? <PlayerFace player={own} size={44} /> : null}
          <span className="min-w-0 flex-1">
            <span className="text-ink block truncate font-black">
              {loading ? "…" : (own?.name ?? "あなた")}
            </span>
            <span className="text-ink-soft text-[11px] font-bold">あなた</span>
          </span>
        </li>

        {slots.map((value, index) => {
          const taken = new Set(slots.filter((id, i) => id && i !== index) as string[]);
          const picked = value ? byId.get(value) : undefined;
          return (
            <li
              key={index}
              className="border-hairline bg-panel flex items-center gap-3 rounded-2xl border-2 p-3"
            >
              <span className="bg-sky-soft text-navy grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-black">
                {index + 2}
              </span>
              {picked ? <PlayerFace player={picked} size={44} /> : null}
              <label className="min-w-0 flex-1">
                <span className="sr-only">{`${index + 2}人目`}</span>
                <select
                  value={value ?? ""}
                  onChange={(event) => choose(index, event.target.value)}
                  disabled={loading || roster.length === 0}
                  className="border-hairline text-ink bg-panel w-full rounded-xl border-2 px-2 py-2 text-sm font-bold disabled:opacity-50"
                >
                  <option value="">— えらぶ —</option>
                  {roster
                    .filter((row) => !taken.has(row.id))
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                </select>
              </label>
            </li>
          );
        })}
      </ul>

      {!loading && roster.length === 0 ? (
        <p className="text-ink-soft mt-3 text-sm font-bold">
          <RubyText
            text="いまは 1人で 進みます。同じ 学校・同じ 期の なかまが 名簿に 入ると、ここに 出ます。"
            index={UI_FURIGANA}
          />
        </p>
      ) : null}

      <div className="mt-5">
        <button
          type="button"
          data-quest="start"
          disabled={loading || busy || members.length === 0 || members.length > MAX_MEMBERS}
          onClick={() => onStart(members)}
          className="btn-game px-6 py-3 [--btn-face:#f26fa7] [--btn-shadow:#d94d84] disabled:opacity-45"
        >
          <RubyText text="クエストを はじめる" index={UI_FURIGANA} />
        </button>
      </div>
    </section>
  );
}
