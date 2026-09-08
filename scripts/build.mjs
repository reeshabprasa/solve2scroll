import { build } from "vite";
import { resolve } from "node:path";
await build({
  configFile: false,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve("popup.html"),
        blocked: resolve("blocked.html"),
        welcome: resolve("welcome.html"),
        background: resolve("src/background.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
      },
    },
  },
});
for (const [name, file] of Object.entries({
  social: "social",
  leetcode: "leetcode",
  "leetcode-main": "leetcode-main",
})) {
  await build({
    configFile: false,
    publicDir: false,
    build: {
      outDir: "dist",
      emptyOutDir: false,
      lib: {
        entry: resolve(`src/content/${file}.ts`),
        name: name.replaceAll("-", "_"),
        formats: ["iife"],
        fileName: () => `${name}.js`,
      },
    },
  });
}
