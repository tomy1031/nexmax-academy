"use client";

import { useId, useState } from "react";
import { NEXMAX_FAMILY } from "@/components/nexmax";
import { BLANK_MARK, type Content, type QuizQuestion, type QuizSet } from "@/content/schema";
import { emptyQuizQuestion } from "./drafts";
import { moveItem, removeAt, replaceAt } from "./list-ops";
import {
  CheckChoice,
  FuriganaEditor,
  MiniButton,
  NumberField,
  RadioChoice,
  RowTools,
  SelectField,
  StringListEditor,
  StudioSection,
  TextAreaField,
  TextField,
} from "./studio-ui";
import { QuizMaker } from "./lesson-maker";

/**
 * 問題セットのエディタ（設計07 §6）
 *
 * 5つの問題型を1つの画面で編集する。型ごとに「こたえの持ち方」が違う
 * （番号・番号の配列・文字列・語群）ので、こたえの指し先は選択肢と一緒に動かす。
 * ここを手抜きすると、選択肢を1つ消しただけで別のものがこたえになり、
 * 学習者はいくら正しく答えても先へ進めなくなる。
 */

/** 語群の穴埋めの問題（判定関数の入口を1つにするための別名）。 */
export type WordbankQuestion = Extract<QuizQuestion, { type: "wordbank" }>;

/** 選択で答える型。産出フェーズには置けない（AGENTS.md 規律3）。 */
const SELECTION_TYPES: readonly QuizQuestion["type"][] = ["choose", "multi", "emotion"];

function isSelectionType(type: QuizQuestion["type"]): boolean {
  return SELECTION_TYPES.includes(type);
}

/**
 * 文の中の空欄の数。
 *
 * 数え方は schema.ts の superRefine と同じにする（行をつないでから しるしで割る）。
 * 画面と保存で数え方がずれると「画面には何も出ていないのに保存できない」になり、
 * 先生は直す場所を探せなくなる。
 */
export function countBlanks(lines: readonly string[]): number {
  return lines.join("").split(BLANK_MARK).length - 1;
}

/**
 * 語群の穴埋めが問題として成り立っているかを、先生のことばで並べる。
 *
 * 見るのは保存時の検査と同じ3点（空欄の数・こたえが語群にあるか・にたことばがあるか）。
 * 保存を止めるのはAPI側の仕事で、ここは書いている途中に気づかせるだけ。
 */
export function describeWordbankIssues(question: WordbankQuestion): string[] {
  const notices: string[] = [];

  const marks = countBlanks(question.lines);
  if (marks !== question.blanks.length) {
    notices.push(
      `文の 空欄（${BLANK_MARK}）が ${marks}こ、こたえが ${question.blanks.length}こ です。数を そろえてください。`,
    );
  }

  const missing = question.blanks.filter((blank) => !question.bank.includes(blank));
  if (missing.length > 0) {
    notices.push(`こたえの「${missing.join("、")}」が 語群に ありません。語群に 足してください。`);
  }

  // 語群がこたえだけだと、読まなくても順に置くだけで解けてしまう。
  if (question.bank.length <= question.blanks.length) {
    notices.push("語群が こたえだけです。にた ことばを 足すと もんだいに なります。");
  }

  return notices;
}

/**
 * 型ごとの「まだ足りないもの」。保存を止めるのではなく、書いている途中に見せる。
 * 語群の穴埋めは判定が細かいので describeWordbankIssues に任せる。
 */
