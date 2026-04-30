import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const now = new Date();
const buildTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
