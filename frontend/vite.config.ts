import { resolve } from "node:path";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const output = resolve(projectRoot, "../src/aethercod/frontend_dist");

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "aethercod-file-entry",
      apply: "build",
      async writeBundle() {
        // Embed the entry assets so file:// works with WebView2 file access restricted.
        const path = resolve(output, "index.html");
        const html = await readFile(path, "utf8");
        const script = html.match(
          /<script [^>]*src="(\.\/assets\/[^"]+\.js)"[^>]*><\/script>/,
        );
        const style = html.match(
          /<link [^>]*href="(\.\/assets\/[^"]+\.css)"[^>]*>/,
        );
        if (!script || !style)
          throw new Error("Expected one bundled script and stylesheet");
        const scriptPath = resolve(output, script[1]);
        const stylePath = resolve(output, style[1]);
        const [code, css] = await Promise.all([
          readFile(scriptPath, "utf8"),
          readFile(stylePath, "utf8"),
        ]);
        await writeFile(
          path,
          html
            .replace(script[0], "")
            .replace(
              style[0],
              () =>
                "<style>" + css.replace(/<\/style/gi, "<\\/style") + "</style>",
            )
            .replace(
              "</body>",
              () =>
                "<script>" +
                code.replace(/<\/script/gi, "<\\/script") +
                "</script></body>",
            ),
        );
        await Promise.all([unlink(scriptPath), unlink(stylePath)]);
      },
    },
  ],
  build: {
    outDir: output,
    emptyOutDir: true,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { output: { format: "iife", inlineDynamicImports: true } },
  },
  server: {
    host: "127.0.0.1",
  },
});
