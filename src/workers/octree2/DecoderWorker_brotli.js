import {PointAttribute, PointAttributeTypes} from "../../loaders/PointAttributes.js";
import {BrotliDecode} from "./brotli-decode.js";

const typedArrayMapping = {
	"int8": Int8Array,
	"int16": Int16Array,
	"int32": Int32Array,
	"int64": Float64Array,
	"uint8": Uint8Array,
	"uint16": Uint16Array,
	"uint32": Uint32Array,
	"uint64": Float64Array,
	"float": Float32Array,
	"double": Float64Array,
};

const getterMap = {
	"int8": (view, offset, le) => view.getInt8(offset),
	"int16": (view, offset, le) => view.getInt16(offset, le),
	"int32": (view, offset, le) => view.getInt32(offset, le),
	"uint8": (view, offset, le) => view.getUint8(offset),
	"uint16": (view, offset, le) => view.getUint16(offset, le),
	"uint32": (view, offset, le) => view.getUint32(offset, le),
	"float": (view, offset, le) => view.getFloat32(offset, le),
	"double": (view, offset, le) => view.getFloat64(offset, le),
};

// see https://stackoverflow.com/questions/45694690/how-i-can-remove-all-odds-bits-in-c
function dealign24b(mortoncode) {
	let x = mortoncode;

	x = ((x & 0b001000001000001000001000) >> 2) | ((x & 0b000001000001000001000001) >> 0);
	x = ((x & 0b000011000000000011000000) >> 4) | ((x & 0b000000000011000000000011) >> 0);
	x = ((x & 0b000000001111000000000000) >> 8) | ((x & 0b000000000000000000001111) >> 0);
	x = ((x & 0b000000000000000000000000) >> 16) | ((x & 0b000000000000000011111111) >> 0);

	return x;
}

