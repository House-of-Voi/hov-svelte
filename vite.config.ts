import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
	plugins: [sveltekit()],
	resolve: {
		alias: [
			{
				find: /^@agoralabs-sh\/avm-web-provider$/,
				replacement: resolve('./src/lib/shims/agoralabs-web-provider.ts')
			}
		]
	},
	define: {
		global: 'globalThis'
	},
	optimizeDeps: {
		esbuildOptions: {
			define: {
				global: 'globalThis'
			}
		}
	},
	ssr: {
		noExternal: ['buffer'],
		resolve: {
			external: []
		}
	}
});
