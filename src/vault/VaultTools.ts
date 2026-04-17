import { App, TFile } from "obsidian";

// ── Limits ────────────────────────────────────────────────────────────────────
const MAX_FILE_READ_CHARS = 50_000;
const MAX_LIST_FILES = 100;
const MAX_SEARCH_RESULTS = 10;
const MAX_SEARCH_SNIPPET_CHARS = 400;

// ── Tool definitions (OpenAI function-calling schema) ─────────────────────────
export const VAULT_TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read the content of a file from the vault. Returns the file content as a string, or an error if the file is not found.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              'Path relative to vault root, e.g. "folder/my-note.md".',
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_file",
      description:
        "Create a new file in the vault with the given markdown content. Returns an error if the file already exists — use replace_in_file to edit an existing file.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path including the .md extension.",
          },
          content: {
            type: "string",
            description: "Full markdown content for the new file.",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "replace_in_file",
      description:
        "Replace an exact block of text inside an existing file. oldText must match verbatim (including whitespace and newlines). To make a safe edit: read_file first, pick the smallest unique block to replace, then call replace_in_file. Returns an error if oldText is not found or is ambiguous.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path of the file to edit.",
          },
          oldText: {
            type: "string",
            description:
              "The exact text to find. Must appear exactly once in the file.",
          },
          newText: {
            type: "string",
            description: "Replacement text.",
          },
        },
        required: ["path", "oldText", "newText"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: `List files in the vault. Returns up to ${MAX_LIST_FILES} paths. Use the folder parameter to narrow results.`,
      parameters: {
        type: "object",
        properties: {
          folder: {
            type: "string",
            description:
              'Optional folder path to restrict listing, e.g. "projects".',
          },
          extension: {
            type: "string",
            description:
              'Filter by extension without the dot, e.g. "md" (default). Use "pdf" or "png" for attachments.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description: `Search note contents for a query string (case-insensitive). Returns up to ${MAX_SEARCH_RESULTS} matches with surrounding context. Prefer this over reading every file individually.`,
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Text to search for.",
          },
          folder: {
            type: "string",
            description: "Restrict search to this folder (optional).",
          },
        },
        required: ["query"],
      },
    },
  },
] as const;

export type VaultToolName =
  | "read_file"
  | "create_file"
  | "replace_in_file"
  | "list_files"
  | "search_files";

export type WriteConfirmCallback = (
  path: string,
  operation: string,
  onConfirm: () => void,
  onCancel: () => void
) => void;

// ── VaultTools class ──────────────────────────────────────────────────────────

export class VaultTools {
  private app: App;
  private confirmedWrites: boolean;
  private confirmCallback: WriteConfirmCallback | null = null;

  constructor(app: App, confirmedWrites = true) {
    this.app = app;
    this.confirmedWrites = confirmedWrites;
  }

  setConfirmCallback(cb: WriteConfirmCallback): void {
    this.confirmCallback = cb;
  }

  async handle(name: string, args: Record<string, unknown>): Promise<string> {
    switch (name as VaultToolName) {
      case "read_file":
        return this.readFile(args.path as string);
      case "create_file":
        return this.createFile(args.path as string, args.content as string);
      case "replace_in_file":
        return this.replaceInFile(
          args.path as string,
          args.oldText as string,
          args.newText as string
        );
      case "list_files":
        return this.listFiles(
          args.folder as string | undefined,
          args.extension as string | undefined
        );
      case "search_files":
        return this.searchFiles(
          args.query as string,
          args.folder as string | undefined
        );
      default:
        return `Error: Unknown tool "${name}".`;
    }
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  private async readFile(path: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      return (
        `Error: File not found: "${path}". ` +
        `Use list_files to browse available files.`
      );
    }
    const content = await this.app.vault.read(file);
    if (content.length > MAX_FILE_READ_CHARS) {
      return (
        content.slice(0, MAX_FILE_READ_CHARS) +
        `\n\n[Truncated — file is ${content.length} chars, showing first ${MAX_FILE_READ_CHARS}]`
      );
    }
    return content;
  }

