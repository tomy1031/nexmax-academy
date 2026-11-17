/**
 * 最新の google-genai（公式 SDK）で、Gemini 3.8 Live Extended Thinking の 関数呼び出しが 通るかを 確かめる。
 * アプリは SDK を 使わず Live に 直接 つないで いるので、SDK と 結果が 同じなら 原因は 通信の 書き方ではない。
 * 使い方: GENAI_DIR=<@google/genai を 入れた フォルダ> GEMINI_API_KEY=… node scripts/kotoba_sdk_probe.mjs
 */
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";

const req = createRequire(`${process.env.GENAI_DIR}/`);
const genai = req("@google/genai");
const { GoogleGenAI, Modality, Behavior, Type } = genai;
const version = req("@google/genai/package.json").version;
const apiKey = process.env.GEMINI_API_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { version, results: [] };

for (const apiVersion of ["v1beta", "v1alpha"]) {
  for (const behavior of [Behavior.NON_BLOCKING, undefined]) {
    const name = `${apiVersion} ${behavior || "default"}`;
    const log = [];
    const t0 = Date.now();
    let called = false;
    const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion } });
    let session;
    try {
      session = await ai.live.connect({
        model: "gemini-3.8-live-extended-thinking",
        config: {
          responseModalities: [Modality.AUDIO],
          thinkingConfig: { thinkingLevel: "LOW" },
          outputAudioTranscription: {},
          systemInstruction: "You are a job interviewer in Japan. Whenever you receive a candidate's answer, call record_answer with your evaluation before saying anything.",
          tools: [{ functionDeclarations: [{ name: "record_answer", description: "Record your evaluation of the candidate's answer.", ...(behavior ? { behavior } : {}), parameters: { type: Type.OBJECT, properties: { score: { type: Type.INTEGER }, tip_en: { type: Type.STRING } }, required: ["score", "tip_en"] } }] }],
        },
        callbacks: {
          onmessage: (m) => {
            const sc = m.serverContent;
            if (m.toolCall) { called = true; log.push(`${Date.now() - t0} toolCall ${JSON.stringify(m.toolCall).slice(0, 300)}`); session?.sendToolResponse({ functionResponses: m.toolCall.functionCalls.map((c) => ({ id: c.id, name: c.name, response: { ok: true } })) }); }
            if (sc?.outputTranscription?.text) log.push(`${Date.now() - t0} out:${sc.outputTranscription.text}`);
            if (sc?.interactionStatus || sc?.turnComplete) log.push(`${Date.now() - t0} ${sc.interactionStatus || ""} ${sc.turnComplete ? "turnComplete" : ""} ${sc.turnCompleteReason || ""}`);
            for (const p of sc?.modelTurn?.parts || []) if (p.functionCall) { called = true; log.push(`${Date.now() - t0} part.functionCall ${JSON.stringify(p.functionCall).slice(0, 200)}`); }
          },
          onerror: (e) => log.push(`error ${String(e?.message || e)}`),
          onclose: (e) => log.push(`close ${e?.code ?? ""} ${String(e?.reason ?? "").slice(0, 200)}`),
        },
      });
      session.sendClientContent({ turns: [{ role: "user", parts: [{ text: "Candidate's answer to 「志望動機を 教えて ください」: 「日本で 働きたいからです。」 Evaluate it now with record_answer." }] }], turnComplete: true });
      for (let i = 0; i < 60 && !called; i++) await sleep(500);
      await sleep(3000);
      session.close();
    } catch (e) {
      log.push(`connect failed: ${String(e?.message || e).slice(0, 300)}`);
    }
    out.results.push({ case: name, called, log });
    console.log(`${name} → ${called ? "CALLED" : "no call"}`);
    for (const l of log) console.log("   ", l);
    await sleep(3000);
  }
}
mkdirSync("kotoba-town/out", { recursive: true });
writeFileSync("kotoba-town/out/sdk_probe.json", JSON.stringify(out, null, 1) + "\n");
console.log(`@google/genai ${version}`);
