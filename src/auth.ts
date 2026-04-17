import { execFileSync, spawn } from "child_process";
import { homedir } from "os";
import { join } from "path";

// Common locations for the gh binary on macOS / Linux
export const GH_CANDIDATES = [
  "/opt/homebrew/bin/gh",
  "/usr/local/bin/gh",
  "/usr/bin/gh",
  "gh",
];

function findGhBinary(): string | null {
  for (const gh of GH_CANDIDATES) {
    try {
      execFileSync(gh, ["--version"], { stdio: "ignore", timeout: 3000 });
      return gh;
    } catch { /* try next */ }
  }
  return null;
}

export interface GhAccount {
  login: string;
  token: string;
}

/**
 * Return all GitHub accounts logged in via the gh CLI.
 */
export function listGhAccounts(): GhAccount[] {
  const gh = findGhBinary();
  if (!gh) return [];

  const accounts: GhAccount[] = [];

  // `gh auth status` lists all logged-in accounts
  let statusOut = "";
  try {
    statusOut = execFileSync(gh, ["auth", "status"], {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    // gh auth status exits non-zero when any account has issues; still get stdout
    statusOut = (e as { stdout?: string }).stdout ?? "";
  }

  // Extract account names from status output lines like:
  //   ✓ Logged in to github.com account USERNAME (keyring)
  const loginRe = /Logged in to github\.com account (\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = loginRe.exec(statusOut)) !== null) {
    const login = m[1];
    try {
      const token = execFileSync(gh, ["auth", "token", "-u", login], {
        encoding: "utf8",
        timeout: 5000,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (token) accounts.push({ login, token });
    } catch { /* skip */ }
  }

  // Fallback: just get the default token
  if (accounts.length === 0) {
    try {
      const token = execFileSync(gh, ["auth", "token"], {
        encoding: "utf8",
        timeout: 5000,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (token) accounts.push({ login: "default", token });
    } catch { /* no gh auth */ }
  }

  return accounts;
}

/**
 * Get the token for a specific gh account login (or default active account).
 */
export function getGhTokenForAccount(login?: string): string | null {
  const gh = findGhBinary();
  if (!gh) return null;

  const args = login && login !== "default"
    ? ["auth", "token", "-u", login]
    : ["auth", "token"];

  try {
    const token = execFileSync(gh, args, {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return token || null;
  } catch {
    return null;
  }
}

/**
 * Validate a GitHub token by hitting the /user endpoint.
 * Returns the login name on success, throws on failure.
 */
export async function validateGhToken(token: string): Promise<string> {
  const { requestUrl } = await import("obsidian");
  const resp = await requestUrl({
    url: "https://api.github.com/user",
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
    throw: false,
  });
  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(`Token validation failed: ${resp.status}`);
  }
  const data = resp.json as { login: string };
  return data.login;
}

export interface GhAuthProgress {
  onCode(code: string, url: string): void;
}

/**
 * Run `gh auth refresh --scopes copilot` (device flow).
 * Resolves when the flow completes. Rejects on error.
 * @param onCode  called with the one-time code + URL so the UI can show it.
 */
/**
 * Run `gh auth login` via device flow so the user can authenticate with
 * ANY account (not just the currently active one). The newly authenticated
 * account becomes the active gh CLI account. Resolves with the token on success.
 */
export function runGhDeviceLogin(onCode: (code: string, url: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const gh = findGhBinary();
    if (!gh) {
      reject(new Error("gh CLI not found. Install it from https://cli.github.com/"));
      return;
    }

    // Use `gh auth login` without --web so it does device flow in non-TTY mode.
    // --scopes adds copilot scope on top of defaults.
    const child = spawn(
      gh,
      ["auth", "login", "--hostname", "github.com", "--git-protocol", "https",
       "--scopes", "copilot,repo,gist,read:org"],
      { stdio: ["pipe", "pipe", "pipe"] }
    );

    let buf = "";
    let codeSent = false;

    const handleChunk = (data: Buffer) => {
      buf += data.toString();

      // Show the device code as soon as we see it
      if (!codeSent) {
        const codeMatch = buf.match(/one-time code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/i);
        if (codeMatch) {
          codeSent = true;
          onCode(codeMatch[1], "https://github.com/login/device");
          // Some gh versions prompt to open browser — answer no
          child.stdin?.write("N\n");
        }
      }

      // If gh prompts about git credentials, decline
      if (/Authenticate Git.*\(Y\/n\)/i.test(buf)) {
        child.stdin?.write("n\n");
      }
    };

    child.stdout?.on("data", handleChunk);
    child.stderr?.on("data", handleChunk);

    child.on("close", (code) => {
      if (code === 0) {
        // Pick up the now-active token
        const token = execFileSync(gh, ["auth", "token"], {
          encoding: "utf8",
          timeout: 5000,
          stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        resolve(token);
      } else {
        reject(new Error(`gh auth login failed (exit ${code}):\n${buf}`));
      }
    });
    child.on("error", reject);
  });
}

/** @deprecated Use runGhDeviceLogin instead */
export function runGhAuthRefresh(onCode: (code: string, url: string) => void): Promise<void> {
  return runGhDeviceLogin(onCode).then(() => undefined);
}

