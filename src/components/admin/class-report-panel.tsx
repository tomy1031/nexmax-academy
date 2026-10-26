import Link from "next/link";
import { classDateLabel, groupLabel, type ClassReportView } from "@/lib/records/class-report";

/**
 * 授業ごとの分析の中身（要望 #599。ページは `/admin/class-reports`）
 *
 * 火・水・金の授業のあと、Claude の定期タスクが生徒の回答を読んで DB に登録した分析を出す。
 * 2026-10-26 に学習の記録のいちばん上から別のページへ移した（「授業ごとの分析は別ページに
 * まとめてください」）。どの組・どの日かを選ぶのはページの側（class-reports-shell.tsx）。
 * 生徒の名前を押すと、学習の記録でその生徒の「工程ごとの行ったこと」を開く。
 *
 * 色は明るい地に濃い文字だけ（濃い地を使わない）。
 */
export function ClassReportPanel({
  report,
  busy,
  note,
}: {
  report: ClassReportView | null;
  busy: boolean;
  note: string | null;
}) {
  return (
    <section className="card-island mb-3 p-4 sm:p-5" aria-label="授業ごとの分析">
      {busy ? (
        <p className="text-ink-soft font-bold">読み込み中です。</p>
      ) : note ? (
        <Notice>{note}</Notice>
      ) : report === null ? (
        <p className="text-ink-soft font-bold">
          まだ分析はありません。次の授業のあと、21:30ごろにここへ入ります。
        </p>
      ) : (
        <ReportBody report={report} />
      )}
    </section>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-2xl border-2 bg-white p-3 text-sm font-black"
      style={{ borderColor: "var(--color-sun)", color: "var(--color-ink)" }}
    >
      {children}
    </p>
  );
}

function ReportBody({ report }: { report: ClassReportView }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-navy text-lg font-black tabular-nums">
          {classDateLabel(report.classDate)} ・ {groupLabel(report)}
        </h2>
        <p className="text-ink-soft text-xs font-black tabular-nums">
          動いた生徒 {report.students}人。名前を押すと、学習の記録でその生徒の回答を開きます。
        </p>
      </div>
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
                <Name name={person.name} profileId={person.profileId} />
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
                <Name name={one.name} profileId={one.profileId} />
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

function Name({ name, profileId }: { name: string; profileId: string }) {
  if (profileId === "") return <span className="text-ink font-black">{name}</span>;
  return (
    <Link
      href={`/admin/records?profile=${encodeURIComponent(profileId)}`}
      className="text-sky font-black underline underline-offset-2"
    >
      {name}
    </Link>
  );
}
