#!/usr/bin/env node
/**
 * switch_supabase — アプリ（STG・本番・確認URL）が使う Supabase のプロジェクトを、コマンド1つで切り替える
 *
 * 2026-11-21 tomy さん「相互のDBは簡単に切り替えできるように準備はしておいてください」。
 * 古いプロジェクト（402 で止まっていた方）と、別のアカウントの新しいプロジェクトを行き来できるようにする。
 *
 * 使いかた（tomy さんの Mac で）:
 *   node scripts/switch_supabase.mjs                 保存してあるプロジェクトと、いまの向き先を出す
 *   node scripts/switch_supabase.mjs save [URL|ref]  そのプロジェクトの値を1回だけ保存する（合言葉と公開の鍵を貼る）
 *   node scripts/switch_supabase.mjs use <ref>       そのプロジェクトへ切り替える（貼るものは無い）
 *
 * use がすること: GitHub の Environment「Preview」の3つの鍵と、見張りの SUPABASE_URL を差し替え、STG を作り直す。
 * 本番は次の本番デプロイ（授業前の自動）から切り替わる（NEXT_PUBLIC_* はビルドのときに焼き込まれるため）。
 *
 * **データは写さない。** 切り替えたあとに書かれた記録（学生の答え・修了証など）は、そのとき使っている DB にしか残らない。
 * 戻した先には、その間の記録が無い。行き来する前に、どちらの DB に記録が増えたかを確かめる（docs/deploy.md §0.22）。
 */

import { spawnSync } from "node:child_process";
import { findPoolerHost } from "./find_db_host.mjs";
import { poolerUrl } from "./lib/db_url.mjs";
import {
  applyProfile,
  askHidden,
  askVisible,
  currentState,
  deployStaging,
  findPsql,
  listProfiles,
  loadProfile,
  PROFILE_DIR,
  saveProfile,
} from "./lib/supabase_profiles.mjs";
import { anonKeyProblems, projectRefFrom } from "./move_to_new_supabase.mjs";

function show() {
  const profiles = listProfiles();
  const current = currentState();
  console.log(`■ 保存してあるプロジェクト（${PROFILE_DIR}）`);
  if (profiles.length === 0) console.log("  （まだありません。save で保存します）");
  for (const p of profiles)
    console.log(
      `  ${p.ref}  保存 ${p.savedAt.slice(0, 16).replace("T", " ")} UTC${current?.ref === p.ref ? "  ← いまの向き先" : ""}`,
    );
  if (current)
    console.log(
      `■ 最後に切り替えた先: ${current.ref}（${current.at.slice(0, 16).replace("T", " ")} UTC）`,
    );
  console.log("\n切り替え: node scripts/switch_supabase.mjs use <ref>");
  console.log("保存    : node scripts/switch_supabase.mjs save <プロジェクトの URL>");
}

async function save(arg) {
  let ref = projectRefFrom(arg ?? "");
  while (!ref) {
    ref = projectRefFrom(
      await askVisible(
        "保存するプロジェクトの URL か project-ref（ダッシュボードの URL のままでよい）: ",
      ),
    );
    if (!ref)
      console.error("  project-ref（英小文字と数字の20文字）が読み取れません。もう一度どうぞ。");
  }
  const psql = findPsql();
  if (!psql)
    throw new Error("psql がありません。brew install libpq を実行してから、もう一度どうぞ。");

  console.log(`■ ${ref} の入口（Session pooler）を探します`);
  const host = await findPoolerHost(ref, console.log);
  if (!host) throw new Error("入口が見つかりません。project-ref を確かめてください。");

  let password = "";
  for (let tries = 1; ; tries++) {
    password = await askHidden(
      `\n${ref} の DB の合言葉（Database password。打った字は出ません）: `,
    );
    const probe = spawnSync(
      psql,
      [
        "-X",
        "-h",
        host,
        "-p",
        "5432",
        "-U",
        `postgres.${ref}`,
        "-d",
        "postgres",
        "-A",
        "-t",
        "-c",
        "select 1",
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PGPASSWORD: password,
          PGSSLMODE: "require",
          PGCONNECT_TIMEOUT: "20",
        },
      },
    );
    if (probe.status === 0) break;
    const why = /password authentication failed/i.test(probe.stderr)
      ? "合言葉がちがいます（分からなければ、そのプロジェクトの Project Settings → Database → Reset database password）"
      : "つながりません";
    if (tries >= 5) throw new Error(`${why}。5回ちがったのでやめました。`);
    console.error(`  ${why}。もう一度どうぞ（やめるときは Ctrl+C）。`);
  }
  console.log("✓ つながりました");

  let anonKey = "";
  for (;;) {
    anonKey = await askHidden(
      `${ref} の公開の鍵（Project Settings → API Keys の anon public か Publishable key。打った字は出ません）: `,
    );
    const problems = anonKeyProblems(anonKey, ref);
    if (problems.length === 0) {
      const res = await fetch(`https://${ref}.supabase.co/auth/v1/settings`, {
        headers: { apikey: anonKey },
      }).catch(() => null);
      if (res?.ok) break;
      if (res?.status === 402) {
        console.log(
          "  （このプロジェクトはいま通信量の上限で止まっているので、鍵が使えるかは確かめていません）",
        );
        break;
      }
      problems.push(
        `その鍵でこのプロジェクトに入れません（HTTP ${res?.status ?? "つながらない"}）`,
      );
    }
    console.error(`  ${problems.join("・")}。もう一度どうぞ（やめるときは Ctrl+C）。`);
  }

  const file = saveProfile({
    ref,
    dbUrl: poolerUrl({ ref, host, password: encodeURIComponent(password) }),
    anonKey,
  });
  console.log(
    `✓ 暗号化して保存しました（${file}）。切り替えは node scripts/switch_supabase.mjs use ${ref}`,
  );
}

function switchTo(arg) {
  const ref = projectRefFrom(arg ?? "");
  if (!ref)
    throw new Error(
      "切り替え先の ref を書いてください（node scripts/switch_supabase.mjs use <ref>）",
    );
  const profile = loadProfile(ref);
  console.log(`■ アプリの向き先を ${ref} へ切り替えます`);
  console.log(
    "  切り替えたあとに書かれた記録は、切り替え先の DB にしか残りません（いまの DB の記録は写しません）。",
  );
  applyProfile(profile);
  deployStaging();
  console.log(
    "\n✓ 切り替えました。STG は今からの作り直しで、本番は次の本番デプロイ（授業前の自動）から、このプロジェクトを使います。",
  );
}

const [command, arg] = process.argv.slice(2);
try {
  if (!command || command === "list") show();
  else if (command === "save") await save(arg);
  else if (command === "use") switchTo(arg);
  else {
    console.error(`知らないコマンドです: ${command}（list・save・use のどれか）`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`\n✗ ${error.message}`);
  process.exitCode = 1;
}
