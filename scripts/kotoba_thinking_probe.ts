/**
 * Gemini Live Extended Thinking で 関数呼び出しが どの 設定なら 通るかを 確かめる 小さな 試験。
 * 文字の ターンで「関数を 呼んで」と 頼み、届いた メッセージを 記録する。
 * 結果: kotoba-town/out/thinking_probe.json
 * 使い方: GEMINI_API_KEY=… node --import tsx scripts/kotoba_thinking_probe.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";

const apiKey = process.env.GEMINI_API_KEY ?? "";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  if (!apiKey) throw new Error("GEMINI_API_KEY が ありません");
  const { connectLive, THINKING_MODEL } = await import("../kotoba-town/js/talk/live.js");
  const { judgeTool, JUDGE_TOOL } = await import("../kotoba-town/js/talk/judge.js");

  const ping = (behavior?: string) => ({
    functionDeclarations: [{
      name: "record_answer",
      description: "Record your evaluation of the candidate's answer.",
      ...(behavior ? { behavior } : {}),
      parameters: { type: "OBJECT", properties: { score: { type: "INTEGER", description: "0-3" }, tip_en: { type: "STRING" } }, required: ["score", "tip_en"] },
    }],
  });
  const interview = judgeTool({ interview: true, nonBlocking: true });
  const basicNB = { functionDeclarations: JUDGE_TOOL.functionDeclarations.map((d: Record<string, unknown>) => ({ ...d, behavior: "NON_BLOCKING" })) };

  const cases: { name: string; tools: unknown; thinking?: string | null; fn: string; modalities?: string[] }[] = [
    { name: "simple NON_BLOCKING + LOW", tools: ping("NON_BLOCKING"), thinking: "LOW", fn: "record_answer" },
    { name: "simple, no behavior + LOW", tools: ping(), thinking: "LOW", fn: "record_answer" },
    { name: "simple NON_BLOCKING, no thinkingConfig", tools: ping("NON_BLOCKING"), thinking: null, fn: "record_answer" },
    { name: "basic judge NON_BLOCKING + LOW", tools: basicNB, thinking: "LOW", fn: "judge_reply" },
    { name: "interview judge NON_BLOCKING + LOW", tools: interview, thinking: "LOW", fn: "judge_reply" },
  ];
  const results: unknown[] = [];
  for (const c of cases) {
    const log: string[] = [];
    const t0 = Date.now();
    let session: { sendText: (t: string, done: boolean) => boolean; sendToolResponse: (r: unknown[]) => boolean; close: () => void } | null = null;
    const res = await connectLive({
      apiKey,
      models: [THINKING_MODEL],
      setup: {
        generationConfig: {
          responseModalities: c.modalities || ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Callirrhoe" } } },
          ...(c.thinking ? { thinkingConfig: { thinkingLevel: c.thinking } } : {}),
        },
        systemInstruction: { parts: [{ text: `You are a job interviewer in Japan. Whenever you receive a candidate's answer, call the function ${c.fn} immediately with your evaluation. Do not speak before calling it.` }] },
        tools: [c.tools],
        outputAudioTranscription: {},
      },
      handlers: {
        onRaw: (msg: Record<string, any>) => {
          const sc = msg.serverContent;
          const keys = Object.keys(msg).filter((k) => k !== "serverContent");
          const scKeys = sc ? Object.keys(sc).filter((k) => k !== "modelTurn") : [];
          const parts = (sc?.modelTurn?.parts || []).map((p: Record<string, any>) => (p.inlineData ? "audio" : Object.keys(p).join("+")));
          log.push(`${Date.now() - t0} ${keys.join(",")}${sc ? ` sc{${scKeys.join(",")}${parts.length ? ` parts:${[...new Set(parts)].join("|")}` : ""}}` : ""}${msg.toolCall ? ` ${JSON.stringify(msg.toolCall).slice(0, 300)}` : ""}${sc?.outputTranscription?.text ? ` out:${sc.outputTranscription.text}` : ""}${sc?.modelTurn?.parts?.find((p: any) => p.text) ? ` text:${sc.modelTurn.parts.find((p: any) => p.text).text.slice(0, 120)}` : ""}`);
        },
        onToolCall: (calls: { id: string; name: string }[]) => {
          for (const call of calls) session?.sendToolResponse([{ id: call.id, name: call.name, response: { ok: true } }]);
        },
        onClose: (reason: string, ev: { code?: number; reason?: string }) => log.push(`close ${reason} ${ev?.code ?? ""} ${String(ev?.reason ?? "").slice(0, 200)}`),
      },
    });
    if (!res.ok) {
      results.push({ case: c.name, ok: false, reason: res.reason, tried: res.tried });
      console.log(c.name, "→ setup failed", res.reason, JSON.stringify(res.tried));
      continue;
    }
    session = res.session;
    session.sendText("Candidate's answer to 「志望動機を 教えて ください」: 「日本で 働きたいからです。日本の 会社は いいと 思います。」 Evaluate it now with the function.", true);
    for (let i = 0; i < 60 && !log.some((l) => l.includes("toolCall")); i++) await sleep(500);
    await sleep(4000);
    session.close();
    const called = log.some((l) => l.includes("toolCall") || l.includes("functionCall"));
    results.push({ case: c.name, ok: true, called, log });
    console.log(`${c.name} → ${called ? "CALLED" : "no call"}`);
    for (const l of log) console.log("   ", l);
    await sleep(3000);
  }
  mkdirSync("kotoba-town/out", { recursive: true });
  writeFileSync("kotoba-town/out/thinking_probe.json", JSON.stringify({ at: new Date().toISOString(), results }, null, 1) + "\n");
}

void main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
