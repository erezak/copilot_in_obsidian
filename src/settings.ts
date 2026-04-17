import { PluginSettingTab, Setting } from "obsidian";
import type CopilotPlugin from "./main";

export interface CopilotSettings {
  model: string;
  systemPromptAddition: string;
  includeActiveFile: boolean;
}

export const DEFAULT_SETTINGS: CopilotSettings = {
  model: "",
  systemPromptAddition: "",
  includeActiveFile: true,
};

export class CopilotSettingTab extends PluginSettingTab {
  plugin: CopilotPlugin;

  constructor(app: App, plugin: CopilotPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Copilot Vault Agent" });

    containerEl.createEl("p", {
      text: "Uses the GitHub Copilot CLI installed on your system. No token configuration needed — auth is managed by the CLI.",
    });

    // ── Model ─────────────────────────────────────────────────────────────────
    new Setting(containerEl)
      .setName("Model")
      .setDesc("Copilot model to use. Leave empty to use the CLI default.")
      .addText((text) =>
        text
          .setPlaceholder("e.g. claude-sonnet-4.5  (empty = default)")
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            this.plugin.settings.model = value.trim();
            await this.plugin.saveSettings();
          })
      );

    // ── Behavior ──────────────────────────────────────────────────────────────
    containerEl.createEl("h3", { text: "Behavior" });

    new Setting(containerEl)
      .setName("Attach active file")
      .setDesc("Pass the currently open note as an attachment on every message so Copilot can reference it.")
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.includeActiveFile)
          .onChange(async (value) => {
            this.plugin.settings.includeActiveFile = value;
            await this.plugin.saveSettings();
          })
      );

    // ── Custom system prompt ──────────────────────────────────────────────────
    containerEl.createEl("h3", { text: "Advanced" });

    new Setting(containerEl)
      .setName("Custom instructions (appended to system prompt)")
      .setDesc("Extra context for Copilot, e.g. 'My vault is a personal knowledge base about software engineering.'")
      .addTextArea((ta) => {
        ta.inputEl.rows = 4;
        ta.inputEl.style.width = "100%";
        ta.setPlaceholder("Additional instructions…")
          .setValue(this.plugin.settings.systemPromptAddition)
          .onChange(async (value) => {
            this.plugin.settings.systemPromptAddition = value;
            await this.plugin.saveSettings();
          });
      });

    // ── CLI status ────────────────────────────────────────────────────────────
    containerEl.createEl("h3", { text: "Status" });

    const statusSetting = new Setting(containerEl)
      .setName("Copilot CLI")
      .setDesc("Checking…");

    void this.checkCLIStatus(statusSetting);
  }

  private async checkCLIStatus(setting: Setting): Promise<void> {
    try {
      const { execFile } = await import("child_process");
      await new Promise<void>((resolve, reject) => {
        execFile("copilot", ["--version"], { timeout: 5000 }, (err, stdout) => {
          if (err) reject(err);
          else { setting.setDesc(`✓ ${stdout.trim()}`); resolve(); }
        });
      });
    } catch {
      setting.setDesc("⚠ copilot CLI not found. Install it with: npm install -g @github/copilot-cli  or via brew/winget.");
    }
  }
}
