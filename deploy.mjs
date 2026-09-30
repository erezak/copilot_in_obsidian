import { cpSync, mkdirSync, copyFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const VAULT_PLUGIN_DIR = process.argv[2];
if (!VAULT_PLUGIN_DIR) {
  throw new Error("Usage: node deploy.mjs <vault>/.obsidian/plugins/copilot-vault-agent");
}
const COPILOT_SRC = join(__dirname, "node_modules/@github/copilot");
const COPILOT_DEST = join(VAULT_PLUGIN_DIR, "node_modules/@github/copilot");

mkdirSync(VAULT_PLUGIN_DIR, { recursive: true });

// Plugin files
for (const file of ["main.js", "manifest.json", "styles.css"]) {
  copyFileSync(join(__dirname, file), join(VAULT_PLUGIN_DIR, file));
  console.log(`  ✓ ${file}`);
}

// @github/copilot — minimum for headless CLI (index.js + app.js + native prebuilds)
mkdirSync(COPILOT_DEST, { recursive: true });
for (const file of ["package.json", "index.js", "app.js"]) {
  copyFileSync(join(COPILOT_SRC, file), join(COPILOT_DEST, file));
  console.log(`  ✓ node_modules/@github/copilot/${file}`);
}

// darwin-arm64 native addons (keytar for keychain auth, pty, etc.)
const platform = `${process.platform}-${process.arch}`;
const prebuildSrc = join(COPILOT_SRC, "prebuilds", platform);
const prebuildDest = join(COPILOT_DEST, "prebuilds", platform);
cpSync(prebuildSrc, prebuildDest, { recursive: true });
console.log(`  ✓ node_modules/@github/copilot/prebuilds/${platform}/`);

// Skills — copy the repository's skills into the plugin's skills/ folder
const SKILLS_SRC = join(__dirname, ".github/skills");
const SKILLS_DEST = join(VAULT_PLUGIN_DIR, "skills");
cpSync(SKILLS_SRC, SKILLS_DEST, { recursive: true });
console.log(`  ✓ skills/`);

console.log(`\nDeployed to ${VAULT_PLUGIN_DIR}`);
