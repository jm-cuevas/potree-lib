/**
 * laslaz code taken and adapted from plas.io js-laslaz
 *	http://plas.io/
 *  https://github.com/verma/plasio
 *
 * Thanks to Uday Verma and Howard Butler
 *
 * Adapted from the reference Potree 1.8 build's
 * `libs/plasio/js/laslaz.js` (a `(function(scope){...})(this)`-wrapped
 * global-namespace script) into a real ES module. Two substantive changes
 * from the original beyond the module wrapper:
 *
 *  - `LAZLoader` (the compressed-file reader) used to hand off decompression
 *    to a *second* dedicated Worker (`Potree.scriptPath + "/workers/
 *    LASLAZWorker.js"`, itself glue around `libs/plasio/workers/
 *    laz-loader-worker.js`) via `postMessage`. That worker's WASM import was
 *    actually commented out in the reference source
 *    (`//import {Module} from "./laz-perf.js";` in `laz-loader-worker.js`),
 *    so as shipped there it referenced an undefined global `Module` and
 *    never worked. Since `../../workers/las/laz-perf.js` is now a plain ESM
 *    import here, `LAZLoader` below calls `Module.LASZip` directly instead
 *    of round-tripping through a second worker - one fewer moving part, and
 *    it actually works. (The higher-level per-node batching, i.e. handing
 *    decoded points off to `LASDecoderWorker.js`, still happens in a
 *    worker - see `LasLazLoader.js`.)
 *  - The dead NaCl-era plumbing (`doDataExchange`/`nacl_module`/
 *    `waitHandlers`/`scope.handleMessage`) is dropped: it referenced an
 *    undefined `nacl_module` global and a non-existent `Promise.defer()`
 *    API, and nothing in the live `LASFile`/`LAZLoader` path ever called
 *    it - `LAZLoader` always used its own worker-message plumbing instead.
 */

import {Module} from "../../workers/las/laz-perf.js";

const pointFormatReaders = {
	0: (dv) => ({
		"position": [dv.getInt32(0, true), dv.getInt32(4, true), dv.getInt32(8, true)],
		"intensity": dv.getUint16(12, true),
		"classification": dv.getUint8(16, true),
	}),
	1: (dv) => ({
		"position": [dv.getInt32(0, true), dv.getInt32(4, true), dv.getInt32(8, true)],
		"intensity": dv.getUint16(12, true),
		"classification": dv.getUint8(16, true),
	}),
	2: (dv) => ({
		"position": [dv.getInt32(0, true), dv.getInt32(4, true), dv.getInt32(8, true)],
		"intensity": dv.getUint16(12, true),
		"classification": dv.getUint8(16, true),
		"color": [dv.getUint16(20, true), dv.getUint16(22, true), dv.getUint16(24, true)],
	}),
	3: (dv) => ({
		"position": [dv.getInt32(0, true), dv.getInt32(4, true), dv.getInt32(8, true)],
		"intensity": dv.getUint16(12, true),
		"classification": dv.getUint8(16, true),
		"color": [dv.getUint16(28, true), dv.getUint16(30, true), dv.getUint16(32, true)],
	}),
};

function readAs(buf, Type, offset, count) {
	count = (count === undefined || count === 0 ? 1 : count);
	let sub = buf.slice(offset, offset + Type.BYTES_PER_ELEMENT * count);

	let r = new Type(sub);
	if (count === undefined || count === 1) {
		return r[0];
	}

	let ret = [];
	for (let i = 0; i < count; i++) {
		ret.push(r[i]);
	}

	return ret;
}

function parseLASHeader(arraybuffer) {
	let o = {};

	o.pointsOffset = readAs(arraybuffer, Uint32Array, 32 * 3);
	o.pointsFormatId = readAs(arraybuffer, Uint8Array, 32 * 3 + 8);
	o.pointsStructSize = readAs(arraybuffer, Uint16Array, 32 * 3 + 8 + 1);
	o.pointsCount = readAs(arraybuffer, Uint32Array, 32 * 3 + 11);

	let start = 32 * 3 + 35;
	o.scale = readAs(arraybuffer, Float64Array, start, 3); start += 24; // 8*3
	o.offset = readAs(arraybuffer, Float64Array, start, 3); start += 24;

	let bounds = readAs(arraybuffer, Float64Array, start, 6); start += 48; // 8*6;
	o.maxs = [bounds[0], bounds[2], bounds[4]];
	o.mins = [bounds[1], bounds[3], bounds[5]];

	return o;
}

/**
 * LAS Loader
 * Loads uncompressed files
 */
export class LASLoader {

	constructor(arraybuffer) {
		this.arraybuffer = arraybuffer;
		this.readOffset = 0;
		this.header = null;
	}

	open() {
		// nothing needs to be done to open this file
		this.readOffset = 0;
		return new Promise((res) => {
			setTimeout(res, 0);
		});
	}

	getHeader() {
		let o = this;

		return new Promise((res) => {
			setTimeout(() => {
				o.header = parseLASHeader(o.arraybuffer);
				res(o.header);
			}, 0);
		});
	}

