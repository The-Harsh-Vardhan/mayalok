import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative asset paths so the build works from any static host or sub-path.
  base: "./",
  plugins: [react()],
  worker: { format: "es" },
  // Listen on the LAN so phones on the same Wi-Fi can open the dev server.
  server: { host: true },
  test: { environment: "node" },
});
