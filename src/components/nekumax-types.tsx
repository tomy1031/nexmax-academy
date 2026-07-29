"use client";

import Image from "next/image";
import { useState } from "react";
import { getPersonalityType, type PersonalityTypeId } from "@/content/personality";
import type { Gender } from "@/lib/profile";

const TYPE_DIR = "/img/characters/nekumax/types";
const REFERENCE_SRC = "/img/characters/nekumax/reference.png";

export function NekuMaxType({
  id,
  gender = "male",
  size = 160,
  bob = false,
  className = "",
}: {
  id: PersonalityTypeId;
  gender?: Gender;
  size?: number;
  bob?: boolean;
  className?: string;
}) {
  const meta = getPersonalityType(id);
  const variant = gender === "female" ? `${id}_f` : id;
  const primarySrc = `${TYPE_DIR}/${variant}.webp`;
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
