import Link from "next/link";
import { contentKindMeta } from "@/lib/content-kinds";
import { READ_ONLY_KINDS, type WorkStage, type WorkUnit } from "@/lib/records/learner-work";

/**
 * 1人の「工程ごとの 行った こと」（学習の きろく・願い #599 第3段）
 *
 * 生徒の 一覧で 名前を 押すと 出る。ステージ（工程）ごとに、その 生徒が 書いた・
 * 話した・打った ことばを 並べる。進み具合は 教材の 横の 印だけ。
 * 記録の ある ステージは 開いた 形で、無い ステージは 畳んで 出す。
 *
 * 色は 明るい 地に 濃い 文字だけ（濃い 地を 使わない）。
 */
export function LearnerWorkPanel({
  name,
  profileId,
  stages,
  busy,
  note,
  onClose,
}: {
  name: string;
  profileId: string;
  stages: readonly WorkStage[];
  busy: boolean;
  note: string | null;
  onClose: () => void;
}) {
  return (
    <section className="card-island mb-3 p-4 sm:p-5" aria-labelledby="work-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="work-heading" className="text-navy text-lg font-black">
          {name} さんが 行った こと（工程ごと）
        </h2>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/students/${profileId}`}
            className="border-hairline text-navy rounded-full border-2 bg-white px-3 py-1 text-xs font-black"
          >
            性格診断を 見る →
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="border-hairline text-navy rounded-full border-2 bg-white px-3 py-1 text-xs font-black"
          >
            ← 生徒の 一覧に もどる
          </button>
        </div>
      </div>
      <p className="text-ink-soft mt-1 text-xs font-bold">
        もんだいは 1回目の こたえを 出します（直した あとの 満点で つまずきが 隠れない
        ように）。読むだけの 教材は おわったか どうかだけ です。
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
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {stages.map((stage) => (
            <details
              key={stage.id || "none"}
              open={stage.touched}
              className="group border-hairline rounded-2xl border-2 bg-white"
            >
              <summary className="text-ink flex cursor-pointer flex-wrap items-baseline justify-between gap-2 px-4 py-2 font-black">
                <span>
                  <span aria-hidden className="mr-1 inline-block transition group-open:rotate-90">
                    ▸
                  </span>
                  {stage.title}
                </span>
                <span className="text-ink-soft text-xs tabular-nums">
                  おわった {stage.done} ／ {stage.total}
                </span>
              </summary>
              <ul className="flex flex-col gap-2 px-4 pb-3">
                {stage.units.map((unit) => (
                  <UnitLine key={`${unit.type}:${unit.id}`} unit={unit} />
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

const STATUS = {
  done: { label: "✓ おわった", color: "#2c7a39", border: "#58c273" },
  started: { label: "とちゅう", color: "#946410", border: "#ffc93c" },
  none: { label: "まだ", color: "#5a7089", border: "#dcebf5" },
} as const;

function UnitLine({ unit }: { unit: WorkUnit }) {
  const status = STATUS[unit.status];
  const meta = contentKindMeta(unit.type);
  return (
    <li className="border-hairline border-t pt-2 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline gap-2 text-sm font-bold">
        <span
          className="rounded-full border-2 bg-white px-2 py-0.5 text-xs font-black"
          style={{ borderColor: status.border, color: status.color }}
        >
          {status.label}
        </span>
        <span className="text-ink">
          <span aria-hidden className="mr-1">
            {meta.icon}
          </span>
          {unit.title}
        </span>
        {unit.summary ? (
          <span className="text-ink-soft text-xs tabular-nums">{unit.summary}</span>
        ) : unit.readOnly && READ_ONLY_KINDS.has(unit.type) ? (
          <span className="text-ink-soft text-xs">読む だけ</span>
        ) : null}
      </div>
      {unit.items.length > 0 ? (
        <ol className="mt-2 flex flex-col gap-1.5">
          {unit.items.map((item, i) => (
            <li
              key={i}
              className="border-l-4 bg-white py-1 pr-2 pl-3 text-sm"
              style={{
                borderColor: item.ok === false ? "#f2654a" : item.ok ? "#58c273" : "#dcebf5",
              }}
            >
              {item.prompt ? (
                <span className="text-ink-soft block text-xs font-bold">{item.prompt}</span>
              ) : null}
              <span className="text-ink font-bold">
                {item.ok === false ? "✕ " : item.ok ? "⭕ " : ""}
                {item.answer || "（空）"}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  );
}
