"use client";

/**
 * 英語の意味を4択で選ぶフェーズ。
 * 誤答選択肢は必ず英語（スキーマの noJapanese が機械検査している）。
 */
export function MeaningChoice({
  choices,
  onChoose,
  disabled,
  /** 1 → 0 の残り時間。 */
  remaining,
}: {
  choices: readonly string[];
  onChoose: (choice: string) => void;
  disabled?: boolean;
  remaining: number;
}) {
  return (
    <div className="w-full max-w-3xl">
      <div
        className="mb-3 h-2.5 w-full overflow-hidden rounded-full"
        style={{ background: "var(--color-sky-soft)" }}
        role="timer"
        aria-label="のこり時間"
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(0, remaining) * 100}%`,
            background: remaining < 0.25 ? "var(--color-coral)" : "var(--color-sky)",
          }}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {choices.map((choice) => (
          <button
            key={choice}
            type="button"
            disabled={disabled}
            onClick={() => onChoose(choice)}
            className="btn-game px-4 py-4 text-left text-base leading-snug sm:text-lg"
            style={{ "--btn-face": "#ffffff", "--btn-shadow": "#cfe6f3" } as React.CSSProperties}
          >
            <span className="text-ink font-extrabold">{choice}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
