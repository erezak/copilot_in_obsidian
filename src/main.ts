import { Plugin, WorkspaceLeaf } from "obsidian";
import {
  CopilotSettings,
  CopilotSettingTab,
  DEFAULT_SETTINGS,
} from "./settings";
import {
  CopilotChatView,
  VIEW_TYPE_COPILOT,
} from "./views/CopilotChatView";

export default class CopilotPlugin extends Plugin {
  settings!: CopilotSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(
      VIEW_TYPE_COPILOT,
      (leaf) => new CopilotChatView(leaf, this)
    );

    this.addRibbonIcon("bot", "Open Copilot Chat", () =>
      void this.activateView()
    );

    this.addCommand({
      id: "open-copilot-chat",
      name: "Open Copilot Chat",
      callback: () => void this.activateView(),
    });

    this.addCommand({
      id: "open-copilot-with-file",
      name: "Ask Copilot about current file",
      callback: () => void this.activateView(),
    });

    this.addSettingTab(new CopilotSettingTab(this.app, this));
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_COPILOT);
  }

  async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) ?? {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved) as CopilotSettings;
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.app.workspace
      .getLeavesOfType(VIEW_TYPE_COPILOT)
      .forEach((leaf) => {
        if (leaf.view instanceof CopilotChatView) {
          leaf.view.refreshSettings();
        }
      });
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_COPILOT);

    if (existing.length > 0) {
      workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf: WorkspaceLeaf | null = workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE_COPILOT, active: true });
      workspace.revealLeaf(leaf);
    }
  }
}
