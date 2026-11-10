"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RubyText } from "@/components/ruby-text";
import { DictionaryText } from "@/components/dictionary-text";
import { claudeStatus } from "@/lib/ai/claude-check";
import {
  DESIGN_VERDICT_LABELS,
  designReplyFurigana,
  runDesignCheck,
  type DesignReview,
  type DesignVerdict,
} from "@/lib/ai/design-check";
import { SHRINK_ACCEPT, shrinkImage } from "@/lib/ai/shrink-image";
import {
  aiImageCheckAnswers,
  aiImageCheckFields,
  verdictOfLabel,
  type AiImageCheckBlock as AiImageCheckData,
} from "@/lib/answers/ai-image-check";
import type { FormEntry } from "@/lib/answers/form-answers";
import { loadFormEntries, MAX_FORM_TEXT, saveFormAnswers } from "@/lib/answers/form-answers-db";
import { buildFuriganaIndex, mergeFuriganaEntries, type FuriganaIndex } from "@/lib/text/furigana";

/**
 * 画像の AI判定（記事の `aiImageCheck` ブロック・要望 #713）
 *
 * 旧アプリ nextmake-onboarding の「8.デザイン」: 参考サイトの 画面を 上げ、えらんだ 理由を 書くと、
 * AI の 山本社長が Aoba の ブランドに 合うかを 判定する（何枚でも 試せる）。社長の デザインの
 * 好みは、旧アプリでも この 判定の 中にだけ あった（constraints 2026-11-10）。
 *
 * ## 判定は はっきり 出す（規律1）
 * 「合う／少し ちがう／合わない」を 色つきの 札で 出し、ちがう ところと つぎに する ことを 添える。
 *
 * ## AIが 使えない とき（授業の 時間の 外・組の 設定なし・きょうの 回数の 上限）
 * **学習者を 止めない**。サイトと 理由だけ 書いて 保存でき、確かめ方（`closedNote`＝さいごの
 *「先生の こたえと くらべる」）を 案内する。鍵ゼロ（デモモード・CI）も この 形に なる。
 *
 * ## 記録
 * 書きこみフォームと 同じ 保存・読み返し（`form-answers-db.ts`）。先生は 学習の きろくで 読む。
 * 画像は 残さない（その場の 見本だけ）。
 *
 * ## `<form>` を 使わない
 * 欄の 中で Enter を 押すと ブラウザが 勝手に 送る（日本語入力の 確定の Enter）。`form-block.tsx` と 同じ。
 */

/** 画面の ことばの 読み（教材の 読み辞書に 無い 語）。教材の 辞書を あとに 重ねて 勝たせる。 */
const UI_FURIGANA = [
  ["何枚", "なんまい"],
  ["授業", "じゅぎょう"],
  ["時間", "じかん"],
  ["回数", "かいすう"],
  ["画像", "がぞう"],
  ["判定", "はんてい"],
  ["保存", "ほぞん"],
  ["理由", "りゆう"],
  ["名前", "なまえ"],
  ["記録", "きろく"],
  ["一度", "いちど"],
  ["少し", "すこし"],
  ["大き", "おおき"],
  ["試", "ため"],
  ["使", "つか"],
  ["見", "み"],
  ["書", "か"],
  ["合", "あ"],
  ["探", "さが"],
  ["作", "つく"],
  ["下", "した"],
  ["上", "うえ"],
  ["出", "で"],
  ["押", "お"],
  ["読", "よ"],
  ["前", "まえ"],
  ["開", "ひら"],
  ["直", "なお"],
  ["残", "のこ"],
] as const;

const VERDICT_COLORS: Record<DesignVerdict, { bg: string; ink: string }> = {
  au: { bg: "var(--color-leaf-deep)", ink: "#ffffff" },
  sukoshi_chigau: { bg: "var(--color-sun-deep)", ink: "#ffffff" },
  awanai: { bg: "var(--color-coral-deep)", ink: "#ffffff" },
};

/** 判定の あとに 添える 1つの 行動（規律1）。AIの「つぎ」が 落ちた ときも これは 出る。 */
const VERDICT_NEXT: Record<DesignVerdict, string> = {
  au: "この デザインを もとに、下の ワイヤーフレームを 作りましょう。",
  sukoshi_chigau: "ちがう ところを 見て、ほかの サイトも 探して、もう一度 見て もらいましょう。",
  awanai: "ほかの サイトを 探して、もう一度 見て もらいましょう。",
};

