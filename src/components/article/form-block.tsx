"use client";

import { useEffect, useMemo, useState } from "react";
import { RubyText } from "@/components/ruby-text";
import { DictionaryText } from "@/components/dictionary-text";
import {
  checkFormInput,
  composeFormAnswers,
  formPrompt,
  parseFormTemplate,
  type FieldInput,
  type FieldProblem,
  type FormBlock as FormBlockData,
  type FormEntry,
} from "@/lib/answers/form-answers";
import { loadFormEntries, MAX_FORM_TEXT, saveFormAnswers } from "@/lib/answers/form-answers-db";
import { buildFuriganaIndex, type FuriganaIndex } from "@/lib/text/furigana";

/**
 * 書きこみフォーム（記事の `form` ブロック）
 *
 * 型の 空いた ところに 書いて「保存する」。保存した ものは **すぐ 下に 新しい 順で 出る**
 *（2026-10-07 の 指定「一度入れたものは入力フォームの下に本人が参照できるように」）。
 * 先生は 学習の きろく で 読む（保存の 決まりは `src/lib/answers/form-answers-db.ts`）。
 *
 * ## 判定は しない
 * 正解の 無い 練習（絵の「ポイント」）なので、見るのは 空いて いる 欄と ％の 形だけ。
 * そこは **はっきり 言う**（どの 欄の 何が 足りないか）——ぼかして 保存させると、
 * 型の 欠けた 朝礼が 先生の 表に 並ぶ（規律1）。
 *
 * ## `<form>` を 使わない
 * 欄の 中で Enter を 押すと、ブラウザが 勝手に 送る。日本語入力の **確定の Enter** で
 * 書きかけの まま 保存される ことに なる。保存は ボタンを 押した ときだけ。
 */

/** 画面の ことばの 読み（教材の 読み辞書には 無い 語だけ）。 */
const UI_FURIGANA = buildFuriganaIndex([
  ["保存", "ほぞん"],
  ["空", "あ"],
  ["書", "か"],
  ["数字", "すうじ"],
  ["下", "した"],
  ["上", "うえ"],
  ["出", "で"],
  ["一度", "いちど"],
  ["押", "お"],
  ["読", "よ"],
  ["前", "まえ"],
  ["開", "ひら"],
  ["直", "なお"],
]);

/** 欄の 札の 色（いただいた 絵の ①〜④ と そろえる: 桃・青・緑・橙）。 */
const FIELD_COLORS = [
  "var(--color-coral-deep)",
  "var(--color-sky)",
  "var(--color-leaf-deep)",
  "var(--color-sun-deep)",
];

const PROBLEM_TEXT: Record<FieldProblem, string> = {
  empty: "空いて いる ところに 書いて ください。",
  percent: "％は 0から 100までの 数字で 書いて ください。",
};

type Status = "idle" | "saving" | "saved" | "failed";

function emptyInputs(block: FormBlockData): Record<string, FieldInput> {
  return Object.fromEntries(
    block.fields.map((field) => [
      field.id,
      {
        values: parseFormTemplate(field.template)
          .filter((part) => part.kind === "blank")
          .map(() => ""),
        none: false,
      },
    ]),
  );
}

