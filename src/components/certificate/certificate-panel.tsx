"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { RubyText } from "@/components/ruby-text";
import type { FuriganaIndex } from "@/lib/text/furigana";
import { certificateFile, saveCertificateFile } from "@/lib/certificate/draw";
import {
  certificateLines,
  formatIssuedAt,
  nextStepForPerfect,
  notPerfectReasons,
  type IssuedCertificate,
} from "@/lib/certificate/model";
import { CERTIFICATE_UI_FURIGANA as UI } from "./ui-furigana";

/** 修了証の 出しぐあい（発行中・できた・落ちた）。 */
export type CertificateState =
  | { readonly status: "issuing" }
  | { readonly status: "ready"; readonly cert: IssuedCertificate }
  | { readonly status: "error" };

/**
 * 修了証の カード（画面）と「画像で 保存」（願い #562）
 *
 * リスニング・タイピング（と これから 足す 教材）で **同じ 部品**を 使う。
 * パーフェクトは 金・そうでない ものは 青で、ひと目で 分かる ように する。
 * そうでない ときは **理由と 次の 一手を はっきり 書く**（規律1）。
 *
 * 画面の 文は ルビつき（`RubyText`）。保存する 画像は `src/lib/certificate/draw.ts` が
 * 同じ 行（`certificateLines`）から 描く。
 */
