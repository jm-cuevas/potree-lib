import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

const src = (path) => fileURLToPath(new URL(`./src/${path}`, import.meta.url));

export default defineConfig({
	root: "examples",
	server: {
		fs: {
			// allow the dev server to read sample data from ../.context/potree/pointclouds
			allow: [fileURLToPath(new URL(".", import.meta.url))],
		},
	},
	build: {
		outDir: fileURLToPath(new URL("./dist", import.meta.url)),
		emptyOutDir: true,
		sourcemap: true,
		lib: {
			entry: {
				core: src("core/index.js"),
				loaders: src("loaders/index.js"),
				navigation: src("navigation/index.js"),
				tools: src("tools/index.js"),
				modules: src("modules/index.js"),
				exporters: src("exporters/index.js"),
				utils: src("utils/index.js"),
			},
			formats: ["es"],
		},
		rollupOptions: {
			external: ["three"],
			output: {
				entryFileNames: "[name]/index.js",
				chunkFileNames: "shared/[name]-[hash].js",
			},
		},
	},
});
