"use client";

import Image from "next/image";
import { useState } from "react";
import {
  getPersonalityFamily,
  getPersonalityType,
  type PersonalityFamilyId,
  type PersonalityTypeCode,
} from "@/content/personality";
import type { Gender } from "@/lib/profile";

const FAMILY_DIR = "/img/characters/nekumax/types";
const EMBLEM_DIR = "/img/emblems";
const REFERENCE_SRC = "/img/characters/nekumax/reference.png";

/**
 * 家族の立ち絵。v3 では立ち絵は**家族単位**（4色 × 性別2 の8枚）で、
 * タイプの区別はエンブレム（TypeEmblem）が担う（07 §9）。
 * 画像のファイル名は v2 のまま流用している（`types/{familyId}.webp`）。
 */
export function NekuMaxFamily({
  family,
  gender = "male",
  size = 160,
  bob = false,
  className = "",
}: {
  family: PersonalityFamilyId;
  gender?: Gender;
  size?: number;
  bob?: boolean;
  className?: string;
}) {
  const meta = getPersonalityFamily(family);
  const variant = gender === "female" ? `${family}_f` : family;
  const primarySrc = `${FAMILY_DIR}/${variant}.webp`;
  const [failedSources, setFailedSources] = useState<string[]>([]);

  const wrapperClass = `${bob ? "animate-bob" : ""} ${className}`.trim();
  const src = !failedSources.includes(primarySrc)
    ? primarySrc
    : !failedSources.includes(REFERENCE_SRC)
      ? REFERENCE_SRC
      : undefined;

  if (!src) {
    return (
      <span
        role="img"
        aria-label={meta.name}
        className={`grid place-items-center rounded-3xl bg-white ${wrapperClass}`}
        style={{ width: size, height: size, border: `3px dashed ${meta.color}` }}
      >
        <span style={{ fontSize: size * 0.45 }}>🤖</span>
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={meta.name}
      width={size}
      height={size}
      unoptimized
      onError={() =>
        setFailedSources((current) => (current.includes(src) ? current : [...current, src]))
      }
      className={wrapperClass}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}

/**
 * タイプの立ち絵（07 §9.3 フェーズB）。16タイプ × 性別2 の32枚。
 *
 * 役割（`teamRole`）を装備とポーズで見せる。RPGのジョブに近い作りで、
 * 呼び名を読まなくても絵だけで役割が伝わることを狙う。
 *
 * **フォールバックは4段**: タイプ32枚 → 家族8枚 → 原画 → 絵文字。
 * 32枚が1枚も無くても、家族立ち絵で従来どおり動く。
 */
export function NekuMaxType({
  code,
  gender = "male",
  size = 160,
  bob = false,
  className = "",
}: {
  code: PersonalityTypeCode;
  gender?: Gender;
  size?: number;
  bob?: boolean;
  className?: string;
}) {
  const meta = getPersonalityType(code);
  const family = getPersonalityFamily(meta.familyId);
  const suffix = gender === "female" ? "_f" : "";
  const [failedSources, setFailedSources] = useState<string[]>([]);

  const candidates = [
    `${FAMILY_DIR}/${code}${suffix}.webp`,
    `${FAMILY_DIR}/${meta.familyId}${suffix}.webp`,
    REFERENCE_SRC,
  ];
  const src = candidates.find((candidate) => !failedSources.includes(candidate));
  const wrapperClass = `${bob ? "animate-bob" : ""} ${className}`.trim();

  if (!src) {
    return (
      <span
        role="img"
        aria-label={meta.name}
        className={`grid place-items-center rounded-3xl bg-white ${wrapperClass}`}
        style={{ width: size, height: size, border: `3px dashed ${family.color}` }}
      >
        <span style={{ fontSize: size * 0.45 }}>{meta.emblem}</span>
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={meta.name}
      width={size}
      height={size}
      unoptimized
      onError={() =>
        setFailedSources((current) => (current.includes(src) ? current : [...current, src]))
      }
      className={wrapperClass}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}

/**
 * タイプのエンブレム。画像が1枚も無くても診断は完成品として動く必要があるので、
 * 未生成のあいだは §2 の絵文字にフォールバックする（07 §9.1）。
 */
export function TypeEmblem({
  code,
  size = 64,
  className = "",
}: {
  code: PersonalityTypeCode;
  size?: number;
  className?: string;
}) {
  const meta = getPersonalityType(code);
  const family = getPersonalityFamily(meta.familyId);
  const src = `${EMBLEM_DIR}/${code}.webp`;
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        role="img"
        aria-label={meta.name}
        className={`grid place-items-center rounded-full bg-white ${className}`}
        style={{
          width: size,
          height: size,
          border: `${Math.max(2, size * 0.06)}px solid ${family.color}`,
        }}
      >
        <span style={{ fontSize: size * 0.5, lineHeight: 1 }}>{meta.emblem}</span>
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={meta.name}
      width={size}
      height={size}
      unoptimized
      onError={() => setFailed(true)}
      className={className}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}
