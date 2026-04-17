import { requestUrl } from "obsidian";
import { CopilotSettings, PROVIDER_INFO } from "../settings";
import { getGhTokenForAccount } from "../auth";
import type { ChatResponse, Message, ToolCall } from "../types";

export type ToolHandler = (
  name: string,
  args: Record<string, unknown>
) => Promise<string>;

const MAX_ITERATIONS = 8;
const MAX_TOTAL_TOOL_CALLS = 20;
const MAX_TOOL_OUTPUT_CHARS = 8000;

export class AIClient {
  private settings: CopilotSettings;
  // Cached Copilot session token (short-lived, ~30 min)
  private copilotToken: string | null = null;
  private copilotTokenExpiresAt = 0;

  constructor(settings: CopilotSettings) {
    this.settings = settings;
  }

  updateSettings(settings: CopilotSettings): void {
    this.settings = settings;
    // Invalidate cached token if provider changed
    this.copilotToken = null;
    this.copilotTokenExpiresAt = 0;
  }

  // ── Auth ────────────────────────────────────────────────────────────────────

  private async getAuthToken(): Promise<string> {
    if (this.settings.provider === "github-copilot") {
      return this.fetchCopilotToken();
    }
    const accountLogin = this.settings.ghAccount && this.settings.ghAccount !== "default"
      ? this.settings.ghAccount
      : undefined;
    const fresh = getGhTokenForAccount(accountLogin);
    return fresh ?? this.settings.githubToken;
  }

  /**
   * Exchange a GitHub OAuth token (gho_) for a short-lived Copilot session token.
   * Uses VSCode-style editor headers that the endpoint requires.
   */
  private async fetchCopilotToken(): Promise<string> {
    const now = Date.now();
    if (this.copilotToken && now < this.copilotTokenExpiresAt) {
      return this.copilotToken;
    }

    const accountLogin = this.settings.ghAccount && this.settings.ghAccount !== "default"
      ? this.settings.ghAccount
      : undefined;

    // Prefer the stored token (set via device login) over re-fetching from gh CLI
    const oauthToken = this.settings.githubToken
      || getGhTokenForAccount(accountLogin);
    if (!oauthToken) {
      throw new Error("No GitHub token available. Run `gh auth login` in your terminal.");
    }

    const resp = await requestUrl({
      url: "https://api.github.com/copilot_internal/v2/token",
      method: "GET",
      headers: {
        Authorization: `token ${oauthToken}`,
        Accept: "application/json",
        "editor-version": "vscode/1.90.0",
        "editor-plugin-version": "copilot-chat/0.22.4",
        "user-agent": "GithubCopilot/1.155.0",
      },
      throw: false,
    });

    if (resp.status < 200 || resp.status >= 300) {
      if (resp.status === 404) {
        const acct = accountLogin ?? "your account";
        throw new Error(
          `Copilot not enabled for ${acct}. ` +
          `Enable Copilot Free at https://github.com/settings/copilot, ` +
          `or re-authenticate with a different GitHub account.`
        );
      }
      throw new Error(`Failed to get Copilot token (${resp.status}): ${resp.text}`);
    }

    const data = resp.json as { token: string; expires_at: number };
    this.copilotToken = data.token;
    this.copilotTokenExpiresAt = data.expires_at * 1000 - 60_000;
    return this.copilotToken;
  }

  private getEndpoint(): string {
    if (this.settings.provider === "custom") {
      return this.settings.customEndpoint;
    }
    return PROVIDER_INFO[this.settings.provider].endpoint;
  }

  async listModels(): Promise<string[]> {
    if (this.settings.provider !== "github-copilot") return [];

    const token = await this.getAuthToken();
    const resp = await requestUrl({
      url: "https://api.githubcopilot.com/models",
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...this.copilotHeaders(),
        "openai-intent": "conversation-panel",
        "x-github-api-version": "2023-07-07",
      },
      throw: false,
    });

    if (resp.status < 200 || resp.status >= 300) {
      throw new Error(`Models fetch failed (${resp.status}): ${resp.text}`);
    }

