"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import type {
  PersonalityAnswer,
  PersonalityScores,
  PersonalityTypeId,
} from "@/content/personality";
import type {
  AxisAverages,
  QuestionStats,
  SampleMode,
  TypeDistribution,
} from "@/lib/personality-stats";

export const TYPE_COLORS: Record<PersonalityTypeId, string> = {
  leader: "#0272ae",
  idea: "#1f7a4d",
  heart: "#f27bb0",
  challenge: "#d99000",
};

export const ANSWER_COLORS: Record<PersonalityAnswer, string> = {
  yes: "#1f7a4d",
  neutral: "#9db0c2",
  no: "#c9552f",
};

export const TYPE_LABELS: Record<PersonalityTypeId, string> = {
  leader: "リーダー",
  idea: "ひらめき",
  heart: "きづかい",
  challenge: "チャレンジ",
};

export const ANSWER_LABELS: Record<PersonalityAnswer, string> = {
  yes: "はい",
  neutral: "どちらでもない",
  no: "いいえ",
};

export const EMPTY_MESSAGE = "まだ回答がありません。学生が診断を終えると、ここに傾向が出ます。";

export function AdminHeader({ onCsv }: { onCsv?: () => void }) {
  const pathname = usePathname();
  const itemClass = (active: boolean) =>
    `rounded-full px-4 py-2 text-sm font-bold transition ${
      active ? "bg-navy text-white" : "text-ink hover:bg-sky-soft"
    }`;

  return (
    <header className="card-pop mx-auto mb-6 flex max-w-[96rem] flex-wrap items-center justify-between gap-4 px-5 py-4">
      <div>
        <p className="text-navy text-lg font-black">Nexmax Academy</p>
        <p className="text-ink-soft text-xs font-bold">管理者メニュー</p>
      </div>
      <nav aria-label="管理者メニュー" className="flex flex-wrap items-center gap-2">
        <Link href="/admin" className={itemClass(pathname === "/admin")}>
          ダッシュボード
        </Link>
        <Link
          href="/admin/users"
          className={itemClass(
            pathname.startsWith("/admin/users") || pathname.startsWith("/admin/students"),
          )}
        >
          ユーザー
        </Link>
        {onCsv ? (
          <button type="button" onClick={onCsv} className={itemClass(false)}>
            CSV
          </button>
        ) : (
          <Link href="/admin#csv" className={itemClass(false)}>
            CSV
          </Link>
        )}
        <Link href="/map" className="text-sky px-2 text-sm font-bold underline underline-offset-4">
          マップへ
        </Link>
      </nav>
    </header>
  );
}

export function AdminPageFrame({ children }: { children: ReactNode }) {
  return (
    <main className="from-bg-sky to-bg-warm min-h-dvh bg-linear-to-b px-4 py-6 sm:px-6">
      {children}
    </main>
  );
}

/**
 * データ取得の失敗を画面に出す。権限の問題ではないので、黙ってリダイレクトしない
 * （原因が分からないまま戻される事故を防ぐ）。
 */
export function AdminError({ message }: { message: string }) {
  return (
    <AdminPageFrame>
      <div className="grid min-h-[70dvh] place-items-center">
        <div className="card-pop max-w-lg px-6 py-6">
          <h1 className="text-navy text-lg font-black">データを読み込めませんでした</h1>
          <p className="text-ink-soft mt-3 text-sm font-bold">
            テーブルが未作成の可能性があります。supabase/migrations/ の SQL
            がすべて適用済みか確認してください。
          </p>
          <pre className="bg-panel-tint text-ink mt-3 overflow-x-auto rounded-xl px-3 py-2 text-xs">
            {message}
          </pre>
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-game px-5 py-2.5 text-sm"
            >
              もう一度ためす
            </button>
            <Link
              href="/map"
              className="border-hairline text-navy rounded-2xl border-2 bg-white px-5 py-2.5 text-sm font-bold"
            >
              マップへ戻る
            </Link>
          </div>
        </div>
      </div>
    </AdminPageFrame>
  );
}

export function AdminLoading() {
  return (
    <AdminPageFrame>
      <div className="grid min-h-[70dvh] place-items-center">
        <p className="card-pop text-navy px-6 py-3 font-bold">読み込み中です。</p>
      </div>
    </AdminPageFrame>
  );
}

