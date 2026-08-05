"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  PERSONALITY_AXES,
  PERSONALITY_AXIS_META,
  getPersonalityType,
  type PersonalityAxis,
  type PersonalityFamilyId,
  type PersonalityScores,
} from "@/content/personality";
import type {
  AxisAverageItem,
  AxisAverages,
  QuestionStats,
  SampleMode,
  TypeDistribution,
} from "@/lib/personality-stats";

export const FAMILY_COLORS: Record<PersonalityFamilyId, string> = {
  leader: "#0272ae",
  idea: "#1f7a4d",
  heart: "#f27bb0",
  challenge: "#d99000",
};

export const FAMILY_LABELS: Record<PersonalityFamilyId, string> = {
  leader: "まもり組",
  idea: "かんがえ組",
  heart: "きもち組",
  challenge: "うごき組",
};

/** 双極バーの左右。極そのものに色を割り当てる（Ⓐ/Ⓑ に割り当てると設問間で意味が反転する）。 */
export const POLE_COLORS = { first: "#0272ae", second: "#d99000" } as const;

/** 教師向けなのでふりがな不要。両端の極を並べて示す。 */
export function axisLabel(axis: PersonalityAxis): string {
  const meta = PERSONALITY_AXIS_META[axis];
  return `${meta.poles[0]}（${meta.poleLabels[0]}） ⇄ ${meta.poles[1]}（${meta.poleLabels[1]}）`;
}

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
        <Link href="/nexmax" className={itemClass(pathname === "/nexmax")}>
          ネクマックス16人
        </Link>
        <Link href="/admin/ai" className={itemClass(pathname === "/admin/ai")}>
          AI指示出し
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

function displayCount(count: number, percentage: number | null, sampleMode: SampleMode): string {
  return sampleMode === "full" && percentage !== null
    ? `${count}人（${percentage}%）`
    : `${count}人`;
}

/**
 * 双極バー。中央2.5に印を置き、寄っている側へ伸ばす。
 * 0〜5の単方向棒にすると「低い＝弱い」と誤読される（07 §6.4）。
 */
function BipolarBar({ item }: { item: AxisAverageItem }) {
  const meta = PERSONALITY_AXIS_META[item.axis];
  if (item.average === null) {
    return <div className="bg-panel-tint border-hairline h-7 rounded border" />;
  }
  const offset = (item.average - 2.5) / 2.5; // -1（右極）〜 +1（左極）
  const width = Math.abs(offset) * 50;
  const towardsFirst = offset > 0;

  return (
    <div className="bg-panel-tint border-hairline relative h-7 rounded border">
      <div
        className="absolute top-0 h-full"
        style={{
          left: towardsFirst ? `${50 - width}%` : "50%",
          width: `${width}%`,
          backgroundColor: towardsFirst ? POLE_COLORS.first : POLE_COLORS.second,
        }}
      />
      <div aria-hidden className="bg-ink absolute top-0 left-1/2 h-full w-px opacity-50" />
      <span className="text-ink-soft absolute -top-5 left-0 text-[10px] font-bold">
        {meta.poles[0]}
      </span>
      <span className="text-ink-soft absolute -top-5 right-0 text-[10px] font-bold">
        {meta.poles[1]}
      </span>
    </div>
  );
}

