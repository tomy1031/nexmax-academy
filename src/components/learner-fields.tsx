"use client";

import { useState, type ReactNode, type RefObject } from "react";
import { CARD_EDGE_SM } from "@/components/card-edge";
import { katakanaNotice, MAX_NAME_LENGTH, type LearnerNames } from "@/lib/name";
import { COHORTS, UNIVERSITIES, type LearnerSchool } from "@/lib/school";
import type { Gender } from "@/lib/profile";

/**
 * 学習者じしんの じょうほうを 入れて もらう カード（なまえ・がっこう・せいべつ・APIキー）
 *
 * はじめの せってい（`/welcome`）と、あとから 直す せってい（`/map/settings`）の
 * **両方が 同じ 見た目に なる** ように、ここに 1つだけ 置く。画面ごとに 書くと、
 * 片方だけ 直って ずれる（学習者は 同じ 欄を 2回 見るので、ずれが すぐ 分かる）。
 */

export function FallbackImage({
  src,
  alt,
  fallback,
  className,
}: {
  src: string;
  alt: string;
  fallback: ReactNode;
  className: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} onError={() => setFailed(true)} className={className} />
  );
}

/**
 * なまえの入力欄1つ分。
 *
 * カタカナで書く決まり（願い #14）。書き直しの案内は打ち終わってから出す——
 * 1文字打つたびに注意が出ると、打っている最中に「合っていない」と見えてしまう。
 * 判定そのものは `src/lib/name.ts` に置く（画面ごとに書かない）。
 */
function NameField({
  label,
  hint,
  placeholder,
  value,
  onChange,
  optional = false,
}: {
  label: ReactNode;
  hint?: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
}) {
  const [touched, setTouched] = useState(false);
  const notice = touched ? katakanaNotice(value) : null;

  return (
    <label className="block">
      <span className="text-ink block text-sm font-extrabold">
        {label}
        {optional ? (
          <span className="text-ink-soft ml-1 text-xs">（じゆう）</span>
        ) : (
          <span className="text-coral-deep ml-1 text-xs">
            （
            <ruby>
              必須<rt>ひっす</rt>
            </ruby>
            ）
          </span>
        )}
      </span>
      {hint && <span className="text-ink-soft mt-0.5 block text-xs font-bold">{hint}</span>}
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => setTouched(true)}
        placeholder={placeholder}
        maxLength={MAX_NAME_LENGTH}
        aria-invalid={notice !== null}
        className={`mt-1.5 w-full rounded-2xl border-2 bg-white px-4 py-2 font-bold ${
          notice ? "border-coral" : "border-hairline"
        }`}
      />
      {notice && (
        <span className="text-coral-deep mt-1 block text-xs font-extrabold">🙏 {notice}</span>
      )}
    </label>
  );
}

export function NameCard({
  names,
  onChange,
  googleFullName = "",
  className = "",
}: {
  names: LearnerNames;
  onChange: (names: LearnerNames) => void;
  /**
   * Google に登録された名前。カタカナでなかったときだけ渡す（見本として見せる）。
   * 空なら この案内は出ない（2026-08-11 の指定）。
   */
  googleFullName?: string;
  className?: string;
}) {
  return (
    <article className={`card-pop p-5 ${CARD_EDGE_SM} ${className}`}>
      <h2 className="text-navy font-extrabold">
        ⭐ なまえ{" "}
        <span className="text-coral-deep text-xs">
          （
          <ruby>
            必須<rt>ひっす</rt>
          </ruby>
          ）
        </span>
      </h2>
      <p className="text-ink-soft mt-2 text-sm font-bold">
        <span className="text-navy">カタカナ</span>で かいてね。せんせいが よぶ ときに つかいます。
      </p>
      {/* Google の名前がカタカナでないときは、欄に入れずに見本として見せる。
          開いた いきなり 赤い字が出ないようにするため（2026-08-11 の指定）。 */}
      {googleFullName && (
        <p className="bg-sun/25 text-ink mt-3 rounded-2xl px-3 py-2 text-xs font-bold">
          💡 Google の なまえは「{googleFullName}」です。これを カタカナで かいてね。
        </p>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <NameField
          label={
            <ruby>
              苗字<rt>みょうじ</rt>
            </ruby>
          }
          placeholder="れい：ソク"
          value={names.familyName}
          onChange={(value) => onChange({ ...names, familyName: value })}
        />
        <NameField
          label={
            <ruby>
              名前<rt>なまえ</rt>
            </ruby>
          }
          placeholder="れい：ソピア"
          value={names.givenName}
          onChange={(value) => onChange({ ...names, givenName: value })}
        />
      </div>
      <div className="mt-3">
        <NameField
          label={
            <>
              <ruby>
                先生<rt>せんせい</rt>
              </ruby>
              に よんで ほしい なまえ
            </>
          }
          hint="かかなくても だいじょうぶ。そのときは じぶんの なまえで よぶよ。"
          placeholder="れい：ピア"
          value={names.nickname}
          onChange={(value) => onChange({ ...names, nickname: value })}
          optional
        />
      </div>
    </article>
  );
}

/**
 * 学校と期生（願い #27）。先生がクラスを見分けるのに使う。
 */
export function SchoolCard({
  school,
  onChange,
  className = "",
}: {
  school: LearnerSchool;
  onChange: (school: LearnerSchool) => void;
  className?: string;
}) {
  return (
    <article className={`card-pop p-5 ${CARD_EDGE_SM} ${className}`}>
      <h2 className="text-navy font-extrabold">
        ⭐ がっこう{" "}
        <span className="text-coral-deep text-xs">
          （
          <ruby>
            必須<rt>ひっす</rt>
          </ruby>
          ）
        </span>
      </h2>
      <p className="text-ink-soft mt-2 text-sm font-bold">
        あなたの がっこうと、なんきせいかを えらんでね。
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {UNIVERSITIES.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={school.university === name}
            onClick={() => onChange({ ...school, university: name })}
            className={`rounded-2xl border-3 px-2 py-3 text-sm font-extrabold shadow-sm transition-transform hover:-translate-y-1 ${
              school.university === name
                ? "border-sky bg-sky-soft text-navy"
                : "border-hairline text-ink-soft bg-white"
            }`}
          >
            🎓 {name}
          </button>
        ))}
      </div>
      <p className="text-ink-soft mt-4 text-sm font-bold">なんきせい？</p>
      <div className="mt-2 grid grid-cols-5 gap-1.5">
        {COHORTS.map((year) => (
          <button
            key={year}
            type="button"
            aria-pressed={school.cohort === year}
            onClick={() => onChange({ ...school, cohort: year })}
            className={`rounded-2xl border-3 py-2 text-sm font-extrabold shadow-sm transition-transform hover:-translate-y-1 ${
              school.cohort === year
                ? "border-sky bg-sky-soft text-navy"
                : "border-hairline text-ink-soft bg-white"
            }`}
          >
            {year}
            <span className="block text-[10px]">きせい</span>
          </button>
        ))}
      </div>
    </article>
  );
}

