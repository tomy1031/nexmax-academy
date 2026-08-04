"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { LearnerText, RubyText } from "@/components/ruby-text";
import { NexMaxFamily, NexMaxType } from "@/components/nexmax-types";
import {
  PERSONALITY_FAMILIES,
  PERSONALITY_RESULT_READINGS,
  getPersonalityType,
  isPersonalityTypeCode,
  type PersonalityFamily,
  type PersonalityTypeCode,
} from "@/content/personality";
import { getProfile, type Gender } from "@/lib/profile";

/**
 * ネクマックス16人の一覧（図鑑）。
 *
 * **4文字コードは1文字も出さない。** 診断はネクマックスの世界の中で完結させる（07 §1.3）。
 * 呼び名・エンブレム・ひとこと・チームでの役割・4行の説明だけで16人を見分けられるようにする。
 *
 * 学習者向けの画面なので、文はすべてふりがな＋語彙メモを通す（07 §2.5）。
 */

function subscribeToStorage(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

/**
 * 診断ずみなら自分の1人に印を付け、立ち絵も本人の性別に合わせる。
 * **未診断でも図鑑としては完成品として動く**ので、プロフィールが無い前提を既定にする。
 * `useSyncExternalStore` に渡すので、同じ内容なら同じ文字列を返す必要がある（オブジェクトを返さない）。
 */
function ownSnapshot(): string {
  const profile = getProfile();
  if (!profile) return "|male";
  return `${profile.type}|${profile.gender}`;
}

function TypeCard({
  code,
  family,
  isOwn,
  gender,
}: {
  code: PersonalityTypeCode;
  family: PersonalityFamily;
  isOwn: boolean;
  gender: Gender;
}) {
  const type = getPersonalityType(code);

  return (
    <article
      className="card-pop border-3 p-4 text-left"
      style={{ borderColor: isOwn ? family.color : "transparent" }}
    >
      <header className="flex items-center gap-3">
        <NexMaxType code={code} gender={gender} size={116} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="text-navy text-base font-black">
            {type.name}
            {isOwn && (
              <span
                className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-black text-white"
                style={{ backgroundColor: family.color }}
              >
                あなた
              </span>
            )}
          </h3>
          <p className="text-ink-soft mt-0.5 text-xs font-extrabold">
            <LearnerText text={type.tagline} />
          </p>
        </div>
      </header>

      <p className="text-ink mt-3 text-sm font-bold">
        <span className="bg-navy mr-2 rounded-lg px-2 py-1 text-xs text-white">
          <RubyText text={type.teamRole} readings={PERSONALITY_RESULT_READINGS} />
        </span>
        <LearnerText text={type.teamRoleDetail} />
      </p>

      {/* ルビが行の高さを押し上げるので、行間を広めに取らないと行が混ざって見える。 */}
      <ul className="mt-3 space-y-2">
        {type.analysis.map((line) => (
          <li key={line} className="text-ink flex gap-2 text-sm leading-loose font-bold">
            <span className="text-leaf-deep shrink-0">✓</span>
            <LearnerText text={line} />
          </li>
        ))}
      </ul>
    </article>
  );
}

function FamilySection({
  family,
  ownCode,
  gender,
}: {
  family: PersonalityFamily;
  ownCode: string;
  gender: Gender;
}) {
  return (
    <section className="mt-8">
      <header className="flex items-center gap-3">
        <NexMaxFamily family={family.id} gender={gender} size={72} className="shrink-0" />
        <div>
          <h2
            className="inline-block rounded-full px-4 py-1 text-sm font-black text-white"
            style={{ backgroundColor: family.color }}
          >
            <RubyText
              text={family.name}
              readings={[{ text: family.name, reading: family.reading }]}
            />
          </h2>
          <p className="text-ink-soft mt-1 text-xs font-extrabold">
            {family.strengths.map((strength, index) => (
              <span key={strength}>
                {index > 0 && "・"}
                <LearnerText text={strength} />
              </span>
            ))}
          </p>
        </div>
      </header>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {family.codes.map((code) => (
          <TypeCard
            key={code}
            code={code}
            family={family}
            isOwn={code === ownCode}
            gender={gender}
          />
        ))}
      </div>
    </section>
  );
}

export function NexMaxCatalog() {
  const snapshot = useSyncExternalStore(subscribeToStorage, ownSnapshot, () => "|male");
  const [rawCode, rawGender] = snapshot.split("|");
  const ownCode = isPersonalityTypeCode(rawCode) ? rawCode : "";
  const gender: Gender = rawGender === "female" ? "female" : "male";

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-navy text-2xl font-black sm:text-3xl">
          <RubyText
            text="ネクマックス 16人"
            readings={[{ text: "16人", reading: "じゅうろくにん" }]}
          />
        </h1>
        <Link
          href="/map"
          className="text-sky text-sm font-bold underline underline-offset-4"
          prefetch={false}
        >
          マップへ もどる
        </Link>
      </div>
      <p className="text-ink mt-2 text-sm font-bold">
        <LearnerText text="4つの 組に、4人ずつ います。どの 人にも、いい ところが あります。" />
      </p>

      {PERSONALITY_FAMILIES.map((family) => (
        <FamilySection key={family.id} family={family} ownCode={ownCode} gender={gender} />
      ))}

      <p className="text-ink-soft mt-8 text-center text-xs font-bold">
        <LearnerText text="どの 組の 人とも、いい チームに なれます。" />
      </p>
    </main>
  );
}
