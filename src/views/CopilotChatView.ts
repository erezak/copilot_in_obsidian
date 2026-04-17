import {
  ItemView,
  MarkdownRenderer,
  Notice,
  WorkspaceLeaf,
} from "obsidian";
import type CopilotPlugin from "../main";
import { CopilotCLIClient, type CopilotEvent, type FileAttachment } from "../api/CopilotCLI";

export const VIEW_TYPE_COPILOT = "copilot-vault-agent-view";

// ── Example prompts shown on the welcome screen ───────────────────────────────

const EXAMPLE_PROMPTS = [
  "Summarise my current note",
  "Find all notes about…",
  "Create a new note about…",
  "Add a ## Summary section to this note",
];

// ── Main chat view ────────────────────────────────────────────────────────────

export class CopilotChatView extends ItemView {
  private plugin: CopilotPlugin;
  private cli: CopilotCLIClient | null = null;
  private sessionId: string | null = null;

  // UI elements
  private messagesEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private stopBtn!: HTMLButtonElement;
  private statusEl!: HTMLElement;
  private contextBarEl!: HTMLElement;

  private isProcessing = false;
  private abortController: AbortController | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: CopilotPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return VIEW_TYPE_COPILOT; }
  getDisplayText(): string { return "Copilot"; }
  getIcon(): string { return "bot"; }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  async onOpen(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("cva-root");

    this.buildHeader(root);
    this.contextBarEl = root.createEl("div", { cls: "cva-context-bar" });
    this.updateContextBar();
    this.messagesEl = root.createEl("div", { cls: "cva-messages" });
    this.statusEl = root.createEl("div", { cls: "cva-status" });
    this.buildInputArea(root);
    this.renderWelcome();

    this.registerEvent(
      this.app.workspace.on("file-open", () => this.updateContextBar())
    );
  }

  async onClose(): Promise<void> {
    this.abortController?.abort();
    await this.destroySession();
    this.cli?.stop();
    this.cli = null;
  }

  refreshSettings(): void {
    this.updateContextBar();
  }

  // ── UI builders ─────────────────────────────────────────────────────────────

  private buildHeader(root: HTMLElement): void {
    const header = root.createEl("div", { cls: "cva-header" });
    header.createEl("span", { cls: "cva-title", text: "✦ Copilot" });

    const actions = header.createEl("div", { cls: "cva-header-actions" });
    const clearBtn = actions.createEl("button", {
      cls: "cva-icon-btn",
      attr: { title: "New chat", "aria-label": "New chat" },
    });
    clearBtn.innerHTML =
      `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" ` +
      `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
      `<polyline points="1 4 1 10 7 10"></polyline>` +
      `<path d="M3.51 15a9 9 0 1 0 .49-3.55"></path></svg>`;
    clearBtn.addEventListener("click", () => void this.clearChat());
  }

  private buildInputArea(root: HTMLElement): void {
    const area = root.createEl("div", { cls: "cva-input-area" });

    this.inputEl = area.createEl("textarea", {
      cls: "cva-input",
      attr: { placeholder: "Ask about your vault…", rows: "3" },
    });
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void this.handleSend();
      }
    });

    const btnRow = area.createEl("div", { cls: "cva-btn-row" });

    this.stopBtn = btnRow.createEl("button", { cls: "cva-stop-btn", text: "■ Stop" });
    this.stopBtn.style.display = "none";
    this.stopBtn.addEventListener("click", () => this.abortController?.abort());

    this.sendBtn = btnRow.createEl("button", { cls: "cva-send-btn", text: "Send ↵" });
    this.sendBtn.addEventListener("click", () => void this.handleSend());
  }

  // ── Context bar ─────────────────────────────────────────────────────────────

  private updateContextBar(): void {
    this.contextBarEl.empty();
    const file = this.app.workspace.getActiveFile();
    if (file) {
      const pill = this.contextBarEl.createEl("div", { cls: "cva-context-pill" });
      pill.createEl("span", { cls: "cva-context-icon", text: "📄" });
      pill.createEl("span", { cls: "cva-context-name", text: file.basename });
    } else {
      this.contextBarEl.createEl("span", { cls: "cva-context-empty", text: "No file open" });
    }
  }

  // ── CLI session management ───────────────────────────────────────────────────

  private getVaultPath(): string {
    const adapter = this.app.vault.adapter as { basePath?: string; getBasePath?: () => string };
    return adapter.getBasePath?.() ?? adapter.basePath ?? this.app.vault.getName();
  }

  private async ensureSession(): Promise<string> {
    if (this.cli && this.sessionId && this.cli.isRunning) {
      return this.sessionId;
    }

    if (this.cli) {
      this.cli.stop();
      this.cli = null;
      this.sessionId = null;
    }

    this.setStatus("Starting Copilot CLI…");
    const client = new CopilotCLIClient();
    await client.start();
    this.cli = client;

    this.setStatus("Creating session…");
    const vaultPath = this.getVaultPath();
    const sid = await client.createSession(
      vaultPath,
      this.plugin.settings.systemPromptAddition || undefined,
      this.plugin.settings.model || undefined
    );
    this.sessionId = sid;
    this.setStatus("");
    return sid;
  }

  private async destroySession(): Promise<void> {
    if (this.cli && this.sessionId) {
      await this.cli.destroySession(this.sessionId).catch(() => { /* ignore */ });
      this.sessionId = null;
    }
  }

  // ── Send / receive ──────────────────────────────────────────────────────────

  private async handleSend(): Promise<void> {
    if (this.isProcessing) return;

    const text = this.inputEl.value.trim();
    if (!text) return;

    this.inputEl.value = "";
    this.setProcessing(true);
    this.appendUserMessage(text);

    // Build file attachment for active note
    const attachments: FileAttachment[] = [];
    if (this.plugin.settings.includeActiveFile) {
      const file = this.app.workspace.getActiveFile();
      if (file) {
        const adapter = this.app.vault.adapter as { basePath?: string; getBasePath?: () => string };
        const base = adapter.getBasePath?.() ?? adapter.basePath ?? "";
        const fullPath = base ? `${base}/${file.path}` : file.path;
        attachments.push({ type: "file", path: fullPath, displayName: file.basename });
      }
    }

    const { updateContent } = this.createStreamingBubble();

    try {
      const sessionId = await this.ensureSession();
      this.abortController = new AbortController();

      let accumulated = "";
      let renderTimer: ReturnType<typeof setTimeout> | null = null;

      // Re-render markdown at most every 50 ms to avoid flooding the DOM
      const scheduleRender = () => {
        if (renderTimer !== null) return;
        renderTimer = setTimeout(() => {
          renderTimer = null;
          updateContent(accumulated);
        }, 50);
      };

      await this.cli!.send(sessionId, text, attachments, (event: CopilotEvent) => {
        if (event.type === "text_delta") {
          accumulated += event.delta;
          scheduleRender();
        } else if (event.type === "text") {
          // Final authoritative content — flush immediately
          accumulated = event.content;
          if (renderTimer !== null) { clearTimeout(renderTimer); renderTimer = null; }
          updateContent(accumulated);
        } else if (event.type === "tool_start") {
          this.setStatus(`🔧 ${event.toolName}…`);
        } else if (event.type === "tool_done") {
          this.setStatus("");
        } else if (event.type === "idle") {
          this.setStatus("");
        }
      }, this.abortController.signal);

      if (renderTimer !== null) { clearTimeout(renderTimer); renderTimer = null; }
      if (!accumulated) updateContent("_No response._");

    } catch (err) {
      if (err instanceof Error && (err.message.includes("abort") || err.message.includes("Abort"))) {
        updateContent("_Stopped._");
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        new Notice(`Copilot error: ${msg}`);
        updateContent(`**Error:** ${msg}`);
        await this.destroySession();
      }
    } finally {
      this.setProcessing(false);
      this.abortController = null;
    }
  }

  // ── Message rendering ───────────────────────────────────────────────────────

  private appendUserMessage(text: string): void {
    const wrap = this.messagesEl.createEl("div", { cls: "cva-msg cva-msg-user" });
    wrap.createEl("div", { cls: "cva-bubble cva-bubble-user", text });
    this.scrollToBottom();
  }

  /** Creates an assistant bubble; returns a function to update its markdown content. */
  private createStreamingBubble(): { updateContent: (content: string) => void } {
    const wrap = this.messagesEl.createEl("div", { cls: "cva-msg cva-msg-assistant" });
    const bubble = wrap.createEl("div", { cls: "cva-bubble cva-bubble-assistant cva-streaming" });
    // Show a blinking cursor placeholder while streaming
    bubble.createEl("span", { cls: "cva-cursor", text: "▋" });
    this.scrollToBottom();

    const updateContent = (content: string) => {
      bubble.empty();
      bubble.removeClass("cva-streaming");
      void MarkdownRenderer.render(this.app, content, bubble, "", this);
      this.scrollToBottom();
    };

    return { updateContent };
  }

  private renderWelcome(): void {
    const el = this.messagesEl.createEl("div", { cls: "cva-welcome" });
    el.createEl("div", { cls: "cva-welcome-icon", text: "✦" });
    el.createEl("h3", { text: "Copilot Vault Agent" });
    el.createEl("p", {
      text: "Powered by the GitHub Copilot CLI. I can read, create, and edit notes in your vault.",
    });
    const chips = el.createEl("div", { cls: "cva-chips" });
    for (const p of EXAMPLE_PROMPTS) {
      const chip = chips.createEl("button", { cls: "cva-chip", text: p });
      chip.addEventListener("click", () => {
        this.inputEl.value = p;
        this.inputEl.focus();
      });
    }
  }

  private async clearChat(): Promise<void> {
    await this.destroySession();
    this.messagesEl.empty();
    this.renderWelcome();
    new Notice("Copilot: conversation cleared.");
  }

  // ── Utilities ───────────────────────────────────────────────────────────────

  private setProcessing(on: boolean): void {
    this.isProcessing = on;
    this.inputEl.disabled = on;
    this.sendBtn.style.display = on ? "none" : "";
    this.stopBtn.style.display = on ? "" : "none";
    if (!on) this.setStatus("");
  }

  private setStatus(text: string): void {
    this.statusEl.textContent = text;
  }

  private scrollToBottom(): void {
    this.messagesEl.scrollTo({ top: this.messagesEl.scrollHeight, behavior: "smooth" });
  }
}
