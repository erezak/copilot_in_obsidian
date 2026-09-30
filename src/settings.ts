import { App, PluginSettingTab, Setting } from "obsidian";
import { CopilotClient } from "@github/copilot-sdk";
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
      text: "Uses the GitHub Copilot SDK. No token configuration needed — auth is managed by the CLI.",
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
      const cliUrl = await this.plugin.cliManager.start();
      const client = new CopilotClient({ logLevel: "none", cliUrl });
      await client.start();
      const resp = await client.ping("health");
      await client.stop();
      setting.setDesc(`✓ Connected (${new Date(resp.timestamp).toLocaleTimeString()})`);
    } catch {
      setting.setDesc("⚠ Could not connect to Copilot CLI. Check that @github/copilot is installed in the plugin directory.");
    }
  }
}
