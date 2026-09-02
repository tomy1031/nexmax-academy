/**
 * content/ の JSON を **zod に通した形で** 1つの TS モジュールに焼き込む。
 *
 * ## なぜ「zod に通した形」なのか（2026-09-02）
 *
 * 前は生の JSON を並べるだけで、**検証は読み手（`src/lib/content.ts`）が実行時に
 * やっていた**。git 由来の教材は `lint_content.ts` が pre-commit と CI で
 * 同じ `contentSchema` に通しているので、**Worker の上でもう一度 通す意味が無い**。
 * それなのに毎リクエストで通し直していて、これが実行時間の大半を占めていた。
 *
 * 実測（2026-09-02・手元の Mac）:
 *   - 全 kind の `contentSchema.safeParse` … **33.9 ms**
 *   - 通さずそのまま使う場合          … **0.11 ms**（約300分の1）
 * 本番の Worker では同じ処理が 500〜665 ms かかっていた（`wrangler tail` で計測）。
 * しかも zod は検証のたびに**全オブジェクトの複製**を作るので、生データと
 * 検証ずみデータを二重に抱えることになり、1 isolate 128MB のメモリも食う。
 * 同時アクセスでそこに当たると Error 1102（Worker exceeded resource limits）になる。
 *
 * そこで**検証をビルド時に寄せる**。ここで一度だけ通し、その出力を焼き込む。
 * 実行時は形が保証ずみのものとして そのまま使う（`src/lib/content.ts` の `parseKind`）。
 *
 * ## 焼き込むのは「入力」ではなく「zod の出力」である
 *
 * `contentSchema` には `.default()` が 57か所あり、**生 JSON と検証後の値は違う**
 *（`points` の 1、`accent` の "sky"、`passRate` の 70 など）。zod は既知の鍵以外を
 * 落としもする。だから焼き込むのは必ず `parsed.data` のほうで、生データを焼くと
 * 既定値が消えて画面が静かに変わる。`.transform()` や Date/Map/Set は
 * 1つも使っていないので、出力は JSON へそのまま戻せる（この前提が崩れたら
 * ここで JSON.stringify できなくなるので、黙って壊れることはない）。
 *
 * ## fs を実行時に触らない、という元からの理由（据え置き）
 *
 * `src/lib/content.ts` は以前 `readdirSync(content/)` で JSON を読んでいた。
 * ビルド時の静的生成だけなら動くが、ページに `revalidate` を付けた時点で
 * **サーバ側の再生成がリクエスト中に走る**。Cloudflare Workers には fs が無いので
 * readdirSync は失敗し、try/catch が空配列にして黙って通す。結果、デプロイ先では
 * git 由来の教材が丸ごと消える（詳細ページが404、マップはコードの既定値に後退）。
 * 実測: 2026-08-05、確認URLで /stage/m2-asakai・/manga/… が全て404、
 * /map の STEP 3 が「朝会と報告」から「報告」に戻っていた。
 *
 * 生成物は**コミットする**。ビルド順に依存させないため。
 * 中身がずれていないかは `npm run lint:content` が検査する（ずれたら error）。
 *
 * 実行は `npm run gen:content`（`scripts/generate_content_index.mjs` 経由）。
 * ここが TypeScript なのは `src/content/schema.ts` を読むためで、素の node からは
 * 直接 import できない。だから mjs 側が tsx を噛ませて呼ぶ。
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { contentSchema } from "../../src/content/schema";

const ROOT = join(import.meta.dirname, "..", "..");
const CONTENT_DIR = join(ROOT, "content");
export const GENERATED_PATH = join(ROOT, "src", "content", "git-contents.generated.ts");

/** content/ 配下の *.json を、パス順に安定して集める。 */
export function collectContentFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".json")) files.push(full);
    }
  };
  try {
    walk(CONTENT_DIR);
  } catch {
    return [];
  }
  return files;
}

/**
 * 生成するファイルの中身を組み立てる（比較にも使うので純関数にしておく）。
 *
 * スキーマに通らないファイルは**落とさずに素通しする**。ここで黙って消すと
 * 「教材が1本だけ画面から消える」という気づけない壊れ方になるためで、
 * 止めるのは `lint_content.ts` の役目（error にしてコミットも CI も落とす）。
 */
export function buildGeneratedSource(): string {
  const files = collectContentFiles();
  const items = files.map((file) => {
    const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
    const parsed = contentSchema.safeParse(raw);
    return {
      file: relative(ROOT, file).split("\\").join("/"),
      data: parsed.success ? parsed.data : raw,
    };
  });

  const body = items.map((item) => `  // ${item.file}\n  ${JSON.stringify(item.data)},`).join("\n");

  return `/**
 * 自動生成。手で編集しない（\`npm run gen:content\` で作り直す）。
 *
 * content/ の JSON を **contentSchema に通した形で** バンドルへ焼き込んだもの。
 * 実行環境の fs に依存せず読むためのファイルであり（Cloudflare Workers には fs が
 * 無い）、同時に **実行時の検証を無くす**ためのファイルでもある
 * （scripts/lib/bake_content.ts に理由と実測値）。
 * ずれていたら \`npm run lint:content\` が error で落とす。
 */

/** 検証ずみ・既定値ずみの教材（読み手はそのまま使ってよい — src/lib/content.ts）。 */
export const GIT_CONTENTS: readonly unknown[] = [
${body}
];
`;
}

export function writeGenerated(): number {
  writeFileSync(GENERATED_PATH, buildGeneratedSource());
  return collectContentFiles().length;
}

if (process.argv[1] && process.argv[1].endsWith("bake_content.ts")) {
  const count = writeGenerated();
  console.log(`${relative(ROOT, GENERATED_PATH)} を書き出しました（${count} ファイル）`);
}
