import esbuild from "esbuild";
import process from "process";
import { builtinModules, createRequire } from "module";
import { dirname, resolve } from "path";

const prod = process.argv[2] === "production";
const require = createRequire(import.meta.url);

// vscode-jsonrpc's package.json browser field remaps lib/node/main.js → lib/browser/main.js,
// causing esbuild (in browser platform mode) to bundle the browser build which lacks
// StreamMessageReader. Intercept the import BEFORE esbuild applies the browser mapping.
const vscodeJsonrpcNodeFix = {
  name: "vscode-jsonrpc-node-fix",
  setup(build) {
    build.onResolve({ filter: /lib[/\\]node[/\\]main/ }, (args) => {
      if (!args.importer.includes("vscode-jsonrpc")) return undefined;
      return { path: resolve(dirname(args.importer), args.path + ".js") };
    });
  },
};

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
  ],
  plugins: [vscodeJsonrpcNodeFix],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
