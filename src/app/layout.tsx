import type { Metadata } from "next";
import { M_PLUS_Rounded_1c, Noto_Sans_JP } from "next/font/google";
import { RegisterOnLogin } from "@/components/register-on-login";
import "./globals.css";

/*
 * 丸ゴシック（見出し・UI・本文の主フォント）
 *
 * `preload: false` にしてある。和文フォントは Google 側で **358個に分割**されており、
 * preload を有効にすると ①全ページぶんの ファイル一覧（700KB）が Worker に 焼き込まれ
 * ②HTML の 先頭に preload の タグが 310本（1ページ ~31KB）出る。学習者の 回線にも
 * デプロイの 大きさにも 効く（実測）。`display: "swap"` があるので、読み込みの あいだは
 * 代わりの 字で 表示され、あとから 差し替わる。
 */
const rounded = M_PLUS_Rounded_1c({
  variable: "--font-rounded",
  weight: ["400", "500", "700", "800"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
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
  title: "Nexmax Academy | NEXT MAKE",
  description:
    "ネクマックスアカデミーは、カンボジアのITの学生が、日本の会社で はたらくための ことばと しごとを、みちを 一歩ずつ すすみながら たのしく まなぶ アプリです。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${rounded.variable} ${notoJp.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {/* 画面は出さない。ログインした人を登録し、端末にある情報を送る（2026-08-25）。 */}
        <RegisterOnLogin />
        {children}
      </body>
    </html>
  );
}
