import { FOLLOW_RULES, flagLabel, type RosterRow } from "@/lib/records/roster";

/**
 * 生徒の 一覧（学習の きろくの いちばん 上・願い #599）
 *
 * 1行 = 1人。**全体の 進み**と **できの 目安**と **フォローの 印**だけを 出す。
 * 教材ごとの 細かい 記録は この 下の 表に 残して ある。行の 名前を 押すと、
 * その 生徒の「工程ごとの 行った こと」が 下に 出る（学習の きろくの 中で 開く）。
 *
 * 色は 明るい 地に 濃い 文字だけ（濃い 地を 使わない）。印の ある 行は 薄い 珊瑚色に する。
 */
export function LearnerRoster({
  rows,
  busy,
  note,
  onPick,
}: {
  rows: readonly RosterRow[];
  busy: boolean;
  note: string | null;
  /** 名前を 押した とき（その 生徒の「工程ごとの 行った こと」を 開く）。 */
  onPick: (profileId: string) => void;
}) {
  const flagged = rows.filter((row) => row.flags.length > 0).length;
  return (
    <section className="card-island mb-3 p-4 sm:p-5" aria-labelledby="roster-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="roster-heading" className="text-navy text-lg font-black">
          生徒の 一覧
        </h2>
        {!busy && rows.length > 0 ? (
          <p className="text-ink-soft text-xs font-bold">
            {rows.length}人 ・ フォローの 印 {flagged}人
          </p>
        ) : null}
      </div>
      <p className="text-ink-soft mt-1 text-xs font-bold">
        フォローの 印が つくのは 3つの とき —— もんだいの 1回目が 合格ラインに 届かない セットが{" "}
        {FOLLOW_RULES.firstLowSets}つ 以上 ・ 同じ ことばの テストで 3回 以上 不合格の まま ・
        会話の 発言の {Math.round(FOLLOW_RULES.talkMissRatio * 100)}% 以上が miss。名前を 押すと
        その 生徒の 「工程ごとの 行った こと」が 下に 出ます。
      </p>

      {busy ? (
        <p className="text-ink-soft mt-3 font-bold">読み込み中です。</p>
      ) : note ? (
        <p
          role="status"
          className="mt-3 rounded-2xl border-2 bg-white p-3 text-sm font-black"
          style={{ borderColor: "var(--color-sun)", color: "var(--color-ink)" }}
        >
          {note}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-ink-soft mt-3 font-bold">この 条件の 生徒は いません。</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="text-ink-soft border-b-2 text-left text-xs font-black">
                <th className="py-2 pr-3">生徒</th>
                <th className="py-2 pr-3">全体の 進み</th>
                <th className="py-2 pr-3">もんだいの 初回</th>
                <th className="py-2 pr-3">ことばの テスト</th>
                <th className="py-2 pr-3">会話</th>
                <th className="py-2 pr-3" aria-label="修了証">
                  🎓
                </th>
                <th className="py-2 pr-3">フォロー</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <RosterLine key={row.profileId} row={row} onPick={onPick} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RosterLine({ row, onPick }: { row: RosterRow; onPick: (profileId: string) => void }) {
  const { progress } = row;
  const share = progress.total === 0 ? 0 : progress.done / progress.total;
  return (
    <tr
      className="border-hairline text-ink border-b align-top font-bold"
      style={row.flags.length > 0 ? { background: "#fff4f0" } : undefined}
    >
      <td className="py-2 pr-3">
        <button
          type="button"
          onClick={() => onPick(row.profileId)}
          className="text-sky text-left font-bold underline underline-offset-2"
        >
          {row.name}
        </button>
        {row.school ? <span className="text-ink-soft block text-xs">{row.school}</span> : null}
      </td>
      <td className="w-48 py-2 pr-3">
        <span
          className="block h-2 overflow-hidden rounded-full"
          style={{ background: "var(--color-sky-soft)" }}
          aria-hidden
        >
          <span
            className="block h-full rounded-full"
            style={{ width: `${Math.round(share * 100)}%`, background: "var(--color-sky)" }}
          />
        </span>
        <span className="text-ink-soft mt-1 block text-xs tabular-nums">
          教材 {progress.done} ／ {progress.total} ・ ステージ {progress.stagesDone} ／{" "}
          {progress.stagesTotal}
        </span>
      </td>
      <td className="py-2 pr-3 tabular-nums">
        {row.firstAverage === null ? (
          <span className="text-ink-soft">—</span>
        ) : (
          <>
            平均 {Math.round(row.firstAverage * 100)}%
            <span className="text-ink-soft block text-xs">{row.quizSets}セット</span>
            {row.lowSets.length > 0 ? (
              <span className="block text-xs" style={{ color: "#b3261e" }}>
                届かない: {row.lowSets.map((set) => set.title).join("・")}
              </span>
            ) : null}
          </>
        )}
      </td>
      <td className="py-2 pr-3 tabular-nums">
        {row.word.sets === 0 ? (
          <span className="text-ink-soft">—</span>
        ) : (
          <>
            合格 {row.word.passed} ／ {row.word.sets}
            {row.word.stuck > 0 ? (
              <span className="block text-xs" style={{ color: "#b3261e" }}>
                足ぶみ {row.word.stuck}
              </span>
            ) : null}
          </>
        )}
      </td>
      <td className="py-2 pr-3 tabular-nums">
        {row.talk.graded === 0 ? (
          <span className="text-ink-soft">—</span>
        ) : (
          <>
            miss {row.talk.miss} ／ {row.talk.graded}
          </>
        )}
      </td>
      <td className="py-2 pr-3 tabular-nums">
        {row.certificates > 0 ? row.certificates : <span className="text-ink-soft">—</span>}
      </td>
      <td className="py-2 pr-3">
        {row.flags.length === 0 ? (
          <span className="text-ink-soft">—</span>
        ) : (
          <ul className="flex flex-col gap-1">
            {row.flags.map((flag) => (
              <li
                key={flag.kind}
                className="rounded-full border-2 bg-white px-2 py-0.5 text-xs font-black"
                style={{ borderColor: "#f2654a", color: "#b3261e" }}
              >
                ⚠ {flagLabel(flag)}
              </li>
            ))}
          </ul>
        )}
      </td>
    </tr>
  );
}
