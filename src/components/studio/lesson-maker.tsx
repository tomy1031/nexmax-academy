"use client";

/**
 * もんだい と よみもの を AIで つくる
 *
 * まんがの `MangaMaker` と同じ形にそろえてある（先生が1回覚えれば両方つかえる）:
 *   ① 何を つくるか を 1行 → ② AIが 作る → ③ 直して 保存
 *
 * まんがと違って**すじがきの段を 置いていない**。もんだいと よみものは
 * 話の筋が無く、出てきたものを その場で 直すほうが 早いため。
 * 段を増やすのは、増やした分だけ先生の待ちが増えるときだけにする。
 *
 * 生成したものは `onChange` で編集中の教材に流し込む。**保存はしない**——
 * 保存の関門（禁止語・ふりがな・国名）は「したがきを ほぞん」を押したときに通る。
 */

import { useState } from "react";
import type { Article, ArticleBlock, Content, QuizQuestion, QuizSet } from "@/content/schema";
import {
  ARTICLE_SCHEMA,
  buildArticlePrompt,
  buildLessonContext,
  buildQuizPrompt,
  quizSchemaFor,
} from "@/lib/lesson-prompt";
import { hasCodex } from "@/lib/codex-settings";
import { getGeminiKey } from "@/lib/profile";
import { generateStructured } from "./text-api";
import { MiniButton, NumberField, StudioSection, TextAreaField } from "./studio-ui";

/* ------------------------------------------------------------------ */
/* もんだい                                                             */
/* ------------------------------------------------------------------ */

export function QuizMaker({
  value,
  onChange,
  known = [],
}: {
  value: QuizSet;
  onChange: (set: QuizSet) => void;
  known?: readonly Content[];
}) {
  const [request, setRequest] = useState("");
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const make = async () => {
    if (!getGeminiKey() && !hasCodex()) {
      setError("AIが まだ つながっていません。「AI設定」で 合言葉か キーを 入れてください。");
      return;
    }
    if (request.trim().length === 0) {
      setError("何を たしかめる もんだいか を 書いてください。");
      return;
    }
    setBusy(true);
    setError(null);
    setNote(null);

    const made = await generateStructured<RawQuiz>({
      prompt: buildQuizPrompt({
        request: request.trim(),
        count,
        phase: value.phase,
        context: buildLessonContext(known),
      }),
      shape: JSON.stringify(quizSchemaFor(value.phase), null, 2),
      outputSchema: quizSchemaFor(value.phase),
      validate: validateQuiz,
      viaGemini: async () => ({
        ok: false,
        message: "もんだいづくりは Codex で 行います。「AI設定」で 合言葉を 入れてください。",
      }),
    });

    setBusy(false);
    if (!made.ok) {
      setError(made.message);
      return;
    }
    const questions = toQuestions(made.value, value.phase);
    if (questions.length === 0) {
      setError("つかえる もんだいが ありませんでした。書き方を 少し 変えて ためしてください。");
      return;
    }
    onChange({
      ...value,
      title: made.value.title || value.title,
      description: made.value.description || value.description,
      furigana: [...(value.furigana ?? []), ...toFurigana(made.value.furigana)],
      questions,
    });
    setNote(`${questions.length}問 入れました。中身を 見て 直してから 保存してください。`);
  };

  return (
    <StudioSection
      title="AIで つくる"
      hint="何を たしかめたいか を 1行 書くと、もんだいを 作ります。"
    >
      <TextAreaField
        label="やりたいこと（1〜3行）"
        value={request}
        onChange={setRequest}
        placeholder="朝会の 報告で「結論から 言う」が できているか たしかめたい。"
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <NumberField label="もんだいの 数" value={count} min={1} max={12} onChange={setCount} />
        </div>
        <MiniButton tone="accent" onClick={() => void make()} disabled={busy}>
          {busy ? "つくっています…" : "✍️ もんだいを つくる"}
        </MiniButton>
      </div>
      <p className="text-ink-faint text-xs font-bold">
        {value.phase === "production"
          ? "産出（じぶんで 言う）なので、えらぶ もんだいは 作りません。"
          : "読解確認なので、4択などの えらぶ もんだいも 作ります。"}
      </p>
      {note && <p className="text-navy text-xs font-black">{note}</p>}
      {error && <p className="text-xs font-black text-[#c2410c]">{error}</p>}
    </StudioSection>
  );
}

