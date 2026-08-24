import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

const src = (path) => fileURLToPath(new URL(`./src/${path}`, import.meta.url));

// Worker scripts are built as their own entry points (real files under
// `dist/workers/`, not `?worker`-inlined blobs) so loaders can address them
// at runtime with a plain `new URL("../workers/Foo.js", import.meta.url)` -
// that works both in this dev harness and for any downstream app bundler,
// since it's just standard `import.meta.url` resolution, not a Vite-only
// worker-import feature. Entries here mirror `src/workers/`.
// EPT's own `binary`/`zstandard` node formats aren't ported (see the
// `dataType !== 'laszip'` guard in PointCloudEptGeometry.js) - their loaders
// and workers are broken in the upstream source, so there's no
// EptBinaryDecoderWorker/EptZstandardDecoderWorker entry here.
const workerEntries = {
	"workers/BinaryDecoderWorker": src("workers/BinaryDecoderWorker.js"),
	"workers/LASDecoderWorker": src("workers/LASDecoderWorker.js"),
	"workers/EptLaszipDecoderWorker": src("workers/EptLaszipDecoderWorker.js"),
	"workers/octree2/DecoderWorker": src("workers/octree2/DecoderWorker.js"),
	"workers/octree2/DecoderWorker_brotli": src("workers/octree2/DecoderWorker_brotli.js"),
};

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
				materials: src("materials/index.js"),
				navigation: src("navigation/index.js"),
				tools: src("tools/index.js"),
				modules: src("modules/index.js"),
				exporters: src("exporters/index.js"),
				utils: src("utils/index.js"),
				...workerEntries,
			},
			formats: ["es"],
		},
		rollupOptions: {
			external: ["three"],
			output: {
				entryFileNames: (chunkInfo) => {
					return chunkInfo.name.startsWith("workers/") ? "[name].js" : "[name]/index.js";
				},
				chunkFileNames: "shared/[name]-[hash].js",
			},
		},
	},
});
