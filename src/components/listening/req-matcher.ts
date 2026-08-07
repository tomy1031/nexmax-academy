/**
 * 判定3層 — 学習者の質問が、要件ボードのどの項目を引き出したかを決める
 *
 * 旧アプリの既知の失敗（設計01 §3）:
 *   AIが「該当なし」と返したせいで、正しく聞けている質問が却下される。
 * 対策として、AIの判定とローカルのキーワード判定を重ね、
 * ローカルで明確なら救済する。最後の砦として手動開放を残す。
 *
 * 純関数にしてあるので、Liveがつながらない環境でも単体テストで検証できる。
 */

import { normalizeReading } from "@/lib/text/normalize";

/** 要件ボードの1項目（scenarioSchema の reqs と同じ形の一部）。 */
export interface MatchableReq {
  readonly id: string;
  readonly keywords: readonly string[];
}

export type MatchSource = "ai" | "local" | "none";

export interface MatchOutcome {
  readonly reqId: string | null;
  readonly source: MatchSource;
  /** AIは該当なしと言ったが、ローカルで拾い上げた。 */
  readonly rescued: boolean;
}

/**
 * ローカル判定。発話に含まれるキーワードが最も多い項目を選ぶ。
 * 表記ゆれは共有の正規化で吸収する（漢字・かなを別配列で持たない）。
 */
export function matchLocally(
  utterance: string,
  reqs: readonly MatchableReq[],
  openIds: ReadonlySet<string> = new Set(),
): { reqId: string | null; hits: number } {
  const haystack = normalizeReading(utterance);
  if (!haystack) return { reqId: null, hits: 0 };

  let best: string | null = null;
  let bestHits = 0;

  for (const req of reqs) {
    if (openIds.has(req.id)) continue; // すでに開いた項目は数えない
    const hits = req.keywords.filter((kw) => {
      const needle = normalizeReading(kw);
      return needle.length >= 2 && haystack.includes(needle);
    }).length;
    if (hits > bestHits) {
      best = req.id;
      bestHits = hits;
    }
  }
  return { reqId: best, hits: bestHits };
}

/** ローカル判定を「明確」とみなすキーワード一致数。 */
export const LOCAL_CONFIDENT_HITS = 2;

/**
 * AIの判定とローカル判定を重ねる。
 * - AIが項目を挙げたら、それを採用する
 * - AIが該当なしでも、ローカルで明確（キーワード2つ以上一致）なら救済する
 */
export function resolveMatch({
  utterance,
  reqs,
  openIds = new Set<string>(),
  aiReqId,
}: {
  utterance: string;
  reqs: readonly MatchableReq[];
  openIds?: ReadonlySet<string>;
  /** AIが返した項目ID。該当なしなら null。 */
  aiReqId: string | null;
}): MatchOutcome {
  const known = new Set(reqs.map((r) => r.id));

  if (aiReqId && known.has(aiReqId) && !openIds.has(aiReqId)) {
    return { reqId: aiReqId, source: "ai", rescued: false };
  }

  const local = matchLocally(utterance, reqs, openIds);
  if (local.reqId && local.hits >= LOCAL_CONFIDENT_HITS) {
    return { reqId: local.reqId, source: "local", rescued: true };
  }

  return { reqId: null, source: "none", rescued: false };
}