export function describeQuestionIssues(question: QuizQuestion): string[] {
  switch (question.type) {
    case "choose": {
      const notices: string[] = [];
      if (question.options.length < 2) notices.push("えらぶものを 2つ以上 書いてください。");
      if (question.answer >= question.options.length) {
        notices.push("こたえに した えらぶものが ありません。もう一度 えらんでください。");
      }
      return notices;
    }

    case "multi": {
      const notices: string[] = [];
      if (question.options.length < 3) notices.push("えらぶものを 3つ以上 書いてください。");
      if (question.answers.length < 2) notices.push("こたえを 2つ以上 えらんでください。");
      if (question.options.length > 0 && question.answers.length >= question.options.length) {
        notices.push("ぜんぶが こたえです。こたえでない ものを 1つ のこしてください。");
      }
      return notices;
    }

    case "keyword":
      return question.answer.trim().length === 0 ? ["こたえの ことばを 書いてください。"] : [];

    case "wordbank":
      return describeWordbankIssues(question);

    case "emotion": {
      const notices: string[] = [];
      if (question.feelings.length < 3) notices.push("気もちを 3つ以上 書いてください。");
      if (question.replyQ.trim().length === 0) notices.push("2つめの といを 書いてください。");
      if (question.replies.length < 3) notices.push("言い方を 3つ以上 書いてください。");
      return notices;
    }

    /*
     * 自由記述に「足りない もの」は 無い。正解を 書く 欄が そもそも 無いので、
     * 先生が うっかり 空の まま 公開する、と いう 事故が 起きない。
     */
    case "free":
      return [];
  }
}

/**
 * 選択肢を上下に動かしたあとの、こたえの位置。
 *
 * 並べ替えでこたえが付いてこないと、先生は気づかないまま
 * 「こたえの ちがう もんだい」を公開してしまう。moveItem と同じ規則で追いかける。
 */
export function answerIndexAfterMove(
  answer: number,
  index: number,
  delta: number,
  count: number,
): number {
  const to = index + delta;
  // 端をこえる指定では moveItem 側も動かないので、こたえも動かさない。
  if (index < 0 || index >= count || to < 0 || to >= count) return answer;
  if (answer === index) return to;
  if (answer === to) return index;
  return answer;
}

/**
 * 選択肢を消したあとの、こたえの位置。
 * 消した位置より後ろは1つ前へ詰まる。こたえそのものを消したときは先頭に戻す
 * （どれも指していない番号が残ると、そのまま保存の検査で止まる）。
 */
export function answerIndexAfterRemove(answer: number, index: number): number {
  if (answer === index) return 0;
  return answer > index ? answer - 1 : answer;
}

/** 複数のこたえ（番号の配列）を、選択肢を動かしたあとの並びに合わせ直す。 */
export function answersAfterMove(
  answers: readonly number[],
  index: number,
  delta: number,
  count: number,
): number[] {
  return sortNumbers(answers.map((answer) => answerIndexAfterMove(answer, index, delta, count)));
}

/** 複数のこたえを、選択肢を消したあとの並びに合わせ直す（消した番号は落とす）。 */
export function answersAfterRemove(answers: readonly number[], index: number): number[] {
  return sortNumbers(
    answers
      .filter((answer) => answer !== index)
      .map((answer) => (answer > index ? answer - 1 : answer)),
  );
}

