import {PointAttribute, PointAttributeTypes} from "../../loaders/PointAttributes.js";

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

onmessage = function (event) {
	let {buffer, pointAttributes, scale, min, size, offset, numPoints} = event.data;

	let view = new DataView(buffer);

	let attributeBuffers = {};
	let attributeOffset = 0;

	let bytesPerPoint = 0;
	for (let pointAttribute of pointAttributes.attributes) {
		bytesPerPoint += pointAttribute.byteSize;
	}

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
	for (let pointAttribute of pointAttributes.attributes) {
		if (["POSITION_CARTESIAN", "position"].includes(pointAttribute.name)) {
			let buff = new ArrayBuffer(numPoints * 4 * 3);
			let positions = new Float32Array(buff);

			for (let j = 0; j < numPoints; j++) {
				let pointOffset = j * bytesPerPoint;

				let x = (view.getInt32(pointOffset + attributeOffset + 0, true) * scale[0]) + offset[0] - min.x;
				let y = (view.getInt32(pointOffset + attributeOffset + 4, true) * scale[1]) + offset[1] - min.y;
				let z = (view.getInt32(pointOffset + attributeOffset + 8, true) * scale[2]) + offset[2] - min.z;

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
				let pointOffset = j * bytesPerPoint;

				let r = view.getUint16(pointOffset + attributeOffset + 0, true);
				let g = view.getUint16(pointOffset + attributeOffset + 2, true);
				let b = view.getUint16(pointOffset + attributeOffset + 4, true);

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
				let pointOffset = j * bytesPerPoint;
				let value = getter(pointOffset + attributeOffset, true);

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

		attributeOffset += pointAttribute.byteSize;
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
			let buffer = new ArrayBuffer(numVectorElements * numPoints * 4);
			let f32 = new Float32Array(buffer);

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
				buffer: buffer,
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
	transferables.push(buffer);

	postMessage(message, transferables);
};
