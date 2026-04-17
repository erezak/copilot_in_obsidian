/**
 * Copilot CLI wrapper.
 *
 * Spawns `copilot --headless` which starts a local TCP JSON-RPC server,
 * then communicates with it using the Copilot SDK protocol.
 * Auth is handled automatically by the CLI's stored credentials.
 */

import { spawn, execSync, ChildProcess } from "child_process";
import { existsSync } from "fs";
import { randomUUID } from "crypto";
import { JsonRpcClient } from "./JsonRpcClient";

// ── Public event types ────────────────────────────────────────────────────────

export type CopilotEvent =
    | { type: "text"; content: string; messageId: string }          // final complete message
    | { type: "text_delta"; delta: string; messageId: string }      // incremental chunk
    | { type: "tool_start"; toolName: string; toolCallId: string }
    | { type: "tool_done"; toolName: string; toolCallId: string }
    | { type: "idle"; aborted: boolean }
    | { type: "error"; errorType: string; message: string };

export type CopilotEventHandler = (event: CopilotEvent) => void;

// ── Attachment type for file context ─────────────────────────────────────────

export interface FileAttachment {
    type: "file";
    path: string;
    displayName?: string;
}

// ── Model info ────────────────────────────────────────────────────────────────

export interface ModelInfo {
    id: string;
    name: string;
}

// ── Resolve copilot binary path ───────────────────────────────────────────────

function resolveCopilotBinary(): string {
    // Well-known install locations
    const candidates = [
        "/opt/homebrew/bin/copilot",
        "/usr/local/bin/copilot",
        "/usr/bin/copilot",
    ];
    for (const p of candidates) {
        if (existsSync(p)) return p;
    }
    // Try `which` as fallback (may work if PATH is partially set)
    try {
        const result = execSync("which copilot 2>/dev/null", { timeout: 3000 }).toString().trim();
        if (result && existsSync(result)) return result;
    } catch { /* ignore */ }
    // Last resort: hope it's on PATH
    return "copilot";
}

// ── Main client ───────────────────────────────────────────────────────────────

export class CopilotCLIClient {
    private rpc = new JsonRpcClient();
    private cliProcess: ChildProcess | null = null;
    private sessionHandlers = new Map<string, Set<CopilotEventHandler>>();

