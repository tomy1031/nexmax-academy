/**
 * スタジオとサーバのやりとり（ブラウザ側）
 *
 * 保存API（/api/studio/content）と Storage への画像アップロードをここにまとめる。
 * 画面側は「うまくいったか・どこを直すか」だけを受け取れば済むようにし、
 * HTTPステータスや DB のメッセージを画面に持ち込まない（AGENTS.md 規律4）。
 */

import { z } from "zod";
import { contentSchema, type Content } from "@/content/schema";
import { createClient } from "@/lib/supabase/client";
import { describePath, messageForReason, toWarningMessages, type SaveIssue } from "./issue-text";

/** DB由来のコンテンツ1件（下書きを含む）。 */
export interface DbEntry {
  content: Content;
  status: "draft" | "published";
  stageId: string | null;
  updatedAt: string;
}

const dbEntrySchema = z.object({
  content: contentSchema,
  status: z.enum(["draft", "published"]).catch("draft"),
  stageId: z.string().nullable().catch(null),
  updatedAt: z.string().catch(""),
});

export type DbListResult =
  | { ok: true; entries: DbEntry[] }
  /** preparing = DB未設定。機能が壊れているのではなく「これから使える」状態。 */
  | { ok: false; message: string; preparing: boolean };

export type SaveResult =
  /**
   * warnings = 保存は通ったが 先生に 見てほしい こと（参照切れなど）。
   * 止める理由ではないので issues とは 別に 持つ。
   */
  | { ok: true; status: "draft" | "published"; warnings: string[] }
  | { ok: false; message: string; issues: SaveIssue[] };

interface FailBody {
  reason?: unknown;
  issues?: unknown;
  findings?: unknown;
}

async function readFailBody(response: Response): Promise<FailBody> {
  try {
    return (await response.json()) as FailBody;
  } catch {
    return {};
  }
}

function toIssues(body: FailBody, kind?: string): SaveIssue[] {
  const issues: SaveIssue[] = [];
  if (Array.isArray(body.issues)) {
    for (const raw of body.issues) {
      if (raw && typeof raw === "object") {
        const { path, message } = raw as { path?: unknown; message?: unknown };
        issues.push({
          where: describePath(typeof path === "string" ? path : "", kind),
          message: typeof message === "string" ? message : "なおしてください。",
        });
      }
    }
  }
  if (Array.isArray(body.findings)) {
    for (const raw of body.findings) {
      if (raw && typeof raw === "object") {
        const { message } = raw as { message?: unknown };
        if (typeof message === "string") issues.push({ where: "ことばの検査", message });
      }
    }
  }
  return issues;
}

/** 下書きを含むDB一覧。DB未設定・権限なしは「使えない理由」として返す。 */
export async function fetchDbList(): Promise<DbListResult> {
  let response: Response;
  try {
    response = await fetch("/api/studio/content", { cache: "no-store" });
  } catch {
    return {
      ok: false,
      preparing: false,
      message: "つうしんに 失敗しました。ネットワークを たしかめてください。",
    };
  }

  if (!response.ok) {
    const body = await readFailBody(response);
    const reason = typeof body.reason === "string" ? body.reason : "";
    return {
      ok: false,
      preparing: response.status === 503,
      message: messageForReason(reason),
    };
  }

  const body = (await response.json()) as { contents?: unknown };
  const rows = Array.isArray(body.contents) ? body.contents : [];
  // 規格が進化して古い行が残っていても一覧が壊れないよう、通ったものだけ出す
  const entries = rows.flatMap((row) => {
    const parsed = dbEntrySchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
  return { ok: true, entries };
}

/** 送る前にブラウザ側でも同じスキーマで検査する（往復せずに直せるように）。 */
export function validateContent(draft: unknown): SaveIssue[] {
  const parsed = contentSchema.safeParse(draft);
  if (parsed.success) return [];
  // 種類ごとに欄の呼び名が違う（もんだいの「もんだい」＝ミーティングの「しつもん」）。
  // 検査で落ちた下書きでも kind だけは読めるので、そこから画面の言葉に合わせる。
  const kind = draft && typeof draft === "object" ? (draft as { kind?: unknown }).kind : undefined;
  const kindName = typeof kind === "string" ? kind : undefined;
  return parsed.error.issues.map((issue) => ({
    where: describePath(issue.path.map((part) => String(part)).join("."), kindName),
    message: issue.message,
  }));
}

/** 保存。publish=false が「したがき」、true が「こうかい」。 */
export async function saveContent(content: Content, publish: boolean): Promise<SaveResult> {
  const localIssues = validateContent(content);
  if (localIssues.length > 0) {
    return { ok: false, message: messageForReason("invalidContent"), issues: localIssues };
  }

  let response: Response;
  try {
    response = await fetch("/api/studio/content", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, publish }),
    });
  } catch {
    return {
      ok: false,
      message: "つうしんに 失敗しました。ネットワークを たしかめてください。",
      issues: [],
    };
  }

  if (!response.ok) {
    const body = await readFailBody(response);
    const reason = typeof body.reason === "string" ? body.reason : "";
    return { ok: false, message: messageForReason(reason), issues: toIssues(body, content.kind) };
  }

  // 成功しても本文を読む。参照切れの「気づき」はここにしか載っていないので、
  // 読み捨てると先生は公開したあとも気づけない（issue-text の toWarningMessages 参照）。
  let warnings: string[] = [];
  try {
    const body = (await response.json()) as { warnings?: unknown };
    warnings = toWarningMessages(body.warnings);
  } catch {
    // 本文が読めなくても保存そのものは通っている。気づきだけ諦める。
    warnings = [];
  }
  return { ok: true, status: publish ? "published" : "draft", warnings };
}