    type ModelEntry = { id: string; capabilities?: { type?: string } };
    const json = resp.json as { data?: ModelEntry[] };
    return (json.data ?? [])
      .filter((m) => !m.capabilities?.type || m.capabilities.type === "chat")
      .map((m) => m.id)
      .filter(Boolean)
      .sort();
  }


  // ── Core API call (requestUrl — bypasses Electron CORS) ────────────────────

  private copilotHeaders(): Record<string, string> {
    return {
      "editor-version": "vscode/1.90.0",
      "editor-plugin-version": "copilot-chat/0.22.4",
      "user-agent": "GithubCopilot/1.155.0",
    };
  }

  private async callAPI(
    messages: Message[],
    tools: object[],
    signal?: AbortSignal
  ): Promise<ChatResponse> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const token = await this.getAuthToken();
    const endpoint = this.getEndpoint();

    const body: Record<string, unknown> = {
      model: this.settings.model,
      messages,
      max_tokens: 4096,
    };
    if (tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...this.copilotHeaders(),
    };
    if (this.settings.provider === "github-copilot") {
      headers["openai-intent"] = "conversation-panel";
      headers["x-github-api-version"] = "2023-07-07";
    }

    const resp = await requestUrl({
      url: endpoint,
      method: "POST",
      headers,
      body: JSON.stringify(body),
      throw: false,
    });

    if (resp.status < 200 || resp.status >= 300) {
      throw new Error(`API ${resp.status}: ${resp.text}`);
    }

    return resp.json as ChatResponse;
  }

  // ── Streaming (Node.js https — bypasses Electron CORS) ────────────────────

  /**
   * Stream the final assistant response (no tool calls expected).
   * Uses Node.js `https` directly because requestUrl doesn't support streaming.
   * Calls `onToken` for each text chunk as it arrives.
   */
  async streamResponse(
    messages: Message[],
    onToken: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const token = await this.getAuthToken();
    const endpoint = this.getEndpoint();
    const url = new URL(endpoint);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const https = require("https") as typeof import("https");

    const body = JSON.stringify({
      model: this.settings.model,
      messages,
      stream: true,
      max_tokens: 4096,
    });

    await new Promise<void>((resolve, reject) => {
      const req = https.request(
        {
          hostname: url.hostname,
          path: url.pathname + url.search,
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            "Content-Length": Buffer.byteLength(body),
            "editor-version": "vscode/1.90.0",
            "editor-plugin-version": "copilot-chat/0.22.4",
            "user-agent": "GithubCopilot/1.155.0",
            ...(this.settings.provider === "github-copilot" ? {
              "openai-intent": "conversation-panel",
              "x-github-api-version": "2023-07-07",
            } : {}),
          },
        },
        (res) => {
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            reject(new Error(`API ${res.statusCode}`));
            res.resume();
            return;
          }

          let buf = "";
          res.setEncoding("utf8");

          res.on("data", (chunk: string) => {
            if (signal?.aborted) { req.destroy(); return; }
            buf += chunk;
            const lines = buf.split("\n");
            buf = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const payload = line.slice(6).trim();
              if (payload === "[DONE]") return;
              try {
                const parsed = JSON.parse(payload) as {
                  choices?: Array<{ delta?: { content?: string } }>;
                };
                const c = parsed.choices?.[0]?.delta?.content;
                if (c) onToken(c);
              } catch { /* ignore malformed SSE */ }
            }
          });

          res.on("end", resolve);
          res.on("error", reject);
        }
      );

      req.on("error", reject);
      signal?.addEventListener("abort", () => req.destroy());
      req.write(body);
      req.end();
    });
  }

  // ── Agentic loop ────────────────────────────────────────────────────────────

  /**
   * Run the tool-calling agent loop.
   *
   * - Calls the API with tool definitions.
   * - If the model returns tool calls, executes them and loops.
   * - Stops when the model returns a plain text response (no tool calls),
   *   the iteration cap is hit, the total tool call budget is spent, or the
   *   signal is aborted.
   * - Returns the accumulated message history and the final text content.
   *
   * The final plain-text response is NOT re-requested via a streaming call —
   * it is returned directly to avoid a redundant API round-trip.
   */
  async runAgentLoop(
    messages: Message[],
    toolDefinitions: object[],
    toolHandler: ToolHandler,
    signal?: AbortSignal,
    onStatus?: (msg: string) => void
  ): Promise<{ messages: Message[]; finalContent: string }> {
    const seenCallKeys = new Set<string>();
    let totalToolCalls = 0;

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      onStatus?.(`Thinking… (step ${iteration + 1})`);

      const response = await this.callAPI(messages, toolDefinitions, signal);
      const choice = response.choices[0];
      if (!choice) throw new Error("Empty response from API.");

      const assistantMsg = choice.message;
      messages = [
        ...messages,
        {
          role: "assistant",
          content: assistantMsg.content,
          tool_calls: assistantMsg.tool_calls,
        },
      ];

      // No tool calls → final answer
      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        return { messages, finalContent: assistantMsg.content ?? "" };
      }

      // Execute each tool call
      const toolResults: Message[] = [];
      for (const tc of assistantMsg.tool_calls) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        toolResults.push(
          await this.executeToolCall(tc, toolHandler, seenCallKeys, {
            totalToolCalls,
            onStatus,
          })
        );
        totalToolCalls++;
        if (totalToolCalls >= MAX_TOTAL_TOOL_CALLS) {
          onStatus?.("Tool call budget reached.");
          break;
        }
      }

      messages = [...messages, ...toolResults];

      if (totalToolCalls >= MAX_TOTAL_TOOL_CALLS) break;
    }

    // Fallback: ask for a final summary without tools
    onStatus?.("Summarising…");
    const finalResp = await this.callAPI(messages, [], signal);
    const content = finalResp.choices[0]?.message.content ?? "";
    messages = [...messages, { role: "assistant", content }];
    return { messages, finalContent: content };
  }

  private async executeToolCall(
    tc: ToolCall,
    toolHandler: ToolHandler,
    seenCallKeys: Set<string>,
    opts: { totalToolCalls: number; onStatus?: (msg: string) => void }
  ): Promise<Message> {
    const key = `${tc.function.name}::${tc.function.arguments}`;

    if (seenCallKeys.has(key)) {
      return {
        role: "tool",
        tool_call_id: tc.id,
        content: "Error: duplicate tool call detected — skipped to prevent loop.",
      };
    }
    seenCallKeys.add(key);

    opts.onStatus?.(`Using tool: ${tc.function.name}`);

    let result: string;
    try {
      const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      result = await toolHandler(tc.function.name, args);
    } catch (err) {
      result = `Error: ${err instanceof Error ? err.message : String(err)}`;
    }

    // Hard-cap output to avoid blowing the context window
    if (result.length > MAX_TOOL_OUTPUT_CHARS) {
      result =
        result.slice(0, MAX_TOOL_OUTPUT_CHARS) +
        `\n\n[Output truncated at ${MAX_TOOL_OUTPUT_CHARS} chars]`;
    }

    return { role: "tool", tool_call_id: tc.id, content: result };
  }
}