export function CertificatePanel({
  state,
  furigana,
  show = true,
  onRetry,
}: {
  state: CertificateState;
  /** 教材の 読み辞書（題の ルビに 使う）。 */
  furigana: FuriganaIndex;
  /** ふりがな ON/OFF。 */
  show?: boolean;
  onRetry?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  /** 先に 作って おく PNG（押した その場で 共有シートを 開ける ように。iOS Safari）。 */
  const fileRef = useRef<File | null>(null);
  const ready = state.status === "ready" ? state.cert : null;
  useEffect(() => {
    fileRef.current = null;
    if (!ready) return;
    let alive = true;
    certificateFile(ready)
      .then((file) => {
        if (alive) fileRef.current = file;
      })
      .catch(() => {
        /* 押した ときに もう一度 作る */
      });
    return () => {
      alive = false;
    };
  }, [ready]);

  if (state.status === "issuing") {
    return (
      <p
        className="card-island border-hairline text-ink-soft border p-4 text-center font-bold"
        data-certificate="issuing"
        role="status"
      >
        🎓 <RubyText text="修了証を 作って います…" index={UI} show={show} />
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <div
        className="card-island border-coral bg-coral-soft text-coral-deep border p-4 font-bold"
        data-certificate="error"
        role="alert"
      >
        <p>
          <RubyText
            text="修了証を 作れませんでした。つながりを 見て、もう一度 ためして ください。"
            index={UI}
            show={show}
          />
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="border-coral bg-panel mt-2 rounded-xl border-2 px-4 py-2 text-sm font-extrabold"
          >
            ↻ <RubyText text="もう一度 ためす" index={UI} show={show} />
          </button>
        ) : null}
      </div>
    );
  }

  const cert = state.cert;
  const lines = certificateLines(cert);
  const reasons = notPerfectReasons(cert);
  const frame = cert.perfect ? "border-[#f0a819] bg-[#fff6dc]" : "border-sky bg-sky-soft";

  return (
    <section
      className={`relative overflow-hidden rounded-[var(--radius-card)] border-[6px] p-5 sm:p-6 ${frame}`}
      data-certificate="ready"
      data-perfect={cert.perfect ? "true" : "false"}
      data-official={cert.official ? "true" : "false"}
      data-code={cert.code}
      aria-label="修了証"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-navy text-2xl font-black">
          🎓 <RubyText text="修了証" index={UI} show={show} />
        </h2>
        <span
          className={`rounded-xl px-4 py-1.5 text-lg font-black text-white ${
            cert.perfect ? "bg-[#f0a819]" : "bg-sky"
          }`}
          data-certificate="badge"
        >
          {cert.perfect ? "★ PERFECT" : <RubyText text="修了" index={UI} show={show} />}
        </span>
      </div>

      {!cert.official ? (
        <p className="text-coral-deep mt-2 text-sm font-extrabold" data-certificate="sample">
          <RubyText
            text="見本です（ログインして いないので、正式な 修了証では ありません）。"
            index={UI}
            show={show}
          />
        </p>
      ) : null}

      <dl className="mt-3 grid gap-x-4 gap-y-1.5 sm:grid-cols-[auto_1fr]">
        <Row label="名前" show={show}>
          <span className="text-xl font-black">
            {cert.learnerName || <RubyText text="（名前が ありません）" index={UI} show={show} />}
          </span>
        </Row>
        <Row label="教材" show={show}>
          <RubyText text={cert.title} index={furigana} show={show} />
        </Row>
        <Row label="終えた 時刻" show={show}>
          <span data-certificate="time">{formatIssuedAt(cert.issuedAt)}</span>
        </Row>
        {cert.official ? (
          <Row label="回" show={show}>
            <RubyText text={`${cert.attempt}回目`} index={UI} show={show} />
          </Row>
        ) : null}
        {lines.map((line) => (
          <Row key={line.label} label={line.label} show={show}>
            <RubyText text={line.value} index={UI} show={show} />
          </Row>
        ))}
        <Row label="照合番号" show={show}>
          <span className="font-mono text-2xl font-black tracking-widest" data-certificate="code">
            {cert.official ? cert.code : "--------"}
          </span>
        </Row>
      </dl>

      {reasons.length > 0 ? (
        <div
          className="border-coral bg-panel text-coral-deep mt-3 rounded-2xl border px-4 py-3 font-bold"
          data-certificate="reasons"
        >
          <p className="font-extrabold">
            <RubyText text="パーフェクトでは ありません。" index={UI} show={show} />
          </p>
          {reasons.map((reason) => (
            <p key={reason}>
              <RubyText text={reason} index={UI} show={show} />
            </p>
          ))}
          <p className="text-ink mt-1">
            <RubyText text={nextStepForPerfect(cert)} index={UI} show={show} />
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          aria-label="修了証を 画像で 保存"
          disabled={saving}
          onClick={() => {
            setSaving(true);
            setSaveError(false);
            const prepared = fileRef.current;
            (prepared
              ? saveCertificateFile(prepared)
              : certificateFile(cert).then(saveCertificateFile)
            )
              .catch(() => setSaveError(true))
              .finally(() => setSaving(false));
          }}
          className={`btn-game px-6 py-2.5 disabled:opacity-60 ${
            cert.perfect
              ? "[--btn-face:#f0a819] [--btn-shadow:#c98a0d]"
              : "[--btn-face:#0288d1] [--btn-shadow:#0272ae]"
          }`}
        >
          🖼 <RubyText text="画像で 保存" index={UI} show={show} />
        </button>
        <p className="text-ink-soft text-sm font-bold">
          <RubyText text="この 画像を 先生に 出します。" index={UI} show={show} />
        </p>
      </div>
      {saveError ? (
        <p className="text-coral-deep mt-2 text-sm font-bold" role="alert">
          <RubyText
            text="保存できませんでした。もう一度 ためして ください。"
            index={UI}
            show={show}
          />
        </p>
      ) : null}

      <Image
        src={
          cert.perfect ? "/img/characters/nexmax/cheer.webp" : "/img/characters/nexmax/hello.webp"
        }
        alt=""
        width={120}
        height={120}
        className="pointer-events-none absolute right-3 bottom-3 hidden opacity-90 sm:block"
        unoptimized
      />
    </section>
  );
}

function Row({
  label,
  show,
  children,
}: {
  label: string;
  show: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-ink-soft text-sm font-bold sm:pt-1">
        <RubyText text={label} index={UI} show={show} />
      </dt>
      <dd className="text-navy text-lg font-extrabold break-words">{children}</dd>
    </>
  );
}
