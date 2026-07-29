"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";

/**
 * ネクマックス — NEXT MAKE のナビゲーター・ロボット
 *
 * スマーフ・パターン: 1体のマスコットではなく、役割ちがいのネクマックスが
 * たくさん登場する（ガイドの／あいさつの／ものづくりの…）。
 * 仕様: docs/design/04_ビジュアルテーマ.md §6
 *
 * 画像は手描きSVGではなく、Codex の image-gen-2 で生成した PNG を使う。
 * 生成手順と一貫性ルール: docs/skills/codex_image_generation.md
 * 正典（スタイルアンカー）: public/img/characters/nekumax/reference.png
 *
 * 未生成のバリアントは reference.png に、それも無ければプレースホルダーに
 * フォールバックするため、画像が揃う前でも画面は壊れない。
 */

export type NekuMaxVariant = "guide" | "hello" | "build" | "listen" | "cheer" | "book";

export interface NekuMaxMeta {
  id: NekuMaxVariant;
  /** 役割名（ルビ付きJSX） */
  label: ReactNode;
  plainLabel: string;
  /** チュートリアル等で話す一言（やさしい日本語・分かち書き） */
  intro: string;
  /** テーマアクセント（枠・チップに使う実色） */
  accent: string;
  accentDeep: string;
}

const DIR = "/img/characters/nekumax";
export const NEKUMAX_REFERENCE_SRC = `${DIR}/reference.png`;

export const NEKUMAX_FAMILY: NekuMaxMeta[] = [
  {
    id: "guide",
    label: <>ガイドの ネクマックス</>,
    plainLabel: "ガイドのネクマックス",
    intro: "ようこそ！ ぼくが みちあんない するよ。まよったら ぼくを さがしてね。",
    accent: "#0288d1",
    accentDeep: "#0272ae",
  },
  {
    id: "hello",
    label: <>あいさつの ネクマックス</>,
    plainLabel: "あいさつのネクマックス",
    intro: "おはよう！ こんにちは！ あいさつは しごとの まほうの ことばだよ。",
    accent: "#ffc93c",
    accentDeep: "#f0a819",
  },
  {
    id: "build",
    label: <>ものづくりの ネクマックス</>,
    plainLabel: "ものづくりのネクマックス",
    intro: "アプリを つくるのは たのしいぞ！ いっしょに 手を うごかそう。",
    accent: "#f2654a",
    accentDeep: "#d94f36",
  },
  {
    id: "listen",
    label: <>きく ネクマックス</>,
    plainLabel: "きくネクマックス",
    intro: "お客さまの こえを よーく きくと、ほんとうの ねがいが 見えてくるよ。",
    accent: "#58c273",
    accentDeep: "#3aa458",
  },
  {
    id: "cheer",
    label: <>おうえんの ネクマックス</>,
    plainLabel: "おうえんのネクマックス",
    intro: "まちがえても だいじょうぶ！ ちょうせんした きみが いちばん えらい！",
    accent: "#ff8a70",
    accentDeep: "#f2654a",
  },
  {
    id: "book",
    label: <>ものしりの ネクマックス</>,
    plainLabel: "ものしりのネクマックス",
    intro: "むずかしい ことばは ぼくに まかせて。いつでも いっしょに しらべよう。",
    accent: "#8d6ae8",
    accentDeep: "#7452cc",
  },
];

export function getNekuMax(id: NekuMaxVariant): NekuMaxMeta {
  const found = NEKUMAX_FAMILY.find((v) => v.id === id);
  if (!found) throw new Error(`unknown NekuMax variant: ${id}`);
  return found;
}

export function NekuMax({
  variant,
  size = 120,
  bob = false,
  className = "",
}: {
  variant: NekuMaxVariant;
  size?: number;
  /** ふわふわ上下ゆれ */
  bob?: boolean;
  className?: string;
}) {
  const meta = getNekuMax(variant);
  // フォールバック連鎖: バリアント画像 → 正典reference → プレースホルダー
  const sources = [`${DIR}/${variant}.webp`, NEKUMAX_REFERENCE_SRC];
  const [srcIndex, setSrcIndex] = useState(0);
  const src = sources[srcIndex];

  const wrapperClass = `${bob ? "animate-bob" : ""} ${className}`.trim();

  if (!src) {
    // 画像が1枚も無い環境向けの最終プレースホルダー（キャラの自作はしない）
    return (
      <span
        role="img"
        aria-label={meta.plainLabel}
        className={`grid place-items-center rounded-3xl bg-white ${wrapperClass}`}
        style={{
          width: size,
          height: size,
          border: `3px dashed ${meta.accent}`,
        }}
      >
        <span style={{ fontSize: size * 0.45 }}>🤖</span>
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={meta.plainLabel}
      width={size}
      height={size}
      unoptimized
      onError={() => setSrcIndex((i) => i + 1)}
      className={wrapperClass}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}