  private async createFile(path: string, content: string): Promise<string> {
    if (this.app.vault.getAbstractFileByPath(path)) {
      return (
        `Error: "${path}" already exists. ` +
        `Use replace_in_file to edit it.`
      );
    }
    if (!(await this.requestConfirm(path, "create"))) {
      return "Operation cancelled by user.";
    }
    try {
      await this.ensureFolderExists(path);
      await this.app.vault.create(path, content);
      return `Created "${path}".`;
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  private async replaceInFile(
    path: string,
    oldText: string,
    newText: string
  ): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      return `Error: File not found: "${path}".`;
    }
    if (!(await this.requestConfirm(path, "edit"))) {
      return "Operation cancelled by user.";
    }
    const content = await this.app.vault.read(file);
    if (!content.includes(oldText)) {
      return (
        `Error: The specified text was not found in "${path}". ` +
        `Read the file first to get the exact current content.`
      );
    }
    const occurrences = content.split(oldText).length - 1;
    if (occurrences > 1) {
      return (
        `Error: The oldText appears ${occurrences} times in "${path}". ` +
        `Include more surrounding context to make it unique.`
      );
    }
    await this.app.vault.modify(file, content.replace(oldText, newText));
    return `Updated "${path}" successfully.`;
  }

  private listFiles(folder?: string, extension = "md"): string {
    let files = this.app.vault.getFiles();
    if (folder) {
      const prefix = folder.endsWith("/") ? folder : folder + "/";
      files = files.filter(
        (f) => f.path.startsWith(prefix) || f.path === folder
      );
    }
    files = files.filter((f) => f.extension === extension);
    const total = files.length;
    const listed = files
      .slice(0, MAX_LIST_FILES)
      .map((f) => f.path)
      .join("\n");

    if (total === 0) return "No files found.";
    if (total > MAX_LIST_FILES)
      return (
        listed +
        `\n\n[Showing ${MAX_LIST_FILES} of ${total} files. ` +
        `Use folder parameter to narrow results.]`
      );
    return listed;
  }

  private async searchFiles(query: string, folder?: string): Promise<string> {
    const lower = query.toLowerCase();
    const files = this.app.vault.getFiles().filter((f) => {
      if (f.extension !== "md") return false;
      if (folder) {
        const prefix = folder.endsWith("/") ? folder : folder + "/";
        return f.path.startsWith(prefix);
      }
      return true;
    });

    const results: string[] = [];

    for (const file of files) {
      if (results.length >= MAX_SEARCH_RESULTS) break;

      // Fast filename check
      if (file.basename.toLowerCase().includes(lower)) {
        results.push(`**${file.path}** _(filename match)_`);
        continue;
      }

      // Content search
      try {
        const content = await this.app.vault.read(file);
        const lc = content.toLowerCase();
        const idx = lc.indexOf(lower);
        if (idx === -1) continue;

        const start = Math.max(0, idx - 120);
        const end = Math.min(
          content.length,
          idx + query.length + MAX_SEARCH_SNIPPET_CHARS
        );
        const snippet = content
          .slice(start, end)
          .replace(/\n+/g, " ")
          .trim();

        results.push(`**${file.path}**\n> …${snippet}…`);
      } catch {
        // Skip unreadable files silently
      }
    }

    if (results.length === 0) return `No files found matching "${query}".`;
    return results.join("\n\n");
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private requestConfirm(path: string, op: string): Promise<boolean> {
    if (!this.confirmedWrites || !this.confirmCallback) return Promise.resolve(true);
    return new Promise((resolve) => {
      this.confirmCallback!(path, op, () => resolve(true), () => resolve(false));
    });
  }

  private async ensureFolderExists(filePath: string): Promise<void> {
    const parts = filePath.split("/");
    if (parts.length <= 1) return;
    const folder = parts.slice(0, -1).join("/");
    if (!this.app.vault.getFolderByPath(folder)) {
      await this.app.vault.createFolder(folder);
    }
  }
}
