"use client";

import { useState } from "react";
import { classDateLabel, groupLabel, type ClassReportView } from "@/lib/records/class-report";

/**
 * 授業ごとの分析（学習の記録のいちばん上・要望 #599）
 *
 * 火・水・金の授業のあと、Claude の定期タスクが生徒の回答を読んで DB に登録した分析を出す。
 * 選んでいる組の最新を開き、過去の分析は日付で選べる。生徒の名前を押すと、その生徒の
 * 「工程ごとの行ったこと」が下に出る（生徒の一覧の名前と同じ動き）。
 *
 * 色は明るい地に濃い文字だけ（濃い地を使わない）。
 */
export function ClassReportPanel({
  reports,
  busy,
  note,
  onPick,
}: {
  reports: readonly ClassReportView[];
  busy: boolean;
  note: string | null;
  onPick: (profileId: string) => void;
}) {
  const [chosenId, setChosenId] = useState<string | null>(null);
  const report = reports.find((one) => one.id === chosenId) ?? reports[0] ?? null;

  return (
    <section className="card-island mb-3 p-4 sm:p-5" aria-labelledby="class-report-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="class-report-heading" className="text-navy text-lg font-black">
          授業ごとの分析
        </h2>
        {reports.length > 1 ? (
          <label className="text-ink-soft flex items-center gap-2 text-xs font-black">
            ほかの日を見る
            <select
              value={report?.id ?? ""}
              onChange={(e) => setChosenId(e.target.value)}
              className="border-hairline bg-panel text-ink rounded-[var(--radius-button)] border-2 px-2 py-1 text-sm font-bold"
            >
              {reports.map((one) => (
                <option key={one.id} value={one.id}>
                  {classDateLabel(one.classDate)} {groupLabel(one)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <p className="text-ink-soft mt-1 text-xs font-bold">
        火・水・金の授業のあと（21:30ごろ）に、Claude が生徒の回答を読んで書きます。
        AIの疑いは決めつけではなく、先生が本人に口頭で確かめる候補です。
      </p>

      {busy ? (
        <p className="text-ink-soft mt-3 font-bold">読み込み中です。</p>
      ) : note ? (
        <Notice>{note}</Notice>
      ) : report === null ? (
        <p className="text-ink-soft mt-3 font-bold">
          まだ分析はありません。次の授業のあと、21:30ごろにここへ入ります。
        </p>
      ) : (
        <ReportBody report={report} onPick={onPick} />
      )}
    </section>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="mt-3 rounded-2xl border-2 bg-white p-3 text-sm font-black"
      style={{ borderColor: "var(--color-sun)", color: "var(--color-ink)" }}
    >
      {children}
    </p>
  );
}

function ReportBody({
  report,
  onPick,
}: {
  report: ClassReportView;
  onPick: (profileId: string) => void;
}) {
  return (
    <div className="mt-3 flex flex-col gap-4">
      <p className="text-ink-soft text-xs font-black tabular-nums">
        {classDateLabel(report.classDate)} ・ {groupLabel(report)} ・ 動いた生徒 {report.students}人
      </p>
      {report.summary ? <p className="text-ink font-bold">{report.summary}</p> : null}

      <Part title={`フォローが要る人（${report.followUp.length}人）`}>
        {report.followUp.length === 0 ? (
          <p className="text-ink-soft font-bold">いません。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {report.followUp.map((person, i) => (
              <li
                key={`${person.profileId || person.name}:${i}`}
                className="rounded-2xl border-2 p-3"
                style={{ borderColor: "#f2b8a8", background: "#fff4f0" }}
              >
                <Name name={person.name} profileId={person.profileId} onPick={onPick} />
                {person.reasons.map((reason) => (
                  <span
                    key={reason}
                    className="ml-2 inline-block rounded-full border-2 bg-white px-2 py-0.5 text-xs font-black"
                    style={{ borderColor: "#f2654a", color: "#b3261e" }}
                  >
                    {reason}
                  </span>
                ))}
                {person.quotes.map((quote) => (
                  <Quote key={quote}>{quote}</Quote>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Part>

      <Part
        title={`AIの疑い（${report.aiSuspects.length === 0 ? "なし" : `${report.aiSuspects.length}件`}）`}
      >
        {report.aiSuspects.length === 0 ? (
          <p className="text-ink-soft font-bold">
            N4・N3を超える言葉づかいの答えはありませんでした。
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {report.aiSuspects.map((one, i) => (
              <li
                key={`${one.profileId || one.name}:${i}`}
                className="rounded-2xl border-2 p-3"
                style={{ borderColor: "#f0d48a", background: "#fff8e6" }}
              >
                <Name name={one.name} profileId={one.profileId} onPick={onPick} />
                <Quote>{one.quote}</Quote>
                {one.reason ? <p className="text-ink text-sm font-bold">{one.reason}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Part>

      <Part title="クラスでつまずいたところ">
        {report.stumbles.length === 0 ? (
          <p className="text-ink-soft font-bold">目立ったつまずきはありませんでした。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {report.stumbles.map((one, i) => (
              <li key={`${one.title}:${i}`} className="text-ink text-sm font-bold">
                <span className="font-black">{one.title}</span>
                {one.detail ? <span className="text-ink-soft">　{one.detail}</span> : null}
                {one.quotes.map((quote) => (
                  <Quote key={quote}>{quote}</Quote>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Part>

      <Part title="次の授業で">
        {report.nextSteps.length === 0 ? (
          <p className="text-ink-soft font-bold">特にありません。</p>
        ) : (
          <ol className="text-ink flex list-decimal flex-col gap-1 pl-5 text-sm font-bold">
            {report.nextSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        )}
      </Part>

      {report.dropped > 0 ? (
        <Notice>形が合わずに読めなかった項目が {report.dropped}件あります。</Notice>
      ) : null}
    </div>
  );
}

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-navy mb-2 text-base font-black">{title}</h3>
      {children}
    </div>
  );
}

function Quote({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="border-hairline text-ink my-1 border-l-4 bg-white py-1 pl-3 text-sm font-bold">
      {children}
    </blockquote>
  );
}

function Name({
  name,
  profileId,
  onPick,
}: {
  name: string;
  profileId: string;
  onPick: (profileId: string) => void;
}) {
  if (profileId === "") return <span className="text-ink font-black">{name}</span>;
  return (
    <button
      type="button"
      onClick={() => onPick(profileId)}
      className="text-sky font-black underline underline-offset-2"
    >
      {name}
    </button>
  );
}
