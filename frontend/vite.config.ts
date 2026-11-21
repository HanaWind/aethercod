import { resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const output = fileURLToPath(new URL("../src/aethercod/frontend_dist", import.meta.url));

// Load Rollup's AMD chunks as classic scripts. WebView2 blocks ES module imports from file://.
const desktopLoader = `<script>
(() => {
  const modules = new Map();
  const resolve = (id, from = location.href) => new URL(id, from).href;
  window.__aethercodDefine = (id, dependencies, factory) => {
    modules.set(resolve(id), { dependencies, factory, exports: {}, initialized: false });
  };
  function load(id) {
    const module = modules.get(id);
    if (!module) throw new Error("Missing Aethercod module: " + id);
    if (!module.initialized) {
      module.initialized = true;
      const args = module.dependencies.map(dependency =>
        dependency === "exports" ? module.exports : load(resolve(dependency, id))
      );
      module.exports = module.factory(...args) ?? module.exports;
    }
    return module.exports;
  }
  document.addEventListener("DOMContentLoaded", () => {
    load(resolve(document.querySelector("[data-aethercod-entry]").dataset.aethercodEntry));
  }, { once: true });
})();
</script>`;

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "aethercod-file-entry",
      apply: "build",
      async writeBundle(_options, bundle) {
        const chunks = Object.values(bundle).filter((item) => item.type === "chunk");
        const entry = chunks.find((chunk) => chunk.isEntry);
        if (!entry) throw new Error("Missing Aethercod frontend entry");
        const path = resolve(output, "index.html");
        const html = await readFile(path, "utf8");
        const scripts = chunks
          .map((chunk) => `<script defer src="./${chunk.fileName}"></script>`)
          .join("\n");
        await writeFile(
          path,
          html
            .replace(/<script\b[^>]*type="module"[^>]*><\/script>/g, "")
            .replace(/(<link rel="stylesheet") crossorigin/g, "$1")
            .replace("</head>", () =>
              `${desktopLoader}\n<meta data-aethercod-entry="./${entry.fileName.replace(/\.js$/, "")}">\n${scripts}\n</head>`,
            ),
        );
      },
    },
  ],
  build: {
    outDir: output,
    emptyOutDir: true,
    cssCodeSplit: false,
    modulePreload: false,
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        format: "amd",
        amd: { autoId: true, define: "__aethercodDefine" },
        manualChunks(id) {
          if (/\/node_modules\/(react(?:-dom)?|scheduler)\//.test(id)) return "vendor-react";
          if (/\/node_modules\/(framer-motion|motion-dom|motion-utils)\//.test(id)) return "vendor-motion";
          if (id.includes("/node_modules/lucide-react/")) return "vendor-icons";
          if (id.includes("/node_modules/")) return "vendor-markdown";
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
  },
});
