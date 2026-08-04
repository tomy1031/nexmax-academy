import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // ホームディレクトリ側の package-lock.json をワークスペース root と誤認させない。
  // 誤認すると standalone 出力の依存トレースがずれて Workers 上で壊れる。
  turbopack: { root: import.meta.dirname },
};

// `next dev` から Cloudflare のバインディングを参照できるようにする（OpenNext 要件）。
initOpenNextCloudflareForDev();

export default nextConfig;
