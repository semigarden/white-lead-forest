import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const pagesBase = "/white-lead-forest/";

export default defineConfig(({ command }) => ({
    plugins: [react()],
    base:
        command === "serve"
            ? "/"
            : process.env.GITHUB_PAGES === "true"
              ? pagesBase
              : "./",
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    server: {
        host: "0.0.0.0",
        open: true,
    },
}));