export function TypeDistributionChart({ data }: { data: TypeDistribution }) {
  const [showTable, setShowTable] = useState(false);
  const maximum = Math.max(...data.families.map((family) => family.count), 1);
  const legend = data.families.map((family) => ({
    key: family.family,
    label: FAMILY_LABELS[family.family],
    color: FAMILY_COLORS[family.family],
  }));

  return (
    <section className="card-pop p-5 sm:p-7">
      <SectionHeading
        title="タイプ分布"
        description="4つの組の人数と、その中の16タイプの内訳です。割合はいずれも回答者全体に対するものです。"
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
                <th className="px-3 py-2">組 / タイプ</th>
                <th className="px-3 py-2 text-right">人数</th>
                {data.sampleMode === "full" && <th className="px-3 py-2 text-right">割合</th>}
              </tr>
            </thead>
            <tbody>
              {data.families.flatMap((family) => [
                <tr key={family.family} className="border-hairline border-b">
                  <td className="px-3 py-2 font-bold">{FAMILY_LABELS[family.family]}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{family.count}人</td>
                  {data.sampleMode === "full" && (
                    <td className="px-3 py-2 text-right tabular-nums">{family.percentage}%</td>
                  )}
                </tr>,
                ...family.codes.map((code) => (
                  <tr key={code.code} className="border-hairline border-b">
                    <td className="text-ink-soft px-3 py-1.5 pl-8">
                      {getPersonalityType(code.code).name}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{code.count}人</td>
                    {data.sampleMode === "full" && (
                      <td className="px-3 py-1.5 text-right tabular-nums">{code.percentage}%</td>
                    )}
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {data.families.map((family) => (
            <div key={family.family}>
              <div className="grid gap-2 sm:grid-cols-[9rem_1fr_13rem] sm:items-center">
                <span className="text-ink text-sm font-bold">{FAMILY_LABELS[family.family]}</span>
                <div className="bg-panel-tint border-hairline h-7 border-l">
                  <div
                    className="h-full min-w-0 rounded-r-[4px]"
                    style={{
                      width: `${(family.count / maximum) * 100}%`,
                      backgroundColor: FAMILY_COLORS[family.family],
                    }}
                  />
                </div>
                <span className="text-ink text-sm font-bold tabular-nums">
                  {displayCount(family.count, family.percentage, data.sampleMode)}
                </span>
              </div>
              {/* 家族内は0件も畳まず定義順で出す。行位置がクラスごとに動くと読めなくなるため。 */}
              <ul className="text-ink-soft mt-2 ml-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                {family.codes.map((code) => (
                  <li key={code.code} className="flex justify-between gap-2">
                    <span className={code.count === 0 ? "opacity-45" : "font-bold"}>
                      {getPersonalityType(code.code).shortName}
                    </span>
                    <span className={`tabular-nums ${code.count === 0 ? "opacity-45" : ""}`}>
                      {code.count}人
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function AxisAverageChart({ data }: { data: AxisAverages }) {
  const [showTable, setShowTable] = useState(false);

  return (
    <section className="card-pop p-5 sm:p-7">
      <SectionHeading
        title="軸の平均"
        description="各軸は0〜5で、まん中は2.5です。どちらの極が良い・悪いということはありません。"
        showingTable={showTable}
        onTableChange={setShowTable}
      />
      {data.sampleMode === "empty" ? (
        <EmptyChart />
      ) : showTable ? (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-hairline text-ink-soft border-b text-left">
                <th className="px-3 py-2">軸</th>
                <th className="px-3 py-2 text-right">平均（0〜5）</th>
                <th className="px-3 py-2 text-right">人数</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.axis} className="border-hairline border-b">
                  <td className="px-3 py-2 font-bold">{axisLabel(item.axis)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{item.average ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {PERSONALITY_AXIS_META[item.axis].poles[0]} {item.firstPoleCount}人 /{" "}
                    {PERSONALITY_AXIS_META[item.axis].poles[1]} {item.secondPoleCount}人
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-8 space-y-7">
          {data.items.map((item) => (
            <div key={item.axis} className="grid gap-2 sm:grid-cols-[16rem_1fr_10rem] sm:items-end">
              <span className="text-ink text-sm font-bold">{axisLabel(item.axis)}</span>
              <BipolarBar item={item} />
              {/* 平均だけだと二峰性が隠れる（[5,0,5,0] と [3,2,3,2] は同じ2.5）ので人数も添える。 */}
              <span className="text-ink text-sm font-bold tabular-nums">
                {item.average ?? "—"}　{PERSONALITY_AXIS_META[item.axis].poles[0]}
                {item.firstPoleCount}人 / {PERSONALITY_AXIS_META[item.axis].poles[1]}
                {item.secondPoleCount}人
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function StudentScoreChart({ scores }: { scores: PersonalityScores }) {
  const [showTable, setShowTable] = useState(false);
  const items: AxisAverageItem[] = PERSONALITY_AXES.map((axis) => {
    const [first, second] = PERSONALITY_AXIS_META[axis].poles;
    const towardsFirst = scores[axis] >= 3;
    return {
      axis,
      average: scores[axis],
      leaning: towardsFirst ? first : second,
      firstPoleCount: towardsFirst ? 1 : 0,
      secondPoleCount: towardsFirst ? 0 : 1,
    };
  });

  return (
    <section className="card-pop p-5 sm:p-7">
      <SectionHeading
        title="軸スコア"
        description="各軸は0〜5で、まん中は2.5です。値は優劣ではなく、その人の傾向を表します。"
        showingTable={showTable}
        onTableChange={setShowTable}
      />
      {showTable ? (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-hairline text-ink-soft border-b text-left">
                <th className="px-3 py-2">軸</th>
                <th className="px-3 py-2 text-right">スコア</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const [first, second] = PERSONALITY_AXIS_META[item.axis].poles;
                const value = item.average ?? 0;
                return (
                  <tr key={item.axis} className="border-hairline border-b">
                    <td className="px-3 py-2 font-bold">{axisLabel(item.axis)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {first}
                      {value} / {second}
                      {5 - value}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-8 space-y-7">
          {items.map((item) => {
            const [first, second] = PERSONALITY_AXIS_META[item.axis].poles;
            const value = item.average ?? 0;
            return (
              <div
                key={item.axis}
                className="grid gap-2 sm:grid-cols-[16rem_1fr_7rem] sm:items-end"
              >
                <span className="text-ink text-sm font-bold">{axisLabel(item.axis)}</span>
                <BipolarBar item={item} />
                <span className="text-ink text-sm font-bold tabular-nums">
                  {first}
                  {value} / {second}
                  {5 - value}
                </span>
              </div>
            );
          })}
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
  // 凡例は Ⓐ/Ⓑ ではなく極で作る。設問ごとに Ⓐ の極が入れ替わるため（07 §3.1）、
  // Ⓐ/Ⓑ に色を固定すると「同じ色＝同じ傾向」と必ず誤読される。
  const legend = [
    { key: "first", label: "左の極（E / S / T / J）", color: POLE_COLORS.first },
    { key: "second", label: "右の極（I / N / F / P）", color: POLE_COLORS.second },
  ];

  const poleColor = (axis: PersonalityAxis, pole: string) =>
    PERSONALITY_AXIS_META[axis].poles[0] === pole ? POLE_COLORS.first : POLE_COLORS.second;

  return (
    <section className="card-pop p-5 sm:p-7">
      <SectionHeading
        title="設問別の回答分布"
        description="20問それぞれの選択のまとまり方です。棒の色は選択肢の記号ではなく、その選択肢が数える極を表します。"
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
                <th className="px-3 py-2 text-right">Ⓐ</th>
                <th className="px-3 py-2 text-right">Ⓑ</th>
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
                        <span className="text-ink-soft mr-1 text-xs">{answer.pole}</span>
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
              .map((answer) => `${answer.pole} ${answer.count}人`)
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
                        width: item.total === 0 ? "0%" : `${(answer.count / item.total) * 100}%`,
                        backgroundColor: poleColor(item.axis, answer.pole),
                      }}
                    >
                      {answer.count > 0 && `${answer.pole} ${answer.count}`}
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