	readData(count, offset, skip) {
		let o = this;

		return new Promise((res, rej) => {
			setTimeout(() => {
				if (!o.header) {
					return rej(new Error("Cannot start reading data till a header request is issued"));
				}

				let start;
				if (skip <= 1) {
					count = Math.min(count, o.header.pointsCount - o.readOffset);
					start = o.header.pointsOffset + o.readOffset * o.header.pointsStructSize;
					let end = start + count * o.header.pointsStructSize;
					res({
						buffer: o.arraybuffer.slice(start, end),
						count: count,
						hasMoreData: o.readOffset + count < o.header.pointsCount,
					});
					o.readOffset += count;
				} else {
					let pointsToRead = Math.min(count * skip, o.header.pointsCount - o.readOffset);
					let bufferSize = Math.ceil(pointsToRead / skip);
					let pointsRead = 0;

					let buf = new Uint8Array(bufferSize * o.header.pointsStructSize);
					for (let i = 0; i < pointsToRead; i++) {
						if (i % skip === 0) {
							start = o.header.pointsOffset + o.readOffset * o.header.pointsStructSize;
							let src = new Uint8Array(o.arraybuffer, start, o.header.pointsStructSize);

							buf.set(src, pointsRead * o.header.pointsStructSize);
							pointsRead++;
						}

						o.readOffset++;
					}

					res({
						buffer: buf.buffer,
						count: pointsRead,
						hasMoreData: o.readOffset < o.header.pointsCount,
					});
				}
			}, 0);
		});
	}

	close() {
		let o = this;
		return new Promise((res) => {
			o.arraybuffer = null;
			setTimeout(res, 0);
		});
	}

}

/**
 * LAZ Loader
 * Decompresses LAZ (compressed LAS) data using the vendored laz-perf
 * asm.js/embind module (`Module.LASZip`), in-process on whichever
 * thread constructs it - no separate decompression worker, see the
 * file-level comment above for why.
 */
export class LAZLoader {

	constructor(arraybuffer) {
		this.arraybuffer = arraybuffer;
		this.instance = null;
		this.header = null;
	}

	async open() {
		try {
			let instance = new Module.LASZip();
			let abInt = new Uint8Array(this.arraybuffer);
			let buf = Module._malloc(this.arraybuffer.byteLength);

			instance.arraybuffer = this.arraybuffer;
			instance.buf = buf;
			Module.HEAPU8.set(abInt, buf);
			instance.open(buf, this.arraybuffer.byteLength);
			instance.readOffset = 0;

			this.instance = instance;

			return true;
		} catch (e) {
			throw new Error("Failed to open file");
		}
	}

	async getHeader() {
		if (!this.instance) {
			throw new Error("You need to open the file before reading the header");
		}

		let header = parseLASHeader(this.instance.arraybuffer);
		header.pointsFormatId &= 0x3f;

		this.header = header;
		this.instance.header = header;

		return header;
	}

	async readData(count, offset, skip) {
		if (!this.instance) {
			throw new Error("You need to open the file before trying to read");
		}

		if (!this.header) {
			throw new Error("You need to query header before reading");
		}

		let o = this.instance;
		let h = this.header;

		let pointsToRead = Math.min(count * skip, h.pointsCount - o.readOffset);
		let bufferSize = Math.ceil(pointsToRead / skip);
		let pointsRead = 0;

		let buffer = new ArrayBuffer(bufferSize * h.pointsStructSize);
		let thisBuf = new Uint8Array(buffer);
		let bufRead = Module._malloc(h.pointsStructSize);

		for (let i = 0; i < pointsToRead; i++) {
			o.getPoint(bufRead);

			if (i % skip === 0) {
				let a = new Uint8Array(Module.HEAPU8.buffer, bufRead, h.pointsStructSize);
				thisBuf.set(a, pointsRead * h.pointsStructSize);
				pointsRead++;
			}

			o.readOffset++;
		}

		Module._free(bufRead);

		return {
			buffer: buffer,
			count: pointsRead,
			hasMoreData: o.readOffset < h.pointsCount,
		};
	}

	async close() {
		if (this.instance) {
			Module._free(this.instance.buf);
			this.instance.delete();
			this.instance = null;
		}

		return true;
	}

}

/**
 * A single consistent interface for loading LAS/LAZ files
 */
export class LASFile {

	constructor(arraybuffer) {
		this.arraybuffer = arraybuffer;
		this.isOpen = false;

		this.determineVersion();
		if (this.version > 12) {
			throw new Error("Only file versions <= 1.2 are supported at this time");
		}

		this.determineFormat();
		if (pointFormatReaders[this.formatId] === undefined) {
			throw new Error("The point format ID is not supported");
		}

		this.loader = this.isCompressed ?
			new LAZLoader(this.arraybuffer) :
			new LASLoader(this.arraybuffer);
	}

	determineFormat() {
		let formatId = readAs(this.arraybuffer, Uint8Array, 32 * 3 + 8);
		let bit7 = (formatId & 0x80) >> 7;
		let bit6 = (formatId & 0x40) >> 6;

		if (bit7 === 1 && bit6 === 1) {
			throw new Error("Old style compression not supported");
		}

		this.formatId = formatId & 0x3f;
		this.isCompressed = (bit7 === 1 || bit6 === 1);
	}

	determineVersion() {
		let ver = new Int8Array(this.arraybuffer, 24, 2);
		this.version = ver[0] * 10 + ver[1];
		this.versionAsString = ver[0] + "." + ver[1];
	}

	open() {
		return this.loader.open();
	}

	getHeader() {
		return this.loader.getHeader();
	}

	readData(count, start, skip) {
		return this.loader.readData(count, start, skip);
	}

	close() {
		return this.loader.close();
	}

}

/**
 * Decodes LAS records into points
 */
export class LASDecoder {

	constructor(buffer, pointFormatID, pointSize, pointsCount, scale, offset, mins, maxs) {
		this.arrayb = buffer;
		this.decoder = pointFormatReaders[pointFormatID];
		this.pointsCount = pointsCount;
		this.pointSize = pointSize;
		this.scale = scale;
		this.offset = offset;
		this.mins = mins;
		this.maxs = maxs;
	}

	getPoint(index) {
		if (index < 0 || index >= this.pointsCount) {
			throw new Error("Point index out of range");
		}

		let dv = new DataView(this.arrayb, index * this.pointSize, this.pointSize);
		return this.decoder(dv);
	}

}
