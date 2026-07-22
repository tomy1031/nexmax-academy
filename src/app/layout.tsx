import type { Metadata } from "next";
import { M_PLUS_Rounded_1c, Noto_Sans_JP } from "next/font/google";
import "./globals.css";

// 丸ゴシック（見出し・UI・本文の主フォント）
const rounded = M_PLUS_Rounded_1c({
  variable: "--font-rounded",
  weight: ["400", "500", "700", "800"],
  subsets: ["latin"],
  display: "swap",
});

// 和文の予備（重い漢字組みのフォールバック）
const notoJp = Noto_Sans_JP({
  variable: "--font-jp",
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "にほんご しごとの島 | NEXT MAKE",
  description:
    "カンボジアのITの学生が、日本の会社で はたらくための ことばと しごとを、島を たんけんしながら たのしく まなぶ アプリ。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${rounded.variable} ${notoJp.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
