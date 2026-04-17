# Copilot Vault Agent — Obsidian Plugin

Chat with your vault using **GitHub Models** (free, official API) or **GitHub Copilot** (subscription). The AI agent can read, create, and edit notes directly in your vault.

---

## Features

- **Sidebar chat panel** — persistent conversation in the right sidebar
- **Vault-aware tools** — the AI can read, create, and surgically edit `.md` files
- **Active file context** — the currently open note is automatically included in every message
- **Confirmation dialogs** — prompts you before any file is written (configurable)
- **Cancellable** — stop generation mid-stream at any time
- **Two providers** — GitHub Models (free PAT) or GitHub Copilot (subscription)
- **Custom endpoint** — works with any OpenAI-compatible API (Ollama, etc.)

---

## Installation

1. **Build from source**
   ```bash
   cd copilot_in_obsidian
   npm install          # requires Node.js 18+
   npm run build        # produces main.js
   ```

2. **Copy to your vault's plugin folder**
   ```
   <vault>/.obsidian/plugins/copilot-vault-agent/
     main.js
     manifest.json
     styles.css
   ```

3. **Enable the plugin** in Obsidian → Settings → Community plugins → Copilot Vault Agent

---

## Setup

### GitHub Models (Recommended — free)

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens) → **Generate new token (classic)**
2. No special scopes required (public access is enough for GitHub Models free tier)
3. In Obsidian: Settings → Copilot Vault Agent → paste the token → Provider: **GitHub Models**

**Free tier limits:** ~15 requests/min, ~150 000 tokens/day for most models.

### GitHub Copilot (Copilot subscribers)

1. Generate a classic PAT — no special scopes needed; your account just needs an active Copilot subscription
2. Settings → Provider: **GitHub Copilot**  
   The plugin automatically exchanges the PAT for a short-lived Copilot session token.

### Custom endpoint

Point to any OpenAI-compatible `/chat/completions` endpoint (local Ollama, LM Studio, etc.).

---

## Usage

| Action | How |
|--------|-----|
| Open chat | Ribbon icon (**bot**) or `Cmd/Ctrl+P` → *Open Copilot Chat* |
| Send message | Type + `Enter` (Shift+Enter for newline) |
| Stop generation | **■ Stop** button |
| New conversation | **↺** button in chat header |
| Insert result at cursor | Open a note, ask the AI to write something, then copy from the chat |

### What the AI can do

- **Read notes** — `read_file("path/to/note.md")`
- **Create notes** — `create_file("path/new.md", content)`
- **Edit notes** — `replace_in_file("path/note.md", exactOldText, newText)` *(surgical, not full overwrite)*
- **List files** — `list_files(folder?)` — up to 100 results
- **Search** — `search_files(query, folder?)` — content + filename search

### Example prompts

```
Summarise the current note in 3 bullet points.

Find all notes that mention "project Phoenix" and create a new note
that links them together.

Add a ## Resources section to the current note with links to the
most relevant notes in my vault.

Create a daily note for today with sections for Goals, Tasks, and Notes.
```

---

## Settings reference

| Setting | Default | Description |
|---------|---------|-------------|
| Provider | GitHub Models | Which AI service to use |
| GitHub Token | — | PAT for authentication |
| Model | `openai/gpt-4o` | AI model |
| Include active file | ✅ | Inject the open note into every message |
| Confirm file writes | ✅ | Show a dialog before create/edit |
| History length | 20 | Message pairs kept in memory |
| Custom system prompt | — | Extra instructions appended to the system prompt |

---

## Security notes

- The GitHub token is stored **locally in plain text** in Obsidian's plugin data folder (`<vault>/.obsidian/plugins/copilot-vault-agent/data.json`).
- Use a **minimal-scope token** — for GitHub Models, no scopes are required at all.
- Note contents sent to the AI leave your machine. Exclude sensitive folders using the folder parameter in prompts, or disable the *Include active file* setting.

---

## Development

```bash
npm run dev    # watch mode — rebuilds on save
npm run build  # production minified build
```

The plugin uses:
- **esbuild** for bundling
- **TypeScript** with strict mode
- **Obsidian ItemView** for the sidebar panel
- GitHub Models / Copilot **chat completions API** (OpenAI-compatible)
- **Tool calling** for the agentic loop (read/create/edit files)