export function GenderCard({
  gender,
  onChange,
  className = "",
}: {
  gender: Gender | null;
  onChange: (gender: Gender) => void;
  className?: string;
}) {
  return (
    <article className={`card-pop p-5 ${CARD_EDGE_SM} ${className}`}>
      <h2 className="text-navy font-extrabold">
        ⭐{" "}
        <ruby>
          性別<rt>せいべつ</rt>
        </ruby>{" "}
        <span className="text-coral-deep text-xs">
          （
          <ruby>
            必須<rt>ひっす</rt>
          </ruby>
          ）
        </span>
      </h2>
      <p className="text-ink-soft mt-2 text-sm font-bold">あなたの せいべつを えらんでね。</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {[
          {
            id: "male" as const,
            icon: "👨",
            image: "/img/ui/gender_male.webp",
            label: "男性",
            color: "#0288d1",
          },
          {
            id: "female" as const,
            icon: "👩",
            image: "/img/ui/gender_female.webp",
            label: "女性",
            color: "#f26fa7",
          },
        ].map((choice) => (
          <button
            key={choice.id}
            type="button"
            onClick={() => onChange(choice.id)}
            className="rounded-2xl border-3 bg-white px-1 py-2 text-sm font-extrabold shadow-sm transition-transform hover:-translate-y-1"
            style={{
              borderColor: gender === choice.id ? choice.color : "#dcebf5",
              backgroundColor: gender === choice.id ? `${choice.color}18` : "#ffffff",
              color: choice.color,
            }}
          >
            <span className="mx-auto flex h-14 items-center justify-center">
              <FallbackImage
                src={choice.image}
                alt=""
                fallback={<span className="text-3xl">{choice.icon}</span>}
                className="h-14 w-14 object-contain"
              />
            </span>
            <ruby>
              {choice.label}
              <rt>{choice.id === "male" ? "だんせい" : "じょせい"}</rt>
            </ruby>
          </button>
        ))}
      </div>
    </article>
  );
}

/**
 * Gemini の APIキー（BYOK）。**キーはこの端末の中にだけ置く**（`src/lib/profile.ts`）。
 * サーバへ送らないので、入れ直しも消すのも学習者の手もとで完結する。
 */
export function GeminiKeyCard({
  value,
  onChange,
  inputRef,
  note = "？ Gemini APIキーは、あとから せっていすることも できます。",
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  /** 保存の直前に、打ちかけの中身をそのまま読むための参照（親が使う）。 */
  inputRef?: RefObject<HTMLInputElement | null>;
  /** 欄の下の ひとこと。せっていの 画面では「ここが その あとから」なので 言い方を 変える。 */
  note?: ReactNode;
  className?: string;
}) {
  const [showKey, setShowKey] = useState(false);

  return (
    <article className={`card-pop p-5 ${CARD_EDGE_SM} ${className}`}>
      <h2 className="text-navy font-extrabold">
        ⭐ Google Gemini APIキー{" "}
        <span className="text-ink-soft text-xs">
          （
          <ruby>
            任意<rt>にんい</rt>
          </ruby>
          ）
        </span>
      </h2>
      <p className="text-ink-soft mt-2 text-sm font-bold">
        Gemini と つなぐと、AI が まなびを サポートします！
      </p>
      <div className="mt-3 flex gap-2">
        <div className="relative min-w-0 flex-1">
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
          >
            🔑
          </span>
          <input
            ref={inputRef}
            type={showKey ? "text" : "password"}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="border-hairline w-full rounded-2xl border-2 bg-white py-2 pr-3 pl-10 font-mono text-sm"
            aria-label="Google Gemini APIキー"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowKey((current) => !current)}
          className="border-hairline rounded-2xl border-2 bg-white px-3"
          aria-label={showKey ? "APIキーを かくす" : "APIキーを 見る"}
        >
          {showKey ? "🙈" : "👁️"}
        </button>
      </div>
      <p className="text-ink-soft mt-2 text-xs font-bold">{note}</p>
    </article>
  );
}
