"use client";

/**
 * Codex App Server へのブラウザ側トランスポート（08 拡張経路）。
 * kotoba-tensei の webSocketTransport.ts からテキスト生成だけを移植した。
 *
 * プロトコル: JSON-RPC 風。initialize → initialized → thread/start → turn/start。
 * 応答は通知（item/agentMessage/delta・turn/completed）で流れてくる。
 *
 * 移植で足したもの:
 * - **ターンのタイムアウト**。原典は turn/completed が来ないと Promise が永久に未解決だった。
 * - delta のストリーム表示コールバック。
 */

import { buildRetryNote, parseJsonReply } from "@/lib/ai/json-reply";

export type CodexStatus = "disconnected" | "connecting" | "connected" | "busy" | "error";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

interface ActiveTurn {
  buffer: string;
  itemTexts: Map<string, string>;
  onDelta: ((text: string) => void) | null;
  timer: ReturnType<typeof setTimeout>;
  resolve: (value: string) => void;
  reject: (error: Error) => void;
}

/** 1ターンの上限。教師向けの文章生成に3分かかるならそれは失敗として扱う。 */
const TURN_TIMEOUT_MS = 180_000;

/** 絵は文章より時間がかかる。1枚に5分かかるならそれは失敗として扱う。 */
const IMAGE_TIMEOUT_MS = 300_000;

const DEVELOPER_INSTRUCTIONS = [
  "You are a writing assistant for teachers inside an e-learning admin screen.",
  "Do not edit files, run commands, or browse. Text only.",
  "Always answer in Japanese unless asked otherwise.",
].join(" ");

/**
 * 絵をつくる用の別スレッド。
 *
 * 文章用と分ける理由は権限である。文章用は `read-only`／道具なしで足りるが、
 * 絵は **保存のためにフォルダへ書ける必要がある**。同じスレッドで兼ねると、
 * 文章を書かせるだけのときにも書き込み権限を渡すことになる。
 *
 * 書ける範囲はブリッジの作業フォルダ1つだけ（cwd に渡す）。
 */
const IMAGE_INSTRUCTIONS = [
  "You generate a single illustration with the built-in image_gen tool.",
  "Save the result to the exact output path given in the request, inside the current directory.",
  "Generate exactly once. Never regenerate because of colour variance, line wobble, or size.",
  "If the produced file is not the requested size, resize it — do not generate again.",
  "Do not write, read, or modify any other file. Do not browse.",
].join(" ");

export class CodexTransport {
  private socket: WebSocket | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private threadId: string | null = null;
  private imageThreadId: string | null = null;
  private activeTurn: ActiveTurn | null = null;
  private status: CodexStatus = "disconnected";

  constructor(private readonly onStatus?: (status: CodexStatus) => void) {}

  getStatus(): CodexStatus {
    return this.status;
  }

  private setStatus(status: CodexStatus): void {
    this.status = status;
    this.onStatus?.(status);
  }

  /**
   * @param developerInstructions 役割の指示。教材づくりと先生向けメモでは
   *   守らせたいことが違う（教材には禁止語・やさしい日本語の縛りが要る）ので、
   *   呼ぶ側が渡せるようにしてある。省くと文章づくりの既定になる。
   */
  async connect(url: string, developerInstructions = DEVELOPER_INSTRUCTIONS): Promise<void> {
    this.disconnect();
    this.setStatus("connecting");
    try {
      await this.openSocket(url);
      await this.request("initialize", {
        clientInfo: { name: "nexmax-academy", title: "Nexmax Academy 管理画面", version: "0.1.0" },
        capabilities: {
          experimentalApi: true,
          requestAttestation: false,
          optOutNotificationMethods: null,
        },
      });
      this.notify("initialized");
      const response = (await this.request("thread/start", {
        cwd: null,
        approvalPolicy: "never",
        sandbox: "read-only",
        serviceName: "Nexmax Academy",
        personality: "pragmatic",
        ephemeral: true,
        sessionStartSource: "startup",
        threadSource: "user",
        developerInstructions,
      })) as { thread: { id: string } };
      this.threadId = response.thread.id;
      this.setStatus("connected");
    } catch (error) {
      this.setStatus("error");
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
    this.threadId = null;
    this.imageThreadId = null;
    this.setStatus("disconnected");
  }

  /**
   * 絵をつくる。**戻り値はファイル名だけ**で、中身はブリッジから HTTP で取る。
   *
   * 画像を JSON-RPC の応答に載せない理由: Codex は保存先の**パス**を返す作りで、
   * バイト列を返さない。パスをブラウザが好きに読めるようにすると、任意の
   * ファイルを読める穴になる。だからブリッジの作業フォルダの中だけを見せる。
   *
   * @param outName 保存させるファイル名（`[a-z0-9_-].png` の形。呼ぶ側が決める）
   * @param refPaths 参照画像の**ローカル絶対パス**（先にブリッジへ置いたもの）
   */
  async runImage({
    prompt,
    outName,
    workdir,
    refPaths = [],
  }: {
    prompt: string;
    outName: string;
    workdir: string;
    refPaths?: readonly string[];
  }): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("先に接続してください。");
    }
    if (this.activeTurn) throw new Error("前の生成が終わるまで待ってください。");

