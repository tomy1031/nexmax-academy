/**
 * コンテンツ機械検査のロジック（検収パイプライン第1段）
 *
 * scripts/lint_content.ts（CI）と、将来のスタジオ側検査（下書きの保存前検査）が
 * 同じ関数を共用する。「誰が作ったか」でなく「検査を通ったか」で公開可否を決める
 * ため、検査ロジックはここ1か所に閉じる（設計07 §2）。
 *
 * 検査項目:
 *  - 禁止語（学習者向け文言に「不正解」等を使わない — 理解設計ガイド P8）
 *  - 秘匿情報の漏れ（シナリオ: 質問で引き出すべき事実を調査用模擬ページに書かない）
 *  - kind別ID重複（ファイル横断。重複すると進捗保存が壊れる）
 *  - 参照整合（stage.contents / wordStageIds の参照先が存在するか — 設計07 §3）
 *  - 導線の一致（article の「つぎは これ」がステージの学習順の直後を指しているか）
 */

import { FORBIDDEN_LEARNER_WORDS, type Content, type Scenario } from "../content/schema";
// areas.ts は純粋なデータ（node:fs も React も持たない）ので、
// スタジオのAPIルートから読まれるこのファイルからでも安全に import できる。
import { ROUTE_AREAS } from "../content/areas";

export interface Finding {
  file: string;
  level: "error" | "warn";
  message: string;
}

/** スキーマ検証を通ったコンテンツ1件（横断検査の入力）。 */
export interface ContentEntry {
  file: string;
  content: Content;
}

function collectStrings(value: unknown, path: string, out: [string, string][]) {
  if (typeof value === "string") {
    out.push([path, value]);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => collectStrings(v, `${path}[${i}]`, out));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      collectStrings(v, path ? `${path}.${k}` : k, out);
    }
  }
}

/** 禁止語検査。データ内の全文字列を走査する。 */
export function checkForbiddenWords(file: string, data: unknown): Finding[] {
  const findings: Finding[] = [];
  const strings: [string, string][] = [];
  collectStrings(data, "", strings);
  for (const [path, text] of strings) {
    for (const word of FORBIDDEN_LEARNER_WORDS) {
      if (text.includes(word)) {
        findings.push({
          file,
          level: "error",
          message: `禁止語「${word}」が ${path} にある — フィードバックは励まし＋次の行動に（P8）`,
        });
      }
    }
  }
  return findings;
}

/** 秘匿漏れ検査。reqs のキーワードが調査用模擬ページに書かれていたら警告。 */
export function checkSecretLeaks(file: string, scenario: Scenario): Finding[] {
  const findings: Finding[] = [];
  const pagesHtml = scenario.research.pages.map((p) => p.html).join("\n");
  for (const req of scenario.interview.reqs) {
    const leaked = req.keywords.filter((kw) => kw.length >= 2 && pagesHtml.includes(kw));
    if (leaked.length > 0) {
      findings.push({
        file,
        level: "warn",
        message: `${req.id}（${req.label}）のキーワード [${leaked.join(", ")}] が調査ページ内にある — 質問で引き出す情報なら模擬ページから削除する（P4）`,
      });
    }
  }
  return findings;
}

/**
 * IDの重複をファイル横断で検出する。
 *
 * **種別をまたいで一意**であることを求める。理由は、IDを鍵にする下位層が
 * どちらも種別を持たないからである:
 *   - 進捗の保存キー（progress/store.ts の `content:<id>`）
 *   - DBの主キー（contents.id は単独主キー）
 * 種別ごとの一意性しか見ないと、別種の同じIDが検査を素通りして、
 * 進捗が混ざり、保存時に既存の教材を黙って上書きする。
 */
export function checkDuplicateIds(entries: readonly ContentEntry[]): Finding[] {
  const findings: Finding[] = [];
  const seen = new Map<string, { file: string; kind: string }>();
  for (const { file, content } of entries) {
    const dup = seen.get(content.id);
    if (dup) {
      const across = dup.kind === content.kind ? "" : `（${dup.kind} と ${content.kind}）`;
      findings.push({
        file,
        level: "error",
        message: `ID「${content.id}」が ${dup.file} と重複している${across} — IDは種別をまたいで一意にする（進捗キーとDB主キーが種別を持たないため）`,
      });
    } else {
      seen.set(content.id, { file, kind: content.kind });
    }
  }
  return findings;
}

/**
 * マップの停留所とステージの結びつき検査（設計07 §3）。
 *
 * マップは「1ステージ＝1エリア＝背景画像1枚」（src/content/areas.ts）。step が
 * マップの上から数えた位置になる。
 *
 * - step の重複は error: マップは step でステージを引くため、重なると片方が黙って消える。
 * - 既定のエリア（ROUTE_AREAS）より先の step で `area` を書いていないのは warn:
 *   ステージ自体はマップに出る（空色の帯になる）ので消えはしない。だから止めずに、
 *   絵の付け方まで案内する——先生に step を戻させないため。
 */