function sortNumbers(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

/** 追加する問題のID。空のままだと2問目で「IDが重なっている」になり、先生は理由が分からない。 */
function nextQuestionId(questions: readonly QuizQuestion[]): string {
  const used = new Set(questions.map((question) => question.id));
  let n = questions.length + 1;
  while (used.has(`q${n}`)) n += 1;
  return `q${n}`;
}

const QUIZ_TYPE_OPTIONS: readonly { value: QuizQuestion["type"]; label: string }[] = [
  { value: "choose", label: "4たく（1つ えらぶ）" },
  { value: "multi", label: "ぜんぶ えらぶ（2つ以上）" },
  { value: "keyword", label: "じぶんで 書く" },
  { value: "wordbank", label: "語群から あなうめ" },
  { value: "emotion", label: "気もち → 言い方" },
  // 正解が 無い 問い（「なぜ そう 思いましたか」）。書けば 点が 入る
  { value: "free", label: "じゆうに 書く（正解なし）" },
];

const PHASE_OPTIONS: readonly { value: QuizSet["phase"]; label: string }[] = [
  { value: "research", label: "読みとりの かくにん" },
  { value: "production", label: "じぶんで 日本語を 出す" },
];

/**
 * こたえの 出しかた。**学習者には 選ばせない**——同じ 教材を 同じ 条件で 受けさせるため、
 * 決めるのは 先生（2026-08-19 指定）。既定は「まとめて 出す」。
 */
const ANSWER_MODE_OPTIONS: readonly { value: QuizSet["answerMode"]; label: string }[] = [
  { value: "submit", label: "まとめて 出す（テストの やりかた）" },
  { value: "all", label: "ぜんぶ 1ページに 出す（教材と 行き来しながら 書く）" },
  { value: "one", label: "1問ずつ こたえあわせ" },
];

/** 担当キャラの選択肢は正典（nexmax.tsx）から作る。名前をここに書き写すとズレる。 */
const NEKUMAX_OPTIONS: readonly { value: QuizSet["nekumax"]; label: string }[] = NEXMAX_FAMILY.map(
  (meta) => ({ value: meta.id, label: meta.plainLabel }),
);

function typeLabel(type: QuizQuestion["type"]): string {
  return QUIZ_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

export function QuizEditor({
  value,
  onChange,
  known = [],
}: {
  value: QuizSet;
  onChange: (set: QuizSet) => void;
  /** すでに作った教材。AIに「習った ことば」を踏まえさせるために渡す。 */
  known?: readonly Content[];
}) {
  const [addType, setAddType] = useState<QuizQuestion["type"]>("choose");

  const patch = (part: Partial<QuizSet>) => onChange({ ...value, ...part });

  const production = value.phase === "production";
  const typeOptions = production
    ? QUIZ_TYPE_OPTIONS.filter((option) => !isSelectionType(option.value))
    : QUIZ_TYPE_OPTIONS;
  // 産出フェーズに切り替えた瞬間、選ぼうとしていた型が消えることがある。
  // その場合は書く型に寄せる（描画のたびに state を書き換えないため、ここで読み替える）。
  const pickedType = production && isSelectionType(addType) ? "keyword" : addType;

  const selectionCount = value.questions.filter((question) =>
    isSelectionType(question.type),
  ).length;
  const phaseNotices =
    production && selectionCount > 0
      ? [
          `いまは「じぶんで 日本語を 出す」フェーズです。えらぶ もんだいが ${selectionCount}問 のこっています。フェーズを もどすか、書く もんだいに 変えてください。`,
        ]
      : [];

  const addQuestion = () => {
    const draft = emptyQuizQuestion(pickedType);
    draft.id = nextQuestionId(value.questions);
    patch({ questions: [...value.questions, draft] });
  };

  return (
    <div className="space-y-4">
      <QuizMaker value={value} onChange={onChange} known={known} />

      <StudioSection title="きほん" hint="学習者の画面に出る 名前と、ごうかくの ラインです。">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="ID（半角の英小文字・数字・- _）"
            value={value.id}
            onChange={(id) => patch({ id })}
            placeholder="m7-quiz"
            hint="あとから変えると 進捗の記録が つながらなくなります。"
          />
          <TextField
            label="タイトル"
            value={value.title}
            onChange={(title) => patch({ title })}
            placeholder="トラブルの ほうこく（たしかめ）"
          />
        </div>
        <TextAreaField
          label="せつめい"
          value={value.description}
          onChange={(description) => patch({ description })}
          placeholder="まんがで 読んだ ことばを たしかめます。"
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            label="たんとうの ネクマックス"
            value={value.nekumax}
            options={NEKUMAX_OPTIONS}
            onChange={(nekumax) => patch({ nekumax })}
          />
          <SelectField
            label="フェーズ"
            value={value.phase}
            options={PHASE_OPTIONS}
            onChange={(phase) => patch({ phase })}
            hint="「じぶんで 日本語を 出す」では えらぶ もんだいを 置けません。"
          />
          <NumberField
            label="ごうかくの ライン（%）"
            value={value.passRate}
            min={1}
            max={100}
            onChange={(passRate) => patch({ passRate })}
          />
        </div>
        <SelectField
          label="こたえの 出しかた"
          value={value.answerMode}
          options={ANSWER_MODE_OPTIONS}
          onChange={(answerMode) => patch({ answerMode })}
          hint="「まとめて 出す」は ぜんぶ 書いてから 1回で 採点します（途中で 正解は 見せず、「こたえを 見る」も 出ません）。「1問ずつ」は こたえるたびに せつめいを 読みます。"
        />
        {/*
          **ぜんぶ うめるまで 出せなく する**（schema.ts の `requireAll`）。
          立ててよいのは 調べれば 必ず 答えが 見つかる 教材だけ——考えを 書く 教材で
          立てると、書けない 1問が 出口を ふさぐ。だから 既定は オフの ままに する。
        */}
        <label className="text-ink flex items-start gap-2 text-xs font-black">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={value.requireAll}
            disabled={value.answerMode === "one"}
            onChange={(event) => patch({ requireAll: event.target.checked })}
          />
          <span>
            ぜんぶ うめるまで「こたえを 出す」を 出さない
            <span className="text-ink-faint block font-bold">
              {value.answerMode === "one"
                ? "「1問ずつ」では 使えません（1問 ごとに 採点するため）。"
                : "調べれば 必ず 見つかる 教材だけに します。考えを 書く 教材では 外して ください。"}
            </span>
          </span>
        </label>
        <NoticeList notices={phaseNotices} />
      </StudioSection>

      <StudioSection title="もんだい" hint="この並びが そのまま 出る順番です。">
        <div className="space-y-3">
          {value.questions.map((question, index) => (
            <QuestionCard
              key={index}
              question={question}
              index={index}
              count={value.questions.length}
              typeOptions={typeOptions}
              onChange={(next) => patch({ questions: replaceAt(value.questions, index, next) })}
              onMove={(delta) => patch({ questions: moveItem(value.questions, index, delta) })}
              onRemove={() => patch({ questions: removeAt(value.questions, index) })}
            />
          ))}
        </div>

        {value.questions.length === 0 ? (
          <p className="text-ink-faint text-xs font-bold">
            まだ ありません。下から 追加してください。
          </p>
        ) : null}

        <div className="bg-panel-tint flex flex-wrap items-end gap-2 rounded-2xl p-3">
          <div className="w-60">
            <SelectField
              label="追加する もんだいの 型"
              value={pickedType}
              options={typeOptions}
              onChange={setAddType}
            />
          </div>
          <MiniButton tone="accent" onClick={addQuestion}>
            ＋ もんだいを 追加
          </MiniButton>
        </div>
      </StudioSection>

      <FuriganaEditor
        entries={value.furigana ?? []}
        onChange={(furigana) => onChange({ ...value, furigana })}
        emptyNote="まだ ありません（なくても もんだいは 出ます）。"
        content={value}
      />
    </div>
  );
}

/**
 * 入力中の気づき。ここでは保存を止めない（作りかけを保存できるほうが先生には楽 — 設計07 §2）。
 * それでも枠を赤にするのは、公開を押す前に目に入る場所に置きたいから。
 */
function NoticeList({ notices }: { notices: readonly string[] }) {
  if (notices.length === 0) return null;
  return (
    <ul
      className="space-y-1 rounded-xl border-2 bg-white px-3 py-2"
      style={{ borderColor: "var(--color-coral)" }}
    >
      {notices.map((notice, index) => (
        <li key={index} className="text-coral-deep text-xs font-black">
          {notice}
        </li>
      ))}
    </ul>
  );
}

function QuestionCard({
  question,
  index,
  count,
  typeOptions,
  onChange,
  onMove,
  onRemove,
}: {
  question: QuizQuestion;
  index: number;
  count: number;
  typeOptions: readonly { value: QuizQuestion["type"]; label: string }[];
  onChange: (question: QuizQuestion) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const groupName = useId();

  /**
   * 型を変えると こたえの持ち方が変わるので、こたえだけ作り直す。
   * 書いた とい・かいせつ・てん は引き継ぐ（消えると 先生は 入力し直しになる）。
   */
  const changeType = (type: QuizQuestion["type"]) => {
    if (type === question.type) return;
    const draft = emptyQuizQuestion(type);
    draft.id = question.id;
    draft.q = question.q;
    draft.explain = question.explain;
    draft.points = question.points;
    onChange(draft);
  };

  // いま使えない型（産出フェーズの選択式）でも、既にある問題は選び先として残す。
  // 消えると select が空になり、先生には「壊れた」ようにしか見えない。
  const options = typeOptions.some((option) => option.value === question.type)
    ? typeOptions
    : [
        ...typeOptions,
        {
          value: question.type,
          label: `${typeLabel(question.type)}（このフェーズでは 使えません）`,
        },
      ];

  return (
    <article className="border-hairline bg-panel rounded-2xl border-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-navy text-sm font-black">
          {index + 1}. {typeLabel(question.type)}
        </p>
        <RowTools
          index={index}
          count={count}
          label="もんだい"
          onMove={onMove}
          onRemove={onRemove}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <TextField
          label="ID"
          value={question.id}
          onChange={(id) => onChange({ ...question, id })}
          placeholder="q1"
        />
        <SelectField label="型" value={question.type} options={options} onChange={changeType} />
        <NumberField
          label="てん"
          value={question.points}
          min={1}
          onChange={(points) => onChange({ ...question, points })}
        />
      </div>

      <div className="mt-3 space-y-3">
        <TextAreaField
          label="とい"
          rows={2}
          value={question.q}
          onChange={(q) => onChange({ ...question, q })}
        />

        <QuestionBody question={question} groupName={groupName} onChange={onChange} />

        <TextAreaField
          label="かいせつ（こたえの あとに かならず 読ませる）"
          rows={2}
          value={question.explain}
          onChange={(explain) => onChange({ ...question, explain })}
          hint="できても できなくても 読ませる文です。しごとの どこで つかうかを 書きます。"
        />
      </div>

      <div className="mt-3">
        <NoticeList notices={describeQuestionIssues(question)} />
      </div>
    </article>
  );
}

function QuestionBody({
  question,
  groupName,
  onChange,
}: {
  question: QuizQuestion;
  groupName: string;
  onChange: (question: QuizQuestion) => void;
}) {
  switch (question.type) {
    case "choose":
      return (
        <SingleAnswerOptions
          label="えらぶもの"
          groupName={groupName}
          options={question.options}
          answer={question.answer}
          max={6}
          addLabel="＋ えらぶものを 追加"
          onChange={(next) => onChange({ ...question, options: next.options, answer: next.answer })}
        />
      );

    case "multi":
      return (
        <MultiAnswerOptions
          options={question.options}
          answers={question.answers}
          max={8}
          onChange={(next) =>
            onChange({ ...question, options: next.options, answers: next.answers })
          }
        />
      );

    case "keyword":
      return (
        <div className="space-y-3">
          <TextField
            label="こたえ"
            value={question.answer}
            onChange={(answer) => onChange({ ...question, answer })}
            placeholder="かくにん します"
            hint="漢字・かなの ゆれは アプリが 吸収します。ここには 書きません。"
          />
          <StringListEditor
            label="べつの 言い方（なくても よい）"
            items={question.accept}
            itemLabel="言い方"
            addLabel="＋ べつの 言い方を 追加"
            onChange={(accept) => onChange({ ...question, accept })}
          />
        </div>
      );

    case "wordbank":
      return (
        <div className="space-y-3">
          <StringListEditor
            label={`文（空欄は ${BLANK_MARK} と 書く）`}
            items={question.lines}
            itemLabel="文"
            placeholder={`きのう ${BLANK_MARK} を おくりました。`}
            addLabel="＋ 文を 追加"
            onChange={(lines) => onChange({ ...question, lines })}
          />
          <p className="text-ink-soft text-xs font-bold">
            文の 空欄 {countBlanks(question.lines)}こ ／ こたえ {question.blanks.length}こ ／ 語群{" "}
            {question.bank.length}こ
          </p>
          <StringListEditor
            label="空欄の こたえ（出てくる 順）"
            items={question.blanks}
            itemLabel="こたえ"
            addLabel="＋ こたえを 追加"
            onChange={(blanks) => onChange({ ...question, blanks })}
          />
          <StringListEditor
            label="語群（こたえ ＋ にた ことば）"
            items={question.bank}
            itemLabel="ことば"
            addLabel="＋ ことばを 追加"
            onChange={(bank) => onChange({ ...question, bank })}
          />
        </div>
      );

    case "emotion":
      return (
        <div className="space-y-3">
          <SingleAnswerOptions
            label="気もち"
            groupName={`${groupName}-feeling`}
            options={question.feelings}
            answer={question.answerFeeling}
            max={5}
            addLabel="＋ 気もちを 追加"
            onChange={(next) =>
              onChange({ ...question, feelings: next.options, answerFeeling: next.answer })
            }
          />
          <TextAreaField
            label="2つめの とい（その とき なんと 言う？）"
            rows={2}
            value={question.replyQ}
            onChange={(replyQ) => onChange({ ...question, replyQ })}
          />
          <SingleAnswerOptions
            label="言い方"
            groupName={`${groupName}-reply`}
            options={question.replies}
            answer={question.answerReply}
            max={5}
            addLabel="＋ 言い方を 追加"
            onChange={(next) =>
              onChange({ ...question, replies: next.options, answerReply: next.answer })
            }
          />
        </div>
      );
  }
}

/** 1つだけ こたえを えらぶ形（4たく・気もち・言い方）。 */
function SingleAnswerOptions({
  label,
  groupName,
  options,
  answer,
  max,
  addLabel,
  onChange,
}: {
  label: string;
  groupName: string;
  options: readonly string[];
  answer: number;
  max: number;
  addLabel: string;
  onChange: (next: { options: string[]; answer: number }) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-ink text-xs font-black">{label}（まるを つけた ものが こたえ）</p>
      {options.map((option, index) => (
        <div
          key={index}
          className="border-hairline flex flex-wrap items-end gap-2 rounded-xl border-2 bg-white p-2"
        >
          <div className="min-w-[10rem] flex-1">
            <TextField
              label={`${label} ${index + 1}`}
              value={option}
              onChange={(text) => onChange({ options: replaceAt(options, index, text), answer })}
            />
          </div>
          <div className="pb-2">
            <RadioChoice
              name={groupName}
              label="こたえ"
              checked={answer === index}
              onSelect={() => onChange({ options: [...options], answer: index })}
            />
          </div>
          <RowTools
            index={index}
            count={options.length}
            label={label}
            onMove={(delta) =>
              onChange({
                options: moveItem(options, index, delta),
                answer: answerIndexAfterMove(answer, index, delta, options.length),
              })
            }
            onRemove={() =>
              onChange({
                options: removeAt(options, index),
                answer: answerIndexAfterRemove(answer, index),
              })
            }
          />
        </div>
      ))}
      <MiniButton
        tone="accent"
        disabled={options.length >= max}
        onClick={() => onChange({ options: [...options, ""], answer })}
      >
        {addLabel}
      </MiniButton>
    </div>
  );
}

/** いくつも こたえを えらぶ形（ぜんぶ えらぶ）。 */
function MultiAnswerOptions({
  options,
  answers,
  max,
  onChange,
}: {
  options: readonly string[];
  answers: readonly number[];
  max: number;
  onChange: (next: { options: string[]; answers: number[] }) => void;
}) {
  const toggle = (index: number, checked: boolean) => {
    const next = checked
      ? sortNumbers([...answers, index])
      : answers.filter((answer) => answer !== index);
    onChange({ options: [...options], answers: [...next] });
  };

  return (
    <div className="space-y-2">
      <p className="text-ink text-xs font-black">えらぶもの（チェックを つけた ものが こたえ）</p>
      {options.map((option, index) => (
        <div
          key={index}
          className="border-hairline flex flex-wrap items-end gap-2 rounded-xl border-2 bg-white p-2"
        >
          <div className="min-w-[10rem] flex-1">
            <TextField
              label={`えらぶもの ${index + 1}`}
              value={option}
              onChange={(text) =>
                onChange({ options: replaceAt(options, index, text), answers: [...answers] })
              }
            />
          </div>
          <div className="pb-2">
            <CheckChoice
              label="こたえ"
              checked={answers.includes(index)}
              onToggle={(checked) => toggle(index, checked)}
            />
          </div>
          <RowTools
            index={index}
            count={options.length}
            label="えらぶもの"
            onMove={(delta) =>
              onChange({
                options: moveItem(options, index, delta),
                answers: answersAfterMove(answers, index, delta, options.length),
              })
            }
            onRemove={() =>
              onChange({
                options: removeAt(options, index),
                answers: answersAfterRemove(answers, index),
              })
            }
          />
        </div>
      ))}
      <MiniButton
        tone="accent"
        disabled={options.length >= max}
        onClick={() => onChange({ options: [...options, ""], answers: [...answers] })}
      >
        ＋ えらぶものを 追加
      </MiniButton>
    </div>
  );
}