/** 「10/7 14:05」。漢字の 日付（「7日」）は 読みが 1つに 決まらない ので 使わない。 */
function formatAt(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function FormBlock({
  block,
  articleId,
  furigana,
  show,
  preview,
}: {
  block: FormBlockData;
  articleId: string;
  furigana: FuriganaIndex;
  show: boolean;
  /** スタジオの プレビュー。保存も 読みこみも しない。 */
  preview: boolean;
}) {
  const [inputs, setInputs] = useState<Record<string, FieldInput>>(() => emptyInputs(block));
  const [problems, setProblems] = useState<Record<string, FieldProblem>>({});
  const [status, setStatus] = useState<Status>("idle");
  /** null ＝ 読みこみ中、"error" ＝ 読めなかった。 */
  const [entries, setEntries] = useState<FormEntry[] | null | "error">(preview ? [] : null);
  const fieldsKey = useMemo(() => block.fields.map((field) => field.id).join(","), [block.fields]);

  useEffect(() => {
    if (preview) return;
    let alive = true;
    void loadFormEntries(articleId, block.fields).then((loaded) => {
      if (alive) setEntries(loaded ?? "error");
    });
    return () => {
      alive = false;
    };
    // 欄の 並びが 変わった ときだけ 読み直す（配列の 作り直しでは 読まない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId, fieldsKey, preview]);

  const update = (fieldId: string, next: Partial<FieldInput>) => {
    setInputs((current) => {
      const before = current[fieldId] ?? { values: [], none: false };
      return { ...current, [fieldId]: { ...before, ...next } };
    });
    setProblems((current) => {
      if (!(fieldId in current)) return current;
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
    if (status === "saved" || status === "failed") setStatus("idle");
  };

  const submit = async () => {
    if (preview || status === "saving") return;
    const found = checkFormInput(block.fields, inputs);
    setProblems(found);
    if (Object.keys(found).length > 0) {
      setStatus("idle");
      return;
    }
    setStatus("saving");
    const result = await saveFormAnswers({
      articleId,
      fields: block.fields,
      answers: composeFormAnswers(block.fields, inputs),
    });
    if (!result.ok) {
      setStatus("failed");
      return;
    }
    setStatus("saved");
    setInputs(emptyInputs(block));
    setEntries((current) => [result.entry, ...(Array.isArray(current) ? current : [])]);
  };

  const ui = (text: string) => <RubyText text={text} index={UI_FURIGANA} show={show} />;

  return (
    <section
      data-testid="article-form"
      className="border-hairline bg-panel-tint rounded-[var(--radius-card)] border-2 p-4 sm:p-5"
    >
      {block.title && (
        <h3 className="text-navy text-lg font-extrabold">
          <span aria-hidden className="mr-1.5">
            ✏️
          </span>
          <DictionaryText text={block.title} index={furigana} show={show} />
        </h3>
      )}

      <div className="mt-3 space-y-3">
        {block.fields.map((field, i) => {
          const input = inputs[field.id] ?? { values: [], none: false };
          const problem = problems[field.id];
          const color = FIELD_COLORS[i % FIELD_COLORS.length];
          // 欄の 番号（型の 中で 何番目の 書く ところか）を 先に 振る
          const parts = parseFormTemplate(field.template);
          const blankAt = parts.map(
            (_, k) => parts.slice(0, k).filter((p) => p.kind === "blank").length,
          );
          return (
            <div
              key={field.id}
              data-testid={`form-field-${field.id}`}
              className="bg-panel rounded-[18px] border-2 p-3 sm:p-4"
              style={{
                borderColor: problem ? "var(--color-danger)" : "var(--color-hairline)",
                boxShadow: "0 4px 0 #e6f2f9",
              }}
            >
              <div className="flex items-center gap-2">
                {field.label && (
                  <span
                    className="grid h-7 min-w-7 place-items-center rounded-full px-1.5 text-sm font-black text-white"
                    style={{ background: color }}
                  >
                    <RubyText text={field.label} index={furigana} show={show} />
                  </span>
                )}
                <span className="text-navy font-extrabold">
                  <RubyText text={field.title} index={furigana} show={show} />
                </span>
              </div>

              <div
                className={`text-ink mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-2 text-base leading-loose font-bold ${
                  input.none ? "opacity-40" : ""
                }`}
              >
                {parts.map((part, k) => {
                  if (part.kind === "text") {
                    return (
                      <span key={k}>
                        <RubyText text={part.text} index={furigana} show={show} />
                      </span>
                    );
                  }
                  const at = blankAt[k] ?? 0;
                  const value = input.values[at] ?? "";
                  const empty = problem === "empty" && value.trim() === "";
                  const wrongNumber = problem === "percent" && part.numeric;
                  return (
                    <input
                      key={k}
                      type="text"
                      inputMode={part.numeric ? "numeric" : "text"}
                      maxLength={part.numeric ? 3 : MAX_FORM_TEXT}
                      value={value}
                      disabled={input.none}
                      aria-label={`${formPrompt(field)}（${at + 1}つめの 書く ところ）`}
                      aria-invalid={empty || wrongNumber}
                      onChange={(event) => {
                        const values = [...input.values];
                        values[at] = event.target.value;
                        update(field.id, { values });
                      }}
                      className={`rounded-lg border-2 bg-white px-2 py-1 text-base font-bold ${
                        part.numeric ? "w-16 text-center" : "min-w-[9rem] flex-1"
                      }`}
                      style={{
                        borderColor:
                          empty || wrongNumber ? "var(--color-danger)" : "var(--color-hairline)",
                      }}
                    />
                  );
                })}
              </div>

              {field.none && (
                <label className="text-ink-soft mt-2 flex w-max cursor-pointer items-center gap-2 text-sm font-extrabold">
                  <input
                    type="checkbox"
                    checked={input.none}
                    onChange={(event) => update(field.id, { none: event.target.checked })}
                    className="h-4 w-4"
                  />
                  <RubyText text={field.none} index={furigana} show={show} />
                </label>
              )}

              {problem && (
                <p
                  role="alert"
                  className="mt-2 text-sm font-extrabold"
                  style={{ color: "var(--color-coral-deep)" }}
                >
                  {field.label ? `${field.label} ` : ""}
                  {ui(PROBLEM_TEXT[problem])}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          // 名前は ルビ前の 字で（ルビが 入ると 読み上げが「保存ほぞんする」に なる）
          aria-label={status === "saving" ? "保存して います" : "保存する"}
          onClick={() => void submit()}
          disabled={preview || status === "saving"}
          className="bg-sky rounded-full px-6 py-2.5 font-extrabold text-white disabled:opacity-50"
          style={{ boxShadow: "0 4px 0 var(--color-sky-deep)" }}
        >
          {status === "saving" ? ui("保存して います…") : ui("保存する")}
        </button>
        <p aria-live="polite" className="text-sm font-extrabold">
          {status === "saved" && (
            <span className="text-leaf-deep">{ui("✅ 保存しました。下に 出て います。")}</span>
          )}
          {status === "failed" && (
            <span style={{ color: "var(--color-coral-deep)" }}>
              {ui("保存できませんでした。もう一度「保存する」を 押して ください。")}
            </span>
          )}
          {preview && <span className="text-ink-soft">{ui("プレビューでは 保存しません")}</span>}
        </p>
      </div>

      <div className="border-hairline mt-5 border-t-2 pt-4" data-testid="article-form-history">
        <h4 className="text-navy font-extrabold">
          <span aria-hidden className="mr-1.5">
            📒
          </span>
          {block.historyTitle ? (
            <RubyText text={block.historyTitle} index={furigana} show={show} />
          ) : (
            ui("あなたが 書いた もの")
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
            {ui("まだ ありません。上で 書いて 保存すると、ここに 出ます。")}
          </p>
        )}
        {Array.isArray(entries) && entries.length > 0 && (
          <ol className="mt-3 space-y-3">
            {entries.map((entry) => (
              <li
                key={entry.id}
                data-testid="article-form-entry"
                className="border-hairline bg-panel rounded-xl border-2 p-3"
              >
                <p className="text-ink-faint text-xs font-extrabold">{formatAt(entry.at)}</p>
                {/*
                  学習者が 自分で 書いた 文。読み辞書に ある 語には ふりがなが 付くが、
                  書いた 漢字 ぜんぶを 覆える わけでは ない（`data-furigana="off"` は
                  e2e の 裸の 漢字の 見張りに「わざと」を 知らせる 印）。
                */}
                <ul className="mt-1 space-y-1" data-furigana="off">
                  {block.fields.map((field) =>
                    entry.answers[field.id] === undefined ? null : (
                      <li
                        key={field.id}
                        className="text-ink flex items-start gap-2 leading-relaxed font-bold"
                      >
                        {field.label && <span className="shrink-0">{field.label}</span>}
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
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