/* ------------------------------------------------------------------ */
/* よみもの                                                             */
/* ------------------------------------------------------------------ */

export function ArticleMaker({
  value,
  onChange,
  known = [],
}: {
  value: Article;
  onChange: (article: Article) => void;
  known?: readonly Content[];
}) {
  const [request, setRequest] = useState("");
  const [sections, setSections] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const make = async () => {
    if (!getGeminiKey() && !hasCodex()) {
      setError("AIが まだ つながっていません。「AI設定」で 合言葉か キーを 入れてください。");
      return;
    }
    if (request.trim().length === 0) {
      setError("どんな ことを つたえる よみものか を 書いてください。");
      return;
    }
    setBusy(true);
    setError(null);
    setNote(null);

    const made = await generateStructured<RawArticle>({
      prompt: buildArticlePrompt({
        request: request.trim(),
        sections,
        context: buildLessonContext(known),
      }),
      shape: JSON.stringify(ARTICLE_SCHEMA, null, 2),
      outputSchema: ARTICLE_SCHEMA,
      validate: validateArticle,
      viaGemini: async () => ({
        ok: false,
        message: "よみものづくりは Codex で 行います。「AI設定」で 合言葉を 入れてください。",
      }),
    });

    setBusy(false);
    if (!made.ok) {
      setError(made.message);
      return;
    }
    const blocks = toBlocks(made.value);
    if (blocks.length === 0) {
      setError("つかえる 中身が ありませんでした。書き方を 少し 変えて ためしてください。");
      return;
    }
    onChange({
      ...value,
      title: made.value.title || value.title,
      description: made.value.description || value.description,
      furigana: [...(value.furigana ?? []), ...toFurigana(made.value.furigana)],
      blocks,
    });
    setNote(
      `${blocks.length}この ブロックを 入れました。「つぎは これ」の 行き先は 先生が 足してください。`,
    );
  };

  return (
    <StudioSection title="AIで つくる" hint="つたえたい ことを 1行 書くと、よみものを 作ります。">
      <TextAreaField
        label="やりたいこと（1〜3行）"
        value={request}
        onChange={setRequest}
        placeholder="ほうれんそう（報告・連絡・相談）の ちがいと、どんな ときに どれを つかうか。"
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <NumberField
            label="見出しの 数"
            value={sections}
            min={1}
            max={8}
            onChange={setSections}
          />
        </div>
        <MiniButton tone="accent" onClick={() => void make()} disabled={busy}>
          {busy ? "つくっています…" : "✍️ よみものを つくる"}
        </MiniButton>
      </div>
      {note && <p className="text-navy text-xs font-black">{note}</p>}
      {error && <p className="text-xs font-black text-[#c2410c]">{error}</p>}
    </StudioSection>
  );
}

/* ------------------------------------------------------------------ */
/* AIの返事 → 教材                                                      */
/* ------------------------------------------------------------------ */

interface RawQuiz {
  title: string;
  description: string;
  furigana: unknown;
  questions: Record<string, unknown>[];
}

interface RawArticle {
  title: string;
  description: string;
  furigana: unknown;
  blocks: Record<string, unknown>[];
}

function validateQuiz(
  value: unknown,
): { ok: true; value: RawQuiz } | { ok: false; problem: string } {
  const raw = value as Record<string, unknown> | null;
  if (typeof raw !== "object" || raw === null)
    return { ok: false, problem: "JSONオブジェクトでは ありません" };
  if (typeof raw.title !== "string") return { ok: false, problem: "title が ありません" };
  if (!Array.isArray(raw.questions) || raw.questions.length === 0) {
    return { ok: false, problem: "questions が 空です" };
  }
  return { ok: true, value: raw as unknown as RawQuiz };
}

function validateArticle(
  value: unknown,
): { ok: true; value: RawArticle } | { ok: false; problem: string } {
  const raw = value as Record<string, unknown> | null;
  if (typeof raw !== "object" || raw === null)
    return { ok: false, problem: "JSONオブジェクトでは ありません" };
  if (typeof raw.title !== "string") return { ok: false, problem: "title が ありません" };
  if (!Array.isArray(raw.blocks) || raw.blocks.length === 0) {
    return { ok: false, problem: "blocks が 空です" };
  }
  return { ok: true, value: raw as unknown as RawArticle };
}

