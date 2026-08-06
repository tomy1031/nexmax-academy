"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

/**
 * 管理画面のサイドバー
 *
 * 以前は横に並ぶタブだった。ダッシュボード・ユーザー・AI に加えて
 * ステージ・きょうざい・ことばが増えた時点で、横並びは折り返して2段になり
 * 「いまどこにいるか」が読めなくなる。縦に積めば、増えても並びが崩れない。
 *
 * 画面が狭いときは1本のボタンにたたむ。開いたまま固定すると、
 * 携帯では編集画面の幅が半分になってしまう。
 */

interface Item {
  href: string;
  icon: string;
  label: string;
  /** この接頭辞のときも「いまここ」にする（子ページ用）。 */
  match?: string;
}

const GROUPS: readonly { title: string; items: readonly Item[] }[] = [
  {
    title: "つくる",
    items: [
      { href: "/admin/stages", icon: "🗺️", label: "ステージ", match: "/admin/stages" },
      { href: "/admin/contents", icon: "📚", label: "きょうざい", match: "/admin/contents" },
      { href: "/admin/words", icon: "🕹️", label: "ことば・辞書", match: "/admin/words" },
    ],
  },
  {
    title: "みる",
    items: [
      { href: "/admin", icon: "📊", label: "ダッシュボード" },
      { href: "/admin/users", icon: "👥", label: "ユーザー", match: "/admin/users" },
      { href: "/nexmax", icon: "🧑‍🎨", label: "ネクマックス16人" },
      { href: "/admin/ai", icon: "🤖", label: "AI指示出し", match: "/admin/ai" },
    ],
  },
];

function isActive(pathname: string, item: Item): boolean {
  return item.match ? pathname.startsWith(item.match) : pathname === item.href;
}

export function AdminSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current =
    GROUPS.flatMap((group) => group.items).find((item) => isActive(pathname, item)) ?? null;

  const nav = (
    <nav aria-label="管理メニュー" className="space-y-5">
      <div>
        <p className="text-navy text-lg font-black">Nexmax Academy</p>
        <p className="text-ink-soft text-xs font-bold">管理画面</p>
      </div>
      {GROUPS.map((group) => (
        <div key={group.title}>
          <p className="text-ink-faint px-2 text-[11px] font-black tracking-widest">
            {group.title}
          </p>
          <ul className="mt-1 space-y-1">
            {group.items.map((item) => {
              const active = isActive(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-black transition ${
                      active ? "bg-navy text-white" : "text-ink hover:bg-sky-soft"
                    }`}
                  >
                    <span aria-hidden>{item.icon}</span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <Link
        href="/map"
        className="text-sky block px-3 text-sm font-bold underline underline-offset-4"
      >
        ← マップへ もどる
      </Link>
    </nav>
  );

  return (
    <>
      {/* 広い画面：ずっと出しておく */}
      <aside className="card-island sticky top-4 hidden h-fit w-56 shrink-0 p-4 lg:block">
        {nav}
      </aside>

      {/* せまい画面：ボタン1つにたたむ */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="card-island flex w-full items-center justify-between p-3 text-sm font-black"
        >
          <span className="text-navy">
            ☰ メニュー
            {current ? <span className="text-ink-soft ml-2">／ {current.label}</span> : null}
          </span>
          <span aria-hidden className="text-sky">
            {open ? "▲" : "▼"}
          </span>
        </button>
        {open ? <div className="card-island mt-2 p-4">{nav}</div> : null}
      </div>
    </>
  );
}
