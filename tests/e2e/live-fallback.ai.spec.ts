import { GoogleGenAI, Modality, type Session } from "@google/genai";
import { expect, test } from "@playwright/test";
import {
  authFromToken,
  connectLiveInOrder,
  createSetupGate,
  LIVE_SETUP_TIMEOUT_MS,
  LiveSetupError,
  reasonFromClose,
} from "../../src/lib/ai/live-connect";
import { createLiveToken } from "../../src/lib/ai/live-token";
import { LIVE_TALK_MODELS } from "../../src/lib/ai/models";
import { evalKey } from "./eval-key";

/**
 * Live の 控えへ 落ちる（鍵が あるときだけ・2026-09-16）
 *
 * ## なぜ 要るか
 * たいわ・声・見かたの つなぎは、先頭の モデルに 断られたら **期限を 待たずに**
 * 控えへ 進む（`src/lib/ai/live-connect.ts`）。これは「Google は 断る とき
 * **つなぎを 閉じる**」ことに 頼って いる——閉じずに 黙る なら、1つ 9秒 待つ ことに なる。
 * 単体テスト（`tests/live_connect.test.ts` ほか）は SDK を 作り物に して いるので、
 * その 前提は ここで 本物に 当てて 確かめる。
 *
 * `live-models.ai.spec.ts` は 落ちる 先を 持たずに 先頭へ 直接 つなぐ（先頭が 使えるかを 見る）。
 * こちらは **落ちる 仕組みそのもの**を 見る。無い モデル名を 先頭に 置けば、
 * 鍵に よらず 必ず 断られる。
 *
 * Gemini は Live しか 叩かない（docs/constraints.md「Gemini は Live だけ」）。
 * 鍵が 通信の 記録に 残らない ように トレースは 切る。
 */
test.use({ trace: "off", video: "off" });

/** かならず 断られる 名前（形は 正しい ので SDK は そのまま 送る）。 */
const MISSING_MODEL = "gemini-0.0-missing-live";

const sleep = (ms: number) => new Promise((wait) => setTimeout(wait, ms));

test.describe("Live の 控えへ 落ちる（鍵が あるときだけ）", () => {
  test.beforeEach(async () => {
    test.skip(evalKey() === "", "GEMINI_API_KEY が 無いので とばしました");
    test.setTimeout(90_000);
    // 前の テストの つなぎと 間を あける（1分あたりの つなぎ数）
    await sleep(3_000);
  });

  test(`断られた モデルは 期限を 待たずに ${LIVE_TALK_MODELS[0]} へ 進む`, async () => {
    const key = evalKey();
    const tried: { model: string; ms: number; outcome: string; closeCode?: number }[] = [];
    /** 閉じられた ときの 番号（理由の 文は 鍵が 混ざりうる ので 残さない）。 */
    const closeCodes = new Map<string, number>();

    const connected = await connectLiveInOrder({
      models: [MISSING_MODEL, LIVE_TALK_MODELS[0]],
      mint: async () => authFromToken(await createLiveToken({ apiKey: key }), key),
      open: async (auth, model, claim) => {
        const started = Date.now();
        const ai = new GoogleGenAI({ apiKey: auth, apiVersion: "v1beta" });
        const gate = createSetupGate<Session>(LIVE_SETUP_TIMEOUT_MS, claim);
        try {
          // つなぎの 形は ミーティングの 声（use-live-voice.ts）と 同じ
          const session = await gate.wait(
            ai.live.connect({
              model,
              config: {
                responseModalities: [Modality.AUDIO],
                systemInstruction: "あなたは 日本の IT会社の 社長です。",
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
                speechConfig: { languageCode: "ja-JP" },
              },
              callbacks: {
                onmessage: () => {},
                onerror: () => {
                  const phase = gate.phase();
                  if (phase === "waiting" || phase === "late") gate.fail("upstream");
                },
                onclose: (event) => {
                  closeCodes.set(model, event.code);
                  const phase = gate.phase();
                  if (phase === "waiting" || phase === "late") gate.fail(reasonFromClose(event));
                },
              },
            }),
          );
          tried.push({ model, ms: Date.now() - started, outcome: "ok" });
          return session;
        } catch (error) {
          const outcome = error instanceof LiveSetupError ? error.reason : "sdk";
          tried.push({
            model,
            ms: Date.now() - started,
            outcome,
            closeCode: closeCodes.get(model),
          });
          throw error;
        }
      },
    });

    try {
      console.log(`[live-fallback] ${JSON.stringify(tried)}`);
      expect(connected.ok, `つながらない: ${JSON.stringify(tried)}`).toBe(true);
      expect(connected.ok ? connected.model : null).toBe(LIVE_TALK_MODELS[0]);
      // 無い 名前は 閉じられる（黙って 期限まで 待たせない）——控えへ すぐ 進める 前提
      expect(tried[0]?.outcome, "断られずに 期限まで 待った").not.toBe("timeout");
      expect(tried[0]?.ms ?? Infinity).toBeLessThan(LIVE_SETUP_TIMEOUT_MS);
    } finally {
      if (connected.ok) connected.session.close();
    }
  });
});