type Gate = "checking" | "open" | "closed";
type Status = "idle" | "asking" | "saving";
type Notice = "" | "saved" | "failedAsk" | "failedSave" | "closedNow";

type Picked = { previewUrl: string; data: string; mediaType: "image/jpeg" };

/** その場で 見た 判定（画像の 見本つき。記録には 画像を 残さない）。 */
type Latest = { previewUrl: string; site: string; reason: string; review: DesignReview };

/** 「10/7 14:05」（`form-block.tsx` と 同じ。漢字の 日付は 読みが 割れる）。 */
function formatAt(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function VerdictBadge({
  verdict,
  ui,
}: {
  verdict: DesignVerdict;
  ui: (text: string) => React.ReactNode;
}) {
  const color = VERDICT_COLORS[verdict];
  return (
    <span
      data-testid="ai-image-check-verdict"
      data-verdict={verdict}
      className="inline-block rounded-full px-3 py-1 text-sm font-black"
      style={{ background: color.bg, color: color.ink }}
    >
      {ui(DESIGN_VERDICT_LABELS[verdict])}
    </span>
  );
}

export function AiImageCheckBlock({
  block,
  articleId,
  furigana,
  show,
  preview,
}: {
  block: AiImageCheckData;
  articleId: string;
  furigana: FuriganaIndex;
  show: boolean;
  /** スタジオの プレビュー。AIも 保存も 呼ばない。 */
  preview: boolean;
}) {
  const fields = useMemo(() => aiImageCheckFields(block), [block]);
  const uiIndex = useMemo(
    () => buildFuriganaIndex(mergeFuriganaEntries(UI_FURIGANA, furigana.entries)),
    [furigana],
  );
  /** AIの 文を 描く 索引（`runDesignCheck` が 検査に 使う ものと 同じ）。 */
  const aiIndex = useMemo(
    () => buildFuriganaIndex(designReplyFurigana(furigana.entries)),
    [furigana],
  );
  const ui = (text: string) => <RubyText text={text} index={uiIndex} show={show} />;

  const [gate, setGate] = useState<Gate>(preview ? "open" : "checking");
  const [closedReason, setClosedReason] = useState("");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [pickProblem, setPickProblem] = useState("");
  const [site, setSite] = useState("");
  const [reason, setReason] = useState("");
  const [missing, setMissing] = useState<{ image: boolean; site: boolean; reason: boolean }>({
    image: false,
    site: false,
    reason: false,
  });
  const [status, setStatus] = useState<Status>("idle");
  const [notice, setNotice] = useState<Notice>("");
  const [latest, setLatest] = useState<Latest | null>(null);
  const [entries, setEntries] = useState<FormEntry[] | null | "error">(preview ? [] : null);
  const fileRef = useRef<HTMLInputElement>(null);

  // いま AIに 見て もらえるか（60秒 覚える。鍵ゼロ・ログイン前は すぐ「閉じて いる」）
  useEffect(() => {
    if (preview) return;
    let alive = true;
    void claudeStatus().then((result) => {
      if (!alive) return;
      setGate(result.open ? "open" : "closed");
      setClosedReason(result.reason);
    });
    return () => {
      alive = false;
    };
  }, [preview]);

  useEffect(() => {
    if (preview) return;
    let alive = true;
    void loadFormEntries(articleId, fields).then((loaded) => {
      if (alive) setEntries(loaded ?? "error");
    });
    return () => {
      alive = false;
    };
    // 記録の 鍵（ブロックの id）が 変わった ときだけ 読み直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId, block.id, preview]);

  const open = gate === "open";

  const pick = async (file: File | undefined) => {
    setPickProblem("");
    setNotice("");
    if (!file) return;
    const shrunk = await shrinkImage(file);
    if (!shrunk.ok) {
      setPicked(null);
      setPickProblem(
        shrunk.reason === "type"
          ? "JPEG・PNG・WebP の 画像を えらんで ください。"
          : shrunk.reason === "size"
            ? "画像が 大きすぎます。20MB より 小さい 画像に して ください。"
            : "この 画像は 開けませんでした。ほかの 画像を えらんで ください。",
      );
      return;
    }
    setPicked({ previewUrl: shrunk.previewUrl, data: shrunk.data, mediaType: shrunk.mediaType });
    setMissing((current) => ({ ...current, image: false }));
  };

  const save = async (review: DesignReview | null) => {
    setStatus("saving");
    const answers = aiImageCheckAnswers(block, { site, reason, review });
    const result = await saveFormAnswers({ articleId, fields, answers });
    setStatus("idle");
    if (!result.ok) {
      setNotice("failedSave");
      return false;
    }
    setEntries((current) => [result.entry, ...(Array.isArray(current) ? current : [])]);
    return true;
  };

  const submit = async () => {
    if (preview || status !== "idle") return;
    const lack = {
      image: open && picked === null,
      site: site.trim() === "",
      reason: reason.trim() === "",
    };
    setMissing(lack);
    if (lack.image || lack.site || lack.reason) return;
    setNotice("");

    if (!open) {
      if (await save(null)) {
        setNotice("saved");
        setSite("");
        setReason("");
      }
      return;
    }

    setStatus("asking");
    const checked = await runDesignCheck({
      check: block.check,
      reason: reason.trim(),
      image: { media_type: picked!.mediaType, data: picked!.data },
      material: furigana.entries,
    });
    setStatus("idle");
    if (!checked.ok) {
      if (checked.closed) {
        // 授業の 時間が 終わった・回数の 上限 など。書いた ものは 消さずに 保存へ 切りかえる
        setGate("closed");
        setClosedReason(checked.reason);
        setNotice("closedNow");
      } else {
        setNotice("failedAsk");
      }
      return;
    }
    setLatest({
      previewUrl: picked!.previewUrl,
      site: site.trim(),
      reason: reason.trim(),
      review: checked.review,
    });
    if (await save(checked.review)) {
      setNotice("saved");
      setPicked(null);
      setSite("");
      setReason("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const closedFirstLine =
    closedReason === "userLimit"
      ? `きょうは もう ${block.judge}（AI）に 見て もらえません。きょうの 回数を ぜんぶ 使いました。`
      : `いまは ${block.judge}（AI）に 見て もらえません。AIは 授業の 時間だけ 使えます。`;

  const fieldBox = "w-full rounded-lg border-2 bg-white px-3 py-2 text-base font-bold";
  const borderOf = (bad: boolean) => ({
    borderColor: bad ? "var(--color-danger)" : "var(--color-hairline)",
  });
  const needText = (text: string) => (
    <p
      role="alert"
      className="mt-1 text-sm font-extrabold"
      style={{ color: "var(--color-coral-deep)" }}
    >
      {ui(text)}
    </p>
  );

  return (
    <section
      data-testid="ai-image-check"
      data-gate={gate}
      className="border-hairline bg-panel-tint rounded-[var(--radius-card)] border-2 p-4 sm:p-5"
    >
      {block.title && (
        <h3 className="text-navy text-lg font-extrabold">
          <span aria-hidden className="mr-1.5">
            🖼️
          </span>
          <DictionaryText text={block.title} index={furigana} show={show} />
        </h3>
      )}

      {gate === "checking" && (
        <p className="text-ink-soft mt-2 text-sm font-bold">{ui("じゅんびを して います…")}</p>
      )}
      {gate === "open" && !preview && (
        <p className="text-leaf-deep mt-2 text-sm font-extrabold">
          {ui(
            `いまは 授業の 時間なので、${block.judge}（AI）が 見て くれます。何枚でも 試せます。`,
          )}
        </p>
      )}
      {gate === "closed" && (
        <div
          data-testid="ai-image-check-closed"
          className="mt-3 rounded-xl border-2 p-3 text-sm leading-relaxed font-bold"
          style={{ borderColor: "var(--color-sun-deep)", background: "#fff8e6" }}
        >
          <p>{ui(closedFirstLine)}</p>
          <p className="mt-1">{ui("えらんだ サイトと 理由を 書いて、保存して おきましょう。")}</p>
          <p className="mt-1">
            <DictionaryText text={block.closedNote} index={furigana} show={show} />
          </p>
        </div>
      )}

      <div className="mt-3 space-y-3">
        {gate !== "closed" && (
          <div
            className="bg-panel rounded-[18px] border-2 p-3 sm:p-4"
            style={borderOf(missing.image)}
          >
            <p className="text-navy font-extrabold">
              {ui("① えらんだ サイトの 画面（スクリーンショット）")}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <label className="bg-sky cursor-pointer rounded-full px-5 py-2 font-extrabold text-white">
                {ui(picked ? "画像を えらび直す" : "画像を えらぶ")}
                <input
                  ref={fileRef}
                  type="file"
                  accept={SHRINK_ACCEPT.join(",")}
                  aria-label="画像を えらぶ"
                  className="sr-only"
                  disabled={preview || status !== "idle"}
                  onChange={(event) => void pick(event.target.files?.[0])}
                />
              </label>
              <span className="text-ink-soft text-xs font-bold">JPEG・PNG・WebP</span>
            </div>
            {picked && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={picked.previewUrl}
                alt="えらんだ サイトの 画面"
                className="border-hairline mt-3 max-h-72 w-auto max-w-full rounded-lg border-2 object-contain"
              />
            )}
            {pickProblem && needText(pickProblem)}
            {missing.image && needText("画像を えらんで ください。")}
          </div>
        )}

        <div className="bg-panel rounded-[18px] border-2 p-3 sm:p-4" style={borderOf(missing.site)}>
          <label className="text-navy block font-extrabold" htmlFor={`${block.id}-site`}>
            {ui(gate === "closed" ? "① サイトの 名前か URL" : "② サイトの 名前か URL")}
          </label>
          <input
            id={`${block.id}-site`}
            type="text"
            value={site}
            maxLength={MAX_FORM_TEXT}
            disabled={preview || status !== "idle"}
            aria-label="サイトの 名前か URL"
            onChange={(event) => {
              setSite(event.target.value);
              setMissing((current) => ({ ...current, site: false }));
            }}
            className={`mt-2 ${fieldBox}`}
            style={borderOf(missing.site)}
          />
          {missing.site && needText("サイトの 名前か URL を 書いて ください。")}
        </div>

        <div
          className="bg-panel rounded-[18px] border-2 p-3 sm:p-4"
          style={borderOf(missing.reason)}
        >
          <label className="text-navy block font-extrabold" htmlFor={`${block.id}-reason`}>
            {ui(gate === "closed" ? "② えらんだ 理由" : "③ えらんだ 理由")}
          </label>
          <p className="text-ink-soft mt-1 text-sm font-bold">
            {ui("この デザインを えらんだ 理由と、とくに 見て ほしい ところを 書きましょう。")}
          </p>
          <textarea
            id={`${block.id}-reason`}
            rows={3}
            value={reason}
            maxLength={MAX_FORM_TEXT}
            disabled={preview || status !== "idle"}
            aria-label="えらんだ 理由"
            onChange={(event) => {
              setReason(event.target.value);
              setMissing((current) => ({ ...current, reason: false }));
            }}
            className={`mt-2 resize-y ${fieldBox}`}
            style={borderOf(missing.reason)}
          />
          {missing.reason && needText("えらんだ 理由を 書いて ください。")}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          // 名前は ルビ前の 字で（ルビが 入ると 読み上げが 読みを 2回 言う）
          aria-label={open ? `${block.judge}に 見て もらう` : "保存する"}
          onClick={() => void submit()}
          disabled={preview || status !== "idle" || gate === "checking"}
          className="bg-sky rounded-full px-6 py-2.5 font-extrabold text-white disabled:opacity-50"
          style={{ boxShadow: "0 4px 0 var(--color-sky-deep)" }}
        >
          {status === "asking"
            ? ui(`${block.judge}が 見て います…`)
            : status === "saving"
              ? ui("保存して います…")
              : open
                ? ui(`${block.judge}に 見て もらう`)
                : ui("保存する")}
        </button>
        <p aria-live="polite" className="text-sm font-extrabold">
          {notice === "saved" && (
            <span className="text-leaf-deep">{ui("✅ 保存しました。下に 出て います。")}</span>
          )}
          {notice === "failedAsk" && (
            <span style={{ color: "var(--color-coral-deep)" }}>
              {ui("うまく 見て もらえませんでした。もう一度 押して ください。")}
            </span>
          )}
          {notice === "failedSave" && (
            <span style={{ color: "var(--color-coral-deep)" }}>
              {ui("保存できませんでした。もう一度 押して ください。")}
            </span>
          )}
          {notice === "closedNow" && (
            <span style={{ color: "var(--color-coral-deep)" }}>
              {ui("いまは 見て もらえませんでした。書いた ものは「保存する」で 残せます。")}
            </span>
          )}
          {preview && (
            <span className="text-ink-soft">{ui("プレビューでは AIも 保存も 使いません")}</span>
          )}
        </p>
      </div>

      {latest && (
        <div
          data-testid="ai-image-check-result"
          className="bg-panel mt-4 rounded-xl border-2 p-3 sm:p-4"
          style={{ borderColor: VERDICT_COLORS[latest.review.verdict].bg }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-navy font-extrabold">{ui(`${block.judge}の 判定`)}</span>
            <VerdictBadge verdict={latest.review.verdict} ui={ui} />
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={latest.previewUrl}
            alt="見て もらった サイトの 画面"
            className="border-hairline mt-3 max-h-56 w-auto max-w-full rounded-lg border-2 object-contain"
          />
          <div className="mt-3 space-y-2 text-base leading-relaxed font-bold">
            {latest.review.good.length > 0 && (
              <div>
                <p className="text-leaf-deep font-extrabold">{ui("⭕ 合って いる ところ")}</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {latest.review.good.map((line, i) => (
                    <li key={i}>
                      <RubyText text={line} index={aiIndex} show={show} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {latest.review.fix.length > 0 && (
              <div>
                <p className="font-extrabold" style={{ color: "var(--color-coral-deep)" }}>
                  {ui("✗ ちがう ところ")}
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {latest.review.fix.map((line, i) => (
                    <li key={i}>
                      <RubyText text={line} index={aiIndex} show={show} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {latest.review.next !== "" && (
              <div>
                <p className="text-navy font-extrabold">{ui("👉 つぎに する こと")}</p>
                <p className="mt-1">
                  <RubyText text={latest.review.next} index={aiIndex} show={show} />
                </p>
              </div>
            )}
            <p className="text-ink-soft text-sm">{ui(VERDICT_NEXT[latest.review.verdict])}</p>
          </div>
        </div>
      )}

      <div className="border-hairline mt-5 border-t-2 pt-4" data-testid="ai-image-check-history">
        <h4 className="text-navy font-extrabold">
          <span aria-hidden className="mr-1.5">
            📒
          </span>
          {block.historyTitle ? (
            <RubyText text={block.historyTitle} index={furigana} show={show} />
          ) : (
            ui("これまでに 書いた もの")
          )}
        </h4>
        {entries === null && (
          <p className="text-ink-soft mt-2 text-sm font-bold">{ui("読みこんで います…")}</p>
        )}
        {entries === "error" && (
          <p className="mt-2 text-sm font-bold" style={{ color: "var(--color-coral-deep)" }}>
            {ui("前に 書いた ものを 読みこめませんでした。ページを 開き直して ください。")}
          </p>
        )}
        {Array.isArray(entries) && entries.length === 0 && (
          <p className="text-ink-soft mt-2 text-sm font-bold">
            {ui("まだ ありません。上で 書いて 押すと、ここに 出ます。")}
          </p>
        )}
        {Array.isArray(entries) && entries.length > 0 && (
          <ol className="mt-3 space-y-3">
            {entries.map((entry) => {
              const [siteField, reasonField, hanteiField, kotobaField] = fields;
              const verdict = verdictOfLabel(entry.answers[hanteiField!.id]);
              const kotoba = entry.answers[kotobaField!.id] ?? "";
              return (
                <li
                  key={entry.id}
                  data-testid="ai-image-check-entry"
                  className="border-hairline bg-panel rounded-xl border-2 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-ink-faint text-xs font-extrabold">{formatAt(entry.at)}</p>
                    {verdict ? (
                      <VerdictBadge verdict={verdict} ui={ui} />
                    ) : (
                      <span className="text-ink-soft text-xs font-extrabold">
                        {ui("AIは 見て いません")}
                      </span>
                    )}
                  </div>
                  {/*
                    学習者が 書いた 文と、AIが 書いた 文。読み辞書に ある 語には ふりがなが 付くが、
                    ぜんぶを 覆える わけでは ない（`data-furigana="off"` は e2e の 見張りへの 印）。
                  */}
                  <ul className="mt-1 space-y-1" data-furigana="off">
                    {[siteField!, reasonField!].map((field) =>
                      entry.answers[field.id] === undefined ? null : (
                        <li
                          key={field.id}
                          className="text-ink flex items-start gap-2 leading-relaxed font-bold"
                        >
                          <span className="shrink-0">{field.label}</span>
                          <span className="min-w-0 break-words">
                            <RubyText
                              text={entry.answers[field.id] ?? ""}
                              index={furigana}
                              show={show}
                            />
                          </span>
                        </li>
                      ),
                    )}
                    {kotoba !== "" && (
                      <li className="text-ink-soft min-w-0 text-sm leading-relaxed font-bold break-words">
                        <RubyText text={kotoba} index={aiIndex} show={show} />
                      </li>
                    )}
                  </ul>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
