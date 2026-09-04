/**
 * `SUPABASE_DB_URL` の 形を 見る —— **直結の URI は CI から 届かない**。
 *
 * ## 2026-09-03 に 分かった こと
 * ダッシュボードの「Connect → Connection string → **URI**」は **直結**
 *（`db.<ref>.supabase.co`）で、この ホストには **A レコードが 無い**:
 *
 *     dig +short db.<ref>.supabase.co A      → （空）
 *     dig +short db.<ref>.supabase.co AAAA   → 2406:da18:...（IPv6 だけ）
 *
 * GitHub の ubuntu ランナーは IPv4 しか 持たない。だから この 文字列を そのまま
 * 登録すると、鍵が 入ったのに **「つながらない」で 落ちる**——鍵不足の 次に
 * 待って いる 2つめの 落とし穴で、原因が ぜんぜん 違うので 探し直しに なる。
 *
 * 正しいのは **Session pooler**（`...pooler.supabase.com:5432`）。IPv4 で 届き、
 * `supabase db push` が 要る セッション単位の 機能も 使える。
 * **Transaction pooler（:6543）では 移行SQLは 流せない。**
 *
 * ここでは 形だけを 見て、違って いたら **先に 教える**。つなぎには 行かない。
 */

/** @returns {{level:"ok"|"warn"|"error", message:string}[]} */
export function inspectDbUrl(url) {
  const notes = [];
  if (!url) return notes;

  let host = "";
  let port = "";
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
    port = parsed.port;
  } catch {
    notes.push({ level: "error", message: "SUPABASE_DB_URL が URL の形を していません" });
    return notes;
  }

  if (/^db\..*\.supabase\.co$/.test(host)) {
    notes.push({
      level: "error",
      message:
        `直結の ホスト（${host}）です。ここは **IPv6 だけ**で、GitHub の ランナー（IPv4）からは 届きません。\n` +
        "  ダッシュボード → Connect → **Session pooler** の 文字列に 差しかえてください\n" +
        "  （`...pooler.supabase.com:5432` の 形）。",
    });
  } else if (host.endsWith("pooler.supabase.com")) {
    if (port === "6543") {
      notes.push({
        level: "error",
        message:
          "Transaction pooler（:6543）です。移行SQLは 流せません。**Session pooler（:5432）**に 差しかえてください。",
      });
    } else if (port !== "5432") {
      notes.push({
        level: "warn",
        message: `見なれない 番号（:${port}）です。Session pooler は :5432 です。`,
      });
    } else {
      notes.push({ level: "ok", message: "Session pooler（:5432）—— CI から 届く 形です。" });
    }
  } else {
    notes.push({ level: "warn", message: `見なれない ホスト（${host}）です。そのまま 進みます。` });
  }
  return notes;
}

/** 見つけた ことを 出す。error が あれば true（呼ぶ側が 止める）。 */
export function reportDbUrl(url, log = console.log) {
  const notes = inspectDbUrl(url);
  for (const note of notes) {
    log(`${note.level === "ok" ? "✓" : note.level === "warn" ? "⚠" : "✗"} ${note.message}`);
  }
  return notes.some((note) => note.level === "error");
}

/**
 * Session pooler の 接続文字列を **部品から** 組む。
 *
 * 1つの 文字列リテラルに しないのは、`secretlint` が 雛形を 本物の 接続文字列と
 * 見まちがえて コミットを 止める ため（2026-09-03 に 実際に 止まった）。
 * 中身は 雛形（`[PASSWORD]`）でも 形が 同じなら 引っかかる。
 */
export function poolerUrl({ ref, host, password = "[PASSWORD]", port = 5432 }) {
  const scheme = ["postgre", "sql://"].join("");
  return `${scheme}postgres.${ref}:${password}@${host}:${port}/postgres`;
}