    async start(): Promise<void> {
        const binary = resolveCopilotBinary();

        this.cliProcess = spawn(binary, [
            "--headless",
            "--no-auto-update",
            "--log-level", "warning",
        ], {
            stdio: ["ignore", "pipe", "pipe"],
            // Extend PATH so the CLI can find its own dependencies
            env: {
                ...process.env,
                PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH ?? ""}`,
            },
        });

        this.cliProcess.on("exit", () => {
            this.cliProcess = null;
        });

        const port = await this.waitForPort();
        await this.rpc.connect("127.0.0.1", port);
        this.rpc.onNotification("session.event", (p) => this.dispatchEvent(p));
        await this.rpc.sendRequest("ping", {});
    }

    private waitForPort(): Promise<number> {
        return new Promise((resolve, reject) => {
            if (!this.cliProcess) {
                reject(new Error("copilot CLI process failed to start"));
                return;
            }

            // Handle process-level errors (e.g., binary not found)
            this.cliProcess.once("error", (err) => {
                const spawnErr = err as NodeJS.ErrnoException;
                if (spawnErr.code === "ENOENT") {
                    reject(new Error(
                        "copilot CLI not found. Install it: brew install gh && gh extension install github/gh-copilot  " +
                        "or: npm install -g @github/copilot-cli"
                    ));
                } else {
                    reject(new Error(`copilot CLI error: ${err.message}`));
                }
            });

            // Port may be announced on stdout or stderr — listen to both
            let buf = "";
            const onData = (data: Buffer) => {
                buf += data.toString();
                const m = buf.match(/listening on port (\d+)/i);
                if (m) {
                    resolve(parseInt(m[1], 10));
                }
            };

            this.cliProcess.stdout?.on("data", onData);
            this.cliProcess.stderr?.on("data", onData);

            this.cliProcess.once("exit", (code) =>
                reject(new Error(`copilot CLI exited (code ${code ?? "?"}) before announcing port`))
            );

            setTimeout(() =>
                reject(new Error("copilot CLI startup timeout. Run 'copilot --version' in your terminal to verify it works.")),
                20_000
            );
        });
    }

    private dispatchEvent(params: unknown): void {
        if (typeof params !== "object" || params === null) return;
        const { sessionId, event } = params as { sessionId?: string; event?: Record<string, unknown> };
        if (!sessionId || !event) return;

        const handlers = this.sessionHandlers.get(sessionId);
        const type = event.type as string;
        const data = (event.data ?? {}) as Record<string, unknown>;

        // Auto-approve permissions so the CLI can operate freely in the vault
        if (type === "permission.requested") {
            const requestId = data.requestId as string | undefined;
            if (requestId) {
                void this.rpc.sendRequest("session.permissions.handlePendingPermissionRequest", {
                    sessionId,
                    requestId,
                    result: { kind: "approved" },
                }).catch(() => { /* session may be gone */ });
            }
            return;
        }

        if (!handlers || handlers.size === 0) return;

        let evt: CopilotEvent | null = null;
        if (type === "assistant.message_delta") {
            evt = { type: "text_delta", delta: (data.deltaContent as string) ?? "", messageId: (data.messageId as string) ?? "" };
        } else if (type === "assistant.message") {
            evt = { type: "text", content: (data.content as string) ?? "", messageId: (data.messageId as string) ?? "" };
        } else if (type === "tool.execution_start") {
            evt = { type: "tool_start", toolName: (data.toolName as string) ?? "tool", toolCallId: (data.toolCallId as string) ?? "" };
        } else if (type === "tool.execution_complete") {
            evt = { type: "tool_done", toolName: (data.toolName as string) ?? "tool", toolCallId: (data.toolCallId as string) ?? "" };
        } else if (type === "session.idle") {
            evt = { type: "idle", aborted: !!(data.aborted) };
        } else if (type === "session.error") {
            evt = { type: "error", errorType: (data.errorType as string) ?? "unknown", message: (data.message as string) ?? "Unknown error" };
        }

        if (evt) for (const h of handlers) try { h(evt); } catch { /* ignore */ }
    }

    async createSession(vaultPath: string, systemPromptAddition?: string, model?: string): Promise<string> {
        const sessionId = randomUUID();

        const systemMessage = systemPromptAddition
            ? { mode: "customize" as const, content: systemPromptAddition }
            : undefined;

        await this.rpc.sendRequest("session.create", {
            sessionId,
            workingDirectory: vaultPath,
            model: model || undefined,
            requestPermission: true,
            streaming: true,
            systemMessage,
        });

        this.sessionHandlers.set(sessionId, new Set());
        return sessionId;
    }

    async send(
        sessionId: string,
        prompt: string,
        attachments: FileAttachment[] | undefined,
        onEvent: CopilotEventHandler,
        signal?: AbortSignal
    ): Promise<void> {
        const handlers = this.sessionHandlers.get(sessionId);
        if (!handlers) throw new Error(`Session ${sessionId} not found`);

        return new Promise<void>((resolve, reject) => {
            const cleanupHandler: CopilotEventHandler = (event) => {
                onEvent(event);
                if (event.type === "idle") {
                    handlers.delete(cleanupHandler);
                    resolve();
                } else if (event.type === "error") {
                    handlers.delete(cleanupHandler);
                    reject(new Error(event.message));
                }
            };

            handlers.add(cleanupHandler);

            if (signal) {
                const abort = () => {
                    void this.rpc.sendRequest("session.abort", { sessionId }).catch(() => { /* ignore */ });
                };
                if (signal.aborted) {
                    abort();
                } else {
                    signal.addEventListener("abort", abort, { once: true });
                }
            }

            this.rpc.sendRequest<{ messageId: string }>("session.send", {
                sessionId,
                prompt,
                attachments,
            }).catch((err: Error) => {
                handlers.delete(cleanupHandler);
                reject(err);
            });
        });
    }

    async destroySession(sessionId: string): Promise<void> {
        this.sessionHandlers.delete(sessionId);
        await this.rpc.sendRequest("session.destroy", { sessionId }).catch(() => { /* ignore */ });
    }

    async listModels(): Promise<ModelInfo[]> {
        const result = await this.rpc.sendRequest<{ models: ModelInfo[] }>("models.list", {});
        return result.models ?? [];
    }

    stop(): void {
        this.rpc.close();
        try { this.cliProcess?.kill(); } catch { /* ignore */ }
        this.cliProcess = null;
        this.sessionHandlers.clear();
    }

    get isRunning(): boolean {
        return this.cliProcess !== null && !this.cliProcess.killed;
    }
}