onmessage = function (event) {
	let {pointAttributes, scale, name, min, size, offset, numPoints} = event.data;

	let buffer;
	if (numPoints === 0) {
		buffer = {buffer: new ArrayBuffer(0)};
	} else {
		try {
			buffer = BrotliDecode(new Int8Array(event.data.buffer));
		} catch (e) {
			buffer = {buffer: new ArrayBuffer(numPoints * (pointAttributes.byteSize + 12))};
			console.error(`problem with node ${name}: `, e);
		}
	}

	let view = new DataView(buffer.buffer);

	let attributeBuffers = {};

	let gridSize = 32;
	let grid = new Uint32Array(gridSize ** 3);
	let toIndex = (x, y, z) => {
		// min is already subtracted
		let dx = gridSize * x / size.x;
		let dy = gridSize * y / size.y;
		let dz = gridSize * z / size.z;

		let ix = Math.min(Math.trunc(dx), gridSize - 1);
		let iy = Math.min(Math.trunc(dy), gridSize - 1);
		let iz = Math.min(Math.trunc(dz), gridSize - 1);

		return ix + iy * gridSize + iz * gridSize * gridSize;
	};

	let numOccupiedCells = 0;
	let byteOffset = 0;
	for (let pointAttribute of pointAttributes.attributes) {
		if (["POSITION_CARTESIAN", "position"].includes(pointAttribute.name)) {
			let buff = new ArrayBuffer(numPoints * 4 * 3);
			let positions = new Float32Array(buff);

			for (let j = 0; j < numPoints; j++) {
				let mc_0 = view.getUint32(byteOffset + 4, true);
				let mc_1 = view.getUint32(byteOffset + 0, true);
				let mc_2 = view.getUint32(byteOffset + 12, true);
				let mc_3 = view.getUint32(byteOffset + 8, true);

				byteOffset += 16;

				let X = dealign24b((mc_3 & 0x00FFFFFF) >>> 0)
					| (dealign24b(((mc_3 >>> 24) | (mc_2 << 8)) >>> 0) << 8);

				let Y = dealign24b((mc_3 & 0x00FFFFFF) >>> 1)
					| (dealign24b(((mc_3 >>> 24) | (mc_2 << 8)) >>> 1) << 8);

				let Z = dealign24b((mc_3 & 0x00FFFFFF) >>> 2)
					| (dealign24b(((mc_3 >>> 24) | (mc_2 << 8)) >>> 2) << 8);

				if (mc_1 !== 0 || mc_2 !== 0) {
					X = X | (dealign24b((mc_1 & 0x00FFFFFF) >>> 0) << 16)
						| (dealign24b(((mc_1 >>> 24) | (mc_0 << 8)) >>> 0) << 24);

					Y = Y | (dealign24b((mc_1 & 0x00FFFFFF) >>> 1) << 16)
						| (dealign24b(((mc_1 >>> 24) | (mc_0 << 8)) >>> 1) << 24);

					Z = Z | (dealign24b((mc_1 & 0x00FFFFFF) >>> 2) << 16)
						| (dealign24b(((mc_1 >>> 24) | (mc_0 << 8)) >>> 2) << 24);
				}

				let x = Math.trunc(X) * scale[0] + offset[0] - min.x;
				let y = Math.trunc(Y) * scale[1] + offset[1] - min.y;
				let z = Math.trunc(Z) * scale[2] + offset[2] - min.z;

				let index = toIndex(x, y, z);
				let count = grid[index]++;
				if (count === 0) {
					numOccupiedCells++;
				}

				positions[3 * j + 0] = x;
				positions[3 * j + 1] = y;
				positions[3 * j + 2] = z;
			}

			attributeBuffers[pointAttribute.name] = {buffer: buff, attribute: pointAttribute};
		} else if (["RGBA", "rgba"].includes(pointAttribute.name)) {
			let buff = new ArrayBuffer(numPoints * 4);
			let colors = new Uint8Array(buff);

			for (let j = 0; j < numPoints; j++) {
				let mc_0 = view.getUint32(byteOffset + 4, true);
				let mc_1 = view.getUint32(byteOffset + 0, true);
				byteOffset += 8;

				let r = dealign24b((mc_1 & 0x00FFFFFF) >>> 0)
					| (dealign24b(((mc_1 >>> 24) | (mc_0 << 8)) >>> 0) << 8);

				let g = dealign24b((mc_1 & 0x00FFFFFF) >>> 1)
					| (dealign24b(((mc_1 >>> 24) | (mc_0 << 8)) >>> 1) << 8);

				let b = dealign24b((mc_1 & 0x00FFFFFF) >>> 2)
					| (dealign24b(((mc_1 >>> 24) | (mc_0 << 8)) >>> 2) << 8);

				colors[4 * j + 0] = r > 255 ? r / 256 : r;
				colors[4 * j + 1] = g > 255 ? g / 256 : g;
				colors[4 * j + 2] = b > 255 ? b / 256 : b;
			}

			attributeBuffers[pointAttribute.name] = {buffer: buff, attribute: pointAttribute};
		} else {
			let buff = new ArrayBuffer(numPoints * 4);
			let f32 = new Float32Array(buff);

			let TypedArray = typedArrayMapping[pointAttribute.type.name];
			let preciseBuffer = new TypedArray(numPoints);

			let [offset, scale] = [0, 1];

			const getter = (off, le) => getterMap[pointAttribute.type.name](view, off, le);

			// compute offset and scale to pack larger types into 32 bit floats
			if (pointAttribute.type.size > 4) {
				let [amin, amax] = pointAttribute.range;
				offset = amin;
				scale = 1 / (amax - amin);
			}

			for (let j = 0; j < numPoints; j++) {
				let value = getter(byteOffset, true);
				byteOffset += pointAttribute.byteSize;

				f32[j] = (value - offset) * scale;
				preciseBuffer[j] = value;
			}

			attributeBuffers[pointAttribute.name] = {
				buffer: buff,
				preciseBuffer: preciseBuffer,
				attribute: pointAttribute,
				offset: offset,
				scale: scale,
			};
		}
	}

	let occupancy = Math.trunc(numPoints / numOccupiedCells);

	{ // add indices
		let buff = new ArrayBuffer(numPoints * 4);
		let indices = new Uint32Array(buff);

		for (let i = 0; i < numPoints; i++) {
			indices[i] = i;
		}

		attributeBuffers["INDICES"] = {buffer: buff, attribute: PointAttribute.INDICES};
	}

	{ // handle attribute vectors
		let vectors = pointAttributes.vectors;

		for (let vector of vectors) {
			let {name, attributes} = vector;
			let numVectorElements = attributes.length;
			let vecBuffer = new ArrayBuffer(numVectorElements * numPoints * 4);
			let f32 = new Float32Array(vecBuffer);

			let iElement = 0;
			for (let sourceName of attributes) {
				let sourceBuffer = attributeBuffers[sourceName];
				let {offset, scale} = sourceBuffer;
				let sourceView = new DataView(sourceBuffer.buffer);

				for (let j = 0; j < numPoints; j++) {
					let value = sourceView.getFloat32(j * 4, true);

					f32[j * numVectorElements + iElement] = (value / scale) + offset;
				}

				iElement++;
			}

			let vecAttribute = new PointAttribute(name, PointAttributeTypes.DATA_TYPE_FLOAT, 3);

			attributeBuffers[name] = {
				buffer: vecBuffer,
				attribute: vecAttribute,
			};
		}
	}

	let message = {
		buffer: buffer,
		attributeBuffers: attributeBuffers,
		density: occupancy,
	};

	let transferables = [];
	for (let property in message.attributeBuffers) {
		transferables.push(message.attributeBuffers[property].buffer);
	}

	postMessage(message, transferables);
};
