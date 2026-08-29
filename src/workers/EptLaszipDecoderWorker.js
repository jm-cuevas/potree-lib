import {Las} from "copc";
import {createLazPerf} from "laz-perf";
import lazPerfWasmUrl from "laz-perf/lib/web/laz-perf.wasm?url";

// laz-perf's Emscripten-generated glue locates its sibling .wasm binary via
// a bare-relative `locateFile()` that assumes a classic `<script>` tag
// (`document.currentScript.src`) - inside an ES-module Worker there's no
// such script element, so the lookup silently falls back to an empty base
// and resolves the request against *this worker's own* URL instead of
// laz-perf's actual location, 404ing (or here, hitting the dev server's
// SPA-fallback HTML - "expected magic word 00 61 73 6d, found ... <!do").
// Supplying `locateFile` with Vite's `?url`-resolved (dev and build alike)
// wasm URL sidesteps the broken auto-detection entirely.
const lazPerfPromise = createLazPerf({locateFile: () => lazPerfWasmUrl});

// TODO: Handle extra-bytes.
async function readUsingDataView(event) {
	const {isFullFile, compressed, header, eb, pointCount, nodemin} = event.data;
	const {pointDataRecordFormat, pointDataRecordLength} = header;

	const lazPerf = await lazPerfPromise;

	// Note that for the chunk version, we use the point count passed in the
	// event rather than the point count from the header, since the header has
	// the point count for the entire file, not just our slice.
	const u = new Uint8Array(compressed);
	const buffer = isFullFile
		? await Las.PointData.decompressFile(u, lazPerf)
		: await Las.PointData.decompressChunk(
			u,
			{pointDataRecordFormat, pointDataRecordLength, pointCount},
			lazPerf,
		);

	const view = Las.View.create(buffer, header, eb);

	const buffers = {
		position: new ArrayBuffer(pointCount * 3 * 4),
		color: new ArrayBuffer(pointCount * 3 * 2),
		intensity: new ArrayBuffer(pointCount * 4),
		classification: new ArrayBuffer(pointCount),
		returnNumber: new ArrayBuffer(pointCount),
		numberOfReturns: new ArrayBuffer(pointCount),
		pointSourceId: new ArrayBuffer(pointCount * 2),
		gpsTime: new ArrayBuffer(pointCount * 4),
		indices: new ArrayBuffer(pointCount * 4),
	};
	const tempBuffers = {
		gpsTime64: new ArrayBuffer(pointCount * 8),
		color16: new ArrayBuffer(pointCount * 3 * 2), // Does not include alpha.
	};

	const views = {
		position: new Float32Array(buffers.position),
		color16: new Uint16Array(tempBuffers.color16),
		color8: new Uint8Array(buffers.color),
		intensity: new Float32Array(buffers.intensity),
		classification: new Uint8Array(buffers.classification),
		returnNumber: new Uint8Array(buffers.returnNumber),
		numberOfReturns: new Uint8Array(buffers.numberOfReturns),
		pointSourceId: new Uint16Array(buffers.pointSourceId),
		gpsTime64: new Float64Array(tempBuffers.gpsTime64),
		gpsTime32: new Float32Array(buffers.gpsTime),
		indices: new Uint32Array(buffers.indices),
	};

	const mean = [0, 0, 0];

	const getX = view.getter('X');
	const getY = view.getter('Y');
	const getZ = view.getter('Z');
	const getIntensity = view.getter('Intensity');
	const getClassification = view.getter('Classification');
	const getReturnNumber = view.getter('ReturnNumber');
	const getNumberOfReturns = view.getter('NumberOfReturns');
	const getPointSourceId = view.getter('PointSourceId');
	const getGpsTime = view.dimensions.GpsTime ? view.getter('GpsTime') : undefined;
	const getRed = view.dimensions.Red ? view.getter('Red') : undefined;
	const getGreen = view.dimensions.Red ? view.getter('Green') : undefined;
	const getBlue = view.dimensions.Red ? view.getter('Blue') : undefined;

	// `.reduce((map, name) => ({...map, [name]: ...}), {})` makes checkJs
	// infer the accumulator as the initial value's literal `{}` type instead
	// of widening it to the built-up shape - build it with plain assignment
	// instead of losing type coverage on every `ranges.*` access below.
	const ranges = /** @type {Record<string, [number, number]>} */ ({});
	for (const name of ['x', 'y', 'z', 'intensity', 'classification', 'returnNumber',
		'numberOfReturns', 'pointSourceId', 'gpsTime', 'color']) {
		ranges[name] = [Infinity, -Infinity];
	}

	function update(range, value) {
		range[0] = Math.min(range[0], value);
		range[1] = Math.max(range[1], value);
	}

	for (let i = 0; i < pointCount; i++) {
		views.indices[i] = i;

		const x = getX(i) - nodemin[0];
		const y = getY(i) - nodemin[1];
		const z = getZ(i) - nodemin[2];

		views.position[3 * i + 0] = x;
		views.position[3 * i + 1] = y;
		views.position[3 * i + 2] = z;

		mean[0] += x / pointCount;
		mean[1] += y / pointCount;
		mean[2] += z / pointCount;

		update(ranges.x, x);
		update(ranges.y, y);
		update(ranges.z, z);

		views.intensity[i] = getIntensity(i);
		update(ranges.intensity, views.intensity[i]);

		views.returnNumber[i] = getReturnNumber(i);
		update(ranges.returnNumber, views.returnNumber[i]);

		views.numberOfReturns[i] = getNumberOfReturns(i);
		update(ranges.numberOfReturns, views.numberOfReturns[i]);

		views.classification[i] = getClassification(i);
		update(ranges.classification, views.classification[i]);

		views.pointSourceId[i] = getPointSourceId(i);
		update(ranges.pointSourceId, views.pointSourceId[i]);

		if (getGpsTime) {
			views.gpsTime64[i] = getGpsTime(i);
			update(ranges.gpsTime, views.gpsTime64[i]);
		}

		if (getRed) {
			let r = getRed(i);
			let g = getGreen(i);
			let b = getBlue(i);

			// We only really care about the max here to decide if we will need
			// to normalize the colors downward to 8-bit values.
			update(ranges.color, Math.max(r, g, b));

			views.color16[3 * i + 0] = r;
			views.color16[3 * i + 1] = g;
			views.color16[3 * i + 2] = b;
		}
	}

	// Do some normalizations:
	// 	- if colors are 16-bit, normalize them down to 8-bit
	// 	- normalize the GPS times to 32-bit offset values.
	const normalizeColor = ranges.color[1] > 255 ? (c) => c / 256 : c => c;
	ranges.color[0] = normalizeColor(ranges.color[0]);
	ranges.color[1] = normalizeColor(ranges.color[1]);
	for (let i = 0; i < pointCount; i++) {
		views.color8[4 * i + 0] = normalizeColor(views.color16[3 * i + 0]);
		views.color8[4 * i + 1] = normalizeColor(views.color16[3 * i + 1]);
		views.color8[4 * i + 2] = normalizeColor(views.color16[3 * i + 2]);
		views.gpsTime32[i] = views.gpsTime64[i] - ranges.gpsTime[0];
	}

	let message = {
		...buffers,
		mean,
		tightBoundingBox: {
			min: [ranges.x[0], ranges.y[0], ranges.z[0]],
			max: [ranges.x[1], ranges.y[1], ranges.z[1]],
		},
		gpsMeta: {
			offset: ranges.gpsTime[0],
			range: ranges.gpsTime[1] - ranges.gpsTime[0],
		},
		ranges: {
			intensity: ranges.intensity,
			classification: ranges.classification,
			'return number': ranges.returnNumber,
			'number of returns': ranges.numberOfReturns,
			'source id': ranges.pointSourceId,
			'gps-time': ranges.gpsTime,
		},
	};

	let transferables = Object.values(buffers);

	postMessage(message, transferables);
}

onmessage = readUsingDataView;
