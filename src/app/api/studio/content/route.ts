import { NextResponse } from "next/server";
import { contentSchema, type Content, type Stage } from "@/content/schema";
import {
  checkDanglingRefs,
  checkForbiddenWords,
  checkSecretLeaks,
  type Finding,
} from "@/lib/content-checks";
import {
  listArticles,
  listListenings,
  listMangas,
  listQuizSets,
  listScenarios,
  listStages,
  listWordStages,
} from "@/lib/content";
import { fetchDbContents } from "@/lib/content-db";
import { createClient } from "@/lib/supabase/server";

/**
 * コンテンツスタジオの保存API（管理者専用）。
 *
 * GET    = 下書きを含む一覧
 * POST   = 1件の保存（{ content, publish?, stageId? }）
 * DELETE = 1件の削除（?id= か { id }）。DB版だけ消せる
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

/** スタジオのAPI共通の関門。/api/studio/vocab もこれを通す（関所を2つ書かない）。 */
export async function requireAdmin(): Promise<Gate> {
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

/**
 * いま存在する教材IDの集合（git ∪ DB。下書きも含む）。
 *
 * 下書きまで数えるのは、スタジオでは「参照先をまず下書きで作り、あとで公開する」
 * 作り方が普通だから。公開分だけで判定すると、直したばかりの先生に
 * 「無いID」と言い続けることになる。
 */
async function collectKnownIds(): Promise<Set<string>> {
  const [stages, mangas, articles, quizSets, listenings, scenarios, wordStages, dbEntries] =
    await Promise.all([
      listStages(),
      listMangas(),
      listArticles(),
      listQuizSets(),
      listListenings(),
      listScenarios(),
      listWordStages(),
      fetchDbContents({ includeDrafts: true }),
    ]);

  const ids = new Set<string>();
  for (const item of [
    ...stages,
    ...mangas,
    ...articles,
    ...quizSets,
    ...listenings,
    ...scenarios,
    ...wordStages,
  ]) {
    ids.add(item.id);
  }
  for (const entry of dbEntries) ids.add(entry.content.id);
  return ids;
}

/**
 * 参照切れの「気づき」だけを集める（保存は済んでいる）。
 *
 * 全教材を読む必要があるので、保存そのものより壊れやすい。ここで例外が出ても
 * 保存の成否は変えない——警告を出すための処理で「ほぞんに失敗しました」と
 * 見せてしまうと、先生は書いたものが消えたと思って作業をやり直す。
 */
async function collectDanglingWarnings(stage: Stage): Promise<Finding[]> {
  try {
    return checkDanglingRefs(stage, await collectKnownIds());
  } catch {
    return [];
  }
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
  /**
   * 公開スイッチの正はDBの status 列（＝スタジオの「こうかい」ボタン）。
   * stage は本体にも status を持ち、マップの絞り込みがそちらを見るため、
   * 保存時に列へ合わせる（二重管理で「公開したのに地図に出ない」を起こさない）。
   * status を持つのは stage だけなので、他の kind には足さない。
   */
  const data = content.kind === "stage" ? { ...content, status } : content;
  const stageId =
    typeof body.stageId === "string" && body.stageId.length > 0
      ? body.stageId
      : content.kind === "stage"
        ? content.id
        : null;

  const { error } = await gate.supabase.from("studio_contents").upsert(
    {
      id: content.id,
      kind: content.kind,
      data,
      status,
      stage_id: stageId,
      updated_by: gate.userId,
    },
    { onConflict: "id" },
  );
  if (error) return fail("saveFailed", 500);

  const warnings = findings.filter((f) => f.level === "warn");
  // 参照切れは「まだ作っていないだけ」のことが多いので、保存を通したあとに知らせる
  if (content.kind === "stage") warnings.push(...(await collectDanglingWarnings(content)));

  return NextResponse.json({
    ready: true,
    id: content.id,
    kind: content.kind,
    status,
    warnings,
  });
}

/**
 * 1件けす（スタジオの「けす」）。
 *
 * 消せるのはスタジオが作った DB 版だけ。git の content/*.json は
 * リポジトリのファイルなので、ここで消しても次の読み込みでまた出てくる。
 * 消えたように見せると、先生は一覧から消えない行を何度も消そうとするので、
 * 「消せなかった理由」を分けて返す（文言は studio-api.ts 側で組み立てる）。
 */
export async function DELETE(request: Request): Promise<NextResponse> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const id = await readDeleteId(request);
  if (!id) return fail("invalidId", 400);

  // 「引いてから消す」にすると、その間に消えた場合に取り違える。
  // 消した行をそのまま返してもらい、0件＝DBに無かった（＝git由来）と判断する。
  const { data, error } = await gate.supabase
    .from("studio_contents")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return fail("deleteFailed", 500);
  if (!data || data.length === 0) return fail("gitContent", 404);

  return NextResponse.json({ ready: true, id });
}

/** 消すIDの取り出し。DELETE に body を載せない書き方もあるので、クエリも body も受ける。 */
async function readDeleteId(request: Request): Promise<string | null> {
  const fromQuery = new URL(request.url).searchParams.get("id");
  if (fromQuery && fromQuery.length > 0) return fromQuery;
  try {
    const body = (await request.json()) as { id?: unknown };
    return typeof body?.id === "string" && body.id.length > 0 ? body.id : null;
  } catch {
    return null;
  }
}
