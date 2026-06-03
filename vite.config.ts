import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

const PROD_API = process.env.PROD_API === "1";
const PROD_URL = "https://crm.vnmentors.com";
const USE_REMOTE_D1 = false;

export default defineConfig({
	plugins: [
		tailwindcss(),
		react(),
		...(PROD_API ? [] : [
			cloudflare(
				(USE_REMOTE_D1
					? { experimental: { remoteBindings: true } }
					: {}) as any
			)
		]),
	],
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
