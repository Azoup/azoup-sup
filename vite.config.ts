import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(async ({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const plugins: Plugin[] = [react()];
  // API local só no dev — evita carregar Supabase no `vite build` da Vercel
  if (command === "serve") {
    const { adminApiDevPlugin } = await import("./vite-plugin-admin-api");
    plugins.push(adminApiDevPlugin(env));
  }

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins,
    build: {
      sourcemap: false,
      chunkSizeWarningLimit: 3000,
      rollupOptions: {
        maxParallelFileOps: 2,
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
    },
  };
});
