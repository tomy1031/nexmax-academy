import { describe, expect, it } from "vitest";
import { contentSchema } from "../src/content/schema";
import { GIT_CONTENTS } from "../src/content/git-contents.generated";

/**
 * 焼き込み（`src/content/git-contents.generated.ts`）は **contentSchema の出力**であること。
 *
 * `src/lib/content.ts` は 2026-09-02 から **実行時に zod を通さない**。git 由来の教材は
 * ここで形が保証ずみだ、という前提で そのまま画面へ渡している。前提が崩れると
 * 既定値の抜けた教材が学習者の画面に出る（`.default()` が 57か所あるので、
 * 抜けると設問の配点や色が静かに変わる）。
 *
 * `npm run lint:content` も同じずれを見るが、あちらは pre-commit と CI でしか走らない。
 * **`npm test` だけを回した人にも気づいてほしい**ので、ここにも置く。
 * 理由と実測値は scripts/lib/bake_content.ts の冒頭。
 */
describe("焼き込みずみの教材", () => {
  it("すべて contentSchema に通る", () => {
    const broken = GIT_CONTENTS.flatMap((item) => {
      const parsed = contentSchema.safeParse(item);
      if (parsed.success) return [];
      const id = item as { kind?: unknown; id?: unknown };
      return [`${String(id.kind)}:${String(id.id)} — ${parsed.error.issues[0]?.message}`];
    });
    expect(broken).toEqual([]);
  });

  it("既定値まで入った形で焼かれている（もう一度通しても変わらない）", () => {
    const changed = GIT_CONTENTS.flatMap((item) => {
      const parsed = contentSchema.safeParse(item);
      if (!parsed.success) return [];
      if (JSON.stringify(parsed.data) === JSON.stringify(item)) return [];
      const id = item as { kind?: unknown; id?: unknown };
      return [`${String(id.kind)}:${String(id.id)}`];
    });
    // ここが空でないときは `npm run gen:content` を忘れているか、
    // 焼き込みが生 JSON に戻っている（bake_content.ts が parsed.data を焼く）。
    expect(changed).toEqual([]);
  });

  it("教材が空になっていない（焼き込みの取りこぼし検知）", () => {
    expect(GIT_CONTENTS.length).toBeGreaterThan(50);
  });
});
