import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    /**
     * ワークスペースの根をこのリポジトリに固定する。
     *
     * 指定しないと、Turbopack は上位ディレクトリの lockfile を見つけて
     * そちらを根と推測する（開発機のホームに package-lock.json があると
     * /Users/<name> が根になる）。リポジトリ外のファイルを巻き込んで
     * ビルドが壊れるため、明示する。
     */
    root: import.meta.dirname,
  },
};

export default nextConfig;
