import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import wasm from "vite-plugin-wasm";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [wasm(), react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    exclude: ["wasm-engine"],
  },
  // O worker do motor (`src/lib/engine/engine.worker.ts`) carrega o WASM por
  // `import()` dinâmico, o que exige code-splitting. O padrão do Vite para workers
  // é "iife", que não suporta splitting e QUEBRA O BUILD DE PRODUÇÃO (dev passa).
  worker: {
    format: "es",
  },
  build: {
    target: "esnext",
  },
}));