    if (!this.imageThreadId) {
      const started = (await this.request("thread/start", {
        cwd: workdir,
        approvalPolicy: "never",
        sandbox: "workspace-write",
        serviceName: "Nexmax Academy",
        personality: "pragmatic",
        ephemeral: true,
        sessionStartSource: "startup",
        threadSource: "user",
        developerInstructions: IMAGE_INSTRUCTIONS,
      })) as { thread: { id: string } };
      this.imageThreadId = started.thread.id;
    }

    this.setStatus("busy");
    const completed = new Promise<string>((resolve, reject) => {
      this.activeTurn = {
        buffer: "",
        itemTexts: new Map(),
        onDelta: null,
        timer: setTimeout(() => {
          this.failTurn(new Error("時間内に絵ができませんでした（5分）。"));
        }, IMAGE_TIMEOUT_MS),
        resolve,
        reject,
      };
    });

    // 参照画像を先に置く。あとに置くとモデルが指示より画像を弱く扱うことがある
    const input = [
      ...refPaths.map((path) => ({ type: "localImage", path })),
      { type: "text", text: buildImageTurn(prompt, outName), text_elements: [] },
    ];

    try {
      const response = (await this.request("turn/start", {
        threadId: this.imageThreadId,
        input,
        effort: "low",
        personality: "pragmatic",
      })) as { turn: { status: string } };
      if (response.turn.status === "completed") this.settleTurn("");
      await completed;
    } catch (error) {
      this.failTurn(error instanceof Error ? error : new Error(String(error)));
      await completed;
    } finally {
      this.setStatus(this.isReady() ? "connected" : "disconnected");
    }
  }

  isReady(): boolean {
    return this.threadId !== null && this.socket?.readyState === WebSocket.OPEN;
  }

  /**
   * 1ターン実行。delta が来るたび onDelta を呼び、完成した本文を返す。
   *
   * `outputSchema` を渡すと、**最後の返事の形をプロトコル層で縛れる**
   *（`TurnStartParams.outputSchema` = "Optional JSON Schema used to constrain the
   * final assistant message for this turn"。codex-cli 0.145.0 で実在を確認）。
   * 縛っても前置きが混ざることはありうるので、読む側（`runJson`）の防御も残す。
   */
  async runText(
    prompt: string,
    onDelta?: (text: string) => void,
    outputSchema?: object,
  ): Promise<string> {
    if (!this.isReady()) throw new Error("先に接続してください。");
    if (this.activeTurn) throw new Error("前の生成が終わるまで待ってください。");
    this.setStatus("busy");

    const completed = new Promise<string>((resolve, reject) => {
      this.activeTurn = {
        buffer: "",
        itemTexts: new Map(),
        onDelta: onDelta ?? null,
        timer: setTimeout(() => {
          this.failTurn(
            new Error("時間内に応答がありませんでした（3分）。もう一度おためしください。"),
          );
        }, TURN_TIMEOUT_MS),
        resolve,
        reject,
      };
    });

    try {
      const response = (await this.request("turn/start", {
        threadId: this.threadId,
        input: [{ type: "text", text: prompt, text_elements: [] }],
        effort: "low",
        personality: "pragmatic",
        ...(outputSchema ? { outputSchema } : {}),
      })) as { turn: { id: string; status: string; items?: unknown[] } };
      if (response.turn.status === "completed") {
        this.settleTurn(collectAgentText(response.turn as unknown as Record<string, unknown>));
      }
      return await completed;
    } catch (error) {
      this.failTurn(error instanceof Error ? error : new Error(String(error)));
      return await completed;
    } finally {
      this.setStatus(this.isReady() ? "connected" : "disconnected");
    }
  }

  /**
   * 決まった形の JSON を作らせる。
   *
   * Codex には Gemini の `responseSchema` のような「形を機械で縛る」仕組みが無いので、
   * **受け取ってから確かめ、違っていたら同じスレッドで言い直させる**。
   * 同じスレッドに留めるのは、モデルが自分の前の返事を見た上で直せるようにするため
   *（新しいスレッドで頼み直すと、同じ崩れ方を繰り返す）。
   *
   * 2回試して駄目なら諦めて投げる。3回目以降を試さないのは、
   * 先生を待たせ続けるより「作れませんでした」と早く言うほうが親切だから。
   *
   * @param validate 形の検査。合っていれば値を、違っていれば理由の文字列を返す
   * @param shape 期待する形（言い直させるときにもう一度見せる）
   */
  async runJson<T>({
    prompt,
    shape,
    outputSchema,
    validate,
    onProgress,
  }: {
    prompt: string;
    shape: string;
    /** JSON Schema。渡すとプロトコル層で形を縛れる（それでも下の検査は外さない）。 */
    outputSchema?: object;
    validate: (value: unknown) => { ok: true; value: T } | { ok: false; problem: string };
    onProgress?: (text: string) => void;
  }): Promise<T> {
    let ask = prompt;
    let lastProblem = "";

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const raw = await this.runText(ask, onProgress, outputSchema);
      const parsed = parseJsonReply(raw);
      if (parsed === null) {
        lastProblem = "JSON として読めませんでした（途中で切れているか、形になっていません）";
      } else {
        const checked = validate(parsed);
        if (checked.ok) return checked.value;
        lastProblem = checked.problem;
      }
      ask = buildRetryNote(lastProblem, shape);
    }

    throw new Error(`AIの返事の形が そろいませんでした。${lastProblem}`);
  }

  private settleTurn(text: string): void {
    const turn = this.activeTurn;
    if (!turn) return;
    clearTimeout(turn.timer);
    this.activeTurn = null;
    turn.resolve(text.trim());
  }

  private failTurn(error: Error): void {
    const turn = this.activeTurn;
    if (!turn) return;
    clearTimeout(turn.timer);
    this.activeTurn = null;
    turn.reject(error);
  }

  private openSocket(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      this.socket = socket;
      socket.addEventListener("open", () => resolve());
      socket.addEventListener("message", (event) => this.handleRawMessage(String(event.data)));
      socket.addEventListener("close", () => {
        for (const p of this.pending.values()) p.reject(new Error("接続が閉じられました"));
        this.pending.clear();
        this.failTurn(new Error("接続が閉じられました"));
        this.threadId = null;
        this.setStatus("disconnected");
      });
      socket.addEventListener("error", () => reject(new Error("WebSocket接続に失敗しました")));
    });
  }

  private request(method: string, params: unknown): Promise<unknown> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("接続されていません"));
    }
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  private notify(method: string, params?: unknown): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(params === undefined ? { method } : { method, params }));
  }

  private handleRawMessage(raw: string): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    if ("id" in message && ("result" in message || "error" in message)) {
      const pending = this.pending.get(message.id as number);
      if (!pending) return;
      this.pending.delete(message.id as number);
      const err = message.error as { message?: string } | undefined;
      if (err) pending.reject(new Error(err.message ?? "リクエストが失敗しました"));
      else pending.resolve(message.result);
      return;
    }

    // サーバからの対話リクエスト（承認要求など）は使わない。未実装として返す。
    if ("id" in message && message.method) {
      this.socket?.send(
        JSON.stringify({
          id: message.id,
          error: { code: -32000, message: "interactive server requests are not implemented." },
        }),
      );
      return;
    }

    if (message.method) this.handleNotification(message);
  }

  private handleNotification(message: Record<string, unknown>): void {
    const method = message.method as string;
    const params = (message.params ?? {}) as Record<string, unknown>;
    const turn = this.activeTurn;
    if (!turn) return;

    if (method === "item/agentMessage/delta") {
      turn.buffer += (params.delta as string) ?? "";
      turn.onDelta?.(turn.buffer);
      return;
    }
    const item = params.item as Record<string, unknown> | undefined;
    if (method === "item/completed" && item?.type === "agentMessage") {
      turn.itemTexts.set(item.id as string, (item.text as string) ?? "");
      return;
    }
    if (method === "turn/completed") {
      const completedTurn = params.turn as Record<string, unknown> | undefined;
      if (completedTurn?.error) {
        const e = completedTurn.error as { message?: string };
        this.failTurn(new Error(e.message ?? JSON.stringify(completedTurn.error)));
        return;
      }
      const finalText =
        collectAgentText(completedTurn) || [...turn.itemTexts.values()].join("\n") || turn.buffer;
      this.settleTurn(finalText);
    }
  }
}

