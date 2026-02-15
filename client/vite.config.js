import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const devApiProxyTarget =
  process.env.VITE_DEV_API_PROXY_TARGET || "http://localhost:8080";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: devApiProxyTarget,
        changeOrigin: true,
        secure: false
      }
    }
  }
});
