import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * incrementalCache は意図的に未設定。ISR / on-demand revalidate を使っていないため
 * SSR は設定なしで動き、R2 バケットを増やさずに無料枠へ収まる（wrangler.jsonc 参照）。
 */
export default defineCloudflareConfig();
