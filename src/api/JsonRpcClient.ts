/**
 * Minimal JSON-RPC 2.0 TCP client with LSP Content-Length framing.
 * No external dependencies — replaces vscode-jsonrpc for our use case.
 */

import * as net from "net";

type PendingRequest = {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
};

export class JsonRpcClient {
    private socket: net.Socket | null = null;
    private rawBuffer = Buffer.alloc(0);
    private requestCounter = 0;
    private pending = new Map<number, PendingRequest>();
    private notificationHandlers = new Map<string, Array<(params: unknown) => void>>();
    private serverRequestHandlers = new Map<string, (params: unknown) => Promise<unknown>>();
    private closeHandlers: Array<() => void> = [];

    connect(host: string, port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const sock = new net.Socket();
            this.socket = sock;
            sock.once("connect", () => resolve());
            sock.once("error", (err) => reject(err));
            sock.on("data", (chunk: Buffer) => this.handleData(chunk));
            sock.on("close", () => {
                for (const h of this.closeHandlers) try { h(); } catch { /* ignore */ }
                for (const [, req] of this.pending) req.reject(new Error("JSON-RPC connection closed"));
                this.pending.clear();
            });
            sock.connect(port, host);
        });
    }

    private handleData(chunk: Buffer): void {
        this.rawBuffer = Buffer.concat([this.rawBuffer, chunk]);
        while (true) {
            const sep = this.rawBuffer.indexOf("\r\n\r\n");
            if (sep === -1) break;
            const header = this.rawBuffer.slice(0, sep).toString("utf8");
            const lenMatch = header.match(/Content-Length:\s*(\d+)/i);
            if (!lenMatch) { this.rawBuffer = this.rawBuffer.slice(sep + 4); continue; }
            const len = parseInt(lenMatch[1], 10);
            const start = sep + 4;
            if (this.rawBuffer.length < start + len) break;
            const json = this.rawBuffer.slice(start, start + len).toString("utf8");
            this.rawBuffer = this.rawBuffer.slice(start + len);
            try { this.handleMessage(JSON.parse(json)); } catch { /* ignore malformed */ }
        }
    }

    private handleMessage(msg: Record<string, unknown>): void {
        const hasId = msg.id !== undefined && msg.id !== null;

        if (hasId && msg.method === undefined) {
            // Response to one of our requests
            const id = typeof msg.id === "number" ? msg.id : Number(msg.id);
            const pending = this.pending.get(id);
            if (pending) {
                this.pending.delete(id);
                if (msg.error) {
                    const err = msg.error as { message: string };
                    pending.reject(new Error(err.message ?? "RPC error"));
                } else {
                    pending.resolve(msg.result);
                }
            }
        } else if (msg.method && !hasId) {
            // Server notification
            const handlers = this.notificationHandlers.get(msg.method as string);
            if (handlers) {
                for (const h of handlers) try { h(msg.params); } catch { /* ignore */ }
            }
        } else if (msg.method && hasId) {
            // Server-initiated request — we must respond
            const handler = this.serverRequestHandlers.get(msg.method as string);
            const replyId = msg.id;
            if (handler) {
                handler(msg.params).then((result) => {
                    this.sendRaw({ jsonrpc: "2.0", id: replyId, result });
                }).catch((err: Error) => {
                    this.sendRaw({ jsonrpc: "2.0", id: replyId, error: { code: -32000, message: err.message } });
                });
            } else {
                this.sendRaw({ jsonrpc: "2.0", id: replyId, error: { code: -32601, message: `Method not found: ${msg.method as string}` } });
            }
        }
    }

    sendRequest<T = unknown>(method: string, params: unknown): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const id = ++this.requestCounter;
            this.pending.set(id, { resolve: resolve as (r: unknown) => void, reject });
            this.sendRaw({ jsonrpc: "2.0", id, method, params });
        });
    }

    onNotification(method: string, handler: (params: unknown) => void): () => void {
        if (!this.notificationHandlers.has(method)) this.notificationHandlers.set(method, []);
        const arr = this.notificationHandlers.get(method)!;
        arr.push(handler);
        return () => {
            const idx = arr.indexOf(handler);
            if (idx >= 0) arr.splice(idx, 1);
        };
    }

    onServerRequest(method: string, handler: (params: unknown) => Promise<unknown>): void {
        this.serverRequestHandlers.set(method, handler);
    }

    onClose(handler: () => void): void {
        this.closeHandlers.push(handler);
    }

    private sendRaw(msg: object): void {
        if (!this.socket || this.socket.destroyed) return;
        const json = JSON.stringify(msg);
        const len = Buffer.byteLength(json, "utf8");
        this.socket.write(`Content-Length: ${len}\r\n\r\n${json}`, "utf8");
    }

    close(): void {
        this.socket?.destroy();
        this.socket = null;
    }
}
