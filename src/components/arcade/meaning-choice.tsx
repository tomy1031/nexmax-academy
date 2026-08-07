"use client";

/**
 * 英語の意味を4択で選ぶフェーズ。舞台の下端に置く。
 * 残り時間は旧アプリと同じく1本のバーで見せる。
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
  const hurry = remaining < 0.25;

  return (
    <div className="w-full">
      <div
        className="mb-3 h-3 w-full overflow-hidden rounded-full border-2 border-white bg-white/45"
        role="timer"
        aria-label="のこり時間"
      >
        <div
          className="h-full rounded-full transition-[width] duration-75"
          style={{
            width: `${Math.max(0, remaining) * 100}%`,
            background: hurry ? "var(--color-coral)" : "var(--color-sun)",
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
            style={{ "--btn-face": "#fffaf0", "--btn-shadow": "#b8deed" } as React.CSSProperties}
          >
            <span className="text-ink font-black">{choice}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
