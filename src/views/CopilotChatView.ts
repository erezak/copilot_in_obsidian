import {
  ItemView,
  MarkdownRenderer,
  Notice,
  WorkspaceLeaf,
} from "obsidian";
import { join } from "node:path";
import {
  CopilotClient,
  approveAll,
  type CopilotSession,
  type SessionEvent,
} from "@github/copilot-sdk";
import type CopilotPlugin from "../main";

export const VIEW_TYPE_COPILOT = "copilot-vault-agent-view";

const EXAMPLE_PROMPTS = [
  "Summarise my current note",
  "Find all notes about…",
  "Create a new note about…",
  "Add a ## Summary section to this note",
];

export class CopilotChatView extends ItemView {
  private plugin: CopilotPlugin;
  private client: CopilotClient | null = null;
  private session: CopilotSession | null = null;

  // UI elements
  private messagesEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private stopBtn!: HTMLButtonElement;
  private statusEl!: HTMLElement;
  private contextBarEl!: HTMLElement;

  private isProcessing = false;

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
    await this.teardown();
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
    this.stopBtn.addEventListener("click", () => void this.session?.abort());

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

  // ── SDK session management ──────────────────────────────────────────────────

  private getVaultPath(): string {
    const adapter = this.app.vault.adapter as { basePath?: string; getBasePath?: () => string };
    return adapter.getBasePath?.() ?? adapter.basePath ?? this.app.vault.getName();
  }

  private getPluginDir(): string {
    const adapter = this.app.vault.adapter as { basePath?: string; getBasePath?: () => string };
    const vaultBase = adapter.getBasePath?.() ?? adapter.basePath ?? "";
    return join(vaultBase, this.plugin.manifest.dir ?? "");
  }

  private async ensureSession(): Promise<CopilotSession> {
    if (this.client && this.session) {
      return this.session;
    }

    await this.teardown();

    this.setStatus("Starting Copilot CLI…");
    const cliUrl = await this.plugin.cliManager.start();
    const client = new CopilotClient({ logLevel: "warning", cliUrl });
    await client.start();
    this.client = client;

    this.setStatus("Creating session…");
    const vaultPath = this.getVaultPath();
    const skillsDir = join(this.getPluginDir(), "skills");
    const settings = this.plugin.settings;

    const session = await client.createSession({
      model: settings.model || undefined,
      workingDirectory: vaultPath,
      skillDirectories: [skillsDir],
      streaming: true,
      onPermissionRequest: approveAll,
      systemMessage: settings.systemPromptAddition
        ? { mode: "append", content: settings.systemPromptAddition }
        : undefined,
    });

    this.session = session;
    this.setStatus("");
    return session;
  }

  private async teardown(): Promise<void> {
    if (this.session) {
      await this.session.destroy().catch(() => { /* ignore */ });
      this.session = null;
    }
    if (this.client) {
      await this.client.stop().catch(() => { /* ignore */ });
      this.client = null;
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
    const attachments: Array<{ type: "file"; path: string; displayName?: string }> = [];
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
    const { updateThinking, finalizeThinking } = this.createThinkingBubble();

    try {
      const session = await this.ensureSession();

      let accumulated = "";
      let accumulatedThinking = "";
      let renderTimer: ReturnType<typeof setTimeout> | null = null;
      let thinkingTimer: ReturnType<typeof setTimeout> | null = null;

      const scheduleRender = () => {
        if (renderTimer !== null) return;
        renderTimer = setTimeout(() => {
          renderTimer = null;
          updateContent(accumulated);
        }, 50);
      };

      const scheduleThinkingRender = () => {
        if (thinkingTimer !== null) return;
        thinkingTimer = setTimeout(() => {
          thinkingTimer = null;
          updateThinking(accumulatedThinking);
        }, 50);
      };

      await new Promise<void>((resolve, reject) => {
        const unsubscribe = session.on((event: SessionEvent) => {
          switch (event.type) {
            case "assistant.reasoning_delta":
              accumulatedThinking += event.data.deltaContent;
              scheduleThinkingRender();
              break;
            case "assistant.reasoning":
              accumulatedThinking = event.data.content;
              if (thinkingTimer !== null) { clearTimeout(thinkingTimer); thinkingTimer = null; }
              finalizeThinking(accumulatedThinking);
              break;
            case "assistant.message_delta":
              accumulated += event.data.deltaContent;
              scheduleRender();
              break;
            case "assistant.message":
              accumulated = event.data.content;
              if (renderTimer !== null) { clearTimeout(renderTimer); renderTimer = null; }
              updateContent(accumulated);
              break;
            case "tool.execution_start":
              this.setStatus(`🔧 ${event.data.toolName}…`);
              break;
            case "tool.execution_complete":
              this.setStatus("");
              break;
            case "session.idle":
              this.setStatus("");
              unsubscribe();
              resolve();
              break;
            case "session.error":
              this.setStatus("");
              unsubscribe();
              reject(new Error(event.data.message));
              break;
          }
        });

        session.send({
          prompt: text,
          attachments: attachments.length > 0 ? attachments : undefined,
        }).catch((err: Error) => {
          unsubscribe();
          reject(err);
        });
      });

      if (renderTimer !== null) { clearTimeout(renderTimer); renderTimer = null; }
      if (thinkingTimer !== null) { clearTimeout(thinkingTimer); thinkingTimer = null; }
      if (accumulatedThinking) finalizeThinking(accumulatedThinking);
      if (!accumulated) updateContent("_No response._");

    } catch (err) {
      if (err instanceof Error && (err.message.includes("abort") || err.message.includes("Abort"))) {
        updateContent("_Stopped._");
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        new Notice(`Copilot error: ${msg}`);
        updateContent(`**Error:** ${msg}`);
        await this.teardown();
      }
    } finally {
      this.setProcessing(false);
    }
  }

  // ── Message rendering ───────────────────────────────────────────────────────

  private appendUserMessage(text: string): void {
    const wrap = this.messagesEl.createEl("div", { cls: "cva-msg cva-msg-user" });
    wrap.createEl("div", { cls: "cva-bubble cva-bubble-user", text });
    this.scrollToBottom();
  }

  private createThinkingBubble(): { updateThinking: (content: string) => void; finalizeThinking: (content: string) => void } {
    const wrap = this.messagesEl.createEl("div", { cls: "cva-msg cva-msg-assistant" });
    const details = wrap.createEl("details", { cls: "cva-thinking" });
    details.setAttribute("open", "");
    const summary = details.createEl("summary", { cls: "cva-thinking-summary" });
    summary.createEl("span", { cls: "cva-thinking-dot" });
    summary.createEl("span", { text: "Thinking…" });
    const body = details.createEl("div", { cls: "cva-thinking-body" });
    this.scrollToBottom();

    const updateThinking = (content: string) => {
      body.empty();
      body.setText(content);
      this.scrollToBottom();
    };

    const finalizeThinking = (content: string) => {
      // Update summary label and remove open attr so it collapses by default
      summary.empty();
      summary.createEl("span", { cls: "cva-thinking-icon", text: "💭" });
      summary.createEl("span", { text: "Thought process" });
      details.removeAttribute("open");
      body.empty();
      body.setText(content);
      this.scrollToBottom();
    };

    return { updateThinking, finalizeThinking };
  }

  private createStreamingBubble(): { updateContent: (content: string) => void } {
    const wrap = this.messagesEl.createEl("div", { cls: "cva-msg cva-msg-assistant" });
    const bubble = wrap.createEl("div", { cls: "cva-bubble cva-bubble-assistant cva-streaming" });
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
    await this.teardown();
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