export function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <article className="card-pop px-5 py-5 text-center">
      <p className="text-navy text-4xl font-black tabular-nums">{value}</p>
      <p className="text-ink-soft mt-1 text-sm font-bold">{label}</p>
    </article>
  );
}

function TableToggle({
  showingTable,
  onChange,
}: {
  showingTable: boolean;
  onChange: (showingTable: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={showingTable}
      onClick={() => onChange(!showingTable)}
      className="border-hairline text-ink-soft rounded-full border-2 bg-white px-3 py-1.5 text-xs font-bold"
    >
      {showingTable ? "グラフで見る" : "表で見る"}
    </button>
  );
}

function Legend({ items }: { items: readonly { key: string; label: string; color: string }[] }) {
  return (
    <ul aria-label="凡例" className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold">
      {items.map((item) => (
        <li key={item.key} className="text-ink flex items-center gap-2">
          <span
            aria-hidden
            className="h-3 w-3 rounded-[3px]"
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function SectionHeading({
  title,
  description,
  showingTable,
  onTableChange,
}: {
  title: string;
  description: string;
  showingTable: boolean;
  onTableChange: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-navy text-xl font-black sm:text-2xl">{title}</h2>
        <p className="text-ink-soft mt-1 text-sm font-medium">{description}</p>
      </div>
      <TableToggle showingTable={showingTable} onChange={onTableChange} />
    </div>
  );
}

function EmptyChart() {
  return (
    <p className="bg-panel-tint text-ink-soft mt-5 rounded-2xl p-5 font-bold">{EMPTY_MESSAGE}</p>
  );
}

function displayCount(count: number, percentage: number, sampleMode: SampleMode): string {
  return sampleMode === "full" ? `${count}人（${percentage}%）` : `${count}人`;
}

export function TypeDistributionChart({ data }: { data: TypeDistribution }) {
  const [showTable, setShowTable] = useState(false);
  const maximum = Math.max(...data.items.map((item) => item.count), 1);
  const legend = data.items.map((item) => ({
    key: item.type,
    label: TYPE_LABELS[item.type],
    color: TYPE_COLORS[item.type],
  }));

  return (
    <section className="card-pop p-5 sm:p-7">
      <SectionHeading
        title="タイプ分布"
        description="回答ずみの学生を、判定タイプの人数が多い順に表示します。"
        showingTable={showTable}
        onTableChange={setShowTable}
      />
      <div className="mt-4">
        <Legend items={legend} />
      </div>
      {data.sampleMode === "empty" ? (
        <EmptyChart />
      ) : showTable ? (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-hairline text-ink-soft border-b text-left">
                <th className="px-3 py-2">タイプ</th>
                <th className="px-3 py-2 text-right">人数</th>
                {data.sampleMode === "full" && <th className="px-3 py-2 text-right">割合</th>}
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.type} className="border-hairline border-b">
                  <td className="px-3 py-2 font-bold">{TYPE_LABELS[item.type]}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{item.count}人</td>
                  {data.sampleMode === "full" && (
                    <td className="px-3 py-2 text-right tabular-nums">{item.percentage}%</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {data.items.map((item) => {
            const label = `${TYPE_LABELS[item.type]} ${displayCount(
              item.count,
              item.percentage,
              data.sampleMode,
            )}`;
            return (
              <div
                key={item.type}
                className="group relative grid gap-2 sm:grid-cols-[9rem_1fr_13rem] sm:items-center"
              >
                <span className="text-ink text-sm font-bold">{TYPE_LABELS[item.type]}</span>
                <div
                  className="bg-panel-tint border-hairline h-7 overflow-visible border-l"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(to right, transparent 0, transparent calc(25% - 1px), var(--color-hairline) calc(25% - 1px), var(--color-hairline) 25%)",
                  }}
                >
                  <div
                    className="h-full min-w-0 rounded-r-[4px]"
                    style={{
                      width: `${(item.count / maximum) * 100}%`,
                      backgroundColor: TYPE_COLORS[item.type],
                    }}
                  />
                </div>
                <span className="text-ink text-sm font-bold tabular-nums">{label}</span>
                <span className="bg-ink pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 rounded-lg px-3 py-1 text-xs whitespace-nowrap text-white shadow-lg group-hover:block">
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function AxisAverageChart({ data }: { data: AxisAverages }) {
  const [showTable, setShowTable] = useState(false);
  const legend = data.items.map((item) => ({
    key: item.axis,
    label: TYPE_LABELS[item.axis],
    color: TYPE_COLORS[item.axis],
  }));

  return (
    <section className="card-pop p-5 sm:p-7">
      <SectionHeading
        title="軸スコアの平均"
        description="各軸は0〜10です。値は優劣ではなく、クラス全体の傾向を表します。"
        showingTable={showTable}
        onTableChange={setShowTable}
      />
      <div className="mt-4">
        <Legend items={legend} />
      </div>
      {data.sampleMode === "empty" ? (
        <EmptyChart />
      ) : showTable ? (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-hairline text-ink-soft border-b text-left">
                <th className="px-3 py-2">軸</th>
                <th className="px-3 py-2 text-right">平均（0〜10）</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.axis} className="border-hairline border-b">
                  <td className="px-3 py-2 font-bold">{TYPE_LABELS[item.axis]}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{item.average}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {data.items.map((item) => (
            <div
              key={item.axis}
              className="group relative grid gap-2 sm:grid-cols-[9rem_1fr_5rem] sm:items-center"
            >
              <span className="text-ink text-sm font-bold">{TYPE_LABELS[item.axis]}</span>
              <div
                className="bg-panel-tint border-hairline h-7 border-l"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(to right, transparent 0, transparent calc(20% - 1px), var(--color-hairline) calc(20% - 1px), var(--color-hairline) 20%)",
                }}
              >
                <div
                  className="h-full rounded-r-[4px]"
                  style={{
                    width: `${item.average * 10}%`,
                    backgroundColor: TYPE_COLORS[item.axis],
                  }}
                />
              </div>
              <span className="text-ink text-sm font-bold tabular-nums">{item.average} / 10</span>
              <span className="bg-ink pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 rounded-lg px-3 py-1 text-xs whitespace-nowrap text-white shadow-lg group-hover:block">
                {TYPE_LABELS[item.axis]} 平均 {item.average} / 10
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function StudentScoreChart({
  scores,
  highlight,
}: {
  scores: PersonalityScores;
  highlight: PersonalityTypeId;
}) {
  const [showTable, setShowTable] = useState(false);
  const items = (Object.keys(TYPE_LABELS) as PersonalityTypeId[]).map((axis) => ({
    axis,
    score: scores[axis],
  }));
  const legend = items.map((item) => ({
    key: item.axis,
    label: TYPE_LABELS[item.axis],
    color: TYPE_COLORS[item.axis],
  }));

  return (
    <section className="card-pop p-5 sm:p-7">
      <SectionHeading
        title="軸スコア"
        description="各軸は0〜10です。値は優劣ではなく、その人の傾向を表します。"
        showingTable={showTable}
        onTableChange={setShowTable}
      />
      <div className="mt-4">
        <Legend items={legend} />
      </div>
      {showTable ? (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-hairline text-ink-soft border-b text-left">
                <th className="px-3 py-2">軸</th>
                <th className="px-3 py-2 text-right">スコア（0〜10）</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.axis} className="border-hairline border-b">
                  <td className="px-3 py-2 font-bold">
                    {TYPE_LABELS[item.axis]}
                    {item.axis === highlight && (
                      <span className="text-sky ml-2 text-xs">最大軸</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{item.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {items.map((item) => (
            <div
              key={item.axis}
              className={`group relative grid gap-2 rounded-xl p-2 sm:grid-cols-[9rem_1fr_5rem] sm:items-center ${
                item.axis === highlight ? "bg-sky-soft" : ""
              }`}
            >
              <span className="text-ink text-sm font-bold">
                {TYPE_LABELS[item.axis]}
                {item.axis === highlight && (
                  <span className="text-sky ml-2 text-[10px]">最大軸</span>
                )}
              </span>
              <div
                className="bg-panel-tint border-hairline h-7 border-l"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(to right, transparent 0, transparent calc(20% - 1px), var(--color-hairline) calc(20% - 1px), var(--color-hairline) 20%)",
                }}
              >
                <div
                  className="h-full rounded-r-[4px]"
                  style={{
                    width: `${item.score * 10}%`,
                    backgroundColor: TYPE_COLORS[item.axis],
                  }}
                />
              </div>
              <span className="text-ink text-sm font-bold tabular-nums">{item.score} / 10</span>
              <span className="bg-ink pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 rounded-lg px-3 py-1 text-xs whitespace-nowrap text-white shadow-lg group-hover:block">
                {TYPE_LABELS[item.axis]} {item.score} / 10
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function QuestionDistributionChart({
  data,
  questions,
}: {
  data: QuestionStats;
  questions: readonly { id: number; easy: string }[];
}) {
  const [showTable, setShowTable] = useState(false);
  const legend = [
    { key: "yes", label: "はい", color: ANSWER_COLORS.yes },
    { key: "neutral", label: "どちらでもない", color: ANSWER_COLORS.neutral },
    { key: "no", label: "いいえ", color: ANSWER_COLORS.no },
  ];

  return (
    <section className="card-pop p-5 sm:p-7">
      <SectionHeading
        title="設問別の回答分布"
        description="20問それぞれの回答のまとまり方や、意見の分かれ方を確認できます。"
        showingTable={showTable}
        onTableChange={setShowTable}
      />
      <div className="mt-4">
        <Legend items={legend} />
      </div>
      {data.sampleMode === "empty" ? (
        <EmptyChart />
      ) : showTable ? (
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[64rem] text-sm">
            <thead>
              <tr className="border-hairline text-ink-soft border-b text-left">
                <th className="px-3 py-2">設問</th>
                {legend.map((item) => (
                  <th key={item.key} className="px-3 py-2 text-right">
                    {item.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => {
                const question = questions[item.questionId - 1];
                return (
                  <tr key={item.questionId} className="border-hairline border-b align-top">
                    <td className="px-3 py-3 font-medium">
                      <span className="text-navy mr-2 font-black">
                        Q{String(item.questionId).padStart(2, "0")}
                      </span>
                      {question?.easy}
                    </td>
                    {item.answers.map((answer) => (
                      <td key={answer.answer} className="px-3 py-3 text-right tabular-nums">
                        {displayCount(answer.count, answer.percentage, data.sampleMode)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {data.items.map((item) => {
            const question = questions[item.questionId - 1];
            const tooltip = item.answers
              .map((answer) => `${ANSWER_LABELS[answer.answer]} ${answer.count}人`)
              .join(" / ");
            const lastVisibleAnswer = item.answers.findLast((answer) => answer.count > 0)?.answer;
            return (
              <div
                key={item.questionId}
                className="group relative grid gap-2 xl:grid-cols-[minmax(24rem,1fr)_minmax(26rem,1fr)] xl:items-center"
              >
                <p className="text-ink text-sm font-medium">
                  <span className="text-navy mr-2 font-black">
                    Q{String(item.questionId).padStart(2, "0")}
                  </span>
                  {question?.easy}
                </p>
                <div className="bg-panel-tint border-hairline flex h-8 gap-[2px] overflow-visible border-l">
                  {item.answers.map((answer) => (
                    <div
                      key={answer.answer}
                      className={`grid h-full place-items-center overflow-hidden text-[10px] font-black whitespace-nowrap text-white ${
                        lastVisibleAnswer === answer.answer ? "rounded-r-[4px]" : ""
                      }`}
                      style={{
                        width: `${answer.percentage}%`,
                        backgroundColor: ANSWER_COLORS[answer.answer],
                      }}
                    >
                      {answer.count > 0 &&
                        (data.sampleMode === "full"
                          ? answer.percentage >= 12 && `${answer.percentage}%`
                          : `${answer.count}人`)}
                    </div>
                  ))}
                </div>
                <span className="bg-ink pointer-events-none absolute right-0 bottom-full z-10 mb-2 hidden rounded-lg px-3 py-1 text-xs whitespace-nowrap text-white shadow-lg group-hover:block">
                  {tooltip}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