export function checkStageSteps(entries: readonly ContentEntry[]): Finding[] {
  const findings: Finding[] = [];
  const byStep = new Map<number, string>();
  for (const { file, content } of entries) {
    if (content.kind !== "stage" || content.status !== "published") continue;
    const dup = byStep.get(content.step);
    if (dup) {
      findings.push({
        file,
        level: "error",
        message: `step ${content.step} が ${dup} と重なっている — マップは step でステージを引くので、片方がたどり着けなくなる`,
      });
    } else {
      byStep.set(content.step, file);
    }
    if (content.step > ROUTE_AREAS.length && !content.area) {
      findings.push({
        file,
        level: "warn",
        message: `step ${content.step} は既定のエリア（${ROUTE_AREAS.length}個）より先なのに area が無い — マップには出るが、その土地が空色の帯になる。スタジオの「マップの土地」で名前と絵を設定する（絵は docs/skills/codex_image_generation.md §7.1 の手順で Codex 生成できる）`,
      });
    }
  }
  return findings;
}

/**
 * 参照整合検査（全ファイル横断）。
 * stage.contents の各 ref が同じ type のコンテンツとして存在するか、
 * wordStageIds の各IDが wordstage として存在するかを調べ、欠けていたら error。
 */
export function checkReferenceIntegrity(entries: readonly ContentEntry[]): Finding[] {
  const findings: Finding[] = [];
  const idsByKind = new Map<string, Set<string>>();
  for (const { content } of entries) {
    const set = idsByKind.get(content.kind) ?? new Set<string>();
    set.add(content.id);
    idsByKind.set(content.kind, set);
  }

  for (const { file, content } of entries) {
    if (content.kind !== "stage") continue;
    content.contents.forEach((item, i) => {
      if (!idsByKind.get(item.type)?.has(item.ref)) {
        findings.push({
          file,
          level: "error",
          message: `contents[${i}] の参照先「${item.ref}」（${item.type}）が存在しない — ステージの参照切れ（設計07 §3）`,
        });
      }
    });
    content.wordStageIds.forEach((id) => {
      if (!idsByKind.get("wordstage")?.has(id)) {
        findings.push({
          file,
          level: "error",
          message: `wordStageIds の「${id}」が wordstage として存在しない — ステージの参照切れ（設計07 §3）`,
        });
      }
    });
  }

  // 記事の「つぎは これ」カードも参照。存在しない教材を指すとタップ先が404になる
  for (const { file, content } of entries) {
    if (content.kind !== "article") continue;
    content.blocks.forEach((block, i) => {
      if (block.kind !== "link") return;
      if (!idsByKind.get(block.type)?.has(block.ref)) {
        findings.push({
          file,
          level: "error",
          message: `blocks[${i}] の link 先「${block.ref}」（${block.type}）が存在しない — 「つぎは これ」のタップ先が404になる（設計07 §5）`,
        });
      }
    });
  }
  return findings;
}

/**
 * 導線の一致検査（設計07 §3・§5）。
 *
 * article 末尾の link ブロックは「つぎは これ」と断定して見せるので、ステージの
 * contents[] で自分の直後にある教材と食い違うと、学習者が教材を飛ばしてしまう。
 *
 * 1つの教材は複数ステージから使い回せる（コンテンツ側はステージを知らない）ため、
 * 「いずれかのステージで直後と一致すれば OK」で判定する。どのステージからも
 * 参照されていない教材は判断材料がないので検査しない。
 */
export function checkLinkOrder(entries: readonly ContentEntry[]): Finding[] {
  const findings: Finding[] = [];
  const stages = entries.flatMap(({ content }) => (content.kind === "stage" ? [content] : []));

  for (const { file, content } of entries) {
    if (content.kind !== "article") continue;
    const links = content.blocks.flatMap((block) => (block.kind === "link" ? [block] : []));
    if (links.length === 0) continue;

    // このarticleを含むステージそれぞれで「自分の直後」に来る教材
    const successors = stages.flatMap((stage) => {
      const at = stage.contents.findIndex(
        (item) => item.type === "article" && item.ref === content.id,
      );
      const next = at >= 0 ? stage.contents[at + 1] : undefined;
      return next ? [{ stageId: stage.id, next }] : [];
    });
    if (successors.length === 0) continue;

    for (const link of links) {
      const matched = successors.some(
        ({ next }) => next.type === link.type && next.ref === link.ref,
      );
      if (matched) continue;
      const expected = successors
        .map(({ stageId, next }) => `${stageId}→${next.ref}(${next.type})`)
        .join(" / ");
      findings.push({
        file,
        level: "error",
        message: `link ブロックの「${link.ref}」（${link.type}）が、ステージの学習順で直後に来る教材と違う（直後は ${expected}）— 学習者が教材を飛ばす（設計07 §3）`,
      });
    }
  }
  return findings;
}
