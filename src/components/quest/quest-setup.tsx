"use client";
/* eslint-disable @next/next/no-img-element -- ドット絵は next/image に 通さない。縮小・再圧縮で ドットが にじむ うえ、1枚 数KB の PNG なので 最適化の 得も 無い */

import { useEffect, useMemo, useState } from "react";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex } from "@/lib/text/furigana";
import { fetchClassmates, type Classmate } from "@/lib/classmates";
import { getProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/client";
import { readOwnId } from "@/lib/supabase/claims";
import { MAX_MEMBERS, type QuestMember } from "@/lib/quest/state";
import { assetUrl } from "@/lib/asset-url";
import { PlayerFace, WATERFALL_MAP } from "./quest-art";
import { QuestButton, QuestWindow } from "./quest-window";

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
  ["名簿", "めいぼ"],
  ["進", "すす"],
  ["入", "はい"],
  ["期", "き"],
  ["読", "よ"],
  ["冒険", "ぼうけん"],
  ["出", "で"],
  ["回避", "かいひ"],
  ["最大", "さいだい"],
]);

/** えらぶ 順が そのまま 手番の 順に なる（1人目＝ログインして いる 本人）。 */
type Slots = readonly (string | null)[];

/**
 * タイトルと「だれと 遊ぶか」の 画面 — 旧アプリ `renderTitleOrSetup` の 移植
 *
 * ## 見た目は ドット絵の タイトル画面（2026-10-20 から）
 * 10段の 滝の 絵の 上に ロゴと「だれと 遊ぶか」の 窓。ゲーム風UIが 売り
 *（2026-09-01 の 指定）なので、ここから すでに ゲームの 見た目に する。
 * 滝は 工程の 図と 同じ 絵——「上から 順番に 進む」を 最初の 画面から 見せる。
 *
 * ## 名前は 打たせない（ここだけ 原典と 変える）
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
  title,
  onStart,
  busy,
}: {
  title: string;
  onStart: (members: readonly QuestMember[]) => void;
  /** セーブを 探して いる あいだは 押せない ように する。 */
  busy?: boolean;
}) {
  const [roster, setRoster] = useState<readonly Classmate[]>([]);
  const [own, setOwn] = useState<QuestMember | null>(null);
  const [slots, setSlots] = useState<Slots>([null, null, null]);
  const [loading, setLoading] = useState(true);

  /*
   * ## 名簿を 待たせない
   * 1人目（本人）は **端末の プロフィールだけ**で 作れるので、先に 出して
   * ボタンを 押せる ようにする。名簿は あとから 届いて 2〜4人目の 欄に 入る。
   *
   * 前は 名簿を 取り終わるまで「はじめる」を 止めて いた。教室の 回線が 重い 日は
   * **押せない ボタンを 見つめる 時間**に なり、名簿が 引けない ときは 永久に
   * 始められない。1人でも 遊べる 作りなのだから、待つ 理由が 無い。
   */
  useEffect(() => {
    let alive = true;

    void (async () => {
      // 端末の プロフィールは 通信を 待たない。await の 前に 出しきる
      const profile = getProfile();
      setOwn({
        id: "own",
        name: profile?.displayName?.trim() || "あなた",
        type: profile?.type ?? null,
        gender: profile?.gender ?? "male",
      });

      const supabase = createClient();
      const ownId = supabase ? await readOwnId(supabase).catch(() => null) : null;
      const list = await fetchClassmates();
      if (!alive) return;

      /*
       * 本人の 1行は 名簿の 中に ある（`classmates()` は 自分を 含む）ので、
       * 届いたら **DBの 名前と ネクマックス**で 上書きする。
       */
      const mine = ownId ? list.find((row) => row.id === ownId) : undefined;
      if (mine) setOwn(mine);
      else if (ownId) setOwn((current) => (current ? { ...current, id: ownId } : current));
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
    <div className="px-2 py-4">
      <section className="qx-title">
        <img className="qx-px" src={assetUrl(WATERFALL_MAP)} alt="" />
        <div className="qx-over">
          <div>
            <h1 className="qx-logo">
              WATER FALL
              <br />
              <span>QUEST</span>
            </h1>
            <p className="qx-logo-sub">
              <RubyText text="〜デスマーチを 回避せよ〜" index={UI_FURIGANA} />
            </p>
          </div>

          <QuestWindow className="!px-3 !py-3">
            <h2 className="text-sm tracking-widest text-[#ffd84a]">
              <RubyText text="だれと 遊びますか？" index={UI_FURIGANA} />
            </h2>
            <p className="qx-t mt-1 text-xs text-[#cfd5e6]">
              <RubyText text="1台を 囲んで、1人から 4人まで。" index={UI_FURIGANA} />
            </p>

            <ul className="qx-mlist">
              <li>
                <span className="qx-k qx-me">1</span>
                {own ? <PlayerFace player={own} size={30} /> : null}
                <span className="min-w-0 flex-1 truncate text-sm">{own?.name ?? "あなた"}</span>
                <span className="text-[11px] text-[#8d96b4]">あなた</span>
              </li>
              {slots.map((value, index) => {
                const taken = new Set(slots.filter((id, i) => id && i !== index) as string[]);
                const picked = value ? byId.get(value) : undefined;
                return (
                  <li key={index}>
                    <span className="qx-k">{index + 2}</span>
                    {picked ? <PlayerFace player={picked} size={30} /> : null}
                    <label className="min-w-0 flex-1">
                      {/*
                       * 名前は `aria-label` で 持つ。前は 画面に 出さない `sr-only` の
                       * 字を DOM に 置いて いたが、裸の漢字の 見張り（`furigana.spec`）は
                       * **見えない 字も 数える**（`helpers.ts` の TreeWalker は
                       * text node を そのまま 拾う）。属性に すれば 読み上げの 名前は
                       * そのまま「2人目」で、数える 字は 増えない。
                       */}
                      <select
                        aria-label={`${index + 2}人目`}
                        value={value ?? ""}
                        onChange={(event) => choose(index, event.target.value)}
                        disabled={loading || roster.length === 0}
                        className="qx-select"
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
              <p className="qx-t mt-3 text-xs leading-relaxed text-[#cfd5e6]">
                <RubyText
                  text="いまは 1人で 進みます。同じ 学校・同じ 期の なかまが 名簿に 入ると、ここに 出ます。"
                  index={UI_FURIGANA}
                />
              </p>
            ) : null}

            <QuestButton
              tone="primary"
              data-quest="start"
              disabled={busy || members.length === 0 || members.length > MAX_MEMBERS}
              onClick={() => onStart(members)}
              className="mt-4"
            >
              <RubyText text="冒険に 出る" index={UI_FURIGANA} />
            </QuestButton>
            <p className="mt-2 text-center text-[10px] text-[#8d96b4]">{title}</p>
          </QuestWindow>
        </div>
      </section>
    </div>
  );
}
