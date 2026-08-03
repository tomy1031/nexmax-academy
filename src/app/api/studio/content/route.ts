import { NextResponse } from "next/server";
import { contentSchema, type Content } from "@/content/schema";
import { checkForbiddenWords, checkSecretLeaks, type Finding } from "@/lib/content-checks";
import { fetchDbContents } from "@/lib/content-db";
import { createClient } from "@/lib/supabase/server";

/**
 * コンテンツスタジオの保存API（管理者専用）。
 *
 * GET  = 下書きを含む一覧
 * POST = 1件の保存（{ content, publish?, stageId? }）
 *
 * 公開してよいかは「誰が作ったか」でなく「機械検査を通ったか」で決める（設計07 §2）。
 * そのため保存の直前に content-checks.ts の検査をかけ、error があれば書かない。
 * 認可はRLSに任せきりにせずサーバ側でも profiles.is_admin を確かめる（二重の関所）。
 * 失敗応答には接続情報・DBの生メッセージを載せない（AGENTS.md 規律4）。
 */

type ServerClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;

type Gate =
  | { ok: true; supabase: ServerClient; userId: string }
  | { ok: false; response: NextResponse };

function fail(reason: string, status: number, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ ready: false, reason, ...extra }, { status });
}

async function requireAdmin(): Promise<Gate> {
  const supabase = await createClient();
  // Supabase 未設定のローカル開発。スタジオは「じゅんびちゅう」に落ちる
  if (!supabase) return { ok: false, response: fail("notConfigured", 503) };

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, response: fail("unauthorized", 401) };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || profile?.is_admin !== true) {
    return { ok: false, response: fail("forbidden", 403) };
  }

  return { ok: true, supabase, userId: user.id };
}

/**
 * 保存前の機械検査。
 * 参照整合とID重複は全コンテンツがそろって初めて判定できるため（未作成の教材を
 * 参照する下書きを止めてしまう）、ここでは1件で判定できる検査だけを走らせる。
 * 横断検査は CI の lint:content が受け持つ。
 */
function runContentChecks(content: Content): Finding[] {
  const label = `${content.kind}:${content.id}`;
  const findings = checkForbiddenWords(label, content);
  if (content.kind === "scenario") findings.push(...checkSecretLeaks(label, content));
  return findings;
}

export async function GET(): Promise<NextResponse> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const contents = await fetchDbContents({ includeDrafts: true });
  return NextResponse.json({ ready: true, contents });
}

export async function POST(request: Request): Promise<NextResponse> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: { content?: unknown; publish?: unknown; stageId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("invalidJson", 400);
  }

  const parsed = contentSchema.safeParse(body?.content);
  if (!parsed.success) {
    return fail("invalidContent", 400, {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  const content = parsed.data;

  const findings = runContentChecks(content);
  const errors = findings.filter((f) => f.level === "error");
  if (errors.length > 0) {
    return fail("checksFailed", 422, { findings: errors });
  }

  const status = body.publish === true ? "published" : "draft";
  const stageId =
    typeof body.stageId === "string" && body.stageId.length > 0
      ? body.stageId
      : content.kind === "stage"
        ? content.id
        : null;

  const { error } = await gate.supabase.from("contents").upsert(
    {
      id: content.id,
      kind: content.kind,
      data: content,
      status,
      stage_id: stageId,
      updated_by: gate.userId,
    },
    { onConflict: "id" },
  );
  if (error) return fail("saveFailed", 500);

  return NextResponse.json({
    ready: true,
    id: content.id,
    kind: content.kind,
    status,
    warnings: findings.filter((f) => f.level === "warn"),
  });
}
