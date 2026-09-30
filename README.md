# Copilot Vault Agent

An Obsidian desktop plugin that provides a Copilot-powered chat panel with access to the open vault. It uses the GitHub Copilot SDK and a locally launched Copilot CLI process.

## Requirements

- Obsidian 1.4 or later (desktop)
- A GitHub Copilot subscription and an authenticated Copilot CLI
- Node.js available on `PATH` when Obsidian starts

The plugin starts the bundled `@github/copilot` CLI using system Node.js because Obsidian's Electron runtime is not compatible with the CLI's native modules. Sign in to the Copilot CLI in a terminal before using the plugin.

## Build and install

```bash
pnpm install
pnpm run build
```

Copy `main.js`, `manifest.json`, `styles.css`, the `node_modules/@github/copilot` package, and the repository's `.github/skills` directory (as `skills/`) into:

```text
<vault>/.obsidian/plugins/copilot-vault-agent/
```

Or deploy directly, replacing the path with your plugin directory:

```bash
pnpm run deploy -- /path/to/vault/.obsidian/plugins/copilot-vault-agent
```

Enable **Copilot Vault Agent** under Obsidian's community plugin settings.

## Use

Open the chat from the ribbon icon or the **Open Copilot Chat** command. The chat uses the vault as its working directory, loads the included agent skills, and can attach the active note to each message. The **Stop** button aborts the current response; the header button starts a fresh session.

Settings let you choose a Copilot model, toggle active-note attachments, and append custom instructions to the system prompt. Authentication is handled by the Copilot CLI.

The CLI is granted tool permissions automatically. Copilot can therefore read and modify files in the vault; use it only with vault content you are comfortable making available to Copilot and its tools.

## Development

```bash
pnpm run dev    # watch mode
pnpm run build  # type-check and production build
```
