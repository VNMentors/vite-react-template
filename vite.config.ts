import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// Đổi thành true để dùng D1 production khi chạy local
const USE_REMOTE_D1 = false;

export default defineConfig({
	plugins: [
		tailwindcss(),
		react(),
		cloudflare(
			USE_REMOTE_D1
				? { experimental: { remoteBindings: true } }
				: {}
		),
	],
});