/**
 * 絵の依頼文。
 *
 * 保存先を**逐語で1回だけ**書く。ここが揺れると、Codex は自分の
 * `~/.codex/generated_images/` に置いたまま終わり、ブラウザからは取りに行けない
 *（作業フォルダの外は見せない作りにしてあるため）。
 *
 * 「作り直さない」を毎回書くのは、書かないと単色チェックのようなものに落ちたと
 * 判断して延々と作り直し、いつまでも保存されないことが実際にあったため
 *（docs/skills/codex_image_generation.md §7.1）。
 */
function buildImageTurn(prompt: string, outName: string): string {
  return [
    "Generate ONE image with the built-in image_gen tool and save it as:",
    `  ./${outName}`,
    "(relative to the current directory — do not save anywhere else).",
    "",
    "Use this prompt verbatim. Do not summarise, rephrase, or translate it:",
    "---",
    prompt,
    "---",
    "",
    "Generate exactly once. Do not regenerate because of colour variance or small details.",
    "When the file is saved, reply with just: saved",
  ].join("\n");
}

function collectAgentText(turn: Record<string, unknown> | undefined): string {
  const items = (turn?.items as Record<string, unknown>[] | undefined) ?? [];
  return items
    .filter((item) => item.type === "agentMessage")
    .map((item) => (item.text as string) ?? "")
    .join("\n")
    .trim();
}
