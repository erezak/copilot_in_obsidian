import { spawn, ChildProcess } from "node:child_process";

/**
 * Manages the lifecycle of the @github/copilot CLI subprocess.
 *
 * Obsidian's Electron process sets process.execPath to the Electron binary,
 * whose Node ABI is incompatible with the native prebuilds in @github/copilot.
 * We therefore spawn the CLI ourselves using a real system node found via
 * an augmented PATH, then hand the listening port to CopilotClient via cliUrl.
 */
export class CliManager {
  private cliProcess: ChildProcess | null = null;
  private cliUrl: string | null = null;
  private startPromise: Promise<string> | null = null;

  constructor(private readonly cliPath: string) {}

  /**
   * Start the CLI if not already running. Returns the cliUrl ("localhost:PORT").
   * Idempotent — multiple concurrent callers share the same startup promise.
   */
  async start(): Promise<string> {
    if (this.cliUrl) return this.cliUrl;
    if (this.startPromise) return this.startPromise;

    this.startPromise = this.spawn();
    try {
      this.cliUrl = await this.startPromise;
      return this.cliUrl;
    } catch (err) {
      this.startPromise = null;
      throw err;
    }
  }

  async stop(): Promise<void> {
    this.cliUrl = null;
    this.startPromise = null;
    if (this.cliProcess) {
      const proc = this.cliProcess;
      this.cliProcess = null;
      await new Promise<void>((resolve) => {
        proc.once("exit", () => resolve());
        proc.kill("SIGTERM");
        setTimeout(() => { proc.kill("SIGKILL"); resolve(); }, 3000);
      });
    }
  }

  private spawn(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      // Build an augmented PATH so /usr/bin/env can find system node even
      // when Obsidian's GUI-app PATH is stripped.
      const home = process.env.HOME ?? "";
      const extraBins = [
        `${home}/.local/share/mise/shims`,
        `${home}/.nvm/current/bin`,
        `${home}/.volta/bin`,
        "/opt/homebrew/bin",
        "/usr/local/bin",
      ];
      const augmentedPath = [...extraBins, process.env.PATH ?? ""].join(":");

      const proc = spawn(
        "/usr/bin/env",
        ["node", this.cliPath, "--headless", "--no-auto-update", "--log-level", "warning", "--port", "0"],
        {
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env, PATH: augmentedPath },
          windowsHide: true,
        }
      );

      this.cliProcess = proc;
      let stdout = "";
      let resolved = false;

      proc.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
        const match = stdout.match(/listening on port (\d+)/i);
        if (match && !resolved) {
          resolved = true;
          resolve(`localhost:${match[1]}`);
        }
      });

      proc.stderr?.on("data", (chunk: Buffer) => {
        const lines = chunk.toString().split("\n");
        for (const line of lines) {
          if (line.trim() && !line.includes("ExperimentalWarning")) {
            process.stderr.write(`[copilot-cli] ${line}\n`);
          }
        }
      });

      proc.on("error", (err) => {
        if (!resolved) {
          resolved = true;
          reject(new Error(`Failed to spawn CLI: ${err.message}`));
        }
        this.cliProcess = null;
        this.cliUrl = null;
        this.startPromise = null;
      });

      proc.on("exit", (code, signal) => {
        if (!resolved) {
          resolved = true;
          reject(new Error(`CLI exited before becoming ready (code=${code}, signal=${signal})`));
        }
        // If it was already resolved (running normally) reset so next call re-spawns.
        if (this.cliProcess === proc) {
          this.cliProcess = null;
          this.cliUrl = null;
          this.startPromise = null;
        }
      });
    });
  }
}