/** 読み辞書。[表記, よみ] の2つ組だけ通す。 */
function toFurigana(value: unknown): [string, string][] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) =>
    Array.isArray(entry) &&
    entry.length === 2 &&
    typeof entry[0] === "string" &&
    typeof entry[1] === "string"
      ? [[entry[0], entry[1]] as [string, string]]
      : [],
  );
}

/**
 * もんだいへ。**形の合わないものは落とす**（教材に半端なものを入れない）。
 *
 * 産出フェーズで選択式が返ってきたら、ここでも落とす。頼み文とスキーマで
 * 二重に止めているが、規律3 は破ると学習の中身が変わるので三重にする。
 */
function toQuestions(raw: RawQuiz, phase: "research" | "production"): QuizQuestion[] {
  const SELECTION = ["choose", "multi", "emotion"];
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

  return raw.questions.flatMap((raw, i): QuizQuestion[] => {
    const type = typeof raw.type === "string" ? raw.type : "";
    const q = typeof raw.q === "string" ? raw.q : "";
    const explain = typeof raw.explain === "string" ? raw.explain : "";
    if (q.length === 0 || explain.length === 0) return [];
    if (phase === "production" && SELECTION.includes(type)) return [];

    const common = { id: `q${i + 1}`, q, explain, points: 1 };
    const options = strings(raw.options);

    if (type === "choose" && options.length >= 2 && options.length <= 6) {
      // 番号は文字で返ってくることがある（JSON Schema の型より モデルの癖が勝つ）
      const answer = Number(raw.answer);
      if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) return [];
      return [{ ...common, type: "choose", options, answer }];
    }
    if (type === "multi" && options.length >= 3 && options.length <= 8) {
      const answers = (Array.isArray(raw.answers) ? raw.answers : [])
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n >= 0 && n < options.length);
      return answers.length >= 2 ? [{ ...common, type: "multi", options, answers }] : [];
    }
    if (type === "keyword" && typeof raw.answer === "string" && raw.answer.length > 0) {
      return [{ ...common, type: "keyword", answer: raw.answer, accept: strings(raw.accept) }];
    }
    if (type === "wordbank") {
      const lines = strings(raw.lines);
      const blanks = strings(raw.blanks);
      const bank = strings(raw.bank);
      if (lines.length === 0 || blanks.length === 0 || bank.length < 2) return [];
      return [{ ...common, type: "wordbank", lines, blanks, bank }];
    }
    // emotion は2段階の形が複雑で、AIが崩しやすい。落として先生に手で作ってもらう
    return [];
  });
}

/** よみものへ。`link` は作らせていないので、来ても落とす。 */
function toBlocks(raw: RawArticle): ArticleBlock[] {
  return raw.blocks.flatMap((b): ArticleBlock[] => {
    const kind = typeof b.kind === "string" ? b.kind : "";
    const text = typeof b.text === "string" ? b.text : "";
    const items = Array.isArray(b.items)
      ? b.items.filter((i): i is string => typeof i === "string")
      : [];

    if (kind === "heading" && text.length > 0) {
      return [{ kind: "heading", level: b.level === 3 ? 3 : 2, text }];
    }
    if (kind === "paragraph" && text.length > 0) return [{ kind: "paragraph", text }];
    if (kind === "callout" && text.length > 0) {
      return [{ kind: "callout", tone: b.tone === "care" ? "care" : "point", text }];
    }
    if (kind === "list" && items.length > 0) return [{ kind: "list", items }];
    if (kind === "steps" && items.length > 0) return [{ kind: "steps", items }];
    if (kind === "vocab" && Array.isArray(b.vocab)) {
      const vocab = b.vocab.flatMap((v) => {
        const item = v as Record<string, unknown>;
        return typeof item?.term === "string" &&
          typeof item?.reading === "string" &&
          typeof item?.meaning === "string"
          ? [{ term: item.term, reading: item.reading, meaning: item.meaning }]
          : [];
      });
      return vocab.length > 0 ? [{ kind: "vocab", items: vocab }] : [];
    }
    return [];
  });
}
