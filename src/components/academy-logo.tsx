import Image from "next/image";

/**
 * アプリのロゴ。**文字で組まず、いただいたロゴの絵を出す**（2026-08-17 の指定）。
 *
 * 文字で組んだロゴ（グラデーション＋白フチ）は、字体や描画の差で
 * **場所ごとに違う見た目のロゴが並んでしまう**ので置かない。
 * 出す場所ごとに変えてよいのは**幅だけ**（`className` で `w-*` を渡す）。
 *
 * 横長（900×300）の `map_logo.webp` を使う。タイトル画面だけは
 * 正方形の `title_logo.webp`（大きく見せる用）を `variant="title"` で選ぶ。
 */
const SOURCES = {
  wide: { src: "/img/ui/map_logo.webp", width: 900, height: 300 },
  title: { src: "/img/ui/title_logo.webp", width: 800, height: 800 },
} as const;

export function AcademyLogo({
  variant = "wide",
  className,
  priority = false,
  alt = "Nexmax Academy",
}: {
  variant?: keyof typeof SOURCES;
  className?: string;
  priority?: boolean;
  /** まわりの要素が名前を持っているとき（リンクの aria-label など）は `""` にする。 */
  alt?: string;
}) {
  const { src, width, height } = SOURCES[variant];
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      // Cloudflare Workers では next/image の最適化を使わない（既存の出し方に合わせる）。
      unoptimized
      className={className}
    />
  );
}
