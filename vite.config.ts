import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

const PROD_API = process.env.PROD_API === "1";
const PROD_URL = "https://admin-vnmentors.hulumap.workers.dev";

export default defineConfig({
	plugins: [tailwindcss(), react(), ...(PROD_API ? [] : [cloudflare()])],
	...(PROD_API ? {
		server: {
			proxy: {
				"/api": {
					target: PROD_URL,
					changeOrigin: true,
				},
			},
		},
	} : {}),
});