export type DeleteResult =
  /**
   * revertedToGit = 消えたのは **先生の 直しだけ**（同じ id の 実体が git にも あり、
   * 一覧には git版が 残る）。true のまま「けしました」と 言わない。
   */
  { ok: true; revertedToGit: boolean } | { ok: false; message: string };

/**
 * 1件けす。消せるのはスタジオが作ったDB版だけ。
 *
 * git の content/*.json で作った教材はリポジトリのファイルなので、
 * サーバが「消せなかった」と返す。ここで理由を言い分けないと、
 * 先生は一覧から消えない行を何度も押すことになる。
 *
 * git にも DBにも ある ものは **消せるが 消えない**（DB版だけ 消えて git版が 出る）。
 * サーバの `revertedToGit` を そのまま 渡す——画面で 推し量ると、いつか ずれる。
 */
export async function deleteContent(id: string): Promise<DeleteResult> {
  let response: Response;
  try {
    response = await fetch(`/api/studio/content?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  } catch {
    return { ok: false, message: "つうしんに 失敗しました。ネットワークを たしかめてください。" };
  }

  if (!response.ok) {
    const body = await readFailBody(response);
    const reason = typeof body.reason === "string" ? body.reason : "";
    if (reason === "gitContent") {
      return {
        ok: false,
        message: "これは git の ファイルで つくった 教材です。スタジオからは けせません。",
      };
    }
    if (reason === "deleteFailed") {
      return {
        ok: false,
        message: "けすのに 失敗しました。少し待って もう一度 ためしてください。",
      };
    }
    return { ok: false, message: messageForReason(reason) };
  }

  let revertedToGit = false;
  try {
    const body = (await response.json()) as { revertedToGit?: unknown };
    revertedToGit = body?.revertedToGit === true;
  } catch {
    // 本文が読めなくても消したこと自体は成功。言い方だけ控えめにする。
  }
  return { ok: true, revertedToGit };
}

export type UploadResult = { ok: true; url: string } | { ok: false; message: string };

/** ファイル名をURLに置ける形にする（日本語ファイル名でも壊れないように）。 */
function safeExtension(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : "png";
}

/**
 * 画像を Storage の assets バケットへ置き、公開URLを返す。
 * 書き込みは管理者だけ（RLS）。未設定のローカル開発では「じゅんびちゅう」を返す。
 */
export async function uploadAsset(file: File, prefix: string): Promise<UploadResult> {
  const supabase = createClient();
  if (!supabase) {
    return { ok: false, message: "がぞうの アップロードは じゅんびちゅう（DB設定後に使えます）" };
  }

  const folder = prefix.replace(/[^a-zA-Z0-9/_-]/g, "-").replace(/^\/+|\/+$/g, "") || "studio";
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `${folder}/${unique}.${safeExtension(file.name)}`;

  const { error } = await supabase.storage.from("assets").upload(path, file, {
    contentType: file.type.length > 0 ? file.type : undefined,
    upsert: false,
  });
  if (error) {
    return { ok: false, message: "アップロードに 失敗しました。もう一度 ためしてください。" };
  }

  const { data } = supabase.storage.from("assets").getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}
