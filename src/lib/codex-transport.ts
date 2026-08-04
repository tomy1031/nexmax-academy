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

const DEVELOPER_INSTRUCTIONS = [
  "You are a writing assistant for teachers inside an e-learning admin screen.",
  "Do not edit files, run commands, or browse. Text only.",
  "Always answer in Japanese unless asked otherwise.",
].join(" ");

export class CodexTransport {
  private socket: WebSocket | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private threadId: string | null = null;
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

  async connect(url: string): Promise<void> {
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
        developerInstructions: DEVELOPER_INSTRUCTIONS,
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
    this.setStatus("disconnected");
  }

  isReady(): boolean {
    return this.threadId !== null && this.socket?.readyState === WebSocket.OPEN;
  }

  /** 1ターン実行。delta が来るたび onDelta を呼び、完成した本文を返す。 */
  async runText(prompt: string, onDelta?: (text: string) => void): Promise<string> {
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

function collectAgentText(turn: Record<string, unknown> | undefined): string {
  const items = (turn?.items as Record<string, unknown>[] | undefined) ?? [];
  return items
    .filter((item) => item.type === "agentMessage")
    .map((item) => (item.text as string) ?? "")
    .join("\n")
    .trim();
}
